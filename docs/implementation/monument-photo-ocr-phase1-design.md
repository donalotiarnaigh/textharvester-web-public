# Monument Photo OCR – Phase 1: Intelligent Cropping

Refer to [work breakdown structure](monument-photo-ocr-phase1-wbs.md) for implementation steps.

## 1. Current State Summary
Phase 0 added end-to-end monument photo OCR by introducing a `source_type=monument_photo` upload mode and provider-specific prompt templates. The backend resizes images with Sharp so that the base64 payload stays within provider limits (5 MB for Anthropic, 20 MB for OpenAI). When images exceed the limit they are down‑scaled, which can reduce text legibility and OCR accuracy.

## 2. Problem Statement
High‑resolution monument photos contain large amounts of background detail. Even after aggressive JPEG compression, files often remain too large for API calls. Down‑scaling reduces the size but also lowers definition, which hurts OCR accuracy.

## 3. Goal
Introduce an automated cropping step that detects the monument’s bounds and removes the surrounding background before resizing. Cropping the monument first should:
- Reduce average file size by ~60 %
- Keep text definition high, improving OCR accuracy
- Decrease upload and processing time

## 4. Proposed Architecture
### 4.1 New Module: `MonumentCropper`
- Location: `src/utils/imageProcessing/monumentCropper.js`
- Responsibilities:
  - Detect monument region using color and edge analysis via Sharp
  - Return bounding box coordinates `{ x, y, width, height }`
  - Crop the image with Sharp and return a buffer
- Configurable thresholds (min area, aspect ratio, compactness) read from environment variables.

### 4.2 Pipeline Updates
1. **Upload** – unchanged: `uploadHandler` still enqueues files with `source_type`.
2. **Processing** – `fileProcessing.processFile()` will:
   - When `source_type === 'monument_photo'` and `MONUMENT_CROPPING_ENABLED` is `true`, call `MonumentCropper.detectAndCrop(imagePath)`.
   - If cropping succeeds, pass the cropped buffer to `optimizeImageForProvider()` via a new overload that accepts a buffer.
   - If detection fails, log a warning and proceed with the original image.
3. **Optimization & OCR** – existing resizing and provider calls remain unchanged.

### 4.3 Data Flow Diagram
```
Upload → fileProcessing → MonumentCropper (optional) → optimizeImageForProvider → AI Provider → DB
```

## 5. Configuration
Environment variables (defaults shown):
```bash
MONUMENT_CROPPING_ENABLED=false
MONUMENT_MIN_WIDTH=400
MONUMENT_MIN_HEIGHT=400
MONUMENT_ASPECT_RATIO_MIN=0.5
MONUMENT_ASPECT_RATIO_MAX=2.0
```

## 6. Logging & Metrics
- Log detection start, chosen method, and final crop rectangle.
- Record file size before/after cropping and percentage reduction.
- Metrics to monitor:
  - Detection success rate
  - Average file size reduction
  - OCR accuracy vs. Phase 0 baseline

## 7. Testing Strategy
- **Unit tests** for `MonumentCropper` using fixture images:
  - Detect rectangle with clear edges
  - Handle images where no monument is found (returns `null`)
- **Integration tests**:
  - Verify cropped images fall under provider limits and are processed correctly.
  - Ensure record sheet flow remains unaffected.
- **Manual regression** with a sample batch of monument photos to verify accuracy improvements.

## 8. Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Node module vulnerabilities | Regular security audits; pin safe versions |
| Incorrect cropping removes text | Conservative thresholds and extensive test fixtures |
| Performance impact | Crop only when `source_type` is `monument_photo` and feature flag enabled |

## 9. Future Enhancements
- Confidence scoring and multiple detection strategies
- Orientation correction for skewed photos
- Optional preview/adjustment UI for manual overrides

## 10. Alternatives Considered
Given those drawbacks, the Sharp-based edge detection approach above is the simplest method that reliably isolates monuments across varied lighting and backgrounds.

*Status: draft – January 2025*
