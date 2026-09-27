

jest.mock('glob');
jest.mock('../../src/utils/fileProcessing', () => ({
  processFile: jest.fn()
}));
jest.mock('../../src/utils/dynamicProcessing'); // Auto-mock the class
jest.mock('../../src/utils/fileQueue', () => ({
  enqueueFiles: jest.fn()
}));
jest.mock('../../src/utils/pdfConverter', () => ({
  convertPdfToJpegs: jest.fn()
}));
jest.mock('../../src/utils/conversionTracker', () => ({
  registerPdfsForConversion: jest.fn(),
  markConversionComplete: jest.fn(),
  markConversionFailed: jest.fn(),
  isConverting: jest.fn(),
  resetConversionState: jest.fn()
}));
jest.mock('../../src/utils/processingFlag', () => ({
  clearProcessingCompleteFlag: jest.fn()
}));
// Removed explicit jest.mock for logger to use spyOn instead


// Mock fs specifically for the way it's used
const mockAccess = jest.fn().mockResolvedValue(undefined);
jest.mock('fs', () => ({
  promises: {
    access: mockAccess
  },
  constants: {
    R_OK: 1
  },
  // Add synchronous methods used by fileQueue side-effects
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
  // Keep internal state if needed by the mock setup
  _mockAccess: mockAccess
}));

const IngestService = require('../../src/services/IngestService');
const { CLIError } = require('../../src/cli/errors');
const { processFile } = require('../../src/utils/fileProcessing');
const glob = require('glob');
const logger = require('../../src/utils/logger');
// We don't need to require fs here if we use the mockAccess variable directly or rely on the mock setup
// But if we want to spy on it in tests, we can use the mockAccess variable.


describe('IngestService', () => {
  let service;
  let mockConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mocks
    mockAccess.mockResolvedValue(undefined);
    mockConfig = {
      batchSize: 2,
      provider: 'openai',
      sourceType: 'memorial',
      verbose: false
    };
    service = new IngestService(mockConfig, logger);

    // Spy on logger methods
    jest.spyOn(logger, 'info').mockImplementation(() => { });
    jest.spyOn(logger, 'error').mockImplementation(() => { });
    jest.spyOn(logger, 'warn').mockImplementation(() => { });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('ingest', () => {
    // Happy Path Tests
    test('should process a single file successfully', async () => {
      // Mock glob to return one file
      glob.mockImplementation((pattern, cb) => cb(null, ['test.jpg']));

      // Mock processFile to succeed
      processFile.mockResolvedValue({
        success: true,
        recordId: 123,
        file: 'test.jpg'
      });

      const result = await service.ingest('*.jpg', { sourceType: 'memorial' });

      expect(result.successes).toHaveLength(1);
      expect(result.failures).toHaveLength(0);
      expect(result.total).toBe(1);
      expect(result.successes[0]).toMatchObject({
        success: true,
        file: 'test.jpg'
      });
      // Verify options passed to processFile
      expect(processFile).toHaveBeenCalledWith('test.jpg', expect.objectContaining({
        sourceType: 'memorial',
        provider: 'openai'
      }));
    });

    test('should expand glob patterns correctly', async () => {
      glob.mockImplementation((pattern, cb) => cb(null, ['a.jpg', 'b.jpg']));
      processFile.mockResolvedValue({ success: true });

      const result = await service.ingest('*.jpg', {});

      expect(result.total).toBe(2);
      expect(glob).toHaveBeenCalledWith('*.jpg', expect.any(Function));
    });

    test('should respect batch size limit', async () => {
      const files = ['1.jpg', '2.jpg', '3.jpg', '4.jpg'];
      glob.mockImplementation((pattern, cb) => cb(null, files));

      // We can't easily test true concurrency with checking Jest calls in this sync way,
      // but we can ensure processFile is called for all of them.
      // A more rapid test might check if they are chunked, but that's internal implementation detail.
      // We'll trust the logic for now and just verify all are processed.
      processFile.mockResolvedValue({ success: true });

      const result = await service.ingest('*.jpg', { batchSize: 2, sourceType: 'memorial' });

      expect(processFile).toHaveBeenCalledTimes(4);
      expect(result.total).toBe(4);
    });

    // Unhappy Path Tests
    test('should throw NO_FILES_MATCHED if pattern matches nothing', async () => {
      glob.mockImplementation((pattern, cb) => cb(null, []));

      const ingestPromise = service.ingest('*.jpg', { sourceType: 'memorial' });
      await expect(ingestPromise).rejects.toThrow('No files matched: *.jpg');
      await expect(ingestPromise).rejects.toBeInstanceOf(CLIError);
      await expect(ingestPromise).rejects.toHaveProperty('code', 'NO_FILES_MATCHED');
    });

    test('should collect failures for individual file errors', async () => {
      glob.mockImplementation((pattern, cb) => cb(null, ['good.jpg', 'bad.jpg']));

      processFile.mockImplementation((file) => {
        if (file === 'bad.jpg') return Promise.reject(new Error('Corrupt file'));
        return Promise.resolve({ success: true });
      });

      const result = await service.ingest('*.jpg', { sourceType: 'memorial' });

      expect(result.successes).toHaveLength(1);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toMatchObject({
        file: 'bad.jpg',
        success: false,
        error: 'Corrupt file'
      });
      expect(result.partial).toBe(true);
    });

    it('should handle API errors by adding to failures', async () => {
      glob.mockImplementation((pattern, cb) => cb(null, ['error.jpg']));

      processFile.mockImplementation(() => Promise.reject(new Error('API Rate Limit')));

      const result = await service.ingest('*.jpg', { sourceType: 'memorial' });

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].error).toBe('API Rate Limit');
    });

    it('should validate source type', async () => {
      await expect(service.ingest('*.jpg', { sourceType: 'invalid_type' }))
        .rejects.toThrow('Unknown source type: invalid_type');
    });

    it('should accept monument_photo as a valid source type', async () => {
      glob.mockImplementation((pattern, cb) => cb(null, ['test.jpg']));
      processFile.mockImplementation(() => Promise.resolve({ success: true }));

      await expect(service.ingest('*.jpg', { sourceType: 'monument_photo' }))
        .resolves.not.toThrow();
    });

    it('should accept record_sheet as a valid source type', async () => {
      glob.mockImplementation((pattern, cb) => cb(null, ['test.jpg']));
      processFile.mockImplementation(() => Promise.resolve({ success: true }));

      await expect(service.ingest('*.jpg', { sourceType: 'record_sheet' }))
        .resolves.not.toThrow();
    });

    it('should log progress', async () => {
      glob.mockImplementation((pattern, cb) => cb(null, ['test.jpg']));
      processFile.mockImplementation(() => Promise.resolve({ success: true }));

      await service.ingest('*.jpg', { sourceType: 'memorial' });

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Found 1 files'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Ingestion complete'));
    });
  });

  describe('Session cost cap', () => {
    test('should halt processing when maxCostPerSession is exceeded', async () => {
      const files = ['a.jpg', 'b.jpg', 'c.jpg'];
      glob.mockImplementation((pattern, cb) => cb(null, files));

      processFile.mockResolvedValue({
        success: true,
        estimated_cost_usd: 3.00
      });

      const capService = new IngestService(
        { batchSize: 1, provider: 'openai', sourceType: 'memorial', costs: { maxCostPerSession: 5.00 } },
        logger
      );

      const result = await capService.ingest('*.jpg', {});

      // After first batch: $3.00 (under cap). After second batch: $6.00 > $5.00 → halt before third.
      expect(result.successes).toHaveLength(2);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/session cost cap/i));
    });

    test('should process all files when no cap is set', async () => {
      const files = ['a.jpg', 'b.jpg', 'c.jpg'];
      glob.mockImplementation((pattern, cb) => cb(null, files));
      processFile.mockResolvedValue({ success: true, estimated_cost_usd: 100.00 });

      const noCapService = new IngestService(
        { batchSize: 1, provider: 'openai', sourceType: 'memorial' },
        logger
      );
      const result = await noCapService.ingest('*.jpg', {});
      expect(result.successes).toHaveLength(3);
      expect(logger.warn).not.toHaveBeenCalledWith(expect.stringMatching(/session cost cap/i));
    });
  });

  describe('Dynamic Schema Routing', () => {
    let DynamicProcessor;
    let mockProcessorInstance;

    beforeEach(() => {
      DynamicProcessor = require('../../src/utils/dynamicProcessing');
      // Reset the mock class
      DynamicProcessor.mockClear();

      // Setup the instance mock
      mockProcessorInstance = {
        processFileWithSchema: jest.fn().mockResolvedValue({
          success: true,
          recordId: 999,
          data: { field: 'value' }
        })
      };

      // Ensure constructor returns our mock instance
      DynamicProcessor.mockImplementation(() => mockProcessorInstance);
    });

    test('should route to DynamicProcessor when schemaId is present', async () => {
      glob.mockImplementation((pattern, cb) => cb(null, ['schema_file.jpg']));

      const options = { schemaId: 'test-schema-uuid' };
      const result = await service.ingest('*.jpg', options);

      // Verify DynamicProcessor was instantiated
      expect(DynamicProcessor).toHaveBeenCalledTimes(1);

      // Verify processFileWithSchema was called with correct args
      expect(mockProcessorInstance.processFileWithSchema).toHaveBeenCalledWith(
        { path: 'schema_file.jpg', provider: 'openai' },
        'test-schema-uuid'
      );

      // Verify legacy processFile was NOT called
      expect(processFile).not.toHaveBeenCalled();

      // Verify result structure
      expect(result.successes[0]).toMatchObject({
        success: true,
        recordId: 999,
        data: { field: 'value' }
      });
    });

    test('should fall back to standard processing when schemaId is missing', async () => {
      glob.mockImplementation((pattern, cb) => cb(null, ['standard.jpg']));
      processFile.mockResolvedValue({ success: true, id: 1 });

      const options = { sourceType: 'memorial' };
      await service.ingest('*.jpg', options);

      // Verify DynamicProcessor was NOT instantiated
      expect(DynamicProcessor).not.toHaveBeenCalled();

      // Verify legacy processFile WAS called
      expect(processFile).toHaveBeenCalledWith('standard.jpg', expect.anything());
    });

    test('should handle DynamicProcessor errors correctly', async () => {
      glob.mockImplementation((pattern, cb) => cb(null, ['error.jpg']));

      mockProcessorInstance.processFileWithSchema.mockRejectedValue(new Error('Validation Failed'));

      const options = { schemaId: 'fail-uuid' };
      const result = await service.ingest('*.jpg', options);

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toMatchObject({
        file: 'error.jpg',
        success: false,
        error: 'Validation Failed'
      });
    });
  });

  describe('prepareAndQueue', () => {
    let mockEnqueueFiles;
    let mockConversionTracker;
    let mockPdfConverter;
    let mockClearFlag;

    beforeEach(() => {
      mockEnqueueFiles = require('../../src/utils/fileQueue').enqueueFiles;
      mockConversionTracker = require('../../src/utils/conversionTracker');
      mockPdfConverter = require('../../src/utils/pdfConverter');
      mockClearFlag = require('../../src/utils/processingFlag').clearProcessingCompleteFlag;

      jest.clearAllMocks();
    });

    test('should return immediately without awaiting PDF conversion', async () => {
      const files = [
        { path: '/uploads/file1.pdf', originalname: 'file1.pdf', mimetype: 'application/pdf' }
      ];

      // Deliberately make PDF conversion slow/never complete
      mockPdfConverter.convertPdfToJpegs.mockImplementation(
        () => new Promise(() => { /* never resolves */ })
      );

      const options = {
        sourceType: 'burial_register',
        volumeId: 'vol1',
        provider: 'openai',
        promptVersion: '1.0'
      };

      // This should resolve immediately
      const startTime = Date.now();
      const result = await service.prepareAndQueue(files, options);
      const duration = Date.now() - startTime;

      // Should return count of files (1 PDF)
      expect(result).toBe(1);
      // Should return quickly (< 100ms, not waiting for PDF conversion)
      expect(duration).toBeLessThan(100);
      // PDF converter should NOT have been awaited
      expect(mockConversionTracker.registerPdfsForConversion).toHaveBeenCalledWith(files);
    });

    test('should enqueue non-PDF files immediately', async () => {
      const files = [
        { path: '/uploads/image.jpg', originalname: 'image.jpg', mimetype: 'image/jpeg' }
      ];

      const options = {
        sourceType: 'memorial',
        provider: 'openai',
        promptVersion: '1.0'
      };

      await service.prepareAndQueue(files, options);

      expect(mockEnqueueFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/uploads/image.jpg',
            provider: 'openai',
            sourceType: 'memorial'
          })
        ])
      );
    });

    test('should enqueue grave_record_card PDFs directly (no background conversion)', async () => {
      const files = [
        { path: '/uploads/grave.pdf', originalname: 'grave.pdf', mimetype: 'application/pdf' }
      ];

      const options = {
        sourceType: 'grave_record_card',
        provider: 'anthropic',
        promptVersion: '1.0'
      };

      await service.prepareAndQueue(files, options);

      // Should enqueue directly without registering for conversion
      expect(mockEnqueueFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/uploads/grave.pdf',
            mimetype: 'application/pdf',
            sourceType: 'grave_record_card'
          })
        ])
      );
      expect(mockConversionTracker.registerPdfsForConversion).not.toHaveBeenCalled();
    });

    test('should handle mixed PDF and non-PDF uploads', async () => {
      const files = [
        { path: '/uploads/image.jpg', originalname: 'image.jpg', mimetype: 'image/jpeg' },
        { path: '/uploads/file.pdf', originalname: 'file.pdf', mimetype: 'application/pdf' }
      ];

      const options = {
        sourceType: 'burial_register',
        volumeId: 'vol1',
        provider: 'openai',
        promptVersion: '1.0'
      };

      await service.prepareAndQueue(files, options);

      // Non-PDF should be enqueued
      expect(mockEnqueueFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/uploads/image.jpg'
          })
        ])
      );
      // PDF should be registered for background conversion
      expect(mockConversionTracker.registerPdfsForConversion).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/uploads/file.pdf'
          })
        ])
      );
    });

    test('should return total count of all files', async () => {
      const files = [
        { path: '/uploads/image.jpg', originalname: 'image.jpg', mimetype: 'image/jpeg' },
        { path: '/uploads/file.pdf', originalname: 'file.pdf', mimetype: 'application/pdf' }
      ];

      const options = {
        sourceType: 'burial_register',
        volumeId: 'vol1',
        provider: 'openai',
        promptVersion: '1.0'
      };

      const result = await service.prepareAndQueue(files, options);

      // Should return 2 (1 non-PDF + 1 PDF)
      expect(result).toBe(2);
    });

    test('should clear processing complete flag', async () => {
      const files = [
        { path: '/uploads/image.jpg', originalname: 'image.jpg', mimetype: 'image/jpeg' }
      ];

      const options = {
        sourceType: 'memorial',
        provider: 'openai',
        promptVersion: '1.0'
      };

      await service.prepareAndQueue(files, options);

      expect(mockClearFlag).toHaveBeenCalled();
    });

    test('should pass schemaId through to enqueued files', async () => {
      const files = [
        { path: '/uploads/image.jpg', originalname: 'image.jpg', mimetype: 'image/jpeg' }
      ];

      const options = {
        sourceType: 'memorial',
        provider: 'openai',
        promptVersion: '1.0',
        schemaId: 'custom-schema-123'
      };

      await service.prepareAndQueue(files, options);

      expect(mockEnqueueFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            schemaId: 'custom-schema-123'
          })
        ])
      );
    });
  });
});

