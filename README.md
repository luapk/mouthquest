# MOUTHQUEST

A kids' tooth-brushing game prototype for Oral-B. A healthy-lifestyle space hero
plays out four action scenes, one per quadrant of the mouth, and real brushing on
an Oral-B brush drives every scene. Built with Vite + React, deploys to Vercel.

## Quick start

```bash
npm install
npm run dev      # local dev at http://localhost:5173
npm run build    # production build to /dist
npm run preview  # preview the build
```

## Deploy to Vercel

Option A, from GitHub:
1. Push this folder to a new GitHub repo.
2. In Vercel, New Project, import the repo. Framework preset auto-detects as Vite.
3. Deploy. No env vars needed.

Option B, from the CLI:
```bash
npm i -g vercel
vercel        # follow prompts
vercel --prod
```

## Connecting a real Oral-B (Android only)

The brush broadcasts its live state in BLE advertisement manufacturer data
(company id 0x00DC). The app listens to advertisements and decodes state,
brushing time, sector and pressure. No pairing is needed for the core data.

To run with a real brush:
1. Deploy to your own https origin (this is the default on Vercel).
2. On the device, open Chrome and enable
   chrome://flags/#enable-experimental-web-platform-features
   (advertisement scanning sits behind this flag).
3. Tap "Connect Oral-B", pick the brush, start brushing.

Web Bluetooth is Chrome/Android (and desktop Chrome) only. iOS Safari does not
support it. The on-screen "Simulate brushing" button drives the whole game with
no hardware, anywhere.

## What is real vs placeholder

Real and working: the four scenes, the camera zoom, the quadrant-matched teeth,
the completion rewards, the Oral-B advertisement parser (a faithful port of the
oralb-ble library, verified against captured packets), and the simulator.

Placeholder for a production build: the Oral-B wordmark on the loader (drop in the
real brand asset), the Stats tab data (sample data, would fill from real sessions),
and the swim/climb hero animations (currently reuse the run cycle). The germs are
still vector art until a germ sprite sheet is added.

## Art pipeline

All sprites are configured in one block, `SPRITES`, near the top of
`src/MouthGym.jsx`. Each entry is one png/webp sheet with frames in a uniform grid:

```js
hero_run: { src:"/sprites/spaceman_run_clean.png", frameW:170, frameH:240,
            frames:10, cols:5, fps:10, h:150, anchorY:0.95 },
```

Do not use gif/animated-webp/video for characters: the browser owns their
timeline, so frames cannot be synced to gameplay. Use static sprite sheets.

See CLAUDE.md for the full architecture and a task list.
