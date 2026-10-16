# Tropic Merge

A free tropical merge game for the browser and iPhone. No ads, no purchases, no real-money currency: everything is earned by playing.

## How to play

- Tap an item, then tap an empty tile (or drag it there). Put 3 identical items together to merge them (5 levels each).
- Merge **5 at once** (for example drop the middle piece between two pairs) and you get **two** items of the next level.
- Drag the map to look around; pinch or scroll-wheel to zoom. The grid only exists on land.
- A supply blimp drifts by every 1 to 3 minutes. Tap it 3 to 7 times; each tap drops 1 to 5 crops.

## Systems

- **Fog of war**: four outer sectors of the island sit under mist. Tap the mist to see what it needs (level, coins, planks or bricks).
- **Clearing**: tap a bush, boulder or fallen palm and spend energy to clear it. You keep the wood or stone it leaves.
- **Farming**: tap an empty tile and plant wheat, corn, carrots, or (at higher levels) coconut and mango trees. Tap ripe plants to harvest. Trees keep producing.
- **Energy**: regenerates by itself (1 per 50 s). Pays for planting, tree harvests and clearing.
- **Workshops**: kitchen, sawmill and juice hut turn board items into goods.
- **Orders**: sailors pay coins and XP for items and goods.
- **Quests**: a 14-chapter story with dialogue and delivery goals.
- **Daily tasks**: five rotating tasks plus a chest, with a streak bonus.
- **Season track**: a free 20-tier monthly track (unlocks blimp skins).
- **Coral Lagoon event**: a separate underwater map with its own items and milestone rewards. It opens 6 days out of every 10 (`EVENT` in `game.js`). The Events panel has a "Preview the event now" button for testing.
- **Pearls** are an in-game-only currency (quests, dailies, season) used to speed up growing and crafting or refill energy.

## Host on GitHub Pages

1. Put all files in this folder at the root of a repository (keep `icons/`).
2. Settings > Pages > Deploy from a branch > `main` / root.
3. Open `https://<you>.github.io/<repo>/`.

Everything uses relative paths, so it works from a sub-path.

## Offline

`sw.js` caches the whole game on first load, so it runs with no connection. On iPhone use Share > Add to Home Screen. Progress is saved in the browser (localStorage). A save from the first island version is migrated (crops are kept, new systems start fresh).

When you publish a new version, change `CACHE_VERSION` in `sw.js`.

## Tuning

Constants are at the top of `game.js`: `BLIMP`, `PLANTS`, `STATIONS`, `CLEAR`, `SECTORS`, `QUESTS`, `DAILY_POOL`, `SEASON_TIERS`, `EVENT`, and the economy values (`ENERGY_REGEN`, `xpNeed`, `ITEM_VALUE`).
