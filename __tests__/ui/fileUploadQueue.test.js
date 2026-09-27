/**
 * @jest-environment jsdom
 */

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
  const queuedFiles = [];
  const uploadingFiles = [];
  const acceptedFiles = [];

  return {
    events,
    queuedFiles,
    uploadingFiles,
    acceptedFiles,
    options: {
      autoProcessQueue: false
    },
    processQueue: jest.fn(),
    on: jest.fn((event, callback) => {
      events[event] = callback;
    }),
    getQueuedFiles: jest.fn(function() {
      return this.queuedFiles;
    }),
    getUploadingFiles: jest.fn(function() {
      return this.uploadingFiles;
    }),
    getAcceptedFiles: jest.fn(function() {
      return this.acceptedFiles;
    })
  };
};

describe('Frontend upload queue management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    global.fetch = jest.fn(() => Promise.resolve({
      json: () => Promise.resolve([])
    }));
    buildDom();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls processQueue when queued files remain, even while uploads are in progress', () => {
    const dropzone = createDropzoneMock();
    handleFileUpload(dropzone);

    // Setup: 3 queued files, 2 uploading
    dropzone.queuedFiles = [{ name: 'file1.jpg' }, { name: 'file2.jpg' }, { name: 'file3.jpg' }];
    dropzone.uploadingFiles = [{ name: 'uploading1.jpg' }, { name: 'uploading2.jpg' }];

    // Trigger complete event (simulating a file finishing upload)
    dropzone.events.complete({ name: 'uploading1.jpg' });

    // Assert processQueue was called despite uploadingFiles not being empty
    expect(dropzone.processQueue).toHaveBeenCalled();
  });

  it('does not call processQueue when queue is empty', () => {
    const dropzone = createDropzoneMock();
    handleFileUpload(dropzone);

    // Setup: empty queue
    dropzone.queuedFiles = [];
    dropzone.uploadingFiles = [];

    // Trigger complete event
    dropzone.events.complete({ name: 'somefile.jpg' });

    // Assert processQueue was NOT called
    expect(dropzone.processQueue).not.toHaveBeenCalled();
  });

  it('calls processQueue on every individual file completion', () => {
    const dropzone = createDropzoneMock();
    handleFileUpload(dropzone);

    // Setup initial state: 3 files queued
    dropzone.queuedFiles = [{ name: 'file1.jpg' }, { name: 'file2.jpg' }, { name: 'file3.jpg' }];
    dropzone.uploadingFiles = [];

    // First completion
    dropzone.events.complete({ name: 'completed1.jpg' });
    expect(dropzone.processQueue).toHaveBeenCalledTimes(1);

    // Second completion (simulate file removed from queue)
    dropzone.queuedFiles = [{ name: 'file2.jpg' }, { name: 'file3.jpg' }];
    dropzone.events.complete({ name: 'completed2.jpg' });
    expect(dropzone.processQueue).toHaveBeenCalledTimes(2);

    // Third completion
    dropzone.queuedFiles = [{ name: 'file3.jpg' }];
    dropzone.events.complete({ name: 'completed3.jpg' });
    expect(dropzone.processQueue).toHaveBeenCalledTimes(3);
  });

  it('calls processQueue after error completion when queued files remain', () => {
    const dropzone = createDropzoneMock();
    handleFileUpload(dropzone);

    // Setup: files still queued, an error occurred
    dropzone.queuedFiles = [{ name: 'file1.jpg' }, { name: 'file2.jpg' }];
    dropzone.uploadingFiles = [];

    // Trigger complete event for errored file
    dropzone.events.complete({ name: 'errored.jpg', status: 'error' });

    // Assert processQueue was called
    expect(dropzone.processQueue).toHaveBeenCalled();
  });

  it('redirects on queuecomplete when all files succeeded', () => {
    const dropzone = createDropzoneMock();
    handleFileUpload(dropzone);

    // Mock window.location.href
    delete window.location;
    window.location = { href: '' };

    // Setup: all conditions met for redirect
    dropzone.queuedFiles = [];
    dropzone.uploadingFiles = [];
    dropzone.acceptedFiles = [
      { name: 'file1.jpg', status: 'success' },
      { name: 'file2.jpg', status: 'success' }
    ];

    // Trigger queuecomplete
    dropzone.events.queuecomplete();

    // Assert redirect happened
    expect(window.location.href).toBe('/processing.html');
  });

  it('does not redirect when queuecomplete fires but files remain queued', () => {
    const dropzone = createDropzoneMock();
    handleFileUpload(dropzone);

    // Mock window.location.href
    delete window.location;
    window.location = { href: '' };

    // Setup: files still in queue
    dropzone.queuedFiles = [{ name: 'file1.jpg' }];
    dropzone.uploadingFiles = [];
    dropzone.acceptedFiles = [];

    // Trigger queuecomplete
    dropzone.events.queuecomplete();

    // Assert NO redirect happened
    expect(window.location.href).toBe('');
  });

  it('pipeline: slot filled immediately when one upload completes', () => {
    const dropzone = createDropzoneMock();
    handleFileUpload(dropzone);

    // Setup: 4 uploading, 10 queued (simulating parallelUploads: 5, 1 completed)
    dropzone.queuedFiles = Array.from({ length: 10 }, (_, i) => ({ name: `queued${i}.jpg` }));
    dropzone.uploadingFiles = Array.from({ length: 4 }, (_, i) => ({ name: `uploading${i}.jpg` }));

    // One upload completes
    dropzone.events.complete({ name: 'uploading0.jpg' });

    // Assert processQueue called to fill the slot
    expect(dropzone.processQueue).toHaveBeenCalled();
  });

  it('does not call processQueue on sendingfile or addedfile events', () => {
    const dropzone = createDropzoneMock();
    handleFileUpload(dropzone);

    // Setup state
    dropzone.queuedFiles = [{ name: 'file1.jpg' }];

    // Trigger addedfile (should not call processQueue)
    dropzone.events.addedfile({ name: 'newfile.jpg', size: 1024 });
    expect(dropzone.processQueue).not.toHaveBeenCalled();

    // Trigger sending (should not call processQueue)
    dropzone.events.sending({ name: 'newfile.jpg' }, {}, { append: jest.fn() });
    expect(dropzone.processQueue).not.toHaveBeenCalled();
  });
});
