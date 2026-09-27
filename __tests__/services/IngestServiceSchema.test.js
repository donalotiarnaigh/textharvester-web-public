const IngestService = require('../../src/services/IngestService');
const { enqueueFiles } = require('../../src/utils/fileQueue');

// Mock dependencies
jest.mock('../../src/utils/fileQueue');
jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/database');
jest.mock('../../src/utils/prompts/templates/providerTemplates', () => ({
  getPrompt: jest.fn().mockResolvedValue('mock-template'),
  promptManager: {
    validatePrompt: jest.fn().mockReturnValue({ isValid: true })
  }
}));

describe('IngestService - Schema Propagation', () => {
  let ingestService;

  beforeEach(() => {
    jest.clearAllMocks();
    ingestService = new IngestService({});
  });

  test('prepareAndQueue propagates schemaId to fileQueue', async () => {
    const mockFiles = [{
      path: '/tmp/test.jpg',
      mimetype: 'image/jpeg',
      originalname: 'test.jpg'
    }];

    const options = {
      sourceType: 'record_sheet',
      schemaId: 'acc00000-0000-0000-0000-000000000001', // Custom schema UUID
      provider: 'openai',
      promptVersion: 'latest'
    };

    await ingestService.prepareAndQueue(mockFiles, options);

    // Verify enqueueFiles was called
    expect(enqueueFiles).toHaveBeenCalledTimes(1);

    // Verify the arguments passed to enqueueFiles
    const queuedFiles = enqueueFiles.mock.calls[0][0];
    expect(queuedFiles).toHaveLength(1);
    expect(queuedFiles[0]).toEqual(expect.objectContaining({
      path: '/tmp/test.jpg',
      schemaId: 'acc00000-0000-0000-0000-000000000001' // Check if schemaId is present - currently fails
    }));
  });
});
