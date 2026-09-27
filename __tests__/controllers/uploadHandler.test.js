const httpMocks = require('node-mocks-http');
const multer = require('multer');
const { handleFileUpload } = require('../../src/controllers/uploadHandler');
const { enqueueFiles } = require('../../src/utils/fileQueue');
const { getPrompt, promptManager } = require('../../src/utils/prompts/templates/providerTemplates');

// Mock dependencies
jest.mock('multer');
jest.mock('../../src/utils/fileQueue');
jest.mock('../../src/utils/prompts/templates/providerTemplates');
jest.mock('../../src/utils/pdfConverter');

describe('Upload Handler', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock request and response
    mockReq = httpMocks.createRequest({
      method: 'POST',
      url: '/upload'
    });
    mockRes = httpMocks.createResponse();

    // Mock multer middleware
    const mockMiddleware = (req, res, next) => {
      req.files = {
        file: [{
          originalname: 'test.jpg',
          path: '/uploads/test.jpg',
          mimetype: 'image/jpeg'
        }]
      };
      // Preserve the existing body and add defaults
      req.body = {
        ...req.body,
        aiProvider: req.body.aiProvider || 'openai',
        promptTemplate: req.body.promptTemplate || 'memorialOCR',
        promptVersion: req.body.promptVersion || 'latest',
        replaceExisting: req.body.replaceExisting || 'false'
      };
      next();
    };

    multer.mockReturnValue({
      fields: jest.fn().mockReturnValue(mockMiddleware)
    });

    // Mock getPrompt and promptManager
    const mockTemplate = {
      version: '1.0'
    };

    getPrompt.mockResolvedValue(mockTemplate);
    promptManager.validatePrompt = jest.fn().mockReturnValue({ isValid: true });
  });

  describe('Basic Upload Functionality', () => {
    test('handles file upload with prompt configuration', async () => {
      // Execute
      await handleFileUpload(mockReq, mockRes);

      // Assert
      expect(enqueueFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/uploads/test.jpg',
            provider: 'openai',
            // promptTemplate no longer passed - fileProcessing.js selects based on source_type
            promptVersion: 'latest',
            source_type: 'record_sheet'
          })
        ])
      );
      expect(mockRes._getStatusCode()).toBe(200);
    });

    test('uses default prompt settings when not specified', async () => {
      // Setup
      mockReq.body = {
        aiProvider: 'openai',
        replaceExisting: 'false'
      };

      // Execute
      await handleFileUpload(mockReq, mockRes);

      // Assert
      expect(enqueueFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            // promptTemplate no longer passed - fileProcessing.js selects based on source_type
            promptVersion: 'latest',
            source_type: 'record_sheet'
          })
        ])
      );
    });

    test('queues multiple files in a single batch', async () => {
      // Setup custom multer middleware to simulate two files
      const multiFileMiddleware = (req, res, next) => {
        req.files = {
          file: [
            {
              originalname: 'first.jpg',
              path: '/uploads/first.jpg',
              mimetype: 'image/jpeg'
            },
            {
              originalname: 'second.jpg',
              path: '/uploads/second.jpg',
              mimetype: 'image/jpeg'
            }
          ]
        };
        req.body = {
          ...req.body,
          aiProvider: req.body.aiProvider || 'openai',
          promptTemplate: req.body.promptTemplate || 'memorialOCR',
          promptVersion: req.body.promptVersion || 'latest',
          replaceExisting: req.body.replaceExisting || 'false'
        };
        next();
      };

      multer.mockReturnValue({
        fields: jest.fn().mockReturnValue(multiFileMiddleware)
      });

      // Execute
      await handleFileUpload(mockReq, mockRes);

      // Assert
      expect(enqueueFiles).toHaveBeenCalledTimes(1);
      expect(enqueueFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ path: '/uploads/first.jpg' }),
          expect.objectContaining({ path: '/uploads/second.jpg' })
        ])
      );
    });
  });

  describe('Source type handling', () => {
    test('queues monument photo uploads with correct metadata', async () => {
      mockReq.body = {
        aiProvider: 'anthropic',
        promptTemplate: 'monumentPhotoOCR',
        promptVersion: '2.0.0',
        source_type: 'monument_photo',
        replaceExisting: 'false'
      };

      await handleFileUpload(mockReq, mockRes);

      expect(getPrompt).toHaveBeenCalledWith('anthropic', 'monumentPhotoOCR', '2.0.0');
      expect(enqueueFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            provider: 'anthropic',
            promptVersion: '2.0.0',
            source_type: 'monument_photo',
            sourceType: 'monument_photo'
          })
        ])
      );

      const queuedFile = enqueueFiles.mock.calls[0][0][0];
      expect(queuedFile).not.toHaveProperty('volume_id');
      expect(queuedFile).not.toHaveProperty('volumeId');
      expect(mockRes._getStatusCode()).toBe(200);
    });

    test('queues burial register uploads with volume metadata and prompt selection', async () => {
      mockReq.body = {
        aiProvider: 'openai',
        promptVersion: '1.2.3',
        source_type: 'burial_register',
        volume_id: 'vol99',
        replaceExisting: 'false'
      };

      await handleFileUpload(mockReq, mockRes);

      expect(getPrompt).toHaveBeenCalledWith('openai', 'burialRegister', '1.2.3');
      expect(enqueueFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            provider: 'openai',
            promptVersion: '1.2.3',
            source_type: 'burial_register',
            sourceType: 'burial_register',
            volume_id: 'vol99',
            volumeId: 'vol99'
          })
        ])
      );
      expect(mockRes._getStatusCode()).toBe(200);
    });
  });

  describe('Prompt Validation', () => {
    test('validates prompt template selection', async () => {
      // Setup
      mockReq.body.promptTemplate = 'invalidTemplate';
      getPrompt.mockRejectedValue(new Error('Invalid template'));

      // Execute
      await handleFileUpload(mockReq, mockRes);

      // Assert
      expect(mockRes._getStatusCode()).toBe(400);
      expect(JSON.parse(mockRes._getData())).toEqual(
        expect.objectContaining({
          error: expect.stringContaining('Invalid template')
        })
      );
    });

    test('validates prompt version', async () => {
      // Setup
      mockReq.body.promptVersion = 'invalidVersion';
      getPrompt.mockRejectedValue(new Error('Invalid version'));

      // Execute
      await handleFileUpload(mockReq, mockRes);

      // Assert
      expect(mockRes._getStatusCode()).toBe(400);
      expect(JSON.parse(mockRes._getData())).toEqual(
        expect.objectContaining({
          error: expect.stringContaining('Invalid version')
        })
      );
    });

    test('validates prompt against provider', async () => {
      // Setup
      promptManager.validatePrompt.mockReturnValue({
        isValid: false,
        errors: ['Type not supported']
      });

      // Execute
      await handleFileUpload(mockReq, mockRes);

      // Assert
      expect(mockRes._getStatusCode()).toBe(400);
      expect(JSON.parse(mockRes._getData())).toEqual(
        expect.objectContaining({
          error: expect.stringContaining('Type not supported')
        })
      );
    });
  });

  describe('Error Handling', () => {
    test('handles multer errors', async () => {
      // Setup
      const multerError = new multer.MulterError('LIMIT_FILE_SIZE');
      multer.mockReturnValue({
        fields: jest.fn().mockImplementation(() => {
          throw multerError;
        })
      });

      // Execute
      await handleFileUpload(mockReq, mockRes);

      // Assert
      expect(mockRes._getStatusCode()).toBe(500);
      expect(mockRes._getData()).toContain('file upload');
    });

    test('handles missing files', async () => {
      // Setup
      multer.mockReturnValue({
        fields: jest.fn().mockReturnValue((req, res, next) => {
          req.files = {};
          next();
        })
      });

      // Execute
      await handleFileUpload(mockReq, mockRes);

      // Assert
      expect(mockRes._getStatusCode()).toBe(400);
      expect(mockRes._getData()).toContain('No files uploaded');
    });
  });

  describe('File Queue Integration', () => {
    test('passes prompt info to file queue', async () => {
      // Setup
      mockReq.body = {
        aiProvider: 'anthropic',
        promptTemplate: 'customTemplate',
        promptVersion: '2.0',
        replaceExisting: 'false'
      };

      const mockTemplate = {
        version: '2.0'
      };
      getPrompt.mockResolvedValue(mockTemplate);
      promptManager.validatePrompt.mockReturnValue({ isValid: true });

      // Execute
      await handleFileUpload(mockReq, mockRes);

      // Assert
      expect(enqueueFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            provider: 'anthropic',
            // promptTemplate no longer passed - fileProcessing.js selects based on source_type
            promptVersion: '2.0',
            source_type: 'record_sheet'
          })
        ])
      );
    });
  });

  describe('Multer Middleware Configuration', () => {
    test('handles file upload with fields configuration', async () => {
      // Setup
      const multerFieldsSpy = jest.fn().mockReturnValue((req, res, next) => {
        req.files = {
          file: [{
            originalname: 'test.jpg',
            path: '/uploads/test.jpg',
            mimetype: 'image/jpeg'
          }]
        };
        next();
      });

      multer.mockReturnValue({
        fields: multerFieldsSpy
      });

      // Execute
      await handleFileUpload(mockReq, mockRes);

      // Assert
      expect(mockRes._getStatusCode()).toBe(200);
      expect(enqueueFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/uploads/test.jpg'
          })
        ])
      );
    });
  });

  describe('Source Type Handling', () => {
    test('should handle source_type parameter when provided', async () => {
      // Setup
      mockReq.body = {
        aiProvider: 'openai',
        replaceExisting: 'false',
        source_type: 'monument_photo'
      };

      // Execute
      await handleFileUpload(mockReq, mockRes);

      // Assert
      expect(enqueueFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            source_type: 'monument_photo'
          })
        ])
      );
    });

    test('should default to record_sheet when source_type not provided', async () => {
      // Setup
      mockReq.body = {
        aiProvider: 'openai',
        replaceExisting: 'false'
      };

      // Execute
      await handleFileUpload(mockReq, mockRes);

      // Assert
      expect(enqueueFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            source_type: 'record_sheet'
          })
        ])
      );
    });

    test('should validate source_type and default invalid values to record_sheet', async () => {
      // Setup
      mockReq.body = {
        aiProvider: 'openai',
        replaceExisting: 'false',
        source_type: 'invalid_type'
      };

      // Execute
      await handleFileUpload(mockReq, mockRes);

      // Assert that invalid source_type is coerced to record_sheet
      expect(enqueueFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            source_type: 'record_sheet'
          })
        ])
      );
    });

    test('should accept valid monument_photo source_type', async () => {
      // Setup
      mockReq.body = {
        aiProvider: 'openai',
        replaceExisting: 'false',
        source_type: 'monument_photo'
      };

      // Execute
      await handleFileUpload(mockReq, mockRes);

      // Assert that valid monument_photo source_type is preserved
      expect(enqueueFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            source_type: 'monument_photo'
          })
        ])
      );
    });

    test('should accept valid grave_record_card source_type', async () => {
      // Setup
      mockReq.body = {
        aiProvider: 'openai',
        replaceExisting: 'false',
        source_type: 'grave_record_card'
      };

      // Execute
      await handleFileUpload(mockReq, mockRes);

      // Assert that valid grave_record_card source_type is preserved (not coerced to record_sheet)
      expect(enqueueFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            source_type: 'grave_record_card',
            sourceType: 'grave_record_card'
          })
        ])
      );
    });

    test('queues grave_record_card uploads with correct metadata', async () => {
      mockReq.body = {
        aiProvider: 'anthropic',
        promptVersion: '1.0.0',
        source_type: 'grave_record_card',
        replaceExisting: 'false'
      };

      await handleFileUpload(mockReq, mockRes);

      expect(enqueueFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            provider: 'anthropic',
            promptVersion: '1.0.0',
            source_type: 'grave_record_card',
            sourceType: 'grave_record_card'
          })
        ])
      );

      // Verify that grave cards do NOT have volume_id/volumeId (unlike burial registers)
      const queuedFile = enqueueFiles.mock.calls[0][0][0];
      expect(queuedFile).not.toHaveProperty('volume_id');
      expect(queuedFile).not.toHaveProperty('volumeId');
      expect(mockRes._getStatusCode()).toBe(200);
    });
  });

});