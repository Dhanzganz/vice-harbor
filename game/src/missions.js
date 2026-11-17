// Vice Harbor — the story: five jobs from Marla Vane, the fixer at The Rusty
// Anchor, and the machinery that runs them: objectives, dialogue, timers,
// a stolen car to deliver, a rival courier to stop, and cash on completion.
// Between jobs the player free-roams; Marla's marker is always on the map
// while a job remains.

import { FIXER_BAR, GARAGE, DOCKS, MARINA, SAFEHOUSE, DROP_ALLEY } from './config.js';
import { makeCar, nextWaypoint, driveToward } from './entities.js';

const MARLA = 'Marla Vane';
const YOU = 'You';

// The five jobs, in order. Steps are visited in turn; each names where to go
// and what kind of arrival counts. `heat` is applied the moment a step begins.
export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    reward: 250,
    intro: [
      { name: MARLA, text: "You're the new wheelman everyone's whispering about? Then prove it." },
      { name: MARLA, text: 'A turquoise coupe is parked off Neon Alley with my name on it. Bring it to Torque & Sons. Gently-ish.' },
    ],
    steps: [
      { kind: 'steal', label: 'Steal the turquoise coupe', spawn: { x: 1833, y: 1150, angle: Math.PI / 2, color: '#26a6a0' } },
      { kind: 'deliver', label: 'Deliver it to Torque & Sons Garage', x: GARAGE.x, y: GARAGE.y, useStolen: true },
    ],
    outro: [
      { name: MARLA, text: 'Clean work. The Harbor notices people who deliver.' },
    ],
  },
  {
    id: 'hot-package',
    title: 'Hot Package',
    reward: 400,
    intro: [
      { name: MARLA, text: 'A crate came off a boat at the docks last night. Customs wants it. I want it more.' },
      { name: MARLA, text: 'Pick it up and run it to the Neon Alley drop. The clock — and the cops — start when you touch it.' },
    ],
    steps: [
      { kind: 'pickup', label: 'Pick up the crate at the Harbor Docks', x: DOCKS.x, y: DOCKS.y },
      { kind: 'deliver', label: 'Run it to the Neon Alley drop', x: DROP_ALLEY.x, y: DROP_ALLEY.y, time: 150, heat: 70 },
    ],
    outro: [
      { name: MARLA, text: 'Whatever was in that crate, forget you ever saw it.' },
    ],
  },
  {
    id: 'tail-breaker',
    title: 'Tail Breaker',
    reward: 600,
    intro: [
      { name: MARLA, text: 'A courier named Denny Skiff thinks he can run my routes on my island.' },
      { name: MARLA, text: "He's cruising the coast road right now. Persuade his car to stop. Permanently." },
    ],
    steps: [
      { kind: 'chase', label: 'Wreck Denny Skiff\'s car before he reaches the marina' },
    ],
    outro: [
      { name: MARLA, text: 'Denny walks home tonight. Word travels fast, wheelman.' },
    ],
  },
  {
    id: 'harbor-heat',
    title: 'Harbor Heat',
    reward: 800,
    intro: [
      { name: MARLA, text: 'Big score waiting at the docks warehouse. The cargo is crated and ready by the cranes.' },
      { name: MARLA, text: 'Every badge in Vice Harbor will want a word. Lose them all and bring it home to Marina Court.' },
    ],
    steps: [
      { kind: 'pickup', label: 'Load the cargo at the Harbor Docks', x: DOCKS.x, y: DOCKS.y },
      { kind: 'escape', label: 'Lose the heat and reach the Marina Court Safehouse', x: SAFEHOUSE.x, y: SAFEHOUSE.y, heat: 190 },
    ],
    outro: [
      { name: MARLA, text: 'You shook the whole precinct. Remind me never to owe you money.' },
    ],
  },
  {
    id: 'vice-harbor-job',
    title: 'The Vice Harbor Job',
    reward: 1500,
    intro: [
      { name: MARLA, text: 'One last run, then this city is yours. Three crews, three corners of the island, one boat out.' },
      { name: MARLA, text: "Hit every meet, then be at the marina. Don't be late to your own legend." },
    ],
    steps: [
      { kind: 'goto', label: 'Meet the beach crew on the coast road', x: 3400, y: 900 },
      { kind: 'goto', label: 'Meet the downtown crew at Fifth & Palm', x: 1800, y: 1000 },
      { kind: 'goto', label: 'Meet the dock crew at the Harbor Docks', x: DOCKS.x, y: DOCKS.y },
      { kind: 'goto', label: 'Reach the boat at Vice Harbor Marina', x: MARINA.x, y: MARINA.y, heat: 120 },
    ],
    outro: [
      { name: MARLA, text: 'Vice Harbor has a new name on its streets now. Try not to get it arrested.' },
      { name: YOU, text: 'No promises.' },
    ],
  },
];

/** Fresh mission runtime for a new game (or the fields a save restores into). */
export function newMissionState() {
  return {
    nextIndex: 0,
    active: null,      // { def, stepIndex, timeLeft, stolenCar, rival }
    dialogue: [],
    dialogueT: 0,
    banner: null,      // { title, text, t, seconds }
    storyDone: false,
  };
}

function say(state, lines) {
  state.mission.dialogue = [...lines];
  state.mission.dialogueT = 0;
}

function showBanner(state, title, text, seconds = 4) {
  state.mission.banner = { title, text, t: 0, seconds };
}

/** Begin the step at index i of the active mission: spawn its actors, apply its heat. */
function beginStep(state, index) {
  const m = state.mission;
  const step = m.active.def.steps[index];
  m.active.stepIndex = index;
  m.active.timeLeft = step.time ?? null;
  if (step.heat) state.addHeat(step.heat, state.player.x, state.player.y);
  if (step.kind === 'steal' && !m.active.stolenCar) {
    const car = makeCar(state.rng, 'parked', step.spawn.x, step.spawn.y, step.spawn.angle);
    car.color = step.spawn.color;
    car.missionTarget = true;
    state.cars.push(car);
    m.active.stolenCar = car;
  }
  if (step.kind === 'chase' && !m.active.rival) {
    const rival = makeCar(state.rng, 'rival', 3400 - 24, 1250, Math.PI / 2);
    rival.color = '#e8b93c';
    rival.axis = 'y';
    rival.line = 3400;
    rival.dir = 1;
    rival.health = 65;
    nextWaypoint(state.city, rival, state.rng, true);
    state.cars.push(rival);
    m.active.rival = rival;
  }
}

/** Start the next mission, if the player is at Marla's door and none is running. */
export function tryStartMission(state) {
  const m = state.mission;
  if (m.active || m.nextIndex >= MISSIONS.length) return false;
  const p = state.player;
  if (Math.hypot(p.x - FIXER_BAR.x, p.y - FIXER_BAR.y) > 56) return false;
  const def = MISSIONS[m.nextIndex];
  m.active = { def, stepIndex: 0, timeLeft: null, stolenCar: null, rival: null };
  say(state, def.intro);
  showBanner(state, def.title, 'New job from Marla Vane', 3.5);
  beginStep(state, 0);
  return true;
}

function cleanupActors(state) {
  const m = state.mission;
  if (m.active?.stolenCar) m.active.stolenCar.missionTarget = false;
  if (m.active?.rival) {
    state.cars = state.cars.filter((c) => c !== m.active.rival);
  }
}

function completeMission(state) {
  const m = state.mission;
  const def = m.active.def;
  state.player.cash += def.reward;
  state.sfx('cash');
  say(state, def.outro);
  showBanner(state, 'JOB DONE', `${def.title} — $${def.reward} paid`, 4.5);
  cleanupActors(state);
  m.active = null;
  m.nextIndex += 1;
  if (m.nextIndex >= MISSIONS.length) {
    m.storyDone = true;
    showBanner(state, 'VICE HARBOR', 'Story complete. The city is yours — free roam, forever.', 6);
  }
  state.saveGame();
}

export function failMission(state, reason) {
  const m = state.mission;
  if (!m.active) return;
  state.sfx('fail');
  showBanner(state, 'JOB FAILED', reason, 4.5);
  cleanupActors(state);
  m.active = null;
  state.saveGame();
}

function advanceStep(state) {
  const m = state.mission;
  const next = m.active.stepIndex + 1;
  state.sfx('pickup');
  if (next >= m.active.def.steps.length) completeMission(state);
  else beginStep(state, next);
}

/** The rival courier's driving: fast, road-following, always turning away from the player. */
function updateRival(state, rival, dt) {
  const player = state.player;
  const dx = rival.wpX - rival.x;
  const dy = rival.wpY - rival.y;
  if (dx * dx + dy * dy < 40 * 40) {
    const fleeTarget = { x: rival.x * 2 - player.x, y: rival.y * 2 - player.y };
    nextWaypoint(state.city, rival, state.rng, true, fleeTarget);
  }
  const impact = driveToward(state, rival, dt, rival.wpX, rival.wpY, 302, 2.9);
  if (impact > 165) {
    rival.health -= (impact - 165) * 0.09; // Denny's own driving hurts him too
    if (rival.health <= 0) rival.wrecked = true;
  }
}

/** Per-frame mission logic: dialogue timing, step checks, timers, the rival. */
export function updateMissions(state, dt) {
  const m = state.mission;
  // Dialogue auto-advances; main sets state.skipDialogue when the player taps.
  if (m.dialogue.length > 0) {
    m.dialogueT += dt;
    if (m.dialogueT > 5.2 || state.skipDialogue) {
      m.dialogue.shift();
      m.dialogueT = 0;
    }
  }
  state.skipDialogue = false;
  if (m.banner) {
    m.banner.t += dt;
    if (m.banner.t > m.banner.seconds) m.banner = null;
  }
  if (!m.active) return;
  const step = m.active.def.steps[m.active.stepIndex];
  const p = state.player;

  if (m.active.timeLeft !== null) {
    m.active.timeLeft -= dt;
    if (m.active.timeLeft <= 0) {
      failMission(state, 'Out of time. Marla is not pleased.');
      return;
    }
  }

  if (step.kind === 'chase') {
    const rival = m.active.rival;
    if (!rival) return;
    updateRival(state, rival, dt);
    if (rival.wrecked || rival.health <= 0) {
      advanceStep(state);
      return;
    }
    if (Math.hypot(rival.x - MARINA.x, rival.y - MARINA.y) < 90) {
      failMission(state, 'Denny reached the marina and slipped away.');
      return;
    }
    return;
  }

  if (step.kind === 'steal') {
    if (p.car && p.car === m.active.stolenCar) advanceStep(state);
    return;
  }

  // A delivery in the stolen car only counts while the player drives that car;
  // otherwise the objective is the car itself (see currentObjective) and the
  // step simply waits.
  if (step.useStolen && p.car !== m.active.stolenCar) return;

  // Point-arrival steps: goto, pickup, deliver, escape.
  const radius = step.kind === 'goto' ? 54 : step.kind === 'pickup' ? 46 : 64;
  if (Math.hypot(p.x - step.x, p.y - step.y) < radius) advanceStep(state);
}

/** Where the HUD arrow, the world beacon and the minimap blip should point. */
export function currentObjective(state) {
  const m = state.mission;
  const p = state.player;
  if (m.active) {
    const step = m.active.def.steps[m.active.stepIndex];
    if (step.kind === 'chase' && m.active.rival) {
      return { x: m.active.rival.x, y: m.active.rival.y, label: step.label, color: '#e2543e' };
    }
    if (step.kind === 'steal' && m.active.stolenCar) {
      return { x: m.active.stolenCar.x, y: m.active.stolenCar.y, label: step.label, color: '#ffd94a' };
    }
    if (step.useStolen && p.car !== m.active.stolenCar && m.active.stolenCar) {
      return { x: m.active.stolenCar.x, y: m.active.stolenCar.y, label: 'Get back in the marked coupe', color: '#ffd94a' };
    }
    return { x: step.x, y: step.y, label: step.label, color: '#ffd94a' };
  }
  if (m.nextIndex < MISSIONS.length) {
    return { x: FIXER_BAR.x, y: FIXER_BAR.y, label: `Meet Marla at ${FIXER_BAR.name}`, color: '#ee6aa5' };
  }
  return null;
}

/** The line the HUD mission panel shows: job title, objective, timer, reward. */
export function missionPanel(state) {
  const m = state.mission;
  if (!m.active) return null;
  const def = m.active.def;
  const obj = currentObjective(state);
  return {
    title: def.title,
    label: obj ? obj.label : '',
    reward: def.reward,
    timeLeft: m.active.timeLeft,
    step: m.active.stepIndex + 1,
    steps: def.steps.length,
  };
}
