// Create mock functions
const existsSync = jest.fn().mockReturnValue(true);
const mkdirSync = jest.fn();
const writeFileSync = jest.fn();
const unlinkSync = jest.fn();
const readFileSync = jest.fn().mockReturnValue('{"test": "mock data"}');

// For async operations
const readFile = jest.fn();
const writeFile = jest.fn();
const unlink = jest.fn();
const mkdir = jest.fn();

// Create promises version
const promises = {
  readFile: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
  mkdir: jest.fn()
};

// Default implementations
readFile.mockImplementation((path, options, callback) => {
  if (typeof options === 'function') {
    callback = options;
  }
  process.nextTick(() => {
    callback(null, '{"test": "mock data"}');
  });
});

writeFile.mockImplementation((path, data, options, callback) => {
  if (typeof options === 'function') {
    callback = options;
  }
  process.nextTick(() => {
    callback(null);
  });
});

promises.readFile.mockResolvedValue('{"test": "mock data"}');
promises.writeFile.mockResolvedValue(undefined);
promises.unlink.mockResolvedValue(undefined);
promises.mkdir.mockResolvedValue(undefined);

// Export all mock functions
module.exports = {
  existsSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
  readFileSync,
  readFile,
  writeFile,
  unlink,
  mkdir,
  promises,
  // Add constants that might be used
  constants: {
    F_OK: 0,
    W_OK: 2,
    R_OK: 4,
    O_CREAT: 64,
    O_EXCL: 128,
    O_RDONLY: 0,
    O_RDWR: 2,
    O_SYNC: 128,
    O_WRONLY: 1,
  }
};
