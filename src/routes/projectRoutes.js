const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');

/**
 * GET /api/projects
 * Get all projects
 */
router.get('/', projectController.getAllProjects);

/**
 * POST /api/projects
 * Create a new project
 */
router.post('/', projectController.createProject);

/**
 * GET /api/projects/:id
 * Get a specific project by ID
 */
router.get('/:id', projectController.getProjectById);

/**
 * PATCH /api/projects/:id
 * Update a project
 */
router.patch('/:id', projectController.updateProject);

/**
 * DELETE /api/projects/:id
 * Delete a project
 */
router.delete('/:id', projectController.deleteProject);

module.exports = router;
