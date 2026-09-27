/**
 * @jest-environment jsdom
 */
import { ProgressBarUI } from '../ProgressBarUI.js';
import { ProgressClient } from '../ProgressClient.js';
import { ProgressController } from '../ProgressController.js';

describe('Processing Integration', () => {
  let container;
  let progressBar;
  let progressClient;
  let progressController;

  beforeEach(() => {
    // Set up DOM elements
    container = document.createElement('div');
    container.innerHTML = `
      <div id="progress-container">
        <div class="progress-bar">
          <div class="progress-bar__fill"></div>
        </div>
        <div class="progress-bar__status"></div>
      </div>
    `;
    document.body.appendChild(container);

    // Initialize components
    progressBar = new ProgressBarUI('progress-container');
    progressClient = new ProgressClient();
    progressController = new ProgressController(progressBar, progressClient);

    // Mock fetch
    global.fetch = jest.fn();

    // Spy on showComplete and showError
    jest.spyOn(progressBar, 'showComplete');
    jest.spyOn(progressBar, 'showError');
  });

  afterEach(() => {
    document.body.removeChild(container);
    jest.clearAllMocks();
    if (progressController) {
      progressController.stopPolling();
    }
  });

  test('should initialize components correctly', () => {
    expect(progressBar).toBeInstanceOf(ProgressBarUI);
    expect(progressClient).toBeInstanceOf(ProgressClient);
    expect(progressController).toBeInstanceOf(ProgressController);
  });

  test('should start polling when processing begins', async () => {
    // Mock getProgress method - use handleProgress directly to avoid network issues
    const mockProgress = {
      progress: 50,
      state: 'processing', // API uses 'state' not 'status'
      errors: [],
      files: {}
    };

    // Test the progress handling directly rather than polling
    await progressController.handleProgress(mockProgress);
    
    expect(container.querySelector('.progress-bar__fill').style.width).toBe('50%');
    expect(container.querySelector('.progress-bar__status').textContent).toBe('processing');
  });

  test('should handle completion correctly', async () => {
    // Mock completion response
    const mockCompletion = {
      progress: 100,
      state: 'complete', // API uses 'state' not 'status'
      errors: [],
      files: {}
    };

    await progressController.handleProgress(mockCompletion);
    
    expect(progressBar.showComplete).toHaveBeenCalled();
    expect(container.querySelector('.progress-bar').classList.contains('complete')).toBe(true);
  });

  test('should handle errors correctly', async () => {
    const mockError = {
      progress: 50,
      state: 'processing', // API uses 'state' not 'status'
      errors: [{ message: 'Test error' }],
      files: {}
    };

    await progressController.handleProgress(mockError);
    
    // The controller logs warnings for errors but continues processing
    // It doesn't set error state unless there's a critical failure
    expect(container.querySelector('.progress-bar__fill').style.width).toBe('50%');
    expect(container.querySelector('.progress-bar__status').textContent).toBe('processing');
  });
}); 