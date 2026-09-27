/**
 * Tests for getMemorialsBySiteCode function
 * Task 1.3: Write tests for Results filtering
 * Requirements: 3.2, 3.6
 */

// Store original mockAll implementation to restore between tests
let mockAllImpl;

const mockRun = jest.fn(function (sql, params, cb) {
  if (typeof cb === 'function') {
    cb.call({ lastID: 123 }, null);
  } else if (typeof params === 'function') {
    params.call({ lastID: 123 }, null);
  }
});

// Default mockAll handles both (sql, callback) and (sql, params, callback) signatures
const mockAll = jest.fn((sql, paramsOrCb, maybeCb) => {
  // If a custom implementation is set, use it for non-initialization calls
  if (mockAllImpl && !sql.includes('PRAGMA')) {
    return mockAllImpl(sql, paramsOrCb, maybeCb);
  }

  // Default behavior for initialization - return empty array
  const callback = typeof maybeCb === 'function' ? maybeCb : paramsOrCb;
  if (typeof callback === 'function') {
    callback(null, []);
  }
});

const mockGet = jest.fn();
const mockDatabase = jest.fn(() => ({
  run: mockRun,
  all: mockAll,
  get: mockGet,
  close: jest.fn()
}));

// Mock sqlite3 before requiring the database module
jest.mock('sqlite3', () => ({
  verbose: () => ({
    Database: mockDatabase
  })
}));

// Mock logger to suppress output
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debugPayload: jest.fn()
}));

describe('getMemorialsBySiteCode', () => {
  let getMemorialsBySiteCode;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockAllImpl = null; // Reset custom implementation

    // Re-require to get fresh instance using the mock
    const dbModule = require('../../src/utils/database');
    getMemorialsBySiteCode = dbModule.getMemorialsBySiteCode;
  });

  describe('Happy Path', () => {
    test('should return only records matching the site_code (Req 3.2)', async () => {
      // Arrange: Mock database to return filtered results
      const mockRecords = [
        { id: 1, memorial_number: 'CORK001', site_code: 'cork', first_name: 'John' },
        { id: 2, memorial_number: 'CORK002', site_code: 'cork', first_name: 'Jane' }
      ];

      // Set custom implementation AFTER module init
      mockAllImpl = (sql, paramsOrCb, maybeCb) => {
        const callback = typeof maybeCb === 'function' ? maybeCb : paramsOrCb;
        const _params = typeof maybeCb === 'function' ? paramsOrCb : [];
        callback(null, mockRecords);
      };

      // Act
      const results = await getMemorialsBySiteCode('cork');

      // Assert
      expect(results).toEqual(mockRecords);
      expect(results).toHaveLength(2);

      // Verify the SQL includes WHERE clause with site_code
      const sqlCalls = mockAll.mock.calls.filter(c => c[0].includes('SELECT'));
      expect(sqlCalls.length).toBeGreaterThan(0);
      const lastCall = sqlCalls[sqlCalls.length - 1];
      expect(lastCall[0]).toContain('WHERE');
      expect(lastCall[0]).toContain('site_code');
    });
  });

  describe('Unhappy Path', () => {
    test('should return empty array for non-existent site_code (Req 3.6)', async () => {
      // Arrange: Mock database to return empty results
      mockAllImpl = (sql, paramsOrCb, maybeCb) => {
        const callback = typeof maybeCb === 'function' ? maybeCb : paramsOrCb;
        callback(null, []);
      };

      // Act
      const results = await getMemorialsBySiteCode('nonexistent');

      // Assert
      expect(results).toEqual([]);
      expect(results).toHaveLength(0);
    });

    test('should handle database errors gracefully', async () => {
      // Arrange: Mock database to return an error
      const dbError = new Error('Database connection failed');
      mockAllImpl = (sql, paramsOrCb, maybeCb) => {
        const callback = typeof maybeCb === 'function' ? maybeCb : paramsOrCb;
        callback(dbError, null);
      };

      // Act & Assert
      await expect(getMemorialsBySiteCode('cork')).rejects.toThrow('Database connection failed');
    });
  });

  describe('Edge Cases', () => {
    test('should handle null/undefined site_code by returning empty array', async () => {
      // Arrange
      mockAllImpl = (sql, paramsOrCb, maybeCb) => {
        const callback = typeof maybeCb === 'function' ? maybeCb : paramsOrCb;
        callback(null, []);
      };

      // Act
      const results = await getMemorialsBySiteCode(null);

      // Assert: Should return empty, not all records (defensive behavior)
      expect(results).toEqual([]);
    });
  });
});
