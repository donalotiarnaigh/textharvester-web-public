# Burial Register Pilot — Test Data Preparation

This document defines the concrete test artefacts required for pilot validation. The goal is to exercise both providers on a small but representative subset of Volume 1 before the full ~210-page run.

## 1. Sample Pages for Testing (9.1.1)

Select the following pages from Volume 1. They cover clean text, handwriting variation, marginalia, damaged rows, and year transitions. File names follow the existing `page_{NNN}.png` convention used elsewhere in the pilot docs.

| Page image | Why this page is included | Primary focus |
| --- | --- | --- |
| `page_001.png` | Earliest page with clean print and simple two-row sample already in `burials_sample.csv`. | Baseline validation of field mapping and CSV headers. |
| `page_017.png` | Typical handwriting with occasional blotting. | Age/abode transcription accuracy under light artifacts. |
| `page_042.png` | Contains margin notes beside two entries. | Marginalia capture (`marginalia_raw`, `extra_notes_raw`). |
| `page_089.png` | Mid-volume page with partial row tear. | Uncertainty flagging and robustness to missing fragments. |
| `page_133.png` | Page where the year header increments mid-book. | Header propagation and date interpretation stability. |
| `page_198.png` | Late-volume dense handwriting with abbreviations. | Row OCR support and abbreviation handling. |

## 2. Expected Output Examples (9.1.2)

Use the sample CSV rows below as the reference structure and formatting for validation. They mirror the column order and value shapes produced by the pipeline (including JSON-string `uncertainty_flags`).

```
volume_id,page_number,row_index_on_page,entry_id,entry_no_raw,name_raw,abode_raw,burial_date_raw,age_raw,officiant_raw,marginalia_raw,extra_notes_raw,row_ocr_raw,parish_header_raw,county_header_raw,year_header_raw,model_name,model_run_id,uncertainty_flags,file_name,ai_provider,prompt_template,prompt_version,processed_date
vol1,1,1,vol1_p001_r001,1,Alice Carter,Bermondsey,1850-01-02,34,J Smith,,clear entry,"Alice Carter 1850-01-02",St Luke's,London,1850,gpt-5.1,run-sample,"[\"clean_entry\"]",page_001.png,openai,burialRegister,latest,2025-01-01T00:00:00Z
vol1,1,2,vol1_p001_r002,2,Benjamin Turner,Southwark,1850-01-03,41,H Lewis,"ink smudge",age uncertain,"Benjamin Turner 1850-01-03",St Luke's,London,1850,gpt-5.1,run-sample,"[\"age_uncertain\"]",page_001.png,openai,burialRegister,latest,2025-01-01T00:00:00Z
```

For the additional sample pages (`page_017.png`, `page_042.png`, `page_089.png`, `page_133.png`, `page_198.png`), record expected outcomes as short notes attached to each upload (e.g., “two margin notes expected; one age unreadable; header year should remain 1851”).

## 3. Test Scenarios (9.1.3)

Run the following scenarios for each sample page:

1. **Single-provider sanity:** Process once with GPT; confirm CSV row shape matches the example and page JSON is stored under `data/burial_register/vol1/pages/gpt/`.
2. **Dual-provider comparison:** Re-run the same page with Claude; verify entries share `entry_id` values but differ in `ai_provider` and `model_name`.
3. **Uncertainty handling:** On pages with damage (`page_089.png`), confirm the flattener and validation steps retain uncertainty flags as JSON strings and do not drop rows.
4. **Header propagation:** On `page_133.png`, check that `parish_header_raw`, `county_header_raw`, and `year_header_raw` match the page headers in every row.
5. **Marginalia capture:** On `page_042.png`, confirm marginalia text appears in `marginalia_raw` or `extra_notes_raw` and is preserved in the stored page JSON and database rows.

## 4. Validation Checklist (9.1.4)

Use this checklist after each scenario:

- [ ] Uploaded filename matches the expected `page_{NNN}.png` pattern for the chosen sample.
- [ ] Page JSON saved under the correct provider subdirectory with zero-padded page number.
- [ ] Number of CSV rows equals the number of `entries` in the returned page JSON.
- [ ] Each row includes populated `volume_id`, `page_number`, `row_index_on_page`, and `entry_id` with the `vol1_p###_r###` format.
- [ ] `uncertainty_flags` is a JSON string and retains every flag emitted by the model.
- [ ] Header fields (`parish_header_raw`, `county_header_raw`, `year_header_raw`) match the page and are repeated for every row.
- [ ] No memorial-related prompts or storage paths are invoked during processing (burial-register-only flow).
