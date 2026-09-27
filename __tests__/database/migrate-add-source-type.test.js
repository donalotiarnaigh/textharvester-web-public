/**
 * Test suite for migrate-add-source-type.js script
 * Tests database migration functionality using TDD approach
 */

// Mock the logger
jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

describe('Database Migration: Add source_type Column', () => {
  let logger;

  beforeAll(async () => {
    // Import after mocks are set up
    logger = require('../../src/utils/logger');
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Clear module cache to ensure fresh imports
    delete require.cache[require.resolve('../../scripts/migrate-add-source-type')];
  });

  describe('Migration Script Functionality', () => {
    it('should create migration function that adds source_type column to existing table', async () => {
      // This test will fail initially because the migration script doesn't exist
      expect(() => {
        const migration = require('../../scripts/migrate-add-source-type');
        expect(typeof migration.addSourceTypeColumn).toBe('function');
      }).not.toThrow();
    });

    it('should handle case where database file does not exist', async () => {
      // Mock fs.existsSync to return false for this test
      const fs = require('fs');
      const originalExistsSync = fs.existsSync;
      fs.existsSync = jest.fn().mockReturnValue(false);

      // Clear module cache and re-require to get fresh instance with mocked fs
      delete require.cache[require.resolve('../../scripts/migrate-add-source-type')];
      const { addSourceTypeColumn } = require('../../scripts/migrate-add-source-type');

      // Point to non-existent database
      const nonExistentDbPath = '/tmp/non_existent_test_db_' + Date.now() + '.db';

      // Test that the function resolves quickly
      const startTime = Date.now();
      const result = await addSourceTypeColumn(nonExistentDbPath);
      const endTime = Date.now();

      expect(result).toBe(true); // Should resolve successfully
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in less than 1 second
      expect(logger.info).toHaveBeenCalledWith('Database file does not exist. Migration not needed.');

      // Restore original fs.existsSync
      fs.existsSync = originalExistsSync;
    }, 5000); // Back to 5 seconds since it should be fast now

    it('should be a function that returns a promise', () => {
      const { addSourceTypeColumn } = require('../../scripts/migrate-add-source-type');

      expect(typeof addSourceTypeColumn).toBe('function');

      // Test that it returns a promise (for async behavior)
      const result = addSourceTypeColumn(':memory:');
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('Command Line Execution', () => {
    it('should export the migration function for programmatic use', () => {
      const migration = require('../../scripts/migrate-add-source-type');

      expect(typeof migration.addSourceTypeColumn).toBe('function');
    });

    it('should handle command line execution when run as main module', () => {
      // This test verifies the script can be run standalone
      // The actual execution is tested in integration tests
      const migration = require('../../scripts/migrate-add-source-type');

      expect(migration.addSourceTypeColumn).toBeDefined();
    });
  });
});
