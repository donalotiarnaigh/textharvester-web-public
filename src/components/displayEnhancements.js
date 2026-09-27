/**
 * Displays prompt metadata in a modal
 */
class PromptMetadataDisplay {
  constructor(metadata = {}) {
    this.metadata = metadata;
  }

  render() {
    const {
      templateName = 'Not specified',
      version = 'Not specified',
      provider = 'Not specified',
      modelVersion = 'Not specified'
    } = this.metadata;

    return `
      <div class="prompt-metadata-modal">
        <div class="metadata-row">
          <span class="label">Template:</span>
          <span class="value">${templateName}</span>
        </div>
        <div class="metadata-row">
          <span class="label">Version:</span>
          <span class="value">${version}</span>
        </div>
        <div class="metadata-row">
          <span class="label">Provider:</span>
          <span class="value">${provider}</span>
        </div>
        <div class="metadata-row">
          <span class="label">Model:</span>
          <span class="value">${modelVersion}</span>
        </div>
      </div>
    `;
  }
}

/**
 * Displays type information for fields
 */
class TypeInfoDisplay {
  constructor(typeInfo = {}) {
    this.typeInfo = typeInfo;
  }

  renderField(name, info, path = '') {
    const currentPath = path ? `${path}.${name}` : name;
    const requiredClass = info.required ? 'required' : 'optional';
    const requiredText = info.required ? 'required' : 'optional';

    if (info.type === 'object' && info.properties) {
      return `
        <div class="type-info-field ${requiredClass}">
          <span class="field-name">${name} (${requiredText})</span>
          <div class="nested-type-info">
            ${Object.entries(info.properties)
    .map(([key, value]) => this.renderField(key, value, currentPath))
    .join('')}
          </div>
        </div>
      `;
    }

    return `
      <div class="type-info-field ${requiredClass}">
        <span class="field-name">${name} (${requiredText})</span>
        <span class="field-type">Type: ${info.type}</span>
      </div>
    `;
  }

  render() {
    return `
      <div class="type-info-container">
        ${Object.entries(this.typeInfo)
    .map(([name, info]) => this.renderField(name, info))
    .join('')}
      </div>
    `;
  }
}

/**
 * Displays validation status for fields
 */
class ValidationStatusDisplay {
  constructor() {
    this.statuses = new Map();
  }

  render() {
    return `
      <div class="validation-status-container">
        ${Array.from(this.statuses.values()).join('')}
      </div>
    `;
  }

  renderStatus({ isValid, field, error = '' }) {
    const statusClass = isValid ? 'success' : 'error';
    const statusSymbol = isValid ? '✓' : '✗';
    const statusMessage = isValid ? 'Valid' : error;

    return `
      <div class="validation-status ${statusClass}" data-field="${field}">
        <span class="status-symbol">${statusSymbol}</span>
        <span class="status-message">${statusMessage}</span>
      </div>
    `;
  }

  updateStatus(container, status) {
    const statusHtml = this.renderStatus(status);
    this.statuses.set(status.field, statusHtml);
    
    const statusContainer = container.querySelector('.validation-status-container');
    if (statusContainer) {
      statusContainer.innerHTML = Array.from(this.statuses.values()).join('');
    }
  }
}

module.exports = {
  PromptMetadataDisplay,
  TypeInfoDisplay,
  ValidationStatusDisplay
}; 