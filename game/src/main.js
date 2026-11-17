// Vice Harbor — the game itself: state, the loop, the player on foot and
// behind the wheel, gunfire and fists, the wanted system with its busts,
// collisions, cash pickups, saving, and the title/pause/end screens' logic.
// Rendering lives in render.js; the city in world.js; the crowds in
// entities.js; the story in missions.js.

import {
  VIEW_W, VIEW_H, WORLD_W, WORLD_H, START_TIME, DAY_SECONDS,
  SAFEHOUSE, FIXER_BAR, HOSPITAL, SAVE_KEY,
  PLAYER_RADIUS, WALK_SPEED, RUN_SPEED, PLAYER_MAX_HEALTH,
  CAR_RADIUS, CAR_ACCEL, CAR_MAX_SPEED, CAR_MAX_REVERSE, CAR_TURN,
  TRAFFIC_COUNT, PARKED_COUNT, PED_COUNT,
  HEAT_FOR_STAR, HEAT_MAX, HEAT_DECAY_UNSEEN, HEAT_DECAY_SAFEHOUSE, UNSEEN_TO_DECAY,
  SIGHT_RANGE, POLICE_SPAWN_DIST, GUN_RANGE, GUN_COOLDOWN, PUNCH_RANGE,
} from './config.js';
import { Rng } from './random.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { buildCity, resolveCircle, segmentBlocked, randomSidewalkPoint } from './world.js';
import {
  spawnTraffic, spawnParked, spawnPedestrians, spawnPoliceCar,
  updateTrafficCar, updatePoliceCar, updatePedestrian,
  scarePedestrian, knockDownPedestrian, nextWaypoint, wrapAngle,
} from './entities.js';
import { newMissionState, tryStartMission, updateMissions, failMission, currentObjective } from './missions.js';
import { Renderer } from './render.js';
import { stageScene } from './shots.js';

const canvas = document.getElementById('game');
const input = new Input(canvas);
const snd = new SoundBank();
const renderer = new Renderer(canvas);

['keydown', 'mousedown'].forEach((ev) => window.addEventListener(ev, () => snd.unlock()));

// ------------------------------------------------------------------ state

function starsForHeat(heat) {
  let s = 0;
  for (let i = 1; i <= 5; i++) if (heat >= HEAT_FOR_STAR[i]) s = i;
  return s;
}

function createState(seed) {
  const rng = new Rng(seed);
  const city = buildCity(rng);
  const state = {
    city, rng,
    time: 0, timeOfDay: START_TIME, screen: 'title',
    cars: [], peds: [], police: [], particles: [], tracers: [], pickups: [],
    player: {
      x: SAFEHOUSE.x, y: SAFEHOUSE.y + 38, angle: -Math.PI / 2,
      vx: 0, vy: 0, speed: 0, health: PLAYER_MAX_HEALTH, cash: 0,
      car: null, moving: false, aiming: false, aimAngle: 0, lastDamageT: -99,
    },
    wanted: { heat: 0, stars: 0, lastSeen: 99, seenNow: false, bust: 0, flashT: 0 },
    camera: { x: SAFEHOUSE.x, y: SAFEHOUSE.y, zoom: 1.12, shake: 0 },
    mission: newMissionState(),
    prompt: null, playT: 0, gunT: 0, punchT: 0,
    spawnT: 0, autosaveT: 0, smokeT: 0, pickupT: 8,
    titleSel: 0, menuItems: [], hasSave: false, showHelp: false,
    shotMode: false, skipDialogue: false, saveToast: 0, respawnAt: SAFEHOUSE,
    // Hooks the other modules call back through.
    sfx: (name, arg) => playSfx(name, arg),
    addHeat: (amount) => addHeat(state, amount),
    saveGame: () => saveGame(state),
  };
  state.cars = [...spawnTraffic(city, rng, TRAFFIC_COUNT), ...spawnParked(city, rng, PARKED_COUNT)];
  state.peds = spawnPedestrians(city, rng, PED_COUNT);
  return state;
}

function playSfx(name, arg) {
  if (name === 'gun') snd.gunshot();
  else if (name === 'punch') snd.punch();
  else if (name === 'crash') snd.crash(arg ?? 0.3);
  else if (name === 'pickup') snd.pickup();
  else if (name === 'cash') snd.cashReward();
  else if (name === 'fail') snd.missionFail();
}

/** Crimes feed the wanted level: heat in, stars out, a flash when one lands. */
function addHeat(state, amount) {
  const w = state.wanted;
  const before = w.stars;
  w.heat = Math.min(HEAT_MAX, w.heat + amount);
  w.stars = starsForHeat(w.heat);
  if (w.stars > before) w.flashT = 0.7;
}

// ------------------------------------------------------------------ saving

function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveGame(state) {
  if (state.shotMode) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.player.cash,
      health: Math.max(30, Math.round(state.player.health)),
      nextIndex: state.mission.nextIndex,
      storyDone: state.mission.storyDone,
      x: Math.round(state.player.x),
      y: Math.round(state.player.y),
      timeOfDay: state.timeOfDay,
    }));
    state.hasSave = true;
  } catch { /* storage unavailable: the game simply plays unsaved */ }
}

function applySave(state, data) {
  if (!data) return;
  state.player.cash = data.cash ?? 0;
  state.player.health = Math.min(100, Math.max(30, data.health ?? 100));
  state.mission.nextIndex = data.nextIndex ?? 0;
  state.mission.storyDone = !!data.storyDone;
  const [x, y] = resolveCircle(state.city, data.x ?? SAFEHOUSE.x, data.y ?? SAFEHOUSE.y, PLAYER_RADIUS);
  state.player.x = x;
  state.player.y = y;
  state.timeOfDay = data.timeOfDay ?? START_TIME;
}

// ------------------------------------------------------------------ helpers

function mouseWorld(state) {
  const cam = state.camera;
  return {
    x: cam.x + (input.mouseX - VIEW_W / 2) / cam.zoom,
    y: cam.y + (input.mouseY - VIEW_H / 2) / cam.zoom,
  };
}

function burst(state, x, y, kind, n, color, speed = 130) {
  for (let i = 0; i < n; i++) {
    const a = state.rng.range(0, Math.PI * 2);
    const v = state.rng.range(speed * 0.3, speed);
    state.particles.push({
      kind, x, y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: state.rng.range(0.3, 0.8), max: 0.8,
      size: state.rng.range(1.6, 3.6), color,
    });
  }
}

function damageCar(state, car, amount) {
  if (car.wrecked) return;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.wrecked = true;
    car.speed = 0;
    burst(state, car.x, car.y, 'smoke', 10, '#555');
    if (car === state.player.car) damagePlayer(state, 6);
  }
}

function damagePlayer(state, amount) {
  const p = state.player;
  if (state.screen !== 'playing' || amount <= 0) return;
  p.health -= amount;
  p.lastDamageT = state.time;
  state.camera.shake = Math.min(9, state.camera.shake + amount * 0.22);
  if (p.health <= 0) {
    p.health = 0;
    doWasted(state);
  }
}

// ------------------------------------------------------------------ the law

function doBusted(state) {
  const p = state.player;
  state.screen = 'busted';
  state.respawnAt = SAFEHOUSE;
  if (state.mission.active) failMission(state, 'Busted mid-job. Marla hates paperwork.');
  const fine = Math.min(p.cash, 150 + state.wanted.stars * 40);
  p.cash -= fine;
  if (p.car) {
    // Impounded: a car that belongs to the world is struck from it.
    state.cars = state.cars.filter((c) => c !== p.car);
    p.car = null;
  }
  state.wanted.heat = 0;
  state.wanted.stars = 0;
  state.wanted.bust = 0;
  state.police = [];
  snd.missionFail();
  snd.engine(0, false);
  snd.siren(false);
}

function doWasted(state) {
  const p = state.player;
  state.screen = 'wasted';
  state.respawnAt = HOSPITAL;
  if (state.mission.active) failMission(state, 'You got put down mid-job.');
  p.cash = Math.max(0, p.cash - Math.min(p.cash, 200));
  if (p.car && !state.cars.includes(p.car)) p.car = null;
  else if (p.car) p.car = null; // you wake up; the car stays where it fell
  state.wanted.heat = 0;
  state.wanted.stars = 0;
  state.wanted.bust = 0;
  state.police = [];
  snd.engine(0, false);
  snd.siren(false);
}

function respawn(state) {
  const p = state.player;
  const spot = state.respawnAt ?? SAFEHOUSE;
  const [x, y] = resolveCircle(state.city, spot.x, spot.y + 18, PLAYER_RADIUS);
  p.x = x;
  p.y = y;
  p.health = PLAYER_MAX_HEALTH;
  p.car = null;
  state.screen = 'playing';
  saveGame(state);
}

function updateWanted(state, dt) {
  const w = state.wanted;
  const p = state.player;
  w.flashT = Math.max(0, w.flashT - dt);
  state.spawnT -= dt;
  // Reinforcements arrive while the stars burn.
  if (w.stars > state.police.length && state.spawnT <= 0) {
    state.police.push(spawnPoliceCar(state.city, state.rng, p));
    state.spawnT = 1.5;
  }
  if (w.stars === 0) {
    // Nobody is looking anymore: nearby units drift off and vanish.
    state.police = state.police.filter((cop) => Math.hypot(cop.x - p.x, cop.y - p.y) < 720);
  }
  // Sight: any officer with a clear line to the player?
  w.seenNow = false;
  let nearest = Infinity;
  for (const cop of state.police) {
    const d = Math.hypot(cop.x - p.x, cop.y - p.y);
    nearest = Math.min(nearest, d);
    if (d < SIGHT_RANGE && !segmentBlocked(state.city, cop.x, cop.y, p.x, p.y)) w.seenNow = true;
  }
  if (w.seenNow) w.lastSeen = 0;
  else w.lastSeen += dt;
  if (w.lastSeen > UNSEEN_TO_DECAY && w.heat > 0) {
    const atSafe = Math.hypot(p.x - SAFEHOUSE.x, p.y - SAFEHOUSE.y) < 90;
    const rate = atSafe ? HEAT_DECAY_SAFEHOUSE : HEAT_DECAY_UNSEEN;
    w.heat = Math.max(0, w.heat - rate * dt);
    w.stars = starsForHeat(w.heat);
  }
  // The collar: close police and a slow or foot-bound player.
  if (w.stars > 0 && nearest < 58) {
    const rate = p.car ? (Math.abs(p.car.speed) < 26 ? 0.42 : 0) : 0.85;
    w.bust = Math.min(1, w.bust + rate * dt);
  } else {
    w.bust = Math.max(0, w.bust - 0.8 * dt);
  }
  if (w.bust >= 1) doBusted(state);
  void POLICE_SPAWN_DIST;
}

// ------------------------------------------------------------------ the player

function enterCar(state, car) {
  const p = state.player;
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  if (car.missionTarget) {
    addHeat(state, 26); // Marla's coupe has an alarm, of course
    burst(state, car.x, car.y, 'spark', 6, '#ffd94a', 90);
  } else if (car.kind === 'parked') {
    addHeat(state, 16);
  } else if (car.kind === 'traffic') {
    addHeat(state, 30); // a carjacking, witnessed by the whole street
    scareNearby(state, car.x, car.y, 170);
  }
  snd.pickup();
}

function exitCar(state) {
  const p = state.player;
  const car = p.car;
  if (!car) return;
  const side = state.rng.sign();
  for (const [ox, oy] of [[-Math.sin(car.angle) * side, Math.cos(car.angle) * side], [Math.sin(car.angle) * side, -Math.cos(car.angle) * side]]) {
    const tx = car.x + ox * (CAR_RADIUS + PLAYER_RADIUS + 5);
    const ty = car.y + oy * (CAR_RADIUS + PLAYER_RADIUS + 5);
    const [rx, ry, hit] = resolveCircle(state.city, tx, ty, PLAYER_RADIUS);
    if (!hit) {
      p.x = rx;
      p.y = ry;
      break;
    }
    p.x = rx;
    p.y = ry;
  }
  p.car = null;
  if (car.kind === 'traffic' && !car.wrecked) nextWaypoint(state.city, car, state.rng, false);
  snd.engine(0, false);
}

function scareNearby(state, x, y, radius) {
  for (const ped of state.peds) {
    if (Math.hypot(ped.x - x, ped.y - y) < radius) scarePedestrian(ped, x, y);
  }
}

function shoot(state) {
  const p = state.player;
  state.gunT = GUN_COOLDOWN;
  const a = p.aimAngle;
  const ox = p.x + Math.cos(a) * 14;
  const oy = p.y + Math.sin(a) * 14;
  let hx = ox + Math.cos(a) * GUN_RANGE;
  let hy = oy + Math.sin(a) * GUN_RANGE;
  let hitSomething = false;
  // Step the bullet: first solid, car or pedestrian along the line wins.
  for (let d = 10; d < GUN_RANGE; d += 7) {
    const x = ox + Math.cos(a) * d;
    const y = oy + Math.sin(a) * d;
    let struck = false;
    for (const ped of state.peds) {
      if (ped.state !== 'down' && Math.hypot(ped.x - x, ped.y - y) < 10) {
        knockDownPedestrian(ped);
        burst(state, ped.x, ped.y, 'dot', 7, '#c23b2e', 80);
        addHeat(state, 42);
        struck = true;
        break;
      }
    }
    if (!struck) {
      for (const car of [...state.cars, ...state.police]) {
        if (Math.hypot(car.x - x, car.y - y) < CAR_RADIUS + 3) {
          damageCar(state, car, 13);
          burst(state, x, y, 'spark', 6, '#ffd94a', 120);
          addHeat(state, 20);
          struck = true;
          break;
        }
      }
    }
    if (!struck && state.city.solids.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)) {
      burst(state, x, y, 'spark', 4, '#ffe9a8', 90);
      struck = true;
    }
    if (struck) {
      hx = x;
      hy = y;
      hitSomething = true;
      break;
    }
  }
  state.tracers.push({ x1: ox, y1: oy, x2: hx, y2: hy, life: 0.09, max: 0.09 });
  burst(state, ox, oy, 'flash', 2, '#ffe9a8', 30);
  addHeat(state, 13); // gunfire carries across the water
  scareNearby(state, p.x, p.y, 200);
  state.camera.shake = Math.min(6, state.camera.shake + 1.4);
  snd.gunshot();
  void hitSomething;
}

function punch(state) {
  const p = state.player;
  state.punchT = 0.38;
  const fx = p.x + Math.cos(p.angle) * (PUNCH_RANGE - 6);
  const fy = p.y + Math.sin(p.angle) * (PUNCH_RANGE - 6);
  for (const ped of state.peds) {
    if (ped.state !== 'down' && Math.hypot(ped.x - fx, ped.y - fy) < 20) {
      knockDownPedestrian(ped);
      burst(state, ped.x, ped.y, 'dot', 5, '#e8e0cc', 70);
      addHeat(state, 15);
      snd.punch();
      scareNearby(state, p.x, p.y, 120);
      return;
    }
  }
  for (const car of [...state.cars, ...state.police]) {
    if (Math.hypot(car.x - fx, car.y - fy) < CAR_RADIUS + 10) {
      damageCar(state, car, 3);
      burst(state, fx, fy, 'spark', 4, '#ffd94a', 90);
      snd.crash(0.12);
      return;
    }
  }
  snd.punch();
}

function interact(state) {
  const p = state.player;
  // A car first: the nearest stealable one in arm's reach.
  let best = null;
  let bestD = 48;
  for (const car of [...state.cars, ...state.police]) {
    if (car.wrecked) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  if (best) {
    enterCar(state, best);
    return;
  }
  if (Math.hypot(p.x - FIXER_BAR.x, p.y - FIXER_BAR.y) < 58) {
    tryStartMission(state);
    return;
  }
  if (Math.hypot(p.x - HOSPITAL.x, p.y - HOSPITAL.y) < 54 && p.health < PLAYER_MAX_HEALTH) {
    const cost = Math.min(p.cash, 40);
    p.cash -= cost;
    p.health = PLAYER_MAX_HEALTH;
    snd.pickup();
  }
}

function updatePlayer(state, dt) {
  const p = state.player;
  const prevX = p.x;
  const prevY = p.y;
  if (p.car) {
    const car = p.car;
    if (!car.wrecked) {
      const throttle = input.throttleAxis();
      const steer = input.steerAxis();
      if (throttle > 0) car.speed += CAR_ACCEL * dt * (car.speed < 0 ? 2.4 : 1);
      else if (throttle < 0) car.speed -= (car.speed > 12 ? 520 : CAR_ACCEL * 0.72) * dt;
      else car.speed -= car.speed * 0.6 * dt;
      if (input.down('Space')) car.speed -= car.speed * 2.6 * dt;
      car.speed = Math.max(-CAR_MAX_REVERSE, Math.min(CAR_MAX_SPEED, car.speed));
      const grip = Math.min(1, Math.abs(car.speed) / 110) * (car.speed < 0 ? -1 : 1);
      car.angle += steer * CAR_TURN * grip * dt * (Math.abs(car.speed) > 250 ? 0.78 : 1);
    }
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const [rx, ry, hit] = resolveCircle(state.city, nx, ny, CAR_RADIUS);
    if (hit) {
      const impact = Math.abs(car.speed);
      if (impact > 95) {
        damageCar(state, car, (impact - 95) * 0.085);
        if (impact > 170) damagePlayer(state, (impact - 170) * 0.05);
        burst(state, rx, ry, 'spark', 8, '#ffd94a', 150);
        snd.crash(Math.min(0.6, impact / 480));
        state.camera.shake = Math.min(10, state.camera.shake + impact * 0.02);
      }
      car.speed = impact > 60 ? car.speed * -0.22 : 0;
    }
    car.x = rx;
    car.y = ry;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.speed = car.speed;
    if (input.tapped('KeyE')) exitCar(state);
  } else {
    const mx = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);
    const my = (input.down('KeyS', 'ArrowDown') ? 1 : 0) - (input.down('KeyW', 'ArrowUp') ? 1 : 0);
    const len = Math.hypot(mx, my);
    p.moving = len > 0;
    const speed = input.down('ShiftLeft', 'ShiftRight') ? RUN_SPEED : WALK_SPEED;
    if (len > 0) {
      const vx = (mx / len) * speed;
      const vy = (my / len) * speed;
      const [rx, ry] = resolveCircle(state.city, p.x + vx * dt, p.y + vy * dt, PLAYER_RADIUS);
      p.x = rx;
      p.y = ry;
      if (!p.aiming) p.angle = Math.atan2(vy, vx);
    }
    p.speed = len > 0 ? speed : 0;
    // Aim with the mouse; click to shoot; F to punch.
    const mw = mouseWorld(state);
    p.aimAngle = Math.atan2(mw.y - p.y, mw.x - p.x);
    p.aiming = input.mouseDown || state.gunT > GUN_COOLDOWN * 0.5;
    if (p.aiming) p.angle = p.aimAngle;
    state.gunT -= dt;
    if (input.mouseDown && state.gunT <= 0 && state.mission.dialogue.length === 0) shoot(state);
    state.punchT -= dt;
    if (input.tapped('KeyF') && state.punchT <= 0) punch(state);
    if (input.tapped('KeyE') && state.mission.dialogue.length === 0) interact(state);
  }
  p.vx = dt > 0 ? (p.x - prevX) / dt : 0;
  p.vy = dt > 0 ? (p.y - prevY) / dt : 0;
  // Slow recovery once the street goes quiet.
  if (state.time - p.lastDamageT > 6 && p.health > 0) {
    p.health = Math.min(PLAYER_MAX_HEALTH, p.health + 5 * dt);
  }
}

// ------------------------------------------------------------------ collisions & crowds

function updateCarCollisions(state, dt) {
  const all = new Set([...state.cars, ...state.police]);
  if (state.player.car) all.add(state.player.car);
  const list = [...all];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      // Oriented test: cars are long, not round — a radial check would make
      // every lane graze the kerb-parked cars. Bumpers meet under 33 px
      // lengthwise and 21 px across, tested in both cars' frames.
      const inFrame = (car) => {
        const hx = Math.cos(car.angle);
        const hy = Math.sin(car.angle);
        return Math.abs(dx * hx + dy * hy) < 33 && Math.abs(dx * -hy + dy * hx) < 20;
      };
      const min = CAR_RADIUS * 2 - 3;
      if (d === 0 || d >= min || (!inFrame(a) && !inFrame(b))) continue;
      const rel = Math.abs(a.speed - b.speed) + Math.abs(a.speed) * 0.2;
      const push = (min - d) / 2;
      const ux = dx / d;
      const uy = dy / d;
      const [ax, ay] = resolveCircle(state.city, a.x - ux * push, a.y - uy * push, CAR_RADIUS);
      const [bx, by] = resolveCircle(state.city, b.x + ux * push, b.y + uy * push, CAR_RADIUS);
      a.x = ax; a.y = ay;
      b.x = bx; b.y = by;
      const swap = (a.speed + b.speed) / 2;
      if (Math.abs(a.speed) > 30 || Math.abs(b.speed) > 30) {
        a.speed = swap * 0.7;
        b.speed = swap * 0.7;
      }
      if (rel > 130) {
        const dmg = (rel - 130) * 0.055;
        damageCar(state, a, dmg);
        damageCar(state, b, dmg);
        burst(state, (a.x + b.x) / 2, (a.y + b.y) / 2, 'spark', 7, '#ffd94a', 140);
        const involvesPlayer = a === state.player.car || b === state.player.car;
        if (involvesPlayer) {
          snd.crash(0.45);
          state.camera.shake = Math.min(10, state.camera.shake + 3);
          if ((a.kind === 'police' || b.kind === 'police')) addHeat(state, 24);
          else addHeat(state, 9);
        } else if (Math.hypot(a.x - state.player.x, a.y - state.player.y) < 380) {
          snd.crash(0.2);
        }
      }
    }
  }
  void dt;
}

function updatePedStrikes(state) {
  const p = state.player;
  const runners = [...state.cars, ...state.police];
  if (p.car) runners.push(p.car);
  for (const car of runners) {
    if (Math.abs(car.speed) < 52) continue;
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < CAR_RADIUS + 7) {
        knockDownPedestrian(ped);
        burst(state, ped.x, ped.y, 'dot', 6, '#e8e0cc', 80);
        if (car === p.car || car === state.player.car) {
          addHeat(state, 34);
          damageCar(state, car, 2);
          snd.crash(0.3);
          state.camera.shake = Math.min(9, state.camera.shake + 2.4);
        }
      }
    }
  }
  // The player on foot can be run down too.
  if (!p.car) {
    for (const car of runners) {
      if (Math.abs(car.speed) > 60 && Math.hypot(p.x - car.x, p.y - car.y) < CAR_RADIUS + PLAYER_RADIUS) {
        damagePlayer(state, Math.abs(car.speed) * 0.055);
        const away = Math.atan2(p.y - car.y, p.x - car.x);
        const [rx, ry] = resolveCircle(state.city, p.x + Math.cos(away) * 26, p.y + Math.sin(away) * 26, PLAYER_RADIUS);
        p.x = rx;
        p.y = ry;
        snd.crash(0.4);
        break;
      }
    }
  }
}

function updateParticles(state, dt) {
  for (const fx of state.particles) {
    fx.life -= dt;
    fx.x += fx.vx * dt;
    fx.y += fx.vy * dt;
    if (fx.kind === 'spark') fx.vy += 320 * dt;
    if (fx.kind === 'smoke') fx.vy -= 26 * dt;
    if (fx.kind === 'cash') fx.vy = -46;
  }
  state.particles = state.particles.filter((fx) => fx.life > 0);
  for (const t of state.tracers) t.life -= dt;
  state.tracers = state.tracers.filter((t) => t.life > 0);
  // Wrecks and dying engines smoke.
  state.smokeT -= dt;
  if (state.smokeT <= 0) {
    state.smokeT = 0.14;
    for (const car of [...state.cars, ...state.police]) {
      if (car.wrecked || car.health < 32) {
        state.particles.push({ kind: 'smoke', x: car.x, y: car.y - 6, vx: state.rng.range(-8, 8), vy: -30, life: 0.9, max: 0.9, size: state.rng.range(5, 9), color: '#555' });
      }
    }
  }
}

function updatePickups(state, dt) {
  state.pickupT -= dt;
  if (state.pickupT <= 0) {
    state.pickupT = state.rng.range(16, 30);
    if (state.pickups.length < 3) {
      const spot = randomSidewalkPoint(state.city, state.rng);
      state.pickups.push({ x: spot.x, y: spot.y, value: state.rng.int(3, 8) * 10 });
    }
  }
  const p = state.player;
  state.pickups = state.pickups.filter((pk) => {
    if (Math.hypot(pk.x - p.x, pk.y - p.y) < 30) {
      p.cash += pk.value;
      burst(state, pk.x, pk.y, 'cash', 4, '#7dff8a', 40);
      snd.pickup();
      return false;
    }
    return true;
  });
}

function updatePrompts(state) {
  const p = state.player;
  state.prompt = null;
  if (state.screen !== 'playing' || state.mission.dialogue.length > 0) return;
  if (p.car) {
    if (p.car.wrecked) state.prompt = 'E — Get out of the wreck';
    return;
  }
  let bestD = 48;
  for (const car of [...state.cars, ...state.police]) {
    if (car.wrecked) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) bestD = d;
  }
  if (bestD < 48) {
    state.prompt = 'E — Steal this car';
    return;
  }
  if (state.mission.nextIndex < 5 && !state.mission.active && Math.hypot(p.x - FIXER_BAR.x, p.y - FIXER_BAR.y) < 58) {
    state.prompt = 'E — Talk to Marla Vane';
    return;
  }
  if (Math.hypot(p.x - HOSPITAL.x, p.y - HOSPITAL.y) < 54 && p.health < PLAYER_MAX_HEALTH) {
    state.prompt = 'E — Get patched up ($40)';
  }
}

function updateCamera(state, dt) {
  const cam = state.camera;
  const p = state.player;
  const lead = p.car ? 0.34 : 0.12;
  const tx = p.x + p.vx * lead;
  const ty = p.y + p.vy * lead;
  const k = Math.min(1, dt * 5.2);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  const targetZoom = p.car ? (Math.abs(p.car.speed) > 230 ? 0.9 : 1.0) : 1.12;
  cam.zoom += (targetZoom - cam.zoom) * Math.min(1, dt * 2.4);
  cam.x = Math.max(240, Math.min(WORLD_W - 240, cam.x));
  cam.y = Math.max(200, Math.min(WORLD_H - 200, cam.y));
  cam.shake = Math.max(0, cam.shake - dt * 30);
}

function updateAudio(state) {
  const p = state.player;
  if (p.car && state.screen === 'playing') {
    snd.engine(Math.abs(p.car.speed) / CAR_MAX_SPEED, true);
  } else {
    snd.engine(0, false);
  }
  let nearestCop = Infinity;
  for (const cop of state.police) nearestCop = Math.min(nearestCop, Math.hypot(cop.x - p.x, cop.y - p.y));
  snd.siren(state.wanted.stars > 0 && nearestCop < 540 && state.screen === 'playing');
}

// ------------------------------------------------------------------ screens & loop

function refreshMenu(state) {
  const items = [{ id: 'new', label: 'NEW GAME' }];
  if (state.hasSave) items.push({ id: 'continue', label: 'CONTINUE' });
  items.push({ id: 'help', label: 'HOW TO PLAY' });
  state.menuItems = items;
  state.titleSel = Math.min(state.titleSel, items.length - 1);
}

function startGame(state, fromSave) {
  if (fromSave) applySave(state, readSave());
  state.screen = 'playing';
  snd.unlock();
}

function updateTitle(state) {
  if (state.showHelp) {
    if (input.tapped('Enter', 'Escape')) state.showHelp = false;
    return;
  }
  if (input.tapped('ArrowUp', 'KeyW')) state.titleSel = (state.titleSel + state.menuItems.length - 1) % state.menuItems.length;
  if (input.tapped('ArrowDown', 'KeyS')) state.titleSel = (state.titleSel + 1) % state.menuItems.length;
  if (input.tapped('Enter')) {
    const item = state.menuItems[state.titleSel];
    if (item.id === 'help') state.showHelp = true;
    else startGame(state, item.id === 'continue');
  }
}

function updatePaused(state) {
  state.saveToast = Math.max(0, state.saveToast - 0.016);
  if (input.tapped('KeyS')) {
    saveGame(state);
    state.saveToast = 2;
  }
  if (input.tapped('Enter', 'KeyP', 'Escape')) state.screen = 'playing';
}

function updateEndScreen(state) {
  if (input.tapped('Enter')) respawn(state);
}

function update(state, dt) {
  state.playT += dt;
  state.timeOfDay = (state.timeOfDay + dt / DAY_SECONDS) % 1;
  // Talking comes first: E or a click moves Marla along, and never steals a car.
  if ((input.tapped('KeyE') || input.clickedOnce) && state.mission.dialogue.length > 0) {
    state.skipDialogue = true;
  }
  updatePlayer(state, dt);
  for (const car of state.cars) {
    if (car.kind === 'traffic' && car !== state.player.car) {
      const impact = updateTrafficCar(state, car, dt);
      if (impact > 160) damageCar(state, car, (impact - 160) * 0.05);
    }
  }
  for (const cop of state.police) {
    const impact = state.wanted.stars > 0 ? updatePoliceCar(state, cop, dt) : updateTrafficCar(state, cop, dt);
    if (impact > 170) damageCar(state, cop, (impact - 170) * 0.05);
  }
  updateCarCollisions(state, dt);
  for (const ped of state.peds) updatePedestrian(state, ped, dt);
  updatePedStrikes(state);
  updateWanted(state, dt);
  if (state.screen === 'playing') updateMissions(state, dt);
  updateParticles(state, dt);
  updatePickups(state, dt);
  updatePrompts(state);
  updateCamera(state, dt);
  updateAudio(state);
  state.autosaveT += dt;
  if (state.autosaveT > 15) {
    state.autosaveT = 0;
    saveGame(state);
  }
  if (input.tapped('KeyM')) {
    snd.setMuted(!snd.muted);
  }
  if (input.tapped('KeyP', 'Escape') && state.screen === 'playing') {
    state.screen = 'paused';
    saveGame(state);
  }
}

// Boot: a ?shot=<scene> URL stages a frozen frame for the screenshots;
// anything else opens on the title screen.
const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') ?? 7) || 7;
const state = createState(seed);
window.__viceHarbor = state;
const shotName = params.get('shot');
if (shotName && stageScene(state, shotName)) {
  state.shotMode = true;
} else {
  state.hasSave = !!readSave();
  refreshMenu(state);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  state.time += dt;
  if (state.shotMode) {
    // Frozen scene: only the ambient animation (water, lights, banners) moves.
    if (!window.__shotReady && state.time > 0.5) window.__shotReady = true;
  } else if (state.screen === 'title') {
    updateTitle(state);
  } else if (state.screen === 'playing') {
    update(state, dt);
  } else if (state.screen === 'paused') {
    updatePaused(state);
  } else if (state.screen === 'busted' || state.screen === 'wasted') {
    updateEndScreen(state);
  }
  renderer.draw(state);
  input.endFrame();
}
requestAnimationFrame(frame);
