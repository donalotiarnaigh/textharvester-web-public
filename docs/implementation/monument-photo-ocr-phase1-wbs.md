### WBS — Monument Photo OCR (Phase 1)

#### Scope
Introduce automated monument cropping before OCR to cut file sizes while
preserving text clarity. The batch processing pipeline must remain fully
automatic and fall back gracefully when detection fails.

#### Progress Status
- **Step 1: Dependencies & configuration** ☐
- **Step 2: MonumentCropper module** ☐
- **Step 3: Pipeline integration** ☐
- **Step 4: Logging & metrics** ☐
- **Step 5: Testing** ☐
- **Step 6: Documentation** ☐

---

### 1) Dependencies & Configuration
**Files to modify**
- `package.json`
- `config.json`

**Implementation details**
- Add `opencv.js` dependency and ensure `sharp` remains at `^0.32.0`.
- Define feature flag `MONUMENT_CROPPING_ENABLED` and detection
  thresholds (`MONUMENT_MIN_WIDTH`, `MONUMENT_MIN_HEIGHT`,
  `MONUMENT_ASPECT_RATIO_MIN`, `MONUMENT_ASPECT_RATIO_MAX`).
- Expose new variables in `config.json` and document default values.

### 2) MonumentCropper Module
**Files to add**
- `src/utils/imageProcessing/monumentCropper.js`

**Implementation details**
- Export `detectAndCrop(imagePath)` returning a Sharp buffer or `null` on
  failure.
- Load image into OpenCV, convert to grayscale, blur, and run Canny edge
  detection.
- Search for rectangular contours; validate by size, aspect ratio and
  compactness.
- When valid region found, crop with Sharp using returned bounding box.
- Provide simple fallback that returns `null` when no monument detected.

### 3) Pipeline Integration
**Files to modify**
- `src/utils/fileProcessing.js`
- `src/utils/imageProcessor.js`

**Implementation details**
- In `processFile`, when `source_type === 'monument_photo'` and feature
  flag enabled, call `MonumentCropper.detectAndCrop()` before resizing.
- Update `optimizeImageForProvider` to accept either a file path or an
  image buffer; adjust all call sites accordingly.
- Ensure downstream analysis continues to operate on the cropped buffer
  or falls back to original image on detection failure.

### 4) Logging & Metrics
**Files to modify**
- `src/utils/logger.js` (if additional helper needed)
- `src/utils/fileProcessing.js`

**Implementation details**
- Log start, success and failure of monument detection with bounding box
  coordinates and size reduction percentage.
- Emit counters for detection success and fallback cases using existing
  metrics utilities.

### 5) Testing
**Files to add**
- `__tests__/unit/monumentCropper.test.js`
- `__tests__/integration/monument-cropping.test.js`

**Implementation details**
- Unit tests cover rectangle detection, contour fallback and validation
  rules using fixture images.
- Integration test validates that `processFile` outputs a smaller image
  when cropping succeeds and uses original image when it fails.
- Update existing `imageProcessor` tests for the new buffer overload.

### 6) Documentation
**Files to modify**
- `README.md`
- `docs/implementation/monument-photo-ocr-phase1-design.md`

**Implementation details**
- Document new environment variables, feature flag behaviour and
  troubleshooting tips.
- Link WBS and design document; describe how to enable monument
  cropping in development and production.

---

### ✅ Completion Criteria
- All steps above implemented and committed.
- Tests passing and feature flag defaulted to disabled until rollout.
- Documentation reflects new cropping pipeline.

