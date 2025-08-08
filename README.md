# VibeCastleRush


A minimal StarCraft‑inspired real‑time strategy (RTS) game for the browser. Built with HTML5 Canvas, CSS, and vanilla JavaScript.

## Vision
- Deliver a small, playable RTS loop with colorful, glowy visuals and crisp readability.
- Keep mechanics simple: 1 friendly base, 3 unit types, trees/rocks for resources, no fog of war.

## Tech Stack
- HTML + CSS
- JavaScript (Canvas 2D), device‑pixel‑ratio aware rendering

## Core Features
- __Single Base (Fort)__: Static home base you defend. Trains units. Has an HP bar and can be destroyed (game over).
- __Units are Clickable__: Left‑click selects, Shift adds to selection. Right‑click (or Alt/⌘+Left‑click) issues commands.
- __Resources__: Trees (Wood) and Rocks (Stone). Nodes deplete and despawn when empty.
- __Gathering & Deposit__: Gatherers harvest from nodes and return to Fort to deposit into Wood/Stone banks.
- __Training Units__: HUD buttons train Gatherer, Warrior, Defender with resource costs.
- __World & Camera__: Large world (3000×2000). Scroll the map with WASD or Arrow keys. Camera starts centered on the Fort. Subtle grid for orientation.
- __Visual Style__: Vibrant colors, glow/bloom, outlines for readability on a dark‑green grass background. Selection rings and command pings.
- __Enemy AI & Combat__: Periodic enemy “raider” waves approach from the right. Units auto‑attack in range. Enemies target nearest unit or Fort.
- __Physics/QoL__: Simple movement with gentle unit separation to reduce stacking.

## Units
- __Gatherer__
  - Speed: 1.6
  - HP: 40
  - Carry: 25
  - Harvest Rate: 10/s
  - Combat: none
- __Warrior__
  - Speed: 2.25
  - HP: 70
  - Attack: 12 | Range: 18 | Cooldown: 0.5s
- __Defender__
  - Speed: 1.25
  - HP: 120 | Armor: 0.4
  - Attack: 8 | Range: 18 | Cooldown: 0.9s

## Resource Nodes
- __Tree__: Wood source, ~240 total, radius ~14
- __Rock__: Stone source, ~280 total, radius ~15

## HUD & Training
- Top bar shows Wood and Stone counts.
- Buttons to train:
  - Gatherer — 50 wood
  - Warrior — 70 wood, 30 stone
  - Defender — 40 wood, 110 stone

## Controls
- __Left‑click__: Select a unit under cursor
- __Shift + Left‑click__: Add to selection
- __Right‑click__ or __Alt/⌘ + Left‑click__: Issue command (move; gather if a resource was clicked)
- __W/A/S/D__ or __Arrow Keys__: Scroll the camera

## Current Status (Implemented)
- Device‑pixel‑ratio scaled canvas, core render/update loop.
- Click selection, Shift multi‑select, visual command pings.
- Resource spawning across the world; gatherers harvest and return. Deposit respects resource type (bug fix tracked carried type).
- Fort rendering with HP bar; unit training with costs.
- Visual readability: dark‑green grass theme, bloom/glow, outlines for units and rocks; grid overlay.
- World camera: 3000×2000, WASD/Arrow scrolling, camera starts centered on Fort.
- Enemy waves (raiders) with simple AI; player units auto‑attack; Fort can be destroyed (game‑over overlay).
- Fixed shape helper usage so Warriors and Rocks render correctly.

## Roadmap / Next
- General polish and balancing.
- Drag‑box selection (marquee) and formation offsets.
- Better pathing/spacing and smarter target selection.
- Sound effects and simple music toggle.
- Minimap and/or camera edge scroll.
- Save/load minimal state (optional).

## How to Run
1) Serve the folder locally (simple option):
```bash
python3 -m http.server 8080
```
2) Visit http://127.0.0.1:8080 in your browser (Chrome/Firefox/Safari).

## Project Structure
- `index.html` — HTML shell & HUD
- `style.css` — UI and background theme
- `main.js` — Canvas game logic and rendering
- `README.md` — This document

## Notes
- No fog of war. One friendly Fort. Simple shapes over high detail.
- FPS‑friendly effects; subtle separation to limit unit overlaps.
