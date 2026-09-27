# Typographic Analysis Feature — Implementation Plan

## Overview

This implementation plan follows Test-Driven Development (TDD): tests are written before implementation for each component. Tasks reference requirements from `requirements.md` and follow the component design from `design.md`.

---

- [x] 1. Database Foundation
  - Add new columns to support typographic analysis data storage
  - _Requirements: 4.1, 4.2, 4.3, 5.2, 5.4_

  - [x] 1.1 Write tests for database migration
    - **Happy path**: Migration adds 5 new columns (`transcription_raw`, `stone_condition`, `typography_analysis`, `iconography`, `structural_observations`)
    - **Happy path**: Existing data preserved after migration
    - **Unhappy path**: Running migration twice is idempotent (no error)
    - **Unhappy path**: Migration on database missing `memorials` table throws clear error
    - _Requirements: 4.2, 5.4_

  - [x] 1.2 Implement database migration script
    - Create `scripts/migrate-add-typographic-analysis.js`
    - Use `ALTER TABLE ADD COLUMN` with existence check
    - Wrap in transaction for atomicity
    - _Requirements: 4.2, 5.4_

  - [x] 1.3 Write tests for storage layer updates
    - **Happy path**: `storeMemorial()` with full typographic data stores all fields
    - **Happy path**: JSON fields serialized correctly in database
    - **Happy path**: Null analysis fields stored as `NULL` (not empty string)
    - **Unhappy path**: Circular reference in iconography throws serialization error
    - **Unhappy path**: Existing `storeMemorial()` calls work unchanged (backward compat)
    - _Requirements: 4.1, 4.4, 5.1, 5.2_

  - [x] 1.4 Implement storage layer updates
    - Update `src/utils/database.js` `storeMemorial()` function
    - Add JSON.stringify() for object fields
    - Handle undefined vs null distinction
    - _Requirements: 4.1, 4.4_

---

- [x] 2. Prompt Template Core
  - Implement the TypographicAnalysisPrompt class with validation
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_

  - [x] 2.1 Write tests for prompt generation
    - **Happy path**: `getProviderPrompt('openai')` returns object with `systemPrompt` and `userPrompt`
    - **Happy path**: `getProviderPrompt('anthropic')` returns properly formatted prompts
    - **Happy path**: Prompts contain key instructions (line-for-line, dash notation, botanical terms)
    - **Unhappy path**: `getProviderPrompt('unsupported')` throws error listing supported providers
    - **Unhappy path**: `getProviderPrompt(null)` throws validation error
    - _Requirements: 1.1, 1.4_

  - [x] 2.2 Implement prompt generation
    - Create `src/utils/prompts/templates/TypographicAnalysisPrompt.js`
    - Extend `BasePrompt` class
    - Implement `getPromptText()` with V2.3 instructions
    - Implement `getProviderPrompt()` for openai/anthropic
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 2.3 Write tests for response validation
    - **Happy path**: Valid complete response passes validation with all fields
    - **Happy path**: Valid minimal response (null iconography) passes validation
    - **Happy path**: Historical characters (ſ, þ) preserved in transcription_raw
    - **Happy path**: Superscripts in typography_analysis preserved
    - **Unhappy path**: `validateAndConvert(null)` throws `ProcessingError` with type `validation_error`
    - **Unhappy path**: `validateAndConvert({})` throws `ProcessingError` with type `empty_monument`
    - **Unhappy path**: Missing `transcription_raw` throws validation error
    - **Unhappy path**: `[?]` notation in transcription throws error with message about correct notation
    - **Unhappy path**: Malformed `iconography` (wrong types) throws specific field error
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.4, 2.5, 3.4, 3.6_

  - [x] 2.4 Implement response validation
    - Implement `validateAndConvert()` method
    - Add schema validation for all fields
    - Add notation normalization (`\n` → `|`)
    - Add error detection for `[?]` style notation
    - _Requirements: 1.1, 1.3, 2.1, 2.2, 2.3_

  - [x] 2.5 Refactor prompt template
    - Clean up code, add JSDoc comments
    - Ensure consistent error messages
    - Add logging for validation warnings
    - _Requirements: 1.1_

---

- [x] 3. Iconography Validation
  - Add specific validation for iconography schema with botanical/mechanical terms
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 3.1 Write tests for iconography validation
    - **Happy path**: Complete iconography object with all sub-fields validates
    - **Happy path**: `daisy_wheels: true` accepted when compass-drawn elements described
    - **Happy path**: Botanical terms (cordate, undulating) pass without warning
    - **Unhappy path**: Empty iconography returns object with empty arrays (not null/undefined)
    - **Unhappy path**: Interpretive labels (flower, rosette) log quality warning but accept
    - **Unhappy path**: Malformed style_technique (missing period) still accepts with partial data
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.2 Implement iconography validation
    - Add `validateIconography()` helper method
    - Add `validateStyleTechnique()` helper method
    - Add quality warning detection for interpretive labels
    - _Requirements: 3.1, 3.2, 3.3, 3.5_

---

- [x] 4. Provider Registration
  - Register the new prompt template in the factory system
  - _Requirements: 1.1, 1.4, 5.1, 5.3, 5.5, 5.6_

  - [x] 4.1 Write tests for factory registration
    - **Happy path**: `getPrompt('openai', 'typographicAnalysis')` returns TypographicAnalysisPrompt instance
    - **Happy path**: `getPrompt('anthropic', 'typographicAnalysis')` returns instance
    - **Happy path**: Source type `typographic_analysis` routes correctly in fileProcessing
    - **Unhappy path**: `getPrompt('openai', 'unknownTemplate')` throws error with available templates
    - **Unhappy path**: Missing registration causes clear error
    - _Requirements: 1.4, 5.5, 5.6_

  - [x] 4.2 Implement factory registration
    - Update `src/utils/prompts/templates/providerTemplates.js`
    - Add TypographicAnalysisPrompt to template registry
    - Update `src/utils/prompts/PromptFactory.js` if needed
    - _Requirements: 1.1, 5.1_

  - [x] 4.3 Update fileProcessing.js
    - Add case for `source_type === 'typographic_analysis'`
    - Route to TypographicAnalysisPrompt
    - Handle validated response storage
    - _Requirements: 1.1, 1.3_

---

- [x] 5. API Layer Updates
  - Update results API to include new fields
  - _Requirements: 4.3, 5.1, 5.2, 5.3_

  - [x] 5.1 Write tests for results manager updates
    - **Happy path**: `/results-data` includes `transcription_raw` for typographic records
    - **Happy path**: JSON fields deserialized to objects in API response
    - **Happy path**: Records without typographic analysis return null for new fields
    - **Happy path**: CSV export includes new columns
    - **Unhappy path**: Corrupted JSON in database returns null with logged warning
    - **Unhappy path**: Missing columns in older database returns null gracefully
    - _Requirements: 4.3, 5.3_

  - [x] 5.2 Implement results manager updates
    - Update `src/controllers/resultsManager.js`
    - Add JSON.parse() with try/catch for object fields
    - Update `MEMORIAL_FIELDS` constant
    - Update CSV export column list
    - _Requirements: 4.3, 5.1, 5.3_

---

- [x] 6. Frontend Updates
  - Add typographic_analysis option to upload form
  - _Requirements: 1.1, 5.1_

  - [x] 6.1 Update source type dropdown
    - Add "Typographic Analysis" option to `sourceTypeSelect` in `index.html`
    - Map to `source_type=typographic_analysis` in form submission
    - _Requirements: 1.1_

  - [x] 6.2 Update uploadHandler for new source type
    - Ensure `uploadHandler.js` passes `typographic_analysis` to processing
    - Log source type selection
    - _Requirements: 1.1_

---

- [x] 7. Backward Compatibility Verification
  - Verify existing workflows are unaffected
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 7.1 Write backward compatibility tests
    - **Happy path**: `source_type=memorial` uses existing prompt, ignores new columns
    - **Happy path**: `source_type=monument_photo` works unchanged
    - **Happy path**: Old records retrievable via API with null for new fields
    - **Unhappy path**: Unknown `source_type` returns 400 with valid types list
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_

  - [x] 7.2 Verify existing tests pass
    - Run full test suite `npm test`
    - Verify no regressions in existing functionality
    - _Requirements: 5.1, 5.2, 5.3_

---

- [x]* 8. Integration Testing
  - End-to-end workflow verification
  - _Requirements: All_

  - [x] 8.1 End-to-end processing test
    - Upload test image with `source_type=typographic_analysis`
    - Mock AI provider response
    - Verify database storage
    - Verify API retrieval
    - _Requirements: 1.1, 4.1, 4.3_

  - [x] 8.2 Manual verification with real AI provider
    - Process actual monument photo
    - Verify transcription quality
    - Verify iconography extraction
    - Document results
    - _Requirements: 1.1, 2.1, 3.1_

---

- [x] 9. Documentation and Cleanup
  - Finalize documentation and code cleanup
  - _Requirements: All_

  - [x] 9.1 Update README.md
    - Add Typographic Analysis source type to features list
    - Document new database columns
    - Add usage example
    - _Requirements: 1.1_

  - [x] 9.2 Code cleanup
    - Remove any temporary code/comments
    - Ensure consistent JSDoc formatting
    - Run linter: `npm run lint`
    - _Requirements: All_

  - [x] 9.3 Final verification
    - Run full test suite: `npm test`
    - Verify migration script works on fresh database
    - Verify all acceptance criteria met
    - _Requirements: All_

---

## Test Commands Reference

```bash
# Run all tests
npm test

# Run specific test file
npm test __tests__/utils/prompts/templates/TypographicAnalysisPrompt.test.js

# Run migration tests
npm test __tests__/scripts/migrate-typographic-analysis.test.js

# Run database tests
npm test __tests__/utils/database.test.js

# Run results manager tests  
npm test __tests__/controllers/resultsManager.test.js

# Lint check
npm run lint
```

---

## Notes

- Tasks marked with `*` are optional integration/exploratory tests
- All other tests are required unit tests following TDD
- Each task should be committed separately with format: `feat: {description} (task X.Y)`
- Run `npm run lint` and `npm test` after each implementation task
