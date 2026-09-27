/**
 * Tests for retryLimits cleanup in fileQueue.js (Issue #103).
 * Ensures that processing complete flag is set only when all files
 * have been successfully processed and retryLimits is cleared.
 */

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlink: jest.fn((path, cb) => cb(null))
}));

jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debugPayload: jest.fn()
}));

jest.mock('../../src/utils/fileProcessing', () => ({
  processFile: jest.fn()
}));

jest.mock('../../config.json', () => ({
  uploadPath: 'uploads',
  processingCompleteFlagPath: 'processing-complete.flag',
  maxRetryCount: 3,
  upload: {
    retryDelaySeconds: 0.01,
    maxConcurrent: 3
  }
}), { virtual: true });

describe('FileQueue retryLimits cleanup (Issue #103)', () => {
  let enqueueFiles;
  let processFile;
  let fs;

  beforeAll(() => {
    // Import mocked modules
    enqueueFiles = require('../../src/utils/fileQueue').enqueueFiles;
    processFile = require('../../src/utils/fileProcessing').processFile;
    fs = require('fs');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets processing complete flag after all files succeed', async () => {
    // Mock successful processing for all files
    processFile.mockImplementation(async () => {
      return { success: true };
    });

    // Enqueue 3 files
    enqueueFiles([
      { path: 'file1.jpg', provider: 'openai', originalname: 'file1.jpg' },
      { path: 'file2.jpg', provider: 'openai', originalname: 'file2.jpg' },
      { path: 'file3.jpg', provider: 'openai', originalname: 'file3.jpg' }
    ]);

    // Wait for processing to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    // Assert that the processing complete flag was written
    // This directly tests the retryLimits cleanup fix.
    // Without delete retryLimits[file.path], the flag is never written.
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      'processing-complete.flag',
      'complete'
    );
  });

  it('does not set flag while files are still processing', async () => {
    // Mock slow processing
    processFile.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
      return { success: true };
    });

    // Enqueue 2 files
    enqueueFiles([
      { path: 'slow1.jpg', provider: 'openai', originalname: 'slow1.jpg' },
      { path: 'slow2.jpg', provider: 'openai', originalname: 'slow2.jpg' }
    ]);

    // Check after 20ms - flag should NOT yet be written
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(fs.writeFileSync).not.toHaveBeenCalled();

    // Wait for files to complete
    await new Promise(resolve => setTimeout(resolve, 250));

    // Now flag should be written
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      'processing-complete.flag',
      'complete'
    );
  });

  it('sets flag correctly after a second batch (resetFileProcessingState clears retryLimits)', async () => {
    // Mock successful processing
    processFile.mockImplementation(async () => {
      return { success: true };
    });

    // First batch: enqueue 2 files
    enqueueFiles([
      { path: 'batch1_file1.jpg', provider: 'openai', originalname: 'batch1_file1.jpg' },
      { path: 'batch1_file2.jpg', provider: 'openai', originalname: 'batch1_file2.jpg' }
    ]);

    // Wait for first batch to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    // Assert flag was written for first batch
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      'processing-complete.flag',
      'complete'
    );
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);

    // Clear mock to track second batch independently
    jest.clearAllMocks();

    // Second batch: enqueue 2 more files
    // resetFileProcessingState() should have cleared retryLimits from batch 1
    enqueueFiles([
      { path: 'batch2_file1.jpg', provider: 'openai', originalname: 'batch2_file1.jpg' },
      { path: 'batch2_file2.jpg', provider: 'openai', originalname: 'batch2_file2.jpg' }
    ]);

    // Wait for second batch to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    // Assert flag was written again for second batch
    // This confirms that resetFileProcessingState() cleared stale entries
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      'processing-complete.flag',
      'complete'
    );
  });
});
