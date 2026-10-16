# Tropic Merge

A tropical merge game for the browser and iPhone. Match three touching crops to grow them into bigger bundles.

## Play

- Tap an item, then tap an empty tile (or drag it there).
- Put 3 identical items next to each other to merge them into the next level (5 levels per crop).
- The island is a real top-down map with ocean around it. Drag the ground (or ocean) to look around; pinch or scroll-wheel to zoom.
- The grid only exists on land, follows the coastline, and palm trees, bushes and rocks block their cells.
- A supply blimp drifts by every 1 to 3 minutes. Tap it 3 to 7 times and each tap drops 1 to 5 new crops.

## Host on GitHub Pages

1. Put all files in this folder at the root of a repository (keep the `icons/` folder).
2. Settings > Pages > Deploy from a branch > `main` / root.
3. Open `https://<you>.github.io/<repo>/`.

Everything uses relative paths, so it works from a sub-path.

## Offline

`sw.js` caches the whole game on first load. After that it runs with no connection, and on iPhone you can
Share > Add to Home Screen to launch it full-screen. Progress is saved in the browser (localStorage).

When you publish a new version, change `CACHE_VERSION` in `sw.js` so players pick up the update.

## Tuning

Game constants are at the top of `game.js` (`BLIMP` for blimp timing, tap counts and drop sizes; `COLS`/`ROWS` for the grid).
The first blimp arrives after 15 seconds so new players meet it; set `BLIMP.firstDelay` to 60+ to remove that.
