/**
 * Project selection module
 */

export async function initProjectSelection() {
  const projectSelect = document.getElementById('projectSelect');
  if (!projectSelect) return;

  try {
    // Fetch projects from API
    const response = await fetch('/api/projects');
    if (!response.ok) {
      console.error('Failed to fetch projects');
      return;
    }

    const projects = await response.json();

    // Populate the dropdown with projects
    projects.forEach(project => {
      const option = document.createElement('option');
      option.value = project.id;
      option.textContent = project.name;
      if (project.description) {
        option.title = project.description;
      }
      projectSelect.appendChild(option);
    });

    // Show the project card if there are projects
    const projectCard = document.getElementById('projectCard');
    if (projectCard && projects.length > 0) {
      projectCard.style.display = 'block';
    }

    // Restore saved project selection from localStorage
    const savedProjectId = localStorage.getItem('selectedProjectId');
    if (savedProjectId) {
      projectSelect.value = savedProjectId;
    }

    // Save project selection when it changes
    projectSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        localStorage.setItem('selectedProjectId', e.target.value);
      } else {
        localStorage.removeItem('selectedProjectId');
      }
    });
  } catch (error) {
    console.error('Error initializing project selection:', error);
  }
}

export function getSelectedProjectId() {
  const projectSelect = document.getElementById('projectSelect');
  return projectSelect ? projectSelect.value || null : null;
}
