const { ProcessingStateManager } = require('../ProcessingStateManager');

describe('ProcessingStateManager', () => {
  let stateManager;
  let mockStorage;

  beforeEach(() => {
    mockStorage = {
      getProcessedFile: jest.fn(),
      cleanupTempFiles: jest.fn(),
      validateResults: jest.fn()
    };
    stateManager = new ProcessingStateManager(mockStorage);
  });

  // ... existing test blocks ...

  describe('Completion Integration', () => {
    let completionListener;

    beforeEach(() => {
      completionListener = jest.fn();
      stateManager.addCompletionListener(completionListener);
    });

    it('should notify completion listeners when all files are complete', async () => {
      stateManager.addFiles(['file1.jpg', 'file2.jpg']);

      // Mock storage methods to return success
      mockStorage.getProcessedFile.mockResolvedValue({ exists: true, size: 1024 });
      mockStorage.validateResults.mockResolvedValue({ isValid: true });

      // Complete all phases for both files
      await stateManager.updateProgress('file1.jpg', 'upload', 100);
      await stateManager.updateProgress('file1.jpg', 'ocr', 100);
      await stateManager.updateProgress('file1.jpg', 'analysis', 100);
      await stateManager.updateProgress('file1.jpg', 'validation', 100);

      await stateManager.updateProgress('file2.jpg', 'upload', 100);
      await stateManager.updateProgress('file2.jpg', 'ocr', 100);
      await stateManager.updateProgress('file2.jpg', 'analysis', 100);
      await stateManager.updateProgress('file2.jpg', 'validation', 100);

      expect(completionListener).toHaveBeenCalledWith({
        isComplete: true,
        validFiles: ['file1.jpg', 'file2.jpg'],
        invalidFiles: [],
        errors: [],
        validationErrors: [],
        message: 'All files processed successfully'
      });
    });

    it('should not notify completion on partial progress', async () => {
      stateManager.addFiles(['file1.jpg']);
      await stateManager.updateProgress('file1.jpg', 'upload', 50);

      expect(completionListener).not.toHaveBeenCalled();
    });

    it('should handle completion verification failures', async () => {
      stateManager.addFiles(['file1.jpg']);

      // Complete all phases
      await stateManager.updateProgress('file1.jpg', 'upload', 100);
      await stateManager.updateProgress('file1.jpg', 'ocr', 100);
      await stateManager.updateProgress('file1.jpg', 'analysis', 100);
      await stateManager.updateProgress('file1.jpg', 'validation', 100);

      // Simulate verification failure
      mockStorage.getProcessedFile.mockResolvedValue({ exists: true, size: 0 });
      mockStorage.validateResults.mockResolvedValue({ isValid: false, error: 'Invalid result' });

      expect(completionListener).toHaveBeenCalledWith(expect.objectContaining({
        isComplete: false,
        invalidFiles: ['file1.jpg'],
        message: '1 files incomplete or invalid'
      }));
    });

    it('should cleanup states after successful completion', async () => {
      stateManager.addFiles(['file1.jpg']);

      // Complete all phases
      await stateManager.updateProgress('file1.jpg', 'upload', 100);
      await stateManager.updateProgress('file1.jpg', 'ocr', 100);
      await stateManager.updateProgress('file1.jpg', 'analysis', 100);
      await stateManager.updateProgress('file1.jpg', 'validation', 100);

      mockStorage.getProcessedFile.mockResolvedValue({ exists: true, size: 1024 });
      mockStorage.validateResults.mockResolvedValue({ isValid: true });

      await stateManager.cleanupCompletedFiles();
      expect(mockStorage.cleanupTempFiles).toHaveBeenCalledWith('file1.jpg');
    });

    it('should not cleanup incomplete files', async () => {
      stateManager.addFiles(['file1.jpg', 'file2.jpg']);

      // Complete file1
      await stateManager.updateProgress('file1.jpg', 'upload', 100);
      await stateManager.updateProgress('file1.jpg', 'ocr', 100);
      await stateManager.updateProgress('file1.jpg', 'analysis', 100);
      await stateManager.updateProgress('file1.jpg', 'validation', 100);

      // Partial file2
      await stateManager.updateProgress('file2.jpg', 'upload', 50);

      mockStorage.getProcessedFile.mockResolvedValue({ exists: true, size: 1024 });
      mockStorage.validateResults.mockResolvedValue({ isValid: true });

      await stateManager.cleanupCompletedFiles();
      expect(mockStorage.cleanupTempFiles).toHaveBeenCalledWith('file1.jpg');
      expect(mockStorage.cleanupTempFiles).not.toHaveBeenCalledWith('file2.jpg');
    });

    it('should allow adding completion verification hooks', async () => {
      const preValidationHook = jest.fn().mockResolvedValue(true);
      stateManager.addCompletionHook('preValidation', preValidationHook);

      stateManager.addFiles(['file1.jpg']);
      await stateManager.updateProgress('file1.jpg', 'upload', 100);
      await stateManager.updateProgress('file1.jpg', 'ocr', 100);
      await stateManager.updateProgress('file1.jpg', 'analysis', 100);
      await stateManager.updateProgress('file1.jpg', 'validation', 100);

      expect(preValidationHook).toHaveBeenCalledWith('file1.jpg', expect.any(Object));
    });

    it('should handle failed completion hooks', async () => {
      const preValidationHook = jest.fn().mockResolvedValue(false);
      stateManager.addCompletionHook('preValidation', preValidationHook);

      stateManager.addFiles(['file1.jpg']);
      await stateManager.updateProgress('file1.jpg', 'upload', 100);
      await stateManager.updateProgress('file1.jpg', 'ocr', 100);
      await stateManager.updateProgress('file1.jpg', 'analysis', 100);
      await stateManager.updateProgress('file1.jpg', 'validation', 100);

      expect(completionListener).toHaveBeenCalledWith(expect.objectContaining({
        isComplete: false,
        validationErrors: expect.arrayContaining([
          expect.objectContaining({
            fileId: 'file1.jpg',
            error: 'Pre-validation hook failed'
          })
        ])
      }));
    });
  });
}); 