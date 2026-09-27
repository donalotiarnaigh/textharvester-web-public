/**
 * Fetches the list of custom schemas from the API.
 * @returns {Promise<Array>} List of schema objects.
 */
export async function fetchSchemas() {
  try {
    const response = await fetch('/api/schemas');
    if (!response.ok) {
      throw new Error('Failed to fetch schemas');
    }
    const schemas = await response.json();
    return schemas;
  } catch (error) {
    console.error('Error fetching schemas:', error);
    throw error;
  }
}

/**
 * Renders the list of schemas into the table.
 * @param {Array} schemas - List of schema objects.
 */
export function renderSchemas(schemas) {
  const tableBody = document.querySelector('#schemasTable tbody');
  if (!tableBody) return;

  tableBody.innerHTML = '';

  if (!schemas || schemas.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="5" class="text-center">No custom schemas found</td>';
    tableBody.appendChild(row);
    return;
  }

  // Attach modal handler globally or per button. 
  // Easier to attach data attributes and a global handler or just onclick here for simplicity in this module.
  window.viewSchemaDetails = (index) => {
    const schema = schemas[index];
    if (!schema) return;

    document.getElementById('modalSchemaName').textContent = schema.name || 'Untitled Schema';
    document.getElementById('modalTableName').textContent = schema.table_name || 'N/A';
    document.getElementById('modalSchemaId').textContent = schema.id || 'N/A';

    const tbody = document.getElementById('modalFieldsBody');
    tbody.innerHTML = '';

    const fields = schema.fields || (schema.json_schema && schema.json_schema.properties
      ? Object.entries(schema.json_schema.properties).map(([k, v]) => ({ name: k, ...v }))
      : []);

    if (fields.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center">No fields defined</td></tr>';
    } else {
      fields.forEach(field => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
                <td>${escapeHtml(field.name)}</td>
                <td><span class="badge badge-light">${escapeHtml(field.type)}</span></td>
                <td>${escapeHtml(field.description || '')}</td>
            `;
        tbody.appendChild(tr);
      });
    }

    $('#schemaModal').modal('show');
  };

  schemas.forEach((schema, index) => {
    const row = document.createElement('tr');
    // Format date nicely if possible, or just raw string
    const dateStr = schema.created_at ? new Date(schema.created_at).toLocaleDateString() : 'N/A';
    const version = schema.version || 1;

    row.innerHTML = `
            <td>${escapeHtml(schema.name)}</td>
            <td><code>${escapeHtml(schema.table_name)}</code></td>
            <td><span class="badge badge-secondary">v${version}</span></td>
            <td>${dateStr}</td>
            <td>
                <button class="btn btn-sm btn-info" onclick="viewSchemaDetails(${index})" title="View details">View</button>
                <a href="schema-wizard.html?edit=${encodeURIComponent(schema.id)}" class="btn btn-sm btn-warning ml-1" title="Edit schema">Edit</a>
            </td>
        `;
    tableBody.appendChild(row);
  });
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Initialize the schema list page
 */
export async function initSchemaList() {
  try {
    const schemas = await fetchSchemas();
    renderSchemas(schemas);
  } catch (error) {
    const container = document.getElementById('alertContainer');
    if (container) {
      container.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    Failed to load schemas: ${error.message}
                </div>
            `;
    }
  }
}
