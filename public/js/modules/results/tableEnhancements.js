/**
 * Table enhancement module for sorting and filtering
 */

import { expandedRows, toggleRow } from './main.js';

export class TableEnhancements {
  constructor() {
    this.memorials = [];
    this.filteredMemorials = [];
    this.sortField = null;
    this.sortDirection = 'asc';
    this.filters = {
      search: '',
      model: '',
      year: '',
      siteCode: ''
    };
  }

  /**
   * Initialize table enhancements with memorial data
   * @param {Array} memorials - Array of memorial objects
   */
  init(memorials) {
    this.memorials = memorials;
    this.filteredMemorials = [...memorials];
    this.setupEventListeners();
    this.populateFilterOptions();
    this.updateCounts();
  }

  /**
   * Set up event listeners for sorting and filtering
   */
  setupEventListeners() {
    // Sorting
    document.querySelectorAll('.sortable').forEach(header => {
      header.style.cursor = 'pointer';
      header.addEventListener('click', () => {
        const field = header.getAttribute('data-sort');
        this.sort(field);
      });
    });

    // Search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filters.search = e.target.value.toLowerCase();
        this.applyFilters();
      });
    }

    // Model filter
    const modelFilter = document.getElementById('modelFilter');
    if (modelFilter) {
      modelFilter.addEventListener('change', (e) => {
        this.filters.model = e.target.value;
        this.applyFilters();
      });
    }

    // Year filter
    const yearFilter = document.getElementById('yearFilter');
    if (yearFilter) {
      yearFilter.addEventListener('change', (e) => {
        this.filters.year = e.target.value;
        this.applyFilters();
      });
    }

    // Site Code filter (for mobile uploads)
    const siteCodeFilter = document.getElementById('siteCodeFilter');
    if (siteCodeFilter) {
      siteCodeFilter.addEventListener('change', (e) => {
        this.filters.siteCode = e.target.value;
        this.applyFilters();
      });
    }

    // Clear filters
    const clearButton = document.getElementById('clearFilters');
    if (clearButton) {
      clearButton.addEventListener('click', () => {
        this.clearFilters();
      });
    }

    // Expand/Collapse all
    const expandAllBtn = document.getElementById('expandAll');
    if (expandAllBtn) {
      expandAllBtn.addEventListener('click', () => {
        this.expandAll();
      });
    }

    const collapseAllBtn = document.getElementById('collapseAll');
    if (collapseAllBtn) {
      collapseAllBtn.addEventListener('click', () => {
        this.collapseAll();
      });
    }
  }

  /**
   * Populate filter dropdown options
   */
  populateFilterOptions() {
    // Get unique models
    const models = [...new Set(this.memorials.map(m => m.ai_provider).filter(Boolean))];
    const modelFilter = document.getElementById('modelFilter');
    if (modelFilter) {
      models.sort().forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        modelFilter.appendChild(option);
      });
    }

    // Get unique years
    const years = [...new Set(this.memorials.map(m => m.year_of_death).filter(Boolean))];
    const yearFilter = document.getElementById('yearFilter');
    if (yearFilter) {
      years.sort((a, b) => b - a).forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearFilter.appendChild(option);
      });
    }

    // Get unique site codes (for mobile uploads)
    const siteCodes = [...new Set(this.memorials.map(m => m.site_code).filter(Boolean))];
    const siteCodeFilter = document.getElementById('siteCodeFilter');
    if (siteCodeFilter) {
      siteCodes.sort().forEach(code => {
        const option = document.createElement('option');
        option.value = code;
        // Capitalize for display
        option.textContent = code.charAt(0).toUpperCase() + code.slice(1);
        siteCodeFilter.appendChild(option);
      });
    }
  }

  /**
   * Sort the table by a specific field
   * @param {string} field - Field to sort by
   */
  sort(field) {
    // Toggle direction if same field
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'asc';
    }

    // Update sort icons
    document.querySelectorAll('.sortable i').forEach(icon => {
      icon.className = 'fas fa-sort';
    });

    const currentHeader = document.querySelector(`[data-sort="${field}"] i`);
    if (currentHeader) {
      currentHeader.className = this.sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
    }

    // Sort the filtered memorials
    this.filteredMemorials.sort((a, b) => {
      let aVal = a[field];
      let bVal = b[field];

      // Handle special cases
      if (field === 'name') {
        aVal = `${a.first_name || ''} ${a.last_name || ''}`.trim();
        bVal = `${b.first_name || ''} ${b.last_name || ''}`.trim();
      }

      // Handle null/undefined values
      if (aVal == null) aVal = '';
      if (bVal == null) bVal = '';

      // Compare values
      let comparison = 0;
      if (typeof aVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else {
        comparison = aVal > bVal ? 1 : (aVal < bVal ? -1 : 0);
      }

      return this.sortDirection === 'asc' ? comparison : -comparison;
    });

    // Trigger re-render
    this.render();
  }

  /**
   * Apply all active filters
   */
  applyFilters() {
    this.filteredMemorials = this.memorials.filter(memorial => {
      // Search filter
      if (this.filters.search) {
        const searchTerm = this.filters.search;
        const fullName = `${memorial.first_name || ''} ${memorial.last_name || ''}`.toLowerCase();
        const memorialNumber = (memorial.memorial_number || '').toString().toLowerCase();
        const inscription = (memorial.inscription || '').toLowerCase();

        if (!fullName.includes(searchTerm) &&
          !memorialNumber.includes(searchTerm) &&
          !inscription.includes(searchTerm)) {
          return false;
        }
      }

      // Model filter
      if (this.filters.model && memorial.ai_provider !== this.filters.model) {
        return false;
      }

      // Year filter
      if (this.filters.year) {
        const filterYear = parseInt(this.filters.year, 10);
        if (!isNaN(filterYear) && memorial.year_of_death !== filterYear) {
          return false;
        }
      }

      // Site Code filter (for mobile uploads)
      if (this.filters.siteCode && memorial.site_code !== this.filters.siteCode) {
        return false;
      }

      return true;
    });

    // Re-apply sort if active
    if (this.sortField) {
      this.sort(this.sortField);
    } else {
      this.render();
    }

    this.updateCounts();
  }

  /**
   * Clear all filters
   */
  clearFilters() {
    this.filters = {
      search: '',
      model: '',
      year: '',
      siteCode: ''
    };

    // Reset form controls
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';

    const modelFilter = document.getElementById('modelFilter');
    if (modelFilter) modelFilter.value = '';

    const yearFilter = document.getElementById('yearFilter');
    if (yearFilter) yearFilter.value = '';

    const siteCodeFilter = document.getElementById('siteCodeFilter');
    if (siteCodeFilter) siteCodeFilter.value = '';

    this.applyFilters();
  }

  /**
   * Update visible/total counts
   */
  updateCounts() {
    const visibleCount = document.getElementById('visibleCount');
    const totalCount = document.getElementById('totalCount');

    if (visibleCount) visibleCount.textContent = this.filteredMemorials.length;
    if (totalCount) totalCount.textContent = this.memorials.length;
  }

  /**
   * Expand all rows
   */
  expandAll() {
    document.querySelectorAll('.detail-row').forEach(row => {
      const memorialId = row.id.replace('detail-', '');
      if (!expandedRows.has(memorialId)) {
        toggleRow(memorialId);
      }
    });
  }

  /**
   * Collapse all rows
   */
  collapseAll() {
    document.querySelectorAll('.detail-row').forEach(row => {
      const memorialId = row.id.replace('detail-', '');
      if (expandedRows.has(memorialId)) {
        toggleRow(memorialId);
      }
    });
  }

  /**
   * Render the filtered and sorted memorials
   */
  render() {
    // Dispatch custom event with filtered memorials
    document.dispatchEvent(new CustomEvent('memorials-filtered', {
      detail: { memorials: this.filteredMemorials }
    }));
  }
}

// Create and export singleton instance
export const tableEnhancements = new TableEnhancements();