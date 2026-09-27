const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { CLIError } = require('../cli/errors');
const { jsonToCsv, formatJsonForExport } = require('../utils/dataConversion');

class ExportService {
  constructor(config, queryService) {
    this.config = config;
    this.queryService = queryService;
  }

  async export(options = {}) {
    const { format = 'json', destination, sourceType, force = false, batchSize = 1000 } = options;

    // Validate format
    if (!['json', 'csv'].includes(format)) {
      throw new CLIError('INVALID_FORMAT', `Invalid format: ${format}. Valid: json, csv`);
    }

    // Validate destination if provided
    if (destination) {
      await this._validateDestination(destination, force);
    }

    const queryOptions = { sourceType, limit: batchSize };

    // Eagerly fetch first batch to check for empty results and avoid creating file if empty
    const { records: firstBatch } = await this.queryService.list({ ...queryOptions, offset: 0 });

    if (firstBatch.length === 0) {
      return { exported: 0, format, destination, data: '' };
    }

    if (destination) {
      return this._exportToFile(destination, format, queryOptions, batchSize, firstBatch);
    } else {
      return this._exportToMemory(format, queryOptions, batchSize, firstBatch);
    }
  }

  async _exportToFile(destination, format, queryOptions, batchSize, firstBatch) {
    const writeStream = fs.createWriteStream(destination, { encoding: 'utf-8' });

    // Create a promise to handle the stream completion/error
    const completionPromise = new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    let totalExported = 0;

    try {
      if (format === 'csv') {
        totalExported = await this._streamCsv(writeStream, queryOptions, batchSize, firstBatch);
      } else {
        totalExported = await this._streamJson(writeStream, queryOptions, batchSize, firstBatch);
      }

      writeStream.end();
      await completionPromise;
    } catch (err) {
      writeStream.destroy();
      // If the error came from the stream, completionPromise rejected.
      // If it came from _streamJson, we destroy and throw.
      throw new CLIError('WRITE_ERROR', `Failed to write export file: ${err.message}`, { originalError: err });
    }

    return { exported: totalExported, destination, format };
  }

  async _exportToMemory(format, queryOptions, batchSize, firstBatch) {
    let allRecords = [...firstBatch];
    let offset = firstBatch.length;
    let fetchMore = firstBatch.length >= batchSize;

    while (fetchMore) {
      const { records } = await this.queryService.list({ ...queryOptions, offset });
      allRecords = allRecords.concat(records);

      if (records.length < batchSize) {
        fetchMore = false;
      }
      offset += records.length;
    }

    let output = '';
    if (format === 'csv') {
      output = this._generateCsv(allRecords, queryOptions.sourceType);
    } else {
      output = formatJsonForExport(allRecords, 'pretty');
    }

    return { exported: allRecords.length, format, data: output };
  }

  async _streamJson(stream, queryOptions, batchSize, firstBatch) {
    stream.write('[\n');

    // Write first batch
    const json = JSON.stringify(firstBatch, null, 2);
    const inner = json.slice(1, -1).trim();
    if (inner.length > 0) {
      stream.write(inner);
    }

    let totalExported = firstBatch.length;
    let offset = firstBatch.length;
    let fetchMore = firstBatch.length >= batchSize;
    let firstWrite = true; // Use firstWrite to track if we need comma BEFORE writing

    // If we wrote something from first batch, next writes need comma
    if (totalExported > 0) {
      firstWrite = false;
    }

    while (fetchMore) {
      const { records } = await this.queryService.list({ ...queryOptions, offset });

      if (records.length > 0) {
        if (!firstWrite) {
          stream.write(',\n');
        }
        const jsonBatch = JSON.stringify(records, null, 2);
        const innerBatch = jsonBatch.slice(1, -1).trim();
        if (innerBatch.length > 0) {
          stream.write(innerBatch);
        }

        totalExported += records.length;
        offset += records.length;
        firstWrite = false;
      }

      if (records.length < batchSize) {
        fetchMore = false;
      }
    }
    stream.write('\n]');
    return totalExported;
  }

  async _streamCsv(stream, queryOptions, batchSize, firstBatch) {
    // Write first batch with headers
    let csvChunk = this._generateCsv(firstBatch, queryOptions.sourceType);
    stream.write(csvChunk);

    let totalExported = firstBatch.length;
    let offset = firstBatch.length;
    let fetchMore = firstBatch.length >= batchSize;

    while (fetchMore) {
      const { records } = await this.queryService.list({ ...queryOptions, offset });

      if (records.length > 0) {
        let chunk = this._generateCsv(records, queryOptions.sourceType);

        // Remove header line from subsequent chunks
        const newlineIndex = chunk.indexOf('\n');
        if (newlineIndex !== -1) {
          // Check implies jsonToCsv always adds newline.
          // But if previous chunk didn't end with newline? (jsonToCsv usually does or doesn't depending on util)
          // We'll assume jsonToCsv output is complete CSV string.
          // Need to prepend newline if previous chunk didn't have one? 
          stream.write(chunk.substring(newlineIndex + 1));
        }

        totalExported += records.length;
        offset += records.length;
      }

      if (records.length < batchSize) {
        fetchMore = false;
      }
    }
    return totalExported;
  }

  async _validateDestination(dest, force) {
    const dir = path.dirname(dest);

    // Check directory exists
    try {
      await fsPromises.access(dir);
    } catch {
      throw new CLIError('DIRECTORY_NOT_FOUND', `Directory does not exist: ${dir}`);
    }

    // Check file existence
    try {
      await fsPromises.access(dest);
      // File exists
      if (!force) {
        throw new CLIError('FILE_EXISTS', 'Destination file already exists. Use --force to overwrite.');
      }
    } catch (err) {
      // File does not exist, which is good
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  _generateCsv(records, sourceType) {
    if (sourceType === 'grave_record_card') {
      return this._graveCardsToCsv(records);
    } else if (sourceType === 'burial_register') {
      const columns = [
        'volume_id', 'page_number', 'row_index_on_page', 'entry_id',
        'entry_no_raw', 'name_raw', 'abode_raw', 'burial_date_raw',
        'age_raw', 'officiant_raw', 'marginalia_raw', 'file_name',
        'ai_provider', 'processed_date'
      ];
      return jsonToCsv(records, columns);
    } else if (sourceType === 'typographic_analysis') {
      const columns = [
        'memorial_number', 'first_name', 'last_name', 'year_of_death',
        'transcription_raw', 'stone_condition', 'typography_analysis',
        'iconography', 'structural_observations',
        'inscription', 'file_name', 'ai_provider', 'model_version',
        'prompt_version', 'processed_date'
      ];
      return jsonToCsv(records, columns);
    } else {
      // Default (memorials) relies on jsonToCsv defaults
      return jsonToCsv(records);
    }
  }

  _graveCardsToCsv(records) {
    // Flatten logic adapted from graveCardStorage.js
    const flattenedRows = records.map(row => {
      const data = row.data || {};

      const flat = {
        id: row.id,
        file_name: row.file_name,
        processed_date: row.processed_date,
        ai_provider: row.ai_provider,
        section: row.section,
        grave_number: row.grave_number,
        grave_status: data.grave?.status || '',
        grave_type: data.grave?.type || '',
        grave_notes: data.grave?.notes || '',
        dimensions_length: data.grave?.dimensions?.length_ft || '',
        dimensions_width: data.grave?.dimensions?.width_ft || '',
        inscription_text: data.inscription?.text ? data.inscription.text.replace(/\n/g, ' | ') : '',
        inscription_notes: data.inscription?.notes || '',
        sketch_description: data.sketch?.description || '',
        card_processed_by: data.card_metadata?.processed_by || '',
      };

      // Flatten interments
      if (Array.isArray(data.interments)) {
        data.interments.forEach((interment, index) => {
          const i = index + 1;
          flat[`interment_${i}_name`] = interment.name || '';
          flat[`interment_${i}_date_death`] = interment.date_of_death || '';
          flat[`interment_${i}_date_burial`] = interment.date_of_burial || '';
          flat[`interment_${i}_age`] = interment.age || (interment.age_at_death || '');
          flat[`interment_${i}_notes`] = interment.notes || '';
        });
      }

      return flat;
    });

    // Collect keys
    const allKeys = new Set();
    flattenedRows.forEach(row => {
      Object.keys(row).forEach(key => allKeys.add(key));
    });

    // Sort keys
    const standardKeys = [
      'id', 'file_name', 'processed_date', 'ai_provider', 'section', 'grave_number',
      'grave_status', 'grave_type', 'grave_notes', 'dimensions_length', 'dimensions_width',
      'inscription_text', 'inscription_notes', 'sketch_description', 'card_processed_by'
    ];

    const intermentKeys = Array.from(allKeys)
      .filter(k => k.startsWith('interment_'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/interment_(\d+)_/)[1]);
        const numB = parseInt(b.match(/interment_(\d+)_/)[1]);
        if (numA !== numB) return numA - numB;
        return a.localeCompare(b);
      });

    const otherKeys = Array.from(allKeys).filter(k => !standardKeys.includes(k) && !intermentKeys.includes(k));
    const sortedKeys = [...standardKeys, ...intermentKeys, ...otherKeys].filter(k => allKeys.has(k));

    // Create CSV using jsonToCsv utility but with our dynamic columns
    return jsonToCsv(flattenedRows, sortedKeys);
  }
}

module.exports = ExportService;
