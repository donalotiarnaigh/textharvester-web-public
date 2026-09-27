const SchemaDDLGenerator = require('../SchemaDDLGenerator');

describe('SchemaDDLGenerator', () => {

  describe('sanitizeIdentifier', () => {
    test('should lowercase and replace spaces with underscores', () => {
      expect(SchemaDDLGenerator.sanitizeIdentifier('My Table Name')).toBe('my_table_name');
    });

    test('should remove special characters', () => {
      expect(SchemaDDLGenerator.sanitizeIdentifier('User-Name!')).toBe('user_name');
    });

    test('should handle empty strings', () => {
      expect(SchemaDDLGenerator.sanitizeIdentifier('')).toBe('');
    });

    // Future: Reserved keyword tests if we implement that logic publically or privately.
    // For now assuming it is handled inside generateCreateTableSQL logic or here. 
    // Let's assume we want it here for reusability.
    test('should prefix reserved keywords', () => {
      expect(SchemaDDLGenerator.sanitizeIdentifier('select')).toMatch(/^extracted_select|custom_select$/);
    });
  });

  describe('generateCreateTableSQL', () => {
    const validSchema = {
      tableName: 'documents_v1',
      fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'page_count', type: 'number', required: false },
        { name: 'is_verified', type: 'boolean', required: false },
        { name: 'archived_at', type: 'date', required: false }
      ]
    };

    test('should generate valid CREATE TABLE SQL', () => {
      const sql = SchemaDDLGenerator.generateCreateTableSQL(validSchema);
      expect(sql).toContain('CREATE TABLE documents_v1');
      expect(sql).toContain('id INTEGER PRIMARY KEY');
      expect(sql).toContain('file_name TEXT'); // Standard column
      expect(sql).toContain('processed_date DATETIME'); // Standard column
      expect(sql).toContain('title TEXT');
      expect(sql).toContain('page_count REAL');
      expect(sql).toContain('is_verified INTEGER');
      expect(sql).toContain('archived_at TEXT');
    });

    test('should sanitize table name if input is dirty', () => {
      // Ideally the schema definition has a pre-sanitized tableName, 
      // but the generator should double-check or the input might be the raw definition.
      // The design says SchemaManager creates the tableName and stores it.
      // But let's test that the generator uses the provided tableName correctly.
      const schema = { ...validSchema, tableName: 'My Table' };
      const sql = SchemaDDLGenerator.generateCreateTableSQL(schema);
      expect(sql).toContain('CREATE TABLE my_table');
    });

    test('should includes all standard metadata columns', () => {
      const sql = SchemaDDLGenerator.generateCreateTableSQL(validSchema);
      const standardCols = [
        'file_name',
        'processed_date',
        'ai_provider',
        'model_version',
        'batch_id'
      ];
      standardCols.forEach(col => {
        expect(sql).toContain(col);
      });
    });

    test('should handle SQL injection attempts in field names', () => {
      const badSchema = {
        tableName: 'safe_table',
        fields: [
          { name: 'drop table users; --', type: 'string' }
        ]
      };
      const sql = SchemaDDLGenerator.generateCreateTableSQL(badSchema);
      expect(sql).not.toContain('drop table users');
      expect(sql).toContain('drop_table_users'); // Sanitized
    });
  });

  describe('mapFieldTypeToSQL', () => {
    test('should map string to TEXT', () => {
      expect(SchemaDDLGenerator.mapFieldTypeToSQL('string')).toBe('TEXT');
    });

    test('should map number to REAL', () => {
      expect(SchemaDDLGenerator.mapFieldTypeToSQL('number')).toBe('REAL');
    });

    test('should map boolean to INTEGER', () => {
      expect(SchemaDDLGenerator.mapFieldTypeToSQL('boolean')).toBe('INTEGER');
    });

    test('should map date to TEXT', () => {
      expect(SchemaDDLGenerator.mapFieldTypeToSQL('date')).toBe('TEXT');
    });

    test('should default to TEXT for unknown types', () => {
      expect(SchemaDDLGenerator.mapFieldTypeToSQL('unknown')).toBe('TEXT');
    });
  });

  describe('generateAlterColumns', () => {
    test('should return column definitions for new fields', () => {
      const newFields = [{ name: 'age', type: 'number' }];
      const result = SchemaDDLGenerator.generateAlterColumns(newFields);
      expect(result).toEqual([{ name: 'age', def: 'REAL' }]);
    });

    test('should sanitize field names', () => {
      const newFields = [{ name: 'User Name!', type: 'string' }];
      const result = SchemaDDLGenerator.generateAlterColumns(newFields);
      expect(result[0].name).toBe('user_name');
    });

    test('should handle multiple fields', () => {
      const newFields = [
        { name: 'age', type: 'number' },
        { name: 'is_active', type: 'boolean' },
        { name: 'created', type: 'date' }
      ];
      const result = SchemaDDLGenerator.generateAlterColumns(newFields);
      expect(result).toHaveLength(3);
      expect(result[0].def).toBe('REAL');
      expect(result[1].def).toBe('INTEGER');
      expect(result[2].def).toBe('TEXT');
    });

    test('should return empty array for no fields', () => {
      expect(SchemaDDLGenerator.generateAlterColumns([])).toEqual([]);
    });

    test('should handle reserved keywords in field names', () => {
      const newFields = [{ name: 'select', type: 'string' }];
      const result = SchemaDDLGenerator.generateAlterColumns(newFields);
      expect(result[0].name).toBe('extracted_select');
    });
  });
});
