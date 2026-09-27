const { DataType, StringType, IntegerType, BooleanType, validateValue } = require('../dataTypes');

describe('Data Types Module', () => {
  describe('Base DataType', () => {
    it('should create a DataType with name and validator', () => {
      const type = new DataType('test', (val) => typeof val === 'string');
      expect(type.name).toBe('test');
      expect(type.validate('test').value).toBe('test');
      expect(type.validate(123).errors).toHaveLength(1);
    });
  });

  describe('StringType', () => {
    const stringType = new StringType();

    it('should validate strings correctly', () => {
      expect(stringType.validate('test').errors).toHaveLength(0);
      expect(stringType.validate('').errors).toHaveLength(0);
      expect(stringType.validate(123).errors).toHaveLength(1);
      expect(stringType.validate(null).errors).toHaveLength(0);
    });

    it('should handle metadata validation', () => {
      expect(stringType.validate('test', { maxLength: 5 }).errors).toHaveLength(0);
      expect(stringType.validate('test', { maxLength: 3 }).errors).toHaveLength(1);
    });

    it('should convert values to strings', () => {
      expect(stringType.convert('test')).toBe('test');
      expect(stringType.convert(123)).toBe('123');
      expect(stringType.convert(true)).toBe('true');
    });
  });

  describe('IntegerType', () => {
    const integerType = new IntegerType();

    it('should validate integers correctly', () => {
      expect(integerType.validate(123).errors).toHaveLength(0);
      expect(integerType.validate(-123).errors).toHaveLength(0);
      expect(integerType.validate(123.45).errors).toHaveLength(1);
      expect(integerType.validate('123').errors).toHaveLength(1);
    });

    it('should handle range validation', () => {
      expect(integerType.validate(5, { min: 0, max: 10 }).errors).toHaveLength(0);
      expect(integerType.validate(-1, { min: 0 }).errors).toHaveLength(1);
    });

    it('should convert values to integers', () => {
      expect(integerType.convert(123)).toBe(123);
      expect(integerType.convert(-123)).toBe(-123);
      expect(() => integerType.convert('123')).toThrow();
      expect(() => integerType.convert(123.45)).toThrow();
    });
  });

  describe('BooleanType', () => {
    const booleanType = new BooleanType();

    it('should validate booleans correctly', () => {
      expect(booleanType.validate(true).errors).toHaveLength(0);
      expect(booleanType.validate(false).errors).toHaveLength(0);
      expect(booleanType.validate('true').errors).toHaveLength(1);
      expect(booleanType.validate(1).errors).toHaveLength(1);
    });

    it('should convert values to booleans', () => {
      const result = booleanType.validate(true);
      expect(result.errors).toHaveLength(0);
      expect(result.value).toBe(true);
    });
  });

  describe('validateValue', () => {
    const stringType = new StringType();
    const integerType = new IntegerType();

    it('should validate values against specified type', () => {
      expect(validateValue('test', stringType).errors).toHaveLength(0);
      expect(validateValue(123, integerType).errors).toHaveLength(0);
      expect(validateValue('123', integerType).errors).toHaveLength(1);
    });

    it('should handle null and undefined', () => {
      expect(validateValue(null, stringType).errors).toHaveLength(0);
      expect(validateValue(undefined, stringType).errors).toHaveLength(0);
    });
  });
}); 