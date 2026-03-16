// ─── Imports ──────────────────────────────────────────────────
import { SPRITE_CONFIG } from './sprites.js';

// ─── Stat Decay Rates (per second) ───────────────────────────
export const DECAY = {
  hunger:  0.15,   // ~11 minutes to deplete from 100
  thirst:  0.12,   // ~14 minutes to deplete from 100
  hygiene: 0.05,   // ~33 minutes to deplete from 100
  energy:  0.10,   // ~17 minutes to deplete from 100
};

// ─── Action Definitions ───────────────────────────────────────
export const ACTIONS = {
  feed: {
    stat: 'hunger',
    amount: 45,
    duration: 3,
    anim: 'Eat',
    sideEffects: { hygiene: -3 },
    log: "Buddy's eating. Good call.",
  },
  drink: {
    stat: 'thirst',
    amount: 50,
    duration: 4,
    anim: 'Drink',
    sideEffects: {},
    log: 'He takes a long drink of water.',
  },
  wash: {
    stat: 'hygiene',
    amount: 100,
    duration: 3,
    anim: 'Idle',   // no dedicated wash anim, use idle
    sideEffects: {},
    log: 'Getting cleaned up. He seems lighter.',
  },
  sleep: {
    stat: 'energy',
    amount: 75,
    duration: 5,
    anim: 'Sleep',
    sideEffects: {},
    log: 'Buddy drifts off. He needed that.',
  },
};

// ─── Death Cause Messages ─────────────────────────────────────
export const DEATH_MESSAGES = {
  hunger: [
    "He hadn't eaten in too long. Everyone has a limit.",
    'His stomach finally gave up waiting.',
  ],
  thirst: [
    'Dehydration caught up with him in the end.',
    'It was the thirst. Always the thirst.',
  ],
  energy: [
    "He just couldn't keep his eyes open anymore.",
    'Buddy ran out of road. He needed rest.',
  ],
};

// ─── Difficulty Rates ─────────────────────────────────────────
const RATES = {
  //               hunger   thirst   hygiene  energy    (per second)
  easy: { hunger: 0.1,  thirst: 0.2,  hygiene: 0.035, energy: 0.070 }, // 0.7× base
  hard: { hunger: 0.5,   thirst: 1,   hygiene: 0.35,  energy: 0.5 }, // hygiene: ~42/day (dirty ~2 days after wash) | energy: ~55/day (1 sleep/day)
};

export function getDecayRates(state) {
  return RATES[state.difficulty] ?? RATES.easy;
}

// ─── State Factory ────────────────────────────────────────────
export function createState() {
  return {
    hunger:  100,
    thirst:  100,
    hygiene: 0,    // starts at 0 to show he's houseless
    energy:  100,

    day:      1,
    dayTimer: 0,      // seconds elapsed in current day (120s = 1 day)

    currentAnim: 'Clean_Idle',
    animFrame:   0,
    animTimer:   0,
    animFPS:     8,

    action:      null,  // active action key e.g. 'feed'
    actionTimer: 0,     // seconds remaining in current action
    busy:        false,
    idleTimer:   0,     // seconds spent standing idle (triggers sit anim)

    // Panhandling (buddy leaves for a while)
    panhandling:         false,
    returnTimer:         0,
    returnedDirty:       false,
    panhandleCheckTimer: 30, // seconds until next chance to trigger

    // Difficulty: 'easy', 'hard'
    difficulty: 'easy',

    dead: false,
  };
}

// ─── Animation Selection ──────────────────────────────────────
const SIT_AFTER = 20; // seconds standing before buddy sits down

export function chooseIdleAnim(state) {
  const dirty = state.hygiene <= 15;
  const prefix = dirty ? 'Dirty' : 'Clean';
  const sit = state.energy < 30 || state.idleTimer >= SIT_AFTER;
  return sit ? `${prefix}_Sit` : `${prefix}_Idle`;
}

// ─── Update ───────────────────────────────────────────────────
// Pure logic tick — mutates state, returns cause of death or null

export function update(state, dt) {
  // Advance day timer
  state.dayTimer += dt;
  if (state.dayTimer >= 120) {
    state.dayTimer -= 120;
    state.day++;
  }

  // Decay stats (skip the one being actively restored)
  const activeAction = state.busy ? ACTIONS[state.action] : null;
  const decay = getDecayRates(state);

  // While panhandling, apply minimal decay (10% of normal) so he doesn't die while away
  const decayMultiplier = state.panhandling ? 0.1 : 1.0;

  if (!activeAction || activeAction.stat !== 'hunger')
    state.hunger  = Math.max(0, state.hunger  - decay.hunger  * dt * decayMultiplier);
  if (!activeAction || activeAction.stat !== 'thirst')
    state.thirst  = Math.max(0, state.thirst  - decay.thirst  * dt * decayMultiplier);
  if (!activeAction || activeAction.stat !== 'energy')
    state.energy  = Math.max(0, state.energy  - decay.energy  * dt * decayMultiplier);

  // Hygiene always decays (no action directly pauses it), but also reduced while panhandling
  state.hygiene = Math.max(0, state.hygiene - decay.hygiene * dt * decayMultiplier);

  // Panhandling: buddy can wander off for a while and then return dirty.
  if (state.panhandling) {
    state.returnTimer -= dt;
    if (state.returnTimer <= 0) {
      state.panhandling   = false;
      state.returnedDirty = true;

      // Return in rough shape: dirty, but with some stats partially restored
      // (he ate/drank a little while away)
      state.hygiene = Math.random() * 15; // return very dirty (0-14)
      state.hunger  = Math.max(state.hunger, 25);  // at least a little food in him
      state.thirst  = Math.max(state.thirst, 35);  // he drank some water
      state.energy  = Math.max(state.energy, 30);  // had some rest

      state.returnTimer = 0;
    }
  } else {
    // Only attempt to start panhandling during idle (not busy/dead)
    state.panhandleCheckTimer -= dt;
    if (state.panhandleCheckTimer <= 0) {
      state.panhandleCheckTimer += 30;
      const isIdleAnim = state.currentAnim.endsWith('_Idle') || state.currentAnim.endsWith('_Sit');
      if (!state.busy && !state.dead && isIdleAnim && Math.random() < 0.20) {
        state.panhandling   = true;
        state.returnTimer   = 60 + Math.random() * 120; // 1-3 minutes
        state.returnedDirty = false;
      }
    }
  }

  // Check for death (hygiene doesn't kill, just makes him dirty)
  // BUT: don't die while panhandling — he can return in time to be saved
  if (!state.panhandling) {
    const cause = ['hunger', 'thirst', 'energy'].find(s => state[s] <= 0);
    if (cause) return cause;
  }

  // Count down active action
  if (state.busy) {
    state.idleTimer = 0;
    state.actionTimer -= dt;
    if (state.actionTimer <= 0) {
      state.busy   = false;
      state.action = null;
    }
  } else if (!state.panhandling) {
    state.idleTimer += dt;
  }

  // Advance animation frame using per-sprite fps
  state.animTimer += dt;
  const { frames, fps } = getCurrentSpriteConfig(state);
  const frameDuration = 1 / (fps || state.animFPS);
  if (state.animTimer >= frameDuration) {
    state.animTimer -= frameDuration;
    state.animFrame = (state.animFrame + 1) % frames;
  }

  return null; // alive
}

// ─── Helpers ──────────────────────────────────────────────────
export function getCurrentSpriteConfig(state) {
  return SPRITE_CONFIG[state.currentAnim];
}

export function isPanhandling(state) {
  return Boolean(state.panhandling);
}

export function setAnim(state, name) {
  if (state.currentAnim === name) return;
  state.currentAnim = name;
  state.animFrame   = 0;
  state.animTimer   = 0;
}

export function getMoodText(state) {
  if (state.panhandling) return 'Out panhandling';
  if (state.energy  < 10 || state.hunger < 10 || state.thirst < 10) return 'Critical';
  if (state.hunger  < 25) return 'Starving';
  if (state.thirst  < 25) return 'Real thirsty';
  if (state.energy  < 25) return 'Exhausted';
  if (state.hygiene < 20) return 'Smells rough';
  return "Chillin'";
}
