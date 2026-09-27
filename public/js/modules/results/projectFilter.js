/**
 * Project filter module for results page
 */

export async function initProjectFilter() {
  const projectFilterCard = document.getElementById('projectFilterCard');
  const projectFilter = document.getElementById('projectFilter');

  if (!projectFilter) return;

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
      projectFilter.appendChild(option);
    });

    // Show the filter card if there are projects
    if (projectFilterCard && projects.length > 0) {
      projectFilterCard.style.display = 'block';
    }

    // Restore saved project filter from URL query param
    const urlParams = new URLSearchParams(window.location.search);
    const projectIdParam = urlParams.get('projectId');
    if (projectIdParam) {
      projectFilter.value = projectIdParam;
    }

    // Handle filter changes - reload results with projectId param
    projectFilter.addEventListener('change', (e) => {
      const projectId = e.target.value;
      const newUrl = projectId ? `/results.html?projectId=${encodeURIComponent(projectId)}` : '/results.html';
      window.location.href = newUrl;
    });
  } catch (error) {
    console.error('Error initializing project filter:', error);
  }
}

export function getProjectIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('projectId') || null;
}
