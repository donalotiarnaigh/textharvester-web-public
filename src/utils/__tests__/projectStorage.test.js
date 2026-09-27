jest.unmock('fs');
jest.unmock('sqlite3');

const sqlite3 = require('sqlite3').verbose();

jest.mock('../logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  debugPayload: jest.fn()
}));

let mockDb;

jest.mock('../database', () => {
  // Create in-memory SQLite database for testing
  if (!mockDb) {
    mockDb = new (require('sqlite3').verbose()).Database(':memory:');
  }
  return { db: mockDb };
});

const projectStorage = require('../projectStorage');

describe('projectStorage', () => {
  let testProjectId;

  beforeAll(async () => {
    // Initialize projects table
    await new Promise((resolve, reject) => {
      mockDb.run(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterAll(() => new Promise((resolve, reject) => {
    mockDb.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  }));

  describe('initialize', () => {
    it('should create projects table successfully', async () => {
      // Table already created in beforeAll
      expect(mockDb).toBeDefined();
    });
  });

  describe('createProject', () => {
    it('should create a new project with name and description', async () => {
      const project = await projectStorage.createProject({
        name: 'Test Project 1',
        description: 'A test project'
      });

      expect(project).toBeDefined();
      expect(project.id).toBeDefined();
      expect(project.name).toBe('Test Project 1');
      expect(project.description).toBe('A test project');
      testProjectId = project.id;
    });

    it('should create a project with only name', async () => {
      const project = await projectStorage.createProject({
        name: 'Test Project 2'
      });

      expect(project).toBeDefined();
      expect(project.name).toBe('Test Project 2');
      expect(project.description).toBeNull();
    });

    it('should reject duplicate project names', async () => {
      await expect(
        projectStorage.createProject({ name: 'Test Project 1' })
      ).rejects.toThrow();
    });
  });

  describe('getAllProjects', () => {
    it('should return all projects', async () => {
      const projects = await projectStorage.getAllProjects();

      expect(Array.isArray(projects)).toBe(true);
      expect(projects.length).toBeGreaterThanOrEqual(2);
      expect(projects[0]).toHaveProperty('id');
      expect(projects[0]).toHaveProperty('name');
    });

    it('should return projects ordered by created_at DESC', async () => {
      const projects = await projectStorage.getAllProjects();

      expect(projects.length).toBeGreaterThanOrEqual(2);
      expect(new Date(projects[0].created_at) >= new Date(projects[1].created_at)).toBe(true);
    });
  });

  describe('getProjectById', () => {
    it('should return a project by ID', async () => {
      const project = await projectStorage.getProjectById(testProjectId);

      expect(project).toBeDefined();
      expect(project.id).toBe(testProjectId);
      expect(project.name).toBe('Test Project 1');
    });

    it('should return null for non-existent project', async () => {
      const project = await projectStorage.getProjectById('non-existent-id');

      expect(project).toBeNull();
    });
  });

  describe('updateProject', () => {
    it('should update project name', async () => {
      const updated = await projectStorage.updateProject(testProjectId, {
        name: 'Updated Project 1'
      });

      expect(updated).toBeDefined();
      expect(updated.name).toBe('Updated Project 1');
    });

    it('should update project description', async () => {
      const updated = await projectStorage.updateProject(testProjectId, {
        description: 'Updated description'
      });

      expect(updated).toBeDefined();
      expect(updated.description).toBe('Updated description');
    });

    it('should update multiple fields', async () => {
      const updated = await projectStorage.updateProject(testProjectId, {
        name: 'Final Project Name',
        description: 'Final description'
      });

      expect(updated.name).toBe('Final Project Name');
      expect(updated.description).toBe('Final description');
    });

    it('should reject update with no fields', async () => {
      await expect(
        projectStorage.updateProject(testProjectId, {})
      ).rejects.toThrow('No fields to update');
    });

    it('should reject update of non-existent project', async () => {
      await expect(
        projectStorage.updateProject('non-existent-id', { name: 'New Name' })
      ).rejects.toThrow('Project not found');
    });
  });

  describe('deleteProject', () => {
    it('should delete a project', async () => {
      const projectToDelete = await projectStorage.createProject({
        name: 'Project to Delete'
      });

      await projectStorage.deleteProject(projectToDelete.id);

      const deleted = await projectStorage.getProjectById(projectToDelete.id);
      expect(deleted).toBeNull();
    });

    it('should reject deletion of non-existent project', async () => {
      await expect(
        projectStorage.deleteProject('non-existent-id')
      ).rejects.toThrow('Project not found');
    });
  });

  describe('getProjectRecordCounts', () => {
    it('should return record counts (all zero for test DB)', async () => {
      const counts = await projectStorage.getProjectRecordCounts(testProjectId);

      expect(counts).toBeDefined();
      expect(counts.memorials).toBe(0);
      expect(counts.burialRegister).toBe(0);
      expect(counts.graveCards).toBe(0);
    });

    it('should return object with all count properties', async () => {
      const projects = await projectStorage.getAllProjects();

      expect(projects.length).toBeGreaterThan(0);
      const counts = await projectStorage.getProjectRecordCounts(projects[0].id);

      expect(Object.keys(counts)).toEqual(['memorials', 'burialRegister', 'graveCards']);
    });
  });
});
