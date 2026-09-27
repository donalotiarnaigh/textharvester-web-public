#!/usr/bin/env node

/**
 * End-to-End Test: Project/Collection Feature
 * Tests the complete workflow: create project → upload with project → filter results
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
let testProjectId = null;
let testMemorialId = null;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, body: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body: body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function testProjectCreation() {
  log('\n=== TEST 1: Create Project ===', 'blue');

  try {
    const response = await makeRequest('POST', '/api/projects', {
      name: `E2E Test Project ${Date.now()}`,
      description: 'End-to-end test project for feature validation'
    });

    if (response.status !== 201) {
      throw new Error(`Expected 201, got ${response.status}: ${JSON.stringify(response.body)}`);
    }

    testProjectId = response.body.id;
    log('✓ Project created successfully', 'green');
    log(`  ID: ${testProjectId}`, 'green');
    log(`  Name: ${response.body.name}`, 'green');
    return true;
  } catch (error) {
    log(`✗ Failed to create project: ${error.message}`, 'red');
    return false;
  }
}

async function testGetProjects() {
  log('\n=== TEST 2: List Projects ===', 'blue');

  try {
    const response = await makeRequest('GET', '/api/projects');

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    const projectExists = response.body.some(p => p.id === testProjectId);
    if (!projectExists) {
      throw new Error('Created project not found in list');
    }

    log('✓ Projects fetched successfully', 'green');
    log(`  Total projects: ${response.body.length}`, 'green');
    log(`  Our project found: ${projectExists}`, 'green');
    return true;
  } catch (error) {
    log(`✗ Failed to list projects: ${error.message}`, 'red');
    return false;
  }
}

async function testGetProjectById() {
  log('\n=== TEST 3: Get Project By ID ===', 'blue');

  try {
    const response = await makeRequest('GET', `/api/projects/${testProjectId}`);

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    if (response.body.id !== testProjectId) {
      throw new Error('Project ID mismatch');
    }

    log('✓ Project retrieved successfully', 'green');
    log(`  Name: ${response.body.name}`, 'green');
    log(`  Description: ${response.body.description}`, 'green');
    return true;
  } catch (error) {
    log(`✗ Failed to get project: ${error.message}`, 'red');
    return false;
  }
}

async function testUpdateProject() {
  log('\n=== TEST 4: Update Project ===', 'blue');

  try {
    const response = await makeRequest('PATCH', `/api/projects/${testProjectId}`, {
      description: 'Updated description from e2e test'
    });

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    if (response.body.description !== 'Updated description from e2e test') {
      throw new Error('Description not updated');
    }

    log('✓ Project updated successfully', 'green');
    log(`  Updated description: ${response.body.description}`, 'green');
    return true;
  } catch (error) {
    log(`✗ Failed to update project: ${error.message}`, 'red');
    return false;
  }
}

async function testQueryWithoutProject() {
  log('\n=== TEST 5: Query Results Without Project Filter ===', 'blue');

  try {
    const response = await makeRequest('GET', '/results-data');

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    log('✓ Results fetched successfully', 'green');
    log(`  Total records: ${response.body.records ? response.body.records.length : 0}`, 'green');
    return true;
  } catch (error) {
    log(`✗ Failed to query results: ${error.message}`, 'red');
    return false;
  }
}

async function testQueryWithProject() {
  log('\n=== TEST 6: Query Results With Project Filter ===', 'blue');

  try {
    const response = await makeRequest('GET', `/results-data?projectId=${testProjectId}`);

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    log('✓ Filtered results fetched successfully', 'green');
    log(`  Records for this project: ${response.body.records ? response.body.records.length : 0}`, 'green');
    return true;
  } catch (error) {
    log(`✗ Failed to query filtered results: ${error.message}`, 'red');
    return false;
  }
}

async function testDeleteProject() {
  log('\n=== TEST 7: Delete Project (No Records) ===', 'blue');

  try {
    // Create a new project to delete
    const createResponse = await makeRequest('POST', '/api/projects', {
      name: `Temp Project ${Date.now()}`,
      description: 'To be deleted'
    });

    if (createResponse.status !== 201) {
      throw new Error(`Failed to create temp project: ${createResponse.status}`);
    }

    const tempProjectId = createResponse.body.id;

    // Delete it
    const deleteResponse = await makeRequest('DELETE', `/api/projects/${tempProjectId}`);

    if (deleteResponse.status !== 204) {
      throw new Error(`Expected 204, got ${deleteResponse.status}`);
    }

    log('✓ Project deleted successfully', 'green');
    log(`  Temp project ID deleted: ${tempProjectId}`, 'green');
    return true;
  } catch (error) {
    log(`✗ Failed to delete project: ${error.message}`, 'red');
    return false;
  }
}

async function testProjectValidation() {
  log('\n=== TEST 8: Project Validation ===', 'blue');

  try {
    // Test duplicate name
    const duplicateResponse = await makeRequest('POST', '/api/projects', {
      name: `E2E Test Project ${Date.now()}`,
      description: 'First'
    });

    if (duplicateResponse.status !== 201) {
      throw new Error(`Failed to create first project: ${duplicateResponse.status}`);
    }

    const firstName = duplicateResponse.body.name;

    const dupResponse = await makeRequest('POST', '/api/projects', {
      name: firstName,
      description: 'Duplicate'
    });

    if (dupResponse.status === 400) {
      log('✓ Duplicate project name validation works', 'green');
      return true;
    } else {
      throw new Error(`Expected 400 for duplicate name, got ${dupResponse.status}`);
    }
  } catch (error) {
    log(`✗ Validation test failed: ${error.message}`, 'red');
    return false;
  }
}

async function testCSVExportWithProjectFilter() {
  log('\n=== TEST 9: CSV Export With Project Filter ===', 'blue');

  try {
    const response = await makeRequest('GET', `/download-csv?projectId=${testProjectId}`);

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    log('✓ CSV export with project filter works', 'green');
    log(`  Content-Type: ${response.headers['content-type']}`, 'green');
    log(`  Content received: ${typeof response.body === 'string' ? 'Yes' : 'Parsed'}`, 'green');
    return true;
  } catch (error) {
    log(`✗ CSV export test failed: ${error.message}`, 'red');
    return false;
  }
}

async function testAPIErrorHandling() {
  log('\n=== TEST 10: API Error Handling ===', 'blue');

  try {
    let passedTests = 0;

    // Test 404 on get non-existent project
    const notFound = await makeRequest('GET', '/api/projects/non-existent-id');
    if (notFound.status === 404) {
      log('✓ 404 handling for non-existent project', 'green');
      passedTests++;
    } else {
      log(`✗ Expected 404, got ${notFound.status}`, 'red');
    }

    // Test 400 on missing name
    const badRequest = await makeRequest('POST', '/api/projects', {
      description: 'No name provided'
    });
    if (badRequest.status === 400) {
      log('✓ 400 handling for missing name', 'green');
      passedTests++;
    } else {
      log(`✗ Expected 400, got ${badRequest.status}`, 'red');
    }

    return passedTests === 2;
  } catch (error) {
    log(`✗ Error handling test failed: ${error.message}`, 'red');
    return false;
  }
}

async function runAllTests() {
  log('\n╔════════════════════════════════════════════════════════╗', 'blue');
  log('║   End-to-End Test: Project/Collection Feature          ║', 'blue');
  log('╚════════════════════════════════════════════════════════╝', 'blue');

  const results = [];

  results.push(await testProjectCreation());
  results.push(await testGetProjects());
  results.push(await testGetProjectById());
  results.push(await testUpdateProject());
  results.push(await testQueryWithoutProject());
  results.push(await testQueryWithProject());
  results.push(await testDeleteProject());
  results.push(await testProjectValidation());
  results.push(await testCSVExportWithProjectFilter());
  results.push(await testAPIErrorHandling());

  log('\n╔════════════════════════════════════════════════════════╗', 'blue');
  const passed = results.filter(r => r).length;
  const total = results.length;
  log(`║  Test Results: ${passed}/${total} Passed                              ║`, passed === total ? 'green' : 'yellow');
  log('╚════════════════════════════════════════════════════════╝', 'blue');

  process.exit(passed === total ? 0 : 1);
}

// Wait for server to be ready
setTimeout(runAllTests, 2000);
