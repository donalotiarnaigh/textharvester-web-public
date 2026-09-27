export function initWizard() {
  // Dropzone init would go here
}

/**
 * Uploads example files for analysis
 */
export async function handleUpload(files) {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));

  try {
    const response = await fetch('/api/schemas/propose', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Analysis failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
}

/**
 * Renders the schema editor form with the proposed schema
 * @param {Object} proposal - Schema proposal with fields
 * @param {Object} options - Optional: { editMode: boolean, existingFieldNames: string[] }
 */
export function renderEditor(proposal, options = {}) {
  const nameInput = document.getElementById('schemaName');
  const tbody = document.getElementById('fieldsTableBody');
  const { editMode = false, existingFieldNames = [] } = options;

  if (nameInput) {
    nameInput.value = proposal.recommendedName || proposal.name || '';
    if (editMode) nameInput.disabled = true; // Can't rename existing schemas
  }

  if (tbody) {
    tbody.innerHTML = '';
    if (proposal.fields) {
      proposal.fields.forEach(field => {
        const tr = document.createElement('tr');
        tr.className = 'field-row';
        const isExisting = existingFieldNames.includes(field.name);
        const isRequired = field.required !== false; // Default to checked for backward compatibility

        tr.innerHTML = `
                    <td><input type="text" class="form-control field-name" value="${escapeHtml(field.name)}" required ${isExisting ? 'disabled' : ''}></td>
                    <td>
                        <select class="form-control field-type" ${isExisting ? 'disabled' : ''}>
                            <option value="string" ${field.type === 'string' ? 'selected' : ''}>String</option>
                            <option value="number" ${field.type === 'number' ? 'selected' : ''}>Number</option>
                            <option value="date" ${field.type === 'date' ? 'selected' : ''}>Date</option>
                            <option value="boolean" ${field.type === 'boolean' ? 'selected' : ''}>Boolean</option>
                        </select>
                    </td>
                    <td><input type="text" class="form-control field-desc" value="${escapeHtml(field.description || '')}"></td>
                    <td class="text-center">
                        <input type="checkbox" class="field-required" ${isRequired ? 'checked' : ''}>
                    </td>
                    <td>
                        <button type="button" class="btn btn-sm btn-danger remove-field" ${isExisting ? 'disabled' : ''} onclick="this.closest('tr').remove()">&times;</button>
                    </td>
                `;
        if (isExisting) {
          tr.setAttribute('data-existing', 'true');
        }
        tbody.appendChild(tr);
      });
    }
  }

  // Switch views
  document.getElementById('step-upload')?.classList.add('d-none');
  document.getElementById('step-loading')?.classList.add('d-none');
  document.getElementById('step-editor')?.classList.remove('d-none');
}

/**
 * Loads a schema for editing
 * @param {string} schemaId - UUID of schema to edit
 */
export async function loadSchemaForEdit(schemaId) {
  try {
    const response = await fetch(`/api/schemas/${schemaId}`);

    if (!response.ok) {
      throw new Error(`Failed to load schema: ${response.statusText}`);
    }

    const schema = await response.json();

    // Extract fields from json_schema.properties
    // Map string fields with format: "date" back to "date" type for UI
    const fields = schema.json_schema && schema.json_schema.properties
      ? Object.entries(schema.json_schema.properties).map(([fieldName, prop]) => ({
        name: fieldName,
        type: prop.type,
        description: prop.description,
        required: (schema.json_schema.required || []).includes(fieldName)
      }))
      : [];

    // Render editor in edit mode with existing field names locked
    const proposal = {
      name: schema.name,
      recommendedName: schema.name,
      fields: fields,
      jsonSchema: schema.json_schema
    };

    renderEditor(proposal, {
      editMode: true,
      existingFieldNames: fields.map(f => f.name)
    });

    return schema;
  } catch (error) {
    console.error('Failed to load schema for editing:', error);
    throw error;
  }
}

/**
 * Normalizes field types for JSON Schema storage.
 * Maps UI types (date) to JSON Schema standard types (string).
 * @param {string} fieldType - The UI field type
 * @returns {string} The JSON Schema compatible type
 */
function normalizeFieldType(fieldType) {
  // Map UI types to JSON Schema standard types
  const typeMap = {
    'date': 'string',  // Date is stored as string in JSON Schema
    'string': 'string',
    'number': 'number',
    'boolean': 'boolean'
  };
  return typeMap[fieldType] || fieldType;
}

/**
 * Collects form data and saves the schema
 */
export async function saveSchema() {
  const name = document.getElementById('schemaName').value;
  const rows = document.querySelectorAll('.field-row');

  // Construct JSON schema from table rows
  const properties = {};
  const required = [];

  rows.forEach(row => {
    const fieldName = row.querySelector('.field-name').value;
    const fieldType = row.querySelector('.field-type').value;
    const fieldDesc = row.querySelector('.field-desc').value;
    const isRequired = row.querySelector('.field-required')?.checked ?? true;

    if (fieldName) {
      properties[fieldName] = {
        type: normalizeFieldType(fieldType),
        description: fieldDesc
      };
      if (isRequired) {
        required.push(fieldName);
      }
    }
  });

  const schemaDefinition = {
    name: name,
    jsonSchema: {
      type: 'object',
      properties: properties,
      required: required
    }
  };

  try {
    const response = await fetch('/api/schemas', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(schemaDefinition)
    });

    if (!response.ok) {
      // Try to get error message from response body
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (e) {
        // Ignore JSON parse error, use statusText
      }
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    console.error('Save failed:', error);
    throw error;
  }
}

/**
 * Updates an existing schema with new field definitions
 * @param {string} schemaId - UUID of schema to update
 */
export async function updateSchema(schemaId) {
  const rows = document.querySelectorAll('.field-row');

  // Construct JSON schema from table rows
  const properties = {};
  const required = [];
  const newFields = [];

  rows.forEach(row => {
    const fieldName = row.querySelector('.field-name').value;
    const fieldType = row.querySelector('.field-type').value;
    const fieldDesc = row.querySelector('.field-desc').value;
    const isRequired = row.querySelector('.field-required')?.checked ?? true;
    const isExisting = row.getAttribute('data-existing') === 'true';

    if (fieldName) {
      properties[fieldName] = {
        type: normalizeFieldType(fieldType),
        description: fieldDesc
      };
      if (isRequired) {
        required.push(fieldName);
      }
      if (!isExisting) {
        newFields.push(fieldName);
      }
    }
  });

  const schemaDefinition = {
    jsonSchema: {
      type: 'object',
      properties: properties,
      required: required
    }
  };

  // Show confirmation if adding new columns
  if (newFields.length > 0) {
    const confirmed = window.confirm(
      `This will add ${newFields.length} new column(s) to the database table:\n${newFields.join(', ')}\n\nContinue?`
    );
    if (!confirmed) {
      return;
    }
  }

  try {
    const response = await fetch(`/api/schemas/${schemaId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(schemaDefinition)
    });

    if (!response.ok) {
      // Try to get error message from response body
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (e) {
        // Ignore JSON parse error, use statusText
      }
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    console.error('Update failed:', error);
    throw error;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
