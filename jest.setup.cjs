// Mock the database directory creation
const { TextEncoder, TextDecoder } = require('util');

// Add TextEncoder and TextDecoder to global scope
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock fs module - jest will automatically use __mocks__/fs.js
jest.mock('fs');

// Set test environment variables
process.env.NODE_ENV = 'test'; 