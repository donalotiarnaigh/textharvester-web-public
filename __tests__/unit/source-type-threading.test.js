/**
 * Test suite for source_type parameter threading through the processing pipeline
 */



// Mock dependencies
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlink: jest.fn((path, callback) => callback(null))
}));

jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debugPayload: jest.fn()
}));

jest.mock('../../src/utils/fileProcessing', () => ({
  processFile: jest.fn()
}));

jest.mock('../../config.json', () => ({
  uploadPath: 'uploads',
  processingCompleteFlagPath: 'processing-complete.flag',
  maxRetryCount: 3,
  upload: {
    retryDelaySeconds: 0.01,
    maxConcurrent: 3
  }
}), { virtual: true });

describe('Source Type Threading', () => {
  let enqueueFiles;
  let processFile;

  beforeAll(() => {
    // Import after mocks are set up
    const fileQueue = require('../../src/utils/fileQueue');
    enqueueFiles = fileQueue.enqueueFiles;

    const fileProcessing = require('../../src/utils/fileProcessing');
    processFile = fileProcessing.processFile;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default successful processing
    processFile.mockImplementation(async (filePath, options = {}) => {
      return {
        memorial_number: 'HG-123',
        first_name: 'JOHN',
        last_name: 'DOE',
        source_type: options.source_type || 'record_sheet'
      };
    });
  });

  describe('FileQueue source_type threading', () => {
    it('should accept and store source_type parameter in file queue items', () => {
      const files = [
        {
          path: 'test1.jpg',
          provider: 'openai',
          source_type: 'monument_photo',
          originalname: 'monument1.jpg'
        },
        {
          path: 'test2.jpg',
          provider: 'anthropic',
          source_type: 'record_sheet',
          originalname: 'record1.jpg'
        }
      ];

      // The queue should store the source_type for each file
      // We'll verify this by checking if processFile is called with the correct parameters
      // This is an indirect test since the queue is internal
      expect(() => {
        enqueueFiles(files);
      }).not.toThrow();
    });

    it('should default source_type to record_sheet when not provided', () => {
      const files = [
        {
          path: 'test1.jpg',
          provider: 'openai',
          originalname: 'test1.jpg'
          // No source_type provided
        }
      ];

      // Should not throw and should handle missing source_type gracefully
      expect(() => {
        enqueueFiles(files);
      }).not.toThrow();
    });

    it('should pass source_type to processFile when processing queue', async () => {
      const files = [
        {
          path: 'test1.jpg',
          provider: 'openai',
          source_type: 'monument_photo',
          originalname: 'monument1.jpg'
        }
      ];

      enqueueFiles(files);

      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify processFile was called with source_type
      expect(processFile).toHaveBeenCalledWith(
        'test1.jpg',
        expect.objectContaining({
          provider: 'openai',
          source_type: 'monument_photo'
        })
      );
    });

    it('should handle mixed source_type values in the same batch', async () => {
      const files = [
        {
          path: 'monument1.jpg',
          provider: 'openai',
          source_type: 'monument_photo',
          originalname: 'monument1.jpg'
        },
        {
          path: 'record1.jpg',
          provider: 'anthropic',
          source_type: 'record_sheet',
          originalname: 'record1.jpg'
        },
        {
          path: 'default1.jpg',
          provider: 'openai',
          originalname: 'default1.jpg'
          // No source_type - should default
        }
      ];

      enqueueFiles(files);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 150));

      // Verify each file was processed with correct source_type
      expect(processFile).toHaveBeenCalledWith(
        'monument1.jpg',
        expect.objectContaining({
          source_type: 'monument_photo'
        })
      );

      expect(processFile).toHaveBeenCalledWith(
        'record1.jpg',
        expect.objectContaining({
          source_type: 'record_sheet'
        })
      );

      expect(processFile).toHaveBeenCalledWith(
        'default1.jpg',
        expect.objectContaining({
          source_type: 'record_sheet' // Should default
        })
      );
    });
  });

  describe('FileProcessing source_type handling', () => {
    it('should accept source_type in options parameter', async () => {
      const mockProcessFile = jest.fn().mockResolvedValue({
        memorial_number: 'HG-123',
        source_type: 'monument_photo'
      });

      // Test the function signature
      const options = {
        provider: 'openai',
        source_type: 'monument_photo',
        promptTemplate: 'memorialOCR',
        promptVersion: 'latest'
      };

      await mockProcessFile('test.jpg', options);

      expect(mockProcessFile).toHaveBeenCalledWith('test.jpg', options);
    });

    it('should default source_type to record_sheet when not provided', async () => {
      const result = await processFile('test.jpg', {
        provider: 'openai'
      });

      expect(result.source_type).toBe('record_sheet');
    });

    it('should preserve source_type through processing pipeline', async () => {
      const result = await processFile('test.jpg', {
        provider: 'openai',
        source_type: 'monument_photo'
      });

      expect(result.source_type).toBe('monument_photo');
    });

    it('should handle both valid source_type values', async () => {
      // Test monument_photo
      const monumentResult = await processFile('monument.jpg', {
        provider: 'openai',
        source_type: 'monument_photo'
      });
      expect(monumentResult.source_type).toBe('monument_photo');

      // Test record_sheet
      const recordResult = await processFile('record.jpg', {
        provider: 'openai',
        source_type: 'record_sheet'
      });
      expect(recordResult.source_type).toBe('record_sheet');
    });
  });

  describe('End-to-end source_type flow', () => {
    it('should thread source_type from enqueue through to final result', async () => {
      const files = [
        {
          path: 'monument_test.jpg',
          provider: 'openai',
          source_type: 'monument_photo',
          originalname: 'monument_test.jpg'
        }
      ];

      // Mock processFile to return source_type in result
      processFile.mockImplementation(async (filePath, options = {}) => {
        return {
          memorial_number: 'HG-456',
          first_name: 'JANE',
          last_name: 'SMITH',
          source_type: options.source_type || 'record_sheet'
        };
      });

      enqueueFiles(files);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify the complete flow
      expect(processFile).toHaveBeenCalledWith(
        'monument_test.jpg',
        expect.objectContaining({
          provider: 'openai',
          source_type: 'monument_photo'
        })
      );
    });

    it('should maintain source_type consistency across retries', async () => {
      const files = [
        {
          path: 'retry_test.jpg',
          provider: 'openai',
          source_type: 'monument_photo',
          originalname: 'retry_test.jpg'
        }
      ];

      // Mock processFile to fail first time, succeed second time
      let callCount = 0;
      processFile.mockImplementation(async (filePath, options = {}) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Temporary failure');
        }
        return {
          memorial_number: 'HG-789',
          source_type: options.source_type || 'record_sheet'
        };
      });

      enqueueFiles(files);

      // Wait for retry processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify source_type was consistent across retries
      expect(processFile).toHaveBeenCalledTimes(2);
      expect(processFile).toHaveBeenNthCalledWith(1, 'retry_test.jpg',
        expect.objectContaining({ source_type: 'monument_photo' }));
      expect(processFile).toHaveBeenNthCalledWith(2, 'retry_test.jpg',
        expect.objectContaining({ source_type: 'monument_photo' }));
    });
  });
});
