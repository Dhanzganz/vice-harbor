// Vice Harbor — staged scenes for screenshots (?shot=<name>&seed=7).
// Each scene drops the player into a composed moment with the HUD live, so
// the kit's screenshot pass captures real gameplay frames: a sunset drive
// downtown, Marla's first brief, a night police chase, and the beach strip.

import { ANCHOR, BEACH_KIOSK } from './config.js';
import { makeCar, makePed } from './entities.js';
import { showDialogue } from './missions.js';

function trafficAt(G, x, y, angle, color) {
  const c = makeCar(x, y, angle, 'traffic', G.rng, color ? { color } : {});
  c.hasDriver = true;
  G.cars.push(c);
  return c;
}

function pedAt(G, x, y) {
  const p = makePed(x, y, G.rng);
  G.peds.push(p);
  return p;
}

export function applyShot(G, name) {
  const p = G.player;
  G.mode = 'play'; // skip the title screen; the scene IS the first frame
  if (name === 'cover') {
    // Sunset drive through downtown, two stars up, traffic around.
    G.tod = 18.55;
    const car = makeCar(2180, 1150, Math.PI / 2, 'traffic', G.rng, { color: '#c94f4f' });
    car.hasDriver = false; car.speed = 120;
    G.cars.push(car);
    p.car = car; p.x = car.x; p.y = car.y; p.angle = car.angle;
    G.setWanted(2);
    trafficAt(G, 2180, 890, Math.PI / 2, '#4f7ec9');
    trafficAt(G, 2122, 1330, -Math.PI / 2, '#e0b64f');
    trafficAt(G, 1900, 900, 0, '#5fc95f');
    trafficAt(G, 1580, 700, Math.PI / 2, '#e8e8ec');
    const cop = makeCar(2180, 1420, Math.PI / 2, 'police', G.rng, {});
    G.cars.push(cop);
    pedAt(G, 2245, 1010); pedAt(G, 2115, 1240); pedAt(G, 2050, 905);
    G.missions.idx = 1;
  } else if (name === 'mission') {
    // On foot at the Anchor while Marla gives the first brief.
    G.tod = 17.4;
    p.x = ANCHOR.x + 8; p.y = ANCHOR.y + 16; p.angle = Math.PI;
    G.missions.idx = 0;
    showDialogue(G, ['Marla: You drive, you don\'t ask. There\'s a coupe on the dock road with my name on it.']);
    if (G.dialog) G.dialog.t = -999; // hold the line for the capture
    trafficAt(G, 1580, 2030, 0, '#4fc9c0');
    trafficAt(G, 2400, 2090, Math.PI, '#7a5fc9');
    pedAt(G, ANCHOR.x - 90, ANCHOR.y + 30);
    pedAt(G, ANCHOR.x + 120, ANCHOR.y - 6);
  } else if (name === 'chase') {
    // Night chase on the north road: three cruisers, lights strobing.
    G.tod = 23.15;
    const car = makeCar(1500, 320, 0, 'traffic', G.rng, { color: '#30303a' });
    car.hasDriver = false; car.speed = 235;
    G.cars.push(car);
    p.car = car; p.x = car.x; p.y = car.y; p.angle = 0;
    G.setWanted(4);
    const spots = [[1290, 292], [1300, 352], [1080, 320]];
    for (const [x, y] of spots) {
      const cop = makeCar(x, y, 0, 'police', G.rng, {});
      cop.speed = 228;
      G.cars.push(cop);
    }
    trafficAt(G, 1980, 292, 0, '#c95fb0');
    trafficAt(G, 900, 352, Math.PI, '#e07f3f');
    pedAt(G, 1620, 250);
  } else if (name === 'beach') {
    // Morning on the sand: kiosk, palms, coastal traffic, strollers.
    G.tod = 9.6;
    p.x = BEACH_KIOSK.x + 66; p.y = BEACH_KIOSK.y + 88; p.angle = -Math.PI / 3;
    trafficAt(G, 3260, 900, Math.PI / 2, '#e0b64f');
    trafficAt(G, 3260, 1420, -Math.PI / 2, '#4f7ec9');
    trafficAt(G, 3202, 1180, Math.PI / 2, '#e8e8ec');
    pedAt(G, 3400, 1060); pedAt(G, 3470, 1260); pedAt(G, 3380, 1330); pedAt(G, 3520, 1120);
    G.missions.idx = 2;
  }
  // Camera settles on the player for every scene.
  G.cam.x = Math.max(0, Math.min(3800 - 1280, p.x - 640));
  G.cam.y = Math.max(0, Math.min(2600 - 800, p.y - 400));
}
