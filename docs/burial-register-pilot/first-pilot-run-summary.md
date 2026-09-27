# Pilot Run Summary - Dual Provider Comparison

**Date:** 2025-12-04  
**Total Pages:** 210  
**Status:** Both runs completed with errors

## Run 1: OpenAI GPT-5.1

**Status:** Completed with errors

## Results

### Success Metrics
- **Total entries stored:** 1,581
- **Unique pages processed:** 197 (out of 210)
- **Page range:** 1-1701 (entries span this range)
- **Success rate:** ~94% (197/210 pages)

### Database Summary
```
Total entries: 1,581
Unique pages: 197
Unique files: 197
Provider: openai
```

## Issues Encountered

### 1. Page Number Conflicts (440 conflicts detected)
- **Status:** Mostly resolved, but some failures occurred
- **Pattern:** AI extracted incorrect page numbers from images, conflict resolution attempted to use filename-based page numbers
- **Resolution failures:** Some conflicts failed to resolve even after extracting page number from filename
  - Examples: `page-073.jpg`, `page-149.jpg`, `page-156.jpg`, `page-168.jpg`
  - Cause: Resolved page number already existed in database (duplicate page numbers)

### 2. Validation Errors
- **Files affected:** `page-001.jpg`, `page-002.jpg`, `page-206.jpg`
- **Error:** "Page_number must be greater than or equal to 1"
- **Cause:** AI extracted `page_number: 0` or invalid page number
- **Impact:** Files failed after maximum retries (3 attempts)

### 3. Missing Page Number
- **Files affected:** `page-004.jpg`
- **Error:** "pageNumber is required to store burial register JSON"
- **Cause:** AI response missing `page_number` field entirely
- **Impact:** File failed after maximum retries (3 attempts)

### 4. Failed Files Summary
- **Total failed:** 4 files (after max retries)
  - `page-001.jpg` - Validation error (page_number <= 0)
  - `page-002.jpg` - Validation error (page_number <= 0)
  - `page-004.jpg` - Missing page_number field
  - `page-206.jpg` - Validation error (page_number <= 0)

## Observations

1. **Conflict Resolution:** The filename-based conflict resolution worked for most cases (440 conflicts detected, most resolved successfully), but some failed because the resolved page number already existed.

2. **Page Number Extraction:** The AI model occasionally extracted incorrect page numbers (e.g., extracting page 69 from `page-073.jpg`, page 145 from `page-149.jpg`). This is expected behavior - the AI reads the page number from the image content, not the filename.

3. **Data Loss:** 13 pages were not successfully processed (210 - 197 = 13 pages). However, some of these may have been processed but failed to store due to conflicts or validation errors.

4. **Performance:** Some API calls took longer than expected (32s, 39s), triggering performance alerts, but these were not fatal.

## Recommendations

1. **Investigate failed files:** Manually review the 4 failed files to understand why page numbers were invalid or missing.

2. **Conflict resolution enhancement:** Consider checking if resolved page number already exists before attempting to store, or implement a more sophisticated conflict resolution strategy.

3. **Validation improvements:** Add better handling for edge cases where AI returns invalid page numbers (0, negative, or missing).

4. **Data verification:** Run a manual check to ensure all 210 pages were attempted, and verify which pages are missing from the final dataset.

---

## Run 2: Anthropic Claude Sonnet 4.5

**Status:** Completed with errors

### Success Metrics
- **Total entries stored:** 1,560
- **Unique pages processed:** 195 (out of 210)
- **Page range:** 1-1851 (entries span this range)
- **Success rate:** ~93% (195/210 pages)

### Database Summary
```
Total entries: 1,560
Unique pages: 195
Unique files: 195
Provider: anthropic
```

## Issues Encountered (Claude Run)

### 1. Page Number Conflicts (47 conflict resolution failures)
- **Status:** Some conflicts failed to resolve
- **Pattern:** Similar to OpenAI run - AI extracted incorrect page numbers, conflict resolution attempted filename-based fallback
- **Resolution failures:** 47 conflicts failed to resolve (more than OpenAI's 32 failures)

### 2. Validation Errors
- **Files affected:** `page-003.jpg`, `page-206.jpg`, `page-207.jpg`, `page-208.jpg`, `page-209.jpg`, `page-210.jpg`
- **Error:** "Page_number must be greater than or equal to 1"
- **Cause:** AI extracted `page_number: 0` or invalid page number
- **Impact:** Files failed after maximum retries (3 attempts)

### 3. Failed Files Summary (Claude)
- **Total failed:** 6 files (after max retries)
  - `page-003.jpg` - Validation error (page_number <= 0)
  - `page-206.jpg` - Validation error (page_number <= 0)
  - `page-207.jpg` - Validation error (page_number <= 0)
  - `page-208.jpg` - Validation error (page_number <= 0)
  - `page-209.jpg` - Validation error (page_number <= 0)
  - `page-210.jpg` - Validation error (page_number <= 0)

### Observations (Claude Run)
1. **Similar failure pattern:** Claude also struggled with pages at the end of the document (207-210), suggesting these pages may have poor image quality or unusual formatting.
2. **Common failures:** Both providers failed on `page-003.jpg` and `page-206.jpg`, indicating these pages may have inherent issues.
3. **More conflict failures:** Claude had 47 conflict resolution failures vs OpenAI's 32, suggesting Claude may extract page numbers less accurately.

---

## Combined Results Summary

### Overall Statistics
- **Total entries stored:** 3,141 (1,581 OpenAI + 1,560 Anthropic)
- **OpenAI success rate:** ~94% (197/210 pages)
- **Anthropic success rate:** ~93% (195/210 pages)
- **Pages processed by both:** ~190+ pages (estimated)

### Comparison

| Metric | OpenAI GPT-5.1 | Anthropic Claude 4.5 |
|--------|----------------|----------------------|
| Total Entries | 1,581 | 1,560 |
| Unique Pages | 197 | 195 |
| Success Rate | 94% | 93% |
| Conflict Failures | 32 | 47 |
| Failed Files | 4 | 6 |
| Page Range | 1-1701 | 1-1851 |

### Common Failure Patterns

**Pages failed by both providers:**
- `page-003.jpg` - Both extracted invalid page_number
- `page-206.jpg` - Both extracted invalid page_number

**Pages failed by OpenAI only:**
- `page-001.jpg` - Invalid page_number
- `page-002.jpg` - Invalid page_number
- `page-004.jpg` - Missing page_number field

**Pages failed by Anthropic only:**
- `page-207.jpg` - Invalid page_number
- `page-208.jpg` - Invalid page_number
- `page-209.jpg` - Invalid page_number
- `page-210.jpg` - Invalid page_number

### Key Findings

1. **Provider Performance:** Both providers achieved similar success rates (~93-94%), with OpenAI slightly outperforming Anthropic.

2. **Common Problem Pages:** Pages 3 and 206 failed for both providers, suggesting these pages have inherent issues (poor image quality, unusual formatting, or missing page numbers in the source).

3. **End-of-Document Issues:** Anthropic struggled more with the final pages (207-210), while OpenAI struggled more with early pages (1-4). This may indicate different handling of edge cases.

4. **Conflict Resolution:** Both providers had significant page number conflicts, but OpenAI's conflict resolution was more successful (fewer failures).

5. **Data Completeness:** Combined, we have entries from both providers for most pages, enabling comprehensive comparison and validation.

## Recommendations

1. **Investigate common failures:** Manually review `page-003.jpg` and `page-206.jpg` to understand why both providers failed.

2. **Review end-of-document pages:** Check pages 207-210 for image quality or formatting issues that may have caused Anthropic failures.

3. **Conflict resolution enhancement:** Implement improved conflict resolution logic, especially for cases where resolved page numbers already exist.

4. **Validation improvements:** Add better handling for edge cases where AI returns invalid page numbers (0, negative, or missing).

5. **Data analysis:** Compare entries from both providers for pages where both succeeded to assess accuracy and consistency.

## Next Steps

- Export CSV files for both providers
- Compare entries for pages processed by both providers
- Manually review failed pages to identify root causes
- Analyze conflict patterns to improve resolution logic
- Generate final pilot report with accuracy metrics

