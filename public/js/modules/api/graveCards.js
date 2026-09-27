/**
 * API client for Grave Record Cards
 */

/**
 * Fetch all grave cards
 * @returns {Promise<Array>} List of grave cards
 */
export async function getGraveCards() {
  try {
    const response = await fetch('/api/grave-cards');

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return result.data;
  } catch (error) {
    throw new Error(`Failed to fetch grave cards: ${error.message}`);
  }
}

/**
 * Trigger CSV export download
 * @returns {Promise<void>}
 */
export async function exportGraveCardsCsv() {
  try {
    const response = await fetch('/api/grave-cards/csv');

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.setAttribute('download', 'grave_cards.csv');
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    throw new Error(`Failed to export CSV: ${error.message}`);
  }
}
