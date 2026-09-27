const { ResponseLengthValidator } = require('../../src/utils/responseLengthValidator');

describe('ResponseLengthValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new ResponseLengthValidator();
  });

  describe('Response Length Detection', () => {
    test('should detect response approaching limit', () => {
      const response = 'x'.repeat(20000); // 20k chars
      const result = validator.validateResponseLength(response, 'anthropic');
      
      expect(result.isApproachingLimit).toBe(true);
      expect(result.percentage).toBeGreaterThan(80);
    });

    test('should detect response within safe limits', () => {
      const response = 'x'.repeat(5000); // 5k chars
      const result = validator.validateResponseLength(response, 'anthropic');
      
      expect(result.isApproachingLimit).toBe(false);
      expect(result.percentage).toBeLessThan(50);
    });

    test('should detect response exceeding limit', () => {
      const response = 'x'.repeat(25000); // 25k chars
      const result = validator.validateResponseLength(response, 'anthropic');
      
      expect(result.exceedsLimit).toBe(true);
      expect(result.percentage).toBeGreaterThan(100);
    });
  });

  describe('Prompt Truncation', () => {
    test('should truncate prompt for large monuments', () => {
      const originalPrompt = 'Extract data from this monument: ' + 'x'.repeat(20000); // Make it definitely too long
      const truncated = validator.truncatePromptForProvider(originalPrompt, 'anthropic');
      
      expect(truncated.length).toBeLessThan(originalPrompt.length);
      expect(truncated).toContain('Extract data from this monument');
    });

    test('should preserve essential prompt elements', () => {
      const originalPrompt = 'You are transcribing monument photos. Extract: first_name, last_name, year_of_death, inscription. ' + 'x'.repeat(5000);
      const truncated = validator.truncatePromptForProvider(originalPrompt, 'anthropic');
      
      expect(truncated).toContain('first_name');
      expect(truncated).toContain('last_name');
      expect(truncated).toContain('year_of_death');
      expect(truncated).toContain('inscription');
    });
  });

  describe('JSON Validation and Repair', () => {
    test('should detect valid JSON', () => {
      const validJson = '{"first_name": "JOHN", "last_name": "CONDON", "year_of_death": 1865}';
      const result = validator.validateAndRepairJson(validJson);
      
      expect(result.isValid).toBe(true);
      expect(result.repaired).toBe(false);
    });

    test('should detect and repair truncated JSON', () => {
      const truncatedJson = '{"first_name": "JOHN", "last_name": "CONDON", "year_of_death": 1865, "inscription": "In memory of|JOHN CONDON|Died Sept 20, 1865|Aged 77 yrs|Ellen Walker|Daniel Sheehan|Ireland|R.I.P."';
      const result = validator.validateAndRepairJson(truncatedJson);
      
      expect(result.isValid).toBe(true);
      expect(result.repaired).toBe(true); // This JSON gets repaired (missing closing brace)
      expect(result.json.inscription).toContain('R.I.P.');
    });

    test('should repair JSON missing closing brace', () => {
      const truncatedJson = '{"first_name": "JOHN", "last_name": "CONDON", "year_of_death": 1865, "inscription": "In memory of|JOHN CONDON|Died Sept 20, 1865|Aged 77 yrs|Ellen Walker|Daniel Sheehan|Ireland|R.I.P."';
      const result = validator.validateAndRepairJson(truncatedJson);
      
      expect(result.isValid).toBe(true);
      expect(result.json.first_name).toBe('JOHN');
      expect(result.json.last_name).toBe('CONDON');
    });

    test('should handle completely invalid JSON', () => {
      const invalidJson = 'This is not JSON at all';
      const result = validator.validateAndRepairJson(invalidJson);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });
  });

  describe('Provider-Specific Limits', () => {
    test('should use correct limits for Anthropic', () => {
      const limits = validator.getProviderLimits('anthropic');
      
      expect(limits.maxResponseLength).toBe(22000);
      expect(limits.warningThreshold).toBe(18000);
      expect(limits.criticalThreshold).toBe(20000);
    });

    test('should use correct limits for OpenAI', () => {
      const limits = validator.getProviderLimits('openai');
      
      expect(limits.maxResponseLength).toBe(50000);
      expect(limits.warningThreshold).toBe(40000);
      expect(limits.criticalThreshold).toBe(45000);
    });
  });

  describe('Retry Logic', () => {
    test('should generate shorter prompt for retry', () => {
      const originalPrompt = 'Extract all data from this monument: ' + 'x'.repeat(10000);
      const retryPrompt = validator.generateRetryPrompt(originalPrompt, 'anthropic');
      
      expect(retryPrompt.length).toBeLessThan(originalPrompt.length);
      expect(retryPrompt).toContain('Extract essential data only');
    });

    test('should maintain core requirements in retry prompt', () => {
      const originalPrompt = 'Extract: first_name, last_name, year_of_death, inscription from monument';
      const retryPrompt = validator.generateRetryPrompt(originalPrompt, 'anthropic');
      
      expect(retryPrompt).toContain('first_name');
      expect(retryPrompt).toContain('last_name');
      expect(retryPrompt).toContain('year_of_death');
      expect(retryPrompt).toContain('inscription');
    });
  });
});
