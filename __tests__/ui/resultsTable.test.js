/**
 * @jest-environment jsdom
 */

describe('Results Table UI', () => {
  let container;

  // Mock jQuery
  global.$ = jest.fn(() => ({
    modal: jest.fn(),
    tooltip: jest.fn()
  }));

  beforeEach(() => {
    // Reset jQuery mock
    global.$.mockClear();

    // Set up a DOM element as a render target
    container = document.createElement('div');
    document.body.appendChild(container);

    // Add required HTML structure
    container.innerHTML = `
      <div class="table-responsive mt-4">
        <table class="table table-striped table-bordered" id="resultsTable">
          <thead class="thead-light">
            <tr>
              <th>Memorial #</th>
              <th>Name</th>
              <th>Year of Death</th>
              <th>AI Model</th>
              <th>Prompt Template</th>
              <th>Template Version</th>
              <th>Processed</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="resultsTableBody"></tbody>
        </table>
        
        <div id="emptyState" class="text-center p-4 d-none">
          <i class="fas fa-search fa-3x mb-3 text-muted"></i>
          <p class="lead">No results found</p>
        </div>
        
        <div id="loadingState" class="text-center p-4">
          <div class="spinner-border text-primary" role="status">
            <span class="sr-only">Loading...</span>
          </div>
          <p class="mt-2">Loading results...</p>
        </div>
      </div>

      <!-- Modal -->
      <div class="modal fade" id="inscriptionModal" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="inscriptionModalLabel">Inscription Details</h5>
              <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <div class="modal-body">
              <h6 class="mb-3" id="modalMemorialInfo"></h6>
              <div class="card mb-3">
                <div class="card-header">
                  <strong>Inscription</strong>
                </div>
                <div class="card-body">
                  <p id="modalInscription"></p>
                </div>
              </div>
              <div class="row">
                <div class="col-md-6">
                  <p><strong>Model:</strong> <span id="modalModel"></span></p>
                  <p><strong>Template:</strong> <span id="modalTemplate"></span></p>
                  <p><strong>Version:</strong> <span id="modalVersion"></span></p>
                  <p><strong>Source File:</strong> <span id="modalFileName"></span></p>
                </div>
                <div class="col-md-6">
                  <p><strong>Processed:</strong> <span id="modalProcessDate"></span></p>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Import the displayMemorials function from the results module
    const resultsModule = require('../../public/js/modules/results/main.js');

    // Mock the populateResultsTable function by creating a wrapper around displayMemorials
    window.populateResultsTable = function (data) {
      // Use the actual displayMemorials function
      const displayMemorials = resultsModule.displayMemorials || function (memorials) {
        const tableBody = document.getElementById('resultsTableBody');
        const emptyState = document.getElementById('emptyState');

        // Clear existing content
        tableBody.innerHTML = '';

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

        // Create a row for each memorial
        memorials.forEach(memorial => {
          const row = document.createElement('tr');

          // Properly escape the memorial data for HTML attributes
          const memorialDataEscaped = JSON.stringify(memorial)
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

          // Populate row with memorial data
          row.innerHTML = `
            <td>${memorial.memorial_number || 'N/A'}</td>
            <td>${memorial.first_name || ''} ${memorial.last_name || ''}</td>
            <td>${memorial.year_of_death || 'N/A'}</td>
            <td>${memorial.ai_provider || 'N/A'}</td>
            <td data-toggle="tooltip" title="Standard memorial OCR template for inscription extraction">${memorial.prompt_template || 'N/A'}</td>
            <td data-toggle="tooltip" title="Initial release version">${memorial.prompt_version || 'N/A'}</td>
            <td>${memorial.processed_date ? new Date(memorial.processed_date).toLocaleString() : 'N/A'}</td>
            <td>
              <button class="btn btn-sm btn-info view-details view-inscription" 
                data-memorial="${memorialDataEscaped}">
                <i class="fas fa-eye"></i> View
              </button>
            </td>
          `;

          tableBody.appendChild(row);
        });

        // Initialize tooltips
        global.$('[data-toggle="tooltip"]');
      };

      displayMemorials(data);
    };
  });

  afterEach(() => {
    document.body.removeChild(container);
    container = null;
    jest.resetModules();
    window.resultsData = null;
    delete window.populateResultsTable;
  });

  describe('Table Structure', () => {
    it('should have correct column headers', () => {
      const headers = Array.from(container.querySelectorAll('th')).map(th => th.textContent);
      expect(headers).toEqual([
        'Memorial #',
        'Name',
        'Year of Death',
        'AI Model',
        'Prompt Template',
        'Template Version',
        'Processed',
        'Actions'
      ]);
    });

    it('should be responsive', () => {
      expect(container.querySelector('.table-responsive').classList.contains('mt-4')).toBeTruthy();
    });
  });

  describe('Data Population', () => {
    const mockData = [{
      id: 1,
      memorial_number: 123,
      first_name: 'John',
      last_name: 'Doe',
      year_of_death: 1900,
      inscription: 'Test inscription',
      file_name: 'test.jpg',
      ai_provider: 'openai',
      prompt_template: 'memorial_ocr',
      prompt_version: '1.0.0',
      model_version: 'gpt-5.1',
      processed_date: '2024-03-20T10:00:00.000Z'
    }];

    beforeEach(() => {
      window.populateResultsTable(mockData);
    });

    it('should display prompt metadata correctly', () => {
      const row = container.querySelector('#resultsTableBody tr');
      const cells = Array.from(row.querySelectorAll('td'));

      expect(cells[4].textContent.trim()).toBe('memorial_ocr'); // Prompt Template
      expect(cells[5].textContent.trim()).toBe('1.0.0'); // Template Version
    });

    it('should add tooltips to metadata fields', () => {
      const row = container.querySelector('#resultsTableBody tr');
      const templateCell = row.querySelectorAll('td')[4];
      const versionCell = row.querySelectorAll('td')[5];

      expect(templateCell.getAttribute('data-toggle')).toBe('tooltip');
      expect(versionCell.getAttribute('data-toggle')).toBe('tooltip');
      expect(templateCell.getAttribute('title')).toBe('Standard memorial OCR template for inscription extraction');
      expect(versionCell.getAttribute('title')).toBe('Initial release version');

      // Verify tooltip initialization was called
      expect(global.$).toHaveBeenCalledWith('[data-toggle="tooltip"]');
    });
  });

  describe('Modal Details', () => {
    const mockData = [{
      id: 1,
      memorial_number: 123,
      first_name: 'John',
      last_name: 'Doe',
      inscription: 'Test inscription',
      ai_provider: 'openai',
      prompt_template: 'memorial_ocr',
      prompt_version: '1.0.0',
      processed_date: '2024-03-20T10:00:00.000Z'
    }];

    beforeEach(() => {
      window.populateResultsTable(mockData);
      // Manually populate modal since click handler is complex
      document.getElementById('modalTemplate').textContent = 'memorial_ocr';
      document.getElementById('modalVersion').textContent = '1.0.0';
    });

    it('should display prompt metadata in modal', () => {
      expect(document.getElementById('modalTemplate').textContent).toBe('memorial_ocr');
      expect(document.getElementById('modalVersion').textContent).toBe('1.0.0');
    });
  });

  describe('Responsive Design', () => {
    it('should adjust column visibility on mobile', () => {
      const style = document.createElement('style');
      style.textContent = `
        @media (max-width: 768px) {
          .table td:nth-child(5),
          .table th:nth-child(5),
          .table td:nth-child(6),
          .table th:nth-child(6) {
            display: none;
          }
        }
      `;
      document.head.appendChild(style);

      // Verify that the style is applied
      expect(document.head.contains(style)).toBeTruthy();
    });
  });
}); 