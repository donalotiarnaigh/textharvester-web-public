# Prompt Management System Refactoring Plan

## Overview

The current prompt management system has several redundancies and complexity issues:

1. **Parallel Systems**: We maintain both generic templates via `ProviderPromptManager` and specialized class-based templates.
2. **Duplicate Type Definitions**: Type information is defined in multiple places.
3. **Redundant Provider Logic**: Provider-specific code is spread across multiple classes.
4. **Special Case Handling**: The system relies on special cases and conditional logic.

This document outlines a plan to refactor the prompt management system toward a more unified, maintainable architecture.

## Current State Analysis

### Architecture Overview

The current prompt management system consists of several interrelated components:

1. **BasePrompt Class**: 
   - Provides the foundation for all prompt implementations
   - Defines core methods like `getPromptText()`, `getProviderPrompt()`, and `validateAndConvert()`
   - Handles basic type validation and conversion

2. **MemorialOCRPrompt Class**:
   - Extends BasePrompt
   - Implements memorial-specific OCR prompt generation
   - Provides provider-specific variations with `getProviderPrompt()`
   - Contains custom validation logic that duplicates BasePrompt functionality
   - Is instantiated twice (for each provider) with duplicate type definitions

3. **ProviderPromptManager Class**:
   - Manages a collection of provider-specific template objects
   - Supports versioning of templates
   - Provides validation via `validatePrompt()` method
   - Used by model providers for validation

4. **Provider Templates**:
   - Static objects (openaiTemplate, anthropicTemplate, etc.)
   - Contain provider-specific configuration
   - Duplicate information already present in prompt classes

5. **Model Providers**:
   - OpenAIProvider and AnthropicProvider classes
   - Include validation methods that delegate to `promptManager.validatePrompt()`
   - Contain prompt formatting logic that could be centralized

### Data Flow

The current system data flow is as follows:

1. `uploadHandler.js` → Validates and retrieves prompt configuration with `getPrompt()`
2. `getPrompt()` → Special-cases 'memorialOCR' template or uses promptManager
3. `processFile()` → Gets prompt instance and calls `getProviderPrompt()`
4. Model Provider → Processes the image using the prompt
5. Model Provider → Returns raw data
6. `processFile()` → Validates data with prompt's `validateAndConvert()`
7. Data is stored in the database

### Current Redundancies

1. **Type Definitions**:
   - Defined in `memorialTypes.js`
   - Redefined in each provider-specific MemorialOCRPrompt instance
   - Formatted again in provider templates (typeFormatting)

2. **Validation Logic**:
   - BasePrompt has a `validateAndConvert()` method
   - MemorialOCRPrompt overrides with duplicate logic
   - ProviderPromptManager has a separate `validatePrompt()` method
   - Model providers have `validatePromptTemplate()` methods

3. **Provider-Specific Logic**:
   - Spread across multiple classes (MemorialOCRPrompt, Provider classes)
   - Duplicated in provider templates
   - Special case handling in `getPrompt()`

4. **Prompt Formatting**:
   - Each component handles formatting differently
   - No consistent approach for combining system and user prompts

### Technical Debt

1. **Special Case Handling**:
   - `getPrompt()` has special logic for 'memorialOCR' templates
   - This creates an inconsistent API and makes adding new prompt types complex

2. **Inconsistent Type Handling**:
   - The system mixes string-based type definitions with complex conversion logic
   - No clear validation strategy across components

3. **Tight Coupling**:
   - Upload handler directly depends on implementation details
   - Provider-specific logic is scattered rather than centralized

4. **Testing Challenges**:
   - Multiple mock configurations required due to complex dependencies
   - Inconsistent validation approaches make test coverage difficult

### Architecture Comparison

#### Current Architecture

```
┌─────────────────┐         ┌───────────────────────┐
│   Controller    │─────────▶ providerTemplates.js  │
└─────────────────┘         │  ┌─────────────────┐  │
                            │  │ openaiTemplate  │  │
                            │  └─────────────────┘  │
┌─────────────────┐         │  ┌─────────────────┐  │
│  fileProcessing │─────────▶  │anthropicTemplate│  │
└─────────────────┘         │  └─────────────────┘  │
                            │  ┌─────────────────┐  │
                            │  │MemorialOCRPrompt│──┼───┐
                            │  │   (instances)   │  │   │
                            │  └─────────────────┘  │   │
                            │      ┌───────────┐    │   │
                            │      │ getPrompt │    │   │
                            └──────┴─────┬─────┴────┘   │
                                         │              │
                                         ▼              │
┌─────────────────┐         ┌───────────────────────┐  │
│  Model Provider │◀────────┤ ProviderPromptManager │◀─┘
└─────────────────┘         └───────────────────────┘
         │                             ▲
         │                             │
         ▼                             │
┌─────────────────┐                    │
│ validateTemplate│────────────────────┘
└─────────────────┘
```

#### Target Architecture

```
┌─────────────────┐         ┌───────────────────────┐
│   Controller    │─────────▶    promptFactory.js   │
└─────────────────┘         │     ┌───────────┐     │
                            │     │ getPrompt │─────┼───┐
                            └─────┴───────────┴─────┘   │
┌─────────────────┐                                     │
│  fileProcessing │─────────────────────────────────────┘
└─────────────────┘                     │
                                        ▼
                            ┌───────────────────────┐
                            │     PromptManager     │
                            └───────────┬───────────┘
                                        │
                                        ▼
                            ┌───────────────────────┐
                            │     MemorialOCRPrompt │
                            └───────────┬───────────┘
                                        │
                                        ▼
┌─────────────────┐         ┌───────────────────────┐
│  Model Provider │◀────────┤       BasePrompt      │
└─────────────────┘         └───────────┬───────────┘
                                        │
                                        ▼
                            ┌───────────────────────┐
                            │      Data Types       │
                            └───────────────────────┘
```

### Key Benefits of New Architecture

1. **Improved Separation of Concerns**
   - Clear distinction between prompt content, type definitions, and provider integration
   - Each class has a single responsibility
   - Provider-specific details isolated to provider configuration

2. **Reduced Duplication**
   - Single source of truth for type definitions
   - Centralized validation logic
   - Reusable provider configurations

3. **Simplified Extensibility**
   - Adding new prompt types requires only creating a new class
   - Adding new providers requires only updating provider configurations
   - No special case handling needed for different prompt types

4. **Better Testability**
   - Isolated components are easier to test
   - Reduced need for complex mocking
   - Clear interfaces between components

5. **Consistent API Surface**
   - Unified approach to getting and using prompts
   - Standardized validation flow
   - Predictable behavior across all prompt types

## Goals

- Simplify the architecture to prefer class-based approach
- Reduce code duplication
- Improve type handling consistency
- Maintain backward compatibility with existing API calls
- Improve testability and maintainability

## Implementation Phases

### Phase 1: Unified Type System (Estimated: 2 days)

1. **Create a unified type system module**
   ```javascript
   // src/utils/prompts/types/dataTypes.js
   const dataTypes = {
     'integer': {
       validate: (value) => Number.isInteger(parseInt(value, 10)),
       convert: (value) => parseInt(value, 10),
       openai: 'number',
       anthropic: 'numeric'
     },
     'string': {
       validate: (value) => typeof value === 'string' || value === null,
       convert: (value) => value === null ? null : String(value),
       openai: 'string',
       anthropic: 'text'
     },
     // Add more types as needed
   };
   
   module.exports = dataTypes;
   ```

2. **Refactor field definitions to use the unified types**
   ```javascript
   // src/utils/prompts/types/memorialFields.js
   const dataTypes = require('./dataTypes');
   
   const memorialFields = {
     memorial_number: { 
       type: dataTypes.integer,
       description: "The memorial's identifier"
     },
     first_name: { 
       type: dataTypes.string,
       description: "The first person's first name",
       transform: (value) => value?.toUpperCase() 
     },
     // etc.
   };
   
   module.exports = memorialFields;
   ```

3. **Update tests for the new type system**

### Phase 2: Provider Configuration Consolidation (Estimated: 1 day)

1. **Create provider configuration module**
   ```javascript
   // src/utils/prompts/providers/providerConfig.js
   const providerConfigs = {
     'openai': {
       systemPrompt: 'You are an expert OCR system...',
       formatInstructions: 'Use response_format: { type: "json_object" }',
       defaultModel: 'gpt-4'
     },
     'anthropic': {
       systemPrompt: 'You are an expert OCR system...',
       formatInstructions: 'Return data as JSON without additional text',
       defaultModel: 'claude-3-sonnet-20250201'
     }
   };
   
   module.exports = providerConfigs;
   ```

2. **Update tests for provider configurations**

### Phase 3: Enhanced Base Prompt Class (Estimated: 2 days)

1. **Refactor BasePrompt to handle provider specifics**
   ```javascript
   // src/utils/prompts/BasePrompt.js
   const providerConfigs = require('./providers/providerConfig');
   const dataTypes = require('./types/dataTypes');
   
   class BasePrompt {
     constructor(config = {}) {
       this.version = config.version || '1.0.0';
       this.description = config.description || '';
       this.fields = config.fields || {};
       this.providers = config.providers || ['openai', 'anthropic'];
     }
     
     getPromptText() {
       throw new Error('Method not implemented in base class');
     }
     
     getProviderPrompt(provider) {
       const basePrompt = this.getPromptText();
       const config = providerConfigs[provider];
       
       if (!config) {
         throw new Error(`Provider not supported: ${provider}`);
       }
       
       return {
         systemPrompt: config.systemPrompt,
         userPrompt: `${basePrompt}\n\n${config.formatInstructions}`
       };
     }
     
     validateAndConvert(data, provider) {
       const result = {};
       
       // Add metadata fields
       const metadataFields = ['ai_provider', 'file_name', 'model_version', 
                               'prompt_template', 'prompt_version'];
       metadataFields.forEach(field => {
         result[field] = data[field] || null;
       });
       
       // Process defined fields
       Object.entries(this.fields).forEach(([fieldName, fieldConfig]) => {
         const value = data[fieldName];
         const { type, transform } = fieldConfig;
         
         // Apply type conversion
         let convertedValue = value === null || value === undefined ? null : type.convert(value);
         
         // Apply custom transforms if provided and value exists
         if (convertedValue !== null && transform) {
           convertedValue = transform(convertedValue);
         }
         
         result[fieldName] = convertedValue;
       });
       
       return result;
     }
   }
   
   module.exports = BasePrompt;
   ```

2. **Update tests for BasePrompt**

### Phase 4: Simplified MemorialOCRPrompt (Estimated: 1 day)

1. **Refactor MemorialOCRPrompt to use the new architecture**
   ```javascript
   // src/utils/prompts/templates/MemorialOCRPrompt.js
   const BasePrompt = require('../BasePrompt');
   const memorialFields = require('../types/memorialFields');
   
   class MemorialOCRPrompt extends BasePrompt {
     constructor(config = {}) {
       super({
         version: '2.0.0',
         description: 'Standard OCR prompt for extracting memorial inscription data',
         fields: memorialFields,
         ...config
       });
     }
     
     getPromptText() {
       return `You're an expert in OCR and are working in a heritage/genealogy context...
       
       // Rest of the prompt text
       `;
     }
   }
   
   module.exports = MemorialOCRPrompt;
   ```

2. **Update tests for MemorialOCRPrompt**

### Phase 5: Streamlined Prompt Manager (Estimated: 2 days)

1. **Refactor ProviderPromptManager to a simpler implementation**
   ```javascript
   // src/utils/prompts/PromptManager.js
   class PromptManager {
     constructor() {
       this.promptClasses = new Map();
       this.promptInstances = new Map();
     }
     
     registerPromptClass(name, PromptClass) {
       this.promptClasses.set(name, PromptClass);
     }
     
     getPrompt(promptName, provider, config = {}) {
       const cacheKey = `${promptName}:${provider}:${JSON.stringify(config)}`;
       
       // Return cached instance if available
       if (this.promptInstances.has(cacheKey)) {
         return this.promptInstances.get(cacheKey);
       }
       
       // Create new instance
       const PromptClass = this.promptClasses.get(promptName);
       if (!PromptClass) {
         throw new Error(`Prompt class not found: ${promptName}`);
       }
       
       const promptInstance = new PromptClass({
         provider,
         ...config
       });
       
       // Cache the instance
       this.promptInstances.set(cacheKey, promptInstance);
       
       return promptInstance;
     }
   }
   
   module.exports = PromptManager;
   ```

2. **Create a simplified prompt factory module**
   ```javascript
   // src/utils/prompts/promptFactory.js
   const PromptManager = require('./PromptManager');
   const MemorialOCRPrompt = require('./templates/MemorialOCRPrompt');
   
   // Initialize and configure the prompt manager
   const promptManager = new PromptManager();
   
   // Register available prompt classes
   promptManager.registerPromptClass('memorialOCR', MemorialOCRPrompt);
   // Add more prompts as needed
   
   /**
    * Get a configured prompt instance
    * @param {string} promptName - Name of the prompt
    * @param {string} provider - AI provider name
    * @param {Object} config - Additional configuration
    * @returns {BasePrompt} Configured prompt instance
    */
   const getPrompt = (promptName, provider, config = {}) => {
     return promptManager.getPrompt(promptName, provider, config);
   };
   
   module.exports = {
     promptManager,
     getPrompt
   };
   ```

3. **Update tests for the new PromptManager**

### Phase 6: API Compatibility Layer (Estimated: 1 day)

1. **Create backward compatibility module**
   ```javascript
   // src/utils/prompts/templates/providerTemplates.js
   const { promptManager, getPrompt } = require('../promptFactory');
   
   // Export for backward compatibility
   module.exports = {
     promptManager,
     getPrompt,
     // These are deprecated but maintained for compatibility
     openaiTemplate: {},
     openaiTemplateV2: {},
     anthropicTemplate: {},
     anthropicTemplateV2: {}
   };
   ```

2. **Update documentation with deprecation notices**

### Phase 7: Integration and Testing (Estimated: 2 days)

1. **Update controller code to use the new system**
   - Update `uploadHandler.js` and other files that interact with the prompt system

2. **Write comprehensive integration tests**
   - Test the entire flow from request to OCR response

3. **Update existing tests as needed**

## Migration Strategy

1. **Implement in a feature branch**: Create a new feature branch for this refactoring
2. **Parallel implementations**: Keep both systems working during transition
3. **Staged rollout**: Replace components one at a time with tests at each stage
4. **Deprecation period**: Mark old methods as deprecated but maintain them temporarily

## Testing Strategy

1. **Unit tests** for each refactored component
2. **Integration tests** for the complete prompt flow
3. **End-to-end tests** for the OCR processing with real data
4. **Backward compatibility tests** to ensure existing code continues to work

## Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking changes to API | Medium | High | Maintain compatibility layer, thorough testing |
| Regression in OCR quality | Low | High | A/B test with old system, verify results |
| Unexpected edge cases | Medium | Medium | Comprehensive test coverage, gradual rollout |
| Performance issues | Low | Medium | Benchmark before and after, optimize if needed |
| Knowledge transfer | Medium | Medium | Document new architecture thoroughly |

## Timeline

- **Total Estimated Time**: 11 working days
- **Recommended Buffer**: 3 days for unexpected issues
- **Total Project Timeline**: ~3 weeks

## Success Criteria

1. All tests pass with the new implementation
2. Code duplication is reduced (measure with static analysis tools)
3. OCR accuracy maintains or improves with the new system
4. Developer experience improves (measured via team feedback)
5. System is more extensible for future prompt types 