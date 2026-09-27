/* eslint-disable quotes */
// api.js

// Function to fetch results data from the server
export function fetchResultsData(jsonDataElement) {
  fetch("/results-data")
    .then((response) => response.json())
    .then((data) => {
      jsonDataElement.textContent = JSON.stringify(data, null, 2);
    })
    .catch((error) => {
      console.error("Error fetching results:", error);
      jsonDataElement.textContent = "Error loading results.";
    });
}


