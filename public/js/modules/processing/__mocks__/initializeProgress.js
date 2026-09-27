const mockController = {
  startPolling: jest.fn(),
  stopPolling: jest.fn()
};

module.exports = {
  initializeProgress: jest.fn().mockReturnValue(mockController),
  setupProgressTracking: () => {
    const controller = mockController;
    document.addEventListener('processing:start', () => {
      controller.startPolling();
    });
    document.addEventListener('processing:stop', () => {
      controller.stopPolling();
    });
  },
  _getMockController: () => mockController
}; 