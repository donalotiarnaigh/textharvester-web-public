/**
 * Mode Selector Module
 * Handles the upload mode selection UI (Record Sheet vs Monument Photo)
 */

/**
 * Initialize the mode selector UI component
 * Creates radio buttons for selecting between record sheet and monument photo modes
 */
export function initModeSelector() {
  const container = document.getElementById('mode-selector-container');
  
  // Handle missing container gracefully
  if (!container) {
    console.warn('Mode selector container not found');
    return;
  }
  
  // Create the mode selector HTML
  container.innerHTML = `
    <div class="card mb-3">
      <div class="card-body py-3">
        <div class="form-group mb-0">
          <label class="form-label">Upload Mode</label>
          <div class="custom-control custom-radio">
            <input type="radio" id="recordSheet" name="uploadMode" value="record_sheet" class="custom-control-input" checked>
            <label class="custom-control-label" for="recordSheet">Record Sheet</label>
          </div>
          <div class="custom-control custom-radio">
            <input type="radio" id="monumentPhoto" name="uploadMode" value="monument_photo" class="custom-control-input">
            <label class="custom-control-label" for="monumentPhoto">Monument Photo</label>
          </div>
        </div>
      </div>
    </div>`;
  
  // Load saved preference from localStorage
  try {
    const savedMode = localStorage.getItem('uploadMode') || 'record_sheet';
    
    // First, uncheck all radios
    const allRadios = document.querySelectorAll('input[name="uploadMode"]');
    allRadios.forEach(radio => {
      radio.checked = false;
    });
    
    // Then check the saved one
    const selectedRadio = document.querySelector(`input[value="${savedMode}"]`);
    if (selectedRadio) {
      selectedRadio.checked = true;
    } else {
      // Fallback to record_sheet if saved mode is invalid
      const recordSheetRadio = document.getElementById('recordSheet');
      if (recordSheetRadio) {
        recordSheetRadio.checked = true;
      }
    }
  } catch (error) {
    console.warn('Failed to load upload mode from localStorage:', error);
    // Default to record_sheet if localStorage fails
    const recordSheetRadio = document.getElementById('recordSheet');
    if (recordSheetRadio) {
      recordSheetRadio.checked = true;
    }
  }
  
  // Add event listeners to save selection changes
  const radioButtons = document.querySelectorAll('input[name="uploadMode"]');
  radioButtons.forEach(radio => {
    // Add both change and click event listeners for comprehensive coverage
    const saveSelection = (e) => {
      try {
        localStorage.setItem('uploadMode', e.target.value);
      } catch (error) {
        console.warn('Failed to save upload mode to localStorage:', error);
      }
    };
    
    radio.addEventListener('change', saveSelection);
    radio.addEventListener('click', saveSelection);
  });
}

/**
 * Get the current upload mode selection
 * @returns {string} The current upload mode ('record_sheet' or 'monument_photo')
 */
export function getCurrentUploadMode() {
  try {
    return localStorage.getItem('uploadMode') || 'record_sheet';
  } catch (error) {
    console.warn('Failed to get upload mode from localStorage:', error);
    return 'record_sheet';
  }
}
