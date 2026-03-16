// ─── main.js — Entry point ───────────────────────────────────
// Boots the game: loads sprites, wires up UI, runs the game loop.

import { preloadSprites } from './sprites.js';
import {
  createState,
  update,
  setAnim,
  chooseIdleAnim,
  getMoodText,
  isPanhandling,
  ACTIONS,
  DEATH_MESSAGES,
} from './game.js';
import {
  renderSprite,
  updateStats,
  updateDay,
  updateMood,
  updateShadow,
  setLog,
  setButtonsDisabled,
  setGoneState,
  flashButtonActive,
  bindButtons,
  showGameOver,
  hideGameOver,
  bindRestartButton,
} from './ui.js';

// ─── Module-level state ───────────────────────────────────────
let state   = createState();
let images  = {};
let lastDay = 1;
let wasBusy = false;
let wasPanhandling = false;

// ─── Action Handler ───────────────────────────────────────────
function handleAction(actionKey) {
  if (state.busy || state.dead || isPanhandling(state)) return;

  const action = ACTIONS[actionKey];
  if (!action) return;

  const dirty  = state.hygiene <= 15;
  const prefix = dirty ? 'Dirty' : 'Clean';

  // Apply stat restore
  state[action.stat] = Math.min(100, state[action.stat] + action.amount);

  // Apply any side effects (e.g. eating makes you slightly dirtier)
  Object.entries(action.sideEffects).forEach(([stat, delta]) => {
    state[stat] = Math.max(0, Math.min(100, state[stat] + delta));
  });

  // Set animation
  setAnim(state, `${prefix}_${action.anim}`);

  // Lock controls for action duration
  state.busy        = true;
  state.action      = actionKey;
  state.actionTimer = action.duration;

  setButtonsDisabled(true);
  flashButtonActive(actionKey);
  setLog(action.log);
}

// ─── Game Over ────────────────────────────────────────────────
function handleDeath(cause) {
  state.dead = true;

  // Slump into sleep pose
  const deathAnim = state.hygiene <= 15 ? 'Dirty_Sleep' : 'Clean_Sleep';
  setAnim(state, deathAnim);
  renderSprite(state, images);

  const msgs    = DEATH_MESSAGES[cause] || ["He didn't make it."];
  const message = msgs[Math.floor(Math.random() * msgs.length)];

  setTimeout(() => showGameOver(state.day, message), 1200);
}

// ─── Restart ──────────────────────────────────────────────────
function restartGame() {
  hideGameOver();
  const difficulty = state.difficulty;
  state        = createState();
  state.difficulty = difficulty;
  lastDay      = 1;
  lastRealTime = performance.now();
  setButtonsDisabled(false);
  setLog('Buddy is just standing around.');
  updateDay(1);
}

// ─── Time Tracking ────────────────────────────────────────────
let lastRealTime = performance.now();

// Run game logic for `elapsed` seconds in 100ms chunks, without rendering.
// Used to catch up time accrued while the tab was hidden.
function catchUp(elapsed) {
  let remaining = Math.min(elapsed, 600); // cap at 10 min of catch-up
  while (remaining > 0 && !state.dead) {
    const dt = Math.min(remaining, 0.1);
    remaining -= dt;
    const cause = update(state, dt);
    if (cause) { handleDeath(cause); return; }
  }
}

document.addEventListener('visibilitychange', () => {
  const now = performance.now();
  if (!document.hidden && !state.dead) {
    catchUp((now - lastRealTime) / 1000);
  }
  lastRealTime = now;
});

// ─── Game Loop ────────────────────────────────────────────────
function loop() {
  const now = performance.now();
  const dt  = Math.min((now - lastRealTime) / 1000, 0.1); // cap at 100ms
  lastRealTime = now;

  if (!state.dead) {
    const cause = update(state, dt);

    if (cause) {
      handleDeath(cause);
    } else {
      // If no action is running, pick the correct idle/sit animation
      if (!state.busy) {
        setAnim(state, chooseIdleAnim(state));
      }

      // Enable controls when an action just finished
      if (wasBusy && !state.busy) {
        setButtonsDisabled(false);
      }
      wasBusy = state.busy;

      // Disable controls while buddy is panhandling and re-enable on return
      if (wasPanhandling !== state.panhandling) {
        setGoneState(state.panhandling);
      }
      wasPanhandling = state.panhandling;

      // Sync UI
      renderSprite(state, images);
      updateStats(state);
      updateMood(getMoodText(state));
      updateShadow(state.currentAnim);

      if (state.day !== lastDay) {
        updateDay(state.day);
        lastDay = state.day;
      }
    }
  }

  requestAnimationFrame(loop);
}

// ─── Boot ─────────────────────────────────────────────────────
async function boot() {
  try {
    images = await preloadSprites();
  } catch (err) {
    console.error(err);
    // Continue anyway — render() guards against broken images
  }

  bindButtons(handleAction);
  bindRestartButton(restartGame);

  const diffBtn = document.getElementById('btn-difficulty');
  diffBtn.addEventListener('click', () => {
    const next = state.difficulty === 'easy' ? 'hard' : 'easy';
    state.difficulty = next;
    diffBtn.dataset.difficulty = next;
  });
  diffBtn.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); diffBtn.click(); }
  });
  setLog('Buddy is just standing around.');

  requestAnimationFrame(loop);
}

boot();
