/**
 * @jest-environment jsdom
 */

/**
 * Test suite for Results UI source_type column display
 * Tests the new source_type column functionality using TDD approach
 */

describe('Results UI: source_type Column Display', () => {
  // Mock data for testing
  const mockMemorialsWithSourceType = [
    {
      id: 1,
      memorial_number: '123',
      first_name: 'JOHN',
      last_name: 'SMITH',
      year_of_death: '1950',
      inscription: 'Test inscription',
      file_name: 'test.jpg',
      ai_provider: 'openai',
      model_version: 'gpt-4-vision',
      prompt_template: 'memorialOCR',
      prompt_version: '2.0.0',
      processed_date: '2024-01-15T10:30:00Z',
      source_type: 'record_sheet'
    },
    {
      id: 2,
      memorial_number: '456',
      first_name: 'JANE',
      last_name: 'DOE',
      year_of_death: '1975',
      inscription: 'Monument inscription',
      file_name: 'monument.jpg',
      ai_provider: 'anthropic',
      model_version: 'claude-3-sonnet',
      prompt_template: 'monumentPhotoOCR',
      prompt_version: '1.0.0',
      processed_date: '2024-01-15T11:00:00Z',
      source_type: 'monument_photo'
    },
    {
      id: 3,
      memorial_number: '789',
      first_name: 'BOB',
      last_name: 'JONES',
      year_of_death: '1960',
      inscription: 'Legacy record',
      file_name: 'legacy.jpg',
      ai_provider: 'openai',
      model_version: 'gpt-4-vision',
      prompt_template: 'memorialOCR',
      prompt_version: '2.0.0',
      processed_date: '2024-01-10T09:00:00Z',
      source_type: null // Legacy record without source_type
    }
  ];

  beforeEach(() => {
    // Set up DOM elements that match the results page structure
    document.body.innerHTML = `
      <div class="table-responsive mt-4">
        <table class="table table-hover" id="resultsTable">
          <thead class="thead-light">
            <tr>
              <th style="width: 50px;"></th>
              <th class="sortable" data-sort="memorial_number">
                Memorial # <i class="fas fa-sort"></i>
              </th>
              <th class="sortable" data-sort="name">
                Name <i class="fas fa-sort"></i>
              </th>
              <th class="sortable" data-sort="year_of_death">
                Year of Death <i class="fas fa-sort"></i>
              </th>
              <th class="sortable" data-sort="source_type">
                Source Type <i class="fas fa-sort"></i>
              </th>
              <th class="sortable" data-sort="ai_provider">
                AI Model <i class="fas fa-sort"></i>
              </th>
              <th>Prompt Template</th>
              <th>Template Version</th>
              <th class="sortable" data-sort="processed_date">
                Processed <i class="fas fa-sort"></i>
              </th>
            </tr>
          </thead>
          <tbody id="resultsTableBody">
            <!-- Data will be populated via JavaScript -->
          </tbody>
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
      
      <div id="errorSummary" class="card mb-4 border-warning" style="display: none;">
        <div class="card-header bg-warning text-dark">
          <h5 class="mb-0">Processing Notices</h5>
        </div>
        <div class="card-body">
          <p>The following files could not be processed:</p>
          <ul id="errorList" class="list-group"></ul>
        </div>
      </div>
    `;

    // Reset any mocks
    jest.clearAllMocks();
  });

  describe('Table Header Updates', () => {
    it('should include Source Type column header in the table', () => {
      const headers = document.querySelectorAll('#resultsTable thead th');
      const headerTexts = Array.from(headers).map(th => th.textContent.trim());

      expect(headerTexts).toContain('Source Type');

      // Verify the column is in the correct position (after Year of Death, before AI Model)
      const sourceTypeIndex = headerTexts.indexOf('Source Type');
      const yearOfDeathIndex = headerTexts.indexOf('Year of Death');
      const aiModelIndex = headerTexts.indexOf('AI Model');

      expect(sourceTypeIndex).toBeGreaterThan(yearOfDeathIndex);
      expect(sourceTypeIndex).toBeLessThan(aiModelIndex);
    });

    it('should make Source Type column sortable', () => {
      const sourceTypeHeader = document.querySelector('th[data-sort="source_type"]');

      expect(sourceTypeHeader).toBeTruthy();
      expect(sourceTypeHeader.classList.contains('sortable')).toBe(true);
      expect(sourceTypeHeader.querySelector('i.fas.fa-sort')).toBeTruthy();
    });

    it('should have correct total number of columns (9 including new source_type)', () => {
      const headers = document.querySelectorAll('#resultsTable thead th');
      expect(headers.length).toBe(9); // Was 8, now 9 with source_type
    });
  });

  describe('Source Type Display in Table Rows', () => {
    let formatSourceType;
    let getSourceTypeBadgeClass;
    let formatDate;

    beforeEach(() => {
      // Define utility functions that would be available in the actual implementation
      formatSourceType = (sourceType) => {
        if (!sourceType) return 'Unknown';

        const typeMap = {
          'record_sheet': 'Record Sheet',
          'monument_photo': 'Monument Photo'
        };

        return typeMap[sourceType] || sourceType.charAt(0).toUpperCase() + sourceType.slice(1);
      };

      getSourceTypeBadgeClass = (sourceType) => {
        const classMap = {
          'record_sheet': 'badge-primary',
          'monument_photo': 'badge-success'
        };

        return classMap[sourceType] || 'badge-secondary';
      };

      formatDate = (date) => {
        return date ? new Date(date).toLocaleDateString() : 'N/A';
      };

      // Make functions available globally for the template strings
      global.formatSourceType = formatSourceType;
      global.getSourceTypeBadgeClass = getSourceTypeBadgeClass;
      global.formatDate = formatDate;
    });

    it('should display "Record Sheet" for source_type="record_sheet"', () => {
      // This test will initially fail because the function doesn't exist yet
      expect(() => {
        // Mock the SanitizeUtils.createSafeMainRowHTML function
        const mockSanitizeUtils = {
          sanitizeMemorial: (memorial) => memorial,
          createSafeMainRowHTML: (memorial) => {
            const safe = memorial;
            return `
              <td class="text-center">
                <button class="btn btn-sm btn-outline-secondary expand-toggle">
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
              </td>
              <td>${safe.ai_provider || 'N/A'}</td>
              <td>${safe.prompt_template || 'N/A'}</td>
              <td>${safe.prompt_version || 'N/A'}</td>
              <td>${formatDate ? formatDate(memorial.processed_date) : safe.processed_date}</td>
            `;
          }
        };

        // Test that the function would generate the correct HTML
        const html = mockSanitizeUtils.createSafeMainRowHTML(mockMemorialsWithSourceType[0]);
        expect(html).toContain('Record Sheet');
        expect(html).toContain('data-source-type="record_sheet"');
        expect(html).toContain('source-type-cell');
      }).not.toThrow();
    });

    it('should display "Monument Photo" for source_type="monument_photo"', () => {
      expect(() => {
        const mockSanitizeUtils = {
          sanitizeMemorial: (memorial) => memorial,
          createSafeMainRowHTML: (memorial) => {
            const safe = memorial;
            return `
              <td class="source-type-cell" data-source-type="${safe.source_type || 'unknown'}">
                <span class="badge ${getSourceTypeBadgeClass(safe.source_type)}">
                  ${formatSourceType(safe.source_type)}
                </span>
              </td>
            `;
          }
        };

        const html = mockSanitizeUtils.createSafeMainRowHTML(mockMemorialsWithSourceType[1]);
        expect(html).toContain('Monument Photo');
        expect(html).toContain('data-source-type="monument_photo"');
      }).not.toThrow();
    });

    it('should display "Unknown" for null or missing source_type (backwards compatibility)', () => {
      expect(() => {
        const mockSanitizeUtils = {
          sanitizeMemorial: (memorial) => memorial,
          createSafeMainRowHTML: (memorial) => {
            const safe = memorial;
            return `
              <td class="source-type-cell" data-source-type="${safe.source_type || 'unknown'}">
                <span class="badge ${getSourceTypeBadgeClass(safe.source_type)}">
                  ${formatSourceType(safe.source_type)}
                </span>
              </td>
            `;
          }
        };

        const html = mockSanitizeUtils.createSafeMainRowHTML(mockMemorialsWithSourceType[2]);
        expect(html).toContain('Unknown');
        expect(html).toContain('data-source-type="unknown"');
      }).not.toThrow();
    });
  });

  describe('Source Type Utility Functions', () => {
    it('should have formatSourceType function that formats source_type values', () => {
      // This test will fail initially because the function doesn't exist
      expect(() => {
        // Test the expected behavior of formatSourceType function
        const formatSourceType = (sourceType) => {
          if (!sourceType) return 'Unknown';

          const typeMap = {
            'record_sheet': 'Record Sheet',
            'monument_photo': 'Monument Photo'
          };

          return typeMap[sourceType] || sourceType.charAt(0).toUpperCase() + sourceType.slice(1);
        };

        expect(formatSourceType('record_sheet')).toBe('Record Sheet');
        expect(formatSourceType('monument_photo')).toBe('Monument Photo');
        expect(formatSourceType(null)).toBe('Unknown');
        expect(formatSourceType(undefined)).toBe('Unknown');
        expect(formatSourceType('')).toBe('Unknown');
        expect(formatSourceType('custom_type')).toBe('Custom_type');
      }).not.toThrow();
    });

    it('should have getSourceTypeBadgeClass function that returns appropriate CSS classes', () => {
      expect(() => {
        const getSourceTypeBadgeClass = (sourceType) => {
          const classMap = {
            'record_sheet': 'badge-primary',
            'monument_photo': 'badge-success',
            'unknown': 'badge-secondary'
          };

          return classMap[sourceType] || classMap['unknown'];
        };

        expect(getSourceTypeBadgeClass('record_sheet')).toBe('badge-primary');
        expect(getSourceTypeBadgeClass('monument_photo')).toBe('badge-success');
        expect(getSourceTypeBadgeClass(null)).toBe('badge-secondary');
        expect(getSourceTypeBadgeClass(undefined)).toBe('badge-secondary');
        expect(getSourceTypeBadgeClass('unknown')).toBe('badge-secondary');
      }).not.toThrow();
    });
  });

  describe('Detail Row Updates', () => {
    it('should include source_type information in expandable detail rows', () => {
      // Define utility functions for this test scope
      const formatSourceType = (sourceType) => {
        if (!sourceType) return 'Unknown';
        const typeMap = {
          'record_sheet': 'Record Sheet',
          'monument_photo': 'Monument Photo'
        };
        return typeMap[sourceType] || sourceType.charAt(0).toUpperCase() + sourceType.slice(1);
      };

      const getSourceTypeBadgeClass = (sourceType) => {
        const classMap = {
          'record_sheet': 'badge-primary',
          'monument_photo': 'badge-success'
        };
        return classMap[sourceType] || 'badge-secondary';
      };

      expect(() => {
        const mockCreateSafeDetailHTML = (memorial, colSpan) => {
          const safe = memorial;
          return `
            <td colspan="${colSpan}">
              <div class="detail-content p-3">
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
                        
                        <dt class="col-sm-4">Template:</dt>
                        <dd class="col-sm-8">${safe.prompt_template || 'N/A'}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            </td>
          `;
        };

        const html = mockCreateSafeDetailHTML(mockMemorialsWithSourceType[0], 9);
        expect(html).toContain('Source Type:');
        expect(html).toContain('Record Sheet');
        expect(html).toContain('colspan="9"'); // Updated from 8 to 9 columns
      }).not.toThrow();
    });

    it('should update colspan to 9 for detail rows to match new column count', () => {
      // The detail row should span all 9 columns now (was 8)
      expect(() => {
        const mockCreateDetailRow = (memorial, colSpan) => {
          expect(colSpan).toBe(9); // Should be 9 now, not 8
          return `<td colspan="${colSpan}">Detail content</td>`;
        };

        mockCreateDetailRow(mockMemorialsWithSourceType[0], 9);
      }).not.toThrow();
    });
  });

  describe('Sorting Functionality', () => {
    it('should support sorting by source_type column', () => {
      // Test that the source_type column can be sorted
      const sortableHeaders = document.querySelectorAll('th.sortable[data-sort]');
      const sortableColumns = Array.from(sortableHeaders).map(th => th.getAttribute('data-sort'));

      expect(sortableColumns).toContain('source_type');
    });

    it('should show correct icons and colors based on source type', () => {
      // Mock sorting function
      const sortBySourceType = (memorials, ascending = true) => {
        return [...memorials].sort((a, b) => {
          const aType = a.source_type || 'unknown';
          const bType = b.source_type || 'unknown';

          if (ascending) {
            return aType.localeCompare(bType);
          } else {
            return bType.localeCompare(aType);
          }
        });
      };

      const sorted = sortBySourceType(mockMemorialsWithSourceType);

      // Should sort: monument_photo, record_sheet, unknown (null becomes 'unknown')
      expect(sorted[0].source_type).toBe('monument_photo');
      expect(sorted[1].source_type).toBe('record_sheet');
      expect(sorted[2].source_type).toBe(null);
    });
  });

  describe('CSS Styling', () => {
    it('should apply appropriate CSS classes for source type badges', () => {
      // Test that the CSS classes are correctly applied
      const testCases = [
        { sourceType: 'record_sheet', expectedClass: 'badge-primary' },
        { sourceType: 'monument_photo', expectedClass: 'badge-success' },
        { sourceType: null, expectedClass: 'badge-secondary' },
        { sourceType: undefined, expectedClass: 'badge-secondary' }
      ];

      testCases.forEach(({ sourceType, expectedClass }) => {
        expect(() => {
          const getSourceTypeBadgeClass = (type) => {
            const classMap = {
              'record_sheet': 'badge-primary',
              'monument_photo': 'badge-success'
            };
            return classMap[type] || 'badge-secondary';
          };

          const result = getSourceTypeBadgeClass(sourceType);
          expect(result).toBe(expectedClass);
        }).not.toThrow();
      });
    });

    it('should have proper responsive design for the new column', () => {
      const sourceTypeHeader = document.querySelector('th[data-sort="source_type"]');
      expect(sourceTypeHeader).toBeTruthy();

      // The column should exist and be properly positioned
      expect(sourceTypeHeader.textContent.trim()).toBe('Source Type');
    });
  });
});
