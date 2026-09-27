/**
 * @jest-environment jsdom
 */

const { ErrorDisplay } = require('../ErrorDisplay');

describe('ErrorDisplay', () => {
  let errorDisplay;
  
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="errorContainer" style="display: none;">
        <h3>Processing Notices</h3>
        <div id="errorList"></div>
      </div>
    `;
    errorDisplay = new ErrorDisplay();
  });

  it('should display error messages when errors are present', () => {
    const errors = [
      {
        fileName: 'file1.jpg',
        errorType: 'empty_sheet',
        errorMessage: 'No readable text found on the sheet'
      },
      {
        fileName: 'file2.jpg',
        errorType: 'validation',
        errorMessage: 'Invalid year format'
      }
    ];

    errorDisplay.updateErrorMessages(errors);

    // Container should be visible
    expect(document.getElementById('errorContainer').style.display).toBe('block');

    // Error list should contain both errors
    const errorItems = document.querySelectorAll('.error-item');
    expect(errorItems.length).toBe(2);

    // Verify content of error messages
    expect(errorItems[0].innerHTML).toContain('file1.jpg');
    expect(errorItems[0].innerHTML).toContain('No readable text found on the sheet');

    expect(errorItems[1].innerHTML).toContain('file2.jpg');
    expect(errorItems[1].innerHTML).toContain('Invalid year format');
  });

  it('should hide container when no errors are present', () => {
    // First set container to visible
    document.getElementById('errorContainer').style.display = 'block';

    // Update with empty errors array
    errorDisplay.updateErrorMessages([]);

    // Container should be hidden
    expect(document.getElementById('errorContainer').style.display).toBe('none');
  });

  it('should clear previous errors when updating', () => {
    // First add some errors
    const initialErrors = [
      {
        fileName: 'file1.jpg',
        errorType: 'empty_sheet',
        errorMessage: 'No readable text found on the sheet'
      }
    ];

    errorDisplay.updateErrorMessages(initialErrors);
    expect(document.querySelectorAll('.error-item').length).toBe(1);

    // Now update with new errors
    const newErrors = [
      {
        fileName: 'file2.jpg',
        errorType: 'validation',
        errorMessage: 'Invalid year format'
      }
    ];

    errorDisplay.updateErrorMessages(newErrors);

    // Should only have the new error
    const errorItems = document.querySelectorAll('.error-item');
    expect(errorItems.length).toBe(1);
    expect(errorItems[0].innerHTML).toContain('file2.jpg');
  });

  it('should format errors based on type', () => {
    const errors = [
      {
        fileName: 'file1.jpg',
        errorType: 'empty_sheet',
        errorMessage: 'No readable text found on the sheet'
      },
      {
        fileName: 'file2.jpg',
        errorType: 'processing_failed',
        errorMessage: 'Processing failed after 3 attempts'
      },
      {
        fileName: 'file3.jpg',
        errorType: 'unknown',
        errorMessage: 'An unknown error occurred'
      }
    ];

    errorDisplay.updateErrorMessages(errors);

    const errorItems = document.querySelectorAll('.error-item');

    // Verify error messages are displayed correctly
    expect(errorItems[0].innerHTML).toContain('file1.jpg');
    expect(errorItems[0].innerHTML).toContain('No readable text found on the sheet');

    expect(errorItems[1].innerHTML).toContain('file2.jpg');
    expect(errorItems[1].innerHTML).toContain('Processing failed after 3 attempts');

    expect(errorItems[2].innerHTML).toContain('file3.jpg');
    expect(errorItems[2].innerHTML).toContain('An unknown error occurred');
  });
}); 