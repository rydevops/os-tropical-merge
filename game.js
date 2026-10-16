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
const TYPES = ['corn', 'carrot', 'wheat'];
const TYPE_EMOJI = { corn: '\u{1F33D}', carrot: '\u{1F955}', wheat: '\u{1F33E}' };
const NAMES = {
  corn:   ['Corn Cob', 'Corn Bunch', 'Corn Bundle', 'Corn Basket', 'Golden Corn Crate'],
  carrot: ['Carrot', 'Carrot Bunch', 'Carrot Bundle', 'Carrot Basket', 'Golden Carrot Crate'],
  wheat:  ['Wheat Stalk', 'Wheat Bunch', 'Wheat Sheaf', 'Wheat Basket', 'Golden Wheat Crate']
};
const TYPE_COLOR = { corn: '#ffd23f', carrot: '#ff8f3a', wheat: '#e8b83c' };

// Blimp event tuning (seconds / counts)
const BLIMP = {
  minDelay: 60, maxDelay: 180,   // time between blimps: 1 to 3 minutes
  firstDelay: 15,                // the very first blimp comes sooner so new players meet it
  minClicks: 3, maxClicks: 7,    // taps needed to empty the blimp
  minDrop: 1, maxDrop: 5         // level-1 items dropped per tap
};

const SAVE_KEY = 'tropicMerge.v2';

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
const BOW_COLOR = { corn: '#d62839', carrot: '#0a9396', wheat: '#6a4c93' };

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
  for (const t of TYPES) {
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
  for (const [kind, n, shore] of [['palm', 7, true], ['bush', 4, false], ['rock', 3, null]]) {
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
        flip: rng() < 0.5 ? -1 : 1, ph: rng() * TAU, block: true
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
}

/* ------------------------------------------------------------- game state */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const infoEl = document.getElementById('infobar');
const toastEl = document.getElementById('toast');

let vw = 0, vh = 0, dpr = 1;
const cam = { cx: ISLAND_CX, cy: ISLAND_CY, z: 1 };

let grid = new Array(MAPW * MAPH).fill(null);
let selected = -1;
let drag = null;
let blimp = null;
let blimpTimer = BLIMP.firstDelay;
let merges = 0;
let time = 0, saveTimer = 0, dirty = false;
const ghosts = [], particles = [], floaters = [];

const makeItem = (type, level) => ({ type, level, pop: 0, land: null });
const idxOf = (c, r) => r * MAPW + c;
// index of the playable cell under a world point, or -1 (ocean, beach edge, trees...)
function cellAt(wx, wy) {
  const c = Math.floor(wx / TILE), r = Math.floor(wy / TILE);
  if (c < 0 || r < 0 || c >= MAPW || r >= MAPH) return -1;
  const i = r * MAPW + c;
  return playable[i] ? i : -1;
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
  if (!it || it.land) return [];
  const seen = new Set([idx]);
  const q = [idx];
  for (let i = 0; i < q.length; i++) {
    for (const n of neighbors(q[i])) {
      if (seen.has(n)) continue;
      const m = grid[n];
      if (m && !m.land && m.type === it.type && m.level === it.level) { seen.add(n); q.push(n); }
    }
  }
  return q;
}

/* camera */
function zoomLimits() { return [Math.max(vw / WORLD_W, vh / WORLD_H, 0.3), 2.0]; }
function defaultZoom() {
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
function resetCamera() { cam.cx = ISLAND_CX; cam.cy = ISLAND_CY; cam.z = defaultZoom(); clampCamera(); }
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
function updateInfo() {
  const it = selected >= 0 ? grid[selected] : null;
  if (it) {
    let html = TYPE_EMOJI[it.type] + ' <b>' + NAMES[it.type][it.level - 1] + '</b> &middot; Lv ' + it.level + '/' + MAX_LEVEL;
    html += it.level < MAX_LEVEL ? ' &middot; match 3 to make ' + NAMES[it.type][it.level] : ' &middot; MAX LEVEL \u2605';
    infoEl.innerHTML = html;
  } else {
    infoEl.textContent = 'Tap an item, then an empty tile \u2014 or drag it. Match 3 to merge!';
  }
}

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
function save() {
  try {
    const items = [];
    for (let i = 0; i < grid.length; i++) if (grid[i]) items.push([i, grid[i].type, grid[i].level]);
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 2, seed: ISLAND_SEED, items,
      cam: { cx: cam.cx, cy: cam.cy, z: cam.z },
      music: audio.pref.music, sfx: audio.pref.sfx,
      blimpTimer: blimp ? rand(30, 90) : blimpTimer,
      merges
    }));
  } catch (e) { /* storage unavailable (private mode etc.) */ }
  dirty = false;
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d || d.v !== 2 || d.seed !== ISLAND_SEED || !Array.isArray(d.items)) return false;
    const g = new Array(MAPW * MAPH).fill(null);
    for (const e of d.items) {
      if (!Array.isArray(e)) continue;
      const idx = e[0] | 0;
      if (idx < 0 || idx >= g.length || !playable[idx] || !TYPES.includes(e[1])) continue;
      g[idx] = makeItem(e[1], clamp(e[2] | 0, 1, MAX_LEVEL));
    }
    grid = g;
    if (d.cam && isFinite(d.cam.cx) && isFinite(d.cam.cy) && isFinite(d.cam.z)) {
      cam.cx = d.cam.cx; cam.cy = d.cam.cy; cam.z = d.cam.z;
    } else resetCamera();
    clampCamera();
    blimpTimer = typeof d.blimpTimer === 'number' ? clamp(d.blimpTimer, 5, BLIMP.maxDelay) : BLIMP.firstDelay;
    merges = d.merges | 0;
    audio.setPrefs(d.music !== false, d.sfx !== false);
    return true;
  } catch (e) { return false; }
}
function newGame() {
  grid = new Array(MAPW * MAPH).fill(null);
  selected = -1; drag = null; blimp = null; merges = 0;
  blimpTimer = BLIMP.firstDelay;
  ghosts.length = particles.length = floaters.length = 0;
  const types = [];
  for (const t of TYPES) for (let i = 0; i < 4; i++) types.push(t);
  for (let i = 0; i < 3; i++) types.push(pick(TYPES));
  shuffle(types);
  // scatter the starting crops over the middle of the island, never forming a ready-made trio
  const pool = [];
  for (let i = 0; i < playable.length; i++) {
    if (!playable[i]) continue;
    const c = cellCenter(i);
    pool.push([Math.hypot(c.x - ISLAND_CX, c.y - ISLAND_CY), i]);
  }
  pool.sort((a, b) => a[0] - b[0]);
  const near = shuffle(pool.slice(0, Math.max(types.length * 3, Math.floor(pool.length * 0.6))).map((p) => p[1]));
  let k = 0;
  for (const t of types) {
    while (k < near.length) {
      const idx = near[k++];
      grid[idx] = makeItem(t, 1);
      if (floodGroup(idx).length >= 3) { grid[idx] = null; continue; }
      break;
    }
  }
  resetCamera();
  save();
  updateInfo();
}

// Called whenever an item settles into a cell (moved, or landed from the blimp).
function tryMerge(idx) {
  for (let guard = 0; guard < 24; guard++) {
    const it = grid[idx];
    if (!it || it.land || it.level >= MAX_LEVEL) return;
    const group = floodGroup(idx);
    if (group.length < 3) return;
    const target = cellCenter(idx);
    for (const j of group.slice(0, 3)) {
      if (j === idx) continue;
      const from = cellCenter(j);
      ghosts.push({ type: it.type, level: it.level, x0: from.x, y0: from.y, x1: target.x, y1: target.y, t: 0, dur: 0.2 });
      grid[j] = null;
      if (selected === j) selected = -1;
    }
    it.level++;
    it.pop = 1;
    merges++;
    burst(target.x, target.y, TYPE_COLOR[it.type], it.level === MAX_LEVEL ? 34 : 16, it.level === MAX_LEVEL ? 260 : 170);
    floatText(target.x, target.y - 52, NAMES[it.type][it.level - 1] + (it.level === MAX_LEVEL ? '!' : ''), it.level === MAX_LEVEL ? '#ffe066' : '#ffffff');
    audio.merge(it.level);
    if (it.level === MAX_LEVEL) toast('Max level reached: ' + NAMES[it.type][it.level - 1] + ' \u{1F389}');
    dirty = true;
  }
}
function moveItem(from, to) {
  const it = grid[from];
  if (!it || it.land || grid[to]) return;
  grid[to] = it; grid[from] = null;
  it.pop = 0.6;
  selected = -1;
  audio.place();
  tryMerge(to);
  updateInfo();
  save();
}
function selectCell(idx) {
  selected = idx;
  audio.select();
  updateInfo();
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
  dropItems(randInt(BLIMP.minDrop, BLIMP.maxDrop), b.x, b.y);
  if (b.hits >= b.need) {
    b.done = true;
    toast('The blimp is empty \u2014 see you next time!', 2600);
  }
}
function dropItems(n, sx, sy) {
  const empties = [];
  for (let i = 0; i < grid.length; i++) if (!grid[i] && playable[i]) empties.push(i);
  if (!empties.length) { toast('The island is full \u2014 merge some crops to make room!'); return; }
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
    const it = makeItem(pick(TYPES), 1);
    it.land = { x0: start.x + rand(-24, 24), y0: start.y, t: -k * 0.14, dur: rand(0.95, 1.25), col: pick(chutes) };
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
function update(dt) {
  time += dt;

  for (let i = 0; i < grid.length; i++) {
    const it = grid[i];
    if (!it) continue;
    if (it.pop > 0) it.pop = Math.max(0, it.pop - dt * 3.2);
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

  if (blimp) updateBlimp(dt);
  else {
    blimpTimer -= dt;
    if (blimpTimer <= 0) spawnBlimp();
  }

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
// the farm plots: one per playable cell, and nowhere else
function drawPlots(vr, t) {
  const c0 = clamp(Math.floor(vr.x0 / TILE), 0, MAPW - 1), c1 = clamp(Math.floor(vr.x1 / TILE), 0, MAPW - 1);
  const r0 = clamp(Math.floor(vr.y0 / TILE), 0, MAPH - 1), r1 = clamp(Math.floor(vr.y1 / TILE), 0, MAPH - 1);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (!playable[r * MAPW + c]) continue;
      const x = c * TILE, y = r * TILE;
      ctx.fillStyle = 'rgba(30,60,20,0.22)'; rr(ctx, x + 3, y + 6, TILE - 6, TILE - 6, 13); ctx.fill();
      ctx.fillStyle = (r + c) & 1 ? '#aa8250' : '#9b7344';
      rr(ctx, x + 3, y + 3, TILE - 6, TILE - 6, 13); ctx.fill();
      ctx.strokeStyle = 'rgba(70,42,16,0.55)'; ctx.lineWidth = 2; ctx.stroke();
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
}
// trees, bushes and rocks. Blocking ones sit on cells that are not playable.
function drawProps(vr, t) {
  for (const p of props) {
    if (!inView(vr, p.x, p.y - 80, 220)) continue;
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
    const x = lerp(L.x0, tc.x, easeInOut(p)) + Math.sin(p * 9) * 14 * (1 - p);
    const y = lerp(L.y0, tc.y, 1 - Math.pow(1 - p, 2));
    const s = lerp(0.55, 1, easeOutCubic(Math.min(1, p * 1.6)));
    const size = TILE * 1.04 * s;
    ctx.globalAlpha = Math.min(1, p * 10);
    // ground shadow grows as it nears
    ctx.fillStyle = 'rgba(0,30,20,' + (0.1 + 0.15 * p) + ')';
    ctx.beginPath(); ctx.ellipse(tc.x, tc.y + 30, 20 * p + 6, 6 * p + 2, 0, 0, TAU); ctx.fill();
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
  ctx.fillStyle = '#ef476f';
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
  ctx.fillStyle = '#fff1c9'; ctx.fillRect(-100, -50, 200, 100);
  const cols = ['#06d6a0', '#ffd166', '#ef476f', '#118ab2'];
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
function render() {
  const t = time;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, '#28c6d8'); g.addColorStop(1, '#0d83b2');
  ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);

  ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (vw / 2 - cam.cx * cam.z), dpr * (vh / 2 - cam.cy * cam.z));
  const vr = visibleRect();
  drawWaves(vr, t);
  drawIsland(vr, t);
  drawFlora(vr, t);
  drawPlots(vr, t);
  drawProps(vr, t);
  drawItems(t);
  drawLanding();
  drawFx();
  drawDragItem();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (blimp) drawBlimp(blimp);
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
function onDown(e) {
  audio.unlock();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  if (pointers.size === 2) { startPinch(); return; }
  if (pointers.size > 2) return;
  const x = e.clientX, y = e.clientY;
  if (blimp && blimpHit(x, y)) { hitBlimp(); gesture = { mode: 'blimp' }; return; }
  const w = screenToWorld(x, y);
  const idx = cellAt(w.x, w.y);
  if (idx >= 0 && grid[idx] && !grid[idx].land) gesture = { mode: 'pending', idx, sx: x, sy: y, px: x, py: y };
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
    if (selected === g.idx) { selected = -1; updateInfo(); }
    else selectCell(g.idx);
  } else if (g.mode === 'pan') {
    if (cancelled || g.moved) { save(); return; }
    const w = screenToWorld(e.clientX, e.clientY);
    const idx = cellAt(w.x, w.y);
    if (idx >= 0 && !grid[idx] && selected >= 0 && grid[selected] && !grid[selected].land) moveItem(selected, idx);
    else if (idx < 0 && selected >= 0) { selected = -1; updateInfo(); }
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

/* HUD buttons */
const btnMusic = document.getElementById('btn-music');
const btnSfx = document.getElementById('btn-sfx');
function refreshButtons() {
  btnMusic.classList.toggle('off', !audio.pref.music);
  btnSfx.classList.toggle('off', !audio.pref.sfx);
}
btnMusic.addEventListener('click', () => { audio.toggleMusic(); refreshButtons(); save(); });
btnSfx.addEventListener('click', () => { audio.toggleSfx(); refreshButtons(); save(); });
document.getElementById('btn-center').addEventListener('click', () => { resetCamera(); save(); });
const confirmEl = document.getElementById('confirm');
document.getElementById('btn-reset').addEventListener('click', () => { confirmEl.hidden = false; });
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
  refreshButtons();
  updateInfo();
  if (window.__TROPIC_TEST__) {      // lets the headless tests look inside; inert in a browser
    window.__TROPIC_TEST__.api = {
      TILE, MAPW, MAPH, SW, SH, SEED: ISLAND_SEED, props, cellCenter,
      get playable() { return playable; }, get landMask() { return landMask; },
      get grassMask() { return grassMask; }, get cx() { return ISLAND_CX; }, get cy() { return ISLAND_CY; }
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
