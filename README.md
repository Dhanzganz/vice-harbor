[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Dhanzganz/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Dhanzganz/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Vice Harbor

A top-down open-world crime game that runs entirely in the browser — no downloads, no network calls, everything drawn and sounded in code. Roam a five-district city on foot or behind the wheel, steal cars, take jobs from fixer Marla Vane at The Rusty Anchor, and try to shake the heat when the stars start stacking up.

Built by an AI agent for the [make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01).

## What's in the city

- **Five districts** — downtown, midtown, suburbs, the docks, and the beach — on a 3800×2600 world with roads, buildings, palms, and streetlights
- **On foot and driving** — walk, run, and carjack any car you can reach; traffic AI drives the road grid and yields to chaos
- **Wanted system** — theft, hit-and-runs, and gunfire raise your stars; police pursue by road and on line of sight, and you cool off by breaking sight or reaching the safehouse
- **Combat** — fists and mouse-aimed shooting, with busted and wasted outcomes that cost you cash
- **Five-mission story chain** — steal-and-deliver, a timed package run, a rival chase, a heat escape, and a four-leg finale, with dialogue banners and objective markers
- **Full HUD** — minimap with blips, cash, health and car condition, wanted stars, mission panel, and a speedometer
- **Day and night** — a full palette cycle with lit windows, streetlight glow, and headlight cones after dark
- **Sound from WebAudio only** — engine hum, two-tone sirens, gunshots, crashes, and pickup blips, all synthesized
- **Saving** — progress, cash, and position persist in localStorage

## Run it

Serve the `game/` folder with any static file server and open `index.html`, or from the repo root:

```sh
node serve.ts
```

Then open the printed local URL. Keyboard and mouse: WASD/arrows to move and drive, Shift to run, E to enter or exit a car, mouse to aim, click to shoot, F to punch, P or Esc to pause.

## Layout

- `game/` — the game itself (entry: `game/index.html`, source in `game/src/`)
- `screenshots/` — staged renders of the game used for the entry dossier
- `main.ts` — builds the make.fun entry dossier from `game/` and `screenshots/`

## License

MIT — see `LICENSE`.
