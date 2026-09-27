# Security Policy

## Supported Versions

There are no tagged releases: the project ships from `main`, and security fixes
land there. The `version` field in `package.json` is not a release marker, so
please report against the current `main` rather than a version number.

## Reporting a Vulnerability

Please **do not** report security vulnerabilities through public GitHub Issues.

Email [daniel@curlew.ie](mailto:daniel@curlew.ie) with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact

You should receive an acknowledgement within 5 business days. After a fix is confirmed, details will be disclosed publicly with appropriate credit to the reporter.

## Scope

**In scope:**

- Authentication or authorisation bypass
- Injection vulnerabilities (SQL, command, path traversal) in the application code
- Unintended exposure of uploaded files or extracted data
- **Secrets or real client records committed to this repository or present in its
  history** — this is a public repository, so anything committed here should be
  treated as disclosed. Report it the same way as any other vulnerability.

**Out of scope:**

- Misconfiguration of your own deployment (for example, exposing the server
  publicly without authentication, or using an API key you have shared
  elsewhere)
- Vulnerabilities in third-party AI provider APIs (OpenAI, Anthropic, Gemini,
  Mistral) — report these directly to those providers
- Issues requiring physical access to the host machine

## Controls

- Secret scanning and secret scanning push protection are enabled on this
  repository, so a commit containing a recognised provider credential is
  blocked at push time.
- Client ground truth and source images are deliberately excluded from the
  repository (see `eval/README.md`); `.gitignore` and `.dockerignore` also
  exclude `data/`, `uploads/` and eval client data so they cannot reach the
  repository or a built image by accident.

## Handling secrets and client data

Text Harvester processes images locally and sends them to third-party AI APIs.
Operators are responsible for the records they extract: the application writes
them to a local SQLite database and does not send them anywhere other than the
configured AI provider.

Contributors must not commit:

- API keys or other credentials. Keys belong in `.env`, which is gitignored.
  Note that a shell profile is just as dangerous as `.env` — a legacy key once
  reached this repository through a committed `.zshrc`.
- Real extracted records, register scans, ground-truth data or delivery
  exports. Use the synthetic fixtures in `eval/fixtures/synthetic/` and the
  sample data in `sample_data/` instead.

If a key is ever exposed, revoke it at the provider first — a history rewrite
does not make a leaked key safe, and unreachable objects remain
SHA-addressable until GitHub purges them.
