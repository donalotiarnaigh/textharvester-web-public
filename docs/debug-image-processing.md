# Debug Image Processing Configuration

This document explains how to use the enhanced debug logging and image saving features for the image preprocessing pipeline.

## Default Behavior

Debug features are **enabled by default** and will automatically run during normal image processing. No additional configuration is required.

## Environment Variables

To disable debug features, add these environment variables to your `.env` file:

```bash
# Disable detailed debug logging for image processing
DEBUG_IMAGE_PROCESSING=false

# Disable saving debug images to temp folder
SAVE_DEBUG_IMAGES=false

# Standard configuration
NODE_ENV=development
PORT=3000
AI_PROVIDER=openai
```

## Debug Features

### 1. Enhanced Logging

When `DEBUG_IMAGE_PROCESSING=true`, the system provides detailed step-by-step logging:

- **INITIAL_ANALYSIS**: Original image metadata and file size
- **DIMENSION_CALCULATION**: Optimal dimension calculations
- **IMAGE_PROCESSING**: Processing pipeline operations
- **EXIF_ROTATION**: Orientation correction details
- **RESIZE_OPERATION**: Resizing parameters and results
- **JPEG_COMPRESSION**: Compression settings and quality
- **BUFFER_CONVERSION**: Buffer conversion process
- **PROCESSING_RESULTS**: Final processing metrics
- **SIZE_VERIFICATION**: Size limit checking
- **AGGRESSIVE_COMPRESSION**: Fallback compression level 1
- **ULTRA_AGGRESSIVE_COMPRESSION**: Fallback compression level 2
- **BASE64_CONVERSION**: Final base64 conversion
- **OPTIMIZATION_SUCCESS**: Success summary

### 2. Debug Image Saving

When `SAVE_DEBUG_IMAGES=true`, the system saves images at each processing stage:

- **00_original**: Original image before any processing
- **01_processed**: After initial processing (rotation, resize, compression)
- **02_aggressive**: After aggressive compression (if needed)
- **03_ultra_aggressive**: After ultra-aggressive compression (if needed)

Images are saved to: `data/temp/debug_images/`

## Debug Image Naming Convention

```
{original_filename}_{stage}_{timestamp}.jpg
```

Example:
```
monument_001_00_original_2024-01-15_14-30-25-123.jpg
monument_001_01_processed_2024-01-15_14-30-25-456.jpg
monument_001_02_aggressive_2024-01-15_14-30-25-789.jpg
```

## Log Output Example

```
[ImageProcessor] ===== STARTING IMAGE OPTIMIZATION =====
[ImageProcessor] Provider: anthropic
[ImageProcessor] Input: monument_001.jpg
[ImageProcessor] Provider limits: 5MB file, 4096px max dimension

[ImageProcessor] ===== INITIAL_ANALYSIS =====
[ImageProcessor] step: Reading image metadata and file size
[ImageProcessor] inputType: File path
[ImageProcessor] originalWidth: 6000
[ImageProcessor] originalHeight: 4000
[ImageProcessor] originalFileSize: 15728640
[ImageProcessor] originalFileSizeKB: 15360KB
[ImageProcessor] originalFileSizeMB: 15.00MB
[ImageProcessor] exifOrientation: 6
[ImageProcessor] format: jpeg
[ImageProcessor] channels: 3
[ImageProcessor] density: 300
[ImageProcessor] hasAlpha: false
[ImageProcessor] ===== END INITIAL_ANALYSIS =====

[ImageProcessor] DEBUG IMAGE SAVED: monument_001_00_original_2024-01-15_14-30-25-123.jpg
[ImageProcessor] DEBUG - Stage: 00_original
[ImageProcessor] DEBUG - Dimensions: 6000x4000
[ImageProcessor] DEBUG - Size: 15360.00KB
[ImageProcessor] DEBUG - Path: /path/to/data/temp/debug_images/monument_001_00_original_2024-01-15_14-30-25-123.jpg

[ImageProcessor] ===== DIMENSION_CALCULATION =====
[ImageProcessor] step: Calculating optimal dimensions for provider limits
[ImageProcessor] maxAllowedDimension: 4096
[ImageProcessor] originalDimensions: 6000x4000
[ImageProcessor] calculatedWidth: 4096
[ImageProcessor] calculatedHeight: 2731
[ImageProcessor] needsResize: true
[ImageProcessor] scaleFactor: 0.6826666666666666
[ImageProcessor] aspectRatio: 1.500
[ImageProcessor] originalAspectRatio: 1.500
[ImageProcessor] ===== END DIMENSION_CALCULATION =====
```

## Manual Review Process

1. **Enable debug features** by setting environment variables
2. **Process an image** through the system
3. **Check the debug folder** at `data/temp/debug_images/`
4. **Compare images** to see the effect of each processing step
5. **Review logs** to understand the processing decisions

## Debug Folder Structure

```
data/temp/debug_images/
├── monument_001_00_original_2024-01-15_14-30-25-123.jpg
├── monument_001_01_processed_2024-01-15_14-30-25-456.jpg
├── monument_001_02_aggressive_2024-01-15_14-30-25-789.jpg
└── monument_001_03_ultra_aggressive_2024-01-15_14-30-25-012.jpg
```

## Performance Impact

- **Debug logging**: Minimal impact on performance
- **Debug image saving**: Moderate impact due to file I/O operations
- **Recommendation**: Enable only during development and testing

## Troubleshooting

### Debug images not saving
- Check that `SAVE_DEBUG_IMAGES=true` is set
- Verify write permissions to `data/temp/debug_images/`
- Check disk space availability

### Debug logging not appearing
- Ensure `DEBUG_IMAGE_PROCESSING=true` is set
- Check logger configuration
- Verify environment variables are loaded correctly

### Large debug folder
- Debug images are not automatically cleaned up
- Manually delete old debug images periodically
- Consider adding cleanup scripts for production use
