/**
 * @jest-environment jsdom
 */

import { initWizard, handleUpload, renderEditor, saveSchema } from '../../../../../public/js/modules/schemas/wizard.js';

// Mock Dropzone
global.Dropzone = jest.fn();
// Mock fetch
global.fetch = jest.fn();

describe('Schema Wizard Module', () => {
  let container;

  beforeEach(() => {
    // Reset DOM with wizard steps
    document.body.innerHTML = `
            <div id="step-upload" class="wizard-step"></div>
            <div id="step-loading" class="wizard-step d-none"></div>
            <div id="step-editor" class="wizard-step d-none">
                <form id="schemaForm">
                    <input id="schemaName" value="Test Schema" />
                    <table><tbody id="fieldsTableBody"></tbody></table>
                </form>
                <div id="alertContainer"></div>
            </div>
            <div id="dropzone-area"></div>
        `;
    fetch.mockClear();
    global.Dropzone.mockClear();
  });

  test('handleUpload sends files to analyze endpoint', async () => {
    const mockFiles = [new File(['foo'], 'foo.jpg')];
    const mockAnalysis = {
      recommendedName: 'Deeds',
      fields: [{ name: 'date', type: 'date' }]
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockAnalysis
    });

    const result = await handleUpload(mockFiles);

    expect(fetch).toHaveBeenCalledWith('/api/schemas/propose', expect.objectContaining({
      method: 'POST',
      body: expect.any(FormData)
    }));
    expect(result).toEqual(mockAnalysis);
  });

  test('renderEditor populates the form', () => {
    const proposal = {
      recommendedName: 'Census 1901',
      fields: [
        { name: 'age', type: 'number', description: 'Age of person' },
        { name: 'name', type: 'string', description: 'Full Name' }
      ]
    };

    renderEditor(proposal);

    const nameInput = document.getElementById('schemaName');
    expect(nameInput.value).toBe('Census 1901');

    const rows = document.querySelectorAll('#fieldsTableBody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].innerHTML).toContain('age');
    expect(rows[1].innerHTML).toContain('Full Name');
  });

  test('saveSchema constructs valid payload', async () => {
    // Setup form state
    document.getElementById('schemaName').value = 'Final Schema';
    const tbody = document.getElementById('fieldsTableBody');
    tbody.innerHTML = `
            <tr class="field-row">
                <td><input class="field-name" value="age" /></td>
                <td>
                    <select class="field-type">
                        <option value="number" selected>Number</option>
                    </select>
                </td>
                <td><input class="field-desc" value="Age" /></td>
            </tr>
        `;

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'new-id' })
    });

    await saveSchema();

    expect(fetch).toHaveBeenCalledWith('/api/schemas', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.stringMatching(/"name":"Final Schema"/)
    }));
  });
});
