/**
 * @jest-environment jsdom
 */

const { ProcessingStateManager } = require('../../../utils/ProcessingStateManager');
const { FileProcessor } = require('../FileProcessor');

describe('FileProcessor', () => {
  let stateManager;
  let fileProcessor;
  let mockUploader;
  let mockOcrService;
  let mockAnalyzer;
  let mockValidator;

  beforeEach(() => {
    stateManager = new ProcessingStateManager();
    
    // Mock services
    mockUploader = {
      upload: jest.fn().mockImplementation((file) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ url: `https://example.com/${file.name}` });
          }, 100);
        });
      })
    };

    mockOcrService = {
      process: jest.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ text: 'Sample OCR text', confidence: 0.95 });
          }, 100);
        });
      })
    };

    mockAnalyzer = {
      analyze: jest.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ entities: ['name', 'date'], sentiment: 'positive' });
          }, 100);
        });
      })
    };

    mockValidator = {
      validate: jest.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ isValid: true, score: 0.98 });
          }, 100);
        });
      })
    };

    fileProcessor = new FileProcessor(
      stateManager,
      mockUploader,
      mockOcrService,
      mockAnalyzer,
      mockValidator
    );
  });

  describe('File Processing Pipeline', () => {
    it('should process a single file through all phases', async () => {
      const file = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });
      const processPromise = fileProcessor.processFile(file);

      // Check initial state
      expect(stateManager.state.phase).toBe('upload');
      expect(stateManager.state.files.get('test.jpg').phases.upload).toBe(0);

      // Wait for processing to complete
      await processPromise;

      // Verify all phases completed
      const fileState = stateManager.state.files.get('test.jpg');
      expect(fileState.phases.upload).toBe(100);
      expect(fileState.phases.ocr).toBe(100);
      expect(fileState.phases.analysis).toBe(100);
      expect(fileState.phases.validation).toBe(100);
      expect(fileState.status).toBe('complete');
    });

    it('should handle multiple files concurrently', async () => {
      const files = [
        new File(['content1'], 'test1.jpg', { type: 'image/jpeg' }),
        new File(['content2'], 'test2.jpg', { type: 'image/jpeg' })
      ];

      const processPromises = files.map(file => fileProcessor.processFile(file));
      await Promise.all(processPromises);

      // Verify all files completed
      files.forEach(file => {
        const fileState = stateManager.state.files.get(file.name);
        expect(fileState.status).toBe('complete');
        expect(Object.values(fileState.phases).every(p => p === 100)).toBe(true);
      });
    });

    it('should update progress during each phase', async () => {
      const progressUpdates = [];
      const file = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });

      stateManager.addListener(state => {
        const fileState = state.files.get('test.jpg');
        if (fileState) {
          progressUpdates.push({
            phase: state.phase,
            progress: fileState.phases[state.phase]
          });
        }
      });

      await fileProcessor.processFile(file);

      // Verify progress updates were made
      expect(progressUpdates.length).toBeGreaterThan(4); // At least one update per phase
      expect(progressUpdates.some(u => u.phase === 'upload')).toBe(true);
      expect(progressUpdates.some(u => u.phase === 'ocr')).toBe(true);
      expect(progressUpdates.some(u => u.phase === 'analysis')).toBe(true);
      expect(progressUpdates.some(u => u.phase === 'validation')).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      const file = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });
      
      // Simulate OCR failure
      mockOcrService.process.mockRejectedValueOnce(new Error('OCR failed'));

      await fileProcessor.processFile(file);

      const fileState = stateManager.state.files.get('test.jpg');
      expect(fileState.status).toBe('error');
      expect(stateManager.state.errors.get('test.jpg')).toBeTruthy();
      expect(stateManager.state.errors.get('test.jpg').message).toBe('OCR failed');
    });

    it('should respect phase weights in progress calculation', async () => {
      const file = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });
      const progressUpdates = [];

      stateManager.addListener(state => {
        const progress = state.files.get('test.jpg')?.phases[state.phase] || 0;
        progressUpdates.push({ phase: state.phase, progress });
      });

      // Mock upload to be slower for testing progress
      mockUploader.upload.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({ url: 'https://example.com/test.jpg' });
          }, 200);
        });
      });

      const processPromise = fileProcessor.processFile(file);

      // Wait a bit to check progress during upload
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify upload progress is weighted correctly
      const uploadProgress = progressUpdates.find(u => u.phase === 'upload')?.progress;
      expect(uploadProgress).toBeLessThan(100);

      await processPromise;

      // Verify final progress
      const finalProgress = progressUpdates[progressUpdates.length - 1].progress;
      expect(finalProgress).toBe(100);
    });
  });

  describe('Cancellation and Cleanup', () => {
    it('should allow cancelling file processing', async () => {
      const file = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });
      
      // Make upload take longer
      mockUploader.upload.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({ url: 'https://example.com/test.jpg' });
          }, 300);
        });
      });

      // Start processing
      const processPromise = fileProcessor.processFile(file);
      
      // Wait a bit to ensure processing has started
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Cancel during upload phase
      fileProcessor.cancelProcessing('test.jpg');

      await processPromise;

      const fileState = stateManager.state.files.get('test.jpg');
      expect(fileState.status).toBe('cancelled');
      expect(fileState.phases[stateManager.state.phase]).toBeLessThan(100);
      expect(fileState.phases.ocr).toBe(0);
      expect(fileState.phases.analysis).toBe(0);
      expect(fileState.phases.validation).toBe(0);
    });

    it('should clean up resources after processing', async () => {
      const file = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });
      await fileProcessor.processFile(file);

      // Verify cleanup
      expect(mockUploader.upload).toHaveBeenCalledTimes(1);
      expect(mockOcrService.process).toHaveBeenCalledTimes(1);
      expect(mockAnalyzer.analyze).toHaveBeenCalledTimes(1);
      expect(mockValidator.validate).toHaveBeenCalledTimes(1);
    });
  });
}); 