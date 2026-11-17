// Vice Harbor — the living traffic of the city: civilian cars that drive the
// street grid and stop for the player, parked cars waiting to be stolen,
// police cars that hunt by road and then by sight, and pedestrians who wander
// the pavements and run from trouble.

import {
  ROADS_X, ROADS_Y, LANE, ROAD_W, WORLD_W, WORLD_H,
  CAR_RADIUS, CAR_TURN, TRAFFIC_SPEED, POLICE_SPEED,
} from './config.js';
import { lanePoint, randomRoadPoint, randomSidewalkPoint, resolveCircle, segmentBlocked } from './world.js';

const CAR_PAINTS = ['#c23b2e', '#2e6fc2', '#e8b93c', '#e8e8e8', '#3a3f45', '#7ac74f', '#e2703a', '#9b59b6', '#f2f2f2', '#26a6a0', '#d16ba5', '#5d6d7e'];
const PED_SHIRTS = ['#e2543e', '#f2b33d', '#3e9be2', '#7ac74f', '#ee6aa5', '#f5f0e6', '#26a6a0', '#b08968'];

/** Wrap an angle to [-PI, PI]. */
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** A fresh car. kind is 'traffic', 'parked', 'police' or 'rival'. */
export function makeCar(rng, kind, x, y, angle) {
  return {
    x, y, angle, speed: 0, kind,
    color: kind === 'police' ? '#f4f6f8' : rng.pick(CAR_PAINTS),
    health: 100, wrecked: false,
    axis: 'y', line: 0, dir: 1, wpX: x, wpY: y,
    speedFactor: rng.range(0.82, 1.08),
    stuckT: 0, reverseT: 0, mode: 'road', thinkT: rng.range(0, 0.3),
    lightPhase: rng.range(0, Math.PI * 2),
  };
}

/** Place a car on the street grid with its first waypoint ahead of it. */
function placeOnRoad(city, rng, car) {
  const p = randomRoadPoint(rng);
  car.axis = p.axis;
  car.line = p.line;
  car.dir = p.dir;
  const off = lanePoint(p.axis, p.line, p.dir);
  car.x = p.axis === 'y' ? p.line + off : p.x;
  car.y = p.axis === 'y' ? p.y : p.line + off;
  car.angle = p.axis === 'y' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dir > 0 ? 0 : Math.PI);
  nextWaypoint(city, car, rng, true);
  return car;
}

/** The intersections ahead of a car on its current street, nearest first. */
function intersectionsAhead(car) {
  const cross = car.axis === 'y' ? ROADS_Y : ROADS_X;
  const pos = car.axis === 'y' ? car.y : car.x;
  return cross.filter((c) => (c - pos) * car.dir > 30).sort((a, b) => Math.abs(a - pos) - Math.abs(b - pos));
}

/**
 * Choose the car's next waypoint along the street grid. With chooseTurns, the car
 * may turn at the intersection it is heading for; police pass a target and turn
 * toward it instead of wandering.
 */
export function nextWaypoint(city, car, rng, chooseTurns, target = null) {
  const ahead = intersectionsAhead(car);
  const edge = car.axis === 'y' ? WORLD_H : WORLD_W;
  const atEdge = ahead.length === 0;
  const nextCross = atEdge ? (car.dir > 0 ? edge - 60 : 60) : ahead[0];
  const wantTurn = !atEdge && chooseTurns && (target !== null || rng.chance(0.38));
  if (wantTurn) {
    // Turn at the intersection ahead: the crossing street becomes the new road.
    // The intersection sits at (line, nextCross) on a vertical street, swapped on a horizontal one.
    const crossX = car.axis === 'y' ? car.line : nextCross;
    const crossY = car.axis === 'y' ? nextCross : car.line;
    const newAxis = car.axis === 'y' ? 'x' : 'y';
    let newDir = rng.sign();
    if (target) newDir = (newAxis === 'x' ? target.x - crossX : target.y - crossY) >= 0 ? 1 : -1;
    car.axis = newAxis;
    car.line = nextCross;
    car.dir = newDir;
    const off = lanePoint(car.axis, car.line, car.dir);
    if (car.axis === 'x') {
      car.wpX = crossX + car.dir * 120;
      car.wpY = car.line + off;
    } else {
      car.wpX = car.line + off;
      car.wpY = crossY + car.dir * 120;
    }
    return;
  }
  // Straight on: aim at the lane point of the next intersection (or the world's edge).
  const off = lanePoint(car.axis, car.line, car.dir);
  if (car.axis === 'y') {
    car.wpX = car.line + off;
    car.wpY = nextCross;
  } else {
    car.wpX = nextCross;
    car.wpY = car.line + off;
  }
  if (atEdge) car.dir *= -1; // the street runs out: turn around and head back
}

/** Spawn the city's moving traffic. */
export function spawnTraffic(city, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    cars.push(placeOnRoad(city, rng, makeCar(rng, 'traffic', 0, 0, 0)));
  }
  return cars;
}

/** Spawn parked cars along the kerbs: the player's free wheels. */
export function spawnParked(city, rng, count) {
  const cars = [];
  let guard = 0;
  while (cars.length < count && guard++ < count * 30) {
    const p = randomRoadPoint(rng);
    const side = rng.sign();
    const off = side * (ROAD_W / 2 - 2); // tight to the kerb, half on the sidewalk, clear of the lanes
    const x = p.axis === 'y' ? p.line + off : p.x;
    const y = p.axis === 'y' ? p.y : p.line + off;
    // Not in an intersection, not in the sea, not inside anything.
    const nearCross = (p.axis === 'y' ? ROADS_Y : ROADS_X).some((c) => Math.abs((p.axis === 'y' ? y : x) - c) < 84);
    if (nearCross || x > 3640) continue;
    const car = makeCar(rng, 'parked', x, y, p.axis === 'y' ? Math.PI / 2 : 0);
    car.axis = p.axis;
    car.line = p.line;
    cars.push(car);
  }
  return cars;
}

/** Spawn a police car on a street ring around the player. */
export function spawnPoliceCar(city, rng, player) {
  let best = null;
  for (let i = 0; i < 14; i++) {
    const car = placeOnRoad(city, rng, makeCar(rng, 'police', 0, 0, 0));
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d > 480 && d < 900) { best = car; break; }
    if (!best || Math.abs(d - 640) < Math.abs(Math.hypot(best.x - player.x, best.y - player.y) - 640)) best = car;
  }
  return best;
}

/** Is anything solid (another car, the player, a pedestrian) just ahead of this car? */
export function blockedAhead(state, car, dist) {
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  const test = (e, r) => {
    const rx = e.x - car.x;
    const ry = e.y - car.y;
    const fwd = rx * hx + ry * hy;
    if (fwd < 4 || fwd > dist) return false;
    const lat = Math.abs(rx * -hy + ry * hx);
    return lat < r + 13;
  };
  // Cars only block when they are truly in this lane (half-width ~16); a car
  // parked at the kerb or passing in the opposite lane must not stop traffic.
  for (const other of state.cars) {
    if (other !== car && !other.wrecked && test(other, 3)) return true;
  }
  for (const cop of state.police) {
    if (cop !== car && test(cop, 3)) return true;
  }
  const p = state.player;
  if (p.car && p.car !== car && test(p.car, 3)) return true;
  if (!p.car && test(p, 10)) return true;
  return false;
}

/** Steer a car toward a point and drive it; resolves building collisions. Returns impact speed. */
export function driveToward(state, car, dt, tx, ty, targetSpeed, turnRate = CAR_TURN) {
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const diff = wrapAngle(desired - car.angle);
  const reversing = car.reverseT > 0;
  const steer = Math.max(-turnRate * dt, Math.min(turnRate * dt, diff));
  car.angle += reversing ? -steer : steer;
  const goal = reversing ? -90 : targetSpeed * (Math.abs(diff) > 2.2 ? 0.25 : 1);
  const accel = goal > car.speed ? 240 : 620; // gentle throttle, firm brakes
  car.speed += Math.max(-accel * dt, Math.min(accel * dt, goal - car.speed));
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const [rx, ry, hit] = resolveCircle(state.city, nx, ny, CAR_RADIUS);
  const impact = hit ? Math.abs(car.speed) : 0;
  if (hit) {
    car.x = rx;
    car.y = ry;
    if (Math.abs(car.speed) > 60) car.speed *= -0.25;
    else car.speed = 0;
  } else {
    car.x = nx;
    car.y = ny;
  }
  return impact;
}

/**
 * If a car has been knocked well off its lane (a shunt, a wide turn), the point
 * it should aim for to rejoin its street; otherwise null and the waypoint rules.
 */
export function laneRecoveryPoint(car) {
  if (car.axis === 'y') {
    const laneX = car.line + lanePoint('y', car.line, car.dir);
    if (Math.abs(car.x - laneX) > 56) return { x: laneX, y: car.y + car.dir * 90 };
  } else {
    const laneY = car.line + lanePoint('x', car.line, car.dir);
    if (Math.abs(car.y - laneY) > 56) return { x: car.x + car.dir * 90, y: laneY };
  }
  return null;
}

/** One frame of civilian traffic: follow the grid, stop for trouble ahead. */
export function updateTrafficCar(state, car, dt) {
  if (car.wrecked) return 0;
  const recovery = laneRecoveryPoint(car);
  const dx = car.wpX - car.x;
  const dy = car.wpY - car.y;
  if (!recovery && dx * dx + dy * dy < 34 * 34) {
    nextWaypoint(state.city, car, state.rng, true);
  }
  let speed = TRAFFIC_SPEED * car.speedFactor;
  if (blockedAhead(state, car, 58)) speed = 0;
  else if (blockedAhead(state, car, 96)) speed *= 0.45;
  const tx = recovery ? recovery.x : car.wpX;
  const ty = recovery ? recovery.y : car.wpY;
  return driveToward(state, car, dt, tx, ty, speed, 2.2);
}

/** One frame of police work: follow roads toward the player, then hunt directly on sight. */
export function updatePoliceCar(state, car, dt) {
  if (car.wrecked) return 0;
  const player = state.player;
  const dist = Math.hypot(player.x - car.x, player.y - car.y);
  const sees = dist < 430 && !segmentBlocked(state.city, car.x, car.y, player.x, player.y);
  car.mode = sees || dist < 200 ? 'chase' : 'road';
  car.reverseT = Math.max(0, car.reverseT - dt);
  if (Math.abs(car.speed) < 14 && dist > 130) {
    car.stuckT += dt;
    if (car.stuckT > 1.1) {
      car.reverseT = 0.65;
      car.stuckT = 0;
    }
  } else car.stuckT = 0;

  if (car.mode === 'chase') {
    const lead = player.car ? 0.35 : 0.12;
    const tx = player.x + (player.vx ?? 0) * lead;
    const ty = player.y + (player.vy ?? 0) * lead;
    let speed = POLICE_SPEED;
    if (dist < 90) speed = Math.max(120, Math.abs(player.speed ?? 0) + 60);
    if (blockedAhead(state, car, 44) && dist > 120) speed = 60;
    return driveToward(state, car, dt, tx, ty, speed, 3.1);
  }
  // On roads: waypoint to waypoint, turning toward the player at each junction.
  const recovery = laneRecoveryPoint(car);
  const dx = car.wpX - car.x;
  const dy = car.wpY - car.y;
  if (!recovery && dx * dx + dy * dy < 36 * 36) {
    nextWaypoint(state.city, car, state.rng, true, player);
  }
  let speed = POLICE_SPEED * 0.92;
  if (blockedAhead(state, car, 54)) speed = 40;
  const tx = recovery ? recovery.x : car.wpX;
  const ty = recovery ? recovery.y : car.wpY;
  return driveToward(state, car, dt, tx, ty, speed, 2.8);
}

/** A pedestrian: wanders pavements, flees danger, falls when hit, gets up later elsewhere. */
export function makePedestrian(city, rng) {
  const p = randomSidewalkPoint(city, rng);
  return {
    x: p.x, y: p.y, angle: rng.range(0, Math.PI * 2),
    speed: 0, walkSpeed: rng.range(48, 82),
    tx: p.x, ty: p.y, state: 'walk',
    fleeT: 0, downT: 0, threatX: 0, threatY: 0,
    shirt: rng.pick(PED_SHIRTS), skin: rng.pick(['#f2c79b', '#c68863', '#8a5a3b', '#f7d7b5']),
    seed: rng.int(1, 1e9),
  };
}

export function spawnPedestrians(city, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) peds.push(makePedestrian(city, rng));
  return peds;
}

/** Tell a pedestrian to run from a point (a gunshot, a punch, a fast car). */
export function scarePedestrian(ped, x, y, seconds = 2.6) {
  if (ped.state === 'down') return;
  ped.state = 'flee';
  ped.threatX = x;
  ped.threatY = y;
  ped.fleeT = seconds;
}

/** Knock a pedestrian down (a car strike or a bullet). */
export function knockDownPedestrian(ped) {
  ped.state = 'down';
  ped.downT = 16;
  ped.speed = 0;
}

export function updatePedestrian(state, ped, dt) {
  const city = state.city;
  if (ped.state === 'down') {
    ped.downT -= dt;
    if (ped.downT <= 0) {
      // Quietly rejoin the city somewhere else, unhurt and unbothered.
      const p = randomSidewalkPoint(city, state.rng);
      ped.x = p.x; ped.y = p.y; ped.tx = p.x; ped.ty = p.y;
      ped.state = 'walk';
    }
    return;
  }
  let targetSpeed = ped.walkSpeed;
  if (ped.state === 'flee') {
    ped.fleeT -= dt;
    const away = Math.atan2(ped.y - ped.threatY, ped.x - ped.threatX);
    ped.tx = ped.x + Math.cos(away) * 190;
    ped.ty = ped.y + Math.sin(away) * 190;
    targetSpeed = 178;
    if (ped.fleeT <= 0) ped.state = 'walk';
  } else if (Math.hypot(ped.tx - ped.x, ped.ty - ped.y) < 12 || state.rng.chance(0.002)) {
    const p = randomSidewalkPoint(city, state.rng);
    // Wander locally: drift toward a pavement point a few blocks away, not across town.
    ped.tx = Math.max(20, Math.min(3660, ped.x + (p.x - ped.x) * 0.22 + state.rng.range(-90, 90)));
    ped.ty = Math.max(20, Math.min(WORLD_H - 20, ped.y + (p.y - ped.y) * 0.22 + state.rng.range(-90, 90)));
  }
  const desired = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
  ped.angle += Math.max(-7 * dt, Math.min(7 * dt, wrapAngle(desired - ped.angle)));
  ped.speed += Math.max(-300 * dt, Math.min(300 * dt, targetSpeed - ped.speed));
  const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
  const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
  const [rx, ry] = resolveCircle(city, nx, ny, 8);
  ped.x = rx;
  ped.y = ry;
}
