const express = require('express');
const router = express.Router();
const SchemaManager = require('../services/SchemaManager');
const SchemaGenerator = require('../services/SchemaGenerator');
const { createProvider } = require('../utils/modelProviders');
const logger = require('../utils/logger');
const config = require('../../config.json');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

// Configure temp storage for schema analysis
const tempStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(process.cwd(), 'uploads', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // Sanitize filename to prevent issues
    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `schema_analysis_${Date.now()}_${safeName}`);
  }
});

const upload = multer({
  storage: tempStorage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit per sample file
});

// POST /propose - Analyze files and propose a schema
router.post('/propose', upload.array('files'), async (req, res) => {
  try {
    let { files } = req.body;

    // If files were uploaded via multipart/form-data, use those paths
    if (req.files && req.files.length > 0) {
      files = req.files.map(f => f.path);
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'No files provided for analysis' });
    }

    // Initialize Provider
    // We default to OpenAI or env setting, similar to other parts of the system
    const providerName = req.body.provider || process.env.AI_PROVIDER || 'openai';

    let provider;
    try {
      provider = createProvider({
        AI_PROVIDER: providerName,
        ...config
      });
    } catch (err) {
      logger.error('Failed to initialize AI provider for schema proposal', err);
      return res.status(500).json({ error: 'Failed to initialize AI provider' });
    }

    const generator = new SchemaGenerator(provider);
    const analysis = await generator.generateSchema(files);

    res.status(200).json(analysis);

  } catch (error) {
    logger.error('Error in schema proposal:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// GET / - List all schemas
router.get('/', async (req, res) => {
  try {
    const schemas = await SchemaManager.listSchemas();
    res.status(200).json(schemas);
  } catch (error) {
    logger.error('Error listing schemas:', error);
    res.status(500).json({ error: 'Failed to list schemas' });
  }
});

// GET /:id - Get a specific schema
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const schema = await SchemaManager.getSchema(id);

    if (!schema) {
      return res.status(404).json({ error: 'Schema not found' });
    }

    res.status(200).json(schema);
  } catch (error) {
    logger.error(`Error getting schema ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to retrieve schema' });
  }
});

// POST / - Create a new schema
router.post('/', async (req, res) => {
  try {
    const schemaDefinition = req.body;

    // Basic validation
    if (!schemaDefinition.name || !schemaDefinition.jsonSchema) {
      return res.status(400).json({ error: 'Invalid schema definition. Name and jsonSchema are required.' });
    }

    // SchemaManager handles creation logic including table generation
    const createdSchema = await SchemaManager.createSchema(schemaDefinition);

    res.status(201).json(createdSchema);

  } catch (error) {
    logger.error('Error creating schema:', error);

    // Handle unique constraint violations (duplicate name)
    if (error.code === 'SQLITE_CONSTRAINT' || error.errno === 19) {
      return res.status(409).json({
        error: 'A schema with this name already exists. Please choose a different name.'
      });
    }

    res.status(500).json({ error: error.message || 'Failed to create schema' });
  }
});

// PUT /:id - Update an existing schema
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const changes = req.body;

    // Basic validation
    if (!changes.jsonSchema) {
      return res.status(400).json({ error: 'jsonSchema is required' });
    }

    // SchemaManager handles update logic including column migrations
    const result = await SchemaManager.updateSchema(id, changes);

    res.status(200).json(result);

  } catch (error) {
    logger.error(`Error updating schema ${req.params.id}:`, error);

    // Handle schema not found
    if (error.message && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    // Handle unsupported operations (type changes, field removals)
    if (error.message && (error.message.includes('not supported') || error.message.includes('Removing'))) {
      return res.status(422).json({ error: error.message });
    }

    res.status(500).json({ error: error.message || 'Failed to update schema' });
  }
});

module.exports = router;
