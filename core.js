(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SerpentCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 1;
  const COLS = 22;
  const ROWS = 14;
  const DIRECTIONS = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 }
  };

  const STAGES = [
    { name: 'Pillow Dusk', short: 'Dusk', subtitle: 'The first stars are waking.', mechanic: 'pillow', colors: ['#17152d', '#403764', '#f4cda5'], names: ['First Yawn', 'Soft Corners', 'Cloud Steps', 'Quiet Constellation', 'Dusk’s Embrace'] },
    { name: 'Windward Dreams', short: 'Wind', subtitle: 'Follow the hush between each breeze.', mechanic: 'wind', colors: ['#12263f', '#32657b', '#bde6dc'], names: ['A Gentle Push', 'Feather Current', 'Kite Strings', 'Crosswind', 'Where Breezes Sleep'] },
    { name: 'Rainy Reverie', short: 'Rain', subtitle: 'Storms can pass without waking you.', mechanic: 'storm', colors: ['#181d36', '#445373', '#d4b8e7'], names: ['Distant Rumble', 'Silver Drizzle', 'Thunder Pillows', 'Rain Dance', 'Eye of the Dream'] },
    { name: 'Deep Dream', short: 'Deep', subtitle: 'Trust the shape you leave behind.', mechanic: 'fog', colors: ['#14142b', '#3d3158', '#ef9eb5'], names: ['Dim Lantern', 'Velvet Dark', 'Memory Trail', 'Sleepwalker', 'Almost Dreaming'] },
    { name: 'The Moon Palace', short: 'Moon', subtitle: 'Every dream has been leading home.', mechanic: 'portal', colors: ['#0b1731', '#293b68', '#f5df9a'], names: ['Moon Door', 'Twin Orbits', 'Star Hall', 'Royal Slumber', 'Goodnight, Serpent'] }
  ];

  function mulberry32(seed) {
    let value = seed >>> 0;
    return function () {
      value += 0x6D2B79F5;
      let t = Math.imul(value ^ value >>> 15, value | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash(text) {
    let value = 2166136261;
    for (const c of String(text)) value = Math.imul(value ^ c.charCodeAt(0), 16777619);
    return value >>> 0;
  }
  const key = p => p.x + ',' + p.y;
  const same = (a, b) => a.x === b.x && a.y === b.y;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function buildLevels() {
    const levels = [];
    for (let stage = 0; stage < 5; stage++) {
      for (let index = 0; index < 5; index++) {
        const id = stage * 5 + index;
        levels.push({
          id, stage, index, name: STAGES[stage].names[index],
          target: 4 + index + stage,
          speed: Math.max(105, 230 - stage * 16 - index * 11),
          wallCount: 2 + index + stage,
          storms: stage >= 2 ? 1 + Math.floor(index / 2) : 0,
          windEvery: stage === 1 ? Math.max(4, 8 - index) : 0,
          fog: stage === 3 ? Math.max(3, 6 - Math.floor(index / 2)) : 0,
          portals: stage === 4,
          wrap: stage === 4 && index >= 3
        });
      }
    }
    return levels;
  }
  const LEVELS = buildLevels();

  function defaultSave() {
    return { version: VERSION, unlocked: 0, levels: {}, sound: true, reducedMotion: false };
  }
  function validateSave(raw) {
    const clean = defaultSave();
    if (!raw || raw.version !== VERSION) return clean;
    clean.sound = raw.sound !== false;
    clean.reducedMotion = raw.reducedMotion === true;
    if (raw.levels && typeof raw.levels === 'object') {
      for (const level of LEVELS) {
        const item = raw.levels[level.id];
        if (!item || typeof item !== 'object') continue;
        clean.levels[level.id] = {
          stars: clamp(Math.floor(Number(item.stars) || 0), 0, 3),
          score: clamp(Math.floor(Number(item.score) || 0), 0, 9999999)
        };
      }
    }
    clean.unlocked = 0;
    while (clean.unlocked < 24 && clean.levels[clean.unlocked]?.stars > 0) clean.unlocked++;
    return clean;
  }

  class Store {
    constructor(storage) {
      this.storage = storage;
      this.data = defaultSave();
      this.warning = '';
      try {
        const raw = storage?.getItem('serpent-dreams-v1');
        if (raw) this.data = validateSave(JSON.parse(raw));
      } catch (_) { this.warning = 'Progress will last for this visit only.'; }
    }
    write() {
      try { this.storage?.setItem('serpent-dreams-v1', JSON.stringify(this.data)); return true; }
      catch (_) { this.warning = 'Progress will last for this visit only.'; return false; }
    }
    record(levelId, stars, score) {
      const old = this.data.levels[levelId] || { stars: 0, score: 0 };
      this.data.levels[levelId] = { stars: Math.max(old.stars, stars), score: Math.max(old.score, score) };
      if (stars > 0) this.data.unlocked = Math.max(this.data.unlocked, Math.min(24, levelId + 1));
      this.write();
    }
  }

  function inside(p) { return p.x >= 0 && p.x < COLS && p.y >= 0 && p.y < ROWS; }
  function manhattan(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

  function connected(start, blocked) {
    const queue = [start], seen = new Set([key(start)]);
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      for (const d of Object.values(DIRECTIONS)) {
        const n = { x: p.x + d.x, y: p.y + d.y }, k = key(n);
        if (!inside(n) || blocked.has(k) || seen.has(k)) continue;
        seen.add(k); queue.push(n);
      }
    }
    return seen;
  }

  function makeWalls(config, rng, start) {
    const walls = [];
    for (let group = 0; group < config.wallCount; group++) {
      for (let attempt = 0; attempt < 80; attempt++) {
        const horizontal = rng() > 0.5;
        const length = 1 + (group + config.stage) % 3;
        const x = 2 + Math.floor(rng() * (COLS - 4));
        const y = 2 + Math.floor(rng() * (ROWS - 4));
        const candidate = [];
        for (let i = 0; i < length; i++) candidate.push({ x: x + (horizontal ? i : 0), y: y + (horizontal ? 0 : i) });
        const combined = [...walls, ...candidate];
        const blocked = new Set(combined.map(key));
        if (candidate.some(p => !inside(p) || manhattan(p, start) < 5) || new Set(combined.map(key)).size !== combined.length) continue;
        if (connected(start, blocked).size < COLS * ROWS - blocked.size - 4) continue;
        walls.push(...candidate); break;
      }
    }
    return walls;
  }

  function findFree(state, minHead = 0) {
    const occupied = new Set([...state.snake, ...state.walls, ...state.storms, ...(state.portals || [])].map(key));
    const candidates = [];
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
      const p = { x, y };
      if (!occupied.has(key(p)) && manhattan(p, state.snake[0]) >= minHead) candidates.push(p);
    }
    return candidates.length ? candidates[Math.floor(state.rng() * candidates.length)] : { x: 1, y: 1 };
  }

  class Game {
    constructor(levelId = 0, seed) {
      this.level = { ...LEVELS[clamp(Math.floor(levelId), 0, 24)] };
      this.rng = mulberry32(seed ?? hash('serpent-' + VERSION + '-' + this.level.id));
      this.state = 'ready';
      this.snake = [{ x: 6, y: 7 }, { x: 5, y: 7 }, { x: 4, y: 7 }, { x: 3, y: 7 }];
      this.previousSnake = this.snake.map(p => ({ ...p }));
      this.direction = { ...DIRECTIONS.right };
      this.pending = { ...this.direction };
      this.walls = makeWalls(this.level, this.rng, this.snake[0]);
      this.storms = [];
      this.portals = [];
      this.collected = 0; this.score = 0; this.lives = 3; this.moves = 0;
      this.growth = 0; this.combo = 0; this.maxCombo = 0; this.moon = null;
      this.events = []; this.result = null; this.invulnerable = 0; this.lastHit = '';
      for (let i = 0; i < this.level.storms; i++) this.storms.push(findFree(this, 7));
      if (this.level.portals) {
        this.portals.push(findFree(this, 6));
        this.portals.push(findFree(this, 6));
      }
      this.dream = findFree(this, 5);
    }
    begin() { if (this.state === 'ready') { this.state = 'playing'; this.emit('start'); } }
    emit(type, extra = {}) { this.events.push({ type, ...extra }); }
    drainEvents() { const events = this.events; this.events = []; return events; }
    setDirection(direction) {
      const next = typeof direction === 'string' ? DIRECTIONS[direction] : direction;
      if (!next || this.state === 'complete' || this.state === 'failed') return false;
      if (next.x === -this.direction.x && next.y === -this.direction.y) return false;
      this.pending = { x: next.x, y: next.y };
      if (this.state === 'ready') this.begin();
      return true;
    }
    pause() { if (this.state === 'playing') this.state = 'paused'; }
    resume() { if (this.state === 'paused') this.state = 'playing'; }
    respawn(reason) {
      this.lives--; this.combo = 0; this.lastHit = reason;
      this.emit('hit', { reason, lives: this.lives });
      if (this.lives <= 0) {
        this.state = 'failed'; this.result = { passed: false, score: this.score, stars: 0, reason };
        return;
      }
      this.snake = [{ x: 6, y: 7 }, { x: 5, y: 7 }, { x: 4, y: 7 }];
      this.previousSnake = this.snake.map(p => ({ ...p }));
      this.direction = { ...DIRECTIONS.right }; this.pending = { ...this.direction };
      this.invulnerable = 4; this.growth = 0;
      if ([...this.walls, ...this.storms].some(p => same(p, this.snake[0]))) {
        const safe = findFree(this, 0); this.snake = [safe]; this.previousSnake = [{ ...safe }];
      }
    }
    shiftWeather() {
      const dx = this.level.index % 2 ? -1 : 1;
      const blocked = new Set([...this.walls, ...this.snake, ...this.portals].map(key));
      const move = p => {
        const n = { x: (p.x + dx + COLS) % COLS, y: p.y };
        return blocked.has(key(n)) ? p : n;
      };
      this.dream = move(this.dream);
      this.storms = this.storms.map(move);
      this.emit('gust', { dx });
    }
    teleport(head) {
      if (this.portals.length !== 2) return head;
      if (same(head, this.portals[0])) return { ...this.portals[1] };
      if (same(head, this.portals[1])) return { ...this.portals[0] };
      return head;
    }
    step() {
      if (this.state === 'ready') this.begin();
      if (this.state !== 'playing') return;
      this.previousSnake = this.snake.map(p => ({ ...p }));
      this.direction = { ...this.pending };
      let head = { x: this.snake[0].x + this.direction.x, y: this.snake[0].y + this.direction.y };
      if (this.level.wrap) {
        head.x = (head.x + COLS) % COLS; head.y = (head.y + ROWS) % ROWS;
      }
      head = this.teleport(head);
      this.moves++; this.invulnerable = Math.max(0, this.invulnerable - 1);
      const tailWillMove = this.growth <= 0;
      const body = tailWillMove ? this.snake.slice(0, -1) : this.snake;
      const hit = !inside(head) ? 'the edge of the dream' : this.walls.some(p => same(p, head)) ? 'a pillow cloud' : body.some(p => same(p, head)) ? 'your own tail' : this.storms.some(p => same(p, head)) ? 'a storm cloud' : '';
      if (hit && this.invulnerable <= 0) { this.respawn(hit); return; }
      this.snake.unshift(head);
      if (this.growth > 0) this.growth--; else this.snake.pop();

      if (this.moon && same(head, this.moon)) {
        const stars = this.lives === 3 ? 3 : this.lives === 2 ? 2 : 1;
        this.score += 500 + this.lives * 100;
        this.state = 'complete'; this.result = { passed: true, score: this.score, stars, moves: this.moves };
        this.emit('complete', { stars }); return;
      }
      if (same(head, this.dream)) {
        this.collected++; this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.growth += 2; this.score += 100 + this.combo * 15;
        this.emit('collect', { collected: this.collected });
        if (this.collected >= this.level.target) {
          this.moon = findFree(this, 7); this.dream = { x: -99, y: -99 }; this.emit('moon');
        } else this.dream = findFree(this, 5);
      } else if (this.moves % 7 === 0) this.combo = Math.max(0, this.combo - 1);
      if (this.level.windEvery && this.moves % this.level.windEvery === 0) this.shiftWeather();
    }
  }

  return { VERSION, COLS, ROWS, DIRECTIONS, STAGES, LEVELS, Game, Store, defaultSave, validateSave, mulberry32, hash, key, same };
});
