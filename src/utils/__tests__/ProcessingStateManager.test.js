const { ProcessingStateManager } = require('../ProcessingStateManager');

describe('ProcessingStateManager', () => {
  let stateManager;

  beforeEach(() => {
    stateManager = new ProcessingStateManager();
  });

  describe('Constructor', () => {
    it('should initialize with default state', () => {
      expect(stateManager.state).toEqual({
        files: new Map(),
        totalFiles: 0,
        processedFiles: 0,
        errors: new Map(),
        phase: 'idle'
      });
      expect(stateManager.listeners).toBeInstanceOf(Set);
    });
  });

  describe('File Management', () => {
    it('should add files to tracking', () => {
      stateManager.addFiles(['file1.jpg', 'file2.jpg']);
      expect(stateManager.state.totalFiles).toBe(2);
      expect(stateManager.state.files.size).toBe(2);
      expect(stateManager.state.files.get('file1.jpg')).toEqual({
        id: 'file1.jpg',
        phases: {
          upload: 0,
          ocr: 0,
          analysis: 0,
          validation: 0
        },
        errors: [],
        status: 'pending'
      });
    });

    it('should prevent duplicate file additions', () => {
      stateManager.addFiles(['file1.jpg', 'file1.jpg']);
      expect(stateManager.state.totalFiles).toBe(1);
      expect(stateManager.state.files.size).toBe(1);
    });
  });

  describe('Progress Updates', () => {
    beforeEach(() => {
      stateManager.addFiles(['file1.jpg', 'file2.jpg']);
    });

    it('should update file phase progress atomically', async () => {
      const updatePromise = stateManager.updateFileProgress('file1.jpg', 'upload', 50);
      await expect(updatePromise).resolves.toBeTruthy();
      expect(stateManager.state.files.get('file1.jpg').phases.upload).toBe(50);
    });

    it('should validate progress bounds', async () => {
      await expect(
        stateManager.updateFileProgress('file1.jpg', 'upload', 150)
      ).rejects.toThrow('Progress value must be between 0 and 100');
    });

    it('should validate phase name', async () => {
      await expect(
        stateManager.updateFileProgress('file1.jpg', 'invalid', 50)
      ).rejects.toThrow('Invalid phase name');
    });

    it('should calculate weighted overall progress', () => {
      stateManager.updateFileProgress('file1.jpg', 'upload', 100);
      stateManager.updateFileProgress('file1.jpg', 'ocr', 50);
      stateManager.updateFileProgress('file2.jpg', 'upload', 100);

      // With weights: upload=0.2, ocr=0.3, analysis=0.3, validation=0.2
      // File1: (100*0.2 + 50*0.3 + 0*0.3 + 0*0.2) = 35%
      // File2: (100*0.2 + 0*0.3 + 0*0.3 + 0*0.2) = 20%
      // Overall: (35 + 20) / 2 = 27.5%
      expect(stateManager.getOverallProgress()).toBe(27.5);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      stateManager.addFiles(['file1.jpg']);
    });

    it('should track file errors', () => {
      const error = new Error('Test error');
      stateManager.addError('file1.jpg', error);
      expect(stateManager.state.errors.get('file1.jpg')).toBe(error);
      expect(stateManager.state.files.get('file1.jpg').status).toBe('error');
    });

    it('should clear errors when resolved', () => {
      const error = new Error('Test error');
      stateManager.addError('file1.jpg', error);
      stateManager.clearError('file1.jpg');
      expect(stateManager.state.errors.has('file1.jpg')).toBeFalsy();
      expect(stateManager.state.files.get('file1.jpg').status).toBe('pending');
    });
  });

  describe('State Change Notifications', () => {
    it('should notify listeners of state changes', () => {
      const listener = jest.fn();
      stateManager.addListener(listener);
      stateManager.addFiles(['file1.jpg']);
      expect(listener).toHaveBeenCalledWith(stateManager.state);
    });

    it('should remove listeners', () => {
      const listener = jest.fn();
      stateManager.addListener(listener);
      stateManager.removeListener(listener);
      stateManager.addFiles(['file1.jpg']);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Completion Detection', () => {
    beforeEach(() => {
      stateManager.addFiles(['file1.jpg', 'file2.jpg']);
    });

    it('should detect when all files are complete', async () => {
      await stateManager.updateFileProgress('file1.jpg', 'upload', 100);
      await stateManager.updateFileProgress('file1.jpg', 'ocr', 100);
      await stateManager.updateFileProgress('file1.jpg', 'analysis', 100);
      await stateManager.updateFileProgress('file1.jpg', 'validation', 100);
      await stateManager.updateFileProgress('file2.jpg', 'upload', 100);
      await stateManager.updateFileProgress('file2.jpg', 'ocr', 100);
      await stateManager.updateFileProgress('file2.jpg', 'analysis', 100);
      await stateManager.updateFileProgress('file2.jpg', 'validation', 100);

      expect(stateManager.isComplete()).toBeTruthy();
    });

    it('should not mark as complete with partial progress', async () => {
      await stateManager.updateFileProgress('file1.jpg', 'upload', 100);
      await stateManager.updateFileProgress('file1.jpg', 'ocr', 100);
      await stateManager.updateFileProgress('file2.jpg', 'upload', 50);

      expect(stateManager.isComplete()).toBeFalsy();
    });

    it('should not mark as complete with errors', async () => {
      await stateManager.updateFileProgress('file1.jpg', 'upload', 100);
      await stateManager.updateFileProgress('file1.jpg', 'ocr', 100);
      await stateManager.updateFileProgress('file1.jpg', 'analysis', 100);
      await stateManager.updateFileProgress('file1.jpg', 'validation', 100);
      
      const error = new Error('Test error');
      stateManager.addError('file2.jpg', error);

      expect(stateManager.isComplete()).toBeFalsy();
    });
  });
}); 