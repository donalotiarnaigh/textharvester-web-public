const { CLIError } = require('../cli/errors');

class QueryService {
  constructor(config, storageModules) {
    this.config = config;
    this.storage = storageModules;
    this.cache = new Map();
    // Default TTL: 60 seconds, or use config value (ms)
    this.ttl = this.config.cacheTTL || 60000;
  }

  async list(options = {}) {
    const { sourceType, limit = 50, offset = 0, needsReview, projectId } = options;
    const allRecords = await this._getCachedOrFetch(sourceType);

    // Apply projectId filter if requested
    let filtered = allRecords;
    if (projectId) {
      filtered = filtered.filter(r => r.project_id === projectId);
    }

    // Apply needs_review filter if requested
    if (needsReview) {
      filtered = filtered.filter(r => r.needs_review === 1);
    }

    // In-memory pagination since storage modules don't support it yet
    const records = filtered.slice(offset, offset + limit);

    return {
      records,
      count: records.length,
      offset,
      limit,
      total: filtered.length
    };
  }

  async get(id, sourceType) {
    const storage = this.getStorageForType(sourceType);
    const record = await storage.getById(id);
    if (!record) {
      throw new CLIError('RECORD_NOT_FOUND', `Record not found: ${id}`);
    }
    return record;
  }

  async search(query, options = {}) {
    const { sourceType, limit = 50, offset = 0 } = options;
    const allRecords = await this._getCachedOrFetch(sourceType);

    if (!query) {
      // Degrade to list behavior if no query
      return this.list(options);
    }

    const lowerQuery = query.toLowerCase();

    const filtered = allRecords.filter(record => {
      // Search across all string values in the record
      return Object.values(record).some(value => {
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(lowerQuery);
      });
    });

    // In-memory pagination
    const records = filtered.slice(offset, offset + limit);

    return {
      records,
      count: records.length,
      offset,
      limit,
      total: filtered.length
    };
  }

  async _getCachedOrFetch(sourceType) {
    const now = Date.now();

    if (this.cache.has(sourceType)) {
      const entry = this.cache.get(sourceType);
      if (now - entry.timestamp < this.ttl) {
        return entry.data;
      }
    }

    const storage = this.getStorageForType(sourceType);
    const data = await storage.getAll();

    this.cache.set(sourceType, {
      timestamp: now,
      data
    });

    return data;
  }

  clearCache() {
    this.cache.clear();
  }

  getStorageForType(type) {
    const map = {
      record_sheet: this.storage.memorials,
      monument_photo: this.storage.memorials,
      memorial: this.storage.memorials,
      typographic_analysis: this.storage.memorials,
      burial_register: this.storage.burialRegister,
      grave_record_card: this.storage.graveCards,
      monument_classification: this.storage.monumentClassifications
    };
    if (!map[type]) {
      throw new CLIError('INVALID_SOURCE_TYPE', `Unknown source type: ${type}`);
    }
    return map[type];
  }
}

module.exports = QueryService;
