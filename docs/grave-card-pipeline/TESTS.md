# Manual Verification Plan - Grave Record Card Pipeline

This document outlines the manual tests required to verify the Grave Record Card features before merging to `main`.

## 1. Upload & Validation

### 1.1 Source Type Selection
- **Action**: Go to the upload page. Select "Grave Record Card" from the dropdown.
- **Expected**:
  - Help text updates to mention "Supported files: PDF (max 100MB)".
  - A warning or note appears: "Must be a 2-page PDF (Front & Back)".

### 1.2 File Validation
- **Action**: Try to upload a `.jpg` image with "Grave Record Card" selected.
- **Expected**:
  - The upload should be rejected (client-side or server-side error message).
- **Action**: Upload a 1-page PDF.
- **Expected**:
  - Processing should fail with an error about page count (visible in server logs or Results page error summary).

## 2. Pipeline Processing (End-to-End)

### 2.1 Successful Processing
- **Action**: Upload a valid 2-page PDF (Front/Back of a card).
- **Expected**:
  - Server logs show:
    - PDF split into 2 images.
    - Images stitched vertically.
    - AI Provider initialized with `GraveCardPrompt`.
  - The file appears in the Results table.

## 3. Results Display

### 3.1 Badge & Metadata
- **Action**: View the new entry in the Results table.
- **Expected**:
  - **Source Type**: Shows "Grave Record Card" with an **Amber/Yellow** badge.
  - **Processed Date**: Shows specific timestamp.
  - **Template**: Shows version of `GraveCardPrompt`.

### 3.2 Detail View (Expand Row)
- **Action**: Click the row to expand.
- **Expected**:
  - **Summary Panel**: Shows "Model & Prompt Information".
  - **Data Display**: Shows parsed JSON data including:
    - Section & Grave Number.
    - List of interments (Names, Dates, Ages).
    - Inscription text.

### 3.3 Enhanced UI Controls (New)
- **Action**: Check the top of the Results page.
- **Expected**:
  - **Summary Cards**: 4 cards visible (Total Cards, Interments, Occupied, Vacant). Counts match the data.
  - **Section Filter**: Dropdown is populated with sections from the uploaded cards (e.g., "A", "B").
  - **Grave Search**: Input field available.

### 3.4 Filtering Functionality
- **Action**: Select a Section from the dropdown.
- **Expected**: Table updates to show only records from that section. Summary stats verify.
- **Action**: Type a Grave Number (e.g., "101") into the search box.
- **Expected**: Table updates to show matches.
- **Action**: Click "Clear".
- **Expected**: All records reappear.

## 4. Data Export

### 4.1 CSV Export
- **Action**: Click "Download CSV".
- **Expected**:
  - File downloads (`results.csv`).
  - **Wide Format Check**: Open file. Confirm nested interments are flattened:
    - `interment_1_name`, `interment_1_date`
    - `interment_2_name`, `interment_2_date`
  - Metadata columns (`file_name`, `section`, `grave_number`) are present.

## 5. Database State (Optional)

### 5.1 Verification
- **Action**: Inspect `grave_cards` table in SQLite.
- **Expected**: `data_json` column contains valid JSON; `section` and `grave_number` columns are populated.
