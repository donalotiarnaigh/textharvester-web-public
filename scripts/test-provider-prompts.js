#!/usr/bin/env node

/**
 * Provider Prompt Testing Script
 * 
 * Tests real API calls to OpenAI and Anthropic using the new prompt system.
 * Includes enhanced logging and error handling.
 * 
 * Usage: 
 *   node scripts/test-provider-prompts.js [--provider=all|openai|anthropic] [--image=path/to/image.jpg]
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFileAsync = promisify(fs.readFile);

// Import providers
const OpenAIProvider = require('../src/utils/modelProviders/openaiProvider');
const AnthropicProvider = require('../src/utils/modelProviders/anthropicProvider');

// Import prompt system
const MemorialOCRPrompt = require('../src/utils/prompts/templates/MemorialOCRPrompt');
const { promptManager } = require('../src/utils/prompts/templates/providerTemplates');

// Create simple colored logger without external deps
const logger = {
  info: (message) => console.log(`\x1b[34m[INFO]\x1b[0m ${message}`),
  success: (message) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${message}`),
  error: (message) => console.log(`\x1b[31m[ERROR]\x1b[0m ${message}`),
  warn: (message) => console.log(`\x1b[33m[WARNING]\x1b[0m ${message}`),
  debug: (message) => console.log(`\x1b[90m[DEBUG]\x1b[0m ${message}`),
  data: (label, data) => {
    console.log(`\x1b[36m[DATA] ${label}:\x1b[0m`);
    console.log(JSON.stringify(data, null, 2));
  }
};

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  if (key && key.startsWith('--')) {
    acc[key.slice(2)] = value || true;
  }
  return acc;
}, {});

// Default values
const providerToTest = args.provider || 'all';
const imagePath = args.image || 'sample_data/test_inputs/page_1.jpg';
const testAllImages = args.all === 'true' || false;
const startPage = parseInt(args.start) || 1;
const endPage = parseInt(args.end) || (testAllImages ? 10 : startPage);
const batchSize = parseInt(args.batch) || 2; // Process images in smaller batches

// Load the image
async function loadImage(imagePath) {
  try {
    logger.info(`Loading image from ${imagePath}`);
    const imageBuffer = await readFileAsync(path.resolve(imagePath));
    return imageBuffer.toString('base64');
  } catch (error) {
    logger.error(`Failed to load image: ${error.message}`);
    process.exit(1);
  }
}

// Get test images from directory
async function getTestImages() {
  try {
    const testDir = 'sample_data/test_inputs';
    logger.info(`Getting images from ${testDir} (pages ${startPage} to ${endPage})`);

    // Generate the list of page numbers to process
    const pages = Array.from(
      { length: endPage - startPage + 1 },
      (_, i) => startPage + i
    );

    // Map page numbers to filenames and verify they exist
    const imageFiles = [];
    for (const page of pages) {
      const file = path.join(testDir, `page_${page}.jpg`);
      try {
        await fs.promises.access(file, fs.constants.R_OK);
        imageFiles.push(file);
      } catch (error) { // eslint-disable-line no-unused-vars
        logger.warn(`File ${file} does not exist or is not readable, skipping...`);
      }
    }

    if (imageFiles.length === 0) {
      throw new Error('No valid image files found');
    }

    return imageFiles;
  } catch (error) {
    logger.error(`Failed to get test images: ${error.message}`);
    return [imagePath]; // Fall back to default image
  }
}

// Test OpenAI provider
async function testOpenAI(base64Image) {
  logger.info('==== Testing OpenAI Provider ====');

  try {
    // Initialize provider
    const config = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_MODEL: 'gpt-5.1-2024-11-20',
      MAX_TOKENS: 2000
    };

    logger.info(`Initializing OpenAI provider with model: ${config.OPENAI_MODEL}`);
    const provider = new OpenAIProvider(config);

    // Create and validate prompt
    const prompt = new MemorialOCRPrompt();
    const validation = provider.validatePromptTemplate(prompt);

    if (!validation.isValid) {
      logger.error(`Prompt validation failed for OpenAI: ${validation.errors.join(', ')}`);
      return;
    }

    logger.success('Prompt validated for OpenAI');
    logger.debug(`Using prompt version: ${prompt.version}`);

    // Format the prompt
    const formatted = promptManager.formatPrompt(prompt, 'openai');
    logger.debug('System prompt: ' + formatted.systemPrompt.slice(0, 100) + '...');

    // Make the API call
    logger.info('Sending request to OpenAI API...');
    const startTime = Date.now();

    const result = await provider.processImage(
      base64Image,
      prompt.getPromptText(),
      { promptTemplate: prompt }
    );

    const endTime = Date.now();
    logger.success(`OpenAI request completed in ${endTime - startTime}ms`);
    logger.data('OpenAI Response', result);

    return result;
  } catch (error) {
    logger.error(`OpenAI test failed: ${error.message}`);
    if (error.stack) {
      logger.debug(error.stack);
    }
  }
}

// Test Anthropic provider
async function testAnthropic(base64Image) {
  logger.info('==== Testing Anthropic Provider ====');

  try {
    // Initialize provider
    const config = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      ANTHROPIC_MODEL: 'claude-3-7-sonnet-20250219',
      MAX_TOKENS: 2000
    };

    logger.info(`Initializing Anthropic provider with model: ${config.ANTHROPIC_MODEL}`);
    const provider = new AnthropicProvider(config);

    // Create and validate prompt
    const prompt = new MemorialOCRPrompt();
    const validation = provider.validatePromptTemplate(prompt);

    if (!validation.isValid) {
      logger.error(`Prompt validation failed for Anthropic: ${validation.errors.join(', ')}`);
      return;
    }

    logger.success('Prompt validated for Anthropic');
    logger.debug(`Using prompt version: ${prompt.version}`);

    // Format the prompt
    const formatted = promptManager.formatPrompt(prompt, 'anthropic');
    logger.debug('System prompt: ' + formatted.systemPrompt.slice(0, 100) + '...');

    // Make the API call
    logger.info('Sending request to Anthropic API...');
    const startTime = Date.now();

    const result = await provider.processImage(
      base64Image,
      prompt.getPromptText(),
      { promptTemplate: prompt }
    );

    const endTime = Date.now();
    logger.success(`Anthropic request completed in ${endTime - startTime}ms`);
    logger.data('Anthropic Response', result);

    return result;
  } catch (error) {
    logger.error(`Anthropic test failed: ${error.message}`);
    if (error.stack) {
      logger.debug(error.stack);
    }
  }
}

// Compare results (if both providers are tested)
function compareResults(openaiResult, anthropicResult) {
  if (!openaiResult || !anthropicResult) {
    return;
  }

  logger.info('==== Comparing Provider Results ====');

  // Fields to compare
  const fieldsToCompare = [
    'memorial_number',
    'first_name',
    'last_name',
    'year_of_death',
    'inscription'
  ];

  // Check for differences
  const differences = [];

  fieldsToCompare.forEach(field => {
    const openaiValue = openaiResult[field];
    const anthropicValue = anthropicResult[field];

    if (openaiValue !== anthropicValue) {
      differences.push({
        field,
        openai: openaiValue,
        anthropic: anthropicValue
      });
    }
  });

  if (differences.length > 0) {
    logger.warn(`Found ${differences.length} differences between providers`);
    logger.data('Differences', differences);
  } else {
    logger.success('Both providers returned identical results for key fields');
  }
}

// Process a batch of images
async function processBatch(images, batchNumber) {
  logger.info(`\n==== Processing Batch ${batchNumber} (${images.length} images) ====`);

  const results = [];

  for (const currentImage of images) {
    logger.info(`\n--- Processing image: ${path.basename(currentImage)} ---`);

    // Load image
    const base64Image = await loadImage(currentImage);
    logger.success(`Image loaded successfully: ${path.basename(currentImage)}`);

    // Test providers
    let openaiResult = null;
    let anthropicResult = null;

    if (providerToTest === 'all' || providerToTest === 'openai') {
      openaiResult = await testOpenAI(base64Image);
    }

    if (providerToTest === 'all' || providerToTest === 'anthropic') {
      anthropicResult = await testAnthropic(base64Image);
    }

    // Compare results if both providers were tested
    if (providerToTest === 'all' && openaiResult && anthropicResult) {
      compareResults(openaiResult, anthropicResult);
    }

    results.push({
      image: path.basename(currentImage),
      openai: openaiResult,
      anthropic: anthropicResult
    });
  }

  return results;
}

// Save results to file
async function saveResults(results) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsDir = path.join('sample_data', 'test_results');
    await fs.promises.mkdir(resultsDir, { recursive: true });

    const resultsFile = path.join(
      resultsDir,
      `results_${providerToTest}_${startPage}-${endPage}_${timestamp}.json`
    );

    await fs.promises.writeFile(
      resultsFile,
      JSON.stringify({
        timestamp,
        provider: providerToTest,
        pages: {
          start: startPage,
          end: endPage
        },
        results
      }, null, 2)
    );

    logger.success(`Results saved to ${resultsFile}`);
  } catch (error) {
    logger.error(`Failed to save results: ${error.message}`);
  }
}

// Main function
async function main() {
  try {
    logger.info('Starting provider prompt test');
    logger.info(`Provider: ${providerToTest}`);
    logger.info(`Processing pages ${startPage} to ${endPage} in batches of ${batchSize}`);

    // Check for API keys
    if ((providerToTest === 'all' || providerToTest === 'openai') && !process.env.OPENAI_API_KEY) {
      logger.error('OPENAI_API_KEY environment variable is not set');
      process.exit(1);
    }

    if ((providerToTest === 'all' || providerToTest === 'anthropic') && !process.env.ANTHROPIC_API_KEY) {
      logger.error('ANTHROPIC_API_KEY environment variable is not set');
      process.exit(1);
    }

    // Get images to test
    const imagesToTest = await getTestImages();
    logger.info(`Found ${imagesToTest.length} image(s) to process`);

    // Process images in batches
    const allResults = [];
    for (let i = 0; i < imagesToTest.length; i += batchSize) {
      const batch = imagesToTest.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const batchResults = await processBatch(batch, batchNumber);
      allResults.push(...batchResults);

      // Add a delay between batches to avoid rate limits
      if (i + batchSize < imagesToTest.length) {
        const delay = 5000; // 5 seconds
        logger.info(`Waiting ${delay / 1000} seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Save results
    await saveResults(allResults);

    logger.success('Provider prompt test completed');
  } catch (error) {
    logger.error(`Test failed: ${error.message}`);
    if (error.stack) {
      logger.debug(error.stack);
    }
    process.exit(1);
  }
}

// Run the main function
main(); 