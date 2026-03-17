import { preloadSprites, SPRITE_CONFIG } from './sprites.js';
import {
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

let state          = null;
let images         = {};
let lastDay        = 1;
let wasBusy        = false;
let wasPanhandling = false;

// ─── Local animation state (advances every rAF frame) ─────────
let localAnimName  = null;
let localAnimFrame = 0;
let localAnimTimer = 0;
let lastFrameTime  = performance.now();

// ─── Background messaging ─────────────────────────────────────

const port = chrome.runtime.connect({ name: 'popup' });

// Receive messages pushed from background
port.onMessage.addListener(msg => {
  if (msg.type === 'gameOver') {
    state = { ...state, dead: true, cause: msg.cause };
    handleDeath();
    return;
  }

  state = msg;
  syncUI();
});

function send(type, extra = {}) {
  return new Promise(resolve =>
    chrome.runtime.sendMessage({ type, ...extra }, resolve)
  );
}

// ─── Action handler ───────────────────────────────────────────

async function doAction(actionKey) {
  if (!state || state.busy || state.dead || isPanhandling(state)) return;
  const action = ACTIONS[actionKey];
  if (!action) return;

  flashButtonActive(actionKey);
  setLog(action.log);

  const next = await send('doAction', { action: actionKey });
  if (next) state = next;
}

// ─── Death ────────────────────────────────────────────────────

function handleDeath() {
  const msgs    = DEATH_MESSAGES[state.cause] || ["He didn't make it."];
  const message = msgs[Math.floor(Math.random() * msgs.length)];
  renderSprite(state, images);
  setTimeout(() => showGameOver(state.day, message), 1200);
}

// ─── State sync UI (called on each background tick message) ───
// All stat/mood/day updates run unconditionally — never gated on panhandling.

function syncUI() {
  if (!state || state.dead) return;

  // Button state transitions
  if (wasBusy && !state.busy) setButtonsDisabled(false);
  wasBusy = state.busy;

  // Panhandling transitions (gone / returned)
  const panhandling = isPanhandling(state);
  if (wasPanhandling !== panhandling) setGoneState(panhandling);
  wasPanhandling = panhandling;

  // Always update stats, mood, and day regardless of panhandling state
  updateStats(state);
  updateMood(getMoodText(state));
  if (state.day !== lastDay) {
    updateDay(state.day);
    lastDay = state.day;
  }

  // Shadow only needs updating when the active animation changes
  if (state.currentAnim !== localAnimName) updateShadow(state.currentAnim);
}

// ─── Animation loop (runs every rAF frame, independent of ticks) ──

function animLoop() {
  if (state) {
    const now = performance.now();
    const dt  = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    const animName = state.currentAnim;

    // Reset local frame counter when the animation changes
    if (animName !== localAnimName) {
      localAnimName  = animName;
      localAnimFrame = 0;
      localAnimTimer = 0;
    }

    // Advance frame using the sprite's own fps
    const cfg = SPRITE_CONFIG[animName];
    if (cfg) {
      localAnimTimer += dt;
      const frameDur = 1 / cfg.fps;
      while (localAnimTimer >= frameDur) {
        localAnimTimer -= frameDur;
        localAnimFrame  = (localAnimFrame + 1) % cfg.frames;
      }
    }

    renderSprite({ ...state, animFrame: localAnimFrame }, images);
  }

  requestAnimationFrame(animLoop);
}

// ─── Boot ─────────────────────────────────────────────────────

async function boot() {
  try {
    images = await preloadSprites();
  } catch (err) {
    console.error('Sprite load failed:', err);
  }

  state = await send('getState');

  if (state) {
    lastDay        = state.day;
    wasBusy        = state.busy;
    wasPanhandling = isPanhandling(state);

    syncUI();
    updateDay(state.day);

    if (state.dead) {
      handleDeath();
    } else {
      if (isPanhandling(state)) setGoneState(true);
      setLog('Buddy is just standing around.');
    }

    const diffBtn = document.getElementById('btn-difficulty');
    if (diffBtn && state.difficulty) diffBtn.dataset.difficulty = state.difficulty;
  }

  bindButtons(doAction);

  bindRestartButton(async () => {
    hideGameOver();
    state = await send('restart');
    if (!state) return;
    lastDay        = 1;
    wasBusy        = false;
    wasPanhandling = false;
    setButtonsDisabled(false);
    setLog('Buddy is just standing around.');
    updateDay(1);
  });

  const diffBtn = document.getElementById('btn-difficulty');
  if (diffBtn) {
    diffBtn.addEventListener('click', async () => {
      if (!state) return;
      const next = state.difficulty === 'easy' ? 'hard' : 'easy';
      const updated = await send('setDifficulty', { difficulty: next });
      if (updated) state = updated;
      diffBtn.dataset.difficulty = state.difficulty;
    });
    diffBtn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); diffBtn.click(); }
    });
  }

  // Drive background ticks every second while popup is open
  const tickInterval = setInterval(() => port.postMessage({ type: 'tick' }), 1000);
  window.addEventListener('unload', () => clearInterval(tickInterval));

  requestAnimationFrame(animLoop);
}

boot();
