// Vice Harbor — procedural city generation and spatial queries.
// The city is built once from a fixed seed: blocks between the road grid get
// buildings sized/coloured by district, palms line the beach, streetlights
// stand along every road. Queries here serve physics, AI and rendering.

import { WORLD, ROADS_X, ROADS_Y, ROAD_W, CLEARINGS, DISTRICT_STYLE, districtAt } from './config.js';
import { Rng, clamp, pointInRect, rectsOverlap, segmentHitsRect } from './random.js';

export const world = {
  buildings: [],
  palms: [],
  lights: [],
  crates: [],
  seed: 7,
};

const HALF = ROAD_W / 2;

export function isOnRoad(x, y, pad = 0) {
  for (const rx of ROADS_X) if (Math.abs(x - rx) <= HALF + pad) return true;
  for (const ry of ROADS_Y) if (Math.abs(y - ry) <= HALF + pad) return true;
  return false;
}

export function nearestRoadPoint(x, y) {
  let best = null, bd = Infinity;
  for (const rx of ROADS_X) { const d = Math.abs(x - rx); if (d < bd) { bd = d; best = { x: rx, y }; } }
  for (const ry of ROADS_Y) { const d = Math.abs(y - ry); if (d < bd) { bd = d; best = { x, y: ry }; } }
  return best;
}

// Block rectangles between consecutive road bands, as [x0,y0,x1,y1]. The band
// list alternates edge/centre-line coordinates, so stepping by 2 yields the
// buildable blocks and skips the roads themselves.
function blockRects() {
  const xs = [16, ...ROADS_X.flatMap((r) => [r - HALF, r + HALF]), WORLD.w - 16];
  const ys = [16, ...ROADS_Y.flatMap((r) => [r - HALF, r + HALF]), WORLD.h - 16];
  const out = [];
  for (let i = 0; i < xs.length; i += 2) {
    for (let j = 0; j < ys.length; j += 2) {
      const r = { x: xs[i], y: ys[j], w: xs[i + 1] - xs[i], h: ys[j + 1] - ys[j] };
      if (r.w > 60 && r.h > 60) out.push(r);
    }
  }
  return out;
}

function inClearing(r, pad) {
  return CLEARINGS.some((c) => rectsOverlap(r, c, pad));
}

export function buildWorld(seed = 7) {
  world.seed = seed;
  world.buildings = []; world.palms = []; world.lights = []; world.crates = [];
  const rng = new Rng(seed * 7919 + 13);

  for (const block of blockRects()) {
    const cx = block.x + block.w / 2, cy = block.y + block.h / 2;
    const district = districtAt(cx, cy);
    if (district === 'beach' || district === 'water') continue;
    const style = DISTRICT_STYLE[district];
    // Subdivide the block into lots; suburbs keep bigger yards, docks get
    // wide warehouses, downtown packs towers onto small footprints.
    const cols = district === 'suburbs' ? 2 : (block.w > 420 ? 3 : 2);
    const rows = district === 'docks' ? 1 : (block.h > 420 ? 3 : 2);
    const lotW = block.w / cols, lotH = block.h / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (district === 'suburbs' && rng.chance(0.22)) continue; // empty yard
        const gap = district === 'suburbs' ? 16 : 9;
        const b = {
          x: block.x + i * lotW + gap + rng.float(0, 6),
          y: block.y + j * lotH + gap + rng.float(0, 6),
          w: lotW - gap * 2 - rng.float(0, 10),
          h: lotH - gap * 2 - rng.float(0, 10),
          district,
        };
        if (b.w < 34 || b.h < 30) continue;
        if (inClearing(b, 4)) continue;
        b.color = rng.pick(style.roof);
        b.floors = style.tall ? rng.int(4, 9) : rng.int(1, 3);
        b.winSeed = rng.int(1, 1e9);
        b.name = null;
        world.buildings.push(b);
      }
    }
  }

  // Named story buildings sit on their reserved lots.
  world.buildings.push({ x: 1700, y: 2230, w: 220, h: 120, district: 'docks', color: '#8a4f3a', floors: 2, winSeed: 42, name: 'THE RUSTY ANCHOR' });
  world.buildings.push({ x: 120, y: 690, w: 180, h: 110, district: 'suburbs', color: '#c9b183', floors: 1, winSeed: 77, name: 'SAFEHOUSE' });
  world.buildings.push({ x: 3360, y: 1110, w: 90, h: 90, district: 'beach', color: '#4fa8c9', floors: 1, winSeed: 99, name: 'KIOSK AZUL' });

  // Palms: a row along the beach, clusters in the suburbs, a few downtown.
  for (let y = 120; y < WORLD.h - 80; y += rng.int(110, 190)) {
    world.palms.push({ x: 3368 + rng.float(-14, 14), y, s: rng.float(0.85, 1.25) });
  }
  for (let i = 0; i < 130; i++) {
    const x = rng.float(60, 3260), y = rng.float(60, WORLD.h - 60);
    if (isOnRoad(x, y, 16)) continue;
    if (world.buildings.some((b) => pointInRect(x, y, b, 10))) continue;
    world.palms.push({ x, y, s: rng.float(0.7, 1.2) });
  }

  // Streetlights along every road, alternating sides.
  for (const rx of ROADS_X) for (let y = 90; y < WORLD.h; y += 205) world.lights.push({ x: rx + (Math.round(y / 205) % 2 ? -1 : 1) * (HALF + 7), y });
  for (const ry of ROADS_Y) for (let x = 90; x < 3300; x += 205) world.lights.push({ x, y: ry + (Math.round(x / 205) % 2 ? -1 : 1) * (HALF + 7) });

  // Dock crates for cover and colour.
  for (let i = 0; i < 46; i++) {
    const x = rng.float(80, 3200), y = rng.float(2160, WORLD.h - 90);
    if (isOnRoad(x, y, 20)) continue;
    world.crates.push({ x, y, w: rng.float(26, 44), h: rng.float(26, 44), color: rng.pick(['#7a5c3e', '#4f6e8a', '#6e8a4f', '#8a4f4f']) });
  }
  return world;
}

// Push a circle (x,y,r) out of every building it overlaps; returns corrected
// position. Buildings are the only solid geometry besides the world edge.
export function collideCircle(x, y, r) {
  x = clamp(x, r + 4, WORLD.w - r - 4);
  y = clamp(y, r + 4, WORLD.h - r - 4);
  for (const b of world.buildings) {
    const nx = clamp(x, b.x, b.x + b.w), ny = clamp(y, b.y, b.y + b.h);
    let dx = x - nx, dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * r; y = ny + (dy / d) * r;
    } else {
      // Centre inside the rect: exit along the smallest penetration axis.
      const left = x - b.x, right = b.x + b.w - x, top = y - b.y, bot = b.y + b.h - y;
      const m = Math.min(left, right, top, bot);
      if (m === left) x = b.x - r; else if (m === right) x = b.x + b.w + r;
      else if (m === top) y = b.y - r; else y = b.y + b.h + r;
    }
  }
  return { x, y };
}

export function circleHitsBuilding(x, y, r) {
  for (const b of world.buildings) {
    const nx = clamp(x, b.x, b.x + b.w), ny = clamp(y, b.y, b.y + b.h);
    if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return b;
  }
  return null;
}

// Line of sight between two points, blocked by any building.
export function hasLOS(x1, y1, x2, y2) {
  for (const b of world.buildings) {
    if (segmentHitsRect(x1, y1, x2, y2, b)) return false;
  }
  return true;
}

// A random point on a road, optionally near (cx,cy) within [minD,maxD].
export function randomRoadPoint(rng, cx = null, cy = null, minD = 0, maxD = Infinity) {
  for (let tries = 0; tries < 40; tries++) {
    let x, y;
    if (rng.chance(0.5)) { x = rng.pick(ROADS_X); y = rng.float(60, WORLD.h - 60); }
    else { y = rng.pick(ROADS_Y); x = rng.float(60, 3300); }
    if (cx === null) return { x, y };
    const d = Math.hypot(x - cx, y - cy);
    if (d >= minD && d <= maxD) return { x, y };
  }
  return { x: ROADS_X[1], y: ROADS_Y[1] };
}
