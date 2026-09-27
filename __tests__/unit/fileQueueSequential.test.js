/**
 * Ensures the file queue processes files sequentially across multiple enqueue calls.
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
    maxConcurrent: 1
  }
}), { virtual: true });

describe('FileQueue sequential processing', () => {
  let enqueueFiles;
  let processFile;

  beforeAll(() => {
    // Only import what's needed
    enqueueFiles = require('../../src/utils/fileQueue').enqueueFiles;
    processFile = require('../../src/utils/fileProcessing').processFile;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('processes files sequentially when enqueued separately', async () => {
    let active = 0;
    let maxActive = 0;
    processFile.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 10));
      active--;
      return {};
    });

    enqueueFiles([{ path: 'first.jpg', provider: 'openai', originalname: 'first.jpg' }]);
    enqueueFiles([{ path: 'second.jpg', provider: 'openai', originalname: 'second.jpg' }]);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(processFile).toHaveBeenCalledTimes(2);
    expect(processFile.mock.calls[0][0]).toBe('first.jpg');
    expect(processFile.mock.calls[1][0]).toBe('second.jpg');
    expect(maxActive).toBe(1);
  });
});
