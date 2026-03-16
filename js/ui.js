// ─── UI — DOM bindings and rendering ─────────────────────────
// This module owns all direct DOM reads/writes.
// The game loop calls these functions; nothing here mutates game state.

import { SPRITE_CONFIG } from './sprites.js';

// ─── Cached DOM refs ──────────────────────────────────────────
const els = {
  canvas:      document.getElementById('sprite'),
  dayCounter:  document.getElementById('day-counter'),
  moodText:    document.getElementById('mood-text'),
  groundShadow:document.getElementById('ground-shadow'),
  log:         document.getElementById('log'),
  gameover:    document.getElementById('gameover'),
  goDays:      document.getElementById('go-days'),
  goCause:     document.getElementById('go-cause'),
  buttons: {
    feed:  document.getElementById('btn-feed'),
    drink: document.getElementById('btn-drink'),
    wash:  document.getElementById('btn-wash'),
    sleep: document.getElementById('btn-sleep'),
  },
  bars: {
    hunger:  document.getElementById('hunger-bar'),
    thirst:  document.getElementById('thirst-bar'),
    hygiene: document.getElementById('hygiene-bar'),
    energy:  document.getElementById('energy-bar'),
  },
  vals: {
    hunger:  document.getElementById('hunger-val'),
    thirst:  document.getElementById('thirst-val'),
    hygiene: document.getElementById('hygiene-val'),
    energy:  document.getElementById('energy-val'),
  },
};

export const ctx = els.canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// ─── Stat Bars ────────────────────────────────────────────────
export function updateStats(state) {
  const stats = ['hunger', 'thirst', 'hygiene', 'energy'];
  stats.forEach(s => {
    const val = Math.round(state[s]);
    els.vals[s].textContent = val;
    els.bars[s].style.width = val + '%';
    els.bars[s].classList.toggle('warn',     val < 40 && val >= 20);
    els.bars[s].classList.toggle('critical', val < 20);
  });
}

// ─── Day Counter ──────────────────────────────────────────────
export function updateDay(day) {
  els.dayCounter.textContent = `Day ${day}`;
}

// ─── Mood Text ────────────────────────────────────────────────
export function updateMood(moodText) {
  els.moodText.textContent = moodText;
}

// ─── Ground Shadow ────────────────────────────────────────────
export function updateShadow(animName) {
  const lying = animName.includes('Sleep');
  els.groundShadow.style.width   = lying ? '140px' : '70px';
  els.groundShadow.style.opacity = lying ? '0.3'   : '0.5';
}

// ─── Sprite Rendering ─────────────────────────────────────────
export function renderSprite(state, images) {
  const { canvas } = els;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // If buddy is panhandling, leave canvas empty
  if (state.panhandling) return;

  const cfg = SPRITE_CONFIG[state.currentAnim];
  const img = images[state.currentAnim];
  if (!img || !img.complete || img.naturalWidth === 0) return;

  const sx = state.animFrame * cfg.fw;

  // All sprites are scaled relative to the largest frame size (208px),
  // so drink frames (125px) don't get blown up larger than other animations.
  const BASE = 208;
  const scale = canvas.width / BASE;
  const dw = cfg.fw * scale;
  const dh = cfg.fh * scale;
  const dx = (canvas.width  - dw) / 2;
  const dy = (canvas.height - dh) / 2 + (cfg.yOffset ?? 0);

  ctx.drawImage(img, sx, 0, cfg.fw, cfg.fh, dx, dy, dw, dh);
}

// ─── Log Message ─────────────────────────────────────────────
export function setLog(msg, urgent = false) {
  els.log.textContent = msg;
  els.log.classList.toggle('urgent', urgent);
}

// ─── Gone State ───────────────────────────────────────────────
export function setGoneState(isPanhandling) {
  setButtonsDisabled(isPanhandling);
  if (isPanhandling) {
    setLog('Gone to panhandle with friends');
  } else {
    setLog("Buddy's back. He looks rough.", true);
  }
}

// ─── Button State ─────────────────────────────────────────────
export function setButtonsDisabled(disabled) {
  Object.values(els.buttons).forEach(btn => (btn.disabled = disabled));
}

export function flashButtonActive(actionKey) {
  const btn = els.buttons[actionKey];
  if (!btn) return;
  btn.classList.add('active');
  setTimeout(() => btn.classList.remove('active'), 400);
}

// ─── Button Click Bindings ────────────────────────────────────
export function bindButtons(onAction) {
  Object.entries(els.buttons).forEach(([key, btn]) => {
    btn.addEventListener('click', () => onAction(key));
  });
}

// ─── Game Over Screen ─────────────────────────────────────────
export function showGameOver(days, cause) {
  els.goDays.textContent  = `Survived ${days} Day${days !== 1 ? 's' : ''}`;
  els.goCause.textContent = cause;
  els.gameover.classList.add('show');
}

export function hideGameOver() {
  els.gameover.classList.remove('show');
}

export function bindRestartButton(onRestart) {
  document.getElementById('btn-restart').addEventListener('click', onRestart);
}