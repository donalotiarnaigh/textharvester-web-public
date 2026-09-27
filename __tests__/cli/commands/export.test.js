/**
 * Export Command Tests
 * Task 9.1 - TDD RED Phase
 * 
 * Tests for src/cli/commands/export.js
 */

const { Command } = require('commander');
const exportCommand = require('../../../src/cli/commands/export');
const { CLIError } = require('../../../src/cli/errors');

// Mock ExportService
jest.mock('../../../src/services/ExportService', () => {
  return jest.fn().mockImplementation(() => ({
    export: jest.fn()
  }));
});

describe('Export Command', () => {
  let program;
  let mockConsoleError;
  let mockStdoutWrite;
  let mockExportMethod;

  beforeEach(() => {
    jest.clearAllMocks();

    program = new Command();
    program.exitOverride();
    program.configureOutput({
      writeOut: () => { },
      writeErr: () => { }
    });

    program.addCommand(exportCommand);

    jest.spyOn(console, 'log').mockImplementation(() => { });
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => { });
    jest.spyOn(process, 'exit').mockImplementation(() => { });
    mockStdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => { }); // Added this line

    // Setup Service Mocks
    const ExportServiceClass = require('../../../src/services/ExportService');
    mockExportMethod = jest.fn();

    ExportServiceClass.mockImplementation(() => ({
      export: mockExportMethod
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

  describe('Happy Path', () => {
    it('should call ExportService.export with default options', async () => {
      mockExportMethod.mockResolvedValue({ exported: 5, format: 'json', data: '[]' });

      await runCommand(['export']);

      expect(mockExportMethod).toHaveBeenCalledWith(expect.objectContaining({
        format: 'json'
      }));

      expect(mockStdoutWrite).toHaveBeenCalledWith('[]');
    });

    it('should pass destination and force flag', async () => {
      mockExportMethod.mockResolvedValue({ exported: 1, destination: './out.json' });

      await runCommand(['export', '-d', './out.json', '--force']);

      expect(mockExportMethod).toHaveBeenCalledWith(expect.objectContaining({
        destination: './out.json',
        force: true
      }));
    });

    it('should pass csv format', async () => {
      mockExportMethod.mockResolvedValue({ exported: 1, format: 'csv' });

      await runCommand(['export', '-f', 'csv']);

      expect(mockExportMethod).toHaveBeenCalledWith(expect.objectContaining({
        format: 'csv'
      }));
    });
  });

  describe('Unhappy Path', () => {
    it('should handle service errors (e.g. invalid format)', async () => {
      const error = new CLIError('INVALID_FORMAT', 'Invalid format');
      mockExportMethod.mockRejectedValue(error);

      await runCommand(['export', '-f', 'yaml']);

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('INVALID_FORMAT'));
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should handle file exists error', async () => {
      const error = new CLIError('FILE_EXISTS', 'File exists');
      mockExportMethod.mockRejectedValue(error);

      await runCommand(['export', '-d', './existing.json']);

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('FILE_EXISTS'));
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });
});
