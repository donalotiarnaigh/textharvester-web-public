/**
 * Unit tests for memorial fields
 */

const {
  MemorialField,
  MEMORIAL_FIELDS,
  validateMemorialData,
  transformMemorialData
} = require('../memorialFields');

const { StringType } = require('../dataTypes');

describe('MemorialField', () => {
  it('should create a field with default values', () => {
    const field = new MemorialField('test', new StringType(), false);
    expect(field.name).toBe('test');
    expect(field.type).toBeInstanceOf(StringType);
    expect(field.required).toBe(false);
  });

  it('should create a field with custom metadata', () => {
    const field = new MemorialField('test', new StringType(), true, {
      format: 'name',
      maxLength: 100,
      transform: (value) => value.toUpperCase()
    });

    expect(field.required).toBe(true);
    expect(field.metadata.format).toBe('name');
    expect(field.metadata.maxLength).toBe(100);
    expect(field.transform('test')).toBe('TEST');
  });
});

describe('MEMORIAL_FIELDS', () => {
  it('should define required fields for a memorial record', () => {
    const memorialNumber = MEMORIAL_FIELDS.find(f => f.name === 'memorial_number');
    const firstName = MEMORIAL_FIELDS.find(f => f.name === 'first_name');
    const lastName = MEMORIAL_FIELDS.find(f => f.name === 'last_name');
    const yearOfDeath = MEMORIAL_FIELDS.find(f => f.name === 'year_of_death');
    const inscription = MEMORIAL_FIELDS.find(f => f.name === 'inscription');

    expect(memorialNumber).toBeDefined();
    expect(firstName).toBeDefined();
    expect(lastName).toBeDefined();
    expect(yearOfDeath).toBeDefined();
    expect(inscription).toBeDefined();

    expect(memorialNumber.required).toBe(true);
    expect(firstName.required).toBe(false);
    expect(lastName.required).toBe(false);
    expect(yearOfDeath.required).toBe(false);
    expect(inscription.required).toBe(false);
  });

  describe('first_name field', () => {
    it('should allow valid first names', () => {
      const field = MEMORIAL_FIELDS.find(f => f.name === 'first_name');

      // Should not throw for valid names
      expect(field.validate('John').errors).toHaveLength(0);
      expect(field.validate('Mary-Jane').errors).toHaveLength(0);
      expect(field.validate('O\'Brien').errors).toHaveLength(0);
      expect(field.validate('J.R.').errors).toHaveLength(0);
    });

    it('should transform first names correctly', () => {
      const field = MEMORIAL_FIELDS.find(f => f.name === 'first_name');

      // Basic transformation
      expect(field.validate('john').value).toBe('JOHN');

      // Should handle null by returning empty string
      expect(field.validate(null).value).toBe('');

      // Should handle initials
      expect(field.validate('j.r.').value).toBe('J.R.');
      expect(field.validate('J R').value).toBe('J.R.');
    });
  });

  describe('last_name field', () => {
    it('should allow valid last names', () => {
      const field = MEMORIAL_FIELDS.find(f => f.name === 'last_name');

      // Should not throw for valid names
      expect(field.validate('Smith').errors).toHaveLength(0);
      expect(field.validate('O\'Brien').errors).toHaveLength(0);
      expect(field.validate('Smith-Jones').errors).toHaveLength(0);
      expect(field.validate('van der Waals').errors).toHaveLength(0);
    });

    it('should transform last names correctly', () => {
      const field = MEMORIAL_FIELDS.find(f => f.name === 'last_name');

      // Basic transformation
      expect(field.validate('smith').value).toBe('SMITH');

      // Should handle null safely
      expect(field.validate(null).value).toBe(null);

      // Should handle compound names
      expect(field.validate('o\'brien-smith').value).toBe('O\'BRIEN-SMITH');
    });
  });
});

describe('validateMemorialData', () => {
  it('should validate complete data correctly', () => {
    const data = {
      memorial_number: 'HG123',
      first_name: 'John',
      last_name: 'Smith',
      year_of_death: 1900,
      inscription: 'In loving memory'
    };

    const result = validateMemorialData(data);
    expect(result.errors).toHaveLength(0);
    expect(result.value.memorial_number).toBe('123');
    expect(result.value.first_name).toBe('JOHN');
    expect(result.value.last_name).toBe('SMITH');
    expect(result.value.year_of_death).toBe(1900);
    expect(result.value.inscription).toBe('In loving memory');
  });

  it('should reject data with missing required fields', () => {
    const invalidData = {
      first_name: 'John',
      last_name: 'Smith'
      // Missing required memorial_number
    };

    const result = validateMemorialData(invalidData);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('memorial_number');
  });

  it('should handle empty string as valid for non-required fields', () => {
    const data = {
      memorial_number: 'HG123',
      first_name: '',
      last_name: '',
      year_of_death: null,
      inscription: ''
    };

    const result = validateMemorialData(data);
    expect(result.errors).toHaveLength(0);
    expect(result.value.memorial_number).toBe('123');
    expect(result.value.first_name).toBe('');
    expect(result.value.last_name).toBe(null);
    expect(result.value.year_of_death).toBe(null);
    expect(result.value.inscription).toBe(null);
  });
});

describe('transformMemorialData', () => {
  it('should transform memorial data correctly', () => {
    const data = {
      memorial_number: 'HG123',
      first_name: 'john',
      last_name: 'smith',
      year_of_death: '1900',
      inscription: ' In loving memory '
    };

    const transformed = transformMemorialData(data);

    expect(transformed.memorial_number).toBe('123');
    expect(transformed.first_name).toBe('JOHN');
    expect(transformed.last_name).toBe('SMITH');
    expect(transformed.year_of_death).toBe(1900);
    expect(transformed.inscription).toBe('In loving memory');
  });

  it('should handle null values safely', () => {
    const data = {
      memorial_number: 'HG123',
      first_name: null,
      last_name: 'SMITH',
      year_of_death: null,
      inscription: null
    };

    const transformed = transformMemorialData(data);

    expect(transformed.memorial_number).toBe('123');
    expect(transformed.first_name).toBe('');  // Returns empty string for first_name
    expect(transformed.last_name).toBe('SMITH');
    expect(transformed.year_of_death).toBe(null);
    expect(transformed.inscription).toBe(null);
  });

  it('should handle missing fields', () => {
    const data = {
      memorial_number: 'HG123',
      first_name: 'John',
      last_name: 'Smith'
      // year_of_death and inscription are missing
    };

    const transformed = transformMemorialData(data);

    expect(transformed.memorial_number).toBe('123');
    expect(transformed.first_name).toBe('JOHN');
    expect(transformed.last_name).toBe('SMITH');
    expect(transformed.year_of_death).toBe(undefined);
    expect(transformed.inscription).toBe(undefined);
  });
}); 