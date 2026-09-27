/**
 * Project Management Module
 */

let currentEditingProjectId = null;

/**
 * Show alert message
 */
function showAlert(message, type = 'info') {
  const alertContainer = document.getElementById('alertContainer');
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
  alertDiv.innerHTML = `
    ${message}
    <button type="button" class="close" data-dismiss="alert" aria-label="Close">
      <span aria-hidden="true">&times;</span>
    </button>
  `;
  alertContainer.innerHTML = '';
  alertContainer.appendChild(alertDiv);

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    alertDiv.remove();
  }, 5000);
}

/**
 * Load and display projects
 */
async function loadProjects() {
  const loadingSpinner = document.getElementById('loadingSpinner');
  const projectsContainer = document.getElementById('projectsContainer');

  loadingSpinner.style.display = 'block';

  try {
    const response = await fetch('/api/projects');
    if (!response.ok) {
      throw new Error('Failed to load projects');
    }

    const projects = await response.json();
    loadingSpinner.style.display = 'none';

    if (projects.length === 0) {
      projectsContainer.innerHTML = `
        <div class="col-12">
          <div class="text-center text-muted py-5">
            <i class="fas fa-folder-open fa-3x mb-3"></i>
            <p>No projects yet. Create one to get started.</p>
          </div>
        </div>
      `;
      return;
    }

    // Clear container and render projects
    projectsContainer.innerHTML = '';
    projects.forEach(project => {
      projectsContainer.appendChild(createProjectCard(project));
    });
  } catch (error) {
    loadingSpinner.style.display = 'none';
    showAlert(`Error loading projects: ${error.message}`, 'danger');
  }
}

/**
 * Create project card HTML
 */
function createProjectCard(project) {
  const card = document.createElement('div');
  card.className = 'col-md-6 col-lg-4 mb-4';

  const createdDate = new Date(project.created_at).toLocaleDateString();
  const description = project.description ? project.description.substring(0, 100) : 'No description';

  card.innerHTML = `
    <div class="card h-100">
      <div class="card-body">
        <h5 class="card-title">
          <i class="fas fa-folder"></i> ${escapeHtml(project.name)}
        </h5>
        <p class="card-text text-muted small">${escapeHtml(description)}</p>
        <small class="text-muted">Created: ${createdDate}</small>
      </div>
      <div class="card-footer bg-light">
        <button class="btn btn-sm btn-outline-primary" onclick="editProject('${project.id}')">
          <i class="fas fa-edit"></i> Edit
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteProject('${project.id}', '${escapeHtml(project.name)}')">
          <i class="fas fa-trash"></i> Delete
        </button>
      </div>
    </div>
  `;

  return card;
}

/**
 * Edit project
 */
async function editProject(projectId) {
  try {
    const response = await fetch(`/api/projects/${projectId}`);
    if (!response.ok) {
      throw new Error('Failed to load project');
    }

    const project = await response.json();
    currentEditingProjectId = projectId;

    document.getElementById('modalTitle').textContent = 'Edit Project';
    document.getElementById('projectName').value = project.name;
    document.getElementById('projectDescription').value = project.description || '';

    const modal = new window.bootstrap.Modal(document.getElementById('createProjectModal'));
    modal.show();
  } catch (error) {
    showAlert(`Error loading project: ${error.message}`, 'danger');
  }
}

/**
 * Delete project (show confirmation)
 */
function deleteProject(projectId, projectName) {
  currentEditingProjectId = projectId;
  const deleteMessage = document.getElementById('deleteMessage');
  deleteMessage.innerHTML = `Are you sure you want to delete the project "<strong>${escapeHtml(projectName)}</strong>"?`;

  const modal = new window.bootstrap.Modal(document.getElementById('deleteConfirmModal'));
  modal.show();
}

/**
 * Confirm delete project
 */
async function confirmDeleteProject() {
  if (!currentEditingProjectId) return;

  try {
    const response = await fetch(`/api/projects/${currentEditingProjectId}`, {
      method: 'DELETE'
    });

    if (response.status === 409) {
      const data = await response.json();
      showAlert(`Cannot delete project with existing records. Records: ${data.recordCounts.memorials} memorials, ${data.recordCounts.burialRegister} burial entries, ${data.recordCounts.graveCards} grave cards.`, 'warning');
      return;
    }

    if (!response.ok) {
      throw new Error('Failed to delete project');
    }

    showAlert('Project deleted successfully', 'success');
    window.bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal')).hide();
    loadProjects();
  } catch (error) {
    showAlert(`Error deleting project: ${error.message}`, 'danger');
  }
}

/**
 * Save project (create or update)
 */
async function saveProject() {
  const name = document.getElementById('projectName').value.trim();
  const description = document.getElementById('projectDescription').value.trim();

  if (!name) {
    showAlert('Project name is required', 'warning');
    return;
  }

  try {
    const method = currentEditingProjectId ? 'PATCH' : 'POST';
    const url = currentEditingProjectId ? `/api/projects/${currentEditingProjectId}` : '/api/projects';
    const body = { name, description: description || null };

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to save project');
    }

    showAlert(currentEditingProjectId ? 'Project updated successfully' : 'Project created successfully', 'success');
    window.bootstrap.Modal.getInstance(document.getElementById('createProjectModal')).hide();
    resetForm();
    loadProjects();
  } catch (error) {
    showAlert(`Error saving project: ${error.message}`, 'danger');
  }
}

/**
 * Reset form
 */
function resetForm() {
  document.getElementById('projectForm').reset();
  document.getElementById('modalTitle').textContent = 'Create New Project';
  currentEditingProjectId = null;
}

/**
 * Escape HTML entities
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Initialize event listeners
 */
function initEventListeners() {
  const createModal = document.getElementById('createProjectModal');
  createModal.addEventListener('hidden.bs.modal', () => {
    resetForm();
  });

  document.getElementById('saveProjectBtn').addEventListener('click', saveProject);
  document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDeleteProject);
}

/**
 * Initialize page
 */
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadProjects();
});

// Export functions for onclick handlers
window.editProject = editProject;
window.deleteProject = deleteProject;
