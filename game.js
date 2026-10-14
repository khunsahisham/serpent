(function () {
  'use strict';
  const S = globalThis.SerpentCore;
  const $ = id => document.getElementById(id);
  const canvas = $('game-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const panel = $('panel');
  const hud = $('hud');
  const controls = $('controls');
  const announcer = $('announcer');
  const store = new S.Store(globalThis.localStorage);
  let game = null, screen = 'home', selectedStage = Math.floor(store.data.unlocked / 5);
  let board = { x: 0, y: 0, cell: 30, w: 660, h: 420 };
  let dpr = 1, width = 960, height = 640, lastTime = 0, accumulator = 0, clock = 0;
  let pointer = null, bannerTimer = 0, toastTimer = 0, particles = [];
  const ambience = Array.from({ length: 70 }, (_, i) => ({
    x: ((i * 73) % 997) / 997, y: ((i * 131 + 17) % 991) / 991,
    r: .5 + (i % 4) * .28, phase: i * 1.73
  }));

  class Audio {
    constructor() { this.context = null; }
    unlock() {
      if (!store.data.sound) return;
      try { this.context ||= new (globalThis.AudioContext || globalThis.webkitAudioContext)(); if (this.context.state === 'suspended') this.context.resume(); } catch (_) {}
    }
    tone(notes, duration = .18, type = 'sine', volume = .06) {
      this.unlock(); const ac = this.context; if (!ac || !store.data.sound) return;
      const now = ac.currentTime;
      notes.forEach((note, i) => {
        const osc = ac.createOscillator(), gain = ac.createGain(), at = now + i * .065;
        osc.type = type; osc.frequency.setValueAtTime(note, at);
        gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(volume, at + .015); gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        osc.connect(gain).connect(ac.destination); osc.start(at); osc.stop(at + duration + .02);
      });
    }
    play(kind) {
      if (kind === 'collect') this.tone([523, 659, 784], .15, 'sine', .055);
      else if (kind === 'moon') this.tone([392, 523, 659, 784], .32, 'sine', .045);
      else if (kind === 'hit') this.tone([180, 135], .2, 'triangle', .055);
      else if (kind === 'complete') this.tone([392, 494, 587, 784], .48, 'sine', .05);
      else if (kind === 'gust') this.tone([240], .12, 'sine', .018);
      else this.tone([420], .08, 'sine', .025);
    }
  }
  const audio = new Audio();

  const escape = value => String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const stars = count => '<span aria-label="' + count + ' stars">' + '★'.repeat(count) + '☆'.repeat(3 - count) + '</span>';
  const totalStars = () => Object.values(store.data.levels).reduce((sum, level) => sum + (level.stars || 0), 0);

  function show(markup, name = 'menu') {
    screen = name; panel.innerHTML = markup; panel.hidden = false; hud.hidden = true; controls.hidden = true;
    const focus = panel.querySelector('[data-focus]'); requestAnimationFrame(() => focus?.focus());
  }
  function hidePanel() { panel.innerHTML = ''; panel.hidden = true; }
  function home() {
    game = null; particles = []; accumulator = 0;
    const progress = store.data.unlocked > 0;
    show('<main class="surface home-surface"><div class="moon-badge" aria-hidden="true">☾</div><span class="eyebrow">A LITTLE JOURNEY TO SLEEP</span><h1 class="title">Drift. Grow.<br><em>Dream.</em></h1><p class="lede">Guide a gentle serpent through five skies. Gather dreamlight, avoid the clouds, then follow the moon home.</p><button class="primary full" data-action="play" data-level="' + store.data.unlocked + '" data-focus>' + (progress ? 'Continue the dream' : 'Begin the first dream') + ' &nbsp;→</button><div class="button-row"><button class="secondary" data-action="campaign">Choose a dream</button><button class="secondary" data-action="help">How to play</button></div><div class="home-details"><span>25 hand-tuned levels</span><span>mouse · keys · touch</span><span>' + totalStars() + ' stars gathered</span></div>' + (store.warning ? '<p class="result-caption">' + escape(store.warning) + '</p>' : '') + '</main>', 'home');
    announce('Serpent home.');
  }
  function campaign(stage = selectedStage) {
    selectedStage = Math.max(0, Math.min(4, stage));
    const availableStage = Math.floor(store.data.unlocked / 5);
    const stageInfo = S.STAGES[selectedStage];
    const tabs = S.STAGES.map((item, i) => '<button class="stage-tab ' + (i === selectedStage ? 'active' : '') + '" data-action="stage" data-stage="' + i + '" ' + (i > availableStage ? 'disabled' : '') + '><span class="eyebrow">0' + (i + 1) + '</span><br>' + item.short + '</button>').join('');
    const levels = S.LEVELS.filter(level => level.stage === selectedStage).map(level => {
      const record = store.data.levels[level.id], locked = level.id > store.data.unlocked;
      return '<button class="level-button" data-action="play" data-level="' + level.id + '" ' + (locked ? 'disabled' : '') + ' aria-label="' + (locked ? 'Locked. ' : '') + 'Dream ' + (level.index + 1) + ', ' + level.name + '"><span class="level-number">' + (locked ? '·' : level.index + 1) + '</span><span class="level-name">' + escape(level.name) + '</span><span class="level-stars">' + (record ? '★'.repeat(record.stars) + '☆'.repeat(3 - record.stars) : '· · ·') + '</span></button>';
    }).join('');
    show('<main class="surface"><div class="screen-heading"><div><span class="eyebrow">THE DREAM ATLAS · ' + totalStars() + ' STARS</span><h1>Choose a sky.</h1></div><button class="icon-button" data-action="home" aria-label="Back home">×</button></div><div class="stage-tabs">' + tabs + '</div><div class="stage-intro"><strong>' + stageInfo.name + '</strong><p>' + stageInfo.subtitle + '</p></div><div class="level-grid">' + levels + '</div><button class="quiet" data-action="home" data-focus>Back home</button></main>', 'campaign');
  }
  function help() {
    show('<section class="surface"><span class="eyebrow">HOW TO DREAM</span><h1 class="modal-title">Follow the starlight.</h1><div class="tips"><div class="tip"><b>✦</b><span>Collect every dream mote. Each one makes your serpent a little longer.</span></div><div class="tip"><b>☾</b><span>When the moon appears, guide your head into its glow to finish the level.</span></div><div class="tip"><b>↗</b><span>Use arrows or WASD. Swipe the sky, click beside the serpent, or tap the direction buttons.</span></div><div class="tip"><b>●</b><span>You have three rest points. Pillow clouds, storms, edges, and your own tail can wake you.</span></div></div><p class="lede">Later skies add moving wind, storm clouds, sleepy fog, moon portals, and wrapping edges.</p><button class="primary full" data-action="home" data-focus>Ready to drift →</button></section>', 'help');
  }
  function pause() {
    if (!game || game.state !== 'playing') return;
    game.pause();
    show('<section class="surface"><span class="eyebrow">THE SKY IS HOLDING STILL</span><h1 class="modal-title">Rest your eyes.</h1><p class="lede">Your dream is paused exactly where you left it.</p><button class="primary full" data-action="resume" data-focus>Keep dreaming →</button><div class="button-row"><button class="secondary" data-action="retry">Start again</button><button class="secondary" data-action="campaign">Dream atlas</button></div><button class="quiet" data-action="home">Leave this dream</button></section>', 'pause');
  }
  function resume() {
    if (!game) return home();
    game.resume(); screen = 'playing'; hidePanel(); hud.hidden = false; controls.hidden = false; lastTime = performance.now(); canvas.focus({ preventScroll: true });
  }
  function start(levelId) {
    if (levelId > store.data.unlocked) return;
    game = new S.Game(levelId); particles = []; accumulator = 0; lastTime = performance.now();
    screen = 'playing'; hidePanel(); hud.hidden = false; controls.hidden = false; updateHud();
    const stage = S.STAGES[game.level.stage];
    $('level-label').textContent = 'STAGE ' + (game.level.stage + 1) + ' · DREAM ' + (game.level.index + 1);
    $('level-title').textContent = game.level.name;
    document.documentElement.style.setProperty('--gold', stage.colors[2]);
    showBanner(stage.name + ' · ' + mechanicHint(game.level));
    announce(game.level.name + '. Collect ' + game.level.target + ' dreamlights, then find the moon.');
    canvas.focus({ preventScroll: true }); audio.unlock();
  }
  function mechanicHint(level) {
    if (level.stage === 1) return 'the wind moves every ' + level.windEvery + ' steps';
    if (level.stage === 2) return 'storm clouds wake the serpent';
    if (level.stage === 3) return 'your trail fades in the fog';
    if (level.stage === 4) return level.wrap ? 'edges fold into each other' : 'moon doors travel in pairs';
    return 'gather the quiet stars';
  }
  function results() {
    const result = game.result;
    if (result.passed) store.record(game.level.id, result.stars, result.score);
    const final = result.passed && game.level.id === 24;
    const title = result.passed ? final ? 'The sky is finally still.' : 'A softer, sleepier sky.' : 'The dream slipped away.';
    const body = result.passed ? (final ? 'You carried every dream home. The little serpent curls beneath the moon and, at last, closes its eyes.' : 'The moon found you. A new patch of sky is ready whenever you are.') : 'Take the corners gently and leave a little room for your growing tail.';
    const primary = result.passed && !final ? '<button class="primary full" data-action="play" data-level="' + (game.level.id + 1) + '" data-focus>Next dream →</button>' : '<button class="primary full" data-action="retry" data-focus>Dream again →</button>';
    show('<section class="surface"><span class="eyebrow">' + S.STAGES[game.level.stage].short.toUpperCase() + ' · ' + escape(game.level.name) + '</span><h1 class="modal-title">' + title + '</h1>' + (result.passed ? '<div class="result-stars">' + stars(result.stars) + '</div>' : '') + '<div class="result-score">' + result.score.toLocaleString() + '</div><div class="result-caption">DREAM SCORE</div><div class="stat-grid"><div><strong>' + game.collected + '</strong><span>dreamlights</span></div><div><strong>' + game.maxCombo + '</strong><span>best glow</span></div><div><strong>' + game.lives + '</strong><span>rest left</span></div></div><p class="lede">' + body + '</p>' + primary + '<div class="button-row"><button class="secondary" data-action="campaign">Dream atlas</button><button class="secondary" data-action="home">Home</button></div></section>', 'results');
    announce(title + ' Score ' + result.score + '.');
  }

  function showBanner(message) {
    const element = $('level-banner'); element.textContent = message; element.hidden = false;
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { element.hidden = true; }, 2500);
  }
  function toast(message) {
    const element = $('toast'); element.textContent = message; element.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { element.hidden = true; }, 2200);
  }
  function announce(message) { announcer.textContent = ''; requestAnimationFrame(() => { announcer.textContent = message; }); }
  function updateHud() {
    if (!game) return;
    $('dream-label').textContent = game.collected + ' / ' + game.level.target;
    $('dream-fill').style.width = Math.min(100, game.collected / game.level.target * 100) + '%';
    $('lives-label').textContent = '● '.repeat(game.lives).trim() + (game.lives < 3 ? ' ○'.repeat(3 - game.lives) : '');
    $('lives-label').setAttribute('aria-label', game.lives + ' rest points');
  }

  function resize() {
    const rect = canvas.getBoundingClientRect(); dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    width = Math.max(320, Math.round(rect.width)); height = Math.max(320, Math.round(rect.height));
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const padX = width < 600 ? 14 : 38, padTop = width < 700 ? 118 : 96, padBottom = width < 600 ? 15 : 27;
    const cell = Math.floor(Math.min((width - padX * 2) / S.COLS, (height - padTop - padBottom) / S.ROWS));
    board = { cell: Math.max(12, cell), w: Math.max(12, cell) * S.COLS, h: Math.max(12, cell) * S.ROWS };
    board.x = Math.round((width - board.w) / 2); board.y = Math.round(padTop + (height - padTop - padBottom - board.h) / 2);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return ctx;
  }
  function cellCenter(p) { return { x: board.x + (p.x + .5) * board.cell, y: board.y + (p.y + .5) * board.cell }; }
  function mix(a, b, t) { return a + (b - a) * t; }

  function drawBackground(stage, time) {
    const colors = stage.colors;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, colors[0]); gradient.addColorStop(.56, colors[1]); gradient.addColorStop(1, '#111128');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(width * .75, height * .2, 0, width * .75, height * .2, width * .58);
    glow.addColorStop(0, colors[2] + '2c'); glow.addColorStop(1, colors[2] + '00'); ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    for (const star of ambience) {
      const alpha = .13 + (Math.sin(time * .0012 + star.phase) + 1) * .12;
      ctx.fillStyle = 'rgba(255,246,218,' + alpha + ')'; ctx.beginPath(); ctx.arc(star.x * width, star.y * height, star.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 1;
    for (let x = 0; x <= S.COLS; x++) { ctx.beginPath(); ctx.moveTo(board.x + x * board.cell, board.y); ctx.lineTo(board.x + x * board.cell, board.y + board.h); ctx.stroke(); }
    for (let y = 0; y <= S.ROWS; y++) { ctx.beginPath(); ctx.moveTo(board.x, board.y + y * board.cell); ctx.lineTo(board.x + board.w, board.y + y * board.cell); ctx.stroke(); }
    roundRect(board.x - 2, board.y - 2, board.w + 4, board.h + 4, 17); ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.stroke();
  }

  function drawCloud(p, storm = false, drift = 0) {
    const c = cellCenter(p), u = board.cell;
    ctx.save(); ctx.translate(c.x + drift, c.y);
    ctx.fillStyle = storm ? '#5b5875' : '#d8d0e4';
    ctx.shadowColor = storm ? 'rgba(15,14,38,.55)' : 'rgba(255,255,255,.13)'; ctx.shadowBlur = u * .45;
    ctx.beginPath(); ctx.arc(-u * .22, u * .05, u * .24, 0, Math.PI * 2); ctx.arc(u * .05, -u * .08, u * .3, 0, Math.PI * 2); ctx.arc(u * .29, u * .08, u * .2, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(-u * .3, u * .02, u * .62, u * .2);
    if (storm) { ctx.strokeStyle = '#dfc778'; ctx.lineWidth = Math.max(1.5, u * .06); ctx.beginPath(); ctx.moveTo(-u*.04,u*.18); ctx.lineTo(-u*.15,u*.46); ctx.lineTo(u*.05,u*.38); ctx.lineTo(-u*.02,u*.61); ctx.stroke(); }
    ctx.restore();
  }

  function drawDream(p, time) {
    if (p.x < 0) return;
    const c = cellCenter(p), pulse = 1 + Math.sin(time * .005) * .11, r = board.cell * .24 * pulse;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(time * .0005);
    ctx.shadowColor = '#f8e5a6'; ctx.shadowBlur = board.cell * .55; ctx.fillStyle = '#fff2bd';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 ? r * .42 : r; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function drawMoon(p, time) {
    if (!p) return;
    const c = cellCenter(p), r = board.cell * (.36 + Math.sin(time * .003) * .025);
    ctx.save(); ctx.translate(c.x, c.y); ctx.shadowColor = '#ffe7a8'; ctx.shadowBlur = board.cell * .9; ctx.fillStyle = '#ffe8ad';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = S.STAGES[game.level.stage].colors[1]; ctx.beginPath(); ctx.arc(r * .36, -r * .18, r * .84, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,244,198,.32)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r * 1.46, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }

  function drawPortals(time) {
    game.portals.forEach((p, i) => {
      const c = cellCenter(p), r = board.cell * .31;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate((i ? -1 : 1) * time * .001);
      ctx.strokeStyle = i ? '#a9d9cc' : '#d5acd9'; ctx.lineWidth = Math.max(2, board.cell * .09); ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = board.cell * .45;
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * .72, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    });
  }

  function drawSnake(alpha, time) {
    const snake = game.snake, previous = game.previousSnake;
    for (let i = snake.length - 1; i >= 0; i--) {
      const current = snake[i], prior = previous[Math.min(i, previous.length - 1)] || current;
      const wrapJump = Math.abs(current.x - prior.x) > 2 || Math.abs(current.y - prior.y) > 2;
      const x = wrapJump ? current.x : mix(prior.x, current.x, alpha), y = wrapJump ? current.y : mix(prior.y, current.y, alpha);
      if (game.level.fog && i > game.level.fog && i < snake.length - 1) continue;
      const c = cellCenter({ x, y }), taper = Math.max(.54, 1 - i / Math.max(12, snake.length) * .32), r = board.cell * .39 * taper;
      ctx.save(); ctx.translate(c.x, c.y);
      const body = ctx.createRadialGradient(-r*.25, -r*.3, r*.05, 0, 0, r);
      body.addColorStop(0, i === 0 ? '#f6e7b9' : '#b8d9c7'); body.addColorStop(1, i === 0 ? '#c7a6ca' : '#6e9a8c');
      ctx.fillStyle = body; ctx.shadowColor = 'rgba(5,8,25,.26)'; ctx.shadowBlur = r * .55;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      if (i % 3 === 2) { ctx.fillStyle = 'rgba(255,245,206,.23)'; ctx.beginPath(); ctx.arc(-r*.22, -r*.19, r*.22, 0, Math.PI*2); ctx.fill(); }
      if (i === 0) {
        const d = game.direction, side = { x: -d.y, y: d.x };
        for (const s of [-1, 1]) {
          const ex = d.x*r*.28 + side.x*s*r*.35, ey = d.y*r*.28 + side.y*s*r*.35;
          ctx.fillStyle = '#27223c'; ctx.beginPath(); ctx.arc(ex, ey, Math.max(1.5,r*.09), 0, Math.PI*2); ctx.fill();
        }
        ctx.strokeStyle = '#745d82'; ctx.lineWidth = Math.max(1, r*.06); ctx.beginPath(); ctx.arc(-d.y*r*.06 + d.x*r*.31, d.x*r*.06 + d.y*r*.31, r*.15, .15, Math.PI-.15); ctx.stroke();
      }
      ctx.restore();
    }
    if (game.invulnerable > 0 && Math.floor(time / 90) % 2) {
      const c = cellCenter(snake[0]); ctx.strokeStyle = 'rgba(255,238,180,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c.x, c.y, board.cell*.57, 0, Math.PI*2); ctx.stroke();
    }
  }

  function drawWind(time) {
    if (game.level.stage !== 1) return;
    ctx.save(); ctx.strokeStyle = 'rgba(191,230,220,.14)'; ctx.lineWidth = 1.5; ctx.setLineDash([board.cell*.3, board.cell*.7]); ctx.lineDashOffset = -time*.02 * (game.level.index % 2 ? -1 : 1);
    for (let row = 2; row < S.ROWS; row += 4) { ctx.beginPath(); ctx.moveTo(board.x, board.y + row*board.cell); ctx.lineTo(board.x+board.w, board.y+row*board.cell); ctx.stroke(); }
    ctx.restore();
  }

  function drawParticles(dt) {
    for (const p of particles) { p.t -= dt; p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 28*dt; const a = Math.max(0,p.t/p.life); ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.r*a,0,Math.PI*2); ctx.fill(); }
    ctx.globalAlpha = 1; particles = particles.filter(p => p.t > 0);
  }
  function burst(point, color, count = 16) {
    const c = cellCenter(point);
    for (let i=0;i<count;i++) { const a=Math.PI*2*i/count + Math.random()*.3, speed=25+Math.random()*80, life=.45+Math.random()*.45; particles.push({x:c.x,y:c.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r:1.5+Math.random()*3,t:life,life,color}); }
  }

  function render(time, dt) {
    const stage = game ? S.STAGES[game.level.stage] : S.STAGES[0]; drawBackground(stage, time);
    if (!game) return;
    drawWind(time); drawPortals(time);
    for (const wall of game.walls) drawCloud(wall, false);
    for (const storm of game.storms) drawCloud(storm, true, Math.sin(time*.002 + storm.y)*board.cell*.04);
    drawDream(game.dream, time); drawMoon(game.moon, time);
    const alpha = game.state === 'playing' ? Math.min(1, accumulator / (game.level.speed / 1000)) : 1;
    drawSnake(alpha, time); drawParticles(dt);
    if (game.level.fog) {
      const head = cellCenter(game.snake[0]), radius = board.cell * (game.level.fog + 1.9);
      const fog = ctx.createRadialGradient(head.x, head.y, radius*.3, head.x, head.y, radius);
      fog.addColorStop(0, 'rgba(15,12,35,0)'); fog.addColorStop(.72, 'rgba(15,12,35,.16)'); fog.addColorStop(1, 'rgba(11,9,29,.65)');
      ctx.fillStyle = fog; ctx.fillRect(board.x, board.y, board.w, board.h);
    }
  }

  function processEvents() {
    for (const event of game.drainEvents()) {
      if (event.type === 'collect') { burst(game.snake[0], '#f8e5a6', 18); audio.play('collect'); updateHud(); announce('Dreamlight ' + game.collected + ' of ' + game.level.target + '.'); }
      else if (event.type === 'moon') { audio.play('moon'); showBanner('The moon is awake · find its glow'); announce('All dreamlight gathered. Find the moon.'); }
      else if (event.type === 'hit') { burst(game.snake[0], '#d98da6', 20); audio.play('hit'); updateHud(); toast('Woken by ' + event.reason + ' · ' + event.lives + ' rest left'); announce('You touched ' + event.reason + '. ' + event.lives + ' rest points left.'); }
      else if (event.type === 'gust') { audio.play('gust'); toast(event.dx > 0 ? 'A breeze carries the sky →' : '← A breeze carries the sky'); }
      else if (event.type === 'complete') {
        const completedGame = game;
        burst(game.snake[0], '#ffe9a8', 34); audio.play('complete');
        setTimeout(() => { if (game === completedGame && game.state === 'complete' && screen === 'playing') results(); }, store.data.reducedMotion ? 100 : 700);
      }
    }
  }

  function loop(time) {
    const rawDt = lastTime ? Math.min(.1, (time - lastTime) / 1000) : 0; lastTime = time; clock += rawDt;
    if (screen === 'playing' && game?.state === 'playing') {
      accumulator += rawDt;
      const interval = game.level.speed / 1000;
      let steps = 0;
      while (accumulator >= interval && steps++ < 3 && game.state === 'playing') { accumulator -= interval; game.step(); processEvents(); }
    }
    render(time, rawDt); requestAnimationFrame(loop);
  }

  function directionFromPoint(clientX, clientY) {
    if (!game) return null;
    const rect = canvas.getBoundingClientRect(), head = cellCenter(game.snake[0]);
    const x = (clientX - rect.left) * width / rect.width - head.x, y = (clientY - rect.top) * height / rect.height - head.y;
    if (Math.abs(x) < 5 && Math.abs(y) < 5) return null;
    return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
  }
  function steer(direction) {
    if (screen !== 'playing' || !game) return;
    if (game.setDirection(direction)) { audio.unlock(); document.querySelector('[data-direction="' + direction + '"]')?.classList.add('pressed'); setTimeout(() => document.querySelector('[data-direction="' + direction + '"]')?.classList.remove('pressed'), 90); }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (button && !button.disabled) {
      audio.unlock(); const action = button.dataset.action;
      if (action === 'home') home();
      else if (action === 'campaign') campaign();
      else if (action === 'stage') campaign(Number(button.dataset.stage));
      else if (action === 'help') help();
      else if (action === 'play') start(Number(button.dataset.level));
      else if (action === 'resume') resume();
      else if (action === 'retry') start(game?.level.id || 0);
      return;
    }
    const control = event.target.closest('[data-direction]'); if (control) steer(control.dataset.direction);
  });

  document.addEventListener('keydown', event => {
    const map = { ArrowUp:'up', KeyW:'up', ArrowDown:'down', KeyS:'down', ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right' };
    if (map[event.code] && screen === 'playing') { event.preventDefault(); steer(map[event.code]); }
    else if (event.code === 'Escape' || event.code === 'KeyP') { event.preventDefault(); if (screen === 'playing') pause(); else if (screen === 'pause') resume(); }
    else if (event.code === 'Enter' && screen === 'playing' && game?.state === 'ready') game.begin();
  });

  canvas.addEventListener('pointerdown', event => {
    if (screen !== 'playing' || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault(); pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); audio.unlock();
  });
  canvas.addEventListener('pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    event.preventDefault(); const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (Math.hypot(dx,dy) > 22) steer(Math.abs(dx)>Math.abs(dy) ? (dx>0?'right':'left') : (dy>0?'down':'up'));
    else { const direction = directionFromPoint(event.clientX, event.clientY); if (direction) steer(direction); }
    pointer = null;
  });
  canvas.addEventListener('pointercancel', () => { pointer = null; });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  $('pause-button').addEventListener('click', pause);
  $('home-button').addEventListener('click', home);
  $('help-button').addEventListener('click', help);
  $('sound-button').addEventListener('click', () => { store.data.sound = !store.data.sound; store.write(); $('sound-button').textContent = store.data.sound ? '♫' : '×'; $('sound-button').setAttribute('aria-label', store.data.sound ? 'Mute sound' : 'Turn on sound'); if (store.data.sound) audio.play('tap'); });
  globalThis.addEventListener('resize', resize);
  globalThis.visualViewport?.addEventListener('resize', resize);
  globalThis.addEventListener('blur', () => { if (screen === 'playing') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'playing') pause(); });

  $('sound-button').textContent = store.data.sound ? '♫' : '×';
  resize(); home(); requestAnimationFrame(loop);
})();
