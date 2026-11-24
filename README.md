# Quogue Wildlife Refuge — Offline Mobile Trail Navigator

An offline-first Progressive Web App (PWA) reimagining the Quogue Wildlife Refuge trail map (`3 Old Country Rd, Quogue, NY`) into a sunlit, ultra-simple mobile GPS guide built for kids, families, and seniors.

## Key Features

- **Sunlit Field Guide Vector Map**: High-contrast illustrated SVG map anchored to real-world OpenStreetMap GPS coordinates reconciled with QWR's December 2025 trail map (Old Ice Pond, North Pond, Deer Pond, Dwarf Pine Barrens, Forest Regeneration Area, Eastern Bluebird Nestboxes, New Trail, and Fairy Dell Boardwalk).
- **4 Standard Blaze Loops + Automatic Closure Detours**: Choose **Green (0.8 mi)**, **Yellow (1.4 mi)**, **Blue (2.5 mi)**, or **Red (3.1 mi)**. When any trail section is closed, the router automatically detours around closures and recalculates mileage.
- **Dead-Simple Custom Walks ("Take Me To…")**: Tap 1 or more landmarks and auto-route the shortest open loop back to Parking.
- **Heading-Up Turn-by-Turn & Off-Track Guidance**: Oversized turn arrows, compass heading-up rotation with upright labels, hysteresis-stabilized off-track detection with live rejoin arrow, gentle haptics, and optional offline Web Speech voice prompts.
- **Safety Built-In**: One-tap **Back to Parking**, direct QWR Office call button `(631) 653-4771`, live GPS coordinate display, and offline NOAA solar sunset countdown.
- **100% Offline PWA**: Tiny static bundle cached via Service Worker (`vite-plugin-pwa`). Works with zero cell signal deep in the Pine Barrens.
- **Built-In Virtual Walk Simulator**: Test turn-by-turn navigation, off-track recovery, and tap-to-teleport from anywhere away from the Refuge.

## Updating Trail Closures (Admin Workflow)

Edit [`public/data/trail-status.json`](public/data/trail-status.json) and see [`TRAIL_UPDATES.md`](TRAIL_UPDATES.md) for the complete segment ID lookup table. Validate changes before publishing:

```bash
npm run validate:trails
```

## Development & Build

```bash
npm install
npm run dev           # Local dev server
npm test              # Run Vitest core engine suite
npm run validate:trails
npm run build         # Typecheck + build static offline PWA in dist/
npm run preview       # Preview production PWA locally
```
