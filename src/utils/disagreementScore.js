/**
 * Compute a per-record disagreement score for active learning prioritisation.
 *
 * Returns a 0–1 value where lower scores indicate higher uncertainty / more
 * annotation value.  Returns null when there is no signal at all (no confidence
 * scores and no validation warnings).
 *
 * Formula: min(numeric confidence values) × 0.8^(number of warnings)
 * Each validation warning applies a 20% penalty to represent additional
 * epistemic uncertainty detected at validation time.
 *
 * @param {Object|null} confidenceScores  - Map of field names to numeric confidence values
 * @param {Array<string>|null} validationWarnings - Array of validation warning strings
 * @returns {number|null}
 */
function computeDisagreementScore(confidenceScores, validationWarnings) {
  const scores = Object.values(confidenceScores || {}).filter(v => typeof v === 'number');
  const warnings = validationWarnings || [];

  if (scores.length === 0 && warnings.length === 0) {
    return null;
  }

  const minConf = scores.length > 0 ? Math.min(...scores) : 1.0;
  return Math.max(0, Math.min(1, minConf * Math.pow(0.8, warnings.length)));
}

module.exports = { computeDisagreementScore };
