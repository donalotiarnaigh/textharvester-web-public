module.exports = {
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    printf: jest.fn(),
    colorize: jest.fn().mockReturnValue({ transform: jest.fn() }),
    errors: jest.fn().mockReturnValue({ transform: jest.fn() }),
    simple: jest.fn().mockReturnValue({ transform: jest.fn() })
  },
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    add: jest.fn()
  }),
  transports: {
    File: jest.fn(),
    Console: jest.fn()
  }
}; 