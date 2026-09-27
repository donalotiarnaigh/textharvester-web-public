const { ProcessingError, isEmptySheetError } = require('../errorTypes');

describe('ProcessingError', () => {
  it('should create a properly formatted error object', () => {
    const error = new ProcessingError('Test error message', 'test_type', '/path/to/file.jpg');
    
    expect(error.message).toBe('Test error message');
    expect(error.type).toBe('test_type');
    expect(error.filePath).toBe('/path/to/file.jpg');
    expect(error.name).toBe('ProcessingError');
    expect(error instanceof Error).toBe(true);
  });

  it('should handle missing optional parameters', () => {
    const error = new ProcessingError('Test error message');
    
    expect(error.message).toBe('Test error message');
    expect(error.type).toBeUndefined();
    expect(error.filePath).toBeUndefined();
    expect(error.name).toBe('ProcessingError');
  });
});

describe('isEmptySheetError', () => {
  it('should correctly identify empty sheet errors by message patterns', () => {
    const error1 = new Error('No readable text found on the sheet');
    const error2 = new Error('Empty data received from OCR processing');
    const error3 = new Error('The sheet may be empty or unreadable');
    const error4 = new Error('Other unrelated error');
    
    expect(isEmptySheetError(error1)).toBe(true);
    expect(isEmptySheetError(error2)).toBe(true);
    expect(isEmptySheetError(error3)).toBe(true);
    expect(isEmptySheetError(error4)).toBe(false);
  });

  it('should correctly identify ProcessingError with empty_sheet type', () => {
    const error = new ProcessingError('Test message', 'empty_sheet', '/path/to/file.jpg');
    
    expect(isEmptySheetError(error)).toBe(true);
  });
  
  it('should return false for ProcessingError with non-empty_sheet type', () => {
    const error = new ProcessingError('Test message', 'validation_error', '/path/to/file.jpg');
    
    expect(isEmptySheetError(error)).toBe(false);
  });
}); 