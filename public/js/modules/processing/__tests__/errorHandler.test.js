/**
 * @jest-environment jsdom
 */

const { ProcessingStateManager } = require('../../../utils/ProcessingStateManager');
const { ErrorHandler } = require('../errorHandler');

describe('ErrorHandler', () => {
  let stateManager;
  let errorHandler;
  let mockOperation;
  let mockStorage;

  beforeEach(() => {
    stateManager = new ProcessingStateManager();
    mockStorage = {
      saveError: jest.fn(),
      loadErrors: jest.fn().mockResolvedValue([]),
      clearError: jest.fn()
    };
    errorHandler = new ErrorHandler(stateManager, mockStorage);
    mockOperation = jest.fn();
  });

  describe('Retry Mechanism', () => {
    it('should retry failed operations with exponential backoff', async () => {
      const error = new Error('Network error');
      mockOperation
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ success: true });

      const result = await errorHandler.withRetry(
        'test.jpg',
        'ocr',
        mockOperation,
        { maxRetries: 3, initialDelay: 100 }
      );

      expect(result).toEqual({ success: true });
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should respect max retries limit', async () => {
      const error = new Error('Persistent error');
      mockOperation.mockRejectedValue(error);

      await expect(errorHandler.withRetry(
        'test.jpg',
        'ocr',
        mockOperation,
        { maxRetries: 2, initialDelay: 50 }
      )).rejects.toThrow('Persistent error');

      expect(mockOperation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should track retry attempts in state', async () => {
      const error = new Error('Network error');
      mockOperation
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ success: true });

      stateManager.addFiles(['test.jpg']);
      await errorHandler.withRetry(
        'test.jpg',
        'ocr',
        mockOperation,
        { maxRetries: 3, initialDelay: 50 }
      );

      const fileState = stateManager.state.files.get('test.jpg');
      expect(fileState.retryAttempts?.ocr).toBe(1);
    });
  });

  describe('Error Recovery', () => {
    it('should recover from a saved error state', async () => {
      const savedError = {
        fileId: 'test.jpg',
        phase: 'ocr',
        error: 'OCR service unavailable',
        timestamp: Date.now()
      };
      mockStorage.loadErrors.mockResolvedValueOnce([savedError]);

      const recoveryResult = await errorHandler.attemptRecovery('test.jpg');
      expect(recoveryResult.attempted).toBe(true);
      expect(recoveryResult.phase).toBe('ocr');
    });

    it('should clear error state after successful recovery', async () => {
      stateManager.addFiles(['test.jpg']);
      stateManager.recordError('test.jpg', new Error('Initial error'));

      await errorHandler.markErrorResolved('test.jpg');

      const fileState = stateManager.state.files.get('test.jpg');
      expect(fileState.status).toBe('pending');
      expect(stateManager.state.errors.has('test.jpg')).toBe(false);
      expect(mockStorage.clearError).toHaveBeenCalledWith('test.jpg');
    });

    it('should handle multiple error states for the same file', async () => {
      const errors = [
        { fileId: 'test.jpg', phase: 'ocr', error: 'OCR error', timestamp: Date.now() - 1000 },
        { fileId: 'test.jpg', phase: 'analysis', error: 'Analysis error', timestamp: Date.now() }
      ];
      mockStorage.loadErrors.mockResolvedValueOnce(errors);

      const recoveryResult = await errorHandler.attemptRecovery('test.jpg');
      expect(recoveryResult.attempted).toBe(true);
      expect(recoveryResult.phase).toBe('analysis'); // Should attempt most recent error first
    });
  });

  describe('Error Persistence', () => {
    it('should persist error details to storage', async () => {
      const error = new Error('Test error');
      await errorHandler.persistError('test.jpg', 'ocr', error);

      expect(mockStorage.saveError).toHaveBeenCalledWith({
        fileId: 'test.jpg',
        phase: 'ocr',
        error: error.message,
        timestamp: expect.any(Number)
      });
    });

    it('should load persisted errors on initialization', async () => {
      const savedErrors = [
        { fileId: 'test1.jpg', phase: 'ocr', error: 'Error 1', timestamp: Date.now() },
        { fileId: 'test2.jpg', phase: 'analysis', error: 'Error 2', timestamp: Date.now() }
      ];
      mockStorage.loadErrors.mockResolvedValueOnce(savedErrors);

      await errorHandler.initialize();

      savedErrors.forEach(error => {
        expect(stateManager.state.errors.has(error.fileId)).toBe(true);
      });
    });
  });
}); 