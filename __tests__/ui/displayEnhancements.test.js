const { 
  PromptMetadataDisplay,
  TypeInfoDisplay,
  ValidationStatusDisplay
} = require('../../src/components/displayEnhancements');

describe('Display Enhancements', () => {
  describe('PromptMetadataDisplay', () => {
    const sampleMetadata = {
      templateName: 'memorial',
      version: '1.0.0',
      provider: 'openai',
      modelVersion: 'gpt-4'
    };

    test('should render prompt metadata in modal', () => {
      const display = new PromptMetadataDisplay(sampleMetadata);
      const html = display.render();
      
      expect(html).toContain('<span class="label">Template:</span>');
      expect(html).toContain('<span class="value">memorial</span>');
      expect(html).toContain('<span class="value">1.0.0</span>');
      expect(html).toContain('<span class="value">openai</span>');
      expect(html).toContain('<span class="value">gpt-4</span>');
    });

    test('should handle missing metadata gracefully', () => {
      const display = new PromptMetadataDisplay({});
      const html = display.render();
      
      expect(html).toContain('<span class="value">Not specified</span>');
    });
  });

  describe('TypeInfoDisplay', () => {
    const sampleTypeInfo = {
      name: { type: 'string', required: true },
      age: { type: 'number', required: false },
      address: {
        type: 'object',
        properties: {
          street: { type: 'string' },
          city: { type: 'string' }
        }
      }
    };

    test('should render field type information', () => {
      const display = new TypeInfoDisplay(sampleTypeInfo);
      const html = display.render();
      
      expect(html).toContain('name (required)');
      expect(html).toContain('Type: string');
      expect(html).toContain('age (optional)');
      expect(html).toContain('street (optional)');
      expect(html).toContain('city (optional)');
    });

    test('should add appropriate CSS classes for styling', () => {
      const display = new TypeInfoDisplay(sampleTypeInfo);
      const html = display.render();
      
      expect(html).toContain('class="type-info-field required"');
      expect(html).toContain('class="type-info-field optional"');
      expect(html).toContain('class="nested-type-info"');
    });
  });

  describe('ValidationStatusDisplay', () => {
    test('should display success status', () => {
      const display = new ValidationStatusDisplay();
      const html = display.renderStatus({ isValid: true, field: 'name' });
      
      expect(html).toContain('class="validation-status success"');
      expect(html).toContain('✓');
    });

    test('should display error status with message', () => {
      const display = new ValidationStatusDisplay();
      const html = display.renderStatus({
        isValid: false,
        field: 'age',
        error: 'Must be a number'
      });
      
      expect(html).toContain('class="validation-status error"');
      expect(html).toContain('Must be a number');
    });

    test('should update status dynamically', () => {
      const display = new ValidationStatusDisplay();
      const container = document.createElement('div');
      container.innerHTML = display.render();
      
      display.updateStatus(container, {
        isValid: false,
        field: 'email',
        error: 'Invalid email format'
      });
      
      expect(container.innerHTML).toContain('Invalid email format');
    });
  });
}); 