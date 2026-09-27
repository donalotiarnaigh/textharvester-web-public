const { db, initializeCustomSchemasTable } = require('../../src/utils/database');

describe('Database Schema Initialization', () => {
  test('initializeCustomSchemasTable should execute correct CREATE TABLE SQL', () => {
    // Spy on the relevant db method
    const runSpy = jest.spyOn(db, 'run');

    // Verify the function exists and is exported
    if (typeof initializeCustomSchemasTable !== 'function') {
      throw new Error('initializeCustomSchemasTable is not exported from database.js');
    }

    // Execute the function
    initializeCustomSchemasTable();

    const expectedSQL = `
    CREATE TABLE IF NOT EXISTS custom_schemas (
      id TEXT PRIMARY KEY,
      version INTEGER DEFAULT 1,
      name TEXT UNIQUE NOT NULL,
      table_name TEXT UNIQUE NOT NULL,
      json_schema TEXT NOT NULL,
      system_prompt TEXT,
      user_prompt_template TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

    // Verify call
    const normalize = (str) => str.replace(/\s+/g, ' ').trim();
    const wasCalled = runSpy.mock.calls.some(call => normalize(call[0]) === normalize(expectedSQL));

    // Print usage for debugging if it failed
    if (!wasCalled) {
      console.log('Actual calls:', runSpy.mock.calls.map(c => c[0]));
    }

    expect(wasCalled).toBe(true);
  });
});
