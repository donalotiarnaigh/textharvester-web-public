const conversionTracker = require('../../src/utils/conversionTracker');

describe('ConversionTracker', () => {
  beforeEach(() => {
    conversionTracker.resetConversionState();
  });

  describe('registerPdfsForConversion', () => {
    it('should register PDFs and set converting state', () => {
      const pdfs = [
        { path: '/path/to/file1.pdf', originalname: 'file1.pdf' },
        { path: '/path/to/file2.pdf', originalname: 'file2.pdf' }
      ];

      conversionTracker.registerPdfsForConversion(pdfs);

      expect(conversionTracker.isConverting()).toBe(true);
      const progress = conversionTracker.getConversionProgress();
      expect(progress.total).toBe(2);
      expect(progress.completed).toBe(0);
    });

    it('should handle empty PDFs array', () => {
      conversionTracker.registerPdfsForConversion([]);

      expect(conversionTracker.isConverting()).toBe(false);
      expect(conversionTracker.getConversionProgress()).toBeNull();
    });

    it('should handle null PDFs', () => {
      conversionTracker.registerPdfsForConversion(null);

      expect(conversionTracker.isConverting()).toBe(false);
      expect(conversionTracker.getConversionProgress()).toBeNull();
    });
  });

  describe('getConversionProgress', () => {
    it('should return null when not converting', () => {
      expect(conversionTracker.getConversionProgress()).toBeNull();
    });

    it('should return progress object with correct counts', () => {
      const pdfs = [
        { path: '/path/to/file1.pdf', originalname: 'file1.pdf' },
        { path: '/path/to/file2.pdf', originalname: 'file2.pdf' }
      ];

      conversionTracker.registerPdfsForConversion(pdfs);
      const progress = conversionTracker.getConversionProgress();

      expect(progress).toEqual(
        expect.objectContaining({
          total: 2,
          completed: 0,
          errors: []
        })
      );
    });

    it('should track current file', () => {
      const pdfs = [
        { path: '/path/to/file1.pdf', originalname: 'file1.pdf' }
      ];

      conversionTracker.registerPdfsForConversion(pdfs);
      const progress = conversionTracker.getConversionProgress();

      expect(progress.currentFile).toBe('file1.pdf');
    });
  });

  describe('markConversionComplete', () => {
    it('should increment completed count', () => {
      const pdfs = [
        { path: '/path/to/file1.pdf', originalname: 'file1.pdf' },
        { path: '/path/to/file2.pdf', originalname: 'file2.pdf' }
      ];

      conversionTracker.registerPdfsForConversion(pdfs);
      conversionTracker.markConversionComplete('/path/to/file1.pdf', 5);

      const progress = conversionTracker.getConversionProgress();
      expect(progress.completed).toBe(1);
      expect(conversionTracker.isConverting()).toBe(true);
    });

    it('should mark all converting as false when all complete', () => {
      const pdfs = [
        { path: '/path/to/file1.pdf', originalname: 'file1.pdf' }
      ];

      conversionTracker.registerPdfsForConversion(pdfs);
      conversionTracker.markConversionComplete('/path/to/file1.pdf', 5);

      expect(conversionTracker.isConverting()).toBe(false);
    });
  });

  describe('markConversionFailed', () => {
    it('should record error', () => {
      const pdfs = [
        { path: '/path/to/file1.pdf', originalname: 'file1.pdf' }
      ];

      conversionTracker.registerPdfsForConversion(pdfs);
      conversionTracker.markConversionFailed('/path/to/file1.pdf', 'Test error');

      const progress = conversionTracker.getConversionProgress();
      expect(progress.errors.length).toBe(1);
      expect(progress.errors[0].message).toBe('Test error');
    });

    it('should mark all converting as false when all complete', () => {
      const pdfs = [
        { path: '/path/to/file1.pdf', originalname: 'file1.pdf' }
      ];

      conversionTracker.registerPdfsForConversion(pdfs);
      conversionTracker.markConversionFailed('/path/to/file1.pdf', 'Test error');

      expect(conversionTracker.isConverting()).toBe(false);
    });

    it('should track multiple errors', () => {
      const pdfs = [
        { path: '/path/to/file1.pdf', originalname: 'file1.pdf' },
        { path: '/path/to/file2.pdf', originalname: 'file2.pdf' }
      ];

      conversionTracker.registerPdfsForConversion(pdfs);
      conversionTracker.markConversionFailed('/path/to/file1.pdf', 'Error 1');
      conversionTracker.markConversionFailed('/path/to/file2.pdf', 'Error 2');

      const progress = conversionTracker.getConversionProgress();
      expect(progress.errors.length).toBe(2);
    });
  });

  describe('isConverting', () => {
    it('should return true when PDFs registered', () => {
      const pdfs = [
        { path: '/path/to/file1.pdf', originalname: 'file1.pdf' }
      ];

      conversionTracker.registerPdfsForConversion(pdfs);
      expect(conversionTracker.isConverting()).toBe(true);
    });

    it('should return false when no PDFs registered', () => {
      expect(conversionTracker.isConverting()).toBe(false);
    });

    it('should return false after all conversions complete', () => {
      const pdfs = [
        { path: '/path/to/file1.pdf', originalname: 'file1.pdf' }
      ];

      conversionTracker.registerPdfsForConversion(pdfs);
      conversionTracker.markConversionComplete('/path/to/file1.pdf', 5);

      expect(conversionTracker.isConverting()).toBe(false);
    });
  });

  describe('resetConversionState', () => {
    it('should clear all state', () => {
      const pdfs = [
        { path: '/path/to/file1.pdf', originalname: 'file1.pdf' }
      ];

      conversionTracker.registerPdfsForConversion(pdfs);
      conversionTracker.resetConversionState();

      expect(conversionTracker.isConverting()).toBe(false);
      expect(conversionTracker.getConversionProgress()).toBeNull();
    });
  });

  describe('sequential PDF tracking', () => {
    it('should track multiple PDFs sequentially', () => {
      const pdfs = [
        { path: '/path/to/file1.pdf', originalname: 'file1.pdf' },
        { path: '/path/to/file2.pdf', originalname: 'file2.pdf' },
        { path: '/path/to/file3.pdf', originalname: 'file3.pdf' }
      ];

      conversionTracker.registerPdfsForConversion(pdfs);
      expect(conversionTracker.getConversionProgress().total).toBe(3);

      conversionTracker.markConversionComplete('/path/to/file1.pdf', 3);
      expect(conversionTracker.getConversionProgress().completed).toBe(1);
      expect(conversionTracker.isConverting()).toBe(true);

      conversionTracker.markConversionComplete('/path/to/file2.pdf', 5);
      expect(conversionTracker.getConversionProgress().completed).toBe(2);
      expect(conversionTracker.isConverting()).toBe(true);

      conversionTracker.markConversionComplete('/path/to/file3.pdf', 2);
      // Progress should still be available after all conversions complete
      expect(conversionTracker.getConversionProgress().completed).toBe(3);
      expect(conversionTracker.isConverting()).toBe(false);
    });
  });
});
