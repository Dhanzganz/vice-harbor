// Vice Harbor — all drawing: the city, vehicles, people, day/night lighting,
// HUD, minimap, dialogue and the title/pause screens. Pure canvas 2D, no
// images; every visual is drawn from the world data in code.

import { WORLD, ROADS_X, ROADS_Y, ROAD_W, ANCHOR, SAFEHOUSE, SKY_KEYS, darknessAt, districtAt } from './config.js';
import { world } from './world.js';
import { clamp, lerp, mulberry32 } from './random.js';
import { objective } from './missions.js';

const VW = 1280, VH = 800;

function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function skyColor(hour) {
  let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    if (hour >= SKY_KEYS[i][0] && hour <= SKY_KEYS[i + 1][0]) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
  }
  const t = b[0] === a[0] ? 0 : (hour - a[0]) / (b[0] - a[0]);
  const ca = hexRgb(a[1]), cb = hexRgb(b[1]);
  return `rgb(${Math.round(lerp(ca[0], cb[0], t))},${Math.round(lerp(ca[1], cb[1], t))},${Math.round(lerp(ca[2], cb[2], t))})`;
}

function panel(ctx, x, y, w, h, alpha = 0.72) {
  ctx.fillStyle = `rgba(8,10,18,${alpha})`;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8); else ctx.rect(x, y, w, h);
  ctx.fill();
}

export function render(G, ctx) {
  const cam = G.cam;
  const dark = darknessAt(G.tod);
  ctx.fillStyle = skyColor(G.tod);
  ctx.fillRect(0, 0, VW, VH);
  ctx.save();
  ctx.translate(-Math.round(cam.x + (G.shake ? (Math.random() - 0.5) * G.shake : 0)), -Math.round(cam.y + (G.shake ? (Math.random() - 0.5) * G.shake : 0)));
  drawGround(G, ctx, dark);
  drawRoads(ctx);
  drawCrates(ctx);
  drawBuildings(ctx, dark);
  drawPalms(ctx);
  drawMarkers(G, ctx);
  for (const ped of G.peds) drawPed(ctx, ped, false);
  drawMarla(G, ctx);
  for (const car of G.cars) drawCar(G, ctx, car, dark);
  if (!G.player.car) drawPed(ctx, G.player, true);
  drawEffects(G, ctx);
  ctx.restore();
  if (dark > 0.03) drawNight(G, ctx, dark);
  drawObjectiveArrow(G, ctx);
  if (G.mode !== 'title') drawHUD(G, ctx);
  if (G.dialog) drawDialogue(G, ctx);
  if (G.bannerT > 0) drawBanner(G, ctx);
  if (G.mode === 'title') drawTitle(G, ctx);
  if (G.mode === 'pause') drawPause(G, ctx);
}

function inView(x, y, cam, m = 90) { return x > cam.x - m && x < cam.x + VW + m && y > cam.y - m && y < cam.y + VH + m; }

function drawGround(G, ctx, dark) {
  const cam = G.cam;
  // Region painter clipped to the viewport, so off-screen districts cost
  // nothing and never wrap around with negative sizes.
  const paint = (color, x0, y0, x1, y1) => {
    const ax = Math.max(x0, cam.x - 20), ay = Math.max(y0, cam.y - 20);
    const bx = Math.min(x1, cam.x + VW + 20), by = Math.min(y1, cam.y + VH + 20);
    if (bx <= ax || by <= ay) return;
    ctx.fillStyle = color;
    ctx.fillRect(ax, ay, bx - ax, by - ay);
  };
  paint('#414a44', 0, 0, WORLD.w, WORLD.h);          // midtown base
  paint('#48603f', 0, 0, 1100, 1750);                // suburbs
  paint('#3d4450', 1100, 500, 2600, 1750);           // downtown slab
  paint('#4a4640', 0, 2140, 3318, WORLD.h);          // docks
  paint('#c9b183', 3318, 0, 3620, WORLD.h);          // sand
  // Water with slow wave stripes east of the sand.
  ctx.fillStyle = '#1d5f7a';
  ctx.fillRect(Math.max(cam.x - 20, 3620), cam.y - 20, VW + 40, VH + 40);
  ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 2;
  const off = (G.time * 22) % 46;
  ctx.beginPath();
  for (let y = cam.y - 46 + off; y < cam.y + VH + 46; y += 46) {
    for (let x = 3640; x < Math.min(cam.x + VW + 40, WORLD.w); x += 90) { ctx.moveTo(x, y); ctx.lineTo(x + 44, y); }
  }
  ctx.stroke();
  void dark;
}

function drawRoads(ctx) {
  // Roads are drawn in world space (the caller has already translated by the
  // camera): pale sidewalk slab first, asphalt on top, dashed centre-lines.
  ctx.fillStyle = '#5a5e63';
  for (const rx of ROADS_X) ctx.fillRect(rx - ROAD_W / 2 - 7, 0, ROAD_W + 14, WORLD.h);
  for (const ry of ROADS_Y) ctx.fillRect(0, ry - ROAD_W / 2 - 7, WORLD.w, ROAD_W + 14);
  ctx.fillStyle = '#33373c';
  for (const rx of ROADS_X) ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD.h);
  for (const ry of ROADS_Y) ctx.fillRect(0, ry - ROAD_W / 2, WORLD.w, ROAD_W);
  ctx.strokeStyle = 'rgba(240,220,120,0.55)'; ctx.lineWidth = 3; ctx.setLineDash([26, 30]);
  ctx.beginPath();
  for (const rx of ROADS_X) { ctx.moveTo(rx, 0); ctx.lineTo(rx, WORLD.h); }
  for (const ry of ROADS_Y) { if (ry !== 2060 || true) { ctx.moveTo(0, ry); ctx.lineTo(3318, ry); } }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawCrates(ctx) {
  for (const c of world.crates) {
    ctx.fillStyle = c.color; ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + c.w, c.y + c.h); ctx.moveTo(c.x + c.w, c.y); ctx.lineTo(c.x, c.y + c.h); ctx.stroke();
  }
}

function drawBuildings(ctx, dark) {
  for (const b of world.buildings) {
    const lift = b.floors * 3.2;
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(b.x + 5, b.y + 7, b.w, b.h);
    ctx.fillStyle = shade(b.color, -38);
    ctx.fillRect(b.x, b.y + lift, b.w, b.h - lift + 2); // south face
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h - lift);
    ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, Math.max(4, b.h - lift - 4));
    // Rooftop clutter + a deterministic window strip along the south edge.
    const rng = mulberry32(b.winSeed);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    const ac = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < ac; i++) ctx.fillRect(b.x + 8 + rng() * (b.w - 30), b.y + 6 + rng() * Math.max(4, b.h - lift - 26), 13, 9);
    const cols = Math.max(2, Math.floor(b.w / 17));
    for (let i = 0; i < cols; i++) {
      const lit = rng() < (dark > 0.25 ? 0.55 : 0.16);
      ctx.fillStyle = lit ? (dark > 0.25 ? '#ffd98a' : '#bcd6e8') : 'rgba(20,26,36,0.55)';
      ctx.fillRect(b.x + 7 + i * 17, b.y + b.h - lift - 4, 8, 3.4);
    }
    if (b.name) {
      ctx.fillStyle = '#ffe9b0';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, b.x + b.w / 2, b.y - 7);
    }
  }
}

function shade(hex, amt) {
  const [r, g, b] = hexRgb(hex);
  return `rgb(${clamp(r + amt, 0, 255)},${clamp(g + amt, 0, 255)},${clamp(b + amt, 0, 255)})`;
}

function drawPalms(ctx) {
  ctx.strokeStyle = '#2e6b34'; ctx.lineWidth = 3;
  for (const p of world.palms) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + p.x * 0.01;
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(p.x + Math.cos(a) * 11 * p.s, p.y + Math.sin(a) * 11 * p.s - 3, p.x + Math.cos(a) * 17 * p.s, p.y + Math.sin(a) * 17 * p.s + 3);
    }
    ctx.stroke();
    ctx.fillStyle = '#6e5230';
    ctx.beginPath(); ctx.arc(p.x, p.y, 3.4 * p.s, 0, Math.PI * 2); ctx.fill();
  }
}

function drawMarkers(G, ctx) {
  const o = objective(G);
  if (o && G.mode !== 'title') {
    const bob = Math.sin(G.time * 3.4) * 6;
    ctx.strokeStyle = 'rgba(255,214,80,0.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(o.x, o.y, 30 + Math.sin(G.time * 3.4) * 4, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,214,80,0.20)';
    ctx.fillRect(o.x - 3, o.y - 190, 6, 190);
    ctx.fillStyle = '#ffd650';
    ctx.save(); ctx.translate(o.x, o.y - 44 + bob); ctx.rotate(Math.PI / 4);
    ctx.fillRect(-10, -10, 20, 20); ctx.restore();
  }
  // Safehouse door glow.
  ctx.fillStyle = '#7fe8a8';
  ctx.beginPath(); ctx.arc(SAFEHOUSE.x, SAFEHOUSE.y, 7 + Math.sin(G.time * 2.4) * 1.6, 0, Math.PI * 2); ctx.fill();
}

function drawMarla(G, ctx) {
  if (Math.abs(G.player.x - ANCHOR.x) > 700 && G.mode !== 'title') return;
  const marla = { x: ANCHOR.x - 26, y: ANCHOR.y + 6, angle: Math.PI / 2, skin: '#c98d64', shirt: '#8a2f4f', walk: 0 };
  drawPed(ctx, marla, false);
  ctx.fillStyle = '#ffe9b0'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Marla Vane', marla.x, marla.y - 24);
}

function drawPed(ctx, p, isPlayer) {
  const bob = p.state === 'down' ? 0 : Math.sin(p.walk || 0) * 1.6;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(0, 5, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
  if (p.state === 'down') {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = p.shirt || '#888'; ctx.fillRect(-6, -12, 12, 24);
    ctx.fillStyle = p.skin || '#e8c39e'; ctx.beginPath(); ctx.arc(0, -15, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(p.angle + Math.PI / 2);
  ctx.fillStyle = isPlayer ? '#1f8a8a' : (p.shirt || '#888');
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-8, -9 + bob * 0.2, 16, 19, 6); else ctx.rect(-8, -9, 16, 19);
  ctx.fill();
  if (isPlayer) { ctx.fillStyle = '#ffd650'; ctx.fillRect(-8, 2, 16, 3.4); }
  ctx.fillStyle = p.skin || '#e8c39e';
  ctx.beginPath(); ctx.arc(0, -2 + bob * 0.2, 6.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawCar(G, ctx, car, dark) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath(); ctx.ellipse(3, 6, 26, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(car.angle);
  // Headlight cones (drawn under the body, only when dark).
  if (dark > 0.2) {
    const grad = ctx.createLinearGradient(24, 0, 190, 0);
    grad.addColorStop(0, 'rgba(255,240,180,0.35)');
    grad.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(24, -8); ctx.lineTo(190, -34); ctx.lineTo(190, 34); ctx.lineTo(24, 8); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = car.dead ? '#3a3a3a' : car.color;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-23, -12, 46, 24, 6); else ctx.rect(-23, -12, 46, 24);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-23, -12, 7, 24); ctx.fillRect(17, -12, 6, 24);
  ctx.fillStyle = '#a8d4e8';
  ctx.fillRect(3, -9.4, 8, 18.8);
  ctx.fillStyle = 'rgba(16,20,28,0.85)';
  ctx.fillRect(-11, -9.4, 12, 18.8);
  ctx.fillStyle = '#ffe98a';
  ctx.fillRect(21.4, -9, 2.4, 5); ctx.fillRect(21.4, 4, 2.4, 5);
  ctx.fillStyle = '#ff5a4f';
  ctx.fillRect(-24.4, -9, 2.4, 5); ctx.fillRect(-24.4, 4, 2.4, 5);
  if (car.kind === 'police') {
    ctx.fillStyle = '#20306e'; ctx.fillRect(-13, -12, 26, 5); ctx.fillRect(-13, 7, 26, 5);
    const flash = Math.floor(G.time * 5) % 2 === 0;
    ctx.fillStyle = flash ? '#ff3b30' : '#3b6bff';
    ctx.fillRect(-4, -5, 8, 10);
    ctx.fillStyle = flash ? '#3b6bff' : '#ff3b30';
    ctx.fillRect(-4, -5, 8, 4);
  }
  if (car.marked) {
    ctx.fillStyle = '#ffd650';
    ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('★', 0, 5);
  }
  ctx.restore();
  if (car.dead || car.health < 45) {
    ctx.fillStyle = `rgba(60,60,60,${0.25 + 0.2 * Math.sin(G.time * 7 + car.id)})`;
    ctx.beginPath(); ctx.arc(car.x + 8, car.y - 8, car.dead ? 13 : 8, 0, Math.PI * 2); ctx.fill();
  }
  if (car.kind === 'mission') {
    ctx.fillStyle = '#ff7ae0'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('RIVAL', car.x, car.y - 26);
  }
}

function drawEffects(G, ctx) {
  ctx.strokeStyle = 'rgba(255,230,140,0.9)'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (const t of G.tracers) { ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); }
  ctx.stroke();
  for (const pt of G.particles) {
    ctx.fillStyle = pt.color;
    ctx.globalAlpha = clamp(pt.t / pt.max, 0, 1);
    ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
}

function drawNight(G, ctx, dark) {
  ctx.fillStyle = `rgba(5,8,28,${dark * 0.52})`;
  ctx.fillRect(0, 0, VW, VH);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const cam = G.cam;
  for (const l of world.lights) {
    const sx = l.x - cam.x, sy = l.y - cam.y;
    if (sx < -70 || sx > VW + 70 || sy < -70 || sy > VH + 70) continue;
    const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, 52);
    g.addColorStop(0, 'rgba(255,205,110,0.34)');
    g.addColorStop(1, 'rgba(255,205,110,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx, sy, 52, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// Screen-edge arrow toward the objective when it is off-screen.
function drawObjectiveArrow(G, ctx) {
  if (G.mode !== 'play') return;
  const o = objective(G);
  if (!o) return;
  const sx = o.x - G.cam.x, sy = o.y - G.cam.y;
  if (sx > 30 && sx < VW - 30 && sy > 30 && sy < VH - 30) return;
  const cx = VW / 2, cy = VH / 2;
  const a = Math.atan2(sy - cy, sx - cx);
  const ax = clamp(cx + Math.cos(a) * (VW / 2 - 44), 34, VW - 34);
  const ay = clamp(cy + Math.sin(a) * (VH / 2 - 44), 34, VH - 34);
  ctx.save();
  ctx.translate(ax, ay); ctx.rotate(a);
  ctx.fillStyle = '#ffd650';
  ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-9, -9); ctx.lineTo(-9, 9); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawHUD(G, ctx) {
  const p = G.player;
  panel(ctx, 14, 14, 252, 86);
  ctx.fillStyle = '#7fe8a8'; ctx.font = 'bold 21px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(`$${G.cash.toLocaleString('en-US')}`, 26, 42);
  ctx.fillStyle = '#e8e8e8'; ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(districtAt(p.x, p.y).toUpperCase() + `  ·  ${formatHour(G.tod)}`, 26, 62);
  // Health bar.
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(26, 70, 150, 9);
  ctx.fillStyle = p.hp > 30 ? '#59c96a' : '#ff5a4f';
  ctx.fillRect(26, 70, 150 * clamp(p.hp / 100, 0, 1), 9);
  ctx.fillStyle = '#e8e8e8'; ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('HP', 182, 79);

  // Wanted stars, top centre.
  const stars = Math.ceil(G.heat - 0.001);
  ctx.font = '26px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < stars ? (Math.floor(G.time * 4) % 2 && stars >= 4 ? '#ff5a4f' : '#ffd650') : 'rgba(255,255,255,0.22)';
    ctx.fillText('★', VW / 2 - 64 + i * 32, 40);
  }
  if (G.heat > 0 && G.lastSeen > 1.2) {
    ctx.fillStyle = '#9fd8ff'; ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('LOSING THEM…', VW / 2, 62);
  }

  // Mission panel under the cash panel.
  const o = objective(G);
  const title = G.missions.active ? `${G.missions.active.def.title}` : (G.missions.idx < 5 ? `Next job: ${['First Errand', 'Hot Package', 'Rival Colors', 'Cool Off', 'Harbor Run'][G.missions.idx]}` : 'Free roam');
  panel(ctx, 14, 108, 330, 56, 0.6);
  ctx.fillStyle = '#ffd650'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(title, 26, 129);
  ctx.fillStyle = '#e8e8e8'; ctx.font = '12px system-ui, sans-serif';
  if (o) {
    const d = Math.round(Math.hypot(o.x - p.x, o.y - p.y));
    ctx.fillText(`${o.label} — ${d}m`, 26, 150);
  } else ctx.fillText('Free roam — the city is yours.', 26, 150);

  drawMinimap(G, ctx);

  if (p.car) {
    panel(ctx, VW - 216, VH - 92, 202, 78);
    ctx.fillStyle = '#e8e8e8'; ctx.font = 'bold 24px system-ui, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(Math.abs(p.car.speed) * 0.62)}`, VW - 66, VH - 46);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('mph', VW - 26, VH - 46);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(VW - 202, VH - 34, 176, 8);
    ctx.fillStyle = p.car.health > 35 ? '#59c96a' : '#ff5a4f';
    ctx.fillRect(VW - 202, VH - 34, 176 * clamp(p.car.health / 100, 0, 1), 8);
    ctx.fillStyle = '#bcd6e8'; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('CAR', VW - 202, VH - 52);
  }

  if (G.prompt) {
    panel(ctx, VW / 2 - 190, VH - 128, 380, 40, 0.8);
    ctx.fillStyle = '#ffe9b0'; ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(G.prompt, VW / 2, VH - 102);
  }
  ctx.fillStyle = 'rgba(232,232,232,0.55)'; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('WASD move · Shift run · F punch · Click shoot · E car/talk · P pause', 16, VH - 12);
}

function drawMinimap(G, ctx) {
  const w = 200, h = 137, x = VW - w - 14, y = 14;
  const sx = w / WORLD.w, sy = h / WORLD.h;
  panel(ctx, x - 4, y - 4, w + 8, h + 8, 0.78);
  ctx.fillStyle = '#232a30'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#c9b183'; ctx.fillRect(x + 3318 * sx, y, (3620 - 3318) * sx, h);
  ctx.fillStyle = '#1d5f7a'; ctx.fillRect(x + 3620 * sx, y, (WORLD.w - 3620) * sx, h);
  ctx.strokeStyle = 'rgba(220,225,230,0.5)'; ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (const rx of ROADS_X) { ctx.moveTo(x + rx * sx, y); ctx.lineTo(x + rx * sx, y + h); }
  for (const ry of ROADS_Y) { ctx.moveTo(x, y + ry * sy); ctx.lineTo(x + w, y + ry * sy); }
  ctx.stroke();
  const blip = (wx, wy, color, r = 2.6) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + wx * sx, y + wy * sy, r, 0, Math.PI * 2); ctx.fill(); };
  blip(SAFEHOUSE.x, SAFEHOUSE.y, '#7fe8a8');
  blip(ANCHOR.x, ANCHOR.y, '#e8a33f');
  const o = objective(G);
  if (o) blip(o.x, o.y, '#ffd650', 3.4);
  for (const c of G.cars) if (c.kind === 'police') blip(c.x, c.y, Math.floor(G.time * 4) % 2 ? '#ff5a4f' : '#5a8aff', 2.4);
  const p = G.player;
  blip(p.x, p.y, '#ffffff', 3.6);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(x + p.x * sx, y + p.y * sy); ctx.lineTo(x + p.x * sx + Math.cos(p.angle) * 8, y + p.y * sy + Math.sin(p.angle) * 8); ctx.stroke();
}

function drawDialogue(G, ctx) {
  const d = G.dialog;
  const line = d.lines[d.i];
  if (!line) return;
  panel(ctx, VW / 2 - 330, VH - 86, 660, 58, 0.86);
  ctx.fillStyle = '#ffd650'; ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textAlign = 'left';
  const speaker = line.includes(':') ? line.split(':')[0] : 'VICE HARBOR';
  ctx.fillText(speaker, VW / 2 - 312, VH - 62);
  ctx.fillStyle = '#f2f2f2'; ctx.font = '14px system-ui, sans-serif';
  wrapText(ctx, line.includes(':') ? line.slice(line.indexOf(':') + 1).trim() : line, VW / 2 - 312, VH - 42, 624, 17);
}

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '', yy = y;
  for (const w of words) {
    if (ctx.measureText(line + w).width > maxW && line) { ctx.fillText(line, x, yy); line = ''; yy += lh; }
    line += w + ' ';
  }
  ctx.fillText(line, x, yy);
}

function drawBanner(G, ctx) {
  ctx.fillStyle = `rgba(8,10,18,${clamp(G.bannerT, 0, 0.85)})`;
  ctx.fillRect(0, VH / 2 - 64, VW, 96);
  ctx.fillStyle = '#ffd650'; ctx.font = 'bold 34px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(G.bannerText, VW / 2, VH / 2);
  if (G.bannerSub) { ctx.fillStyle = '#e8e8e8'; ctx.font = '16px system-ui, sans-serif'; ctx.fillText(G.bannerSub, VW / 2, VH / 2 + 30); }
}

function drawTitle(G, ctx) {
  const grad = ctx.createLinearGradient(0, 0, 0, VH);
  grad.addColorStop(0, 'rgba(10,8,30,0.25)');
  grad.addColorStop(1, 'rgba(10,8,30,0.78)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff5f8a'; ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText('W E L C O M E   T O', VW / 2, 218);
  ctx.fillStyle = '#ffd650'; ctx.font = '900 92px system-ui, sans-serif';
  ctx.fillText('VICE HARBOR', VW / 2, 312);
  ctx.fillStyle = '#e8f4ff'; ctx.font = '18px system-ui, sans-serif';
  ctx.fillText('An open-world crime sandbox in one HTML file — steal, drive, run, survive.', VW / 2, 352);
  panel(ctx, VW / 2 - 250, 420, 500, 168, 0.82);
  ctx.fillStyle = '#ffe9b0'; ctx.font = 'bold 19px system-ui, sans-serif';
  ctx.fillText('ENTER — New Game', VW / 2, 462);
  ctx.fillStyle = G.saveExists ? '#ffe9b0' : 'rgba(232,232,232,0.35)';
  ctx.fillText('C — Continue', VW / 2, 496);
  ctx.fillStyle = '#cfe0ee'; ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('WASD / arrows — move & drive      Shift — run', VW / 2, 532);
  ctx.fillText('F — punch      Mouse — aim & shoot      E — enter car / talk', VW / 2, 556);
  ctx.fillText('P / Esc — pause (auto-saves)', VW / 2, 580);
  ctx.fillStyle = 'rgba(232,232,232,0.6)'; ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('Five jobs for Marla Vane at The Rusty Anchor stand between you and the harbor.', VW / 2, 640);
}

function drawPause(G, ctx) {
  ctx.fillStyle = 'rgba(5,6,14,0.62)'; ctx.fillRect(0, 0, VW, VH);
  panel(ctx, VW / 2 - 210, VH / 2 - 130, 420, 250, 0.9);
  ctx.fillStyle = '#ffd650'; ctx.font = 'bold 34px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('PAUSED', VW / 2, VH / 2 - 76);
  ctx.fillStyle = '#e8e8e8'; ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('Progress saved.', VW / 2, VH / 2 - 36);
  ctx.fillText(`Cash $${G.cash.toLocaleString('en-US')} · Jobs done ${G.missions.idx}/5`, VW / 2, VH / 2 - 6);
  ctx.fillText('P / Esc — resume', VW / 2, VH / 2 + 40);
  ctx.fillText('ENTER — new game (resets progress)', VW / 2, VH / 2 + 72);
}

export function formatHour(tod) {
  const h = Math.floor(tod), m = Math.floor((tod - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
