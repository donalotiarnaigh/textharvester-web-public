# Pilot Run Preparation (Phase 9.2)

Operational checklist for running the full St Luke's Burial Register pilot (~210 pages). These steps align with the technical design and keep the existing memorial-processing behaviour unchanged.

## 9.2.1 Verify page availability
- Stage the scanned pages under `data/burial_register/vol1/source_pages/` using zero-padded filenames (`page_001.png` … `page_210.png`) so uploads remain deterministic in the frontend dropzone.
- Confirm the full set is reachable before starting the run:
  ```bash
  find data/burial_register/vol1/source_pages -maxdepth 1 -type f -name "page_*.png" | wc -l  # Expect: 210
  find data/burial_register/vol1/source_pages -maxdepth 1 -type f -name "page_*.png" | sort | head -n 3
  ```
- Keep the staging directory readable by the Node process; the upload handler will mirror files into `data/burial_register/<volumeId>/` when `source_type` is set to `burial_register` in the UI.

## 9.2.2 Processing environment
- Use Node `20.13.1` (`nvm use 20.13.1` if available), then install dependencies with `npm ci`.
- Ensure provider credentials are exported (e.g., `export OPENAI_API_KEY=...` and `export ANTHROPIC_API_KEY=...`) before starting the server.
- Prepare storage paths: create `data/` and `logs/` if absent so `config.json` targets (`data/memorials.db`, `data/burial_register/`) are writable.
- Run `npm run init-db` if the SQLite database is missing, then start the app with `npm start` (or `npm run dev` during supervised runs).

## 9.2.3 Monitoring and logging
- Default logs are written to `logs/combined.log` and `logs/error.log`; monitor live processing with `tail -f logs/combined.log`.
- Enable verbose payload logging for troubleshooting with `VERBOSE_LOGGING=true npm start` (or set `logging.verboseMode` to `true` in `config.json`) and disable after spot checks.
- For performance sampling and truncation, keep the `config.json` defaults unless a provider shows instability; adjust only between batches to avoid mid-run noise.

## 9.2.4 Backup procedures
- Create a baseline archive before the first provider run and another after each provider completes:
  ```bash
  mkdir -p backups
  tar -czf backups/burial_register_vol1_$(date +%F)_pre-run.tar.gz \
    config.json data/burial_register data/memorials.db logs
  ```
- Store backups outside the working directory (cloud share or external volume) before starting the next batch to protect page JSON, CSV exports, and logs.
- If space is constrained, keep the latest two archives plus the active `logs/` directory.

## 9.2.5 Pilot run steps
- Start the frontend, open `http://localhost:3000`, and choose **Burial Register** as the source type; leave **Volume ID** as `vol1` unless processing a different book.
- Process the dataset twice (once per provider): select `OpenAI` then `Anthropic`, uploading pages in numbered order to maintain the `row_index_on_page`/`entry_id` mapping.
- Upload in manageable batches (e.g., 20–30 pages) to keep queue latency reasonable; wait for each batch to finish before starting the next provider run.
- After each provider completes, confirm CSV exports and page JSONs are present under `data/burial_register/<volumeId>/pages/<provider>/` and archive them per the backup step.
