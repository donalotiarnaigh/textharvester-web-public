// costEstimate.js

let debounceTimer = null;

/**
 * Fetch cost estimate from the API
 * @param {number} fileCount - Number of files to process
 * @param {string} provider - Provider key (openai, anthropic, gemini)
 * @param {string} sourceType - Source type (record_sheet, burial_register, etc)
 * @param {number} pdfCount - Number of PDF files (for page multiplier)
 * @returns {Promise<object>} CostEstimateResult
 */
export async function fetchCostEstimate(fileCount, provider, sourceType, pdfCount) {
  try {
    const params = new URLSearchParams({
      fileCount,
      provider,
      sourceType,
    });

    if (pdfCount > 0) {
      params.append('pdfCount', pdfCount);
    }

    const response = await fetch(`/api/cost-estimate?${params.toString()}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch cost estimate');
    }

    return await response.json();
  } catch (err) {
    console.error('Error fetching cost estimate:', err);
    throw err;
  }
}

/**
 * Render the cost estimate panel with current estimate
 * @param {object} estimate - Cost estimate result from API
 */
export function renderCostEstimate(estimate) {
  const panel = document.getElementById('costEstimatePanel');
  if (!panel) return;

  // Show panel
  panel.style.display = 'block';

  const content = document.getElementById('costEstimateContent');
  if (!content) return;

  // Calculate progress bar color based on percentage of cap
  let barColor = 'success';
  if (estimate.pctOfCap >= 90) {
    barColor = 'danger';
  } else if (estimate.pctOfCap >= 70) {
    barColor = 'warning';
  }

  // Build warning HTML if exceeds cap
  let warningHtml = '';
  if (estimate.exceedsCap) {
    warningHtml = `
      <div class="alert alert-warning mt-2" role="alert">
        <strong>⚠️ Warning:</strong> This batch may exceed the $${estimate.sessionCap.toFixed(2)} session cap.
        Processing will halt when the cap is reached.
      </div>
    `;
  }

  // Build default data notice if using defaults
  let defaultNoticeHtml = '';
  if (estimate.isDefault) {
    defaultNoticeHtml = `
      <div class="small text-muted mt-2">
        <em>Note: Estimates based on default values (no historical data for this combination)</em>
      </div>
    `;
  }

  // Render content
  content.innerHTML = `
    <div class="row">
      <div class="col-md-6">
        <div>
          <strong>Estimated Total Cost:</strong> <span class="cost-total">$${estimate.estimatedTotalCost.toFixed(2)}</span>
        </div>
        <div class="text-muted small">
          (${estimate.estimatedPerFileCost.toFixed(4)} per file × ${estimate.effectiveFileCount} effective files)
        </div>
      </div>
      <div class="col-md-6">
        <div>
          <strong>Session Cap:</strong> <span>$${estimate.sessionCap.toFixed(2)}</span>
        </div>
        <div class="progress mt-2" style="height: 24px;">
          <div
            class="progress-bar bg-${barColor}"
            role="progressbar"
            style="width: ${Math.min(estimate.pctOfCap, 100)}%;"
            aria-valuenow="${estimate.pctOfCap}"
            aria-valuemin="0"
            aria-valuemax="100">
            ${estimate.pctOfCap.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
    ${warningHtml}
    ${defaultNoticeHtml}
    <div class="small text-muted mt-2">
      <em>${estimate.disclaimer}</em>
    </div>
  `;
}

/**
 * Hide the cost estimate panel
 */
export function hideCostEstimate() {
  const panel = document.getElementById('costEstimatePanel');
  if (panel) {
    panel.style.display = 'none';
  }
}

/**
 * Update cost estimate based on current form state
 * @param {Dropzone} dropzoneInstance - Dropzone instance
 */
async function updateCostEstimate(dropzoneInstance) {
  try {
    const fileCount = dropzoneInstance.getAcceptedFiles().length;

    if (fileCount === 0) {
      hideCostEstimate();
      return;
    }

    // Get form selections
    const providerSelect = document.getElementById('modelSelect');
    const sourceTypeSelect = document.getElementById('sourceTypeSelect');

    if (!providerSelect || !sourceTypeSelect) {
      hideCostEstimate();
      return;
    }

    const provider = providerSelect.value;
    const sourceType = sourceTypeSelect.value;

    if (!provider || !sourceType) {
      hideCostEstimate();
      return;
    }

    // Count PDFs for multiplier calculation
    const allFiles = dropzoneInstance.getAcceptedFiles();
    const pdfCount = allFiles.filter((file) => {
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
      return isPdf;
    }).length;

    // Fetch estimate
    const estimate = await fetchCostEstimate(fileCount, provider, sourceType, pdfCount);
    renderCostEstimate(estimate);
  } catch (err) {
    console.error('Error updating cost estimate:', err);
    hideCostEstimate();
  }
}

/**
 * Debounced update of cost estimate
 * @param {Dropzone} dropzoneInstance
 */
function debouncedUpdateCostEstimate(dropzoneInstance) {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    updateCostEstimate(dropzoneInstance);
  }, 300);
}

/**
 * Initialize cost estimate module with Dropzone and selectors
 * Called after Dropzone is initialized
 * @param {Dropzone} dropzoneInstance - Dropzone instance
 */
export function initCostEstimate(dropzoneInstance) {
  // Listen for file additions
  dropzoneInstance.on('addedfile', () => {
    debouncedUpdateCostEstimate(dropzoneInstance);
  });

  // Listen for file removals
  dropzoneInstance.on('removedfile', () => {
    debouncedUpdateCostEstimate(dropzoneInstance);
  });

  // Listen for model selection changes
  const modelSelect = document.getElementById('modelSelect');
  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      debouncedUpdateCostEstimate(dropzoneInstance);
    });
  }

  // Listen for source type selection changes
  const sourceTypeSelect = document.getElementById('sourceTypeSelect');
  if (sourceTypeSelect) {
    sourceTypeSelect.addEventListener('change', () => {
      debouncedUpdateCostEstimate(dropzoneInstance);
    });
  }
}
