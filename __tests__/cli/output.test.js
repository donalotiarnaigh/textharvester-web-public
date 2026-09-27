
// Mock fs to avoid writeSync errors
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeSync: jest.fn()
}));

const output = require('../../src/cli/output');
const fs = require('fs');

describe('CLI Output Formatter', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let processStdoutWriteSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

    // Mock stdout write to capture output for assertions
    processStdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation((str) => {
      consoleLogSpy(str);
      return true;
    });

    // Mock fs.writeSync to capture output for assertions
    fs.writeSync.mockImplementation((fd, buffer, offset, length) => {
      if (fd === 1) { // stdout
        const str = buffer.toString(undefined, offset, offset + length);
        consoleLogSpy(str);
      }
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processStdoutWriteSpy.mockRestore();
    jest.clearAllMocks(); // Clear fs mocks
  });

  describe('formatOutput', () => {
    const sampleData = {
      id: 123,
      name: 'Test Item',
      details: { active: true }
    };

    const sampleList = [
      { id: 1, name: 'Alice', role: 'Admin' },
      { id: 2, name: 'Bob', role: 'User' }
    ];

    it('should format output as JSON by default', () => {
      output.formatOutput(sampleData, 'test-command');

      expect(consoleLogSpy).toHaveBeenCalled();
      const loggedParams = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(loggedParams);

      expect(parsed).toEqual(expect.objectContaining({
        success: true,
        data: sampleData,
        metadata: expect.objectContaining({
          command: 'test-command'
        })
      }));
    });

    it('should format output as Table when specified', () => {
      // For table test, we verify string contains key headers
      output.formatOutput(sampleList, 'list', { format: 'table' });

      expect(consoleLogSpy).toHaveBeenCalled();
      const outputStr = consoleLogSpy.mock.calls[0][0];
      expect(outputStr).toContain('id');
      expect(outputStr).toContain('name');
      expect(outputStr).toContain('Alice');
      expect(outputStr).toContain('Bob');
    });

    it('should format output as CSV when specified', () => {
      output.formatOutput(sampleList, 'list', { format: 'csv' });

      expect(consoleLogSpy).toHaveBeenCalled();
      const outputStr = consoleLogSpy.mock.calls[0][0];
      // CSV should ideally have headers and comma separated values
      // Note: Implementation might vary, but simplified check:
      expect(outputStr).toMatch(/id.*name.*role/); // Header approximate
      expect(outputStr).toContain('1,Alice,Admin');
      expect(outputStr).toContain('2,Bob,User');
    });

    it('should handle circular references in JSON gracefully (unhappy path)', () => {
      const circular = { name: 'circle' };
      circular.self = circular;

      // Should not throw
      expect(() => output.formatOutput(circular, 'test')).not.toThrow();
    });
  });

  describe('formatError', () => {
    it('should format output to stderr as JSON', () => {
      const error = new Error('Something went wrong');
      output.formatError(error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedError = consoleErrorSpy.mock.calls[0][0];
      const parsed = JSON.parse(loggedError);

      expect(parsed).toEqual(expect.objectContaining({
        success: false,
        message: 'Something went wrong',
        metadata: expect.any(Object)
      }));
    });

    it('should handle custom error objects with codes', () => {
      const error = { message: 'Custom Error', code: 'CUSTOM_CODE', details: { foo: 'bar' } };
      output.formatError(error);

      const parsed = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(parsed.error_code).toBe('CUSTOM_CODE');
      expect(parsed.details).toEqual({ foo: 'bar' });
    });
  });
});
