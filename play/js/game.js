/* Padel Pong — game loop, physics, input, effects and HUD. */
(function () {
  'use strict';
  const PP = window.PP;
  const Font = PP.Font;
  const Sprites = PP.Sprites;
  const Sound = PP.Audio;
  const sfx = PP.Audio.sfx;

  // ------------------------------------------------------------------ tuning
  const G = 9.8;
  const BALL_R = 0.08;
  const GLASS_E = 0.62;        // how lively the glass walls are
  const EXAG = 1.45;           // arcade-sized players
  const REACH = 1.3;           // racket reach from the body (m)
  const REACH_H = 2.45;        // highest ball you can still smash (m)
  const PB = { x0: -4.6, x1: 4.6, z0: -9.7, z1: -0.7 };
  const OB = { x0: -4.7, x1: 4.7, z0: 0.8, z1: 9.8 };
  const PLAYER_HOME = { x: 0, z: -8.2 };
  const OPP_HOME = { x: 0, z: 8.2 };
  const DRAG_GAIN = 1.15;      // finger travel -> player travel (touch)
  const MARGIN = 4;            // off-screen pixels rendered for screen shake
  const BEST_KEY = 'cuptc-padel-best';
  const MILESTONES = [10, 25, 50, 75, 100];
  const CYCLE = ['#ffffff', '#e9ff3b', '#85b4a0', '#ff7eb6', '#7fd6ff', '#ffb86b'];
  const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ------------------------------------------------------------------ DOM
  const $ = (id) => document.getElementById(id);
  const canvas = $('screen');
  const ctx = canvas.getContext('2d');
  const scr = { title: $('scr-title'), pause: $('scr-pause'), over: $('scr-over') };
  const btnSound = $('btn-sound');
  const btnPause = $('btn-pause');

  // ------------------------------------------------------------------ state
  let W = 0, H = 0, PX = 1, dpr = 1, scene = null;
  let hudTop = 0;
  let clouds = [];

  function loadBest() {
    try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) {
    try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* ignore */ }
  }

  const state = {
    mode: 'attract', // attract | countdown | play | missed | over
    paused: false,
    score: 0,
    best: loadBest(),
    speed: 1.12,
    level: 0,
    time: 0,
    hitstop: 0,
    slowmo: 1,
    countdown: 0,
    lastCount: 0,
    missTimer: 0,
    missReason: '',
    feedTimer: 1.0,
    scorePop: 0,
    newBest: false,
    cheerT: 0
  };

  function makeFig(who, home) {
    return {
      who: who, x: home.x, z: home.z, vx: 0, vz: 0, tx: home.x, tz: home.z,
      runPhase: 0, idle: Math.random(), swing: null, swingT: 0, prep: null,
      plan: null, stretched: false, maxV: 7, cheer: 0
    };
  }
  const player = makeFig('player', PLAYER_HOME);
  const opp = makeFig('opp', OPP_HOME);

  const ball = {
    x: 0, y: 1, z: 8, vx: 0, vy: 0, vz: 0,
    side: 1, bounces: 0, wallHits: 0, lastHit: 'opp', bV: 0.72, bH: 0.86,
    live: false, visible: false
  };
  const trail = [];
  let marker = null;

  const fx = { parts: [], rings: [], labels: [], banner: null, shakeAmp: 0, shakeT: 0, flash: 0 };

  // ------------------------------------------------------------------ sizing
  function readSafeArea() {
    const cs = getComputedStyle($('safe-probe'));
    return {
      top: parseFloat(cs.paddingTop) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0
    };
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const vw = window.innerWidth, vh = window.innerHeight;
    const dw = Math.round(vw * dpr), dh = Math.round(vh * dpr);
    PX = Math.max(1, Math.round(Math.min(dw / 216, dh / 290)));
    W = Math.ceil(dw / PX);
    H = Math.ceil(dh / PX);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = (W * PX) / dpr + 'px';
    canvas.style.height = (H * PX) / dpr + 'px';
    canvas.style.left = -Math.floor((W * PX - dw) / 2) / dpr + 'px';
    canvas.style.top = -Math.floor((H * PX - dh) / 2) / dpr + 'px';
    document.documentElement.style.setProperty('--px', PX / dpr + 'px');

    const safe = readSafeArea();
    const safeTop = Math.ceil((safe.top * dpr) / PX);
    const safeBottom = Math.ceil((safe.bottom * dpr) / PX);
    hudTop = safeTop + 5;
    const big = W >= 400 ? 4 : 3;
    scene = PP.Scene.build(W, H, {
      top: hudTop + 7 * big + 16,
      bottom: safeBottom + 2,
      margin: MARGIN
    });
    Sprites.clear();
    makeClouds();
  }

  // ------------------------------------------------------------------ clouds
  function makeCloud(w) {
    const h = Math.max(6, Math.round(w * 0.38));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const bumps = [];
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const bx = lerp(w * 0.22, w * 0.78, n === 1 ? 0.5 : i / (n - 1)) + rand(-2, 2);
      bumps.push([bx, h - rand(h * 0.35, h * 0.55), rand(h * 0.3, h * 0.5)]);
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let inside = y >= h - Math.max(2, h * 0.28) && x > w * 0.1 && x < w * 0.9;
        for (const b of bumps) {
          const dx = x + 0.5 - b[0], dy = y + 0.5 - b[1];
          if (dx * dx + dy * dy <= b[2] * b[2]) inside = true;
        }
        if (!inside) continue;
        g.fillStyle = y >= h - 2 ? '#f39ab8' : y < h * 0.35 ? '#fff1f5' : '#ffd4e2';
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  function makeClouds() {
    clouds = [];
    const n = W > 400 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const w = Math.round(rand(18, 34) * (W > 400 ? 1.4 : 1));
      clouds.push({
        c: makeCloud(w),
        x: rand(-w, W),
        y: Math.round(rand(scene.hb * 0.08, Math.max(scene.hb * 0.1, scene.hb * 0.62 - w * 0.38))),
        v: rand(1.5, 4.5)
      });
    }
  }

  // ------------------------------------------------------------------ ball physics
  function stepBall(b, h, ev) {
    b.vy -= G * h;
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.z += b.vz * h;
    const side = b.z < 0 ? -1 : 1;
    if (side !== b.side) {
      b.side = side;
      b.bounces = 0;
      b.wallHits = 0;
      if (ev) ev.push({ t: 'net', side: side });
    }
    if (b.y < BALL_R && b.vy < 0) {
      b.y = BALL_R + (BALL_R - b.y) * b.bV;
      b.vy = -b.vy * b.bV;
      b.vx *= b.bH;
      b.vz *= b.bH;
      b.bV = 0.7;
      b.bH = 0.86;
      b.bounces++;
      if (ev) ev.push({ t: 'bounce', x: b.x, z: b.z, n: b.bounces });
    }
    if (b.z < -10 + BALL_R && b.vz < 0 && b.y < 4) {
      b.z = -10 + BALL_R;
      b.vz = -b.vz * GLASS_E;
      b.vx *= 0.92;
      b.wallHits++;
      if (ev) ev.push({ t: 'wall', x: b.x, y: b.y, z: b.z });
    } else if (b.z > 10 - BALL_R && b.vz > 0 && b.y < 4) {
      b.z = 10 - BALL_R;
      b.vz = -b.vz * GLASS_E;
      b.vx *= 0.92;
      b.wallHits++;
      if (ev) ev.push({ t: 'wall', x: b.x, y: b.y, z: b.z });
    }
    if (Math.abs(b.x) > 5 - BALL_R && b.x * b.vx > 0 && b.y < PP.sideWallHeight(b.z)) {
      b.x = Math.sign(b.x) * (5 - BALL_R);
      b.vx = -b.vx * GLASS_E;
      b.wallHits++;
      if (ev) ev.push({ t: 'wall', x: b.x, y: b.y, z: b.z });
    }
  }

  function predict(b, until, maxT) {
    const s = {
      x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, side: b.side,
      bounces: b.bounces, wallHits: b.wallHits, lastHit: b.lastHit, bV: b.bV, bH: b.bH
    };
    const h = 1 / 240;
    for (let t = 0; t < (maxT || 5); t += h) {
      stepBall(s, h, null);
      if (until(s)) return { t: t + h, x: s.x, y: s.y, z: s.z };
    }
    return null;
  }

  // Aim the ball at a landing spot, lifting the arc until it clears the net.
  function launch(b, tx, tz, T, minNet) {
    let vx = 0, vy = 0, vz = 0;
    for (let i = 0; i < 40; i++) {
      vx = (tx - b.x) / T;
      vz = (tz - b.z) / T;
      vy = (BALL_R - b.y + 0.5 * G * T * T) / T;
      const tn = -b.z / vz;
      if (!(tn > 0 && tn < T)) break;
      if (b.y + vy * tn - 0.5 * G * tn * tn >= minNet) break;
      T += 0.04;
    }
    b.vx = vx;
    b.vy = vy;
    b.vz = vz;
  }

  const oppContact = (b) =>
    b.lastHit === 'player' && b.z > 0.3 && b.bounces >= 1 && ((b.vy < 1 && b.y <= 1.5) || b.z >= 9.1 || b.vz < 0);
  const aiPlayerContact = (b) =>
    b.lastHit === 'opp' && b.z < -0.3 && b.bounces >= 1 && ((b.vy < 0 && b.y <= 1.1) || b.z <= -9.1 || b.vz > 0);

  // ------------------------------------------------------------------ shots
  function playerMaxV() {
    return 7.6 * (0.84 + 0.16 * state.speed);
  }

  function planOpp() {
    const p = predict(ball, oppContact, 5);
    if (!p) { opp.plan = null; return; }
    const fh = p.x <= opp.x; // the opponent faces us: forehand is on screen-left
    const bx = clamp(p.x + (fh ? 0.55 : -0.55), OB.x0, OB.x1);
    const bz = clamp(p.z + 0.3, OB.z0, OB.z1);
    const need = Math.hypot(bx - opp.x, bz - opp.z) / Math.max(0.12, p.t - 0.08);
    opp.plan = { t: p.t, y: p.y, fh: fh };
    opp.stretched = need > 8.5;
    opp.maxV = clamp(need * 1.05, 4, 16);
    opp.tx = bx;
    opp.tz = bz;
  }

  function planPlayerAI() {
    const p = predict(ball, aiPlayerContact, 5);
    if (!p) return;
    const side = Math.random() < 0.5 ? 1 : -1;
    const err = !DEBUG_AUTO && Math.random() < 0.08 ? rand(1.5, 2.3) * (Math.random() < 0.5 ? -1 : 1) : 0;
    player.tx = clamp(p.x - side * 0.55 + err, PB.x0, PB.x1);
    player.tz = clamp(p.z - 0.35, PB.z0, PB.z1);
  }

  function updateMarker() {
    if (!ball.live || ball.lastHit !== 'opp') { marker = null; return; }
    const target = ball.side < 0 ? ball.bounces + 1 : 1;
    const p = predict(ball, (s) => s.side < 0 && s.bounces >= target, 5);
    marker = p ? { x: p.x, z: p.z, fatal: target >= 2 } : null;
  }

  function playerHit() {
    const dx = ball.x - player.x;
    const off = clamp(dx / REACH, -1, 1);
    const high = ball.y > 1.75;
    const volley = ball.bounces === 0;
    const glass = ball.wallHits > 0;
    const tx = clamp(ball.x * 0.3 + off * 3.4 + player.vx * 0.14 + rand(-0.4, 0.4), -4.3, 4.3);
    const tz = high ? rand(7, 9) : rand(5.8, 8.8);
    launch(ball, tx, tz, high ? 0.7 : volley ? 0.9 : 0.98, 1.1);
    ball.lastHit = 'player';
    ball.bV = 0.72;
    ball.bH = 0.86;
    ball.wallHits = 0;
    player.swing = high ? 'sm' : off >= 0 ? 'fh' : 'bh';
    player.swingT = 0;
    player.prep = null;

    const p = scene.project(ball.x, ball.y, ball.z);
    sparks(p.x, p.y, high ? 18 : 10, ['#ffffff', '#e9ff3b', '#85b4a0'], 50, high ? 170 : 120);
    ring(p.x, p.y, high ? 16 : 10, '#ffffff', 0.22);

    if (state.mode === 'attract') {
      player.tx = clamp(player.x * 0.5, PB.x0, PB.x1);
      player.tz = PLAYER_HOME.z;
      planOpp();
      marker = null;
      return;
    }

    state.score++;
    state.scorePop = 0.16;
    if (high) {
      sfx.smash();
      shake(4, 0.28);
      fx.flash = 0.12;
      state.hitstop = 0.09;
      vibrate(28);
      worldLabel('SMASH!', player, '#ffe14d');
      state.cheerT = Math.max(state.cheerT, 0.6);
    } else {
      sfx.hit(state.score);
      shake(1.5, 0.12);
      state.hitstop = 0.045;
      vibrate(12);
      if (glass) worldLabel('OFF THE GLASS!', player, '#7fd6ff');
      else if (volley && player.z > -5 && Math.random() < 0.6) worldLabel('VOLLEY!', player, '#85b4a0');
    }
    updateSpeed();
    planOpp();
    marker = null;
  }

  function updateSpeed() {
    const s = state.score;
    state.speed = 1.12 + 1.2 * (1 - Math.exp(-s / 40));
    const milestone = MILESTONES.indexOf(s) >= 0 || (s > 100 && s % 50 === 0);
    if (milestone) {
      banner(s + ' HITS!', { big: true, life: 1.6 });
      sfx.milestone();
      state.cheerT = 2;
      confetti(W > 400 ? 90 : 60);
    }
    const lvl = Math.floor(s / 5);
    if (lvl > state.level) {
      state.level = lvl;
      if (!milestone) {
        banner('SPEED UP!', { life: 1.1 });
        sfx.speedUp();
        state.cheerT = Math.max(state.cheerT, 0.9);
      }
    }
  }

  function oppHit(feed) {
    const d = state.mode === 'attract' ? 0.45 : clamp(state.score / 60, 0, 1);
    const atNet = player.z > -4.5;
    const high = ball.y > 1.6;
    let kind;
    if (feed) kind = 'feed';
    else if (opp.stretched) kind = Math.random() < 0.7 ? 'lob' : 'drive';
    else if (high && Math.random() < 0.35 + d * 0.45) kind = 'smash';
    else {
      const wDrive = 1;
      const wLob = 0.22 + (atNet ? 1.1 : 0) + d * 0.1;
      const wDrop = d * 0.35 + (player.z < -7.5 ? d * 0.25 : 0);
      let r = Math.random() * (wDrive + wLob + wDrop);
      kind = (r -= wDrive) < 0 ? 'drive' : (r -= wLob) < 0 ? 'lob' : 'drop';
    }

    // Aim: early on the ball comes near you; later it's pulled further away, but never
    // further than a sprint can cover.
    const away = player.x >= 0 ? -1 : 1;
    const maxShift = 2.6 + 3.2 * d;
    let tx;
    if (kind === 'feed') tx = player.x + rand(-0.8, 0.8);
    else if (Math.random() < 0.2 + 0.5 * d) tx = away * rand(1.6, 4.2);
    else tx = player.x + rand(-1.5, 1.5);
    tx = clamp(clamp(tx, player.x - maxShift, player.x + maxShift), -4.2, 4.2);

    let tz = -6.8, T = 1.55, bV = 0.72, bH = 0.86, label = null;
    if (kind === 'drive') { tz = rand(-7.8, -5.2); T = lerp(1.4, 1.22, d); }
    else if (kind === 'lob') { tz = rand(-9.3, -8.5); T = 2.15; bV = 0.66; label = 'GLOBO!'; }
    else if (kind === 'drop') { tz = rand(-4.2, -3.0); T = 1.3; bV = 0.55; bH = 0.62; label = 'DEJADA!'; }
    else if (kind === 'smash') { tz = rand(-6.5, -4.2); T = 0.86; bV = 0.8; label = pick(['VIBORA!', 'BANDEJA!', 'REMATE!']); }

    launch(ball, tx, tz, T, 1.05);
    ball.kind = kind;
    ball.lastHit = 'opp';
    ball.bV = bV;
    ball.bH = bH;
    ball.wallHits = 0;

    opp.swing = kind === 'smash' || high ? 'sm' : ball.x <= opp.x ? 'fh' : 'bh';
    opp.swingT = 0;
    opp.prep = null;
    opp.plan = null;
    opp.stretched = false;
    opp.maxV = 6;
    opp.tx = clamp(tx * -0.2, OB.x0, OB.x1);
    opp.tz = OPP_HOME.z;

    if (state.mode !== 'attract') {
      if (kind === 'smash') { sfx.smash(); shake(2, 0.15); } else sfx.oppHit();
      if (label && (kind !== 'lob' || Math.random() < 0.6)) worldLabel(label, opp, kind === 'smash' ? '#ff7eb6' : '#ffb86b');
    }
    const p = scene.project(ball.x, ball.y, ball.z);
    sparks(p.x, p.y, 6, ['#ffffff', '#ff7eb6'], 30, 70);

    updateMarker();
    if (state.mode === 'attract' || DEBUG_AUTO) planPlayerAI();
  }

  function feed() {
    ball.x = clamp(opp.x - 0.4, -4.5, 4.5);
    ball.y = 1.0;
    ball.z = opp.z - 0.2;
    ball.side = 1;
    ball.bounces = 0;
    ball.wallHits = 0;
    ball.live = true;
    ball.visible = true;
    trail.length = 0;
    oppHit(true);
  }

  function miss(reason) {
    marker = null;
    if (state.mode === 'attract') {
      ball.live = false;
      state.feedTimer = 1.3;
      opp.cheer = 1.2;
      return;
    }
    if (state.mode !== 'play') return;
    state.mode = 'missed';
    state.missTimer = 1.6;
    state.missReason = reason;
    state.slowmo = 0.3;
    opp.cheer = 4;
    sfx.miss();
    shake(5, 0.4);
    vibrate(90);
    banner(reason, { color: '#ff4d6d', life: 1.8 });
    if (state.score > state.best) {
      state.best = state.score;
      state.newBest = true;
      saveBest(state.best);
    }
  }

  // ------------------------------------------------------------------ game flow
  function resetCourt() {
    Object.assign(player, { x: PLAYER_HOME.x, z: PLAYER_HOME.z, vx: 0, vz: 0, tx: PLAYER_HOME.x, tz: PLAYER_HOME.z, swing: null, prep: null, cheer: 0 });
    Object.assign(opp, { x: OPP_HOME.x, z: OPP_HOME.z, vx: 0, vz: 0, tx: OPP_HOME.x, tz: OPP_HOME.z, swing: null, prep: null, plan: null, cheer: 0 });
    ball.live = false;
    ball.visible = false;
    trail.length = 0;
    marker = null;
  }

  function startGame() {
    Sound.unlock();
    sfx.click();
    showScreen(null);
    resetCourt();
    Object.assign(state, {
      mode: 'countdown', paused: false, score: 0, speed: 1.12, level: 0, hitstop: 0, slowmo: 1, cheerT: 0,
      countdown: 1.8, lastCount: 0, newBest: false, scorePop: 0
    });
    fx.labels.length = 0;
    fx.banner = null;
    input.drag = null;
    updateHudButtons();
  }

  function gameOver() {
    state.mode = 'over';
    state.slowmo = 1;
    ball.visible = false;
    ball.live = false;
    $('over-reason').textContent = state.missReason;
    $('over-score').textContent = state.score;
    $('over-new').hidden = !state.newBest;
    setBestText();
    showScreen('over');
    updateHudButtons();
    const again = $('btn-again');
    if (again && !matchMedia('(pointer: coarse)').matches) again.focus({ preventScroll: true });
  }

  function toAttract() {
    showScreen('title');
    resetCourt();
    state.mode = 'attract';
    state.feedTimer = 0.8;
    updateHudButtons();
  }

  function setPaused(p) {
    if (state.mode !== 'play' && state.mode !== 'countdown') p = false;
    state.paused = p;
    showScreen(p ? 'pause' : null);
    updateHudButtons();
  }

  function showScreen(name) {
    for (const k in scr) scr[k].hidden = k !== name;
  }

  function setBestText() {
    document.querySelectorAll('[data-best]').forEach((el) => { el.textContent = state.best; });
  }

  function updateHudButtons() {
    const inGame = state.mode === 'play' || state.mode === 'countdown';
    btnPause.hidden = !inGame;
    btnPause.setAttribute('aria-label', state.paused ? 'Resume' : 'Pause');
    btnSound.setAttribute('aria-pressed', Sound.isMuted() ? 'true' : 'false');
    btnSound.setAttribute('aria-label', Sound.isMuted() ? 'Unmute sound' : 'Mute sound');
    btnSound.classList.toggle('is-muted', Sound.isMuted());
  }

  function vibrate(ms) {
    if (navigator.vibrate && matchMedia('(pointer: coarse)').matches) {
      try { navigator.vibrate(ms); } catch (e) { /* ignore */ }
    }
  }

  // ------------------------------------------------------------------ input
  const keys = { left: false, right: false, up: false, down: false };
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down'
  };
  const input = { src: 'none', drag: null };
  const controllable = () => state.mode === 'play' || state.mode === 'countdown';
  const DEBUG_AUTO = /[?&]autoplay\b/.test(location.search);

  function toGame(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  function setTargetFromScreen(sx, sy) {
    const w = scene.unproject(sx, sy);
    player.tx = clamp(w ? w.x : player.tx, PB.x0, PB.x1);
    player.tz = clamp(w ? w.z : PB.z1, PB.z0, PB.z1);
  }

  window.addEventListener('keydown', (e) => {
    Sound.unlock();
    const k = KEYMAP[e.code];
    if (k) {
      keys[k] = true;
      if (controllable()) e.preventDefault();
      return;
    }
    const onButton = document.activeElement && /^(BUTTON|A)$/.test(document.activeElement.tagName);
    if ((e.code === 'Space' || e.code === 'Enter') && !onButton) {
      if (state.mode === 'attract' || state.mode === 'over') { e.preventDefault(); startGame(); }
      else if (state.paused) { e.preventDefault(); setPaused(false); }
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      setPaused(!state.paused);
    } else if (e.code === 'KeyM') {
      toggleMute();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) keys[k] = false;
  });
  window.addEventListener('blur', () => {
    keys.left = keys.right = keys.up = keys.down = false;
  });

  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    if (!controllable()) return;
    const g = toGame(e);
    input.src = 'pointer';
    if (e.pointerType === 'mouse') {
      setTargetFromScreen(g.x, g.y);
      return;
    }
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const pp = scene.project(player.tx, 0, player.tz);
    input.drag = { id: e.pointerId, fx: g.x, fy: g.y, ax: pp.x, ay: pp.y };
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!controllable()) return;
    const g = toGame(e);
    if (e.pointerType === 'mouse') {
      input.src = 'pointer';
      setTargetFromScreen(g.x, g.y);
      return;
    }
    const d = input.drag;
    if (!d || d.id !== e.pointerId) return;
    e.preventDefault();
    const w = scene.unproject(d.ax + (g.x - d.fx) * DRAG_GAIN, d.ay + (g.y - d.fy) * DRAG_GAIN);
    const tx = w ? w.x : player.tx;
    const tz = w ? w.z : PB.z1;
    const cx = clamp(tx, PB.x0, PB.x1), cz = clamp(tz, PB.z0, PB.z1);
    player.tx = cx;
    player.tz = cz;
    if (cx !== tx || cz !== tz) {
      // re-anchor at the wall so dragging back responds immediately
      const pp = scene.project(cx, 0, cz);
      d.ax = pp.x; d.ay = pp.y; d.fx = g.x; d.fy = g.y;
    }
  }, { passive: false });

  const endDrag = (e) => {
    if (input.drag && input.drag.id === e.pointerId) input.drag = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function toggleMute() {
    Sound.unlock();
    Sound.setMuted(!Sound.isMuted());
    updateHudButtons();
    sfx.click();
  }

  $('btn-play').addEventListener('click', (e) => { e.stopPropagation(); startGame(); });
  scr.title.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    startGame();
  });
  $('btn-again').addEventListener('click', startGame);
  $('btn-resume').addEventListener('click', () => setPaused(false));
  btnPause.addEventListener('click', () => { Sound.unlock(); setPaused(!state.paused); });
  btnSound.addEventListener('click', toggleMute);
  const shareBtn = $('btn-share');
  if (navigator.share && shareBtn) {
    shareBtn.hidden = false;
    shareBtn.addEventListener('click', () => {
      navigator.share({
        title: 'CUPTC Padel Pong',
        text: 'I kept a ' + state.score + '-hit rally alive in CUPTC Padel Pong. Beat that!',
        url: location.href
      }).catch(() => {});
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && controllable()) setPaused(true);
  });

  let resizeTimer = 0;
  function queueResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  }
  window.addEventListener('resize', queueResize);
  window.addEventListener('orientationchange', queueResize);

  // ------------------------------------------------------------------ effects
  function sparks(x, y, n, colors, vMin, vMax) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = rand(vMin, vMax);
      fx.parts.push({
        x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, g: 260,
        life: rand(0.25, 0.5), max: 0.5, c: pick(colors), s: Math.random() < 0.3 ? 2 : 1
      });
    }
  }
  function dust(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      fx.parts.push({ x: x, y: y, vx: rand(-25, 25), vy: rand(-22, -6), g: 60, life: rand(0.18, 0.32), max: 0.32, c: color, s: 1 });
    }
  }
  function confetti(n) {
    for (let i = 0; i < n; i++) {
      fx.parts.push({
        x: rand(0, W), y: rand(-H * 0.3, 0), vx: rand(-12, 12), vy: rand(20, 60), g: 18,
        life: rand(1.6, 2.6), max: 2.6, c: pick(CYCLE), s: Math.random() < 0.5 ? 2 : 1, flutter: rand(0, 6)
      });
    }
  }
  function ring(x, y, r, color, life) {
    fx.rings.push({ x: x, y: y, r: r, c: color, life: life, max: life });
  }
  function worldLabel(text, fig, color) {
    const p = scene.project(fig.x, 3.1, fig.z);
    fx.labels.push({ text: text, x: p.x, y: p.y, c: color, life: 0.95, max: 0.95 });
  }
  function banner(text, opts) {
    fx.banner = { text: text, t: 0, life: opts.life || 1.2, color: opts.color || null, big: !!opts.big };
  }
  function shake(amp, t) {
    if (REDUCED_MOTION) return;
    fx.shakeAmp = Math.max(fx.shakeAmp, amp);
    fx.shakeT = Math.max(fx.shakeT, t);
  }

  function updateFx(dt) {
    for (let i = fx.parts.length - 1; i >= 0; i--) {
      const p = fx.parts[i];
      p.life -= dt;
      if (p.life <= 0) { fx.parts.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += (p.vx + (p.flutter !== undefined ? Math.sin(state.time * 5 + p.flutter) * 14 : 0)) * dt;
      p.y += p.vy * dt;
    }
    for (let i = fx.rings.length - 1; i >= 0; i--) {
      fx.rings[i].life -= dt;
      if (fx.rings[i].life <= 0) fx.rings.splice(i, 1);
    }
    for (let i = fx.labels.length - 1; i >= 0; i--) {
      fx.labels[i].life -= dt;
      fx.labels[i].y -= 12 * dt;
      if (fx.labels[i].life <= 0) fx.labels.splice(i, 1);
    }
    if (fx.banner) {
      fx.banner.t += dt;
      if (fx.banner.t > fx.banner.life) fx.banner = null;
    }
    if (fx.shakeT > 0) {
      fx.shakeT -= dt;
      if (fx.shakeT <= 0) fx.shakeAmp = 0;
    }
    if (fx.flash > 0) fx.flash -= dt;
    if (state.scorePop > 0) state.scorePop -= dt;
    if (state.cheerT > 0) state.cheerT -= dt;
    for (const c of clouds) {
      c.x += c.v * dt;
      if (c.x > W + 4) c.x = -c.c.width - 4;
    }
  }

  // ------------------------------------------------------------------ update
  function steerFig(fig, dvx, dvz, dt, acc) {
    const ax = dvx - fig.vx, az = dvz - fig.vz, al = Math.hypot(ax, az), maxA = acc * dt;
    if (al > maxA) {
      fig.vx += (ax / al) * maxA;
      fig.vz += (az / al) * maxA;
    } else {
      fig.vx = dvx;
      fig.vz = dvz;
    }
    fig.x += fig.vx * dt;
    fig.z += fig.vz * dt;
    fig.runPhase += Math.hypot(fig.vx, fig.vz) * dt * 1.5;
  }

  function towards(fig, maxV) {
    const dx = fig.tx - fig.x, dz = fig.tz - fig.z, dist = Math.hypot(dx, dz);
    if (dist < 0.02) return [0, 0];
    const sp = Math.min(maxV, dist * 9);
    return [(dx / dist) * sp, (dz / dist) * sp];
  }

  function updatePlayer(dt) {
    let dv;
    const maxV = playerMaxV();
    if (state.mode === 'attract' || (DEBUG_AUTO && state.mode === 'play')) {
      dv = towards(player, state.mode === 'attract' ? 7.2 : maxV);
    } else if (controllable()) {
      const kx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const kz = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
      if (kx || kz) {
        input.src = 'keys';
        const l = Math.hypot(kx, kz);
        dv = [(kx / l) * maxV, (kz / l) * maxV];
      } else if (input.src === 'keys') {
        dv = [0, 0];
      } else {
        dv = towards(player, maxV);
      }
    } else {
      dv = [0, 0];
    }
    steerFig(player, dv[0], dv[1], dt, 55);
    player.x = clamp(player.x, PB.x0, PB.x1);
    player.z = clamp(player.z, PB.z0, PB.z1);
    if (input.src === 'keys' && controllable()) {
      player.tx = player.x;
      player.tz = player.z;
    }

    // racket preparation as the ball approaches
    if (!player.swing && ball.live && ball.lastHit === 'opp' && ball.z < 2) {
      const d = Math.hypot(ball.x - player.x, ball.z - player.z);
      player.prep = ball.y > 2.1 && d < 3.5 ? 'sm' : ball.x >= player.x ? 'fh' : 'bh';
    } else if (!player.swing) {
      player.prep = null;
    }
  }

  function updateOpp(dt) {
    if (opp.plan) {
      opp.plan.t -= dt;
      opp.prep = opp.plan.t < 0.42 ? (opp.plan.y > 1.6 ? 'sm' : opp.plan.fh ? 'fh' : 'bh') : null;
    } else {
      opp.prep = null;
    }
    const dv = opp.cheer > 0 ? [0, 0] : towards(opp, opp.maxV);
    steerFig(opp, dv[0], dv[1], dt, 70);
    opp.x = clamp(opp.x, OB.x0, OB.x1);
    opp.z = clamp(opp.z, OB.z0, OB.z1);
  }

  const events = [];

  function updateBall(worldDt) {
    if (!ball.live) return;
    const steps = Math.max(1, Math.ceil(worldDt / (1 / 240)));
    const h = worldDt / steps;
    for (let i = 0; i < steps && ball.live; i++) {
      events.length = 0;
      stepBall(ball, h, events);
      for (const ev of events) handleEvent(ev);
      if (!ball.live) break;
      const canPlay = state.mode === 'play' || state.mode === 'attract';
      if (canPlay && ball.lastHit === 'opp') {
        if (ball.z < 0.2 && ball.y < REACH_H && Math.hypot(ball.x - player.x, ball.z - player.z) < REACH) {
          playerHit();
          continue;
        }
        if (ball.side < 0 && ball.bounces >= 2) { miss('DOUBLE BOUNCE!'); continue; }
      } else if (canPlay && ball.lastHit === 'player') {
        if (oppContact(ball) || (ball.side > 0 && ball.bounces >= 2)) oppHit(false);
      }
      if (ball.y < -1 || Math.abs(ball.x) > 12 || Math.abs(ball.z) > 16) {
        if (ball.lastHit === 'opp') miss('MISSED!');
        ball.live = false;
      }
    }
  }

  function handleEvent(ev) {
    if (ev.t === 'bounce') {
      const p = scene.project(ev.x, 0, ev.z);
      dust(p.x, p.y, 4, '#dce9ff');
      ring(p.x, p.y, 5, '#ffffff', 0.16);
      if (state.mode !== 'attract') sfx.bounce(ev.z < 0);
      if (ball.lastHit === 'opp' && ev.z < 0) updateMarker();
    } else if (ev.t === 'wall') {
      const p = scene.project(ev.x, ev.y, ev.z);
      sparks(p.x, p.y, 7, ['#c8f0ff', '#ffffff'], 20, 60);
      ring(p.x, p.y, 8, '#c8f0ff', 0.2);
      if (state.mode !== 'attract') sfx.glass();
      if (ball.lastHit === 'opp') updateMarker();
    } else if (ev.t === 'net') {
      if (ball.lastHit === 'opp' && ev.side > 0 && (state.mode === 'play' || state.mode === 'attract')) miss('MISSED!');
    }
  }

  function update(dt) {
    state.time += dt;
    updateFx(dt * (state.mode === 'missed' ? 0.6 : 1));
    if (opp.cheer > 0) opp.cheer -= dt;

    if (state.hitstop > 0) {
      state.hitstop -= dt;
      return;
    }

    if (state.mode === 'countdown') {
      state.countdown -= dt;
      const n = Math.ceil(state.countdown / 0.6);
      if (n !== state.lastCount && n > 0) { state.lastCount = n; sfx.count(); }
      if (state.countdown <= 0) {
        state.mode = 'play';
        banner('GO!', { life: 0.7 });
        sfx.go();
        feed();
        updateHudButtons();
      }
    } else if (state.mode === 'attract' && !ball.live) {
      state.feedTimer -= dt;
      if (state.feedTimer <= 0) {
        player.tx = PLAYER_HOME.x;
        player.tz = PLAYER_HOME.z;
        feed();
      }
    } else if (state.mode === 'missed') {
      state.missTimer -= dt;
      if (state.missTimer <= 0) gameOver();
    }

    const dtLocal = dt * state.slowmo;
    const worldDt = dtLocal * state.speed;
    updatePlayer(dtLocal);
    updateOpp(worldDt);
    for (const f of [player, opp]) {
      if (f.swing) {
        f.swingT += f === opp ? worldDt : dtLocal;
        if (f.swingT > 0.3) f.swing = null;
      }
    }
    updateBall(worldDt);
    if (ball.visible) {
      trail.push({ x: ball.x, y: ball.y, z: ball.z });
      if (trail.length > 10) trail.shift();
    }
  }

  // ------------------------------------------------------------------ render
  function ellipse(cx, cy, rx, ry, color) {
    ctx.fillStyle = color;
    const r = Math.max(1, Math.round(ry));
    for (let j = -r; j <= r; j++) {
      const half = rx * Math.sqrt(Math.max(0, 1 - (j / (r + 0.5)) * (j / (r + 0.5))));
      const w = Math.max(1, Math.round(half * 2));
      ctx.fillRect(Math.round(cx - w / 2), Math.round(cy + j), w, 1);
    }
  }

  function floorSquash(x, z) {
    const a = scene.project(x, 0, z - 0.5), b = scene.project(x, 0, z + 0.5);
    return Math.abs(a.y - b.y) / a.s;
  }

  function figPose(f) {
    if (f.cheer > 0 && !f.swing) {
      return { pose: 'cheer', legs: 'stand', frame: Math.floor(state.time * 7) % 2, hop: Math.floor(state.time * 7) % 2 };
    }
    let pose = 'ready';
    if (f.swing) pose = f.swing + (f.swingT < 0.07 ? '_hit' : '_follow');
    else if (f.prep) pose = f.prep + '_prep';
    const running = Math.hypot(f.vx, f.vz) > 0.6;
    const frame = running
      ? Math.floor(f.runPhase * Sprites.RUN_FRAMES) % Sprites.RUN_FRAMES
      : Math.floor(state.time * 2 + f.idle) % 2;
    return { pose: pose, legs: running ? 'run' : 'ready', frame: frame, hop: 0 };
  }

  function drawFigShadow(f, ox, oy) {
    const p = scene.project(f.x, 0, f.z);
    const rx = 0.36 * p.s * EXAG;
    ellipse(p.x + ox, p.y + oy, rx, Math.max(1, rx * floorSquash(f.x, f.z)), 'rgba(10, 16, 60, 0.38)');
  }

  function drawFig(f, ox, oy) {
    const p = scene.project(f.x, 0, f.z);
    const ps = figPose(f);
    const spr = Sprites.get(f.who, p.s * EXAG, ps.pose, ps.legs, ps.frame);
    ctx.drawImage(spr.c, Math.round(p.x - spr.ax) + ox, Math.round(p.y - spr.ay) + oy - ps.hop * 2);
  }

  function ballRadius(p) {
    return clamp(p.s * 0.1 * 1.8, 1.5, 6);
  }

  function drawBallShadow(ox, oy) {
    const p = scene.project(ball.x, 0, ball.z);
    const r = ballRadius(p);
    const a = clamp(0.42 - ball.y * 0.06, 0.12, 0.42);
    ellipse(p.x + ox, p.y + oy, r, Math.max(1, r * floorSquash(ball.x, ball.z)), 'rgba(10, 16, 60, ' + a.toFixed(2) + ')');
  }

  function drawBall(ox, oy) {
    const p = scene.project(ball.x, ball.y, ball.z);
    const r = ballRadius(p);
    // solid pixel trail: shrinking and warming towards the tail
    const n = trail.length;
    for (let i = n % 2; i < n - 1; i += 2) {
      const t = trail[i];
      const tp = scene.project(t.x, t.y, t.z);
      const k = (i + 1) / n;
      const s = Math.max(1, Math.round(r * (0.3 + 0.9 * k)));
      ctx.fillStyle = k > 0.7 ? '#f4ff9a' : k > 0.4 ? '#ffe14d' : '#ffb86b';
      ctx.fillRect(Math.round(tp.x - s / 2) + ox, Math.round(tp.y - s / 2) + oy, s, s);
    }
    const spr = Sprites.ball(r);
    ctx.drawImage(spr.c, Math.round(p.x - spr.a) + ox, Math.round(p.y - spr.a) + oy);
  }

  function drawMarker(ox, oy) {
    if (Math.sin(state.time * 16) < -0.4) return;
    ctx.fillStyle = marker.fatal ? '#ff4d6d' : '#e9ff3b';
    const n = 16, R = 0.34;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = scene.project(marker.x + Math.cos(a) * R, 0, marker.z + Math.sin(a) * R);
      ctx.fillRect(Math.round(p.x) + ox, Math.round(p.y) + oy, 1, 1);
    }
    const c = scene.project(marker.x, 0, marker.z);
    ctx.fillRect(Math.round(c.x) + ox, Math.round(c.y) + oy, 1, 1);
  }

  function drawText(text, x, y, opts, align) {
    const c = Font.render(text, opts);
    const dx = align === 'left' ? 0 : align === 'right' ? -c.width : -c.width / 2;
    ctx.drawImage(c, Math.round(x + dx), Math.round(y));
    return c;
  }

  function drawFx(ox, oy) {
    for (const r of fx.rings) {
      const k = 1 - r.life / r.max;
      const rad = 1 + r.r * k;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = r.c;
      const n = Math.max(8, Math.round(rad * 3));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ctx.fillRect(Math.round(r.x + Math.cos(a) * rad) + ox, Math.round(r.y + Math.sin(a) * rad * 0.8) + oy, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
    for (const p of fx.parts) {
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 2);
      ctx.fillStyle = p.c;
      ctx.fillRect(Math.round(p.x) + ox, Math.round(p.y) + oy, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    const cyc = Math.floor(state.time * 14);
    for (const l of fx.labels) {
      const k = l.life / l.max;
      if (k < 0.25 && Math.floor(state.time * 20) % 2) continue;
      drawText(l.text, l.x + ox, l.y + oy, { scale: 1, color: cyc % 2 ? l.c : '#ffffff' });
    }
  }

  function drawHud() {
    const u = W >= 400 ? 2 : 1;
    const inGame = state.mode === 'play' || state.mode === 'countdown' || state.mode === 'missed';
    if (inGame) {
      const big = W >= 400 ? 4 : 3;
      const pop = state.scorePop > 0 ? 1 : 0;
      drawText(String(state.score), W / 2, hudTop - pop * 2, {
        scale: big + pop, color: '#ffffff', color2: pop ? '#e9ff3b' : '#cfeee0'
      });
      drawText('BEST ' + Math.max(state.best, state.score), W / 2, hudTop + 7 * big + 5, { scale: 1, color: '#b6d8c9' });
    }

    const midY = Math.round(H * 0.4);
    if (state.mode === 'countdown') {
      const n = Math.max(1, Math.ceil(state.countdown / 0.6));
      const t = (state.countdown % 0.6) / 0.6;
      const s = (u === 2 ? 7 : 5) + (t > 0.8 ? 1 : 0);
      drawText(String(n), W / 2, midY - (7 * s) / 2, { scale: s, color: '#ffffff', color2: '#e9ff3b' });
      drawText('GET READY', W / 2, midY + (7 * s) / 2 + 8, { scale: u, color: '#ffffff' });
    }

    if (fx.banner) {
      const b = fx.banner;
      const base = b.big ? u * 2 + 1 : u * 2;
      const s = b.t < 0.08 ? base + u : base;
      const endBlink = b.life - b.t < 0.3 && Math.floor(state.time * 20) % 2;
      if (!endBlink) {
        const col = b.color || CYCLE[Math.floor(state.time * 14) % CYCLE.length];
        drawText(b.text, W / 2, midY - (7 * s) / 2, { scale: s, color: col, color2: b.color ? '#ffffff' : col });
      }
    }

    if (state.paused) {
      ctx.fillStyle = 'rgba(12, 8, 32, 0.45)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function render() {
    if (!scene) return;
    const M = scene.M;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scene.sky, 0, 0);
    for (const c of clouds) ctx.drawImage(c.c, Math.round(c.x), c.y);

    let ox = 0, oy = 0;
    if (fx.shakeT > 0) {
      ox = Math.round(rand(-1, 1) * fx.shakeAmp);
      oy = Math.round(rand(-1, 1) * fx.shakeAmp);
    }
    const cheering = state.cheerT > 0 && Math.floor(state.time * 8) % 2 === 1;
    ctx.drawImage(cheering ? scene.worldCheer : scene.world, -M + ox, -M + oy);

    const far = [], near = [];
    const add = (z, shadow, draw) => (z >= 0 ? far : near).push({ z: z, shadow: shadow, draw: draw });
    add(opp.z, () => drawFigShadow(opp, ox, oy), () => drawFig(opp, ox, oy));
    add(player.z, () => drawFigShadow(player, ox, oy), () => drawFig(player, ox, oy));
    if (ball.visible) add(ball.z, () => drawBallShadow(ox, oy), () => drawBall(ox, oy));
    const drawSide = (list) => {
      list.sort((a, b) => b.z - a.z);
      list.forEach((o) => o.shadow());
      list.forEach((o) => o.draw());
    };
    drawSide(far);
    ctx.drawImage(scene.net, -M + ox, -M + oy);
    if (marker && state.mode !== 'attract') drawMarker(ox, oy);
    drawSide(near);
    drawFx(ox, oy);

    if (fx.flash > 0 && !REDUCED_MOTION) {
      ctx.globalAlpha = clamp(fx.flash * 4, 0, 0.55);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    drawHud();
  }

  // ------------------------------------------------------------------ title crest
  function buildCrest() {
    const c = $('crest');
    if (!c) return;
    const img = new Image();
    img.onload = () => {
      const w = 66, h = 42;
      // downsample in steps for a cleaner result, then snap to a small palette
      let src = img, sx = 0, sy = 10, sw = 462, sh = 296;
      while (sw / 2 > w * 1.5) {
        const t = document.createElement('canvas');
        t.width = Math.round(sw / 2);
        t.height = Math.round(sh / 2);
        t.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, t.width, t.height);
        src = t; sx = 0; sy = 0; sw = t.width; sh = t.height;
      }
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
      const data = g.getImageData(0, 0, w, h);
      const pal = [[223, 35, 38], [156, 23, 25], [133, 180, 160], [79, 128, 105], [26, 28, 44], [255, 255, 255]];
      for (let i = 0; i < data.data.length; i += 4) {
        if (data.data[i + 3] < 110) { data.data[i + 3] = 0; continue; }
        let best = 0, bd = Infinity;
        for (let p = 0; p < pal.length; p++) {
          const dr = data.data[i] - pal[p][0], dg = data.data[i + 1] - pal[p][1], db = data.data[i + 2] - pal[p][2];
          const dd = dr * dr + dg * dg + db * db;
          if (dd < bd) { bd = dd; best = p; }
        }
        data.data[i] = pal[best][0];
        data.data[i + 1] = pal[best][1];
        data.data[i + 2] = pal[best][2];
        data.data[i + 3] = 255;
      }
      g.putImageData(data, 0, 0);
      c.classList.add('ready');
    };
    img.src = '../assets/img/cuptc-logo.png';
  }

  // ------------------------------------------------------------------ boot
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!state.paused) update(dt);
    render();
  }

  resize();
  setBestText();
  updateHudButtons();
  buildCrest();
  toAttract();
  requestAnimationFrame(frame);

  if (/[?&]debug\b/.test(location.search)) {
    window.__padel = {
      state: state, ball: ball, player: player, opp: opp, startGame: startGame, scene: () => scene,
      predict: (fn) => predict(ball, fn || aiPlayerContact, 5)
    };
  }
})();
