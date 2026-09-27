/**
 * Tests for inline edit module
 */

import {
  getFieldConfig,
  buildEditFormHTML,
  extractFormValues,
  enterEditMode,
  exitEditMode
} from '../inlineEdit';

describe('inlineEdit module', () => {
  describe('getFieldConfig', () => {
    test('returns field config for memorial type', () => {
      const config = getFieldConfig('memorial');
      expect(config).not.toBeNull();
      expect(config.apiPath).toBe('memorials');
      expect(config.fields).toHaveLength(6);
      expect(config.fields[0].key).toBe('first_name');
    });

    test('returns field config for burial-register type', () => {
      const config = getFieldConfig('burial-register');
      expect(config).not.toBeNull();
      expect(config.apiPath).toBe('burial-register');
      expect(config.fields).toHaveLength(8);
      expect(config.fields[0].key).toBe('entry_no_raw');
    });

    test('returns field config for grave-card type', () => {
      const config = getFieldConfig('grave-card');
      expect(config).not.toBeNull();
      expect(config.apiPath).toBe('grave-cards');
      expect(config.fields).toHaveLength(2);
      expect(config.fields[0].key).toBe('section');
    });

    test('returns null for unknown type', () => {
      const config = getFieldConfig('unknown');
      expect(config).toBeNull();
    });
  });

  describe('buildEditFormHTML', () => {
    test('returns empty string for unknown record type', () => {
      const html = buildEditFormHTML('unknown', 1, {});
      expect(html).toBe('');
    });

    test('generates form with text inputs for memorial', () => {
      const values = { first_name: 'John', last_name: 'Doe' };
      const html = buildEditFormHTML('memorial', 42, values);

      expect(html).toContain('<form class="inline-edit-form"');
      expect(html).toContain('data-record-id="42"');
      expect(html).toContain('data-record-type="memorial"');
      expect(html).toContain('name="first_name"');
      expect(html).toContain('value="John"');
      expect(html).toContain('name="last_name"');
      expect(html).toContain('value="Doe"');
    });

    test('generates textarea for inscription field', () => {
      const values = { inscription: 'Sacred ground' };
      const html = buildEditFormHTML('memorial', 42, values);

      expect(html).toContain('<textarea');
      expect(html).toContain('name="inscription"');
      expect(html).toContain('Sacred ground');
    });

    test('escapes HTML in values to prevent XSS', () => {
      const values = { first_name: '<script>alert("xss")</script>' };
      const html = buildEditFormHTML('memorial', 42, values);

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    test('includes data-original attribute for change detection', () => {
      const values = { first_name: 'John' };
      const html = buildEditFormHTML('memorial', 42, values);

      expect(html).toContain('data-original="John"');
    });

    test('includes Save and Cancel buttons', () => {
      const html = buildEditFormHTML('memorial', 42, {});

      expect(html).toContain('inline-edit-save');
      expect(html).toContain('inline-edit-cancel');
      expect(html).toContain('fa-save');
      expect(html).toContain('fa-times');
    });

    test('handles missing values gracefully', () => {
      const html = buildEditFormHTML('memorial', 42, {});

      expect(html).toContain('<form class="inline-edit-form"');
      expect(html).toContain('name="first_name"');
      expect(html).toContain('value=""');
    });

    test('generates all fields for burial-register', () => {
      const html = buildEditFormHTML('burial-register', 7, {});

      expect(html).toContain('name="entry_no_raw"');
      expect(html).toContain('name="name_raw"');
      expect(html).toContain('name="abode_raw"');
      expect(html).toContain('name="burial_date_raw"');
      expect(html).toContain('name="age_raw"');
      expect(html).toContain('name="officiant_raw"');
      expect(html).toContain('name="marginalia_raw"');
      expect(html).toContain('name="extra_notes_raw"');
    });
  });

  describe('extractFormValues', () => {
    test('extracts values from form inputs', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" name="first_name" value="John" data-original="Jane">
          <input type="text" name="last_name" value="Doe" data-original="Smith">
        </form>
      `;

      const form = document.querySelector('form');
      const values = extractFormValues(form);

      expect(values.first_name).toBe('John');
      expect(values.last_name).toBe('Doe');
    });

    test('only returns changed fields', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" name="first_name" value="John" data-original="John">
          <input type="text" name="last_name" value="Doe" data-original="Smith">
        </form>
      `;

      const form = document.querySelector('form');
      const values = extractFormValues(form);

      expect(values.first_name).toBeUndefined();
      expect(values.last_name).toBe('Doe');
    });

    test('returns empty object if nothing changed', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" name="first_name" value="John" data-original="John">
          <input type="text" name="last_name" value="Doe" data-original="Doe">
        </form>
      `;

      const form = document.querySelector('form');
      const values = extractFormValues(form);

      expect(Object.keys(values).length).toBe(0);
    });

    test('trims whitespace from values', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" name="first_name" value="  John  " data-original="Jane">
        </form>
      `;

      const form = document.querySelector('form');
      const values = extractFormValues(form);

      expect(values.first_name).toBe('John');
    });

    test('extracts values from textarea fields', () => {
      document.body.innerHTML = `
        <form>
          <textarea name="inscription" data-original="Old text">New text</textarea>
        </form>
      `;

      const form = document.querySelector('form');
      const values = extractFormValues(form);

      expect(values.inscription).toBe('New text');
    });

    test('handles form with no named inputs', () => {
      document.body.innerHTML = '<form></form>';

      const form = document.querySelector('form');
      const values = extractFormValues(form);

      expect(Object.keys(values).length).toBe(0);
    });
  });

  describe('enterEditMode', () => {
    test('stores original HTML in data attribute', () => {
      const detailRow = document.createElement('tr');
      detailRow.className = 'detail-row';
      detailRow.innerHTML = '<td><div class="detail-content"><p>Original Content</p></div></td>';

      enterEditMode(detailRow, 'memorial', 42, {});

      expect(detailRow.getAttribute('data-original-html')).toContain('Original Content');
    });

    test('replaces detail content with form', () => {
      const detailRow = document.createElement('tr');
      detailRow.className = 'detail-row';
      detailRow.innerHTML = '<td><div class="detail-content"><p>Original</p></div></td>';

      enterEditMode(detailRow, 'memorial', 42, { first_name: 'John' });

      const content = detailRow.querySelector('.detail-content');
      expect(content.innerHTML).toContain('inline-edit-form');
      expect(content.innerHTML).toContain('first_name');
    });

    test('does nothing if detail-content not found', () => {
      const detailRow = document.createElement('tr');
      detailRow.className = 'detail-row';
      detailRow.innerHTML = '<td><p>No detail content</p></td>';

      enterEditMode(detailRow, 'memorial', 42, {});

      expect(detailRow.getAttribute('data-original-html')).toBeNull();
    });

    test('pre-populates form with current values', () => {
      const detailRow = document.createElement('tr');
      detailRow.className = 'detail-row';
      detailRow.innerHTML = '<td><div class="detail-content"><p>Original</p></div></td>';

      const values = { first_name: 'Jane', last_name: 'Smith' };
      enterEditMode(detailRow, 'memorial', 42, values);

      const content = detailRow.querySelector('.detail-content');
      expect(content.innerHTML).toContain('value="Jane"');
      expect(content.innerHTML).toContain('value="Smith"');
    });
  });

  describe('exitEditMode', () => {
    test('restores original HTML', () => {
      const detailRow = document.createElement('tr');
      detailRow.className = 'detail-row';
      const originalHtml = '<p>Original Content</p>';
      detailRow.innerHTML = `<td><div class="detail-content">${originalHtml}</div></td>`;

      // First enter edit mode to store original
      enterEditMode(detailRow, 'memorial', 42, {});

      // Then exit
      exitEditMode(detailRow);

      const content = detailRow.querySelector('.detail-content');
      expect(content.innerHTML).toContain('Original Content');
    });

    test('removes data-original-html attribute', () => {
      const detailRow = document.createElement('tr');
      detailRow.className = 'detail-row';
      detailRow.innerHTML = '<td><div class="detail-content"><p>Original</p></div></td>';

      enterEditMode(detailRow, 'memorial', 42, {});
      expect(detailRow.hasAttribute('data-original-html')).toBe(true);

      exitEditMode(detailRow);
      expect(detailRow.hasAttribute('data-original-html')).toBe(false);
    });

    test('does nothing if no original HTML stored', () => {
      const detailRow = document.createElement('tr');
      detailRow.className = 'detail-row';
      detailRow.innerHTML = '<td><div class="detail-content"><p>Content</p></div></td>';

      // Should not throw
      exitEditMode(detailRow);

      expect(detailRow.querySelector('.detail-content').textContent).toContain('Content');
    });

    test('does nothing if detail-content not found', () => {
      const detailRow = document.createElement('tr');
      detailRow.className = 'detail-row';
      detailRow.setAttribute('data-original-html', '<p>Original</p>');
      detailRow.innerHTML = '<td><p>No detail content</p></td>';

      // Should not throw, but clears the attribute since no content to restore
      exitEditMode(detailRow);

      // Attribute should be removed (no content to restore)
      expect(detailRow.hasAttribute('data-original-html')).toBe(false);
    });
  });
});
