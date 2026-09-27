const { configureLogger } = require('../../src/cli/logger');
const { CLIError } = require('../../src/cli/errors');

describe('CLI Logger Configuration', () => {
  let mockLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = {
      setVerboseMode: jest.fn(),
      updateSamplingRates: jest.fn(),
      setQuietMode: jest.fn(),
      info: jest.fn(),
      warn: jest.fn()
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('configureLogger', () => {
    it('should enable verbose mode when verbose flag is set', () => {
      configureLogger({ verbose: 1 }, mockLogger);
      expect(mockLogger.setVerboseMode).toHaveBeenCalledWith(true);
    });

    it('should set higher verbosity/debug when verbose >= 2', () => {
      // Currently logger.js only has boolean verbose mode.
      // We'll verify it sets verbose mode true for now.
      // Future enhancement might support log levels.
      configureLogger({ verbose: 2 }, mockLogger);
      expect(mockLogger.setVerboseMode).toHaveBeenCalledWith(true);
    });

    it('should enable API payload logging when debug-api is set', () => {
      configureLogger({ debugApi: true }, mockLogger);

      expect(mockLogger.updateSamplingRates).toHaveBeenCalledWith(expect.objectContaining({
        payloadLogging: 1.0
      }));
    });

    it('should handle quiet mode', () => {
      // Check conflict logic
      expect(() => {
        configureLogger({ verbose: 1, quiet: true }, mockLogger);
      }).toThrow(CLIError);

      // Check enabling quiet mode
      configureLogger({ quiet: true }, mockLogger);
      expect(mockLogger.setQuietMode).toHaveBeenCalledWith(true);
    });
  });
});
