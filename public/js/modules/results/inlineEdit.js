/**
 * Inline Edit Module for TextHarvester Results
 * Handles inline editing of records without re-processing
 */

// Field configuration for each record type
const FIELD_CONFIGS = {
  memorial: {
    apiPath: 'memorials',
    fields: [
      { key: 'first_name', label: 'First Name', type: 'text' },
      { key: 'last_name', label: 'Last Name', type: 'text' },
      { key: 'year_of_death', label: 'Year of Death', type: 'text' },
      { key: 'inscription', label: 'Inscription', type: 'textarea' },
      { key: 'memorial_number', label: 'Memorial Number', type: 'text' },
      { key: 'site_code', label: 'Site Code', type: 'text' }
    ]
  },
  'burial-register': {
    apiPath: 'burial-register',
    fields: [
      { key: 'entry_no_raw', label: 'Entry Number', type: 'text' },
      { key: 'name_raw', label: 'Name', type: 'text' },
      { key: 'abode_raw', label: 'Abode', type: 'text' },
      { key: 'burial_date_raw', label: 'Burial Date', type: 'text' },
      { key: 'age_raw', label: 'Age', type: 'text' },
      { key: 'officiant_raw', label: 'Officiant', type: 'text' },
      { key: 'marginalia_raw', label: 'Marginalia', type: 'text' },
      { key: 'extra_notes_raw', label: 'Extra Notes', type: 'textarea' }
    ]
  },
  'grave-card': {
    apiPath: 'grave-cards',
    fields: [
      { key: 'section', label: 'Section', type: 'text' },
      { key: 'grave_number', label: 'Grave Number', type: 'text' }
    ]
  }
};

/**
 * Get field configuration for a record type
 * @param {string} recordType - memorial, burial-register, or grave-card
 * @returns {Object|null} Field config object or null if not found
 */
export function getFieldConfig(recordType) {
  return FIELD_CONFIGS[recordType] || null;
}

/**
 * HTML escape a string for safe attribute insertion
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Build edit form HTML
 * @param {string} recordType - memorial, burial-register, or grave-card
 * @param {number} recordId - Record ID
 * @param {Object} currentValues - Current field values
 * @returns {string} Bootstrap 4 form HTML
 */
export function buildEditFormHTML(recordType, recordId, currentValues) {
  const config = getFieldConfig(recordType);
  if (!config) return '';

  let formHtml = `<form class="inline-edit-form" data-record-id="${recordId}" data-record-type="${recordType}" style="margin-top: 1rem;">`;

  config.fields.forEach(field => {
    const value = currentValues[field.key] || '';
    const safeValue = escapeHtml(value);
    const safeLabel = escapeHtml(field.label);

    formHtml += `<div class="form-group">
      <label class="mb-2" style="font-weight: 500; font-size: 0.9rem;">${safeLabel}</label>`;

    if (field.type === 'textarea') {
      formHtml += `<textarea class="form-control form-control-sm" name="${field.key}" data-original="${safeValue}" style="min-height: 80px;">${safeValue}</textarea>`;
    } else {
      formHtml += `<input type="text" class="form-control form-control-sm" name="${field.key}" value="${safeValue}" data-original="${safeValue}">`;
    }

    formHtml += '</div>';
  });

  formHtml += `<div class="mt-3" style="border-top: 1px solid #e9ecef; padding-top: 1rem;">
    <button type="button" class="btn btn-sm btn-success inline-edit-save">
      <i class="fas fa-save"></i> Save
    </button>
    <button type="button" class="btn btn-sm btn-secondary inline-edit-cancel ml-2">
      <i class="fas fa-times"></i> Cancel
    </button>
  </div></form>`;

  return formHtml;
}

/**
 * Extract changed values from edit form
 * @param {HTMLElement} formElement - The form element
 * @returns {Object} Object with only changed fields
 */
export function extractFormValues(formElement) {
  const changed = {};

  formElement.querySelectorAll('[name]').forEach(input => {
    const fieldName = input.getAttribute('name');
    const currentValue = input.value.trim();
    const originalValue = input.getAttribute('data-original') || '';

    if (currentValue !== originalValue) {
      changed[fieldName] = currentValue;
    }
  });

  return changed;
}

/**
 * Submit edit via PATCH API
 * @param {string} recordType - memorial, burial-register, or grave-card
 * @param {number} recordId - Record ID
 * @param {Object} changedFields - Fields that changed
 * @returns {Promise} Resolves to API response data
 */
export function submitEdit(recordType, recordId, changedFields) {
  const config = getFieldConfig(recordType);
  if (!config) return Promise.reject(new Error('Unknown record type'));

  const url = `/api/results/${config.apiPath}/${recordId}`;

  return fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changedFields)
  })
    .then(res => {
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    })
    .then(data => {
      if (!data.success) throw new Error(data.error || 'Update failed');
      return data;
    });
}

/**
 * Enter edit mode: replace detail view with form
 * @param {HTMLElement} detailRow - The detail table row element
 * @param {string} recordType - memorial, burial-register, or grave-card
 * @param {number} recordId - Record ID
 * @param {Object} currentRecord - Current record data
 */
export function enterEditMode(detailRow, recordType, recordId, currentRecord) {
  const detailContent = detailRow.querySelector('.detail-content');
  if (!detailContent) return;

  // Store original HTML for cancel
  detailRow.setAttribute('data-original-html', detailContent.innerHTML);

  // Replace with edit form
  const formHtml = buildEditFormHTML(recordType, recordId, currentRecord);
  detailContent.innerHTML = formHtml;
}

/**
 * Exit edit mode: restore original detail view
 * @param {HTMLElement} detailRow - The detail table row element
 */
export function exitEditMode(detailRow) {
  const originalHtml = detailRow.getAttribute('data-original-html');
  if (!originalHtml) return;

  const detailContent = detailRow.querySelector('.detail-content');
  if (detailContent) {
    detailContent.innerHTML = originalHtml;
  }

  detailRow.removeAttribute('data-original-html');
}

/**
 * Handle save action
 * @param {HTMLElement} detailRow - The detail table row element
 * @param {string} recordType - memorial, burial-register, or grave-card
 * @param {number} recordId - Record ID
 * @param {Function} onSuccess - Callback after successful save
 */
export function handleSave(detailRow, recordType, recordId, onSuccess) {
  const form = detailRow.querySelector('.inline-edit-form');
  if (!form) return;

  const changedFields = extractFormValues(form);

  // If no changes, just exit
  if (Object.keys(changedFields).length === 0) {
    exitEditMode(detailRow);
    return;
  }

  // Show saving state
  const saveBtn = form.querySelector('.inline-edit-save');
  const originalBtnHtml = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

  // Submit
  submitEdit(recordType, recordId, changedFields)
    .then(result => {
      // Call success callback (which handles re-rendering)
      if (onSuccess) {
        onSuccess(result);
        // Don't call exitEditMode() - the callback has already re-rendered the detail view
      } else {
        // If no callback provided, just exit edit mode to show original state
        exitEditMode(detailRow);
      }
    })
    .catch(err => {
      console.error('Save error:', err);

      // Show error message
      let errorMsg = form.querySelector('.inline-edit-error');
      if (!errorMsg) {
        errorMsg = document.createElement('div');
        errorMsg.className = 'alert alert-danger alert-sm mt-2';
        errorMsg.style.fontSize = '0.85rem';
        form.insertBefore(errorMsg, form.firstChild);
      }
      errorMsg.textContent = err.message || 'Failed to save changes';
      errorMsg.classList.remove('d-none');

      // Restore button
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalBtnHtml;
    });
}

export default {
  getFieldConfig,
  buildEditFormHTML,
  extractFormValues,
  submitEdit,
  enterEditMode,
  exitEditMode,
  handleSave
};
