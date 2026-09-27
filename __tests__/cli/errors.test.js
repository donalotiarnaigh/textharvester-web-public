const { CLIError } = require('../../src/cli/errors');

describe('CLIError', () => {
  it('should be an instance of Error', () => {
    const error = new CLIError('CODE', 'message');
    expect(error).toBeInstanceOf(Error);
  });

  it('should store code, message, and details', () => {
    const details = { foo: 'bar' };
    const error = new CLIError('TEST_ERROR', 'Something bad', details);

    expect(error.code).toBe('TEST_ERROR');
    expect(error.message).toBe('Something bad');
    expect(error.details).toEqual(details);
  });

  it('should default details to empty object', () => {
    const error = new CLIError('CODE', 'message');
    expect(error.details).toEqual({});
  });

  it('should serialize to JSON correctly via toJSON()', () => {
    const error = new CLIError('ERR_CODE', 'My Error', { val: 1 });
    const json = error.toJSON();

    expect(json).toEqual(expect.objectContaining({
      success: false,
      error_code: 'ERR_CODE',
      message: 'My Error',
      details: { val: 1 },
      metadata: expect.any(Object)
    }));

    expect(json.metadata.timestamp).toBeDefined();
  });
});
