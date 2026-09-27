---
name: Prompt Refinement
about: Enhancement to improve consistency between provider responses
title: 'Enhancement: Prompt Refinement for Provider Consistency'
labels: enhancement, prompt-engineering
assignees: ''
---

## Background

Initial testing of the provider-specific prompt system has revealed several inconsistencies between OpenAI (gpt-5.1-2024-11-20) and Anthropic (claude-3-7-sonnet-20250219) responses. While both providers successfully extract core information, there are systematic differences that could be addressed through prompt refinement.

## Test Results Summary

Testing was performed on 5 memorial inscriptions with the following key findings:

### Consistent Areas
- Core name extraction (first/last names)
- Basic structural parsing
- Handling of unreadable content (null values)
- Most memorial numbers

### Inconsistency Patterns
1. Date Interpretation:
   - Year differences (e.g., 1797 vs 1799)
   - Day variations in dates (e.g., July 25th vs 26th)

2. Text Formatting:
   - Punctuation variations
   - Location name formatting
   - Treatment of abbreviations

3. Memorial Numbers:
   - Occasional disagreement (e.g., #13 vs #15)

## Proposed Enhancements

1. Date Standardization
   - Add explicit instructions for date format
   - Request confidence scores for date interpretations
   - Specify handling of unclear digits

2. Location Name Processing
   - Define standard format for location names
   - Add guidelines for handling unclear place names
   - Specify punctuation rules

3. Memorial Number Validation
   - Add guidelines for identifying memorial numbers
   - Request confidence scores for number assignments
   - Define fallback behavior for unclear numbers

4. Text Normalization
   - Standardize punctuation rules
   - Define abbreviation handling
   - Specify capitalization requirements

## Success Criteria

1. 95%+ agreement on:
   - Memorial numbers
   - Death years
   - Core name fields

2. Standardized formatting for:
   - Location names
   - Dates
   - Punctuation

3. Consistent handling of:
   - Unclear text
   - Abbreviations
   - Special characters

## Implementation Steps

1. [ ] Review current prompt template
2. [ ] Draft enhanced prompt guidelines
3. [ ] Add format validation rules
4. [ ] Test with sample set
5. [ ] Compare provider consistency
6. [ ] Document final prompt template
7. [ ] Update unit tests

## Additional Notes

- Current test results are saved in `sample_data/test_results/`
- Both providers show strong base capabilities
- Focus should be on standardization rather than accuracy improvement 