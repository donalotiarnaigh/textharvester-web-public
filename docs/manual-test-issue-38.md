# Manual Test Plan: Issue #38 — Background PDF Conversion

## Overview
This manual test verifies that PDF conversion is offloaded to background process, allowing upload responses to return within 500ms.

## Prerequisites

1. **Sample Data**: Multi-page PDF files for testing
   - Create test PDFs or use existing ones from `test-data/` directory
   - Minimum: 2-3 page PDF for observable conversion time

2. **Development Server Running**:
   ```bash
   npm run dev
   # OR
   npm start
   ```

3. **CLI Setup** (for batch testing):
   ```bash
   npm install -g  # Install locally if not done
   # OR use: node src/cli/index.js <command>
   ```

4. **Monitoring Tools**:
   - Browser DevTools (Network tab for timing)
   - Terminal with `curl` or similar for HTTP timing
   - Optional: `time` command for CLI testing

---

## Test Scenarios

### Scenario 1: Single PDF Upload via Web UI
**Objective**: Verify HTTP response returns within 500ms for multi-page PDF

#### Steps:
1. Open http://localhost:3000/upload in browser
2. Open DevTools (F12) → Network tab
3. Select a multi-page PDF (5+ pages) as "Burial Register" upload
4. **Record time**: Click Upload and note the response time in Network tab
5. Expected: Response status 200 within ~300-500ms
6. Do NOT wait for actual processing to complete

#### Verification:
```
✓ Response received within 500ms
✓ HTTP Status 200
✓ Message: "File upload complete. Starting conversion..."
✓ prompt config included in response
```

#### What should NOT happen:
```
✗ Response time > 2 seconds (would indicate PDF conversion blocking)
✗ 504 timeout
✗ Processing complete before response (conversion should be async)
```

---

### Scenario 2: Mixed File Types Upload
**Objective**: Verify non-PDF files enqueued immediately, PDFs deferred

#### Setup:
- Prepare test files:
  - `test_image.jpg` (single image)
  - `test_document.pdf` (2-page PDF)

#### Steps:
1. Upload both files together via web UI
2. Immediately (within 1 second) visit http://localhost:3000/processing-status
3. Check response in browser console: `fetch('/processing-status').then(r => r.json()).then(d => console.log(d))`

#### Expected Response:
```json
{
  "status": "converting",
  "progress": 0,
  "conversion": {
    "total": 1,
    "completed": 0,
    "currentFile": "test_document.pdf",
    "errors": []
  },
  "queue": {...}
}
```

#### Verification:
```
✓ State is 'converting' (not 'processing')
✓ Conversion object includes PDF metadata
✓ Progress endpoint reflects conversion progress
```

---

### Scenario 3: Progress Tracking During Conversion
**Objective**: Verify progress endpoint shows conversion → processing → complete states

#### Steps:
1. Upload 3-page PDF via UI
2. Immediately start polling progress every 1 second:
   ```javascript
   setInterval(() => {
     fetch('/processing-status').then(r => r.json()).then(d => {
       console.log(`[${new Date().toLocaleTimeString()}] State: ${d.status}, Progress: ${d.progress}%, Conversion: ${d.conversion ? 'active' : 'done'}`);
     });
   }, 1000);
   ```
3. Observe state transitions in console

#### Expected Timeline:
```
T+0s:   State: converting, Progress: 0%, Conversion: {total:1, completed:0}
T+2s:   State: converting, Progress: 0%, Conversion: {total:1, completed:0}
T+4s:   State: converting, Progress: 0%, Conversion: {total:1, completed:1}  ← PDF done
T+6s:   State: processing,  Progress: 20%, Conversion: null               ← Now processing JPEGs
T+10s:  State: processing,  Progress: 60%, Conversion: null
T+15s:  State: complete,    Progress: 100%, Conversion: null              ← All done
```

#### Verification:
```
✓ State transitions: converting → processing → complete
✓ Conversion object present when converting, null when done
✓ Progress increases smoothly during processing phase
✓ Final state is 'complete' with progress 100%
```

---

### Scenario 4: CLI Ingest with Large PDF
**Objective**: Verify background conversion in CLI mode

#### Setup:
Prepare a 10-page PDF in test directory:
```bash
mkdir -p test-data/pdfs
# Copy or generate a 10-page PDF → test-data/pdfs/large.pdf
```

#### Steps:
1. Run CLI ingest with timing:
   ```bash
   time npm run ingest -- test-data/pdfs/large.pdf \
     --source-type burial_register \
     --provider openai \
     --verbose
   ```

2. Observe output for key markers:
   - "Enqueued X burial register files for processing"
   - Should appear **before** any file processing messages
   - Processing should start in background

3. Check database after completion:
   ```bash
   npm run query -- list --source-type burial_register | head -20
   ```

#### Verification:
```
✓ "Enqueued" message appears early (conversion is background)
✓ Processing messages appear after enqueuing
✓ All JPEG pages processed (if 10-page PDF, expect ~10 entries)
✓ Total time is reasonable (not blocked on conversion)
```

---

### Scenario 5: Error Handling — Corrupt PDF
**Objective**: Verify conversion errors are captured and reported

#### Setup:
Create a corrupt PDF:
```bash
echo "This is not a PDF" > test-data/pdfs/corrupt.pdf
```

#### Steps:
1. Upload corrupt PDF via web UI
2. Wait 5 seconds, then check progress:
   ```javascript
   fetch('/processing-status').then(r => r.json()).then(d => console.log(d.errors));
   ```

#### Expected Response:
```json
{
  "errors": [
    {
      "fileName": "corrupt.pdf",
      "errorType": "conversion_failed",
      "errorMessage": "PDF conversion failed: Error message from pdftoimage"
    }
  ]
}
```

#### Verification:
```
✓ Conversion error captured
✓ Error appears in errors array
✓ No crash or unhandled rejection
✓ Error message is descriptive
```

---

### Scenario 6: Concurrent PDF Uploads
**Objective**: Verify multiple PDFs converted sequentially, not in parallel

#### Setup:
- Prepare 3 PDFs: `test1.pdf`, `test2.pdf`, `test3.pdf`

#### Steps:
1. Upload all 3 PDFs in quick succession (within 2 seconds)
2. Start progress polling immediately
3. Observe conversion progress in real-time

#### Expected Behavior:
```
T+0s:   conversion: {total: 3, completed: 0, currentFile: "test1.pdf"}
T+5s:   conversion: {total: 3, completed: 1, currentFile: "test2.pdf"}
T+10s:  conversion: {total: 3, completed: 2, currentFile: "test3.pdf"}
T+15s:  conversion: null, state: processing (JPEGs being processed)
```

#### Verification:
```
✓ All 3 PDFs registered
✓ Converted sequentially (one at a time)
✓ currentFile updated as each completes
✓ Not parallel (no race conditions)
```

---

### Scenario 7: Cancel Processing During Conversion
**Objective**: Verify cancel button resets conversion state

#### Steps:
1. Upload 10-page PDF
2. Within 2 seconds, click "Cancel" button on UI
3. Check progress:
   ```javascript
   fetch('/processing-status').then(r => r.json()).then(d => console.log(d));
   ```

#### Expected:
```json
{
  "status": "waiting",
  "progress": 0,
  "conversion": null
}
```

#### Verification:
```
✓ State returns to 'waiting'
✓ Conversion state cleared
✓ Progress resets to 0%
```

---

## Quick Test Script

Save as `test-issue-38.sh`:

```bash
#!/bin/bash

echo "=== Issue #38 Manual Test Suite ==="
echo ""

# Test 1: Response timing
echo "[Test 1] Measuring upload response time..."
START=$(date +%s%N)
curl -X POST \
  -F "file=@test-data/pdfs/small.pdf" \
  -F "source_type=burial_register" \
  -F "provider=openai" \
  http://localhost:3000/upload \
  > /dev/null 2>&1
END=$(date +%s%N)
DURATION=$(( (END - START) / 1000000 ))
echo "Response time: ${DURATION}ms"
if [ $DURATION -lt 1000 ]; then
  echo "✓ PASS: < 1000ms"
else
  echo "✗ FAIL: > 1000ms (PDF conversion may be blocking)"
fi
echo ""

# Test 2: Check conversion state
echo "[Test 2] Checking conversion state after upload..."
sleep 1
curl -s http://localhost:3000/processing-status | jq '.conversion'
echo ""

# Test 3: Final state
echo "[Test 3] Waiting 30 seconds, then checking final state..."
sleep 30
curl -s http://localhost:3000/processing-status | jq '{status: .status, progress: .progress, conversion}'
echo ""

echo "=== Tests Complete ==="
```

Run with:
```bash
chmod +x test-issue-38.sh
./test-issue-38.sh
```

---

## Success Criteria

All of the following must pass:

| Criterion | Test | Expected |
|-----------|------|----------|
| Fast response | Scenario 1 | HTTP response < 500ms |
| Async conversion | Scenario 2 | State is 'converting' immediately after upload |
| State transitions | Scenario 3 | converting → processing → complete |
| Background processing | Scenario 4 | "Enqueued" appears before "Processing" |
| Error handling | Scenario 5 | Corrupt PDF captured in errors array |
| Sequential conversion | Scenario 6 | PDFs converted one at a time |
| Cancel support | Scenario 7 | Conversion state cleared on cancel |

---

## Troubleshooting

### Issue: Response still takes 5+ seconds
**Possible cause**: PDF conversion still blocking in `prepareAndQueue()`
**Check**: Look at `IngestService.js` line 107 — should NOT have `await convertPdfToJpegs()`

### Issue: State never shows 'converting'
**Possible cause**: `conversionTracker` not imported in fileQueue
**Check**: Verify `require('./conversionTracker')` in fileQueue.js

### Issue: Progress endpoint returns null conversion
**Possible cause**: Conversion already completed before first poll
**Solution**: Poll more frequently (every 500ms instead of 1s)

### Issue: PDFs converted in parallel
**Possible cause**: `_startBackgroundConversion()` using Promise.all() instead of sequential loop
**Check**: Verify async IIFE uses `for...of` loop, not `Promise.all()`

---

## Logging for Debugging

Enable verbose logging in `src/utils/logger.js`:
```javascript
const DEBUG = true; // Set to true
```

Watch for these log messages:
- `[Background] Converting PDF: filename.pdf`
- `[Background] Converted filename.pdf to N images`
- `Conversion complete for /path/to/file.pdf`
- `Conversion failed for /path/to/file.pdf`

---

## After Tests Pass

1. Update issue #38 status to "COMPLETED"
2. Merge branch `fix/issue-38-background-pdf-conversion` to `main`
3. Close the GitHub issue with summary of testing

