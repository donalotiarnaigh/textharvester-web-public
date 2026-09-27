const DEFAULT_THRESHOLDS = {
  enabled: false,
  ccrThreshold: 0.4,
  minEntropy: 1.5,
  lengthRatioMin: 0.05,
  minLengthForEntropy: 20,
  minLengthForLengthRatio: 20,
  minExpectedBySourceType: {
    memorial: 40,
    monument_photo: 40,
    typographic_analysis: 80,
    record_sheet: 40,
    burial_register: 80,
    grave_record_card: 60,
  },
};

const ALLOWED_CHARACTER_PATTERN = /[A-Za-z0-9\s.,;:'"!?()[\]{}\-_/&+*=%]/;

function normalizeThresholds(thresholds = {}) {
  return {
    ...DEFAULT_THRESHOLDS,
    ...thresholds,
    minExpectedBySourceType: {
      ...DEFAULT_THRESHOLDS.minExpectedBySourceType,
      ...(thresholds.minExpectedBySourceType || {}),
    },
  };
}

function normalizeText(text) {
  return typeof text === 'string' ? text.trim() : '';
}

function computeEntropy(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return 0;
  }

  const counts = new Map();
  for (const character of normalized) {
    counts.set(character, (counts.get(character) || 0) + 1);
  }

  const length = normalized.length;
  let entropy = 0;

  for (const count of counts.values()) {
    const probability = count / length;
    entropy -= probability * Math.log2(probability);
  }

  return entropy;
}

function computeCCR(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return 0;
  }

  let confusionCount = 0;
  for (const character of normalized) {
    if (!ALLOWED_CHARACTER_PATTERN.test(character)) {
      confusionCount += 1;
    }
  }

  return confusionCount / normalized.length;
}

function computeLengthRatio(text, minExpected) {
  const normalized = normalizeText(text);
  if (!minExpected || minExpected <= 0) {
    return 1;
  }

  return normalized.length / minExpected;
}

function detectDegenerate(rawResponse, sourceType, thresholds = {}) {
  const merged = normalizeThresholds(thresholds);
  const text = normalizeText(rawResponse);
  const minExpected = merged.minExpectedBySourceType[sourceType] || 0;
  const entropy = computeEntropy(text);
  const ccr = computeCCR(text);
  const lengthRatio = computeLengthRatio(text, minExpected);
  const reasons = [];

  if (merged.enabled !== false) {
    if (ccr > merged.ccrThreshold) {
      reasons.push('HIGH_CCR');
    }

    if (text.length >= merged.minLengthForEntropy && entropy < merged.minEntropy) {
      reasons.push('LOW_ENTROPY');
    }

    if (text.length >= merged.minLengthForLengthRatio && lengthRatio < merged.lengthRatioMin) {
      reasons.push('LOW_LENGTH_RATIO');
    }
  }

  return {
    isDegenerate: reasons.length > 0,
    metrics: {
      ccr,
      entropy,
      lengthRatio,
      rawLength: text.length,
      minExpected,
    },
    reasons,
  };
}

module.exports = {
  DEFAULT_THRESHOLDS,
  computeEntropy,
  computeCCR,
  computeLengthRatio,
  detectDegenerate,
};
