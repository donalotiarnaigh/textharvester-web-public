/**
 * Parse historical burial date strings, handling Latin month abbreviations,
 * dual-dated years (Old Style/New Style), and pre-1752 Julian calendar conventions.
 *
 * @param {string|null|undefined} rawString Raw date string from burial register
 * @returns {Object} { normalizedDate, normalizedYear, warnings }
 */
function parseBurialDate(rawString) {
  // Null/empty guard
  if (!rawString || typeof rawString !== 'string') {
    return { normalizedDate: null, normalizedYear: null, warnings: [] };
  }

  const trimmed = rawString.trim();
  if (trimmed.length === 0) {
    return { normalizedDate: null, normalizedYear: null, warnings: [] };
  }

  let working = trimmed;
  let warnings = [];
  let hadDualDate = false;

  // Step 1: Replace Latin month abbreviations
  const latinMonthMap = {
    '7ber': 'Sep',
    '8ber': 'Oct',
    '9ber': 'Nov',
    'Xber': 'Dec',
    '10ber': 'Dec'
  };

  for (const [abbrev, month] of Object.entries(latinMonthMap)) {
    const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
    working = working.replace(regex, month);
  }

  // Step 2: Handle dual-year pattern (YYYY/YY or YYYY/YYYY)
  // Extract the Gregorian year (the latter value)
  const dualYearMatch = working.match(/(\d{4})\/(\d{1,4})\b/);
  if (dualYearMatch) {
    const baseYear = parseInt(dualYearMatch[1], 10);

    // OS/NS dual-dating always represents adjacent years; Gregorian year is baseYear + 1
    const gregorianYear = baseYear + 1;

    // Replace dual-year with single Gregorian year
    working = working.replace(/\d{4}\/\d{1,4}\b/, String(gregorianYear));
    hadDualDate = true;
  }

  // Step 3: Extract year
  const yearMatch = working.match(/(\d{4})/);
  let year = yearMatch ? parseInt(yearMatch[1], 10) : null;

  // Step 4: Apply Old Style year-start correction
  // If month is Jan/Feb/1-24 Mar AND year < 1752 AND no dual-date:
  // adjust year forward by 1 and warn
  if (year && year < 1752 && !hadDualDate) {
    const monthMatch = working.match(/(Jan|Feb|Mar|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24)\s+(?:St\s+)?(?:day\s+)?/i);
    const dayMatch = working.match(/(\d{1,2})\s+(Jan|Feb|Mar)/i);

    let isEarlyInYear = false;
    let monthName = null;
    let dayNum = null;

    if (monthMatch) {
      const monthStr = monthMatch[1].toLowerCase();
      if (monthStr === 'jan') {
        isEarlyInYear = true;
        monthName = 'Jan';
      } else if (monthStr === 'feb') {
        isEarlyInYear = true;
        monthName = 'Feb';
      } else if (monthStr === 'mar' || monthStr === '3') {
        isEarlyInYear = true;
        monthName = 'Mar';
      }
    }

    if (dayMatch) {
      dayNum = parseInt(dayMatch[1], 10);
      const matchedMonth = dayMatch[2].toLowerCase();
      if (matchedMonth === 'jan') {
        isEarlyInYear = true;
        monthName = 'Jan';
      } else if (matchedMonth === 'feb') {
        isEarlyInYear = true;
        monthName = 'Feb';
      } else if (matchedMonth === 'mar') {
        if (dayNum <= 24) {
          isEarlyInYear = true;
        }
        monthName = 'Mar';
      }
    }

    if (isEarlyInYear && dayNum === null) {
      // Just month, no specific day
      year += 1;
      warnings.push(`OLD_STYLE_YEAR_CORRECTED: ${trimmed} is before Lady Day; adjusted to Gregorian year ${year}`);
    } else if (isEarlyInYear && dayNum !== null && dayNum <= 24 && monthName === 'Mar') {
      // Specific day in early March (before Lady Day on 25 Mar)
      year += 1;
      warnings.push(`OLD_STYLE_YEAR_CORRECTED: ${trimmed} is before Lady Day; adjusted to Gregorian year ${year}`);
    } else if (monthName && (monthName === 'Jan' || monthName === 'Feb')) {
      // January or February always triggers
      year += 1;
      warnings.push(`OLD_STYLE_YEAR_CORRECTED: ${trimmed} is before Lady Day; adjusted to Gregorian year ${year}`);
    }
  }

  // Handle dual-dated entries that didn't have a year-start correction
  if (hadDualDate && warnings.length === 0) {
    warnings.push(`OLD_STYLE_YEAR_CORRECTED: ${trimmed} adjusted from Old Style to Gregorian year ${year}`);
  }

  // Update working string to reflect corrected year if OS correction was applied
  if (warnings.length > 0 && year !== null && yearMatch) {
    working = working.replace(/\d{4}/, String(year));
  }

  // normalizedDate is null if the input was just a bare year with no other content
  const isYearOnly = /^\d{4}$/.test(trimmed);

  return {
    normalizedDate: yearMatch && !isYearOnly ? working : null,
    normalizedYear: year,
    warnings
  };
}

module.exports = { parseBurialDate };
