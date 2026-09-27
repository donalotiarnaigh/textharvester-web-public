const BaseVisionProvider = require('./baseProvider');
const logger = require('../logger');

/**
 * Mock provider for testing and development.
 * Returns predefined responses based on the prompt template.
 */
class MockProvider extends BaseVisionProvider {
  constructor(config = {}) {
    super(config);
    this.model = 'mock-v1';
  }

  /**
     * Get the current model version
     * @returns {string} The model version
     */
  getModelVersion() {
    return this.model;
  }

  /**
     * Process an image (mock implementation)
     * @param {string} base64Image - Base64 encoded image (ignored)
     * @param {string} prompt - The prompt (ignored)
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} - Parsed JSON response
     */
  async processImage(base64Image, prompt, options = {}) {
    logger.info('MockProvider: Processing image request');

    // Simulate API latency
    await new Promise(resolve => setTimeout(resolve, 50));

    const templateName = options.promptTemplate?.templateName || 'memorialOCR';

    let content;
    if (templateName === 'burialRegister') {
      content = this.getMockBurialRegisterResponse();
    } else if (templateName === 'graveCard') {
      content = this.getMockGraveCardResponse();
    } else if (templateName === 'monumentClassification') {
      content = this.getMockMonumentClassificationResponse();
    } else {
      content = this.getMockMemorialResponse();
    }

    return { content, usage: { input_tokens: 0, output_tokens: 0 } };
  }

  getMockMemorialResponse() {
    return {
      memorial_number: 123,
      first_name: 'John',
      last_name: 'Doe',
      year_of_death: 1900,
      description: 'In loving memory of John Doe',
      inscription: 'Rest in Peace'
    };
  }

  getMockBurialRegisterResponse() {
    return {
      volume_id: 'vol1',
      page_number: 1,
      entries: [
        {
          entry_no: '123',
          name: 'Jane Doe',
          burial_date: '1900-01-01',
          age: '50',
          abode: 'Local Area',
          parish: 'St. Marys'
        }
      ]
    };
  }

  getMockGraveCardResponse() {
    return {
      grave_number: 'A123',
      section: 'North',
      deceased_name: 'John Smith',
      interment_date: '1920-05-15'
    };
  }

  getMockMonumentClassificationResponse() {
    return {
      memorial_number: '123',
      broad_type: 'Headstone',
      detailed_type: 'Headstone with round top',
      memorial_condition: 'Sound and in situ',
      inscription_condition: 'All legible',
      height_mm: 1200,
      width_mm: 600,
      depth_mm: 100,
      material_primary: 'Granite',
      material_base: null,
      orientation: 'N',
      additional_elements: 'Footstone present',
      text_panel_shape: 'Rectangle',
      text_panel_definition: 'Rectilinear',
      inscription_technique: 'Incised',
      letter_style: 'Roman',
      central_motifs: 'Cross',
      marginal_motifs: 'Floral border',
      date_of_monument: '1850-1870',
      confidence_level: 'High',
      comments: 'Well-preserved example'
    };
  }

  /**
     * Validate provider-specific configuration
     * @returns {boolean} True
     */
  validateConfig() {
    return true;
  }

  /**
     * Validate a prompt template
     * @returns {Object} Validation result
     */
  validatePromptTemplate(/* eslint-disable-line no-unused-vars */ promptTemplate) {
    return { isValid: true };
  }
}

module.exports = MockProvider;
