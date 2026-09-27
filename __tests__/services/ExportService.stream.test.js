/**
 * @jest-environment node
 */
jest.unmock('fs');
const ExportService = require('../../src/services/ExportService');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock QueryService
const mockQueryService = {
  list: jest.fn()
};

// Mock Config
const mockConfig = {
  batchSize: 2 // Small batch size for testing pagination
};

describe('ExportService Streaming', () => {
  let exportService;
  let tempDir;

  beforeEach(() => {
    exportService = new ExportService(mockConfig, mockQueryService);
    jest.clearAllMocks();
    // Create a temporary directory for output files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-test-'));
  });

  afterEach(() => {
    // Cleanup temp dir
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Expected
    }
  });

  test('should stream JSON export in batches', async () => {
    // Setup mock data: 5 records total, batch size 2 (from mockConfig implicitly or explicit limit)
    // expected queries:
    // 1. limit=2, offset=0 -> returns 2 recs
    // 2. limit=2, offset=2 -> returns 2 recs
    // 3. limit=2, offset=4 -> returns 1 rec
    // 4. limit=2, offset=5 -> returns 0 recs (stops)

    const allRecords = [
      { id: 1, name: 'Rec1' },
      { id: 2, name: 'Rec2' },
      { id: 3, name: 'Rec3' },
      { id: 4, name: 'Rec4' },
      { id: 5, name: 'Rec5' }
    ];

    mockQueryService.list.mockImplementation(async ({ limit, offset }) => {
      const slice = allRecords.slice(offset, offset + limit);
      return { records: slice };
    });

    const destFile = path.join(tempDir, 'output.json');

    // We force a small limit in the implementation call via option override or ensure service uses config
    // The service usually sends a large limit (100000). We need to verify that we can control the batch size 
    // or that the service implements generic pagination loop.
    // For the purpose of this refactor, we WANT the service to use a configurable batch size for querying.
    // Let's assume we pass { batchSize: 2 } in options or it uses config.

    const result = await exportService.export({
      format: 'json',
      destination: destFile,
      batchSize: 2 // Passed explicitly to trigger pagination loop
    });

    expect(result.exported).toBe(5);
    expect(mockQueryService.list).toHaveBeenCalledTimes(3);
    // 1st: offset 0 (2 recs)
    // 2nd: offset 2 (2 recs)
    // 3rd: offset 4 (1 rec)
    // The implementation might assume it's done when count < limit, so 3 calls is enough.

    expect(mockQueryService.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 2, offset: 0 }));
    expect(mockQueryService.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 2, offset: 2 }));
    expect(mockQueryService.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 2, offset: 4 }));

    const fileContent = fs.readFileSync(destFile, 'utf-8');
    const json = JSON.parse(fileContent);
    expect(json).toHaveLength(5);
    expect(json).toEqual(allRecords);
  });

  test('should stream CSV export in batches', async () => {
    const allRecords = [
      { memorial_number: '1', first_name: 'Rec1' },
      { memorial_number: '2', first_name: 'Rec2' },
      { memorial_number: '3', first_name: 'Rec3' }
    ];

    mockQueryService.list.mockImplementation(async ({ limit, offset }) => {
      const slice = allRecords.slice(offset, offset + limit);
      return { records: slice };
    });

    const destFile = path.join(tempDir, 'output.csv');

    const result = await exportService.export({
      format: 'csv',
      destination: destFile,
      batchSize: 2
    });

    expect(result.exported).toBe(3);

    const fileContent = fs.readFileSync(destFile, 'utf-8');
    const lines = fileContent.trim().split('\n');
    // Header + 3 records
    expect(lines.length).toBe(4);
    expect(lines[0]).toContain('memorial_number');
    expect(lines[1]).toContain('Rec1');
    expect(lines[3]).toContain('Rec3');
  });

  test('should handle empty result set', async () => {
    mockQueryService.list.mockResolvedValue({ records: [] });
    const destFile = path.join(tempDir, 'empty.json');

    const result = await exportService.export({
      format: 'json',
      destination: destFile
    });

    expect(result.exported).toBe(0);
    // Expect file not to be created or to be empty? 
    // Original behavior: writes empty string or handles it.
    // Current implementation returns early if records.length === 0 and doesn't write file?
    // Let's check existing implementation behavior or desired. 
    // "return { exported: 0, ... }" and DOES NOT write file in current code if empty.
    // We should preserve that or verify it.
    expect(fs.existsSync(destFile)).toBe(false);
  });
});
