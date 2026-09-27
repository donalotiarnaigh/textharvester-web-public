# Testing Guide

## Test Discovery

Jest is configured in `jest.config.cjs` with a `testMatch` that discovers tests from **both** locations used in this project:

```
**/__tests__/**/*.js    — any __tests__ directory, anywhere
**/?(*.)+(spec|test).js — any .test.js or .spec.js file, anywhere
```

All tests run via `npm test`.

---

## Two-Tier Convention

This project intentionally uses two test locations with different purposes:

### 1. Centralized — `__tests__/` (root)

**Use for:** Unit tests that mock their dependencies (SQLite, filesystem, external APIs).

```
__tests__/
├── cli/
├── controllers/
├── database/
├── routes/
├── scripts/
├── services/
└── utils/
```

These tests are fast, isolated, and should never touch the real database or filesystem. Heavy use of `jest.mock()` is expected. If you're writing a test for a controller, service, or utility and you're mocking out `database.js` or `fs`, put it here.

### 2. Colocated — `src/**/__tests__/` and `public/**/__tests__/`

**Use for:** Integration tests that exercise real SQLite (in-memory), real filesystem operations, or end-to-end module behaviour.

Common locations:
```
src/utils/__tests__/               — integration tests for storage/processing utils
src/utils/modelProviders/__tests__ — provider integration tests
src/utils/prompts/__tests__/       — prompt class tests (real validation logic)
public/js/modules/**/__tests__/    — frontend module tests (jsdom environment)
```

These tests may use real SQLite connections (`:memory:` databases), real file reads, or test the full stack of a module's logic without mocking. They live next to the code they test.

---

## Which to use for new tests?

| Scenario | Location |
|----------|----------|
| Testing a controller with mocked services | `__tests__/controllers/` |
| Testing a route with mocked storage | `__tests__/routes/` |
| Testing storage with a real in-memory SQLite DB | `src/utils/__tests__/` |
| Testing a prompt class's validation logic end-to-end | `src/utils/prompts/__tests__/` |
| Testing a frontend JS module in jsdom | `public/js/modules/<module>/__tests__/` |
| Testing a provider with a mocked API response | `__tests__/utils/` |

**Rule of thumb:** If your test calls `jest.mock('sqlite3')` or `jest.mock('fs')`, it belongs in the centralized `__tests__/`. If it creates a real `:memory:` database or reads real files, it belongs colocated next to the code.

---

## Running Tests

```bash
# Full test suite
npm test

# Watch mode (during development)
npx jest --watch

# Single file
npx jest __tests__/controllers/projectController.test.js

# Pattern match
npx jest --testPathPattern="burialRegister"

# With coverage
npx jest --coverage
```

## E2E Tests (require running server)

These scripts test against a live server at `http://localhost:3000` and are not part of `npm test`:

```bash
npm run test:e2e           # Project/Collection API workflow
npm run test:e2e-upload    # Upload workflow with project integration
npm run test:audit-e2e     # LLM audit logging end-to-end
```

Start the server first with `npm run dev`, then run the relevant e2e script.
