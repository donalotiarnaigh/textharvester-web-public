/**
 * @fileoverview Mobile Upload Handler for iOS app photo uploads
 *
 * Handles multipart file uploads from the Historic Graves iOS Survey App.
 * Validates filenames using FilenameValidator, extracts site_code, and
 * enqueues files for OCR processing via fileQueue.
 *
 * Requirements covered:
 * - 1.1: Mobile Upload Endpoint (accept valid images, return queueId)
 * - 1.3: Successful upload returns queueId and status
 * - 2.1: Files added to IngestService with source_type='monument_photo'
 *
 * @see docs/ios-async-upload/requirements.md
 * @see docs/ios-async-upload/design.md
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { validateFilename } = require('../utils/filenameValidator');
const { enqueueFiles } = require('../utils/fileQueue');
const logger = require('../utils/logger');
const config = require('../../config.json');

// Mobile upload directory
const MOBILE_UPLOAD_DIR = path.join(config.uploadPath || 'uploads', 'mobile');

/**
 * Get multer configuration for mobile uploads
 * @returns {Object} Multer configuration
 */
function getMulterConfig() {
  // Ensure upload directory exists
  if (!fs.existsSync(MOBILE_UPLOAD_DIR)) {
    fs.mkdirSync(MOBILE_UPLOAD_DIR, { recursive: true });
  }

  // Configure multer storage for mobile uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, MOBILE_UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
      // Preserve original filename for site_code extraction
      const timestamp = Date.now();
      const safeFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      cb(null, `${timestamp}_${safeFilename}`);
    }
  });

  // File filter for image types only
  const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Only JPEG and PNG images are allowed.'), false);
    }
  };

  return {
    storage,
    fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
  };
}

/**
 * Handle mobile upload request
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleMobileUpload(req, res) {
  // Create multer middleware dynamically (allows mocking in tests)
  const upload = multer(getMulterConfig());
  const uploadMiddleware = upload.single('file');

  // Wrap multer in a promise to handle errors
  try {
    await new Promise((resolve, reject) => {
      uploadMiddleware(req, res, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  } catch (err) {
    // Handle multer errors
    if (err instanceof multer.MulterError || (err.name && err.name === 'MulterError')) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        logger.warn('Mobile upload rejected: file too large');
        return res.status(413).json({
          error: 'File too large. Maximum file size is 50MB.'
        });
      }
    }
    // Handle file filter errors or other errors
    logger.error('Mobile upload error:', err.message);
    return res.status(400).json({
      error: err.message || 'Upload failed'
    });
  }

  // Check if file was provided
  if (!req.file) {
    logger.warn('Mobile upload rejected: no file provided');
    return res.status(400).json({
      error: 'No file provided. Please upload an image file.'
    });
  }

  const { originalname, path: filePath, mimetype } = req.file;

  // Validate mime type (double-check after multer)
  const allowedMimeTypes = ['image/jpeg', 'image/png'];
  if (!allowedMimeTypes.includes(mimetype)) {
    logger.warn(`Mobile upload rejected: unsupported file type ${mimetype}`);
    // Clean up uploaded file
    fs.unlink(filePath, () => { });
    return res.status(400).json({
      error: 'Unsupported file type. Only JPEG and PNG images are allowed.'
    });
  }

  // Validate filename format and extract site_code
  let validationResult;
  try {
    validationResult = validateFilename(originalname, { strict: false });
  } catch (error) {
    logger.warn(`Mobile upload rejected: filename validation error - ${error.message}`);
    // Clean up uploaded file
    fs.unlink(filePath, () => { });
    return res.status(400).json({
      error: `Invalid filename: ${error.message}`
    });
  }

  if (!validationResult.valid) {
    logger.warn(`Mobile upload rejected: ${validationResult.error}`);
    // Clean up uploaded file
    fs.unlink(filePath, () => { });
    return res.status(400).json({
      error: `Invalid filename format: ${validationResult.error}`
    });
  }

  const { siteCode } = validationResult;

  // Enqueue file for processing
  try {
    const fileData = {
      path: filePath,
      originalname,
      source_type: 'monument_photo',
      sourceType: 'monument_photo',
      site_code: siteCode,
      provider: 'openai' // Default provider for mobile uploads
    };

    const result = await enqueueFiles([fileData]);
    const queueId = result && result[0] ? result[0].queueId : `mobile-${Date.now()}`;

    logger.info(`Mobile upload queued: ${originalname} (site_code: ${siteCode}, queueId: ${queueId})`);

    return res.status(200).json({
      queued: true,
      queueId,
      siteCode,
      filename: originalname,
      message: 'File queued for processing'
    });
  } catch (error) {
    logger.error('Failed to enqueue mobile upload:', error);
    // Clean up uploaded file on queue failure
    fs.unlink(filePath, () => { });
    return res.status(503).json({
      error: 'Queue service unavailable. Please try again later.'
    });
  }
}

module.exports = {
  handleMobileUpload
};
