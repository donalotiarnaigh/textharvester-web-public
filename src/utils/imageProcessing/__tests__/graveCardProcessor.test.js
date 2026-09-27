const { exec } = require('child_process');
const sharp = require('sharp');
const graveCardProcessor = require('../graveCardProcessor');
const fs = require('fs');

// Mock child_process.exec
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

// Mock sharp
jest.mock('sharp', () => {
  const mSharp = {
    metadata: jest.fn().mockResolvedValue({ width: 1000, height: 1400 }),
    resize: jest.fn().mockReturnThis(),
    composite: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('stitched-image')),
    jpeg: jest.fn().mockReturnThis(),
  };
  return jest.fn(() => mSharp);
});

// Mock fs.readdir and fs.unlink
jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn(),
    unlink: jest.fn().mockResolvedValue(),
  },
}));

describe('GraveCardProcessor', () => {
  const mockPdfPath = '/tmp/test-card.pdf';

  beforeEach(() => {
    jest.clearAllMocks();
    // Default config mock if needed, though we import it directly. 
    // Ideally we should mock config to control it, but for now we rely on the file import 
    // or we can mock the module if specific values are strictly needed.
    // For this test, we assume config.uploadPath is defined or we mock fs behavior to match.
  });

  // Helper to simulate successful pdftocairo execution
  const mockExecSuccess = () => {
    exec.mockImplementation((cmd, cb) => {
      cb(null, 'stdout', 'stderr');
    });
  };

  const mockExecFailure = () => {
    exec.mockImplementation((cmd, cb) => {
      cb(new Error('Command failed'), null, 'stderr');
    });
  };

  test('processPdf throws error if PDF conversion fails', async () => {
    mockExecFailure();

    await expect(graveCardProcessor.processPdf(mockPdfPath))
      .rejects
      .toThrow('Failed to convert PDF');
  });

  test('processPdf throws error if page count is not exactly 2', async () => {
    mockExecSuccess();
    // Mock readdir to return 1 file
    fs.promises.readdir.mockResolvedValue(['file1.jpg']);

    await expect(graveCardProcessor.processPdf(mockPdfPath))
      .rejects
      .toThrow('Invalid page count');

    // Mock readdir to return 3 files
    fs.promises.readdir.mockResolvedValue(['file1.jpg', 'file2.jpg', 'file3.jpg']);
    await expect(graveCardProcessor.processPdf(mockPdfPath))
      .rejects
      .toThrow('Invalid page count');
  });

  test('processPdf successfully stitches 2 pages', async () => {
    mockExecSuccess();
    const headers = ['test_prefix_page-1.jpg', 'test_prefix_page-2.jpg'];
    fs.promises.readdir.mockResolvedValue(headers);

    // We need to ensure readdir returns files that match the logic in the processor.
    // The processor will likely filter files based on a specific prefix derived from the input filename.
    // So we need to ensure our mock behavior aligns with how the processor generates filenames.
    // Let's assume the processor uses a timestamp-based ID. 
    // Since we can't easily adhere to the dynamic timestamp in the test without complex mocking of Date.now(),
    // we might need to rely on the processor returning the list of generated files or mocking the conversion function specifically if it was separate.
    // HOWEVER, the plan is to test `graveCardProcessor.processPdf`.
    // Let's refine the mock to return files that "look right" regardless of the timestamp, 
    // OR we just accept that the processor code will filter them. 
    // Valid strategy: The processor will look for files starting with X. 
    // We will make readdir return files that match *some* logic.

    // Actually, checking how `pdfConverter.js` does it: it filters by startswith.
    // We should probably mock `convertPdfToJpegs` if we separate it, or just mock `fs.readdir` to return files that match.
    // To make this robust, we'll spy on Date.now() or just assume the processor finds the files we verify.

    // Simpler approach: mock the internal helper if we could, but we are testing the public API.
    // Let's make the test robust by mocking fs.readdir to only return the specific files we expect the processor to find.
    // But the processor generates a unique ID.
    // Let's just mock Date.now to a fixed value.
    jest.spyOn(Date, 'now').mockReturnValue(1234567890);

    const expectedPrefix = 'test_card_1234567890_page';
    fs.promises.readdir.mockResolvedValue([
      `${expectedPrefix}-1.jpg`,
      `${expectedPrefix}-2.jpg`
    ]);

    const result = await graveCardProcessor.processPdf(mockPdfPath);

    expect(result).toBeInstanceOf(Buffer);

    // Verify sharp called correctly
    // 1. Created sharp instances for files
    expect(sharp).toHaveBeenCalledTimes(3); // 2 inputs + 1 composite

    // Verify cleanup
    expect(fs.promises.unlink).toHaveBeenCalledTimes(3); // 2 jpgs + 1 pdf
  });
});
