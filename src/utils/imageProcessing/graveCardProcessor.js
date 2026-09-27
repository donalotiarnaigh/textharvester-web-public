const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const sharp = require('sharp');
const config = require('../../../config.json');
const logger = require('../logger');

class GraveCardProcessor {
  constructor() {
    this.config = config.graveCard || { stitchPadding: 20 };
    this.uploadPath = config.uploadPath;
  }

  /**
     * Process a grave card PDF: convert to images, validate count, stitch.
     * @param {string} pdfPath - Absolute path to the PDF file
     * @returns {Promise<Buffer>} - Stitched image buffer
     */
  async processPdf(pdfPath) {
    const originalBaseName = path.basename(pdfPath, path.extname(pdfPath));
    const uniqueId = Date.now();

    // Use first 10 chars of name to keep filenames manageable
    const safeName = originalBaseName.slice(0, 10).replace(/[^a-zA-Z0-9]/g, '_');
    const outputPrefix = `${safeName}_${uniqueId}_page`;
    const outputFullPathCommon = path.join(this.uploadPath, outputPrefix);

    logger.info(`Processing Grave Card PDF: ${pdfPath}`);

    // Convert PDF to JPEGs
    try {
      await this.convertPdf(pdfPath, outputFullPathCommon);

      // Find generated files
      const files = await this.findGeneratedFiles(outputPrefix);

      // Validate page count
      if (files.length !== 2) {
        // Cleanup immediately if invalid
        await this.cleanup(files, pdfPath);
        const error = new Error(`Invalid page count: Expected 2 pages, found ${files.length}. Grave cards must have exactly front and back.`);
        error.fatal = true; // Signal to fileQueue that this should not be retried
        throw error;
      }

      // Stitch images
      const stitchedBuffer = await this.stitchImages(files);

      // Cleanup
      await this.cleanup(files, pdfPath);

      return stitchedBuffer;

    } catch (error) {
      logger.error('GraveCardProcessor Error:', error);
      // Attempt cleanup on error if not already done? 
      // Simplified: cleanup checks existence, so safe to call again or we can rely on caller.
      // But let's try to search and destroy specific files if we failed mid-way.
      // For now, simpler error propagation.
      throw error;
    }
  }

  async convertPdf(pdfPath, outputPrefix) {
    // scale-to matches existing pdfConverter logic roughly, but we want high quality.
    // config.graveCard.minResolution could be used here.
    const command = `pdftocairo -jpeg -scale-to 2048 "${pdfPath}" "${outputPrefix}"`;

    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Failed to convert PDF: ${stderr || error.message}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  async findGeneratedFiles(prefix) {
    const allFiles = await fs.readdir(this.uploadPath);
    return allFiles
      .filter(f => f.startsWith(prefix) && f.endsWith('.jpg'))
      .sort() // Ensure page-1 comes before page-2
      .map(f => path.join(this.uploadPath, f));
  }

  async stitchImages(imagePaths) {
    const padding = this.config.stitchPadding || 20;

    // Load images
    const images = await Promise.all(imagePaths.map(p => sharp(p)));
    const metadatas = await Promise.all(images.map(img => img.metadata()));

    // Calculate dimensions
    const width = Math.max(...metadatas.map(m => m.width));
    const totalHeight = metadatas.reduce((sum, m) => sum + m.height, 0) + padding;

    // Create background
    const background = sharp({
      create: {
        width: width,
        height: totalHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    });

    // Composite
    const compositeOps = [];
    let currentY = 0;

    // We must reload buffers or use the objects. Sharp composite takes objects with input: buffer/path
    // Simpler: just use the paths we have.

    for (let i = 0; i < imagePaths.length; i++) {
      compositeOps.push({ input: imagePaths[i], top: currentY, left: 0 });
      currentY += metadatas[i].height + padding;
    }

    return background
      .composite(compositeOps)
      .jpeg({ quality: 90 })
      .toBuffer();
  }

  async cleanup(generatedFiles, pdfPath) {
    try {
      await Promise.all(generatedFiles.map(f => fs.unlink(f).catch(() => { })));
      await fs.unlink(pdfPath).catch(() => { });
    } catch (err) {
      logger.warn(`Cleanup warning: ${err.message}`);
    }
  }
}

module.exports = new GraveCardProcessor();
