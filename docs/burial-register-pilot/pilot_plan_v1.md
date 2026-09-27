# **St Luke’s Burial Register – OCR/HWR Pilot Plan (Final Copy-Pastable Version)**

## 1. Objectives

1.  Evaluate OCR/HWR performance using GPT-5.1 and Claude Opus/Sonnet on Volume 1 of the St Luke’s burial registers.

2.  Produce three datasets:

    -   `burials_vol1_gpt.csv`

    -   `burials_vol1_claude.csv`

    -   `burials_vol1_combined.csv`

3.  Provide an informal assessment comparing accuracy and viability for full-volume digitisation.


* * *

## 2. Scope

### **In Scope**

-   Volume 1 only (~210 pages).

-   One Textharvester run per page for GPT and Claude.

-   Flat CSV output (one row per burial entry).

-   Capture of header metadata and marginalia.

-   Combined CSV creation using rule-based fusion.

-   Small manually transcribed gold sample (50–100 entries).


### **Out of Scope**

-   Multi-volume pipeline.

-   Web/hosting work.

-   Data normalisation beyond “as written”.

-   Volunteer correction tooling.


* * *

## 3. Data Schema

Each CSV row = one burial entry.

### **Core Fields**

-   `volume_id`

-   `page_number`

-   `row_index_on_page`

-   `entry_id`

-   `entry_no_raw`

-   `name_raw`

-   `abode_raw`

-   `burial_date_raw`

-   `age_raw`

-   `officiant_raw`

-   `marginalia_raw`

-   `extra_notes_raw`

-   `row_ocr_raw`


### **Header Metadata (repeat per row)**

-   `parish_header_raw`

-   `county_header_raw`

-   `year_header_raw`


### **Model Metadata**

-   `model_name`

-   `model_run_id`

-   `uncertainty_flags`


### **Combined CSV Additional Fields**

-   `combined_uncertainty_flags`

-   (Optional) `chosen_source_model`


* * *

## 4. Textharvester JSON Schema

Use the following schema for each page's LLM output:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "StLukesBurialRegisterPage",
  "type": "object",
  "required": [
    "volume_id",
    "page_number",
    "parish_header_raw",
    "county_header_raw",
    "year_header_raw",
    "entries"
  ],
  "properties": {
    "volume_id": { "type": "string" },
    "page_number": { "type": "integer", "minimum": 1 },
    "parish_header_raw": { "type": "string" },
    "county_header_raw": { "type": "string" },
    "year_header_raw": { "type": "string" },
    "page_marginalia_raw": { "type": ["string", "null"] },
    "model_name": { "type": "string" },
    "model_run_id": { "type": "string" },
    "entries": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "row_index_on_page",
          "entry_id",
          "entry_no_raw",
          "name_raw",
          "abode_raw",
          "burial_date_raw",
          "age_raw",
          "officiant_raw",
          "row_ocr_raw",
          "uncertainty_flags"
        ],
        "properties": {
          "row_index_on_page": { "type": "integer", "minimum": 1 },
          "entry_id": { "type": "string" },
          "entry_no_raw": { "type": ["string", "null"] },
          "name_raw": { "type": ["string", "null"] },
          "abode_raw": { "type": ["string", "null"] },
          "burial_date_raw": { "type": ["string", "null"] },
          "age_raw": { "type": ["string", "null"] },
          "officiant_raw": { "type": ["string", "null"] },
          "marginalia_raw": { "type": ["string", "null"] },
          "extra_notes_raw": { "type": ["string", "null"] },
          "row_ocr_raw": { "type": ["string", "null"] },
          "uncertainty_flags": {
            "type": "array",
            "items": { "type": "string" }
          }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

* * *

## 5. Extraction Workflow

### **Step 1 — Page Processing**

-   Use Textharvester to feed each page image to:

    -   **Run A:** GPT-5.1 → JSON (schema above).

    -   **Run B:** Claude Opus/Sonnet → JSON (same schema).


### **Step 2 — Flattening to CSVs**

-   Convert each model’s JSON to a CSV:

    -   Extract each item in `entries[]` as one CSV row.

    -   Attach header metadata (`parish_header_raw`, etc.).

    -   Attach model metadata and uncertainty flags.

-   Save as:

    -   `burials_vol1_gpt.csv`

    -   `burials_vol1_claude.csv`


* * *

## 6. Combined CSV Logic

Join rows from GPT and Claude using:

```
(volume_id, page_number, row_index_on_page)
```

For each field (`entry_no_raw`, `name_raw`, `abode_raw`, `burial_date_raw`, `age_raw`, `officiant_raw`, `marginalia_raw`, `extra_notes_raw`):

1.  **If identical:**

    -   Use that value.

2.  **If one null/illegible:**

    -   Use the non-null value.

    -   Propagate the other model’s uncertainty flag.

3.  **If both present but disagree:**

    -   For `burial_date_raw`, `age_raw`: choose the one that parses cleanly.

    -   For names and places: choose the longer/non-truncated text.

    -   If still ambiguous: choose GPT (or Claude if preferred).

    -   Add a `models_disagree_<field>` flag.

4.  **Write out:**

    -   Chosen field values.

    -   `combined_uncertainty_flags`.

    -   Optional `chosen_source_model`.


Save as:

-   `burials_vol1_combined.csv`


* * *

## 7. Evaluation Plan

### **Gold Sample**

-   Hand-transcribe 50–100 entries (representative pages).

-   Save as `burials_vol1_gold_sample.csv`.


### **Metrics**

Compare GPT, Claude, and Combined outputs against gold on:

-   Exact match of `name_raw`

-   Exact match of `burial_date_raw`

-   Exact match of `age_raw`

-   Exact match of `abode_raw`

-   % rows where all core fields are correct


### **Sanity Checks**

-   Total entries vs expected.

-   Missingness per column.

-   Age plausibility.

-   Date plausibility (19th century).


* * *

## 8. Deliverables

1.  `burials_vol1_gpt.csv`

2.  `burials_vol1_claude.csv`

3.  `burials_vol1_combined.csv`

4.  `burials_vol1_gold_sample.csv`

5.  Informal assessment document summarising:

    -   Method

    -   Model performance

    -   Failure cases

    -   Recommendation for scaling to full register


* * *