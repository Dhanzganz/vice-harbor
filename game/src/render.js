// Vice Harbor — everything the player sees: the city from above with its
// fake-height towers and palm shadows, traffic and crowds, the day/night
// cycle with dusk warmth and headlight cones, and the full HUD (minimap,
// wanted stars, mission panel, dialogue) plus the title, pause, busted and
// wasted screens. All of it is drawn in code on one canvas; there are no images.

import {
  VIEW_W, VIEW_H, WORLD_W, WORLD_H, ROAD_W, ROADS_X, ROADS_Y,
  DISTRICT_COLORS, SAFEHOUSE, FIXER_BAR, HOSPITAL,
} from './config.js';
import { districtAt } from './world.js';
import { currentObjective, missionPanel } from './missions.js';

/** Deterministic 0..1 hash for window lights and skyline shapes. */
function hash(n) {
  const h = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Sample a keyframe track ([time, value] pairs) at time t in 0..1. */
function track(keys, t) {
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      return lerp(v0, v1, (t - t0) / (t1 - t0));
    }
  }
  return keys[keys.length - 1][1];
}

/**
 * The light of Vice Harbor at a time of day (0 = midnight, 0.5 = noon):
 * how dark the night overlay is, how warm the dusk grading is, and whether
 * headlights and streetlights should burn.
 */
export function paletteAt(timeOfDay) {
  const darkness = track([[0, 0.86], [0.2, 0.84], [0.27, 0.3], [0.33, 0.02], [0.62, 0.02], [0.7, 0.16], [0.77, 0.42], [0.84, 0.78], [1, 0.86]], timeOfDay);
  const warmth = track([[0, 0], [0.58, 0], [0.68, 0.4], [0.76, 1], [0.83, 0.4], [0.9, 0], [1, 0]], timeOfDay);
  return { darkness, warmth, lights: darkness > 0.22 };
}

/** A rounded rectangle path (roundRect with a fallback for older engines). */
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Word-wrap a string into lines that fit maxWidth in the current font. */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** A five-point star path centred at (x, y). */
function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  /** The camera's visible world rectangle, for culling. */
  viewRect(state) {
    const cam = state.camera;
    const hw = VIEW_W / 2 / cam.zoom + 60;
    const hh = VIEW_H / 2 / cam.zoom + 60;
    return { x0: cam.x - hw, y0: cam.y - hh, x1: cam.x + hw, y1: cam.y + hh };
  }

  draw(state) {
    const { ctx } = this;
    if (state.screen === 'title') {
      this.drawTitle(state);
      return;
    }
    const cam = state.camera;
    const shakeX = cam.shake > 0.2 ? (hash(state.time * 91.7) - 0.5) * cam.shake : 0;
    const shakeY = cam.shake > 0.2 ? (hash(state.time * 113.3 + 5) - 0.5) * cam.shake : 0;
    ctx.setTransform(cam.zoom, 0, 0, cam.zoom, VIEW_W / 2 - cam.x * cam.zoom + shakeX, VIEW_H / 2 - cam.y * cam.zoom + shakeY);
    const view = this.viewRect(state);
    const pal = paletteAt(state.timeOfDay);
    this.drawGround(state, view);
    this.drawProps(state, view);
    this.drawObjectiveBeacon(state);
    this.drawPickups(state, view);
    this.drawBuildings(state, view, pal);
    for (const ped of state.peds) this.drawPedestrian(state, ped, view);
    for (const car of state.cars) this.drawCar(state, car, view, pal);
    for (const cop of state.police) this.drawCar(state, cop, view, pal);
    if (state.player.car) this.drawCar(state, state.player.car, view, pal, true);
    else this.drawPlayerOnFoot(state);
    this.drawParticles(state);
    this.drawTracers(state);
    // Dusk warmth, then the night itself, then everything that glows.
    if (pal.warmth > 0.01) {
      ctx.fillStyle = `rgba(255, 110, 40, ${(pal.warmth * 0.15).toFixed(3)})`;
      ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    }
    if (pal.darkness > 0.01) {
      ctx.fillStyle = `rgba(9, 11, 38, ${(pal.darkness * 0.8).toFixed(3)})`;
      ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    }
    if (pal.lights) this.drawLights(state, view, pal);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawVignette();
    this.drawHUD(state, pal);
    if (state.screen === 'paused') this.drawPaused(state);
    if (state.screen === 'busted') this.drawEndScreen(state, 'BUSTED', '#7ab5ff', 'The Harbor PD got their collar. Your ride is impounded, your pockets lighter.');
    if (state.screen === 'wasted') this.drawEndScreen(state, 'WASTED', '#ff5a4a', 'You wake up outside St. Solana Hospital. The bill stings worse than the beating.');
  }

  // ------------------------------------------------------------ the world

  drawGround(state, view) {
    const { ctx } = this;
    const cell = 200;
    for (let gx = Math.floor(view.x0 / cell) * cell; gx < view.x1; gx += cell) {
      for (let gy = Math.floor(view.y0 / cell) * cell; gy < view.y1; gy += cell) {
        const d = districtAt(gx + cell / 2, gy + cell / 2);
        ctx.fillStyle = d === 'water' ? DISTRICT_COLORS.water : d === 'beach' ? DISTRICT_COLORS.beach : d === 'suburbs' ? '#63914e' : d === 'docks' ? '#77735f' : d === 'downtown' ? '#7b7263' : '#877d6c';
        ctx.fillRect(gx, gy, cell + 1, cell + 1);
      }
    }
    // Animated wave lines on the sea.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    for (let y = Math.floor(view.y0 / 46) * 46; y < view.y1; y += 46) {
      const off = Math.sin(state.time * 1.4 + y * 0.05) * 9;
      ctx.beginPath();
      ctx.moveTo(Math.max(3666, view.x0), y + off);
      ctx.lineTo(view.x1, y + off * 0.4);
      ctx.stroke();
    }
    // Streets: asphalt, kerbs and centre dashes.
    ctx.fillStyle = '#3c4148';
    for (const rx of ROADS_X) {
      if (rx + ROAD_W / 2 < view.x0 || rx - ROAD_W / 2 > view.x1) continue;
      ctx.fillRect(rx - ROAD_W / 2, view.y0, ROAD_W, view.y1 - view.y0);
    }
    for (const ry of ROADS_Y) {
      if (ry + ROAD_W / 2 < view.y0 || ry - ROAD_W / 2 > view.y1) continue;
      ctx.fillRect(view.x0, ry - ROAD_W / 2, view.x1 - view.x0, ROAD_W);
    }
    ctx.strokeStyle = 'rgba(240,240,230,0.5)';
    ctx.lineWidth = 2;
    for (const rx of ROADS_X) {
      ctx.beginPath();
      ctx.moveTo(rx - ROAD_W / 2, view.y0); ctx.lineTo(rx - ROAD_W / 2, view.y1);
      ctx.moveTo(rx + ROAD_W / 2, view.y0); ctx.lineTo(rx + ROAD_W / 2, view.y1);
      ctx.stroke();
    }
    for (const ry of ROADS_Y) {
      ctx.beginPath();
      ctx.moveTo(view.x0, ry - ROAD_W / 2); ctx.lineTo(view.x1, ry - ROAD_W / 2);
      ctx.moveTo(view.x0, ry + ROAD_W / 2); ctx.lineTo(view.x1, ry + ROAD_W / 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(246, 214, 110, 0.65)';
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 30]);
    for (const rx of ROADS_X) {
      ctx.beginPath(); ctx.moveTo(rx, view.y0); ctx.lineTo(rx, view.y1); ctx.stroke();
    }
    for (const ry of ROADS_Y) {
      ctx.beginPath(); ctx.moveTo(view.x0, ry); ctx.lineTo(view.x1, ry); ctx.stroke();
    }
    ctx.setLineDash([]);
    // Crosswalks at the visible intersections.
    ctx.fillStyle = 'rgba(245,245,245,0.4)';
    for (const rx of ROADS_X) {
      for (const ry of ROADS_Y) {
        if (rx < view.x0 - 60 || rx > view.x1 + 60 || ry < view.y0 - 60 || ry > view.y1 + 60) continue;
        for (let i = -2; i <= 2; i++) {
          ctx.fillRect(rx + i * 16 - 5, ry - ROAD_W / 2 - 12, 10, 9);
          ctx.fillRect(rx + i * 16 - 5, ry + ROAD_W / 2 + 3, 10, 9);
          ctx.fillRect(rx - ROAD_W / 2 - 12, ry + i * 16 - 5, 9, 10);
          ctx.fillRect(rx + ROAD_W / 2 + 3, ry + i * 16 - 5, 9, 10);
        }
      }
    }
  }

  drawProps(state, view) {
    const { ctx } = this;
    const inView = (x, y, m = 40) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;
    // Beach umbrellas.
    for (const u of state.city.umbrellas) {
      if (!inView(u.x, u.y)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.ellipse(u.x + 4, u.y + 5, u.r, u.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = u.color;
      ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(u.x, u.y, u.r * 0.4, 0, Math.PI * 2); ctx.fill();
    }
    // Shipping containers at the docks.
    for (const c of state.city.containers) {
      if (!inView(c.x + c.w / 2, c.y + c.h / 2, 90)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(c.x + 4, c.y + 5, c.w, c.h);
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      for (let x = c.x + 10; x < c.x + c.w - 4; x += 12) {
        ctx.beginPath(); ctx.moveTo(x, c.y + 3); ctx.lineTo(x, c.y + c.h - 3); ctx.stroke();
      }
    }
    // Palms: a curved trunk and six fronds, with a long shadow at low sun.
    for (const palm of state.city.palms) {
      if (!inView(palm.x, palm.y, 60)) continue;
      const topX = palm.x + palm.lean * 26;
      const topY = palm.y - 16 * palm.s;
      ctx.strokeStyle = 'rgba(0,0,0,0.20)';
      ctx.lineWidth = 5 * palm.s;
      ctx.beginPath(); ctx.moveTo(palm.x + 10, palm.y + 6); ctx.lineTo(topX + 12, topY + 6); ctx.stroke();
      ctx.strokeStyle = '#8a6b46';
      ctx.lineWidth = 4 * palm.s;
      ctx.beginPath(); ctx.moveTo(palm.x, palm.y); ctx.quadraticCurveTo(palm.x + palm.lean * 10, palm.y - 10 * palm.s, topX, topY); ctx.stroke();
      ctx.strokeStyle = '#3f8f3f';
      ctx.lineWidth = 3 * palm.s;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + palm.seed;
        const len = 17 * palm.s;
        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.quadraticCurveTo(topX + Math.cos(a) * len * 0.6, topY + Math.sin(a) * len * 0.4 - 4, topX + Math.cos(a) * len, topY + Math.sin(a) * len * 0.55 + 5);
        ctx.stroke();
      }
    }
    // Streetlight poles (their glow comes in the light pass).
    ctx.fillStyle = '#2c2f33';
    for (const l of state.city.lights) {
      if (!inView(l.x, l.y, 12)) continue;
      ctx.beginPath(); ctx.arc(l.x, l.y, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawBuildings(state, view, pal) {
    const { ctx } = this;
    const sunX = 0.45 - state.timeOfDay * 0.5; // shadows swing across the day
    for (const b of state.city.buildings) {
      if (b.x + b.w < view.x0 - 80 || b.x > view.x1 + 80 || b.y + b.h < view.y0 - 80 || b.y > view.y1 + 80) continue;
      const lift = b.height * 0.3; // fake height: roofs lean away from the ground
      const shX = sunX * b.height * 0.9;
      // Ground shadow, then the wall skirt, then the roof.
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(b.x + shX + 6, b.y + b.h * 0.4 + 8, b.w, b.h * 0.7);
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y - lift * 0.4, b.w, b.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y - lift * 0.4, b.w, b.h);
      // Roof furniture: AC boxes and a water tower on the tall ones.
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      const n = Math.floor(hash(b.seed) * 3);
      for (let i = 0; i < n; i++) {
        const w = 12 + hash(b.seed + i * 3) * 16;
        ctx.fillRect(b.x + 8 + hash(b.seed + i * 7) * Math.max(4, b.w - w - 16), b.y - lift * 0.4 + 8 + hash(b.seed + i * 11) * Math.max(4, b.h - 30), w, w * 0.7);
      }
      if (b.landmark === 'bar') {
        ctx.fillStyle = '#2e2438';
        ctx.fillRect(b.x + 14, b.y + b.h - 24, b.w - 28, 18);
        ctx.fillStyle = '#ff7ac0';
        ctx.font = 'bold 13px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('THE RUSTY ANCHOR', b.x + b.w / 2, b.y + b.h - 11);
      }
      if (b.landmark === 'hospital') {
        ctx.fillStyle = '#d23b3b';
        ctx.fillRect(b.x + b.w / 2 - 5, b.y + 14, 10, 30);
        ctx.fillRect(b.x + b.w / 2 - 15, b.y + 24, 30, 10);
      }
      if (b.landmark === 'garage') {
        ctx.fillStyle = '#34383e';
        ctx.font = 'bold 15px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('TORQUE & SONS', b.x + b.w / 2, b.y + 26);
      }
      // Windows: a lit grid by night (drawn in the light pass), faint by day.
      if (pal.darkness < 0.3) {
        ctx.fillStyle = 'rgba(30, 40, 55, 0.35)';
        const cols = Math.min(9, Math.floor(b.w / 17));
        const rows = Math.min(7, Math.floor(b.h / 17));
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < rows; j++) {
            if (hash(b.seed + i * 31 + j * 57) < 0.42) continue;
            ctx.fillRect(b.x + 8 + i * 17, b.y - lift * 0.4 + 8 + j * 17, 8, 10);
          }
        }
      }
    }
  }

  drawObjectiveBeacon(state) {
    const { ctx } = this;
    const obj = currentObjective(state);
    if (!obj || state.screen !== 'playing') return;
    const bob = Math.sin(state.time * 3.2) * 6;
    const grad = ctx.createLinearGradient(0, obj.y - 320, 0, obj.y);
    grad.addColorStop(0, 'rgba(255, 217, 74, 0)');
    grad.addColorStop(1, 'rgba(255, 217, 74, 0.30)');
    ctx.fillStyle = grad;
    ctx.fillRect(obj.x - 13, obj.y - 320, 26, 320);
    ctx.strokeStyle = obj.color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(obj.x, obj.y, 24 + Math.sin(state.time * 3.2) * 3, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = obj.color;
    ctx.beginPath();
    ctx.moveTo(obj.x - 11, obj.y - 44 + bob);
    ctx.lineTo(obj.x + 11, obj.y - 44 + bob);
    ctx.lineTo(obj.x, obj.y - 30 + bob);
    ctx.closePath(); ctx.fill();
  }

  drawPickups(state, view) {
    const { ctx } = this;
    for (const pk of state.pickups) {
      if (pk.x < view.x0 || pk.x > view.x1 || pk.y < view.y0 || pk.y > view.y1) continue;
      const bob = Math.sin(state.time * 2.6 + pk.x) * 4;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(pk.x, pk.y + 8, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2f7a3d';
      rr(ctx, pk.x - 13, pk.y - 10 + bob, 26, 20, 3); ctx.fill();
      ctx.fillStyle = '#ffd94a';
      ctx.font = 'bold 15px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', pk.x, pk.y + 5 + bob);
    }
  }

  // ------------------------------------------------------------ the actors

  drawCar(state, car, view, pal, isPlayerCar = false) {
    const { ctx } = this;
    if (car.x < view.x0 - 60 || car.x > view.x1 + 60 || car.y < view.y0 - 60 || car.y > view.y1 + 60) return;
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.ellipse(car.x + 3, car.y + 6, 24, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Wheels.
    ctx.fillStyle = '#14161a';
    ctx.fillRect(-14, -13, 9, 5); ctx.fillRect(6, -13, 9, 5);
    ctx.fillRect(-14, 8, 9, 5); ctx.fillRect(6, 8, 9, 5);
    // Body.
    ctx.fillStyle = car.color;
    rr(ctx, -22, -11, 44, 22, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    rr(ctx, -22, -11, 44, 22, 6); ctx.stroke();
    if (car.kind === 'police') {
      ctx.fillStyle = '#20242a';
      ctx.fillRect(-10, -11, 15, 22); // black centre band
    }
    if (car.kind === 'rival') {
      ctx.fillStyle = 'rgba(20,20,20,0.55)';
      ctx.fillRect(-22, -3, 44, 6); // racing stripe
    }
    // Cabin and glass.
    ctx.fillStyle = '#1d2733';
    rr(ctx, -9, -8, 18, 16, 3); ctx.fill();
    ctx.fillStyle = 'rgba(160, 210, 240, 0.5)';
    ctx.fillRect(4, -7, 4, 14);  // windshield
    ctx.fillRect(-11, -7, 3, 14); // rear window
    // Police lightbar, flashing red and blue.
    if (car.kind === 'police') {
      const phase = Math.sin(state.time * 11 + car.lightPhase) > 0;
      ctx.fillStyle = phase ? '#ff3b30' : '#5a0f0c';
      ctx.fillRect(-3, -7, 6, 6);
      ctx.fillStyle = phase ? '#1c3d6e' : '#2f7bff';
      ctx.fillRect(-3, 1, 6, 6);
    }
    if (car.wrecked) {
      ctx.fillStyle = 'rgba(10,10,10,0.45)';
      rr(ctx, -22, -11, 44, 22, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(200,200,200,0.5)';
      ctx.beginPath();
      ctx.moveTo(-16, -8); ctx.lineTo(-4, 2); ctx.lineTo(-12, 9);
      ctx.moveTo(8, -9); ctx.lineTo(14, 0); ctx.lineTo(6, 8);
      ctx.stroke();
    }
    ctx.restore();
    if (isPlayerCar) {
      // A bouncing chevron so the player always finds their own car.
      const bob = Math.sin(state.time * 4) * 4;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(car.x - 8, car.y - 40 + bob);
      ctx.lineTo(car.x + 8, car.y - 40 + bob);
      ctx.lineTo(car.x, car.y - 30 + bob);
      ctx.closePath(); ctx.fill();
    }
    void pal;
  }

  drawPedestrian(state, ped, view) {
    const { ctx } = this;
    if (ped.x < view.x0 - 30 || ped.x > view.x1 + 30 || ped.y < view.y0 - 30 || ped.y > view.y1 + 30) return;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(ped.x + 2, ped.y + 4, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.rotate(ped.angle);
    if (ped.state === 'down') {
      ctx.fillStyle = ped.shirt;
      rr(ctx, -11, -4.5, 19, 9, 4); ctx.fill();
      ctx.fillStyle = ped.skin;
      ctx.beginPath(); ctx.arc(11, 0, 4.4, 0, Math.PI * 2); ctx.fill();
    } else {
      const stride = Math.sin(state.time * 11 + ped.seed) * (ped.speed > 4 ? 3.4 : 0);
      ctx.fillStyle = '#2c3140';
      ctx.beginPath(); ctx.arc(-2 + stride * 0.4, -4.4, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-2 - stride * 0.4, 4.4, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ped.shirt;
      ctx.beginPath(); ctx.arc(0, 0, 6.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ped.skin;
      ctx.beginPath(); ctx.arc(2.6, 0, 4.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  drawPlayerOnFoot(state) {
    const { ctx } = this;
    const p = state.player;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 5, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 13 + Math.sin(state.time * 3) * 1.4, 0, Math.PI * 2); ctx.stroke();
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    const stride = Math.sin(state.time * 12) * (p.moving ? 4 : 0);
    ctx.fillStyle = '#23262e';
    ctx.beginPath(); ctx.arc(-2 + stride * 0.4, -5, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-2 - stride * 0.4, 5, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffb340'; // the mustard hoodie: the player reads at a glance
    ctx.beginPath(); ctx.arc(0, 0, 7.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c79b';
    ctx.beginPath(); ctx.arc(3, 0, 4.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (p.aiming) {
      // The gun arm points at the mouse.
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.aimAngle);
      ctx.fillStyle = '#191c20';
      ctx.fillRect(6, -1.8, 13, 3.6);
      ctx.restore();
    }
  }

  drawParticles(state) {
    const { ctx } = this;
    for (const fx of state.particles) {
      const life = Math.max(0, fx.life / fx.max);
      if (fx.kind === 'smoke') {
        ctx.fillStyle = `rgba(70, 70, 78, ${(life * 0.4).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.size * (1.6 - life * 0.6), 0, Math.PI * 2); ctx.fill();
      } else if (fx.kind === 'spark') {
        ctx.strokeStyle = `rgba(255, 205, 80, ${(life * 0.9).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(fx.x, fx.y);
        ctx.lineTo(fx.x - fx.vx * 0.03, fx.y - fx.vy * 0.03);
        ctx.stroke();
      } else if (fx.kind === 'cash') {
        ctx.fillStyle = `rgba(125, 255, 138, ${life.toFixed(3)})`;
        ctx.font = 'bold 15px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('$', fx.x, fx.y);
      } else {
        ctx.fillStyle = fx.color;
        ctx.globalAlpha = life;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.size * life + 0.6, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  drawTracers(state) {
    const { ctx } = this;
    for (const t of state.tracers) {
      ctx.strokeStyle = `rgba(255, 230, 150, ${(0.75 * t.life / t.max).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------ the lights

  drawLights(state, view, pal) {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = (x, y, r, color, alpha) => {
      if (x < view.x0 - r || x > view.x1 + r || y < view.y0 - r || y > view.y1 + r) return;
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, color.replace('A', (alpha * pal.darkness).toFixed(3)));
      g.addColorStop(1, color.replace('A', '0'));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    for (const l of state.city.lights) glow(l.x, l.y, 46, 'rgba(255, 190, 90, A)', 0.17);
    // Windows: the whole grid glows faintly, a seeded few burn bright —
    // a regular lattice reads as a building, scattered dots would not.
    for (const b of state.city.buildings) {
      if (b.x + b.w < view.x0 || b.x > view.x1 || b.y + b.h < view.y0 || b.y > view.y1) continue;
      const lift = b.height * 0.3;
      const cols = Math.min(9, Math.floor(b.w / 17));
      const rows = Math.min(7, Math.floor(b.h / 17));
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const lit = hash(b.seed + i * 31 + j * 57) < pal.darkness * 0.5;
          ctx.fillStyle = lit ? 'rgba(255, 196, 105, 0.8)' : 'rgba(255, 214, 150, 0.13)';
          ctx.fillRect(b.x + 8 + i * 17, b.y - lift * 0.4 + 8 + j * 17, 8, 10);
        }
      }
    }
    // Headlight cones and police glow.
    const cone = (car) => {
      if (car.wrecked) return;
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      const g = ctx.createLinearGradient(16, 0, 128, 0);
      g.addColorStop(0, `rgba(255, 242, 190, ${(0.27 * pal.darkness).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255, 242, 190, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(16, -7); ctx.lineTo(128, -30); ctx.lineTo(128, 30); ctx.lineTo(16, 7);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      if (car.kind === 'police') {
        const phase = Math.sin(state.time * 11 + car.lightPhase) > 0;
        glow(car.x, car.y, 46, phase ? 'rgba(255, 60, 50, A)' : 'rgba(60, 130, 255, A)', 0.4);
      }
    };
    for (const car of state.cars) cone(car);
    for (const cop of state.police) cone(cop);
    if (state.player.car) cone(state.player.car);
    // The Rusty Anchor's neon, and the marina's string lights.
    glow(FIXER_BAR.x, FIXER_BAR.y - 60, 90, 'rgba(255, 110, 190, A)', 0.5);
    glow(3560, 2080, 80, 'rgba(120, 200, 255, A)', 0.3);
    ctx.restore();
  }

  drawVignette() {
    const { ctx } = this;
    const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.86);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // ------------------------------------------------------------ the HUD

  drawHUD(state, pal) {
    const { ctx } = this;
    this.drawMinimap(state);
    // Clock and cash, top right.
    const hours = Math.floor(state.timeOfDay * 24);
    const mins = Math.floor((state.timeOfDay * 24 - hours) * 60);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillText(`${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`, VIEW_W - 22, 24);
    ctx.font = 'bold 30px "Segoe UI", sans-serif';
    ctx.fillStyle = '#7dff8a';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 5;
    ctx.fillText(`$${state.player.cash.toLocaleString('en-US')}`, VIEW_W - 22, 56);
    ctx.shadowBlur = 0;
    // Health (and the car's, while driving).
    const bar = (y, label, frac, color) => {
      ctx.textAlign = 'left';
      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(label, VIEW_W - 268, y + 10);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      rr(ctx, VIEW_W - 232, y, 210, 12, 4); ctx.fill();
      ctx.fillStyle = color;
      if (frac > 0.01) { rr(ctx, VIEW_W - 232, y, 210 * Math.min(1, frac), 12, 4); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      rr(ctx, VIEW_W - 232, y, 210, 12, 4); ctx.stroke();
    };
    const hp = state.player.health / 100;
    bar(66, 'HP', hp, hp > 0.5 ? '#58c94e' : hp > 0.25 ? '#e8b93c' : '#e23b2e');
    if (state.player.car) bar(84, 'CAR', state.player.car.health / 100, '#6aa8d8');
    // Wanted stars, top centre.
    this.drawStars(state);
    // Mission panel, top left.
    this.drawMissionPanel(state);
    // Speed, bottom right, while driving.
    if (state.player.car) {
      ctx.textAlign = 'right';
      ctx.font = 'bold 26px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(`${Math.round(Math.abs(state.player.car.speed) * 0.42)}`, VIEW_W - 64, VIEW_H - 24);
      ctx.font = '13px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('km/h', VIEW_W - 22, VIEW_H - 24);
    }
    // Controls reminder, fading out as the player learns.
    if (state.playT < 26) {
      ctx.textAlign = 'right';
      ctx.font = '12.5px "Segoe UI", sans-serif';
      ctx.fillStyle = `rgba(255,255,255,${(0.62 * Math.min(1, (26 - state.playT) / 6)).toFixed(3)})`;
      ctx.fillText('WASD drive · E enter / exit · F punch · Click shoot · Shift run · P pause · M mute', VIEW_W - 22, VIEW_H - 52);
    }
    // Interaction prompt.
    if (state.prompt && state.screen === 'playing') {
      ctx.font = 'bold 16px "Segoe UI", sans-serif';
      const w = ctx.measureText(state.prompt).width + 30;
      const y = state.mission.dialogue.length ? VIEW_H - 218 : VIEW_H - 64;
      ctx.fillStyle = 'rgba(8, 10, 16, 0.82)';
      rr(ctx, VIEW_W / 2 - w / 2, y, w, 34, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(255, 217, 74, 0.7)';
      ctx.strokeRect(VIEW_W / 2 - w / 2, y, w, 34);
      ctx.fillStyle = '#ffd94a';
      ctx.textAlign = 'center';
      ctx.fillText(state.prompt, VIEW_W / 2, y + 23);
    }
    // The bust meter, while a collar is closing in.
    if (state.wanted.bust > 0.02 && state.screen === 'playing') {
      const w = 280;
      ctx.textAlign = 'center';
      ctx.font = 'bold 15px "Segoe UI", sans-serif';
      ctx.fillStyle = '#7ab5ff';
      ctx.fillText('BUSTED', VIEW_W / 2, VIEW_H - 128);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      rr(ctx, VIEW_W / 2 - w / 2, VIEW_H - 120, w, 11, 5); ctx.fill();
      ctx.fillStyle = '#3f7bd9';
      rr(ctx, VIEW_W / 2 - w / 2, VIEW_H - 120, w * state.wanted.bust, 11, 5); ctx.fill();
    }
    this.drawDialogue(state);
    this.drawBanner(state);
    void pal;
  }

  drawStars(state) {
    const { ctx } = this;
    const stars = state.wanted.stars;
    const cx = VIEW_W / 2;
    for (let i = 0; i < 5; i++) {
      const x = cx - 64 + i * 32;
      const active = i < stars;
      const pulse = active && i === stars - 1 && state.wanted.flashT > 0 ? 1 + Math.sin(state.time * 16) * 0.16 : 1;
      ctx.save();
      ctx.translate(x, 30);
      ctx.scale(pulse, pulse);
      star(ctx, 0, 0, 13);
      if (active) {
        ctx.fillStyle = '#ffd94a';
        ctx.shadowColor = 'rgba(255, 190, 40, 0.8)';
        ctx.shadowBlur = 9;
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();
    }
    if (stars > 0 && state.wanted.lastSeen > 2.2) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText('LOSING THEM…', cx, 56);
    }
  }

  drawMissionPanel(state) {
    const { ctx } = this;
    const panel = missionPanel(state);
    const obj = currentObjective(state);
    ctx.textAlign = 'left';
    if (!panel && !obj) return;
    const title = panel ? panel.title.toUpperCase() : 'FREE ROAM';
    const label = panel ? panel.label : obj.label;
    ctx.font = '15px "Segoe UI", sans-serif';
    const lines = wrapText(ctx, label, 300);
    const dist = obj ? Math.round(Math.hypot(obj.x - state.player.x, obj.y - state.player.y) / 9) : 0;
    const h = 34 + lines.length * 19 + (panel ? 20 : 6);
    ctx.fillStyle = 'rgba(8, 10, 16, 0.72)';
    rr(ctx, 16, 16, 336, h, 9); ctx.fill();
    ctx.fillStyle = '#ffd94a';
    ctx.fillRect(16, 16, 5, h);
    ctx.font = 'bold 13px "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffd94a';
    ctx.fillText(panel ? `JOB · ${title}` : title, 32, 37);
    ctx.font = '15px "Segoe UI", sans-serif';
    ctx.fillStyle = '#f5f0e6';
    lines.forEach((line, i) => ctx.fillText(line, 32, 60 + i * 19));
    if (panel) {
      ctx.font = '12.5px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      let foot = `Step ${panel.step} of ${panel.steps} · $${panel.reward} on delivery · ${dist} m`;
      if (panel.timeLeft !== null && panel.timeLeft !== undefined) {
        const s = Math.max(0, Math.ceil(panel.timeLeft));
        foot = `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} · ${foot}`;
      }
      ctx.fillText(foot, 32, 60 + lines.length * 19 + 2);
    } else {
      ctx.font = '12.5px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(`${dist} m`, 32, 60 + lines.length * 19 + 2);
    }
  }

  drawMinimap(state) {
    const { ctx } = this;
    const mw = 204;
    const mh = 146;
    const mx = 16;
    const my = VIEW_H - mh - 16;
    const sx = mw / WORLD_W;
    const sy = mh / WORLD_H;
    ctx.fillStyle = 'rgba(10, 16, 22, 0.85)';
    rr(ctx, mx, my, mw, mh, 8); ctx.fill();
    ctx.save();
    ctx.beginPath();
    rr(ctx, mx, my, mw, mh, 8); ctx.clip();
    // Land, beach and sea.
    ctx.fillStyle = '#4d6b43';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = '#8a7a4e';
    ctx.fillRect(mx + 2050 * sx, my + 2246 * sy, (WORLD_W - 2050) * sx, (WORLD_H - 2246) * sy); // docks apron
    ctx.fillStyle = '#d9c184';
    ctx.fillRect(mx + 3490 * sx, my, (3660 - 3490) * sx, mh);
    ctx.fillStyle = '#2b6ea6';
    ctx.fillRect(mx + 3660 * sx, my, (WORLD_W - 3660) * sx, mh);
    // Streets.
    ctx.strokeStyle = 'rgba(230, 235, 240, 0.55)';
    ctx.lineWidth = 1;
    for (const rx of ROADS_X) {
      ctx.beginPath(); ctx.moveTo(mx + rx * sx, my); ctx.lineTo(mx + rx * sx, my + mh); ctx.stroke();
    }
    for (const ry of ROADS_Y) {
      ctx.beginPath(); ctx.moveTo(mx, my + ry * sy); ctx.lineTo(mx + mw, my + ry * sy); ctx.stroke();
    }
    const dot = (x, y, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(mx + x * sx, my + y * sy, r, 0, Math.PI * 2); ctx.fill();
    };
    dot(SAFEHOUSE.x, SAFEHOUSE.y, 3.4, '#7dff8a');
    dot(HOSPITAL.x, HOSPITAL.y, 3, '#ffffff');
    dot(FIXER_BAR.x, FIXER_BAR.y, 3.4, '#ee6aa5');
    for (const cop of state.police) {
      dot(cop.x, cop.y, 3, Math.sin(state.time * 9 + cop.lightPhase) > 0 ? '#ff5040' : '#4a90ff');
    }
    const obj = currentObjective(state);
    if (obj) {
      const pulse = 4.6 + Math.sin(state.time * 4) * 1.2;
      ctx.strokeStyle = obj.color;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(mx + obj.x * sx, my + obj.y * sy, pulse, 0, Math.PI * 2); ctx.stroke();
      dot(obj.x, obj.y, 2.6, obj.color);
    }
    // The player: a white wedge pointing the way they face.
    const p = state.player;
    const ang = p.car ? p.car.angle : p.angle;
    ctx.save();
    ctx.translate(mx + p.x * sx, my + p.y * sy);
    ctx.rotate(ang);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(6.4, 0); ctx.lineTo(-4.4, -3.8); ctx.lineTo(-4.4, 3.8);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.4;
    rr(ctx, mx, my, mw, mh, 8); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = 'bold 10px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('VICE HARBOR', mx + 8, my + 14);
    ctx.textAlign = 'right';
    ctx.fillText('N ↑', mx + mw - 8, my + 14);
  }

  drawDialogue(state) {
    const { ctx } = this;
    const lines = state.mission.dialogue;
    if (!lines || lines.length === 0 || state.screen !== 'playing') return;
    const line = lines[0];
    const w = 660;
    const x = VIEW_W / 2 - w / 2;
    const y = VIEW_H - 108;
    ctx.fillStyle = 'rgba(8, 9, 15, 0.88)';
    rr(ctx, x, y, w, 88, 10); ctx.fill();
    ctx.fillStyle = line.name === 'Marla Vane' ? '#ee6aa5' : '#26a6a0';
    ctx.fillRect(x, y, 5, 88);
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px "Segoe UI", sans-serif';
    ctx.fillStyle = line.name === 'Marla Vane' ? '#ff9ecb' : '#7adcd4';
    ctx.fillText(line.name.toUpperCase(), x + 20, y + 24);
    ctx.font = '16.5px "Segoe UI", sans-serif';
    ctx.fillStyle = '#f5f0e6';
    wrapText(ctx, line.text, w - 44).slice(0, 3).forEach((l, i) => ctx.fillText(l, x + 20, y + 48 + i * 20));
    ctx.textAlign = 'right';
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('E ▸', x + w - 14, y + 80);
  }

  drawBanner(state) {
    const { ctx } = this;
    const b = state.mission.banner;
    if (!b) return;
    const fade = Math.min(1, b.t / 0.4, (b.seconds - b.t) / 0.6);
    if (fade <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    ctx.textAlign = 'center';
    ctx.font = '900 46px "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffd94a';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 10;
    ctx.fillText(b.title, VIEW_W / 2, 168);
    ctx.font = '19px "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(b.text, VIEW_W / 2, 200);
    ctx.restore();
  }

  // ------------------------------------------------------------ the screens

  drawTitle(state) {
    const { ctx } = this;
    // A Vice Harbor sunset: violet up top, tangerine at the horizon.
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    sky.addColorStop(0, '#1b1035');
    sky.addColorStop(0.42, '#5b2a6e');
    sky.addColorStop(0.66, '#c94f6d');
    sky.addColorStop(0.84, '#f28c4b');
    sky.addColorStop(1, '#f7b733');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // The sun, low over the bay.
    const sunG = ctx.createRadialGradient(880, 486, 8, 880, 486, 120);
    sunG.addColorStop(0, 'rgba(255, 224, 140, 0.95)');
    sunG.addColorStop(0.4, 'rgba(255, 190, 90, 0.55)');
    sunG.addColorStop(1, 'rgba(255, 170, 80, 0)');
    ctx.fillStyle = sunG;
    ctx.fillRect(740, 346, 280, 280);
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(880, 486, 46, 0, Math.PI * 2); ctx.fill();
    // Two skyline layers with lit windows.
    const skyline = (base, hMin, hMax, color, seedBase) => {
      ctx.fillStyle = color;
      let x = -10;
      let i = 0;
      while (x < VIEW_W + 10) {
        const w = 34 + hash(seedBase + i) * 60;
        const h = hMin + hash(seedBase + i * 3.7) * (hMax - hMin);
        ctx.fillRect(x, base - h, w, h + (VIEW_H - base));
        ctx.fillStyle = 'rgba(255, 205, 110, 0.85)';
        for (let wy = base - h + 12; wy < base - 14; wy += 15) {
          for (let wx = x + 6; wx < x + w - 8; wx += 12) {
            if (hash(seedBase + i * 91 + wx * 0.7 + wy) < 0.4) ctx.fillRect(wx, wy, 5, 7);
          }
        }
        ctx.fillStyle = color;
        x += w + 4 + hash(seedBase + i * 7.3) * 16;
        i++;
      }
    };
    skyline(660, 120, 300, '#41255c', 13);
    skyline(716, 60, 190, '#221236', 47);
    // The bay in front, with the sun's reflection.
    ctx.fillStyle = '#2a1b47';
    ctx.fillRect(0, 716, VIEW_W, VIEW_H - 716);
    ctx.fillStyle = 'rgba(255, 190, 100, 0.5)';
    for (let i = 0; i < 26; i++) {
      const y = 724 + i * 3.1;
      const w = 90 - i * 2.6 + Math.sin(state.time * 2 + i) * 8;
      ctx.fillRect(880 - w / 2, y, w, 1.6);
    }
    // Palm silhouettes.
    ctx.strokeStyle = '#160a28';
    for (const [px, py, s] of [[92, 726, 1.25], [1180, 736, 1.5], [210, 742, 0.9]]) {
      ctx.lineWidth = 7 * s;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + 12 * s, py - 52 * s, px + 26 * s, py - 88 * s); ctx.stroke();
      ctx.lineWidth = 5 * s;
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * (0.08 + i * 0.17);
        ctx.beginPath();
        ctx.moveTo(px + 26 * s, py - 88 * s);
        ctx.quadraticCurveTo(px + 26 * s + Math.cos(a) * 30 * s, py - 88 * s - Math.sin(a) * 22 * s - 6, px + 26 * s + Math.cos(a) * 52 * s, py - 88 * s - Math.sin(a) * 30 * s + 12 * s);
        ctx.stroke();
      }
    }
    // The name of the game.
    ctx.textAlign = 'center';
    const titleG = ctx.createLinearGradient(0, 130, 0, 240);
    titleG.addColorStop(0, '#ffe259');
    titleG.addColorStop(0.55, '#ffa751');
    titleG.addColorStop(1, '#ff5e8a');
    ctx.font = '900 104px "Segoe UI", sans-serif';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(24, 6, 36, 0.85)';
    ctx.strokeText('VICE HARBOR', VIEW_W / 2, 226);
    ctx.fillStyle = titleG;
    ctx.fillText('VICE HARBOR', VIEW_W / 2, 226);
    ctx.font = 'italic 21px "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffe9c9';
    ctx.fillText('An open-world crime story — steal it, run it, deliver it, disappear.', VIEW_W / 2, 268);

    if (state.showHelp) {
      ctx.fillStyle = 'rgba(10, 8, 20, 0.82)';
      rr(ctx, VIEW_W / 2 - 330, 330, 660, 330, 12); ctx.fill();
      ctx.textAlign = 'left';
      ctx.font = '17px "Segoe UI", sans-serif';
      ctx.fillStyle = '#f5f0e6';
      const help = [
        'WASD / Arrows — walk and drive        Shift — run',
        'E — enter or steal a car, talk, advance talk',
        'F — punch        Mouse — aim, Click — shoot',
        'P — pause        M — mute        The game saves itself',
        '',
        'Work Marla Vane\'s five jobs from The Rusty Anchor,',
        'mind the stars, and lose the Harbor PD in the alleys.',
        'Busted or wasted, you lose cash — never the story.',
      ];
      help.forEach((line, i) => ctx.fillText(line, VIEW_W / 2 - 296, 380 + i * 30));
      ctx.textAlign = 'center';
      ctx.font = 'bold 16px "Segoe UI", sans-serif';
      ctx.fillStyle = '#ffd94a';
      ctx.fillText('ENTER — back', VIEW_W / 2, 632);
      return;
    }
    // The menu.
    ctx.font = 'bold 25px "Segoe UI", sans-serif';
    state.menuItems.forEach((item, i) => {
      const y = 420 + i * 52;
      const selected = i === state.titleSel;
      if (selected) {
        ctx.fillStyle = '#ffd94a';
        ctx.fillText(`▸ ${item.label} ◂`, VIEW_W / 2, y);
      } else {
        ctx.fillStyle = 'rgba(255, 244, 224, 0.78)';
        ctx.fillText(item.label, VIEW_W / 2, y);
      }
    });
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255, 240, 214, 0.75)';
    ctx.fillText('↑ ↓ choose · ENTER start · Everything drawn and synthesized in code — no downloads, no network', VIEW_W / 2, 640);
  }

  drawPaused(state) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(6, 7, 14, 0.66)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.font = '900 58px "Segoe UI", sans-serif';
    ctx.fillStyle = '#f5f0e6';
    ctx.fillText('PAUSED', VIEW_W / 2, 330);
    ctx.font = '18px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('ENTER or P — back to the streets', VIEW_W / 2, 386);
    ctx.fillText('S — save now · M — mute', VIEW_W / 2, 418);
    if (state.saveToast > 0) {
      ctx.font = 'bold 17px "Segoe UI", sans-serif';
      ctx.fillStyle = '#7dff8a';
      ctx.fillText('Saved.', VIEW_W / 2, 462);
    }
  }

  drawEndScreen(state, word, color, sub) {
    const { ctx } = this;
    ctx.fillStyle = word === 'BUSTED' ? 'rgba(6, 12, 34, 0.62)' : 'rgba(30, 4, 4, 0.62)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    try { ctx.letterSpacing = '14px'; } catch { /* older engines */ }
    ctx.font = '900 92px "Segoe UI", sans-serif';
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 14;
    ctx.fillText(word, VIEW_W / 2, 350);
    ctx.shadowBlur = 0;
    try { ctx.letterSpacing = '0px'; } catch { /* older engines */ }
    ctx.font = '19px "Segoe UI", sans-serif';
    ctx.fillStyle = '#f5f0e6';
    wrapText(ctx, sub, 640).forEach((line, i) => ctx.fillText(line, VIEW_W / 2, 402 + i * 26));
    if (Math.sin(state.time * 4) > -0.2) {
      ctx.font = 'bold 17px "Segoe UI", sans-serif';
      ctx.fillStyle = '#ffd94a';
      ctx.fillText('Press ENTER to get back up', VIEW_W / 2, 486);
    }
  }
}
