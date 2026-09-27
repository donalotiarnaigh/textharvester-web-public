#!/usr/bin/env node

/**
 * Extract pages from a PDF and convert them to JPG files
 * Usage: 
 *   All pages: node scripts/extract-random-pages.js [pdf-path] [output-dir] --all
 *   Random pages: node scripts/extract-random-pages.js [pdf-path] [output-dir] [count]
 *   Specific pages: node scripts/extract-random-pages.js [pdf-path] [output-dir] --pages 42,89,133
 * Default: 20 random pages
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

async function getPdfPageCount(pdfPath) {
  try {
    const { stdout } = await execAsync(`pdfinfo "${pdfPath}" | grep Pages`);
    const match = stdout.match(/Pages:\s+(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    throw new Error('Could not determine page count');
  } catch {
    // Fallback: try pdftocairo to get page count
    try {
      const { stdout } = await execAsync(`pdftocairo -list "${pdfPath}" 2>&1 || echo "0"`); // eslint-disable-line no-unused-vars
      // If pdftocairo doesn't support -list, try a different approach
      // Extract first page to test, then count
      const testOutput = await execAsync(`pdftocairo -jpeg -f 1 -l 1 "${pdfPath}" /tmp/test_page 2>&1 || true`); // eslint-disable-line no-unused-vars
      // Use pdfinfo if available, otherwise estimate
      const { stdout: info } = await execAsync(`pdfinfo "${pdfPath}" 2>&1 || echo ""`);
      const pageMatch = info.match(/Pages:\s+(\d+)/);
      if (pageMatch) {
        return parseInt(pageMatch[1], 10);
      }
    } catch {
      // If pdfinfo not available, try to extract all and count
    }
    throw new Error('Could not determine page count. Make sure pdfinfo or pdftocairo is installed.');
  }
}

function getRandomPages(totalPages, count = 20) {
  const pages = [];
  while (pages.length < count) {
    const page = Math.floor(Math.random() * totalPages) + 1; // 1-indexed
    if (!pages.includes(page)) {
      pages.push(page);
    }
  }
  return pages.sort((a, b) => a - b);
}

async function extractPage(pdfPath, pageNumber, outputPath) {
  const finalOutputFile = path.join(outputPath, `page_${String(pageNumber).padStart(3, '0')}.jpg`);
  // pdftocairo appends -001 when extracting single pages, so we extract to a temp name first
  const tempOutputFile = path.join(outputPath, `page_${String(pageNumber).padStart(3, '0')}_temp`);

  // Use pdftocairo to extract specific page (it will create tempOutputFile-001.jpg)
  const command = `pdftocairo -jpeg -scale-to 2048 -f ${pageNumber} -l ${pageNumber} "${pdfPath}" "${tempOutputFile}"`;

  try {
    await execAsync(command);

    // pdftocairo appends -001, -002, etc. to the output filename
    // Find the actual file that was created (e.g., page_001_temp-001.jpg)
    const files = await fs.readdir(outputPath);
    const tempPrefix = `page_${String(pageNumber).padStart(3, '0')}_temp`;
    const createdFile = files.find(f => f.startsWith(tempPrefix) && f.endsWith('.jpg'));

    if (createdFile) {
      const createdFilePath = path.join(outputPath, createdFile);
      // Rename to the final filename
      await fs.rename(createdFilePath, finalOutputFile);
      console.log(`✓ Extracted page ${pageNumber} → ${path.basename(finalOutputFile)}`);
      return finalOutputFile;
    } else {
      throw new Error(`Expected output file not found after extraction. Looked for files starting with "${tempPrefix}"`);
    }
  } catch (error) {
    throw new Error(`Failed to extract page ${pageNumber}: ${error.message}`);
  }
}

function parsePageNumbers() {
  // Check for --pages flag
  const pagesIndex = process.argv.indexOf('--pages');
  if (pagesIndex !== -1 && process.argv[pagesIndex + 1]) {
    const pagesStr = process.argv[pagesIndex + 1];
    const pages = pagesStr.split(',').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p) && p > 0);
    return pages.length > 0 ? pages : null;
  }

  return null;
}

async function main() {
  const pdfPath = process.argv[2] || '/Users/danieltierney/projects/historic-graves/11_Douglas/data/raw/St Lukes Church_Burial Register_Book1_1840-1893.pdf';
  const outputDir = process.argv[3] || path.join(__dirname, '..', 'test-data', 'burial-register-test-pages');
  const pageCount = parseInt(process.argv[4] || '20', 10);

  // Check if specific pages are requested
  const specificPages = parsePageNumbers();

  // Validate PDF exists
  try {
    await fs.access(pdfPath);
  } catch {
    console.error(`Error: PDF file not found: ${pdfPath}`);
    process.exit(1);
  }

  // Create output directory
  try {
    await fs.mkdir(outputDir, { recursive: true });
    console.log(`Output directory: ${outputDir}`);
  } catch (error) {
    console.error(`Error creating output directory: ${error.message}`);
    process.exit(1);
  }

  console.log(`\nExtracting pages from: ${path.basename(pdfPath)}\n`);

  try {
    // Get total page count
    console.log('Determining PDF page count...');
    const totalPages = await getPdfPageCount(pdfPath);
    console.log(`Total pages in PDF: ${totalPages}\n`);

    // Check for --all flag
    const extractAll = process.argv.includes('--all');

    // Determine which pages to extract
    let selectedPages;
    if (extractAll) {
      // Extract all pages
      selectedPages = Array.from({ length: totalPages }, (_, i) => i + 1);
      console.log(`Extracting all ${totalPages} pages\n`);
    } else if (specificPages && specificPages.length > 0) {
      // Validate specific pages are within range
      const invalidPages = specificPages.filter(p => p > totalPages || p < 1);
      if (invalidPages.length > 0) {
        console.error(`Error: Invalid page numbers: ${invalidPages.join(', ')} (PDF has ${totalPages} pages)`);
        process.exit(1);
      }
      selectedPages = specificPages.sort((a, b) => a - b);
      console.log(`Extracting specific pages: ${selectedPages.join(', ')}\n`);
    } else {
      // Select random pages
      selectedPages = getRandomPages(totalPages, pageCount);
      console.log(`Selected ${pageCount} random pages: ${selectedPages.join(', ')}\n`);
    }

    // Extract each page
    const extractedFiles = [];
    for (const pageNumber of selectedPages) {
      const filePath = await extractPage(pdfPath, pageNumber, outputDir);
      extractedFiles.push(filePath);
    }

    console.log(`\n✓ Successfully extracted ${extractedFiles.length} pages`);
    console.log(`\nFiles saved to: ${outputDir}`);
    console.log('\nExtracted files:');
    extractedFiles.forEach(file => {
      console.log(`  - ${path.basename(file)}`);
    });

  } catch {
    console.error('\nError extracting pages');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { extractPage, getRandomPages, getPdfPageCount };

