# Next Steps: Burial Register Pilot Execution

**Status:** App implementation complete ✅  
**Next Phase:** Pilot execution and evaluation

---

## Overview

The textharvester-web application has been extended to support burial register processing. All implementation tasks are complete. The next phase is to **execute the pilot** according to the pilot plan.

---

## Immediate Next Steps

### 1. Process Volume 1 Pages (~210 pages)

**Objective:** Process all pages from Volume 1 with both GPT and Claude providers.

**Steps:**

1. **Prepare PDF pages**
   - Extract ~210 pages from Volume 1 PDF as individual images
   - Ensure pages are accessible and properly formatted
   - Verify page numbering matches expected sequence

2. **Run GPT Processing (Run A)**
   - Upload all pages to textharvester-web
   - Select source type: "Burial Register"
   - Select provider: "OpenAI" (GPT-4o)
   - Set volume ID: "vol1"
   - Process all pages
   - Verify all entries stored in database
   - Generate CSV: `node scripts/export-burial-register-csv.js gpt vol1`
   - Verify output: `data/burial_register/vol1/csv/burials_vol1_gpt.csv`

3. **Run Claude Processing (Run B)**
   - Upload same pages again
   - Select source type: "Burial Register"
   - Select provider: "Anthropic" (Claude Sonnet)
   - Set volume ID: "vol1"
   - Process all pages
   - Verify all entries stored in database
   - Generate CSV: `node scripts/export-burial-register-csv.js claude vol1`
   - Verify output: `data/burial_register/vol1/csv/burials_vol1_claude.csv`

**Expected Outputs:**
- `burials_vol1_gpt.csv` - All entries from GPT processing
- `burials_vol1_claude.csv` - All entries from Claude processing
- Page JSON files stored in `data/burial_register/vol1/pages/{provider}/`

---

### 2. Create Combined CSV

**Objective:** Merge GPT and Claude outputs using rule-based fusion logic.

**Approach:** Manual fusion using spreadsheet software or external script (as per pilot plan Section 6).

**Fusion Rules:**

Join rows using: `(volume_id, page_number, row_index_on_page)`

For each field (`entry_no_raw`, `name_raw`, `abode_raw`, `burial_date_raw`, `age_raw`, `officiant_raw`, `marginalia_raw`, `extra_notes_raw`):

1. **If identical:** Use that value
2. **If one null/illegible:** Use the non-null value, propagate uncertainty flag
3. **If both present but disagree:**
   - For `burial_date_raw`, `age_raw`: choose the one that parses cleanly
   - For names and places: choose the longer/non-truncated text
   - If still ambiguous: choose GPT (or Claude if preferred)
   - Add a `models_disagree_<field>` flag
4. **Write out:**
   - Chosen field values
   - `combined_uncertainty_flags`
   - Optional `chosen_source_model`

**Output:**
- `burials_vol1_combined.csv`

**Note:** This can be done in Excel/Google Sheets or with a simple script. The pilot plan indicates this is done outside textharvester-web.

---

### 3. Create Gold Sample

**Objective:** Hand-transcribe 50-100 representative entries for evaluation.

**Steps:**

1. **Select representative pages**
   - Choose pages that represent different:
     - Handwriting styles
     - Page conditions (clean vs. faded)
     - Entry types (simple vs. complex)
     - Time periods covered

2. **Manual transcription**
   - Transcribe entries exactly as written
   - Use same schema as CSV output
   - Save as: `burials_vol1_gold_sample.csv`

3. **Quality assurance**
   - Review for accuracy
   - Ensure all fields captured
   - Verify formatting matches CSV schema

**Output:**
- `burials_vol1_gold_sample.csv` - 50-100 manually transcribed entries

---

### 4. Evaluation and Metrics

**Objective:** Compare GPT, Claude, and Combined outputs against gold sample.

**Metrics to Calculate:**

For each model (GPT, Claude, Combined), compare against gold sample:

1. **Exact match rates:**
   - `name_raw` exact match %
   - `burial_date_raw` exact match %
   - `age_raw` exact match %
   - `abode_raw` exact match %

2. **Overall accuracy:**
   - % rows where all core fields are correct

3. **Sanity checks:**
   - Total entries vs expected
   - Missingness per column
   - Age plausibility (reasonable ranges)
   - Date plausibility (19th century range)

**Tools:**
- Spreadsheet formulas
- Python script (optional)
- Manual review

---

### 5. Create Assessment Document

**Objective:** Document findings and provide recommendations.

**Content:**

1. **Method**
   - Brief description of approach
   - Tools and models used
   - Processing workflow

2. **Model Performance**
   - Accuracy metrics (from Step 4)
   - Comparison between GPT and Claude
   - Combined CSV performance
   - Field-by-field analysis

3. **Failure Cases**
   - Common error patterns
   - Challenging entry types
   - Model-specific issues
   - Examples with images

4. **Recommendation for Scaling**
   - Viability for full register digitization
   - Recommended approach (GPT, Claude, or Combined)
   - Estimated effort and cost
   - Quality assurance requirements
   - Suggested improvements

**Output:**
- Informal assessment document (markdown or PDF)

---

## Deliverables Checklist

- [ ] `burials_vol1_gpt.csv` - GPT processing output
- [ ] `burials_vol1_claude.csv` - Claude processing output
- [ ] `burials_vol1_combined.csv` - Merged output with fusion logic
- [ ] `burials_vol1_gold_sample.csv` - 50-100 manually transcribed entries
- [ ] Assessment document - Performance analysis and recommendations

---

## Technical Notes

### Processing Workflow

1. **Page Processing:**
   - Each page processed twice (once per provider)
   - Page JSON stored as reference artifact
   - Entries stored in database
   - CSV generated after all pages processed

2. **CSV Export:**
   ```bash
   # Generate GPT CSV
   node scripts/export-burial-register-csv.js gpt vol1
   
   # Generate Claude CSV
   node scripts/export-burial-register-csv.js claude vol1
   ```

3. **Data Location:**
   - CSVs: `data/burial_register/vol1/csv/`
   - Page JSON: `data/burial_register/vol1/pages/{provider}/`
   - Database: `data/memorials.db` (table: `burial_register_entries`)

### Quality Assurance

- Monitor processing for errors
- Verify entry counts match expected
- Check for missing pages
- Review sample entries manually
- Validate CSV structure matches schema

---

## Timeline Estimate

- **Page Processing:** 1-2 days (depending on API rate limits)
- **Combined CSV Creation:** 1-2 hours
- **Gold Sample Creation:** 1-2 days (manual transcription)
- **Evaluation:** 1 day
- **Assessment Document:** 1 day

**Total:** ~5-7 days

---

## Success Criteria

✅ All ~210 pages processed with both providers  
✅ Two CSV files generated (GPT and Claude)  
✅ Combined CSV created with fusion logic  
✅ Gold sample of 50-100 entries created  
✅ Evaluation metrics calculated  
✅ Assessment document completed with recommendations  

---

## References

- **Pilot Plan:** `/Users/danieltierney/projects/historic-graves/11_Douglas/pilot_plan_v1.md`
- **Technical Design:** `docs/burial-register-pilot/TECH_DESIGN.md`
- **Task List:** `docs/burial-register-pilot/TASKS.md`

---

**Last Updated:** 2025-01-27  
**Status:** Ready for Pilot Execution

