/**
 * Tests for standardized name parsing utilities
 */

const { standardizeNameParsing } = require('../standardNameParser');

describe('standardizeNameParsing', () => {
  it('should process standard names correctly', () => {
    const result = standardizeNameParsing({ first_name: 'John', last_name: 'Smith' });
    
    expect(result.first_name).toBe('JOHN');
    expect(result.last_name).toBe('SMITH');
    expect(result.prefix).toBeUndefined();
    expect(result.suffix).toBeUndefined();
  });

  it('should process full_name field when available', () => {
    const result = standardizeNameParsing({ full_name: 'Rev. John Smith Jr.' });
    
    expect(result.first_name).toBe('JOHN');
    expect(result.last_name).toBe('SMITH');
    expect(result.prefix).toBe('REV.');
    expect(result.suffix).toBe('JR.');
  });

  it('should handle common name formatting edge cases', () => {
    const testCases = [
      {
        input: { first_name: 'J.R.', last_name: 'Smith' },
        expected: { first_name: 'J.R.', last_name: 'SMITH' }
      },
      {
        input: { first_name: 'Mary-Jane', last_name: 'O\'Brien' },
        expected: { first_name: 'MARY-JANE', last_name: 'O\'BRIEN' }
      },
      {
        input: { first_name: 'Jean Claude', last_name: 'Van Damme' },
        expected: { first_name: 'JEAN CLAUDE', last_name: 'VAN DAMME' }
      }
    ];
    
    testCases.forEach(({ input, expected }) => {
      const result = standardizeNameParsing(input);
      expect(result.first_name).toBe(expected.first_name);
      expect(result.last_name).toBe(expected.last_name);
    });
  });

  it('should extract names from inscription when needed', () => {
    const result = standardizeNameParsing({
      inscription: 'In memory of John Smith who died in 1900'
    });
    
    expect(result.first_name).toBe('JOHN');
    expect(result.last_name).toBe('SMITH');
  });

  it('should use provider-specific options when provided', () => {
    // Test with provider options to handle specific provider behaviors
    const anthropicResult = standardizeNameParsing(
      { first_name: 'J R', last_name: 'Smith' },
      { provider: 'anthropic', preserveInitials: false }
    );
    
    const openaiResult = standardizeNameParsing(
      { first_name: 'J R', last_name: 'Smith' },
      { provider: 'openai', preserveInitials: true }
    );
    
    // Anthropic might not preserve initials
    expect(anthropicResult.first_name).toBe('J R');
    
    // OpenAI tends to preserve initials
    expect(openaiResult.first_name).toBe('J.R.');
  });

  it('should not treat common names as initials', () => {
    // This tests the fix for Issue #8
    const result = standardizeNameParsing({ 
      first_name: 'JAMES', 
      last_name: 'BURKE'
    });
    
    expect(result.first_name).toBe('JAMES');  // Not J.A.M.E.S.
    expect(result.last_name).toBe('BURKE');
  });

  it('should handle missing name fields gracefully', () => {
    const result = standardizeNameParsing({
      last_name: 'Smith'
      // No first_name provided
    });
    
    expect(result.first_name).toBe('');
    expect(result.last_name).toBe('SMITH');
  });

  it('should preserve structure of original data', () => {
    const originalData = {
      memorial_number: 'HG123',
      first_name: 'John',
      last_name: 'Smith',
      year_of_death: 1900,
      custom_field: 'custom value'
    };
    
    const result = standardizeNameParsing(originalData);
    
    // Name fields should be processed
    expect(result.first_name).toBe('JOHN');
    expect(result.last_name).toBe('SMITH');
    
    // Other fields should be preserved
    expect(result.memorial_number).toBe('HG123');
    expect(result.year_of_death).toBe(1900);
    expect(result.custom_field).toBe('custom value');
  });
}); 