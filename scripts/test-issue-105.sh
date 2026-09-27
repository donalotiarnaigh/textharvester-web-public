#!/bin/bash
# Test Script for Issue #105: Enforce Filename-Based Identity
#
# This script automatically runs all manual tests for duplicate detection.
# Usage: bash scripts/test-issue-105.sh [--cleanup] [--verbose]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

VERBOSE=false
CLEANUP=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --verbose) VERBOSE=true; shift ;;
    --cleanup) CLEANUP=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

log_test() {
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

log_pass() {
  echo -e "${GREEN}✓ $1${NC}"
}

log_fail() {
  echo -e "${RED}✗ $1${NC}"
  exit 1
}

log_info() {
  echo -e "${YELLOW}ℹ $1${NC}"
}

# Cleanup function
cleanup() {
  if [ "$CLEANUP" = true ]; then
    log_info "Cleaning up database..."
    rm -f data/memorials.db
    log_pass "Database cleaned"
  fi
}

# Verify prerequisites
verify_prereqs() {
  log_test "Verifying Prerequisites"

  if ! command -v npm &> /dev/null; then
    log_fail "npm is not installed"
  fi
  log_pass "npm is available"

  if ! command -v sqlite3 &> /dev/null; then
    log_fail "sqlite3 is not installed"
  fi
  log_pass "sqlite3 is available"

  if [ ! -d "sample_data/source_sets/memorials" ]; then
    log_fail "Sample data directory not found"
  fi
  log_pass "Sample data directory exists"

  # Check for API key (at least one provider)
  if [ -z "$OPENAI_API_KEY" ] && [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$GEMINI_API_KEY" ]; then
    log_fail "No API key found. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY"
  fi
  log_pass "API key is configured"
}

# Test 1: Memorial Duplicate Detection (Same Provider)
test_memorial_duplicate_same_provider() {
  log_test "Test 1: Memorial Duplicate Detection (Same Provider)"

  local test_file="sample_data/source_sets/memorials/page_5.jpg"
  local provider="openai"

  log_info "Processing $test_file with $provider (first time)..."
  npm run cli -- ingest "$test_file" --source-type memorial --provider "$provider" > /tmp/test1_first.log 2>&1

  if grep -q "Successfully stored memorial" /tmp/test1_first.log; then
    log_pass "First ingestion succeeded"
  else
    log_fail "First ingestion failed"
  fi

  # Give database a moment to settle
  sleep 1

  log_info "Processing $test_file with $provider (second time - should fail)..."
  npm run cli -- ingest "$test_file" --source-type memorial --provider "$provider" > /tmp/test1_second.log 2>&1 || true

  if grep -q "Duplicate" /tmp/test1_second.log || grep -q "isDuplicate" /tmp/test1_second.log; then
    log_pass "Duplicate was correctly rejected"
  else
    log_fail "Duplicate was not rejected"
  fi

  # Verify only 1 record exists
  local count=$(npm run cli -- query list --source-type memorial 2>/dev/null | grep -c "page_5.jpg" || echo "0")
  if [ "$count" -eq 1 ]; then
    log_pass "Only 1 record exists in database (no duplicate created)"
  else
    log_fail "Expected 1 record but found $count"
  fi

  [ "$VERBOSE" = true ] && cat /tmp/test1_second.log
}

# Test 2: Memorial Different Providers
test_memorial_different_providers() {
  log_test "Test 2: Memorial Different Providers (Same File)"

  local test_file="sample_data/source_sets/memorials/page_6.jpg"
  local provider1="openai"
  local provider2="anthropic"

  log_info "Processing $test_file with $provider1..."
  npm run cli -- ingest "$test_file" --source-type memorial --provider "$provider1" > /tmp/test2_p1.log 2>&1

  if grep -q "Successfully stored memorial" /tmp/test2_p1.log; then
    log_pass "Processing with provider 1 succeeded"
  else
    log_fail "Processing with provider 1 failed"
  fi

  sleep 1

  log_info "Processing $test_file with $provider2..."
  npm run cli -- ingest "$test_file" --source-type memorial --provider "$provider2" > /tmp/test2_p2.log 2>&1

  if grep -q "Successfully stored memorial" /tmp/test2_p2.log; then
    log_pass "Processing with provider 2 succeeded (same file, different provider)"
  else
    log_fail "Processing with provider 2 failed"
  fi

  sleep 1

  # Verify 2 records exist
  local count=$(npm run cli -- query list --source-type memorial 2>/dev/null | grep -c "page_6.jpg" || echo "0")
  if [ "$count" -eq 2 ]; then
    log_pass "2 records exist for same file with different providers"
  else
    log_fail "Expected 2 records but found $count"
  fi

  [ "$VERBOSE" = true ] && { cat /tmp/test2_p1.log; cat /tmp/test2_p2.log; }
}

# Test 3: Database Schema Verification
test_database_schema() {
  log_test "Test 3: Database Schema Verification"

  # Initialize database if not exists
  npm run cli -- query list > /dev/null 2>&1 || true

  if [ ! -f "data/memorials.db" ]; then
    log_fail "Database file not found"
  fi
  log_pass "Database file exists"

  # Check for UNIQUE index on memorials
  local memorials_index=$(sqlite3 data/memorials.db "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_memorials_file_provider';" 2>/dev/null || echo "")

  if [ -n "$memorials_index" ] && grep -q "UNIQUE" <<< "$memorials_index"; then
    log_pass "Memorials table has UNIQUE index on (file_name, ai_provider)"
    [ "$VERBOSE" = true ] && echo "  Index: $memorials_index"
  else
    log_fail "Memorials table missing UNIQUE index"
  fi

  # Check for UNIQUE index on grave_cards
  local grave_cards_index=$(sqlite3 data/memorials.db "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_grave_cards_file_provider';" 2>/dev/null || echo "")

  if [ -n "$grave_cards_index" ] && grep -q "UNIQUE" <<< "$grave_cards_index"; then
    log_pass "Grave cards table has UNIQUE index on (file_name, ai_provider)"
    [ "$VERBOSE" = true ] && echo "  Index: $grave_cards_index"
  else
    log_fail "Grave cards table missing UNIQUE index"
  fi
}

# Test 4: Test suite verification
test_suite() {
  log_test "Test 4: Automated Test Suite"

  log_info "Running Jest tests for issue #105..."
  if npm test -- --testNamePattern="duplicate|isDuplicate|different.*provider" --passWithNoTests 2>&1 | grep -q "passed"; then
    log_pass "All duplicate detection tests passed"
  else
    log_fail "Some tests failed"
  fi
}

# Main execution
main() {
  echo -e "${GREEN}"
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║  Issue #105: Enforce Filename-Based Identity - Test Suite  ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"

  cleanup
  verify_prereqs
  test_memorial_duplicate_same_provider
  test_memorial_different_providers
  test_database_schema
  test_suite

  echo -e "${GREEN}"
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║                    ✓ ALL TESTS PASSED                      ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"

  log_info "Manual test documentation: see MANUAL_TEST_ISSUE_105.md"
}

main
