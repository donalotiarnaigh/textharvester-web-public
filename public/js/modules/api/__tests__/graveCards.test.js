import { getGraveCards, exportGraveCardsCsv } from '../graveCards.js';

describe('Grave Cards API Client', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getGraveCards', () => {
    it('fetches grave cards successfully', async () => {
      const mockCards = [{ id: 1, file_name: 'test.pdf' }];
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'success', data: mockCards }),
      });

      const result = await getGraveCards();

      expect(global.fetch).toHaveBeenCalledWith('/api/grave-cards');
      expect(result).toEqual(mockCards);
    });

    it('throws an error when fetch fails', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(getGraveCards()).rejects.toThrow('Failed to fetch grave cards: 500 Internal Server Error');
    });
  });

  describe('exportGraveCardsCsv', () => {
    it('triggers CSV download successfully', async () => {
      const mockBlob = new Blob(['csv,data'], { type: 'text/csv' });
      global.fetch.mockResolvedValueOnce({
        ok: true,
        blob: async () => mockBlob,
      });

      // Mock URL.createObjectURL and document.createElement
      global.URL.createObjectURL = jest.fn();
      global.URL.revokeObjectURL = jest.fn();

      const mockLink = {
        click: jest.fn(),
        setAttribute: jest.fn(),
        style: {},
      };
      document.createElement = jest.fn().mockReturnValue(mockLink);
      document.body.appendChild = jest.fn();
      document.body.removeChild = jest.fn();

      await exportGraveCardsCsv();

      expect(global.fetch).toHaveBeenCalledWith('/api/grave-cards/csv');
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
      expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'grave_cards.csv');
      expect(mockLink.click).toHaveBeenCalled();
    });

    it('throws an error when export fails', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(exportGraveCardsCsv()).rejects.toThrow('Failed to export CSV: 404 Not Found');
    });
  });
});
