const fs = require('fs');
const path = require('path');
const { convertPdfToJpegs } = require('../utils/pdfConverter');

class SchemaGenerator {
  constructor(llmProvider) {
    this.llmProvider = llmProvider;
    this.reservedKeywords = new Set([
      'select', 'delete', 'update', 'insert', 'drop', 'alter', 'create', 'table', 'from', 'where', 'limit', 'order', 'group', 'by', 'having', 'join', 'on', 'as', 'distinct', 'into', 'values', 'set', 'null', 'not', 'primary', 'key', 'foreign', 'references', 'default', 'check', 'constraint', 'index', 'unique', 'and', 'or', 'in', 'is', 'like', 'between', 'exists', 'case', 'when', 'then', 'else', 'end', 'cast', 'convert', 'full', 'outer', 'inner', 'left', 'right', 'cross', 'natural', 'union', 'except', 'intersect', 'offset', 'fetch', 'row', 'rows', 'only', 'top'
    ]);
  }

  /**
   * Defines the system instructions for the LLM to ensure consistent schema generation.
   * Optimized for token usage while retaining clarity.
   */
  static get SYSTEM_PROMPT() {
    return `You are an expert data architect. Analyze the provided document images to create a JSON Schema definition.
    Requirements:
    1. Identify the document type and suggest a snake_case 'tableName'.
    2. Extract consistent data fields. For each, provide 'name' (snake_case), 'type' (string, number, date, boolean), and 'description'.
    3. Output valid JSON only, matching this structure: { "tableName": "string", "fields": [{ "name": "string", "type": "string", "description": "string" }] }`;
  }

  /**
   * Analyzes example files and generates a schema definition.
   * Analyzes all provided files and merges the schemas.
   * @param {string[]} filePaths - Paths to the example files.
   * @returns {Promise<Object>} - The merged schema definition.
   */
  async generateSchema(filePaths) {
    if (!filePaths || filePaths.length === 0) {
      throw new Error('No files provided for analysis');
    }

    // Analyze each file independently
    const analysisResults = [];
    for (const filePath of filePaths) {
      try {
        const result = await this._analyzeFile(filePath);
        if (result) {
          analysisResults.push(result);
        }
      } catch (error) {
        // Log and continue with next file
        console.warn(`Failed to analyze ${filePath}: ${error.message}`);
      }
    }

    // If no files could be analyzed, throw error
    if (analysisResults.length === 0) {
      throw new Error('Could not analyze any of the provided images');
    }

    // Merge schemas from all successful analyses
    const merged = this._mergeSchemas(analysisResults);

    const sanitizedTableName = `custom_${this._sanitizeName(merged.tableName)}`;
    const sanitizedFields = merged.fields.map(field => ({
      ...field,
      name: this._sanitizeName(field.name)
    }));

    return {
      recommendedName: this._sanitizeName(merged.tableName).replace(/_/g, ' '),
      tableName: sanitizedTableName,
      fields: sanitizedFields,
      jsonSchema: {
        type: 'object',
        properties: sanitizedFields.reduce((acc, f) => ({ ...acc, [f.name]: { type: f.type, description: f.description } }), {}),
        required: sanitizedFields.filter(f => f.required).map(f => f.name)
      },
      systemPrompt: 'You are a data entry clerk. Extract the following fields from the document image.',
      userPromptTemplate: `Extract these fields: ${sanitizedFields.map(f => f.name).join(', ')}`
    };
  }

  /**
   * Analyzes a single file and returns its schema.
   * @param {string} filePath - Path to the file.
   * @returns {Promise<Object|null>} - The schema { tableName, fields } or null on failure.
   */
  async _analyzeFile(filePath) {
    const prompt = `${SchemaGenerator.SYSTEM_PROMPT}\n\nAnalyze this document image and extract a schema definition.`;

    let fileToProcess = filePath;
    let cleanupFile = null;

    try {
      if (path.extname(filePath).toLowerCase() === '.pdf') {
        process.stdout.write(`Converting PDF ${path.basename(filePath)} for analysis... `);
        const images = await convertPdfToJpegs(filePath, { keepSource: true });
        if (images.length > 0) {
          fileToProcess = images[0];
          cleanupFile = images[0];

          // Clean up unused pages
          for (let i = 1; i < images.length; i++) {
            await fs.promises.unlink(images[i]).catch(() => { });
          }
          console.log('Done.');
        }
      }

      let base64Image;
      try {
        const fileBuffer = fs.readFileSync(fileToProcess);
        base64Image = fileBuffer.toString('base64');
      } catch (err) {
        throw new Error(`Failed to read file ${fileToProcess}: ${err.message}`);
      }

      let response;
      try {
        const rawResult = await this.llmProvider.processImage(base64Image, prompt, { raw: true });
        response = rawResult.content;
      } catch (error) {
        throw new Error(`LLM interaction failed: ${error.message}`);
      }

      let parsed;
      try {
        parsed = JSON.parse(response);
      } catch (error) {
        throw new Error(`Failed to parse LLM response: ${error.message}`);
      }

      if (!parsed || parsed.error) {
        throw new Error('No consistent structure found');
      }

      if (!parsed.tableName || !parsed.fields || !Array.isArray(parsed.fields)) {
        throw new Error('No consistent structure found');
      }

      return {
        tableName: parsed.tableName,
        fields: parsed.fields
      };

    } catch (e) {
      if (cleanupFile) {
        await fs.promises.unlink(cleanupFile).catch(() => { });
      }
      throw e;
    }
  }

  /**
   * Merges multiple schemas into a single unified schema.
   * Union of fields; majority vote on types; first non-empty description.
   * Tracks field frequency to determine which are required (present in all schemas).
   * @param {Array<Object>} schemas - Array of { tableName, fields }
   * @returns {Object} - Merged schema { tableName, fields }
   */
  _mergeSchemas(schemas) {
    if (schemas.length === 0) {
      throw new Error('No schemas to merge');
    }

    const totalSchemas = schemas.length;

    if (schemas.length === 1) {
      // Single schema: all fields are required (appear in 1/1 schemas)
      return {
        tableName: schemas[0].tableName,
        fields: schemas[0].fields.map(f => ({
          ...f,
          frequency: 1,
          totalSchemas: 1,
          required: true
        }))
      };
    }

    // Use first tableName (deterministic)
    const tableName = schemas[0].tableName;

    // Group fields by name and collect all instances
    const fieldsByName = {};
    for (const schema of schemas) {
      for (const field of schema.fields) {
        if (!fieldsByName[field.name]) {
          fieldsByName[field.name] = [];
        }
        fieldsByName[field.name].push(field);
      }
    }

    // Merge each field group
    const mergedFields = Object.entries(fieldsByName).map(([name, instances]) => {
      // Majority vote on type
      const typeCounts = {};
      for (const instance of instances) {
        typeCounts[instance.type] = (typeCounts[instance.type] || 0) + 1;
      }
      const type = Object.entries(typeCounts).reduce((a, b) => (b[1] > a[1] ? b : a))[0];

      // First non-empty description
      const description = instances.find(f => f.description && f.description.trim())?.description || '';

      // Frequency: count of schemas this field appeared in
      const frequency = instances.length;
      const required = frequency === totalSchemas;

      return { name, type, description, frequency, totalSchemas, required };
    });

    return {
      tableName,
      fields: mergedFields
    };
  }

  /**
   * internal helper to sanitize names for SQL
   * @param {string} name
   * @returns {string}
   */
  _sanitizeName(name) {
    if (!name) return 'unnamed_field';

    // 1. Lowercase
    let sanitized = name.toLowerCase();

    // 2. Replace non-alphanumeric with underscores
    sanitized = sanitized.replace(/[^a-z0-9]/g, '_');

    // 3. Remove leading numbers (SQL identifiers can't start with numbers)
    if (/^[0-9]/.test(sanitized)) {
      sanitized = `_${sanitized}`;
    }

    // 4. Check reserved keywords
    if (this.reservedKeywords.has(sanitized)) {
      sanitized = `extracted_${sanitized}`;
    }

    // 5. Dedupe underscores
    sanitized = sanitized.replace(/_+/g, '_');

    // 6. Trim underscores
    sanitized = sanitized.replace(/^_+|_+$/g, '');

    // 7. Ensure not empty after all cleaning
    if (!sanitized) return 'unnamed_field';

    return sanitized;
  }
}

module.exports = SchemaGenerator;
