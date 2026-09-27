/**
 * @jest-environment jsdom
 */
import { ProgressClient } from '../ProgressClient.js';

describe('ProgressClient', () => {
  let progressClient;
  
  beforeEach(() => {
    // Reset fetch mock
    global.fetch = jest.fn();
    progressClient = new ProgressClient();
  });

  describe('getProgress', () => {
    it('should fetch progress from the API', async () => {
      const mockProgress = {
        progress: 45,
        status: 'ocr',
        errors: []
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockProgress),
        headers: new Headers()
      });

      const result = await progressClient.getProgress();
      expect(result).toEqual({
        progress: 45,
        state: 'ocr',
        errors: [],
        files: {},
        conversion: null
      });
      expect(fetch).toHaveBeenCalledWith('/processing-status', expect.any(Object));
    });

    it('should handle API errors', async () => {
      // Disable retries for this test
      progressClient.maxRetries = 0;
      
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: {
          get: () => null
        }
      });

      await expect(progressClient.getProgress()).rejects.toThrow('HTTP error! status: 500');
    });

    it('should handle 304 responses', async () => {
      global.fetch.mockResolvedValueOnce({
        status: 304
      });

      const result = await progressClient.getProgress();
      expect(result).toBeNull();
    });
  });

  describe('verifyCompletion', () => {
    it('should verify completion status', async () => {
      const mockCompletion = {
        progress: 100,
        status: 'complete'
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockCompletion),
        headers: new Headers()
      });

      const result = await progressClient.verifyCompletion();
      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith('/processing-status', expect.any(Object));
    });

    it('should handle verification errors', async () => {
      // Disable retries for this test
      progressClient.maxRetries = 0;
      
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: {
          get: () => null
        }
      });

      const result = await progressClient.verifyCompletion();
      expect(result).toBe(false);
    });
  });

  describe('getErrors', () => {
    it('should fetch errors from API', async () => {
      const mockErrors = [
        { fileId: '1', message: 'Error 1' },
        { fileId: '2', message: 'Error 2' }
      ];

      const mockProgress = {
        progress: 50,
        status: 'processing',
        errors: mockErrors
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockProgress),
        headers: new Headers()
      });

      const result = await progressClient.getErrors();
      expect(result).toEqual(mockErrors);
      expect(fetch).toHaveBeenCalledWith('/processing-status', expect.any(Object));
    });

    it('should handle error fetch failures', async () => {
      // Disable retries for this test
      progressClient.maxRetries = 0;
      
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: {
          get: () => null
        }
      });

      const result = await progressClient.getErrors();
      expect(result).toEqual([]);
    });
  });
}); 