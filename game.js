/* ==========================================================================
   Tropic Merge  -  HTML5 canvas merge game
   Match 3 of the same crop (touching) to grow it into a bigger bundle.
   No external assets: all art is drawn with code, all audio is synthesized.
   ========================================================================== */
(() => {
'use strict';

/* ------------------------------------------------------------------ config */
const TILE = 92;                       // one grid cell, in world pixels
const MAPW = 32, MAPH = 36;            // world size in cells
const SUB = 2;                         // coastline detail: sub-tiles per cell
const SUBPX = TILE / SUB;
const SW = MAPW * SUB, SH = MAPH * SUB;
const WORLD_W = MAPW * TILE, WORLD_H = MAPH * TILE;
const ISLAND_SEED = 7;
let ISLAND_CX = WORLD_W / 2, ISLAND_CY = WORLD_H / 2;   // recentred once the island exists
let ISLAND_W = 1400, ISLAND_H = 1700;

const MAX_LEVEL = 5;

// Every mergeable thing. 5 levels each: single > bunch > bundle > basket > golden crate.
const ITEM_DEFS = {
  corn:     { emoji: '\u{1F33D}', color: '#ffd23f', bow: '#d62839', group: 'crop',     names: ['Corn Cob', 'Corn Bunch', 'Corn Bundle', 'Corn Basket', 'Golden Corn Crate'] },
  carrot:   { emoji: '\u{1F955}', color: '#ff8f3a', bow: '#0a9396', group: 'crop',     names: ['Carrot', 'Carrot Bunch', 'Carrot Bundle', 'Carrot Basket', 'Golden Carrot Crate'] },
  wheat:    { emoji: '\u{1F33E}', color: '#e8b83c', bow: '#6a4c93', group: 'crop',     names: ['Wheat Stalk', 'Wheat Bunch', 'Wheat Sheaf', 'Wheat Basket', 'Golden Wheat Crate'] },
  coconut:  { emoji: '\u{1F965}', color: '#d9b48a', bow: '#2a9d8f', group: 'fruit',    names: ['Coconut', 'Coconut Pair', 'Coconut Bundle', 'Coconut Basket', 'Golden Coconut Crate'] },
  mango:    { emoji: '\u{1F96D}', color: '#ffb703', bow: '#e76f51', group: 'fruit',    names: ['Mango', 'Mango Pair', 'Mango Bundle', 'Mango Basket', 'Golden Mango Crate'] },
  wood:     { emoji: '\u{1FAB5}', color: '#b07a45', bow: '#2a6f97', group: 'material', names: ['Driftwood', 'Log Pile', 'Timber Bundle', 'Lumber Basket', 'Golden Timber Crate'] },
  stone:    { emoji: '\u{1FAA8}', color: '#a3afb6', bow: '#7b2cbf', group: 'material', names: ['Stone Chunk', 'Stone Pile', 'Stone Bundle', 'Stone Basket', 'Golden Stone Crate'] },
  shell:    { emoji: '\u{1F41A}', color: '#ffb4c2', bow: '#4361ee', group: 'event',    names: ['Seashell', 'Shell Pair', 'Shell Bundle', 'Shell Basket', 'Golden Shell Crate'] },
  starfish: { emoji: '⭐',    color: '#ff8c5a', bow: '#06d6a0', group: 'event',    names: ['Starfish', 'Starfish Pair', 'Starfish Bundle', 'Starfish Basket', 'Golden Starfish Crate'] }
};
const ALL_TYPES = Object.keys(ITEM_DEFS);
const TYPES = ALL_TYPES.filter((t) => ITEM_DEFS[t].group === 'crop');       // what the blimp drops and the island starts with
const EVENT_TYPES = ALL_TYPES.filter((t) => ITEM_DEFS[t].group === 'event');
const TYPE_EMOJI = {}, NAMES = {}, TYPE_COLOR = {}, BOW_COLOR = {};
for (const k of ALL_TYPES) {
  TYPE_EMOJI[k] = ITEM_DEFS[k].emoji; NAMES[k] = ITEM_DEFS[k].names;
  TYPE_COLOR[k] = ITEM_DEFS[k].color; BOW_COLOR[k] = ITEM_DEFS[k].bow;
}

// Goods made in the workshops. They live in the barn (a counter), not on the grid.
const GOODS = {
  bread: { name: 'Corn Bread',   emoji: '\u{1F35E}', value: 30 },
  stew:  { name: 'Carrot Stew',  emoji: '\u{1F372}', value: 28 },
  plank: { name: 'Plank',        emoji: '\u{1FAB5}', value: 12 },
  brick: { name: 'Brick',        emoji: '\u{1F9F1}', value: 12 },
  drink: { name: 'Coconut Drink', emoji: '\u{1F964}', value: 26 },
  jam:   { name: 'Mango Jam',    emoji: '\u{1F36F}', value: 40 }
};

// Things you can plant on an empty tile. Crops are picked once; trees keep giving.
const PLANTS = {
  wheat:   { name: 'Wheat',        kind: 'crop', item: 'wheat',   grow: 30,  yield: [2, 3], energy: 1, coins: 0,   unlock: 1 },
  corn:    { name: 'Corn',         kind: 'crop', item: 'corn',    grow: 45,  yield: [2, 3], energy: 1, coins: 0,   unlock: 1 },
  carrot:  { name: 'Carrot',       kind: 'crop', item: 'carrot',  grow: 60,  yield: [2, 3], energy: 1, coins: 0,   unlock: 1 },
  coconut: { name: 'Coconut Palm', kind: 'tree', item: 'coconut', grow: 150, regrow: 100, yield: [2, 3], energy: 2, coins: 60,  unlock: 3, pick: 1 },
  mango:   { name: 'Mango Tree',   kind: 'tree', item: 'mango',   grow: 240, regrow: 150, yield: [2, 3], energy: 2, coins: 150, unlock: 5, pick: 1 }
};
const PLANT_ORDER = ['wheat', 'corn', 'carrot', 'coconut', 'mango'];

// Workshops turn board items into goods. One job at a time per workshop.
const STATIONS = [
  { id: 'kitchen', name: 'Island Kitchen', emoji: '\u{1F373}', unlock: 2, recipes: [
    { id: 'bread', out: { good: 'bread', n: 1 }, inp: [{ type: 'corn', level: 2, n: 1 }, { type: 'wheat', level: 2, n: 1 }], time: 45 },
    { id: 'stew',  out: { good: 'stew', n: 1 },  inp: [{ type: 'carrot', level: 2, n: 2 }], time: 60 }
  ] },
  { id: 'sawmill', name: 'Sawmill', emoji: '\u{1FA9A}', unlock: 3, recipes: [
    { id: 'plank', out: { good: 'plank', n: 2 }, inp: [{ type: 'wood', level: 2, n: 1 }], time: 30 },
    { id: 'brick', out: { good: 'brick', n: 2 }, inp: [{ type: 'stone', level: 2, n: 1 }], time: 30 }
  ] },
  { id: 'press', name: 'Juice Hut', emoji: '\u{1F379}', unlock: 4, recipes: [
    { id: 'drink', out: { good: 'drink', n: 1 }, inp: [{ type: 'coconut', level: 2, n: 1 }], time: 60 },
    { id: 'jam',   out: { good: 'jam', n: 1 },   inp: [{ type: 'mango', level: 2, n: 1 }], time: 75 }
  ] }
];

// Clearable obstacles: energy cost and the raw material they leave behind.
const CLEAR = {
  bush: { energy: 1, loot: 'wood', n: 2, label: 'Overgrown Bush' },
  palm: { energy: 3, loot: 'wood', n: 3, label: 'Fallen Palm' },
  rock: { energy: 2, loot: 'stone', n: 3, label: 'Boulder' }
};

// Sectors of the island. Sector 0 is open from the start; the others sit under fog.
const SECTORS = [
  { name: 'Home Shore',  lvl: 1, coins: 0 },
  { name: 'Palm Grove',  lvl: 3, coins: 150,  good: 'plank', n: 2 },
  { name: 'Coral Cove',  lvl: 5, coins: 400,  good: 'brick', n: 2 },
  { name: 'Sunset Dunes', lvl: 7, coins: 900, good: 'plank', n: 5 },
  { name: 'Misty Ridge', lvl: 9, coins: 1800, good: 'brick', n: 4 }
];

// Economy tuning
const ENERGY_REGEN = 50;                      // seconds per point of energy
const energyMax = (lvl) => 20 + Math.min(20, (lvl - 1) * 2);
const xpNeed = (lvl) => 40 + 30 * lvl;
const MERGE_XP = [0, 0, 1, 3, 6, 12];         // xp for creating an item of this level
const ITEM_VALUE = [0, 2, 7, 22, 70, 220];    // rough coin value of one item of this level
const PEARL_ENERGY = { cost: 5, gain: 10 };   // pearls are earned in-game only

// Story characters
const CAST = {
  kai:  { name: 'Kai',  emoji: '\u{1F9D4}', tint: '#118ab2' },
  mele: { name: 'Mele', emoji: '\u{1F475}', tint: '#ef476f' },
  pua:  { name: 'Pua',  emoji: '\u{1F467}', tint: '#06d6a0' }
};
// Quests run in order. Goals count events as they happen, or ask you to hand over board items.
const QUESTS = [
  { id: 'q1', who: 'kai', title: 'Welcome Ashore', min: 1, goal: { ev: 'merge', n: 1, text: 'Merge 3 matching crops' },
    intro: ['Ahoy! I’m Kai. The storm washed you onto Palm Island — lucky it’s a friendly one.', 'Crops that touch grow together. Put three of the same kind side by side and they merge into something better.', 'Give it a try!'],
    outro: ['Ha! You’re a natural.', 'Every merge feeds the island. Come see me for more work.'], reward: { coins: 30, xp: 10 } },
  { id: 'q2', who: 'kai', title: 'A Proper Bunch', min: 1, goal: { ev: 'merge', n: 1, lvl: 3, text: 'Make a level 3 Bundle' },
    intro: ['Now merge your bunches again. Three bunches make a tied bundle.', 'Tip: a big group of FIVE in one go gives you two items instead of one!'],
    outro: ['Look at that bundle! The crew will be thrilled.'], reward: { coins: 40, energy: 3, xp: 12 } },
  { id: 'q3', who: 'mele', title: 'Green Thumb', min: 1, goal: { ev: 'plant', n: 2, text: 'Plant 2 crops' },
    intro: ['I’m Mele. I’ve tended this soil for sixty years.', 'Tap an empty tile and pick a crop to plant. Planting costs a little energy, and energy refills by itself.'],
    outro: ['Good. Soil likes to be used.'], reward: { coins: 30, xp: 15 } },
  { id: 'q4', who: 'mele', title: 'First Harvest', min: 1, goal: { ev: 'harvest', n: 2, text: 'Harvest 2 crops' },
    intro: ['When a plant is ready it bounces and sparkles. Just tap it to harvest.'],
    outro: ['Fresh from the ground! That’s how an island feeds itself.'], reward: { coins: 40, pearls: 1, xp: 20 } },
  { id: 'q5', who: 'kai', title: 'Hungry Crew', min: 1, goal: { deliver: { type: 'corn', level: 2, n: 2 }, text: 'Hand over 2 Corn Bunches' },
    intro: ['My crew is hungry. Bring me two Corn Bunches (level 2) and I’ll make it worth your while.'],
    outro: ['Delicious! Fair trade, as promised.'], reward: { coins: 60, xp: 25 } },
  { id: 'q6', who: 'mele', title: 'Clear the Path', min: 1, goal: { ev: 'clear', n: 2, text: 'Clear 2 obstacles' },
    intro: ['Bushes, boulders and fallen palms are in the way. Tap one and spend a little energy to clear it.', 'You keep the wood and stone they leave behind — merge those like any crop.'],
    outro: ['Better! More room to work with.'], reward: { energy: 5, xp: 25 } },
  { id: 'q7', who: 'pua', title: 'Open for Business', min: 1, goal: { ev: 'orders', n: 2, text: 'Complete 2 orders' },
    intro: ['Hi! I’m Pua. Sailors passing through pay well for fresh goods.', 'Open the Orders board and deliver what they ask for.'],
    outro: ['Wonderful! Word will spread.'], reward: { coins: 80, xp: 30 } },
  { id: 'q8', who: 'pua', title: 'Chef’s Corner', min: 2, goal: { ev: 'craft', n: 1, text: 'Craft 1 good in a workshop' },
    intro: ['The Island Kitchen is open! Bread needs a Corn Bunch and a Wheat Bunch.', 'Start a recipe in the Workshop and come back when it is done.'],
    outro: ['Smells amazing. You’re a cook now!'], reward: { coins: 80, xp: 30 } },
  { id: 'q9', who: 'kai', title: 'Timber!', min: 2, goal: { deliver: { type: 'wood', level: 2, n: 2 }, text: 'Hand over 2 Log Piles' },
    intro: ['The boat needs repairs. Bring me two Log Piles (level 2 wood) — clear some brush, or watch for driftwood washing ashore.'],
    outro: ['Solid timber. The boat will float again.'], reward: { coins: 80, xp: 30 } },
  { id: 'q10', who: 'mele', title: 'Into the Mist', min: 3, goal: { ev: 'sector', n: 1, text: 'Lift the mist from a new sector' },
    intro: ['See the mist over the edges of the island? There is more land under it.', 'Tap the mist when you have the level, the coins and the planks or bricks it asks for.'],
    outro: ['Fresh land! I can smell the new soil from here.'], reward: { coins: 100, pearls: 2, xp: 40 } },
  { id: 'q11', who: 'mele', title: 'Fruit of the Island', min: 3, goal: { ev: 'plant', n: 1, kind: 'tree', text: 'Plant a fruit tree' },
    intro: ['Trees take patience but give again and again.', 'Plant a Coconut Palm on an empty tile.'],
    outro: ['Soon you’ll have more coconuts than you can carry.'], reward: { coins: 120, xp: 40 } },
  { id: 'q12', who: 'kai', title: 'Double Trouble', min: 3, goal: { ev: 'bonus', n: 1, text: 'Merge 5 at once for the bonus' },
    intro: ['Here’s a trick: line up two pairs with a gap, then drop the fifth item in the middle.', 'Five at once makes TWO of the next item.'],
    outro: ['Two for one! That’s sailor’s luck.'], reward: { coins: 150, energy: 5, xp: 50 } },
  { id: 'q13', who: 'pua', title: 'Golden Harvest', min: 4, goal: { ev: 'merge', n: 1, lvl: 5, text: 'Make a level 5 Golden Crate' },
    intro: ['I have heard of a Golden Crate — a crop merged all the way up. Can you make one?'],
    outro: ['Gold! Real gold! The whole island is cheering.'], reward: { coins: 300, pearls: 3, xp: 80 } },
  { id: 'q14', who: 'kai', title: 'Tide Tales', min: 4, goal: { ev: 'orders', n: 8, text: 'Complete 8 orders' },
    intro: ['Last job for now. Keep the sailors fed and happy.'],
    outro: ['You’ve turned this little island around. Beyond the horizon there are more islands waiting.', 'Come back soon — the mist is lifting.'], reward: { coins: 500, pearls: 5, xp: 120 } }
];

// Daily task templates; five are picked per day.
const DAILY_POOL = [
  { id: 'merge',   ev: 'merge',   text: 'Merge {n} times',          n: [8, 14] },
  { id: 'harvest', ev: 'harvest', text: 'Harvest {n} plants',       n: [3, 6] },
  { id: 'plant',   ev: 'plant',   text: 'Plant {n} seeds',          n: [3, 6] },
  { id: 'orders',  ev: 'orders',  text: 'Complete {n} orders',      n: [2, 4] },
  { id: 'bundle',  ev: 'merge',   text: 'Make {n} Bundles (level 3+)', n: [1, 3], lvl: 3 },
  { id: 'blimp',   ev: 'blimp',   text: 'Tap the blimp {n} times',  n: [3, 6] },
  { id: 'clear',   ev: 'clear',   text: 'Clear {n} obstacles',      n: [1, 2], needs: 'obstacles' },
  { id: 'craft',   ev: 'craft',   text: 'Finish {n} workshop jobs', n: [1, 2], minLevel: 2 }
];
const DAILY_REWARDS = [{ coins: 1 }, { coins: 1 }, { energy: 5 }, { coins: 1 }, { pearls: 1 }];
const DAILY_CHEST = { pearls: 2, energy: 10, sp: 30 };

// Free season track (one calendar month, 20 tiers, no payment anywhere).
const SEASON_NAMES = ['Coconut Breeze', 'Pineapple Tide', 'Hibiscus Bloom', 'Monsoon Rain', 'Mango Moon', 'Starfish Shore', 'Lagoon Light', 'Palm Season', 'Trade Winds', 'Harvest Tide', 'Firefly Cove', 'Winter Warmth'];
const SEASON_TIER_SP = 90;
const SEASON_TIERS = (() => {
  const t = [];
  const loop = [{ coins: 50 }, { energy: 5 }, { xp: 30 }, { coins: 100 }, { pearls: 2 }, { energy: 8 }, { coins: 150 }, { xp: 60 }, { coins: 200 }, { pearls: 3, skin: 'sunset' },
    { energy: 10 }, { coins: 250 }, { xp: 90 }, { coins: 300 }, { pearls: 4 }, { energy: 12 }, { coins: 400 }, { xp: 120 }, { coins: 500 }, { pearls: 6, skin: 'gold' }];
  for (let i = 0; i < loop.length; i++) t.push(loop[i]);
  return t;
})();
const BLIMP_SKINS = {
  classic: { name: 'Classic', cols: ['#06d6a0', '#ffd166', '#ef476f', '#118ab2'], base: '#fff1c9', fin: '#ef476f' },
  sunset:  { name: 'Sunset',  cols: ['#ff7b54', '#ffb26b', '#ffd56b', '#ff5d8f'], base: '#ffe3c2', fin: '#b5179e' },
  gold:    { name: 'Golden',  cols: ['#ffd166', '#f4a300', '#ffe08a', '#e09f00'], base: '#fff3c4', fin: '#c77d00' }
};

// Temporary event: the Coral Lagoon. A different map, different items, its own milestone track.
const EVENT = {
  id: 'coral', name: 'Coral Lagoon', emoji: '\u{1F30A}',
  cycleDays: 10, activeDays: 6, epoch: Date.UTC(2026, 0, 5),
  cols: { top: '#0b7a9a', bottom: '#052b4a' },
  milestones: [
    { ep: 10,  r: { coins: 60 } }, { ep: 25, r: { energy: 6 } }, { ep: 50, r: { pearls: 1, sp: 20 } },
    { ep: 90,  r: { coins: 150 } }, { ep: 140, r: { energy: 10 } }, { ep: 200, r: { pearls: 2, xp: 60 } },
    { ep: 280, r: { coins: 300 } }, { ep: 380, r: { energy: 15, sp: 30 } }, { ep: 500, r: { pearls: 3 } },
    { ep: 650, r: { coins: 600, pearls: 4, sp: 60 } }
  ],
  podMin: 14, podMax: 28
};
const EP_FOR_LEVEL = [0, 0, 2, 5, 11, 24];

// Blimp event tuning (seconds / counts)
const BLIMP = {
  minDelay: 60, maxDelay: 180,   // time between blimps: 1 to 3 minutes
  firstDelay: 15,                // the very first blimp comes sooner so new players meet it
  minClicks: 3, maxClicks: 7,    // taps needed to empty the blimp
  minDrop: 1, maxDrop: 5         // level-1 items dropped per tap
};

const SAVE_KEY = 'tropicMerge.v3';
const OLD_KEY = 'tropicMerge.v2';

/* ----------------------------------------------------------------- helpers */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t) => t * t * t;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function leaf(c, x0, y0, x1, y1, w) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  c.beginPath();
  c.moveTo(x0, y0);
  c.quadraticCurveTo(mx + nx * w, my + ny * w, x1, y1);
  c.quadraticCurveTo(mx - nx * w, my - ny * w, x0, y0);
  c.closePath();
}

/* ------------------------------------------------------------------- audio */
const audio = (() => {
  let ac = null, master, sfxG, musG, noiseBuf, humG;
  const pref = { music: true, sfx: true };
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function makeNoise() {
    const len = ac.sampleRate * 2;
    const b = ac.createBuffer(1, len, ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function ensure() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ac = new AC(); } catch (e) { ac = null; return null; }
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    sfxG = ac.createGain(); sfxG.gain.value = pref.sfx ? 0.75 : 0; sfxG.connect(master);
    musG = ac.createGain(); musG.gain.value = pref.music ? 0.3 : 0; musG.connect(master);
    noiseBuf = makeNoise();
    startOcean(); startHum(); startMusic();
    return ac;
  }
  function unlock() {
    const c = ensure();
    if (c && c.state !== 'running' && c.state !== 'closed') { try { c.resume(); } catch (e) { /* ignore */ } }
  }
  function ready() { return ac && ac.state !== 'closed'; }

  // A marimba / steel-drum-ish plucked tone: a few sine partials with a fast decay.
  function tone(freq, when, dur, vol, dest, type, partials) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    g.connect(dest);
    for (const [m, a] of (partials || [[1, 1], [2, 0.45], [3, 0.2]])) {
      const o = ac.createOscillator();
      o.type = type || 'sine';
      o.frequency.value = freq * m;
      if (a < 1) { const pg = ac.createGain(); pg.gain.value = a; o.connect(pg); pg.connect(g); }
      else o.connect(g);
      o.start(when); o.stop(when + dur + 0.05);
    }
  }
  function noiseBurst(when, dur, vol, freq, ftype, dest) {
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = ftype; f.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(when, Math.random() * 1.5); s.stop(when + dur + 0.02);
  }
  function glide(f0, f1, dur, vol, type) {
    const now = ac.currentTime;
    const o = ac.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, now);
    o.frequency.exponentialRampToValueAtTime(f1, now + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(sfxG);
    o.start(now); o.stop(now + dur + 0.05);
  }

  /* ambience: gentle ocean wash */
  function startOcean() {
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 650;
    const g = ac.createGain(); g.gain.value = 0.05;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.11;
    const lg = ac.createGain(); lg.gain.value = 0.035;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(musG);
    src.start(); lfo.start();
  }
  /* blimp engine drone, silent until a blimp is on screen */
  function startHum() {
    humG = ac.createGain(); humG.gain.value = 0; humG.connect(sfxG);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.connect(humG);
    for (const f of [58, 58.7]) {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start();
    }
  }

  /* music: a relaxed calypso loop (C - Am - F - G7), generated live */
  const PROG = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]];
  const BASS = [48, 45, 41, 43];
  const SCALE = [72, 74, 76, 79, 81, 84, 86, 88];
  const STEP = 60 / 100 / 2;           // eighth note at 100 bpm
  let step = 0, nextTime = 0, timer = null, motif = [];
  function newMotif() {
    let i = randInt(1, 4);
    motif = [];
    for (let s = 0; s < 16; s++) {
      if (Math.random() < 0.42) motif.push(-1);
      else { i = clamp(i + randInt(-2, 2), 0, SCALE.length - 1); motif.push(i); }
    }
  }
  function playStep(n, when) {
    const bar = Math.floor(n / 8) % 4;
    const s = n % 8;
    const chord = PROG[bar];
    if (s === 0 || s === 4) tone(mtof(BASS[bar]), when, 0.55, 0.5, musG, 'sine', [[1, 1], [2, 0.55]]);
    if (s === 3 || s === 7) tone(mtof(BASS[bar] + 7), when, 0.4, 0.38, musG, 'sine', [[1, 1], [2, 0.5]]);
    if (s === 2 || s === 3 || s === 5 || s === 7) {
      chord.forEach((m, k) => tone(mtof(m), when + k * 0.014, 0.28, 0.055, musG, 'triangle', [[1, 1], [2, 0.3]]));
    }
    noiseBurst(when, 0.04, s % 2 ? 0.07 : 0.04, 6500, 'highpass', musG);
    if (n % 32 === 0) {
      for (let k = 0; k < 3; k++) motif[randInt(0, 15)] = Math.random() < 0.4 ? -1 : randInt(0, SCALE.length - 1);
    }
    const slot = n % 16;
    if (motif[slot] >= 0) {
      tone(mtof(SCALE[motif[slot]]), when, 0.55, 0.2, musG, 'sine', [[1, 1], [2, 0.5], [3.01, 0.18]]);
    }
  }
  function scheduler() {
    if (!ready()) return;
    if (nextTime < ac.currentTime) nextTime = ac.currentTime + 0.05;
    while (nextTime < ac.currentTime + 0.35) {
      playStep(step, nextTime);
      nextTime += STEP; step++;
    }
  }
  function startMusic() {
    newMotif();
    nextTime = ac.currentTime + 0.2;
    timer = setInterval(scheduler, 100);
  }

  /* sound effects */
  const sfx = {
    select() { if (!ready() || !pref.sfx) return; tone(880, ac.currentTime, 0.14, 0.2, sfxG, 'sine', [[1, 1], [2, 0.3]]); },
    place() {
      if (!ready() || !pref.sfx) return;
      const t = ac.currentTime;
      noiseBurst(t, 0.07, 0.25, 500, 'lowpass', sfxG);
      tone(196, t, 0.18, 0.25, sfxG, 'sine', [[1, 1], [2, 0.3]]);
    },
    thud() {
      if (!ready() || !pref.sfx) return;
      glide(170, 55, 0.16, 0.35, 'sine');
      noiseBurst(ac.currentTime, 0.08, 0.15, 400, 'lowpass', sfxG);
    },
    merge(level) {
      if (!ready() || !pref.sfx) return;
      const t = ac.currentTime;
      const root = 62 + level * 2;
      const arp = level >= 4 ? [0, 4, 7, 12, 16] : [0, 4, 7, 12];
      arp.forEach((iv, k) => tone(mtof(root + iv), t + k * 0.075, 0.6, 0.3, sfxG));
      noiseBurst(t, 0.25, 0.1, 5000, 'highpass', sfxG);
    },
    blimpTap() {
      if (!ready() || !pref.sfx) return;
      glide(480, 170, 0.28, 0.3, 'triangle');
      tone(660, ac.currentTime + 0.05, 0.2, 0.12, sfxG, 'sine');
    },
    blimpArrive() {
      if (!ready() || !pref.sfx) return;
      const t = ac.currentTime;
      tone(392, t, 0.45, 0.22, sfxG, 'triangle', [[1, 1], [2, 0.4]]);
      tone(523.25, t + 0.28, 0.6, 0.22, sfxG, 'triangle', [[1, 1], [2, 0.4]]);
    },
    coin() {
      if (!ready() || !pref.sfx) return;
      const t = ac.currentTime;
      tone(988, t, 0.12, 0.2, sfxG, 'triangle');
      tone(1319, t + 0.07, 0.28, 0.2, sfxG, 'triangle');
    },
    levelUp() {
      if (!ready() || !pref.sfx) return;
      const t = ac.currentTime;
      [60, 64, 67, 72, 76, 79].forEach((m, k) => tone(mtof(m + 12), t + k * 0.09, 0.55, 0.26, sfxG, 'triangle', [[1, 1], [2, 0.3]]));
    },
    bonus() {
      if (!ready() || !pref.sfx) return;
      const t = ac.currentTime;
      [84, 88, 91, 96].forEach((m, k) => tone(mtof(m), t + 0.12 + k * 0.06, 0.35, 0.16, sfxG, 'sine'));
    },
    harvest() {
      if (!ready() || !pref.sfx) return;
      glide(300, 560, 0.16, 0.25, 'triangle');
      noiseBurst(ac.currentTime, 0.1, 0.12, 2000, 'bandpass', sfxG);
    },
    ping() { if (!ready() || !pref.sfx) return; tone(1175, ac.currentTime, 0.3, 0.14, sfxG, 'sine', [[1, 1], [2, 0.3]]); },
    pop() {
      if (!ready() || !pref.sfx) return;
      glide(700, 1500, 0.1, 0.25, 'sine');
      noiseBurst(ac.currentTime, 0.06, 0.18, 3000, 'highpass', sfxG);
    },
    nope() { if (!ready() || !pref.sfx) return; tone(170, ac.currentTime, 0.14, 0.14, sfxG, 'square', [[1, 1]]); },
    hum(on) {
      if (!ready()) return;
      humG.gain.setTargetAtTime(on ? 0.05 : 0, ac.currentTime, 0.8);
    }
  };

  function applyPrefs() {
    if (!ac) return;
    sfxG.gain.setTargetAtTime(pref.sfx ? 0.75 : 0, ac.currentTime, 0.03);
    musG.gain.setTargetAtTime(pref.music ? 0.3 : 0, ac.currentTime, 0.08);
  }
  return Object.assign({
    pref, unlock,
    setPrefs(m, s) { pref.music = m; pref.sfx = s; applyPrefs(); },
    toggleMusic() { pref.music = !pref.music; applyPrefs(); return pref.music; },
    toggleSfx() { pref.sfx = !pref.sfx; applyPrefs(); return pref.sfx; },
    suspend() { if (ac && ac.state === 'running') ac.suspend(); },
    resume() { if (ac && ac.state === 'suspended') ac.resume(); }
  }, sfx);
})();

/* ------------------------------------------------------------ item artwork */
// Every item is drawn in a 100x100 box, then cached as a bitmap (SPR x SPR).
const SPR = 256;
const sprites = {};

const SINGLE = {
  corn(c) {
    c.lineJoin = 'round';
    c.fillStyle = '#2f8f46';
    leaf(c, 0, -2, -16, -34, 7); c.fill();
    leaf(c, 0, -2, 16, -34, 7); c.fill();
    const g = c.createLinearGradient(-10, 0, 10, 0);
    g.addColorStop(0, '#f0b100'); g.addColorStop(0.5, '#ffe36e'); g.addColorStop(1, '#f0b100');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(0, -27, 9.5, 24, 0, 0, TAU); c.fill();
    c.save();
    c.clip();
    c.fillStyle = 'rgba(190,120,0,0.5)';
    for (let row = 0, y = -50; y < -3; y += 5.5, row++) {
      for (let x = -10; x <= 10; x += 5.5) {
        c.beginPath(); c.arc(x + (row % 2 ? 2.7 : 0), y, 1.6, 0, TAU); c.fill();
      }
    }
    c.restore();
    c.strokeStyle = '#c48a00'; c.lineWidth = 1;
    c.beginPath(); c.ellipse(0, -27, 9.5, 24, 0, 0, TAU); c.stroke();
    c.fillStyle = '#58bb48';
    leaf(c, 0, 0, -11, -25, 6); c.fill();
    leaf(c, 0, 0, 11, -25, 6); c.fill();
    c.fillStyle = '#7fd95a';
    leaf(c, 0, 0, 0, -19, 4); c.fill();
  },
  carrot(c) {
    c.lineJoin = 'round';
    c.fillStyle = '#2f9a57';
    leaf(c, 0, -37, -13, -62, 5); c.fill();
    leaf(c, 0, -37, 13, -62, 5); c.fill();
    c.fillStyle = '#4fc26f';
    leaf(c, 0, -37, -5, -66, 5); c.fill();
    leaf(c, 0, -37, 6, -64, 5); c.fill();
    const g = c.createLinearGradient(-11, 0, 11, 0);
    g.addColorStop(0, '#ee6d17'); g.addColorStop(0.5, '#ffa04a'); g.addColorStop(1, '#e45f0d');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, 0);
    c.bezierCurveTo(-5, -6, -12, -22, -11, -36);
    c.quadraticCurveTo(0, -44, 11, -36);
    c.bezierCurveTo(12, -22, 5, -6, 0, 0);
    c.closePath(); c.fill();
    c.strokeStyle = '#c4510a'; c.lineWidth = 1; c.stroke();
    c.strokeStyle = 'rgba(150,55,0,0.5)'; c.lineWidth = 1.2; c.lineCap = 'round';
    for (const [y, w] of [[-11, 4], [-20, 6], [-29, 7.5]]) {
      c.beginPath(); c.moveTo(-w, y); c.lineTo(-w + 4.5, y + 1.6); c.stroke();
      c.beginPath(); c.moveTo(w, y - 3); c.lineTo(w - 4.5, y - 1.4); c.stroke();
    }
  },
  wheat(c) {
    c.lineCap = 'round';
    c.fillStyle = '#7ba83b';
    leaf(c, 0, -3, -14, -30, 3.5); c.fill();
    leaf(c, 0, -3, 13, -27, 3.5); c.fill();
    c.strokeStyle = '#c9a227'; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -48); c.stroke();
    c.strokeStyle = 'rgba(184,134,11,0.85)'; c.lineWidth = 0.9;
    for (let i = 0; i < 6; i++) {
      const y = -30 - i * 5.6;
      for (const s of [-1, 1]) {
        c.beginPath(); c.moveTo(s * 4.5, y - 6); c.lineTo(s * 9.5, y - 17); c.stroke();
      }
    }
    for (let i = 0; i < 6; i++) {
      const y = -26 - i * 5.6;
      for (const s of [-1, 1]) {
        c.save();
        c.translate(s * 2.7, y); c.rotate(s * 0.55);
        c.fillStyle = '#f1c243';
        c.beginPath(); c.ellipse(0, -3.5, 2.7, 5.3, 0, 0, TAU); c.fill();
        c.strokeStyle = '#b8860b'; c.lineWidth = 0.6; c.stroke();
        c.restore();
      }
    }
    c.fillStyle = '#f6cf55';
    c.beginPath(); c.ellipse(0, -62, 2.7, 5.5, 0, 0, TAU); c.fill();
  },
  coconut(c) {
    const g = c.createRadialGradient(-7, -31, 3, 0, -22, 23);
    g.addColorStop(0, '#c99a68'); g.addColorStop(1, '#6a4120');
    c.fillStyle = g; c.beginPath(); c.arc(0, -22, 20, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(55,28,10,0.42)'; c.lineWidth = 1.1; c.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      const a = -2.7 + i * 0.37;
      c.beginPath(); c.moveTo(Math.cos(a) * 7, -22 + Math.sin(a) * 7); c.lineTo(Math.cos(a) * 19, -22 + Math.sin(a) * 19); c.stroke();
    }
    c.fillStyle = '#3a2210';
    for (const [x, y] of [[-5.5, -30], [5.5, -30], [0, -23.5]]) { c.beginPath(); c.arc(x, y, 2.7, 0, TAU); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.28)'; c.beginPath(); c.ellipse(-8, -33, 6, 3.2, -0.7, 0, TAU); c.fill();
    c.fillStyle = '#58bb48';
    leaf(c, 0, -41, -10, -56, 4); c.fill();
    leaf(c, 0, -41, 10, -54, 4); c.fill();
  },
  mango(c) {
    const g = c.createLinearGradient(-18, -42, 20, -2);
    g.addColorStop(0, '#ffd23f'); g.addColorStop(0.5, '#ff9f1c'); g.addColorStop(1, '#e8553d');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(0, -42);
    c.bezierCurveTo(22, -44, 26, -14, 8, -3);
    c.bezierCurveTo(-3, 2, -21, -4, -21, -20);
    c.bezierCurveTo(-21, -35, -10, -42, 0, -42);
    c.closePath(); c.fill();
    c.strokeStyle = '#b3541e'; c.lineWidth = 1; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.3)'; c.beginPath(); c.ellipse(-9, -28, 4.5, 9, 0.5, 0, TAU); c.fill();
    c.strokeStyle = '#5a3a1a'; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(1, -42); c.lineTo(3, -49); c.stroke();
    c.fillStyle = '#3aa655';
    leaf(c, 3, -47, 17, -56, 5); c.fill();
  },
  wood(c) {
    const g = c.createLinearGradient(0, -30, 0, -2);
    g.addColorStop(0, '#b97c42'); g.addColorStop(1, '#7a4a22');
    c.fillStyle = g; rr(c, -26, -30, 40, 28, 5); c.fill();
    c.strokeStyle = 'rgba(60,30,8,0.45)'; c.lineWidth = 1.2;
    for (const y of [-23, -16, -9]) { c.beginPath(); c.moveTo(-24, y); c.lineTo(10, y + 1); c.stroke(); }
    c.fillStyle = '#e0b072'; c.beginPath(); c.ellipse(14, -16, 9, 14, 0, 0, TAU); c.fill();
    c.strokeStyle = '#a66e35'; c.lineWidth = 1.2;
    for (const r of [4, 8, 12]) { c.beginPath(); c.ellipse(14, -16, r * 0.62, r, 0, 0, TAU); c.stroke(); }
    c.strokeStyle = '#7a4a22'; c.lineWidth = 1.6; c.beginPath(); c.ellipse(14, -16, 9, 14, 0, 0, TAU); c.stroke();
    c.fillStyle = '#58bb48'; leaf(c, -16, -30, -22, -42, 4); c.fill();
  },
  stone(c) {
    const g = c.createLinearGradient(-24, -40, 24, 0);
    g.addColorStop(0, '#c9d2d8'); g.addColorStop(0.55, '#8d9aa3'); g.addColorStop(1, '#5f6b73');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(-26, -4); c.lineTo(-22, -22); c.lineTo(-8, -38); c.lineTo(10, -40); c.lineTo(24, -26); c.lineTo(27, -6); c.lineTo(10, 0); c.lineTo(-14, 0); c.closePath(); c.fill();
    c.strokeStyle = '#4b565d'; c.lineWidth = 1.4; c.lineJoin = 'round'; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.3)';
    c.beginPath(); c.moveTo(-18, -22); c.lineTo(-7, -35); c.lineTo(6, -36); c.lineTo(-6, -24); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(60,72,80,0.55)'; c.lineWidth = 1.2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(8, -34); c.lineTo(4, -20); c.lineTo(12, -8); c.stroke();
  },
  shell(c) {
    const g = c.createRadialGradient(0, -6, 3, 0, -6, 34);
    g.addColorStop(0, '#fff0f3'); g.addColorStop(0.6, '#ffc2d1'); g.addColorStop(1, '#ff8fab');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(0, -3);
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI * 1.04 + (i / n) * Math.PI * 0.92;
      c.lineTo(Math.cos(a) * 33, -3 + Math.sin(a) * 33);
      const b = Math.PI * 1.04 + ((i + 0.5) / n) * Math.PI * 0.92;
      if (i < n) c.lineTo(Math.cos(b) * 36, -3 + Math.sin(b) * 36);
    }
    c.closePath(); c.fill();
    c.strokeStyle = '#e0728f'; c.lineWidth = 1.2; c.lineJoin = 'round'; c.stroke();
    c.strokeStyle = 'rgba(214,92,126,0.55)'; c.lineWidth = 1.2;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI * 1.04 + (i / n) * Math.PI * 0.92;
      c.beginPath(); c.moveTo(0, -3); c.lineTo(Math.cos(a) * 33, -3 + Math.sin(a) * 33); c.stroke();
    }
    c.fillStyle = '#ffb3c6'; rr(c, -8, -6, 16, 8, 3); c.fill(); c.strokeStyle = '#e0728f'; c.stroke();
  },
  starfish(c) {
    const cx = 0, cy = -24;
    const g = c.createRadialGradient(0, -26, 3, 0, -24, 30);
    g.addColorStop(0, '#ffb870'); g.addColorStop(1, '#e8553d');
    c.fillStyle = g; c.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 11 : 30, a = -Math.PI / 2 + i * Math.PI / 5;
      c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    c.closePath(); c.fill();
    c.strokeStyle = '#b8381f'; c.lineWidth = 1.4; c.lineJoin = 'round'; c.stroke();
    c.fillStyle = '#ffe2c2';
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + k * Math.PI * 2 / 5;
      for (const d of [10, 17, 23]) { c.beginPath(); c.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.7, 0, TAU); c.fill(); }
    }
  }
};

// [angle, dx, scale] per piece, outermost first, center last
const LAYOUT = {
  1: { pieces: [[0, 0, 1.12]] },
  2: { pieces: [[-0.32, -7, 1.0], [0.32, 7, 1.0], [0, 0, 1.1]], band: true },
  3: { pieces: [[-0.62, -10, 0.95], [0.62, 10, 0.95], [-0.32, -5, 1.0], [0.32, 5, 1.0], [0, 0, 1.1]], band: true, bow: true },
  4: { pieces: [[-0.7, -12, 0.8], [0.7, 12, 0.8], [-0.4, -7, 0.86], [0.4, 7, 0.86], [0, 0, 0.95]], basket: true },
  5: { pieces: [[-0.82, -14, 0.82], [0.82, 14, 0.82], [-0.52, -9, 0.88], [0.52, 9, 0.88], [-0.2, -3, 0.96], [0.2, 3, 0.96], [0, 0, 1.0]], crate: true }
};

function drawBow(c, x, y, color) {
  c.fillStyle = color;
  c.beginPath(); c.moveTo(x, y); c.lineTo(x - 10, y - 6); c.lineTo(x - 10, y + 6); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + 10, y - 6); c.lineTo(x + 10, y + 6); c.closePath(); c.fill();
  c.beginPath(); c.arc(x, y, 3, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.beginPath(); c.arc(x - 1, y - 1, 1.2, 0, TAU); c.fill();
}
function drawBasket(c) {
  c.fillStyle = '#b8793a';
  c.beginPath(); c.moveTo(24, 66); c.lineTo(76, 66); c.lineTo(70, 92); c.lineTo(30, 92); c.closePath(); c.fill();
  c.save(); c.clip();
  c.strokeStyle = 'rgba(90,50,15,0.45)'; c.lineWidth = 1.4;
  for (let y = 70; y < 94; y += 5) { c.beginPath(); c.moveTo(20, y); c.lineTo(80, y); c.stroke(); }
  for (let x = 14; x < 90; x += 8) {
    c.beginPath(); c.moveTo(x, 66); c.lineTo(x + 8, 94); c.stroke();
    c.beginPath(); c.moveTo(x + 8, 66); c.lineTo(x, 94); c.stroke();
  }
  c.restore();
  c.fillStyle = '#8a5a2b'; rr(c, 21, 62, 58, 8, 4); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.2)'; rr(c, 24, 63.5, 52, 2.5, 1.2); c.fill();
}
function sparkle(c, x, y, r, color) {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r);
  c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r);
  c.closePath(); c.fill();
}
function drawCrate(c) {
  const g = c.createLinearGradient(0, 62, 0, 94);
  g.addColorStop(0, '#d79a58'); g.addColorStop(1, '#b6783a');
  c.fillStyle = g; rr(c, 20, 62, 60, 32, 4); c.fill();
  c.strokeStyle = 'rgba(90,50,15,0.5)'; c.lineWidth = 1.2;
  for (const y of [72.5, 83]) { c.beginPath(); c.moveTo(20, y); c.lineTo(80, y); c.stroke(); }
  c.strokeStyle = '#7a4a1c'; c.lineWidth = 2; rr(c, 20, 62, 60, 32, 4); c.stroke();
  c.fillStyle = '#ffd166';
  for (const [x, y] of [[20, 62], [70, 62], [20, 84], [70, 84]]) { rr(c, x, y, 10, 10, 2); c.fill(); }
  c.fillStyle = '#ffd166'; c.beginPath(); c.arc(50, 78, 8, 0, TAU); c.fill();
  c.fillStyle = '#b8791a';
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 3.2 : 7, a = -Math.PI / 2 + i * Math.PI / 5;
    c.lineTo(50 + Math.cos(a) * r, 78 + Math.sin(a) * r);
  }
  c.closePath(); c.fill();
}
function drawItemArt(c, type, level) {
  c.save();
  // soft ground shadow
  c.fillStyle = 'rgba(0,30,20,0.24)';
  c.beginPath(); c.ellipse(50, 91, level >= 4 ? 31 : level >= 2 ? 25 : 17, 6, 0, 0, TAU); c.fill();
  if (level === 5) {
    const rg = c.createRadialGradient(50, 55, 4, 50, 55, 50);
    rg.addColorStop(0, 'rgba(255,230,120,0.65)'); rg.addColorStop(1, 'rgba(255,230,120,0)');
    c.fillStyle = rg; c.beginPath(); c.arc(50, 55, 50, 0, TAU); c.fill();
  }
  const L = LAYOUT[level];
  const baseY = level >= 4 ? 74 : 88;
  for (const p of L.pieces) {
    c.save();
    c.translate(50 + p[1], baseY);
    c.rotate(p[0]);
    c.scale(p[2], p[2]);
    SINGLE[type](c);
    c.restore();
  }
  if (L.band) {
    const w = level === 2 ? 21 : 33;
    c.fillStyle = '#b8793a'; rr(c, 50 - w / 2, 71, w, 6.5, 3); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.25)'; rr(c, 50 - w / 2 + 2, 72, w - 4, 1.8, 1); c.fill();
    if (L.bow) drawBow(c, 50, 74.5, BOW_COLOR[type]);
  }
  if (L.basket) drawBasket(c);
  if (L.crate) {
    drawCrate(c);
    sparkle(c, 16, 36, 7, '#fff6c2');
    sparkle(c, 86, 28, 5.5, '#fff6c2');
    sparkle(c, 80, 52, 4, '#ffe9a0');
  }
  c.restore();
}
function buildSprites() {
  for (const t of ALL_TYPES) {
    sprites[t] = [null];
    for (let l = 1; l <= MAX_LEVEL; l++) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = SPR;
      const c = cv.getContext('2d');
      c.scale(SPR / 100, SPR / 100);
      drawItemArt(c, t, l);
      sprites[t][l] = cv;
    }
  }
}

/* -------------------------------------------------------------- island art */
/* ------------------------------------------------------------ island terrain */
// The coastline lives on a fine mask (2x2 sub-tiles per cell) so it looks organic.
// Playable cells are whole cells that sit on land with a margin of beach around them,
// so the grid only ever appears on the island and follows its shape.
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const subAt = (m, x, y) => (x < 0 || y < 0 || x >= SW || y >= SH ? 0 : m[y * SW + x]);
function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
let landMask = null, grassMask = null, distMap = null, playable = null;
let landPath = null, grassPath = null;
const props = [];
const flora = { tufts: [], flowers: [], shells: [], pebbles: [], reefs: [] };
const isLandAt = (wx, wy) => !!subAt(landMask, Math.floor(wx / SUBPX), Math.floor(wy / SUBPX));
const isGrassAt = (wx, wy) => !!subAt(grassMask, Math.floor(wx / SUBPX), Math.floor(wy / SUBPX));
const isPlotAt = (wx, wy) => {
  const c = Math.floor(wx / TILE), r = Math.floor(wy / TILE);
  return c >= 0 && r >= 0 && c < MAPW && r < MAPH && !!playable[r * MAPW + c];
};
const distAt = (wx, wy) => {
  const x = Math.floor(wx / SUBPX), y = Math.floor(wy / SUBPX);
  return x < 0 || y < 0 || x >= SW || y >= SH ? 0 : distMap[y * SW + x];
};

function labelComponents(m) {
  const label = new Int32Array(m.length), sizes = [0];
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || label[i]) continue;
    const id = sizes.length; sizes.push(0);
    const stack = [i]; label[i] = id;
    while (stack.length) {
      const j = stack.pop(); sizes[id]++;
      const x = j % SW, y = (j / SW) | 0;
      for (const [dx, dy] of D4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= SW || ny >= SH) continue;
        const k = ny * SW + nx;
        if (m[k] && !label[k]) { label[k] = id; stack.push(k); }
      }
    }
  }
  return { label, sizes };
}
function dropSmall(m, keepLargestOnly, minSize) {
  const { label, sizes } = labelComponents(m);
  let best = 0;
  for (let id = 1; id < sizes.length; id++) if (sizes[id] > sizes[best]) best = id;
  for (let i = 0; i < m.length; i++) {
    if (!m[i]) continue;
    const id = label[i];
    if (keepLargestOnly ? id !== best : sizes[id] < minSize) m[i] = 0;
  }
}
function fillPockets(m) {            // water that does not reach the map edge becomes land
  const sea = new Uint8Array(m.length), stack = [];
  const seed = (x, y) => { const k = y * SW + x; if (!m[k] && !sea[k]) { sea[k] = 1; stack.push(k); } };
  for (let x = 0; x < SW; x++) { seed(x, 0); seed(x, SH - 1); }
  for (let y = 0; y < SH; y++) { seed(0, y); seed(SW - 1, y); }
  while (stack.length) {
    const j = stack.pop(), x = j % SW, y = (j / SW) | 0;
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SW || ny >= SH) continue;
      const k = ny * SW + nx;
      if (!m[k] && !sea[k]) { sea[k] = 1; stack.push(k); }
    }
  }
  for (let i = 0; i < m.length; i++) if (!m[i] && !sea[i]) m[i] = 1;
}
// Removes corner-to-corner-only contacts so every outline is one clean loop.
function fixCheckerboards(m, fill) {
  for (let pass = 0; pass < 16; pass++) {
    let changed = false;
    for (let y = 0; y < SH - 1; y++) {
      for (let x = 0; x < SW - 1; x++) {
        const a = m[y * SW + x], b = m[y * SW + x + 1], c = m[(y + 1) * SW + x], d = m[(y + 1) * SW + x + 1];
        if (a && d && !b && !c) { if (fill) m[y * SW + x + 1] = 1; else m[y * SW + x] = 0; changed = true; }
        else if (b && c && !a && !d) { if (fill) m[y * SW + x] = 1; else m[y * SW + x + 1] = 0; changed = true; }
      }
    }
    if (!changed) break;
  }
}
// Steps to the nearest coast (land cells: to water, water cells: to land).
function computeDist(m) {
  const d = new Int16Array(SW * SH), q = [];
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const v = m[y * SW + x];
      for (const [dx, dy] of D4) {
        const nx = x + dx, ny = y + dy;
        const nv = nx < 0 || ny < 0 || nx >= SW || ny >= SH ? 0 : m[ny * SW + nx];
        if (nv !== v) { d[y * SW + x] = 1; q.push(y * SW + x); break; }
      }
    }
  }
  for (let h = 0; h < q.length; h++) {
    const j = q[h], x = j % SW, y = (j / SW) | 0;
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SW || ny >= SH) continue;
      const k = ny * SW + nx;
      if (!d[k] && m[k] === m[j]) { d[k] = d[j] + 1; q.push(k); }
    }
  }
  return d;
}
// Outline of a mask as closed loops of lattice points (clockwise on screen).
function traceLoops(m) {
  const W1 = SW + 1, next = new Map(), key = (x, y) => y * W1 + x;
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      if (!m[y * SW + x]) continue;
      if (!subAt(m, x, y - 1)) next.set(key(x, y), key(x + 1, y));
      if (!subAt(m, x + 1, y)) next.set(key(x + 1, y), key(x + 1, y + 1));
      if (!subAt(m, x, y + 1)) next.set(key(x + 1, y + 1), key(x, y + 1));
      if (!subAt(m, x - 1, y)) next.set(key(x, y + 1), key(x, y));
    }
  }
  const seen = new Set(), loops = [];
  for (const k0 of next.keys()) {
    if (seen.has(k0)) continue;
    const loop = [];
    let cur = k0;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur);
      loop.push([cur % W1, Math.floor(cur / W1)]);
      cur = next.get(cur);
    }
    if (loop.length >= 4) loops.push(loop);
  }
  return loops;
}
function chaikin(pts, iters) {      // corner cutting: staircase -> smooth organic curve
  for (let it = 0; it < iters; it++) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      out.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]]);
      out.push([0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
    }
    pts = out;
  }
  return pts;
}
function buildPath(m, iters) {
  const p = new Path2D();
  for (const loop of traceLoops(m)) {
    const pts = chaikin(loop.map((v) => [v[0] * SUBPX, v[1] * SUBPX]), iters);
    pts.forEach((q, i) => { if (i) p.lineTo(q[0], q[1]); else p.moveTo(q[0], q[1]); });
    p.closePath();
  }
  return p;
}

function placeObstacles(rng) {
  const idxs = [];
  for (let i = 0; i < playable.length; i++) if (playable[i]) idxs.push(i);
  for (let i = idxs.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idxs[i], idxs[j]] = [idxs[j], idxs[i]]; }
  const taken = [];
  const near = (idx) => {
    const c = idx % MAPW, r = (idx / MAPW) | 0;
    return taken.some((t) => Math.abs((t % MAPW) - c) <= 1 && Math.abs(((t / MAPW) | 0) - r) <= 1);
  };
  const edgeish = (idx) => {
    const c = idx % MAPW, r = (idx / MAPW) | 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const cc = c + dc, rr2 = r + dr;
      if (cc < 0 || rr2 < 0 || cc >= MAPW || rr2 >= MAPH || !playable[rr2 * MAPW + cc]) return true;
    }
    return false;
  };
  // [kind, how many, must hug the shore? (true = shore, false = inland, null = anywhere)]
  for (const [kind, n, shore] of [['palm', 9, true], ['bush', 6, false], ['rock', 5, null]]) {
    let placed = 0;
    for (const idx of idxs) {
      if (placed >= n) break;
      if (!playable[idx] || near(idx)) continue;
      const e = edgeish(idx);
      if (shore === true && !e) continue;
      if (shore === false && e) continue;
      taken.push(idx); playable[idx] = 0; placed++;
      const c = idx % MAPW, r = (idx / MAPW) | 0;
      props.push({
        kind, x: c * TILE + TILE / 2, y: r * TILE + TILE * 0.9,
        sc: kind === 'palm' ? 0.56 + rng() * 0.1 : 0.9 + rng() * 0.15,
        flip: rng() < 0.5 ? -1 : 1, ph: rng() * TAU, block: true, cell: idx, cleared: false
      });
    }
  }
}
function placeFlora(rng, bb) {
  const rp = () => [bb.x0 + rng() * (bb.x1 - bb.x0), bb.y0 + rng() * (bb.y1 - bb.y0)];
  const flowerCols = ['#ff5d8f', '#ff9f1c', '#fff275', '#c77dff', '#ff6b6b'];
  let guard = 0;
  while (flora.tufts.length < 170 && guard++ < 30000) {
    const [x, y] = rp();
    if (isGrassAt(x, y) && !isPlotAt(x, y)) flora.tufts.push({ x, y, h: 7 + rng() * 8 });
  }
  guard = 0;
  while (flora.flowers.length < 40 && guard++ < 30000) {
    const [x, y] = rp();
    if (isGrassAt(x, y) && !isPlotAt(x, y)) flora.flowers.push({ x, y, col: flowerCols[Math.floor(rng() * flowerCols.length)] });
  }
  guard = 0;
  while (flora.shells.length < 16 && guard++ < 30000) {
    const [x, y] = rp();
    if (isLandAt(x, y) && !isGrassAt(x, y) && !isPlotAt(x, y)) flora.shells.push({ x, y, rot: rng() * TAU });
  }
  guard = 0;
  while (flora.pebbles.length < 70 && guard++ < 30000) {
    const [x, y] = rp();
    if (isLandAt(x, y) && !isGrassAt(x, y) && !isPlotAt(x, y)) flora.pebbles.push({ x, y, r: 2 + rng() * 3 });
  }
  guard = 0;
  let nb = 0;
  while (nb < 10 && guard++ < 30000) {
    const [x, y] = rp();
    if (!isGrassAt(x, y) || isPlotAt(x, y) || distAt(x, y) < 4) continue;
    props.push({ kind: 'bush', x, y, sc: 0.7 + rng() * 0.35, flip: 1, ph: 0, block: false }); nb++;
  }
  guard = 0;
  let np = 0;
  while (np < 6 && guard++ < 30000) {
    const [x, y] = rp();
    if (!isLandAt(x, y) || isPlotAt(x, y) || isPlotAt(x, y - TILE * 0.6) || distAt(x, y) < 2) continue;
    props.push({ kind: 'palm', x, y, sc: 0.5 + rng() * 0.12, flip: rng() < 0.5 ? -1 : 1, ph: rng() * TAU, block: false }); np++;
  }
  guard = 0;
  while (flora.reefs.length < 9 && guard++ < 30000) {
    const x = bb.x0 - 4 * TILE + rng() * (bb.x1 - bb.x0 + 8 * TILE);
    const y = bb.y0 - 4 * TILE + rng() * (bb.y1 - bb.y0 + 8 * TILE);
    if (x < TILE || y < TILE || x > WORLD_W - TILE || y > WORLD_H - TILE) continue;
    if (isLandAt(x, y)) continue;
    const d = distAt(x, y);
    if (d < 3 || d > 6) continue;
    if (flora.reefs.some((o) => Math.hypot(o.x - x, o.y - y) < 3 * TILE)) continue;
    flora.reefs.push({ x, y, ph: rng() * TAU });
  }
  props.sort((a, b) => a.y - b.y);
}
function generateTerrain() {
  const rng = mulberry32(ISLAND_SEED);
  const ph = [rng() * TAU, rng() * TAU, rng() * TAU, rng() * TAU];
  const cx = SW / 2 - 0.5, cy = SH / 2 - 0.5, rx = SW * 0.235, ry = SH * 0.25;
  let m = new Uint8Array(SW * SH);
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      const a = Math.atan2(dy, dx);
      const R = 1 + 0.13 * Math.sin(2 * a + ph[0]) + 0.10 * Math.sin(3 * a + ph[1]) +
        0.06 * Math.sin(5 * a + ph[2]) + 0.035 * Math.sin(8 * a + ph[3]);
      m[y * SW + x] = Math.hypot(dx, dy) < R * 0.92 ? 1 : 0;
    }
  }
  for (let pass = 0; pass < 2; pass++) {          // smooth the coast
    const n = new Uint8Array(m.length);
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += subAt(m, x + dx, y + dy);
        n[y * SW + x] = sum >= 5 ? 1 : 0;
      }
    }
    m = n;
  }
  dropSmall(m, true, 0);
  fillPockets(m);
  fixCheckerboards(m, true);
  landMask = m;
  distMap = computeDist(m);

  const g = new Uint8Array(m.length);              // inland grass; the beach is the band by the water
  for (let i = 0; i < g.length; i++) g[i] = m[i] && distMap[i] >= 3 ? 1 : 0;
  fixCheckerboards(g, false);
  dropSmall(g, false, 10);
  fixCheckerboards(g, false);
  grassMask = g;

  // playable cells: every sub-tile in the cell, plus a one sub-tile margin, must be land
  playable = new Uint8Array(MAPW * MAPH);
  for (let r = 0; r < MAPH; r++) {
    for (let c = 0; c < MAPW; c++) {
      let ok = true;
      for (let sy = r * SUB - 1; ok && sy <= r * SUB + SUB; sy++) {
        for (let sx = c * SUB - 1; sx <= c * SUB + SUB; sx++) if (!subAt(m, sx, sy)) { ok = false; break; }
      }
      playable[r * MAPW + c] = ok ? 1 : 0;
    }
  }

  let x0 = SW, x1 = 0, y0 = SH, y1 = 0;
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) if (m[y * SW + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const bb = { x0: x0 * SUBPX, x1: (x1 + 1) * SUBPX, y0: y0 * SUBPX, y1: (y1 + 1) * SUBPX };
  ISLAND_CX = (bb.x0 + bb.x1) / 2; ISLAND_CY = (bb.y0 + bb.y1) / 2;
  ISLAND_W = bb.x1 - bb.x0; ISLAND_H = bb.y1 - bb.y0;

  props.length = 0;
  placeObstacles(rng);
  placeFlora(rng, bb);
  landPath = buildPath(m, 3);
  grassPath = buildPath(g, 3);
}

function buildPalm() {
  const cv = document.createElement('canvas');
  cv.width = 240; cv.height = 300;
  const c = cv.getContext('2d');
  const P0 = [105, 290], P1 = [70, 200], P2 = [130, 120];
  const qp = (t) => [
    (1 - t) * (1 - t) * P0[0] + 2 * (1 - t) * t * P1[0] + t * t * P2[0],
    (1 - t) * (1 - t) * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1]];
  const qt = (t) => {
    const dx = 2 * (1 - t) * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]);
    const dy = 2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1]);
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  const left = [], right = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, [x, y] = qp(t), [tx, ty] = qt(t);
    const nx = -ty, ny = tx, w = lerp(13, 7, t);
    left.push([x + nx * w, y + ny * w]); right.push([x - nx * w, y - ny * w]);
  }
  c.fillStyle = '#8b5a2b';
  c.beginPath(); c.moveTo(left[0][0], left[0][1]);
  for (const p of left) c.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i--) c.lineTo(right[i][0], right[i][1]);
  c.closePath(); c.fill();
  c.strokeStyle = 'rgba(55,30,8,0.5)'; c.lineWidth = 2.6;
  for (let i = 1; i < 24; i += 2) {
    c.beginPath(); c.moveTo(left[i][0], left[i][1]); c.lineTo(right[i][0], right[i][1]); c.stroke();
  }
  c.strokeStyle = 'rgba(255,220,160,0.25)'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(left[0][0] + 4, left[0][1]);
  for (let i = 1; i <= 24; i++) c.lineTo(left[i][0] + 3, left[i][1]);
  c.stroke();

  const [cx, cy] = P2;
  const angles = [-178, -150, -122, -94, -66, -38, -10, 14];
  const L = 98;
  angles.forEach((deg, k) => {
    const a = deg * Math.PI / 180;
    const dx = Math.cos(a), dy = Math.sin(a);
    const tx = cx + dx * L, ty = cy + dy * L + L * 0.3 + (dy < -0.5 ? 6 : 0);
    const kx = cx + dx * L * 0.55, ky = cy + dy * L * 0.55 - L * 0.28;
    const w = 17;
    const ex = tx - cx, ey = ty - cy, el = Math.hypot(ex, ey) || 1;
    const nx = -ey / el, ny = ex / el;
    const g = c.createLinearGradient(cx, cy, tx, ty);
    g.addColorStop(0, k % 2 ? '#2f9e44' : '#37a84a'); g.addColorStop(1, '#6fcf5e');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(cx, cy);
    c.quadraticCurveTo(kx + nx * w, ky + ny * w, tx, ty);
    c.quadraticCurveTo(kx - nx * w, ky - ny * w, cx, cy);
    c.closePath(); c.fill();
    c.strokeStyle = '#1d6b32'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(cx, cy); c.quadraticCurveTo(kx, ky, tx, ty); c.stroke();
    c.strokeStyle = 'rgba(25,100,45,0.6)'; c.lineWidth = 1.3;
    for (let t = 0.18; t < 0.95; t += 0.1) {
      const px = (1 - t) * (1 - t) * cx + 2 * (1 - t) * t * kx + t * t * tx;
      const py = (1 - t) * (1 - t) * cy + 2 * (1 - t) * t * ky + t * t * ty;
      const len = w * 0.8 * (1 - t * 0.55);
      c.beginPath(); c.moveTo(px, py); c.lineTo(px + nx * len - ex / el * 3, py + ny * len - ey / el * 3); c.stroke();
      c.beginPath(); c.moveTo(px, py); c.lineTo(px - nx * len - ex / el * 3, py - ny * len - ey / el * 3); c.stroke();
    }
  });
  c.fillStyle = '#5a3a1a';
  for (const [x, y, r] of [[122, 128, 7], [135, 126, 7.5], [128, 138, 7]]) {
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  c.fillStyle = 'rgba(255,255,255,0.18)';
  for (const [x, y] of [[120, 125], [133, 123], [126, 135]]) { c.beginPath(); c.arc(x, y, 2, 0, TAU); c.fill(); }
  return cv;
}
let palmSprite = null, bushSprite = null, rockSprite = null;
function buildBush() {
  const cv = document.createElement('canvas');
  cv.width = 120; cv.height = 90;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgba(0,40,20,0.25)'; c.beginPath(); c.ellipse(62, 80, 48, 9, 0, 0, TAU); c.fill();
  c.fillStyle = '#2d8a3d';
  for (const [x, y, r] of [[34, 56, 26], [86, 56, 25], [60, 40, 30], [60, 62, 28]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  c.fillStyle = '#4cae58';
  for (const [x, y, r] of [[30, 50, 14], [82, 50, 13], [56, 32, 16], [64, 58, 12]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  c.fillStyle = '#e63946';
  for (const [x, y] of [[40, 44], [72, 36], [58, 60], [88, 58], [30, 62]]) { c.beginPath(); c.arc(x, y, 3.4, 0, TAU); c.fill(); }
  return cv;
}
function buildRock() {
  const cv = document.createElement('canvas');
  cv.width = 100; cv.height = 76;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgba(0,30,40,0.25)'; c.beginPath(); c.ellipse(52, 64, 42, 9, 0, 0, TAU); c.fill();
  c.fillStyle = '#7f8c94'; c.beginPath(); c.ellipse(50, 46, 40, 27, 0, 0, TAU); c.fill();
  c.fillStyle = '#a3afb6'; c.beginPath(); c.ellipse(40, 38, 25, 16, -0.2, 0, TAU); c.fill();
  c.fillStyle = '#c3cdd2'; c.beginPath(); c.ellipse(34, 32, 11, 6, -0.3, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(70,82,90,0.55)'; c.lineWidth = 2; c.lineCap = 'round';
  c.beginPath(); c.moveTo(58, 34); c.lineTo(66, 46); c.lineTo(62, 56); c.stroke();
  return cv;
}
function buildWorld() {
  bushSprite = buildBush();
  rockSprite = buildRock();
  generateTerrain();
  buildSectors();
  buildEventMap();
}

/* ------------------------------------------------------------- game state */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const infoEl = document.getElementById('infobar');
const toastEl = document.getElementById('toast');

let vw = 0, vh = 0, dpr = 1;
const cam = { cx: ISLAND_CX, cy: ISLAND_CY, z: 1 };

const newGrid = () => new Array(MAPW * MAPH).fill(null);
let mode = 'island';                    // 'island' | 'event'
let grid = newGrid();                   // whichever grid is on screen
let islandGrid = grid;                  // the home island grid (always the economy's board)
let eventGrid = newGrid();
let islandCam = null;
let selected = -1;                      // selected board item (cell index)
let selT = null;                        // selected tile / plant / obstacle: {k:'tile'|'plant'|'prop', ...}
let drag = null;
let blimp = null;
let blimpTimer = BLIMP.firstDelay;
let pod = null, podTimer = 4;           // event bubble
let merges = 0;
let time = 0, saveTimer = 0, dirty = false;
const ghosts = [], particles = [], floaters = [];
const fogFade = [0, 0, 0, 0, 0];

// Persistent player progress (everything here is saved).
function freshProgress() {
  return {
    coins: 60, xp: 0, level: 1, pearls: 0, energy: 20, energyAt: Date.now(),
    goods: {}, cleared: [], open: [true, false, false, false, false],
    orders: [], orderWait: [], stations: {},
    quest: { i: 0, prog: 0, intro: false },
    daily: { key: '', tasks: [], claimed: [], chest: false, streak: 0, lastFull: '' },
    season: { key: '', sp: 0, claimed: [] },
    ev: { cycle: -1, ep: 0, claimed: [], preview: 0 },
    driftAt: 0,
    stats: { merges: 0, bonus: 0, harvest: 0, orders: 0, crafts: 0, cleared: 0 }
  };
}
const P = freshProgress();
let timeShift = 0;                       // lets tests (and nothing else) move the clock
const nowMs = () => Date.now() + timeShift;

const makeItem = (type, level) => ({ type, level, pop: 0, land: null });
const isItem = (it) => !!it && !it.plant && !it.land;     // a settled, mergeable item
const idxOf = (c, r) => r * MAPW + c;

// Which cells the player can use right now. Fog hides whole sectors; the event map has its own platform.
let sectorOf = null, fogLand = null, evPlayable = null;
const fogCells = [[], [], [], [], []];
const sectorAnchor = [null, null, null, null, null];
const sectorOpen = (i) => { const s = sectorOf[i]; return s === 0 || !!P.open[s]; };
function usable(i) {
  if (i < 0 || i >= MAPW * MAPH) return false;
  return mode === 'event' ? !!evPlayable[i] : (!!playable[i] && sectorOpen(i));
}
// index of the usable cell under a world point, or -1 (ocean, beach edge, trees, fog...)
function cellAt(wx, wy) {
  const c = Math.floor(wx / TILE), r = Math.floor(wy / TILE);
  if (c < 0 || r < 0 || c >= MAPW || r >= MAPH) return -1;
  const i = r * MAPW + c;
  return usable(i) ? i : -1;
}
function cellCenter(idx) {
  const c = idx % MAPW, r = Math.floor(idx / MAPW);
  return { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
}
function neighbors(idx) {
  const c = idx % MAPW, r = Math.floor(idx / MAPW), out = [];
  if (c > 0) out.push(idx - 1);
  if (c < MAPW - 1) out.push(idx + 1);
  if (r > 0) out.push(idx - MAPW);
  if (r < MAPH - 1) out.push(idx + MAPW);
  return out;
}
// Breadth-first group of touching, identical, settled items. Any prefix of the result is connected.
function floodGroup(idx) {
  const it = grid[idx];
  if (!isItem(it)) return [];
  const seen = new Set([idx]);
  const q = [idx];
  for (let i = 0; i < q.length; i++) {
    for (const n of neighbors(q[i])) {
      if (seen.has(n)) continue;
      const m = grid[n];
      if (isItem(m) && m.type === it.type && m.level === it.level) { seen.add(n); q.push(n); }
    }
  }
  return q;
}
// Nearest empty usable cells to a cell, closest first (walks through occupied cells too).
function nearestEmpties(idx, n) {
  const out = [], seen = new Set([idx]), q = [idx];
  for (let i = 0; i < q.length && out.length < n; i++) {
    const cur = q[i];
    if (!grid[cur] && usable(cur)) out.push(cur);
    for (const nb of neighbors(cur)) if (!seen.has(nb) && usable(nb)) { seen.add(nb); q.push(nb); }
  }
  return out;
}

/* camera */
const EV_CX = 16.5 * TILE, EV_CY = 18.5 * TILE;
function zoomLimits() { return [Math.max(vw / WORLD_W, vh / WORLD_H, 0.3), 2.0]; }
function defaultZoom() {
  if (mode === 'event') return clamp(Math.min(vw / (8.6 * TILE), vh / (10.4 * TILE)), 0.35, 1.3);
  const z = vw < 700 ? vw / (6 * TILE) : Math.min(vh / (ISLAND_H * 0.8), vw / (ISLAND_W * 0.9), 1.3);
  return Math.max(z, 0.5);
}
function clampCamera() {
  const [mn, mx] = zoomLimits();
  cam.z = clamp(cam.z, mn, mx);
  const hw = vw / (2 * cam.z), hh = vh / (2 * cam.z);
  cam.cx = hw * 2 >= WORLD_W ? WORLD_W / 2 : clamp(cam.cx, hw, WORLD_W - hw);
  cam.cy = hh * 2 >= WORLD_H ? WORLD_H / 2 : clamp(cam.cy, hh, WORLD_H - hh);
}
function resetCamera() {
  const phone = vw < 700;
  cam.cx = mode === 'event' ? EV_CX : (phone && HOME_CX ? HOME_CX : ISLAND_CX);
  cam.cy = mode === 'event' ? EV_CY : (phone && HOME_CY ? HOME_CY : ISLAND_CY);
  cam.z = defaultZoom();
  clampCamera();
}
const screenToWorld = (sx, sy) => ({ x: (sx - vw / 2) / cam.z + cam.cx, y: (sy - vh / 2) / cam.z + cam.cy });
const worldToScreen = (wx, wy) => ({ x: (wx - cam.cx) * cam.z + vw / 2, y: (wy - cam.cy) * cam.z + vh / 2 });
function visibleRect() {
  const hw = vw / (2 * cam.z), hh = vh / (2 * cam.z);
  return { x0: cam.cx - hw, x1: cam.cx + hw, y0: cam.cy - hh, y1: cam.cy + hh };
}
function resize() {
  vw = window.innerWidth; vh = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
  canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
  clampCamera();
}

/* ui helpers */
let toastTimer = 0;
function toast(msg, ms) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 2800);
}
const pad2 = (n) => (n < 10 ? '0' : '') + n;
function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  if (sec >= 86400) return Math.floor(sec / 86400) + 'd ' + Math.floor((sec % 86400) / 3600) + 'h';
  if (sec >= 3600) return Math.floor(sec / 3600) + 'h ' + pad2(Math.floor((sec % 3600) / 60)) + 'm';
  return Math.floor(sec / 60) + ':' + pad2(sec % 60);
}
function updateInfo() {
  const it = selected >= 0 ? grid[selected] : null;
  let html;
  if (isItem(it)) {
    html = TYPE_EMOJI[it.type] + ' <b>' + NAMES[it.type][it.level - 1] + '</b> &middot; Lv ' + it.level + '/' + MAX_LEVEL;
    html += it.level < MAX_LEVEL ? ' &middot; match 3 to make ' + NAMES[it.type][it.level] : ' &middot; MAX LEVEL ★';
  } else if (selT && selT.k === 'plant' && isPlant(grid[selT.idx])) {
    const p = grid[selT.idx], d = PLANTS[p.plant];
    const left = plantRemaining(p);
    html = '\u{1F331} <b>' + d.name + '</b> &middot; ' + (left <= 0 ? 'ready to harvest!' : 'ready in ' + fmtTime(left));
  } else if (selT && selT.k === 'prop') {
    const d = CLEAR[selT.p.kind];
    html = '<b>' + d.label + '</b> &middot; clear it for ⚡' + d.energy + ' and keep the ' + d.n + ' ' + NAMES[d.loot][0] + 's';
  } else if (selT && selT.k === 'tile') {
    html = 'Empty tile &middot; plant something, or move an item here';
  } else {
    html = mode === 'event'
      ? 'Pop the bubbles for shells and starfish. Merge 3 to earn event points!'
      : 'Tap an item, then an empty tile — or drag it. Match 3 to merge!';
  }
  infoEl.innerHTML = html;
  renderActions();
}
const isPlant = (it) => !!it && !!it.plant;

/* effects */
function burst(x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(0.35, 1) * (speed || 170);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 70, life: 0, max: rand(0.45, 0.95), size: rand(3, 7), color, star: Math.random() < 0.45 });
  }
}
function dust(x, y) {
  for (let i = 0; i < 8; i++) {
    const a = rand(Math.PI, TAU), s = rand(30, 90);
    particles.push({ x: x + rand(-14, 14), y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.4 - 10, life: 0, max: rand(0.3, 0.6), size: rand(3, 6), color: '#e9d8a6', star: false });
  }
}
function floatText(x, y, text, color) { floaters.push({ x, y, text, color: color || '#fff6c2', t: 0, dur: 1.4 }); }

/* ----------------------------------------------------------- game actions */
function serializeGrid(g) {
  const out = [];
  for (let i = 0; i < g.length; i++) {
    const it = g[i];
    if (!it) continue;
    if (it.plant) out.push([i, 'P:' + it.plant, it.t0, it.h | 0]);
    else out.push([i, it.type, it.level]);
  }
  return out;
}
function deserializeGrid(list, ok) {
  const g = newGrid();
  for (const e of Array.isArray(list) ? list : []) {
    if (!Array.isArray(e)) continue;
    const idx = e[0] | 0;
    if (idx < 0 || idx >= g.length || !ok(idx)) continue;
    if (typeof e[1] === 'string' && e[1].startsWith('P:')) {
      const key = e[1].slice(2);
      if (PLANTS[key]) g[idx] = { plant: key, t0: +e[2] || nowMs(), h: e[3] | 0, pop: 0, land: null, ready: false };
    } else if (ITEM_DEFS[e[1]]) g[idx] = makeItem(e[1], clamp(e[2] | 0, 1, MAX_LEVEL));
  }
  return g;
}
function save() {
  try {
    const home = mode === 'island' ? cam : islandCam;
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 3, seed: ISLAND_SEED,
      items: serializeGrid(islandGrid), evItems: serializeGrid(eventGrid),
      cam: home ? { cx: home.cx, cy: home.cy, z: home.z } : null,
      music: audio.pref.music, sfx: audio.pref.sfx,
      blimpTimer: blimp ? rand(30, 90) : blimpTimer,
      merges, P
    }));
  } catch (e) { /* storage unavailable (private mode etc.) */ }
  dirty = false;
}
// Copy saved progress onto P, keeping defaults for anything missing (older saves, odd data).
function applyProgress(src) {
  const f = freshProgress();
  for (const k of Object.keys(f)) {
    const v = src ? src[k] : undefined;
    if (v === undefined || v === null) { P[k] = f[k]; continue; }
    if (f[k] && typeof f[k] === 'object' && !Array.isArray(f[k])) P[k] = Object.assign({}, f[k], v);
    else P[k] = v;
  }
  for (const k of ['coins', 'xp', 'pearls', 'energy', 'energyAt', 'driftAt']) if (!isFinite(P[k])) P[k] = f[k];
  P.level = clamp(P.level | 0, 1, 99);
  if (!Array.isArray(P.open)) P.open = f.open.slice();
  P.open = f.open.map((_, i) => i === 0 || !!P.open[i]);
  if (!Array.isArray(P.cleared)) P.cleared = [];
  if (!Array.isArray(P.orders)) P.orders = [];
  if (!Array.isArray(P.orderWait)) P.orderWait = [];
  if (!P.goods || typeof P.goods !== 'object') P.goods = {};
  if (!P.stations || typeof P.stations !== 'object') P.stations = {};
}
function resetObstacles() {
  for (const p of props) if (p.block && p.cleared) { p.cleared = false; playable[p.cell] = 0; }
}
function applyCleared() {
  for (const cell of P.cleared) {
    const p = props.find((q) => q.block && q.cell === cell);
    if (p && !p.cleared) { p.cleared = true; playable[p.cell] = 1; }
  }
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (!d || d.v !== 3 || d.seed !== ISLAND_SEED) return false;
      resetObstacles();
      applyProgress(d.P);
      applyCleared();
      mode = 'island';
      islandGrid = deserializeGrid(d.items, (i) => !!playable[i]);
      eventGrid = deserializeGrid(d.evItems, (i) => !!evPlayable[i]);
      grid = islandGrid;
      if (d.cam && isFinite(d.cam.cx) && isFinite(d.cam.cy) && isFinite(d.cam.z)) {
        cam.cx = d.cam.cx; cam.cy = d.cam.cy; cam.z = d.cam.z;
      } else resetCamera();
      clampCamera();
      blimpTimer = typeof d.blimpTimer === 'number' ? clamp(d.blimpTimer, 5, BLIMP.maxDelay) : BLIMP.firstDelay;
      merges = d.merges | 0;
      audio.setPrefs(d.music !== false, d.sfx !== false);
      afterLoad();
      return true;
    }
    // A save from the first island version: keep the crops, start the new systems fresh.
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const d = JSON.parse(old);
      if (d && d.v === 2 && Array.isArray(d.items)) {
        newGame(d.items.filter((e) => Array.isArray(e) && TYPES.includes(e[1])).map((e) => [e[1], clamp(e[2] | 0, 1, MAX_LEVEL)]));
        audio.setPrefs(d.music !== false, d.sfx !== false);
        merges = d.merges | 0;
        return true;
      }
    }
  } catch (e) { /* fall through to a new game */ }
  return false;
}
function afterLoad() {
  P.energyAt = isFinite(P.energyAt) ? P.energyAt : nowMs();
  if (!P.driftAt) P.driftAt = nowMs() + 120e3;
  ensureOrders(); dailyEnsure(); seasonEnsure(); eventEnsure();
  refreshHUD(); updateInfo();
}
function newGame(carry) {
  Object.assign(P, freshProgress());
  P.energyAt = nowMs();
  P.driftAt = nowMs() + 4 * 60e3;
  resetObstacles();
  mode = 'island';
  islandGrid = newGrid(); grid = islandGrid; eventGrid = newGrid();
  selected = -1; selT = null; drag = null; blimp = null; pod = null; merges = 0;
  blimpTimer = BLIMP.firstDelay;
  ghosts.length = particles.length = floaters.length = 0;
  for (let s = 0; s < fogFade.length; s++) fogFade[s] = 0;
  const types = [];
  if (carry) for (const c of carry) types.push(c);
  else {
    for (const t of TYPES) for (let i = 0; i < 4; i++) types.push([t, 1]);
    for (let i = 0; i < 3; i++) types.push([pick(TYPES), 1]);
  }
  shuffle(types);
  // scatter the starting items over the middle of the island, never forming a ready-made trio
  const pool = [];
  for (let i = 0; i < playable.length; i++) {
    if (!usable(i)) continue;
    const c = cellCenter(i);
    pool.push([Math.hypot(c.x - ISLAND_CX, c.y - ISLAND_CY), i]);
  }
  pool.sort((a, b) => a[0] - b[0]);
  const near = shuffle(pool.slice(0, Math.max(types.length * 3, Math.floor(pool.length * 0.8))).map((p) => p[1]));
  let k = 0;
  for (const [t, l] of types) {
    while (k < near.length) {
      const idx = near[k++];
      grid[idx] = makeItem(t, l);
      if (floodGroup(idx).length >= 3) { grid[idx] = null; continue; }
      break;
    }
  }
  closeSheet(); closeModal(true);
  ensureOrders(); dailyEnsure(); seasonEnsure();
  resetCamera();
  save();
  updateInfo();
  refreshHUD();
}

/* ---- energy, xp, rewards ---- */
function regenEnergy() {
  const now = nowMs(), max = energyMax(P.level);
  if (P.energy >= max) { P.energyAt = now; return; }
  const step = ENERGY_REGEN * 1000;
  const gained = Math.floor((now - P.energyAt) / step);
  if (gained > 0) {
    P.energy = Math.min(max, P.energy + gained);
    P.energyAt = P.energy >= max ? now : P.energyAt + gained * step;
  } else if (now < P.energyAt) P.energyAt = now;
}
function energyNow() { regenEnergy(); return Math.floor(P.energy); }
function spendEnergy(n) {
  regenEnergy();
  if (P.energy < n) { toast('Not enough energy ⚡ — it refills on its own, or spend pearls in the ⚡ menu.'); audio.nope(); return false; }
  P.energy -= n;
  dirty = true;
  return true;
}
function addXP(n) {
  P.xp += n;
  let up = 0;
  while (P.xp >= xpNeed(P.level)) { P.xp -= xpNeed(P.level); P.level++; up++; }
  if (up) onLevelUp(up);
  dirty = true;
}
function unlocksAt(lvl) {
  const u = [];
  for (const s of STATIONS) if (s.unlock === lvl) u.push(s.emoji + ' ' + s.name);
  for (const k of PLANT_ORDER) if (PLANTS[k].unlock === lvl && lvl > 1) u.push('\u{1F331} ' + PLANTS[k].name);
  SECTORS.forEach((s, i) => { if (i && s.lvl === lvl) u.push('\u{1F32B}️ ' + s.name + ' can be cleared of mist'); });
  if (lvl === 4 || lvl === 7) u.push('\u{1F4CB} A new order slot');
  return u;
}
function onLevelUp(count) {
  P.energy = Math.max(P.energy, energyMax(P.level));
  const bonus = 25 * P.level;
  P.coins += bonus;
  audio.levelUp();
  const lines = ['You reached level ' + P.level + '!', 'Energy is full again and you got \u{1FA99} ' + bonus + ' coins.'];
  for (let l = P.level - count + 1; l <= P.level; l++) for (const u of unlocksAt(l)) lines.push('New: ' + u);
  showDialog({ who: 'island', title: 'Level ' + P.level, lines, button: 'Nice!' });
  burst(cam.cx, cam.cy, '#ffe066', 40, 320);
  track('level', P.level);
  refreshHUD();
}
// Apply a reward bundle and describe it for a toast.
function giveReward(r, silent) {
  const parts = [];
  if (r.coins) { P.coins += r.coins; parts.push('\u{1FA99}' + r.coins); }
  if (r.energy) { regenEnergy(); P.energy += r.energy; parts.push('⚡' + r.energy); }
  if (r.pearls) { P.pearls += r.pearls; parts.push('\u{1F9AA}' + r.pearls); }
  if (r.sp) { addSP(r.sp); parts.push('\u{1F3D6}️' + r.sp + ' SP'); }
  if (r.skin) parts.push(BLIMP_SKINS[r.skin].name + ' blimp');
  if (r.xp) { parts.push('✨' + r.xp + ' XP'); addXP(r.xp); }
  if (!silent && parts.length) { toast('+ ' + parts.join('  ')); audio.coin(); }
  dirty = true;
  refreshHUD();
  return parts.join('  ');
}

/* ---- merging ---- */
// Called whenever an item settles into a cell (moved, landed, or spawned by a bonus).
function tryMerge(idx) {
  for (let guard = 0; guard < 24; guard++) {
    const it = grid[idx];
    if (!isItem(it) || it.level >= MAX_LEVEL) return;
    const group = floodGroup(idx);
    if (group.length < 3) return;
    const five = group.length >= 5;                      // five at once pays double
    const target = cellCenter(idx);
    const freed = [];
    for (const j of group.slice(0, five ? 5 : 3)) {
      if (j === idx) continue;
      const from = cellCenter(j);
      ghosts.push({ type: it.type, level: it.level, x0: from.x, y0: from.y, x1: target.x, y1: target.y, t: 0, dur: 0.2 });
      grid[j] = null;
      freed.push(j);
      if (selected === j) selected = -1;
    }
    it.level++;
    it.pop = 1;
    if (five) {
      const second = makeItem(it.type, it.level);
      second.pop = 1;
      grid[freed[0]] = second;                           // freed[0] touches the merge cell, so it can cascade too
      const sc = cellCenter(freed[0]);
      burst(sc.x, sc.y, '#ffffff', 14, 190);
    }
    merges++;
    burst(target.x, target.y, TYPE_COLOR[it.type], it.level === MAX_LEVEL ? 34 : 16, it.level === MAX_LEVEL ? 260 : 170);
    floatText(target.x, target.y - 52, NAMES[it.type][it.level - 1] + (it.level === MAX_LEVEL ? '!' : ''), it.level === MAX_LEVEL ? '#ffe066' : '#ffffff');
    if (five) floatText(target.x, target.y - 86, 'BONUS ×2!', '#8cffb0');
    audio.merge(it.level);
    if (five) audio.bonus();
    onMerged(it, five);
    if (it.level === MAX_LEVEL) toast('Max level reached: ' + NAMES[it.type][it.level - 1] + ' \u{1F389}');
    dirty = true;
  }
}
function onMerged(it, five) {
  if (mode === 'event') { addEventPoints(EP_FOR_LEVEL[it.level] + (five ? 3 : 0)); return; }
  P.stats.merges++;
  if (five) P.stats.bonus++;
  addXP(MERGE_XP[it.level] + (five ? 3 : 0));
  track('merge', 1, { level: it.level, type: it.type });
  if (five) track('bonus', 1);
}
function moveItem(from, to) {
  const it = grid[from];
  if (!isItem(it) || grid[to] || !usable(to)) return;
  grid[to] = it; grid[from] = null;
  it.pop = 0.6;
  selected = -1;
  audio.place();
  tryMerge(to);
  updateInfo();
  save();
}
function selectCell(idx) {
  selected = idx; selT = null;
  audio.select();
  updateInfo();
}
function clearSelection() { selected = -1; selT = null; updateInfo(); }

/* ---- farming ---- */
function plantDur(it) { const d = PLANTS[it.plant]; return (it.h > 0 && d.regrow ? d.regrow : d.grow) * 1000; }
function plantProgress(it) { return clamp((nowMs() - it.t0) / plantDur(it), 0, 1); }
function plantRemaining(it) { return Math.max(0, (it.t0 + plantDur(it) - nowMs()) / 1000); }
const plantReady = (it) => plantProgress(it) >= 1;
function selectTile(idx) {
  selected = -1; selT = { k: 'tile', idx };
  audio.select(); updateInfo();
}
function doPlant(idx, key) {
  const d = PLANTS[key];
  if (!d || !usable(idx) || grid[idx]) return;
  if (P.level < d.unlock) { toast(d.name + ' unlocks at level ' + d.unlock); audio.nope(); return; }
  if (P.coins < d.coins) { toast('You need \u{1FA99} ' + d.coins + ' for a ' + d.name); audio.nope(); return; }
  if (!spendEnergy(d.energy)) return;
  P.coins -= d.coins;
  const it = { plant: key, t0: nowMs(), h: 0, pop: 1, land: null, ready: false };
  grid[idx] = it;
  const c = cellCenter(idx);
  dust(c.x, c.y + 24);
  audio.place();
  selT = null;
  addXP(1);
  track('plant', 1, { kind: d.kind, plant: key });
  refreshHUD(); updateInfo(); save();
}
function harvest(idx) {
  const it = grid[idx];
  if (!isPlant(it)) return;
  const d = PLANTS[it.plant];
  if (!plantReady(it)) { selT = { k: 'plant', idx }; selected = -1; audio.select(); updateInfo(); return; }
  const n = randInt(d.yield[0], d.yield[1]);
  const crop = d.kind === 'crop';
  if (crop) grid[idx] = null;                            // the plot is free for the harvest to land on
  const spots = nearestEmpties(idx, n);
  if (!spots.length) { if (crop) grid[idx] = it; toast('No room to harvest — merge or move some items first!'); audio.nope(); return; }
  if (d.pick && !spendEnergy(d.pick)) { if (crop) grid[idx] = it; return; }
  const src = cellCenter(idx);
  spots.forEach((s, k) => {
    const m = makeItem(d.item, 1);
    m.land = { x0: src.x, y0: src.y - 26, t: -k * 0.09, dur: 0.55, style: 'hop' };
    grid[s] = m;
  });
  if (!crop) { it.t0 = nowMs(); it.h++; it.ready = false; it.pop = 1; }
  burst(src.x, src.y, '#9be564', 12, 200);
  floatText(src.x, src.y - 40, '+' + spots.length + ' ' + NAMES[d.item][0], '#d4ffb0');
  audio.harvest();
  P.stats.harvest++;
  addXP(2);
  track('harvest', 1, { kind: d.kind, plant: it.plant });
  selT = null;
  refreshHUD(); updateInfo(); save();
}
function uproot(idx) {
  const it = grid[idx];
  if (!isPlant(it)) return;
  grid[idx] = null; selT = null;
  const c = cellCenter(idx);
  dust(c.x, c.y + 24);
  audio.thud();
  updateInfo(); save();
}
function rushCost(sec) { return Math.max(1, Math.ceil(sec / 90)); }
function rushPlant(idx) {
  const it = grid[idx];
  if (!isPlant(it)) return;
  const left = plantRemaining(it);
  if (left <= 0) return;
  const cost = rushCost(left);
  if (P.pearls < cost) { toast('You need \u{1F9AA} ' + cost + ' pearls — earn them from quests, dailies and the season track.'); audio.nope(); return; }
  P.pearls -= cost;
  it.t0 = nowMs() - plantDur(it);
  refreshHUD(); updateInfo(); save();
}

/* ---- clearing obstacles ---- */
function propAtPoint(wx, wy) {
  let best = null, bd = 1e9;
  for (const p of props) {
    if (!p.block || p.cleared || !sectorOpen(p.cell)) continue;
    const top = p.kind === 'palm' ? 210 * p.sc : p.kind === 'bush' ? 60 : 55;
    const half = p.kind === 'palm' ? 55 * p.sc : 48;
    if (wx < p.x - half || wx > p.x + half || wy < p.y - top || wy > p.y + 14) continue;
    const d = Math.hypot(wx - p.x, (wy - p.y + top / 2) * 0.6);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function selectProp(p) {
  selected = -1; selT = { k: 'prop', p };
  audio.select(); updateInfo();
}
function clearProp(p) {
  if (!p || p.cleared || mode !== 'island') return;
  const d = CLEAR[p.kind];
  if (!spendEnergy(d.energy)) return;
  p.cleared = true;
  playable[p.cell] = 1;
  P.cleared.push(p.cell);
  const spots = nearestEmpties(p.cell, d.n);
  const c = cellCenter(p.cell);
  spots.forEach((s, k) => {
    const m = makeItem(d.loot, 1);
    m.land = { x0: c.x, y0: c.y - 30, t: -k * 0.1, dur: 0.5, style: 'hop' };
    grid[s] = m;
  });
  burst(c.x, c.y, p.kind === 'rock' ? '#cfd8dc' : '#7bd88f', 22, 240);
  dust(c.x, c.y + 20);
  floatText(c.x, c.y - 50, '+' + spots.length + ' ' + NAMES[d.loot][0], '#ffe9a8');
  audio.thud(); audio.harvest();
  P.stats.cleared++;
  addXP(2 + d.energy);
  track('clear', 1, { kind: p.kind });
  selT = null;
  refreshHUD(); updateInfo(); save();
}

/* ---- fog of war ---- */
function sectorCost(s) { return SECTORS[s]; }
function sectorReqs(s) {
  const d = SECTORS[s];
  const have = P.goods[d.good] | 0;
  return [
    { ok: P.level >= d.lvl, text: 'Level ' + d.lvl, now: 'you are level ' + P.level },
    { ok: P.coins >= d.coins, text: '\u{1FA99} ' + d.coins + ' coins', now: 'you have ' + P.coins },
    { ok: have >= d.n, text: d.n + ' × ' + GOODS[d.good].emoji + ' ' + GOODS[d.good].name, now: 'you have ' + have }
  ];
}
function openSectorCard(s) {
  if (s <= 0 || P.open[s]) return;
  const d = SECTORS[s], reqs = sectorReqs(s);
  const can = reqs.every((r) => r.ok);
  let body = '<p>Thick mist hides this part of the island. Lift it to farm the land underneath.</p><ul class="reqs">';
  for (const r of reqs) body += '<li class="' + (r.ok ? 'ok' : 'no') + '">' + (r.ok ? '✔' : '✖') + ' ' + r.text + ' <small>(' + r.now + ')</small></li>';
  body += '</ul>';
  showModal({
    title: '\u{1F32B}️ ' + d.name, body,
    buttons: [{ label: 'Not yet', cls: '' }, { label: can ? 'Clear the mist' : 'Missing requirements', cls: can ? 'primary' : 'disabled', act: () => unlockSector(s) }]
  });
}
function unlockSector(s) {
  if (P.open[s]) return;
  const d = SECTORS[s];
  if (!sectorReqs(s).every((r) => r.ok)) { toast('Not ready for that sector yet.'); audio.nope(); return; }
  P.coins -= d.coins;
  P.goods[d.good] = (P.goods[d.good] | 0) - d.n;
  P.open[s] = true;
  fogFade[s] = 1;
  const a = sectorAnchor[s];
  if (a) burst(a.x, a.y, '#ffffff', 60, 380);
  audio.levelUp();
  toast(d.name + ' is open!', 3200);
  P.stats.sectors = (P.stats.sectors | 0) + 1;
  addXP(20 + s * 10);
  track('sector', 1);
  refreshHUD(); updateInfo(); save();
}

/* blimp */
function spawnBlimp() {
  const dir = Math.random() < 0.5 ? 1 : -1;
  const speed = clamp(vw / 18, 45, 90);
  blimp = {
    dir, x: dir > 0 ? -190 : vw + 190, y: Math.max(120, vh * rand(0.14, 0.34)),
    vx: dir * speed, hits: 0, need: randInt(BLIMP.minClicks, BLIMP.maxClicks),
    done: false, squash: 0, spin: 0, ph: rand(0, TAU), age: 0
  };
  audio.blimpArrive(); audio.hum(true);
  toast('A supply blimp is drifting by \u2014 tap it for crops!', 3600);
}
function blimpHit(x, y) {
  if (!blimp || blimp.done) return false;
  const s = clamp(vw / 650, 0.78, 1.25);
  const by = blimp.y + Math.sin(time * 1.3 + blimp.ph) * 7;
  const dx = (x - blimp.x) / (110 * s), dy = (y - (by + 8)) / (62 * s);
  return dx * dx + dy * dy <= 1;
}
function hitBlimp() {
  const b = blimp;
  b.hits++; b.squash = 1;
  audio.blimpTap();
  track('blimp', 1);
  dropItems(randInt(BLIMP.minDrop, BLIMP.maxDrop), b.x, b.y);
  if (b.hits >= b.need) {
    b.done = true;
    toast('The blimp is empty \u2014 see you next time!', 2600);
  }
}
function dropItems(n, sx, sy, types, style) {
  const empties = [];
  for (let i = 0; i < grid.length; i++) if (!grid[i] && usable(i)) empties.push(i);
  if (!empties.length) { toast('No room \u2014 merge some items to make space!'); return; }
  const vis = [], hid = [];
  for (const i of empties) {
    const c = cellCenter(i), s = worldToScreen(c.x, c.y);
    (s.x > 24 && s.x < vw - 24 && s.y > 80 && s.y < vh - 80 ? vis : hid).push(i);
  }
  shuffle(vis); shuffle(hid);
  const order = vis.concat(hid);
  const start = screenToWorld(sx, sy + 30);
  const count = Math.min(n, order.length);
  const chutes = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b'];
  for (let k = 0; k < count; k++) {
    const it = makeItem(pick(types || TYPES), 1);
    it.land = { x0: start.x + rand(-24, 24), y0: start.y, t: -k * 0.14, dur: rand(0.95, 1.25), col: pick(chutes), style: style || 'chute' };
    grid[order[k]] = it;
  }
  dirty = true;
}
function updateBlimp(dt) {
  const b = blimp;
  b.age += dt;
  b.x += b.vx * dt * (b.done ? 1.5 : 1);
  if (b.done) b.y -= 8 * dt;
  b.squash = Math.max(0, b.squash - dt * 4);
  b.spin += dt * 20;
  if ((b.dir > 0 && b.x > vw + 260) || (b.dir < 0 && b.x < -260)) {
    blimp = null;
    blimpTimer = rand(BLIMP.minDelay, BLIMP.maxDelay);
    audio.hum(false);
    save();
  }
}

/* --------------------------------------------------------------- update */
let uiAcc = 0, slowAcc = 0;
function uiTick() {
  refreshHUD(); tickSheet();
  slowAcc += 0.25;
  if (slowAcc >= 1) { slowAcc = 0; slowTick(); }
}
function slowTick() {
  ensureOrders(); dailyEnsure(); seasonEnsure(); eventEnsure(); driftTick();
  if (selT && selT.k === 'plant') updateInfo();
  if (!modalCur && !sheetName && time > 1.2 && questStatus().s === 'intro') showQuestIntro();
}
function update(dt) {
  time += dt;

  for (let i = 0; i < grid.length; i++) {
    const it = grid[i];
    if (!it) continue;
    if (it.pop > 0) it.pop = Math.max(0, it.pop - dt * 3.2);
    if (it.plant) {
      const rdy = plantReady(it);
      if (rdy && !it.ready) {
        it.ready = true;
        const c = cellCenter(i);
        burst(c.x, c.y - 20, '#fff3a0', 8, 120);
        audio.ping();
        if (selT && selT.k === 'plant' && selT.idx === i) updateInfo();
      } else if (!rdy) it.ready = false;
      continue;
    }
    if (it.land) {
      it.land.t += dt;
      if (it.land.t >= it.land.dur) {
        it.land = null;
        it.pop = 1;
        const c = cellCenter(i);
        dust(c.x, c.y + 24);
        audio.thud();
        tryMerge(i);
        dirty = true;
      }
    }
  }

  if (mode === 'island') {
    if (blimp) updateBlimp(dt);
    else {
      blimpTimer -= dt;
      if (blimpTimer <= 0) spawnBlimp();
    }
  } else if (pod) updatePod(dt);
  else {
    podTimer -= dt;
    if (podTimer <= 0) spawnPod();
  }
  for (let s = 0; s < fogFade.length; s++) if (fogFade[s] > 0) fogFade[s] = Math.max(0, fogFade[s] - dt * 0.7);
  uiAcc += dt;
  if (uiAcc >= 0.25) { uiAcc = 0; uiTick(); }

  for (let i = ghosts.length - 1; i >= 0; i--) { ghosts[i].t += dt; if (ghosts[i].t >= ghosts[i].dur) ghosts.splice(i, 1); }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt;
    if (p.life >= p.max) particles.splice(i, 1);
  }
  for (let i = floaters.length - 1; i >= 0; i--) { floaters[i].t += dt; if (floaters[i].t >= floaters[i].dur) floaters.splice(i, 1); }

  // auto-scroll while dragging an item near the screen edge
  if (gesture && gesture.mode === 'drag' && drag) {
    const m = 64, sp = 600;
    const px = gesture.px, py = gesture.py;
    let dx = 0, dy = 0;
    if (px < m) dx = -(1 - px / m); else if (px > vw - m) dx = (px - (vw - m)) / m;
    if (py < m + 40) dy = -(1 - py / (m + 40)); else if (py > vh - m - 30) dy = (py - (vh - m - 30)) / (m + 30);
    if (dx || dy) {
      cam.cx += dx * sp * dt / cam.z; cam.cy += dy * sp * dt / cam.z;
      clampCamera();
    }
    const w = screenToWorld(px, py);
    drag.wx = w.x; drag.wy = w.y;
  }

  saveTimer += dt;
  if (saveTimer > 8) { saveTimer = 0; save(); }
}

/* --------------------------------------------------------------- render */
function inView(vr, x, y, m) { return x > vr.x0 - m && x < vr.x1 + m && y > vr.y0 - m && y < vr.y1 + m; }

// open ocean: soft glints that come and go, tiled across the world
function drawWaves(vr, t) {
  const S = TILE * 1.4;
  const gx0 = Math.floor(vr.x0 / S) - 1, gx1 = Math.ceil(vr.x1 / S) + 1;
  const gy0 = Math.floor(vr.y0 / S) - 1, gy1 = Math.ceil(vr.y1 / S) + 1;
  ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const h = hash2(gx, gy);
      if (h > 0.6) continue;
      const px = (gx + hash2(gx + 11, gy)) * S, py = (gy + hash2(gx, gy + 7)) * S;
      if (isLandAt(px, py)) continue;
      const a = 0.5 + 0.5 * Math.sin(t * 1.3 + h * 40);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.06 + 0.4 * a * a) + ')';
      const w = 11 + h * 14;
      ctx.beginPath();
      ctx.moveTo(px - w, py);
      ctx.quadraticCurveTo(px - w / 2, py - 6, px, py);
      ctx.quadraticCurveTo(px + w / 2, py + 6, px + w, py);
      ctx.stroke();
    }
  }
}
function drawIsland(vr, t) {
  ctx.lineJoin = 'round';
  // shallow water fading out from the shore
  ctx.strokeStyle = 'rgba(110,226,232,0.20)'; ctx.lineWidth = TILE * 3.4; ctx.stroke(landPath);
  ctx.strokeStyle = 'rgba(140,238,236,0.26)'; ctx.lineWidth = TILE * 2.3; ctx.stroke(landPath);
  ctx.strokeStyle = 'rgba(180,250,240,0.38)'; ctx.lineWidth = TILE * 1.2; ctx.stroke(landPath);
  // surf
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = TILE * 0.34 + Math.sin(t * 1.4) * TILE * 0.06; ctx.stroke(landPath);
  ctx.setLineDash([70, 46]); ctx.lineDashOffset = -t * 26;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 8; ctx.stroke(landPath);
  ctx.setLineDash([]);
  // sand
  ctx.fillStyle = '#f4e1a8'; ctx.fill(landPath, 'evenodd');
  ctx.strokeStyle = '#e3c98a'; ctx.lineWidth = 12; ctx.stroke(landPath);
  // grass, with a faint checker so the ground reads as tiles
  ctx.fillStyle = '#62b84a'; ctx.fill(grassPath, 'evenodd');
  ctx.save();
  ctx.clip(grassPath, 'evenodd');
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath();
  const c0 = Math.max(0, Math.floor(vr.x0 / TILE)), c1 = Math.min(MAPW - 1, Math.floor(vr.x1 / TILE));
  const r0 = Math.max(0, Math.floor(vr.y0 / TILE)), r1 = Math.min(MAPH - 1, Math.floor(vr.y1 / TILE));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if ((r + c) & 1) ctx.rect(c * TILE, r * TILE, TILE, TILE);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#4ba33d'; ctx.lineWidth = 9; ctx.stroke(grassPath);
}
function drawFlora(vr, t) {
  ctx.lineCap = 'round';
  ctx.fillStyle = 'rgba(176,146,92,0.55)';
  for (const p of flora.pebbles) {
    if (!inView(vr, p.x, p.y, 10)) continue;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.7, 0, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(36,118,50,0.65)'; ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (const p of flora.tufts) {
    if (!inView(vr, p.x, p.y, 20)) continue;
    ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 3, p.y - p.h);
    ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 1, p.y - p.h * 1.1);
    ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 4, p.y - p.h * 0.8);
  }
  ctx.stroke();
  for (const p of flora.shells) {
    if (!inView(vr, p.x, p.y, 20)) continue;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.fillStyle = '#ffc6d0'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 6, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#e59aa9'; ctx.lineWidth = 1.2;
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(-6, k * 2); ctx.lineTo(7, k * 2.4); ctx.stroke(); }
    ctx.restore();
  }
  for (const p of flora.flowers) {
    if (!inView(vr, p.x, p.y, 20)) continue;
    ctx.fillStyle = p.col;
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * TAU;
      ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * 4.5, p.y + Math.sin(a) * 4.5, 3.4, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, TAU); ctx.fill();
  }
  for (const r of flora.reefs) {
    if (!inView(vr, r.x, r.y, 60)) continue;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.6 + r.ph);
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 + 0.25 * pulse) + ')'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(r.x, r.y + 6, 36 + pulse * 5, 21 + pulse * 3, 0, 0, TAU); ctx.stroke();
    ctx.drawImage(rockSprite, r.x - 34, r.y - 40, 68, 52);
  }
}
// the farm plots: one per usable cell, and nowhere else
function drawPlots(vr, t) {
  const c0 = clamp(Math.floor(vr.x0 / TILE), 0, MAPW - 1), c1 = clamp(Math.floor(vr.x1 / TILE), 0, MAPW - 1);
  const r0 = clamp(Math.floor(vr.y0 / TILE), 0, MAPH - 1), r1 = clamp(Math.floor(vr.y1 / TILE), 0, MAPH - 1);
  const ev = mode === 'event';
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (!usable(r * MAPW + c)) continue;
      const x = c * TILE, y = r * TILE;
      ctx.fillStyle = ev ? 'rgba(0,40,70,0.22)' : 'rgba(30,60,20,0.22)'; rr(ctx, x + 3, y + 6, TILE - 6, TILE - 6, 13); ctx.fill();
      ctx.fillStyle = ev ? ((r + c) & 1 ? '#7fcfe0' : '#70c3d6') : ((r + c) & 1 ? '#aa8250' : '#9b7344');
      rr(ctx, x + 3, y + 3, TILE - 6, TILE - 6, 13); ctx.fill();
      ctx.strokeStyle = ev ? 'rgba(10,70,110,0.55)' : 'rgba(70,42,16,0.55)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      rr(ctx, x + 8, y + 8, TILE - 16, (TILE - 16) * 0.38, 8); ctx.fill();
    }
  }
  if (drag) {
    const h = cellAt(drag.wx, drag.wy);
    if (h >= 0) {
      const c = h % MAPW, r = Math.floor(h / MAPW);
      const ok = !grid[h] || h === drag.idx;
      ctx.fillStyle = ok ? 'rgba(255,255,255,0.32)' : 'rgba(255,90,90,0.33)';
      rr(ctx, c * TILE + 3, r * TILE + 3, TILE - 6, TILE - 6, 13); ctx.fill();
    }
  }
  if (selected >= 0) {
    const c = selected % MAPW, r = Math.floor(selected / MAPW);
    ctx.strokeStyle = 'rgba(255,236,140,' + (0.7 + Math.sin(t * 6) * 0.25) + ')';
    ctx.lineWidth = 5;
    rr(ctx, c * TILE + 4, r * TILE + 4, TILE - 8, TILE - 8, 13); ctx.stroke();
  }
  if (selT && selT.idx !== undefined) {
    const c = selT.idx % MAPW, r = Math.floor(selT.idx / MAPW);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; rr(ctx, c * TILE + 3, r * TILE + 3, TILE - 6, TILE - 6, 13); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.75 + Math.sin(t * 6) * 0.2) + ')';
    ctx.lineWidth = 4; ctx.setLineDash([14, 9]); ctx.lineDashOffset = -t * 30;
    rr(ctx, c * TILE + 5, r * TILE + 5, TILE - 10, TILE - 10, 13); ctx.stroke();
    ctx.setLineDash([]);
  }
}
// trees, bushes and rocks. Blocking ones sit on cells that are not playable.
function drawProps(vr, t) {
  for (const p of props) {
    if (p.cleared || !inView(vr, p.x, p.y - 80, 220)) continue;
    if (selT && selT.k === 'prop' && selT.p === p) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.7 + Math.sin(t * 6) * 0.25) + ')'; ctx.lineWidth = 4;
      ctx.setLineDash([12, 8]); ctx.lineDashOffset = -t * 30;
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 8, 52, 26, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    if (p.kind === 'palm') {
      const sc = p.sc;
      ctx.fillStyle = 'rgba(0,40,20,0.22)'; ctx.beginPath(); ctx.ellipse(p.x + 10, p.y + 2, 48 * sc, 12 * sc, 0, 0, TAU); ctx.fill();
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.sin(t * 0.8 + p.ph) * 0.025);
      ctx.scale(p.flip, 1);
      ctx.drawImage(palmSprite, -105 * sc, -290 * sc, 240 * sc, 300 * sc);
      ctx.restore();
    } else if (p.kind === 'bush') {
      const w = TILE * 0.95 * p.sc, h = w * 0.75;
      ctx.drawImage(bushSprite, p.x - w / 2, p.y - h + 4, w, h);
    } else {
      const w = TILE * 0.8 * p.sc, h = w * 0.76;
      ctx.drawImage(rockSprite, p.x - w / 2, p.y - h + 4, w, h);
    }
  }
}

function drawItems(t) {
  for (let i = 0; i < grid.length; i++) {
    const it = grid[i];
    if (!it || it.land) continue;
    if (it.plant) { drawPlant(it, i, t); continue; }
    if (drag && drag.idx === i) continue;
    const c = cellCenter(i);
    let s = 1 + 0.35 * it.pop, lift = 0;
    if (i === selected) { lift = -7 + Math.sin(t * 6) * 2.5; s *= 1.08; }
    const size = TILE * 1.04 * s;
    ctx.drawImage(sprites[it.type][it.level], c.x - size / 2, c.y - size / 2 + lift - 3, size, size);
  }
}
function drawLanding() {
  for (let i = 0; i < grid.length; i++) {
    const it = grid[i];
    if (!it || !it.land || it.land.t < 0) continue;
    const L = it.land, p = clamp(L.t / L.dur, 0, 1);
    const tc = cellCenter(i);
    const hop = L.style === 'hop';
    const x = hop ? lerp(L.x0, tc.x, easeInOut(p)) : lerp(L.x0, tc.x, easeInOut(p)) + Math.sin(p * 9) * 14 * (1 - p);
    const y = hop ? lerp(L.y0, tc.y, p) - Math.sin(p * Math.PI) * 54 : lerp(L.y0, tc.y, 1 - Math.pow(1 - p, 2));
    const s = hop ? lerp(0.7, 1, p) : lerp(0.55, 1, easeOutCubic(Math.min(1, p * 1.6)));
    const size = TILE * 1.04 * s;
    ctx.globalAlpha = Math.min(1, p * 10);
    // ground shadow grows as it nears
    ctx.fillStyle = 'rgba(0,30,20,' + (0.1 + 0.15 * p) + ')';
    ctx.beginPath(); ctx.ellipse(tc.x, tc.y + 30, 20 * p + 6, 6 * p + 2, 0, 0, TAU); ctx.fill();
    if (L.style === 'bubble') {
      ctx.fillStyle = 'rgba(190,240,255,0.28)'; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y - 4, 46 * s, 0, TAU); ctx.fill(); ctx.stroke();
    } else if (L.style !== 'hop') {
      // parachute
      const cy = y - 62 * s;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 32 * s, cy); ctx.lineTo(x - 8 * s, y - 20 * s);
      ctx.moveTo(x + 32 * s, cy); ctx.lineTo(x + 8 * s, y - 20 * s);
      ctx.moveTo(x, cy); ctx.lineTo(x, y - 24 * s);
      ctx.stroke();
      ctx.fillStyle = L.col;
      ctx.beginPath(); ctx.arc(x, cy, 34 * s, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(x, cy, 34 * s, Math.PI * 1.35, Math.PI * 1.65); ctx.lineTo(x, cy); ctx.closePath(); ctx.fill();
    }
    ctx.drawImage(sprites[it.type][it.level], x - size / 2, y - size / 2, size, size);
    ctx.globalAlpha = 1;
  }
}
function drawFx() {
  for (const g of ghosts) {
    const p = easeInCubic(clamp(g.t / g.dur, 0, 1));
    const x = lerp(g.x0, g.x1, p), y = lerp(g.y0, g.y1, p);
    const size = TILE * 1.04 * (1 - 0.2 * p);
    ctx.globalAlpha = 1 - 0.4 * p;
    ctx.drawImage(sprites[g.type][g.level], x - size / 2, y - size / 2 - 3, size, size);
    ctx.globalAlpha = 1;
  }
  for (const p of particles) {
    const a = 1 - p.life / p.max;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    if (p.star) sparkle(ctx, p.x, p.y, p.size * 1.6, p.color);
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, TAU); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  if (floaters.length) {
    ctx.font = 'bold 26px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    for (const f of floaters) {
      const p = f.t / f.dur;
      ctx.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      const y = f.y - easeOutCubic(p) * 44;
      ctx.strokeStyle = 'rgba(40,20,0,0.75)'; ctx.lineWidth = 6; ctx.strokeText(f.text, f.x, y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, y);
    }
    ctx.globalAlpha = 1;
  }
}
function drawDragItem() {
  if (!drag) return;
  const it = grid[drag.idx];
  if (!it) return;
  ctx.fillStyle = 'rgba(0,30,20,0.28)';
  ctx.beginPath(); ctx.ellipse(drag.wx, drag.wy + 20, 30, 9, 0, 0, TAU); ctx.fill();
  const size = TILE * 1.24;
  ctx.drawImage(sprites[it.type][it.level], drag.wx - size / 2, drag.wy - size / 2 - 20, size, size);
}
function drawBlimp(b) {
  const s = clamp(vw / 650, 0.78, 1.25);
  const by = b.y + Math.sin(time * 1.3 + b.ph) * 7;
  ctx.save();
  ctx.translate(b.x, by);
  ctx.scale(b.dir * s, s);
  ctx.scale(1 + 0.1 * b.squash, 1 - 0.12 * b.squash);
  // tail fins
  const skin = BLIMP_SKINS[blimpSkin()];
  ctx.fillStyle = skin.fin;
  ctx.beginPath(); ctx.moveTo(-70, -8); ctx.lineTo(-104, -38); ctx.lineTo(-96, -4); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-70, 8); ctx.lineTo(-104, 38); ctx.lineTo(-96, 4); ctx.closePath(); ctx.fill();
  // gondola
  ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-14, 30); ctx.lineTo(-12, 42); ctx.moveTo(18, 31); ctx.lineTo(16, 42); ctx.stroke();
  ctx.fillStyle = '#8d5524'; rr(ctx, -24, 40, 46, 18, 7); ctx.fill();
  ctx.fillStyle = '#ffe8a3';
  for (const x of [-12, -1, 10]) { ctx.beginPath(); ctx.arc(x, 49, 3.2, 0, TAU); ctx.fill(); }
  // envelope
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, 0, 92, 40, 0, 0, TAU); ctx.clip();
  ctx.fillStyle = skin.base; ctx.fillRect(-100, -50, 200, 100);
  const cols = skin.cols;
  for (let i = 0; i < 8; i++) { ctx.fillStyle = cols[i % 4]; ctx.fillRect(-92 + i * 25, -50, 13, 100); }
  const sg = ctx.createLinearGradient(0, -40, 0, 40);
  sg.addColorStop(0, 'rgba(255,255,255,0.38)'); sg.addColorStop(0.5, 'rgba(255,255,255,0)'); sg.addColorStop(1, 'rgba(0,40,80,0.3)');
  ctx.fillStyle = sg; ctx.fillRect(-100, -50, 200, 100);
  ctx.restore();
  ctx.strokeStyle = '#0b5d75'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(0, 0, 92, 40, 0, 0, TAU); ctx.stroke();
  // supply-crate emblem
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(30, 0, 15, 0, TAU); ctx.fill();
  ctx.fillStyle = '#c98a4b'; rr(ctx, 22, -7, 16, 14, 2); ctx.fill();
  ctx.strokeStyle = '#7a4a1c'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(38, 0); ctx.stroke();
  // propeller
  ctx.fillStyle = '#444'; ctx.beginPath(); ctx.arc(-96, 2, 3.5, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(60,60,60,0.65)';
  ctx.beginPath(); ctx.ellipse(-97, 2, 3, Math.abs(Math.cos(b.spin)) * 16 + 1, 0, 0, TAU); ctx.fill();
  ctx.restore();

  if (b.hits === 0 && b.age < 9 && !b.done) {
    ctx.font = 'bold 18px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    const ty = by - 56 * s - Math.abs(Math.sin(time * 4)) * 8;
    ctx.strokeStyle = 'rgba(0,60,80,0.8)'; ctx.lineWidth = 5; ctx.strokeText('Tap me!', b.x, ty);
    ctx.fillStyle = '#fff'; ctx.fillText('Tap me!', b.x, ty);
  }
}
/* ------------------------------------------------- sectors, fog, event map */
let fogPuff = null;
let HOME_CX = 0, HOME_CY = 0;
const evDecor = [];
function buildSectors() {
  sectorOf = new Uint8Array(MAPW * MAPH);
  fogLand = new Uint8Array(MAPW * MAPH);
  const cells = [];
  for (let i = 0; i < MAPW * MAPH; i++) if (playable[i]) cells.push(i);
  for (const p of props) if (p.block) cells.push(p.cell);
  let sx = 0, sy = 0;
  for (const i of cells) { const c = cellCenter(i); sx += c.x; sy += c.y; }
  const mx = sx / cells.length, my = sy / cells.length;
  const ds = cells.map((i) => { const c = cellCenter(i); return Math.hypot(c.x - mx, c.y - my); }).sort((a, b) => a - b);
  const Rc = ds[Math.floor(ds.length * 0.5)];
  let hx = 0, hy = 0, hn = 0;
  for (const i of cells) if (playable[i]) { const c = cellCenter(i); if (Math.hypot(c.x - mx, c.y - my) <= Rc) { hx += c.x; hy += c.y; hn++; } }
  HOME_CX = hn ? hx / hn : mx; HOME_CY = hn ? hy / hn : my;
  for (const f of fogCells) f.length = 0;
  const sum = SECTORS.map(() => [0, 0, 0]);
  // rotate the four outer sectors so each ends up with a similar number of playable cells
  const quad = (a) => { a = ((a % TAU) + TAU) % TAU; return 1 + Math.floor(a / (Math.PI / 2)) % 4; };
  let bestOff = 0, bestMin = -1;
  for (let deg = 0; deg < 90; deg += 5) {
    const cnt = [0, 0, 0, 0, 0];
    for (const i of cells) {
      if (!playable[i]) continue;
      const ct = cellCenter(i), dx = ct.x - mx, dy = ct.y - my;
      if (Math.hypot(dx, dy) > Rc) cnt[quad(Math.atan2(dy, dx) - deg * Math.PI / 180)]++;
    }
    const mn = Math.min(cnt[1], cnt[2], cnt[3], cnt[4]);
    if (mn > bestMin) { bestMin = mn; bestOff = deg; }
  }
  for (let r = 0; r < MAPH; r++) {
    for (let c = 0; c < MAPW; c++) {
      const i = r * MAPW + c, ct = cellCenter(i);
      const dx = ct.x - mx, dy = ct.y - my;
      let s = 0;
      if (Math.hypot(dx, dy) > Rc) {
        s = quad(Math.atan2(dy, dx) - bestOff * Math.PI / 180);
      }
      sectorOf[i] = s;
      if (!s) continue;
      let land = false;
      for (let sy2 = r * SUB; sy2 < r * SUB + SUB && !land; sy2++) for (let sx2 = c * SUB; sx2 < c * SUB + SUB; sx2++) if (subAt(landMask, sx2, sy2)) { land = true; break; }
      if (land) {
        fogLand[i] = 1; fogCells[s].push(i);
        sum[s][0] += ct.x; sum[s][1] += ct.y; sum[s][2]++;
      }
    }
  }
  for (let s = 1; s < SECTORS.length; s++) {
    if (!sum[s][2]) { sectorAnchor[s] = null; continue; }
    const ax = sum[s][0] / sum[s][2], ay = sum[s][1] / sum[s][2];
    let best = null, bd = 1e9;
    for (const i of fogCells[s]) {
      const c = cellCenter(i), d = Math.hypot(c.x - ax, c.y - ay) - (playable[i] ? 40 : 0);
      if (d < bd) { bd = d; best = c; }
    }
    sectorAnchor[s] = best;
  }
  // soft cloud puff used for the mist
  fogPuff = document.createElement('canvas');
  fogPuff.width = fogPuff.height = 192;
  const c = fogPuff.getContext('2d');
  const g = c.createRadialGradient(96, 96, 6, 96, 96, 94);
  g.addColorStop(0, 'rgba(244,250,253,0.97)'); g.addColorStop(0.55, 'rgba(226,239,247,0.84)'); g.addColorStop(1, 'rgba(220,235,245,0)');
  c.fillStyle = g; c.fillRect(0, 0, 192, 192);
}
function buildEventMap() {
  evPlayable = new Uint8Array(MAPW * MAPH);
  for (let r = 0; r < MAPH; r++) for (let c = 0; c < MAPW; c++) {
    const dx = (c - 16) / 3.9, dy = (r - 18) / 3.5;
    if (dx * dx + dy * dy <= 1.05) evPlayable[r * MAPW + c] = 1;
  }
  const rng = mulberry32(99);
  evDecor.length = 0;
  const kinds = ['coral', 'coral', 'fan', 'kelp', 'kelp', 'rock', 'urchin', 'coral2'];
  const cols = ['#ff6f91', '#ff9671', '#ffc75f', '#c34a95', '#845ec2', '#f9a1bc'];
  let guard = 0;
  while (evDecor.length < 70 && guard++ < 4000) {
    const ang = rng() * TAU, rad = 4.2 + rng() * 6.5;
    const x = (16.5 + Math.cos(ang) * rad * 1.08) * TILE, y = (18.5 + Math.sin(ang) * rad * 0.98) * TILE;
    const cc = Math.floor(x / TILE), rc = Math.floor(y / TILE);
    if (cc < 1 || rc < 1 || cc >= MAPW - 1 || rc >= MAPH - 1) continue;
    let near = false;
    for (let dr = -1; dr <= 1 && !near; dr++) for (let dc = -1; dc <= 1; dc++) if (evPlayable[(rc + dr) * MAPW + cc + dc]) { near = true; break; }
    if (near) continue;
    evDecor.push({ kind: kinds[Math.floor(rng() * kinds.length)], x, y, col: cols[Math.floor(rng() * cols.length)], sc: 0.7 + rng() * 0.7, ph: rng() * TAU });
  }
  evDecor.sort((a, b) => a.y - b.y);
}

function drawFog(vr, t) {
  for (let s = 1; s < SECTORS.length; s++) {
    const a = P.open[s] ? fogFade[s] : 1;
    if (a <= 0.01) continue;
    ctx.globalAlpha = a;
    for (const i of fogCells[s]) {
      const c = i % MAPW, r = (i / MAPW) | 0;
      const x = c * TILE + TILE / 2, y = r * TILE + TILE / 2;
      if (!inView(vr, x, y, TILE * 2.4)) continue;
      for (let k = 0; k < 2; k++) {
        const h = hash2(c * 3 + k, r * 7 + s);
        const ox = Math.sin(t * 0.25 + h * 30) * TILE * 0.28 + (hash2(c + k * 5, r) - 0.5) * TILE * 0.5;
        const oy = Math.cos(t * 0.21 + h * 17) * TILE * 0.2 + (hash2(c, r + k * 9) - 0.5) * TILE * 0.5;
        const sz = TILE * (1.55 + h * 0.8);
        ctx.drawImage(fogPuff, x + ox - sz / 2, y + oy - sz / 2, sz, sz);
      }
    }
  }
  ctx.globalAlpha = 1;
}
function drawFogBadges(vr) {
  ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  for (let s = 1; s < SECTORS.length; s++) {
    if (P.open[s]) continue;
    const a = sectorAnchor[s];
    if (!a || !inView(vr, a.x, a.y, 200)) continue;
    const d = SECTORS[s], ok = P.level >= d.lvl;
    const k = clamp(0.95 / cam.z, 1, 1.9);
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.scale(k, k);
    ctx.fillStyle = 'rgba(10,62,92,0.88)'; rr(ctx, -78, -30, 156, 60, 16); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 17px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText('\u{1F512} ' + d.name, 0, -6);
    ctx.fillStyle = ok ? '#9be564' : '#ffd166'; ctx.font = 'bold 14px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText('Level ' + d.lvl + '  ·  \u{1FA99} ' + d.coins, 0, 15);
    ctx.restore();
  }
}

// planted things: crops sprout then ripen, trees take a while but keep giving
function drawPlant(it, i, t) {
  const c = cellCenter(i), d = PLANTS[it.plant];
  const p = plantProgress(it), ready = p >= 1;
  const pop = 1 + 0.3 * it.pop;
  const sway = Math.sin(t * 2 + c.x * 0.013) * 0.04;
  ctx.save();
  ctx.translate(c.x, c.y + 24);
  ctx.fillStyle = '#5e4125'; ctx.beginPath(); ctx.ellipse(0, 4, 31, 11, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#7d5834'; ctx.beginPath(); ctx.ellipse(0, 1, 27, 8, 0, 0, TAU); ctx.fill();
  if (d.kind === 'crop') {
    if (!ready) {
      const s = (0.3 + 0.7 * p) * pop;
      ctx.rotate(sway);
      const n = p < 0.35 ? 1 : p < 0.7 ? 2 : 3;
      ctx.lineCap = 'round';
      for (let k = 0; k < n; k++) {
        const ox = n === 1 ? 0 : (k - (n - 1) / 2) * 15, h = (26 + (k === 1 ? 10 : 0)) * s;
        ctx.strokeStyle = '#3f9d4a'; ctx.lineWidth = 3.4;
        ctx.beginPath(); ctx.moveTo(ox, 0); ctx.quadraticCurveTo(ox + 3, -h * 0.5, ox, -h); ctx.stroke();
        ctx.fillStyle = k % 2 ? '#62c06a' : '#4aab55';
        leaf(ctx, ox, -h * 0.55, ox - 12 * s, -h * 0.95, 5 * s); ctx.fill();
        leaf(ctx, ox, -h * 0.4, ox + 12 * s, -h * 0.8, 5 * s); ctx.fill();
      }
    } else {
      const size = TILE * 1.08 * pop, bob = Math.sin(t * 5 + i) * 3;
      ctx.drawImage(sprites[d.item][1], -size / 2, -size * 0.92 + bob, size, size);
    }
  } else {
    const grown = it.h > 0;
    const s = grown ? 1 : 0.32 + 0.68 * p;
    ctx.rotate(sway * 0.5);
    if (it.plant === 'coconut') {
      const w = 240 * 0.46 * s * pop, h = 300 * 0.46 * s * pop;
      ctx.drawImage(palmSprite, -w * 0.44, -h * 0.97, w, h);
      if (ready) {
        ctx.fillStyle = '#6a4120';
        for (const [x, y] of [[8, -0.74], [20, -0.72], [14, -0.64]]) { ctx.beginPath(); ctx.arc(x * s, y * h, 7.5, 0, TAU); ctx.fill(); }
      }
    } else {
      const h = 108 * s * pop;
      ctx.fillStyle = '#7a4f2b'; rr(ctx, -6 * s, -h * 0.55, 12 * s, h * 0.55, 3); ctx.fill();
      for (const [x, y, r, col] of [[-16, -0.72, 24, '#2d8a3d'], [16, -0.72, 24, '#2d8a3d'], [0, -0.88, 28, '#3a9d4a'], [-6, -0.8, 18, '#4cae58']]) {
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x * s, y * h, r * s, 0, TAU); ctx.fill();
      }
      if (ready) {
        ctx.fillStyle = '#ff9f1c';
        for (const [x, y] of [[-20, -0.7], [14, -0.78], [2, -0.95], [22, -0.68]]) { ctx.beginPath(); ctx.arc(x, y * h, 7, 0, TAU); ctx.fill(); }
      }
    }
  }
  ctx.restore();
  if (ready) {
    // "ready" marker bobbing above the plant
    const by = c.y - 58 - Math.abs(Math.sin(t * 4 + i)) * 7;
    ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(c.x, by, 13, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#b8791a'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#7a4a00'; ctx.font = 'bold 18px "Trebuchet MS", system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('!', c.x, by + 6.5);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; rr(ctx, c.x - 24, c.y + 32, 48, 7, 3.5); ctx.fill();
    ctx.fillStyle = '#9be564'; rr(ctx, c.x - 24, c.y + 32, Math.max(7, 48 * p), 7, 3.5); ctx.fill();
  }
}

/* ---- Coral Lagoon scene ---- */
function drawEventBack(t) {
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, EVENT.cols.top); g.addColorStop(1, EVENT.cols.bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
  // light rays
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 5; k++) {
    const x = ((k * 0.27 + 0.1) * vw + Math.sin(t * 0.2 + k) * 40);
    const lg = ctx.createLinearGradient(x, 0, x + vw * 0.18, vh * 0.8);
    lg.addColorStop(0, 'rgba(160,240,255,0.16)'); lg.addColorStop(1, 'rgba(160,240,255,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.moveTo(x - 30, 0); ctx.lineTo(x + 40, 0); ctx.lineTo(x + vw * 0.22, vh * 0.85); ctx.lineTo(x + vw * 0.12, vh * 0.85); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function drawCoral(d, t) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.scale(d.sc, d.sc);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.fillStyle = 'rgba(0,20,40,0.25)'; ctx.beginPath(); ctx.ellipse(0, 6, 34, 9, 0, 0, TAU); ctx.fill();
  if (d.kind === 'kelp') {
    ctx.strokeStyle = '#2f9e6b'; ctx.lineWidth = 9;
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath(); ctx.moveTo(k * 14, 4);
      const sw = Math.sin(t * 1.3 + d.ph + k) * 12;
      ctx.bezierCurveTo(k * 14 + sw, -40, k * 14 - sw, -80, k * 14 + sw * 1.3, -120 + Math.abs(k) * 18);
      ctx.stroke();
    }
  } else if (d.kind === 'fan') {
    ctx.fillStyle = d.col; ctx.beginPath(); ctx.moveTo(0, 4);
    for (let k = 0; k <= 8; k++) { const a = Math.PI * 1.1 + k / 8 * Math.PI * 0.8; ctx.lineTo(Math.cos(a) * 52, -6 + Math.sin(a) * 60); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
    for (let k = 0; k <= 8; k++) { const a = Math.PI * 1.1 + k / 8 * Math.PI * 0.8; ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(Math.cos(a) * 52, -6 + Math.sin(a) * 60); ctx.stroke(); }
  } else if (d.kind === 'rock') {
    ctx.fillStyle = '#5b7083'; ctx.beginPath(); ctx.ellipse(0, -14, 34, 22, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7d93a5'; ctx.beginPath(); ctx.ellipse(-8, -22, 20, 12, -0.2, 0, TAU); ctx.fill();
  } else if (d.kind === 'urchin') {
    ctx.strokeStyle = '#3c1f5c'; ctx.lineWidth = 3;
    for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(Math.cos(a) * 24, -14 + Math.sin(a) * 24); ctx.stroke(); }
    ctx.fillStyle = '#5a2d82'; ctx.beginPath(); ctx.arc(0, -14, 13, 0, TAU); ctx.fill();
  } else {
    ctx.strokeStyle = d.col; ctx.lineWidth = d.kind === 'coral2' ? 11 : 8;
    const arms = [[-30, -62], [-12, -88], [10, -80], [30, -58], [0, -50]];
    for (const [ax, ay] of arms) {
      ctx.beginPath(); ctx.moveTo(0, 2); ctx.quadraticCurveTo(ax * 0.3, ay * 0.5, ax, ay + Math.sin(t * 1.5 + d.ph + ax) * 2); ctx.stroke();
      ctx.fillStyle = d.col; ctx.beginPath(); ctx.arc(ax, ay + Math.sin(t * 1.5 + d.ph + ax) * 2, ctx.lineWidth * 0.62, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}
function drawEventWorld(vr, t) {
  // seabed under the platform: a union of rounded sand tiles
  const c0 = clamp(Math.floor(vr.x0 / TILE) - 1, 0, MAPW - 1), c1 = clamp(Math.floor(vr.x1 / TILE) + 1, 0, MAPW - 1);
  const r0 = clamp(Math.floor(vr.y0 / TILE) - 1, 0, MAPH - 1), r1 = clamp(Math.floor(vr.y1 / TILE) + 1, 0, MAPH - 1);
  ctx.fillStyle = 'rgba(0,25,50,0.28)';
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (evPlayable[r * MAPW + c]) { rr(ctx, c * TILE - 22, r * TILE - 14, TILE + 44, TILE + 44, 40); ctx.fill(); }
  ctx.fillStyle = '#b9a56d';
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (evPlayable[r * MAPW + c]) { rr(ctx, c * TILE - 16, r * TILE - 16, TILE + 32, TILE + 32, 36); ctx.fill(); }
  ctx.fillStyle = '#e6d6a0';
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (evPlayable[r * MAPW + c]) { rr(ctx, c * TILE - 9, r * TILE - 9, TILE + 18, TILE + 18, 30); ctx.fill(); }
  for (const d of evDecor) if (inView(vr, d.x, d.y - 60, 140)) drawCoral(d, t);
  // lazy fish
  for (let k = 0; k < 7; k++) {
    const sp = 40 + k * 9, span = WORLD_W * 0.55, dir = k % 2 ? -1 : 1;
    const x = EV_CX - span / 2 + ((t * sp * dir + k * 400) % span + span) % span;
    const y = EV_CY + (k - 3) * 150 + Math.sin(t * 1.2 + k) * 14;
    if (!inView(vr, x, y, 80)) continue;
    ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
    ctx.fillStyle = ['#ffd166', '#ef476f', '#06d6a0', '#ff9f1c', '#9d4edd', '#4cc9f0', '#f72585'][k];
    ctx.beginPath(); ctx.ellipse(0, 0, 22, 11, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-33, -11 + Math.sin(t * 8 + k) * 3); ctx.lineTo(-33, 11 + Math.sin(t * 8 + k) * 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(10, -3, 3.6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#123'; ctx.beginPath(); ctx.arc(11, -3, 1.7, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
function drawEventFront(t) {
  // drifting bubbles in screen space
  ctx.strokeStyle = 'rgba(210,246,255,0.45)'; ctx.lineWidth = 1.6;
  for (let k = 0; k < 16; k++) {
    const sp = 22 + (k * 7) % 25, per = vh + 60;
    const y = vh + 30 - ((t * sp + k * 97) % per);
    const x = ((k * 0.0731 + 0.05) % 1) * vw + Math.sin(t + k) * 14;
    ctx.beginPath(); ctx.arc(x, y, 3 + (k % 4) * 2, 0, TAU); ctx.stroke();
  }
}
function drawPod(p) {
  const s = clamp(vw / 650, 0.8, 1.2) * 54;
  const wob = 1 + Math.sin(p.age * 5) * 0.03;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(wob, 1 / wob);
  const g = ctx.createRadialGradient(-s * 0.3, -s * 0.35, s * 0.1, 0, 0, s);
  g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(0.7, 'rgba(160,230,255,0.35)'); g.addColorStop(1, 'rgba(120,200,255,0.55)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.5; ctx.stroke();
  const sz = s * 1.15;
  ctx.drawImage(sprites.shell[1], -sz / 2, -sz * 0.52, sz, sz);
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(-s * 0.4, -s * 0.5, s * 0.16, s * 0.09, -0.6, 0, TAU); ctx.fill();
  ctx.restore();
  if (p.age < 8) {
    ctx.font = 'bold 18px "Trebuchet MS", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    const ty = p.y - s - 12 - Math.abs(Math.sin(time * 4)) * 6;
    ctx.strokeStyle = 'rgba(0,50,80,0.85)'; ctx.lineWidth = 5; ctx.strokeText('Pop me!', p.x, ty);
    ctx.fillStyle = '#fff'; ctx.fillText('Pop me!', p.x, ty);
  }
}

function render() {
  const t = time;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (mode === 'event') drawEventBack(t);
  else {
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, '#28c6d8'); g.addColorStop(1, '#0d83b2');
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
  }

  ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (vw / 2 - cam.cx * cam.z), dpr * (vh / 2 - cam.cy * cam.z));
  const vr = visibleRect();
  if (mode === 'event') drawEventWorld(vr, t);
  else { drawWaves(vr, t); drawIsland(vr, t); drawFlora(vr, t); }
  drawPlots(vr, t);
  if (mode === 'island') drawProps(vr, t);
  drawItems(t);
  drawLanding();
  if (mode === 'island') { drawFog(vr, t); drawFogBadges(vr); }
  drawFx();
  drawDragItem();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (mode === 'event') { drawEventFront(t); if (pod) drawPod(pod); }
  else if (blimp) drawBlimp(blimp);
}

/* ---------------------------------------------------------------- input */
const pointers = new Map();
let gesture = null;
let pinch = null;

function startPinch() {
  const pts = Array.from(pointers.values());
  const a = pts[0], b = pts[1];
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: cam.z, wp: screenToWorld(mx, my) };
  drag = null;
  gesture = { mode: 'pinch' };
}
// A tap on the map that was not on an item: plants, tiles, obstacles, fog.
function tapWorld(w) {
  const idx = cellAt(w.x, w.y);
  const it = idx >= 0 ? grid[idx] : null;
  if (it) {
    if (isPlant(it)) harvest(idx);
    return;
  }
  if (idx >= 0 && selected >= 0 && isItem(grid[selected])) { moveItem(selected, idx); return; }
  if (mode === 'island') {
    const p = propAtPoint(w.x, w.y);
    if (p) {
      if (selT && selT.k === 'prop' && selT.p === p) clearSelection(); else selectProp(p);
      return;
    }
  }
  if (idx >= 0) {
    if (mode !== 'island') { if (selected >= 0 || selT) clearSelection(); return; }
    if (selT && selT.k === 'tile' && selT.idx === idx) clearSelection(); else selectTile(idx);
    return;
  }
  if (mode === 'island') {
    const c = Math.floor(w.x / TILE), r = Math.floor(w.y / TILE);
    if (c >= 0 && r >= 0 && c < MAPW && r < MAPH) {
      const i = r * MAPW + c, s = sectorOf[i];
      if (s > 0 && !P.open[s] && fogLand[i]) { openSectorCard(s); return; }
    }
  }
  if (selected >= 0 || selT) clearSelection();
}
function onDown(e) {
  audio.unlock();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  if (pointers.size === 2) { startPinch(); return; }
  if (pointers.size > 2) return;
  const x = e.clientX, y = e.clientY;
  if (mode === 'island' && blimp && blimpHit(x, y)) { hitBlimp(); gesture = { mode: 'blimp' }; return; }
  if (mode === 'event' && pod && podHit(x, y)) { popPod(); gesture = { mode: 'blimp' }; return; }
  const w = screenToWorld(x, y);
  const idx = cellAt(w.x, w.y);
  if (idx >= 0 && isItem(grid[idx])) gesture = { mode: 'pending', idx, sx: x, sy: y, px: x, py: y };
  else gesture = { mode: 'pan', sx: x, sy: y, lx: x, ly: y, moved: false };
  canvas.style.cursor = 'grabbing';
}
function onMove(e) {
  const p = pointers.get(e.pointerId);
  if (!p || !gesture) return;
  p.x = e.clientX; p.y = e.clientY;
  const g = gesture;
  if (g.mode === 'pinch' && pinch && pointers.size >= 2) {
    const pts = Array.from(pointers.values());
    const a = pts[0], b = pts[1];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const [mn, mxz] = zoomLimits();
    cam.z = clamp(pinch.z0 * d / pinch.d0, mn, mxz);
    cam.cx = pinch.wp.x - (mx - vw / 2) / cam.z;
    cam.cy = pinch.wp.y - (my - vh / 2) / cam.z;
    clampCamera();
    return;
  }
  if (g.mode === 'pending') {
    g.px = e.clientX; g.py = e.clientY;
    if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 8) {
      g.mode = 'drag';
      const w = screenToWorld(e.clientX, e.clientY);
      drag = { idx: g.idx, wx: w.x, wy: w.y };
      if (selected !== g.idx) selectCell(g.idx);
    }
    return;
  }
  if (g.mode === 'drag') {
    g.px = e.clientX; g.py = e.clientY;
    const w = screenToWorld(e.clientX, e.clientY);
    if (drag) { drag.wx = w.x; drag.wy = w.y; }
    return;
  }
  if (g.mode === 'pan') {
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 6) return;
    g.moved = true;
    cam.cx -= (e.clientX - g.lx) / cam.z;
    cam.cy -= (e.clientY - g.ly) / cam.z;
    g.lx = e.clientX; g.ly = e.clientY;
    clampCamera();
  }
}
function onUp(e, cancelled) {
  pointers.delete(e.pointerId);
  if (!gesture) return;
  if (gesture.mode === 'pinch') {
    if (pointers.size < 2) { pinch = null; gesture = { mode: 'ignore' }; }
    if (pointers.size === 0) gesture = null;
    return;
  }
  if (gesture.mode === 'ignore') { if (pointers.size === 0) gesture = null; return; }
  const g = gesture;
  gesture = null;
  canvas.style.cursor = 'grab';

  if (g.mode === 'drag') {
    const w = screenToWorld(e.clientX, e.clientY);
    const target = cellAt(w.x, w.y);
    const from = g.idx;
    drag = null;
    if (cancelled) return;
    if (target >= 0 && target !== from && !grid[target]) moveItem(from, target);
    else if (target >= 0 && target !== from) audio.nope();
  } else if (g.mode === 'pending') {
    if (cancelled) return;
    if (selected === g.idx) clearSelection();
    else selectCell(g.idx);
  } else if (g.mode === 'pan') {
    if (cancelled || g.moved) { save(); return; }
    tapWorld(screenToWorld(e.clientX, e.clientY));
  }
}
canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointermove', onMove);
canvas.addEventListener('pointerup', (e) => onUp(e, false));
canvas.addEventListener('pointercancel', (e) => onUp(e, true));
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const w = screenToWorld(e.clientX, e.clientY);
  const [mn, mx] = zoomLimits();
  cam.z = clamp(cam.z * Math.exp(-e.deltaY * 0.0015), mn, mx);
  cam.cx = w.x - (e.clientX - vw / 2) / cam.z;
  cam.cy = w.y - (e.clientY - vh / 2) / cam.z;
  clampCamera();
}, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Audio must be unlocked from a real gesture (iOS is strict about which events count).
for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) {
  window.addEventListener(ev, () => audio.unlock(), { capture: true, passive: true });
}
// Stop iOS Safari from pinch-zooming / bouncing the page.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(ev, (e) => e.preventDefault());
}
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || e.target === canvas) e.preventDefault(); }, { passive: false });

/* ============================================================== economy & progression */
let uiDirty = true;

/* ---- board helpers (the economy always works on the home island's board) ---- */
function countBoard(type, level) {
  let n = 0;
  for (const it of islandGrid) if (isItem(it) && it.type === type && it.level === level) n++;
  return n;
}
function takeBoard(type, level, n) {
  let left = n;
  for (let i = 0; i < islandGrid.length && left > 0; i++) {
    const it = islandGrid[i];
    if (!isItem(it) || it.type !== type || it.level !== level) continue;
    islandGrid[i] = null;
    if (mode === 'island') {
      if (selected === i) selected = -1;
      const c = cellCenter(i);
      burst(c.x, c.y, TYPE_COLOR[type], 8, 140);
    }
    left--;
  }
  dirty = true;
  return left === 0;
}

/* ---- orders ---- */
const FOLK = [['Tomo', '\u{1F9D1}'], ['Lani', '\u{1F469}'], ['Koa', '\u{1F466}'], ['Nalu', '\u{1F9D3}'], ['Hina', '\u{1F467}'], ['Makoa', '\u{1F468}'], ['Leilani', '\u{1F475}']];
let orderSeq = 1;
function availTypes() {
  const t = TYPES.slice();
  if (P.level >= 2) t.push('wood', 'stone');
  if (P.level >= 3) t.push('coconut');
  if (P.level >= 5) t.push('mango');
  return t;
}
function availGoods() {
  const types = availTypes(), out = [];
  for (const s of STATIONS) {
    if (P.level < s.unlock) continue;
    for (const r of s.recipes) if (r.inp.every((i) => types.includes(i.type))) out.push(r.out.good);
  }
  return out;
}
const reqValue = (r) => (r.k === 'item' ? ITEM_VALUE[r.level] * r.n : GOODS[r.good].value * r.n);
function genOrder() {
  const types = availTypes(), goods = availGoods();
  const maxL = P.level < 3 ? 2 : P.level < 6 ? 3 : P.level < 10 ? 4 : 5;
  const count = P.level >= 3 && Math.random() < 0.35 ? 2 : 1;
  const lines = [], used = new Set();
  for (let k = 0; k < count; k++) {
    let r = null;
    for (let tries = 0; tries < 10 && !r; tries++) {
      if (goods.length && Math.random() < 0.4) {
        const g = pick(goods);
        if (!used.has('g' + g)) { used.add('g' + g); r = { k: 'good', good: g, n: randInt(1, P.level < 5 ? 2 : 3) }; }
      } else {
        const t = pick(types);
        const cap = ITEM_DEFS[t].group === 'crop' ? maxL : Math.min(maxL, 3);
        const l = randInt(Math.max(1, cap - 2), cap);
        if (!used.has(t + l)) {
          used.add(t + l);
          r = { k: 'item', type: t, level: l, n: l === 1 ? randInt(3, 4) : l === 2 ? randInt(1, 3) : l === 3 ? randInt(1, 2) : 1 };
        }
      }
    }
    if (r) lines.push(r);
  }
  const value = lines.reduce((s, r) => s + reqValue(r), 0);
  const [name, emoji] = pick(FOLK);
  return { id: orderSeq++, name, emoji, req: lines, coins: Math.round(value * 1.3) + 5, xp: Math.round(value / 2.5) + 4, sp: 2 };
}
const orderSlots = () => Math.min(5, 3 + Math.floor((P.level - 1) / 3));
function ensureOrders() {
  const slots = orderSlots(), now = nowMs();
  let changed = false;
  while (P.orders.length < slots) P.orders.push(null);
  while (P.orderWait.length < slots) P.orderWait.push(0);
  for (let i = 0; i < slots; i++) {
    if (!P.orders[i] && now >= P.orderWait[i]) {
      let o = genOrder();
      for (let t = 0; t < 4 && P.orders.some((q) => q && JSON.stringify(q.req) === JSON.stringify(o.req)); t++) o = genOrder();
      P.orders[i] = o; changed = true;
    }
  }
  if (changed) { uiDirty = true; if (sheetName === 'orders') refreshSheet(); }
}
function reqHave(r) { return r.k === 'item' ? countBoard(r.type, r.level) : (P.goods[r.good] | 0); }
const orderReady = (o) => !!o && o.req.every((r) => reqHave(r) >= r.n);
function consume(reqs) {
  for (const r of reqs) {
    if (r.k === 'item') takeBoard(r.type, r.level, r.n);
    else P.goods[r.good] = (P.goods[r.good] | 0) - r.n;
  }
}
function deliverOrder(i) {
  const o = P.orders[i];
  if (!o) return;
  if (!orderReady(o)) { toast('You do not have everything for that order yet.'); audio.nope(); return; }
  consume(o.req);
  P.orders[i] = null;
  P.orderWait[i] = nowMs() + 6000;
  P.stats.orders++;
  giveReward({ coins: o.coins, xp: o.xp, sp: o.sp }, true);
  toast(o.name + ' paid \u{1FA99}' + o.coins + ' and gave you ' + o.xp + ' XP', 2600);
  audio.coin();
  track('orders', 1);
  uiDirty = true;
  refreshSheet(); refreshHUD(); updateInfo(); save();
}
function dismissOrder(i) {
  if (!P.orders[i]) return;
  P.orders[i] = null;
  P.orderWait[i] = nowMs() + 25000;
  audio.nope();
  refreshSheet(); save();
}

/* ---- workshops ---- */
const stationById = (id) => STATIONS.find((s) => s.id === id);
function recipeOf(st, id) { return st.recipes.find((r) => r.id === id); }
function canMake(r) { return r.inp.every((i) => countBoard(i.type, i.level) >= i.n); }
function startJob(stId, rId) {
  const st = stationById(stId);
  if (!st) return;
  if (P.level < st.unlock) { toast(st.name + ' unlocks at level ' + st.unlock); return; }
  if (P.stations[stId]) { toast('The ' + st.name + ' is busy.'); return; }
  const r = recipeOf(st, rId);
  if (!r) return;
  if (!canMake(r)) { toast('You are missing ingredients on the board.'); audio.nope(); return; }
  for (const i of r.inp) takeBoard(i.type, i.level, i.n);
  P.stations[stId] = { r: rId, t0: nowMs(), dur: r.time * 1000 };
  audio.place();
  toast('Cooking started — back in ' + fmtTime(r.time));
  uiDirty = true; refreshSheet(); updateInfo(); save();
}
function jobDone(job) { return !!job && nowMs() >= job.t0 + job.dur; }
function collectJob(stId) {
  const st = stationById(stId), job = P.stations[stId];
  if (!st || !job || !jobDone(job)) return;
  const r = recipeOf(st, job.r);
  P.goods[r.out.good] = (P.goods[r.out.good] | 0) + r.out.n;
  P.stations[stId] = null;
  P.stats.crafts++;
  addXP(4 + Math.round(r.time / 15));
  toast('Collected ' + r.out.n + ' × ' + GOODS[r.out.good].emoji + ' ' + GOODS[r.out.good].name);
  audio.coin();
  track('craft', 1);
  uiDirty = true; refreshSheet(); refreshHUD(); save();
}
function rushJob(stId) {
  const job = P.stations[stId];
  if (!job || jobDone(job)) return;
  const cost = rushCost((job.t0 + job.dur - nowMs()) / 1000);
  if (P.pearls < cost) { toast('You need \u{1F9AA} ' + cost + ' pearls for that.'); audio.nope(); return; }
  P.pearls -= cost;
  job.t0 = nowMs() - job.dur;
  uiDirty = true; refreshSheet(); refreshHUD(); save();
}
function refillEnergy() {
  regenEnergy();
  if (P.energy >= energyMax(P.level)) { toast('Your energy is already full.'); return; }
  if (P.pearls < PEARL_ENERGY.cost) { toast('You need \u{1F9AA} ' + PEARL_ENERGY.cost + ' pearls.'); audio.nope(); return; }
  P.pearls -= PEARL_ENERGY.cost;
  P.energy = Math.min(energyMax(P.level), P.energy + PEARL_ENERGY.gain);
  audio.coin();
  refreshSheet(); refreshHUD(); save();
}

/* ---- quests ---- */
const curQuest = () => QUESTS[P.quest.i] || null;
function goalHit(g, ev, info) {
  if (g.ev !== ev) return false;
  if (g.lvl && (!info || !(info.level >= g.lvl))) return false;
  if (g.kind && (!info || info.kind !== g.kind)) return false;
  return true;
}
function questStatus() {
  const q = curQuest();
  if (!q) return { s: 'finished' };
  if (P.level < q.min) return { s: 'locked', q };
  if (!P.quest.intro) return { s: 'intro', q };
  const g = q.goal;
  if (g.deliver) {
    const have = countBoard(g.deliver.type, g.deliver.level);
    return { s: have >= g.deliver.n ? 'ready' : 'active', q, prog: Math.min(have, g.deliver.n), need: g.deliver.n };
  }
  return { s: P.quest.prog >= g.n ? 'ready' : 'active', q, prog: Math.min(P.quest.prog, g.n), need: g.n };
}
function questTrack(ev, n, info) {
  const q = curQuest();
  if (!q || P.level < q.min || !P.quest.intro || q.goal.deliver) return;
  if (!goalHit(q.goal, ev, info)) return;
  const was = P.quest.prog >= q.goal.n;
  P.quest.prog = Math.min(q.goal.n, P.quest.prog + n);
  if (!was && P.quest.prog >= q.goal.n) { toast('\u{1F4DC} Quest ready: ' + q.title + ' — open Quests to finish it', 3400); audio.ping(); }
}
function showQuestIntro() {
  const q = curQuest();
  if (!q || P.quest.intro || P.level < q.min) return;
  P.quest.intro = true;                    // set now so it never shows twice
  showDialog({ who: q.who, title: q.title, lines: q.intro, button: 'On it!' });
  uiDirty = true; save();
}
function questAction() {
  const st = questStatus();
  if (st.s === 'intro') { showQuestIntro(); return; }
  if (st.s !== 'ready') return;
  const q = st.q;
  if (q.goal.deliver) {
    const d = q.goal.deliver;
    if (!takeBoard(d.type, d.level, d.n)) return;
  }
  closeSheet();
  showDialog({
    who: q.who, title: q.title + ' — done!', lines: q.outro, button: 'Claim reward',
    onDone: () => {
      const text = giveReward(q.reward, true);
      toast('Quest complete! ' + text, 3600);
      P.quest.i++; P.quest.prog = 0; P.quest.intro = false;
      audio.levelUp();
      uiDirty = true; refreshSheet(); refreshHUD(); save();
    }
  });
}

/* ---- events -> quests + dailies ---- */
function track(ev, n, info) {
  n = n || 1;
  questTrack(ev, n, info);
  dailyTrack(ev, n, info);
  uiDirty = true;
}

/* ---- daily tasks ---- */
function dateKey(ms) { const d = new Date(ms); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function strSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function obstaclesLeft() { return props.filter((p) => p.block && !p.cleared).length; }
function dailyEnsure() {
  const now = nowMs(), key = dateKey(now);
  if (P.daily.key === key && P.daily.tasks.length) return;
  const prev = dateKey(now - 864e5);
  if (P.daily.lastFull !== prev && P.daily.lastFull !== key) P.daily.streak = 0;
  const rng = mulberry32(strSeed(key));
  const pool = DAILY_POOL.filter((t) => (!t.minLevel || P.level >= t.minLevel) && (t.needs !== 'obstacles' || obstaclesLeft() >= 2));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  P.daily.tasks = pool.slice(0, 5).map((t) => {
    const n = t.n[0] + Math.floor(rng() * (t.n[1] - t.n[0] + 1));
    return { id: t.id, ev: t.ev, lvl: t.lvl || 0, n, prog: 0, text: t.text.replace('{n}', n) };
  });
  P.daily.claimed = P.daily.tasks.map(() => false);
  P.daily.chest = false;
  P.daily.key = key;
  uiDirty = true;
  if (sheetName === 'daily') refreshSheet();
}
function dailyTrack(ev, n, info) {
  for (const t of P.daily.tasks) {
    if (t.prog >= t.n) continue;
    if (t.ev !== ev) continue;
    if (t.lvl && (!info || !(info.level >= t.lvl))) continue;
    t.prog = Math.min(t.n, t.prog + n);
  }
}
function dailyReward(i) {
  const b = DAILY_REWARDS[i] || { coins: 1 };
  const r = { sp: 10, xp: 8 };
  if (b.coins) r.coins = 20 + 6 * P.level;
  if (b.energy) r.energy = b.energy;
  if (b.pearls) r.pearls = b.pearls;
  return r;
}
function claimDaily(i) {
  const t = P.daily.tasks[i];
  if (!t || P.daily.claimed[i] || t.prog < t.n) return;
  P.daily.claimed[i] = true;
  giveReward(dailyReward(i));
  uiDirty = true; refreshSheet(); save();
}
const dailyAllClaimed = () => P.daily.tasks.length > 0 && P.daily.claimed.every(Boolean);
function claimChest() {
  if (!dailyAllClaimed() || P.daily.chest) return;
  P.daily.chest = true;
  const now = nowMs(), key = dateKey(now);
  P.daily.streak = P.daily.lastFull === dateKey(now - 864e5) ? P.daily.streak + 1 : 1;
  P.daily.lastFull = key;
  const r = Object.assign({}, DAILY_CHEST);
  r.energy += Math.min(P.daily.streak - 1, 5) * 2;
  giveReward(r);
  audio.levelUp();
  uiDirty = true; refreshSheet(); save();
}

/* ---- season track (free) ---- */
function seasonKey(ms) { const d = new Date(ms); return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }
function seasonEnsure() {
  const key = seasonKey(nowMs());
  if (P.season.key !== key) { P.season = { key, sp: 0, claimed: [] }; uiDirty = true; }
}
function addSP(n) { seasonEnsure(); P.season.sp += n; uiDirty = true; }
function seasonInfo() {
  const d = new Date(nowMs());
  return { name: SEASON_NAMES[d.getMonth()], endsAt: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() };
}
const tierReached = (t) => P.season.sp >= (t + 1) * SEASON_TIER_SP;
function claimTier(t) {
  seasonEnsure();
  if (t < 0 || t >= SEASON_TIERS.length || !tierReached(t) || P.season.claimed[t]) return false;
  P.season.claimed[t] = true;
  giveReward(Object.assign({}, SEASON_TIERS[t], { sp: 0 }));
  uiDirty = true; refreshSheet(); save();
  return true;
}
function claimAllTiers() {
  let n = 0;
  for (let t = 0; t < SEASON_TIERS.length; t++) if (claimTier(t)) n++;
  if (!n) toast('Nothing to claim yet.');
}
function blimpSkin() {
  if (P.season.claimed[SEASON_TIERS.length - 1]) return 'gold';
  if (P.season.claimed[9]) return 'sunset';
  return 'classic';
}

/* ---- driftwood: wood and stone wash ashore now and then ---- */
function driftTick() {
  if (mode !== 'island' || nowMs() < P.driftAt) return;
  P.driftAt = nowMs() + rand(200, 300) * 1000;
  let mats = 0;
  for (const it of islandGrid) if (isItem(it) && ITEM_DEFS[it.type].group === 'material') mats++;
  if (mats >= 6) return;
  const empties = [];
  for (let i = 0; i < grid.length; i++) if (!grid[i] && usable(i)) empties.push(i);
  if (!empties.length) return;
  // prefer a tile near the shore
  let best = -1, bd = 1e9;
  for (let k = 0; k < 8; k++) {
    const i = pick(empties), c = cellCenter(i), d = distAt(c.x, c.y);
    if (d < bd) { bd = d; best = i; }
  }
  const type = Math.random() < 0.6 ? 'wood' : 'stone';
  const c = cellCenter(best);
  const ox = c.x - ISLAND_CX, oy = c.y - ISLAND_CY, ol = Math.hypot(ox, oy) || 1;
  const m = makeItem(type, 1);
  m.land = { x0: c.x + ox / ol * TILE * 2.4, y0: c.y + oy / ol * TILE * 2.4, t: 0, dur: 1.0, style: 'hop' };
  grid[best] = m;
  toast(type === 'wood' ? 'Driftwood washed ashore \u{1FAB5}' : 'A stone washed ashore \u{1FAA8}', 2200);
  dirty = true;
}

/* ---- the event: Coral Lagoon ---- */
function eventInfo() {
  const now = nowMs(), len = EVENT.cycleDays * 864e5, act = EVENT.activeDays * 864e5;
  const n = Math.floor((now - EVENT.epoch) / len);
  const start = EVENT.epoch + n * len;
  const natural = now - start < act;
  const preview = P.ev.preview && now < P.ev.preview;
  const active = natural || !!preview;
  let endsAt = 0;
  if (active) endsAt = natural ? start + act : P.ev.preview;
  return { active, cycle: n, endsAt, nextAt: start + len, preview: !natural && !!preview };
}
function eventEnsure() {
  const info = eventInfo();
  if (P.ev.cycle !== info.cycle) {
    if (mode === 'event') leaveEvent(true);
    P.ev = { cycle: info.cycle, ep: 0, claimed: [], preview: P.ev.preview || 0 };
    eventGrid = newGrid();
    uiDirty = true;
  }
  if (!info.active && mode === 'event') { leaveEvent(true); toast('The Coral Lagoon event has ended. See you next time!', 3600); }
  return info;
}
function addEventPoints(n) {
  if (n <= 0) return;
  const before = P.ev.ep;
  P.ev.ep += n;
  const reached = EVENT.milestones.filter((m) => before < m.ep && P.ev.ep >= m.ep).length;
  if (reached) { toast('\u{1F30A} Event reward unlocked! Open the Event tab to claim it.', 3200); audio.ping(); }
  uiDirty = true; dirty = true;
}
function claimEvent(i) {
  const m = EVENT.milestones[i];
  if (!m || P.ev.claimed[i] || P.ev.ep < m.ep) return;
  P.ev.claimed[i] = true;
  giveReward(m.r);
  uiDirty = true; refreshSheet(); save();
}
function startPreview() {
  P.ev.preview = nowMs() + EVENT.activeDays * 864e5;
  eventEnsure();
  uiDirty = true; refreshSheet(); save();
  toast('Event preview started for ' + EVENT.activeDays + ' days.');
}
function seedEventBoard() {
  const cells = [];
  for (let i = 0; i < evPlayable.length; i++) if (evPlayable[i]) cells.push([Math.hypot(i % MAPW - 16, Math.floor(i / MAPW) - 18) + Math.random(), i]);
  cells.sort((a, b) => a[0] - b[0]);
  let placed = 0;
  for (const [, i] of cells) {
    if (placed >= 8) break;
    grid[i] = makeItem(EVENT_TYPES[placed % EVENT_TYPES.length], 1);
    if (floodGroup(i).length >= 3) { grid[i] = null; continue; }
    placed++;
  }
}
function enterEvent() {
  const info = eventEnsure();
  if (!info.active) { toast('The Coral Lagoon is not open right now.'); return; }
  if (mode === 'event') { closeSheet(); return; }
  closeSheet();
  islandCam = { cx: cam.cx, cy: cam.cy, z: cam.z };
  selected = -1; selT = null; drag = null;
  if (blimp) { blimp = null; audio.hum(false); blimpTimer = rand(30, 70); }
  mode = 'event';
  islandGrid = grid;
  grid = eventGrid;
  if (!grid.some(Boolean) && P.ev.ep === 0) seedEventBoard();
  pod = null; podTimer = 3;
  resetCamera();
  toast('Welcome to the ' + EVENT.name + '! Pop the bubbles.', 3200);
  updateInfo(); refreshHUD(); save();
}
function leaveEvent(silent) {
  if (mode !== 'event') return;
  eventGrid = grid;
  mode = 'island';
  grid = islandGrid;
  selected = -1; selT = null; drag = null; pod = null;
  if (islandCam) { cam.cx = islandCam.cx; cam.cy = islandCam.cy; cam.z = islandCam.z; clampCamera(); } else resetCamera();
  if (!silent) toast('Back on Palm Island');
  closeSheet();
  updateInfo(); refreshHUD(); save();
}
function spawnPod() {
  pod = { x: rand(vw * 0.22, vw * 0.78), y: vh + 70, vy: -clamp(vh / 11, 55, 92), ph: rand(0, TAU), age: 0 };
  audio.blimpArrive();
}
function podHit(x, y) {
  const s = clamp(vw / 650, 0.8, 1.2);
  return !!pod && Math.hypot(x - pod.x, y - pod.y) <= 54 * s;
}
function popPod() {
  const p = pod;
  pod = null;
  podTimer = rand(EVENT.podMin, EVENT.podMax);
  audio.pop();
  const w = screenToWorld(p.x, p.y);
  burst(w.x, w.y, '#bff3ff', 18, 200);
  dropItems(randInt(1, 3), p.x, p.y, EVENT_TYPES, 'bubble');
  addEventPoints(1);
}
function updatePod(dt) {
  pod.age += dt;
  pod.y += pod.vy * dt;
  pod.x += Math.sin(pod.age * 1.7 + pod.ph) * 24 * dt;
  if (pod.y < -90) { pod = null; podTimer = rand(EVENT.podMin, EVENT.podMax) * 0.5; }
}

/* ================================================================ interface */
const $ = (id) => document.getElementById(id);
const sheetEl = $('sheet'), sheetTitle = $('sheet-title'), sheetBody = $('sheet-body');
const modalEl = $('modal'), mPortrait = $('modal-portrait'), mTitle = $('modal-title'), mBody = $('modal-body'), mBtns = $('modal-btns');
const actionsEl = $('actions'), trackerEl = $('tracker');
const confirmEl = $('confirm');
let sheetName = null;
let modalCur = null, modalQueue = [], typeTimer = null;
const modalOpen = () => !!modalCur;

/* ---- small html helpers ---- */
const iconCache = {};
function icon(type, level, cls) {
  const key = type + level;
  if (!(key in iconCache)) {
    try { iconCache[key] = sprites[type][level].toDataURL('image/png'); } catch (e) { iconCache[key] = ''; }
  }
  return iconCache[key]
    ? '<img class="ico ' + (cls || '') + '" alt="" src="' + iconCache[key] + '">'
    : '<span class="ico emo">' + TYPE_EMOJI[type] + '</span>';
}
const barHTML = (frac, attrs) => '<div class="bar"><i style="width:' + Math.round(clamp(frac, 0, 1) * 100) + '%"' + (attrs || '') + '></i></div>';
function rewardText(r) {
  const p = [];
  if (r.coins) p.push('\u{1FA99} ' + r.coins);
  if (r.energy) p.push('⚡ ' + r.energy);
  if (r.pearls) p.push('\u{1F9AA} ' + r.pearls);
  if (r.xp) p.push('✨ ' + r.xp + ' XP');
  if (r.sp) p.push('\u{1F3D6}️ ' + r.sp + ' SP');
  if (r.skin) p.push('\u{1F388} ' + BLIMP_SKINS[r.skin].name + ' blimp');
  return p.join(' &middot; ');
}
function reqChip(r) {
  const have = reqHave(r), ok = have >= r.n;
  const ic = r.k === 'item' ? icon(r.type, r.level) : '<span class="ico emo">' + GOODS[r.good].emoji + '</span>';
  const label = r.k === 'item' ? NAMES[r.type][r.level - 1] : GOODS[r.good].name;
  return '<span class="req ' + (ok ? 'ok' : 'no') + '">' + ic + '<span><b>' + Math.min(have, r.n) + '/' + r.n + '</b><small>' + label + '</small></span></span>';
}
const timerSpan = (until, refresh) => '<span class="tm" data-until="' + until + '"' + (refresh ? ' data-refresh="1"' : '') + '>' + fmtTime((until - nowMs()) / 1000) + '</span>';

/* ---- sheets (bottom panels) ---- */
function renderOrders() {
  let h = '<p class="hint">Sailors pay coins and XP for goods. Deliveries come straight off your board.</p>';
  P.orders.forEach((o, i) => {
    if (!o) {
      h += '<div class="card slot"><div class="face">⏳</div><div class="main"><b>Next customer…</b><small>arrives in ' + timerSpan(P.orderWait[i], true) + '</small></div></div>';
      return;
    }
    const ready = orderReady(o);
    h += '<div class="card order' + (ready ? ' ready' : '') + '"><div class="face">' + o.emoji + '</div><div class="main"><b>' + o.name + '</b><div class="reqs">';
    for (const r of o.req) h += reqChip(r);
    h += '</div><small>\u{1FA99} ' + o.coins + ' &middot; ✨ ' + o.xp + ' XP &middot; \u{1F3D6}️ ' + o.sp + ' SP</small></div>';
    h += '<div class="acts"><button class="btn ' + (ready ? 'primary' : 'disabled') + '" data-act="deliver" data-a="' + i + '">Deliver</button>';
    h += '<button class="btn ghost small" data-act="dismiss" data-a="' + i + '" aria-label="Send away">✖</button></div></div>';
  });
  return h;
}
function renderQuests() {
  const st = questStatus();
  let h = '';
  if (st.s === 'finished') {
    h += '<div class="card"><div class="face">\u{1F3C6}</div><div class="main"><b>Every quest complete!</b><small>New islands and stories are on the way.</small></div></div>';
  } else {
    const q = st.q, who = CAST[q.who];
    h += '<div class="card quest"><div class="face" style="background:' + who.tint + '">' + who.emoji + '</div><div class="main"><b>' + q.title + '</b><small>' + who.name + ' &middot; quest ' + (P.quest.i + 1) + ' of ' + QUESTS.length + '</small>';
    h += '<p>' + q.goal.text + '</p>';
    if (st.s === 'locked') h += '<p class="muted">\u{1F512} Reach level ' + q.min + ' to start this quest.</p>';
    else if (st.s === 'intro') h += '<button class="btn primary" data-act="q-go">Hear the story</button>';
    else {
      h += barHTML(st.prog / st.need) + '<small>' + st.prog + ' / ' + st.need + '</small>';
      if (q.goal.deliver) {
        const d = q.goal.deliver;
        h += '<div class="reqs">' + reqChip({ k: 'item', type: d.type, level: d.level, n: d.n }) + '</div>';
      }
      h += '<div><button class="btn ' + (st.s === 'ready' ? 'primary' : 'disabled') + '" data-act="q-go">' + (st.s === 'ready' ? (q.goal.deliver ? 'Hand them over' : 'Turn in quest') : 'In progress') + '</button></div>';
    }
    h += '<small class="rew">Reward: ' + rewardText(q.reward) + '</small></div></div>';
  }
  if (P.quest.i > 0) {
    h += '<h4>Story so far</h4>';
    for (let i = P.quest.i - 1; i >= 0; i--) h += '<div class="done">✔ ' + QUESTS[i].title + '</div>';
  }
  return h;
}
function renderWork() {
  let h = '<div class="goods">';
  for (const k of Object.keys(GOODS)) h += '<span class="good"><span class="ico emo">' + GOODS[k].emoji + '</span><b>' + (P.goods[k] | 0) + '</b><small>' + GOODS[k].name + '</small></span>';
  h += '</div>';
  for (const st of STATIONS) {
    if (P.level < st.unlock) {
      h += '<div class="card locked"><div class="face">' + st.emoji + '</div><div class="main"><b>' + st.name + '</b><small>\u{1F512} Opens at level ' + st.unlock + '</small></div></div>';
      continue;
    }
    const job = P.stations[st.id];
    h += '<div class="card station"><div class="face">' + st.emoji + '</div><div class="main"><b>' + st.name + '</b>';
    if (job) {
      const r = recipeOf(st, job.r), done = jobDone(job);
      h += '<p>' + (done ? 'Ready: ' : 'Making: ') + r.out.n + ' × ' + GOODS[r.out.good].emoji + ' ' + GOODS[r.out.good].name + '</p>';
      if (done) h += '<button class="btn primary" data-act="collect" data-a="' + st.id + '">Collect</button>';
      else {
        h += barHTML((nowMs() - job.t0) / job.dur, ' data-t0="' + job.t0 + '" data-t1="' + (job.t0 + job.dur) + '"');
        h += '<small>' + timerSpan(job.t0 + job.dur, true) + ' left</small> ';
        h += '<button class="btn small ghost" data-act="rush-job" data-a="' + st.id + '">Rush \u{1F9AA} ' + rushCost((job.t0 + job.dur - nowMs()) / 1000) + '</button>';
      }
    } else {
      for (const r of st.recipes) {
        const ok = canMake(r);
        h += '<div class="recipe"><div class="reqs">';
        for (const i of r.inp) h += reqChip({ k: 'item', type: i.type, level: i.level, n: i.n });
        h += '<span class="arrow">➡</span><span class="req ok"><span class="ico emo">' + GOODS[r.out.good].emoji + '</span><span><b>×' + r.out.n + '</b><small>' + GOODS[r.out.good].name + '</small></span></span></div>';
        h += '<div><small>⏱ ' + fmtTime(r.time) + '</small> <button class="btn small ' + (ok ? 'primary' : 'disabled') + '" data-act="job" data-a="' + st.id + '" data-b="' + r.id + '">Start</button></div></div>';
      }
    }
    h += '</div></div>';
  }
  return h;
}
function renderDaily() {
  dailyEnsure();
  const left = (new Date(nowMs()).setHours(24, 0, 0, 0) - nowMs());
  let h = '<p class="hint">Fresh tasks every day — resets in ' + timerSpan(nowMs() + left, true) + '. Streak: <b>' + P.daily.streak + ' \u{1F525}</b></p>';
  P.daily.tasks.forEach((t, i) => {
    const done = t.prog >= t.n, claimed = P.daily.claimed[i];
    h += '<div class="card"><div class="main"><b>' + t.text + '</b>' + barHTML(t.prog / t.n) + '<small>' + t.prog + ' / ' + t.n + ' &middot; ' + rewardText(dailyReward(i)) + '</small></div>';
    h += '<div class="acts">' + (claimed ? '<span class="tick">✔</span>' : '<button class="btn ' + (done ? 'primary' : 'disabled') + '" data-act="d-claim" data-a="' + i + '">Claim</button>') + '</div></div>';
  });
  const all = dailyAllClaimed();
  h += '<div class="card chest' + (all && !P.daily.chest ? ' ready' : '') + '"><div class="face">\u{1F381}</div><div class="main"><b>Daily chest</b><small>Finish all five: ' + rewardText(DAILY_CHEST) + ' + streak energy</small></div>';
  h += '<div class="acts">' + (P.daily.chest ? '<span class="tick">✔</span>' : '<button class="btn ' + (all ? 'primary' : 'disabled') + '" data-act="d-chest">Open</button>') + '</div></div>';
  return h;
}
function renderSeason() {
  seasonEnsure();
  const si = seasonInfo(), sp = P.season.sp;
  const tier = Math.min(SEASON_TIERS.length, Math.floor(sp / SEASON_TIER_SP));
  let h = '<div class="banner season"><b>' + si.name + ' Season</b><small>ends in ' + timerSpan(si.endsAt, false) + ' &middot; completely free</small>';
  h += barHTML(tier >= SEASON_TIERS.length ? 1 : (sp % SEASON_TIER_SP) / SEASON_TIER_SP) + '<small>' + sp + ' SP &middot; tier ' + tier + '/' + SEASON_TIERS.length + ' &middot; earn SP from dailies, orders, quests and events</small></div>';
  const any = SEASON_TIERS.some((_, t) => tierReached(t) && !P.season.claimed[t]);
  h += '<div class="rowbtn"><button class="btn ' + (any ? 'primary' : 'disabled') + '" data-act="s-all">Claim all</button></div>';
  SEASON_TIERS.forEach((r, t) => {
    const reached = tierReached(t), claimed = P.season.claimed[t];
    h += '<div class="tier' + (reached ? ' reached' : '') + (r.skin ? ' big' : '') + '"><span class="tn">' + (t + 1) + '</span><span class="tr">' + rewardText(r) + '</span>';
    h += claimed ? '<span class="tick">✔</span>' : reached ? '<button class="btn small primary" data-act="s-claim" data-a="' + t + '">Claim</button>' : '<span class="lock">' + ((t + 1) * SEASON_TIER_SP) + ' SP</span>';
    h += '</div>';
  });
  return h;
}
function renderEvent() {
  const info = eventInfo();
  let h = '<div class="banner event"><b>' + EVENT.emoji + ' ' + EVENT.name + '</b>';
  if (info.active) {
    h += '<small>' + (info.preview ? 'Preview — ' : '') + 'ends in ' + timerSpan(info.endsAt, true) + '</small>';
    h += '<p>A sunken reef with its own shells and starfish. Pop floating bubbles, merge 3 to earn event points, and collect rewards.</p>';
    h += mode === 'event'
      ? '<button class="btn primary" data-act="e-leave">Return to Palm Island</button>'
      : '<button class="btn primary" data-act="e-enter">Dive into the lagoon</button>';
  } else {
    h += '<small>Closed right now &middot; returns in ' + timerSpan(info.nextAt, true) + '</small>';
    h += '<p>The lagoon opens for ' + EVENT.activeDays + ' days every ' + EVENT.cycleDays + ' days. Rewards from each visit are free.</p>';
    h += '<button class="btn ghost small" data-act="e-preview">Preview the event now</button>';
  }
  h += '</div>';
  const next = EVENT.milestones.find((m) => m.ep > P.ev.ep);
  h += '<p class="hint">Event points: <b>' + P.ev.ep + '</b>' + (next ? ' &middot; next reward at ' + next.ep : ' &middot; all milestones reached') + '</p>';
  EVENT.milestones.forEach((m, i) => {
    const reached = P.ev.ep >= m.ep, claimed = P.ev.claimed[i];
    h += '<div class="tier' + (reached ? ' reached' : '') + '"><span class="tn">' + m.ep + '</span><span class="tr">' + rewardText(m.r) + '</span>';
    h += claimed ? '<span class="tick">✔</span>' : reached ? '<button class="btn small primary" data-act="e-claim" data-a="' + i + '">Claim</button>' : '<span class="lock">locked</span>';
    h += '</div>';
  });
  return h;
}
function renderEnergy() {
  regenEnergy();
  const max = energyMax(P.level), full = P.energy >= max;
  let h = '<div class="banner"><b>⚡ ' + Math.floor(P.energy) + ' / ' + max + '</b>';
  h += full ? '<small>Full — go use it!</small>' : '<small>Next point in ' + timerSpan(P.energyAt + ENERGY_REGEN * 1000, true) + ' &middot; one every ' + ENERGY_REGEN + 's</small>';
  h += '</div><p class="hint">Energy pays for planting, harvesting trees and clearing obstacles. It refills by itself, completely for free, and levelling up refills it.</p>';
  h += '<div class="rowbtn"><button class="btn ' + (!full && P.pearls >= PEARL_ENERGY.cost ? 'primary' : 'disabled') + '" data-act="refill">+' + PEARL_ENERGY.gain + ' ⚡ for \u{1F9AA} ' + PEARL_ENERGY.cost + '</button></div>';
  h += '<p class="hint">Pearls \u{1F9AA} can only be earned in play — from quests, daily tasks and the season track. Nothing is ever for sale.</p>';
  return h;
}
function renderLevel() {
  const need = xpNeed(P.level);
  let h = '<div class="banner"><b>Level ' + P.level + '</b>' + barHTML(P.xp / need) + '<small>' + P.xp + ' / ' + need + ' XP</small></div>';
  h += '<h4>Coming up</h4>';
  let shown = 0;
  for (let l = P.level + 1; l <= P.level + 12 && shown < 5; l++) {
    const u = unlocksAt(l);
    if (u.length) { shown++; h += '<div class="card"><div class="face">' + l + '</div><div class="main"><small>' + u.join('<br>') + '</small></div></div>'; }
  }
  h += '<p class="hint">Earn XP by merging, harvesting, clearing, crafting and delivering orders.</p>';
  return h;
}
function renderMenu() {
  let h = '<div class="menu">';
  h += '<button class="btn" data-act="music">\u{1F3B5} Music: <b>' + (audio.pref.music ? 'on' : 'off') + '</b></button>';
  h += '<button class="btn" data-act="sfx">\u{1F50A} Sound effects: <b>' + (audio.pref.sfx ? 'on' : 'off') + '</b></button>';
  h += '<button class="btn" data-act="center">\u{1F9ED} Recenter the map</button>';
  h += '</div><h4>Your island</h4><div class="statgrid">';
  const S = P.stats;
  for (const [k, v] of [['Level', P.level], ['Merges', S.merges], ['Five-merge bonuses', S.bonus], ['Harvests', S.harvest], ['Orders filled', S.orders], ['Goods crafted', S.crafts], ['Obstacles cleared', S.cleared], ['Sectors opened', P.open.filter(Boolean).length - 1]]) {
    h += '<div><b>' + v + '</b><small>' + k + '</small></div>';
  }
  h += '</div><p class="hint">Tropic Merge is 100% free: no ads, no purchases, no real-money currency. Everything is earned by playing.</p>';
  h += '<div class="menu"><button class="btn danger" data-act="reset">Start over…</button></div>';
  return h;
}
const SHEETS = {
  orders: { title: '\u{1F4CB} Orders', fn: renderOrders },
  quests: { title: '\u{1F4DC} Quests', fn: renderQuests },
  work:   { title: '\u{1F528} Workshops', fn: renderWork },
  daily:  { title: '\u{1F4C5} Daily tasks', fn: renderDaily },
  season: { title: '\u{1F3D6}️ Season track', fn: renderSeason },
  event:  { title: '\u{1F30A} Events', fn: renderEvent },
  energy: { title: '⚡ Energy', fn: renderEnergy },
  level:  { title: '⭐ Level', fn: renderLevel },
  menu:   { title: '⚙️ Menu', fn: renderMenu }
};
function openSheet(name) {
  if (!SHEETS[name]) return;
  sheetName = name;
  sheetTitle.textContent = SHEETS[name].title;
  sheetEl.hidden = false;
  refreshSheet(true);
  markNav();
}
function closeSheet() {
  sheetName = null;
  sheetEl.hidden = true;
  markNav();
}
function refreshSheet(resetScroll) {
  if (!sheetName) return;
  const top = sheetBody.scrollTop || 0;
  sheetBody.innerHTML = SHEETS[sheetName].fn();
  sheetBody.scrollTop = resetScroll ? 0 : top;
}
// Live countdowns and bars without rebuilding the buttons under the player's finger.
function tickSheet() {
  if (!sheetName || typeof sheetBody.querySelectorAll !== 'function') return;
  const now = nowMs();
  let needRefresh = false;
  sheetBody.querySelectorAll('[data-until]').forEach((el) => {
    const left = (+el.dataset.until - now) / 1000;
    el.textContent = fmtTime(left);
    if (left <= 0 && el.dataset.refresh) needRefresh = true;
  });
  sheetBody.querySelectorAll('[data-t0]').forEach((el) => {
    el.style.width = Math.round(clamp((now - +el.dataset.t0) / (+el.dataset.t1 - +el.dataset.t0), 0, 1) * 100) + '%';
  });
  if (needRefresh) refreshSheet();
}

/* ---- modal + story dialogue ---- */
function showDialog(cfg) { modalQueue.push(Object.assign({ kind: 'dialog', i: 0 }, cfg)); if (!modalCur) nextModal(); }
function showModal(cfg) { modalQueue.push(Object.assign({ kind: 'modal' }, cfg)); if (!modalCur) nextModal(); }
function nextModal() {
  clearInterval(typeTimer);
  modalCur = modalQueue.shift() || null;
  if (!modalCur) { modalEl.hidden = true; return; }
  modalEl.hidden = false;
  renderModal();
}
function closeModal(all) {
  clearInterval(typeTimer);
  if (all) modalQueue.length = 0;
  modalCur = null;
  modalEl.hidden = true;
}
function renderModal() {
  const m = modalCur;
  if (m.kind === 'dialog') {
    const who = m.who === 'island' ? { name: 'Palm Island', emoji: '\u{1F3DD}️', tint: '#1b9aaa' } : CAST[m.who];
    mPortrait.hidden = false;
    mPortrait.textContent = who.emoji;
    mPortrait.style.background = who.tint;
    mTitle.textContent = who.name + (m.title ? ' · ' + m.title : '');
    const text = m.lines[m.i];
    mBody.innerHTML = '<p class="say"></p>';
    const say = () => { const el = mBody.firstChild; return el; };
    m.pos = 0; m.full = false;
    const paint = () => {
      const el = say();
      if (el) el.textContent = text.slice(0, m.pos);
    };
    paint();
    if (typeof setInterval === 'function') {
      typeTimer = setInterval(() => {
        m.pos += 2;
        if (m.pos >= text.length) { m.pos = text.length; m.full = true; clearInterval(typeTimer); }
        paint();
      }, 22);
    }
    const last = m.i >= m.lines.length - 1;
    mBtns.innerHTML = '<button class="mb primary" data-adv="1">' + (last ? (m.button || 'OK') : 'Next ▸') + '</button>';
    m.text = text;
  } else {
    mPortrait.hidden = true;
    mTitle.textContent = m.title || '';
    mBody.innerHTML = m.body || '';
    mBtns.innerHTML = (m.buttons || [{ label: 'OK', cls: 'primary' }]).map((b, i) => '<button class="mb ' + (b.cls || '') + '" data-mb="' + i + '">' + b.label + '</button>').join('');
  }
}
function advanceDialog() {
  const m = modalCur;
  if (!m || m.kind !== 'dialog') return;
  if (!m.full) {                       // first tap finishes the line
    clearInterval(typeTimer);
    m.pos = m.text.length; m.full = true;
    if (mBody.firstChild) mBody.firstChild.textContent = m.text;
    return;
  }
  if (m.i < m.lines.length - 1) { m.i++; renderModal(); return; }
  const done = m.onDone;
  clearInterval(typeTimer);
  modalCur = null;
  if (done) done();
  nextModal();
}
function modalButton(i) {
  const m = modalCur;
  if (!m || m.kind !== 'modal') return;
  const b = (m.buttons || [{ label: 'OK' }])[i];
  if (!b) return;
  if (b.cls === 'disabled') { toast('Not ready for that yet.'); audio.nope(); return; }
  modalCur = null;
  if (b.act) b.act();
  nextModal();
}

/* ---- contextual action chips above the info bar ---- */
let actionsSig = '';
function renderActions() {
  let sig = '', html = '';
  if (selT && selT.k === 'tile' && mode === 'island' && !grid[selT.idx]) {
    sig = 'tile' + selT.idx + ':' + P.level;
    html = '<span class="atitle">Plant here:</span>';
    for (const key of PLANT_ORDER) {
      const d = PLANTS[key], locked = P.level < d.unlock;
      html += '<button class="chip' + (locked ? ' locked' : '') + '" data-act="plant" data-a="' + key + '">' + icon(d.item, 1) +
        '<span><b>' + d.name + '</b><small>' + (locked ? '\u{1F512} level ' + d.unlock : (d.coins ? '\u{1FA99}' + d.coins + ' ' : '') + '⚡' + d.energy + ' &middot; ' + fmtTime(d.grow)) + '</small></span></button>';
    }
  } else if (selT && selT.k === 'plant' && isPlant(grid[selT.idx])) {
    const it = grid[selT.idx], left = plantRemaining(it), d = PLANTS[it.plant];
    sig = 'plant' + selT.idx + ':' + (left > 0) + ':' + (left > 0 ? rushCost(left) : 0);
    if (left > 0) html += '<button class="chip" data-act="rush-plant">\u{1F9AA}<span><b>Grow now</b><small>\u{1F9AA} ' + rushCost(left) + '</small></span></button>';
    else html += '<button class="chip go" data-act="harvest-sel">\u{1F9FA}<span><b>Harvest</b><small>' + (d.pick ? '⚡' + d.pick : 'free') + '</small></span></button>';
    html += '<button class="chip" data-act="uproot">\u{1F5D1}️<span><b>Remove</b><small>' + (d.kind === 'tree' ? 'lose the tree' : 'no refund') + '</small></span></button>';
  } else if (selT && selT.k === 'prop' && !selT.p.cleared) {
    const d = CLEAR[selT.p.kind];
    sig = 'prop' + selT.p.cell + ':' + energyNow();
    html = '<button class="chip go" data-act="clear-prop">\u{1FA93}<span><b>Clear it</b><small>⚡' + d.energy + ' &middot; get ' + d.n + ' ' + NAMES[d.loot][0] + '</small></span></button>';
  }
  if (sig === actionsSig) return;
  actionsSig = sig;
  actionsEl.innerHTML = html;
  actionsEl.hidden = !html;
}

/* ---- hud ---- */
let hudSig = '', navSig = '';
function badgeState() {
  const ev = eventInfo();
  const qs = questStatus().s;
  return {
    orders: P.orders.some(orderReady),
    quests: qs === 'ready' || qs === 'intro',
    work: STATIONS.some((s) => jobDone(P.stations[s.id])),
    daily: P.daily.tasks.some((t, i) => t.prog >= t.n && !P.daily.claimed[i]) || (dailyAllClaimed() && !P.daily.chest),
    season: SEASON_TIERS.some((_, t) => tierReached(t) && !P.season.claimed[t]),
    event: ev.active && EVENT.milestones.some((m, i) => P.ev.ep >= m.ep && !P.ev.claimed[i])
  };
}
const NAV_IDS = ['orders', 'quests', 'work', 'daily', 'season', 'event'];
function markNav() {
  for (const id of NAV_IDS) {
    const el = $('nav-' + id);
    if (el) el.classList.toggle('active', sheetName === id);
  }
}
function refreshHUD() {
  regenEnergy();
  const max = energyMax(P.level);
  const need = xpNeed(P.level);
  const en = Math.floor(P.energy);
  const sub = P.energy < max ? fmtTime((P.energyAt + ENERGY_REGEN * 1000 - nowMs()) / 1000) : 'full';
  const sig = [P.level, P.xp, en, sub, P.coins, P.pearls, mode].join('|');
  if (sig !== hudSig) {
    hudSig = sig;
    $('lv-num').textContent = P.level;
    $('lv-fill').style.width = Math.round(P.xp / need * 100) + '%';
    $('en-val').textContent = en + '/' + max;
    $('en-sub').textContent = sub;
    $('coin-val').textContent = P.coins;
    $('pearl-val').textContent = P.pearls;
  }
  const b = badgeState();
  const bsig = JSON.stringify(b) + '|' + JSON.stringify(questStatus()) + '|' + mode;
  if (bsig !== navSig) {
    navSig = bsig;
    for (const id of NAV_IDS) { const el = $('nav-' + id); if (el) el.classList.toggle('dot', !!b[id]); }
    const nv = $('nav-event');
    if (nv) nv.classList.toggle('closed', !eventInfo().active);
    const st = questStatus();
    let txt = '';
    if (st.s === 'locked') txt = '\u{1F512} Next quest at level ' + st.q.min;
    else if (st.s === 'intro') txt = '❗ ' + st.q.title + ' — tap to start';
    else if (st.s === 'ready') txt = '✅ ' + st.q.title + ' — tap to finish';
    else if (st.s === 'active') txt = CAST[st.q.who].emoji + ' ' + st.q.goal.text + ' (' + st.prog + '/' + st.need + ')';
    trackerEl.textContent = txt;
    trackerEl.hidden = !txt;
    trackerEl.classList.toggle('ready', st.s === 'ready' || st.s === 'intro');
    const ml = $('btn-mode');
    if (ml) ml.hidden = mode !== 'event';
  }
  uiDirty = false;
}

/* ---- click routing ---- */
function doAct(act, a, b) {
  switch (act) {
    case 'nav': if (sheetName === a) closeSheet(); else openSheet(a); break;
    case 'open': openSheet(a); break;
    case 'close': closeSheet(); break;
    case 'deliver': deliverOrder(+a); break;
    case 'dismiss': dismissOrder(+a); break;
    case 'q-go': questAction(); break;
    case 'job': startJob(a, b); break;
    case 'collect': collectJob(a); break;
    case 'rush-job': rushJob(a); break;
    case 'd-claim': claimDaily(+a); break;
    case 'd-chest': claimChest(); break;
    case 's-claim': claimTier(+a); break;
    case 's-all': claimAllTiers(); break;
    case 'e-enter': enterEvent(); break;
    case 'e-leave': leaveEvent(); break;
    case 'e-claim': claimEvent(+a); break;
    case 'e-preview': startPreview(); break;
    case 'refill': refillEnergy(); break;
    case 'music': audio.toggleMusic(); refreshSheet(); save(); break;
    case 'sfx': audio.toggleSfx(); refreshSheet(); save(); break;
    case 'center': resetCamera(); closeSheet(); save(); break;
    case 'reset': closeSheet(); confirmEl.hidden = false; break;
    case 'plant': if (selT && selT.k === 'tile') doPlant(selT.idx, a); break;
    case 'harvest-sel': if (selT && selT.k === 'plant') harvest(selT.idx); break;
    case 'rush-plant': if (selT && selT.k === 'plant') rushPlant(selT.idx); break;
    case 'uproot': if (selT && selT.k === 'plant') uproot(selT.idx); break;
    case 'clear-prop': if (selT && selT.k === 'prop') clearProp(selT.p); break;
    default: break;
  }
  uiDirty = true;
}
function onUiClick(e) {
  const t = e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-act]') : null;
  if (!t) return;
  audio.unlock();
  doAct(t.dataset.act, t.dataset.a, t.dataset.b);
}
for (const id of ['sheet', 'actions', 'nav', 'stats', 'tracker', 'hud']) $(id).addEventListener('click', onUiClick);
sheetEl.addEventListener('click', (e) => { if (e.target === $('sheet-scrim')) closeSheet(); });
modalEl.addEventListener('click', (e) => {
  const t = e.target;
  if (!t || typeof t.closest !== 'function') return;
  audio.unlock();
  const mb = t.closest('[data-mb]');
  if (mb) { modalButton(+mb.dataset.mb); return; }
  if (t.closest('[data-adv]') || t.closest('#modal-body') || t.closest('#modal-portrait')) advanceDialog();
});
document.getElementById('confirm-no').addEventListener('click', () => { confirmEl.hidden = true; });
document.getElementById('confirm-yes').addEventListener('click', () => {
  confirmEl.hidden = true;
  newGame();
  toast('Fresh island ready!');
});

/* lifecycle */
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { save(); audio.suspend(); } else audio.resume();
});
window.addEventListener('pagehide', save);

/* ----------------------------------------------------------------- loop */
let last = 0;
function frame(ts) {
  const dt = Math.min(0.1, (ts - last) / 1000 || 0);
  last = ts;
  update(dt);
  render();
  if (dirty && !gesture) save();
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ boot */
function init() {
  buildSprites();
  palmSprite = buildPalm();
  buildWorld();
  resize();
  if (!load()) newGame();
  updateInfo();
  if (window.__TROPIC_TEST__) {      // lets the headless tests look inside; inert in a browser
    window.__TROPIC_TEST__.api = {
      TILE, MAPW, MAPH, SW, SH, SEED: ISLAND_SEED, props, cellCenter, P, fogCells, SECTORS, QUESTS, PLANTS, STATIONS, EVENT,
      get playable() { return playable; }, get landMask() { return landMask; },
      get grassMask() { return grassMask; }, get cx() { return ISLAND_CX; }, get cy() { return ISLAND_CY; },
      get sectorOf() { return sectorOf; }, get evPlayable() { return evPlayable; },
      get grid() { return grid; }, get islandGrid() { return islandGrid; }, get eventGrid() { return eventGrid; },
      get mode() { return mode; }, get selected() { return selected; }, get selT() { return selT; }, get pod() { return pod; }, get blimp() { return blimp; },
      get modalCur() { return modalCur; }, get sheetName() { return sheetName; }, get cam() { return cam; },
      shift(ms) { timeShift += ms; }, nowMs, usable, doAct, tryMerge, moveItem, harvest, doPlant, clearProp, selectTile, selectProp, propAtPoint, tapWorld,
      track, makeItem, floodGroup, questStatus, questAction, showQuestIntro, advanceDialog, modalButton, openSheet, closeSheet, refreshSheet,
      ensureOrders, deliverOrder, genOrder, countBoard, startJob, collectJob, claimDaily, claimChest, claimTier, dailyEnsure, seasonEnsure, eventInfo, eventEnsure,
      enterEvent, leaveEvent, startPreview, claimEvent, addEventPoints, energyNow, regenEnergy, addXP, giveReward, newGame, save, load, driftTick, popPod, spawnPod,
      unlockSector, openSectorCard, plantProgress, plantReady, uproot, rushPlant, blimpSkin, update, render, renderActions, sheetHTML: (n) => SHEETS[n].fn(), setMode: (m) => { mode = m; }
    };
  }
  requestAnimationFrame(frame);

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is optional */ });
    });
  }
}
init();
})();
