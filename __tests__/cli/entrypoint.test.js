/**
 * CLI Entry Point Tests
 * Task 1.1 - TDD RED Phase
 * 
 * Tests for bin/textharvester CLI entry point.
 * These tests follow the specifications in docs/cli/design.md.
 * 
 * Requirements: 8.1, 8.2, 5.4
 */

const { spawn } = require('child_process');
const path = require('path');

// Path to CLI entry point (will be created in Task 1.2)
const CLI_PATH = path.resolve(__dirname, '../../bin/textharvester');

/**
 * Helper to run CLI command and capture output
 * @param {string[]} args - CLI arguments
 * @param {object} options - Execution options
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
function runCLI(args = [], options = {}) {
  return new Promise((resolve) => {
    const proc = spawn('node', [CLI_PATH, ...args], {
      env: { ...process.env, ...options.env },
      cwd: options.cwd || process.cwd()
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });

    proc.on('error', (err) => {
      resolve({ stdout, stderr, exitCode: 1, error: err });
    });
  });
}

describe('CLI Entry Point', () => {
  describe('Happy Path Tests', () => {
    describe('--version flag', () => {
      it('should output version string and exit with code 0', async () => {
        const result = await runCLI(['--version']);

        expect(result.exitCode).toBe(0);
        // Version should match package.json version
        expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
      });
    });

    describe('--help flag', () => {
      it('should output help text with all commands listed', async () => {
        const result = await runCLI(['--help']);

        expect(result.exitCode).toBe(0);
        // Help should list all main commands
        expect(result.stdout).toContain('ingest');
        expect(result.stdout).toContain('query');
        expect(result.stdout).toContain('export');
        expect(result.stdout).toContain('system');
      });

      it('should show global options in help', async () => {
        const result = await runCLI(['--help']);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('--config');
        expect(result.stdout).toContain('--verbose');
        expect(result.stdout).toContain('--quiet');
        expect(result.stdout).toContain('--output');
      });
    });

    describe('subcommand --help', () => {
      it('should show ingest-specific help with all options', async () => {
        const result = await runCLI(['ingest', '--help']);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('--source-type');
        expect(result.stdout).toContain('--provider');
        expect(result.stdout).toContain('--batch-size');
      });
    });
  });

  describe('Unhappy Path Tests', () => {
    describe('unknown command', () => {
      it('should exit with code 1 for unknown command', async () => {
        const result = await runCLI(['unknowncommand']);

        expect(result.exitCode).toBe(1);
      });

      it('should list available commands in error message', async () => {
        const result = await runCLI(['unknowncommand']);

        // Error should help user find correct command
        expect(result.stderr).toMatch(/ingest|query|export|system|unknown.*command/i);
      });
    });

    describe('invalid global options', () => {
      it('should exit with code 1 for invalid option', async () => {
        const result = await runCLI(['--invalidoption']);

        expect(result.exitCode).toBe(1);
      });

      it('should show descriptive error for invalid option', async () => {
        const result = await runCLI(['--invalidoption']);

        expect(result.stderr.length).toBeGreaterThan(0);
      });
    });

    describe('conflicting flags', () => {
      it('should reject conflicting -q and -v flags', async () => {
        const result = await runCLI(['-q', '-v', 'system', 'status']);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toMatch(/conflict|cannot.*together|quiet.*verbose/i);
      });

      it('should reject conflicting --quiet and --verbose flags', async () => {
        const result = await runCLI(['--quiet', '--verbose', 'system', 'status']);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toMatch(/conflict|cannot.*together|quiet.*verbose/i);
      });
    });
  });
});
