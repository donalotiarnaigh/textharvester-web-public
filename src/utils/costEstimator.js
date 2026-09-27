const { promisify } = require('util');

/**
 * CostEstimator — estimates batch processing costs before submission
 * Uses historical average token usage per file, falls back to conservative defaults
 */
class CostEstimator {
  constructor(db, config) {
    this.db = db;
    this.config = config;
    this.dbGet = promisify(db.get.bind(db));

    // Default token estimates per source type (when no historical data exists)
    this.defaultTokens = {
      record_sheet: { input: 1500, output: 800 },
      memorial: { input: 1500, output: 800 },
      monument_photo: { input: 1500, output: 800 },
      typographic_analysis: { input: 2500, output: 1500 },
      monument_classification: { input: 2000, output: 800 },
      burial_register: { input: 3000, output: 2000 },
      grave_record_card: { input: 4000, output: 2500 },
    };

    // PDF page multiplier (for non-grave-card types)
    this.pdfPageMultiplier = 3;
  }

  /**
   * Get historical average tokens per file for a source type and provider
   * @param {string} sourceType - source type key
   * @param {string} provider - provider key (openai, anthropic, gemini)
   * @returns {Promise<{avgInputTokens: number, avgOutputTokens: number, sampleSize: number}>}
   */
  async getHistoricalAverages(sourceType, provider) {
    // Normalize source type for table selection
    let table;
    let sql;

    if (['burial_register'].includes(sourceType)) {
      // Burial register: group by file_name to get per-file totals, then average
      sql = `
        SELECT
          AVG(total_input) as avg_input_tokens,
          AVG(total_output) as avg_output_tokens,
          COUNT(*) as sample_size
        FROM (
          SELECT file_name,
            SUM(input_tokens) as total_input,
            SUM(output_tokens) as total_output
          FROM burial_register_entries
          WHERE ai_provider = ? AND input_tokens > 0
          GROUP BY file_name
        )
      `;
    } else if (['grave_record_card'].includes(sourceType)) {
      // Grave cards: one row per file
      sql = `
        SELECT
          AVG(input_tokens) as avg_input_tokens,
          AVG(output_tokens) as avg_output_tokens,
          COUNT(*) as sample_size
        FROM grave_cards
        WHERE ai_provider = ? AND input_tokens > 0
      `;
    } else {
      // Memorials: covers record_sheet, monument_photo, memorial, typographic_analysis
      sql = `
        SELECT
          AVG(input_tokens) as avg_input_tokens,
          AVG(output_tokens) as avg_output_tokens,
          COUNT(*) as sample_size
        FROM memorials
        WHERE ai_provider = ? AND input_tokens > 0
      `;
    }

    try {
      const result = await this.dbGet(sql, [provider]);

      if (!result || result.sample_size === 0) {
        return { avgInputTokens: 0, avgOutputTokens: 0, sampleSize: 0 };
      }

      return {
        avgInputTokens: Math.round(result.avg_input_tokens || 0),
        avgOutputTokens: Math.round(result.avg_output_tokens || 0),
        sampleSize: result.sample_size || 0,
      };
    } catch (err) {
      // If query fails, return zeros (will use defaults)
      return { avgInputTokens: 0, avgOutputTokens: 0, sampleSize: 0 };
    }
  }

  /**
   * Estimate batch processing cost
   * @param {object} params
   * @param {number} params.fileCount - number of files
   * @param {string} params.provider - provider key (openai, anthropic, gemini)
   * @param {string} params.sourceType - source type
   * @param {number} [params.pdfCount=0] - number of PDF files (for page multiplier)
   * @returns {Promise<object>} CostEstimateResult
   */
  async estimateBatchCost({ fileCount, provider, sourceType, pdfCount = 0 }) {
    // Get historical averages
    const histAvg = await this.getHistoricalAverages(sourceType, provider);

    // Determine if using defaults
    const isDefault = histAvg.sampleSize === 0;

    // Get input/output tokens per file
    let inputTokens = histAvg.avgInputTokens;
    let outputTokens = histAvg.avgOutputTokens;

    if (isDefault) {
      // Map custom schemas and other types to defaults
      const mappedType = sourceType.startsWith('custom:') ? 'record_sheet' : sourceType;
      const defaults = this.defaultTokens[mappedType] || this.defaultTokens.record_sheet;
      inputTokens = defaults.input;
      outputTokens = defaults.output;
    }

    // Calculate effective file count (apply PDF page multiplier)
    let effectiveFileCount = fileCount;
    if (sourceType !== 'grave_record_card' && pdfCount > 0) {
      // For non-grave-card types: replace PDF count with (PDF count * multiplier)
      effectiveFileCount = (fileCount - pdfCount) + (pdfCount * this.pdfPageMultiplier);
    }

    // Get cost config for provider/model
    const modelKey = this._resolveModelKey(provider);
    const costConfig = this.config.costs[provider]?.[modelKey];

    if (!costConfig) {
      throw new Error(`No cost configuration for provider=${provider}, model=${modelKey}`);
    }

    // Calculate cost per file
    const costPerFile =
      (inputTokens / 1_000_000) * (costConfig.inputPerMToken || 0) +
      (outputTokens / 1_000_000) * (costConfig.outputPerMToken || 0);

    // Calculate total cost
    const totalCost = costPerFile * effectiveFileCount;

    // Get session cap
    const sessionCap = this.config.costs.maxCostPerSession || 5.0;

    return {
      estimatedTotalCost: parseFloat(totalCost.toFixed(2)),
      estimatedPerFileCost: parseFloat(costPerFile.toFixed(4)),
      effectiveFileCount,
      sessionCap,
      exceedsCap: totalCost > sessionCap,
      pctOfCap: parseFloat(((totalCost / sessionCap) * 100).toFixed(1)),
      provider,
      model: modelKey,
      sampleSize: histAvg.sampleSize,
      isDefault,
      disclaimer: 'Estimates are approximate based on historical averages. Actual costs may vary.',
    };
  }

  /**
   * Resolve model key from provider
   * Maps config keys (openAI, anthropic, gemini) to cost keys (openai, anthropic, gemini)
   * @private
   */
  _resolveModelKey(provider) {
    const providerMap = {
      openai: this.config.openAI?.model,
      anthropic: this.config.anthropic?.model,
      gemini: this.config.gemini?.model,
    };

    return providerMap[provider];
  }
}

module.exports = CostEstimator;
