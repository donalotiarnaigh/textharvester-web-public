# Current State Analysis: Prompt Implementation & Dependencies

## 1. Current Prompt Implementation

The prompt is currently hardcoded in two primary locations:

### Main Processing Implementation
Location: `src/utils/fileProcessing.js`
```javascript
const prompt = 'You\'re an expert in OCR and are working in a heritage/genealogy context assisting in data processing post graveyard survey. Examine these images and extract the text as per the following details for each memorial: memorial number, first name, last name, year of death, and the inscription text. Respond in JSON format only...';
```

### Testing Implementation
Location: `src/utils/testProviders.js`
```javascript
const prompt = 'You\'re an expert in OCR and are working in a heritage/genealogy context...';
```

### Current Limitations
- Prompt is duplicated across files
- No version control for prompt changes
- No provider-specific optimizations
- Limited flexibility for testing variations
- No structured validation of responses

## 2. Dependencies Map

### Core Processing Components
- **File Processing (`src/utils/fileProcessing.js`)**
  - Primary orchestrator of OCR processing
  - Dependencies:
    - `modelProviders` - AI provider integration
    - `database` - Data storage
    - `logger` - System logging
  - Responsibilities:
    - File handling
    - Provider selection
    - Prompt delivery
    - Result storage

### Provider Implementation Structure
```
src/utils/modelProviders/
├── baseProvider.js     # Abstract base class
├── openaiProvider.js   # OpenAI implementation
├── anthropicProvider.js # Anthropic implementation
└── index.js           # Provider factory
```

### Data Flow
1. File Upload → `fileProcessing.js`
2. Provider Creation → `modelProviders/index.js`
3. Image Processing → Provider implementation
4. Data Storage → `database.js`

## 3. Potential Breaking Changes

### A. Database Impact
- **Current Schema**
  - All fields use TEXT type
  - No type validation
  - Flexible but inefficient storage

- **Database Transition**
  - Create new database with proper types
  - Simple data transfer if needed
  - No complex migration required
  - Fresh start with optimized schema

### B. API Changes
- **Provider Interface Updates**
  - New typed response handling
  - Provider-specific prompt variations
  - Enhanced error handling needed

- **Frontend Impact**
  - Display adaptations for typed data
  - New validation error handling
  - Progress tracking updates

### C. Processing Flow Changes
- **Prompt System**
  - New loading mechanism
  - Version control implementation
  - Provider-specific variations

- **Data Validation**
  - Type checking implementation
  - Edge case handling
  - Error reporting enhancement

### D. Testing Requirements
- **Unit Tests**
  - New prompt system coverage
  - Type validation testing
  - Provider response testing

- **Integration Tests**
  - End-to-end flow validation
  - Migration testing
  - Error handling verification

## 4. Critical Areas to Watch

### High Priority
1. **Data Integrity**
   - New database schema implementation
   - Type system implementation
   - Optional data transfer utility

2. **API Compatibility**
   - Response format consistency
   - Error handling improvements
   - Backward compatibility

3. **Validation Implementation**
   - Type checking robustness
   - Edge case handling
   - Error reporting clarity

### Medium Priority
1. **Provider Optimization**
   - Provider-specific prompts
   - Response parsing improvements
   - Performance monitoring

2. **Testing Coverage**
   - Unit test expansion
   - Integration test updates
   - Migration test cases

## 5. Risk Mitigation Strategies

1. **Database Migration**
   - Create new database with typed schema
   - Optional utility for data transfer
   - Clean implementation without legacy constraints
   - Fresh indexes and optimizations

2. **Code Changes**
   - Feature flags for new functionality
   - Gradual provider updates
   - Comprehensive logging
   - Parallel systems during transition

3. **Testing Strategy**
   - Expanded test coverage
   - Performance benchmarking
   - User acceptance testing
   - Staged rollout plan

## 6. Next Steps

1. Begin with prompt modularization
2. Implement type system
3. Create new database with proper schema
4. Update provider implementations
5. Enhance testing framework
6. Plan staged rollout 