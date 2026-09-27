#!/usr/bin/env node

/**
 * Rename extracted page files to remove the -001 suffix added by pdftocairo
 * Usage: node scripts/rename-extracted-pages.js [directory]
 */

const fs = require('fs').promises;
const path = require('path');

async function renameFiles(directory) {
  try {
    const files = await fs.readdir(directory);
    const renamed = [];

    for (const file of files) {
      // Match pattern: page_XXX.jpg-YYY.jpg
      const match = file.match(/^(page_\d+\.jpg)-(\d+)\.jpg$/);
      if (match) {
        const newName = match[1]; // Just keep page_XXX.jpg
        const oldPath = path.join(directory, file);
        const newPath = path.join(directory, newName);

        await fs.rename(oldPath, newPath);
        renamed.push({ old: file, new: newName });
        console.log(`Renamed: ${file} → ${newName}`);
      }
    }

    console.log(`\n✓ Renamed ${renamed.length} files`);
    return renamed;
  } catch {
    console.error('Error renaming files');
    process.exit(1);
  }
}

async function main() {
  const directory = process.argv[2] || path.join(__dirname, '..', 'data', 'burial_register', 'vol1', 'extracted_pages');

  try {
    await fs.access(directory);
  } catch {
    console.error(`Error: Directory not found: ${directory}`);
    process.exit(1);
  }

  console.log(`Renaming files in: ${directory}\n`);
  await renameFiles(directory);
}

if (require.main === module) {
  main();
}

module.exports = { renameFiles };


