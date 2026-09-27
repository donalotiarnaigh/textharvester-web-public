/**
 * Burial register flattener utilities
 *
 * Converts validated burial register page JSON into flat entry objects with
 * generated identifiers and injected metadata.
 */
const logger = require('./logger');
/**
 * Generate a human-readable entry identifier for a burial register row.
 * @param {string} volumeId Volume identifier
 * @param {number} pageNumber Page number within the volume (AI-extracted, used as fallback)
 * @param {number} rowIndex Row index on the page (1-based)
 * @param {number|null} pageNumberForId Optional page number from filename to use for entry_id generation
 * @returns {string} Entry identifier formatted as {volume_id}_p{page}_r{row}
 */
function generateEntryId(volumeId, pageNumber, rowIndex, pageNumberForId = null) {
  // Use filename page number if provided, otherwise fall back to AI-extracted page number
  const pageNumForId = pageNumberForId !== null && pageNumberForId !== undefined ? pageNumberForId : pageNumber;
  const page = String(pageNumForId).padStart(3, '0');
  const row = String(rowIndex).padStart(3, '0');

  return `${volumeId}_p${page}_r${row}`;
}

/**
 * Inject page-level and processing metadata into an entry.
 * @param {Object} entry Raw entry object from provider output
 * @param {Object} pageData Validated page-level data
 * @param {Object} metadata Processing metadata (provider, model, filePath)
 * @param {number|null} pageNumberForId Filename-based page number (reliable, overrides AI-extracted)
 * @returns {Object} Entry with metadata applied
 */
function injectPageMetadata(entry, pageData, metadata = {}, pageNumberForId = null) {
  const safeEntry = entry && typeof entry === 'object' ? { ...entry } : {};
  const { volume_id: volumeId, page_number: aiPageNumber } = pageData || {};

  // Use filename page number if available (reliable), otherwise fall back to AI-extracted
  const pageNumber = pageNumberForId !== null && pageNumberForId !== undefined ? pageNumberForId : aiPageNumber;

  return {
    ...safeEntry,
    volume_id: volumeId,
    page_number: pageNumber,  // Now uses filename-based page number (reliable)
    parish_header_raw: pageData?.parish_header_raw ?? null,
    county_header_raw: pageData?.county_header_raw ?? null,
    year_header_raw: pageData?.year_header_raw ?? null,
    provider: metadata.provider || null,
    model: metadata.model || null,
    filePath: metadata.filePath || null
  };
}

/**
 * Flatten validated page JSON into flat entry objects with generated IDs.
 * @param {Object} pageData Validated page-level data containing entries
 * @param {Object} metadata Processing metadata (provider, model, filePath)
 * @param {number|null} pageNumberForId Optional page number from filename to use for entry_id generation
 * @returns {Array<Object>} Array of flat entries
 */
function flattenPageToEntries(pageData, metadata = {}, pageNumberForId = null) {
  if (!pageData || typeof pageData !== 'object') {
    throw new Error('pageData must be an object with entries');
  }

  const volumeId = pageData.volume_id || 'unknown';
  const pageNumber = pageData.page_number || 'unknown';
  const entries = Array.isArray(pageData.entries) ? pageData.entries : [];

  // Log which page number is being used for entry_id
  if (pageNumberForId !== null && pageNumberForId !== undefined) {
    logger.info(`Flattening burial register page: volume_id=${volumeId}, page_number=${pageNumber} (AI), filename_page_number=${pageNumberForId} (for entry_id), entries_found=${entries.length}`);
  } else {
    logger.info(`Flattening burial register page: volume_id=${volumeId}, page_number=${pageNumber}, entries_found=${entries.length}`);
  }

  if (entries.length === 0) {
    logger.warn(`No entries found in page data for volume_id=${volumeId}, page_number=${pageNumber}`);
  }

  const flattenedEntries = entries.map((entryRaw, index) => {
    const entry = entryRaw && typeof entryRaw === 'object' ? { ...entryRaw } : {};
    const parsedRowIndex = Number.parseInt(entry.row_index_on_page, 10);
    const originalRowIndex = entry.row_index_on_page;
    const rowIndex = Number.isInteger(entry.row_index_on_page)
      ? entry.row_index_on_page
      : Number.isInteger(parsedRowIndex) && !Number.isNaN(parsedRowIndex)
        ? parsedRowIndex
        : index + 1;

    // Log warning if we had to fall back to index+1
    if (!Number.isInteger(entry.row_index_on_page) &&
      (!Number.isInteger(parsedRowIndex) || Number.isNaN(parsedRowIndex))) {
      logger.warn(`Invalid row_index_on_page for entry at index ${index} (value: ${originalRowIndex}), using fallback: ${rowIndex}`);
    }

    entry.row_index_on_page = rowIndex;
    // Use filename page number for both entry_id AND page_number field (reliable source)
    entry.entry_id = generateEntryId(pageData.volume_id, pageData.page_number, rowIndex, pageNumberForId);

    return injectPageMetadata(entry, pageData, metadata, pageNumberForId);
  });

  // Log summary of generated entry IDs
  if (flattenedEntries.length > 0) {
    if (flattenedEntries.length <= 10) {
      const entryIds = flattenedEntries.map(e => e.entry_id).join(', ');
      logger.debug(`Generated entry IDs: ${entryIds}`);
    } else {
      const firstThree = flattenedEntries.slice(0, 3).map(e => e.entry_id).join(', ');
      const lastThree = flattenedEntries.slice(-3).map(e => e.entry_id).join(', ');
      logger.debug(`Generated entry IDs: ${firstThree} ... ${lastThree} (${flattenedEntries.length} total)`);
    }
  }

  logger.info(`Flattened ${flattenedEntries.length} entries for page ${pageNumber}`);

  return flattenedEntries;
}

module.exports = {
  flattenPageToEntries,
  generateEntryId,
  injectPageMetadata
};
