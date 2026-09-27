const ExportService = require('../../src/services/ExportService');
const fs = require('fs').promises;

// Mock dependencies
jest.mock('fs', () => {
  const mockStream = {
    on: jest.fn((event, handler) => {
      if (event === 'finish') {
        // Trigger finish async
        setTimeout(handler, 0);
      }
      return mockStream;
    }),
    write: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
    writableEnded: false,
    destroyed: false
  };

  return {
    promises: {
      writeFile: jest.fn(),
      access: jest.fn()
    },
    createWriteStream: jest.fn(() => mockStream),
    constants: {
      F_OK: 0
    }
  };
});

describe('ExportService', () => {
  let service;
  let mockConfig;
  let mockQueryService;

  beforeEach(() => {
    mockConfig = {
      dataDir: './data'
    };
    mockQueryService = {
      list: jest.fn()
    };
    service = new ExportService(mockConfig, mockQueryService);
    jest.clearAllMocks();
    // Default: Mock implementation to handle directory vs file checks
    fs.access.mockImplementation(async (path) => {
      if (path.toString().endsWith('.json') || path.toString().endsWith('.csv')) {
        // File check: default to not found (ENOENT)
        const err = new Error('File not found');
        err.code = 'ENOENT';
        throw err;
      }
      // Directory check: resolve (exists)
      return Promise.resolve();
    });
  });

  describe('export', () => {
    const mockRecords = [
      { memorial_number: '1', first_name: 'John', last_name: 'Doe', year_of_death: '1900' },
      { memorial_number: '2', first_name: 'Jane', last_name: 'Smith', year_of_death: '1901' }
    ];

    describe('Happy Path', () => {
      it('should export records to JSON file', async () => {
        mockQueryService.list.mockResolvedValue({ records: mockRecords });

        const result = await service.export({
          format: 'json',
          destination: './output.json'
        });

        expect(mockQueryService.list).toHaveBeenCalled();
        expect(mockQueryService.list).toHaveBeenCalled();
        // Check if stream write was called
        // We can't easily check content aggregation here without complex mock logic,
        // so we just check createWriteStream was called
        expect(require('fs').createWriteStream).toHaveBeenCalledWith(
          './output.json',
          { encoding: 'utf-8' }
        );
        expect(result.exported).toBe(2);
        expect(result.format).toBe('json');
        expect(result.exported).toBe(2);
        expect(result.format).toBe('json');
      });

      it('should export records to CSV file', async () => {
        mockQueryService.list.mockResolvedValue({ records: mockRecords });

        const result = await service.export({
          format: 'csv',
          destination: './output.csv'
        });

        expect(require('fs').createWriteStream).toHaveBeenCalledWith(
          './output.csv',
          { encoding: 'utf-8' }
        );
        expect(result.exported).toBe(2);
      });

      it('should return data for stdout when no destination provided', async () => {
        mockQueryService.list.mockResolvedValue({ records: mockRecords });

        const result = await service.export({
          format: 'json'
        });

        expect(fs.writeFile).not.toHaveBeenCalled();
        expect(result.data).toBeDefined();
        expect(result.exported).toBe(2);
      });

      it('should filter export by source type', async () => {
        mockQueryService.list.mockResolvedValue({ records: [] });

        await service.export({
          format: 'json',
          sourceType: 'memorial'
        });

        expect(mockQueryService.list).toHaveBeenCalledWith(expect.objectContaining({
          sourceType: 'memorial',
          limit: expect.any(Number) // Should fetch all/large batch
        }));
      });
    });

    describe('Unhappy Path', () => {
      it('should throw INVALID_FORMAT for unsupported format', async () => {
        await expect(service.export({ format: 'xml' }))
          .rejects.toThrow('Invalid format');
      });

      it('should throw FILE_EXISTS if destination exists without force', async () => {
        // Mock access to succeed (file exists)
        fs.access.mockResolvedValue(true);

        await expect(service.export({
          format: 'json',
          destination: './existing.json'
        })).rejects.toThrow('Destination file already exists');
      });

      it('should allow overwrite if force is true', async () => {
        fs.access.mockResolvedValue(true);
        mockQueryService.list.mockResolvedValue({ records: mockRecords });

        await service.export({
          format: 'json',
          destination: './existing.json',
          force: true
        });

        expect(require('fs').createWriteStream).toHaveBeenCalled();
      });

      it('should handle empty results gracefully', async () => {
        mockQueryService.list.mockResolvedValue({ records: [] });

        const result = await service.export({ format: 'json' });

        expect(result.exported).toBe(0);
        expect(fs.writeFile).not.toHaveBeenCalled();
      });

      it('should throw WRITE_ERROR if file operations fail', async () => {
        mockQueryService.list.mockResolvedValue({ records: mockRecords });

        // Simulate stream error
        const fs = require('fs');
        // We need to access the mock stream instance to emit error
        // The mock factory returns a FRESH object each time? No, it returns `mockStream` variable.
        // But `mockStream` is defined inside factory scope.
        // We need to customize the mock behavior for THIS test.

        fs.createWriteStream.mockImplementationOnce(() => {
          const stream = {
            on: jest.fn(),
            write: jest.fn(),
            end: jest.fn(),
            destroy: jest.fn()
          };
          // Emit error on next tick
          setTimeout(() => {
            const handler = stream.on.mock.calls.find(call => call[0] === 'error')?.[1];
            if (handler) handler(new Error('Permission denied'));
          }, 0);
          return stream;
        });

        await expect(service.export({
          format: 'json',
          destination: '/root/out.json'
        })).rejects.toThrow('Failed to write export file');
      });
    });
  });
});
