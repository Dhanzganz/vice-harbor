// Vice Harbor — tuning constants for the whole game.
// One place for the world's size, the road grid, the physics and the wanted system,
// so every other module reads the same numbers.

// The canvas is a fixed 1280x800 stage; CSS scales it to the window.
export const VIEW_W = 1280;
export const VIEW_H = 800;

// The city of Vice Harbor: a 3800x2600 world of streets on a 400 px grid.
export const WORLD_W = 3800;
export const WORLD_H = 2600;
export const BLOCK = 400;          // distance between street centrelines
export const ROAD_W = 92;          // street width, kerb to kerb
export const LANE = 21;            // lane offset from a street centreline (right-hand traffic)
export const SIDEWALK = 16;        // pavement width around each block

// Vertical streets (x centrelines) and horizontal streets (y centrelines).
export const ROADS_X = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000, 3400];
export const ROADS_Y = [200, 600, 1000, 1400, 1800, 2200];

// Named places the story and the HUD care about.
export const SAFEHOUSE = { x: 420, y: 430, name: 'Marina Court Safehouse' };
export const FIXER_BAR = { x: 1645, y: 1572, name: 'The Rusty Anchor' };
export const GARAGE = { x: 2385, y: 792, name: 'Torque & Sons Garage' };
export const DOCKS = { x: 2930, y: 2462, name: 'Harbor Docks' };
export const MARINA = { x: 3560, y: 2080, name: 'Vice Harbor Marina' };
export const HOSPITAL = { x: 1175, y: 415, name: 'St. Solana Hospital' };
export const DROP_ALLEY = { x: 2060, y: 1150, name: 'Neon Alley Drop' };

// The day cycle: one full day lasts DAY_SECONDS; timeOfDay runs 0..1 (0 = midnight).
export const DAY_SECONDS = 240;
export const START_TIME = 0.34;    // a bright morning for a first drive

// The player on foot and behind the wheel.
export const PLAYER_RADIUS = 9;
export const WALK_SPEED = 152;
export const RUN_SPEED = 224;
export const PLAYER_MAX_HEALTH = 100;

// Cars: arcade physics shared by traffic, police and the player.
export const CAR_RADIUS = 17;
export const CAR_ACCEL = 300;
export const CAR_MAX_SPEED = 348;
export const CAR_MAX_REVERSE = 128;
export const CAR_TURN = 2.6;       // radians per second at full lock
export const TRAFFIC_SPEED = 148;
export const POLICE_SPEED = 336;

// The wanted system: crimes add heat, heat becomes stars, stars send police.
export const HEAT_FOR_STAR = [1, 25, 95, 190, 310, 440]; // index = stars
export const HEAT_MAX = 520;
export const HEAT_DECAY_UNSEEN = 13;   // per second while no officer sees the player
export const HEAT_DECAY_SAFEHOUSE = 65;
export const UNSEEN_TO_DECAY = 5;      // seconds out of sight before heat falls
export const POLICE_PER_STAR = 1;
export const POLICE_SPAWN_DIST = 640;
export const SIGHT_RANGE = 470;

// Combat.
export const GUN_RANGE = 540;
export const GUN_COOLDOWN = 0.22;
export const PUNCH_RANGE = 30;

// Population.
export const TRAFFIC_COUNT = 26;
export const PARKED_COUNT = 30;
export const PED_COUNT = 44;

// Saving: localStorage key and the fields a save carries.
export const SAVE_KEY = 'vice-harbor-save-v1';

// Palette anchors for the day cycle, picked per phase in render.js.
export const DISTRICT_COLORS = {
  downtown: '#7d7468',
  midtown: '#8a7f70',
  suburbs: '#5f8f4e',
  docks: '#6e6a5e',
  beach: '#e3cb96',
  water: '#2b6ea6',
};
