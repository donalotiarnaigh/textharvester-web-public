const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const moment = require('moment');

/**
 * Image processing utility for optimizing images before AI processing
 * Handles provider-specific size limits while maintaining OCR quality
 */

// Provider-specific limits
const PROVIDER_LIMITS = {
  anthropic: {
    maxFileSize: 5 * 1024 * 1024,  // 5MB in bytes
    maxDimension: 4096,             // Increased to 4096px for better monument OCR (Claude supports up to 8000px)
    minDimension: 200               // Minimum to avoid performance degradation
  },
  openai: {
    maxFileSize: 20 * 1024 * 1024,  // 20MB limit for OpenAI
    maxDimension: 3072,             // Higher resolution for better monument OCR
    minDimension: 200
  }
};

// Debug configuration - enabled by default
const DEBUG_CONFIG = {
  enabled: process.env.DEBUG_IMAGE_PROCESSING !== 'false', // Default to true unless explicitly disabled
  saveDebugImages: process.env.SAVE_DEBUG_IMAGES !== 'false', // Default to true unless explicitly disabled
  debugImagePath: path.join(__dirname, '../../data/temp/debug_images')
};

/**
 * Ensure debug directory exists
 */
async function ensureDebugDirectory() {
  if (DEBUG_CONFIG.saveDebugImages) {
    try {
      await fs.mkdir(DEBUG_CONFIG.debugImagePath, { recursive: true });
    } catch (error) {
      logger.warn(`[ImageProcessor] Could not create debug directory: ${error.message}`);
    }
  }
}

/**
 * Save debug image with detailed metadata
 * @param {Buffer} imageBuffer - Image buffer to save
 * @param {string} filename - Base filename
 * @param {Object} metadata - Image metadata
 * @param {string} stage - Processing stage description
 */
async function saveDebugImage(imageBuffer, filename, metadata, stage) {
  if (!DEBUG_CONFIG.saveDebugImages) return;

  try {
    await ensureDebugDirectory();

    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss-SSS');
    const baseName = path.basename(filename, path.extname(filename));
    const debugFilename = `${baseName}_${stage}_${timestamp}.jpg`;
    const debugPath = path.join(DEBUG_CONFIG.debugImagePath, debugFilename);

    await fs.writeFile(debugPath, imageBuffer);

    logger.info(`[ImageProcessor] DEBUG IMAGE SAVED: ${debugFilename}`);
    logger.info(`[ImageProcessor] DEBUG - Stage: ${stage}`);
    logger.info(`[ImageProcessor] DEBUG - Dimensions: ${metadata.width}x${metadata.height}`);
    logger.info(`[ImageProcessor] DEBUG - Size: ${(imageBuffer.length / 1024).toFixed(2)}KB`);
    logger.info(`[ImageProcessor] DEBUG - Path: ${debugPath}`);
  } catch (error) {
    logger.warn(`[ImageProcessor] Failed to save debug image: ${error.message}`);
  }
}

/**
 * Enhanced debug logging for image processing steps
 * @param {string} step - Processing step name
 * @param {Object} data - Step data to log
 */
function logProcessingStep(step, data) {
  if (!DEBUG_CONFIG.enabled) return;

  logger.info(`[ImageProcessor] ===== ${step.toUpperCase()} =====`);
  Object.entries(data).forEach(([key, value]) => {
    if (typeof value === 'number' && key.includes('Size')) {
      logger.info(`[ImageProcessor] ${key}: ${(value / 1024).toFixed(2)}KB (${(value / (1024 * 1024)).toFixed(2)}MB)`);
    } else if (typeof value === 'object' && value !== null) {
      logger.info(`[ImageProcessor] ${key}: ${JSON.stringify(value, null, 2)}`);
    } else {
      logger.info(`[ImageProcessor] ${key}: ${value}`);
    }
  });
  logger.info(`[ImageProcessor] ===== END ${step.toUpperCase()} =====`);
}

/**
 * Calculate optimal dimensions for resizing while maintaining aspect ratio
 * @param {number} originalWidth - Original image width
 * @param {number} originalHeight - Original image height
 * @param {number} maxDimension - Maximum allowed dimension
 * @returns {Object} - New width and height
 */
function calculateOptimalDimensions(originalWidth, originalHeight, maxDimension) {
  // If image is already within limits, keep original dimensions
  if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
    return { width: originalWidth, height: originalHeight };
  }

  // Calculate scaling factor based on the larger dimension
  const scaleFactor = maxDimension / Math.max(originalWidth, originalHeight);

  return {
    width: Math.round(originalWidth * scaleFactor),
    height: Math.round(originalHeight * scaleFactor)
  };
}

/**
 * Optimize image for AI processing based on provider requirements
 * @param {string|Buffer} input - Path to input image or buffer
 * @param {string} provider - AI provider ('anthropic' or 'openai')
 * @param {Object} options - Processing options
 * @returns {Promise<string>} - Base64 encoded optimized image
 */
async function optimizeImageForProvider(input, provider = 'anthropic', /* eslint-disable-line no-unused-vars */ options = {}) {
  const providerLimits = PROVIDER_LIMITS[provider] || PROVIDER_LIMITS.anthropic;
  const isBuffer = Buffer.isBuffer(input);
  const inputFilename = isBuffer ? 'buffer_input' : path.basename(input);

  logger.info('[ImageProcessor] ===== STARTING IMAGE OPTIMIZATION =====');
  logger.info(`[ImageProcessor] Provider: ${provider}`);
  logger.info(`[ImageProcessor] Input: ${isBuffer ? 'Buffer' : inputFilename}`);
  logger.info(`[ImageProcessor] Provider limits: ${providerLimits.maxFileSize / (1024 * 1024)}MB file, ${providerLimits.maxDimension}px max dimension`);

  try {
    // STEP 1: Get image metadata and size
    logProcessingStep('INITIAL_ANALYSIS', {
      step: 'Reading image metadata and file size',
      inputType: isBuffer ? 'Buffer' : 'File path'
    });

    const statsSize = isBuffer ? input.length : (await fs.stat(input)).size;
    const image = sharp(input);
    const metadata = await image.metadata();

    const initialAnalysis = {
      originalWidth: metadata.width,
      originalHeight: metadata.height,
      originalFileSize: statsSize,
      originalFileSizeKB: Math.round(statsSize / 1024),
      originalFileSizeMB: (statsSize / (1024 * 1024)).toFixed(2),
      exifOrientation: metadata.orientation || 'not specified',
      format: metadata.format,
      channels: metadata.channels,
      density: metadata.density,
      hasAlpha: metadata.hasAlpha
    };

    logProcessingStep('INITIAL_ANALYSIS', initialAnalysis);

    // Save original image for debug
    if (isBuffer) {
      await saveDebugImage(input, inputFilename, metadata, '00_original');
    } else {
      const originalBuffer = await fs.readFile(input);
      await saveDebugImage(originalBuffer, inputFilename, metadata, '00_original');
    }

    // STEP 2: Calculate optimal dimensions
    logProcessingStep('DIMENSION_CALCULATION', {
      step: 'Calculating optimal dimensions for provider limits',
      maxAllowedDimension: providerLimits.maxDimension,
      originalDimensions: `${metadata.width}x${metadata.height}`
    });

    const { width, height } = calculateOptimalDimensions(
      metadata.width,
      metadata.height,
      providerLimits.maxDimension
    );

    const dimensionCalculation = {
      calculatedWidth: width,
      calculatedHeight: height,
      needsResize: width !== metadata.width || height !== metadata.height,
      scaleFactor: width / metadata.width,
      aspectRatio: (width / height).toFixed(3),
      originalAspectRatio: (metadata.width / metadata.height).toFixed(3)
    };

    logProcessingStep('DIMENSION_CALCULATION', dimensionCalculation);

    // Extract needsResize from dimensionCalculation for use in subsequent steps
    const needsResize = dimensionCalculation.needsResize;

    // STEP 3: Image processing pipeline
    logProcessingStep('IMAGE_PROCESSING', {
      step: 'Starting image processing pipeline',
      operations: ['EXIF rotation', needsResize ? 'Resize' : 'No resize', 'JPEG compression']
    });

    let processedImage = image;

    // Auto-rotate based on EXIF orientation data
    logProcessingStep('EXIF_ROTATION', {
      step: 'Applying EXIF orientation correction',
      originalOrientation: metadata.orientation || 'not specified',
      operation: 'Auto-rotate based on EXIF data'
    });

    processedImage = processedImage.rotate();

    if (needsResize) {
      logProcessingStep('RESIZE_OPERATION', {
        step: 'Resizing image to optimal dimensions',
        fromDimensions: `${metadata.width}x${metadata.height}`,
        toDimensions: `${width}x${height}`,
        resamplingKernel: 'Lanczos3',
        withoutEnlargement: true
      });

      processedImage = processedImage.resize(width, height, {
        kernel: sharp.kernel.lanczos3,  // High-quality resampling for text
        withoutEnlargement: true        // Don't enlarge smaller images
      });
    }

    // Configure JPEG compression for OCR quality
    let jpegQuality;
    if (provider === 'openai') {
      jpegQuality = 95;  // OpenAI can handle larger files
    } else {
      // For Claude, start with high quality but be prepared to reduce
      jpegQuality = 90;  // Good balance for text readability while staying under 5MB
    }

    logProcessingStep('JPEG_COMPRESSION', {
      step: 'Applying JPEG compression',
      quality: jpegQuality,
      provider: provider,
      progressive: false,
      encoder: 'mozjpeg',
      reason: 'Optimized for OCR text readability'
    });

    processedImage = processedImage.jpeg({
      quality: jpegQuality,  // Adaptive quality based on provider
      progressive: false,    // Better for OCR processing
      mozjpeg: true         // Use mozjpeg encoder for better compression
    });

    // STEP 4: Convert to buffer and analyze results
    logProcessingStep('BUFFER_CONVERSION', {
      step: 'Converting processed image to buffer'
    });

    const buffer = await processedImage.toBuffer();
    const finalSizeKB = Math.round(buffer.length / 1024);
    const finalSizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
    const compressionRatio = ((1 - buffer.length / statsSize) * 100).toFixed(1);

    // Get final metadata to check if rotation occurred
    const finalMetadata = await sharp(buffer).metadata();

    const processingResults = {
      finalWidth: width,
      finalHeight: height,
      finalFileSize: buffer.length,
      finalFileSizeKB: finalSizeKB,
      finalFileSizeMB: finalSizeMB,
      compressionRatio: `${compressionRatio}% reduction`,
      finalOrientation: finalMetadata.orientation || 'not specified',
      withinProviderLimits: buffer.length <= providerLimits.maxFileSize,
      sizeReduction: `${(statsSize - buffer.length).toFixed(0)} bytes saved`
    };

    logProcessingStep('PROCESSING_RESULTS', processingResults);

    // Save processed image for debug
    await saveDebugImage(buffer, inputFilename, { width, height, ...finalMetadata }, '01_processed');

    // STEP 5: Verify size is within limits and apply fallback compression if needed
    if (buffer.length > providerLimits.maxFileSize) {
      logProcessingStep('SIZE_VERIFICATION', {
        step: 'Image exceeds provider limits - applying fallback compression',
        currentSize: finalSizeMB,
        maxAllowedSize: `${providerLimits.maxFileSize / (1024 * 1024)}MB`,
        excessSize: `${(buffer.length - providerLimits.maxFileSize) / (1024 * 1024)}MB over limit`
      });

      // FALLBACK LEVEL 1: Aggressive compression
      logProcessingStep('AGGRESSIVE_COMPRESSION', {
        step: 'Applying aggressive compression (70% dimensions, 80% quality)',
        reason: 'Initial compression insufficient for provider limits'
      });

      const aggressiveWidth = Math.round(width * 0.7);
      const aggressiveHeight = Math.round(height * 0.7);

      const aggressiveCompressionParams = {
        newWidth: aggressiveWidth,
        newHeight: aggressiveHeight,
        quality: 80,
        scaleFactor: 0.7,
        resamplingKernel: 'Lanczos3'
      };

      logProcessingStep('AGGRESSIVE_COMPRESSION', aggressiveCompressionParams);

      const aggressiveBuffer = await sharp(input)
        .resize(aggressiveWidth, aggressiveHeight, {
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: true
        })
        .jpeg({
          quality: 80,        // More aggressive compression but still readable
          progressive: false,
          mozjpeg: true
        })
        .toBuffer();

      const aggressiveSizeMB = (aggressiveBuffer.length / (1024 * 1024)).toFixed(2);
      const aggressiveCompressionRatio = ((1 - aggressiveBuffer.length / statsSize) * 100).toFixed(1);
      const aggressiveResults = {
        finalWidth: aggressiveWidth,
        finalHeight: aggressiveHeight,
        finalFileSize: aggressiveBuffer.length,
        finalFileSizeMB: aggressiveSizeMB,
        compressionRatio: `${aggressiveCompressionRatio}% reduction`,
        withinLimits: aggressiveBuffer.length <= providerLimits.maxFileSize
      };

      logProcessingStep('AGGRESSIVE_COMPRESSION_RESULTS', aggressiveResults);

      // Save aggressive compression result for debug
      await saveDebugImage(aggressiveBuffer, inputFilename, { width: aggressiveWidth, height: aggressiveHeight }, '02_aggressive');

      if (aggressiveBuffer.length <= providerLimits.maxFileSize) {
        logProcessingStep('COMPRESSION_SUCCESS', {
          step: 'Aggressive compression successful',
          finalSize: aggressiveSizeMB,
          compressionLevel: 'Aggressive (70% dimensions, 80% quality)'
        });
        return aggressiveBuffer.toString('base64');
      }

      // FALLBACK LEVEL 2: Ultra-aggressive compression
      logProcessingStep('ULTRA_AGGRESSIVE_COMPRESSION', {
        step: 'Applying ultra-aggressive compression (56% dimensions, 70% quality)',
        reason: 'Aggressive compression still insufficient for provider limits'
      });

      const ultraWidth = Math.round(aggressiveWidth * 0.8);
      const ultraHeight = Math.round(aggressiveHeight * 0.8);

      const ultraCompressionParams = {
        newWidth: ultraWidth,
        newHeight: ultraHeight,
        quality: 70,
        scaleFactor: 0.56, // 0.7 * 0.8
        resamplingKernel: 'Lanczos3'
      };

      logProcessingStep('ULTRA_AGGRESSIVE_COMPRESSION', ultraCompressionParams);

      const ultraAggressiveBuffer = await sharp(input)
        .resize(ultraWidth, ultraHeight, {
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: true
        })
        .jpeg({
          quality: 70,        // Ultra-aggressive compression but preserve text
          progressive: false,
          mozjpeg: true
        })
        .toBuffer();

      const ultraSizeMB = (ultraAggressiveBuffer.length / (1024 * 1024)).toFixed(2);
      const ultraCompressionRatio = ((1 - ultraAggressiveBuffer.length / statsSize) * 100).toFixed(1);
      const ultraResults = {
        finalWidth: ultraWidth,
        finalHeight: ultraHeight,
        finalFileSize: ultraAggressiveBuffer.length,
        finalFileSizeMB: ultraSizeMB,
        compressionRatio: `${ultraCompressionRatio}% reduction`,
        withinLimits: ultraAggressiveBuffer.length <= providerLimits.maxFileSize
      };

      logProcessingStep('ULTRA_AGGRESSIVE_COMPRESSION_RESULTS', ultraResults);

      // Save ultra-aggressive compression result for debug
      await saveDebugImage(ultraAggressiveBuffer, inputFilename, { width: ultraWidth, height: ultraHeight }, '03_ultra_aggressive');

      if (ultraAggressiveBuffer.length <= providerLimits.maxFileSize) {
        logProcessingStep('COMPRESSION_SUCCESS', {
          step: 'Ultra-aggressive compression successful',
          finalSize: ultraSizeMB,
          compressionLevel: 'Ultra-aggressive (56% dimensions, 70% quality)'
        });
        return ultraAggressiveBuffer.toString('base64');
      }

      // COMPRESSION FAILED
      logProcessingStep('COMPRESSION_FAILED', {
        step: 'All compression levels failed to meet provider limits',
        finalAttemptSize: ultraSizeMB,
        maxAllowedSize: `${providerLimits.maxFileSize / (1024 * 1024)}MB`,
        provider: provider,
        error: 'Unable to compress image below provider limits'
      });

      throw new Error(`Unable to compress image below ${providerLimits.maxFileSize / (1024 * 1024)}MB limit for ${provider}`);
    }

    // STEP 6: Final base64 conversion and success logging
    logProcessingStep('BASE64_CONVERSION', {
      step: 'Converting final image to base64',
      finalImageSize: finalSizeMB,
      base64Size: `${(buffer.length * 1.33 / (1024 * 1024)).toFixed(2)}MB (estimated)`,
      compressionRatio: compressionRatio
    });

    const base64 = buffer.toString('base64');

    logProcessingStep('OPTIMIZATION_SUCCESS', {
      step: 'Image optimization completed successfully',
      provider: provider,
      finalDimensions: `${width}x${height}`,
      finalFileSize: finalSizeMB,
      compressionRatio: compressionRatio,
      withinLimits: true,
      base64Length: base64.length
    });

    logger.info('[ImageProcessor] ===== IMAGE OPTIMIZATION COMPLETE =====');

    return base64;

  } catch (error) {
    logger.error(`[ImageProcessor] Failed to optimize image: ${error.message}`);
    throw new Error(`Image optimization failed: ${error.message}`);
  }
}

/**
 * Check if an image needs optimization for a specific provider
 * @param {string|Buffer} image - Path to image file or buffer
 * @param {string} provider - AI provider name
 * @returns {Promise<Object>} - Analysis result with recommendations
 */
async function analyzeImageForProvider(image, provider = 'anthropic') {
  const providerLimits = PROVIDER_LIMITS[provider] || PROVIDER_LIMITS.anthropic;
  const isBuffer = Buffer.isBuffer(image);
  const imageName = isBuffer ? 'buffer_input' : path.basename(image);

  logProcessingStep('IMAGE_ANALYSIS_START', {
    step: 'Starting image analysis for provider optimization',
    provider: provider,
    imageName: imageName,
    inputType: isBuffer ? 'Buffer' : 'File path'
  });

  try {
    let statsSize;
    let metadata;
    if (isBuffer) {
      statsSize = image.length;
      metadata = await sharp(image).metadata();
    } else {
      const stats = await fs.stat(image);
      statsSize = stats.size;
      metadata = await sharp(image).metadata();
    }

    const analysis = {
      originalSize: statsSize,
      originalSizeMB: (statsSize / (1024 * 1024)).toFixed(2),
      dimensions: `${metadata.width}x${metadata.height}`,
      needsOptimization: false,
      reasons: []
    };

    // Detailed analysis logging
    const imageMetadata = {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      channels: metadata.channels,
      density: metadata.density,
      hasAlpha: metadata.hasAlpha,
      orientation: metadata.orientation || 'not specified',
      fileSize: statsSize,
      fileSizeKB: Math.round(statsSize / 1024),
      fileSizeMB: analysis.originalSizeMB
    };

    logProcessingStep('IMAGE_METADATA', imageMetadata);

    // Provider limits analysis
    const providerAnalysis = {
      provider: provider,
      maxFileSize: providerLimits.maxFileSize,
      maxFileSizeMB: (providerLimits.maxFileSize / (1024 * 1024)).toFixed(2),
      maxDimension: providerLimits.maxDimension,
      minDimension: providerLimits.minDimension
    };

    logProcessingStep('PROVIDER_LIMITS', providerAnalysis);

    // Check file size - account for base64 encoding overhead (~33% increase)
    const base64Size = Math.round(statsSize * 1.33); // Base64 encoding increases size by ~33%
    const base64SizeMB = (base64Size / (1024 * 1024)).toFixed(2);

    const sizeAnalysis = {
      originalFileSize: statsSize,
      originalFileSizeMB: analysis.originalSizeMB,
      base64Size: base64Size,
      base64SizeMB: base64SizeMB,
      sizeIncrease: `${((base64Size - statsSize) / statsSize * 100).toFixed(1)}%`,
      exceedsFileLimit: base64Size > providerLimits.maxFileSize,
      fileLimitExcess: base64Size > providerLimits.maxFileSize ?
        `${(base64Size - providerLimits.maxFileSize) / (1024 * 1024)}MB over limit` : 'Within limits'
    };

    logProcessingStep('SIZE_ANALYSIS', sizeAnalysis);

    if (base64Size > providerLimits.maxFileSize) {
      analysis.needsOptimization = true;
      analysis.reasons.push(`Base64 encoded size ${base64SizeMB}MB exceeds ${providerLimits.maxFileSize / (1024 * 1024)}MB limit`);
    }

    // Check dimensions
    const dimensionAnalysis = {
      originalWidth: metadata.width,
      originalHeight: metadata.height,
      maxAllowedDimension: providerLimits.maxDimension,
      widthExceedsLimit: metadata.width > providerLimits.maxDimension,
      heightExceedsLimit: metadata.height > providerLimits.maxDimension,
      dimensionExcess: metadata.width > providerLimits.maxDimension || metadata.height > providerLimits.maxDimension ?
        `${Math.max(metadata.width, metadata.height) - providerLimits.maxDimension}px over limit` : 'Within limits'
    };

    logProcessingStep('DIMENSION_ANALYSIS', dimensionAnalysis);

    if (metadata.width > providerLimits.maxDimension || metadata.height > providerLimits.maxDimension) {
      analysis.needsOptimization = true;
      analysis.reasons.push(`Dimensions ${analysis.dimensions} exceed ${providerLimits.maxDimension}px recommendation`);
    }

    // Final analysis summary
    const analysisSummary = {
      needsOptimization: analysis.needsOptimization,
      reasons: analysis.reasons,
      reasonCount: analysis.reasons.length,
      optimizationRequired: analysis.needsOptimization ? 'YES' : 'NO',
      recommendation: analysis.needsOptimization ?
        'Image requires optimization before processing' :
        'Image can be processed without optimization'
    };

    logProcessingStep('ANALYSIS_SUMMARY', analysisSummary);

    logger.info('[ImageProcessor] ===== IMAGE ANALYSIS COMPLETE =====');

    return analysis;

  } catch (error) {
    logProcessingStep('ANALYSIS_ERROR', {
      step: 'Image analysis failed',
      error: error.message,
      imageName: imageName,
      provider: provider
    });
    throw new Error(`Failed to analyze image: ${error.message}`);
  }
}

module.exports = {
  optimizeImageForProvider,
  analyzeImageForProvider,
  PROVIDER_LIMITS,
  calculateOptimalDimensions
};
