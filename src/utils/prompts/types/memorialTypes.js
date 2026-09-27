/**
 * Type definitions for memorial data
 * @type {Object.<string, string>}
 */
const memorialTypes = {
  // All fields are strings to preserve exact formatting from inscriptions
  // memorial_number kept as string to preserve any leading zeros or special characters
  memorial_number: 'string',
  // Names should always be uppercase strings
  first_name: 'string:uppercase',
  last_name: 'string:uppercase',
  // year_of_death as string to handle potential special cases like "c.1923" or "1923-24"
  year_of_death: 'string',
  // Full inscription text preserved exactly as written
  inscription: 'string'
};

module.exports = { memorialTypes }; 