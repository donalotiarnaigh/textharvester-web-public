# Manual Testing Guide: Issue #166 — Inline Result Correction

This guide provides comprehensive steps for manually testing the inline result correction feature without re-processing.

## Quick Test (No API Credits Required)

### Test "Mark as Reviewed" Without Processing Images

```bash
# 1. Start the server
node server.js

# 2. In another terminal, check existing records
sqlite3 data/memorials.db "SELECT id, first_name, needs_review FROM memorials LIMIT 5;"

# 3. Manually flag a record for testing
sqlite3 data/memorials.db "UPDATE memorials SET needs_review=1 WHERE id=1;"

# 4. Verify the flag was set
sqlite3 data/memorials.db "SELECT id, first_name, needs_review, reviewed_at FROM memorials WHERE id=1;"

# 5. Call the Mark as Reviewed API endpoint
curl -X POST http://localhost:3000/api/results/memorials/1/review \
  -H "Content-Type: application/json"

# 6. Verify response contains needs_review=0 and reviewed_at timestamp

# 7. Confirm in database
sqlite3 data/memorials.db "SELECT id, first_name, needs_review, reviewed_at FROM memorials WHERE id=1;"
```

**Expected outcome:**
- `needs_review` changes from 1 to 0
- `reviewed_at` is set to current timestamp
- HTTP 200 response with updated record

---

## Full End-to-End Test (Uses API Credits)

### 1. Process an Image

```bash
# Start server
node server.js

# Visit http://localhost:3000 in your browser
# Upload a gravestone photo or burial register document
# Wait for processing to complete (watch server logs)
```

### 2. Find Records with Low Confidence

```bash
sqlite3 data/memorials.db << EOF
.mode column
.headers on
SELECT id, first_name, last_name, needs_review, confidence_coverage
FROM memorials
WHERE needs_review=1
LIMIT 5;
EOF
```

### 3. Test Mark as Reviewed via API

```bash
# Replace RECORD_ID with actual ID from above
RECORD_ID=1

curl -X POST http://localhost:3000/api/results/memorials/$RECORD_ID/review \
  -H "Content-Type: application/json"
```

**Expected response:**
```json
{
  "success": true,
  "record": {
    "id": 1,
    "first_name": "JOHN",
    "last_name": "SMITH",
    "needs_review": 0,
    "reviewed_at": "2026-04-03T12:34:56.000Z",
    ...
  }
}
```

### 4. Test All Record Types

```bash
# Burial Register
curl -X POST http://localhost:3000/api/results/burial-register/1/review \
  -H "Content-Type: application/json"

# Grave Card
curl -X POST http://localhost:3000/api/results/grave-cards/1/review \
  -H "Content-Type: application/json"
```

---

## Web UI Testing (Recommended)

### Test Mark as Reviewed Button

1. **Start server:**
   ```bash
   node server.js
   ```

2. **Open http://localhost:3000 in browser**

3. **Upload an image** (uses API credits)

4. **Wait for processing** (watch terminal for completion)

5. **Navigate to results page** (/results.html)

6. **Expand a record** with "Needs Review" badge (yellow badge in detail view)

7. **Observe the detail view:**
   - Yellow "Needs Review" badge visible
   - "Edit" button (blue)
   - "Mark as Reviewed" button (yellow/warning)

8. **Click "Mark as Reviewed" button**

9. **Observe:**
   - Button shows loading spinner
   - Detail view closes automatically
   - "Needs Review" badge disappears from main table row
   - Page doesn't reload (optimistic update)

10. **Reload page** (Ctrl+R or Cmd+R)

11. **Verify persistence:**
    - Badge stays gone
    - Record no longer in "Needs Review" list

---

## API Endpoint Testing

### Test Update Endpoints (Via curl)

```bash
# Update memorial fields
curl -X PATCH http://localhost:3000/api/results/memorials/1 \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "JANE",
    "inscription": "Updated inscription text"
  }'

# Update burial register fields
curl -X PATCH http://localhost:3000/api/results/burial-register/1 \
  -H "Content-Type: application/json" \
  -d '{
    "name_raw": "JANE DOE",
    "age_raw": "75"
  }'

# Update grave card (nested JSON fields)
curl -X PATCH http://localhost:3000/api/results/grave-cards/1 \
  -H "Content-Type: application/json" \
  -d '{
    "section": "B",
    "grave_number": "42",
    "grave": { "status": "unknown" }
  }'
```

### Test Error Cases

```bash
# Invalid ID (should return 400)
curl -X POST http://localhost:3000/api/results/memorials/abc/review \
  -H "Content-Type: application/json"

# Non-existent record (should return 404)
curl -X POST http://localhost:3000/api/results/memorials/99999/review \
  -H "Content-Type: application/json"

# Invalid record type (should return 400)
curl -X POST http://localhost:3000/api/results/invalid-type/1/review \
  -H "Content-Type: application/json"

# Empty PATCH body (should return 400)
curl -X PATCH http://localhost:3000/api/results/memorials/1 \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Database Verification

### Verify Edit Tracking

```bash
# Check memorials with edits
sqlite3 data/memorials.db << EOF
.mode column
.headers on
SELECT id, first_name, edited_at, edited_fields
FROM memorials
WHERE edited_at IS NOT NULL
LIMIT 5;
EOF

# Check burial register edits
sqlite3 data/memorials.db << EOF
.mode column
.headers on
SELECT id, name_raw, edited_at, edited_fields
FROM burial_register_entries
WHERE edited_at IS NOT NULL
LIMIT 5;
EOF

# Check grave card edits
sqlite3 data/memorials.db << EOF
.mode column
.headers on
SELECT id, section, grave_number, edited_at, edited_fields
FROM grave_cards
WHERE edited_at IS NOT NULL
LIMIT 5;
EOF

# Check reviewed records
sqlite3 data/memorials.db << EOF
.mode column
.headers on
SELECT id, first_name, needs_review, reviewed_at
FROM memorials
WHERE reviewed_at IS NOT NULL
LIMIT 5;
EOF
```

---

## Success Checklist

- [ ] Mark as Reviewed button visible on records with `needs_review=1`
- [ ] Mark as Reviewed button closes detail view
- [ ] Badge disappears from main row after marking as reviewed
- [ ] Database shows `needs_review=0` and `reviewed_at` timestamp
- [ ] Badge stays gone after page reload (persisted to DB)
- [ ] API returns 404 for non-existent record
- [ ] API returns 400 for invalid ID format
- [ ] API returns 400 for invalid record type
- [ ] PATCH endpoints accept and store field updates
- [ ] PATCH endpoints set `edited_at` and `edited_fields`
- [ ] Grave card updates correctly merge nested JSON
- [ ] All endpoints sanitize input (trim strings, 10K char limit)
- [ ] Edit button shows placeholder message (Phase 2 feature)

---

## Minimum API Credit Usage

If you have existing processed records:
- **No API credits needed** — test Mark as Reviewed on existing data

If database is empty:
- **Process 1 image** (~$0.01–$0.05 depending on provider)
- This will create 1–3 records to test with
- Use those same records repeatedly for all endpoints

---

## Notes

- The "Edit" button is a placeholder for Phase 2 (full inline form editing)
- All tests can be run multiple times on the same records
- Database is persistent — changes from one test run persist to the next
- Use `sqlite3 data/memorials.db ".tables"` to verify database file exists
