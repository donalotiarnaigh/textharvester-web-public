# Test Scripts

This directory contains utility scripts for testing and development.

## Provider Prompt Testing Script

The `test-provider-prompts.js` script tests real API calls to OpenAI and Anthropic using our prompt modularization system. It provides enhanced logging and comparison functionality to help verify that both providers work correctly with our custom prompts.

### Prerequisites

Environment variables for API keys must be set:
- `OPENAI_API_KEY` - Your OpenAI API key
- `ANTHROPIC_API_KEY` - Your Anthropic API key

### Usage

```bash
# Test a single page (defaults to page_1.jpg)
node scripts/test-provider-prompts.js

# Test specific pages
node scripts/test-provider-prompts.js --start=1 --end=3

# Test all pages (1-10) with a specific provider
node scripts/test-provider-prompts.js --provider=openai --all=true

# Test with custom batch size (default is 2)
node scripts/test-provider-prompts.js --all=true --batch=3

# Test specific provider and pages
node scripts/test-provider-prompts.js --provider=anthropic --start=5 --end=7

# Test with a custom image
node scripts/test-provider-prompts.js --image=path/to/your/image.jpg
```

### Options

- `--provider`: Which provider to test (`all`, `openai`, or `anthropic`, default: `all`)
- `--all`: Test all available pages (`true` or `false`, default: `false`)
- `--start`: Starting page number (default: `1`)
- `--end`: Ending page number (default: same as start if not testing all)
- `--batch`: Number of images to process in each batch (default: `2`)
- `--image`: Custom image path (overrides page selection)

### Output

The script provides detailed logging about:
- Provider initialization
- Prompt validation
- API call details
- Response timing
- Complete results
- Comparison between provider responses (when both are tested)

Results are automatically saved to `sample_data/test_results/` with filenames in the format:
```
results_[provider]_[start]-[end]_[timestamp].json
```

### Batch Processing

The script processes images in batches to avoid rate limits:
- Default batch size is 2 images
- 5-second delay between batches
- Results are accumulated and saved together
- Progress is logged for each batch

### Troubleshooting

If you encounter any issues:

1. Make sure your API keys are set correctly
2. Check that the image files exist in `sample_data/test_inputs/`
3. Verify network connectivity to the API endpoints
4. Check the console for detailed error messages
5. Review saved results in `sample_data/test_results/`

### Sample Output

```
[INFO] Starting provider prompt test
[INFO] Provider: all
[INFO] Processing pages 1 to 3 in batches of 2
[INFO] Getting images from sample_data/test_inputs (pages 1 to 3)
[INFO] Found 3 images to process

[INFO] ==== Processing Batch 1 (2 images) ====
[INFO] --- Processing image: page_1.jpg ---
[SUCCESS] Image loaded successfully: page_1.jpg
[INFO] ==== Testing OpenAI Provider ====
[SUCCESS] OpenAI request completed in 2145ms
[INFO] ==== Testing Anthropic Provider ====
[SUCCESS] Anthropic request completed in 1897ms
[SUCCESS] Both providers returned identical results for key fields

[INFO] --- Processing image: page_2.jpg ---
...

[INFO] Waiting 5 seconds before next batch...

[INFO] ==== Processing Batch 2 (1 image) ====
[INFO] --- Processing image: page_3.jpg ---
...

[SUCCESS] Results saved to sample_data/test_results/results_all_1-3_2024-03-19T10-30-45-123Z.json
[SUCCESS] Provider prompt test completed
``` 