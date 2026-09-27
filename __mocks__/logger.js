// Mock logger for tests
const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
  trackMetrics: jest.fn(),
  getAnalytics: jest.fn().mockReturnValue({
    errorPatterns: [],
    metrics: {
      processingTimes: [],
      successCount: 0,
      failureCount: 0,
      totalFiles: 0,
      averageProcessingTime: 0,
      successRate: 0
    }
  }),
  _writeToLog: jest.fn(),
  _trackErrorPattern: jest.fn(),
  _getErrorPattern: jest.fn()
};

module.exports = logger; 