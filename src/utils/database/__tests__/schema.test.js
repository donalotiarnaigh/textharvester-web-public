const sqlite3 = require('sqlite3').verbose();
const { initializeDatabase } = require('../schema');

describe('Database Schema Constraints', () => {
  let db;

  beforeEach(async () => {
    // Use in-memory database for testing
    db = new sqlite3.Database(':memory:');
    await initializeDatabase(db);
  });

  afterEach(() => {
    return new Promise((resolve) => {
      db.close(resolve);
    });
  });

  const insertMemorial = (data) => {
    return new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO memorials (
          memorial_number, first_name, last_name,
          year_of_death, file_name
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        data.memorial_number,
        data.first_name,
        data.last_name,
        data.year_of_death,
        data.file_name
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  };

  const getMemorial = (id) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM memorials WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  };

  describe('year_of_death constraint', () => {
    it('should accept valid years', async () => {
      const validYears = [1501, 1900, 2000, 2100];
      
      for (const year of validYears) {
        const id = await insertMemorial({
          memorial_number: 1,
          first_name: 'Test',
          last_name: 'User',
          year_of_death: year,
          file_name: 'test.jpg'
        });
        
        const stored = await getMemorial(id);
        expect(stored.year_of_death).toBe(year);
      }
    });

    it('should accept NULL year_of_death', async () => {
      const id = await insertMemorial({
        memorial_number: 1,
        first_name: 'Test',
        last_name: 'User',
        year_of_death: null,
        file_name: 'test.jpg'
      });
      
      const stored = await getMemorial(id);
      expect(stored.year_of_death).toBeNull();
    });

    it('should reject years before 1500', async () => {
      await expect(insertMemorial({
        memorial_number: 1,
        first_name: 'Test',
        last_name: 'User',
        year_of_death: 1499,
        file_name: 'test.jpg'
      })).rejects.toThrow('CHECK constraint failed');
    });

    it('should reject years after 2100', async () => {
      await expect(insertMemorial({
        memorial_number: 1,
        first_name: 'Test',
        last_name: 'User',
        year_of_death: 2101,
        file_name: 'test.jpg'
      })).rejects.toThrow('CHECK constraint failed');
    });

    it('should handle non-integer years', async () => {
      // Test floating point numbers
      await expect(insertMemorial({
        memorial_number: 1,
        first_name: 'Test',
        last_name: 'User',
        year_of_death: 1900.5,
        file_name: 'test.jpg'
      })).rejects.toThrow('CHECK constraint failed');

      // Test string numbers
      await expect(insertMemorial({
        memorial_number: 1,
        first_name: 'Test',
        last_name: 'User',
        year_of_death: '1900',
        file_name: 'test.jpg'
      })).rejects.toThrow('CHECK constraint failed');
    });
  });
}); 