# Dev Notes

---

## Extension Architecture (2026-03-17)

### What we built
Converted the standalone browser game into a Chrome MV3 extension. The game now persists state across sessions using `chrome.storage.local` and ticks in the background even when the popup is closed.

**Files added:**
- `manifest.json` — MV3 manifest, popup action, background service worker, storage + alarms permissions
- `js/storage.js` — thin async wrappers around `chrome.storage.local` (`saveState`, `loadState`, `clearState`)
- `js/background.js` — service worker; owns all game state and logic
- `js/popup.js` — replaces `main.js` for the extension; render-only, no game loop
- `popup.html` — identical to `index.html` but fixed at 420px wide and loads `popup.js`

**Architecture rule:** `game.js` is never modified. All logic runs through message passing.

---

### Hybrid tick system

Chrome MV3 alarms have a minimum period of 1 minute — too coarse for a game where a day is 2 real minutes.

**Solution:** two-tier ticking:
- **Popup open** — popup drives ticks via `setInterval` (1 s) sending `{ type: 'tick' }` over a long-lived port (`chrome.runtime.connect`). Background processes each tick and pushes updated state back through the port.
- **Popup closed** — `chrome.alarms` fires every 1 minute as a coarse fallback. The alarm handler is guarded with `!popupPort` so the two never double-apply.

Elapsed time is always computed as `Date.now() - state.lastSaved`, so the real wall-clock delta is applied regardless of which tick path fires.

**On port disconnect:** `state.lastSaved` is stamped so the first alarm tick after popup close has a correct baseline.

---

### Service worker restart safety

Chrome can terminate and revive the service worker at any time (not just on browser restart). Each revival starts with a blank JS context — `state` is `null` again.

**Bug found:** the original `onAlarm` handler called `tick()` directly. `tick()` guards `if (!state) return` — so on revival, the alarm would fire silently forever without rehydrating state.

**Fix:** `ensureState()` is called before every alarm tick and port tick:
```js
async function ensureState() {
  if (!state) state = (await loadState()) ?? createState();
}
```
The `onMessage` handler already did lazy-loading; alarm and port handlers now do the same.

---

### Death signal design

**Original approach:** background pushed full state every tick; popup checked `if (state.dead) handleDeath()` on each push. A separate `deathShown` flag prevented double-firing.

**Problem:** `deathShown` lives in popup memory. If the service worker dies and revives, `deathShown` resets to `false` — but so does any state we'd need to check. Storing flags in memory that mirror persisted state creates a desync risk.

**Fix:** derive death from the persistent source of truth (`state.dead`) instead of tracking it separately.

- Background guards death with `if (cause && !state.dead)` — idempotent, safe to call repeatedly
- On death, background sends `{ type: 'gameOver', cause }` through the port instead of a normal state push
- `tick()` returns immediately after death; no further state pushes occur
- Popup's `port.onMessage` routes on `msg.type`: `'gameOver'` → `handleDeath()`, anything else → state update
- When popup reopens after death, `getState` returns the persisted state with `dead: true` and `cause` already set — popup shows game over from that alone, no flags needed

**Result:** `deathShown` flag removed entirely. Death can only fire once per session (guarded in background), and worker revivals never cause stale flag problems.

---

### Hard mode decay rates

Energy and hygiene on hard are now synced to the game day (1 day = 120 real seconds):

| Stat | Rate | Effect |
|------|------|--------|
| Energy | 0.458 /s | ~55 pts/day — exactly one sleep (restores 55) needed per day |
| Hygiene | 0.35 /s | ~42 pts/day — crosses dirty threshold (≤15) ~2 days after washing |

While panhandling, the `decayMultiplier` is 0.1 — energy only drops ~5.5 pts/day out there, consistent with "he can sleep rough."

---

### Animation: decoupled from background ticks

**Problem:** sprite was animating at ~1 fps because `animFrame` was only advancing once per background tick (1 s), and the popup's rAF loop just rendered whatever frame was in the received state.

**Fix:** popup now owns frame advancement entirely. Two independent loops:

- **`syncUI()`** — called on every port message (~1/s). Updates stat bars, mood text, day counter, button state, panhandling transitions. Never gated on `state.panhandling`.
- **`animLoop()`** — pure rAF loop (~60 fps). Reads `state.currentAnim` from the last received state, advances `localAnimFrame` using `Date.now()` delta and `SPRITE_CONFIG[anim].fps`, calls `renderSprite({ ...state, animFrame: localAnimFrame })`. Does not wait for the background.

Background still advances `animFrame` in `update()` (game.js unchanged), but the popup ignores it. When `currentAnim` changes (detected by comparing to `localAnimName`), local frame and timer reset to 0.

---

### setAnim guard while panhandling

**Bug:** `tick()` in background.js called `setAnim(state, chooseIdleAnim(state))` after every `update()` call, unconditionally. Since `update()` is where panhandling *starts*, the anim was being overwritten back to idle in the same tick that panhandling triggered — and then kept overwriting on every subsequent tick while panhandling was active.

This needlessly reset the popup's local `localAnimFrame` counter on every tick (the popup detects anim changes and resets its frame), causing animation stutter.

**Fix:** `if (!state.panhandling) setAnim(state, chooseIdleAnim(state))` — background only sets idle/sit anims when Buddy is actually present.

---

### Stats appear frozen while panhandling

Stats DO decay while panhandling — at `0.1×` normal rate. The popup correctly calls `updateStats` on every tick. The values just barely move: on easy mode hunger decays `0.01 pts/s`, so `Math.round()` shows the same integer for ~100 seconds. This is intentional (Buddy is away, not dying) and left as-is.

---

### Difficulty not persisting across popup sessions

**Bug:** the difficulty toggle in popup.js only mutated the local `state` copy. The background worker's state (and storage) never knew about the change. On next popup open, `getState` returned the background's stale `difficulty: 'easy'`.

**Fix:** toggle now sends `{ type: 'setDifficulty', difficulty }` via `chrome.runtime.sendMessage`. Background updates `state.difficulty`, saves to storage, and returns the updated state. Popup syncs its local state from the response.
