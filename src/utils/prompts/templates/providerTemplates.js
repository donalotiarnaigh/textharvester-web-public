/**
 * Default provider-specific prompt templates
 */

const MemorialOCRPrompt = require('./MemorialOCRPrompt');
const TypographicAnalysisPrompt = require('./TypographicAnalysisPrompt');
const BurialRegisterPrompt = require('./BurialRegisterPrompt');
const MonumentPhotoOCRPrompt = require('./MonumentPhotoOCRPrompt');
const GraveCardPrompt = require('./GraveCardPrompt');
const MonumentClassificationPrompt = require('./MonumentClassificationPrompt');
const ProviderPromptManager = require('../ProviderPromptManager');
const { MEMORIAL_FIELDS } = require('../types/memorialFields');

const openaiTemplate = {
  provider: 'openai',
  systemPrompt: 'You are an expert OCR system specializing in extracting structured data from memorial inscriptions. Your task is to extract specific fields with strict type handling, ensuring numeric values are returned as actual numbers, not strings.',
  formatInstructions: 'Return data as a valid JSON object with the following requirements:\n- memorial_number must be a string or null\n- first_name and last_name must be strings or null\n- year_of_death must be an integer between 1500 and current year, or null\n- inscription must be a string or null\nUse response_format: { type: "json" }.',
  typeFormatting: {
    integer: 'number',
    float: 'number',
    string: 'string',
    boolean: 'boolean',
    date: 'string',
    array: 'array'
  }
};

const openaiTemplateV2 = {
  provider: 'openai',
  systemPrompt: 'You are an expert OCR system specializing in extracting structured data from memorial inscriptions. Your task is to extract specific fields with strict type handling and validation, ensuring numeric values are returned as actual numbers, not strings.',
  formatInstructions: 'Return data as a valid JSON object with the following requirements:\n- memorial_number must be a string or null\n- first_name and last_name must be strings or null\n- year_of_death must be an integer between 1500 and current year, or null (do not return strings for years)\n- inscription must be a string or null\nUse response_format: { type: "json" }.',
  typeFormatting: {
    integer: 'number',
    float: 'number',
    string: 'string',
    boolean: 'boolean',
    date: 'string',
    array: 'array'
  }
};

const anthropicTemplate = {
  provider: 'anthropic',
  systemPrompt: 'You are an expert OCR system specializing in extracting structured data from memorial inscriptions. Focus on accurate extraction and proper type conversion, ensuring numeric values are actual numbers.',
  formatInstructions: 'Return data as a JSON object with these requirements:\n- memorial_number: string or null\n- first_name: string or null\n- last_name: string or null\n- year_of_death: integer between 1500-current year or null (must be a number, not text)\n- inscription: string or null\nHandle missing or uncertain values with null.',
  typeFormatting: {
    integer: 'numeric',
    float: 'decimal',
    string: 'text',
    boolean: 'true/false',
    date: 'YYYY-MM-DD',
    array: 'list'
  }
};

const anthropicTemplateV2 = {
  provider: 'anthropic',
  systemPrompt: 'You are an expert OCR system specializing in extracting structured data from memorial inscriptions. Focus on accurate extraction, proper type conversion, and strict validation of numeric values.',
  formatInstructions: 'Return data as a JSON object with these requirements:\n- memorial_number: string or null\n- first_name: string or null\n- last_name: string or null\n- year_of_death: integer between 1500-current year or null (must be a number, not text)\n- inscription: string or null\nHandle missing or uncertain values with null. Years must be actual integers, not strings.',
  typeFormatting: {
    integer: 'numeric',
    float: 'decimal',
    string: 'text',
    boolean: 'true/false',
    date: 'YYYY-MM-DD',
    array: 'list'
  }
};

const geminiTemplate = {
  provider: 'gemini',
  systemPrompt: 'You are an expert OCR system specializing in extracting structured data from memorial inscriptions. Focus on accurate extraction and proper type conversion, ensuring numeric values are actual numbers.',
  formatInstructions: 'Return data as a JSON object with these requirements:\n- memorial_number: string or null\n- first_name: string or null\n- last_name: string or null\n- year_of_death: integer between 1500-current year or null (must be a number, not text)\n- inscription: string or null\nHandle missing or uncertain values with null.',
  typeFormatting: {
    integer: 'numeric',
    float: 'decimal',
    string: 'text',
    boolean: 'true/false',
    date: 'YYYY-MM-DD',
    array: 'list'
  }
};

const geminiTemplateV2 = {
  provider: 'gemini',
  systemPrompt: 'You are an expert OCR system specializing in extracting structured data from memorial inscriptions. Focus on accurate extraction, proper type conversion, and strict validation of numeric values.',
  formatInstructions: 'Return data as a JSON object with these requirements:\n- memorial_number: string or null\n- first_name: string or null\n- last_name: string or null\n- year_of_death: integer between 1500-current year or null (must be a number, not text)\n- inscription: string or null\nHandle missing or uncertain values with null. Years must be actual integers, not strings.',
  typeFormatting: {
    integer: 'numeric',
    float: 'decimal',
    string: 'text',
    boolean: 'true/false',
    date: 'YYYY-MM-DD',
    array: 'list'
  }
};

// Initialize the prompt manager with default templates
const promptManager = new ProviderPromptManager();

// Register templates with versions
promptManager.registerPromptTemplate('openai', openaiTemplate, '1.0');
promptManager.registerPromptTemplate('openai', openaiTemplateV2, '2.0');
promptManager.registerPromptTemplate('openai', openaiTemplateV2); // Register latest

promptManager.registerPromptTemplate('anthropic', anthropicTemplate, '1.0');
promptManager.registerPromptTemplate('anthropic', anthropicTemplateV2, '2.0');
promptManager.registerPromptTemplate('anthropic', anthropicTemplateV2); // Register latest

promptManager.registerPromptTemplate('gemini', geminiTemplate, '1.0');
promptManager.registerPromptTemplate('gemini', geminiTemplateV2, '2.0');
promptManager.registerPromptTemplate('gemini', geminiTemplateV2); // Register latest

// Create instances of MemorialOCRPrompt for each provider
const memorialOCRTemplates = {
  openai: new MemorialOCRPrompt({
    version: '2.0.0',
    provider: 'openai',
    fields: MEMORIAL_FIELDS
  }),
  anthropic: new MemorialOCRPrompt({
    version: '2.0.0',
    provider: 'anthropic',
    fields: MEMORIAL_FIELDS
  }),
  gemini: new MemorialOCRPrompt({
    version: '2.0.0',
    provider: 'gemini',
    fields: MEMORIAL_FIELDS
  }),
  mistral: new MemorialOCRPrompt({
    version: '2.0.0',
    provider: 'mistral',
    fields: MEMORIAL_FIELDS
  }),
  mock: new MemorialOCRPrompt({
    version: '1.0.0',
    provider: 'mock',
    fields: MEMORIAL_FIELDS
  })
};

const burialRegisterTemplates = {
  openai: new BurialRegisterPrompt({
    version: '1.0.0',
    provider: 'openai'
  }),
  anthropic: new BurialRegisterPrompt({
    version: '1.0.0',
    provider: 'anthropic'
  }),
  gemini: new BurialRegisterPrompt({
    version: '1.0.0',
    provider: 'gemini'
  }),
  mistral: new BurialRegisterPrompt({
    version: '1.0.0',
    provider: 'mistral'
  }),
  mock: new BurialRegisterPrompt({
    version: '1.0.0',
    provider: 'mock'
  })
};

const monumentPhotoOCRTemplates = {
  openai: new MonumentPhotoOCRPrompt({
    version: '1.0.0',
    provider: 'openai',
    fields: MEMORIAL_FIELDS
  }),
  anthropic: new MonumentPhotoOCRPrompt({
    version: '1.0.0',
    provider: 'anthropic',
    fields: MEMORIAL_FIELDS
  }),
  gemini: new MonumentPhotoOCRPrompt({
    version: '1.0.0',
    provider: 'gemini',
    fields: MEMORIAL_FIELDS
  }),
  mistral: new MonumentPhotoOCRPrompt({
    version: '1.0.0',
    provider: 'mistral',
    fields: MEMORIAL_FIELDS
  }),
  mock: new MonumentPhotoOCRPrompt({
    version: '1.0.0',
    provider: 'mock',
    fields: MEMORIAL_FIELDS
  })
};

const graveCardTemplates = {
  openai: new GraveCardPrompt({
    version: '1.0.0',
    provider: 'openai'
  }),
  anthropic: new GraveCardPrompt({
    version: '1.0.0',
    provider: 'anthropic'
  }),
  gemini: new GraveCardPrompt({
    version: '1.0.0',
    provider: 'gemini'
  }),
  mistral: new GraveCardPrompt({
    version: '1.0.0',
    provider: 'mistral'
  }),
  mock: new GraveCardPrompt({
    version: '1.0.0',
    provider: 'mock'
  })
};

const typographicAnalysisTemplates = {
  openai: new TypographicAnalysisPrompt({
    version: '2.3.0',
    provider: 'openai',
    fields: MEMORIAL_FIELDS
  }),
  anthropic: new TypographicAnalysisPrompt({
    version: '2.3.0',
    provider: 'anthropic',
    fields: MEMORIAL_FIELDS
  }),
  gemini: new TypographicAnalysisPrompt({
    version: '2.3.0',
    provider: 'gemini',
    fields: MEMORIAL_FIELDS
  }),
  mistral: new TypographicAnalysisPrompt({
    version: '2.3.0',
    provider: 'mistral',
    fields: MEMORIAL_FIELDS
  }),
  mock: new TypographicAnalysisPrompt({
    version: '1.0.0',
    provider: 'mock',
    fields: MEMORIAL_FIELDS
  })
};

const monumentClassificationTemplates = {
  openai: new MonumentClassificationPrompt({
    version: '1.0.0',
    provider: 'openai'
  }),
  anthropic: new MonumentClassificationPrompt({
    version: '1.0.0',
    provider: 'anthropic'
  }),
  gemini: new MonumentClassificationPrompt({
    version: '1.0.0',
    provider: 'gemini'
  }),
  mistral: new MonumentClassificationPrompt({
    version: '1.0.0',
    provider: 'mistral'
  }),
  mock: new MonumentClassificationPrompt({
    version: '1.0.0',
    provider: 'mock'
  })
};



/**
 * Get a prompt template for a provider
 * @param {string} provider The AI provider name
 * @param {string} templateName The template name
 * @param {string} version The template version
 * @returns {Object} The prompt template
 */
const getPrompt = (provider, templateName, version = 'latest') => {
  // Handle burial register template
  if (templateName === 'burialRegister') {
    const promptInstance = burialRegisterTemplates[provider];
    if (!promptInstance) {
      throw new Error(`No burial register template found for provider: ${provider}`);
    }
    return promptInstance;
  }

  // Handle monument photo OCR template
  if (templateName === 'monumentPhotoOCR') {
    const promptInstance = monumentPhotoOCRTemplates[provider];
    if (!promptInstance) {
      throw new Error(`No monument photo OCR template found for provider: ${provider}`);
    }
    return promptInstance;
  }

  // Handle grave card template
  if (templateName === 'graveCard') {
    const promptInstance = graveCardTemplates[provider];
    if (!promptInstance) {
      throw new Error(`No grave card template found for provider: ${provider}`);
    }
    return promptInstance;
  }

  // Handle existing memorialOCR template
  if (templateName === 'memorialOCR') {
    const promptInstance = memorialOCRTemplates[provider];
    if (!promptInstance) {
      throw new Error(`No memorial OCR template found for provider: ${provider}`);
    }
    return promptInstance;
  }

  // Handle typographic analysis template
  if (templateName === 'typographicAnalysis') {
    const promptInstance = typographicAnalysisTemplates[provider];
    if (!promptInstance) {
      throw new Error(`No typographic analysis template found for provider: ${provider}`);
    }
    return promptInstance;
  }

  // Handle monument classification template
  if (templateName === 'monumentClassification') {
    const promptInstance = monumentClassificationTemplates[provider];
    if (!promptInstance) {
      throw new Error(`No monument classification template found for provider: ${provider}`);
    }
    return promptInstance;
  }

  const template = promptManager.getPromptTemplate(provider, templateName, version);
  if (!template) {
    throw new Error(`Invalid template configuration for provider ${provider}`);
  }
  return template;
};

module.exports = {
  promptManager,
  openaiTemplate,
  openaiTemplateV2,
  anthropicTemplate,
  anthropicTemplateV2,
  getPrompt
};