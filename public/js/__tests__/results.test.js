/**
 * @jest-environment jsdom
 */

describe('Results Page with Error Summary', () => {
  // Mock fetch
  global.fetch = jest.fn();
  
  beforeEach(() => {
    // Set up DOM elements that match what the actual implementation expects
    document.body.innerHTML = `
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
      
      <div id="errorSummary" style="display: none;">
        <h3>Processing Notices</h3>
        <p>The following files could not be processed:</p>
        <ul id="errorList" class="list-group"></ul>
      </div>
      
      <button id="downloadButton" disabled>Download JSON</button>
      
      <button id="downloadCsvButton" disabled>Download CSV</button>
    `;
    
    // Reset mocks between tests
    jest.resetModules();
    jest.clearAllMocks();
  });
  
  it('should display memorials and error summary when both are present', async () => {
    // Mock fetch to return memorials and errors
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        memorials: [
          {
            memorial_number: 'HG-123',
            first_name: 'JOHN',
            last_name: 'DOE',
            year_of_death: 1950,
            inscription: 'Rest in peace',
            ai_provider: 'openai',
            prompt_template: 'memorial_ocr',
            prompt_version: '1.0.0',
            processed_date: '2024-03-20T10:00:00.000Z'
          }
        ],
        errors: [
          {
            fileName: 'file2.jpg',
            error: true,
            errorType: 'empty_sheet',
            errorMessage: 'No readable text found on the sheet'
          }
        ]
      })
    });
    
    // Import and use the actual loadResults function
    const { loadResults } = require('../modules/results/main.js');
    
    // Call loadResults function
    await loadResults();
    
    // Verify memorials were displayed in the table (expandable rows = 2 elements per memorial)
    const tableBody = document.getElementById('resultsTableBody');
    expect(tableBody.children.length).toBe(2); // main row + detail row
    expect(tableBody.innerHTML).toContain('HG-123');
    expect(tableBody.innerHTML).toContain('JOHN');
    expect(tableBody.innerHTML).toContain('DOE');
    
    // Verify error summary is visible and contains error
    const errorSummary = document.getElementById('errorSummary');
    expect(errorSummary.style.display).toBe('block');
    
    const errorList = document.getElementById('errorList');
    expect(errorList.children.length).toBe(1);
    expect(errorList.innerHTML).toContain('file2.jpg');
    expect(errorList.innerHTML).toContain('Empty or unreadable sheet detected');
  });
  
  it('should hide error summary when no errors are present', async () => {
    // Mock fetch to return only memorials
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        memorials: [
          {
            memorial_number: 'HG-123',
            first_name: 'JOHN',
            last_name: 'DOE',
            year_of_death: 1950,
            inscription: 'Rest in peace',
            ai_provider: 'openai',
            prompt_template: 'memorial_ocr',
            prompt_version: '1.0.0',
            processed_date: '2024-03-20T10:00:00.000Z'
          }
        ],
        errors: []
      })
    });
    
    // Import and use the actual loadResults function
    const { loadResults } = require('../modules/results/main.js');
    
    // Call loadResults function
    await loadResults();
    
    // Verify error summary is hidden
    const errorSummary = document.getElementById('errorSummary');
    expect(errorSummary.style.display).toBe('none');
    
    // Verify memorial was displayed (expandable rows = 2 elements per memorial)
    const tableBody = document.getElementById('resultsTableBody');
    expect(tableBody.children.length).toBe(2); // main row + detail row
  });
  
  it('should display appropriate message when only errors are present', async () => {
    // Mock fetch to return only errors
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        memorials: [],
        errors: [
          {
            fileName: 'file1.jpg',
            error: true,
            errorType: 'empty_sheet',
            errorMessage: 'No readable text found on the sheet'
          },
          {
            fileName: 'file2.jpg',
            error: true,
            errorType: 'empty_sheet',
            errorMessage: 'No readable text found on the sheet'
          }
        ]
      })
    });
    
    // Import and use the actual loadResults function
    const { loadResults } = require('../modules/results/main.js');
    
    // Call loadResults function
    await loadResults();
    
    // Verify empty state is shown when no memorials
    const emptyState = document.getElementById('emptyState');
    expect(emptyState.classList.contains('d-none')).toBe(false);
    
    // Verify error summary is visible and contains both errors
    const errorSummary = document.getElementById('errorSummary');
    expect(errorSummary.style.display).toBe('block');
    
    const errorList = document.getElementById('errorList');
    expect(errorList.children.length).toBe(2);
  });
  
  it('should handle fetch errors gracefully', async () => {
    // Mock fetch to reject with an error
    global.fetch.mockRejectedValue(new Error('Failed to fetch'));
    
    // Mock console.error to capture error messages
    const originalConsoleError = console.error;
    console.error = jest.fn();
    
    // Import and use the actual loadResults function
    const { loadResults } = require('../modules/results/main.js');
    
    // Call loadResults function and expect it to return null (graceful error handling)
    const result = await loadResults();
    expect(result).toBeNull();

    // Verify error was logged
    expect(console.error).toHaveBeenCalledWith('Error loading results:', expect.any(Error));
    
    // Verify table shows enhanced error message with retry button
    const tableBody = document.getElementById('resultsTableBody');
    expect(tableBody.innerHTML).toContain('Unexpected Error');
    expect(tableBody.innerHTML).toContain('Retry');
    expect(tableBody.innerHTML).toContain('Refresh Page');
    
    // Restore console.error
    console.error = originalConsoleError;
  });
}); 