const BasePrompt = require('../BasePrompt');
const { MEMORIAL_FIELDS } = require('../types/memorialFields');
const { ProcessingError } = require('../../errorTypes');
const { preprocessName } = require('../../nameProcessing');
const logger = require('../../logger');

/**
 * Monument Photo OCR prompt for extracting memorial data from monument/headstone photos
 * @extends BasePrompt
 */
class MonumentPhotoOCRPrompt extends BasePrompt {
  /**
   * Create a new monument photo OCR prompt
   * @param {Object} config Configuration options
   */
  constructor(config = {}) {
    super({
      version: '1.0.0',
      description: 'OCR prompt for extracting memorial data from monument photos with weathered stone considerations',
      fields: MEMORIAL_FIELDS,
      providers: ['openai', 'anthropic', 'gemini', 'mistral', 'mock'],
      ...config
    });
  }

  /**
   * Get the complete prompt text with monument-specific instructions
   * @returns {string} Formatted prompt text
   */
  getPromptText() {
    return `You are transcribing monument and headstone photographs for genealogical records. Genealogical transcription standards require exact reproduction of visible text without interpretation or guessing. When text is illegible or weathered beyond recognition, standard practice is to use dashes (-) to indicate the approximate number of unreadable characters.

Your task is to extract specific fields from monument photos and return them in JSON format.

MONUMENT-SPECIFIC CHALLENGES:
- Text may be carved in stone and weathered over time
- Letters may be partially obscured or damaged
- Text may be at angles due to photo perspective
- Stone may have moss, dirt, or weathering affecting readability
- Multiple names/dates may be present on the same monument
- Decorative elements (crosses, flowers, symbols) may be present

TRANSCRIPTION RULES - DO:
- Transcribe only text that is clearly visible and readable
- Preserve original spelling, punctuation, and capitalization exactly as engraved
- Use single dashes (-) for each illegible character or digit
- Include all visible text: names, dates, epitaphs, symbols described in words
- Maintain line breaks from the original inscription using | as line separator
- Extract only the very first personal name that appears on the headstone

TRANSCRIPTION RULES - DO NOT:
- Guess at illegible characters or dates
- Correct apparent spelling errors
- Add punctuation that isn't clearly visible
- Interpret abbreviations or symbols
- Include text that is completely obscured or missing
- Extract names from epitaphs or phrases like "MOTHER" or "FATHER"
- Use brackets like [?], [WEATHERED], [5?] - ONLY use single dashes (-)
- Use \\n for line breaks - ONLY use | as line separator

CRITICAL: Return ONLY these 5 fields in JSON format, nothing more:
- memorial_number: Set to null (the system will assign this from the filename)
- first_name: The first person's first name only (STRING, UPPERCASE)
- last_name: The first person's last name (STRING, UPPERCASE) 
- year_of_death: The first person's year of death only (INTEGER or STRING with dashes)
- inscription: The complete inscription text (STRING)

NAME EXTRACTION RULES:
- Extract the first person's first name and last name that appear on the headstone
- Look carefully for both first and last names - they may be on the same line or separate lines
- If first name contains illegible characters, transcribe with dashes (e.g., "J---")
- If last name contains illegible characters, transcribe with dashes (e.g., "SM---" or "---TH")
- If a name is partially weathered but some letters are visible, use dashes for illegible portions
- If no clear personal names are visible, use single dash (-) for both name fields
- Do not extract names from epitaphs or phrases like "MOTHER" or "FATHER"
- If surname is shared/implied (like on family stones), use the family surname

YEAR OF DEATH RULES:
- Extract the death year that corresponds to the person whose first_name and last_name were extracted
- Use only the 4-digit year from the death date (not birth date)
- If year contains illegible characters, transcribe with dashes (e.g., "19--" or "1-84")
- If no death year is visible for that person, use single dash (-)
- For date ranges like "1842-1901", extract "1901" as the death year

Example of EXACT JSON format required:

{
  "memorial_number": null,
  "first_name": "JOHN", 
  "last_name": "SMITH",
  "year_of_death": 1900,
  "inscription": "SACRED TO THE MEMORY OF|JOHN SMITH|WHO DEPARTED THIS LIFE|JANUARY 1ST 1900|AGED 70 YEARS|R.I.P."
}

Additional examples with illegible text:

{
  "memorial_number": null,
  "first_name": "J---",
  "last_name": "SMITH", 
  "year_of_death": "19--",
  "inscription": "J--- SMITH|18-- - 19--|BELOVED HUSBAND|REST IN ---CE"
}

{
  "memorial_number": null,
  "first_name": "NATHANIEL",
  "last_name": "---SON",
  "year_of_death": 1857,
  "inscription": "In memory of|NATHANIEL ---SON|Who died|April 10, 1857|AEt 12 yrs."
}

IMPORTANT VALIDATION RULES:
- memorial_number: Always set to null (system will assign from filename)
- first_name/last_name: Must be UPPERCASE strings, use dashes for illegible characters
- year_of_death: Must be integer between 1500-2030, or string with dashes for illegible portions
- inscription: Complete text as it appears on the monument, use | for line breaks
- Use null for any field that cannot be determined at all
- Use single dash (-) for completely illegible name fields

Follow genealogical transcription standards - transcribe exactly what is visible without interpretation or guessing.`;
  }

  /**
   * Get provider-specific prompt formatting
   * @param {string} provider The AI provider (openai, anthropic)
   * @returns {Object|string} Provider-specific prompt format
   */
  getProviderPrompt(provider) {
    const basePrompt = this.getPromptText();

    if (provider === 'openai') {
      return {
        systemPrompt: 'You are an expert OCR system specializing in reading weathered stone monuments and headstones for genealogical records. You follow genealogical transcription standards, transcribing exactly what is visible without interpretation or guessing. You excel at extracting structured data from monument photos, handling challenges like weathered stone, carved text at angles, and partially obscured inscriptions. CRITICAL: Use single dashes (-) for illegible characters, never use brackets like [?] or [WEATHERED]. Use | for line breaks, never \\n.',
        userPrompt: basePrompt + '\n\nIMPORTANT FORMATTING RULES:\n- Use ONLY single dashes (-) for illegible text, never [?] or [WEATHERED]\n- Use ONLY | for line breaks, never \\n\n- Extract memorial data as JSON with these exact fields: memorial_number, first_name, last_name, year_of_death, inscription'
      };
    } else if (provider === 'anthropic') {
      return {
        systemPrompt: 'You are Claude, an expert OCR system trained by Anthropic, specializing in reading weathered stone monuments and headstones for genealogical records. You follow genealogical transcription standards, transcribing exactly what is visible without interpretation or guessing. You excel at extracting structured data from monument photos, handling challenges like weathered stone, carved text at angles, and partially obscured inscriptions. CRITICAL: Use single dashes (-) for illegible characters, never use brackets like [?] or [WEATHERED]. Use | for line breaks, never \\n.',
        userPrompt: `${basePrompt}\n\nCRITICAL FORMATTING REQUIREMENTS:\n- Use ONLY single dashes (-) for illegible text, NEVER [?], [WEATHERED], [5?]\n- Use ONLY | for line breaks, NEVER \\n\n- Return valid JSON only\n- year_of_death can be integer (1500-2030) OR string with dashes for illegible portions (e.g., "19--")\n- All text fields must be properly formatted strings\n- Follow genealogical transcription standards exactly\n- Do not include any explanatory text, only return the JSON object`
      };
    } else if (provider === 'gemini') {
      return {
        systemPrompt: 'You are Gemini, an expert OCR system created by Google, specializing in reading weathered stone monuments and headstones for genealogical records. You follow genealogical transcription standards, transcribing exactly what is visible without interpretation or guessing. You excel at extracting structured data from monument photos, handling challenges like weathered stone, carved text at angles, and partially obscured inscriptions. CRITICAL: Use single dashes (-) for illegible characters, never use brackets like [?] or [WEATHERED]. Use | for line breaks, never \\n.',
        userPrompt: `${basePrompt}\n\nCRITICAL FORMATTING REQUIREMENTS:\n- Use ONLY single dashes (-) for illegible text, NEVER [?], [WEATHERED], [5?]\n- Use ONLY | for line breaks, NEVER \\n\n- Return valid JSON only\n- year_of_death can be integer (1500-2030) OR string with dashes for illegible portions (e.g., "19--")\n- All text fields must be properly formatted strings\n- Follow genealogical transcription standards exactly\n- Do not include any explanatory text, only return the JSON object`
      };
    } else if (provider === 'mistral') {
      return {
        systemPrompt: 'You are an expert OCR system specializing in reading weathered stone monuments and headstones for genealogical records. You follow genealogical transcription standards, transcribing exactly what is visible without interpretation or guessing. CRITICAL: Use single dashes (-) for illegible characters, never use brackets like [?] or [WEATHERED]. Use | for line breaks, never \\n.',
        userPrompt: `${basePrompt}\n\nCRITICAL FORMATTING REQUIREMENTS:\n- Use ONLY single dashes (-) for illegible text, NEVER [?], [WEATHERED], [5?]\n- Use ONLY | for line breaks, NEVER \\n\n- Return valid JSON only\n- year_of_death can be integer (1500-2030) OR string with dashes for illegible portions (e.g., "19--")\n- All text fields must be properly formatted strings\n- Follow genealogical transcription standards exactly\n- Do not include any explanatory text, only return the JSON object`
      };
    }

    throw new Error(`Unsupported provider: ${provider}`);
  }

  /**
   * Validate and convert monument photo OCR data with enhanced processing
   * @param {Object} rawData Raw data from OCR processing
   * @returns {Object} Validated and converted data
   */
  validateAndConvert(rawData) {
    logger.info(`[MonumentPhotoOCRPrompt] Raw data input: ${JSON.stringify(rawData, null, 2)}`);

    if (!rawData || typeof rawData !== 'object') {
      throw new ProcessingError('Invalid monument OCR data: expected object', 'validation_error');
    }

    // Check if all fields are empty (monument-specific empty check)
    // Allow dash-based illegible characters as valid content
    const allFieldsEmpty = this.fields.every(field => {
      const value = rawData[field.name];
      if (!value) return true;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        // Consider single dash as valid content (indicates illegible but present text)
        return trimmed === '' || trimmed === 'null';
      }
      return false;
    });

    if (allFieldsEmpty) {
      throw new ProcessingError(
        'No readable text found on the monument - please check if the monument is weathered or the image quality is sufficient',
        'empty_monument'
      );
    }

    const result = {};

    // Process name fields first with monument-specific handling
    if (rawData.first_name || rawData.last_name) {
      // Handle cases where OCR only found first_name or only last_name
      if (rawData.first_name && !rawData.last_name) {
        // If only first_name provided, use it as-is (don't duplicate)
        result.first_name = rawData.first_name;
        result.last_name = null;
      } else if (!rawData.first_name && rawData.last_name) {
        // If only last_name provided, leave first_name empty
        result.first_name = null;
        result.last_name = rawData.last_name;
      } else if (rawData.first_name && rawData.last_name) {
        // Both names provided - check if they're the same (duplication issue)
        if (rawData.first_name === rawData.last_name) {
          // Duplication detected - use only as first_name
          result.first_name = rawData.first_name;
          result.last_name = null;
        } else {
          // Different names - process normally
          const fullName = [rawData.first_name, rawData.last_name].filter(Boolean).join(' ');
          const processedName = preprocessName(fullName);

          result.first_name = processedName.firstName || rawData.first_name;
          result.last_name = processedName.lastName || rawData.last_name;
        }
      }
    }

    // Process remaining fields using array-based field definitions
    for (const field of this.fields) {
      if (field.name !== 'first_name' && field.name !== 'last_name') {
        const value = rawData[field.name];
        logger.info(`[MonumentPhotoOCRPrompt] Processing field ${field.name}:`, value, typeof value);

        if (value !== undefined) {
          try {
            // Special handling for memorial_number - use provided value or null
            if (field.name === 'memorial_number') {
              // Use the value if provided (from filename extraction), otherwise null
              result[field.name] = value || null;
            }
            // Special handling for year_of_death to allow dash-based illegible characters
            else if (field.name === 'year_of_death') {
              result[field.name] = this.validateYearOfDeath(value);
            } else {
              result[field.name] = this.validateField(field.name, value);
            }
            logger.info(`[MonumentPhotoOCRPrompt] Validated ${field.name}:`, result[field.name]);
          } catch (error) {
            logger.error(`[MonumentPhotoOCRPrompt] Validation error for ${field.name}:`, error.message);
            throw error;
          }
        }
      }
    }

    // Additional monument-specific processing
    if (result.inscription) {
      result.inscription = this.processMonumentInscription(result.inscription);
    }

    logger.info(`[MonumentPhotoOCRPrompt] Final result: ${JSON.stringify(result, null, 2)}`);
    return { data: result, confidenceScores: {}, validationWarnings: [] };
  }

  /**
   * Validate year of death field with support for dash-based illegible characters
   * @param {*} value The year of death value to validate
   * @returns {number|string} Validated year of death
   */
  validateYearOfDeath(value) {
    if (value === null || value === undefined) {
      return null;
    }

    // Handle string values that may contain dashes for illegible characters
    if (typeof value === 'string') {
      const trimmed = value.trim();

      // Allow single dash for completely illegible year
      if (trimmed === '-') {
        return '-';
      }

      // Allow dash patterns like "19--", "1-84", etc.
      if (/^\d*-+\d*$/.test(trimmed) && trimmed.length >= 2) {
        return trimmed;
      }

      // Try to parse as integer if no dashes
      const parsed = parseInt(trimmed, 10);
      if (!isNaN(parsed) && parsed >= 1500 && parsed <= 2030) {
        return parsed;
      }

      // If it's not a valid pattern, return as-is for genealogical accuracy
      return trimmed;
    }

    // Handle numeric values
    if (typeof value === 'number') {
      if (value >= 1500 && value <= 2030) {
        return Math.floor(value);
      }
      throw new ProcessingError(`Year of death must be between 1500-2030, got: ${value}`, 'validation_error');
    }

    return value;
  }

  /**
   * Process monument inscription text with monument-specific considerations
   * @param {string} inscription Raw inscription text
   * @returns {string} Processed inscription text
   */
  processMonumentInscription(inscription) {
    if (!inscription || typeof inscription !== 'string') {
      return inscription;
    }

    // Preserve monument-specific elements and genealogical formatting
    let processed = inscription;

    // Ensure line breaks are properly formatted with | separator
    // Replace any \n that might have slipped through with |
    processed = processed.replace(/\\n/g, '|').replace(/\n/g, '|');

    return processed;
  }
}

module.exports = MonumentPhotoOCRPrompt;
