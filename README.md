# Voxelcraft

A browser-based **Minecraft clone** built with [Three.js](https://threejs.org/) — no build step, no installs, just open it in a browser.

▶ **Play it:** once GitHub Pages finishes deploying, this lives at
`https://ethankruger1.github.io/minecraft/`

## Features

- **Procedural world** — Perlin-noise terrain with hills, beaches, oceans and oak trees.
- **Creative mode** — fly anywhere, unlimited blocks, no health/hunger.
- **Build & mine** — break blocks with a progressive cracking animation, place from a 9-slot hotbar.
- **Chunked voxel engine** — face-culled meshing + ambient-occlusion shading for a crisp, performant look.
- **Procedural textures** — every block texture is drawn on a canvas at runtime (grass, dirt, stone, cobblestone, sand, gravel, logs, planks, leaves, glass, water, snow, bricks, pumpkin, glowstone…), so there are zero image assets to download.
- **Particles & block highlight**, distance fog, sun-lit directional shading.
- **Desktop + touch controls** (on-screen joystick / look-pad on phones & tablets).

## Controls

| Action | Key |
| --- | --- |
| Move | `W` `A` `S` `D` |
| Jump / Fly up | `Space` |
| Sneak / Fly down | `Shift` |
| Toggle fly | double-tap `Space` |
| Sprint | `Ctrl` |
| Break block | Left click (hold) |
| Place block | Right click |
| Pick block | Middle click |
| Select slot | `1`–`9` or scroll wheel |
| Pause / release mouse | `Esc` |

## Running locally

It's a static site, so any web server works (ES-module imports need `http://`, not `file://`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Project layout

```
index.html              entry point + UI overlay
styles.css              HUD / hotbar / menu styling
libs/three.module.js    vendored Three.js (r160)
src/
  noise.js              seedable Perlin / fBm noise
  textures.js           procedural texture + crack atlases
  blocks.js             block registry (faces, hardness, hotbar)
  world.js              chunks, terrain gen, meshing, AO, raycasting
  player.js             creative-mode controller + AABB collision
  main.js               renderer, input, breaking, placing, particles
```

## Deployment

Served straight from this branch by GitHub Pages. In **Settings → Pages →
Build and deployment**, set **Source: Deploy from a branch**, pick this branch
with the **`/ (root)`** folder, and Pages hosts the static files as-is
(a `.nojekyll` file is included so nothing is pre-processed).
