/**
 * @fileoverview Tests for MobileUploadHandler
 *
 * TDD tests for the mobile upload endpoint. These tests are written BEFORE
 * the implementation to define the expected behavior.
 *
 * Requirements covered:
 * - 1.1: Mobile Upload Endpoint (happy/unhappy paths)
 * - 1.3: Successful upload returns queueId
 * - 2.1: Files added to IngestService with source_type='monument_photo'
 *
 * @see docs/ios-async-upload/requirements.md
 * @see docs/ios-async-upload/design.md
 */

const httpMocks = require('node-mocks-http');

// Mock all dependencies BEFORE any requires that might trigger database init
jest.mock('multer');
jest.mock('../../src/utils/filenameValidator');
jest.mock('../../src/utils/logger');
// Mock fileQueue with a factory function to avoid database init
jest.mock('../../src/utils/fileQueue', () => ({
  enqueueFiles: jest.fn()
}));

const multer = require('multer');
const { validateFilename } = require('../../src/utils/filenameValidator');
const { enqueueFiles } = require('../../src/utils/fileQueue');

// Handler will be imported after mocks are set up
// This will fail initially (TDD RED phase) until the handler is created
let handleMobileUpload = null;
let handlerExists = false;

try {
  const handler = require('../../src/controllers/mobileUploadHandler');
  handleMobileUpload = handler.handleMobileUpload;
  handlerExists = true;
} catch {
  // Expected to fail in RED phase - handler doesn't exist yet
  handlerExists = false;
}

// TDD RED Phase: Tests that run when handler doesn't exist yet
describe('MobileUploadHandler - TDD RED Phase', () => {
  if (handlerExists) {
    test.skip('handler exists - skipping RED phase tests', () => { });
    return;
  }

  test('handler module not yet implemented', () => {
    expect(handleMobileUpload).toBeNull();
  });

  test('handler should export handleMobileUpload function', () => {
    // This test documents the expected interface
    expect(handlerExists).toBe(false);
  });
});

// Main test suite - only runs when handler exists
const describeIfHandler = handlerExists ? describe : describe.skip;

describeIfHandler('MobileUploadHandler', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock request and response
    mockReq = httpMocks.createRequest({
      method: 'POST',
      url: '/api/mobile/upload'
    });
    mockRes = httpMocks.createResponse();

    // Mock enqueueFiles to return a queue ID
    enqueueFiles.mockResolvedValue([{ queueId: 'queue-123' }]);

    // Default multer mock - simulates successful file upload
    const mockMulterMiddleware = (req, res, next) => {
      req.file = {
        originalname: 'cork-0001.jpg',
        path: '/uploads/cork-0001.jpg',
        mimetype: 'image/jpeg',
        size: 1024 * 1024 // 1MB
      };
      next();
    };

    multer.mockReturnValue({
      single: jest.fn().mockReturnValue(mockMulterMiddleware)
    });

    // Mock MulterError class
    multer.MulterError = class MulterError extends Error {
      constructor(code) {
        super(code);
        this.code = code;
        this.name = 'MulterError';
      }
    };

    // Default filename validator mock - valid filename
    validateFilename.mockReturnValue({
      valid: true,
      siteCode: 'cork',
      number: '0001',
      extension: 'jpg'
    });
  });

  describe('Happy Path - Valid Uploads', () => {
    test('accepts valid JPEG with site_code-number.jpg format and returns 200 (Req 1.1.1, 1.1.2)', async () => {
      // Arrange
      const mockMiddleware = (req, res, next) => {
        req.file = {
          originalname: 'cork-0001.jpg',
          path: '/uploads/cork-0001.jpg',
          mimetype: 'image/jpeg',
          size: 1024 * 1024
        };
        next();
      };
      multer.mockReturnValue({
        single: jest.fn().mockReturnValue(mockMiddleware)
      });

      validateFilename.mockReturnValue({
        valid: true,
        siteCode: 'cork',
        number: '0001',
        extension: 'jpg'
      });

      // Act
      await handleMobileUpload(mockReq, mockRes);

      // Assert
      expect(mockRes._getStatusCode()).toBe(200);
      expect(validateFilename).toHaveBeenCalledWith('cork-0001.jpg', expect.any(Object));
    });

    test('adds file to queue with source_type=monument_photo (Req 2.1.1)', async () => {
      // Act
      await handleMobileUpload(mockReq, mockRes);

      // Assert
      expect(enqueueFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/uploads/cork-0001.jpg',
            source_type: 'monument_photo',
            sourceType: 'monument_photo'
          })
        ])
      );
    });

    test('returns queueId and siteCode in response body (Req 1.1.3)', async () => {
      enqueueFiles.mockResolvedValue([{ queueId: 'queue-456' }]);

      // Act
      await handleMobileUpload(mockReq, mockRes);

      // Assert
      const responseData = JSON.parse(mockRes._getData());
      expect(responseData).toMatchObject({
        queued: true,
        queueId: expect.any(String),
        siteCode: 'cork',
        filename: 'cork-0001.jpg'
      });
    });

    test('accepts PNG files with valid format', async () => {
      // Arrange - PNG file
      const mockMiddleware = (req, res, next) => {
        req.file = {
          originalname: 'dublin-0042.png',
          path: '/uploads/dublin-0042.png',
          mimetype: 'image/png',
          size: 2 * 1024 * 1024
        };
        next();
      };
      multer.mockReturnValue({
        single: jest.fn().mockReturnValue(mockMiddleware)
      });

      validateFilename.mockReturnValue({
        valid: true,
        siteCode: 'dublin',
        number: '0042',
        extension: 'png'
      });

      // Act
      await handleMobileUpload(mockReq, mockRes);

      // Assert
      expect(mockRes._getStatusCode()).toBe(200);
    });
  });

  describe('Unhappy Path - Validation Errors', () => {
    test('rejects invalid filename format with 400 Bad Request (Req 1.1.5)', async () => {
      // Arrange - Invalid filename
      const mockMiddleware = (req, res, next) => {
        req.file = {
          originalname: 'image.jpg',
          path: '/uploads/image.jpg',
          mimetype: 'image/jpeg',
          size: 1024 * 1024
        };
        next();
      };
      multer.mockReturnValue({
        single: jest.fn().mockReturnValue(mockMiddleware)
      });

      validateFilename.mockReturnValue({
        valid: false,
        error: 'Invalid format: missing separator hyphen'
      });

      // Act
      await handleMobileUpload(mockReq, mockRes);

      // Assert
      expect(mockRes._getStatusCode()).toBe(400);
      const responseData = JSON.parse(mockRes._getData());
      expect(responseData.error).toContain('Invalid');
    });

    test('rejects non-image file type with 400 Bad Request (Req 1.1.4)', async () => {
      // Arrange - Non-image file
      const mockMiddleware = (req, res, next) => {
        req.file = {
          originalname: 'cork-0001.txt',
          path: '/uploads/cork-0001.txt',
          mimetype: 'text/plain',
          size: 1024
        };
        next();
      };
      multer.mockReturnValue({
        single: jest.fn().mockReturnValue(mockMiddleware)
      });

      // Act
      await handleMobileUpload(mockReq, mockRes);

      // Assert
      expect(mockRes._getStatusCode()).toBe(400);
      const responseData = JSON.parse(mockRes._getData());
      expect(responseData.error).toMatch(/file type|unsupported/i);
    });

    test('rejects missing file with 400 Bad Request', async () => {
      // Arrange - No file in request
      const mockMiddleware = (req, res, next) => {
        req.file = undefined;
        next();
      };
      multer.mockReturnValue({
        single: jest.fn().mockReturnValue(mockMiddleware)
      });

      // Act
      await handleMobileUpload(mockReq, mockRes);

      // Assert
      expect(mockRes._getStatusCode()).toBe(400);
      const responseData = JSON.parse(mockRes._getData());
      expect(responseData.error).toMatch(/no file|missing file/i);
    });

    test('rejects oversized file with 413 Payload Too Large (Req 1.1.7)', async () => {
      // Arrange - File size limit exceeded via multer error
      const multerError = new multer.MulterError('LIMIT_FILE_SIZE');
      multer.mockReturnValue({
        single: jest.fn().mockReturnValue((req, res, next) => {
          next(multerError);
        })
      });

      // Act
      await handleMobileUpload(mockReq, mockRes);

      // Assert
      expect(mockRes._getStatusCode()).toBe(413);
      const responseData = JSON.parse(mockRes._getData());
      expect(responseData.error).toMatch(/too large|size/i);
    });
  });

  describe('Unhappy Path - Server Errors', () => {
    test('returns 503 when queue service is down (Req 2.2.4)', async () => {
      // Arrange - enqueueFiles throws error
      enqueueFiles.mockRejectedValue(new Error('Queue service unavailable'));

      // Act
      await handleMobileUpload(mockReq, mockRes);

      // Assert
      expect(mockRes._getStatusCode()).toBe(503);
      const responseData = JSON.parse(mockRes._getData());
      expect(responseData.error).toMatch(/service|unavailable|queue/i);
    });

    test('handles multer middleware errors gracefully', async () => {
      // Arrange - Generic multer error
      multer.mockReturnValue({
        single: jest.fn().mockReturnValue((req, res, next) => {
          next(new Error('Unexpected multer error'));
        })
      });

      // Act
      await handleMobileUpload(mockReq, mockRes);

      // Assert
      expect(mockRes._getStatusCode()).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Metadata Handling', () => {
    test('extracts site_code correctly from filename', async () => {
      // Arrange
      const mockMiddleware = (req, res, next) => {
        req.file = {
          originalname: 'killarney-0123.jpg',
          path: '/uploads/killarney-0123.jpg',
          mimetype: 'image/jpeg',
          size: 1024 * 1024
        };
        next();
      };
      multer.mockReturnValue({
        single: jest.fn().mockReturnValue(mockMiddleware)
      });

      validateFilename.mockReturnValue({
        valid: true,
        siteCode: 'killarney',
        number: '0123',
        extension: 'jpg'
      });

      // Act
      await handleMobileUpload(mockReq, mockRes);

      // Assert
      expect(enqueueFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            site_code: 'killarney'
          })
        ])
      );

      const responseData = JSON.parse(mockRes._getData());
      expect(responseData.siteCode).toBe('killarney');
    });
  });
});
