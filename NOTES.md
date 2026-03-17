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

---

## Chat-Bot-Buddy Branch (2026-03-17)

### What we built
A separate branch (`chat-bot-buddy`) that takes the standalone webapp (not the extension) and integrates a live AI chatbot powered by Buddy's personality. Buddy can be spoken to directly and will occasionally say something unprompted.

**Files added:**
- `js/chat.js` — Buddy's personality, system prompt builder, conversation history (`appendHistory`/`clearHistory`), `STARTERS` array, `askBuddy()`, `getBuddyInitiation()`
- `js/llm.js` — provider abstraction layer; the only file that makes fetch calls to AI APIs
- `js/config.js` — gitignored runtime config; sets `window.BUDDY_CONFIG` with provider, apiKey, model

**Extension files removed from this branch:** `manifest.json`, `popup.html`, `js/background.js`, `js/popup.js`, `js/storage.js`

**Branch rule:** `chat.js` never imports from a provider directly — it only calls `sendMessage()` from `llm.js`. Switching provider requires only changing `config.js`.

---

### Provider abstraction (llm.js)

`sendMessage(systemPrompt, messages, config)` dispatches to one of six private provider functions based on `config.provider`. Each returns a plain string.

| Provider | Base URL | Default model |
|----------|----------|---------------|
| `anthropic` | `api.anthropic.com/v1/messages` | `claude-haiku-4-5` |
| `gemini` | `generativelanguage.googleapis.com/v1beta/...` | `gemini-1.5-flash` |
| `groq` | `api.groq.com/openai/v1/chat/completions` | `llama-3.1-8b-instant` |
| `openai` | `api.openai.com/v1/chat/completions` | `gpt-4o-mini` |
| `deepseek` | `api.deepseek.com/chat/completions` | `deepseek-chat` |
| `kimi` | `api.moonshot.cn/v1/chat/completions` | `moonshot-v1-8k` |

`config.model || 'default'` — empty string is falsy, so leaving `model: ""` in config correctly falls back to the provider default.

Gemini maps `assistant → model` in the role field; Anthropic uses a separate top-level `system` field; all others prepend the system prompt as the first message in the array.

On any error, `sendMessage` catches and returns `'...'` so the game never crashes from a failed API call.

---

### Anthropic message sanitization

Anthropic's API rejects requests where the messages array starts with an `assistant` role, has two consecutive messages with the same role, or is empty.

`callAnthropic` sanitizes the array before sending:
1. Strip any leading `assistant` messages
2. Remove any entry where `role === previous.role`
3. Fall back to `[{ role: 'user', content: 'hey' }]` if the array ends up empty

---

### API key security

The API key is never in any committed file. `js/config.js` is gitignored. It is loaded as a plain `<script>` tag (not a module) before `main.js`, so it sets `window.BUDDY_CONFIG` synchronously. Module code reads `window.BUDDY_CONFIG` at call time.

---

### Buddy initiation — moved out of rAF loop

**Bug:** `getBuddyInitiation` was being called inside the `requestAnimationFrame` loop. The `lastInitiation` cooldown check (`Date.now() - lastInitiation > 30000`) only prevented re-entry while a call was in-flight (`initiating` flag), but the condition was evaluated ~60 times per second, causing the flag/timer logic to race.

**Fix:** removed all initiation logic from `loop()`. A single `setInterval` set up once in `boot()` fires every 30 000 ms:

```js
setInterval(async () => {
  if (state.dead || state.panhandling) return;
  const line = await getBuddyInitiation(state);
  if (line) {
    appendChatMessage('buddy', line);
    appendHistory('assistant', line);
  }
}, 30000);
```

No flag, no timestamp, no cooldown math — the interval is the cooldown.

---

### Conversation history

`chat.js` maintains a module-level `history` array capped at 12 entries. `askBuddy` and `getBuddyInitiation` both slice the last 8 entries when building the messages payload. `clearHistory()` is called on restart.

History is not persisted between page loads — intentional, Buddy starts fresh each session.

---

### Wash log text

Updated across all three branches (`main`, `extension`, `chat-bot-buddy`):

> `"Getting cleaned up. He seems lighter."` → `"All washed up. Lookin' good & healthy."`
