/* eslint-disable quotes */
const path = require("path");
const { exec } = require("child_process");
const fs = require("fs").promises;
const config = require("../../config.json");
const logger = require("../utils/logger");

async function convertPdfToJpegs(pdfPath, options = {}) {
  const { keepSource = false } = options;
  logger.info(`Starting PDF conversion for: ${pdfPath}`);
  const outputPath = config.uploadPath;
  const originalBaseName = path.basename(pdfPath, path.extname(pdfPath));

  // Truncate the base name to 10 characters for the prefix
  const truncatedBaseName = originalBaseName.slice(0, 10);

  // Create a unique identifier to avoid filename conflicts
  const uniqueIdentifier = Date.now();

  // Generate the output prefix
  const outputPrefix = path.join(
    outputPath,
    `${truncatedBaseName}_${uniqueIdentifier}_page`
  );

  const command = `pdftocairo -jpeg -scale-to 2048 ${pdfPath} ${outputPrefix}`;

  logger.info(`Executing command: ${command}`);

  try {
    await new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          logger.error(`Error converting PDF to JPEGs: ${stderr}`);
          reject(new Error(`Failed to convert PDF to JPEGs: ${stderr}`));
        } else {
          logger.info(`PDF converted to JPEGs: ${stdout}`);
          resolve(stdout);
        }
      });
    });

    const files = await fs.readdir(outputPath);
    const outputFiles = files.filter((file) =>
      file.startsWith(`${truncatedBaseName}_${uniqueIdentifier}_page`)
    );

    const fullPaths = outputFiles.map((file) => path.join(outputPath, file));
    logger.info(`JPEG files created at: ${fullPaths.join(", ")}`);

    if (!keepSource) {
      await fs.unlink(pdfPath);
      logger.info(`Cleaned up processed PDF: ${pdfPath}`);
    }

    logger.info(`Completed PDF conversion for: ${pdfPath}`);
    return fullPaths;
  } catch (error) {
    logger.error("Error converting PDF to JPEGs:", error);
    // Still try to clean up on error unless keepSource is true
    if (!keepSource) {
      try {
        await fs.unlink(pdfPath);
        logger.info(`Cleaned up PDF after error: ${pdfPath}`);
      } catch (cleanupError) {
        logger.error('Error cleaning up PDF:', cleanupError);
      }
    }
    throw new Error(`Failed to convert PDF to JPEGs: ${error.message}`);
  }
}

module.exports = {
  convertPdfToJpegs,
};
