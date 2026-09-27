/* eslint-disable quotes */
// fileUpload.js

import { getSelectedModel } from "./modelSelection.js";
import { getSelectedSourceType, getVolumeId } from "./sourceTypeSelection.js";

export const handleFileUpload = (dropzoneInstance) => {
  console.log("Dropzone initialized"); // Log initialization

  // Handle manual file submission
  document.getElementById("submitFiles").onclick = function () {
    dropzoneInstance.processQueue(); // Manually trigger file submission
  };


  dropzoneInstance.on("complete", function (file) {
    console.log("File upload complete:", file.name); // Log when a file upload is complete

    // With autoProcessQueue: false, we must manually trigger queue draining.
    // Remove the getUploadingFiles check to enable continuous pipeline processing instead of wave-based batches.
    if (dropzoneInstance.getQueuedFiles().length > 0) {
      console.log("Processing next queued file(s)...");
      dropzoneInstance.processQueue();
    }
  });

  dropzoneInstance.on("queuecomplete", function () {
    console.log(
      "All files have been uploaded. Checking if redirect is needed."
    );
    // Only redirect if files were actually uploaded successfully (not just added to queue or rejected)
    const queuedFiles = dropzoneInstance.getQueuedFiles();
    const uploadingFiles = dropzoneInstance.getUploadingFiles();
    const acceptedFiles = dropzoneInstance.getAcceptedFiles();

    // Check if any files were actually accepted and uploaded
    const hasSuccessfulUploads = acceptedFiles.some(file => file.status === 'success');

    if (queuedFiles.length === 0 && uploadingFiles.length === 0 && hasSuccessfulUploads) {
      console.log("All files uploaded successfully. Redirecting to processing.html.");
      window.location.href = "/processing.html"; // Redirect when all files are uploaded
    } else {
      console.warn("Queue complete but conditions not met for redirect:", {
        queuedFiles: queuedFiles.length,
        uploadingFiles: uploadingFiles.length,
        hasSuccessfulUploads
      });
    }
  });

  // Error handling with detailed logging
  dropzoneInstance.on("error", function (file, errorMessage) {
    console.error(
      "Error during file upload:",
      file.name,
      "Error:",
      errorMessage
    );
    // Don't redirect on error - let user see the error
  });

  // Prevent auto-processing when files are added
  dropzoneInstance.on("addedfile", function (file) {
    console.log("File added:", file.name, `(${(file.size / 1024 / 1024).toFixed(2)}MB) - Waiting for manual submit`);

    // Check file size (1GB limit)
    const maxSize = 1024 * 1024 * 1024; // 1GB
    if (file.size > maxSize) {
      console.error(`File ${file.name} exceeds 1GB limit (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
      dropzoneInstance.removeFile(file);
      alert(`File "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum file size is 1GB.`);
      return;
    }

    // Ensure autoProcessQueue is still false
    if (dropzoneInstance.options.autoProcessQueue) {
      console.warn("WARNING: autoProcessQueue is enabled - disabling it");
      dropzoneInstance.options.autoProcessQueue = false;
    }
  });

  dropzoneInstance.on("sending", function (file, xhr, formData) {
    const replaceExisting = document.getElementById('replaceExisting').checked;
    const selectedModel = getSelectedModel();
    const sourceType = getSelectedSourceType();
    const volumeId = getVolumeId();

    let finalSourceType = sourceType;
    if (sourceType.startsWith('custom:')) {
      const schemaId = sourceType.split(':')[1];
      formData.append('schemaId', schemaId);
      finalSourceType = 'record_sheet'; // Fallback for validation
    }

    formData.append('replaceExisting', replaceExisting.toString()); // Convert to string
    formData.append('aiProvider', selectedModel);
    formData.append('source_type', finalSourceType);
    if (sourceType === 'burial_register') {
      formData.append('volume_id', volumeId);
    }
  });
};
