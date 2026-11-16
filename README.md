# Summit Draft

Draft six creatures, each with a randomly rolled move set, then battle the champion at the
summit. A new draft every day, the same for everyone.

- **Draft:** six rounds, three options per round. A coverage panel shows what your team is weak
  to and what it can hit hard.
- **Battle:** turn-based, with types, status effects, stat changes and switching. Speed controls
  from 1× to instant.
- **Help for newcomers:** a type chart one click away, and matchup hints on every move.

## Run it locally

```bash
npm start
```

Then open http://localhost:8080. You need Node.js; there is nothing else to install.

```bash
npm test
```

## Change the game

Types, the matchup chart, moves, creatures, the champion and all tuning numbers are plain JSON
files in `public/data/`. See [docs/CONFIG.md](docs/CONFIG.md).

## How it is built

See [docs/WORKFLOW.md](docs/WORKFLOW.md) for the ticket board, the agent roles and how a ticket goes from idea to live.

All creatures, moves and art in this game are original.
