# Changing the game without code

Everything about the game's content lives in five files in `public/data/`. You can edit them
in GitHub's web editor (open the file, click the pencil, commit). The site redeploys on its own
a minute or two after a change reaches `main`.

If you make a mistake, the tests fail and the deploy is blocked, with a message saying what is
wrong (for example `creatures.json: creature "flopfin" movePool lists unknown move "tackel"`). The game itself
shows the same message if it is loaded with broken data.

## types.json

`types` is the list of types: an `id` (lower case, used by the other files), a display `name`
and a `color`.

`types` entry, as it appears in the file:

```json
{"id": "fire", "name": "Fire", "color": "#EE8130"},
```

`chart` has one row per **attacking** type. This is the real `fire` row:

```json
"fire": {"strong": ["grass", "ice", "bug", "steel"], "weak": ["fire", "water", "rock", "dragon"], "none": []},
```

- `strong` — defending types that take double damage.
- `weak` — defending types that take half damage.
- `none` — defending types that take no damage.

Anything not listed takes normal damage. To add a type, add it to `types` and give it a row in
`chart`, then mention it in other rows where it should be strong or weak.

The file also has a `defense` section (for example
`"fire": {"weakTo": ["water", "ground", "rock"], ...}`). The game does not read it: matchups in
battle and in the draft come only from `chart`. If you change `chart`, the `defense` section
does not need to match.

## moves.json

Each move is one line. This is the real `flamethrower` line:

```json
{"id": "flamethrower", "name": "Flamethrower", "type": "fire", "category": "special", "power": 90, "accuracy": 100, "pp": 15, "effects": [{"type": "status", "status": "burn", "chance": 10}], "description": "10% chance to burn the target.", "inLatestEdition": true},
```

And `slash`, which has a higher critical-hit chance:

```json
{"id": "slash", "name": "Slash", "type": "normal", "category": "physical", "power": 70, "accuracy": 100, "pp": 20, "effects": [{"type": "highCrit"}], "description": "High critical-hit ratio.", "inLatestEdition": true},
```

| Field | Meaning |
|---|---|
| `category` | `physical` (uses Attack vs Defense), `special` (Sp. Attack vs Sp. Defense) or `status` (no damage) |
| `power` | Damage strength. `0` for status moves. Every `physical` or `special` move must have a `power`: a number, or `null` (or `0`) if its damage works differently, see "Attacks with no power" below |
| `accuracy` | Percent chance to hit. `null` means it never misses |
| `priority` | Optional, `0` if left out. Higher numbers go first: a move with `1` goes before normal moves, `2` before `1`, and so on. Negative numbers go last: a move with `-5` goes after normal moves. Speed only decides the order between moves with the same priority |
| `effects` | Optional list, see below |
| `pp`, `description`, `inLatestEdition` | Kept for reference. The game does not read them; the move list in the game writes its own description from `effects` |

`highCrit: true` written on the move itself (outside `effects`) is also accepted and does the
same as the `highCrit` effect below. Use one or the other; the file uses the effect.

Effects:

| Effect | Example | What it does |
|---|---|---|
| `status` | `{"type": "status", "status": "burn", "chance": 10}` | Gives the foe `burn`, `poison`, `paralysis` or `sleep` |
| `stage` | `{"type": "stage", "target": "self", "stat": "atk", "stages": 2}` | Raises or lowers `atk`, `def`, `spa`, `spd` or `spe` on `self` or `foe` |
| `recoil` | `{"type": "recoil", "percent": 25}` | User takes that share of the damage dealt |
| `drain` | `{"type": "drain", "percent": 50}` | User heals that share of the damage dealt |
| `heal` | `{"type": "heal", "percent": 50}` | User heals that share of its max HP |
| `flinch` | `{"type": "flinch", "chance": 30}` | Foe loses its turn if it has not moved yet |
| `highCrit` | `{"type": "highCrit"}` | Higher critical-hit chance (`highCritChancePercent` in settings.json instead of `critChancePercent`) |

`chance` is a percent and can be left out for "always".

These examples are taken from real moves: `blade-waltz` (stage), `body-ram` (recoil), `absorb`
(drain), `dawn-glow` (heal), `bite` (flinch). A stage effect on `foe` with a negative number,
like `growl`'s `{"type": "stage", "target": "foe", "stat": "atk", "stages": -1}`, lowers the
foe's stat.

### Attacks with no power

Some attacks have `"power": null` because their damage works differently, for example:

```json
{"id": "counter", "name": "Counter", "type": "fighting", "category": "physical", "power": null, "accuracy": 100, "pp": 20, "priority": -5, "description": "Deals back double the physical damage the user took this turn. Priority -5.", "inLatestEdition": true},
```

These are allowed, but the `power` must be written out as `null`: leaving it out is reported as
a mistake, so a forgotten number is caught. For now they deal no damage in battle, but any
effects they have from the table above still happen. If they have none, the battle says "But
nothing happened!" (after checking whether the move hit). Like any attack, they do nothing to a
type that is immune to them ("It doesn't affect ..."). They do not count as an attack for the
draft (see creatures.json below).

### Effects that are not in battle yet

The move list also uses some effect names that the battle does not run yet. The checker
accepts them so the game still loads, but in a battle they are simply skipped. If a status
move has only these effects (or no effects at all), the battle says "But nothing happened!".
In the move list they are shown as "Special effect (not in battle yet)".

| Kind | Names accepted but not in battle yet |
|---|---|
| Effect `type` | `ohko`, `trap`, `twoTurn`, `recharge`, `weather`, `terrain`, `multiHit`, `confuse`, `switchOut`, `protect`, `selfFaint`, `hazard`, `screen`, `forceSwitch`, `alwaysCrit` |
| `status` | `freeze`, `badly-poisoned`, `random` |
| `stage` stat | `accuracy`, `evasion` |

These are being added one by one in later updates (tickets #9 to #14). Any other name that is
not in either table is still reported as a mistake, so a typo such as `"burnn"` is caught.

## creatures.json

Each creature is one line. This is the real `flopfin` line:

```json
{"id": "flopfin", "dex": 129, "name": "Flopfin", "types": ["water"], "stats": {"hp": 20, "atk": 10, "def": 55, "spa": 15, "spd": 20, "spe": 80}, "movePoolGame": "Edition 9", "movePool": ["flail", "splash", "tackle"]},
```

One or two types. `dex` and `movePoolGame` are kept for reference; the game does not read them. `movePool` is the list the draft rolls move sets from. It needs at least one
move.

- If a creature has fewer moves than `movesPerCreature` (in settings.json), it simply gets its
  whole move pool when drafted.
- A creature needs at least one attack (a physical or special move with power above 0) to be
  offered in the draft. A creature without one is still allowed in the file and can be used by
  the champion, but players never see it in the draft. The checker counts only creatures that
  have an attack when it checks there are enough for the draft.

## Creature icons

Each creature's picture is a file in `public/icons/`, named after the creature's `id`
(`public/icons/flopfin.svg`). To change one, replace that file with your own artwork.

- SVG is the default. To use a PNG, GIF or WebP instead, add the file and point the creature at
  it in `creatures.json`: `"icon": "icons/flopfin.png"`.
- Square images work best. They are shown from 40 to 120 pixels wide, so 256×256 is plenty.
- Draw the creature facing left. The game mirrors it for the player's side of the battle.
- When you add a new creature, run `npm run icons` to create a placeholder picture for it. That
  command never overwrites an existing file.

## champion.json

The opponent's name, intro line and team (each with a fixed move set). `statMultiplier` scales
all of the champion's stats: `1.0` is an even fight, `1.1` is hard.

## settings.json

- `draft` — number of rounds, options per round, moves per creature, and whether every drafted
  creature is guaranteed an attack of its own type.
- `battle` — the damage formula's constants, critical-hit chances, and status effect strength.
- `ai` — when the champion switches out of a bad matchup, see below.
- `statusImmunity` — which types cannot be given which status.

### ai

The champion can pull its active creature out when it is losing the type matchup. It only
considers this when all of these hold: its creature is weak to your creature's type, it has no
attack that is strong against yours, it has been in for at least `switchCooldownTurns` turns,
and it has another creature still standing whose matchup is clearly better. Your own creatures
never switch on their own.

```json
"ai": {
  "switchEagerness": 60,
  "switchMinMargin": 1,
  "switchCooldownTurns": 2
},
```

| Field | Allowed | What it does |
|---|---|---|
| `switchEagerness` | number from 0 to 100 | Percent chance the champion actually switches once a switch is worth it. Higher makes the champion switch more reliably and play a little harder. `0` turns switching off completely (battles then play out exactly as before switching existed). |
| `switchMinMargin` | number, 0 or more | How much better a benched creature's matchup must be than the active one's before switching is considered. Lower means it switches for small gains; higher means only for clear-cut ones, so switches become rarer. |
| `switchCooldownTurns` | whole number, 0 or more | Full turns a creature must stay in before the champion can pull it, including the creature it leads with. Lower makes the champion more slippery (and harder); `0` lets it switch on the first turn. Higher makes switches rarer. |

How the matchup is scored, for `switchMinMargin`: take the creature's best attack against your
creature (2 for double damage, 1 for normal, 0.5 for half, 0 for no effect; 4 or 0.25 when
both of a two-type target's types count), subtract how hard your creature's types hit it (the
worst one, same scale), and add half its remaining HP share. A
full-HP creature with a double-damage attack that takes half damage scores 2 − 0.5 + 0.5 = 2; a
full-HP creature that takes double damage and only has half-damage attacks scores
0.5 − 2 + 0.5 = −1. So a margin of `1` means "at least one step better".

With the shipped values (60, 1, 2) the champion switches in about half of all battles, usually
once. Each value only moves `npm run balance` by a few points, so it is a feel setting more than
a difficulty dial; use `statMultiplier` in champion.json for difficulty.

## Checking balance

After a change, `npm run balance` prints how often three simple computer drafters beat the
champion. Use it to see whether a change made the game easier or harder.
