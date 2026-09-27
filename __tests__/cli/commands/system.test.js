/**
 * System Command Tests
 * Task 10.1 - TDD RED Phase
 * 
 * Tests for src/cli/commands/system.js
 */


// Mock fs to avoid writeSync errors
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeSync: jest.fn(),
  existsSync: jest.fn()
}));

const fs = require('fs');
const { Command } = require('commander');
const systemCommand = require('../../../src/cli/commands/system');
const { CLIError } = require('../../../src/cli/errors');

// Mock SystemService
jest.mock('../../../src/services/SystemService', () => {
  return jest.fn().mockImplementation(() => ({
    initDb: jest.fn(),
    getStatus: jest.fn(),
    clearQueue: jest.fn(),
    getCostSummary: jest.fn()
  }));
});

describe('System Command', () => {
  let program;
  let mockConsoleLog;
  let mockConsoleError;
  let mockInitDb;
  let mockGetStatus;
  let mockClearQueue;
  let mockGetCostSummary;

  beforeEach(() => {
    jest.clearAllMocks();

    program = new Command();
    program.exitOverride();
    program.configureOutput({
      writeOut: () => { },
      writeErr: () => { }
    });

    program.addCommand(systemCommand);

    // Mock console.log to capture output
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => { });
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => { });
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
    const SystemServiceClass = require('../../../src/services/SystemService');
    mockInitDb = jest.fn();
    mockGetStatus = jest.fn();
    mockClearQueue = jest.fn();

    mockGetCostSummary = jest.fn();

    SystemServiceClass.mockImplementation(() => ({
      initDb: mockInitDb,
      getStatus: mockGetStatus,
      clearQueue: mockClearQueue,
      getCostSummary: mockGetCostSummary
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const runCommand = async (args) => {
    try {
      await program.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (err.code !== 'commander.exit') {
        throw err;
      }
    }
  };

  describe('init-db subcommand', () => {
    it('should call SystemService.initDb', async () => {
      mockInitDb.mockResolvedValue({ success: true, message: 'DB initialized' });

      await runCommand(['system', 'init-db']);

      expect(mockInitDb).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"success": true'));
    });
  });

  describe('status subcommand', () => {
    it('should call SystemService.getStatus', async () => {
      mockGetStatus.mockResolvedValue({ database: {}, queue: {} });

      await runCommand(['system', 'status']);

      expect(mockGetStatus).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"success": true'));
    });
  });

  describe('clear-queue subcommand', () => {
    it('should call SystemService.clearQueue with confirm=true when flag is present', async () => {
      mockClearQueue.mockResolvedValue({ success: true, cleared_count: 5 });

      await runCommand(['system', 'clear-queue', '--confirm']);

      expect(mockClearQueue).toHaveBeenCalledWith(true);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"success": true'));
    });

    it('should call SystemService.clearQueue with undefined/false when flag is missing', async () => {
      // The service throws if confirm is missing, so we mock rejection or check arguments
      // If the command simply passes options, it passes undefined/false.
      // Let's mock a rejection to simulate service behavior
      const error = new CLIError('CONFIRMATION_REQUIRED', 'Confirmation required');
      mockClearQueue.mockRejectedValue(error);

      await runCommand(['system', 'clear-queue']);

      expect(mockClearQueue).toHaveBeenCalledWith(undefined); // or expect.anything() if we don't care about exact value, but we do care it wasn't true
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('CONFIRMATION_REQUIRED'));
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('cost subcommand', () => {
    it('should call SystemService.getCostSummary and output results', async () => {
      mockGetCostSummary.mockResolvedValue({
        rows: [
          { provider: 'openai',    records: 5, input_tokens: 1000, output_tokens: 500, estimated_cost_usd: 0.005 },
          { provider: 'anthropic', records: 3, input_tokens: 600,  output_tokens: 300, estimated_cost_usd: 0.003 }
        ],
        total: { provider: 'total', records: 8, input_tokens: 1600, output_tokens: 800, estimated_cost_usd: 0.008 }
      });

      await runCommand(['system', 'cost']);

      expect(mockGetCostSummary).toHaveBeenCalled();
      // Expect JSON output includes provider names and total
      const output = mockConsoleLog.mock.calls.flat().join('');
      expect(output).toContain('openai');
      expect(output).toContain('anthropic');
    });

    it('should pass --from, --to, and --provider options to getCostSummary', async () => {
      mockGetCostSummary.mockResolvedValue({ rows: [], total: { records: 0, input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 } });

      await runCommand(['system', 'cost', '--from', '2026-01-01', '--to', '2026-03-01', '--provider', 'openai']);

      expect(mockGetCostSummary).toHaveBeenCalledWith(expect.objectContaining({
        from: '2026-01-01',
        to:   '2026-03-01',
        provider: 'openai'
      }));
    });
  });

  describe('Unhappy Path', () => {
    it('should handle service errors', async () => {
      const error = new CLIError('DATABASE_ERROR', 'Init failed');
      mockInitDb.mockRejectedValue(error);

      await runCommand(['system', 'init-db']);

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('DATABASE_ERROR'));
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });
});
