const fs = require('fs');
const { loadConfig, validateConfig } = require('../../src/cli/config');

// Mock fs to avoid reading real files
jest.mock('fs');

describe('CLI Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('should return default values when no config provided', async () => {
      // Mock fs.existsSync to return false for default config path
      fs.existsSync.mockReturnValue(false);

      const config = await loadConfig({});

      expect(config.provider).toBe('openai');
      expect(config.outputFormat).toBe('json');
      expect(config.batchSize).toBe(3);
      expect(config.verbose).toBe(0);
    });

    it('should load values from config file', async () => {
      const mockConfig = {
        provider: 'anthropic',
        batchSize: 5,
        verbose: 1
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const config = await loadConfig({ config: 'custom-config.json' });

      expect(config.provider).toBe('anthropic');
      expect(config.batchSize).toBe(5);
      expect(config.verbose).toBe(1);
    });

    it('should merge environment variables', async () => {
      process.env.OPENAI_API_KEY = 'env-key-123';
      fs.existsSync.mockReturnValue(false);

      const config = await loadConfig({});

      expect(config.openaiApiKey).toBe('env-key-123');
    });

    it('should prioritize CLI flags over config file and defaults', async () => {
      const mockConfig = {
        batchSize: 5,
        outputFormat: 'table'
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const cliOptions = {
        batchSize: 10,
        config: 'config.json'
      };

      const config = await loadConfig(cliOptions);

      expect(config.batchSize).toBe(10); // CLI flag wins
      expect(config.outputFormat).toBe('table'); // Config file wins over default
    });

    it('should prioritize CLI flags over environment variables', async () => {
      process.env.OPENAI_API_KEY = 'env-key';
      const cliOptions = {
        openaiApiKey: 'cli-key'
      };
      fs.existsSync.mockReturnValue(false);

      const config = await loadConfig(cliOptions);

      expect(config.openaiApiKey).toBe('cli-key');
    });

    it('should throw error if specified config file does not exist', async () => {
      fs.existsSync.mockReturnValue(false);

      await expect(loadConfig({ config: 'nonexistent.json' }))
        .rejects
        .toThrow(/Config file not found/);
    });

    it('should throw error if config file has invalid JSON', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('{ invalid json }');

      await expect(loadConfig({ config: 'bad.json' }))
        .rejects
        .toThrow(/Invalid JSON/);
    });
  });

  describe('validateConfig', () => {
    it('should throw if required API key is missing for openai', () => {
      const config = {
        provider: 'openai',
        // No openaiApiKey
      };

      expect(() => validateConfig(config)).toThrow(/Missing required configuration: openaiApiKey/);
    });

    it('should throw if required API key is missing for anthropic', () => {
      const config = {
        provider: 'anthropic',
        // No anthropicApiKey
      };

      expect(() => validateConfig(config)).toThrow(/Missing required configuration: anthropicApiKey/);
    });

    it('should not throw if required configuration is present', () => {
      const config = {
        provider: 'openai',
        openaiApiKey: 'sk-12345'
      };

      expect(() => validateConfig(config)).not.toThrow();
    });

    it('should throw if provider is invalid', () => {
      const config = {
        provider: 'unknown-provider'
      };

      expect(() => validateConfig(config)).toThrow(/Invalid provider/);
    });
  });
});
