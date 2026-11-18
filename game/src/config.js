// Vice Harbor — central tuning and world layout constants.
// Everything the other modules need to agree on lives here: world size, the
// road grid, district colours, prices, speeds and the two story locations.

export const WORLD = { w: 3800, h: 2600 };

// Road centre-lines. Roads are ROAD_W wide; traffic keeps to the right lane.
export const ROADS_X = [380, 980, 1580, 2180, 2780, 3260];
export const ROADS_Y = [320, 900, 1480, 2060];
export const ROAD_W = 116;
export const LANE = 29;

// The Rusty Anchor (Marla Vane's bar) and the player's safehouse.
export const ANCHOR = { x: 1810, y: 2180, doorX: 1810, doorY: 2206, name: 'The Rusty Anchor' };
export const SAFEHOUSE = { x: 210, y: 824, name: 'Safehouse' };
export const HOSPITAL = { x: 1580, y: 396, name: 'St. Marina General' };
export const BEACH_KIOSK = { x: 3420, y: 1180, name: 'Kiosk Azul' };

// Rects the world generator must keep clear of buildings (story lots).
export const CLEARINGS = [
  { x: 1600, y: 2118, w: 440, h: 112 }, // Anchor front lot
  { x: 96, y: 800, w: 280, h: 76 },     // safehouse front yard
  { x: 3340, y: 1090, w: 180, h: 180 }, // beach kiosk clearing
];

export const DISTRICT_STYLE = {
  downtown: { ground: '#3d4450', roof: ['#5b6b7f', '#6e5a6e', '#54687a', '#75655a', '#5f7386'], tall: true },
  midtown:  { ground: '#414a44', roof: ['#7a6a58', '#687a6e', '#77655f', '#5f7080', '#84755e'], tall: false },
  suburbs:  { ground: '#48603f', roof: ['#a08a68', '#b09a7a', '#967d63', '#a89a80', '#8f7a5e'], tall: false },
  docks:    { ground: '#4a4640', roof: ['#6e6a5e', '#7d7466', '#5d6a72', '#71685a', '#686058'], tall: false },
  beach:    { ground: '#c9b183', roof: ['#c9a86a', '#bfae8e'], tall: false },
};

export const CAR_COLORS = ['#c94f4f', '#4f7ec9', '#e0b64f', '#5fc95f', '#e8e8ec', '#30303a',
  '#c95fb0', '#4fc9c0', '#e07f3f', '#7a5fc9', '#9fb4c7', '#6e4f35'];
export const PED_COLORS = ['#e8c39e', '#c98d64', '#8a5a3b', '#f0d0b0', '#6e4526'];
export const PED_SHIRTS = ['#d95f4f', '#4f8ad9', '#59c96a', '#e8d44f', '#b45fd9', '#4fd9c9', '#e88a3f', '#e8e8e8'];

export const TUNE = {
  walkSpeed: 148,
  runSpeed: 252,
  playerRadius: 13,
  playerHealth: 100,
  punchRange: 40,
  punchCooldown: 0.34,
  gunRange: 470,
  gunCooldown: 0.17,
  gunDamageCar: 9,
  carRadius: 21,
  enterRange: 66,
  trafficCount: 12,
  parkedCount: 7,
  pedCount: 16,
  heatDecay: 0.22,        // stars per second once unseen
  heatDecaySafe: 1.25,    // stars per second hiding at the safehouse
  unseenDelay: 5,         // seconds without police eyes before cool-off starts
  bustedTime: 1.7,
  dayLength: 300,         // real seconds per full 24h cycle
  startHour: 16.9,
  startCash: 240,
};

export const STORE_KEY = 'viceharbor-save-v1';

// East edge of the drivable city: sand starts here, water at 3620.
export const BEACH_X = 3318;

export function districtAt(x, y) {
  if (x >= 3620) return 'water';
  if (x >= BEACH_X) return 'beach';
  if (y >= 2140) return 'docks';
  if (x > 1100 && x < 2600 && y > 500 && y < 1750) return 'downtown';
  if (x < 1100 && y < 1750) return 'suburbs';
  return 'midtown';
}

// Darkness 0 (day) .. 1 (deep night) for an hour in [0,24).
export function darknessAt(hour) {
  if (hour >= 7 && hour <= 17) return 0;
  if (hour > 17 && hour < 19.5) return (hour - 17) / 2.5 * 0.92;
  if (hour >= 19.5 || hour <= 4.5) return 0.92;
  return 0.92 * (1 - (hour - 4.5) / 2.5);
}

// Sky tint keyframes: [hour, colour] pairs, linearly blended by render.
export const SKY_KEYS = [
  [0, '#0b1026'], [4.5, '#0b1026'], [6, '#3a3f66'], [7.5, '#7fb2d9'], [12, '#8ec9ee'],
  [17, '#8ec9ee'], [18.6, '#e8905a'], [19.5, '#2c2a55'], [21, '#0b1026'], [24, '#0b1026'],
];
