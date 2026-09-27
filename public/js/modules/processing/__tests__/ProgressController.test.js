/**
 * @jest-environment jsdom
 */

describe('ProgressController', () => {
  let progressController;
  let mockProgressClient;
  let mockProgressBar;
  
  beforeEach(() => {
    jest.useFakeTimers();
    
    // Mock dependencies
    mockProgressClient = {
      getProgress: jest.fn(),
      verifyCompletion: jest.fn()
    };
    
    mockProgressBar = {
      updateProgress: jest.fn(),
      showError: jest.fn(),
      showComplete: jest.fn()
    };
    
    const { ProgressController } = require('../ProgressController');
    progressController = new ProgressController(mockProgressBar, mockProgressClient);
  });
  
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('startPolling', () => {
    it('should start polling progress endpoint', async () => {
      const mockProgress = {
        progress: 45,
        state: 'ocr',
        errors: []
      };
      
      mockProgressClient.getProgress.mockResolvedValue(mockProgress);
      
      progressController.startPolling();
      
      // Wait for initial poll
      await Promise.resolve();
      await Promise.resolve();
      
      expect(mockProgressClient.getProgress).toHaveBeenCalled();
      expect(mockProgressBar.updateProgress).toHaveBeenCalledWith(45, 'ocr');
    });

    it('should handle progress errors', async () => {
      mockProgressClient.getProgress.mockRejectedValue(new Error('API Error'));
      
      progressController.startPolling();
      
      // Wait for initial poll
      await Promise.resolve();
      await Promise.resolve();
      
      expect(mockProgressBar.showError).toHaveBeenCalled();
    });
  });

  describe('stopPolling', () => {
    it('should stop polling on completion', async () => {
      const mockProgress = {
        progress: 100,
        state: 'complete',
        errors: []
      };
      
      mockProgressClient.getProgress.mockResolvedValue(mockProgress);
      
      progressController.startPolling();
      
      // Wait for initial poll and completion check
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      
      expect(mockProgressBar.showComplete).toHaveBeenCalled();
      
      // Should not poll again after completion
      jest.advanceTimersByTime(2000);
      expect(mockProgressClient.getProgress).toHaveBeenCalledTimes(1);
    });

    it('should stop polling on error', async () => {
      mockProgressClient.getProgress.mockRejectedValue(new Error('API Error'));
      
      progressController.startPolling();
      
      // Wait for initial poll
      await Promise.resolve();
      await Promise.resolve();
      
      expect(mockProgressBar.showError).toHaveBeenCalled();
      
      // Should not poll again
      jest.advanceTimersByTime(2000);
      expect(mockProgressClient.getProgress).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleProgress', () => {
    it('should update UI with progress data', async () => {
      const progressData = {
        progress: 75,
        state: 'analysis',
        errors: []
      };
      
      await progressController.handleProgress(progressData);
      
      expect(mockProgressBar.updateProgress).toHaveBeenCalledWith(75, 'analysis');
    });

    it('should handle completion', async () => {
      const progressData = {
        progress: 100,
        state: 'complete',
        errors: []
      };
      
      await progressController.handleProgress(progressData);
      
      expect(mockProgressBar.showComplete).toHaveBeenCalled();
    });

    it('should continue processing with errors (not show error state)', async () => {
      const progressData = {
        progress: 50,
        state: 'ocr',
        errors: ['Error processing file']
      };
      
      await progressController.handleProgress(progressData);
      
      // The controller warns about errors but continues processing
      // It doesn't call showError() unless there's a critical failure
      expect(mockProgressBar.updateProgress).toHaveBeenCalledWith(50, 'ocr');
      expect(mockProgressBar.showError).not.toHaveBeenCalled();
    });
  });
}); 