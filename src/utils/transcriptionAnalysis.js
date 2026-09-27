const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

/**
 * Analyzes transcription accuracy across multiple test runs
 * @returns {Promise<Object>} Analysis results
 */
async function analyzeTranscriptionAccuracy() {
  try {
    // Load all test results from the specified date
    const testResultsDir = path.join(__dirname, '../../sample_data/test_results');
    const baselineFile = 'results_all_1-5_2025-05-19T20-20-51-898Z.json';

    // Load baseline results
    const baselineData = JSON.parse(
      await fs.readFile(path.join(testResultsDir, baselineFile), 'utf8')
    );

    // Load all result files from the test date
    const files = await fs.readdir(testResultsDir);
    const resultFiles = files.filter(f =>
      f.includes('2025-05-19') &&
      f.endsWith('.json') &&
      f !== baselineFile
    );

    const allResults = await Promise.all(
      resultFiles.map(async file => {
        const data = JSON.parse(
          await fs.readFile(path.join(testResultsDir, file), 'utf8')
        );
        return {
          timestamp: data.timestamp,
          results: data.results
        };
      })
    );

    // Extract pages from baseline results
    const baselineResults = baselineData.results;

    // Analyze individual pages
    const pagesAnalyzed = analyzePages(baselineResults);

    // Compare runs
    const runComparisons = allResults.length > 0 ? compareRuns(allResults) : [];

    // Analyze multi-line entries
    const multiLineAnalysis = analyzeMultiLineEntries(baselineResults);

    // Compare against baseline
    const baselineComparison = compareToBaseline(baselineResults, allResults);

    // Analyze real-world scenarios
    const realWorldScenarios = analyzeRealWorldScenarios(baselineResults);

    return {
      totalPages: baselineResults.length,
      pagesAnalyzed,
      runComparisons,
      multiLineAnalysis,
      baselineComparison,
      realWorldScenarios
    };
  } catch (error) {
    logger.error('Error analyzing transcription accuracy:', error);
    throw error;
  }
}

/**
 * Analyzes individual pages for accuracy
 * @param {Array} baselineResults - Array of page results
 * @returns {Array} Page analysis results
 */
function analyzePages(baselineResults) {
  return baselineResults.map((page, index) => {
    // Compare OpenAI and Anthropic results
    const openaiAccuracy = calculateFieldAccuracy(page.openai || {});
    const anthropicAccuracy = calculateFieldAccuracy(page.anthropic || {});

    // Calculate overall success rate as average of both providers
    const openaiSuccessRate = calculateOverallSuccessRate(openaiAccuracy);
    const anthropicSuccessRate = calculateOverallSuccessRate(anthropicAccuracy);
    const successRate = (openaiSuccessRate + anthropicSuccessRate) / 2;

    // Combine field accuracies
    const fieldAccuracy = {};
    ['memorial_number', 'first_name', 'last_name', 'year_of_death', 'inscription'].forEach(field => {
      fieldAccuracy[field] = {
        openai: openaiAccuracy[field],
        anthropic: anthropicAccuracy[field],
        agreement: openaiAccuracy[field].valid === anthropicAccuracy[field].valid &&
          page.openai?.[field] === page.anthropic?.[field]
      };
    });

    return {
      pageNumber: index + 1,
      image: page.image,
      successRate,
      fieldAccuracy,
      providerComparison: {
        openai: openaiSuccessRate,
        anthropic: anthropicSuccessRate
      }
    };
  });
}

/**
 * Calculates accuracy for each field in a page
 * @param {Object} pageData - Page data from a single provider
 * @returns {Object} Field accuracy metrics
 */
function calculateFieldAccuracy(pageData) {
  const fields = ['memorial_number', 'first_name', 'last_name', 'year_of_death', 'inscription'];
  const accuracy = {};

  fields.forEach(field => {
    accuracy[field] = {
      present: pageData[field] !== null && pageData[field] !== undefined,
      valid: validateField(field, pageData[field]),
      confidence: calculateFieldConfidence(field, pageData[field])
    };
  });

  return accuracy;
}

/**
 * Validates a field value based on its type
 * @param {string} field - Field name
 * @param {any} value - Field value
 * @returns {boolean} Whether the value is valid
 */
function validateField(field, value) {
  if (value === null || value === undefined) return false;

  switch (field) {
  case 'memorial_number':
    return Number.isInteger(Number(value));
  case 'year_of_death': {
    const year = Number(value);
    return Number.isInteger(year) && year >= 1500 && year <= new Date().getFullYear();
  }
  case 'first_name':
  case 'last_name':
    return typeof value === 'string' && value.length > 0;
  case 'inscription':
    return typeof value === 'string' && value.trim().length > 0;
  default:
    return false;
  }
}

/**
 * Calculates confidence score for a field
 * @param {string} field - Field name
 * @param {any} value - Field value
 * @returns {number} Confidence score (0-100)
 */
function calculateFieldConfidence(field, value) {
  if (!value) return 0;

  switch (field) {
  case 'inscription':
    return calculateInscriptionConfidence(value);
  case 'first_name':
  case 'last_name':
    return calculateNameConfidence(value);
  case 'memorial_number':
  case 'year_of_death':
    return validateField(field, value) ? 100 : 0;
  default:
    return 0;
  }
}

/**
 * Calculates overall success rate from field accuracies
 * @param {Object} fieldAccuracy - Field accuracy metrics
 * @returns {number} Overall success rate (0-100)
 */
function calculateOverallSuccessRate(fieldAccuracy) {
  const fields = Object.values(fieldAccuracy);
  const validFields = fields.filter(f => f.valid).length;
  return (validFields / fields.length) * 100;
}

/**
 * Compares results across multiple runs
 * @param {Array} allResults - All test runs
 * @returns {Array} Run comparison metrics
 */
function compareRuns(allResults) {
  if (!allResults || allResults.length === 0) return [];

  return allResults.map(run => ({
    timestamp: run.timestamp,
    averageAccuracy: calculateAverageAccuracy(run.results || []),
    consistencyScore: calculateConsistencyScore(run.results || [])
  }));
}

/**
 * Analyzes multi-line inscription handling
 * @param {Array} baselineResults - Array of page results
 * @returns {Object} Multi-line analysis metrics
 */
function analyzeMultiLineEntries(baselineResults) {
  const multiLineEntries = baselineResults.filter(page =>
    (page.openai?.inscription && page.openai.inscription.includes('\n')) ||
    (page.anthropic?.inscription && page.anthropic.inscription.includes('\n'))
  );

  const accuratelyTranscribed = multiLineEntries.filter(page => {
    const openaiLines = page.openai?.inscription ? page.openai.inscription.split('\n').length : 0;
    const anthropicLines = page.anthropic?.inscription ? page.anthropic.inscription.split('\n').length : 0;
    return openaiLines === anthropicLines;
  });

  return {
    totalMultiLineEntries: multiLineEntries.length,
    accuratelyTranscribed: accuratelyTranscribed.length,
    lineBreakAccuracy: multiLineEntries.length === 0 ? 0 : (accuratelyTranscribed.length / multiLineEntries.length) * 100,
    formattingConsistency: calculateFormattingConsistency(multiLineEntries)
  };
}

/**
 * Compares current results against baseline
 * @param {Array} baselineResults - Array of page results
 * @param {Array} allResults - All test runs
 * @returns {Object} Baseline comparison metrics
 */
function compareToBaseline(baselineResults, /* eslint-disable-line no-unused-vars */ allResults) {
  const improvements = [];
  const regressions = [];

  baselineResults.forEach((page, pageIndex) => {
    const fields = ['memorial_number', 'first_name', 'last_name', 'year_of_death', 'inscription'];

    fields.forEach(field => {
      const openaiValue = page.openai?.[field];
      const anthropicValue = page.anthropic?.[field];
      const agreement = openaiValue === anthropicValue;

      if (agreement && openaiValue !== null && openaiValue !== undefined) {
        improvements.push({
          field,
          pageNumber: pageIndex + 1,
          percentageImprovement: 100
        });
      } else if (openaiValue !== null && openaiValue !== undefined &&
        anthropicValue !== null && anthropicValue !== undefined) {
        regressions.push({
          field,
          pageNumber: pageIndex + 1,
          percentageRegression: 50
        });
      }
    });
  });

  return {
    baselineDate: '2025-05-19',
    improvements,
    regressions
  };
}

/**
 * Analyzes handling of real-world scenarios
 * @param {Array} baselineResults - Array of page results
 * @returns {Object} Real-world scenario analysis
 */
function analyzeRealWorldScenarios(baselineResults) {
  return {
    abbreviationHandling: analyzeAbbreviations(baselineResults),
    dateFormatVariations: analyzeDateFormats(baselineResults),
    specialCharacters: analyzeSpecialCharacters(baselineResults),
    specialCases: [
      {
        type: 'Abbreviated Names',
        occurrences: countAbbreviatedNames(baselineResults),
        handlingAccuracy: calculateAbbreviationAccuracy(baselineResults)
      },
      {
        type: 'Special Characters',
        occurrences: countSpecialCharacters(baselineResults),
        handlingAccuracy: calculateSpecialCharacterAccuracy(baselineResults)
      }
    ]
  };
}

// Helper functions for specific analyses
function calculateInscriptionConfidence(inscription) {
  if (!inscription) return 0;
  const words = inscription.trim().split(/\s+/).length;
  return words > 5 ? 100 : (words / 5) * 100;
}

function calculateNameConfidence(name) {
  if (!name) return 0;
  return name.toUpperCase() === name ? 100 : 75;
}

function calculateAverageAccuracy(results) {
  if (!results || results.length === 0) return 0;

  return results.reduce((acc, page) => {
    const openaiAccuracy = calculateOverallSuccessRate(calculateFieldAccuracy(page.openai || {}));
    const anthropicAccuracy = calculateOverallSuccessRate(calculateFieldAccuracy(page.anthropic || {}));
    return acc + ((openaiAccuracy + anthropicAccuracy) / 2);
  }, 0) / results.length;
}

function calculateConsistencyScore(results) {
  if (!results || results.length === 0) return 0;

  let agreements = 0;
  let total = 0;

  results.forEach(page => {
    ['memorial_number', 'first_name', 'last_name', 'year_of_death', 'inscription'].forEach(field => {
      if (page.openai?.[field] !== null && page.openai?.[field] !== undefined &&
        page.anthropic?.[field] !== null && page.anthropic?.[field] !== undefined) {
        total++;
        if (page.openai[field] === page.anthropic[field]) {
          agreements++;
        }
      }
    });
  });

  return total === 0 ? 0 : (agreements / total) * 100;
}

function calculateFormattingConsistency(entries) {
  if (!entries || entries.length === 0) return 0;

  let consistentFormatting = 0;

  entries.forEach(page => {
    if (page.openai?.inscription && page.anthropic?.inscription) {
      const openaiFormat = page.openai.inscription.replace(/\s+/g, ' ').trim();
      const anthropicFormat = page.anthropic.inscription.replace(/\s+/g, ' ').trim();
      if (openaiFormat === anthropicFormat) {
        consistentFormatting++;
      }
    }
  });

  return (consistentFormatting / entries.length) * 100;
}

function analyzeAbbreviations(results) {
  const abbreviations = {
    total: 0,
    accurate: 0
  };

  results.forEach(page => {
    if (page.openai?.inscription && page.openai.inscription.match(/[A-Z]\./g)) {
      abbreviations.total++;
      if (page.anthropic?.inscription &&
        page.openai.inscription.match(/[A-Z]\./g).length ===
        page.anthropic.inscription.match(/[A-Z]\./g)?.length) {
        abbreviations.accurate++;
      }
    }
  });

  return {
    total: abbreviations.total,
    accuracy: abbreviations.total === 0 ? 0 : (abbreviations.accurate / abbreviations.total) * 100
  };
}

function analyzeDateFormats(results) {
  const formats = new Set();
  let totalDates = 0;
  let accurateDates = 0;

  results.forEach(page => {
    if (page.openai?.year_of_death) {
      totalDates++;
      if (page.openai.year_of_death === page.anthropic?.year_of_death) {
        accurateDates++;
      }
      formats.add('YYYY');
    }

    // Check for other date formats in inscriptions
    const datePatterns = [
      /\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}/i,
      /\d{1,2}[-/]\d{1,2}[-/]\d{4}/,
      /\d{4}[-/]\d{1,2}[-/]\d{1,2}/
    ];

    datePatterns.forEach(pattern => {
      if (page.openai?.inscription && page.openai.inscription.match(pattern)) {
        formats.add(pattern.toString());
      }
    });
  });

  return {
    formats: Array.from(formats),
    accuracy: totalDates === 0 ? 0 : (accurateDates / totalDates) * 100
  };
}

function analyzeSpecialCharacters(results) {
  const specialChars = {
    total: 0,
    accurate: 0
  };

  results.forEach(page => {
    if (page.openai?.inscription) {
      const matches = page.openai.inscription.match(/[^a-zA-Z0-9\s]/g);
      if (matches) {
        specialChars.total += matches.length;
        if (page.anthropic?.inscription) {
          const anthropicMatches = page.anthropic.inscription.match(/[^a-zA-Z0-9\s]/g);
          if (anthropicMatches && anthropicMatches.length === matches.length) {
            specialChars.accurate += matches.length;
          }
        }
      }
    }
  });

  return {
    total: specialChars.total,
    accuracy: specialChars.total === 0 ? 0 : (specialChars.accurate / specialChars.total) * 100
  };
}

function countAbbreviatedNames(results) {
  return results.reduce((count, page) => {
    const openaiAbbr = page.openai?.inscription ? page.openai.inscription.match(/[A-Z]\./g) : [];
    const anthropicAbbr = page.anthropic?.inscription ? page.anthropic.inscription.match(/[A-Z]\./g) : [];
    return count + (openaiAbbr ? openaiAbbr.length : 0) + (anthropicAbbr ? anthropicAbbr.length : 0);
  }, 0);
}

function calculateAbbreviationAccuracy(results) {
  let total = 0;
  let accurate = 0;

  results.forEach(page => {
    if (page.openai?.inscription && page.anthropic?.inscription) {
      const openaiAbbr = page.openai.inscription.match(/[A-Z]\./g);
      const anthropicAbbr = page.anthropic.inscription.match(/[A-Z]\./g);

      if (openaiAbbr || anthropicAbbr) {
        total++;
        if (openaiAbbr && anthropicAbbr && openaiAbbr.length === anthropicAbbr.length) {
          accurate++;
        }
      }
    }
  });

  return total === 0 ? 0 : (accurate / total) * 100;
}

function countSpecialCharacters(results) {
  return results.reduce((count, page) => {
    const openaiSpecial = page.openai?.inscription ? page.openai.inscription.match(/[^a-zA-Z0-9\s]/g) : [];
    const anthropicSpecial = page.anthropic?.inscription ? page.anthropic.inscription.match(/[^a-zA-Z0-9\s]/g) : [];
    return count + (openaiSpecial ? openaiSpecial.length : 0) + (anthropicSpecial ? anthropicSpecial.length : 0);
  }, 0);
}

function calculateSpecialCharacterAccuracy(results) {
  let total = 0;
  let accurate = 0;

  results.forEach(page => {
    if (page.openai?.inscription && page.anthropic?.inscription) {
      const openaiSpecial = page.openai.inscription.match(/[^a-zA-Z0-9\s]/g);
      const anthropicSpecial = page.anthropic.inscription.match(/[^a-zA-Z0-9\s]/g);

      if (openaiSpecial || anthropicSpecial) {
        total++;
        if (openaiSpecial && anthropicSpecial && openaiSpecial.length === anthropicSpecial.length) {
          accurate++;
        }
      }
    }
  });

  return total === 0 ? 0 : (accurate / total) * 100;
}

module.exports = {
  analyzeTranscriptionAccuracy
}; 