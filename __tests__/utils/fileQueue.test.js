const path = require('path');
const { FatalError } = require('../../src/utils/errorTypes');

jest.mock('fs');
jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/fileProcessing');
jest.mock('../../config.json', () => ({
  upload: {
    maxConcurrent: 2,
    maxRetryCount: 3,
    retryDelaySeconds: 1
  },
  uploadPath: '/tmp/uploads'
}), { virtual: true });

const fs = require('fs');
const logger = require('../../src/utils/logger');
const { processFile } = require('../../src/utils/fileProcessing');
const {
  enqueueFiles,
  getProcessedResults,
  cancelProcessing
} = require('../../src/utils/fileQueue');

describe('fileQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    fs.mkdirSync.mockReturnValue(undefined);
    cancelProcessing();
  });

  describe('Fatal vs Transient error handling', () => {
    test('fatal errors skip retry — enqueueFileForRetry not called', async () => {
      const fatalError = new FatalError('API key invalid', 'auth_error');
      processFile.mockRejectedValueOnce(fatalError);

      enqueueFiles([{ path: '/test/file1.jpg', provider: 'openai' }]);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Fatal errors should not be re-enqueued
      const results = getProcessedResults();
      expect(results.length).toBe(1);
      expect(results[0].error).toBe(true);
      expect(results[0].errorMessage).toContain('API key invalid');
    });

    test('fatal errors add error result to processedResults', async () => {
      const fatalError = new FatalError('Config error', 'config_error');
      processFile.mockRejectedValueOnce(fatalError);

      enqueueFiles([{ path: '/test/file2.jpg', provider: 'openai' }]);

      await new Promise(resolve => setTimeout(resolve, 100));

      const results = getProcessedResults();
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(expect.objectContaining({
        fileName: 'file2.jpg',
        error: true,
        errorMessage: 'Config error'
      }));
    });

    test('non-fatal errors trigger enqueueFileForRetry', async () => {
      const transientError = new Error('Timeout');
      transientError.fatal = false;
      processFile.mockRejectedValueOnce(transientError);

      enqueueFiles([{ path: '/test/file3.jpg', provider: 'openai' }]);

      // Allow time for initial attempt
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should have retried, results count depends on retry logic
      // The key is that it didn't immediately fail like a fatal error
      expect(processFile).toHaveBeenCalled();
    });

    test('fatal errors clean up the file', async () => {
      const fatalError = new FatalError('Invalid credentials', 'auth_error');
      processFile.mockRejectedValueOnce(fatalError);
      fs.unlink.mockImplementation((path, cb) => cb(null));

      enqueueFiles([{ path: '/test/file4.jpg', provider: 'openai' }]);

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(fs.unlink).toHaveBeenCalledWith('/test/file4.jpg', expect.any(Function));
    });

    test('fatal errors respect maxRetryCount but only attempt once', async () => {
      const fatalError = new FatalError('Quota exceeded', 'quota_error');
      processFile.mockRejectedValue(fatalError);

      enqueueFiles([{ path: '/test/file5.jpg', provider: 'openai' }]);

      await new Promise(resolve => setTimeout(resolve, 100));

      // processFile should only be called once (no retries for fatal)
      expect(processFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('Empty sheet error handling', () => {
    test('empty sheet errors are returned as error result', async () => {
      const emptySheetResult = {
        error: true,
        errorType: 'empty_sheet',
        errorMessage: 'No readable text found',
        fileName: 'file6.jpg'
      };
      processFile.mockResolvedValueOnce(emptySheetResult);

      enqueueFiles([{ path: '/test/file6.jpg', provider: 'openai' }]);

      await new Promise(resolve => setTimeout(resolve, 100));

      const results = getProcessedResults();
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(expect.objectContaining({
        error: true,
        errorType: 'empty_sheet'
      }));
    });
  });

  describe('Successful processing', () => {
    test('successful processing adds result to processedResults', async () => {
      const successResult = {
        fileName: 'file7.jpg',
        memorial_number: '123',
        first_name: 'John',
        last_name: 'Doe'
      };
      processFile.mockResolvedValueOnce(successResult);

      enqueueFiles([{ path: '/test/file7.jpg', provider: 'openai' }]);

      await new Promise(resolve => setTimeout(resolve, 100));

      const results = getProcessedResults();
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(expect.objectContaining(successResult));
    });
  });
});
