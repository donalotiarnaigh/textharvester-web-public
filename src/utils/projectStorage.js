const logger = require('./logger');
const crypto = require('crypto');
const { db } = require('./database');

/**
 * Initialize the projects table
 */
function initialize() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  return new Promise((resolve, reject) => {
    db.run(createTableSQL, (err) => {
      if (err) {
        logger.error('Error creating projects table:', err);
        reject(err);
        return;
      }
      logger.info('projects table initialized');
      resolve();
    });
  });
}

/**
 * Create a new project
 * @param {Object} data - Project data { name, description }
 * @returns {Promise<Object>} - The created project object
 */
function createProject(data) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const sql = `
      INSERT INTO projects (id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `;
    db.run(sql, [id, data.name, data.description || null], function(err) {
      if (err) {
        logger.error('Error creating project:', err);
        reject(err);
        return;
      }
      logger.info(`Project created: ${data.name} (${id})`);
      resolve({
        id,
        name: data.name,
        description: data.description || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    });
  });
}

/**
 * Get all projects
 * @returns {Promise<Array>} - Array of project objects
 */
function getAllProjects() {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM projects ORDER BY created_at DESC';
    db.all(sql, (err, rows) => {
      if (err) {
        logger.error('Error fetching all projects:', err);
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

/**
 * Get a project by ID
 * @param {string} id - Project ID
 * @returns {Promise<Object|null>} - The project object or null if not found
 */
function getProjectById(id) {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM projects WHERE id = ?';
    db.get(sql, [id], (err, row) => {
      if (err) {
        logger.error('Error fetching project by ID:', err);
        reject(err);
        return;
      }
      resolve(row || null);
    });
  });
}

/**
 * Update a project
 * @param {string} id - Project ID
 * @param {Object} fields - Fields to update { name?, description? }
 * @returns {Promise<Object>} - Updated project object
 */
function updateProject(id, fields) {
  return new Promise((resolve, reject) => {
    // Build dynamic SQL based on provided fields
    const updates = [];
    const params = [];

    if (fields.name !== undefined) {
      updates.push('name = ?');
      params.push(fields.name);
    }
    if (fields.description !== undefined) {
      updates.push('description = ?');
      params.push(fields.description);
    }

    if (updates.length === 0) {
      reject(new Error('No fields to update'));
      return;
    }

    updates.push('updated_at = datetime("now")');
    params.push(id);

    const sql = `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`;
    db.run(sql, params, function(err) {
      if (err) {
        logger.error('Error updating project:', err);
        reject(err);
        return;
      }
      if (this.changes === 0) {
        reject(new Error('Project not found'));
        return;
      }
      logger.info(`Project updated: ${id}`);
      getProjectById(id).then(resolve).catch(reject);
    });
  });
}

/**
 * Delete a project
 * @param {string} id - Project ID
 * @returns {Promise<void>}
 */
function deleteProject(id) {
  return new Promise((resolve, reject) => {
    const sql = 'DELETE FROM projects WHERE id = ?';
    db.run(sql, [id], function(err) {
      if (err) {
        logger.error('Error deleting project:', err);
        reject(err);
        return;
      }
      if (this.changes === 0) {
        reject(new Error('Project not found'));
        return;
      }
      logger.info(`Project deleted: ${id}`);
      resolve();
    });
  });
}

/**
 * Get record counts for a project across all record types
 * @param {string} projectId - Project ID
 * @returns {Promise<Object>} - Record counts { memorials, burialRegister, graveCards }
 */
function getProjectRecordCounts(projectId) {
  return new Promise((resolve, reject) => {
    const counts = { memorials: 0, burialRegister: 0, graveCards: 0 };
    let completed = 0;

    // Count memorials
    db.get('SELECT COUNT(*) as count FROM memorials WHERE project_id = ?', [projectId], (err, row) => {
      if (!err && row) counts.memorials = row.count;
      completed++;
      if (completed === 3) resolve(counts);
    });

    // Count burial register entries
    db.get('SELECT COUNT(*) as count FROM burial_register_entries WHERE project_id = ?', [projectId], (err, row) => {
      if (!err && row) counts.burialRegister = row.count;
      completed++;
      if (completed === 3) resolve(counts);
    });

    // Count grave cards
    db.get('SELECT COUNT(*) as count FROM grave_cards WHERE project_id = ?', [projectId], (err, row) => {
      if (!err && row) counts.graveCards = row.count;
      completed++;
      if (completed === 3) resolve(counts);
    });
  });
}

module.exports = {
  initialize,
  createProject,
  getAllProjects,
  getProjectById,
  updateProject,
  deleteProject,
  getProjectRecordCounts,
  db
};
