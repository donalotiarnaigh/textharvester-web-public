/**
 * @jest-environment jsdom
 */

import { initSourceTypeSelection } from '../../public/js/modules/index/sourceTypeSelection.js';
import { handleFileUpload } from '../../public/js/modules/index/fileUpload.js';

const buildDom = () => {
  document.body.innerHTML = `
    <div class="form-group mb-3">
      <select id="sourceTypeSelect"></select>
    </div>
    <div id="volumeIdGroup" class="form-group d-none">
      <input id="volumeId" value="vol1" />
    </div>
    <div class="custom-control">
      <input type="checkbox" id="replaceExisting" class="custom-control-input" />
    </div>
    <select id="modelSelect">
      <option value="openai">OpenAI</option>
      <option value="anthropic">Anthropic</option>
    </select>
    <button id="submitFiles">Submit</button>
  `;
};

const createDropzoneMock = () => {
  const events = {};
  return {
    events,
    processQueue: jest.fn(),
    on: jest.fn((event, callback) => {
      events[event] = callback;
    })
  };
};

const createFormDataMock = () => ({
  append: jest.fn()
});

describe('Source type upload integration', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();
    // Mock global fetch for schemas
    global.fetch = jest.fn(() => Promise.resolve({
      json: () => Promise.resolve([])
    }));
    buildDom();
    initSourceTypeSelection();
    // Wait for fetch promise to resolve and populate DOM
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  const triggerSending = (dropzoneInstance, overrides = {}) => {
    const file = { name: 'test-file.jpg' };
    const xhr = {};
    const formData = createFormDataMock();
    if (overrides.replaceExisting) {
      document.getElementById('replaceExisting').checked = true;
    }

    dropzoneInstance.events.sending(file, xhr, formData);
    return formData;
  };

  it('appends record sheet parameters by default', () => {
    const dropzoneInstance = createDropzoneMock();
    handleFileUpload(dropzoneInstance);

    const formData = triggerSending(dropzoneInstance);

    expect(formData.append).toHaveBeenCalledWith('replaceExisting', 'false');
    expect(formData.append).toHaveBeenCalledWith('aiProvider', 'openai');
    expect(formData.append).toHaveBeenCalledWith('source_type', 'record_sheet');
    expect(formData.append).not.toHaveBeenCalledWith(
      'volume_id',
      expect.anything()
    );
  });

  it('appends monument photo parameters when selected', () => {
    const dropzoneInstance = createDropzoneMock();
    const sourceSelect = document.getElementById('sourceTypeSelect');
    sourceSelect.value = 'monument_photo';
    sourceSelect.dispatchEvent(new Event('change'));

    handleFileUpload(dropzoneInstance);
    const formData = triggerSending(dropzoneInstance, { replaceExisting: true });

    expect(formData.append).toHaveBeenCalledWith('replaceExisting', 'true');
    expect(formData.append).toHaveBeenCalledWith('aiProvider', 'openai');
    expect(formData.append).toHaveBeenCalledWith('source_type', 'monument_photo');
    expect(formData.append).not.toHaveBeenCalledWith(
      'volume_id',
      expect.anything()
    );
  });

  it('appends burial register parameters and volume id', () => {
    const dropzoneInstance = createDropzoneMock();
    const sourceSelect = document.getElementById('sourceTypeSelect');
    const volumeInput = document.getElementById('volumeId');

    sourceSelect.value = 'burial_register';
    sourceSelect.dispatchEvent(new Event('change'));
    volumeInput.value = 'vol9';

    handleFileUpload(dropzoneInstance);
    const formData = triggerSending(dropzoneInstance);

    expect(formData.append).toHaveBeenCalledWith('replaceExisting', 'false');
    expect(formData.append).toHaveBeenCalledWith('aiProvider', 'openai');
    expect(formData.append).toHaveBeenCalledWith('source_type', 'burial_register');
    expect(formData.append).toHaveBeenCalledWith('volume_id', 'vol9');
  });

  it('uses default volume id when burial register input is blank', () => {
    const dropzoneInstance = createDropzoneMock();
    const sourceSelect = document.getElementById('sourceTypeSelect');
    const volumeInput = document.getElementById('volumeId');

    sourceSelect.value = 'burial_register';
    sourceSelect.dispatchEvent(new Event('change'));
    volumeInput.value = '   ';

    handleFileUpload(dropzoneInstance);
    const formData = triggerSending(dropzoneInstance);

    expect(formData.append).toHaveBeenCalledWith('source_type', 'burial_register');
    expect(formData.append).toHaveBeenCalledWith('volume_id', 'vol1');
  });
});
