// Load environment variables
require('dotenv').config();

const { migrateDatabase } = require('../src/utils/migration');
const logger = require('../src/utils/logger');

// Run the migration
async function main() {
  try {
    logger.info('Starting migration to remove confidence_score column...');
    await migrateDatabase();
    logger.info('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

main(); 