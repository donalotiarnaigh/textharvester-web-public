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

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true
});

// Mock getSelectedModel since we're only testing mode selector integration
jest.mock('../../public/js/modules/index/modelSelection.js', () => ({
  getSelectedModel: jest.fn().mockReturnValue('openai')
}));

describe('Mode Selector - File Upload Integration', () => {
  let getCurrentUploadMode;
  let initModeSelector;

  beforeAll(async () => {
    // Import modules
    const modeSelectorModule = await import('../../public/js/modules/index/modeSelector.js');
    getCurrentUploadMode = modeSelectorModule.getCurrentUploadMode;
    initModeSelector = modeSelectorModule.initModeSelector;
  });

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    
    // Create container
    const container = document.createElement('div');
    container.id = 'mode-selector-container';
    document.body.appendChild(container);
    
    // Reset mocks
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
  });

  describe('getCurrentUploadMode function', () => {
    it('should return record_sheet by default', () => {
      localStorageMock.getItem.mockReturnValue(null);
      
      const mode = getCurrentUploadMode();
      expect(mode).toBe('record_sheet');
      expect(localStorageMock.getItem).toHaveBeenCalledWith('uploadMode');
    });

    it('should return saved mode from localStorage', () => {
      localStorageMock.getItem.mockReturnValue('monument_photo');
      
      const mode = getCurrentUploadMode();
      expect(mode).toBe('monument_photo');
      expect(localStorageMock.getItem).toHaveBeenCalledWith('uploadMode');
    });

    it('should handle localStorage errors gracefully', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage not available');
      });
      
      const mode = getCurrentUploadMode();
      expect(mode).toBe('record_sheet'); // Should fallback to default
    });
  });

  describe('Form data integration', () => {
    it('should provide correct source_type value for form submission', () => {
      // Test record_sheet mode
      localStorageMock.getItem.mockReturnValue('record_sheet');
      initModeSelector();
      
      let mode = getCurrentUploadMode();
      expect(mode).toBe('record_sheet');
      
      // Test monument_photo mode
      localStorageMock.getItem.mockReturnValue('monument_photo');
      
      mode = getCurrentUploadMode();
      expect(mode).toBe('monument_photo');
    });

    it('should update mode when UI selection changes', () => {
      localStorageMock.getItem.mockReturnValue(null);
      initModeSelector();
      
      const monumentPhotoRadio = document.getElementById('monumentPhoto');
      
      // Initially should be record_sheet
      let mode = getCurrentUploadMode();
      expect(mode).toBe('record_sheet');
      
      // Change selection
      monumentPhotoRadio.click();
      
      // Verify localStorage was updated
      expect(localStorageMock.setItem).toHaveBeenCalledWith('uploadMode', 'monument_photo');
      
      // Mock the new value for next call
      localStorageMock.getItem.mockReturnValue('monument_photo');
      
      mode = getCurrentUploadMode();
      expect(mode).toBe('monument_photo');
    });
  });

  describe('UI State Synchronization', () => {
    it('should synchronize UI state with getCurrentUploadMode', () => {
      // Start with monument_photo selected
      localStorageMock.getItem.mockReturnValue('monument_photo');
      initModeSelector();
      
      const recordSheetRadio = document.getElementById('recordSheet');
      const monumentPhotoRadio = document.getElementById('monumentPhoto');
      
      // UI should reflect the saved state
      expect(recordSheetRadio.checked).toBe(false);
      expect(monumentPhotoRadio.checked).toBe(true);
      
      // Function should return the same value
      const mode = getCurrentUploadMode();
      expect(mode).toBe('monument_photo');
    });

    it('should update function result when UI changes', () => {
      localStorageMock.getItem.mockReturnValue('record_sheet');
      initModeSelector();
      
      const monumentPhotoRadio = document.getElementById('monumentPhoto');
      
      // Change UI selection
      monumentPhotoRadio.click();
      
      // Verify localStorage save was called
      expect(localStorageMock.setItem).toHaveBeenCalledWith('uploadMode', 'monument_photo');
      
      // Mock the updated value
      localStorageMock.getItem.mockReturnValue('monument_photo');
      
      // Function should now return the new value
      const mode = getCurrentUploadMode();
      expect(mode).toBe('monument_photo');
    });
  });
});
