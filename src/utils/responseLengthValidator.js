const logger = require('./logger');

/**
 * ResponseLengthValidator - Prevents and handles response length issues
 * Implements TDD approach for response length validation and truncation prevention
 */
class ResponseLengthValidator {
  constructor() {
    this.providerLimits = {
      anthropic: {
        maxResponseLength: 22000,    // Conservative limit based on observed truncation
        warningThreshold: 18000,     // 80% of max
        criticalThreshold: 20000,    // 90% of max
        maxPromptLength: 15000,      // Max prompt length to prevent oversized responses
        retryPromptLength: 8000      // Shorter prompt for retry attempts
      },
      openai: {
        maxResponseLength: 50000,    // OpenAI can handle longer responses
        warningThreshold: 40000,     // 80% of max
        criticalThreshold: 45000,    // 90% of max
        maxPromptLength: 30000,      // Max prompt length
        retryPromptLength: 20000     // Shorter prompt for retry attempts
      }
    };
  }

  /**
   * Get provider-specific limits
   * @param {string} provider - AI provider name
   * @returns {Object} Provider limits
   */
  getProviderLimits(provider) {
    return this.providerLimits[provider] || this.providerLimits.anthropic;
  }

  /**
   * Validate response length and determine if action is needed
   * @param {string} response - API response text
   * @param {string} provider - AI provider name
   * @returns {Object} Validation result
   */
  validateResponseLength(response, provider) {
    const limits = this.getProviderLimits(provider);
    const length = response.length;
    const percentage = (length / limits.maxResponseLength) * 100;

    const result = {
      length,
      maxLength: limits.maxResponseLength,
      percentage: Math.round(percentage * 100) / 100,
      isApproachingLimit: length >= limits.warningThreshold,
      exceedsLimit: length >= limits.maxResponseLength,
      needsTruncation: length >= limits.criticalThreshold,
      provider
    };

    logger.info(`[ResponseLengthValidator] Response length validation: ${length} chars (${percentage.toFixed(1)}% of ${limits.maxResponseLength} limit)`);
    
    if (result.exceedsLimit) {
      logger.warn(`[ResponseLengthValidator] Response exceeds limit for ${provider}: ${length}/${limits.maxResponseLength} chars`);
    } else if (result.isApproachingLimit) {
      logger.info(`[ResponseLengthValidator] Response approaching limit for ${provider}: ${length}/${limits.maxResponseLength} chars`);
    }

    return result;
  }

  /**
   * Truncate prompt to prevent oversized responses
   * @param {string} prompt - Original prompt
   * @param {string} provider - AI provider name
   * @returns {string} Truncated prompt
   */
  truncatePromptForProvider(prompt, provider) {
    const limits = this.getProviderLimits(provider);
    
    if (prompt.length <= limits.maxPromptLength) {
      return prompt;
    }

    logger.info(`[ResponseLengthValidator] Truncating prompt for ${provider}: ${prompt.length} -> ${limits.maxPromptLength} chars`);

    // Preserve essential elements while truncating
    const essentialElements = [
      'first_name', 'last_name', 'year_of_death', 'inscription',
      'memorial_number', 'JSON format', 'monument', 'headstone'
    ];

    // Find the best truncation point that preserves essential elements
    let truncatedPrompt = prompt.substring(0, limits.maxPromptLength);
    
    // Try to end at a complete sentence or instruction
    const lastSentenceEnd = Math.max(
      truncatedPrompt.lastIndexOf('.'),
      truncatedPrompt.lastIndexOf('!'),
      truncatedPrompt.lastIndexOf('?')
    );

    if (lastSentenceEnd > limits.maxPromptLength * 0.8) {
      truncatedPrompt = truncatedPrompt.substring(0, lastSentenceEnd + 1);
    }

    // Ensure essential elements are preserved
    const missingElements = essentialElements.filter(element => 
      !truncatedPrompt.toLowerCase().includes(element.toLowerCase())
    );

    if (missingElements.length > 0) {
      logger.warn(`[ResponseLengthValidator] Missing essential elements after truncation: ${missingElements.join(', ')}`);
      
      // Add missing essential elements if there's space
      const addition = `\n\nExtract: ${missingElements.join(', ')} in JSON format.`;
      if (truncatedPrompt.length + addition.length <= limits.maxPromptLength) {
        truncatedPrompt += addition;
      }
    }

    // Ensure we actually truncated - force truncation if needed
    if (truncatedPrompt.length >= prompt.length) {
      truncatedPrompt = prompt.substring(0, limits.maxPromptLength - 200); // Force truncation with buffer
    }

    return truncatedPrompt;
  }

  /**
   * Generate a shorter prompt for retry attempts
   * @param {string} originalPrompt - Original prompt that caused issues
   * @param {string} provider - AI provider name
   * @returns {string} Shorter retry prompt
   */
  generateRetryPrompt(originalPrompt, provider) {
    const limits = this.getProviderLimits(provider);
    
    logger.info(`[ResponseLengthValidator] Generating retry prompt for ${provider}: ${originalPrompt.length} -> ${limits.retryPromptLength} chars`);

    // Create a minimal but effective prompt
    const retryPrompt = `Extract essential data only from this monument photo. Return JSON with:
- first_name: First person's first name (UPPERCASE)
- last_name: First person's last name (UPPERCASE) 
- year_of_death: Death year (integer or string with dashes)
- inscription: Complete text using | for line breaks
- memorial_number: null (system will assign)

Keep inscription concise. Use single dashes (-) for illegible characters.`;

    return retryPrompt;
  }

  /**
   * Validate and repair JSON response
   * @param {string} jsonString - JSON string to validate
   * @returns {Object} Validation and repair result
   */
  validateAndRepairJson(jsonString) {
    try {
      // Try parsing as-is first
      const parsed = JSON.parse(jsonString);
      return {
        isValid: true,
        repaired: false,
        json: parsed,
        originalLength: jsonString.length
      };
    } catch (error) {
      logger.warn(`[ResponseLengthValidator] JSON parsing failed: ${error.message}`);
      
      // Attempt to repair truncated JSON
      const repaired = this.repairTruncatedJson(jsonString);
      
      if (repaired) {
        try {
          const parsed = JSON.parse(repaired);
          return {
            isValid: true,
            repaired: true,
            json: parsed,
            originalLength: jsonString.length,
            repairedLength: repaired.length
          };
        } catch (repairError) {
          logger.error(`[ResponseLengthValidator] JSON repair failed: ${repairError.message}`);
        }
      }

      return {
        isValid: false,
        repaired: false,
        error: `Invalid JSON: ${error.message}`,
        originalLength: jsonString.length
      };
    }
  }

  /**
   * Repair truncated JSON by adding missing closing elements
   * @param {string} jsonString - Truncated JSON string
   * @returns {string|null} Repaired JSON string or null if repair not possible
   */
  repairTruncatedJson(jsonString) {
    if (!jsonString || jsonString.length < 10) {
      return null;
    }

    let repaired = jsonString.trim();
    
    // Count opening and closing braces
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;
    
    // Count opening and closing quotes
    const openQuotes = (repaired.match(/"/g) || []).length;
    
    // If we're in the middle of a string, try to close it
    if (openQuotes % 2 === 1) {
      // Find the last unclosed quote
      const lastQuoteIndex = repaired.lastIndexOf('"');
      if (lastQuoteIndex > 0) {
        // Check if we're in a string value
        const beforeQuote = repaired.substring(0, lastQuoteIndex);
        const lastColon = beforeQuote.lastIndexOf(':');
        const lastComma = beforeQuote.lastIndexOf(',');
        
        if (lastColon > lastComma) {
          // We're in a string value, close it
          repaired = repaired.substring(0, lastQuoteIndex + 1);
        }
      }
    }
    
    // Add missing closing braces
    const missingBraces = openBraces - closeBraces;
    if (missingBraces > 0) {
      repaired += '}'.repeat(missingBraces);
    }
    
    // If we ended with a comma, remove it
    if (repaired.endsWith(',')) {
      repaired = repaired.slice(0, -1);
    }
    
    logger.info(`[ResponseLengthValidator] JSON repair attempt: ${jsonString.length} -> ${repaired.length} chars`);
    
    return repaired;
  }

  /**
   * Estimate response length based on prompt and image characteristics
   * @param {string} prompt - Prompt text
   * @param {Object} imageMetadata - Image metadata
   * @param {string} provider - AI provider name
   * @returns {Object} Length estimation
   */
  estimateResponseLength(prompt, imageMetadata, provider) {
    const limits = this.getProviderLimits(provider);
    
    // Base estimation factors
    const baseLength = 500; // Minimum JSON response
    const promptFactor = prompt.length * 0.1; // Prompt complexity factor
    const imageFactor = (imageMetadata.width * imageMetadata.height) / 1000000; // Image size factor
    const monumentFactor = 2000; // Monument photos tend to have longer inscriptions
    
    const estimatedLength = Math.round(baseLength + promptFactor + imageFactor + monumentFactor);
    const percentage = (estimatedLength / limits.maxResponseLength) * 100;
    
    const estimation = {
      estimatedLength,
      maxLength: limits.maxResponseLength,
      percentage: Math.round(percentage * 100) / 100,
      isLikelyToExceed: estimatedLength > limits.warningThreshold,
      needsPrevention: estimatedLength > limits.criticalThreshold,
      factors: {
        base: baseLength,
        prompt: Math.round(promptFactor),
        image: Math.round(imageFactor),
        monument: monumentFactor
      }
    };
    
    logger.info(`[ResponseLengthValidator] Response length estimation: ${estimatedLength} chars (${percentage.toFixed(1)}% of limit)`);
    
    return estimation;
  }
}

module.exports = { ResponseLengthValidator };
