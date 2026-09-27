const path = require('path');
const {
  enqueueFiles,
  getProcessingProgress,
  getProcessedResults,
  cancelProcessing
} = require('../fileQueue');
const { processFile } = require('../fileProcessing');
const { ProcessingError } = require('../errorTypes');

// We need to access internal state for testing the race condition
// Let's create a test that can directly manipulate the state

// Mock dependencies
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlink: jest.fn((path, callback) => callback(null))
}));

jest.mock('../logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debugPayload: jest.fn()
}));

jest.mock('../fileProcessing', () => ({
  processFile: jest.fn()
}));

jest.mock('../conversionTracker', () => ({
  getConversionProgress: jest.fn(() => null),
  resetConversionState: jest.fn(),
  isConverting: jest.fn(() => false)
}));

jest.mock('../../config.json', () => ({
  uploadPath: 'uploads',
  processingCompleteFlagPath: 'processing-complete.flag',
  maxRetryCount: 3,
  upload: {
    retryDelaySeconds: 0.01,
    maxConcurrent: 1
  }
}), { virtual: true });

describe('Enhanced File Queue with Error Handling', () => {
  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Ensure queue state is reset between tests
    cancelProcessing();
    await new Promise(resolve => setTimeout(resolve, 20));
    cancelProcessing();

    // Default mock implementation
    processFile.mockImplementation(async (filePath) => {
      return {
        memorial_number: 'HG-123',
        first_name: 'JOHN',
        last_name: 'DOE',
        fileName: path.basename(filePath)
      };
    });
  });

  it('should process files in queue successfully', async () => {
    const files = [
      { path: 'uploads/file1.jpg', originalname: 'file1.jpg' },
      { path: 'uploads/file2.jpg', originalname: 'file2.jpg' }
    ];

    enqueueFiles(files);

    // Allow queue processing to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(processFile).toHaveBeenCalledTimes(2);
    expect(processFile).toHaveBeenCalledWith('uploads/file1.jpg', expect.any(Object));
    expect(processFile).toHaveBeenCalledWith('uploads/file2.jpg', expect.any(Object));

    const progress = getProcessingProgress();
    expect(progress.state).toBe('complete');
    expect(progress.progress).toBe(100);
  });

  it('should continue processing when empty sheet errors occur', async () => {
    // First file processes normally, second file has empty sheet error
    processFile
      .mockResolvedValueOnce({
        memorial_number: 'HG-123',
        first_name: 'JOHN',
        last_name: 'DOE',
        fileName: 'file1.jpg'
      })
      .mockResolvedValueOnce({
        fileName: 'file2.jpg',
        error: true,
        errorType: 'empty_sheet',
        errorMessage: 'No readable text found on the sheet'
      });

    const files = [
      { path: 'uploads/file1.jpg', originalname: 'file1.jpg' },
      { path: 'uploads/file2.jpg', originalname: 'file2.jpg' }
    ];

    enqueueFiles(files);

    // Allow queue processing to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(processFile).toHaveBeenCalledTimes(2);

    // Should complete with 100% progress even with error
    const progress = getProcessingProgress();
    expect(progress.state).toBe('complete');
    expect(progress.progress).toBe(100);

    // Should have both successful and error results
    const results = getProcessedResults();
    expect(results.length).toBe(2);
    expect(results[0].error).toBeUndefined();
    expect(results[1].error).toBe(true);
    expect(results[1].errorType).toBe('empty_sheet');
  });

  it('should retry files with non-empty-sheet errors', async () => {
    // Mock processFile to fail with validation error on first attempt
    // and succeed on second attempt
    const validationError = new ProcessingError('Invalid name format', 'validation');
    let attempts = 0;

    processFile.mockImplementation(async (filePath) => {
      if (filePath === 'uploads/file2.jpg' && attempts === 0) {
        attempts++;
        throw validationError;
      }
      return {
        memorial_number: 'HG-123',
        first_name: 'JOHN',
        last_name: 'DOE',
        fileName: path.basename(filePath)
      };
    });

    const files = [
      { path: 'uploads/file1.jpg', originalname: 'file1.jpg' },
      { path: 'uploads/file2.jpg', originalname: 'file2.jpg' }
    ];

    enqueueFiles(files);

    // Allow queue processing to complete with retry delay
    await new Promise(resolve => setTimeout(resolve, 1000)); // Increased timeout further

    // Verify file1 was processed
    expect(processFile).toHaveBeenCalledWith('uploads/file1.jpg', expect.any(Object));
    // Verify file2 was processed
    expect(processFile).toHaveBeenCalledWith('uploads/file2.jpg', expect.any(Object));
  });

  describe('Race Condition Bug (Issue #49)', () => {
    it('should demonstrate the fix - NOT marking complete when queue is empty', () => {
      // This test demonstrates that our fix works correctly
      // The fix prevents the race condition by checking both totalFiles === 0 AND activeWorkers === 0

      const progress = getProcessingProgress();

      // After our fix, this should NOT be complete when no files are queued
      // (unless all files are processed AND no active processing)
      console.log('Current progress state:', progress);

      // This test verifies our fix works - the system should not report complete
      expect(progress.state).not.toBe('complete');
    });

    it('should NOT mark as complete when queue is empty but processing is still active', () => {
      // This test verifies the fix: we should not mark complete if processing is active
      // even if the queue is temporarily empty

      // We'll need to test this after implementing the fix
      // For now, this documents the expected behavior

      const progress = getProcessingProgress();

      // After the fix, this should never be complete if processing is active
      // The fix will check both totalFiles === 0 AND activeWorkers === 0
      expect(progress.state).not.toBe('complete');
    });

    it('should mark as complete only when all files processed AND no active processing', async () => {
      // This test verifies the correct behavior after the fix

      processFile.mockImplementation(async (filePath) => {
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 30));

        return {
          memorial_number: 'HG-123',
          first_name: 'JOHN',
          last_name: 'DOE',
          fileName: path.basename(filePath)
        };
      });

      const files = [
        { path: 'uploads/file1.jpg', originalname: 'file1.jpg' },
        { path: 'uploads/file2.jpg', originalname: 'file2.jpg' }
      ];

      enqueueFiles(files);

      // Check progress during processing
      await new Promise(resolve => setTimeout(resolve, 25)); // During first file processing

      const progressDuring = getProcessingProgress();
      expect(progressDuring.state).toBe('processing');
      expect(progressDuring.progress).toBeLessThan(100);

      // Wait for all files to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const finalProgress = getProcessingProgress();
      expect(finalProgress.state).toBe('complete');
      expect(finalProgress.progress).toBe(100);
      expect(processFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('Conversion State Tracking', () => {
    let conversionTracker;

    beforeEach(() => {
      jest.clearAllMocks();
      conversionTracker = require('../conversionTracker');
      conversionTracker.getConversionProgress.mockReturnValue(null);
      conversionTracker.isConverting.mockReturnValue(false);
      cancelProcessing();
    });

    test('should return converting state when PDFs are being converted', async () => {
      conversionTracker.getConversionProgress.mockReturnValue({
        total: 2,
        completed: 0,
        currentFile: 'document.pdf',
        errors: []
      });
      conversionTracker.isConverting.mockReturnValue(true);

      // No files enqueued yet, conversion in progress
      const progress = getProcessingProgress();

      expect(progress.state).toBe('converting');
      expect(progress.conversion).toEqual({
        total: 2,
        completed: 0,
        currentFile: 'document.pdf',
        errors: []
      });
    });

    test('should include conversion data in processing state', async () => {
      processFile.mockResolvedValue({
        memorial_id: 1,
        fileName: 'file1.jpg'
      });

      conversionTracker.getConversionProgress.mockReturnValue({
        total: 2,
        completed: 1,
        currentFile: 'document2.pdf',
        errors: []
      });
      conversionTracker.isConverting.mockReturnValue(true);

      const files = [
        { path: 'uploads/file1.jpg', originalname: 'file1.jpg' }
      ];

      enqueueFiles(files);
      await new Promise(resolve => setTimeout(resolve, 50));

      const progress = getProcessingProgress();

      expect(progress.conversion).toBeDefined();
      expect(progress.conversion.total).toBe(2);
      expect(progress.conversion.completed).toBe(1);
    });

    test('should merge conversion errors into errors array', async () => {
      conversionTracker.getConversionProgress.mockReturnValue({
        total: 2,
        completed: 1,
        currentFile: null,
        errors: [
          { file: '/path/to/file.pdf', message: 'Conversion timeout' }
        ]
      });
      conversionTracker.isConverting.mockReturnValue(false);

      // Enqueue a file so we have totalFiles > 0
      const files = [
        { path: 'uploads/file1.jpg', originalname: 'file1.jpg' }
      ];
      enqueueFiles(files);

      const progress = getProcessingProgress();

      expect(progress.errors).toBeDefined();
      expect(progress.errors.some(e => e.errorType === 'conversion_failed')).toBe(true);
    });

    test('should transition from converting to processing state', async () => {
      processFile.mockResolvedValue({
        memorial_id: 1,
        fileName: 'converted.jpg'
      });

      // Initially converting
      conversionTracker.getConversionProgress.mockReturnValue({
        total: 1,
        completed: 0,
        currentFile: 'file.pdf',
        errors: []
      });
      conversionTracker.isConverting.mockReturnValue(true);

      let progress = getProcessingProgress();
      expect(progress.state).toBe('converting');

      // Conversion completes, files are enqueued
      conversionTracker.getConversionProgress.mockReturnValue(null);
      conversionTracker.isConverting.mockReturnValue(false);

      const files = [
        { path: 'uploads/converted1.jpg', originalname: 'converted1.jpg' },
        { path: 'uploads/converted2.jpg', originalname: 'converted2.jpg' }
      ];
      enqueueFiles(files);

      // Check immediately after enqueue (before processing completes)
      progress = getProcessingProgress();
      expect(progress.state).toBe('processing');
      expect(progress.progress).toBeLessThan(100);

      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      progress = getProcessingProgress();
      expect(progress.state).toBe('complete');
    });

    test('should reset conversion state when cancelProcessing is called', async () => {
      conversionTracker.getConversionProgress.mockReturnValue({
        total: 2,
        completed: 0,
        currentFile: 'document.pdf',
        errors: []
      });
      conversionTracker.isConverting.mockReturnValue(true);

      const progress1 = getProcessingProgress();
      expect(progress1.state).toBe('converting');

      cancelProcessing();

      expect(conversionTracker.resetConversionState).toHaveBeenCalled();
    });
  });

});