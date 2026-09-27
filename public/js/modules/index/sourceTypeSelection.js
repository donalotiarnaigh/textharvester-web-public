/* eslint-disable quotes */
// sourceTypeSelection.js

const SOURCE_TYPES = [
  { value: "record_sheet", label: "Record Sheet" },
  { value: "monument_photo", label: "Monument Photo" },
  { value: "burial_register", label: "Burial Register" },
  { value: "grave_record_card", label: "Grave Record Card" },
  { value: "typographic_analysis", label: "Typographic Analysis" }
];

// Configuration for source type instructions
const SOURCE_INSTRUCTIONS = {
  record_sheet: {
    text: "Drag and drop your JPEG images or PDF documents into the drop zone below, or click to select files. Files will be processed for text extraction.",
    list: [
      "• Supported files: JPEG, PDF (max 100MB per file)",
      "• PDFs: Each page processed separately",
      "• Note: PDFs must not be encrypted"
    ],
    acceptedFiles: ".jpg, .jpeg, .pdf"
  },
  monument_photo: {
    text: "Upload photos of monuments or headstones. The AI will attempt to transcribe the inscription and identify the memorial number.",
    list: [
      "• Supported files: JPEG, PDF (max 100MB per file)",
      "• Best results with clear, high-contrast images",
      "• One monument per image recommended"
    ],
    acceptedFiles: ".jpg, .jpeg, .pdf"
  },
  burial_register: {
    text: "Upload pages from burial registers. The system will extract rows and columns into structured data.",
    list: [
      "• Supported files: JPEG, PDF (max 100MB per file)",
      "• Ensure pages are flat and well-lit",
      "• Single page view preferred over double-page spreads"
    ],
    acceptedFiles: ".jpg, .jpeg, .pdf"
  },
  grave_record_card: {
    text: "Upload 2-sided grave record cards as PDFs. The system will stitch the front and back pages and extract detailed interment data.",
    list: [
      "• <strong>Required:</strong> PDF files only",
      "• <strong>Required:</strong> Exactly 2 pages per PDF (Front & Back)",
      "• Files with != 2 pages will be rejected"
    ],
    acceptedFiles: ".pdf"
  },
  typographic_analysis: {
    text: "Upload a high-quality monument photo for detailed typographic and iconographic analysis. The system will preserve historical characters (e.g., long-s) and describe decorative elements.",
    list: [
      "• Supported files: JPEG, PDF (max 100MB per file)",
      "• Best results with high-resolution images",
      "• Focus on clear lettering and carved details"
    ],
    acceptedFiles: ".jpg, .jpeg, .pdf"
  }
};

/**
 * Update the instruction text elements based on selected type
 * @param {string} sourceType 
 */
function updateInstructions(sourceType) {
  const config = SOURCE_INSTRUCTIONS[sourceType] || SOURCE_INSTRUCTIONS.record_sheet;

  const textEl = document.getElementById("instructionsText");
  const listEl = document.getElementById("instructionsList");

  // Handle custom schemas
  if (sourceType.startsWith('custom:')) {
    if (textEl) textEl.textContent = "Upload files for your custom document type. The system will extract data based on your schema definition.";
    if (listEl) listEl.innerHTML = "<div>• Supported files: JPEG, PDF</div><div>• dynamic extraction</div>";
    return;
  }

  if (textEl) {
    textEl.textContent = config.text;
  }

  if (listEl) {
    listEl.innerHTML = config.list.map(item => `<div class="mb-1">${item}</div>`).join("");
  }
}

/**
 * Initialize the source type selection UI and interactions
 */
export const initSourceTypeSelection = () => {
  console.log("Initializing source type selection");

  const sourceTypeSelect = document.getElementById("sourceTypeSelect");
  const volumeIdGroup = document.getElementById("volumeIdGroup");

  if (!sourceTypeSelect || !volumeIdGroup) {
    console.error("Source type selection elements not found in DOM.");
    return;
  }

  // Fetch custom schemas and populate
  fetch('/api/schemas')
    .then(res => res.json())
    .then(schemas => {
      const customOptions = schemas.map(s =>
        `<option value="custom:${s.id}">Custom: ${s.name}</option>`
      ).join("");

      const standardOptions = SOURCE_TYPES.map((type) => {
        return `<option value="${type.value}">${type.label}</option>`;
      }).join("");

      sourceTypeSelect.innerHTML = standardOptions + (customOptions ? `<optgroup label="Custom Schemas">${customOptions}</optgroup>` : '');

      // Restore selection after repopulating
      if (isValidSaved || savedType.startsWith('custom:')) {
        sourceTypeSelect.value = savedType;
      } else {
        sourceTypeSelect.value = defaultValue;
      }

      // Initial UI update
      toggleVolumeIdVisibility(sourceTypeSelect.value, volumeIdGroup);
      updateInstructions(sourceTypeSelect.value);
    })
    .catch(err => console.error('Failed to load custom schemas:', err));

  // Load saved preference or default to record_sheet
  const STORAGE_KEY = 'historic_graves_source_type';
  const savedType = localStorage.getItem(STORAGE_KEY) || "record_sheet";
  const isValidSaved = SOURCE_TYPES.some(t => t.value === savedType);
  const defaultValue = isValidSaved ? savedType : "record_sheet";

  sourceTypeSelect.value = defaultValue;
  toggleVolumeIdVisibility(defaultValue, volumeIdGroup);
  updateInstructions(defaultValue); // Initial instruction update

  sourceTypeSelect.addEventListener("change", (event) => {
    const selectedType = event.target.value;
    localStorage.setItem(STORAGE_KEY, selectedType);
    toggleVolumeIdVisibility(selectedType, volumeIdGroup);
    updateInstructions(selectedType); // Update instructions on change
  });
};

/**
 * Fetch distinct volume IDs from the API and populate the datalist
 */
async function fetchAndPopulateVolumeIds() {
  const datalist = document.getElementById("volumeIdList");
  if (!datalist) return;

  try {
    const response = await fetch('/api/volume-ids');
    const data = await response.json();
    const volumeIds = data.volumeIds || [];

    datalist.innerHTML = '';
    volumeIds.forEach(id => {
      const option = document.createElement('option');
      option.value = id;
      datalist.appendChild(option);
    });
  } catch (err) {
    console.error('Failed to fetch volume IDs:', err);
    // Graceful degradation: datalist stays empty, user types freely
  }
}

/**
 * Show or hide the volume ID input based on source type
 * @param {string} sourceType - Selected source type
 * @param {HTMLElement} volumeIdGroup - Container for the volume ID field
 */
function toggleVolumeIdVisibility(sourceType, volumeIdGroup) {
  if (sourceType === "burial_register") {
    volumeIdGroup.classList.remove("d-none");
    fetchAndPopulateVolumeIds();
  } else {
    volumeIdGroup.classList.add("d-none");
  }
}

/**
 * Get the selected source type
 * @returns {string} Source type value
 */
export const getSelectedSourceType = () => {
  const selectElement = document.getElementById("sourceTypeSelect");
  return selectElement ? selectElement.value : "record_sheet";
};

/**
 * Get the accepted file extensions for the current source type
 * @returns {string} Comma-separated extensions e.g. ".pdf" or ".jpg, .jpeg, .pdf"
 */
export const getAcceptedFileTypes = () => {
  const type = getSelectedSourceType();
  return (SOURCE_INSTRUCTIONS[type] || SOURCE_INSTRUCTIONS.record_sheet).acceptedFiles;
};

/**
 * Get the volume ID input value
 * @returns {string} Volume ID or default "vol1"
 */
export const getVolumeId = () => {
  const inputElement = document.getElementById("volumeId");
  if (!inputElement) {
    return "vol1";
  }
  const trimmedValue = inputElement.value.trim();
  return trimmedValue || "vol1";
};
