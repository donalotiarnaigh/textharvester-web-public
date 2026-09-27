const dbUtils = require('../utils');

// No logs expected in these tests
// jest.mock('../../logger');

describe('Database Utility Functions', () => {
  let db;
  let mockDb;

  beforeEach(() => {
    // Create mock database methods
    mockDb = {
      run: jest.fn((query, params, callback) => {
        if (typeof callback === 'function') {
          callback.call({ lastID: 1 }, null);
        }
      }),
      all: jest.fn((query, params, callback) => {
        if (query.includes('COUNT')) {
          callback(null, [{ count: 1 }]);
        } else {
          callback(null, [
            {
              id: 1,
              memorial_number: 42,
              first_name: 'John',
              last_name: 'Doe',
              year_of_death: 1923,
              inscription: 'Test inscription',
              file_name: 'test.jpg',
              processed_date: '2024-03-20T10:00:00.000Z'
            }
          ]);
        }
      })
    };

    // Use mock for tests
    db = mockDb;
  });

  describe('storeMemorial', () => {
    it('should store memorial data correctly', async () => {
      const testData = {
        memorial_number: 42,
        first_name: 'John',
        last_name: 'Doe',
        year_of_death: 1923,
        inscription: 'Test inscription',
        file_name: 'test.jpg'
      };

      const id = await dbUtils.storeMemorial(db, testData);
      expect(id).toBe(1);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO memorials'),
        expect.arrayContaining([
          42,
          'John',
          'Doe',
          1923,
          'Test inscription',
          'test.jpg'
        ]),
        expect.any(Function)
      );
    });

    it('should handle null values', async () => {
      const testData = {
        file_name: 'test.jpg'
      };

      const id = await dbUtils.storeMemorial(db, testData);
      expect(id).toBe(1);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO memorials'),
        expect.arrayContaining([
          null,
          null,
          null,
          null,
          null,
          'test.jpg'
        ]),
        expect.any(Function)
      );
    });

    it('should reject if file_name is missing', async () => {
      const testData = {
        memorial_number: 42
      };

      await expect(dbUtils.storeMemorial(db, testData))
        .rejects
        .toThrow('NOT NULL constraint failed: file_name');
    });
  });

  describe('getAllMemorials', () => {
    it('should return all memorials with proper types', async () => {
      const memorials = await dbUtils.getAllMemorials(db);
      expect(memorials).toHaveLength(1);
      expect(memorials[0]).toEqual({
        id: 1,
        memorial_number: 42,
        first_name: 'John',
        last_name: 'Doe',
        year_of_death: 1923,
        inscription: 'Test inscription',
        file_name: 'test.jpg',
        processed_date: '2024-03-20T10:00:00.000Z'
      });
      expect(mockDb.all).toHaveBeenCalledWith(
        'SELECT * FROM memorials ORDER BY processed_date DESC',
        [],
        expect.any(Function)
      );
    });

    it('should order results by processed_date DESC', async () => {
      await dbUtils.getAllMemorials(db);
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY processed_date DESC'),
        [],
        expect.any(Function)
      );
    });
  });

  describe('clearAllMemorials', () => {
    it('should remove all records from the database', async () => {
      // Get initial count
      const initialCount = await new Promise((resolve, reject) => {
        db.all('SELECT COUNT(*) as count FROM memorials', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows[0].count);
        });
      });
      expect(initialCount).toBe(1);

      // Clear data
      await dbUtils.clearAllMemorials(db);

      // Verify deletion
      expect(mockDb.run).toHaveBeenCalledWith(
        'DELETE FROM memorials',
        [],
        expect.any(Function)
      );
    });
  });
}); 