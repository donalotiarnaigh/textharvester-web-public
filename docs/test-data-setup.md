# Test Data Setup Guide for Issue #38 Manual Testing

This guide explains how to prepare sample PDFs for testing the background PDF conversion feature.

## Quick Start

### Option 1: Using Existing Sample PDFs (Fastest)

If the project has existing PDFs in test directories:

```bash
# Check for existing test data
ls -la test-data/pdfs/ 2>/dev/null || echo "Directory doesn't exist yet"
ls -la data/samples/ 2>/dev/null || echo "Directory doesn't exist yet"
```

If found, you're ready to test! Skip to "Running Tests" section.

### Option 2: Generate Test PDFs (Recommended)

#### Prerequisites:
```bash
# macOS
brew install imagemagick ghostscript

# Ubuntu/Debian
sudo apt-get install imagemagick ghostscript

# Windows (using Chocolatey)
choco install imagemagick ghostscript
```

#### Create 2-Page Test PDF:

```bash
#!/bin/bash
# Create test PDF directory
mkdir -p test-data/pdfs

# Create first page
convert -size 600x800 xc:white \
  -pointsize 24 -weight bold -fill black \
  -annotate +40+100 'Test Burial Register' \
  -pointsize 14 -fill darkblue \
  -annotate +40+150 'Page 1 of 2' \
  -pointsize 12 -fill black \
  -annotate +40+200 'Entry No. | Name | Date' \
  -annotate +40+230 '001 | JOHN DOE | 15 Jan 1850' \
  -annotate +40+260 '002 | JANE SMITH | 22 Feb 1850' \
  -annotate +40+290 '003 | WILLIAM BROWN | 08 Mar 1850' \
  test-data/pdfs/page1.jpg

# Create second page
convert -size 600x800 xc:white \
  -pointsize 24 -weight bold -fill black \
  -annotate +40+100 'Test Burial Register' \
  -pointsize 14 -fill darkblue \
  -annotate +40+150 'Page 2 of 2' \
  -pointsize 12 -fill black \
  -annotate +40+200 'Entry No. | Name | Date' \
  -annotate +40+230 '004 | MARY JONES | 10 Apr 1850' \
  -annotate +40+260 '005 | ROBERT WILSON | 25 May 1850' \
  test-data/pdfs/page2.jpg

# Combine into PDF
convert test-data/pdfs/page1.jpg test-data/pdfs/page2.jpg test-data/pdfs/test-2page.pdf

echo "✓ Created test-data/pdfs/test-2page.pdf"
ls -lh test-data/pdfs/
```

#### Or Create Multi-Page Burial Register PDF:

```bash
#!/bin/bash
# Create 10-page PDF with burial register content

mkdir -p test-data/pdfs

for page_num in {1..10}; do
  convert -size 600x800 xc:white \
    -pointsize 20 -weight bold -fill black \
    -annotate +40+50 'Burial Register - Volume 1' \
    -pointsize 12 -fill darkblue \
    -annotate +40+100 "Page $page_num" \
    -pointsize 11 -fill black \
    $(seq 1 5 | xargs -I {} echo "-annotate +40+$((130 + ({} * 30))) 'Entry {}: Person {} - Date {}'") \
    test-data/pdfs/page${page_num}.jpg
done

# Combine all pages into single PDF
convert test-data/pdfs/page*.jpg test-data/pdfs/burial-register-10page.pdf

echo "✓ Created test-data/pdfs/burial-register-10page.pdf"
rm test-data/pdfs/page*.jpg
ls -lh test-data/pdfs/
```

#### Or Use Ghostscript to Create PDFs Directly:

```bash
#!/bin/bash
# Create a multi-page PDF using Ghostscript

mkdir -p test-data/pdfs

cat > /tmp/burial_register.ps << 'EOF'
%!PS-Adobe-3.0
/Helvetica findfont 12 scalefont setfont
100 750 moveto
(Burial Register - Test Page 1) show
100 720 moveto
(Entry 001: John Doe - 15 January 1850) show
100 690 moveto
(Entry 002: Jane Smith - 22 February 1850) show

showpage

100 750 moveto
(Burial Register - Test Page 2) show
100 720 moveto
(Entry 003: William Brown - 08 March 1850) show
100 690 moveto
(Entry 004: Mary Jones - 10 April 1850) show

showpage
EOF

# Convert PostScript to PDF
gs -q -dNOPAUSE -dBATCH -sDEVICE=pdfwrite \
   -sOutputFile=test-data/pdfs/burial-register-2page.pdf \
   /tmp/burial_register.ps

echo "✓ Created test-data/pdfs/burial-register-2page.pdf"
ls -lh test-data/pdfs/
```

### Option 3: Download Sample PDFs

If your organization has sample documents, place them in `test-data/pdfs/`:

```bash
# Copy existing PDFs
cp ~/Documents/sample-burial-register.pdf test-data/pdfs/
cp ~/Documents/memorial-page.pdf test-data/pdfs/

# Or download from cloud storage
curl -o test-data/pdfs/burial-register.pdf https://example.com/samples/burial-register.pdf

ls -lh test-data/pdfs/
```

---

## Test File Recommendations

For comprehensive testing, prepare:

| File | Purpose | Size | Pages |
|------|---------|------|-------|
| `test-2page.pdf` | Quick response timing test | ~50KB | 2 |
| `test-5page.pdf` | State transition observation | ~100KB | 5 |
| `burial-register-10page.pdf` | Large PDF, visible conversion | ~200KB | 10 |
| `corrupt.pdf` | Error handling (create manually) | ~100B | - |
| `single-image.jpg` | Mixed upload test | ~50KB | - |

---

## Verification Script

After creating test data:

```bash
#!/bin/bash
# Verify test data is ready

echo "Checking test data setup..."
echo ""

TEST_DIR="test-data/pdfs"
mkdir -p "$TEST_DIR"

# Check for test files
FILES=(
  "test-2page.pdf"
  "test-5page.pdf"
  "burial-register-10page.pdf"
)

for file in "${FILES[@]}"; do
  if [ -f "$TEST_DIR/$file" ]; then
    SIZE=$(du -h "$TEST_DIR/$file" | cut -f1)
    echo "✓ Found $file ($SIZE)"
  else
    echo "⚠️  Missing $file"
  fi
done

echo ""
echo "Test data ready for Issue #38 manual testing!"
echo ""
echo "To run automated tests:"
echo "  ./test-issue-38.sh"
echo ""
echo "For detailed testing guide:"
echo "  cat docs/manual-test-issue-38.md"
```

---

## Running Manual Tests

Once test data is prepared:

### Quick Test (5 minutes):
```bash
./test-issue-38.sh
```

### Detailed Testing (15 minutes):
Follow the scenarios in `docs/manual-test-issue-38.md`

### Web UI Testing:
1. Start server: `npm start`
2. Open http://localhost:3000/upload
3. Upload test PDF and observe:
   - Upload completes quickly (< 500ms)
   - Progress page shows "Converting PDF..." message
   - State transitions from converting → processing → complete

---

## Troubleshooting Test Data Creation

### Issue: `convert` command not found
**Solution**: Install ImageMagick: `brew install imagemagick`

### Issue: PDF file is empty or corrupted
**Solution**: Verify Ghostscript installation: `gs --version`

### Issue: Test takes too long (PDF conversion blocking)
**Solution**:
- Use smaller PDFs (< 500KB)
- Try with just 2-3 pages initially
- Check if server is using development mode: `NODE_ENV=development npm start`

### Issue: Cannot see progress updates
**Solution**:
- Ensure server is running: `curl http://localhost:3000/processing-status`
- Check browser console for errors: F12 → Console tab
- Verify config.json has uploads enabled

---

## CI/CD Integration

For automated testing in CI/CD:

```yaml
# .github/workflows/test-issue-38.yml
name: Test Issue #38

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm install

      - name: Create test data
        run: |
          mkdir -p test-data/pdfs
          # Create simple test PDF using Python
          python3 << 'EOF'
          from PIL import Image, ImageDraw
          img = Image.new('RGB', (200, 300), color='white')
          draw = ImageDraw.Draw(img)
          draw.text((10, 10), "Test Page 1", fill='black')
          img.save('test-data/pdfs/test-page-1.jpg')

          img = Image.new('RGB', (200, 300), color='white')
          draw = ImageDraw.Draw(img)
          draw.text((10, 10), "Test Page 2", fill='black')
          img.save('test-data/pdfs/test-page-2.jpg')
          EOF

          # For PDF, can use simple approach or skip if no PDF needed
          # convert test-data/pdfs/test-page-*.jpg test-data/pdfs/test.pdf

      - name: Run tests
        run: npm test

      - name: Run manual test script
        run: ./test-issue-38.sh
```

---

## Notes

- Test PDFs don't need realistic content; focus on file size and page count
- For performance testing, use larger PDFs (500KB+) to observe conversion time
- Clear test database between runs: `npm run query -- clear-all` (if available)
- Check logs for PDF conversion details: `tail -f logs/application.log`

