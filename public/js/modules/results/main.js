
// main.js

/**
 * Main module for the results page with expandable rows
 */

import { formatDateTime as formatDate } from './date.js';
import { tableEnhancements } from './tableEnhancements.js';
import { updateModelInfoPanel } from './modelInfoPanel.js';
import { calculateSummaryStats, getUniqueSections, filterMemorials } from './resultsLogic.js';
import { enterEditMode, exitEditMode, handleSave } from './inlineEdit.js';
import { initProjectFilter, getProjectIdFromUrl } from './projectFilter.js';

// Error handling utilities
const ErrorTypes = {
  NETWORK: 'network',
  SERVER: 'server',
  TIMEOUT: 'timeout',
  PARSE: 'parse',
  VALIDATION: 'validation',
  UNKNOWN: 'unknown'
};

const ErrorMessages = {
  [ErrorTypes.NETWORK]: {
    title: 'Connection Error',
    message: 'Unable to connect to the server. Please check your internet connection and try again.',
    userAction: 'Check your internet connection and click "Retry" to try again.',
    canRetry: true
  },
  [ErrorTypes.SERVER]: {
    title: 'Server Error',
    message: 'The server encountered an error while processing your request.',
    userAction: 'This might be a temporary issue. Click "Retry" to try again, or contact support if the problem persists.',
    canRetry: true
  },
  [ErrorTypes.TIMEOUT]: {
    title: 'Request Timeout',
    message: 'The request took too long to complete.',
    userAction: 'This might be due to slow internet or server load. Click "Retry" to try again.',
    canRetry: true
  },
  [ErrorTypes.PARSE]: {
    title: 'Data Error',
    message: 'Unable to process the received data.',
    userAction: 'This might be a temporary issue with the data. Click "Retry" to try again.',
    canRetry: true
  },
  [ErrorTypes.VALIDATION]: {
    title: 'Data Validation Error',
    message: 'The received data contains validation errors.',
    userAction: 'Please contact support if this problem persists.',
    canRetry: false
  },
  [ErrorTypes.UNKNOWN]: {
    title: 'Unexpected Error',
    message: 'An unexpected error occurred.',
    userAction: 'Please try refreshing the page. If the problem persists, contact support.',
    canRetry: true
  }
};

// Error state management
let currentError = null;
let retryCount = 0;
const MAX_RETRY_ATTEMPTS = 3;

// Data state management
let allMemorials = [];


// Source Type utility functions
function formatSourceType(sourceType) {
  if (!sourceType) return 'Unknown';

  const typeMap = {
    'record_sheet': 'Record Sheet',
    'monument_photo': 'Monument Photo',
    'grave_record_card': 'Grave Record Card'
  };

  return typeMap[sourceType] || sourceType.charAt(0).toUpperCase() + sourceType.slice(1);
}

function getSourceTypeBadgeClass(sourceType) {
  const classMap = {
    'record_sheet': 'badge-primary',
    'monument_photo': 'badge-success',
    'grave_record_card': 'badge-warning'
  };

  return classMap[sourceType] || 'badge-secondary';
}

/**
 * Format site code for display
 * Capitalizes the first letter and handles null/undefined/empty values
 * @param {string} siteCode - Site code to format
 * @returns {string} Formatted site code or "N/A" for empty values
 */
function formatSiteCode(siteCode) {
  if (!siteCode || siteCode === '') return 'N/A';

  // Convert to string, lowercase, then capitalize first letter
  const code = String(siteCode).toLowerCase();
  return code.charAt(0).toUpperCase() + code.slice(1);
}

// HTML Sanitization utilities
const SanitizeUtils = {
  /**
   * Sanitize text content for safe HTML insertion
   * @param {string} text - Text to sanitize
   * @returns {string} Sanitized text safe for HTML content
   */
  sanitizeText(text) {
    if (text == null) return '';
    const stringText = String(text);

    // Escape HTML special characters
    return stringText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  },

  /**
   * Sanitize text for use in HTML attributes
   * @param {string} text - Text to sanitize
   * @returns {string} Sanitized text safe for HTML attributes
   */
  sanitizeAttribute(text) {
    if (text == null) return '';
    const stringText = String(text);

    // For attributes, we need to escape quotes and other special characters
    return stringText
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  /**
   * Sanitize numeric values
   * @param {number|string} value - Value to sanitize
   * @returns {string} Sanitized numeric string
   */
  sanitizeNumber(value) {
    if (value == null || value === '') return 'N/A';
    const num = parseFloat(value);
    return isNaN(num) ? 'N/A' : String(num);
  },

  /**
   * Sanitize memorial number (can be alphanumeric)
   * @param {string|number} value - Memorial number to sanitize
   * @returns {string} Sanitized memorial number
   */
  sanitizeMemorialNumber(value) {
    if (value == null || value === '') return 'N/A';
    // Memorial numbers can be alphanumeric, so treat as text but sanitize
    return this.sanitizeText(String(value));
  },

  /**
   * Sanitize memorial data object for safe HTML insertion
   * @param {Object} memorial - Memorial data object
   * @returns {Object} Sanitized memorial data
   */
  sanitizeMemorial(memorial) {
    if (!memorial || typeof memorial !== 'object') return {};

    return {
      memorial_number: this.sanitizeMemorialNumber(memorial.memorial_number),
      first_name: this.sanitizeText(memorial.first_name),
      last_name: this.sanitizeText(memorial.last_name),
      year_of_death: this.sanitizeNumber(memorial.year_of_death),
      inscription: this.sanitizeText(memorial.inscription),
      ai_provider: this.sanitizeText(memorial.ai_provider),
      prompt_template: this.sanitizeText(memorial.prompt_template),
      prompt_version: this.sanitizeText(memorial.prompt_version),
      input_tokens: this.sanitizeNumber(memorial.input_tokens),
      output_tokens: this.sanitizeNumber(memorial.output_tokens),
      estimated_cost_usd: memorial.estimated_cost_usd != null ? parseFloat(memorial.estimated_cost_usd) : null,
      fileName: this.sanitizeAttribute(memorial.fileName),
      processed_date: memorial.processed_date, // Date objects are safe as they're processed by formatDate
      source_type: memorial.source_type, // Keep original value for logic, will be sanitized in display functions
      site_code: memorial.site_code, // Keep original for formatting in display
      processing_id: this.sanitizeText(memorial.processing_id)
    };
  },

  /**
   * Sanitize grave card data object for safe HTML insertion
   * @param {Object} card - Grave card data object
   * @returns {Object} Sanitized grave card data
   */
  sanitizeGraveCard(card) {
    if (!card || typeof card !== 'object') return {};

    // Helper to safely parse JSON field if needed
    let data = {};
    try {
      if (typeof card.data_json === 'string') {
        data = JSON.parse(card.data_json);
      } else if (typeof card.data_json === 'object') {
        data = card.data_json;
      }
    } catch (e) {
      console.warn('Failed to parse grave card JSON', e);
    }

    // Merge top-level fields with parsed JSON data, prioritizing top-level
    // The specific fields we need for display
    return {
      id: card.id,
      fileName: this.sanitizeAttribute(card.file_name),
      section: this.sanitizeText(card.section),
      grave_number: this.sanitizeText(card.grave_number),
      processed_date: card.processed_date,
      ai_provider: this.sanitizeText(card.ai_provider),
      source_type: 'grave_record_card', // Explicitly set for this type,
      processing_id: this.sanitizeText(card.processing_id || data.processing_id),

      // Fields from the JSON blob
      // Fields from the JSON blob - using safe optional chaining
      grave_location: this.sanitizeText((data.location ?
        `Section: ${data.location.section}, Grave: ${data.location.grave_number}` : '')),
      grave_dimensions: this.sanitizeText((data.grave && data.grave.dimensions ?
        (data.grave.dimensions.raw_text || '') : '')),
      grave_status: this.sanitizeText((data.grave ? data.grave.status : '')),
      inscription: this.sanitizeText((data.inscription ? data.inscription.text : '')),
      // Interments list (will need specific handling in detail view)
      interments: Array.isArray(data.interments) ? data.interments : [],
      burial_count: Array.isArray(data.interments) ? data.interments.length : 0
    };
  },

  /**
   * Create safe HTML content from memorial data
   * @param {Object} memorial - Memorial data object
   * @param {number} colSpan - Column span for the table cell
   * @param {string} uniqueId - Unique identifier for this memorial
   * @returns {string} Safe HTML string
   */
  createSafeDetailHTML(memorial, colSpan, uniqueId) {
    const safe = this.sanitizeMemorial(memorial);

    return `
    <td colspan="${colSpan}" data-record-json="${this.sanitizeAttribute(JSON.stringify(memorial))}">
      <div class="detail-content p-3">
        <div class="row">
          <div class="col-12">
            <h5 class="mb-3">
              ${safe.memorial_number} - ${safe.first_name} ${safe.last_name}
            </h5>
          </div>
        </div>

        <div class="card mb-3">
          <div class="card-header bg-light">
            <strong>Inscription</strong>
          </div>
          <div class="card-body">
            <p class="inscription-text">${safe.inscription || 'No inscription available'}</p>
          </div>
        </div>

        <div class="row">
          <div class="col-md-6">
            <div class="detail-info">
              <h6>Processing Information</h6>
              <dl class="row">
                <dt class="col-sm-4">Source Type:</dt>
                <dd class="col-sm-8">
                  <span class="badge ${getSourceTypeBadgeClass(safe.source_type)}">
                    ${formatSourceType(safe.source_type)}
                  </span>
                </dd>

                <dt class="col-sm-4">Model:</dt>
                <dd class="col-sm-8">${safe.ai_provider || 'N/A'}</dd>

                <dt class="col-sm-4">Input Tokens:</dt>
                <dd class="col-sm-8">${safe.input_tokens !== 'N/A' ? safe.input_tokens : 'N/A'}</dd>

                <dt class="col-sm-4">Output Tokens:</dt>
                <dd class="col-sm-8">${safe.output_tokens !== 'N/A' ? safe.output_tokens : 'N/A'}</dd>

                <dt class="col-sm-4">Cost (USD):</dt>
                <dd class="col-sm-8">${safe.estimated_cost_usd != null ? '$' + safe.estimated_cost_usd.toFixed(4) : 'N/A'}</dd>

                <dt class="col-sm-4">Template:</dt>
                <dd class="col-sm-8">${safe.prompt_template || 'N/A'}</dd>

                <dt class="col-sm-4">Version:</dt>
                <dd class="col-sm-8">${safe.prompt_version || 'N/A'}</dd>

                <dt class="col-sm-4">Source File:</dt>
                <dd class="col-sm-8">${safe.fileName || 'N/A'}</dd>

                <dt class="col-sm-4">Processing ID:</dt>
                <dd class="col-sm-8"><code>${safe.processing_id || 'N/A'}</code></dd>
              </dl>
            </div>
          </div>

          <div class="col-md-6">
            <div class="detail-info">
              <h6>Additional Details</h6>
              <dl class="row">
                <dt class="col-sm-4">Processed:</dt>
                <dd class="col-sm-8">${formatDate(memorial.processed_date)}</dd>

                <dt class="col-sm-4">Year of Death:</dt>
                <dd class="col-sm-8">${safe.year_of_death}</dd>
              </dl>
            </div>
          </div>
        </div>

        ${memorial.confidence_scores ? (() => {
    let scores;
    try {
      scores = typeof memorial.confidence_scores === 'string'
        ? JSON.parse(memorial.confidence_scores)
        : memorial.confidence_scores;
    } catch (e) {
      scores = null;
    }
    if (!scores) return '';
    const rows = Object.entries(scores).map(([field, score]) => {
      if (score === null || score === undefined) {
        return `<dt class="col-sm-5">${field}:</dt><dd class="col-sm-7 confidence-unknown">N/A</dd>`;
      }
      const pct = Math.round(score * 100);
      const cls = score >= 0.90 ? 'confidence-high' : score >= 0.70 ? 'confidence-medium' : 'confidence-low';
      return `<dt class="col-sm-5">${field}:</dt><dd class="col-sm-7 ${cls}">${pct}%</dd>`;
    }).join('');
    const coverageInfo = memorial.confidence_coverage !== null && memorial.confidence_coverage !== undefined
      ? `<p class="text-muted small mt-2">Coverage: ${Math.round(memorial.confidence_coverage * 100)}% of fields have confidence scores</p>`
      : '';
    return `
        <div class="card mb-3">
          <div class="card-header bg-light">
            <strong>Confidence Scores</strong>
            ${memorial.needs_review ? '<span class="badge badge-warning ml-2">Needs Review</span>' : ''}
          </div>
          <div class="card-body">
            <dl class="row mb-0">${rows}</dl>
            ${coverageInfo}
          </div>
        </div>`;
  })() : ''}

        <div class="mt-3">
          <button class="btn btn-sm btn-secondary close-detail" data-memorial="${uniqueId}">
            <i class="fas fa-chevron-up"></i> Close Details
          </button>
          <button class="btn btn-sm btn-info copy-inscription ml-2" data-inscription="${safe.inscription.replace(/"/g, '&quot;')}">
            <i class="fas fa-copy"></i> Copy Inscription
          </button>
          <button class="btn btn-sm btn-primary edit-record ml-2" data-record-id="${memorial.id}" data-record-type="memorial">
            <i class="fas fa-edit"></i> Edit
          </button>
          ${memorial.needs_review ? `<button class="btn btn-sm btn-warning mark-reviewed ml-2" data-record-id="${memorial.id}" data-record-type="memorial">
            <i class="fas fa-check"></i> Mark as Reviewed
          </button>` : ''}
        </div>
      </div>
    </td>
    `;
  },

  /**
   * Create safe HTML for main table row
   * @param {Object} memorial - Memorial data object
   * @param {string} uniqueId - Unique identifier for this memorial
   * @returns {string} Safe HTML string for main table row
   */
  createSafeMainRowHTML(memorial, uniqueId) {
    const safe = this.sanitizeMemorial(memorial);

    return `
      <td class="text-center">
        <button class="btn btn-sm btn-outline-secondary expand-toggle"
          data-toggle-memorial="${uniqueId}"
          title="Click to expand/collapse details">
          <i class="fas fa-chevron-down"></i>
        </button>
      </td>
      <td>${safe.memorial_number}</td>
      <td>${safe.first_name} ${safe.last_name}</td>
      <td>${safe.year_of_death}</td>
      <td class="source-type-cell" data-source-type="${safe.source_type || 'unknown'}">
        <span class="badge ${getSourceTypeBadgeClass(safe.source_type)}">
          ${formatSourceType(safe.source_type)}
        </span>
        ${memorial.needs_review ? '<span class="badge badge-warning ml-1">Needs Review</span>' : ''}
      </td>
      <td>${formatSiteCode(safe.site_code)}</td>
      <td>${safe.ai_provider || 'N/A'}</td>
      <td>${safe.prompt_template || 'N/A'}</td>
      <td>${safe.prompt_version || 'N/A'}</td>
      <td>${safe.estimated_cost_usd != null ? '$' + safe.estimated_cost_usd.toFixed(4) : 'N/A'}</td>
      <td>${formatDate(memorial.processed_date)}</td>
    `;
  },

  /**
   * Create safe HTML for grave card main table row
   * @param {Object} card - Grave card data object
   * @param {string} uniqueId - Unique identifier for this card
   * @returns {string} Safe HTML string for main table row
   */
  createGraveCardMainRowHTML(card, uniqueId) {
    const safe = this.sanitizeGraveCard(card);

    return `
      <td class="text-center">
        <button class="btn btn-sm btn-outline-secondary expand-toggle"
          data-toggle-memorial="${uniqueId}"
          title="Click to expand/collapse details">
          <i class="fas fa-chevron-down"></i>
        </button>
      </td>
      <td>${safe.fileName}</td>
      <td>${safe.section || 'N/A'}</td>
      <td>${safe.grave_number || 'N/A'}</td>
      <td>${safe.burial_count}</td>
      <td class="source-type-cell" data-source-type="grave_record_card">
        <span class="badge ${getSourceTypeBadgeClass('grave_record_card')}">
          ${formatSourceType('grave_record_card')}
        </span>
      </td>
      <td>${safe.ai_provider || 'N/A'}</td>
      <td>${formatDate(card.processed_date)}</td>
    `;
  },

  /**
   * Create safe HTML content for grave card detail row
   * @param {Object} card - Grave card data object
   * @param {number} colSpan - Column span
   * @param {string} uniqueId - Unique identifier
   * @returns {string} Safe HTML string
   */
  createGraveCardDetailHTML(card, colSpan, uniqueId) {
    const safe = this.sanitizeGraveCard(card);

    // Build Interments Table
    let intermentsHtml = '<p class="text-muted">No interments recorded.</p>';
    if (safe.interments.length > 0) {
      const rows = safe.interments.map((burial, idx) => {
        // Handle name object or string
        const name = burial.name && typeof burial.name === 'object' ?
          (burial.name.full_name || `${burial.name.given_names || ''} ${burial.name.surname || ''}`) :
          (burial.name || 'N/A');

        // Handle date object or string (prefer raw_text for display)
        const date = burial.date_of_burial && typeof burial.date_of_burial === 'object' ?
          (burial.date_of_burial.raw_text || burial.date_of_burial.iso || 'N/A') :
          (burial.date_of_death && typeof burial.date_of_death === 'object' ?
            (burial.date_of_death.raw_text || burial.date_of_death.iso || 'N/A') : 'N/A');

        // Handle age (might be part of name block or separate in some schemas, assumie top level 'age_at_death' based on curl output)
        const age = burial.age_at_death || 'N/A';
        const details = burial.notes || '';

        return `
        <tr>
          <td>${idx + 1}</td>
          <td>${this.sanitizeText(name)}</td>
          <td>${this.sanitizeText(date)}</td>
          <td>${this.sanitizeText(age)}</td>
          <td>${this.sanitizeText(details)}</td>
        </tr>
      `;
      }).join('');

      intermentsHtml = `
        <div class="table-responsive">
          <table class="table table-sm table-bordered">
            <thead class="thead-light">
              <tr>
                <th style="width: 5%">#</th>
                <th style="width: 30%">Name</th>
                <th style="width: 20%">Date</th>
                <th style="width: 15%">Age</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }

    return `
    <td colspan="${colSpan}" data-record-json="${this.sanitizeAttribute(JSON.stringify(card))}">
      <div class="detail-content p-3">
        <div class="row">
          <div class="col-12">
            <h5 class="mb-3">
              Grave ${safe.section || '?'}-${safe.grave_number || '?'} <small class="text-muted">(${safe.burial_count} burials)</small>
            </h5>
          </div>
        </div>

        <div class="row mb-3">
          <div class="col-md-6">
            <div class="card h-100">
              <div class="card-header bg-light"><strong>Grave Details</strong></div>
              <div class="card-body">
                <dl class="row mb-0">
                  <dt class="col-sm-4">Section:</dt> <dd class="col-sm-8">${safe.section || 'N/A'}</dd>
                  <dt class="col-sm-4">Number:</dt> <dd class="col-sm-8">${safe.grave_number || 'N/A'}</dd>
                  <dt class="col-sm-4">Status:</dt> <dd class="col-sm-8">${safe.grave_status || 'N/A'}</dd>
                  <dt class="col-sm-4">Dimensions:</dt> <dd class="col-sm-8">${safe.grave_dimensions || 'N/A'}</dd>
                  <dt class="col-sm-4">Location:</dt> <dd class="col-sm-8">${safe.grave_location || 'N/A'}</dd>
                </dl>
              </div>
            </div>
          </div>
          <div class="col-md-6">
             <div class="card h-100">
              <div class="card-header bg-light"><strong>Inscription</strong></div>
              <div class="card-body">
                <p class="inscription-text" style="white-space: pre-wrap;">${safe.inscription || 'No inscription recorded.'}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="card mb-3">
          <div class="card-header bg-light"><strong>Interments</strong></div>
          <div class="card-body p-0">
            ${intermentsHtml}
          </div>
        </div>

        <div class="row">
          <div class="col-md-12">
            <div class="detail-info">
              <h6>Processing Information</h6>
              <dl class="row">
                <dt class="col-sm-2">Source:</dt> <dd class="col-sm-4">${safe.fileName}</dd>
                <dt class="col-sm-2">Model:</dt> <dd class="col-sm-4">${safe.ai_provider}</dd>
                <dt class="col-sm-2">Processed:</dt> <dd class="col-sm-4">${formatDate(safe.processed_date)}</dd>
                <dt class="col-sm-2">Processing ID:</dt> <dd class="col-sm-4"><code>${safe.processing_id || 'N/A'}</code></dd>
              </dl>
            </div>
          </div>
        </div>

        <div class="mt-3">
          <button class="btn btn-sm btn-secondary close-detail" data-memorial="${uniqueId}">
            <i class="fas fa-chevron-up"></i> Close Details
          </button>
          <button class="btn btn-sm btn-primary edit-record ml-2" data-record-id="${card.id}" data-record-type="grave-card">
            <i class="fas fa-edit"></i> Edit
          </button>
          ${card.needs_review ? `<button class="btn btn-sm btn-warning mark-reviewed ml-2" data-record-id="${card.id}" data-record-type="grave-card">
            <i class="fas fa-check"></i> Mark as Reviewed
          </button>` : ''}
        </div>
      </div>
    </td>
    `;
  }
};

// Track expanded rows
const expandedRows = new Set();

// Error handling functions
function classifyError(error) {
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return ErrorTypes.NETWORK;
  }

  if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
    return ErrorTypes.PARSE;
  }

  if (error.message && error.message.includes('timeout')) {
    return ErrorTypes.TIMEOUT;
  }

  if (error.status >= 500) {
    return ErrorTypes.SERVER;
  }

  if (error.status >= 400 && error.status < 500) {
    return ErrorTypes.VALIDATION;
  }

  return ErrorTypes.UNKNOWN;
}

function showErrorState(error, canRetry = true) {
  const tableBody = document.getElementById('resultsTableBody');
  const loadingState = document.getElementById('loadingState');
  const emptyState = document.getElementById('emptyState');

  // Hide loading and empty states
  if (loadingState) loadingState.style.display = 'none';
  if (emptyState) emptyState.classList.add('d-none');

  if (!tableBody) return;

  const errorType = classifyError(error);
  const errorInfo = ErrorMessages[errorType];

  const retryButton = canRetry && retryCount < MAX_RETRY_ATTEMPTS ?
    `<button class="btn btn-primary btn-sm" onclick="retryLoadResults()">Retry (${MAX_RETRY_ATTEMPTS - retryCount} attempts left)</button>` : '';

  tableBody.innerHTML = `
    <tr>
      <td colspan="11" class="text-center py-5">
        <div class="alert alert-danger" role="alert">
          <h5 class="alert-heading">
            <i class="fas fa-exclamation-triangle"></i> ${errorInfo.title}
          </h5>
          <p class="mb-3">${errorInfo.message}</p>
          <p class="mb-3 text-muted">${errorInfo.userAction}</p>
          <div class="d-flex gap-2 justify-content-center">
            ${retryButton}
            <button class="btn btn-secondary btn-sm" onclick="window.location.reload()">Refresh Page</button>
          </div>
          ${retryCount > 0 ? `<small class="text-muted d-block mt-2">Retry attempts: ${retryCount}/${MAX_RETRY_ATTEMPTS}</small>` : ''}
        </div>
      </td>
    </tr>
  `;

  currentError = { error, errorType, canRetry };
}

function retryLoadResults() {
  if (currentError && retryCount < MAX_RETRY_ATTEMPTS) {
    retryCount++;
    loadResults();
  }
}

// Function to display error summary with XSS protection
function displayErrorSummary(errors) {
  const errorSummary = document.getElementById('errorSummary');
  const errorList = document.getElementById('errorList');

  // Clear previous content
  errorList.innerHTML = '';

  // Hide if no errors
  if (!errors || errors.length === 0) {
    errorSummary.style.display = 'none';
    return;
  }

  // Show error summary
  errorSummary.style.display = 'block';

  // Add each error to the list with sanitization
  errors.forEach(error => {
    const listItem = document.createElement('li');
    // Use warning style for conflicts (resolved), error style for actual errors
    const itemClass = error.errorType === 'page_number_conflict'
      ? 'list-group-item list-group-item-warning'
      : 'list-group-item list-group-item-danger';
    listItem.className = itemClass;

    // Sanitize error data to prevent XSS
    const safeFileName = SanitizeUtils.sanitizeText(error.fileName || 'Unknown file');
    const safeErrorMessage = SanitizeUtils.sanitizeText(error.errorMessage || 'An unknown error occurred');
    const safeProvider = SanitizeUtils.sanitizeText(error.ai_provider);

    let message = `<strong>${safeFileName}</strong>: `;

    // Format message based on error type (using sanitized data)
    switch (error.errorType) {
    case 'empty_sheet':
      message += 'Empty or unreadable sheet detected.';
      break;
    case 'processing_failed':
      message += 'Processing failed after multiple attempts.';
      break;
    case 'page_number_conflict':
      message += safeErrorMessage;
      break;
    default:
      message += safeErrorMessage;
    }

    // Add model info if available (sanitized)
    if (error.ai_provider) {
      message += ` <span class="text-muted">(${safeProvider} model)</span> `;
    }

    listItem.innerHTML = message;
    errorList.appendChild(listItem);
  });
}

// Function to create expandable detail row with XSS protection
function createDetailRow(memorial, colSpan, uniqueId) {
  const detailRow = document.createElement('tr');
  detailRow.className = 'detail-row';
  detailRow.style.display = 'none';

  // Use provided ID or fallback (though provided ID should always be used if called from displayMemorials)
  const id = uniqueId || memorial.id || `memorial-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  detailRow.id = `detail-${id}`;
  detailRow.setAttribute('data-memorial-id', id);

  // Sanitize memorial data to prevent XSS
  let htmlContent;

  if (memorial.source_type === 'grave_record_card') {
    // For grave record cards, use the specific detail HTML function if available, otherwise fallback
    htmlContent = SanitizeUtils.createGraveCardDetailHTML ?
      SanitizeUtils.createGraveCardDetailHTML(memorial, colSpan, id) :
      SanitizeUtils.createSafeDetailHTML(memorial, colSpan, id);
  } else {
    // For other memorial types, use the standard safe detail HTML function
    htmlContent = SanitizeUtils.createSafeDetailHTML(memorial, colSpan, id);
  }
  detailRow.innerHTML = htmlContent;

  return detailRow;
}

// Function to toggle row expansion
function toggleRow(memorialId) {
  const detailRow = document.getElementById(`detail-${memorialId}`);
  const toggleBtn = document.querySelector(`[data-toggle-memorial="${memorialId}"]`);

  if (!detailRow) return;

  if (expandedRows.has(memorialId)) {
    // Collapse the row
    detailRow.style.display = 'none';
    expandedRows.delete(memorialId);

    // Update toggle button
    if (toggleBtn) {
      toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
      toggleBtn.classList.remove('btn-secondary');
      toggleBtn.classList.add('btn-outline-secondary');
    }

    // Remove highlight from parent row
    const parentRow = detailRow.previousElementSibling;
    if (parentRow) {
      parentRow.classList.remove('table-active');
    }
  } else {
    // Expand the row
    detailRow.style.display = 'table-row';
    expandedRows.add(memorialId);

    // Update toggle button
    if (toggleBtn) {
      toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
      toggleBtn.classList.remove('btn-outline-secondary');
      toggleBtn.classList.add('btn-secondary');
    }

    // Add highlight to parent row
    const parentRow = detailRow.previousElementSibling;
    if (parentRow) {
      parentRow.classList.add('table-active');
    }

    // Smooth scroll to ensure detail is visible
    setTimeout(() => {
      detailRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  }
}

// Function to display memorial data with expandable rows
function displayMemorials(memorials) {
  const tableBody = document.getElementById('resultsTableBody');
  const emptyState = document.getElementById('emptyState');

  // Clear existing content and reset expanded rows
  tableBody.innerHTML = '';
  expandedRows.clear();

  // Check if there are any memorials
  if (!memorials || memorials.length === 0) {
    if (emptyState) {
      emptyState.classList.remove('d-none');
    }
    return;
  }

  // Hide empty state
  if (emptyState) {
    emptyState.classList.add('d-none');
  }

  // Create rows for each memorial
  memorials.forEach(memorial => {
    // Create main row with XSS protection
    const row = document.createElement('tr');
    row.className = 'memorial-row';
    row.style.cursor = 'pointer';

    // Generate unique ID for this memorial (same logic as in createDetailRow)
    const uniqueId = memorial.id || memorial.memorial_id || `memorial-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Store unique ID as data attribute for event delegation
    row.setAttribute('data-memorial-id', uniqueId);

    // Use safe HTML generation to prevent XSS, passing the unique ID
    if (memorial.source_type === 'grave_record_card') {
      row.innerHTML = SanitizeUtils.createGraveCardMainRowHTML(memorial, uniqueId);
    } else {
      row.innerHTML = SanitizeUtils.createSafeMainRowHTML(memorial, uniqueId);
    }

    tableBody.appendChild(row);

    // Create detail row (initially hidden)
    const detailRow = createDetailRow(memorial, 11); // 11 columns total
    tableBody.appendChild(detailRow);

    // Event handling is now done via delegation on tableBody (no individual listeners)
  });

  // Update export button visibility
  updateExportButton(memorials);
}

/**
 * Update the export button visibility and behavior
 * @param {Array} memorials - List of memorials/cards
 */
/**
 * Update the export button visibility and behavior
 * @param {Array} memorials - List of memorials/cards
 */
function updateExportButton() {
  // Functionality removed to prevent duplicate buttons. 
  // Standard export buttons are handled by enableDownloadButtons()
  return;
}

/**
 * Update table headers based on source type
 * @param {string} sourceType - 'burial_register', 'memorial', 'grave_record_card', or 'custom'
 * @param {Array} fields - Optional field definitions for custom schemas
 */
function updateTableHeaders(sourceType, fields = null) {
  const thead = document.querySelector('#resultsTable thead tr');
  if (!thead) return;

  if (sourceType === 'burial_register') {
    thead.innerHTML = `
  <th style="width: 50px;"></th>
      <th class="sortable" data-sort="entry_id">Entry ID <i class="fas fa-sort"></i></th>
      <th class="sortable" data-sort="name_raw">Name <i class="fas fa-sort"></i></th>
      <th class="sortable" data-sort="burial_date_raw">Burial Date <i class="fas fa-sort"></i></th>
      <th class="sortable" data-sort="age_raw">Age <i class="fas fa-sort"></i></th>
      <th class="sortable" data-sort="page_number">Page <i class="fas fa-sort"></i></th>
      <th class="sortable" data-sort="row_index_on_page">Row <i class="fas fa-sort"></i></th>
      <th class="sortable" data-sort="ai_provider">AI Model <i class="fas fa-sort"></i></th>
      <th class="sortable" data-sort="processed_date">Processed <i class="fas fa-sort"></i></th>
`;
  } else if (sourceType === 'grave_record_card') {
    thead.innerHTML = `
  <th style="width: 50px;"></th>
      <th class="sortable" data-sort="file_name">File Name <i class="fas fa-sort"></i></th>
      <th class="sortable" data-sort="section">Section <i class="fas fa-sort"></i></th>
      <th class="sortable" data-sort="grave_number">Grave # <i class="fas fa-sort"></i></th>
      <th class="sortable">Burials</th>
      <th class="sortable" data-sort="source_type">Source Type <i class="fas fa-sort"></i></th>
      <th class="sortable" data-sort="ai_provider">AI Model <i class="fas fa-sort"></i></th>
      <th class="sortable" data-sort="processed_date">Processed <i class="fas fa-sort"></i></th>
`;
  } else if (sourceType === 'custom' && fields && fields.length > 0) {
    // Dynamic headers for custom schemas
    let headerHtml = '<th style="width: 50px;"></th>';

    // Use same priority patterns as createCustomSchemaMainRowHTML
    const priorityPatterns = [
      /^(full_?)?name$/i,
      /^(surname|last_?name|family_?name)$/i,
      /^(christian_?name|first_?name|given_?name)$/i,
      /^age/i,
      /^(year|date)/i,
      /^(relation|relationship)/i,
      /^(occupation|profession)/i,
      /^(sex|gender)$/i,
      /^(location|address|place)/i
    ];

    // Sort fields by priority
    const sortedFields = [...fields].sort((a, b) => {
      const aPriority = priorityPatterns.findIndex(p => p.test(a.name));
      const bPriority = priorityPatterns.findIndex(p => p.test(b.name));
      if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
      if (aPriority !== -1) return -1;
      if (bPriority !== -1) return 1;
      return 0;
    });

    // Display first 5 priority fields as columns
    const displayFields = sortedFields.slice(0, 5);
    displayFields.forEach(field => {
      const fieldName = SanitizeUtils.sanitizeText(field.name);
      const displayName = fieldName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      headerHtml += `<th class="sortable" data-sort="${fieldName}">${displayName} <i class="fas fa-sort"></i></th>`;
    });

    // Always add processed date as last column
    headerHtml += '<th class="sortable" data-sort="processed_date">Processed <i class="fas fa-sort"></i></th>';

    thead.innerHTML = headerHtml;
  } else {
    // Default memorial headers
    thead.innerHTML = `
  <th style="width: 50px;"></th>
      <th class="sortable" data-sort="memorial_number">Memorial # <i class="fas fa-sort"></i></th>
      <th class="sortable" data-sort="name">Name <i class="fas fa-sort"></i></th>
      <th class="sortable" data-sort="year_of_death">Year of Death <i class="fas fa-sort"></i></th>
      <th class="sortable" data-sort="source_type">Source Type <i class="fas fa-sort"></i></th>
      <th class="sortable" data-sort="site_code">Site Code <i class="fas fa-sort"></i></th>
      <th class="sortable" data-sort="ai_provider">AI Model <i class="fas fa-sort"></i></th>
      <th>Prompt Template</th>
      <th>Template Version</th>
      <th class="sortable" data-sort="processed_date">Processed <i class="fas fa-sort"></i></th>
`;
  }
}

/**
 * Sanitize burial register entry data
 * @param {Object} entry - Burial register entry object
 * @returns {Object} Sanitized entry data
 */
function sanitizeBurialRegisterEntry(entry) {
  if (!entry || typeof entry !== 'object') return {};

  return {
    id: entry.id,
    entry_id: SanitizeUtils.sanitizeText(entry.entry_id),
    name_raw: SanitizeUtils.sanitizeText(entry.name_raw),
    burial_date_raw: SanitizeUtils.sanitizeText(entry.burial_date_raw),
    age_raw: SanitizeUtils.sanitizeText(entry.age_raw),
    abode_raw: SanitizeUtils.sanitizeText(entry.abode_raw),
    page_number: SanitizeUtils.sanitizeNumber(entry.page_number),
    row_index_on_page: SanitizeUtils.sanitizeNumber(entry.row_index_on_page),
    entry_no_raw: SanitizeUtils.sanitizeText(entry.entry_no_raw),
    officiant_raw: SanitizeUtils.sanitizeText(entry.officiant_raw),
    marginalia_raw: SanitizeUtils.sanitizeText(entry.marginalia_raw),
    extra_notes_raw: SanitizeUtils.sanitizeText(entry.extra_notes_raw),
    row_ocr_raw: SanitizeUtils.sanitizeText(entry.row_ocr_raw),
    parish_header_raw: SanitizeUtils.sanitizeText(entry.parish_header_raw),
    county_header_raw: SanitizeUtils.sanitizeText(entry.county_header_raw),
    year_header_raw: SanitizeUtils.sanitizeText(entry.year_header_raw),
    uncertainty_flags: entry.uncertainty_flags,
    ai_provider: SanitizeUtils.sanitizeText(entry.ai_provider),
    model_name: SanitizeUtils.sanitizeText(entry.model_name),
    prompt_template: SanitizeUtils.sanitizeText(entry.prompt_template),
    prompt_version: SanitizeUtils.sanitizeText(entry.prompt_version),
    fileName: SanitizeUtils.sanitizeAttribute(entry.fileName || entry.file_name),
    volume_id: SanitizeUtils.sanitizeText(entry.volume_id),
    processed_date: entry.processed_date,
    processing_id: SanitizeUtils.sanitizeText(entry.processing_id)
  };
}

/**
 * Create safe HTML for burial register entry main row
 * @param {Object} entry - Burial register entry object
 * @param {string} uniqueId - Unique identifier for this entry
 * @returns {string} Safe HTML string for main table row
 */
function createBurialRegisterMainRowHTML(entry, uniqueId) {
  const safe = sanitizeBurialRegisterEntry(entry);

  return `
  <td class="text-center">
    <button class="btn btn-sm btn-outline-secondary expand-toggle"
      data-toggle-memorial="${uniqueId}"
      title="Click to expand/collapse details">
      <i class="fas fa-chevron-down"></i>
    </button>
    </td>
    <td>${safe.entry_id || 'N/A'}</td>
    <td>${safe.name_raw || 'N/A'}</td>
    <td>${safe.burial_date_raw || 'N/A'}</td>
    <td>${safe.age_raw || 'N/A'}</td>
    <td>${safe.page_number || 'N/A'}</td>
    <td>${safe.row_index_on_page || 'N/A'}</td>
    <td>${safe.ai_provider || 'N/A'}</td>
    <td>${formatDate(entry.processed_date)}</td>
`;
}

/**
 * Create safe HTML for burial register entry detail row
 * @param {Object} entry - Burial register entry object
 * @param {number} colSpan - Column span for the table cell
 * @param {string} uniqueId - Unique identifier for this entry
 * @returns {string} Safe HTML string
 */
function createBurialRegisterDetailHTML(entry, colSpan, uniqueId) {
  const safe = sanitizeBurialRegisterEntry(entry);

  // Parse uncertainty flags if it's a JSON string
  let uncertaintyFlags = [];
  try {
    if (typeof safe.uncertainty_flags === 'string') {
      uncertaintyFlags = JSON.parse(safe.uncertainty_flags);
    } else if (Array.isArray(safe.uncertainty_flags)) {
      uncertaintyFlags = safe.uncertainty_flags;
    }
  } catch {
    // If parsing fails, leave as empty array
  }

  return `
  <td colspan="${colSpan}" data-record-json="${SanitizeUtils.sanitizeAttribute(JSON.stringify(entry))}">
    <div class="detail-content p-3">
      <div class="row">
        <div class="col-12">
          <h5 class="mb-3">
            ${safe.entry_id || 'N/A'} - ${safe.name_raw || 'N/A'}
          </h5>
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-header bg-light">
          <strong>Entry Details</strong>
        </div>
        <div class="card-body">
          <div class="row">
            <div class="col-md-6">
              <p><strong>Entry Number:</strong> ${safe.entry_no_raw || 'N/A'}</p>
              <p><strong>Name:</strong> ${safe.name_raw || 'N/A'}</p>
              <p><strong>Abode:</strong> ${safe.abode_raw || 'N/A'}</p>
              <p><strong>Burial Date:</strong> ${safe.burial_date_raw || 'N/A'}</p>
              <p><strong>Age:</strong> ${safe.age_raw || 'N/A'}</p>
              <p><strong>Officiant:</strong> ${safe.officiant_raw || 'N/A'}</p>
            </div>
            <div class="col-md-6">
              <p><strong>Page Number:</strong> ${safe.page_number}</p>
              <p><strong>Row Index:</strong> ${safe.row_index_on_page}</p>
              <p><strong>Volume ID:</strong> ${safe.volume_id || 'N/A'}</p>
              ${uncertaintyFlags.length > 0 ? `<p><strong>Uncertainty Flags:</strong> ${uncertaintyFlags.join(', ')}</p>` : ''}
            </div>
          </div>
          ${safe.marginalia_raw ? `<p><strong>Marginalia:</strong> ${safe.marginalia_raw}</p>` : ''}
          ${safe.extra_notes_raw ? `<p><strong>Extra Notes:</strong> ${safe.extra_notes_raw}</p>` : ''}
          ${safe.row_ocr_raw ? `<p><strong>Row OCR:</strong> <code>${safe.row_ocr_raw}</code></p>` : ''}
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-header bg-light">
          <strong>Page Header Information</strong>
        </div>
        <div class="card-body">
          <div class="row">
            <div class="col-md-4">
              <p><strong>Parish:</strong> ${safe.parish_header_raw || 'N/A'}</p>
            </div>
            <div class="col-md-4">
              <p><strong>County:</strong> ${safe.county_header_raw || 'N/A'}</p>
            </div>
            <div class="col-md-4">
              <p><strong>Year:</strong> ${safe.year_header_raw || 'N/A'}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="row">
        <div class="col-md-6">
          <div class="detail-info">
            <h6>Processing Information</h6>
            <dl class="row">
              <dt class="col-sm-4">Model:</dt>
              <dd class="col-sm-8">${safe.ai_provider || 'N/A'} ${safe.model_name ? `(${safe.model_name})` : ''}</dd>

              <dt class="col-sm-4">Template:</dt>
              <dd class="col-sm-8">${safe.prompt_template || 'N/A'}</dd>

              <dt class="col-sm-4">Version:</dt>
              <dd class="col-sm-8">${safe.prompt_version || 'N/A'}</dd>

              <dt class="col-sm-4">Source File:</dt>
              <dd class="col-sm-8">${safe.fileName || 'N/A'}</dd>

              <dt class="col-sm-4">Processing ID:</dt>
              <dd class="col-sm-8"><code>${safe.processing_id || 'N/A'}</code></dd>
            </dl>
          </div>
        </div>

        <div class="col-md-6">
          <div class="detail-info">
            <h6>Additional Details</h6>
            <dl class="row">
              <dt class="col-sm-4">Processed:</dt>
              <dd class="col-sm-8">${formatDate(entry.processed_date)}</dd>
            </dl>
          </div>
        </div>
      </div>

      <div class="mt-3">
        <button class="btn btn-sm btn-secondary close-detail" data-memorial="${uniqueId}">
          <i class="fas fa-chevron-up"></i> Close Details
        </button>
        <button class="btn btn-sm btn-primary edit-record ml-2" data-record-id="${entry.id}" data-record-type="burial-register">
          <i class="fas fa-edit"></i> Edit
        </button>
        ${entry.needs_review ? `<button class="btn btn-sm btn-warning mark-reviewed ml-2" data-record-id="${entry.id}" data-record-type="burial-register">
          <i class="fas fa-check"></i> Mark as Reviewed
        </button>` : ''}
      </div>
    </div>
    </td>
  `;
}

/**
 * Create detail row for burial register entry
 * @param {Object} entry - Burial register entry object
 * @param {number} colSpan - Column span
 * @returns {HTMLElement} Detail row element
 */
function createBurialRegisterDetailRow(entry, colSpan) {
  const detailRow = document.createElement('tr');
  detailRow.className = 'detail-row';
  detailRow.style.display = 'none';

  const uniqueId = entry.id || `burial-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  detailRow.id = `detail-${uniqueId}`;
  detailRow.setAttribute('data-memorial-id', uniqueId);

  detailRow.innerHTML = createBurialRegisterDetailHTML(entry, colSpan, uniqueId);

  return detailRow;
}

// Function to display burial register entries with expandable rows
function displayBurialRegisterEntries(entries) {
  const tableBody = document.getElementById('resultsTableBody');
  const emptyState = document.getElementById('emptyState');

  // Clear existing content and reset expanded rows
  tableBody.innerHTML = '';
  expandedRows.clear();

  // Check if there are any entries
  if (!entries || entries.length === 0) {
    if (emptyState) {
      emptyState.classList.remove('d-none');
    }
    return;
  }

  // Hide empty state
  if (emptyState) {
    emptyState.classList.add('d-none');
  }

  // Create rows for each entry
  entries.forEach(entry => {
    // Create main row
    const row = document.createElement('tr');
    row.className = 'memorial-row';
    row.style.cursor = 'pointer';

    // Generate unique ID
    const uniqueId = entry.id || `burial-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    row.setAttribute('data-memorial-id', uniqueId);

    // Use safe HTML generation
    row.innerHTML = createBurialRegisterMainRowHTML(entry, uniqueId);

    tableBody.appendChild(row);

    // Create detail row (initially hidden)
    const detailRow = createBurialRegisterDetailRow(entry, 9); // 9 columns total
    tableBody.appendChild(detailRow);
  });
}

/**
 * Display custom schema records with dynamic columns
 * @param {Array} records - Records from custom schema table
 * @param {Array} fields - Field definitions from schema
 * @param {string} schemaName - Name of the custom schema
 */
function displayCustomSchemaResults(records, fields, schemaName) {
  const tableBody = document.getElementById('resultsTableBody');
  const emptyState = document.getElementById('emptyState');

  // Clear existing content and reset expanded rows
  tableBody.innerHTML = '';
  expandedRows.clear();

  // Check if there are any records
  if (!records || records.length === 0) {
    if (emptyState) {
      emptyState.classList.remove('d-none');
    }
    return;
  }

  // Hide empty state
  if (emptyState) {
    emptyState.classList.add('d-none');
  }

  // Create rows for each record
  records.forEach(record => {
    // Create main row
    const row = document.createElement('tr');
    row.className = 'memorial-row';
    row.style.cursor = 'pointer';

    // Generate unique ID
    const uniqueId = record.id || `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    row.setAttribute('data-memorial-id', uniqueId);

    // Build dynamic row HTML based on fields
    row.innerHTML = createCustomSchemaMainRowHTML(record, fields, uniqueId);

    tableBody.appendChild(row);

    // Create detail row (initially hidden)
    const detailRow = createCustomSchemaDetailRow(record, fields, fields.length + 3); // +3 for expand btn, processed date, file
    tableBody.appendChild(detailRow);
  });
}

/**
 * Create main row HTML for custom schema record
 * @param {Object} record - Record data
 * @param {Array} fields - Field definitions
 * @param {string} uniqueId - Unique identifier
 * @returns {string} HTML string
 */
function createCustomSchemaMainRowHTML(record, fields, uniqueId) {
  let html = `
    <td class="text-center">
      <button class="btn btn-sm btn-outline-secondary expand-toggle"
        data-toggle-memorial="${uniqueId}"
        title="Click to expand/collapse details">
        <i class="fas fa-chevron-down"></i>
      </button>
    </td>
  `;

  // Smart column selection: prioritize important/interesting fields
  const priorityPatterns = [
    /^(full_?)?name$/i,                    // Full name
    /^(surname|last_?name|family_?name)$/i, // Surname
    /^(christian_?name|first_?name|given_?name)$/i, // First name
    /^age/i,                               // Age fields
    /^(year|date)/i,                       // Date/year fields
    /^(relation|relationship)/i,           // Relationship fields
    /^(occupation|profession)/i,           // Occupation
    /^(sex|gender)$/i,                     // Sex/gender
    /^(location|address|place)/i           // Location
  ];

  // Sort fields by priority
  const sortedFields = [...fields].sort((a, b) => {
    const aPriority = priorityPatterns.findIndex(p => p.test(a.name));
    const bPriority = priorityPatterns.findIndex(p => p.test(b.name));

    // Higher priority (lower index) comes first
    if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
    if (aPriority !== -1) return -1;
    if (bPriority !== -1) return 1;
    return 0; // Keep original order for non-priority fields
  });

  // Take first 5 priority fields
  const displayFields = sortedFields.slice(0, 5);

  displayFields.forEach(field => {
    const value = record[field.name];
    let displayValue = 'N/A';

    if (value != null && value !== '') {
      // Format boolean values
      if (typeof value === 'boolean' || value === 0 || value === 1) {
        displayValue = (value === true || value === 1) ? 'Yes' : 'No';
      } else {
        displayValue = SanitizeUtils.sanitizeText(String(value));
      }
    }

    html += `<td>${displayValue}</td>`;
  });

  // Add processed date
  html += `<td>${formatDate(record.processed_date)}</td>`;

  return html;
}

/**
 * Format a field name for display (convert snake_case to Title Case)
 * @param {string} name - Field name
 * @returns {string} Formatted display name
 */
function formatFieldName(name) {
  if (!name) return '';
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Create detail row for custom schema record
 * @param {Object} record - Record data
 * @param {Array} fields - Field definitions
 * @param {number} colSpan - Column span
 * @returns {HTMLElement} Detail row element
 */
function createCustomSchemaDetailRow(record, fields, colSpan) {
  const detailRow = document.createElement('tr');
  detailRow.className = 'detail-row';
  detailRow.style.display = 'none';

  const uniqueId = record.id || `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  detailRow.id = `detail-${uniqueId}`;
  detailRow.setAttribute('data-memorial-id', uniqueId);

  detailRow.innerHTML = createCustomSchemaDetailHTML(record, fields, colSpan, uniqueId);

  return detailRow;
}

/**
 * Create detail HTML for custom schema record
 * @param {Object} record - Record data
 * @param {Array} fields - Field definitions
 * @param {number} colSpan - Column span
 * @param {string} uniqueId - Unique identifier
 * @returns {string} HTML string
 */
function createCustomSchemaDetailHTML(record, fields, colSpan, uniqueId) {
  // Group fields into columns for compact display
  const fieldItems = fields.map(field => {
    const value = record[field.name];
    let displayValue = 'N/A';

    if (value != null && value !== '') {
      if (typeof value === 'boolean') {
        displayValue = value ? 'Yes' : 'No';
      } else if (value === 0 || value === 1) {
        const booleanPatterns = /^(deaf|blind|idiotic|lunatic|is_|has_)/i;
        displayValue = booleanPatterns.test(field.name)
          ? (value === 1 ? 'Yes' : 'No')
          : SanitizeUtils.sanitizeText(String(value));
      } else {
        displayValue = SanitizeUtils.sanitizeText(String(value));
      }
    }

    return {
      name: formatFieldName(field.name),
      value: displayValue,
      description: field.description || ''
    };
  });

  // Split into columns (roughly 3 columns)
  const colSize = Math.ceil(fieldItems.length / 3);
  const col1 = fieldItems.slice(0, colSize);
  const col2 = fieldItems.slice(colSize, colSize * 2);
  const col3 = fieldItems.slice(colSize * 2);

  // Build column HTML
  const buildColumn = (items) => items.map(item => `
    <div class="mb-2">
      <strong class="text-muted small">${item.name}</strong><br>
      <span>${item.value}</span>
    </div>
  `).join('');

  return `
    <td colspan="${colSpan}">
      <div class="detail-content p-3" style="background-color: #fafafa;">
        <div class="card">
          <div class="card-header bg-primary text-white py-2">
            <strong>Record Details</strong>
          </div>
          <div class="card-body py-3">
            <div class="row">
              <div class="col-md-4">
                ${buildColumn(col1)}
              </div>
              <div class="col-md-4">
                ${buildColumn(col2)}
              </div>
              <div class="col-md-4">
                ${buildColumn(col3)}
              </div>
            </div>
          </div>
        </div>

        <div class="row mt-3">
          <div class="col-md-12">
            <div class="d-flex justify-content-between align-items-center small text-muted">
              <span>
                <i class="fas fa-file mr-1"></i> ${SanitizeUtils.sanitizeAttribute(record.file_name || record.fileName || 'N/A')}
              </span>
              <span>
                <i class="fas fa-clock mr-1"></i> Processed: ${formatDate(record.processed_date)}
              </span>
              <button class="btn btn-sm btn-outline-secondary close-detail" data-memorial="${uniqueId}">
                <i class="fas fa-chevron-up"></i> Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </td>
  `;
}

// Function to setup event delegation for memorial rows (prevents memory leaks)
function setupEventDelegation() {
  const tableBody = document.getElementById('resultsTableBody');

  if (!tableBody) return;

  // Remove any existing delegated listener to prevent duplicates
  tableBody.removeEventListener('click', handleTableClick);

  // Add delegated event listener
  tableBody.addEventListener('click', handleTableClick);
}

// Delegated event handler for table clicks
function handleTableClick(event) {
  const target = event.target;

  // Handle memorial row clicks (for expanding/collapsing)
  const memorialRow = target.closest('tr.memorial-row');
  if (memorialRow && !target.closest('.expand-toggle')) {
    const memorialId = memorialRow.getAttribute('data-memorial-id');
    if (memorialId) {
      toggleRow(memorialId);
    }
  }
}

// Function to enable download buttons
function enableDownloadButtons() {
  document.getElementById('downloadButton').disabled = false;
  document.getElementById('downloadCsvButton').disabled = false;
}

// Function to load results data with comprehensive error handling
export async function loadResults() {
  const loadingState = document.getElementById('loadingState');

  try {
    // Show loading state
    if (loadingState) {
      loadingState.style.display = 'block';
    }

    // Reset error state for new attempts
    if (retryCount === 0) {
      currentError = null;
    }

    // Fetch results from API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    // Build query string with optional projectId
    const projectId = getProjectIdFromUrl();
    const queryString = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    const response = await fetch(`/results-data${queryString}`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    clearTimeout(timeoutId);

    // Check if response is ok
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText} `);
      error.status = response.status;
      throw error;
    }

    // Parse JSON response
    const data = await response.json();

    // Hide loading state
    if (loadingState) {
      loadingState.style.display = 'none';
    }

    // Reset retry count on success
    retryCount = 0;

    // Display data based on source type
    if (data.sourceType === 'burial_register' && data.burialRegisterEntries) {
      updateTableHeaders('burial_register');
      displayBurialRegisterEntries(data.burialRegisterEntries);

      // Update model info panel with data from the first entry
      if (data.burialRegisterEntries.length > 0) {
        const latestEntry = data.burialRegisterEntries.reduce((latest, current) =>
          new Date(current.processed_date) > new Date(latest.processed_date) ? current : latest
        );
        updateModelInfoPanel(latestEntry);
      }

      // Initialize table enhancements
      if (data.burialRegisterEntries.length > 0) {
        tableEnhancements.init(data.burialRegisterEntries);
        enableDownloadButtons();
      }
    } else if (data.sourceType === 'custom' && data.records) {
      // Handle custom schema data
      updateTableHeaders('custom', data.fields);
      displayCustomSchemaResults(data.records, data.fields, data.schemaName);

      // Update source banner if present
      const sourceBanner = document.getElementById('sourceBanner');
      if (sourceBanner) {
        sourceBanner.textContent = `Viewing: ${data.schemaName || 'Custom Schema'}`;
        sourceBanner.classList.remove('d-none');
      }

      // Update model info panel with data from the most recent record
      if (data.records.length > 0) {
        const latestRecord = data.records.reduce((latest, current) =>
          new Date(current.processed_date) > new Date(latest.processed_date) ? current : latest
        );
        updateModelInfoPanel(latestRecord);
      }

      // Initialize table enhancements
      if (data.records.length > 0) {
        tableEnhancements.init(data.records);
        enableDownloadButtons();
      }
    } else {
      // Default to memorials (or grave cards) display
      updateTableHeaders(data.sourceType || 'memorial');
      displayMemorials(data.memorials || []);

      // Update model info panel with data from the first memorial (or aggregate)
      if (data.memorials && data.memorials.length > 0) {
        // Use the most recent memorial's data for the model info panel
        const latestMemorial = data.memorials.reduce((latest, current) =>
          new Date(current.processed_date) > new Date(latest.processed_date) ? current : latest
        );
        updateModelInfoPanel(latestMemorial);
      }

      // Initialize table enhancements
      if (data.memorials && data.memorials.length > 0) {
        allMemorials = data.memorials;

        // Show summary stats container
        const summaryStatsRow = document.getElementById('summaryStatsRow');
        if (summaryStatsRow) summaryStatsRow.classList.remove('d-none');

        // Populate Section Dropdown
        populateSectionFilter(allMemorials);

        // Apply filters (which will init tableEnhancements and update stats)
        applyCustomFilters();

        enableDownloadButtons(); // Ensure this is called
      }
    }

    // Display error summary (common for both types)
    displayErrorSummary(data.errors);

    return data;

  } catch (error) {
    // Log the error for debugging
    console.error('Error loading results:', error);

    // Determine if this is a retryable error
    const errorType = classifyError(error);
    const canRetry = ErrorMessages[errorType].canRetry && retryCount < MAX_RETRY_ATTEMPTS;

    // Show appropriate error state
    showErrorState(error, canRetry);

    // Don't throw the error - we've handled it with the UI
    return null;
  }
}

// Download functions
window.downloadJsonResults = function (filenameInput, format) {
  const filename = filenameInput.value || 'results';
  window.location.href = `/download-json?filename=${encodeURIComponent(filename)}&format=${format}`;
};

window.downloadCsvResults = function (filenameInput) {
  const filename = filenameInput.value || 'results';
  window.location.href = `/download-csv?filename=${encodeURIComponent(filename)}`;
};

// Initialize on document load
document.addEventListener('DOMContentLoaded', () => {
  initProjectFilter();
  loadResults();

  // Initialize clipboard functionality
  new ClipboardJS('.copy-info');

  // Setup event delegation once on page load (prevents memory leaks)
  setupEventDelegation();

  // Listen for filtered memorials event
  document.addEventListener('memorials-filtered', (event) => {
    displayMemorials(event.detail.memorials);
  });
});

// Event delegation for dynamic elements
document.addEventListener('click', function (event) {
  // Handle expand toggle button clicks
  if (event.target.closest('.expand-toggle')) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.target.closest('.expand-toggle');
    const memorialId = button.getAttribute('data-toggle-memorial');
    toggleRow(memorialId);
  }

  // Handle close detail button clicks
  if (event.target.closest('.close-detail')) {
    event.preventDefault();
    const button = event.target.closest('.close-detail');
    const memorialId = button.getAttribute('data-memorial');
    toggleRow(memorialId);
  }

  // Handle copy inscription button clicks
  if (event.target.closest('.copy-inscription')) {
    event.preventDefault();
    const button = event.target.closest('.copy-inscription');
    const inscription = button.getAttribute('data-inscription');

    // Create temporary textarea for copying
    const textarea = document.createElement('textarea');
    textarea.value = inscription.replace(/&quot;/g, '"');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);

    // Show feedback
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-check"></i> Copied!';
    button.classList.add('btn-success');
    button.classList.remove('btn-info');

    setTimeout(() => {
      button.innerHTML = originalText;
      button.classList.remove('btn-success');
      button.classList.add('btn-info');
    }, 2000);
  }

  // Handle edit record button clicks
  if (event.target.closest('.edit-record')) {
    event.preventDefault();
    const button = event.target.closest('.edit-record');
    const recordId = parseInt(button.getAttribute('data-record-id'));
    const recordType = button.getAttribute('data-record-type');

    // Find the detail row (parent of the clicked button)
    const detailRow = button.closest('.detail-row');
    if (!detailRow) return;

    // Get the stored record data from the detail row
    const recordJsonStr = detailRow.querySelector('[data-record-json]')?.getAttribute('data-record-json');
    if (!recordJsonStr) {
      console.error('No record data found on detail row');
      return;
    }

    let currentRecord;
    try {
      currentRecord = JSON.parse(recordJsonStr);
    } catch (e) {
      console.error('Failed to parse record JSON:', e);
      return;
    }

    // Enter edit mode
    enterEditMode(detailRow, recordType, recordId, currentRecord);
  }

  // Handle mark as reviewed button clicks
  if (event.target.closest('.mark-reviewed')) {
    event.preventDefault();
    const button = event.target.closest('.mark-reviewed');
    const recordId = button.getAttribute('data-record-id');
    const recordType = button.getAttribute('data-record-type');

    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Marking...';

    // Map record type to API endpoint type
    const apiTypeMap = {
      'memorial': 'memorials',
      'burial-register': 'burial-register',
      'grave-card': 'grave-cards'
    };

    const apiType = apiTypeMap[recordType];

    fetch(`/api/results/${apiType}/${recordId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
      .then(res => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then(data => {
        // Find the detail row (parent of the clicked button)
        const detailRow = button.closest('.detail-row');
        if (!detailRow) return;

        // Find the main row (previous sibling)
        const mainRow = detailRow.previousElementSibling;

        // Remove "Needs Review" badge from the source type cell (or first appropriate cell)
        if (mainRow) {
          const badge = mainRow.querySelector('[class*="badge-warning"]');
          if (badge && badge.textContent.includes('Review')) {
            badge.remove();
          }
        }

        // Remove the "Mark as Reviewed" button from detail view
        button.remove();

        // Remove the "Needs Review" badge from detail view (in confidence scores section)
        const detailBadge = detailRow.querySelector('[class*="badge-warning"]');
        if (detailBadge && detailBadge.textContent.includes('Review')) {
          detailBadge.remove();
        }

        // Update in-memory record if it exists
        if (recordType === 'memorial' && allMemorials.length > 0) {
          const record = allMemorials.find(r => r.id === parseInt(recordId));
          if (record) {
            record.needs_review = 0;
            record.reviewed_at = data.reviewed_at;
          }
        }
      })
      .catch(err => {
        console.error('Error marking as reviewed:', err);
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-check"></i> Mark as Reviewed';
        alert('Failed to mark as reviewed. Please try again.');
      });
  }

  // Handle inline edit save button clicks
  if (event.target.closest('.inline-edit-save')) {
    event.preventDefault();
    const button = event.target.closest('.inline-edit-save');
    const form = button.closest('.inline-edit-form');
    if (!form) return;

    const recordId = parseInt(form.getAttribute('data-record-id'));
    const recordType = form.getAttribute('data-record-type');
    const detailRow = form.closest('.detail-row');
    if (!detailRow) return;

    // Create success callback
    const onSuccess = (result) => {
      // Update in-memory array if memorial type
      if (recordType === 'memorial' && result.memorial && allMemorials.length > 0) {
        const recordIdx = allMemorials.findIndex(r => r.id === recordId);
        if (recordIdx >= 0) {
          allMemorials[recordIdx] = result.memorial;
        }
      }

      // Re-render the detail row with updated data
      const config = result.memorial || result.entry || result.card;
      if (config) {
        const detailContent = detailRow.querySelector('.detail-content');
        if (detailContent) {
          let newHtml;
          if (recordType === 'memorial' && result.memorial) {
            newHtml = SanitizeUtils.createSafeDetailHTML(result.memorial, 6, `memorial-${recordId}`);
          } else if (recordType === 'burial-register' && result.entry) {
            newHtml = createBurialRegisterDetailHTML(result.entry, 6, `entry-${recordId}`);
          } else if (recordType === 'grave-card' && result.card) {
            newHtml = SanitizeUtils.createGraveCardDetailHTML(result.card, 6, `card-${recordId}`);
          }
          if (newHtml) {
            // Extract just the inner content (skip outer <td> tag)
            const match = newHtml.match(/<td[^>]*>(.*)<\/td>/s);
            if (match) {
              detailContent.parentElement.outerHTML = newHtml;
            }
          }
        }
      }
    };

    handleSave(detailRow, recordType, recordId, onSuccess);
  }

  // Handle inline edit cancel button clicks
  if (event.target.closest('.inline-edit-cancel')) {
    event.preventDefault();
    const button = event.target.closest('.inline-edit-cancel');
    const detailRow = button.closest('.detail-row');
    if (detailRow) {
      exitEditMode(detailRow);
    }
  }
});

// Export functions and state for use by other modules
export { expandedRows, toggleRow, formatSourceType, getSourceTypeBadgeClass, formatSiteCode };

// Custom Filter Logic Integration
function populateSectionFilter(memorials) {
  const sectionFilter = document.getElementById('sectionFilter');
  if (!sectionFilter) return;

  // Clear existing options except first
  while (sectionFilter.options.length > 1) {
    sectionFilter.remove(1);
  }

  const sections = getUniqueSections(memorials);
  sections.forEach(section => {
    const option = document.createElement('option');
    option.value = section;
    option.textContent = section;
    sectionFilter.appendChild(option);
  });
}

function applyCustomFilters() {
  const sectionFilter = document.getElementById('sectionFilter');
  const graveNumberInput = document.getElementById('graveNumberInput');

  const section = sectionFilter ? sectionFilter.value : '';
  const graveNumber = graveNumberInput ? graveNumberInput.value : '';

  const filtered = filterMemorials(allMemorials, { section, graveNumber });

  // Update Stats
  updateSummaryStats(filtered);

  // Re-initialize table enhancements with the filtered subset
  // This effectively treats the subset as the "full" table for sorting/model-filtering
  tableEnhancements.init(filtered);
}

function updateSummaryStats(memorials) {
  const stats = calculateSummaryStats(memorials);

  const setUserId = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setUserId('statTotalCards', stats.totalCards);
  setUserId('statTotalInterments', stats.totalInterments);
  setUserId('statOccupied', stats.occupied);
  setUserId('statVacant', stats.vacant);
}

// Call applyCustomFilters on input changes
document.getElementById('sectionFilter')?.addEventListener('change', applyCustomFilters);
document.getElementById('graveNumberInput')?.addEventListener('input', applyCustomFilters);

// Expose retry function globally for HTML button onclick handlers
window.retryLoadResults = retryLoadResults;
