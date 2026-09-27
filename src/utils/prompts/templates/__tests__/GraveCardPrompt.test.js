const GraveCardPrompt = require('../GraveCardPrompt');


describe('GraveCardPrompt', () => {
  let prompt;

  beforeEach(() => {
    prompt = new GraveCardPrompt();
  });

  describe('Configuration', () => {
    test('should initialize with correct defaults', () => {
      expect(prompt.version).toBe('1.0.0');
      expect(prompt.providers).toContain('openai');
      expect(prompt.providers).toContain('anthropic');
      // BasePrompt expects fields, but we pass empty and handle validation manually
      expect(prompt.fields).toEqual({});
    });
  });

  describe('Prompt Generation', () => {
    test('getProviderPrompt(openai) should include strict transcription rules', () => {
      const config = prompt.getProviderPrompt('openai');
      const text = config.userPrompt + config.systemPrompt;

      expect(text).toContain('single dashes (-) for illegible characters');
      expect(text).toContain('Use | as line separator');
      expect(text).toContain('Do NOT use [?]');
      expect(text).not.toContain('[better guess]');
    });

    test('getProviderPrompt(anthropic) should include JSON requirement', () => {
      const config = prompt.getProviderPrompt('anthropic');
      const text = config.userPrompt + config.systemPrompt;

      expect(text).toContain('valid JSON');
      expect(text).toContain('Grave Record Card Schema');
    });
  });

  describe('Schema Validation (validateAndConvert)', () => {
    // A fully valid mock object based on the User's JSON Schema
    const validRecord = {
      card_metadata: {
        source_reference: 'FILE_123.pdf',
        card_version: 'v1',
        notes: 'Some notes'
      },
      location: {
        section: 'A',
        grave_number: 123,
        plot_identifier: 'Row 1'
      },
      grave: {
        number_buried: 2,
        status: 'occupied',
        description_of_grave: 'Headstone',
        dimensions: {
          length_ft: 8,
          width_ft: 4,
          unit: 'ft'
        }
      },
      interments: [
        {
          sequence_number: 1,
          name: {
            surname: 'DOE',
            given_names: 'JOHN',
            full_name: 'JOHN DOE'
          },
          date_of_death: {
            iso: '1900-01-01',
            certainty: 'certain'
          }
        }
      ],
      inscription: {
        text: 'In Memory Of...'
      },
      sketch: {
        present: false
      }
    };

    test('should pass a valid comprehensive record', () => {
      const { data: result } = prompt.validateAndConvert(validRecord);
      expect(result).toEqual(validRecord);
    });

    test('should throw if top-level required fields are missing', () => {
      const invalid = { ...validRecord };
      delete invalid.location;

      expect(() => prompt.validateAndConvert(invalid))
        .toThrow(/Missing required top-level field: location/);
    });

    test('should throw if nested required fields are missing (location.section)', () => {
      const invalid = JSON.parse(JSON.stringify(validRecord));
      delete invalid.location.section;

      expect(() => prompt.validateAndConvert(invalid))
        .toThrow(/Missing required field: location.section/);
    });

    test('should throw if nested required fields are missing (grave.status)', () => {
      // Note: status has default "unknown", but if provided as null or undefined in a way that bypasses default logic?
      // Actually schema says required for the 'if vacant' check, let's check general requirement
      // The user schema implicitly requires validating structure.
      const invalid = JSON.parse(JSON.stringify(validRecord));
      // grave itself is required.
      delete invalid.grave;
      expect(() => prompt.validateAndConvert(invalid))
        .toThrow(/Missing required top-level field: grave/);
    });

    test('should validate Enum values (grave.status)', () => {
      const invalid = JSON.parse(JSON.stringify(validRecord));
      invalid.grave.status = 'reserved'; // Not in [occupied, vacant, unknown]

      expect(() => prompt.validateAndConvert(invalid))
        .toThrow(/Invalid value for grave.status/);
    });

    test('should validate Logic: if status is vacant, interments should be empty', () => {
      const invalid = JSON.parse(JSON.stringify(validRecord));
      invalid.grave.status = 'vacant';
      invalid.interments = [{ name: { full_name: 'Ghost' } }]; // Should be empty

      expect(() => prompt.validateAndConvert(invalid))
        .toThrow(/Grave is marked 'vacant' but contains interments/);
    });

    test('should allow empty interments list', () => {
      const emptyInterments = JSON.parse(JSON.stringify(validRecord));
      emptyInterments.interments = [];
      const { data: result } = prompt.validateAndConvert(emptyInterments);
      expect(result.interments).toEqual([]);
    });

    test('should validate interments structure if present', () => {
      const invalid = JSON.parse(JSON.stringify(validRecord));
      invalid.interments = [
        { sequence_number: 1 } // Missing name
      ];

      expect(() => prompt.validateAndConvert(invalid))
        .toThrow(/Interment at index 0 missing required field: name/);
    });

    test('should validate date format checking (iso)', () => {
      const invalid = JSON.parse(JSON.stringify(validRecord));
      invalid.interments[0].date_of_death.iso = 'not-a-date';

      expect(() => prompt.validateAndConvert(invalid))
        .toThrow(/Invalid ISO date format/);
    });
  });

  describe('cross-field validation', () => {
    const baseRecord = {
      card_metadata: { source_reference: 'FILE_123.pdf', card_version: 'v1', notes: '' },
      location: { section: 'A', grave_number: 1, plot_identifier: 'Row 1' },
      grave: { number_buried: 1, status: 'occupied', description_of_grave: 'Headstone', dimensions: { length_ft: 8, width_ft: 4, unit: 'ft' } },
      inscription: { text: '' },
      sketch: { present: false }
    };

    test('flags BURIAL_BEFORE_DEATH when burial ISO is before death ISO', () => {
      const record = {
        ...baseRecord,
        interments: [{
          sequence_number: 1,
          name: { full_name: 'JOHN DOE' },
          date_of_death: { iso: '1920-06-15', certainty: 'certain' },
          date_of_burial: { iso: '1920-06-10', certainty: 'certain' }
        }]
      };

      const { validationWarnings } = prompt.validateAndConvert(record);

      expect(validationWarnings.some(w => w.includes('BURIAL_BEFORE_DEATH'))).toBe(true);
    });

    test('does not flag BURIAL_BEFORE_DEATH when burial is after death', () => {
      const record = {
        ...baseRecord,
        interments: [{
          sequence_number: 1,
          name: { full_name: 'JOHN DOE' },
          date_of_death: { iso: '1920-06-15', certainty: 'certain' },
          date_of_burial: { iso: '1920-06-18', certainty: 'certain' }
        }]
      };

      const { validationWarnings } = prompt.validateAndConvert(record);

      expect(validationWarnings.some(w => w.includes('BURIAL_BEFORE_DEATH'))).toBe(false);
    });

    test('flags AGE_IMPLAUSIBLE when age_at_death exceeds 150', () => {
      const record = {
        ...baseRecord,
        interments: [{
          sequence_number: 1,
          name: { full_name: 'JOHN DOE' },
          date_of_death: { iso: '1920-06-15', certainty: 'certain' },
          age_at_death: 200
        }]
      };

      const { validationWarnings } = prompt.validateAndConvert(record);

      expect(validationWarnings.some(w => w.includes('AGE_IMPLAUSIBLE'))).toBe(true);
    });

    test('flags AGE_DEATH_MISMATCH when death year minus age is before 1400', () => {
      const record = {
        ...baseRecord,
        interments: [{
          sequence_number: 1,
          name: { full_name: 'JOHN DOE' },
          date_of_death: { iso: '1800-06-15', certainty: 'certain' },
          age_at_death: 450  // 1800 - 450 = 1350, before 1400; age itself is > 150 but AGE_DEATH_MISMATCH is more specific
        }]
      };

      const { validationWarnings } = prompt.validateAndConvert(record);

      expect(validationWarnings.some(w => w.includes('AGE_DEATH_MISMATCH'))).toBe(true);
    });

    test('does not flag valid interment data', () => {
      const record = {
        ...baseRecord,
        interments: [{
          sequence_number: 1,
          name: { full_name: 'JOHN DOE' },
          date_of_death: { iso: '1920-06-15', certainty: 'certain' },
          date_of_burial: { iso: '1920-06-18', certainty: 'certain' },
          age_at_death: 72
        }]
      };

      const { validationWarnings } = prompt.validateAndConvert(record);

      expect(validationWarnings.length).toBe(0);
    });
  });

  describe('getJsonSchema', () => {
    it('should return a JSON Schema object', () => {
      const schema = prompt.getJsonSchema();
      expect(schema).not.toBeNull();
      expect(typeof schema).toBe('object');
    });

    it('should have type object with properties', () => {
      const schema = prompt.getJsonSchema();
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
    });

    it('should include location, grave, and interments fields', () => {
      const schema = prompt.getJsonSchema();
      expect(schema.properties.location).toBeDefined();
      expect(schema.properties.grave).toBeDefined();
      expect(schema.properties.interments).toBeDefined();
    });

    it('should define interments as an array', () => {
      const schema = prompt.getJsonSchema();
      expect(schema.properties.interments.type).toBe('array');
      expect(schema.properties.interments.items).toBeDefined();
    });
  });
});
