# Contributing to Text Harvester

Thank you for your interest in contributing to Text Harvester — an OCR tool built for the heritage and archival sector. Contributions from historians, archivists, developers, and genealogists are all welcome.

## Ways to Contribute

- **Bug reports** — something isn't extracting correctly, or the application errors
- **Feature requests** — ideas for new record types, providers, or export formats
- **Code** — bug fixes, new features, performance improvements
- **Documentation** — improve clarity, add examples, fix typos
- **Testing** — run the tool against real (anonymised) records and report findings

## Reporting Bugs

Open an issue at https://github.com/donalotiarnaigh/textharvester-web-public/issues using the **Bug Report** template. Please include:

- Record type (memorial / burial register / grave record card)
- AI provider used (OpenAI / Anthropic / Gemini / Mistral)
- Steps to reproduce
- Expected vs actual output
- Extracted JSON if applicable (anonymise any personal data)
- Node.js version and OS

## Feature Requests

Open an issue using the **Feature Request** template. For anything substantial, open an issue to discuss the approach before starting work — this avoids duplication and keeps the project focused on heritage use cases.

## Development Setup

See the [README](README.md) for full installation instructions. The short version:

```bash
git clone https://github.com/donalotiarnaigh/textharvester-web-public.git
cd textharvester-web
npm install
cp .env.example .env   # then add your API keys
npm start
```

### Node & npm versions

The pinned Node major lives in `.nvmrc` (`22`). With [nvm](https://github.com/nvm-sh/nvm) installed, just run `nvm use`.

| Tool | Supported |
|------|-----------|
| Node | `>=22.0.0` — CI and day-to-day development both use Node 22 |
| npm  | `>=10.0.0` — npm 10 (bundled with Node 22) and npm 12 are both verified working |

`engines` is **advisory**: npm warns on a mismatch but proceeds. We deliberately do not set `engine-strict` or `packageManager`, so Corepack will not intercept `npm` on your machine.

**npm 12 and install scripts.** npm 12 blocks dependency install scripts by default. `sqlite3` needs its install script to fetch or build its native binding, so `package.json` carries an `allowScripts` entry for it. Without that entry a fresh `npm ci` fails with `Could not locate the bindings file`. If you add a dependency that compiles native code, `npm ci` will warn that install scripts were blocked — approve it explicitly with `npm install-scripts approve <pkg>`.

> Heads-up: `npm install-scripts` honours `--dry-run` only partially — it has been observed writing to `package.json` anyway. Read `git diff package.json` after running it.

## Coding Standards

ESLint and the full test suite are enforced in CI on every pull request. Before submitting a PR:

```bash
npm run lint    # check for issues
npm test        # all tests must pass
```

Style rules (enforced automatically): single quotes, 2-space indentation, Unix line endings, semicolons required.

## Testing

All new behaviour must be covered by tests. Tests live in `__tests__/` and mirror the `src/` structure.

```bash
npm test             # run the full test suite
npm run coverage     # run with coverage report
```

## Pull Request Process

1. Fork the repository and create a branch from `main`
2. Make your changes with tests
3. Ensure `npm test` and `npm run lint` both pass
4. Open a PR against `main` — the CI pipeline will run automatically
5. A maintainer will review and merge

## Commit Messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) by convention — `feat: …`, `fix: …`, `docs: …`, `chore: …`, optionally scoped, e.g. `fix(deps): allow sqlite3 install scripts`. This matches the existing history but is **not** enforced by a hook or a CI check. Reference the issue number in the body where relevant.

## Questions

Contact [daniel@curlew.ie](mailto:daniel@curlew.ie) or open a discussion on GitHub.
