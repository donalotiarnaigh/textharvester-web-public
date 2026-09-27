#!/bin/bash

# Manual Testing Script for DEBS Monument Classification Pipeline
# Usage: ./scripts/manual-test-debs.sh [openai|anthropic|gemini] [cleanup]

set -e

PROVIDER="${1:-openai}"
CLEANUP="${2:-}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=================================================="
echo "DEBS Monument Classification - Manual Test Suite"
echo "=================================================="
echo "Provider: $PROVIDER"
echo "Project: $PROJECT_ROOT"
echo ""

# Verify API keys
case "$PROVIDER" in
  openai)
    if [ -z "$OPENAI_API_KEY" ]; then
      echo "❌ OPENAI_API_KEY not set. Please export your OpenAI API key:"
      echo "   export OPENAI_API_KEY='sk-...'"
      exit 1
    fi
    echo "✓ OpenAI API key found"
    ;;
  anthropic)
    if [ -z "$ANTHROPIC_API_KEY" ]; then
      echo "❌ ANTHROPIC_API_KEY not set. Please export your Anthropic API key:"
      echo "   export ANTHROPIC_API_KEY='sk-ant-...'"
      exit 1
    fi
    echo "✓ Anthropic API key found"
    ;;
  gemini)
    if [ -z "$GEMINI_API_KEY" ]; then
      echo "❌ GEMINI_API_KEY not set. Please export your Gemini API key:"
      echo "   export GEMINI_API_KEY='AIza...'"
      exit 1
    fi
    echo "✓ Gemini API key found"
    ;;
  *)
    echo "❌ Invalid provider: $PROVIDER. Use: openai, anthropic, or gemini"
    exit 1
    ;;
esac

echo ""
echo "========== Phase 1: Database Setup =========="

# Backup database
if [ -f "$PROJECT_ROOT/data/memorials.db" ]; then
  BACKUP="$PROJECT_ROOT/data/memorials.db.backup.$(date +%s)"
  cp "$PROJECT_ROOT/data/memorials.db" "$BACKUP"
  echo "✓ Database backed up to: $BACKUP"
fi

# Cleanup if requested
if [ "$CLEANUP" = "cleanup" ]; then
  echo "Clearing previous test data..."
  sqlite3 "$PROJECT_ROOT/data/memorials.db" "DELETE FROM monument_classifications WHERE processed_date > datetime('now', '-1 hour');" 2>/dev/null || true
  echo "✓ Old test data cleared"
fi

# Check initial state
INITIAL_COUNT=$(sqlite3 "$PROJECT_ROOT/data/memorials.db" "SELECT COUNT(*) FROM monument_classifications;" 2>/dev/null || echo "0")
echo "Current records: $INITIAL_COUNT"

echo ""
echo "========== Phase 2: Single Image Test =========="
echo "Testing with: ducltf-0435.jpg"
echo ""

cd "$PROJECT_ROOT"
node src/cli/index.js ingest \
  'sample_data/source_sets/monument_photos/ducltf-0435.jpg' \
  --source-type monument_classification \
  --provider "$PROVIDER"

if [ $? -eq 0 ]; then
  echo "✓ Single image processed successfully"
else
  echo "❌ Single image processing failed"
  exit 1
fi

echo ""
echo "========== Phase 3: Verify Storage =========="

RECORD=$(sqlite3 "$PROJECT_ROOT/data/memorials.db" \
  "SELECT id, file_name, broad_type, confidence_level FROM
     (SELECT id, file_name, json_extract(data_json, '$.broad_type') as broad_type,
             json_extract(data_json, '$.confidence_level') as confidence_level
      FROM monument_classifications
      ORDER BY id DESC LIMIT 1);")

if [ -z "$RECORD" ]; then
  echo "❌ No record found in database"
  exit 1
fi

echo "✓ Record stored:"
echo "  $RECORD"

# Extract first column (ID) for next queries
RECORD_ID=$(echo "$RECORD" | cut -d'|' -f1)
echo ""
echo "Record ID: $RECORD_ID"

echo ""
echo "========== Phase 4: Detailed Data Verification =========="

# Show full classification
echo "Full Classification Data:"
sqlite3 "$PROJECT_ROOT/data/memorials.db" \
  "SELECT json_pretty(json_extract(data_json, '$')) FROM monument_classifications WHERE id = $RECORD_ID;" | head -40

echo ""
echo "========== Phase 5: Cost Tracking =========="

COST_DATA=$(sqlite3 "$PROJECT_ROOT/data/memorials.db" \
  "SELECT input_tokens, output_tokens, ROUND(estimated_cost_usd, 6) FROM monument_classifications WHERE id = $RECORD_ID;")

IFS='|' read -r INPUT OUTPUT COST <<< "$COST_DATA"
echo "Input tokens:  $INPUT"
echo "Output tokens: $OUTPUT"
echo "Estimated cost: \$$COST USD"

echo ""
echo "========== Phase 6: Query Interface =========="

echo "Listing all classifications:"
node src/cli/index.js query list --source-type monument_classification --limit 5

echo ""
echo "========== Phase 7: Batch Processing =========="

echo "Processing all 5 monument photos..."
echo "This may take 30-60 seconds..."
echo ""

node src/cli/index.js ingest \
  'sample_data/source_sets/monument_photos/*.jpg' \
  --source-type monument_classification \
  --provider "$PROVIDER" 2>&1 | tail -20

echo ""
echo "========== Phase 8: Results Summary =========="

SUMMARY=$(sqlite3 "$PROJECT_ROOT/data/memorials.db" \
  "SELECT
     COUNT(*) as total,
     SUM(CASE WHEN json_extract(data_json, '$.confidence_level') = 'High' THEN 1 ELSE 0 END) as high_confidence,
     SUM(CASE WHEN json_extract(data_json, '$.confidence_level') = 'Medium' THEN 1 ELSE 0 END) as medium_confidence,
     SUM(CASE WHEN json_extract(data_json, '$.confidence_level') = 'Low' THEN 1 ELSE 0 END) as low_confidence,
     SUM(CASE WHEN needs_review = 1 THEN 1 ELSE 0 END) as flagged_for_review,
     ROUND(SUM(input_tokens), 0) as total_input_tokens,
     ROUND(SUM(output_tokens), 0) as total_output_tokens,
     ROUND(SUM(estimated_cost_usd), 4) as total_cost
   FROM monument_classifications
   WHERE processed_date > datetime('now', '-1 hour');")

IFS='|' read -r TOTAL HIGH MED LOW REVIEW INPUT OUTPUT COST <<< "$SUMMARY"

echo "Total processed: $TOTAL images"
echo "Confidence distribution:"
echo "  - High:   $HIGH"
echo "  - Medium: $MED"
echo "  - Low:    $LOW"
echo "Flagged for review: $REVIEW"
echo ""
echo "Token usage:"
echo "  - Input:  $INPUT tokens"
echo "  - Output: $OUTPUT tokens"
echo "  - Total cost: \$$COST USD"
echo "  - Average per image: \$$(echo "scale=4; $COST / $TOTAL" | bc) USD"

echo ""
echo "========== Phase 9: Export Test =========="

# Create export directory if needed
EXPORT_DIR="$PROJECT_ROOT/test_exports"
mkdir -p "$EXPORT_DIR"

# Export as JSON (database query export simulation)
echo "Exporting to JSON..."
sqlite3 "$PROJECT_ROOT/data/memorials.db" \
  "SELECT json_group_object('records', json_group_array(json_object(
    'id', id,
    'file_name', file_name,
    'broad_type', json_extract(data_json, '$.broad_type'),
    'material_primary', json_extract(data_json, '$.material_primary'),
    'confidence_level', json_extract(data_json, '$.confidence_level'),
    'needs_review', needs_review,
    'cost_usd', estimated_cost_usd
  ))) FROM monument_classifications WHERE processed_date > datetime('now', '-1 hour');" > "$EXPORT_DIR/monuments_export.json"

echo "✓ JSON export: $EXPORT_DIR/monuments_export.json"

# Export as CSV
echo "Exporting to CSV..."
{
  echo "id,file_name,broad_type,material_primary,confidence_level,height_mm,width_mm,needs_review,cost_usd"
  sqlite3 "$PROJECT_ROOT/data/memorials.db" \
    "SELECT
       id,
       file_name,
       json_extract(data_json, '$.broad_type'),
       json_extract(data_json, '$.material_primary'),
       json_extract(data_json, '$.confidence_level'),
       json_extract(data_json, '$.height_mm'),
       json_extract(data_json, '$.width_mm'),
       needs_review,
       estimated_cost_usd
     FROM monument_classifications
     WHERE processed_date > datetime('now', '-1 hour')
     ORDER BY id;" | sed 's/|/,/g'
} > "$EXPORT_DIR/monuments_export.csv"

echo "✓ CSV export: $EXPORT_DIR/monuments_export.csv"

echo ""
echo "========== Phase 10: Sample Records =========="

echo "Sample classification records (top 3):"
sqlite3 "$PROJECT_ROOT/data/memorials.db" \
  "SELECT
     file_name,
     json_extract(data_json, '$.broad_type') as type,
     json_extract(data_json, '$.material_primary') as material,
     json_extract(data_json, '$.height_mm') as height_mm,
     json_extract(data_json, '$.confidence_level') as confidence,
     needs_review
   FROM monument_classifications
   WHERE processed_date > datetime('now', '-1 hour')
   ORDER BY id DESC
   LIMIT 3;" | column -t -s '|'

echo ""
echo "========== Test Complete =========="
echo ""
echo "✓ All manual tests completed successfully!"
echo ""
echo "Next steps:"
echo "1. Review export files: $EXPORT_DIR/"
echo "2. Check database: sqlite3 $PROJECT_ROOT/data/memorials.db"
echo "3. View logs: tail -50 logs/app.log (if running server)"
echo ""
echo "To verify data, run:"
echo "  sqlite3 $PROJECT_ROOT/data/memorials.db"
echo "  SELECT json_pretty(json_extract(data_json, '$')) FROM monument_classifications LIMIT 1;"
echo ""
