const types = require('../index');
const { DataType, StringType, IntegerType, BooleanType } = require('../dataTypes');
const { MemorialField, MEMORIAL_FIELDS } = require('../memorialFields');

describe('Types Index Module', () => {
  describe('Core Type Exports', () => {
    it('should export all core type classes', () => {
      expect(types.DataType).toBe(DataType);
      expect(types.StringType).toBe(StringType);
      expect(types.IntegerType).toBe(IntegerType);
      expect(types.BooleanType).toBe(BooleanType);
    });

    it('should allow instantiation of exported types', () => {
      const stringType = new types.StringType();
      const integerType = new types.IntegerType();
      const booleanType = new types.BooleanType();

      expect(stringType).toBeInstanceOf(types.StringType);
      expect(integerType).toBeInstanceOf(types.IntegerType);
      expect(booleanType).toBeInstanceOf(types.BooleanType);
    });
  });

  describe('Memorial Field Exports', () => {
    it('should export MemorialField class and MEMORIAL_FIELDS object', () => {
      expect(types.MemorialField).toBe(MemorialField);
      expect(types.MEMORIAL_FIELDS).toBe(MEMORIAL_FIELDS);
    });

    it('should export memorial field validation functions', () => {
      expect(typeof types.validateMemorialData).toBe('function');
      expect(typeof types.transformMemorialData).toBe('function');
    });
  });

  describe('Type Creation Helpers', () => {
    it('should provide createStringType helper', () => {
      const type = types.createStringType({ required: true });
      expect(type).toBeInstanceOf(StringType);
    });

    it('should provide createIntegerType helper', () => {
      const type = types.createIntegerType({ required: true });
      expect(type).toBeInstanceOf(IntegerType);
    });

    it('should provide createBooleanType helper', () => {
      const type = types.createBooleanType({ required: true });
      expect(type).toBeInstanceOf(BooleanType);
    });
  });

  describe('Field Creation Helpers', () => {
    it('should provide createField helper', () => {
      const field = types.createField('test', new types.StringType(), {
        description: 'Test field',
        required: true
      });
      expect(field).toBeInstanceOf(MemorialField);
      expect(field.name).toBe('test');
      expect(field.required).toBe(true);
      expect(field.metadata).toEqual({
        description: 'Test field'
      });
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain legacy field validation interface', () => {
      const validData = {
        memorial_number: 'HG123',
        first_name: 'John',
        last_name: 'Doe',
        year_of_death: 1900,
        inscription: 'Rest in Peace'
      };

      // Legacy validation should still work
      expect(() => types.validateMemorialData(validData)).not.toThrow();
    });

    it('should maintain legacy field transformation interface', () => {
      const data = {
        memorial_number: '  HG123  ',
        first_name: '  John  ',
        last_name: '  Doe  ',
        year_of_death: 1900
      };

      const transformed = types.transformMemorialData(data);
      expect(transformed.memorial_number).toBe('123'); // Extracts numeric part
      expect(transformed.first_name).toBe('JOHN'); // Transforms to uppercase
    });
  });
}); 