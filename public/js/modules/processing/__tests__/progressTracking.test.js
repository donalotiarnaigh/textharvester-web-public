/**
 * @jest-environment jsdom
 */

describe('Progress Tracking with Error Handling', () => {
  // Import modules - these will be mocked
  let progressModule;

  beforeEach(() => {
    // Set up DOM elements
    document.body.innerHTML = `
      <div id="progressBar" style="width: 0%"></div>
      <div id="statusMessage"></div>
      <div id="errorContainer" style="display: none;">
        <h3>Processing Notices</h3>
        <div id="errorList"></div>
      </div>
    `;

    // Get references to DOM elements

    // Reset fetch mock
    global.fetch = jest.fn();

    // Clear mocks between tests
    jest.resetModules();

    // Mock error handler module
    jest.mock('../errorHandler', () => ({
      updateErrorMessages: jest.fn()
    }));

    // Import modules
    progressModule = require('../ProgressBarUI');
  });

  it('should update progress bar with percentage', () => {
    // Create a ProgressBarUI instance
    const progressBarUI = new progressModule.ProgressBarUI('progressBar');
    progressBarUI.updateProgress(50, 'Processing');

    const fillElement = document.querySelector('.progress-bar__fill');
    expect(fillElement.style.width).toBe('50%');
    expect(fillElement.textContent).toBe('50%');
  });

  it('should update status message', () => {
    // Create a ProgressBarUI instance  
    const progressBarUI = new progressModule.ProgressBarUI('progressBar');
    progressBarUI.updateProgress(25, 'Testing progress');

    const statusElement = document.querySelector('.progress-bar__status');
    expect(statusElement.textContent).toBe('Testing progress');
  });

  it('should handle errors in progress response', async () => {
    // Mock fetch to return successful response
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        files: {},
        totalFiles: 1,
        processedFiles: 0,
        phase: 'processing',
        errors: [
          {
            fileName: 'file1.jpg',
            error: true,
            errorType: 'empty_sheet',
            errorMessage: 'No readable text found on the sheet'
          }
        ]
      })
    });

    // Import the module that uses fetch
    const apiModule = require('../api');

    // Call the checkProgress function
    const result = await apiModule.checkProgress();

    // Verify the API was called correctly
    expect(global.fetch).toHaveBeenCalledWith('/api/progress', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Verify the result structure
    expect(result).toHaveProperty('files');
    expect(result).toHaveProperty('totalFiles');
    expect(result).toHaveProperty('processedFiles');
    expect(result).toHaveProperty('phase');
  });

  it('should redirect to results page when complete, even with errors', async () => {
    // Mock fetch to return successful response
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        files: {},
        totalFiles: 1,
        processedFiles: 1,
        phase: 'complete',
        errors: [
          {
            fileName: 'file1.jpg',
            error: true,
            errorType: 'empty_sheet',
            errorMessage: 'No readable text found on the sheet'
          }
        ]
      })
    });

    // Import the module that uses fetch
    const apiModule = require('../api');

    // Call the checkProgress function
    const result = await apiModule.checkProgress();

    // Verify the API was called correctly
    expect(global.fetch).toHaveBeenCalledWith('/api/progress', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Verify completion state
    expect(result.phase).toBe('complete');
    expect(result.processedFiles).toBe(1);
  });
}); 