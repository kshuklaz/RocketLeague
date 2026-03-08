# RocketLeague

RocketLeague is a browser-based JavaScript project simulating a simplified Rocket League match.

## Getting Started

1. Serve the project with a simple HTTP server (required for ES modules):
   ```bash
   cd /Users/kshukla/PROJ/RocketLeague
   python3 -m http.server 8000
   ```
2. Open `http://localhost:8000` in your browser.
3. The app entry point is `src/main.js` (loaded as an ES module from `index.html`).

## Project Structure

- `index.html` – main HTML file and menu/UI layout
- `styles.css` – styling for HUD and menus
- `game.js` – legacy monolithic script (no longer loaded)
- `src/` – modular source code:
  - `constants.js` – game constants and presets
  - `utils.js` – helper functions
  - `state.js` – single mutable state object and state transitions
  - `entities.js` – factories for cars, boost pads, field helpers
  - `physics.js` – vehicle and ball physics, AI, collisions
  - `render.js` – camera maths and drawing routines
  - `ui.js` – DOM interactions and HUD updates
  - `input.js` – keyboard handling
  - `main.js` – game loop and high‑level orchestration

Feel free to modify modules or add new features; the refactored architecture keeps concerns separated and simplifies maintenance.

