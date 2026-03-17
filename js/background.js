import { createState, update, isPanhandling, chooseIdleAnim, setAnim, ACTIONS } from './game.js';
import { saveState, loadState } from './storage.js';

let state    = null;
let popupPort = null; // long-lived port to the open popup, if any

// ── Helpers ────────────────────────────────────────────────────────────────

function applyAction(actionKey) {
  if (state.busy || state.dead || isPanhandling(state)) return false;
  const action = ACTIONS[actionKey];
  if (!action) return false;

  const prefix = state.hygiene <= 15 ? 'Dirty' : 'Clean';

  state[action.stat] = Math.min(100, state[action.stat] + action.amount);
  Object.entries(action.sideEffects).forEach(([stat, delta]) => {
    state[stat] = Math.max(0, Math.min(100, state[stat] + delta));
  });

  setAnim(state, `${prefix}_${action.anim}`);
  state.busy        = true;
  state.action      = actionKey;
  state.actionTimer = action.duration;
  return true;
}

function tick() {
  if (!state || state.dead) return;

  const now     = Date.now();
  const elapsed = state.lastSaved ? (now - state.lastSaved) / 1000 : 0;
  state.lastSaved = now;

  if (elapsed > 0) {
    const cause = update(state, elapsed);
    if (cause && !state.dead) {
      state.dead  = true;
      state.cause = cause;
      saveState(state);
      if (popupPort) {
        try { popupPort.postMessage({ type: 'gameOver', cause }); } catch (_) { popupPort = null; }
      }
      return;
    }
    if (!state.panhandling) setAnim(state, chooseIdleAnim(state));
  }

  saveState(state);

  if (popupPort) {
    try { popupPort.postMessage(state); } catch (_) { popupPort = null; }
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

self.addEventListener('install', () => {
  loadState().then(stored => {
    state = stored ?? createState();
    state.lastSaved = Date.now();
    saveState(state);
    chrome.alarms.create('buddyTick', { periodInMinutes: 1 });
  });
});

self.addEventListener('activate', () => {
  // Restore in-memory state if worker was restarted
  if (!state) {
    loadState().then(stored => {
      state = stored ?? createState();
    });
  }
});

// Ensure state is in memory, loading from storage if the worker was restarted.
async function ensureState() {
  if (!state) state = (await loadState()) ?? createState();
}

// ── Alarm tick (coarse fallback while popup is closed) ─────────────────────

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== 'buddyTick' || popupPort) return;
  await ensureState();
  tick();
});

// ── Port connection (fine-grained ticks while popup is open) ───────────────

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'popup') return;

  popupPort = port;

  port.onMessage.addListener(async msg => {
    if (msg.type !== 'tick') return;
    await ensureState();
    tick();
  });

  port.onDisconnect.addListener(() => {
    popupPort = null;
    // Stamp the time so the next alarm tick has a correct baseline
    if (state) state.lastSaved = Date.now();
  });
});

// ── Message handler ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Ensure state is loaded before handling any message
  const respond = () => {
    switch (message.type) {
      case 'getState':
        sendResponse(state);
        break;

      case 'doAction':
        applyAction(message.action);
        saveState(state);
        sendResponse(state);
        break;

      case 'setDifficulty':
        state.difficulty = message.difficulty;
        saveState(state);
        sendResponse(state);
        break;

      case 'restart':
        state = createState();
        state.lastSaved = Date.now();
        saveState(state);
        sendResponse(state);
        break;

      default:
        sendResponse(null);
    }
  };

  if (state) {
    respond();
  } else {
    loadState().then(stored => {
      state = stored ?? createState();
      respond();
    });
  }

  return true; // keep channel open for async response
});
