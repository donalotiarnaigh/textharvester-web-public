// Load environment variables from .env file
require('dotenv').config();

const fs = require('fs').promises;
const { OpenAIProvider, AnthropicProvider } = require('./modelProviders');
const logger = require('./logger');

/**
 * Tests all available providers with the same image and prompt
 * @param {string} imagePath - Path to the image file to test
 * @returns {Promise<Object>} - Results from each provider
 */
async function testAllProviders(imagePath) {
  logger.info(`Testing all providers with image: ${imagePath}`);
  
  try {
    const base64Image = await fs.readFile(imagePath, { encoding: 'base64' });
    
    // The standard OCR prompt used in the application
    const prompt = 'You\'re an expert in OCR and are working in a heritage/genealogy context assisting in data processing post graveyard survey. Examine these images and extract the text as per the following details for each memorial: memorial number, first name, last name, year of death, and the inscription text. Respond in JSON format only, adhering to the order mentioned. e.g., {"memorial_number": "18", "first_name": "JOHN", "last_name": "SMITH", "year_of_death": "1900", "inscription": "IN LOVING MEMORY OF JOHN SMITH WHO DIED 1ST JANUARY 1900 AGED 70 YEARS AND OF HIS WIFE MARY SMITH WHO DIED 2ND FEBRUARY 1910 AGED 75 YEARS R. I. P."}. If a memorial number, first name, last name, or year of death is not visible or the inscription is not present, return a JSON with NULL for the missing fields.';
    
    // Create instances of each provider
    const providers = [
      { name: 'OpenAI', instance: new OpenAIProvider({}) },
      { name: 'Anthropic', instance: new AnthropicProvider({}) }
    ];
    
    const results = {};
    
    // Test each provider
    for (const provider of providers) {
      logger.info(`Testing ${provider.name}...`);
      
      try {
        const startTime = Date.now();
        const result = await provider.instance.processImage(base64Image, prompt);
        const endTime = Date.now();
        
        results[provider.name] = {
          result,
          processingTime: endTime - startTime,
          success: true
        };
        
        logger.info(`${provider.name} processing completed in ${endTime - startTime}ms`);
        logger.info(`${provider.name} result: ${JSON.stringify(result, null, 2)}`);
      } catch (error) {
        logger.error(`Error with ${provider.name}:`, error);
        results[provider.name] = {
          error: error.message,
          success: false
        };
      }
    }
    
    // Log a comparison summary
    logger.info('Provider comparison summary:');
    for (const [name, data] of Object.entries(results)) {
      if (data.success) {
        logger.info(`${name}: Success in ${data.processingTime}ms`);
      } else {
        logger.info(`${name}: Failed - ${data.error}`);
      }
    }
    
    return results;
  } catch (error) {
    logger.error('Error testing providers:', error);
    throw error;
  }
}

/**
 * Command line interface for testing providers
 */
async function main() {
  if (process.argv.length < 3) {
    console.log('Usage: node scripts/test-providers.js <path-to-image>');
    process.exit(1);
  }
  
  const imagePath = process.argv[2];
  try {
    await testAllProviders(imagePath);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the main function if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = { testAllProviders }; 