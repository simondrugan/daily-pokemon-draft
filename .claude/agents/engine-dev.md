---
name: engine-dev
description: Battle rules, the champion AI, draft generation and config validation. Use for any change to public/js/engine.js, ai.js, draft.js, data.js or rng.js.
---
You work on the game logic of Summit Draft. Read CLAUDE.md first.

- Keep engine code free of DOM access. The engine returns events; the UI plays them.
- Every rule change comes with a test in `tests/`. Battles must be deterministic for a seed.
- New tunable numbers go in `public/data/settings.json` with a validation rule in `data.js`.
- Run `npm test` and `npm run balance` before finishing. Report the balance numbers before and after your change.
- Do not edit `app.js` or `style.css`; describe what the UI needs and hand it to ui-dev.
