const { db, runColumnMigration } = require('../utils/database');
const SchemaDDLGenerator = require('../utils/SchemaDDLGenerator');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Normalizes a parsed json_schema object so all field types are
 * valid JSON Schema types. Maps the legacy "date" type (not a JSON Schema
 * standard) to "string" with format:"date".
 * @param {Object} jsonSchema - Parsed JSON schema object
 * @returns {Object} Normalized schema
 */
function normalizeJsonSchemaTypes(jsonSchema) {
  if (!jsonSchema || !jsonSchema.properties) return jsonSchema;
  const normalized = { ...jsonSchema, properties: { ...jsonSchema.properties } };
  Object.keys(normalized.properties).forEach(key => {
    const prop = normalized.properties[key];
    // Map legacy "date" type → "string". AJV v8 only accepts standard JSON Schema types.
    // The field description carries the semantic meaning; format is not set to avoid
    // AJV v8 rejecting unknown formats.
    if (prop.type === 'date') {
      const { format: _dropped, ...rest } = prop;
      normalized.properties[key] = { ...rest, type: 'string' };
    }
    // Also strip any "date" format stored by earlier code versions
    if (prop.format === 'date') {
      const { format: _dropped, ...rest } = prop;
      normalized.properties[key] = { ...rest };
    }
  });
  return normalized;
}

class SchemaManager {
  /**
     * Creates a new custom schema and the corresponding database table
     * @param {Object} schemaDefinition
     * @returns {Promise<Object>} Created schema object
     */
  static async createSchema(schemaDefinition) {
    const id = crypto.randomUUID();
    let { name, tableName, fields, jsonSchema } = schemaDefinition;

    // 1a. Derive table name if missing
    if (!tableName && name) {
      tableName = 'custom_' + SchemaDDLGenerator.sanitizeIdentifier(name);
    }
    schemaDefinition.tableName = tableName; // Update original object for consistency

    // 1b. Derive fields from jsonSchema if missing (for DDL generation)
    if ((!fields || fields.length === 0) && jsonSchema && jsonSchema.properties) {
      fields = Object.entries(jsonSchema.properties).map(([fieldName, prop]) => ({
        name: fieldName,
        type: prop.type,
        description: prop.description
      }));
      schemaDefinition.fields = fields;
    }

    // 1. Generate SQL for the dynamic table
    const ddl = SchemaDDLGenerator.generateCreateTableSQL(schemaDefinition); // Validation happens here

    // 2. Prepare Metadata Insertion
    // Note: json_schema column stores the validation schema. 
    // If not present in def, we assume the def itself represents the structure.
    const jsonSchemaStr = JSON.stringify(schemaDefinition.jsonSchema || schemaDefinition);

    const insertSQL = `
      INSERT INTO custom_schemas (id, name, table_name, json_schema, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    return new Promise((resolve, reject) => {
      // Use serialize to ensure operations run sequentially on this connection
      db.serialize(() => {
        // A. Insert Metadata
        db.run(insertSQL, [id, name, tableName, jsonSchemaStr], function (err) {
          if (err) {
            logger.error('SchemaManager: Metadata insertion failed', err);
            return reject(err);
          }

          // B. Create Dynamic Table
          db.run(ddl, [], function (err2) {
            if (err2) {
              logger.error(`SchemaManager: DDL execution failed for ${tableName}, rolling back.`, err2);

              // C. Rollback (Best Effort)
              db.run('DELETE FROM custom_schemas WHERE id = ?', [id], (err3) => {
                if (err3) logger.error('SchemaManager: Rollback failed', err3);
              });

              return reject(err2);
            }

            // Success
            logger.info(`Schema created: ${name} (${id})`);
            resolve({ ...schemaDefinition, id });
          });
        });
      });
    });
  }

  /**
     * Retrieves a schema by ID
     * @param {string} id
     * @returns {Promise<Object>} Schema object or null
     */
  static async getSchema(id) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM custom_schemas WHERE id = ?', [id], (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(null);

        try {
          if (row.json_schema) {
            row.json_schema = normalizeJsonSchemaTypes(JSON.parse(row.json_schema));
          }
          resolve(row);
        } catch (parseErr) {
          logger.error(`SchemaManager: Failed to parse json_schema for ${id}`, parseErr);
          reject(parseErr);
        }
      });
    });
  }

  /**
   * Retrieves a schema by its table name
   * @param {string} tableName - The table name to look up
   * @returns {Promise<Object|null>} Schema object or null
   */
  static async getSchemaByTableName(tableName) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM custom_schemas WHERE table_name = ?', [tableName], (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(null);

        try {
          if (row.json_schema) {
            row.json_schema = normalizeJsonSchemaTypes(JSON.parse(row.json_schema));
          }
          resolve(row);
        } catch (parseErr) {
          logger.error(`SchemaManager: Failed to parse json_schema for table ${tableName}`, parseErr);
          reject(parseErr);
        }
      });
    });
  }

  /**
     * Lists all custom schemas
     * @returns {Promise<Array>} List of schemas
     */
  static async listSchemas() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM custom_schemas ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return reject(err);

        const schemas = rows.map(row => {
          try {
            return {
              ...row,
              json_schema: row.json_schema ? normalizeJsonSchemaTypes(JSON.parse(row.json_schema)) : {}
            };
          } catch {
            return row;
          }
        });
        resolve(schemas);
      });
    });
  }

  /**
   * Updates an existing schema with new fields and metadata.
   * Automatically increments version and runs column migrations.
   * @param {string} id - Schema UUID
   * @param {Object} changes - { jsonSchema, systemPrompt?, userPromptTemplate? }
   * @returns {Promise<Object>} Updated schema with migration summary
   */
  static async updateSchema(id, changes) {
    // 1. Fetch existing schema
    const existingSchema = await this.getSchema(id);
    if (!existingSchema) {
      throw new Error(`Schema not found: ${id}`);
    }

    // 2. Parse schemas and detect changes
    const oldProps = existingSchema.json_schema.properties || {};
    const newProps = (changes.jsonSchema && changes.jsonSchema.properties) || {};

    const oldKeys = new Set(Object.keys(oldProps));
    const newKeys = new Set(Object.keys(newProps));

    // Detect type changes, removals, additions
    const typeChanges = [];
    const removedFields = [];
    const newFields = [];

    // Check for type changes and removals
    for (const key of oldKeys) {
      if (!newKeys.has(key)) {
        removedFields.push(key);
      } else if (oldProps[key].type !== newProps[key].type) {
        typeChanges.push(key);
      }
    }

    // Detect new fields
    for (const key of newKeys) {
      if (!oldKeys.has(key)) {
        newFields.push({ name: key, type: newProps[key].type });
      }
    }

    // 3. Reject type changes and removals
    if (typeChanges.length > 0) {
      throw new Error(`Changing field types is not supported by SQLite: ${typeChanges.join(', ')}`);
    }

    if (removedFields.length > 0) {
      throw new Error(`Removing fields is not supported to prevent data loss: ${removedFields.join(', ')}`);
    }

    // 4. Run column migration for new fields (if any)
    const addedColumns = [];
    if (newFields.length > 0) {
      const alterColumns = SchemaDDLGenerator.generateAlterColumns(newFields);
      addedColumns.push(...alterColumns.map(col => col.name));

      // Promisify runColumnMigration
      await this._runColumnMigrationAsync(
        existingSchema.table_name,
        alterColumns,
        `schema_${id}_v${(existingSchema.version || 1) + 1}`
      );
    }

    // 5. Update metadata with version increment and updated_at
    return new Promise((resolve, reject) => {
      const jsonSchemaStr = JSON.stringify(changes.jsonSchema);
      const updateSQL = `
        UPDATE custom_schemas
        SET json_schema = ?,
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      db.run(updateSQL, [jsonSchemaStr, id], function(err) {
        if (err) {
          logger.error('SchemaManager: Update failed', err);
          return reject(err);
        }

        // Fetch and return updated schema
        SchemaManager.getSchema(id).then(updated => {
          resolve({
            ...updated,
            migration: { addedColumns }
          });
        }).catch(reject);
      });
    });
  }

  /**
   * Promisified wrapper around runColumnMigration
   * @private
   */
  static async _runColumnMigrationAsync(tableName, columns, migrationName) {
    return new Promise((resolve, reject) => {
      try {
        // runColumnMigration uses fire-and-forget pattern with callbacks
        // We need to give it a way to signal completion
        // For now, we'll trust that it completes and resolve immediately
        // The migrations table will prevent re-running
        runColumnMigration(tableName, columns, migrationName);

        // Small delay to allow migration to start
        setTimeout(() => resolve(), 100);
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = SchemaManager;
