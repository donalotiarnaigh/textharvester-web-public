const express = require('express');
const request = require('supertest');
const projectRoutes = require('../projectRoutes');
const projectController = require('../../controllers/projectController');

jest.mock('../../controllers/projectController');

describe('Project Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/', projectRoutes);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('GET /', () => {
    it('should call getAllProjects controller', async () => {
      projectController.getAllProjects.mockImplementation((req, res) => {
        res.json([
          { id: '1', name: 'Project 1' },
          { id: '2', name: 'Project 2' }
        ]);
      });

      await request(app).get('/');

      expect(projectController.getAllProjects).toHaveBeenCalled();
    });

    it('should return projects', async () => {
      const mockProjects = [
        { id: '1', name: 'Project 1' },
        { id: '2', name: 'Project 2' }
      ];
      projectController.getAllProjects.mockImplementation((req, res) => {
        res.json(mockProjects);
      });

      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockProjects);
    });

    it('should handle errors', async () => {
      projectController.getAllProjects.mockImplementation((req, res) => {
        res.status(500).json({ error: 'Internal server error' });
      });

      const response = await request(app).get('/');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /', () => {
    it('should call createProject controller', async () => {
      projectController.createProject.mockImplementation((req, res) => {
        res.status(201).json({ id: '1', name: 'New Project' });
      });

      await request(app)
        .post('/')
        .send({ name: 'New Project' });

      expect(projectController.createProject).toHaveBeenCalled();
    });

    it('should create a project with name and description', async () => {
      projectController.createProject.mockImplementation((req, res) => {
        res.status(201).json({
          id: '1',
          name: req.body.name,
          description: req.body.description
        });
      });

      const response = await request(app)
        .post('/')
        .send({ name: 'Test Project', description: 'Test Description' });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Test Project');
      expect(response.body.description).toBe('Test Description');
    });

    it('should return 400 for missing name', async () => {
      projectController.createProject.mockImplementation((req, res) => {
        res.status(400).json({ error: 'Project name is required' });
      });

      const response = await request(app)
        .post('/')
        .send({ description: 'No name' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /:id', () => {
    it('should call getProjectById controller', async () => {
      projectController.getProjectById.mockImplementation((req, res) => {
        res.json({ id: req.params.id, name: 'Project 1' });
      });

      await request(app).get('/123');

      expect(projectController.getProjectById).toHaveBeenCalled();
    });

    it('should return a project by ID', async () => {
      projectController.getProjectById.mockImplementation((req, res) => {
        res.json({ id: '123', name: 'Project 1', description: 'Test' });
      });

      const response = await request(app).get('/123');

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('123');
      expect(response.body.name).toBe('Project 1');
    });

    it('should return 404 for non-existent project', async () => {
      projectController.getProjectById.mockImplementation((req, res) => {
        res.status(404).json({ error: 'Project not found' });
      });

      const response = await request(app).get('/non-existent');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PATCH /:id', () => {
    it('should call updateProject controller', async () => {
      projectController.updateProject.mockImplementation((req, res) => {
        res.json({ id: req.params.id, name: req.body.name });
      });

      await request(app)
        .patch('/123')
        .send({ name: 'Updated Name' });

      expect(projectController.updateProject).toHaveBeenCalled();
    });

    it('should update project name', async () => {
      projectController.updateProject.mockImplementation((req, res) => {
        res.json({
          id: '123',
          name: req.body.name,
          description: 'Original description'
        });
      });

      const response = await request(app)
        .patch('/123')
        .send({ name: 'New Name' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('New Name');
    });

    it('should return 400 for invalid input', async () => {
      projectController.updateProject.mockImplementation((req, res) => {
        res.status(400).json({ error: 'Invalid input' });
      });

      const response = await request(app)
        .patch('/123')
        .send({ name: '' });

      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent project', async () => {
      projectController.updateProject.mockImplementation((req, res) => {
        res.status(404).json({ error: 'Project not found' });
      });

      const response = await request(app)
        .patch('/non-existent')
        .send({ name: 'New Name' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /:id', () => {
    it('should call deleteProject controller', async () => {
      projectController.deleteProject.mockImplementation((req, res) => {
        res.status(204).send();
      });

      await request(app).delete('/123');

      expect(projectController.deleteProject).toHaveBeenCalled();
    });

    it('should delete a project', async () => {
      projectController.deleteProject.mockImplementation((req, res) => {
        res.status(204).send();
      });

      const response = await request(app).delete('/123');

      expect(response.status).toBe(204);
    });

    it('should return 409 if project has records', async () => {
      projectController.deleteProject.mockImplementation((req, res) => {
        res.status(409).json({
          error: 'Cannot delete project with existing records',
          recordCounts: {
            memorials: 5,
            burialRegister: 3,
            graveCards: 2
          }
        });
      });

      const response = await request(app).delete('/123');

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('recordCounts');
    });

    it('should return 404 for non-existent project', async () => {
      projectController.deleteProject.mockImplementation((req, res) => {
        res.status(404).json({ error: 'Project not found' });
      });

      const response = await request(app).delete('/non-existent');

      expect(response.status).toBe(404);
    });
  });
});
