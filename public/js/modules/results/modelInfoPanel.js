 
// modelInfoPanel.js

let clipboard;

/**
 * Format provider name for display
 * @param {string} provider Raw provider name
 * @returns {string} Formatted provider name
 */
function formatProviderName(provider) {
  if (!provider) return 'Unknown';

  switch(provider.toLowerCase()) {
  case 'openai':
    return 'OpenAI';
  case 'anthropic':
    return 'Anthropic';
  case 'gemini':
    return 'Google Gemini';
  default:
    return provider;
  }
}

/**
 * Format date for display
 * @param {string} dateString ISO date string
 * @returns {string} Formatted date string
 */
import { formatDate } from './date.js';

/**
 * Update the model info panel with new data
 * @param {Object} data Record data containing model and prompt information
 */
function updateModelInfoPanel(data) {
  if (!data) return;

  // Helper function to safely update DOM elements
  const safeUpdate = (elementId, value) => {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = value;
    }
  };

  // Update model information
  safeUpdate('infoProvider', formatProviderName(data.ai_provider));
  // Handle both model_version (memorials) and model_name (burial register entries)
  safeUpdate('infoModelVersion', data.model_version || data.model_name || 'N/A');

  // Update prompt information
  safeUpdate('infoTemplate', data.prompt_template || 'N/A');
  safeUpdate('infoPromptVersion', data.prompt_version || 'N/A');
  safeUpdate('infoProcessedDate', data.processed_date ? formatDate(data.processed_date) : 'N/A');
}

/**
 * Handle successful copy action
 * @param {Object} e Clipboard.js event object
 */
function handleCopySuccess(e) {
  const button = e.trigger;
  const originalContent = button.innerHTML;
  
  // Update button to show success
  button.innerHTML = '<i class="fas fa-check"></i> Copied!';
  
  // Reset button after 2 seconds
  setTimeout(() => {
    button.innerHTML = originalContent;
  }, 2000);
}

/**
 * Handle collapse toggle
 * @param {Event} e Click event object
 */
function handleCollapseToggle(e) {
  e.preventDefault();
  const target = e.currentTarget.getAttribute('data-target');
  $(target).collapse('toggle');
}

/**
 * Initialize the model info panel
 */
function initializeModelInfoPanel() {
  // Initialize clipboard functionality
  if (clipboard) {
    clipboard.destroy();
  }
  
  clipboard = new ClipboardJS('.copy-info');
  clipboard.on('success', handleCopySuccess);
  
  // Initialize collapse functionality
  const collapseButtons = document.querySelectorAll('[data-toggle="collapse"]');
  collapseButtons.forEach(button => {
    button.addEventListener('click', handleCollapseToggle);
  });
}

// Export functions for use by other modules
export { updateModelInfoPanel, initializeModelInfoPanel, formatProviderName };
export { formatDate } from './date.js';

// Make functions available globally for testing
window.updateModelInfoPanel = updateModelInfoPanel;
window.initializeModelInfoPanel = initializeModelInfoPanel;
window.formatProviderName = formatProviderName;
window.formatDate = formatDate;
window.handleCopySuccess = handleCopySuccess;
window.handleCollapseToggle = handleCollapseToggle; 