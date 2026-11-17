// Vice Harbor — staged scenes for the entry's screenshots.
// A `?shot=<name>&seed=<n>` URL freezes the game into one composed, deterministic
// frame: the cover at sunset, a mission briefing, a night chase, the beach at
// noon. The scenes reuse the game's own actors and HUD — nothing is faked —
// they are simply placed, lit and held still for the camera.

import { FIXER_BAR } from './config.js';
import { makeCar, nextWaypoint } from './entities.js';
import { MISSIONS } from './missions.js';

/** Move the first `count` traffic cars to composed spots: [x, y, angle, axis, line, dir]. */
function placeTraffic(state, spots) {
  const traffic = state.cars.filter((c) => c.kind === 'traffic');
  spots.forEach((s, i) => {
    const car = traffic[i % traffic.length];
    [car.x, car.y, car.angle, car.axis, car.line, car.dir] = s;
    nextWaypoint(state.city, car, state.rng, false);
  });
}

/** Move a few pedestrians to where the camera can see them: [x, y] pairs. */
function placePeds(state, spots) {
  spots.forEach((s, i) => {
    const ped = state.peds[i % state.peds.length];
    ped.x = s[0];
    ped.y = s[1];
    ped.tx = s[0];
    ped.ty = s[1];
    ped.speed = 0;
  });
}

/** Put the player in a fresh car of the given paint at a composed spot. */
function giveCar(state, x, y, angle, color) {
  const car = makeCar(state.rng, 'traffic', x, y, angle);
  car.color = color;
  state.player.car = car;
  state.player.x = x;
  state.player.y = y;
  return car;
}

function addPolice(state, x, y, angle) {
  const cop = makeCar(state.rng, 'police', x, y, angle);
  state.police.push(cop);
  return cop;
}

const SCENES = {
  // The cover: sunset downtown, top down on the player's coupe, a job on the
  // HUD, two stars up and one patrol car already on the tail.
  cover(state) {
    state.timeOfDay = 0.745;
    giveCar(state, 1824, 1330, -Math.PI / 2, '#c23b2e');
    state.player.cash = 1450;
    state.wanted.heat = 120;
    state.wanted.stars = 2;
    state.wanted.lastSeen = 0;
    addPolice(state, 1824, 1530, -Math.PI / 2);
    placeTraffic(state, [
      [1824, 1060, -Math.PI / 2, 'y', 1800, -1],
      [1776, 1130, Math.PI / 2, 'y', 1800, 1],
      [1620, 1024, 0, 'x', 1000, 1],
      [2176, 1150, Math.PI / 2, 'y', 2200, 1],
    ]);
    placePeds(state, [[1735, 1180], [1905, 1245], [1748, 1440], [1912, 980]]);
    state.mission.nextIndex = 1;
    state.mission.active = { def: MISSIONS[1], stepIndex: 0, timeLeft: null, stolenCar: null, rival: null };
    state.camera.x = 1824;
    state.camera.y = 1300;
    state.camera.zoom = 1;
  },

  // A job briefing: morning outside The Rusty Anchor, Marla mid-sentence,
  // her marker overhead and the first objective on the panel.
  mission(state) {
    state.timeOfDay = 0.32;
    state.player.x = FIXER_BAR.x;
    state.player.y = FIXER_BAR.y + 26;
    state.player.angle = -Math.PI / 2;
    state.player.cash = 120;
    const marla = state.peds[0];
    marla.x = FIXER_BAR.x - 26;
    marla.y = FIXER_BAR.y - 6;
    marla.tx = marla.x;
    marla.ty = marla.y;
    marla.shirt = '#ee6aa5';
    marla.angle = Math.PI / 2;
    placePeds(state, [[1705, 1610], [1580, 1645], [1760, 1560]]);
    state.mission.dialogue = [MISSIONS[0].intro[0]];
    state.camera.x = FIXER_BAR.x;
    state.camera.y = FIXER_BAR.y + 10;
    state.camera.zoom = 1.25;
  },

  // The chase: deep night, four stars, three patrol cars with their lights
  // burning and sparks coming off the player's rear bumper.
  chase(state) {
    state.timeOfDay = 0.03;
    giveCar(state, 1424, 800, -Math.PI / 2, '#9aa5b1');
    state.player.car.health = 46;
    state.player.cash = 890;
    state.wanted.heat = 330;
    state.wanted.stars = 4;
    state.wanted.lastSeen = 0;
    addPolice(state, 1424, 962, -Math.PI / 2);
    addPolice(state, 1376, 1044, -Math.PI / 2);
    addPolice(state, 1560, 624, Math.PI);
    placeTraffic(state, [[976, 560, Math.PI / 2, 'y', 1000, 1]]);
    for (let i = 0; i < 14; i++) {
      state.particles.push({
        kind: i % 3 === 0 ? 'smoke' : 'spark',
        x: 1424 + (state.rng.range(-14, 14)),
        y: 826 + state.rng.range(-6, 10),
        vx: state.rng.range(-60, 60), vy: state.rng.range(30, 120),
        life: 0.8, max: 1, size: state.rng.range(2, 5), color: '#ffc850',
      });
    }
    state.camera.x = 1440;
    state.camera.y = 860;
    state.camera.zoom = 1;
  },

  // The wide one: the coast road, the sand and the sea at noon, traffic
  // rolling past beachgoers under the palms.
  beach(state) {
    state.timeOfDay = 0.45;
    giveCar(state, 3424, 1380, -Math.PI / 2, '#26a6a0');
    state.player.cash = 2380;
    state.mission.nextIndex = 2;
    placeTraffic(state, [
      [3376, 1620, Math.PI / 2, 'y', 3400, 1],
      [3424, 1080, -Math.PI / 2, 'y', 3400, -1],
      [3120, 1424, Math.PI, 'x', 1400, -1],
    ]);
    placePeds(state, [[3560, 1330], [3595, 1470], [3530, 1580], [3610, 1240], [3480, 1690], [3565, 1750]]);
    state.camera.x = 3380;
    state.camera.y = 1450;
    state.camera.zoom = 0.72;
  },
};

/** Stage a named scene onto a fresh game state. Returns false for unknown names. */
export function stageScene(state, name) {
  const scene = SCENES[name];
  if (!scene) return false;
  state.screen = 'playing';
  scene(state);
  state.player.vx = 0;
  state.player.vy = 0;
  return true;
}
