/**
 * UI component for displaying processing errors
 */
class ErrorDisplay {
  constructor(containerId = 'errorContainer') {
    this.container = document.getElementById(containerId);
    this.errorList = this.container.querySelector('#errorList');
  }

  /**
   * Update error messages display
   * @param {Array<Object>} errors List of errors to display
   */
  updateErrorMessages(errors) {
    if (!Array.isArray(errors) || errors.length === 0) {
      this.container.style.display = 'none';
      return;
    }

    // Clear previous errors
    this.errorList.innerHTML = '';
    
    // Show container
    this.container.style.display = 'block';

    // Add new errors
    errors.forEach(error => {
      const errorItem = document.createElement('div');
      errorItem.className = 'error-item';
      errorItem.innerHTML = `<strong>File:</strong> ${error.fileName} - ${error.errorMessage}`;
      this.errorList.appendChild(errorItem);
    });
  }
}

module.exports = { ErrorDisplay }; 