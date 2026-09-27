const {
  optimizeImageForProvider,
  analyzeImageForProvider,
  PROVIDER_LIMITS,
  calculateOptimalDimensions
} = require('../../src/utils/imageProcessor');
const sharp = require('sharp');
const fs = require('fs').promises;

// Mock dependencies
jest.mock('sharp');
jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
    readFile: jest.fn()
  },
  stat: jest.fn(),
  readFile: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true)
}));
jest.mock('../../src/utils/logger');

describe('ImageProcessor', () => {
  let mockSharpInstance;
  let mockBuffer;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock buffer for image data
    mockBuffer = Buffer.from('mock-image-data');
    mockBuffer.toString = jest.fn().mockReturnValue('bW9jay1pbWFnZS1kYXRh'); // base64 mock

    // Mock fs.stat for both sync and async versions
    fs.stat = jest.fn().mockResolvedValue({ size: 6 * 1024 * 1024 });
    require('fs').stat = jest.fn().mockResolvedValue({ size: 6 * 1024 * 1024 });

    // Mock fs.readFile for both sync and async versions
    fs.readFile = jest.fn().mockResolvedValue(mockBuffer);
    require('fs').readFile = jest.fn().mockResolvedValue(mockBuffer);

    // Mock sharp instance with method chaining
    mockSharpInstance = {
      metadata: jest.fn().mockResolvedValue({
        width: 2000,
        height: 1500,
        size: 6 * 1024 * 1024 // 6MB
      }),
      resize: jest.fn().mockReturnThis(),
      jpeg: jest.fn().mockReturnThis(),
      rotate: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue(mockBuffer)
    };

    // Mock sharp constructor
    sharp.mockReturnValue(mockSharpInstance);
    sharp.kernel = { lanczos3: 'lanczos3' };
  });

  describe('PROVIDER_LIMITS', () => {
    it('should have correct limits for Anthropic', () => {
      expect(PROVIDER_LIMITS.anthropic).toEqual({
        maxFileSize: 5 * 1024 * 1024,  // 5MB
        maxDimension: 4096,  // Updated to 4096px for better monument OCR
        minDimension: 200
      });
    });

    it('should have correct limits for OpenAI', () => {
      expect(PROVIDER_LIMITS.openai).toEqual({
        maxFileSize: 20 * 1024 * 1024,  // 20MB
        maxDimension: 3072,  // Updated to 3072px for better monument OCR
        minDimension: 200
      });
    });
  });

  describe('calculateOptimalDimensions', () => {
    it('should keep dimensions when within limits', () => {
      const result = calculateOptimalDimensions(800, 600, 1568);
      expect(result).toEqual({ width: 800, height: 600 });
    });

    it('should scale down proportionally when width exceeds limit', () => {
      const result = calculateOptimalDimensions(2000, 1000, 1568);
      expect(result).toEqual({ width: 1568, height: 784 });
    });

    it('should scale down proportionally when height exceeds limit', () => {
      const result = calculateOptimalDimensions(1000, 2000, 1568);
      expect(result).toEqual({ width: 784, height: 1568 });
    });

    it('should handle square images correctly', () => {
      const result = calculateOptimalDimensions(2000, 2000, 1568);
      expect(result).toEqual({ width: 1568, height: 1568 });
    });
  });

  describe('analyzeImageForProvider', () => {
    beforeEach(() => {
      fs.stat.mockResolvedValue({
        size: 6 * 1024 * 1024 // 6MB
      });

      mockSharpInstance.metadata.mockResolvedValue({
        width: 2000,
        height: 1500
      });
    });

    it('should identify images that need optimization for Anthropic', async () => {
      const result = await analyzeImageForProvider('/test/image.jpg', 'anthropic');

      expect(result).toEqual({
        originalSize: 6 * 1024 * 1024,
        originalSizeMB: '6.00',
        dimensions: '2000x1500',
        needsOptimization: true,
        reasons: [
          'Base64 encoded size 7.98MB exceeds 5MB limit'
          // Dimensions 2000x1500 are now within 4096px limit
        ]
      });
    });

    it('should identify images that do not need optimization', async () => {
      fs.stat.mockResolvedValue({
        size: 2 * 1024 * 1024 // 2MB
      });

      mockSharpInstance.metadata.mockResolvedValue({
        width: 1200,
        height: 800
      });

      const result = await analyzeImageForProvider('/test/image.jpg', 'anthropic');

      expect(result).toEqual({
        originalSize: 2 * 1024 * 1024,
        originalSizeMB: '2.00',
        dimensions: '1200x800',
        needsOptimization: false,
        reasons: []
      });
    });

    it('should handle different providers', async () => {
      const result = await analyzeImageForProvider('/test/image.jpg', 'openai');

      expect(result.needsOptimization).toBe(false); // 6MB < 20MB limit for OpenAI and 2000 < 3072
      expect(result.reasons).toEqual([]); // No optimization needed for OpenAI with these dimensions
    });
  });

  describe('optimizeImageForProvider', () => {
    it('should optimize image for Anthropic when needed', async () => {
      // Mock metadata for image that exceeds 4096px limit
      mockSharpInstance.metadata.mockResolvedValue({
        width: 5000,
        height: 4000
      });

      // Mock a small final buffer (under 5MB)
      const smallBuffer = Buffer.alloc(3 * 1024 * 1024); // 3MB
      smallBuffer.toString = jest.fn().mockReturnValue('optimized-base64-data');
      mockSharpInstance.toBuffer.mockResolvedValue(smallBuffer);

      const result = await optimizeImageForProvider('/test/image.jpg', 'anthropic');

      expect(sharp).toHaveBeenCalledWith('/test/image.jpg');
      expect(mockSharpInstance.metadata).toHaveBeenCalled();
      expect(mockSharpInstance.resize).toHaveBeenCalledWith(4096, 3277, {
        kernel: 'lanczos3',
        withoutEnlargement: true
      });
      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({
        quality: 90,
        progressive: false,
        mozjpeg: true
      });
      expect(result).toBe('optimized-base64-data');
    });

    it('should not resize when image is within limits', async () => {
      mockSharpInstance.metadata.mockResolvedValue({
        width: 1200,
        height: 800,
        size: 2 * 1024 * 1024
      });

      // Mock a small final buffer
      const smallBuffer = Buffer.alloc(2 * 1024 * 1024);
      smallBuffer.toString = jest.fn().mockReturnValue('original-base64-data');
      mockSharpInstance.toBuffer.mockResolvedValue(smallBuffer);

      const result = await optimizeImageForProvider('/test/image.jpg', 'anthropic');

      expect(mockSharpInstance.resize).not.toHaveBeenCalled();
      expect(mockSharpInstance.jpeg).toHaveBeenCalled();
      expect(result).toBe('original-base64-data');
    });

    it('should apply aggressive compression when initial optimization fails', async () => {
      // Mock metadata for image that exceeds 4096px limit to trigger resizing
      mockSharpInstance.metadata.mockResolvedValue({
        width: 5000,
        height: 4000
      });

      // Mock initial compression still too large
      const largeBuffer = Buffer.alloc(7 * 1024 * 1024); // 7MB
      const smallBuffer = Buffer.alloc(4 * 1024 * 1024); // 4MB
      smallBuffer.toString = jest.fn().mockReturnValue('aggressive-base64-data');

      // First call returns large buffer, second call (aggressive) returns small buffer
      mockSharpInstance.toBuffer
        .mockResolvedValueOnce(largeBuffer)
        .mockResolvedValueOnce(smallBuffer);

      const result = await optimizeImageForProvider('/test/image.jpg', 'anthropic');

      expect(result).toBe('aggressive-base64-data');
      // Should have called sharp twice (initial + aggressive)
      expect(sharp).toHaveBeenCalledTimes(3);
    });

    it('should throw error when unable to compress below limit', async () => {
      // Mock both attempts returning large buffers
      const largeBuffer = Buffer.alloc(7 * 1024 * 1024); // 7MB
      mockSharpInstance.toBuffer.mockResolvedValue(largeBuffer);

      await expect(optimizeImageForProvider('/test/image.jpg', 'anthropic'))
        .rejects
        .toThrow('Unable to compress image below 5MB limit for anthropic');
    });

    it('should handle different providers correctly', async () => {
      const smallBuffer = Buffer.alloc(3 * 1024 * 1024);
      smallBuffer.toString = jest.fn().mockReturnValue('openai-base64-data');
      mockSharpInstance.toBuffer.mockResolvedValue(smallBuffer);

      const result = await optimizeImageForProvider('/test/image.jpg', 'openai');

      // For OpenAI, 2000x1500 is within 2048 limit, so no resize should happen
      expect(mockSharpInstance.resize).not.toHaveBeenCalled();
      expect(result).toBe('openai-base64-data');
    });

    it('should handle sharp errors gracefully', async () => {
      mockSharpInstance.metadata.mockRejectedValue(new Error('Invalid image format'));

      await expect(optimizeImageForProvider('/test/image.jpg', 'anthropic'))
        .rejects
        .toThrow('Image optimization failed: Invalid image format');
    });
  });
});
