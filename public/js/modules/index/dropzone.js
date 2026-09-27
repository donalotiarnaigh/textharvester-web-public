/* eslint-disable quotes */
/* global Dropzone */

// dropzone.js

import { handleFileUpload } from "./fileUpload.js";
import { initModelSelection } from "./modelSelection.js";
import { initSourceTypeSelection, getSelectedSourceType } from "./sourceTypeSelection.js";
import { initProjectSelection, getSelectedProjectId } from "./projectSelection.js";
import { initCostEstimate } from "./costEstimate.js";

// Ensure Dropzone is defined globally
const initDropzone = () => {
  // Initialize UI components
  initSourceTypeSelection();
  initModelSelection();
  initProjectSelection();

  if (typeof Dropzone === "undefined") {
    console.error(
      "Dropzone is not defined. Make sure Dropzone script is included."
    );
    return;
  }

  Dropzone.options.uploadForm = {
    // We set a broad default here, but validate strictly in 'addedfile'
    acceptedFiles: ".jpg, .jpeg, .pdf",
    maxFiles: 500, // Increased to support large batches (user request)
    maxFilesize: 1024, // 1GB in MB (matches multer limit)
    autoProcessQueue: false, // Manual processing
    parallelUploads: 5, // Throttled to prevent server overload during PDF conversion
    dictInvalidFileType: "Only .jpeg, .jpg, and .pdf files are allowed.",
    dictMaxFilesExceeded: "Maximum of 500 files allowed.",
    dictFileTooBig: "File is too big ({{filesize}}MiB). Max filesize: {{maxFilesize}}MiB.",
    init: function () {
      var dropzoneInstance = this;
      handleFileUpload(dropzoneInstance);
      initCostEstimate(dropzoneInstance);

      // No need to handle file completion for showing conversion status
    },
    sending: function (file, xhr, formData) {
      // Append project_id to form data if selected
      const projectId = getSelectedProjectId();
      if (projectId) {
        formData.append('project_id', projectId);
      }
    },
    // Custom validation logic
    accept: function (file, done) {
      const sourceType = getSelectedSourceType();

      // Strict check for Grave Record Cards
      if (sourceType === 'grave_record_card') {
        if (file.type !== 'application/pdf') {
          const msg = "Grave Record Cards must be PDF files.";
          done(msg);
          // Remove the file immediately to avoid clutter
          this.removeFile(file);
          showError(msg);
          return;
        }
      }

      // Clear any previous errors if a file is accepted
      clearError();
      done();
    }
  };
};

/**
 * Display an error message in the alert container
 * @param {string} message 
 */
function showError(message) {
  const container = document.getElementById('uploadAlertContainer');
  if (container) {
    container.innerHTML = `
      <div class="alert alert-danger alert-dismissible fade show" role="alert">
        <strong>Upload Error:</strong> ${message}
        <button type="button" class="close" data-dismiss="alert" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
    `;
  }
}

/**
 * Clear the error message container
 */
function clearError() {
  const container = document.getElementById('uploadAlertContainer');
  if (container) {
    container.innerHTML = '';
  }
}

export { initDropzone };
