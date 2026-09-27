/**
 * Ingest Command Tests
 * Task 7.1 - TDD RED Phase
 * 
 * Tests for src/cli/commands/ingest.js
 */


// Mock fs to avoid writeSync errors
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeSync: jest.fn(),
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}));

const fs = require('fs');
const { Command } = require('commander');
const ingestCommand = require('../../../src/cli/commands/ingest');
const { CLIError } = require('../../../src/cli/errors');

// Mock IngestService
// Mock IngestService
jest.mock('../../../src/services/IngestService', () => {
  return jest.fn().mockImplementation(() => ({
    ingest: jest.fn()
  }));
});

describe('Ingest Command', () => {
  let program;
  let mockConsoleLog;
  let mockIngestMethod;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup Commander program
    program = new Command();
    program.exitOverride(); // Prevent process.exit from killing tests
    program.configureOutput({
      writeOut: () => { }, // Silence output
      writeErr: () => { }
    });

    program.addCommand(ingestCommand);

    // Mock console.log to capture output
    // Mock console.log to capture output
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => { });
    jest.spyOn(console, 'error').mockImplementation(() => { });
    jest.spyOn(process, 'exit').mockImplementation(() => { });

    // Mock stdout write to capture output for assertions
    jest.spyOn(process.stdout, 'write').mockImplementation((str) => {
      mockConsoleLog(str); // Redirect to console.log spy for existing assertions
      return true;
    });

    // Mock fs.writeSync to capture output for assertions
    fs.writeSync.mockImplementation((fd, buffer, offset, length) => {
      if (fd === 1) { // stdout
        const str = buffer.toString(undefined, offset, offset + length);
        mockConsoleLog(str);
      }
    });

    // Setup Service Mocks
    // Note: We need to get the mock instance that will be created
    // Since we mocked the constructor, we can access calls to it, 
    // but for the command which instantiates internally, we rely on the mock definition above.
    // To interact with the specific instance method, we need to ensure the command uses our mock.
    // However, require cache might be an issue if the command requires the service at top level.
    // Let's assume dependency injection or that the mock replaces the module globally.

    // In this implementation, we will mock the module so that any new IngestService() 
    // returns our object with user-controllable spies.

    // Re-acquire the mock to set up return values for this test
    // Re-acquire the mock to set up return values for this test
    const IngestServiceClass = require('../../../src/services/IngestService');
    mockIngestMethod = jest.fn();
    IngestServiceClass.mockImplementation(() => ({
      ingest: mockIngestMethod
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
       * Helper to run the command
       */
  const runCommand = async (args) => {
    try {
      await program.parseAsync(args, { from: 'user' });
    } catch (err) {
      // unexpected error or exitOverride
      if (err.code !== 'commander.exit') {
        throw err;
      }
    }
  };

  describe('Happy Path', () => {
    it('should call IngestService with correct options', async () => {
      // Setup success response
      mockIngestMethod.mockResolvedValue({
        success: true,
        total: 1,
        successful: 1,
        failures: []
      });

      await runCommand(['ingest', 'scans/*.jpg', '--source-type', 'burial_register', '--provider', 'anthropic']);

      // Verify Service was instantiated
      // Verify Service was instantiated
      expect(require('../../../src/services/IngestService')).toHaveBeenCalled();

      // Verify ingest was called with correct args
      expect(mockIngestMethod).toHaveBeenCalledWith('scans/*.jpg', expect.objectContaining({
        sourceType: 'burial_register',
        provider: 'anthropic',
        // default batch size
        batchSize: 3
      }));

      // Verify success output
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"success": true'));
    });

    it('should respect custom batch size', async () => {
      mockIngestMethod.mockResolvedValue({ success: true });

      await runCommand(['ingest', 'test.jpg', '-b', '10']);

      expect(mockIngestMethod).toHaveBeenCalledWith('test.jpg', expect.objectContaining({
        batchSize: 10
      }));
    });
  });

  describe('Unhappy Path', () => {
    it('should handle service errors gracefully', async () => {
      // Mock service failure
      const error = new CLIError('NO_FILES_MATCHED', 'No files matched pattern');
      mockIngestMethod.mockRejectedValue(error);

      // We expect process.exit(1) to be called by our error handler
      // But since we mocked it, it won't actually exit.
      // We just verify the error output.

      // Note: The current placeholder implementation in ingest.js just exits 1 immediately.
      // So this test will "pass" regarding exit code but fail regarding output until implemented.

      await runCommand(['ingest', '*.png']);

      // In real implementation, this should output error JSON
      // For TDD, we expect this to fail or hit the placeholder behavior
      // We want to assert that eventually it logs the error
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('NO_FILES_MATCHED'));
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('Dynamic Schema Options', () => {
    it('should pass schema ID/Name to IngestService when --schema is used', async () => {
      mockIngestMethod.mockResolvedValue({ success: true });

      await runCommand(['ingest', 'doc.jpg', '--schema', 'Census Records']);

      expect(mockIngestMethod).toHaveBeenCalledWith('doc.jpg', expect.objectContaining({
        schemaId: 'Census Records'
      }));
    });
  });
});
