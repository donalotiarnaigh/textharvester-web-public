const { extractFirstJsonObject } = require('../../src/utils/jsonExtractor');

describe('extractFirstJsonObject', () => {
  describe('Basic cases', () => {
    it('should extract a single JSON object', () => {
      const input = '{"key": "value"}';
      expect(extractFirstJsonObject(input)).toBe('{"key": "value"}');
    });

    it('should return null for input with no JSON object', () => {
      expect(extractFirstJsonObject('no json here')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(extractFirstJsonObject('')).toBeNull();
    });

    it('should return null for null input', () => {
      expect(extractFirstJsonObject(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(extractFirstJsonObject(undefined)).toBeNull();
    });

    it('should return null for non-string input', () => {
      expect(extractFirstJsonObject(123)).toBeNull();
    });
  });

  describe('Text surrounding JSON', () => {
    it('should extract JSON with leading text', () => {
      const input = 'Here is the result: {"key": "value"}';
      expect(extractFirstJsonObject(input)).toBe('{"key": "value"}');
    });

    it('should extract JSON with trailing text', () => {
      const input = '{"key": "value"} Hope that helps!';
      expect(extractFirstJsonObject(input)).toBe('{"key": "value"}');
    });

    it('should extract JSON with both leading and trailing text', () => {
      const input = 'The data is: {"name": "John"} Please review.';
      expect(extractFirstJsonObject(input)).toBe('{"name": "John"}');
    });
  });

  describe('Multiple fragments - THE BUG SCENARIO', () => {
    it('should extract only the first complete JSON object from multiple fragments', () => {
      const input = '{"first": "object"} and then {"second": "object"}';
      expect(extractFirstJsonObject(input)).toBe('{"first": "object"}');
    });

    it('should extract first JSON when response has multiple separate objects', () => {
      const input = '{"memorial_number": "456", "first_name": "Jane"} Some extra text {"other": "data"}';
      expect(extractFirstJsonObject(input)).toBe('{"memorial_number": "456", "first_name": "Jane"}');
    });

    it('should extract first JSON when response has explanatory braces', () => {
      const input = 'The format is {key: value}. Here is the data: {"name": "John", "age": 30}';
      // The first complete balanced-brace object is {key: value}
      expect(extractFirstJsonObject(input)).toBe('{key: value}');
    });

    it('should handle multiple objects with explanatory text between them', () => {
      const input = 'First: {"id": 1} Then: {"id": 2}';
      expect(extractFirstJsonObject(input)).toBe('{"id": 1}');
    });
  });

  describe('Nested braces', () => {
    it('should handle nested objects correctly', () => {
      const input = '{"outer": {"inner": "value"}}';
      expect(extractFirstJsonObject(input)).toBe('{"outer": {"inner": "value"}}');
    });

    it('should handle deeply nested objects', () => {
      const input = '{"a": {"b": {"c": "deep"}}}';
      expect(extractFirstJsonObject(input)).toBe('{"a": {"b": {"c": "deep"}}}');
    });

    it('should handle multiple levels of nesting with mixed content', () => {
      const input = '{"level1": {"level2": {"level3": "value"}}} extra text';
      expect(extractFirstJsonObject(input)).toBe('{"level1": {"level2": {"level3": "value"}}}');
    });
  });

  describe('Braces inside string literals', () => {
    it('should ignore braces inside string values', () => {
      const input = '{"key": "value with { braces }"}';
      expect(extractFirstJsonObject(input)).toBe('{"key": "value with { braces }"}');
    });

    it('should handle multiple braces inside string values', () => {
      const input = '{"inscription": "In memory of {beloved} {father}"}';
      expect(extractFirstJsonObject(input)).toBe('{"inscription": "In memory of {beloved} {father}"}');
    });

    it('should handle braces inside nested string values', () => {
      const input = '{"outer": {"inner": "has { braces }"}}';
      expect(extractFirstJsonObject(input)).toBe('{"outer": {"inner": "has { braces }"}}');
    });

    it('should handle escaped quotes inside strings', () => {
      const input = '{"key": "value with \\"escaped\\" quotes"}';
      expect(extractFirstJsonObject(input)).toBe('{"key": "value with \\"escaped\\" quotes"}');
    });

    it('should handle escaped quotes and braces together', () => {
      const input = '{"key": "value with \\"escaped\\" quotes and { braces }"}';
      expect(extractFirstJsonObject(input)).toBe('{"key": "value with \\"escaped\\" quotes and { braces }"}');
    });

    it('should handle escaped backslash followed by quote', () => {
      const input = '{"key": "value with \\\\\\"quote"}';
      expect(extractFirstJsonObject(input)).toBe('{"key": "value with \\\\\\"quote"}');
    });
  });

  describe('Unbalanced braces', () => {
    it('should return null for unclosed opening brace', () => {
      expect(extractFirstJsonObject('{unclosed')).toBeNull();
    });

    it('should return null for unopened closing brace only', () => {
      expect(extractFirstJsonObject('no opening }')).toBeNull();
    });

    it('should return null when only closing brace exists', () => {
      expect(extractFirstJsonObject('}')).toBeNull();
    });
  });

  describe('Real-world scenarios', () => {
    it('should extract JSON from a chatty model response with explanation + JSON', () => {
      const input = 'I found the following information:\n\n' +
        '{"memorial_number": "123", "first_name": "John"}\n\n' +
        'Additional notes: {"status": "verified"}';
      expect(extractFirstJsonObject(input)).toBe(
        '{"memorial_number": "123", "first_name": "John"}'
      );
    });

    it('should handle model response with code-like explanation', () => {
      const input = 'The format should be {name, age} but here\'s what I found: {"name": "Alice", "age": 45}';
      // First balanced object is {name, age}
      expect(extractFirstJsonObject(input)).toBe('{name, age}');
    });

    it('should handle model response with JSON containing nested objects and arrays', () => {
      const input = 'Here is the result: {"data": {"items": [{"id": 1}]}}';
      expect(extractFirstJsonObject(input)).toBe('{"data": {"items": [{"id": 1}]}}');
    });

    it('should extract from response with multiple sentences before JSON', () => {
      const input = 'I processed the image. It contains text. The data is: {"result": "success"}';
      expect(extractFirstJsonObject(input)).toBe('{"result": "success"}');
    });

    it('should handle response with trailing JSON object (less common but possible)', () => {
      const input = '{"first": "object"} }\n\n{"second": "object"}';
      expect(extractFirstJsonObject(input)).toBe('{"first": "object"}');
    });
  });

  describe('Whitespace handling', () => {
    it('should preserve internal whitespace in string values', () => {
      const input = '{"key": "value with   spaces"}';
      expect(extractFirstJsonObject(input)).toBe('{"key": "value with   spaces"}');
    });

    it('should handle newlines in string values', () => {
      const input = '{"key": "value\\nwith\\nnewlines"}';
      expect(extractFirstJsonObject(input)).toBe('{"key": "value\\nwith\\nnewlines"}');
    });

    it('should handle objects with newlines between properties', () => {
      const input = '{"key1": "value1",\n"key2": "value2"}';
      expect(extractFirstJsonObject(input)).toBe('{"key1": "value1",\n"key2": "value2"}');
    });
  });

  describe('Edge cases', () => {
    it('should handle object with only whitespace as value', () => {
      const input = '{"key": "   "}';
      expect(extractFirstJsonObject(input)).toBe('{"key": "   "}');
    });

    it('should handle object with empty string as value', () => {
      const input = '{"key": ""}';
      expect(extractFirstJsonObject(input)).toBe('{"key": ""}');
    });

    it('should handle single character object', () => {
      const input = '{}';
      expect(extractFirstJsonObject(input)).toBe('{}');
    });

    it('should handle consecutive braces not in a string', () => {
      const input = '{}{} more text';
      expect(extractFirstJsonObject(input)).toBe('{}');
    });
  });
});
