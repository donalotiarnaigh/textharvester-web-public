/**
 * CLI Integration Test Pipeline
 * Task 14.1
 * 
 * Tests the full ingest -> query -> export pipeline using the MockProvider.
 */

const fs = jest.requireActual('fs');
const path = require('path');

const TEST_DIR = path.resolve(__dirname, '../../temp_cli_test');
const DB_PATH = path.join(TEST_DIR, 'memorials.db');
const IMAGE_PATH = path.join(TEST_DIR, 'test_memorial.png');
const EXPORT_PATH = path.join(TEST_DIR, 'export.json');


// Helper to run CLI commands
const { spawn } = require('child_process');

const runCLI = (args) => {
  return new Promise((resolve, reject) => {
    const cliPath = path.resolve(__dirname, '../../bin/textharvester');
    // Split args string into array, handling quotes basic support
    const child = spawn(cliPath, args.match(/(?:[^\s"]+|"[^"]*")+/g).map(s => s.replace(/"/g, '')), {
      env: { ...process.env, AI_PROVIDER: 'mock', LOG_TO_STDERR: 'true', DB_PATH },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const stdoutChunks = [];
    const stderrChunks = [];

    child.stdout.on('data', (data) => {
      stdoutChunks.push(data);
    });

    child.stderr.on('data', (data) => {
      stderrChunks.push(data);
    });

    child.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString();
      const stderr = Buffer.concat(stderrChunks).toString();
      resolve({ stdout, stderr, exitCode: code });
    });

    child.on('error', (err) => {
      reject({ stdout: '', stderr: err.message, exitCode: 1, error: err });
    });
  });
};

describe('CLI Integration Pipeline', () => {
  // Config override for testing
  const configPath = path.join(TEST_DIR, 'config.json');
  const testConfig = {
    dbPath: DB_PATH,
    AI_PROVIDER: 'mock', // Should be picked up by loader
    provider: 'mock'
  };

  beforeAll(async () => {
    // NOTE: We DO NOT touch the main production database!
    // Tests use their own isolated TEST_DIR and DB_PATH

    // Setup temp dir
    try {
      if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
      }
    } catch (e) {
      console.error('Failed to clean TEST_DIR:', e);
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });

    // Create test image (valid 1x1 PNG)
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    fs.writeFileSync(IMAGE_PATH, Buffer.from(pngBase64, 'base64'));

    // Create test config
    fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2));

    // Initialize DB
    console.log('Initializing DB...');
    await runCLI(`system init-db --config ${configPath}`);
    console.log('DB Initialized');
  }, 60000);

  afterAll(() => {
    // Cleanup
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  test('1. Ingest: Should process file using MockProvider', async () => {
    // Note: We need to use absolute paths or paths relative to CWD
    const result = await runCLI(`ingest "${IMAGE_PATH}" --config ${configPath} --source-type memorial --batch-size 1`);

    // Check output
    console.log('Ingest Output:', result.stdout);
    console.log('Ingest Error:', result.stderr);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);
    expect(output.data.successful).toBe(1);
    expect(output.data.failed).toBe(0);
    expect(output.data.successes[0].file).toContain('test_memorial.png');
  }, 30000);

  test('2. Query: Should list the ingested record', async () => {
    const result = await runCLI(`query list --config ${configPath} --source-type memorial --limit 1`);

    console.log('Query List Output:', result.stdout);

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);

    expect(output.success).toBe(true);
    expect(output.data.records.length).toBeGreaterThanOrEqual(1);
    const record = output.data.records.find(r => r.file_name.includes('test_memorial.png'));
    expect(record).toBeDefined();
    expect(record.first_name).toBe('JOHN'); // Case changed by OCR processing
    expect(record.last_name).toBe('DOE');
  });

  test('3. Query: Should search for the record', async () => {
    const result = await runCLI(`query search "JOHN" --config ${configPath} --source-type memorial --limit 1`);

    console.log('Query Search Output:', result.stdout);
    console.log('Query Search Error:', result.stderr);

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);

    expect(output.data.records.length).toBeGreaterThan(0);
    expect(output.data.records[0].first_name).toBe('JOHN');
  });

  test('4. Export: Should export data to JSON file', async () => {
    const result = await runCLI(`export --config ${configPath} --destination "${EXPORT_PATH}" --format json`);

    console.log('Export Output:', result.stdout);

    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(EXPORT_PATH)).toBe(true);

    const fileContent = fs.readFileSync(EXPORT_PATH, 'utf-8');
    const exportedData = JSON.parse(fileContent);

    expect(exportedData.length).toBeGreaterThanOrEqual(1);
    expect(exportedData[0].first_name).toBe('JOHN');
  });

  test('5. System: Status should show correct counts', async () => {
    const result = await runCLI(`system status --config ${configPath}`);

    console.log('System Status Output:', result.stdout);

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);

    // Verify memorial count 
    // Structure is data.database.records.memorial
    expect(Number(output.data.database.records.memorial)).toBeGreaterThanOrEqual(1);
  });

  test('6. Query: Should get a single record', async () => {
    // First get an ID from the list
    // Use limit 1 to avoid large output truncation issues in test environment
    const listResult = await runCLI(`query list --config ${configPath} --source-type memorial --limit 1`);
    const listOutput = JSON.parse(listResult.stdout);
    const id = listOutput.data.records[0].id; // Use dynamic ID

    const result = await runCLI(`query get ${id} --config ${configPath} --source-type memorial`);

    console.log('Query Get Output:', result.stdout);

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);

    expect(output.success).toBe(true);
    expect(output.data.id).toBe(id);
    expect(output.data.first_name).toBe('JOHN');
  });

  test('7. System: Should clear queue with confirmation', async () => {
    const result = await runCLI(`system clear-queue --confirm --config ${configPath}`);

    console.log('System Clear Output:', result.stdout);

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);

    expect(output.success).toBe(true);
    expect(output.data.message).toContain('Queue cleared');
  });
});
