/**
 * @jest-environment jsdom
 */

const { ProcessingStateManager } = require('../../../utils/ProcessingStateManager');
const { setupProgressAPI, checkProgress, verifyCompletion, cleanupProcessing } = require('../api');

describe('Progress API', () => {
  let stateManager;
  let mockFetch;
  let mockStorage;

  beforeEach(() => {
    // Mock fetch API
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    // Mock storage
    mockStorage = {
      getProcessedFile: jest.fn(),
      cleanupTempFiles: jest.fn(),
      validateResults: jest.fn()
    };

    // Setup state manager
    stateManager = new ProcessingStateManager(mockStorage);
    setupProgressAPI(stateManager);
  });

  describe('checkProgress', () => {
    it('should fetch and return current progress state', async () => {
      stateManager.addFiles(['file1.jpg', 'file2.jpg']);
      await stateManager.updateProgress('file1.jpg', 'upload', 50);
      await stateManager.updateProgress('file2.jpg', 'upload', 75);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          files: {
            'file1.jpg': { phases: { upload: 50, ocr: 0, analysis: 0, validation: 0 } },
            'file2.jpg': { phases: { upload: 75, ocr: 0, analysis: 0, validation: 0 } }
          },
          totalFiles: 2,
          processedFiles: 0,
          phase: 'upload'
        })
      });

      const progress = await checkProgress();
      expect(progress).toEqual({
        files: {
          'file1.jpg': { phases: { upload: 50, ocr: 0, analysis: 0, validation: 0 } },
          'file2.jpg': { phases: { upload: 75, ocr: 0, analysis: 0, validation: 0 } }
        },
        totalFiles: 2,
        processedFiles: 0,
        phase: 'upload'
      });
      expect(mockFetch).toHaveBeenCalledWith('/api/progress', expect.any(Object));
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      
      await expect(checkProgress()).rejects.toThrow('Failed to fetch progress');
    });

    it('should handle invalid response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      await expect(checkProgress()).rejects.toThrow('Server error');
    });
  });

  describe('verifyCompletion', () => {
    it('should verify processing completion', async () => {
      stateManager.addFiles(['file1.jpg']);
      await stateManager.updateProgress('file1.jpg', 'upload', 100);
      await stateManager.updateProgress('file1.jpg', 'ocr', 100);
      await stateManager.updateProgress('file1.jpg', 'analysis', 100);
      await stateManager.updateProgress('file1.jpg', 'validation', 100);

      mockStorage.getProcessedFile.mockResolvedValue({ exists: true, size: 1024 });
      mockStorage.validateResults.mockResolvedValue({ isValid: true });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          isComplete: true,
          validFiles: ['file1.jpg'],
          invalidFiles: [],
          errors: [],
          validationErrors: []
        })
      });

      const result = await verifyCompletion();
      expect(result.isComplete).toBe(true);
      expect(result.validFiles).toContain('file1.jpg');
      expect(mockFetch).toHaveBeenCalledWith('/api/verify-completion', expect.any(Object));
    });

    it('should handle verification failures', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          isComplete: false,
          validFiles: [],
          invalidFiles: ['file1.jpg'],
          errors: [{ fileId: 'file1.jpg', error: 'Verification failed' }],
          validationErrors: []
        })
      });

      const result = await verifyCompletion();
      expect(result.isComplete).toBe(false);
      expect(result.invalidFiles).toContain('file1.jpg');
      expect(result.errors[0].error).toBe('Verification failed');
    });
  });

  describe('cleanupProcessing', () => {
    it('should trigger cleanup of completed files', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, cleanedFiles: ['file1.jpg'] })
      });

      const result = await cleanupProcessing();
      expect(result.success).toBe(true);
      expect(result.cleanedFiles).toContain('file1.jpg');
      expect(mockFetch).toHaveBeenCalledWith('/api/cleanup', expect.any(Object));
    });

    it('should handle cleanup failures', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      await expect(cleanupProcessing()).rejects.toThrow('Failed to cleanup processing');
    });
  });
}); 