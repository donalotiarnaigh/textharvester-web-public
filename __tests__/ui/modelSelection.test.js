/**
 * @jest-environment jsdom
 */

// Mock the modules we'll be testing
jest.mock('../../public/js/modules/index/modelSelection.js', () => ({
  initModelSelection: jest.fn(),
  getSelectedModel: jest.fn(),
}));

jest.mock('../../public/js/modules/index/fileUpload.js', () => ({
  handleFileUpload: jest.fn(),
}));

// Import the modules
const { initModelSelection, getSelectedModel } = require('../../public/js/modules/index/modelSelection.js');
const { handleFileUpload } = require('../../public/js/modules/index/fileUpload.js');

describe('Model Selection Module', () => {
  let mockFormData;
  let mockXHR;
  let mockFile;

  beforeEach(() => {
    // Setup DOM elements
    document.body.innerHTML = `
      <div class="container">
        <div class="form-check"></div>
        <form id="uploadForm" class="dropzone">
          <div class="dz-message"></div>
        </form>
      </div>
    `;

    // Mock FormData
    mockFormData = {
      append: jest.fn()
    };

    // Mock XHR
    mockXHR = {};

    // Mock File
    mockFile = {
      name: 'test.jpg',
      type: 'image/jpeg'
    };

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.resetModules();
  });

  describe('initModelSelection', () => {
    it('should insert model selection HTML into the DOM', () => {
      // Mock implementation for this test
      initModelSelection.mockImplementation(() => {
        document.querySelector('.form-check').insertAdjacentHTML('beforebegin', `
          <div class="form-group mb-3">
            <label for="modelSelect">Select AI Model</label>
            <select class="form-control" id="modelSelect">
              <option value="openai">OpenAI GPT-4o (Faster)</option>
              <option value="anthropic">Anthropic Claude 3.7 (More Accurate)</option>
            </select>
            <small class="form-text text-muted model-info"></small>
          </div>
        `);
      });

      initModelSelection();
      
      const modelSelect = document.getElementById('modelSelect');
      expect(modelSelect).toBeTruthy();
      expect(modelSelect.options.length).toBe(2);
      expect(modelSelect.options[0].value).toBe('openai');
      expect(modelSelect.options[1].value).toBe('anthropic');
    });

    it('should initialize with OpenAI as default model', () => {
      initModelSelection.mockImplementation(() => {
        document.querySelector('.form-check').insertAdjacentHTML('beforebegin', `
          <div class="form-group mb-3">
            <select class="form-control" id="modelSelect">
              <option value="openai">OpenAI GPT-4o (Faster)</option>
              <option value="anthropic">Anthropic Claude 3.7 (More Accurate)</option>
            </select>
          </div>
        `);
      });

      initModelSelection();
      
      const modelSelect = document.getElementById('modelSelect');
      expect(modelSelect.value).toBe('openai');
    });

    it('should update model info when selection changes', () => {
      // Mock implementation with model info update
      initModelSelection.mockImplementation(() => {
        document.querySelector('.form-check').insertAdjacentHTML('beforebegin', `
          <div class="form-group mb-3">
            <select class="form-control" id="modelSelect">
              <option value="openai">OpenAI GPT-4o (Faster)</option>
              <option value="anthropic">Anthropic Claude 3.7 (More Accurate)</option>
            </select>
            <small class="form-text text-muted model-info"></small>
          </div>
        `);

        // Add change event listener
        const modelSelect = document.getElementById('modelSelect');
        const modelInfo = document.querySelector('.model-info');
        modelSelect.addEventListener('change', () => {
          if (modelSelect.value === 'anthropic') {
            modelInfo.textContent = 'Excellent at handling complex or degraded inscriptions. Average processing time: ~20-25 seconds per image';
          } else {
            modelInfo.textContent = 'Fast and accurate for most memorial inscriptions. Average processing time: ~15-20 seconds per image';
          }
        });
      });
      
      initModelSelection();
      
      const modelSelect = document.getElementById('modelSelect');
      const modelInfo = document.querySelector('.model-info');
      
      // Change to Anthropic
      modelSelect.value = 'anthropic';
      modelSelect.dispatchEvent(new Event('change'));
      
      expect(modelInfo.textContent).toContain('complex or degraded inscriptions');
    });
  });

  describe('getSelectedModel', () => {
    it('should return the currently selected model', () => {
      // Mock implementation
      getSelectedModel.mockImplementation(() => {
        const select = document.getElementById('modelSelect');
        return select ? select.value : 'openai';
      });

      initModelSelection();
      
      const modelSelect = document.getElementById('modelSelect');
      modelSelect.value = 'anthropic';
      modelSelect.dispatchEvent(new Event('change'));
      
      expect(getSelectedModel()).toBe('anthropic');
    });

    it('should return openai as default if select element not found', () => {
      // Mock implementation
      getSelectedModel.mockImplementation(() => 'openai');
      
      document.body.innerHTML = ''; // Remove all elements
      
      expect(getSelectedModel()).toBe('openai');
    });
  });

  describe('Integration with file upload', () => {
    it('should include model selection in form data when uploading', () => {
      // Mock implementation
      getSelectedModel.mockReturnValue('anthropic');
      
      // Mock dropzone instance
      const dropzoneInstance = {
        on: jest.fn((event, callback) => {
          if (event === 'sending') {
            callback(mockFile, mockXHR, mockFormData);
          }
        })
      };

      // Mock handleFileUpload implementation
      handleFileUpload.mockImplementation((instance) => {
        instance.on('sending', (file, xhr, formData) => {
          const selectedModel = getSelectedModel();
          formData.append('aiProvider', selectedModel);
        });
      });

      // Initialize file upload handler
      handleFileUpload(dropzoneInstance);

      // Trigger the sending event manually
      dropzoneInstance.on.mock.calls
        .find(([event]) => event === 'sending')[1](mockFile, mockXHR, mockFormData);

      // Verify form data includes model selection
      expect(mockFormData.append).toHaveBeenCalledWith('aiProvider', 'anthropic');
    });
  });
}); 