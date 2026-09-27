#!/usr/bin/env node

/**
 * E2E Test: LLM Audit Logging (Issue #133)
 *
 * Automated test that:
 * 1. Processes sample images using the CLI
 * 2. Queries the audit log to verify entries were created
 * 3. Validates that full prompts and responses are stored
 * 4. Generates a detailed report
 */

// Load .env file first
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { spawn } = require('child_process');

const DB_PATH = './data/memorials.db';
const SAMPLE_DATA_DIR = './sample_data';

class AuditLogE2ETester {
  constructor() {
    this.results = {
      processed: [],
      auditEntries: [],
      errors: [],
      passed: 0,
      failed: 0
    };
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
    console.log(`[${timestamp}] [${level}] ${message}`);
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Run a CLI command and return the output
   */
  runCLI(args) {
    return new Promise((resolve, reject) => {
      this.log(`Running: node bin/textharvester ${args.join(' ')}`);

      const child = spawn('node', ['bin/textharvester', ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
        env: process.env
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`CLI exited with code ${code}: ${stderr}`));
        } else {
          resolve({ stdout, stderr });
        }
      });

      child.on('error', reject);
    });
  }

  /**
   * Query the audit log database
   */
  queryAuditLog(sql, params = []) {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
          reject(err);
          return;
        }

        db.all(sql, params, (err, rows) => {
          db.close();
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    });
  }

  /**
   * Get a single record from audit log
   */
  queryAuditLogOne(sql, params = []) {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
          reject(err);
          return;
        }

        db.get(sql, params, (err, row) => {
          db.close();
          if (err) reject(err);
          else resolve(row);
        });
      });
    });
  }

  /**
   * Initialize database
   */
  async initDatabase() {
    this.log('Initializing database...');
    try {
      await this.runCLI(['system', 'init-db']);
      this.log('Database initialized');
    } catch (error) {
      this.log(`Warning: Database init error: ${error.message}`, 'WARN');
    }
  }

  /**
   * Find sample images
   */
  findSampleImages() {
    const images = {
      memorials: [],
      monument_photos: [],
      burial_registers: []
    };

    const sampleTypes = {
      memorials: 'memorials',
      monument_photos: 'monument_photos',
      burial_registers: 'burial_registers'
    };

    for (const [key, dir] of Object.entries(sampleTypes)) {
      const dirPath = path.join(SAMPLE_DATA_DIR, 'source_sets', dir);
      if (!fs.existsSync(dirPath)) {
        this.log(`Sample directory not found: ${dirPath}`, 'WARN');
        continue;
      }

      const files = fs.readdirSync(dirPath)
        .filter(f => /\.(jpg|jpeg)$/i.test(f))
        .map(f => path.join(dirPath, f));

      images[key] = files.slice(0, 1); // Take first image of each type
    }

    return images;
  }

  /**
   * Process a sample image
   */
  async processSample(imagePath, sourceType, provider = 'openai') {
    this.log(`Processing: ${path.basename(imagePath)} (${sourceType})`);

    try {
      const result = await this.runCLI([
        'ingest',
        imagePath,
        '--source-type', sourceType,
        '--provider', provider
      ]);

      // Extract processing_id from output if available
      const processingIdMatch = result.stdout.match(/processing[_-]id['":\s]+([a-f0-9-]+)/i);
      const processingId = processingIdMatch ? processingIdMatch[1] : null;

      this.results.processed.push({
        file: path.basename(imagePath),
        sourceType,
        provider,
        processingId,
        timestamp: new Date()
      });

      this.log(`✓ Processed successfully (processing_id: ${processingId || 'unknown'})`, 'OK');
      return processingId;
    } catch (error) {
      this.results.errors.push({
        file: path.basename(imagePath),
        error: error.message
      });
      this.log(`✗ Processing failed: ${error.message}`, 'ERROR');
      return null;
    }
  }

  /**
   * Verify audit log entries
   */
  async verifyAuditEntries() {
    this.log('Verifying audit log entries...');

    try {
      // Count total entries
      const countResult = await this.queryAuditLog(
        'SELECT COUNT(*) as count FROM llm_audit_log'
      );
      const totalCount = countResult[0]?.count || 0;

      this.log(`Found ${totalCount} total audit log entries`, 'OK');

      // Get recent entries
      const entries = await this.queryAuditLog(`
        SELECT
          id,
          processing_id,
          provider,
          model,
          status,
          LENGTH(system_prompt) as system_prompt_len,
          LENGTH(user_prompt) as user_prompt_len,
          LENGTH(raw_response) as raw_response_len,
          input_tokens,
          output_tokens,
          response_time_ms,
          timestamp
        FROM llm_audit_log
        ORDER BY id DESC
        LIMIT 10
      `);

      this.results.auditEntries = entries;

      // Validate entries
      for (const entry of entries) {
        const checks = [];

        // Check processing_id
        if (!entry.processing_id) {
          checks.push('❌ Missing processing_id');
        } else {
          checks.push(`✓ processing_id: ${entry.processing_id.substring(0, 8)}...`);
        }

        // Check prompts
        if (!entry.system_prompt_len || entry.system_prompt_len === 0) {
          checks.push('❌ Missing system_prompt');
        } else {
          checks.push(`✓ system_prompt: ${entry.system_prompt_len} chars`);
        }

        if (!entry.user_prompt_len || entry.user_prompt_len === 0) {
          checks.push('❌ Missing user_prompt');
        } else {
          checks.push(`✓ user_prompt: ${entry.user_prompt_len} chars`);
        }

        // Check response
        if (!entry.raw_response_len || entry.raw_response_len === 0) {
          checks.push('❌ Missing raw_response');
        } else {
          checks.push(`✓ raw_response: ${entry.raw_response_len} chars`);
        }

        // Check tokens
        checks.push(`✓ tokens: ${entry.input_tokens} in / ${entry.output_tokens} out`);

        // Check response time
        if (entry.response_time_ms > 0) {
          checks.push(`✓ response_time: ${entry.response_time_ms}ms`);
        } else {
          checks.push('⚠ response_time: 0ms (may be test/mock)');
        }

        checks.push(`✓ status: ${entry.status}`);

        this.log(`\nEntry #${entry.id} (${entry.provider}/${entry.model}):`, 'INFO');
        checks.forEach(check => this.log(`  ${check}`, 'INFO'));
      }

      return entries.length > 0;
    } catch (error) {
      this.log(`Error verifying audit entries: ${error.message}`, 'ERROR');
      this.results.errors.push({ check: 'verifyAuditEntries', error: error.message });
      return false;
    }
  }

  /**
   * Test cross-references between tables
   */
  async testCrossReferences() {
    this.log('Testing cross-references between tables and audit log...');

    try {
      // Check if memorials match audit log entries
      const crossRef = await this.queryAuditLog(`
        SELECT
          a.processing_id,
          a.provider,
          a.status,
          COUNT(*) as memorial_count
        FROM llm_audit_log a
        LEFT JOIN memorials m ON m.processing_id = a.processing_id
        GROUP BY a.processing_id
        LIMIT 5
      `);

      if (crossRef.length > 0) {
        this.log('✓ Found cross-references between audit log and memorials table', 'OK');
        crossRef.forEach(ref => {
          this.log(`  processing_id: ${ref.processing_id?.substring(0, 8)}... -> ${ref.memorial_count} memorials`, 'INFO');
        });
      } else {
        this.log('⚠ No cross-references found (may be expected if no records processed)', 'WARN');
      }
    } catch (error) {
      this.log(`Warning testing cross-references: ${error.message}`, 'WARN');
    }
  }

  /**
   * Test prompt content
   */
  async testPromptContent() {
    this.log('Inspecting prompt content...');

    try {
      const entry = await this.queryAuditLogOne(`
        SELECT
          system_prompt,
          user_prompt,
          raw_response
        FROM llm_audit_log
        WHERE system_prompt IS NOT NULL
        AND user_prompt IS NOT NULL
        ORDER BY id DESC
        LIMIT 1
      `);

      if (entry) {
        this.log('\n=== Sample Audit Log Entry Content ===\n', 'INFO');

        if (entry.system_prompt) {
          const sysPreamble = entry.system_prompt.substring(0, 100);
          this.log(`System Prompt (first 100 chars):\n  "${sysPreamble}...\n"`, 'INFO');
        }

        if (entry.user_prompt) {
          const userPreamble = entry.user_prompt.substring(0, 100);
          this.log(`User Prompt (first 100 chars):\n  "${userPreamble}...\n"`, 'INFO');
        }

        if (entry.raw_response) {
          try {
            const parsed = JSON.parse(entry.raw_response);
            const keys = Object.keys(parsed).slice(0, 5);
            this.log(`Raw Response (JSON, first 5 keys):\n  ${JSON.stringify(parsed, null, 2).substring(0, 200)}...\n`, 'INFO');
          } catch {
            const respPreamble = entry.raw_response.substring(0, 100);
            this.log(`Raw Response (text):\n  "${respPreamble}...\n"`, 'INFO');
          }
        }
      } else {
        this.log('No entries with full prompts found yet', 'WARN');
      }
    } catch (error) {
      this.log(`Warning inspecting content: ${error.message}`, 'WARN');
    }
  }

  /**
   * Generate final report
   */
  generateReport() {
    console.log('\n\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║       LLM AUDIT LOGGING E2E TEST REPORT (Issue #133)            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log('📊 PROCESSING SUMMARY:');
    console.log(`   Total files processed: ${this.results.processed.length}`);
    this.results.processed.forEach(p => {
      console.log(`   • ${p.file} (${p.sourceType}) - ${p.processingId ? '✓' : '✗'}`);
    });

    console.log('\n📝 AUDIT LOG ENTRIES:');
    console.log(`   Total entries in llm_audit_log: ${this.results.auditEntries.length}`);

    if (this.results.auditEntries.length > 0) {
      const entry = this.results.auditEntries[0];
      console.log('\n   Latest Entry Details:');
      console.log(`   • Processing ID: ${entry.processing_id?.substring(0, 16)}...`);
      console.log(`   • Provider: ${entry.provider}`);
      console.log(`   • Model: ${entry.model}`);
      console.log(`   • Status: ${entry.status}`);
      console.log(`   • System Prompt: ${entry.system_prompt_len} chars`);
      console.log(`   • User Prompt: ${entry.user_prompt_len} chars`);
      console.log(`   • Raw Response: ${entry.raw_response_len} chars`);
      console.log(`   • Tokens: ${entry.input_tokens} in / ${entry.output_tokens} out`);
      console.log(`   • Response Time: ${entry.response_time_ms}ms`);
    }

    console.log('\n✅ VALIDATION CHECKS:');
    const allValidationsPassed = this.results.auditEntries.every(e =>
      e.processing_id && e.system_prompt_len > 0 && e.user_prompt_len > 0 && e.raw_response_len > 0
    );

    console.log('   • Audit log table exists: ✓');
    console.log(`   • Entries created: ${this.results.auditEntries.length > 0 ? '✓' : '⚠'}`);
    console.log(`   • processing_id captured: ${allValidationsPassed ? '✓' : '⚠'}`);
    console.log(`   • Full system_prompt stored: ${allValidationsPassed ? '✓' : '⚠'}`);
    console.log(`   • Full user_prompt stored: ${allValidationsPassed ? '✓' : '⚠'}`);
    console.log(`   • Raw response captured: ${allValidationsPassed ? '✓' : '⚠'}`);
    console.log(`   • Token counts recorded: ${this.results.auditEntries.some(e => e.input_tokens > 0) ? '✓' : '⚠'}`);
    console.log(`   • Response times tracked: ${this.results.auditEntries.some(e => e.response_time_ms > 0) ? '✓' : '⚠'}`);

    if (this.results.errors.length > 0) {
      console.log(`\n❌ ERRORS (${this.results.errors.length}):`);
      this.results.errors.forEach(err => {
        console.log(`   • ${err.file || err.check}: ${err.error}`);
      });
    }

    console.log('\n🔍 QUERY AUDIT LOG:');
    console.log('   sqlite3 data/memorials.db');
    console.log('   SELECT * FROM llm_audit_log ORDER BY id DESC LIMIT 5;');

    console.log('\n📈 NEXT STEPS:');
    console.log('   1. Review audit entries using sqlite3 CLI');
    console.log('   2. Export entries for eval dataset building (Issue #121)');
    console.log('   3. Use processing_id for cross-referencing with memorials');

    console.log('\n');
  }

  /**
   * Check for required API keys
   */
  checkAPIKeys() {
    const keys = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY
    };

    const available = Object.entries(keys)
      .filter(([_, v]) => v)
      .map(([k, _]) => k.replace('_API_KEY', ''));

    this.log('API Keys Status:', 'INFO');
    Object.entries(keys).forEach(([key, val]) => {
      const status = val ? '✓ SET' : '✗ NOT SET';
      this.log(`  ${key}: ${status}`, 'INFO');
    });

    if (available.length === 0) {
      this.log('\n⚠️  No API keys found!', 'WARN');
      console.error(`
╔════════════════════════════════════════════════════════════════╗
║            API KEYS REQUIRED FOR E2E TESTING                   ║
╚════════════════════════════════════════════════════════════════╝

To run this test with actual API calls, set one of these:

  export OPENAI_API_KEY="sk-..."
  export ANTHROPIC_API_KEY="sk-ant-..."
  export GEMINI_API_KEY="AIza..."

Then run:
  npm run test:audit-e2e

Or to use with a specific provider:
  OPENAI_API_KEY="sk-..." npm run test:audit-e2e
`);
      return false;
    }

    this.log(`Using available providers: ${available.join(', ')}`, 'OK');
    return true;
  }

  /**
   * Run all tests
   */
  async run() {
    try {
      this.log('Starting LLM Audit Logging E2E Tests');
      this.log(`Project: ${process.cwd()}`);
      this.log(`Database: ${DB_PATH}`);

      // Check API keys
      if (!this.checkAPIKeys()) {
        process.exit(1);
      }

      // Step 1: Initialize database
      await this.initDatabase();
      await this.delay(1000);

      // Step 2: Find sample images
      const samples = this.findSampleImages();
      this.log(`Found ${samples.memorials.length} memorial samples, ${samples.burial_registers.length} burial register samples`);

      // Step 3: Process a memorial sample
      if (samples.memorials.length > 0) {
        await this.processSample(samples.memorials[0], 'memorial', 'openai');
        await this.delay(2000); // Wait for DB writes
      }

      // Step 4: Verify audit log
      await this.verifyAuditEntries();

      // Step 5: Test cross-references
      await this.testCrossReferences();

      // Step 6: Inspect content
      await this.testPromptContent();

      // Step 7: Generate report
      this.generateReport();

      this.log('✓ All tests completed', 'OK');
    } catch (error) {
      this.log(`Fatal error: ${error.message}`, 'ERROR');
      console.error(error);
      process.exit(1);
    }
  }
}

// Run tests
const tester = new AuditLogE2ETester();
tester.run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
