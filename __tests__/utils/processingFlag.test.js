const fs = require('fs');
const { clearProcessingCompleteFlag } = require('../../src/utils/processingFlag');
const config = require('../../config.json');

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
  mkdirSync: jest.fn()
}));

describe('clearProcessingCompleteFlag', () => {
  const flagPath = config.processingCompleteFlagPath;
  let originalConsoleLog;
  let originalConsoleError;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock console methods to capture logger output
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  it('should delete the flag file if it exists', () => {
    fs.existsSync.mockReturnValue(true);
    clearProcessingCompleteFlag();
    expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('processing_complete.flag'));
    expect(console.log).toHaveBeenCalledWith('[INFO] Cleared existing processing completion flag.');
  });

  it('should do nothing if the flag file does not exist', () => {
    fs.existsSync.mockReturnValue(false);

    clearProcessingCompleteFlag();

    expect(fs.existsSync).toHaveBeenCalledWith(flagPath);
    expect(fs.unlinkSync).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  it('should log an error if there is a problem deleting the flag file', () => {
    const error = new Error('Failed to delete');
    fs.existsSync.mockReturnValue(true);
    fs.unlinkSync.mockImplementation(() => {
      throw error;
    });

    clearProcessingCompleteFlag();

    expect(fs.unlinkSync).toHaveBeenCalledWith(flagPath);
    expect(console.error).toHaveBeenCalledWith(
      '[ERROR] Error clearing processing completion flag:',
      error
    );
  });
});
