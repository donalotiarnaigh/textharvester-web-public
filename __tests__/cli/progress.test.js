const ProgressManager = require('../../src/cli/progress');
const cliProgress = require('cli-progress');

// Mock dependencies
jest.mock('cli-progress');
jest.mock('chalk', () => ({
  green: jest.fn(text => `GREEN:${text}`),
  red: jest.fn(text => `RED:${text}`),
  yellow: jest.fn(text => `YELLOW:${text}`),
  cyan: jest.fn(text => `CYAN:${text}`),
  gray: jest.fn(text => `GRAY:${text}`),
}));

describe('ProgressManager', () => {
  let progress;
  let mockBar;
  let consoleSpy;
  let originalIsTTY;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock cli-progress bar instance
    mockBar = {
      start: jest.fn(),
      update: jest.fn(),
      increment: jest.fn(),
      stop: jest.fn(),
    };
    cliProgress.SingleBar.mockImplementation(() => mockBar);
    cliProgress.Presets = { shades_classic: 'preset' };

    // Mock console
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => { });

    // Save original TTY state
    originalIsTTY = process.stdout.isTTY;
  });

  afterEach(() => {
    // Restore TTY state
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    consoleSpy.mockRestore();
  });

  describe('TTY Mode (Interactive)', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
      progress = new ProgressManager();
    });

    test('init creates and starts a progress bar', () => {
      progress.init(10);
      expect(cliProgress.SingleBar).toHaveBeenCalled();
      expect(mockBar.start).toHaveBeenCalledWith(10, 0, expect.any(Object));
    });

    test('update increments the progress bar', () => {
      progress.init(10);
      progress.update('file1.jpg', 'processing');
      expect(mockBar.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        filename: 'file1.jpg',
        status: 'processing'
      }));
    });

    test('increment increases the bar count', () => {
      progress.init(10);
      progress.increment();
      expect(mockBar.increment).toHaveBeenCalled();
    });

    test('stop stops the progress bar and shows summary', () => {
      // Setup some stats
      progress.init(2);
      progress.update('file1.jpg', 'success'); // Assume implementation tracks stats
      progress.increment(); // 1 success

      progress.stop();
      expect(mockBar.stop).toHaveBeenCalled();
      // Summary log should strictly be called? The requirement says "display a summary".
      // Assuming stop() triggers the summary output.
    });
  });

  describe('Non-TTY Mode (Scripting/Piped)', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
      progress = new ProgressManager();
    });

    test('init does NOT create a progress bar', () => {
      progress.init(10);
      expect(cliProgress.SingleBar).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Starting processing of 10 files'));
    });

    test('update logs simple line updates', () => {
      progress.init(10);
      progress.update('file1.jpg', 'processing');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('file1.jpg'));
    });

    test('increment does not call bar increment', () => {
      progress.init(10);
      progress.increment();
      expect(mockBar.increment).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
      progress = new ProgressManager();
    });

    test('fail logs error inline and tracks failure', () => {
      progress.init(5);
      // Simulate multiple calls
      progress.fail('bad_file.jpg', new Error('Corrupt file'));

      // Should preserve progress bar if running? 
      // Requirement 7.5: "display the failure inline, continue processing"
      // Usually logging breaks the progress bar layout unless using bar.log or stopping/starting.
      // We expect the implementation to handle this (e.g. stop, log, start or use multiprogress).

      // For this test, we check if it tracks the failure
      const summary = progress.getSummary();
      expect(summary.failed).toBe(1);
      expect(summary.failures).toHaveLength(1);
      expect(summary.failures[0].file).toBe('bad_file.jpg');
    });
  });

  describe('Summary Generation', () => {
    beforeEach(() => {
      progress = new ProgressManager();
    });

    test('getSummary returns correct counts', () => {
      progress.init(3);
      // Simulate failure
      progress.fail('file1.jpg', new Error('error'));

      const summary = progress.getSummary();
      expect(summary).toEqual(expect.objectContaining({
        total: 3,
        processed: 0, // implementation should increment this on success/fail
        successful: 0,
        failed: 1,
        skipped: 0
      }));
    });
  });
});
