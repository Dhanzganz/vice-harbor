// Vice Harbor — player, cars and pedestrians: creation, physics and AI.
// Cars drive the intersection graph of the road grid (traffic picks random
// turns, police route toward the player then pursue directly), pedestrians
// wander the pavements and flee danger, and the player walks, punches,
// shoots and drives with shared car physics.

import { TUNE, CAR_COLORS, PED_COLORS, PED_SHIRTS, ROADS_X, ROADS_Y, LANE } from './config.js';
import { clamp, angDiff, dist } from './random.js';
import { collideCircle, circleHitsBuilding, hasLOS } from './world.js';
import { input, axisX, axisY, running } from './input.js';
import { sfx } from './audio.js';

let nextId = 1;

export function makePlayer(x, y) {
  return { x, y, angle: -Math.PI / 2, hp: TUNE.playerHealth, car: null, punchCd: 0, gunCd: 0, walk: 0, radius: TUNE.playerRadius };
}

export function makeCar(x, y, angle, kind, rng, opts = {}) {
  return {
    id: nextId++, x, y, angle, speed: 0, kind,
    color: opts.color || (kind === 'police' ? '#e8e8ec' : rng.pick(CAR_COLORS)),
    maxSpeed: opts.maxSpeed || (kind === 'police' ? 342 : rng.float(215, 265)),
    accel: kind === 'police' ? 215 : 165,
    health: 100, dead: false, hasDriver: kind === 'traffic',
    node: null, nextNode: null, repath: 0, stuck: 0, honk: 0,
    marked: !!opts.marked, smoke: 0,
  };
}

export function makePed(x, y, rng) {
  return {
    id: nextId++, x, y, angle: rng.float(0, Math.PI * 2), speed: 0,
    state: 'wander', tx: x, ty: y, wait: rng.float(0, 2),
    skin: rng.pick(PED_COLORS), shirt: rng.pick(PED_SHIRTS),
    downT: 0, walk: rng.float(0, 6), radius: 11,
  };
}

// ---- intersection graph -------------------------------------------------
export function nearestNode(x, y) {
  let bx = ROADS_X[0], by = ROADS_Y[0], bd = Infinity;
  for (const rx of ROADS_X) for (const ry of ROADS_Y) {
    const d = (x - rx) ** 2 + (y - ry) ** 2;
    if (d < bd) { bd = d; bx = rx; by = ry; }
  }
  return { x: bx, y: by };
}

function randomNeighbor(node, rng, avoidBack = null) {
  const opts = [];
  for (const rx of ROADS_X) if (rx !== node.x) opts.push({ x: rx, y: node.y });
  for (const ry of ROADS_Y) if (ry !== node.y) opts.push({ x: node.x, y: ry });
  const filtered = avoidBack ? opts.filter((o) => !(o.x === avoidBack.x && o.y === avoidBack.y)) : opts;
  return rng.pick(filtered.length ? filtered : opts);
}

// Next graph node on a Manhattan route from node toward (tx,ty).
function routeStep(node, tx, ty, rng) {
  const tn = nearestNode(tx, ty);
  if (node.x === tn.x && node.y === tn.y) return null;
  const options = [];
  if (node.x !== tn.x) options.push({ x: tn.x, y: node.y });
  if (node.y !== tn.y) options.push({ x: node.x, y: tn.y });
  // Prefer the axis with the longer remaining distance, with some jitter.
  options.sort((a, b) => (Math.abs(b.x - node.x) + Math.abs(b.y - node.y)) - (Math.abs(a.x - node.x) + Math.abs(a.y - node.y)));
  return rng.chance(0.8) ? options[0] : options[options.length - 1];
}

// ---- shared car physics ---------------------------------------------------
export function driveCar(G, car, dt, throttle, steer) {
  const deadFactor = car.dead ? 0 : 1;
  if (throttle > 0) car.speed += car.accel * throttle * deadFactor * dt;
  else if (throttle < 0) car.speed += (car.speed > 4 ? -320 : -90) * -throttle * dt;
  // Rolling drag + soft top speed.
  car.speed -= car.speed * 0.55 * dt;
  car.speed = clamp(car.speed, -95, car.maxSpeed * (0.45 + 0.55 * (car.health / 100)) * deadFactor || 0);
  if (car.dead) car.speed = Math.max(0, car.speed - 140 * dt);
  const steerAuthority = clamp(car.speed / 60, -1, 1);
  car.angle += steer * 1.9 * steerAuthority * dt * (car.speed < 0 ? -1 : 1);

  const px = car.x, py = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const fixed = collideCircle(car.x, car.y, 20);
  const impact = Math.hypot(fixed.x - car.x, fixed.y - car.y);
  car.x = fixed.x; car.y = fixed.y;
  if (impact > 1.6 && Math.abs(car.speed) > 105) {
    const dmg = (Math.abs(car.speed) - 95) / 11;
    damageCar(G, car, dmg);
    if (Math.abs(car.x - G.player.x) < 700 && Math.abs(car.y - G.player.y) < 500) sfx.crash(Math.abs(car.speed) > 220);
    if (car === G.player.car) { G.shake = Math.min(9, (Math.abs(car.speed) - 95) / 22); G.hurtPlayer(dmg * 0.35); }
    G.burst(car.x, car.y, 7, '#ffd98a');
    car.speed *= -0.22;
  } else if (impact > 0.5) {
    car.speed *= 0.82;
  }
  return Math.hypot(car.x - px, car.y - py);
}

export function damageCar(G, car, amt) {
  if (car.dead) return;
  car.health -= amt;
  if (car.health <= 0) {
    car.health = 0; car.dead = true;
    G.burst(car.x, car.y, 22, '#ff9a3f');
    if (car === G.player.car) G.banner('Your ride is wrecked!', 2.2);
  }
}

// Simple circle separation + scrape damage between cars.
export function carCarCollisions(G, dt) {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 44 * 44 || d2 < 0.01) continue;
      const d = Math.sqrt(d2), push = (44 - d) / 2;
      const nx = dx / d, ny = dy / d;
      const fa = collideCircle(a.x - nx * push, a.y - ny * push, 20);
      const fb = collideCircle(b.x + nx * push, b.y + ny * push, 20);
      a.x = fa.x; a.y = fa.y; b.x = fb.x; b.y = fb.y;
      const rel = Math.abs(a.speed - b.speed);
      if (rel > 60) {
        damageCar(G, a, rel / 16); damageCar(G, b, rel / 16);
        if (Math.abs(a.x - G.player.x) < 700) sfx.crash(rel > 170);
        if (a === G.player.car || b === G.player.car) {
          G.shake = Math.min(8, rel / 30);
          if (b.kind === 'police' || a.kind === 'police') G.noteCrime('ram');
        }
      }
      const avg = (a.speed + b.speed) / 2;
      a.speed = avg; b.speed = avg;
    }
  }
}

// ---- traffic & police AI ---------------------------------------------------
// Both drive the intersection graph node to node. Traffic picks a random
// neighbour at each node; police route Manhattan-style toward the player's
// nearest node and switch to direct pursuit inside 150px.
function laneTarget(car, node) {
  // Aim at the node, offset to the right-hand lane of the travel direction.
  const a = Math.atan2(node.y - car.y, node.x - car.x);
  return { x: node.x + Math.cos(a + Math.PI / 2) * LANE * 0.7, y: node.y + Math.sin(a + Math.PI / 2) * LANE * 0.7 };
}

function steerToward(G, car, tx, ty, dt, aggression = 1) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  const diff = angDiff(car.angle, want);
  const steer = clamp(diff * 2.1, -1, 1);
  let throttle = Math.abs(diff) > 2.2 ? -0.4 : 1;
  // Brake for a car directly ahead.
  const ax = car.x + Math.cos(car.angle) * 74, ay = car.y + Math.sin(car.angle) * 74;
  for (const o of G.cars) {
    if (o === car) continue;
    if ((o.x - ax) ** 2 + (o.y - ay) ** 2 < 36 * 36) { throttle = car.speed > 30 ? -0.7 : 0; break; }
  }
  // Slow near the target so arrivals do not orbit.
  const d = dist(car.x, car.y, tx, ty);
  if (d < 90 && car.kind === 'traffic') throttle = Math.min(throttle, 0.45);
  driveCar(G, car, dt, throttle * aggression, steer);
  return d;
}

export function updateTrafficCar(G, car, dt) {
  if (!car.nextNode) { car.node = nearestNode(car.x, car.y); car.nextNode = randomNeighbor(car.node, G.rng); }
  const t = laneTarget(car, car.nextNode);
  const d = steerToward(G, car, t.x, t.y, dt);
  if (d < 56) {
    const prev = car.node;
    car.node = car.nextNode;
    car.nextNode = randomNeighbor(car.node, G.rng, prev);
  }
  trackStuck(G, car, dt, () => { car.nextNode = randomNeighbor(car.node || nearestNode(car.x, car.y), G.rng); });
}

export function updatePoliceCar(G, car, dt) {
  const p = G.player;
  const tx = p.car ? p.car.x : p.x, ty = p.car ? p.car.y : p.y;
  const dP = dist(car.x, car.y, tx, ty);
  car.repath -= dt;
  if (dP < 150) {
    // Direct pursuit: aim at the player, predict a little when they drive.
    const lead = p.car ? 0.35 : 0;
    steerToward(G, car, tx + Math.cos(p.angle) * (p.car ? p.car.speed * lead : 0), ty + Math.sin(p.angle) * (p.car ? p.car.speed * lead : 0), dt, 1);
  } else {
    if (!car.nextNode || car.repath <= 0) {
      car.node = nearestNode(car.x, car.y);
      car.nextNode = routeStep(car.node, tx, ty, G.rng) || nearestNode(tx, ty);
      car.repath = 1.4;
    }
    const t = laneTarget(car, car.nextNode);
    const d = steerToward(G, car, t.x, t.y, dt, 1);
    if (d < 60) { car.node = car.nextNode; car.nextNode = routeStep(car.node, tx, ty, G.rng); }
  }
  trackStuck(G, car, dt, () => { car.nextNode = null; car.repath = 0; });
  // Spotting: refresh the player's "seen" timer when close with clear LOS.
  if (dP < 430 && hasLOS(car.x, car.y, tx, ty)) G.lastSeen = 0;
}

function trackStuck(G, car, dt, reset) {
  if (Math.abs(car.speed) < 6) { car.stuck += dt; if (car.stuck > 2.6) { car.stuck = 0; reset(); } }
  else car.stuck = 0;
}

// ---- pedestrians -------------------------------------------------------------
export function updatePed(G, ped, dt) {
  if (ped.state === 'down') {
    ped.downT -= dt;
    if (ped.downT <= 0) { ped.state = 'flee'; ped.wait = 0; }
    return;
  }
  const threat = G.threat;
  if (threat && G.time - threat.t < 2.2 && dist(ped.x, ped.y, threat.x, threat.y) < 240) ped.state = 'flee';
  let speed = 0;
  if (ped.state === 'flee') {
    const a = Math.atan2(ped.y - threat.y, ped.x - threat.x);
    ped.angle = a; speed = 208;
    if (!threat || G.time - threat.t > 2.6) ped.state = 'wander';
  } else {
    const d = dist(ped.x, ped.y, ped.tx, ped.ty);
    if (d < 12 || ped.wait > 0) {
      ped.wait -= dt;
      if (ped.wait <= -G.rng.float(0.5, 2.4)) {
        // New wander target: a nearby pavement-ish point, out of buildings.
        for (let i = 0; i < 8; i++) {
          const nx = ped.x + G.rng.float(-280, 280), ny = ped.y + G.rng.float(-280, 280);
          if (!circleHitsBuilding(nx, ny, 14)) { ped.tx = nx; ped.ty = ny; break; }
        }
        ped.wait = 0;
      }
    } else {
      ped.angle = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
      speed = 74;
    }
  }
  if (speed > 0) {
    ped.walk += dt * (speed / 16);
    const nx = ped.x + Math.cos(ped.angle) * speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * speed * dt;
    const fixed = collideCircle(nx, ny, ped.radius);
    ped.x = fixed.x; ped.y = fixed.y;
  }
}

export function knockDownPed(G, ped, crime = true) {
  if (ped.state === 'down') return;
  ped.state = 'down'; ped.downT = 6;
  G.burst(ped.x, ped.y, 5, '#e8e8e8');
  if (crime) G.noteCrime('assault');
}

// ---- the player ---------------------------------------------------------------
export function updatePlayerOnFoot(G, dt) {
  const p = G.player;
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.gunCd = Math.max(0, p.gunCd - dt);
  const ax = axisX(), ay = axisY();
  const moving = ax !== 0 || ay !== 0;
  // Face the mouse while the mouse is down (aiming), else face movement.
  const mwx = G.cam.x + input.mouseX, mwy = G.cam.y + input.mouseY;
  if (input.mouseDown) p.angle = Math.atan2(mwy - p.y, mwx - p.x);
  else if (moving) p.angle = Math.atan2(ay, ax);

  if (moving) {
    const sp = running() ? TUNE.runSpeed : TUNE.walkSpeed;
    const len = Math.hypot(ax, ay);
    const nx = p.x + (ax / len) * sp * dt, ny = p.y + (ay / len) * sp * dt;
    const fixed = collideCircle(nx, ny, p.radius);
    p.x = fixed.x; p.y = fixed.y;
    p.walk += dt * sp / 18;
  }

  if ((input.pressed.has('KeyF') || input.pressed.has('Space')) && p.punchCd <= 0) {
    p.punchCd = TUNE.punchCooldown;
    sfx.punch();
    const hx = p.x + Math.cos(p.angle) * TUNE.punchRange, hy = p.y + Math.sin(p.angle) * TUNE.punchRange;
    let hit = false;
    for (const ped of G.peds) if (dist(ped.x, ped.y, hx, hy) < 30) { knockDownPed(G, ped); hit = true; }
    for (const car of G.cars) if (dist(car.x, car.y, hx, hy) < 40) { damageCar(G, car, 3); G.burst(hx, hy, 3, '#ffd98a'); hit = true; }
    G.setThreat(p.x, p.y);
    if (hit) G.shake = Math.max(G.shake, 1.5);
  }

  if (input.mouseDown && p.gunCd <= 0) {
    p.gunCd = TUNE.gunCooldown;
    fireGun(G, mwx, mwy);
  }
}

function fireGun(G, tx, ty) {
  const p = G.player;
  const a = Math.atan2(ty - p.y, tx - p.x);
  p.angle = a;
  sfx.gun();
  G.shake = Math.max(G.shake, 1.2);
  G.setThreat(p.x, p.y);
  G.noteCrime('gunfire');
  let best = null, bestD = TUNE.gunRange;
  const consider = (x, y, r, obj, kind) => {
    const d = dist(p.x, p.y, x, y);
    if (d > bestD) return;
    const da = Math.abs(((Math.atan2(y - p.y, x - p.x) - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (da < Math.atan2(r, Math.max(d, 1)) + 0.02) { best = { obj, kind, x, y }; bestD = d; }
  };
  for (const ped of G.peds) if (ped.state !== 'down') consider(ped.x, ped.y, 15, ped, 'ped');
  for (const car of G.cars) consider(car.x, car.y, 30, car, 'car');
  const ex = best ? best.x : p.x + Math.cos(a) * TUNE.gunRange;
  const ey = best ? best.y : p.y + Math.sin(a) * TUNE.gunRange;
  G.tracers.push({ x1: p.x + Math.cos(a) * 16, y1: p.y + Math.sin(a) * 16, x2: ex, y2: ey, t: 0.07 });
  G.burst(p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, 2, '#ffe98a');
  if (!best) return;
  if (best.kind === 'ped') knockDownPed(G, best.obj);
  else {
    damageCar(G, best.obj, TUNE.gunDamageCar);
    G.burst(best.x, best.y, 4, '#ffd98a');
    if (best.obj.kind === 'police') G.noteCrime('shootCop');
  }
}

export function updatePlayerDriving(G, dt) {
  const car = G.player.car;
  const throttle = -axisY();
  const steer = axisX();
  driveCar(G, car, dt, throttle, steer);
  G.player.x = car.x; G.player.y = car.y; G.player.angle = car.angle;
  // Running people over is very much a crime here.
  for (const ped of G.peds) {
    if (ped.state !== 'down' && Math.abs(car.speed) > 60 && dist(ped.x, ped.y, car.x, car.y) < 32) {
      knockDownPed(G, ped, false);
      G.noteCrime('hitAndRun');
      G.shake = Math.max(G.shake, 3);
      sfx.crash(false);
    }
  }
}
