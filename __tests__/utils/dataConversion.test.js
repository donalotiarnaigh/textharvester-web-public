/**
 * @jest-environment jsdom
 */

const { jsonToCsv } = require('../../src/utils/dataConversion');

describe('Data Conversion Utils', () => {
  const testData = [
    {
      memorial_number: 'MEM001',
      first_name: 'John',
      last_name: 'Doe',
      year_of_death: '1900',
      inscription: 'Rest in Peace',
      file_name: 'test1.jpg',
      processed_date: '2025-01-01T12:00:00Z',
      ai_provider: 'openai',
      model_version: 'gpt-5.1',
      prompt_version: '1.0'
    },
    {
      memorial_number: 'MEM002',
      first_name: 'Jane',
      last_name: 'Smith',
      year_of_death: '1950',
      inscription: 'In loving memory,\nForever missed',
      file_name: 'test2.jpg',
      processed_date: '2025-01-02T12:00:00Z',
      ai_provider: 'anthropic',
      model_version: 'claude-4-sonnet-20250514',
      prompt_version: '1.0'
    }
  ];

  describe('jsonToCsv', () => {
    it('should return empty string for empty input', () => {
      expect(jsonToCsv([])).toBe('');
      expect(jsonToCsv(null)).toBe('');
      expect(jsonToCsv(undefined)).toBe('');
    });

    it('should convert JSON data to CSV format with headers', () => {
      const csv = jsonToCsv(testData);
      const lines = csv.split('\n');
      
      // Check headers
      expect(lines[0]).toBe('memorial_number,first_name,last_name,year_of_death,inscription,file_name,ai_provider,model_version,prompt_version,processed_date');
      
      // Check first data row
      expect(lines[1]).toBe('MEM001,John,Doe,1900,Rest in Peace,test1.jpg,openai,gpt-5.1,1.0,2025-01-01T12:00:00Z');
    });

    it('should properly handle newlines in fields', () => {
      const csv = jsonToCsv(testData);
      const lines = csv.split('\n');
      
      // The field should be properly quoted and contain the escaped newline
      expect(lines[2]).toContain('MEM002,Jane,Smith,1950,"In loving memory,\\nForever missed",test2.jpg');
    });

    it('should handle missing fields gracefully', () => {
      const incompleteData = [{
        memorial_number: 'MEM004',
        first_name: 'John'
        // Other fields missing
      }];

      const csv = jsonToCsv(incompleteData);
      const lines = csv.split('\n');
      
      // Should have empty values for all missing fields
      expect(lines[1]).toBe('MEM004,John,,,,,,,,');
    });

    it('should properly escape quotes in fields', () => {
      const dataWithQuotes = [{
        memorial_number: 'MEM005',
        first_name: 'John "Johnny"',
        inscription: 'He said "goodbye"',
        processed_date: '2025-01-05T12:00:00Z'
      }];

      const csv = jsonToCsv(dataWithQuotes);
      const lines = csv.split('\n');

      // Check that quotes are properly escaped
      expect(lines[1]).toContain('"John ""Johnny"""');
      expect(lines[1]).toContain('"He said ""goodbye"""');
    });

    it('should support custom column order when provided', () => {
      const customColumns = ['entry_id', 'name_raw'];
      const customData = [
        { entry_id: 'vol1_p001_r001', name_raw: 'Test Name' },
        { entry_id: 'vol1_p001_r002', name_raw: 'Second Entry' }
      ];

      const csv = jsonToCsv(customData, customColumns);
      const lines = csv.trim().split('\n');

      expect(lines[0]).toBe('entry_id,name_raw');
      expect(lines[1]).toBe('vol1_p001_r001,Test Name');
      expect(lines[2]).toBe('vol1_p001_r002,Second Entry');
    });
  });
});