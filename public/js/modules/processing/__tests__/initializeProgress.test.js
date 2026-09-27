// Tell Jest to use our mock implementation
jest.mock('../initializeProgress');

const { initializeProgress, setupProgressTracking, _getMockController } = require('../initializeProgress');

describe('Progress Initialization', () => {
  let container;

  beforeEach(() => {
    // Mock fetch
    global.fetch = jest.fn();

    container = document.createElement('div');
    container.innerHTML = `
      <div id="progress-container">
        <div class="progress-bar">
          <div class="progress-bar__fill"></div>
        </div>
        <div class="progress-bar__status"></div>
      </div>
    `;
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      document.body.removeChild(container);
    }
    jest.clearAllMocks();
  });

  test('initializeProgress should return a controller instance', () => {
    const controller = initializeProgress();
    expect(controller).toBeDefined();
    expect(controller.startPolling).toBeDefined();
    expect(controller.stopPolling).toBeDefined();
  });

  test('setupProgressTracking should set up event listeners', () => {
    const addEventListenerSpy = jest.spyOn(document, 'addEventListener');
    setupProgressTracking();

    expect(addEventListenerSpy).toHaveBeenCalledWith('processing:start', expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith('processing:stop', expect.any(Function));
  });

  test('should start polling when processing:start event is fired', () => {
    const mockController = _getMockController();
    setupProgressTracking();
    document.dispatchEvent(new Event('processing:start'));

    expect(mockController.startPolling).toHaveBeenCalled();
  });

  test('should stop polling when processing:stop event is fired', () => {
    const mockController = _getMockController();
    setupProgressTracking();
    document.dispatchEvent(new Event('processing:stop'));

    expect(mockController.stopPolling).toHaveBeenCalled();
  });
});