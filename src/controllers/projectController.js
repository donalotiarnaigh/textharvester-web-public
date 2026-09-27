const logger = require('../utils/logger');
const projectStorage = require('../utils/projectStorage');

/**
 * Get all projects
 * GET /api/projects
 */
async function getAllProjects(req, res) {
  try {
    const projects = await projectStorage.getAllProjects();
    res.json(projects);
  } catch (error) {
    logger.error('Error fetching all projects:', error);
    res.status(500).json({ error: 'Failed to retrieve projects' });
  }
}

/**
 * Get a specific project
 * GET /api/projects/:id
 */
async function getProjectById(req, res) {
  try {
    const project = await projectStorage.getProjectById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    logger.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to retrieve project' });
  }
}

/**
 * Create a new project
 * POST /api/projects
 */
async function createProject(req, res) {
  try {
    const { name, description } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const project = await projectStorage.createProject({
      name: name.trim(),
      description: description ? description.trim() : null
    });

    res.status(201).json(project);
  } catch (error) {
    logger.error('Error creating project:', error);
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Project name already exists' });
    }
    res.status(500).json({ error: 'Failed to create project' });
  }
}

/**
 * Update a project
 * PATCH /api/projects/:id
 */
async function updateProject(req, res) {
  try {
    const { name, description } = req.body;
    const updates = {};

    if (name !== undefined) {
      if (name && name.trim()) {
        updates.name = name.trim();
      } else {
        return res.status(400).json({ error: 'Project name cannot be empty' });
      }
    }

    if (description !== undefined) {
      updates.description = description ? description.trim() : null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const project = await projectStorage.updateProject(req.params.id, updates);
    res.json(project);
  } catch (error) {
    logger.error('Error updating project:', error);
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Project name already exists' });
    }
    if (error.message && error.message.includes('Project not found')) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.status(500).json({ error: 'Failed to update project' });
  }
}

/**
 * Delete a project
 * DELETE /api/projects/:id
 */
async function deleteProject(req, res) {
  try {
    const counts = await projectStorage.getProjectRecordCounts(req.params.id);
    const totalRecords = counts.memorials + counts.burialRegister + counts.graveCards;

    if (totalRecords > 0) {
      return res.status(409).json({
        error: 'Cannot delete project with existing records',
        recordCounts: counts
      });
    }

    await projectStorage.deleteProject(req.params.id);
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting project:', error);
    if (error.message && error.message.includes('Project not found')) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.status(500).json({ error: 'Failed to delete project' });
  }
}

module.exports = {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject
};
