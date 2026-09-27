# Operations Runbook

Deployment, monitoring, and incident response for TextHarvester.

---

## Prerequisites

**System dependencies:**
- Node.js ≥22.0.0
- `poppler-utils` — required for PDF→JPEG conversion (`apt-get install poppler-utils` or `brew install poppler`)

**API keys** (at least one provider required):
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `MISTRAL_API_KEY`

---

## Local Development

```bash
# Install dependencies
npm install

# Configure API keys
cp .env .env.local   # then edit with your keys
# or set env vars directly

# Start development server (auto-reload, ignores data/ and uploads/)
npm run local-start

# Run full test suite
npm test

# Lint
npm run lint
```

The dev server starts at `http://localhost:3000` and opens a browser automatically (configurable in `config.json` under `local.autoLaunchBrowser`).

---

## Container Build

The `Dockerfile` uses a multi-stage build. Key details:
- Base image: `node:22.23.2-bookworm-slim`
- Installs `poppler-utils` at runtime for PDF processing
- Uses `npm ci` (locked dependencies)
- Sets `NODE_ENV=production`

> **No production deployment target is currently configured.** The former Fly.io
> deployment was removed along with `fly.toml`, `fly.staging.toml`, and the
> `FLY_API_TOKEN` repository secret. The `Dockerfile` is retained for local or
> self-hosted container use; supply API keys via environment variables as listed
> under [Prerequisites](#prerequisites).

---

## Database

**Location:** `./data/memorials.db` (SQLite)

**Tables:** `memorials`, `burial_register_entries`, `grave_cards`, `llm_audit_log`

### Backups

- **Automatic:** Daily backup to `./backups/` (interval configurable via `config.json` → `dataStorage.backupInterval`)
- **Manual backup:**
  ```bash
  # While server is idle or between batches
  cp data/memorials.db backups/memorials-$(date +%Y%m%d).db
  ```

### Restore

```bash
# Stop server first, then restore
cp backups/memorials-YYYYMMDD.db data/memorials.db
npm start
```

### Migrations

Schema migrations run automatically on startup via inline `PRAGMA table_info` checks in:
- `src/utils/database.js` (memorials table)
- `src/utils/burialRegisterStorage.js`
- `src/utils/graveCardStorage.js`

For a fresh database:
```bash
npm run init-db
```

To verify migration integrity:
```bash
npm run verify:migrations
```

---

## Configuration

All runtime configuration lives in `config.json` at the project root. See [CONFIG.md](../CONFIG.md) for the full key reference.

**Key settings to review before production:**
- `environment` → set to `"production"`
- `costs.maxCostPerSession` → adjust budget cap
- `confidence.reviewThreshold` → tune flagging sensitivity
- `audit.enabled` → keep `true` unless log volume is a problem
- `logging.verboseMode` → must be `false` in production

---

## Monitoring

### Log Files

| File | Contents |
|------|----------|
| `logs/combined.log` | All log entries (14-day retention, 20MB rotation) |
| `logs/error.log` | Error-level entries only |

```bash
# Real-time log tailing
tail -f logs/combined.log
tail -f logs/error.log

# Check log sizes
ls -lh logs/
```

### Performance Dashboard

All metrics are available via API (no separate monitoring stack required):

```bash
# Combined dashboard
curl http://localhost:3000/api/performance/dashboard

# Current system metrics (memory, CPU, uptime)
curl http://localhost:3000/api/performance/system

# Recent alert events
curl http://localhost:3000/api/performance/alerts
```

### Alert Thresholds (defaults)

| Metric | Warning | Critical | Severe |
|--------|---------|----------|--------|
| Response time | >10s | >30s | >60s |
| Success rate | <95% | <90% | <80% |
| Memory delta | >10MB | >50MB | >100MB |

Thresholds are adjustable without restart:
```bash
curl -X PUT http://localhost:3000/api/performance/thresholds \
  -H 'Content-Type: application/json' \
  -d '{"responseTime": {"warning": 15000}}'
```

### Verbose Logging (debugging only)

Enable to see full prompt/response payloads and unsampled logs. **Do not leave on in production.**

```json
// config.json
"logging": { "verboseMode": true }
```

Or restart with env var:
```bash
VERBOSE_LOGGING=true npm start
```

---

## Incident Response

### High Error Rate / Provider Failures

1. Check recent alerts:
   ```bash
   curl http://localhost:3000/api/performance/alerts
   ```
2. Check provider API key status:
   ```bash
   curl http://localhost:3000/api/providers/status
   ```
3. Tail error log for stack traces:
   ```bash
   tail -100 logs/error.log
   ```
4. Switch to a different provider in the UI or CLI `--provider` flag while the primary is down.

### Processing Stuck / Queue Not Draining

1. Check queue state:
   ```bash
   curl http://localhost:3000/progress
   ```
2. Cancel the stuck queue:
   ```bash
   curl -X POST http://localhost:3000/cancel-processing
   ```
3. Restart the server and re-upload the affected files.

### Cost Spike

1. Check current session spend in logs (search for `sessionCostUsd`).
2. Review `config.json` → `costs.maxCostPerSession` — lower it if needed.
3. Check which provider is being used; switch to a lower-cost option (Gemini Flash or Claude Haiku).
4. Cancel processing if costs are out of control:
   ```bash
   curl -X POST http://localhost:3000/cancel-processing
   ```

### Database Corruption or Missing Data

1. Check the database file:
   ```bash
   ls -lh data/memorials.db
   sqlite3 data/memorials.db ".tables"
   ```
2. Restore from latest backup:
   ```bash
   cp backups/memorials-YYYYMMDD.db data/memorials.db
   ```
3. Re-process any files that were in-flight when the corruption occurred.

### Disk Space

Upload files accumulate in `./uploads/`. Process or archive them regularly:

```bash
# Check sizes
du -sh uploads/ data/ logs/

# Archive old uploads (adjust date as needed)
find uploads/ -mtime +7 -exec mv {} data/archive/ \;

# Trim old metrics
curl -X POST http://localhost:3000/api/performance/cleanup
```

---

## Useful npm Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `npm start` | `node server.js` | Production start |
| `npm run dev` | `nodemon server.js` | Dev with auto-reload |
| `npm run local-start` | `NODE_ENV=development nodemon ...` | Dev ignoring data/ and uploads/ |
| `npm test` | `jest` | Full test suite |
| `npm run init-db` | `node scripts/init-db.js` | Initialize fresh database |
| `npm run verify:migrations` | `node scripts/verify-migration-transactions.js` | Check migration integrity |
| `npm run eval` | `node eval/scripts/score.js` | Run extraction accuracy evaluation against local ground truth |
| `npm run eval:check` | `node eval/scripts/score.js --check --floor 0.85` | Eval with 0.85 accuracy floor (local gate; not wired into CI) |
| `npm run eval:synthetic` | `node eval/scripts/score.js --dir eval/fixtures/synthetic` | Score the tracked synthetic fixtures (no client data needed) |
| `npm run eval:export` | `node eval/scripts/export-for-annotation.js` | Generate GT stub from a source image |
| `npm run stress-test` | `node scripts/stress-test.js` | Load testing |

---

## Related Documentation

- [Architecture Overview](../ARCHITECTURE.md)
- [Configuration Reference](../CONFIG.md)
- [API Reference](../API.md)
- [Performance Monitoring](performance-monitoring.md)
