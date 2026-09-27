#!/bin/bash

# Reset Sample Data
# Copies clean samples from source_sets to test_inputs

TEST_INPUTS_DIR="sample_data/test_inputs"
SOURCE_SETS_DIR="sample_data/source_sets"

echo "Resetting sample data..."

# Clean target directory
rm -f "$TEST_INPUTS_DIR"/*

# Copy from source sets
echo "Copying memorials..."
cp "$SOURCE_SETS_DIR/memorials"/*.jpg "$TEST_INPUTS_DIR/"

echo "Copying burial registers..."
cp "$SOURCE_SETS_DIR/burial_registers"/*.jpg "$TEST_INPUTS_DIR/"

echo "Copying grave cards..."
cp "$SOURCE_SETS_DIR/grave_cards"/*.PDF "$TEST_INPUTS_DIR/"

echo "Done. Sample data ready in $TEST_INPUTS_DIR"
ls -1 "$TEST_INPUTS_DIR" | wc -l | xargs echo "Total files:"
