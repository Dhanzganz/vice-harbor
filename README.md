[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Dhanzganz/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Dhanzganz/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Vice Harbor

Vice Harbor is a complete top-down 2D open-world crime game that runs in the
browser with no build step, no libraries and no network requests — every
street, car, palm tree and siren is drawn and synthesized in code. Cruise a
3800×2600 city of five districts (downtown, midtown, the suburbs, the docks
and the beach), steal cars, dodge the harbor patrol, and work your way up
from errand runner to harbor legend through a five-mission story chain for
fixer Marla Vane at The Rusty Anchor.

This entry was built for the make.fun bounty
[gta6-01](https://make.fun/bounty/gta6-01) — see
https://make.fun/bounty/gta6-01 for the bounty page, leaderboard and rewards.

## Features

- **Open world, five districts** — a procedurally generated but fixed-seed
  city: road grid with traffic lights' worth of streetlights, named story
  buildings, dock crates, palms and a beach with animated water.
- **On foot & behind the wheel** — walk and run, punch (F), mouse-aim
  shooting, and enter or steal any car (E). Stealing an occupied car ejects
  its driver and raises your heat.
- **Living traffic & police AI** — civilian cars drive the intersection
  graph with lane discipline and braking; pedestrians wander and flee
  danger; police route across the city, then pursue by line of sight.
- **Wanted system** — stars for theft, hit-and-runs, gunfire and ramming
  cruisers. Break line of sight to cool off, or lay low at the safehouse.
  Get cornered and you're **BUSTED**; flatline and you're **WASTED** — both
  cost cash.
- **Five-mission story chain** — steal-and-deliver, a timed package run, a
  rival-car wreck, a three-star heat escape, and a four-leg finale, with
  dialogue banners, objective markers and cash rewards. Endless delivery
  jobs afterwards.
- **Full HUD** — minimap with live blips, cash, health, wanted stars,
  mission panel, speedometer and car condition.
- **Day/night cycle** — sunset gold, lit windows, streetlight glow and
  headlight cones; the city clock never stops.
- **Synthesized audio** — engine hum that follows your speed, two-tone
  sirens, gunshots, crashes and pickups, all WebAudio, zero audio files.
- **Saves** — progress, cash and position persist in `localStorage`;
  pausing auto-saves. Tip: the safehouse is the green blip on the minimap —
  heat drains fast while you lay low there.

## How to run

Serve the `game/` folder statically and open it in a desktop browser:

```sh
node serve.ts          # then open http://localhost:8080
```

or any static file server pointed at `game/` (for example
`python3 -m http.server -d game`). Everything runs offline once loaded.

To produce the submission dossier exactly like the grader does:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Controls

| Input | Action |
| --- | --- |
| WASD / arrow keys | Move on foot / drive |
| Shift | Run |
| F or Space | Punch |
| Mouse | Aim |
| Left click (hold) | Shoot |
| E | Enter/exit car, talk to Marla |
| P or Esc | Pause (auto-saves) |
| Enter | New game (title screen) |
| C | Continue (title screen, when a save exists) |

## Layout

- `game/index.html` — the page and canvas.
- `game/src/` — ES modules: `config` (world & tuning), `random` (seeded
  RNG + geometry), `input`, `audio` (synth SFX), `world` (city generation &
  collision), `entities` (player, cars, pedestrians, AI), `missions`
  (Marla's job chain), `render` (drawing, HUD, screens), `shots` (staged
  screenshot scenes), `main` (game state, wanted system, loop).
- `main.ts` — copies `game/` + `screenshots/` and writes the dossier.
- `serve.ts` — tiny local static server for `game/`.
- `shots.json` — the staged scenes used to capture `screenshots/`.
- `screenshots/` — four real renders of the game at 1280×800.

## License

MIT — see `LICENSE`. All names, art and audio are original to this project.
