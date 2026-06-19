# CLAUDE.md - MOUTHQUEST

Handoff for Claude Code. This is a single-component canvas game in a Vite + React
shell. No backend, no router, no state library. Keep it that way unless a task
needs otherwise.

## Run

```bash
npm install
npm run dev
```

## House rules

- No em dashes anywhere in copy, comments, docs, or UI strings.
- Stack stays Vite + React + plain inline styles. No Tailwind, no CSS framework.
- Keep the real-brush pipeline intact. It is the credibility of the whole thing.

## File map

- src/main.jsx          React entry, mounts MouthGym
- src/MouthGym.jsx       the entire game (parser, engine, scenes, UI, styles)
- src/index.css          html/body reset only
- public/sprites/        sprite sheets (PNG, transparent, uniform grid)

## Architecture (all in src/MouthGym.jsx)

1. Oral-B parser. parseOralB(bytes) decodes the BLE advertisement manufacturer
   data (id 0x00DC), returning state, running, seconds, sector -> quad, pressure,
   mode. Faithful port of the oralb-ble library. SECTOR_TO_QUAD maps the noisy
   sector code to quadrant 0..3; calibrate per brush model using the Brush link
   panel in the UI.

2. Input. Two sources feed one ingest() path: real (Web Bluetooth
   watchAdvertisements) and sim (buildSimBytes on an interval). Both produce the
   same byte shape, so the game cannot tell them apart.

3. Two loops.
   - Logic loop (100ms, setInterval): owns the clean[4] progress meters, phase,
     coaching, completion stamps, stars, streak, finale. React state, drives HUD.
   - Render loop (rAF): reads refs only (inputRef, cleanRef, worldRef), never
     state. Owns the camera, entities, particles, and all canvas drawing.

4. World model (worldRef.current): camera viewport (vp), focused quadrant,
   intensity, particles, beams, per-scene entity lanes (ent[q]), spawn/fire/jump
   timers, easeoff counters. Mutated each frame by updateScene().

5. Scenes. World is a 2x2 grid of 1000x640 cells, one per quadrant. The camera
   lerps between the whole-grid overview and a single focused cell. Each cell is
   framed by giant quadrant-matched teeth (drawTeeth) so it reads as a mouth.
   - q0 CYCLE  laser: germs rush in, laser pops them (updateScene laser branch)
   - q1 RUN    timing: germs charge in, a well-timed jump pops them
   - q2 SWIM   laser: underwater laser shooter
   - q3 CLIMB  procedural: germs knocked off the wall as you ascend
   Brushing intensity drives hero animation speed; pressure-high = ease-off fail
   state in every scene.

6. Sprites. SPRITES registry + drawSprite + drawHero. drawHero uses a sheet if
   loaded, else falls back to the vector astronaut (drawAstro). germ falls back to
   drawGermVector. Pixel scaling is crisp (imageSmoothingEnabled=false).

## Adding art

Drop a sheet in public/sprites and set its SPRITES entry: src, frameW, frameH,
frames, cols, fps, h (drawn height in world px), anchorY (0 top .. 1 bottom).
Keys: hero_cycle, hero_run, hero_swim, hero_climb, germ. Sheets must be one png
with all frames the same cell size in a left-to-right grid, transparent bg.

## Good next tasks

- Add hero_swim and hero_climb sheets (currently reuse the run cycle).
- Add a germ sprite sheet (idle loop + pop), wire to the germ key.
- Add a shoot pose sheet and fire its frame on each laser; a jump pose for the leap.
- Replace the Oral-B wordmark on the Loader with the real brand asset.
- Wire the Stats tab to persisted real sessions instead of sample data.
- Per-brush sector calibration UI (the Brush link panel already shows raw bytes).
- Onboarding flow: tell the child which corner to start with.

## Known constraints

- Web Bluetooth is Android/desktop Chrome only, behind a flag for advert scanning.
- The reverse-engineered sector data is coarser than the official Oral-B app. A
  production build needs a P&G/Oral-B SDK partnership; this prototype proves the
  concept on real hardware via passive advertisements.
