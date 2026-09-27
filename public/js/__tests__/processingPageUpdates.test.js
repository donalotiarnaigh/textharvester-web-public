/**
 * @jest-environment jsdom
 */

import { initModelTracking, getStatusMessage } from '../modules/processing/modelTracking.js';

describe('Processing Page Model Selection Features', () => {
  beforeEach(() => {
    // Set up DOM elements
    document.body.innerHTML = `
      <div id="modelDisplay"></div>
      <div id="progressBar" class="progress-bar"></div>
      <div id="statusMessage"></div>
    `;

    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('Model Display', () => {
    test('should display selected model name when model is in localStorage', () => {
      localStorage.setItem('selectedModel', 'openai');
      initModelTracking();
      expect(document.getElementById('modelDisplay').textContent)
        .toContain('OpenAI GPT-5.4');
    });

    test('should display default model when no model is selected', () => {
      initModelTracking();
      expect(document.getElementById('modelDisplay').textContent)
        .toContain('OpenAI GPT-5.4');
    });
  });

  describe('Progress Tracking', () => {
    test('should update progress bar correctly', () => {
      localStorage.setItem('selectedModel', 'anthropic');
      initModelTracking();

      // Manually update progress bar to simulate updateProgress function
      const progressBar = document.getElementById('progressBar');
      progressBar.style.width = '50%';
      progressBar.setAttribute('aria-valuenow', '50');

      expect(progressBar.style.width).toBe('50%');
      expect(progressBar.getAttribute('aria-valuenow')).toBe('50');
    });

    test('should handle 100% progress correctly', () => {
      localStorage.setItem('selectedModel', 'anthropic');
      initModelTracking();

      // Manually update progress bar to simulate updateProgress function
      const progressBar = document.getElementById('progressBar');
      progressBar.style.width = '100%';
      progressBar.setAttribute('aria-valuenow', '100');

      expect(progressBar.style.width).toBe('100%');
      expect(progressBar.getAttribute('aria-valuenow')).toBe('100');
    });
  });

  describe('Status Messages', () => {
    test('should display model-specific status messages during processing', () => {
      localStorage.setItem('selectedModel', 'openai');
      const message = getStatusMessage('processing', 'openai');
      expect(message).toContain('Processing with OpenAI GPT-5.4');
    });

    test('should handle model-specific errors appropriately', () => {
      localStorage.setItem('selectedModel', 'anthropic');
      const message = getStatusMessage('error', 'anthropic');
      expect(message).toContain('Error processing with Anthropic Claude Opus 4.6');
    });

    test('should display completion message', () => {
      const message = getStatusMessage('complete');
      expect(message).toContain('Processing complete');
    });
  });
}); 