/**
 * Unit tests for MemorialOCRPrompt empty sheet handling
 */

const MemorialOCRPrompt = require('../templates/MemorialOCRPrompt');
const { ProcessingError } = require('../../errorTypes');

describe('MemorialOCRPrompt Empty Sheet Handling', () => {
  let prompt;
  
  beforeEach(() => {
    prompt = new MemorialOCRPrompt();
  });

  it('should throw a ProcessingError with type "empty_sheet" for null data', () => {
    const throwingFunction = () => prompt.validateAndConvert(null);
    
    expect(throwingFunction).toThrow(ProcessingError);
    
    let caughtError;
    try {
      throwingFunction();
    } catch (error) {
      caughtError = error;
    }
    
    expect(caughtError).toBeInstanceOf(ProcessingError);
    expect(caughtError.type).toBe('empty_sheet');
    expect(caughtError.message).toContain('No data received from OCR processing');
  });

  it('should throw a ProcessingError with type "empty_sheet" for empty object', () => {
    const throwingFunction = () => prompt.validateAndConvert({});
    
    expect(throwingFunction).toThrow(ProcessingError);
    
    let caughtError;
    try {
      throwingFunction();
    } catch (error) {
      caughtError = error;
    }
    
    expect(caughtError).toBeInstanceOf(ProcessingError);
    expect(caughtError.type).toBe('empty_sheet');
    expect(caughtError.message).toContain('Empty data received from OCR processing');
  });

  it('should throw a ProcessingError for missing required field', () => {
    const data = {
      memorial_number: null,
      first_name: null,
      last_name: null,
      year_of_death: null,
      inscription: null
    };

    const throwingFunction = () => prompt.validateAndConvert(data);
    
    expect(throwingFunction).toThrow(ProcessingError);
    
    let caughtError;
    try {
      throwingFunction();
    } catch (error) {
      caughtError = error;
    }
    
    expect(caughtError).toBeInstanceOf(ProcessingError);
    // Current implementation throws validation error for missing required field
    expect(caughtError.type).toBe('validation');
    expect(caughtError.message).toContain('memorial_number could not be found');
  });

  it('should throw a ProcessingError with type "validation" for missing required field', () => {
    const data = {
      first_name: 'John',
      last_name: 'Smith',
      year_of_death: 1900,
      inscription: 'Rest in Peace'
      // memorial_number is missing
    };

    const throwingFunction = () => prompt.validateAndConvert(data);
    
    expect(throwingFunction).toThrow(ProcessingError);
    
    let caughtError;
    try {
      throwingFunction();
    } catch (error) {
      caughtError = error;
    }
    
    expect(caughtError).toBeInstanceOf(ProcessingError);
    expect(caughtError.type).toBe('validation');
    expect(caughtError.message).toContain('memorial_number could not be found');
  });

  it('should throw a ProcessingError for empty string fields', () => {
    const data = {
      memorial_number: '',
      first_name: '',
      last_name: '',
      year_of_death: null,
      inscription: ''
    };

    const throwingFunction = () => prompt.validateAndConvert(data);
    
    expect(throwingFunction).toThrow(ProcessingError);
    
    let caughtError;
    try {
      throwingFunction();
    } catch (error) {
      caughtError = error;
    }
    
    expect(caughtError).toBeInstanceOf(ProcessingError);
    // Current implementation throws validation error for empty memorial_number
    expect(caughtError.type).toBe('validation');
    expect(caughtError.message).toContain('memorial_number could not be found');
  });
}); 