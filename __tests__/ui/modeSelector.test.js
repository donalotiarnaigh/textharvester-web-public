/**
 * @jest-environment jsdom
 */

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

// Store original localStorage
const originalLocalStorage = global.localStorage;

// Mock localStorage globally
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true
});

describe('Mode Selector UI', () => {
  let initModeSelector;

  beforeAll(async () => {
    // Import the module dynamically to ensure DOM is ready
    const module = await import('../../public/js/modules/index/modeSelector.js');
    initModeSelector = module.initModeSelector;
  });

  afterAll(() => {
    // Restore original localStorage
    global.localStorage = originalLocalStorage;
  });

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';

    // Create the container that the mode selector expects
    const container = document.createElement('div');
    container.id = 'mode-selector-container';
    document.body.appendChild(container);

    // Reset localStorage mock
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
    localStorageMock.clear.mockClear();
  });

  afterEach(() => {
    // Clean up DOM
    document.body.innerHTML = '';
  });

  describe('Initialization', () => {
    it('should render mode selector with radio buttons', () => {
      initModeSelector();

      const container = document.getElementById('mode-selector-container');
      expect(container).not.toBeNull();

      // Check for card structure
      const card = container.querySelector('.card');
      expect(card).not.toBeNull();

      // Check for radio buttons
      const recordSheetRadio = document.getElementById('recordSheet');
      const monumentPhotoRadio = document.getElementById('monumentPhoto');

      expect(recordSheetRadio).not.toBeNull();
      expect(monumentPhotoRadio).not.toBeNull();
      expect(recordSheetRadio.type).toBe('radio');
      expect(monumentPhotoRadio.type).toBe('radio');
      expect(recordSheetRadio.name).toBe('uploadMode');
      expect(monumentPhotoRadio.name).toBe('uploadMode');
      expect(recordSheetRadio.value).toBe('record_sheet');
      expect(monumentPhotoRadio.value).toBe('monument_photo');
    });

    it('should have record_sheet selected by default', () => {
      localStorageMock.getItem.mockReturnValue(null);

      initModeSelector();

      const recordSheetRadio = document.getElementById('recordSheet');
      const monumentPhotoRadio = document.getElementById('monumentPhoto');

      expect(recordSheetRadio.checked).toBe(true);
      expect(monumentPhotoRadio.checked).toBe(false);
    });

    it('should render proper labels for radio buttons', () => {
      initModeSelector();

      const recordSheetLabel = document.querySelector('label[for="recordSheet"]');
      const monumentPhotoLabel = document.querySelector('label[for="monumentPhoto"]');

      expect(recordSheetLabel).not.toBeNull();
      expect(monumentPhotoLabel).not.toBeNull();
      expect(recordSheetLabel.textContent.trim()).toBe('Record Sheet');
      expect(monumentPhotoLabel.textContent.trim()).toBe('Monument Photo');
    });

    it('should include proper form structure', () => {
      initModeSelector();

      const container = document.getElementById('mode-selector-container');
      const formGroup = container.querySelector('.form-group');
      const formLabel = container.querySelector('.form-label');

      expect(formGroup).not.toBeNull();
      expect(formLabel).not.toBeNull();
      expect(formLabel.textContent.trim()).toBe('Upload Mode');
    });
  });

  describe('LocalStorage Integration', () => {
    it('should load saved preference from localStorage', () => {
      localStorageMock.getItem.mockReturnValue('monument_photo');

      initModeSelector();

      const recordSheetRadio = document.getElementById('recordSheet');
      const monumentPhotoRadio = document.getElementById('monumentPhoto');

      expect(recordSheetRadio.checked).toBe(false);
      expect(monumentPhotoRadio.checked).toBe(true);
      expect(localStorageMock.getItem).toHaveBeenCalledWith('uploadMode');
    });

    it('should default to record_sheet when localStorage is empty', () => {
      localStorageMock.getItem.mockReturnValue(null);

      initModeSelector();

      const recordSheetRadio = document.getElementById('recordSheet');
      expect(recordSheetRadio.checked).toBe(true);
    });

    it('should save selection to localStorage when changed', () => {
      initModeSelector();

      const monumentPhotoRadio = document.getElementById('monumentPhoto');

      // Simulate user clicking the radio button
      monumentPhotoRadio.click();

      expect(localStorageMock.setItem).toHaveBeenCalledWith('uploadMode', 'monument_photo');
    });

    it('should save record_sheet selection to localStorage', () => {
      // Start with monument_photo selected
      localStorageMock.getItem.mockReturnValue('monument_photo');
      initModeSelector();

      const recordSheetRadio = document.getElementById('recordSheet');

      // Simulate user clicking the record sheet radio button
      recordSheetRadio.click();

      expect(localStorageMock.setItem).toHaveBeenCalledWith('uploadMode', 'record_sheet');
    });
  });

  describe('Event Handling', () => {
    it('should update checked state when radio button is clicked', () => {
      // Set up localStorage to return null so we get default behavior
      localStorageMock.getItem.mockReturnValue(null);

      initModeSelector();

      const recordSheetRadio = document.getElementById('recordSheet');
      const monumentPhotoRadio = document.getElementById('monumentPhoto');

      // Initially record_sheet should be checked
      expect(recordSheetRadio.checked).toBe(true);
      expect(monumentPhotoRadio.checked).toBe(false);

      // Click monument photo
      monumentPhotoRadio.click();

      expect(recordSheetRadio.checked).toBe(false);
      expect(monumentPhotoRadio.checked).toBe(true);

      // Click record sheet
      recordSheetRadio.click();

      expect(recordSheetRadio.checked).toBe(true);
      expect(monumentPhotoRadio.checked).toBe(false);
    });

    it('should attach change event listeners to both radio buttons', () => {
      initModeSelector();

      const recordSheetRadio = document.getElementById('recordSheet');
      const monumentPhotoRadio = document.getElementById('monumentPhoto');

      // Both should have event listeners (we test this by triggering change events)
      const recordSheetEvent = new Event('change', { bubbles: true });
      const monumentPhotoEvent = new Event('change', { bubbles: true });

      recordSheetRadio.dispatchEvent(recordSheetEvent);
      monumentPhotoRadio.dispatchEvent(monumentPhotoEvent);

      // If event listeners are properly attached, localStorage should be called
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });

  describe('Helper Functions', () => {
    it('should provide a function to get current selection', async () => {
      const module = await import('../../public/js/modules/index/modeSelector.js');
      expect(module.getCurrentUploadMode).toBeDefined();

      localStorageMock.getItem.mockReturnValue('monument_photo');
      const mode = module.getCurrentUploadMode();
      expect(mode).toBe('monument_photo');
      expect(localStorageMock.getItem).toHaveBeenCalledWith('uploadMode');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing container gracefully', () => {
      // Remove the container
      document.body.innerHTML = '';

      // Should not throw an error
      expect(() => {
        initModeSelector();
      }).not.toThrow();
    });

    it('should handle localStorage errors gracefully', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage not available');
      });

      // Should not throw an error and should default to record_sheet
      expect(() => {
        initModeSelector();
      }).not.toThrow();

      const recordSheetRadio = document.getElementById('recordSheet');
      expect(recordSheetRadio.checked).toBe(true);
    });
  });
});
