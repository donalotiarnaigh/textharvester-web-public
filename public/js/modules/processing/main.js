/* eslint-disable quotes */
// main.js

import { checkProgress } from "./api.js";
import { handleCancelProcessing } from "./cancelProcessing.js";

// Cache DOM element for cancel button
const cancelProcessingButton = document.getElementById(
  "cancelProcessingButton"
);

// Attach event listener to the cancel button
cancelProcessingButton.addEventListener("click", handleCancelProcessing);

// Start checking progress immediately
checkProgress();
