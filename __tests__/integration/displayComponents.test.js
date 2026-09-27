const { 
  PromptMetadataDisplay,
  TypeInfoDisplay,
  ValidationStatusDisplay
} = require('../../src/components/displayEnhancements');

describe('Display Components Integration', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Prompt Metadata Integration', () => {
    const samplePromptData = {
      templateName: 'memorial',
      version: '2.0.0',
      provider: 'anthropic',
      modelVersion: 'claude-2'
    };

    test('should update metadata display when prompt version changes', () => {
      const metadataDisplay = new PromptMetadataDisplay(samplePromptData);
      container.innerHTML = metadataDisplay.render();

      // Simulate prompt version update
      const updatedData = { ...samplePromptData, version: '2.1.0' };
      const updatedDisplay = new PromptMetadataDisplay(updatedData);
      container.innerHTML = updatedDisplay.render();

      expect(container.innerHTML).toContain('2.1.0');
      expect(container.innerHTML).not.toContain('2.0.0');
    });

    test('should maintain consistent layout with different providers', () => {
      // Test with OpenAI provider
      const openAIData = { ...samplePromptData, provider: 'openai', modelVersion: 'gpt-4' };
      const openAIDisplay = new PromptMetadataDisplay(openAIData);
      container.innerHTML = openAIDisplay.render();
      
      const openAILayout = container.innerHTML;
      expect(openAILayout).toContain('openai');
      expect(openAILayout).toContain('gpt-4');

      // Test with Anthropic provider
      const anthropicDisplay = new PromptMetadataDisplay(samplePromptData);
      container.innerHTML = anthropicDisplay.render();
      
      const anthropicLayout = container.innerHTML;
      expect(anthropicLayout).toContain('anthropic');
      expect(anthropicLayout).toContain('claude-2');

      // Verify layout structure remains consistent
      expect(openAILayout.replace(/openai|gpt-4/g, ''))
        .toBe(anthropicLayout.replace(/anthropic|claude-2/g, ''));
    });
  });

  describe('Type Validation Integration', () => {
    const typeInfo = {
      name: { type: 'string', required: true },
      dates: {
        type: 'object',
        properties: {
          birth: { type: 'string', required: true },
          death: { type: 'string', required: true }
        }
      }
    };

    const sampleData = {
      name: 'John Smith',
      dates: {
        birth: '1920-01-01',
        death: '2000-12-31'
      }
    };

    test('should display validation feedback for nested fields', () => {
      // Set up displays
      const typeDisplay = new TypeInfoDisplay(typeInfo);
      const validationDisplay = new ValidationStatusDisplay();
      
      container.innerHTML = `
        ${typeDisplay.render()}
        ${validationDisplay.render()}
      `;

      // Validate and update nested fields
      const validateField = (path, value, expectedType) => {
        const isValid = typeof value === expectedType;
        validationDisplay.updateStatus(container, {
          isValid,
          field: path,
          error: isValid ? '' : `Expected ${expectedType}, got ${typeof value}`
        });
      };

      // Test validation of nested fields
      validateField('name', sampleData.name, 'string');
      validateField('dates.birth', sampleData.dates.birth, 'string');
      validateField('dates.death', sampleData.dates.death, 'string');

      const statusContainer = container.querySelector('.validation-status-container');
      expect(statusContainer.innerHTML).toContain('success');
      expect(statusContainer.querySelectorAll('.validation-status').length).toBe(3);
    });

    test('should integrate type info with validation status', () => {
      const typeDisplay = new TypeInfoDisplay(typeInfo);
      const validationDisplay = new ValidationStatusDisplay();
      
      container.innerHTML = `
        ${typeDisplay.render()}
        ${validationDisplay.render()}
      `;

      // Simulate invalid data
      const invalidData = {
        name: 123, // Should be string
        dates: {
          birth: '1920-01-01',
          death: null // Should be string
        }
      };

      // Validate and update status
      Object.entries(invalidData).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          Object.entries(value).forEach(([nestedKey, nestedValue]) => {
            const isValid = typeof nestedValue === 'string';
            validationDisplay.updateStatus(container, {
              isValid,
              field: `${key}.${nestedKey}`,
              error: isValid ? '' : `Expected string, got ${typeof nestedValue}`
            });
          });
        } else {
          const isValid = typeof value === 'string';
          validationDisplay.updateStatus(container, {
            isValid,
            field: key,
            error: isValid ? '' : `Expected string, got ${typeof value}`
          });
        }
      });

      const statusContainer = container.querySelector('.validation-status-container');
      expect(statusContainer.innerHTML).toContain('error');
      expect(statusContainer.innerHTML).toContain('Expected string, got number');
      expect(statusContainer.innerHTML).toContain('Expected string, got object');
    });
  });

  describe('Version Tracking Integration', () => {
    test('should track and display version changes across components', () => {
      const initialVersion = '1.0.0';
      const updatedVersion = '1.1.0';

      // Initial setup with version 1.0.0
      const metadataDisplay = new PromptMetadataDisplay({
        templateName: 'memorial',
        version: initialVersion
      });

      const typeDisplay = new TypeInfoDisplay({
        name: { type: 'string', required: true }
      });

      const validationDisplay = new ValidationStatusDisplay();

      container.innerHTML = `
        ${metadataDisplay.render()}
        ${typeDisplay.render()}
        ${validationDisplay.render()}
      `;

      // Verify initial version
      expect(container.innerHTML).toContain(initialVersion);

      // Update to version 1.1.0
      const updatedMetadataDisplay = new PromptMetadataDisplay({
        templateName: 'memorial',
        version: updatedVersion
      });

      container.innerHTML = `
        ${updatedMetadataDisplay.render()}
        ${typeDisplay.render()}
        ${validationDisplay.render()}
      `;

      // Verify version update
      expect(container.innerHTML).toContain(updatedVersion);
      expect(container.innerHTML).not.toContain(initialVersion);

      // Verify components maintain their structure
      expect(container.querySelector('.type-info-container')).toBeTruthy();
      expect(container.querySelector('.validation-status-container')).toBeTruthy();
    });
  });
}); 