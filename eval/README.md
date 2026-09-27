# Evaluation Framework

Ground truth dataset and scoring tools for measuring TextHarvester extraction accuracy.

## Directory Layout

```
eval/
├── ground-truth/               # REAL ground truth — LOCAL ONLY, gitignored
│   ├── burial-registers/       # One .gt.json per source page image
│   ├── grave-cards/            # One .gt.json per source card image
│   └── memorials/              # One .gt.json per source memorial image
├── fixtures/
│   └── synthetic/              # Tracked, fabricated .gt.json examples (same layout)
├── scripts/
│   ├── export-for-annotation.js  # Generate GT stubs from pipeline output
│   └── score.js                  # Scoring engine + CLI
├── reports/                    # Generated eval reports (gitignored)
└── README.md
```

## Ground truth is deliberately not committed

This repository is **public**, but the ground truth transcribes real client records —
names, dates and full inscriptions from actual memorials, grave cards and burial
registers. Source images were already excluded; the transcriptions derived from them
are excluded too.

`eval/ground-truth/` is in `.gitignore`. Keep the real dataset in your working copy:

- `npm run eval` and `npm run eval:check` read it from `eval/ground-truth/` as before
- it is never committed, and never appears in a diff
- `eval/source-images/` is likewise local-only

For anything that needs to run without client data — CI, a fresh clone, a
contributor, or a demo — use the **synthetic fixtures** in `eval/fixtures/synthetic/`.
They use the same schema with obviously fabricated names:

```bash
npm run eval:synthetic
```

## Quick Start

### 1. Generate a ground truth stub

Run a source image through the pipeline and produce an annotatable `.gt.json` file:

```bash
npm run eval:export -- --image path/to/image.jpg --type burial_register --provider openai
```

### 2. Annotate

Open the `.gt.json` file alongside the source image. Correct every field in the `corrected` section against what you can see in the image. Follow the [Transcription Guidelines](../docs/ground-truth-guidelines.md).

- Record changed field names in `corrections_made`
- Set `difficulty` (1–5)
- Add `annotator_notes` for anything unusual

### 3. Score

```bash
# Full report across all document types
npm run eval

# Single document type
npm run eval -- --type burial_register

# Score a different ground-truth directory (e.g. the synthetic fixtures)
npm run eval -- --dir eval/fixtures/synthetic
npm run eval:synthetic

# CI gate (exit 1 if overall accuracy < 0.85)
npm run eval:check
```

Reports are written to `eval/reports/`.

> `eval:check` gates on the real dataset and needs at least 50 entries before the
> floor is enforced, so it is a local gate — it is not wired into CI, which has no
> access to the real ground truth.

## Ground Truth File Format

Each `.gt.json` file represents one source image. Common envelope:

```json
{
  "schema_version": "1.0.0",
  "document_type": "burial_register",
  "image_ref": "relative/path/to/source.jpg",
  "annotator": "daniel",
  "annotation_date": "2026-04-14",
  "blind_transcribed": false,
  "difficulty": 3,
  "annotator_notes": "Faded ink in bottom third"
}
```

Document-type-specific fields contain `model_output`, `corrected`, and `corrections_made` at the entry level.

The tracked, readable examples of the full schema are the synthetic fixtures — start there:

- `eval/fixtures/synthetic/memorials/synthetic-memorial-0001.gt.json` — `records[]` array
- `eval/fixtures/synthetic/burial-registers/synthetic-register-0001.gt.json` — `page_level` plus `entries[]`
- `eval/fixtures/synthetic/grave-cards/synthetic-card-0001.gt.json` — single `model_output`/`corrected` pair

Each fixture deliberately includes one record with no corrections and one with a
deliberate correction, so those two files exercise the perfect-match and
error paths of the scorer.

## Metrics

- **Exact match**: fraction of fields where model output matches ground truth exactly
- **CER** (Character Error Rate): edit distance / reference length, for text fields
- **needs_review F1**: precision/recall of the model's review flagging vs actual corrections needed

## References

- [Transcription Guidelines](../docs/ground-truth-guidelines.md)
- [Issue #242](https://github.com/donalotiarnaigh/textharvester-web-public/issues)
