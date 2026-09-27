/**
 * @jest-environment jsdom
 */

// Mock clipboard.js

global.ClipboardJS = jest.fn().mockImplementation(() => ({
  on: jest.fn((event, callback) => {
    if (event === 'success') {
      // Store the callback for testing
      global.ClipboardJS.successCallback = callback;
    }
  }),
  destroy: jest.fn()
}));

// Mock jQuery and Bootstrap collapse functionality
const mockCollapse = jest.fn();
global.$ = jest.fn(() => ({
  collapse: mockCollapse,
  on: jest.fn(),
  data: jest.fn()
}));

describe('Model Info Panel', () => {
  let container;
  const mockData = {
    ai_provider: 'openai',
    model_version: 'gpt-5.1',
    prompt_template: 'memorial_ocr',
    prompt_version: '1.0.0',
    processed_date: '2024-03-20T10:00:00.000Z'
  };

  beforeEach(() => {
    // Enable fake timers
    jest.useFakeTimers();

    // Reset mocks
    global.$.mockClear();
    global.ClipboardJS.mockClear();
    mockCollapse.mockClear();

    // Set up DOM
    container = document.createElement('div');
    document.body.appendChild(container);

    // Add required HTML structure
    container.innerHTML = `
      <div class="model-info-panel card mb-4">
        <div class="card-header d-flex justify-content-between align-items-center">
          <h5 class="mb-0">
            <button class="btn btn-link" data-toggle="collapse" data-target="#modelInfoContent">
              Model & Prompt Information
            </button>
          </h5>
          <button class="btn btn-sm btn-outline-secondary copy-info" data-clipboard-target="#modelInfoContent">
            <i class="fas fa-copy"></i> Copy
          </button>
        </div>
        <div id="modelInfoContent" class="collapse">
          <div class="card-body">
            <div class="row">
              <div class="col-md-6">
                <div class="model-details">
                  <h6>Model Information</h6>
                  <p><strong>Provider:</strong> <span id="infoProvider"></span></p>
                  <p><strong>Version:</strong> <span id="infoModelVersion"></span></p>
                </div>
              </div>
              <div class="col-md-6">
                <div class="prompt-details">
                  <h6>Prompt Information</h6>
                  <p><strong>Template:</strong> <span id="infoTemplate"></span></p>
                  <p><strong>Version:</strong> <span id="infoPromptVersion"></span></p>
                  <p><strong>Last Updated:</strong> <span id="infoProcessedDate"></span></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Import the module
    require('../../public/js/modules/results/modelInfoPanel.js');
  });

  afterEach(() => {
    document.body.removeChild(container);
    container = null;
    jest.resetModules();
    jest.useRealTimers();
  });

  describe('Panel Structure', () => {
    it('should have collapsible content', () => {
      const collapseButton = container.querySelector('[data-toggle="collapse"]');
      const collapseContent = container.querySelector('#modelInfoContent');

      expect(collapseButton).toBeTruthy();
      expect(collapseContent).toBeTruthy();
      expect(collapseContent.classList.contains('collapse')).toBeTruthy();
    });

    it('should have copy button', () => {
      const copyButton = container.querySelector('.copy-info');
      expect(copyButton).toBeTruthy();
      expect(copyButton.getAttribute('data-clipboard-target')).toBe('#modelInfoContent');
    });
  });

  describe('Data Display', () => {
    beforeEach(() => {
      window.updateModelInfoPanel(mockData);
    });

    it('should display model information correctly', () => {
      expect(document.getElementById('infoProvider').textContent).toBe('OpenAI');
      expect(document.getElementById('infoModelVersion').textContent).toBe('gpt-5.1');
    });

    it('should display prompt information correctly', () => {
      expect(document.getElementById('infoTemplate').textContent).toBe('memorial_ocr');
      expect(document.getElementById('infoPromptVersion').textContent).toBe('1.0.0');
    });

    it('should format processed date correctly', () => {
      const formattedDate = document.getElementById('infoProcessedDate').textContent;
      expect(formattedDate).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/); // Date in format MM/DD/YYYY
    });
  });

  describe('Clipboard Functionality', () => {
    it('should initialize clipboard.js', () => {
      window.initializeModelInfoPanel();
      expect(ClipboardJS).toHaveBeenCalledWith('.copy-info');
    });

    it('should handle successful copy', () => {
      window.initializeModelInfoPanel();

      // Create test button
      const button = document.createElement('button');
      button.innerHTML = '<i class="fas fa-copy"></i> Copy';

      // Call the success handler directly
      window.handleCopySuccess({ trigger: button });

      expect(button.innerHTML).toContain('fa-check');
      expect(button.innerHTML).toContain('Copied!');

      // Fast-forward timers
      jest.advanceTimersByTime(2000);

      expect(button.innerHTML).toBe('<i class="fas fa-copy"></i> Copy');
    });
  });

  describe('Collapse Behavior', () => {
    it('should toggle collapse on button click', () => {
      const button = container.querySelector('[data-toggle="collapse"]');
      const mockEvent = {
        preventDefault: jest.fn(),
        currentTarget: button
      };

      window.handleCollapseToggle(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(global.$).toHaveBeenCalledWith('#modelInfoContent');
      expect(mockCollapse).toHaveBeenCalledWith('toggle');
    });
  });
}); 