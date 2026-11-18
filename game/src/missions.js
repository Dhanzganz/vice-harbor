// Vice Harbor — Marla Vane's five-mission story chain at The Rusty Anchor.
// Walk to the Anchor door and press E to take the next job. Each mission is a
// small stage machine: an objective point (or a car to disable), optional
// timer, dialogue banners from Marla, and a cash reward. Free roam between
// jobs; after the finale, Marla offers endless quick delivery runs.

import { ANCHOR, SAFEHOUSE, BEACH_KIOSK } from './config.js';
import { dist } from './random.js';
import { makeCar, nearestNode } from './entities.js';
import { sfx } from './audio.js';

export const MISSIONS = [
  {
    title: 'First Errand', reward: 600,
    brief: ['Marla: You drive, you don\'t ask. There\'s a coupe on the dock road with my name on it.', 'Marla: Take it. Bring it back here. Try not to scratch it.'],
    done: ['Marla: Clean enough. You\'re hired.'],
  },
  {
    title: 'Hot Package', reward: 900,
    brief: ['Marla: Kiosk Azul on the beach has a package for me. Small, heavy, ticking clock.', 'Marla: Beach first, then drop it at Fifth & Grand downtown. Move!'],
    done: ['Marla: Right on time. The client sends his regards.'],
  },
  {
    title: 'Rival Colors', reward: 1200,
    brief: ['Marla: A magenta clown car has been muscling my corners up north.', 'Marla: Find it. Wreck it. Walk away whistling.'],
    done: ['Marla: Ha! I saw the smoke from here. Beautiful.'],
  },
  {
    title: 'Cool Off', reward: 1500,
    brief: ['Marla: The harbor patrol is already rolling — three stars of attention, all yours.', 'Marla: Lose them and get home to the safehouse. Don\'t lead them to my door.'],
    done: ['Marla: Ice cold. That\'s how you survive this town.'],
  },
  {
    title: 'Harbor Run', reward: 3000,
    brief: ['Marla: The big one. Beach, midtown, then home — four legs, one night.', 'Marla: Half the harbor will chase you by the end. Bring it home anyway.'],
    done: ['Marla: Vice Harbor is yours now, kid. The Anchor always has work.'],
  },
];

export function makeMissionState() {
  return { idx: 0, active: null, endless: 0 };
}

export function showDialogue(G, lines) {
  G.dialog = { lines: lines.slice(), i: 0, t: 0 };
}

export function startMission(G) {
  const M = G.missions;
  if (M.active || M.idx >= MISSIONS.length) { startEndless(G); return; }
  const def = MISSIONS[M.idx];
  const a = { def, n: M.idx + 1, stage: '', timer: 0, carId: 0, leg: 0 };
  M.active = a;
  showDialogue(G, def.brief);
  sfx.mission();
  if (M.idx === 0) {
    const car = makeCar(986, 2060, Math.PI, 'parked', G.rng, { color: '#e0b64f', marked: true });
    car.hasDriver = false;
    G.cars.push(car);
    a.carId = car.id;
    a.stage = 'steal';
  } else if (M.idx === 1) {
    a.stage = 'pickup';
  } else if (M.idx === 2) {
    const car = makeCar(2780, 320, Math.PI / 2, 'mission', G.rng, { color: '#c95fb0', maxSpeed: 305 });
    car.hasDriver = true;
    G.cars.push(car);
    a.carId = car.id;
    a.stage = 'wreck';
  } else if (M.idx === 3) {
    G.setWanted(3);
    a.stage = 'escape';
  } else if (M.idx === 4) {
    a.stage = 'leg';
    a.leg = 0;
  }
  G.saveGame();
}

function startEndless(G) {
  const M = G.missions;
  const spots = [
    { x: 3420, y: 1180, name: 'Kiosk Azul' }, { x: 1580, y: 900, name: 'Fifth & Grand' },
    { x: 980, y: 1480, name: 'Midtown West' }, { x: 2780, y: 2060, name: 'Dock Gate 9' },
    { x: 380, y: 320, name: 'North Suburbs' }, { x: 2180, y: 1480, name: 'Downtown East' },
  ];
  const from = spots[M.endless % spots.length];
  const to = spots[(M.endless + 3) % spots.length];
  M.endless++;
  M.active = {
    def: { title: 'Harbor Run (delivery)', reward: 250, done: ['Marla: Quick and clean. Here\'s your cut.'] },
    n: 0, stage: 'go', timer: 110, tx: to.x, ty: to.y,
  };
  showDialogue(G, [`Marla: Pick up at ${from.name}, drop at ${to.name}. Clock's running.`]);
  M.active.stage = 'pickupFrom';
  M.active.tx = from.x; M.active.ty = from.y;
  M.active.fx = to.x; M.active.fy = to.y;
  sfx.mission();
}

export function failMission(G, why) {
  const M = G.missions;
  if (!M.active) return;
  showDialogue(G, [`Marla: ${why} Come back when you're ready to do it right.`]);
  sfx.fail();
  M.active = null;
}

export function completeMission(G) {
  const M = G.missions;
  const a = M.active;
  if (!a) return;
  G.cash += a.def.reward;
  sfx.cash(); sfx.mission();
  showDialogue(G, a.def.done.concat([`+$${a.def.reward} — job done.`]));
  if (a.n >= 1 && a.n <= MISSIONS.length) M.idx = a.n;
  M.active = null;
  G.saveGame();
}

// Current objective for the HUD/marker: {x, y, label} or null.
export function objective(G) {
  const M = G.missions;
  const a = M.active;
  if (!a) {
    if (!G.player.car) return { x: ANCHOR.x, y: ANCHOR.y, label: M.idx < MISSIONS.length ? 'Talk to Marla at The Rusty Anchor' : 'Marla has more work' };
    return null;
  }
  switch (a.stage) {
    case 'steal': { const c = G.cars.find((k) => k.id === a.carId); return c ? { x: c.x, y: c.y, label: 'Steal the gold coupe' } : null; }
    case 'deliver': return { x: ANCHOR.x, y: ANCHOR.y, label: 'Deliver the coupe to the Anchor' };
    case 'pickup': return { x: BEACH_KIOSK.x, y: BEACH_KIOSK.y, label: 'Pick up the package at Kiosk Azul' };
    case 'drop': return { x: 1580, y: 900, label: `Drop the package at Fifth & Grand${a.timer > 0 ? ` — ${Math.ceil(a.timer)}s` : ''}` };
    case 'wreck': { const c = G.cars.find((k) => k.id === a.carId); return c ? { x: c.x, y: c.y, label: `Wreck the rival car (${Math.max(0, Math.ceil(c.health))}%)` } : null; }
    case 'escape': return { x: SAFEHOUSE.x, y: SAFEHOUSE.y, label: 'Lose the heat and reach the safehouse' };
    case 'leg': return LEGS[a.leg];
    case 'pickupFrom': return { x: a.tx, y: a.ty, label: 'Pick up the delivery' };
    case 'go': return { x: a.fx, y: a.fy, label: `Make the drop — ${Math.ceil(a.timer)}s` };
    default: return null;
  }
}

const LEGS = [
  { x: BEACH_KIOSK.x, y: BEACH_KIOSK.y, label: 'Leg 1: meet the buyer at Kiosk Azul' },
  { x: 980, y: 1480, label: 'Leg 2: drop at Midtown West' },
  { x: ANCHOR.x, y: ANCHOR.y, label: 'Leg 3: bring it home to the Anchor' },
];

function near(G, x, y, r) {
  const p = G.player;
  return dist(p.x, p.y, x, y) < r;
}

export function updateMissions(G, dt) {
  // Dialogue banners advance on their own clock.
  if (G.dialog) {
    G.dialog.t += dt;
    if (G.dialog.t > 3.4) { G.dialog.t = 0; G.dialog.i++; if (G.dialog.i >= G.dialog.lines.length) G.dialog = null; }
  }
  const M = G.missions;
  const a = M.active;
  if (!a) return;
  const p = G.player;

  if (a.stage === 'steal') {
    const c = G.cars.find((k) => k.id === a.carId);
    if (!c) { failMission(G, 'The coupe is gone.'); return; }
    if (p.car === c) { a.stage = 'deliver'; G.noteCrime('theft'); showDialogue(G, ['Marla (phone): That\'s it! Now bring it home.']); }
  } else if (a.stage === 'deliver') {
    if (p.car && p.car.id === a.carId && near(G, ANCHOR.x, ANCHOR.y, 84)) completeMission(G);
    else if (!p.car && near(G, ANCHOR.x, ANCHOR.y, 84)) { /* must arrive in the car */ }
    const c = G.cars.find((k) => k.id === a.carId);
    if (c && c.dead) failMission(G, 'You wrecked my coupe!');
  } else if (a.stage === 'pickup') {
    if (near(G, BEACH_KIOSK.x, BEACH_KIOSK.y, 62)) { a.stage = 'drop'; a.timer = 120; sfx.pickup(); showDialogue(G, ['Got the package. Downtown, fast!']); }
  } else if (a.stage === 'drop') {
    a.timer -= dt;
    if (a.timer <= 0) { failMission(G, 'Too slow — the package went cold.'); return; }
    if (near(G, 1580, 900, 76)) completeMission(G);
  } else if (a.stage === 'wreck') {
    const c = G.cars.find((k) => k.id === a.carId);
    if (!c) { completeMission(G); return; }
    if (c.dead) completeMission(G);
  } else if (a.stage === 'escape') {
    if (G.heat < 0.4 && near(G, SAFEHOUSE.x, SAFEHOUSE.y, 110)) completeMission(G);
  } else if (a.stage === 'leg') {
    const leg = LEGS[a.leg];
    if (leg && near(G, leg.x, leg.y, 78)) {
      sfx.pickup();
      a.leg++;
      if (a.leg === 2) { G.setWanted(3); showDialogue(G, ['Marla (phone): Heat\'s on you now — bring it home!']); }
      if (a.leg >= LEGS.length) completeMission(G);
    }
  } else if (a.stage === 'pickupFrom') {
    if (near(G, a.tx, a.ty, 66)) { a.stage = 'go'; sfx.pickup(); }
  } else if (a.stage === 'go') {
    a.timer -= dt;
    if (a.timer <= 0) { failMission(G, 'Too slow.'); return; }
    if (near(G, a.fx, a.fy, 76)) completeMission(G);
  }
}

// The rival car flees along the road graph, fast and sloppy.
export function driveRival(G, car, dt) {
  const p = G.player;
  car.repath -= dt;
  if (!car.nextNode || car.repath <= 0) {
    const node = nearestNode(car.x, car.y);
    car.node = node;
    // Choose the neighbouring node that maximises distance from the player.
    const opts = [];
    for (const rx of [380, 980, 1580, 2180, 2780, 3260]) if (rx !== node.x) opts.push({ x: rx, y: node.y });
    for (const ry of [320, 900, 1480, 2060]) if (ry !== node.y) opts.push({ x: node.x, y: ry });
    opts.sort((u, v) => dist(v.x, v.y, p.x, p.y) - dist(u.x, u.y, p.x, p.y));
    car.nextNode = opts[0];
    car.repath = 0.8;
  }
  const want = Math.atan2(car.nextNode.y - car.y, car.nextNode.x - car.x);
  const diff = ((want - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  // Steering intent only: main applies the shared driveCar physics with
  // these values, which keeps missions.js free of a physics import cycle.
  car._steer = steer; car._throttle = Math.abs(diff) > 2.2 ? -0.4 : 1;
}
