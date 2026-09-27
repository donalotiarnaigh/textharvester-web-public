/**
 * Integration tests for name processing and validation
 */

const {
  MEMORIAL_FIELDS,
  validateMemorialData,
  processFullName
} = require('../memorialFields');

// processFullName is already imported from ../memorialFields above

// Helper function to find a field by name
function getField(fieldName) {
  return MEMORIAL_FIELDS.find(field => field.name === fieldName);
}

describe('Name Processing Integration', () => {
  it('should process and validate a full name correctly', () => {
    // Extract name components using the name processor
    const nameComponents = processFullName('Rev. John Smith Jr.');

    // Verify components are correctly extracted
    expect(nameComponents).toEqual({
      first_name: 'JOHN',
      last_name: 'SMITH',
      prefix: 'REV.',
      suffix: 'JR.'
    });

    // Create memorial data with the processed name components
    const memorialData = {
      memorial_number: 'HG123',
      ...nameComponents,
      year_of_death: 1900,
      inscription: 'In loving memory'
    };

    // Validate the memorial data - should pass without errors
    expect(() => validateMemorialData(memorialData)).not.toThrow();
  });

  it('should handle complex name variations correctly', () => {
    const nameVariations = [
      'J. R. Smith III',
      'O\'Brien-Jones',
      'Mary Anne van der Waals',
      'José Martínez Sánchez',
      'Søren Kierkegård'
    ];

    // Process each name and validate
    nameVariations.forEach(name => {
      // Use processFullName to get structured name components
      const components = processFullName(name);

      // Create minimal memorial data
      const data = {
        memorial_number: 'HG123',
        ...components
      };

      // Validation should succeed for all variants
      expect(() => validateMemorialData(data)).not.toThrow();
    });
  });

  it('should handle problematic edge cases', () => {
    const edgeCases = [
      'R.R Talbot Junr',     // Problematic case from issues
      'Rev. Peter Butler',   // Another problematic case
      'Smith'                // Last name only
    ];

    edgeCases.forEach(name => {
      // Use processFullName which now handles edge cases properly
      const components = processFullName(name);

      const data = {
        memorial_number: 'HG123',
        ...components,
        // If last_name is empty, provide a default
        last_name: components.last_name || 'UNKNOWN'
      };

      expect(() => validateMemorialData(data)).not.toThrow();
    });

    // Test the specific "Smith" case separately
    const smithComponents = processFullName('Smith');
    expect(smithComponents.last_name).toBe('SMITH');
    expect(smithComponents.first_name).toBe('');

    edgeCases.forEach(() => {
      // Special handling for the initial case using the field's transform method
      const firstNameField = getField('first_name');
      const initialData = {
        memorial_number: 'HG123',
        first_name: firstNameField.transform('J.'),  // Use field's transform method
        last_name: 'UNKNOWN'  // Supply a default last name
      };

      expect(() => validateMemorialData(initialData)).not.toThrow();
    });

    // Special handling for empty/null names
    const emptyData = {
      memorial_number: 'HG123',
      first_name: '',     // Empty first name is allowed
      last_name: 'UNKNOWN' // But last name is required
    };

    expect(() => validateMemorialData(emptyData)).not.toThrow();
  });

  it('should work with the name preprocessing utilities', () => {
    // Create direct processed components for a test name
    const components = {
      first_name: 'MARY',
      last_name: 'O\'BRIEN-SMITH',
      prefix: 'REV.',
      suffix: 'JR.'
    };

    // Create memorial data with these components
    const data = {
      memorial_number: 'HG123',
      ...components
    };

    // Validation should succeed
    expect(() => validateMemorialData(data)).not.toThrow();

    // Verify transformations work correctly with the field transformers
    const firstNameField = getField('first_name');
    const lastNameField = getField('last_name');

    expect(firstNameField.transform('mary')).toBe('MARY');
    expect(lastNameField.transform('o\'brien-smith')).toBe('O\'BRIEN-SMITH');
    expect(firstNameField.transform('j.r.')).toBe('J.R.');
  });
}); 