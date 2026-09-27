/**
 * @jest-environment jsdom
 */

import { fetchSchemas, renderSchemas } from '../../../../../public/js/modules/schemas/list.js';

// Mock fetch
global.fetch = jest.fn();

describe('Schema List Module', () => {
  let container;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = `
            <table id="schemasTable">
                <tbody></tbody>
            </table>
            <div id="alertContainer"></div>
        `;
    container = document.querySelector('#schemasTable tbody');
    fetch.mockClear();
  });

  test('fetchSchemas fetches data from API', async () => {
    const mockSchemas = [
      { id: '123', name: 'Test Schema', table_name: 'custom_test', created_at: '2024-01-01' }
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSchemas,
    });

    const result = await fetchSchemas();
    expect(fetch).toHaveBeenCalledWith('/api/schemas');
    expect(result).toEqual(mockSchemas);
  });

  test('fetchSchemas handles errors', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Internal Server Error'
    });

    await expect(fetchSchemas()).rejects.toThrow('Failed to fetch schemas');
  });

  test('renderSchemas populates table', () => {
    const mockSchemas = [
      { id: 's1', name: 'Deeds', table_name: 'custom_deeds', created_at: '2025-01-01T12:00:00Z' },
      { id: 's2', name: 'Census', table_name: 'custom_census', created_at: '2025-01-02T12:00:00Z' }
    ];

    renderSchemas(mockSchemas);

    const rows = container.querySelectorAll('tr');
    expect(rows.length).toBe(2);

    expect(rows[0].cells[0].textContent).toBe('Deeds');
    expect(rows[0].cells[1].textContent).toBe('custom_deeds');
  });

  test('renderSchemas handles empty list', () => {
    renderSchemas([]);
    const rows = container.querySelectorAll('tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('No custom schemas found');
  });
});
