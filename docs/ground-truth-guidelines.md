# Ground Truth Transcription Guidelines

_Version 1.0.0 — 2026-04-14_

These guidelines govern how ground truth records are created for the TextHarvester evaluation dataset. Every annotator must follow these conventions to ensure consistency across the dataset.

> **Handling.** Ground truth transcribes real client records and is **not committed**
> — `eval/ground-truth/` is gitignored and stays on the annotator's machine, as do
> the source images in `eval/source-images/`. Committing either would publish names,
> dates and inscriptions from real memorials, grave cards and burial registers in a
> public repository. Use the fabricated fixtures under `eval/fixtures/synthetic/`
> for anything that needs to be shared, tested or demonstrated.

---

## General Principles

1. **Transcribe what you see.** Record the text exactly as it appears on the source image. Do not correct spelling, expand abbreviations, or normalise formatting.
2. **Look at the image, not the model output.** When correcting model output, always verify against the source image. The model output is a starting point, not a reference.
3. **When in doubt, record the ambiguity.** Use the `annotator_notes` field to document uncertain readings rather than silently guessing.

---

## Text Conventions

### Illegible characters

Use one dash per estimated illegible character:

| Image shows | Transcribe as |
|-------------|---------------|
| Clearly "John" | `John` |
| "J" then 3 illegible chars then "n" | `J---n` |
| Entirely illegible word (~5 chars) | `-----` |

**Do not use** `[?]`, `[illegible]`, `[weathered]`, or any bracketed markers.

### Line breaks

Use the pipe character `|` to represent line breaks within a field:

```
IN LOVING MEMORY OF|JOHN SMITH|WHO DIED 15TH MARCH 1923
```

### Original spelling and formatting

- Preserve original spelling exactly — do not autocorrect
- Preserve original capitalisation
- Preserve long-s (ſ) and thorn (þ) where visible
- Preserve punctuation as written

---

## Null vs Empty String

| Situation | Value |
|-----------|-------|
| Field exists on the document but the cell/space is blank | `""` (empty string) |
| Field does not structurally exist for this record | `null` |
| Field exists but is entirely illegible | Use dashes: `"-----"` |

---

## Burial Registers

### Ditto marks

Transcribe ditto marks literally as they appear. Do **not** expand them.

| Image shows | Transcribe as |
|-------------|---------------|
| `do.` | `do.` |
| `D°` | `D°` |
| `"` (quotation mark meaning ditto) | `"` |

### Dates (burial_date_raw)

Transcribe exactly as written. Do not normalise to ISO format.

| Image shows | Transcribe as |
|-------------|---------------|
| March 15th 1842 | `March 15th 1842` |
| 15 Mar. 1842 | `15 Mar. 1842` |
| do. | `do.` |

### Ages (age_raw)

Transcribe exactly as written. Do not convert units.

| Image shows | Transcribe as |
|-------------|---------------|
| 84 | `84` |
| 3 months | `3 months` |
| infant | `infant` |
| stillborn | `stillborn` |
| 6 wks | `6 wks` |

### Entry numbers (entry_no_raw)

Transcribe exactly, including irregular numbering: `137`, `137a`, `--`.

### Page-level headers

- `parish_header_raw`, `county_header_raw`, `year_header_raw`: transcribe only what is **visually printed on this page**
- If the header is carried over from a previous page and not printed on the current page, set to `null`
- Do not propagate or infer values from other pages

### Multi-line names or abodes

Join with pipe: `John Smith|alias Jones`, `Blackpool|Cork City`.

### Marginalia

Transcribe all marginal notes visible on the page. If none, set to `null`.

---

## Memorials

### Multi-person memorials

Create **one record per person** commemorated on the memorial. The `inscription` field contains the full shared inscription text, duplicated on each record.

Example: A memorial listing husband and wife produces two records, both with the same `inscription` but different `first_name`, `last_name`, `year_of_death`.

### Memorial number

Transcribe exactly as marked on the image. Ignore prefixes like "HG-" or "M-" — record only the number.

### Year of death ranges

Transcribe as written: `1914-1918`, `c.1850`, `18--`.

### Names

Record exactly as written on the memorial. Do not normalise:
- `MICHEAL` stays `MICHEAL` (not corrected to Michael)
- Preserve capitalisation as it appears

---

## Grave Record Cards

### data_json structure

The ground truth `corrected` field contains the full JSON object matching the model's output schema (location, grave, interments, inscription, sketch).

### Interments array

- One object per interment, ordered top-to-bottom as they appear on the card
- Missing fields within an interment: `null`

### Dates

Transcribe as written on the card. Both `date_of_death` and `date_of_burial` are strings, not normalised.

### Sketch field

Set to `null` in ground truth. Sketch content is not evaluable as text extraction.

---

## Difficulty Rating

Rate each source image on a 1–5 scale:

| Rating | Description | Examples |
|--------|-------------|----------|
| 1 | Printed or typescript, fully legible | Typed grave record card |
| 2 | Clear handwriting, standard layout | Well-preserved register page |
| 3 | Some illegible words, faded ink, or unusual abbreviations | Partially faded register |
| 4 | Substantially degraded, multiple illegible sections | Water-damaged page |
| 5 | Barely legible, severely damaged | Heavily weathered memorial |

---

## Blind Transcription

For 15–20% of the dataset, annotate **without looking at the model output**:

1. Set `blind_transcribed: true` in the GT file
2. Open only the source image and the empty `corrected` fields
3. Transcribe every field from the image alone
4. After completing the blind transcription, compare against `model_output` to populate `corrections_made`

This subset measures anchoring bias and provides a self-calibration score.

---

## Corrections Tracking

The `corrections_made` array lists every field name where `corrected` differs from `model_output`:

```json
"corrections_made": ["burial_date_raw", "age_raw", "name_raw"]
```

This enables automatic error analysis — which fields does the model get wrong most often, and at which difficulty levels?

---

## Versioning

- This document is versioned. The current version is referenced in every GT file via `transcription_guidelines_version`.
- When guidelines change, increment the version and note what changed below.

### Changelog

- **1.0.0** (2026-04-14): Initial guidelines.
