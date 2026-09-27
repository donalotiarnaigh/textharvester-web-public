/**
 * Manual Jest mock for @mistralai/mistralai
 * Required because the SDK is ESM-only and Jest uses CommonJS.
 * Individual test files that need specific behaviour override this with jest.mock().
 */
const Mistral = jest.fn().mockImplementation(() => ({
  ocr: { process: jest.fn() },
  chat: { complete: jest.fn() }
}));

module.exports = { Mistral };
