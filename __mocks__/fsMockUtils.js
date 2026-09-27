import fs from 'fs';

/**
 * Reset all fs mock implementations to their defaults
 */
export function resetFsMocks() {
  // Reset sync functions
  fs.existsSync.mockReset().mockReturnValue(true);
  fs.mkdirSync.mockReset();
  fs.writeFileSync.mockReset();
  fs.unlinkSync.mockReset();
  fs.readFileSync.mockReset().mockReturnValue('mock file content');

  // Reset async functions
  fs.readFile.mockReset().mockImplementation((path, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
    }
    process.nextTick(() => {
      callback(null, 'mock file content');
    });
  });

  fs.writeFile.mockReset().mockImplementation((path, data, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
    }
    process.nextTick(() => {
      callback(null);
    });
  });

  // Reset promises
  fs.promises.readFile.mockReset().mockResolvedValue('mock file content');
  fs.promises.writeFile.mockReset().mockResolvedValue(undefined);
  fs.promises.unlink.mockReset().mockResolvedValue(undefined);
  fs.promises.mkdir.mockReset().mockResolvedValue(undefined);
}

/**
 * Set up fs mocks to simulate a file not found error
 * @param {string} targetFile - The specific file path to trigger the error for
 */
export function mockFileNotFound(targetFile) {
  const error = new Error(`ENOENT: no such file or directory, open '${targetFile}'`);
  error.code = 'ENOENT';

  fs.existsSync.mockImplementation((path) => path !== targetFile);
  fs.readFile.mockImplementation((path, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
    }
    process.nextTick(() => {
      if (path === targetFile) {
        callback(error);
      } else {
        callback(null, 'mock file content');
      }
    });
  });
  fs.promises.readFile.mockImplementation((path) => {
    if (path === targetFile) {
      return Promise.reject(error);
    }
    return Promise.resolve('mock file content');
  });
}

/**
 * Set up fs mocks to simulate a permission denied error
 * @param {string} targetFile - The specific file path to trigger the error for
 */
export function mockPermissionDenied(targetFile) {
  const error = new Error(`EACCES: permission denied, access '${targetFile}'`);
  error.code = 'EACCES';

  fs.existsSync.mockImplementation(() => true);
  fs.writeFile.mockImplementation((path, data, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
    }
    process.nextTick(() => {
      if (path === targetFile) {
        callback(error);
      } else {
        callback(null);
      }
    });
  });
  fs.promises.writeFile.mockImplementation((path) => {
    if (path === targetFile) {
      return Promise.reject(error);
    }
    return Promise.resolve();
  });
}

/**
 * Mock file content for specific files
 * @param {Object} fileContents - Map of file paths to their contents
 */
export function mockFileContents(fileContents) {
  fs.readFile.mockImplementation((path, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
    }
    process.nextTick(() => {
      const content = fileContents[path];
      if (content !== undefined) {
        callback(null, content);
      } else {
        callback(null, 'mock file content');
      }
    });
  });

  fs.promises.readFile.mockImplementation((path) => {
    const content = fileContents[path];
    if (content !== undefined) {
      return Promise.resolve(content);
    }
    return Promise.resolve('mock file content');
  });

  fs.readFileSync.mockImplementation((path) => {
    const content = fileContents[path];
    if (content !== undefined) {
      return content;
    }
    return 'mock file content';
  });
} 