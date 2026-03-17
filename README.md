# Buddy — Keep Him Alive

A Tamagotchi-style browser game. Feed, hydrate, wash, and rest Buddy before his stats hit zero.

## Project Structure

```
buddy/
├── index.html          # Markup only — no inline scripts or styles
├── css/
│   └── style.css       # All styles and CSS variables
├── js/
│   ├── main.js         # Entry point — boots game, owns the loop
│   ├── game.js         # State, logic, decay, action definitions
│   ├── ui.js           # All DOM reads/writes and rendering
│   └── sprites.js      # Sprite config and preloader
├── sprites/            # PNG spritesheets
│   ├── Clean_Idle.png
│   ├── Dirty_Idle.png
│   └── ...
└── .vscode/
    └── settings.json   # Live Server config
```

## Running Locally

The game uses ES modules (`type="module"`), so it must be served over HTTP — opening `index.html` directly as a `file://` URL will block module imports.

### Option 1 — VSCode Live Server (recommended)
1. Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension
2. Right-click `index.html` → **Open with Live Server**

### Option 2 — Node
```bash
npx serve .
```

### Option 3 — Python
```bash
python3 -m http.server 5500
```

Then open `http://localhost:5500` in your browser.

## Game Loop

- **4 stats** decay over time: Hunger, Thirst, Hygiene, Energy
- Hygiene degrades appearance (Clean → Dirty sprites) but doesn't cause death
- Hunger, Thirst, and Energy hitting zero triggers game over
- Each **day** is 120 real-world seconds

## Sprite Sheets

All sheets have a black background (transparent in-game via canvas rendering).

| Animation    | Frames | Frame size |
|-------------|--------|------------|
| Idle        | 8      | 208×208    |
| Sit         | 8      | 208×208    |
| Eat         | 8      | 208×208    |
| Sleep       | 8      | 208×208    |
| Drink       | 16     | 125×125    |

Each animation has a Clean and Dirty variant created using Pixelengine.ai.
