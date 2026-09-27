// Load environment variables from .env file
require('dotenv').config();

const { processFile } = require('./fileProcessing');
const logger = require('./logger');

/**
 * Command line utility to process a file with a specific provider
 */
async function main() {
  if (process.argv.length < 4) {
    console.log('Usage: node scripts/process-with-provider.js <provider> <path-to-file>');
    console.log('Available providers: openai, anthropic');
    process.exit(1);
  }
  
  const provider = process.argv[2].toLowerCase();
  const filePath = process.argv[3];
  
  if (!['openai', 'anthropic'].includes(provider)) {
    console.error(`Invalid provider: ${provider}. Available providers: openai, anthropic`);
    process.exit(1);
  }
  
  logger.info(`Processing file ${filePath} with provider ${provider}`);
  
  try {
    const result = await processFile(filePath, { provider });
    logger.info('Processing completed successfully');
    logger.info(JSON.stringify(result, null, 2));
  } catch (error) {
    logger.error('Processing failed:', error);
    process.exit(1);
  }
}

// Run the main function if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = { main }; 