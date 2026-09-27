/**
 * Schema Command Tests
 * Task 4.1 & 4.2 - TDD Phase
 * 
 * Tests for src/cli/commands/schema.js
 */

const { Command } = require('commander');
const schemaCommand = require('../../../src/cli/commands/schema');

// Mock Services
jest.mock('../../../src/services/SchemaGenerator', () => {
  return jest.fn().mockImplementation(() => ({
    generateSchema: jest.fn()
  }));
});

jest.mock('../../../src/services/SchemaManager', () => {
  return {
    listSchemas: jest.fn(),
    createSchema: jest.fn(),
    getSchemaByName: jest.fn()
  };
});

jest.mock('../../../src/utils/modelProviders', () => ({
  createProvider: jest.fn().mockReturnValue({})
}));

jest.mock('../../../src/cli/config', () => ({
  loadConfig: jest.fn().mockResolvedValue({
    AI_PROVIDER: 'openai',
    OPENAI_API_KEY: 'mock-key'
  })
}));

// Mock Readline
jest.mock('readline', () => ({
  createInterface: jest.fn()
}));

// Mock Glob
jest.mock('glob', () => {
  const fn = jest.fn();
  return fn;
});

// Mock Database (since it's required inside)
jest.mock('../../../src/utils/database', () => ({}), { virtual: true });


describe('Schema Command', () => {
  let program;
  let mockConsoleLog;
  let mockConsoleError;
  let mockExit;
  let mockRl;

  beforeEach(() => {
    jest.clearAllMocks();

    program = new Command();
    program.exitOverride();
    program.configureOutput({
      writeOut: () => { },
      writeErr: () => { }
    });

    program.addCommand(schemaCommand);

    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => { });
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => { });
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { });

    // Setup Readline Mock
    mockRl = {
      question: jest.fn(),
      close: jest.fn()
    };
    require('readline').createInterface.mockReturnValue(mockRl);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  describe('propose subcommand', () => {
    it('should call SchemaGenerator with correct files and create schema on yes', async () => {
      // Mock glob to return files for pattern
      require('glob').mockImplementation((...args) => {
        const cb = args[args.length - 1];
        cb(null, ['test1.jpg']);
      });

      // Mock SchemaGenerator
      const SchemaGenerator = require('../../../src/services/SchemaGenerator');
      const mockGenerate = jest.fn().mockResolvedValue({
        recommendedName: 'Test Schema',
        fields: [],
        tableName: 'custom_test'
      });
      SchemaGenerator.mockImplementation(() => ({
        generateSchema: mockGenerate
      }));

      // Mock Readline user input 'y'
      mockRl.question.mockImplementation((query, cb) => {
        cb('y');
      });

      // Mock SchemaManager
      const SchemaManager = require('../../../src/services/SchemaManager');
      const mockCreate = jest.fn().mockResolvedValue({ id: '123' });
      SchemaManager.createSchema = mockCreate;

      await runCommand(['schema', 'propose', '*.jpg']);

      expect(mockGenerate).toHaveBeenCalled();
      // We expect createSchema to be called because user said 'y'
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Test Schema'
      }));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Schema saved successfully'));
    });

    it('should NOT create schema if user says no', async () => {
      require('glob').mockImplementation((...args) => {
        const cb = args[args.length - 1];
        cb(null, ['test1.jpg']);
      });

      const SchemaGenerator = require('../../../src/services/SchemaGenerator');
      SchemaGenerator.mockImplementation(() => ({
        generateSchema: jest.fn().mockResolvedValue({
          recommendedName: 'Test Schema',
          fields: []
        })
      }));

      // Mock Readline user input 'n'
      mockRl.question.mockImplementation((query, cb) => {
        cb('n');
      });

      const SchemaManager = require('../../../src/services/SchemaManager');
      const mockCreate = jest.fn();
      SchemaManager.createSchema = mockCreate;

      await runCommand(['schema', 'propose', '*.jpg']);

      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Schema discarded'));
    });

    it('should fail if no files provided', async () => {
      // Mock glob returning empty
      // Mock glob returning empty
      require('glob').mockImplementation((...args) => {
        const cb = args[args.length - 1];
        cb(null, []);
      });

      await runCommand(['schema', 'propose', '*.jpg']);

      // Should catch error and print to console or exit
      // Our implementation throws, catches, and calls formatError + process.exit(1)
      // formatError usually logs to console.error
      // process.exit is mocked.

      // We can check if exit was called
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('list subcommand', () => {
    it('should list schemas from SchemaManager', async () => {
      const SchemaManager = require('../../../src/services/SchemaManager');
      const mockList = jest.fn().mockResolvedValue([
        { id: '1', name: 'Census', table_name: 'custom_census', created_at: '2025-01-01' }
      ]);
      SchemaManager.listSchemas = mockList;

      // Mock console.table if needed, usually it just logs to stdout
      const mockTable = jest.spyOn(console, 'table').mockImplementation(() => { });

      await runCommand(['schema', 'list']);

      expect(mockList).toHaveBeenCalled();
      expect(mockTable).toHaveBeenCalled();

      mockTable.mockRestore();
    });
  });
});
