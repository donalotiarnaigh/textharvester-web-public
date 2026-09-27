// Mock SQLite3 implementation
class Database {
  constructor() {
    this.data = [];
    this.lastId = 0;
  }

  serialize(fn) {
    fn();
  }

  all(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }

    try {
      // Handle PRAGMA table_info - return mock column info
      if (sql.includes('PRAGMA table_info')) {
        // Return mock columns including site_code to indicate migration is done
        callback(null, [
          { name: 'id' },
          { name: 'file_name' },
          { name: 'site_code' },
          { name: 'inscription' },
          { name: 'processed_date' }
        ]);
        return;
      }

      // Handle SELECT queries - return all matching records
      if (sql.includes('SELECT')) {
        if (sql.includes('WHERE site_code = ?')) {
          const filtered = this.data.filter(r => r.site_code === params[0]);
          callback(null, filtered);
          return;
        }
        // Default to returning all data
        callback(null, this.data);
        return;
      }

      // Default empty result
      callback(null, []);
    } catch (error) {
      callback(error);
    }
  }

  get(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }

    try {
      if (sql.includes('WHERE id = ?')) {
        const record = this.data.find(r => r.id === params[0]);
        callback(null, record);
        return;
      }

      // Default to first record
      callback(null, this.data[0]);
    } catch (error) {
      callback(error);
    }
  }

  run(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }

    // Handle CREATE TABLE
    if (sql.includes('CREATE TABLE')) {
      if (callback) callback.call(null);
      return;
    }

    // Handle DROP TABLE
    if (sql.includes('DROP TABLE')) {
      this.data = [];
      if (callback) callback.call(null);
      return;
    }

    // Handle CREATE INDEX
    if (sql.includes('CREATE INDEX')) {
      if (callback) callback.call(null);
      return;
    }

    // Handle INSERT
    if (sql.includes('INSERT INTO memorials')) {
      try {
        // Extract column names from SQL, handling multi-line SQL
        const sqlNoNewlines = sql.replace(/\s+/g, ' ');
        const columnMatch = sqlNoNewlines.match(/\((.*?)\)\s+VALUES/);
        if (!columnMatch) {
          throw new Error('Invalid INSERT statement format');
        }
        const columns = columnMatch[1].split(',').map(c => c.trim());

        // Create record object from params
        const record = {};
        columns.forEach((col, index) => {
          record[col] = params[index];
        });

        // Validate NOT NULL constraint for file_name
        if (!record.file_name) {
          const error = new Error('SQLITE_CONSTRAINT: NOT NULL constraint failed: file_name');
          if (callback) callback.call(null, error);
          return;
        }

        // Validate year_of_death constraint
        if (record.year_of_death !== null) {
          // Check if it's an integer
          if (!Number.isInteger(record.year_of_death)) {
            const error = new Error('CHECK constraint failed: valid_year');
            if (callback) callback.call(null, error);
            return;
          }

          // Check range
          if (record.year_of_death <= 1500 || record.year_of_death > 2100) {
            const error = new Error('CHECK constraint failed: valid_year');
            if (callback) callback.call(null, error);
            return;
          }
        }

        // Add metadata
        this.lastId++;
        record.id = this.lastId;
        record.processed_date = new Date().toISOString();

        // Store record
        this.data.push(record);
        if (callback) callback.call({ lastID: this.lastId });
      } catch (error) {
        if (callback) callback.call(null, error);
      }
      return;
    }

    // Handle SELECT
    if (sql.includes('SELECT')) {
      try {
        // Simple WHERE id = ? handler
        if (sql.includes('WHERE id = ?')) {
          const record = this.data.find(r => r.id === params[0]);
          if (callback) callback.call(null, null, record);
          return;
        }

        // Default to return all records
        if (callback) callback.call(null, null, this.data);
      } catch (error) {
        if (callback) callback.call(null, error);
      }
      return;
    }

    // Default callback for unhandled queries
    if (callback) callback.call({ lastID: null });
  }

  close(callback) {
    if (callback) callback();
  }
}

module.exports = {
  verbose: () => ({
    Database
  })
}; 