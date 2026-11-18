// Vice Harbor — game orchestration: state, the wanted system, spawning,
// busted/wasted outcomes, save/load, camera and the main loop. The world,
// entities, missions, render and audio modules do the heavy lifting; this
// file wires them together and owns the rules of the street.

import { WORLD, TUNE, STORE_KEY, ANCHOR, SAFEHOUSE, HOSPITAL } from './config.js';
import { Rng, clamp, dist } from './random.js';
import { buildWorld, world, randomRoadPoint, hasLOS } from './world.js';
import { makePlayer, makeCar, makePed, updatePlayerOnFoot, updatePlayerDriving, updateTrafficCar, updatePoliceCar, updatePed, carCarCollisions, driveCar } from './entities.js';
import { makeMissionState, startMission, updateMissions, failMission, driveRival } from './missions.js';
import { render } from './render.js';
import { applyShot } from './shots.js';
import { input, attachInput, endFrame } from './input.js';
import { initAudio, sfx, setEngine, setSiren } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || 7);

buildWorld(seed);

const G = {
  mode: 'title',
  time: 0,
  tod: TUNE.startHour,
  cam: { x: 1200, y: 700 },
  rng: new Rng(seed * 31 + 5),
  player: makePlayer(ANCHOR.x, ANCHOR.y + 16), // on the Anchor's front lot
  cars: [],
  peds: [],
  tracers: [],
  particles: [],
  cash: TUNE.startCash,
  heat: 0,
  lastSeen: 99,
  bustedT: 0,
  missions: makeMissionState(),
  dialog: null,
  bannerText: '', bannerSub: '', bannerT: 0,
  prompt: null,
  shake: 0,
  threat: null,
  crimeCd: {},
  spawnT: 0,
  saveExists: false,
  shotMode: !!shotName,
  hurtCd: 0,
};
G.saveExists = !!localStorage.getItem(STORE_KEY);

// ---- helpers used by other modules ---------------------------------------
G.burst = (x, y, n, color) => {
  for (let i = 0; i < n; i++) {
    const a = G.rng.float(0, Math.PI * 2), sp = G.rng.float(20, 130);
    G.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: G.rng.float(0.25, 0.6), max: 0.6, color });
  }
};
G.setThreat = (x, y) => { G.threat = { x, y, t: G.time }; };
G.banner = (text, dur = 2.4, sub = '') => { G.bannerText = text; G.bannerSub = sub; G.bannerT = dur; };
G.setWanted = (n) => { G.heat = Math.max(G.heat, n); G.lastSeen = 0; };

const CRIME_HEAT = { theft: 1.0, gunfire: 0.55, assault: 0.5, hitAndRun: 0.85, ram: 0.3, shootCop: 1.0 };
G.noteCrime = (kind) => {
  const now = G.time;
  if (G.crimeCd[kind] && now - G.crimeCd[kind] < 0.7) return;
  // A crime only raises heat when someone sees (or hears) it: a ped or a
  // cruiser within earshot, or any witness with line of sight.
  const p = G.player;
  let witnessed = false;
  for (const ped of G.peds) if (dist(ped.x, ped.y, p.x, p.y) < 300) { witnessed = true; break; }
  if (!witnessed) for (const c of G.cars) if (c.kind === 'police' && dist(c.x, c.y, p.x, p.y) < 460) { witnessed = true; break; }
  G.crimeCd[kind] = now;
  if (!witnessed && kind !== 'theft') return;
  G.heat = clamp(G.heat + (CRIME_HEAT[kind] || 0.4), 0, 5);
  if (witnessed) G.lastSeen = 0;
};

G.hurtPlayer = (amt) => {
  if (G.time - G.hurtCd < 0.25 || G.mode !== 'play') return;
  G.hurtCd = G.time;
  G.player.hp -= amt;
  sfx.hurt();
  if (G.player.hp <= 0) wasted();
};

G.saveGame = () => {
  if (G.shotMode) return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      cash: G.cash, idx: G.missions.idx, x: G.player.x, y: G.player.y,
      hp: Math.max(30, G.player.hp), tod: G.tod,
    }));
    G.saveExists = true;
  } catch { /* storage unavailable */ }
};

// ---- outcomes ---------------------------------------------------------------
function clearPolice() {
  G.cars = G.cars.filter((c) => c.kind !== 'police');
  G.heat = 0; G.bustedT = 0; G.lastSeen = 99;
}

function busted() {
  const stars = Math.ceil(G.heat - 0.001);
  const fine = Math.min(G.cash, 120 + 60 * stars);
  if (G.missions.active && G.missions.active.n === 4) failMission(G, 'Busted mid-escape.');
  G.cash -= fine;
  clearPolice();
  exitCar(true);
  G.player.x = SAFEHOUSE.x; G.player.y = SAFEHOUSE.y + 26;
  G.player.hp = Math.max(G.player.hp, 60);
  G.banner('BUSTED', 2.6, fine > 0 ? `The harbor patrol takes $${fine}.` : 'The harbor patrol lets you off — broke.');
  sfx.fail();
  G.saveGame();
}

function wasted() {
  const fine = Math.floor(G.cash * 0.1);
  G.cash -= fine;
  clearPolice();
  exitCar(true);
  G.player.x = HOSPITAL.x; G.player.y = HOSPITAL.y;
  G.player.hp = 100;
  G.banner('WASTED', 2.6, `St. Marina patches you up for $${fine}.`);
  sfx.fail();
  G.saveGame();
}

// ---- cars: entering, exiting, stealing --------------------------------------
function exitCar(silent = false) {
  const car = G.player.car;
  if (!car) return;
  G.player.car = null;
  if (car.kind !== 'mission') car.kind = 'parked';
  car.hasDriver = false;
  const side = car.angle + Math.PI / 2;
  G.player.x = car.x + Math.cos(side) * 34;
  G.player.y = car.y + Math.sin(side) * 34;
  if (!silent) sfx.door();
  setEngine(false);
}

function enterCar(car) {
  const p = G.player;
  if (car.hasDriver && car.kind === 'traffic') {
    // Stealing an occupied car: the driver bails and raises the alarm.
    const driver = makePed(car.x + 20, car.y + 10, G.rng);
    driver.state = 'flee';
    G.peds.push(driver);
    G.setThreat(car.x, car.y);
    G.noteCrime('theft');
    sfx.alarm();
  } else if (car.kind === 'police') {
    G.noteCrime('theft');
  }
  car.hasDriver = false;
  p.car = car;
  p.x = car.x; p.y = car.y; p.angle = car.angle;
  sfx.door();
  initAudio();
}

// ---- spawning ------------------------------------------------------------------
function spawnTraffic(nearX, nearY, initial = false) {
  const pt = randomRoadPoint(G.rng, nearX, nearY, initial ? 0 : 520, initial ? 1500 : 860);
  const car = makeCar(pt.x, pt.y, 0, 'traffic', G.rng, {});
  G.cars.push(car);
}
function spawnParked(nearX, nearY) {
  const pt = randomRoadPoint(G.rng, nearX, nearY, 60, 900);
  const angle = Math.abs(pt.x - Math.round(pt.x)) < 1 ? Math.PI / 2 : 0;
  const car = makeCar(pt.x + G.rng.float(-16, 16), pt.y + G.rng.float(-16, 16), angle, 'parked', G.rng, {});
  car.hasDriver = false;
  G.cars.push(car);
}
function spawnPed(nearX, nearY) {
  const pt = randomRoadPoint(G.rng, nearX, nearY, 120, 640);
  const ped = makePed(pt.x + G.rng.float(-84, 84), pt.y + G.rng.float(-84, 84), G.rng);
  G.peds.push(ped);
}
function spawnPolice() {
  const p = G.player;
  const pt = randomRoadPoint(G.rng, p.x, p.y, 540, 780);
  const car = makeCar(pt.x, pt.y, 0, 'police', G.rng, {});
  car.hasDriver = true;
  G.cars.push(car);
}

function maintainPopulation(dt) {
  G.spawnT -= dt;
  const p = G.player;
  // Cull the far-away and the forgotten.
  G.cars = G.cars.filter((c) => {
    if (c === p.car || c.marked || c.kind === 'mission') return true;
    const d = dist(c.x, c.y, p.x, p.y);
    if (c.kind === 'police') return !(G.heat < 0.05 && d > 480) && d < 1250;
    return d < 1250;
  });
  G.peds = G.peds.filter((ped) => dist(ped.x, ped.y, p.x, p.y) < 1150);
  if (G.spawnT > 0) return;
  G.spawnT = 0.5;
  const traffic = G.cars.filter((c) => c.kind === 'traffic').length;
  const parked = G.cars.filter((c) => c.kind === 'parked' && !c.marked).length;
  if (traffic < TUNE.trafficCount) spawnTraffic(p.x, p.y);
  if (parked < 3) spawnParked(p.x, p.y);
  if (G.peds.length < TUNE.pedCount) spawnPed(p.x, p.y);
  // Police presence follows the wanted level.
  const police = G.cars.filter((c) => c.kind === 'police').length;
  const want = G.heat < 0.05 ? 0 : Math.min(2 + Math.ceil(G.heat), 6);
  if (police < want) spawnPolice();
}

// ---- wanted system ----------------------------------------------------------------
function updateWanted(dt) {
  G.lastSeen += dt;
  if (G.heat <= 0) { G.bustedT = 0; return; }
  const p = G.player;
  const atSafe = dist(p.x, p.y, SAFEHOUSE.x, SAFEHOUSE.y) < 95;
  if (G.lastSeen > TUNE.unseenDelay) {
    G.heat = Math.max(0, G.heat - (atSafe ? TUNE.heatDecaySafe : TUNE.heatDecay) * dt);
    if (G.heat === 0) G.banner('Heat lost', 1.6, 'The harbor forgets. For now.');
  }
  // Busted check: a cruiser on top of a slow or on-foot player.
  let nearCop = null, nd = Infinity;
  for (const c of G.cars) {
    if (c.kind !== 'police') continue;
    const d = dist(c.x, c.y, p.x, p.y);
    if (d < nd) { nd = d; nearCop = c; }
  }
  const slow = !p.car || Math.abs(p.car.speed) < 14;
  if (nearCop && nd < 56 && slow) {
    G.bustedT += dt;
    if (G.bustedT > TUNE.bustedTime) { busted(); return; }
  } else {
    G.bustedT = Math.max(0, G.bustedT - dt * 1.6);
  }
  setSiren(nearCop && nd < 620);
}

// ---- flow ---------------------------------------------------------------------------
function newGame() {
  G.cash = TUNE.startCash;
  G.missions = makeMissionState();
  G.heat = 0; G.lastSeen = 99; G.bustedT = 0;
  G.cars = G.cars.filter((c) => c.kind !== 'police' && !c.marked && c.kind !== 'mission');
  G.player = makePlayer(ANCHOR.x, ANCHOR.y + 16);
  G.tod = TUNE.startHour;
  G.mode = 'play';
  G.banner('VICE HARBOR', 2.8, 'Marla Vane is waiting at The Rusty Anchor.');
  try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  G.saveExists = false;
  initAudio(); sfx.click();
}

function continueGame() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!s) return;
    G.cash = s.cash; G.missions.idx = s.idx;
    G.player.x = s.x; G.player.y = s.y; G.player.hp = s.hp; G.tod = s.tod;
    G.mode = 'play';
    G.banner('Welcome back', 2, 'Your save is loaded.');
    initAudio();
  } catch { /* corrupt save: stay on title */ }
}

// ---- per-frame update ------------------------------------------------------------------
function update(dt) {
  G.time += dt;
  G.bannerT = Math.max(0, G.bannerT - dt);
  G.shake = Math.max(0, G.shake - dt * 13);
  for (const t of G.tracers) t.t -= dt;
  G.tracers = G.tracers.filter((t) => t.t > 0);
  for (const pt of G.particles) { pt.t -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.92; pt.vy *= 0.92; }
  G.particles = G.particles.filter((pt) => pt.t > 0);

  if (G.mode === 'title') {
    // Slow sunset pan over downtown behind the title.
    G.tod = 18.35;
    G.cam.x = clamp(1500 + Math.sin(G.time * 0.05) * 420 - 640, 0, WORLD.w - 1280);
    G.cam.y = clamp(1050 + Math.cos(G.time * 0.037) * 260 - 400, 0, WORLD.h - 800);
    for (const c of G.cars) if (c.kind === 'traffic') updateTrafficCar(G, c, dt);
    for (const ped of G.peds) updatePed(G, ped, dt);
    maintainPopulation(dt);
    if (input.pressed.has('Enter')) newGame();
    else if (input.pressed.has('KeyC') && G.saveExists) continueGame();
    return;
  }

  if (input.pressed.has('KeyP') || input.pressed.has('Escape')) {
    if (G.mode === 'play') { G.mode = 'pause'; G.saveGame(); setEngine(false); setSiren(false); }
    else if (G.mode === 'pause') G.mode = 'play';
    return;
  }
  if (G.mode === 'pause') {
    if (input.pressed.has('Enter')) newGame();
    return;
  }

  // Play mode.
  G.tod = (G.tod + dt * 24 / TUNE.dayLength) % 24;
  const p = G.player;

  if (p.car) {
    updatePlayerDriving(G, dt);
    setEngine(true, Math.abs(p.car.speed) / p.car.maxSpeed);
  } else {
    updatePlayerOnFoot(G, dt);
    setEngine(false);
  }

  // Interact: enter/exit cars, talk to Marla.
  G.prompt = null;
  if (!p.car) {
    let nearest = null, nd = TUNE.enterRange;
    for (const c of G.cars) { const d = dist(c.x, c.y, p.x, p.y); if (d < nd) { nd = d; nearest = c; } }
    const atAnchor = dist(p.x, p.y, ANCHOR.x, ANCHOR.y) < 62;
    if (atAnchor && !G.missions.active) G.prompt = 'E — Talk to Marla Vane';
    else if (nearest) G.prompt = nearest.hasDriver && nearest.kind === 'traffic' ? 'E — Steal car' : 'E — Enter car';
    else if (dist(p.x, p.y, SAFEHOUSE.x, SAFEHOUSE.y) < 95 && G.heat > 0) G.prompt = 'Safehouse — lay low to lose the heat';
    if (input.pressed.has('KeyE')) {
      if (atAnchor && !G.missions.active) startMission(G);
      else if (nearest) enterCar(nearest);
    }
  } else if (Math.abs(p.car.speed) < 150) {
    G.prompt = 'E — Exit car';
    if (input.pressed.has('KeyE')) exitCar();
  }

  for (const c of G.cars) {
    if (c === p.car) continue;
    if (c.kind === 'traffic') updateTrafficCar(G, c, dt);
    else if (c.kind === 'police') updatePoliceCar(G, c, dt);
    else if (c.kind === 'mission') { driveRival(G, c, dt); driveCar(G, c, dt, c._throttle || 0, c._steer || 0); }
  }
  carCarCollisions(G, dt);
  for (const ped of G.peds) updatePed(G, ped, dt);
  maintainPopulation(dt);
  updateWanted(dt);
  updateMissions(G, dt);

  // Camera follows the player (car when driving).
  const tx = clamp(p.x - 640, 0, WORLD.w - 1280);
  const ty = clamp(p.y - 400, 0, WORLD.h - 800);
  G.cam.x += (tx - G.cam.x) * Math.min(1, dt * 5.2);
  G.cam.y += (ty - G.cam.y) * Math.min(1, dt * 5.2);
}

// ---- boot ------------------------------------------------------------------------------
attachInput(canvas);
canvas.addEventListener('mousedown', initAudio);
window.addEventListener('keydown', initAudio, { once: true });

// Ambient life for the title backdrop and first frame.
for (let i = 0; i < 9; i++) spawnTraffic(1900, 1100, true);
for (let i = 0; i < TUNE.parkedCount; i++) spawnParked(1900, 1100);
for (let i = 0; i < 12; i++) spawnPed(1900, 1100);

if (shotName) applyShot(G, shotName);

// Test/debug handle (used by the headless playtest).
window.VH = { G, newGame, continueGame, startMission };

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render(G, ctx);
  endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
