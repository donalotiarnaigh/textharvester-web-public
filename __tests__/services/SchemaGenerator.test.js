const SchemaGenerator = require('../../src/services/SchemaGenerator');
const fs = require('fs');
const path = require('path');

// Mock fs to avoid actual file system calls
jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue(Buffer.from('fake-image-content')),
  promises: {
    unlink: jest.fn().mockResolvedValue(),
  },
  existsSync: jest.fn().mockReturnValue(true),
}));

// Mock pdfConverter
jest.mock('../../src/utils/pdfConverter', () => ({
  convertPdfToJpegs: jest.fn().mockResolvedValue(['/path/to/page1.jpg'])
}));

describe('SchemaGenerator', () => {
  let schemaGenerator;
  let mockLlmProvider;

  beforeEach(() => {
    mockLlmProvider = {
      processImage: jest.fn()
    };
    schemaGenerator = new SchemaGenerator(mockLlmProvider);
    jest.clearAllMocks();
  });

  describe('generateSchema', () => {
    it('should include the system prompt in the analysis request', async () => {
      mockLlmProvider.processImage.mockResolvedValue({ content: JSON.stringify({ tableName: 'test', fields: [] }), usage: { input_tokens: 0, output_tokens: 0 } });

      await schemaGenerator.generateSchema(['/path/to/img.jpg']);

      const calls = mockLlmProvider.processImage.mock.calls;
      // Arg 0: Base64 image
      expect(calls[0][0]).toBe(Buffer.from('fake-image-content').toString('base64'));
      // Arg 1: Prompt
      expect(calls[0][1]).toContain('You are an expert data architect');
      expect(calls[0][1]).toContain('JSON Schema');
      // Arg 2: Options
      expect(calls[0][2]).toEqual({ raw: true });
    });

    it('should return a valid schema definition when LLM returns valid JSON', async () => {
      const mockLlmResponse = JSON.stringify({
        tableName: 'My Document',
        fields: [
          { name: 'date', type: 'date', description: 'Date of document' },
          { name: 'amount', type: 'number', description: 'Total amount' }
        ]
      });
      mockLlmProvider.processImage.mockResolvedValue({ content: mockLlmResponse, usage: { input_tokens: 0, output_tokens: 0 } });

      const result = await schemaGenerator.generateSchema(['/path/to/image1.jpg']);

      expect(result).toHaveProperty('tableName', 'custom_my_document');
      expect(result.fields).toHaveLength(2);
      expect(result.fields[0]).toHaveProperty('name', 'date');
      expect(result.fields[0]).toHaveProperty('type', 'date');
    });

    it('should sanitize table and field names to be SQL-safe', async () => {
      const mockLlmResponse = JSON.stringify({
        tableName: 'User Table; DROP TABLE users;',
        fields: [
          { name: 'select', type: 'string', description: 'SQL keyword' },
          { name: 'valid-field', type: 'number', description: 'Hyphenated' }
        ]
      });
      mockLlmProvider.processImage.mockResolvedValue({ content: mockLlmResponse, usage: { input_tokens: 0, output_tokens: 0 } });

      const result = await schemaGenerator.generateSchema(['/path/to/image1.jpg']);

      expect(result.tableName).toMatch(/^[a-z0-9_]+$/);
      expect(result.tableName).toContain('user_table');

      const fieldNames = result.fields.map(f => f.name);
      expect(fieldNames).toContain('extracted_select'); // Sanitized keyword
      expect(fieldNames).toContain('valid_field'); // Sanitized hyphen
    });

    it('should throw error when LLM returns invalid JSON', async () => {
      mockLlmProvider.processImage.mockResolvedValue({ content: 'Not JSON', usage: { input_tokens: 0, output_tokens: 0 } });

      // When all images fail to parse, should throw "Could not analyze any of the provided images"
      await expect(schemaGenerator.generateSchema(['/path/to/image1.jpg']))
        .rejects.toThrow('Could not analyze any of the provided images');
    });

    it('should throw error when LLM cannot find consistent structure', async () => {
      mockLlmProvider.processImage.mockResolvedValue({ content: JSON.stringify({ error: 'No structure found' }), usage: { input_tokens: 0, output_tokens: 0 } });

      // When all images fail, should throw "Could not analyze any of the provided images"
      await expect(schemaGenerator.generateSchema(['/path/to/image1.jpg']))
        .rejects.toThrow('Could not analyze any of the provided images');
    });

    it('should analyze all provided images (multi-image)', async () => {
      mockLlmProvider.processImage.mockResolvedValue({
        content: JSON.stringify({
          tableName: 'Invoice',
          fields: [{ name: 'date', type: 'date', description: 'Invoice date' }]
        }),
        usage: { input_tokens: 0, output_tokens: 0 }
      });

      await schemaGenerator.generateSchema(['/path/to/img1.jpg', '/path/to/img2.jpg', '/path/to/img3.jpg']);

      expect(mockLlmProvider.processImage).toHaveBeenCalledTimes(3);
    });

    it('should merge fields from multiple images (union)', async () => {
      // Image 1: date, amount
      // Image 2: date, vendor (overlapping + new)
      // Image 3: amount, total (overlapping + new)
      mockLlmProvider.processImage
        .mockResolvedValueOnce({
          content: JSON.stringify({
            tableName: 'Invoice',
            fields: [
              { name: 'date', type: 'date', description: 'Invoice date' },
              { name: 'amount', type: 'number', description: 'Total amount' }
            ]
          }),
          usage: { input_tokens: 0, output_tokens: 0 }
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            tableName: 'Invoice',
            fields: [
              { name: 'date', type: 'date', description: 'Invoice date' },
              { name: 'vendor', type: 'string', description: 'Vendor name' }
            ]
          }),
          usage: { input_tokens: 0, output_tokens: 0 }
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            tableName: 'Invoice',
            fields: [
              { name: 'amount', type: 'number', description: 'Total amount' },
              { name: 'total', type: 'number', description: 'Final total' }
            ]
          }),
          usage: { input_tokens: 0, output_tokens: 0 }
        });

      const result = await schemaGenerator.generateSchema(['/path/to/img1.jpg', '/path/to/img2.jpg', '/path/to/img3.jpg']);

      // Should have all 4 unique fields: date, amount, vendor, total
      expect(result.fields).toHaveLength(4);
      const fieldNames = result.fields.map(f => f.name);
      expect(fieldNames).toContain('date');
      expect(fieldNames).toContain('amount');
      expect(fieldNames).toContain('vendor');
      expect(fieldNames).toContain('total');
    });

    it('should resolve type conflicts by majority vote', async () => {
      // 2 images say "string", 1 says "number" → should be "string"
      mockLlmProvider.processImage
        .mockResolvedValueOnce({
          content: JSON.stringify({
            tableName: 'Document',
            fields: [{ name: 'id', type: 'string', description: 'ID' }]
          }),
          usage: { input_tokens: 0, output_tokens: 0 }
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            tableName: 'Document',
            fields: [{ name: 'id', type: 'string', description: 'ID field' }]
          }),
          usage: { input_tokens: 0, output_tokens: 0 }
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            tableName: 'Document',
            fields: [{ name: 'id', type: 'number', description: 'ID' }]
          }),
          usage: { input_tokens: 0, output_tokens: 0 }
        });

      const result = await schemaGenerator.generateSchema(['/path/to/img1.jpg', '/path/to/img2.jpg', '/path/to/img3.jpg']);

      const idField = result.fields.find(f => f.name === 'id');
      expect(idField.type).toBe('string'); // Majority wins: 2 string vs 1 number
    });

    it('should handle partial failures gracefully', async () => {
      // Image 1 succeeds
      // Image 2 fails LLM
      // Image 3 succeeds
      mockLlmProvider.processImage
        .mockResolvedValueOnce({
          content: JSON.stringify({
            tableName: 'Invoice',
            fields: [{ name: 'date', type: 'date', description: 'Date' }]
          }),
          usage: { input_tokens: 0, output_tokens: 0 }
        })
        .mockRejectedValueOnce(new Error('LLM API error'))
        .mockResolvedValueOnce({
          content: JSON.stringify({
            tableName: 'Invoice',
            fields: [{ name: 'amount', type: 'number', description: 'Amount' }]
          }),
          usage: { input_tokens: 0, output_tokens: 0 }
        });

      const result = await schemaGenerator.generateSchema(['/path/to/img1.jpg', '/path/to/img2.jpg', '/path/to/img3.jpg']);

      // Should return merged schema from 2 successful images
      expect(result.fields).toHaveLength(2);
      const fieldNames = result.fields.map(f => f.name);
      expect(fieldNames).toContain('date');
      expect(fieldNames).toContain('amount');
    });

    it('should throw error when all images fail', async () => {
      mockLlmProvider.processImage
        .mockRejectedValueOnce(new Error('API error'))
        .mockRejectedValueOnce(new Error('API error'))
        .mockRejectedValueOnce(new Error('API error'));

      await expect(schemaGenerator.generateSchema(['/path/to/img1.jpg', '/path/to/img2.jpg', '/path/to/img3.jpg']))
        .rejects.toThrow('Could not analyze any of the provided images');
    });

    it('should maintain backward compatibility with single image', async () => {
      mockLlmProvider.processImage.mockResolvedValue({
        content: JSON.stringify({
          tableName: 'Invoice',
          fields: [{ name: 'date', type: 'date', description: 'Date' }]
        }),
        usage: { input_tokens: 0, output_tokens: 0 }
      });

      const result = await schemaGenerator.generateSchema(['/path/to/single.jpg']);

      expect(mockLlmProvider.processImage).toHaveBeenCalledTimes(1);
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].name).toBe('date');
    });

    it('should mark all-image fields as required and partial fields as optional', async () => {
      // Image 1: date, amount
      // Image 2: date, vendor
      // Image 3: date (only date in all 3)
      mockLlmProvider.processImage
        .mockResolvedValueOnce({
          content: JSON.stringify({
            tableName: 'Invoice',
            fields: [
              { name: 'date', type: 'date', description: 'Date' },
              { name: 'amount', type: 'number', description: 'Amount' }
            ]
          }),
          usage: { input_tokens: 0, output_tokens: 0 }
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            tableName: 'Invoice',
            fields: [
              { name: 'date', type: 'date', description: 'Date' },
              { name: 'vendor', type: 'string', description: 'Vendor' }
            ]
          }),
          usage: { input_tokens: 0, output_tokens: 0 }
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            tableName: 'Invoice',
            fields: [{ name: 'date', type: 'date', description: 'Date' }]
          }),
          usage: { input_tokens: 0, output_tokens: 0 }
        });

      const result = await schemaGenerator.generateSchema(['/path/to/img1.jpg', '/path/to/img2.jpg', '/path/to/img3.jpg']);

      expect(result.jsonSchema.required).toEqual(['date']);
      const dateField = result.fields.find(f => f.name === 'date');
      expect(dateField.required).toBe(true);
      const amountField = result.fields.find(f => f.name === 'amount');
      expect(amountField.required).toBe(false);
      const vendorField = result.fields.find(f => f.name === 'vendor');
      expect(vendorField.required).toBe(false);
    });

    it('should set required field property on field objects', async () => {
      mockLlmProvider.processImage.mockResolvedValue({
        content: JSON.stringify({
          tableName: 'Document',
          fields: [
            { name: 'field1', type: 'string', description: 'Field 1' },
            { name: 'field2', type: 'number', description: 'Field 2' }
          ]
        }),
        usage: { input_tokens: 0, output_tokens: 0 }
      });

      const result = await schemaGenerator.generateSchema(['/path/to/single.jpg']);

      result.fields.forEach(field => {
        expect(field).toHaveProperty('required');
        expect(typeof field.required).toBe('boolean');
      });
    });

    it('should mark all fields as required when single image', async () => {
      mockLlmProvider.processImage.mockResolvedValue({
        content: JSON.stringify({
          tableName: 'Document',
          fields: [
            { name: 'field1', type: 'string', description: 'F1' },
            { name: 'field2', type: 'number', description: 'F2' }
          ]
        }),
        usage: { input_tokens: 0, output_tokens: 0 }
      });

      const result = await schemaGenerator.generateSchema(['/path/to/img.jpg']);

      expect(result.jsonSchema.required).toEqual(['field1', 'field2']);
      result.fields.forEach(field => {
        expect(field.required).toBe(true);
      });
    });

    it('should have empty required array when no fields appear in all images', async () => {
      // Image 1: field1
      // Image 2: field2 (no common fields)
      mockLlmProvider.processImage
        .mockResolvedValueOnce({
          content: JSON.stringify({
            tableName: 'Doc',
            fields: [{ name: 'field1', type: 'string', description: 'F1' }]
          }),
          usage: { input_tokens: 0, output_tokens: 0 }
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            tableName: 'Doc',
            fields: [{ name: 'field2', type: 'string', description: 'F2' }]
          }),
          usage: { input_tokens: 0, output_tokens: 0 }
        });

      const result = await schemaGenerator.generateSchema(['/path/to/img1.jpg', '/path/to/img2.jpg']);

      expect(result.jsonSchema.required).toEqual([]);
      result.fields.forEach(field => {
        expect(field.required).toBe(false);
      });
    });
  });
});
