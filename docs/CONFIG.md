# Changing the game without code

Everything about the game's content lives in five files in `public/data/`. You can edit them
in GitHub's web editor (open the file, click the pencil, commit). The site redeploys on its own
a minute or two after a change reaches `main`.

If you make a mistake, the tests fail and the deploy is blocked, with a message saying what is
wrong (for example `creature "burlox" movePool lists unknown move "tackel"`). The game itself
shows the same message if it is loaded with broken data.

## types.json

`types` is the list of types: an `id` (lower case, used by the other files), a display `name`
and a `color`.

`chart` has one row per **attacking** type:

```json
"fire": { "strong": ["plant", "frost"], "weak": ["fire", "water"], "none": [] }
```

- `strong` — defending types that take double damage.
- `weak` — defending types that take half damage.
- `none` — defending types that take no damage.

Anything not listed takes normal damage. To add a type, add it to `types` and give it a row in
`chart`, then mention it in other rows where it should be strong or weak.

## moves.json

```json
{ "id": "flame-jet", "name": "Flame Jet", "type": "fire", "category": "special",
  "power": 85, "accuracy": 100, "effects": [{ "type": "status", "status": "burn", "chance": 10 }] }
```

| Field | Meaning |
|---|---|
| `category` | `physical` (uses Attack vs Defense), `special` (Sp. Attack vs Sp. Defense) or `status` (no damage) |
| `power` | Damage strength. `0` for status moves |
| `accuracy` | Percent chance to hit. `null` means it never misses |
| `priority` | Optional. `1` makes the move go before normal moves |
| `highCrit` | Optional. `true` gives a higher critical-hit chance |
| `effects` | Optional list, see below |

Effects:

| Effect | Example | What it does |
|---|---|---|
| `status` | `{ "type": "status", "status": "burn", "chance": 10 }` | Gives the foe `burn`, `poison`, `paralysis` or `sleep` |
| `stage` | `{ "type": "stage", "target": "self", "stat": "atk", "stages": 2 }` | Raises or lowers `atk`, `def`, `spa`, `spd` or `spe` on `self` or `foe` |
| `recoil` | `{ "type": "recoil", "percent": 25 }` | User takes that share of the damage dealt |
| `drain` | `{ "type": "drain", "percent": 50 }` | User heals that share of the damage dealt |
| `heal` | `{ "type": "heal", "percent": 50 }` | User heals that share of its max HP |
| `flinch` | `{ "type": "flinch", "chance": 20 }` | Foe loses its turn if it has not moved yet |

`chance` is a percent and can be left out for "always".

## creatures.json

```json
{ "id": "kilnback", "name": "Kilnback", "types": ["fire", "stone"],
  "stats": { "hp": 90, "atk": 80, "def": 120, "spa": 70, "spd": 80, "spe": 35 },
  "movePool": ["ember", "flame-jet", "scorch", "rock-toss"] }
```

One or two types. `movePool` is the list the draft rolls move sets from; it needs at least as
many moves as `movesPerCreature` and at least one attack.

## champion.json

The opponent's name, intro line and team (each with a fixed move set). `statMultiplier` scales
all of the champion's stats: `1.0` is an even fight, `1.1` is hard.

## settings.json

- `draft` — number of rounds, options per round, moves per creature, and whether every drafted
  creature is guaranteed an attack of its own type.
- `battle` — the damage formula's constants, critical-hit chances, and status effect strength.
- `statusImmunity` — which types cannot be given which status.

## Checking balance

After a change, `npm run balance` prints how often three simple computer drafters beat the
champion. Use it to see whether a change made the game easier or harder.
