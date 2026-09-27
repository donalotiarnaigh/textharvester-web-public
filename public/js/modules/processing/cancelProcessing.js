/* eslint-disable quotes */
// cancelProcessing.js

let progressBarUI = null;

// Flag to indicate if cancellation has started
let isCancelling = false;

// Function to simulate progress to 100%
function simulateProgressTo100(currentProgress) {
  let progress = currentProgress;

  function incrementProgress() {
    if (progress < 100) {
      progress += 10; // Increment progress by 10%
      progressBarUI.updateProgress(progress, "Cancelling...");
    } else {
      clearInterval(progressInterval); // Clear the interval once progress reaches 100%
      progressBarUI.updateProgress(100, "Processing cancelled. Redirecting to results...");
      setTimeout(() => {
        window.location.href = "/results.html?status=cancelled";
      }, 1000);
    }
  }

  // Set the interval to increment progress every 10ms
  const progressInterval = setInterval(incrementProgress, 10);
}

// Function to handle cancellation
export function handleCancelProcessing(progressUI) {
  progressBarUI = progressUI; // Store the ProgressBarUI instance
  
  const userConfirmed = confirm(
    "Are you sure you want to cancel? This action will stop all processing, and you may not receive complete results."
  );

  if (userConfirmed) {
    isCancelling = true; // Set the cancelling flag
    fetch("/cancel-processing", {
      method: "POST",
    })
      .then((response) => {
        if (response.ok) {
          console.log("Cancel request successful.");
          progressBarUI.updateProgress(100, "Processing cancelled. Redirecting to results...");
          simulateProgressTo100(
            parseInt(progressBarUI.progressBarFill.style.width) || 0
          );
        } else {
          console.error(
            "Failed to cancel processing - server responded with an error."
          );
          throw new Error("Failed to cancel processing");
        }
      })
      .catch((error) => {
        console.error("Error during cancellation:", error);
        progressBarUI.updateProgress(0, "Failed to cancel processing, please try again.");
        document.getElementById("cancelProcessingButton").disabled = false;
        isCancelling = false; // Reset the cancelling flag on error
      });

    document.getElementById("cancelProcessingButton").disabled = true;
  }
}

export { simulateProgressTo100, isCancelling };
