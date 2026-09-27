/**
 * @jest-environment jsdom
 */

import { initSourceTypeSelection, getSelectedSourceType } from '../sourceTypeSelection.js';

describe('Source Type Selection', () => {
  beforeEach(() => {
    // Mock global fetch
    global.fetch = jest.fn(() => Promise.resolve({
      json: () => Promise.resolve([])
    }));

    // Set up DOM elements
    document.body.innerHTML = `
      <select id="sourceTypeSelect"></select>
      <div id="volumeIdGroup" class="d-none">
        <input id="volumeId" type="text" value="vol1" />
      </div>
      <div id="instructionsText"></div>
      <div id="instructionsList"></div>
    `;
  });

  describe('SOURCE_TYPES array', () => {
    it('should include grave_record_card as a source type option', async () => {
      initSourceTypeSelection();

      // Wait for fetch promise to resolve and populate DOM
      await new Promise(resolve => setTimeout(resolve, 0));

      const sourceTypeSelect = document.getElementById('sourceTypeSelect');
      const options = Array.from(sourceTypeSelect.options);

      // Check that grave_record_card exists in the options
      const graveCardOption = options.find(opt => opt.value === 'grave_record_card');

      expect(graveCardOption).toBeDefined();
      expect(graveCardOption.textContent).toBe('Grave Record Card');
    });

    it('should maintain all existing source type options', async () => {
      initSourceTypeSelection();

      // Wait for fetch promise to resolve and populate DOM
      await new Promise(resolve => setTimeout(resolve, 0));

      const sourceTypeSelect = document.getElementById('sourceTypeSelect');
      const options = Array.from(sourceTypeSelect.options);
      const values = options.map(opt => opt.value);

      // Verify existing types still exist
      expect(values).toContain('record_sheet');
      expect(values).toContain('monument_photo');
      expect(values).toContain('burial_register');
    });
  });

  describe('getSelectedSourceType', () => {
    it('should return grave_record_card when selected', async () => {
      initSourceTypeSelection();

      // Wait for fetch promise to resolve and populate DOM
      await new Promise(resolve => setTimeout(resolve, 0));

      const sourceTypeSelect = document.getElementById('sourceTypeSelect');
      sourceTypeSelect.value = 'grave_record_card';

      expect(getSelectedSourceType()).toBe('grave_record_card');
    });
  });
});
