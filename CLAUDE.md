# Summit Draft

A static web game: draft six creatures with random move sets, then battle the champion.
No build step and no dependencies. Hosted on GitHub Pages from `public/`.

## Commands
- `npm test` — run the test suite (Node's built-in runner). Must pass before every commit.
- `npm run balance` — print win rates for computer-piloted drafts. Run after changing anything in `public/data/` or the engine and report the before/after numbers in the pull request.
- `npm start` — serve the game at http://localhost:8080.

## Layout
- `public/data/*.json` — all game content and tuning. The owner edits these by hand, so keep them readable: one entry per line, aligned, no generated blobs. See `docs/CONFIG.md`.
- `public/icons/<creature-id>.svg` — creature pictures. The owner replaces these with their own art, so never regenerate or overwrite existing ones. `npm run icons` adds placeholders for new creatures only.
- `public/js/engine.js` — battle rules. Pure logic, no DOM. Returns events for the UI to play back.
- `public/js/ai.js` — the champion's decisions.
- `public/js/draft.js` — draft generation and team coverage.
- `public/js/data.js` — loading and validating config. Every new config field needs a validation rule with a plain-language error.
- `public/js/app.js`, `public/css/style.css` — the interface.
- `tests/` — tests. `tests/balance.js` is a report, not a test.

## Rules
- All content is original. Never add creatures, moves, names, art or text taken from an existing game or franchise, renamed or otherwise.
- Numbers and content belong in `public/data/`, not in code. If a ticket needs a new tunable value, add it to `settings.json`.
- Engine changes need tests. Battles must stay deterministic for a given seed.
- No frameworks, bundlers or runtime dependencies without the owner agreeing first.
- Check the page at phone width (390px) as well as desktop.

## Working a ticket
See `docs/WORKFLOW.md`. In short: one ticket per branch and pull request, named `ticket/<issue-number>-<short-name>`; never push to `main` directly.

## Agents
Role definitions live in `.claude/agents/`. Use `engine-dev` for rules and AI, `ui-dev` for interface work, `content-designer` for data files and balance, and `reviewer` to check a finished branch before the pull request is opened.
