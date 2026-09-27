# Prompt Modularization & Data Type Enhancement Plan

## Overview

This document outlines the implementation plan for addressing Issue #9: "Enhancement: Modularize OCR Prompt and Improve Data Types." The goal is to improve maintainability, data quality, and extensibility of the TextHarvester OCR system.

## Current Implementation Issues

1. **Prompt Management Problems**:
   - OCR prompts are hardcoded in processing logic
   - Duplicate prompt definitions exist across files
   - No version control or history for prompts
   - Testing different prompt variations requires code changes

2. **Data Type Limitations**:
   - All fields return as strings from AI providers
   - No validation of returned data
   - Database schema uses TEXT for all fields
   - Inefficient storage and querying

3. **Technical Debt**:
   - Difficult to maintain or update prompts
   - No standardization of prompt structure
   - Cannot easily A/B test prompt variations
   - Limited ability to optimize for different AI models

## Proposed Changes

### 1. Create Dedicated Prompt Module

Create a structured module system for prompts with versioning and variants:

```
src/
└── utils/
    └── prompts/
        ├── index.js             # Entry point for prompt management
        ├── basePrompt.js        # Base prompt structure and functions
        ├── types/               # Type definitions
        │   └── memorialTypes.js # Type definitions for memorial data
        └── templates/           # Specific prompt templates
            ├── memorialOCR.js   # Memorial OCR prompt variations
            └── inscriptionOCR.js # Specialized inscription-only prompts
```

**Base Prompt Example** (`src/utils/prompts/basePrompt.js`):

```javascript
/**
 * Base prompt class for all OCR prompts
 */
class BasePrompt {
  constructor(config = {}) {
    this.version = config.version || '1.0.0';
    this.modelTargets = config.modelTargets || ['openai', 'anthropic'];
    this.description = config.description || '';
    this.typeDefinitions = config.typeDefinitions || {};
  }

  /**
   * Get the prompt text with type information
   * @returns {string} Complete prompt text
   */
  getPromptText() {
    throw new Error('Method not implemented in base class');
  }

  /**
   * Get the appropriate prompt for a specific AI provider
   * @param {string} provider - AI provider name
   * @returns {string} Provider-specific prompt
   */
  getProviderPrompt(provider) {
    return this.getPromptText();
  }

  /**
   * Validate response data against type definitions
   * @param {Object} data - Response data from AI model
   * @returns {Object} Validated and converted data
   */
  validateAndConvert(data) {
    const result = {};
    
    for (const [key, type] of Object.entries(this.typeDefinitions)) {
      if (data[key] === null || data[key] === undefined) {
        result[key] = null;
        continue;
      }
      
      switch (type) {
        case 'integer':
          result[key] = data[key] === null ? null : parseInt(data[key], 10) || null;
          break;
        case 'float':
          result[key] = data[key] === null ? null : parseFloat(data[key]) || null;
          break;
        case 'boolean':
          result[key] = data[key] === null ? null : Boolean(data[key]);
          break;
        case 'date':
          result[key] = data[key] === null ? null : new Date(data[key]);
          break;
        default:
          result[key] = data[key];
      }
    }
    
    return result;
  }
}

module.exports = BasePrompt;
```

**Memorial OCR Prompt Example** (`src/utils/prompts/templates/memorialOCR.js`):

```javascript
const BasePrompt = require('../basePrompt');
const { memorialTypes } = require('../types/memorialTypes');

/**
 * Standard OCR prompt for memorial inscriptions
 */
class MemorialOCRPrompt extends BasePrompt {
  constructor(config = {}) {
    super({
      version: '1.0.0',
      description: 'Standard OCR prompt for extracting memorial inscription data',
      typeDefinitions: memorialTypes,
      ...config
    });
  }

  /**
   * Get the complete prompt text with type information
   * @returns {string} Formatted prompt text
   */
  getPromptText() {
    return `You're an expert in OCR and are working in a heritage/genealogy context assisting in data processing post graveyard survey.

Examine this image and extract the following data with specific types:
- memorial_number: INTEGER
- first_name: STRING
- last_name: STRING
- year_of_death: INTEGER
- inscription: STRING

Respond in JSON format only with these exact field names. Example:
{
  "memorial_number": 18,
  "first_name": "JOHN",
  "last_name": "SMITH",
  "year_of_death": 1900,
  "inscription": "IN LOVING MEMORY OF JOHN SMITH WHO DIED 1ST JANUARY 1900 AGED 70 YEARS AND OF HIS WIFE MARY SMITH WHO DIED 2ND FEBRUARY 1910 AGED 75 YEARS R. I. P."
}

If any field is not visible or cannot be determined, use null. For example:
{
  "memorial_number": 42,
  "first_name": "JOHN",
  "last_name": "SMITH",
  "year_of_death": null,
  "inscription": "Inscription text here..."
}`;
  }

  /**
   * Get a prompt variation for a specific provider
   * @param {string} provider - AI provider name
   * @returns {string} Provider-specific prompt
   */
  getProviderPrompt(provider) {
    if (provider.toLowerCase() === 'anthropic') {
      // Claude performs better with slightly different instructions
      return this.getPromptText() + '\n\nEnsure years are extracted as numbers, not text.';
    }
    
    return this.getPromptText();
  }
}

module.exports = MemorialOCRPrompt;
```

**Type Definitions Example** (`src/utils/prompts/types/memorialTypes.js`):

```javascript
/**
 * Type definitions for memorial data
 */
const memorialTypes = {
  memorial_number: 'integer',
  first_name: 'string',
  last_name: 'string',
  year_of_death: 'integer',
  inscription: 'string'
};

module.exports = { memorialTypes };
```

### 2. Update Database Schema

Modify the database schema to use appropriate data types:

```sql
-- Migration SQL
CREATE TABLE memorials_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memorial_number INTEGER,
    first_name TEXT,
    last_name TEXT,
    year_of_death INTEGER,
    inscription TEXT,
    file_name TEXT,
    ai_provider TEXT,
    model_version TEXT,
    prompt_version TEXT,
    confidence_score REAL,
    processed_date DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Copy data with type conversion
INSERT INTO memorials_new (
    id, memorial_number, first_name, last_name, 
    year_of_death, inscription, file_name, 
    ai_provider, model_version, processed_date
)
SELECT 
    id, 
    CAST(memorial_number AS INTEGER), 
    first_name, 
    last_name, 
    CAST(year_of_death AS INTEGER), 
    inscription, 
    file_name, 
    ai_provider, 
    model_version, 
    processed_date 
FROM memorials;

-- Replace old table with new one
DROP TABLE memorials;
ALTER TABLE memorials_new RENAME TO memorials;

-- Add indexes for common queries
CREATE INDEX idx_memorial_number ON memorials(memorial_number);
CREATE INDEX idx_name ON memorials(last_name, first_name);
CREATE INDEX idx_year ON memorials(year_of_death);
```

### 3. Update File Processing Logic

Refactor the file processing to use the new prompt module:

```javascript
// src/utils/fileProcessing.js (updated)
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const { createProvider } = require('./modelProviders');
const { storeMemorial } = require('./database');
const { getPrompt } = require('./prompts');

/**
 * Processes a file using configurable prompts and providers
 * @param {string} filePath The path to the file to be processed
 * @param {Object} options Optional configuration options
 * @returns {Promise} A promise that resolves with the API response
 */
async function processFile(filePath, options = {}) {
  const providerName = options.provider || process.env.AI_PROVIDER || 'openai';
  const promptTemplate = options.promptTemplate || 'memorialOCR';
  const promptVersion = options.promptVersion || 'latest';
  
  logger.info(`Starting to process file: ${filePath} with provider: ${providerName}`);
  
  try {
    const base64Image = await fs.readFile(filePath, { encoding: 'base64' });
    logger.info(`File ${filePath} read successfully. Proceeding with OCR processing.`);

    // Create provider instance
    const provider = createProvider({
      ...options,
      AI_PROVIDER: providerName
    });
    
    // Get the appropriate prompt for this provider
    const promptInstance = getPrompt(promptTemplate, promptVersion);
    const promptText = promptInstance.getProviderPrompt(providerName);
    
    // Process the image using the selected provider
    const rawExtractedData = await provider.processImage(base64Image, promptText);
    
    // Validate and convert the data according to our type definitions
    const extractedData = promptInstance.validateAndConvert(rawExtractedData);
    
    logger.info(`${providerName} API response for ${filePath}`);
    logger.info(JSON.stringify(extractedData, null, 2));
    
    // Add metadata to the extracted data
    extractedData.fileName = path.basename(filePath);
    extractedData.ai_provider = providerName;
    extractedData.model_version = provider.getModelVersion();
    extractedData.prompt_version = promptInstance.version;
    
    // Store in database (with proper types)
    await storeMemorial(extractedData);
    
    logger.info(`OCR text for ${filePath} stored in database with model: ${providerName}`);
    
    // Clean up the file after successful processing
    await fs.unlink(filePath);
    logger.info(`Cleaned up processed file: ${filePath}`);
    
    return extractedData;
  } catch (error) {
    logger.error(`Error processing file ${filePath}:`, error);
    throw error;
  }
}

module.exports = { processFile };
```

## Implementation Plan

### Phase 1: Prompt Modularization

1. Create the directory structure for prompts
2. Implement the BasePrompt class
3. Add type definitions
4. Create the MemorialOCRPrompt implementation
5. Update the prompt module entry point

### Phase 2: Database Schema Update

1. Create migration scripts for updating the database schema
2. Test migration with production data
3. Add data validation functions
4. Implement type conversion utilities

### Phase 3: Integration

1. Update file processing logic to use the new prompt system
2. Modify the model providers to handle typed responses
3. Update the frontend to display type information
4. Add validation before storing in the database

### Phase 4: Testing

1. Create unit tests for prompt modules
2. Develop integration tests for the entire pipeline
3. Add validation tests for each data type
4. Test with various edge cases and malformed inputs

## Migration Strategy

To minimize disruption while implementing these changes:

1. **Database Migration**:
   - Create a backup of the current database
   - Run the migration script in a controlled environment
   - Verify data integrity after migration
   - Deploy in a maintenance window

2. **Code Rollout**:
   - Implement and test changes in a feature branch
   - Use feature flags to enable/disable new functionality
   - Deploy in phases, starting with prompt modularization
   - Monitor performance and error rates after each phase

## Benefits

This implementation delivers significant improvements:

1. **Better Maintainability**:
   - Centralized prompt management
   - Version control for prompts
   - Provider-specific optimizations
   - Clean separation of concerns

2. **Improved Data Quality**:
   - Proper data types in database
   - Validation at multiple levels
   - Consistent data format
   - Better error handling

3. **Enhanced Performance**:
   - More efficient database queries
   - Reduced type conversion overhead
   - Better indexing capabilities
   - Improved search performance

4. **Future-Proofing**:
   - Support for multiple AI providers
   - Easy A/B testing of prompts
   - Simple addition of new data fields
   - Performance tracking for different prompt versions

## Future Enhancements

After implementing these core changes, several enhancements could follow:

1. **Prompt Library**:
   - Web UI for managing prompts
   - Performance tracking for different prompts
   - A/B testing framework

2. **Advanced Type Handling**:
   - Support for nested objects
   - Array type validation
   - Custom validation rules
   - Reference data validation

3. **Reporting Improvements**:
   - Type-aware analytics
   - Data quality dashboards
   - Performance metrics by prompt version

## Conclusion

This modularization of OCR prompts and improvement of data types will significantly enhance the TextHarvester application's maintainability, data quality, and extensibility. By implementing a structured approach to prompt management and proper data typing, we set a solid foundation for future enhancements while improving the current user experience. 