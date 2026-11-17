// Vice Harbor — the city itself: districts, streets, buildings, palms and docks,
// generated from a seed, plus the collision and line-of-sight queries every
// other system uses. The city is a grid of streets; the blocks between them
// grow towers downtown, houses in the suburbs, warehouses on the docks and
// almost nothing on the beach.

import {
  WORLD_W, WORLD_H, BLOCK, ROAD_W, LANE, ROADS_X, ROADS_Y,
  SAFEHOUSE, FIXER_BAR, GARAGE, DOCKS, HOSPITAL,
} from './config.js';

// Building colours per district: [wall, roof] pairs the generator picks from.
const PALETTES = {
  downtown: [['#c96f4a', '#8a4a34'], ['#b8b0a4', '#7a7268'], ['#5f7f95', '#3e5a70'], ['#d9a05b', '#a8743c'], ['#8d6e9e', '#5f4a70']],
  midtown: [['#cbb9a0', '#96876f'], ['#a8b6ba', '#75858a'], ['#d98e73', '#a8644c'], ['#93a883', '#687a5c'], ['#bf9fbf', '#8f7391']],
  suburbs: [['#e8dcc4', '#b06a4a'], ['#dce8c8', '#7d9b5e'], ['#f0e0b0', '#c49a52'], ['#cfe0ee', '#7490ac'], ['#f3d3d3', '#b57e7e']],
  docks: [['#9a8f7d', '#6e6656'], ['#7e8a94', '#59636c'], ['#a89a80', '#7c705c']],
  beach: [['#f5e8c8', '#d9a05b']],
};

// Spots where no ordinary building may grow: the story's front doors.
const RESERVED = [
  { x: SAFEHOUSE.x, y: SAFEHOUSE.y, r: 40 },
  { x: FIXER_BAR.x, y: FIXER_BAR.y, r: 34 },
  { x: GARAGE.x, y: GARAGE.y, r: 40 },
  { x: DOCKS.x, y: DOCKS.y, r: 42 },
  { x: HOSPITAL.x, y: HOSPITAL.y, r: 34 },
  { x: 2060, y: 1150, r: 46 }, // the Neon Alley drop
  { x: 3560, y: 2080, r: 46 }, // the marina jetty
];

function hitsReserved(x, y, w, h) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return RESERVED.some((s) => {
    const dx = Math.max(Math.abs(cx - s.x) - w / 2, 0);
    const dy = Math.max(Math.abs(cy - s.y) - h / 2, 0);
    return dx * dx + dy * dy < s.r * s.r;
  });
}

/** Which district a point belongs to; drives building style, ground and names. */
export function districtAt(x, y) {
  if (x >= 3660) return 'water';
  if (x >= 3490) return 'beach';
  if (y >= 2246 && x >= 2050) return 'docks';
  if (x > 1150 && x < 2450 && y > 750 && y < 1650) return 'downtown';
  if (x < 1050 || y < 560) return 'suburbs';
  return 'midtown';
}

function addBuilding(city, rng, district, x, y, w, h, height) {
  const [wall, roof] = rng.pick(PALETTES[district]);
  city.buildings.push({
    x, y, w, h, height, wall, roof, district,
    seed: rng.int(1, 1e9),
    landmark: null,
  });
}

function landmarkBuilding(city, x, y, w, h, height, wall, roof, landmark) {
  city.buildings.push({ x, y, w, h, height, wall, roof, district: 'midtown', seed: 7, landmark });
}

function growBlock(city, rng, bx, by, bw, bh) {
  if (bw < 70 || bh < 70) return;
  const district = districtAt(bx + bw / 2, by + bh / 2);
  const lot = (x, y, w, h, height) => {
    if (!hitsReserved(x, y, w, h)) addBuilding(city, rng, district, x, y, w, h, height);
  };
  if (district === 'downtown') {
    // Two towers a block, tall enough to lean over the street at dusk.
    const vertical = bw >= bh;
    for (let i = 0; i < 2; i++) {
      const w = vertical ? bw - 26 : (bw - 40) / 2;
      const h = vertical ? (bh - 40) / 2 : bh - 26;
      const x = bx + 13 + (vertical ? 0 : i * ((bw - 40) / 2 + 14));
      const y = by + 13 + (vertical ? i * ((bh - 40) / 2 + 14) : 0);
      lot(x, y, w, h, rng.range(70, 150));
    }
  } else if (district === 'docks') {
    lot(bx + 12, by + 12, bw - 24, bh - 24, rng.range(16, 30));
    // Shipping containers stacked in the yard beside the warehouse.
    for (let i = 0; i < 3; i++) {
      const cx = bx + rng.range(10, Math.max(20, bw - 90));
      const cy = by + bh - 44;
      city.containers.push({ x: cx, y: cy, w: 74, h: 30, color: rng.pick(['#b3543f', '#3f6fb3', '#4d9950', '#c2a13a']) });
    }
  } else if (district === 'suburbs') {
    // A row of small houses with gardens between them.
    const cols = Math.max(2, Math.floor(bw / 96));
    const rows = Math.max(1, Math.floor(bh / 120));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const w = rng.range(52, 70);
        const h = rng.range(44, 58);
        const x = bx + 14 + i * ((bw - 28) / cols) + rng.range(0, 10);
        const y = by + 14 + j * ((bh - 28) / rows) + rng.range(0, 10);
        lot(x, y, w, h, rng.range(7, 13));
      }
    }
  } else if (district === 'beach') {
    if (rng.chance(0.4)) lot(bx + 20, by + 20, 64, 46, 8); // a beach hut
  } else {
    // Midtown: four mid-rise lots a block.
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const w = (bw - 44) / 2;
        const h = (bh - 44) / 2;
        lot(bx + 12 + i * (w + 20), by + 12 + j * (h + 20), w, h, rng.range(24, 62));
      }
    }
  }
}

/** Build the whole city from a seed. The same seed always grows the same city. */
export function buildCity(rng) {
  const city = {
    buildings: [],
    containers: [],
    palms: [],
    lights: [],
    umbrellas: [],
    grid: new Map(), // collision buckets: "cx,cy" -> building indices
  };

  // The story's own buildings first, at their surveyed spots.
  landmarkBuilding(city, 372, 352, 96, 64, 10, '#f3e5c8', '#b06a4a', 'safehouse');
  landmarkBuilding(city, 1568, 1462, 154, 92, 22, '#4a3a52', '#2e2438', 'bar');
  landmarkBuilding(city, 2300, 660, 170, 110, 16, '#8a8f96', '#5c6066', 'garage');
  landmarkBuilding(city, 1080, 270, 190, 120, 26, '#eef0ee', '#b33a3a', 'hospital');
  landmarkBuilding(city, 2820, 2300, 220, 130, 24, '#7e8a94', '#59636c', 'warehouse');

  // Blocks: the spans of land between one street's far kerb and the next street's near kerb.
  const spans = (roads, max) => {
    const edges = [0];
    for (const r of roads) edges.push(r - ROAD_W / 2, r + ROAD_W / 2);
    edges.push(max);
    const out = [];
    for (let i = 0; i + 1 < edges.length; i += 2) out.push([edges[i], edges[i + 1] - edges[i]]);
    return out.filter(([, w]) => w > 40);
  };
  // The spans already include the strips past the outermost streets: the
  // southern one grows the docks yards, the eastern one the beach.
  for (const [bx, bw] of spans(ROADS_X, WORLD_W)) {
    for (const [by, bh] of spans(ROADS_Y, WORLD_H)) {
      growBlock(city, rng, bx, by, bw, bh);
    }
  }

  // Palms: thick on the beach and along the coast road, scattered elsewhere.
  for (let i = 0; i < 240; i++) {
    const beachy = rng.chance(0.55);
    const x = beachy ? rng.range(3300, 3640) : rng.range(60, WORLD_W - 60);
    const y = rng.range(40, WORLD_H - 40);
    if (isRoad(x, y) || pointInBuilding(city, x, y, 6)) continue;
    city.palms.push({ x, y, s: rng.range(0.8, 1.3), lean: rng.range(-0.2, 0.2), seed: rng.int(1, 1e9) });
  }
  // Beach umbrellas on the sand.
  for (let i = 0; i < 26; i++) {
    const x = rng.range(3500, 3640);
    const y = rng.range(120, WORLD_H - 120);
    city.umbrellas.push({ x, y, color: rng.pick(['#e2543e', '#f2b33d', '#3e9be2', '#ee6aa5']), r: rng.range(13, 19) });
  }
  // Streetlights along every street, on both kerbs.
  for (const rx of ROADS_X) {
    for (let y = 90; y < WORLD_H; y += 170) {
      city.lights.push({ x: rx - ROAD_W / 2 - 6, y }, { x: rx + ROAD_W / 2 + 6, y: y + 85 });
    }
  }
  for (const ry of ROADS_Y) {
    for (let x = 90; x < WORLD_W; x += 170) {
      city.lights.push({ x, y: ry - ROAD_W / 2 - 6 }, { x: x + 85, y: ry + ROAD_W / 2 + 6 });
    }
  }

  // Collision buckets over buildings and containers alike.
  const solids = [...city.buildings, ...city.containers];
  city.solids = solids;
  const CELL = 256;
  solids.forEach((b, idx) => {
    const x0 = Math.floor(b.x / CELL);
    const x1 = Math.floor((b.x + b.w) / CELL);
    const y0 = Math.floor(b.y / CELL);
    const y1 = Math.floor((b.y + b.h) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const key = `${cx},${cy}`;
        if (!city.grid.has(key)) city.grid.set(key, []);
        city.grid.get(key).push(idx);
      }
    }
  });
  return city;
}

/** Is this point on a street (asphalt), intersections included? */
export function isRoad(x, y) {
  const half = ROAD_W / 2;
  return ROADS_X.some((rx) => Math.abs(x - rx) <= half) || ROADS_Y.some((ry) => Math.abs(y - ry) <= half);
}

/** Is this point inside any solid (building or container), padded by pad px? */
export function pointInBuilding(city, x, y, pad = 0) {
  const CELL = 256;
  const list = city.grid.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) ?? [];
  for (const idx of list) {
    const b = city.solids[idx];
    if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return b;
  }
  return null;
}

/**
 * Push a circle (x, y, r) out of every solid it overlaps and keep it inside the
 * world and out of the sea. Returns [x, y, hitSomething].
 */
export function resolveCircle(city, x, y, r) {
  let hit = false;
  x = Math.max(r, Math.min(WORLD_W - r, x));
  y = Math.max(r, Math.min(WORLD_H - r, y));
  if (x > 3670 - r) { x = 3670 - r; hit = true; } // the sea wall along the beach
  const CELL = 256;
  const seen = new Set();
  for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
    for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++) {
      const list = city.grid.get(`${cx},${cy}`) ?? [];
      for (const idx of list) {
        if (seen.has(idx)) continue;
        seen.add(idx);
        const b = city.solids[idx];
        const nx = Math.max(b.x, Math.min(b.x + b.w, x));
        const ny = Math.max(b.y, Math.min(b.y + b.h, y));
        let dx = x - nx;
        let dy = y - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          x = nx + (dx / d) * r;
          y = ny + (dy / d) * r;
        } else {
          // Centre inside the rect: leave by the nearest face.
          const left = x - b.x;
          const right = b.x + b.w - x;
          const top = y - b.y;
          const bottom = b.y + b.h - y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) x = b.x - r;
          else if (m === right) x = b.x + b.w + r;
          else if (m === top) y = b.y - r;
          else y = b.y + b.h + r;
        }
      }
    }
  }
  return [x, y, hit];
}

/** Is the straight line from (x1,y1) to (x2,y2) blocked by a solid? For sight lines and bullets. */
export function segmentBlocked(city, x1, y1, x2, y2) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(dist / 16));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (pointInBuilding(city, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 0)) return true;
  }
  return false;
}

/** A random point on a random street, with the street it belongs to. */
export function randomRoadPoint(rng) {
  if (rng.chance(0.55)) {
    const line = rng.pick(ROADS_X);
    return { x: line, y: rng.range(60, WORLD_H - 60), axis: 'y', line, dir: rng.sign() };
  }
  const line = rng.pick(ROADS_Y);
  return { x: rng.range(60, WORLD_W - 60), y: line, axis: 'x', line, dir: rng.sign() };
}

/** The lane centre for a car travelling on a street: right-hand traffic. */
export function lanePoint(axis, line, dir) {
  // Returns the offset from the street centreline for the direction of travel.
  if (axis === 'y') return dir > 0 ? -LANE : LANE; // southbound keeps west, northbound east
  return dir > 0 ? LANE : -LANE;                    // eastbound keeps south, westbound north
}

/** A random pavement point for a pedestrian: beside a street, clear of buildings. */
export function randomSidewalkPoint(city, rng) {
  for (let tries = 0; tries < 12; tries++) {
    const p = randomRoadPoint(rng);
    const off = (ROAD_W / 2 + rng.range(10, 26)) * rng.sign();
    const x = p.axis === 'y' ? p.line + off : p.x;
    const y = p.axis === 'y' ? p.y : p.line + off;
    if (x > 3660) continue;
    if (!pointInBuilding(city, x, y, 4)) return { x, y };
  }
  return { x: SAFEHOUSE.x, y: SAFEHOUSE.y };
}
