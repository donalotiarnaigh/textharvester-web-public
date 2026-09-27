const {
  ProcessingError,
  FatalError,
  TransientError,
  isEmptySheetError,
  isValidationError,
  isFatalError
} = require('../../src/utils/errorTypes');

describe('errorTypes', () => {
  describe('FatalError', () => {
    test('sets fatal = true', () => {
      const error = new FatalError('Auth failed', 'auth_error', '/path/file.jpg');
      expect(error.fatal).toBe(true);
    });

    test('sets name = "FatalError"', () => {
      const error = new FatalError('Auth failed', 'auth_error');
      expect(error.name).toBe('FatalError');
    });

    test('extends ProcessingError', () => {
      const error = new FatalError('Auth failed', 'auth_error', '/path/file.jpg');
      expect(error instanceof ProcessingError).toBe(true);
    });

    test('preserves type and filePath', () => {
      const error = new FatalError('Auth failed', 'auth_error', '/path/file.jpg');
      expect(error.type).toBe('auth_error');
      expect(error.filePath).toBe('/path/file.jpg');
    });

    test('preserves message', () => {
      const error = new FatalError('API key invalid', 'auth_error');
      expect(error.message).toBe('API key invalid');
    });
  });

  describe('TransientError', () => {
    test('sets fatal = false', () => {
      const error = new TransientError('Rate limit', 'rate_limit', '/path/file.jpg');
      expect(error.fatal).toBe(false);
    });

    test('sets name = "TransientError"', () => {
      const error = new TransientError('Rate limit', 'rate_limit');
      expect(error.name).toBe('TransientError');
    });

    test('extends ProcessingError', () => {
      const error = new TransientError('Rate limit', 'rate_limit', '/path/file.jpg');
      expect(error instanceof ProcessingError).toBe(true);
    });

    test('preserves type and filePath', () => {
      const error = new TransientError('Rate limit', 'rate_limit', '/path/file.jpg');
      expect(error.type).toBe('rate_limit');
      expect(error.filePath).toBe('/path/file.jpg');
    });
  });

  describe('isFatalError', () => {
    test('returns true for FatalError instances', () => {
      const error = new FatalError('Auth failed', 'auth_error');
      expect(isFatalError(error)).toBe(true);
    });

    test('returns true for plain errors with error.fatal = true', () => {
      const error = new Error('Something fatal');
      error.fatal = true;
      expect(isFatalError(error)).toBe(true);
    });

    test('returns false for TransientError instances', () => {
      const error = new TransientError('Rate limit', 'rate_limit');
      expect(isFatalError(error)).toBe(false);
    });

    test('returns false for plain Error instances', () => {
      const error = new Error('Something went wrong');
      expect(isFatalError(error)).toBe(false);
    });

    test('returns false for ProcessingError with non-fatal type', () => {
      const error = new ProcessingError('Validation failed', 'validation');
      expect(isFatalError(error)).toBe(false);
    });
  });

  // Existing tests should still pass
  describe('isEmptySheetError', () => {
    test('identifies empty_sheet type', () => {
      const error = new ProcessingError('Sheet is empty', 'empty_sheet');
      expect(isEmptySheetError(error)).toBe(true);
    });

    test('identifies by message', () => {
      const error = new Error('No readable text found');
      expect(isEmptySheetError(error)).toBe(true);
    });
  });

  describe('isValidationError', () => {
    test('identifies validation type', () => {
      const error = new ProcessingError('Invalid data', 'validation');
      expect(isValidationError(error)).toBe(true);
    });
  });
});
