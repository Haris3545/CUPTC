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
  const scr = { title: $('scr-title'), pause: $('scr-pause'), over: $('scr-over'), vs: $('scr-vs'), vsover: $('scr-vsover') };
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
    cheerT: 0,
    hits: 0
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

  // ------------------------------------------------------------------ power-ups
  // Pickups appear on your half and are collected by running over them; events are
  // triggered by the game. Both are scheduled by rally hits once the rally gets going.
  const PICKUPS = {
    big: { name: 'BIG RACKET', color: '#b8dccb', shots: 4 },
    guardian: { name: 'GLASS GUARDIAN', color: '#ffc93a' }
  };
  const EVENTS = {
    weather: { name: 'RAIN!', color: '#7fd6ff', dur: 15 },
    doubles: { name: 'DOUBLES!', color: '#e9ff3b', dur: 20 },
    wave: { name: 'CROWD WAVE X2', color: '#ffb86b', dur: 10 },
    zone: { name: 'SMASH ZONE', color: '#ffc93a', dur: 16 }
  };
  const freshPU = () => ({
    big: 0, guardian: false,
    pickup: null, event: null, eventT: 0, zone: null, streak: 0,
    nextPickup: 6, nextEvent: 10, lastEvent: null
  });
  const pu = freshPU();
  const phys = { bV: 1, bH: 1 };
  let mate = null, opp2 = null;
  const rain = [];

  const fx = { parts: [], rings: [], labels: [], banner: null, shakeAmp: 0, shakeT: 0, flash: 0 };

  // ------------------------------------------------------------------ 1v1 against a friend
  // Each phone plays from its own end: the friend's court is ours turned round (x -> -x, z -> -z).
  // Whoever the ball is heading towards decides the point: their phone reports a hit or a miss,
  // and the other phone follows. No power-ups, first to VS_TARGET points, serve alternates.
  const VS_TARGET = 7;
  const vs = {
    on: false, role: null, link: null, pending: null, me: 0, them: 0,
    rtt: 0.12, lastRx: 0, posT: 0, pingT: 0, again: false, theirAgain: false, first: true
  };

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
        g.fillStyle = y >= h - 2 ? '#e3d6d3' : y < h * 0.35 ? '#ffffff' : '#f6efed';
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
      b.vy = -b.vy * b.bV * phys.bV;
      b.vx *= Math.min(0.97, b.bH * phys.bH);
      b.vz *= Math.min(0.97, b.bH * phys.bH);
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
  const reach = () => REACH * (pu.big > 0 ? 1.5 : 1);
  const reachH = () => REACH_H + (pu.big > 0 ? 0.4 : 0);

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

  function playerHit(hitter) {
    const who = hitter || player;
    const dx = ball.x - who.x;
    const off = clamp(dx / reach(), -1, 1);
    const high = ball.y > 1.75;
    const volley = ball.bounces === 0;
    const glass = ball.wallHits > 0;
    let tx = clamp(ball.x * 0.3 + off * 3.4 + who.vx * 0.14 + rand(-0.4, 0.4), -4.3, 4.3);
    if (vs.on) tx = clamp(tx - opp.x * 0.3, -4.3, 4.3);
    const tz = high ? rand(7, 9) : rand(5.8, 8.8);
    launch(ball, tx, tz, high ? 0.7 : volley ? 0.9 : 0.98, 1.1);
    ball.lastHit = 'player';
    ball.bV = 0.72;
    ball.bH = 0.86;
    ball.wallHits = 0;
    who.swing = high ? 'sm' : off >= 0 ? 'fh' : 'bh';
    who.swingT = 0;
    who.prep = null;

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

    if (vs.on) {
      state.hits++;
      vsSpeed();
      if (high) {
        sfx.smash();
        shake(4, 0.28);
        fx.flash = 0.12;
        vibrate(28);
        worldLabel('SMASH!', who, '#ffe14d');
      } else {
        sfx.hit(state.hits);
        shake(1.5, 0.12);
        vibrate(12);
        if (glass) worldLabel('OFF THE GLASS!', who, '#7fd6ff');
        else if (volley && who.z > -5 && Math.random() < 0.6) worldLabel('VOLLEY!', who, '#85b4a0');
      }
      vsSendHit(who.swing);
      marker = null;
      return;
    }

    // ---- scoring: base point, crowd wave, combo multiplier, bonuses
    state.hits++;
    pu.streak = glass || volley || high ? pu.streak + 1 : 0;
    const mult = pu.streak >= 10 ? 3 : pu.streak >= 5 ? 2 : 1;
    if (pu.streak === 5 || pu.streak === 10) worldLabel('COMBO X' + mult + '!', who, '#e9ff3b');
    let pts = 1;
    if (pu.event === 'wave') pts *= 2;
    pts *= mult;
    let bonus = 0;
    if (high && pu.zone && Math.hypot(who.x - pu.zone.x, who.z - pu.zone.z) < pu.zone.r) {
      bonus += 5;
      pu.zone.left--;
      worldLabel('ZONE SMASH +5', who, '#ffc93a');
      state.cheerT = Math.max(state.cheerT, 1.2);
      if (pu.zone.left <= 0) endEvent();
    }
    if (pu.big > 0) pu.big--;
    const gained = pts + bonus;
    state.score += gained;
    state.scorePop = 0.16;
    if (gained > 1) scorePlus(gained);

    if (high) {
      sfx.smash();
      shake(4, 0.28);
      fx.flash = 0.12;
      state.hitstop = 0.09;
      vibrate(28);
      worldLabel('SMASH!', who, '#ffe14d');
      state.cheerT = Math.max(state.cheerT, 0.6);
    } else {
      sfx.hit(state.hits);
      shake(1.5, 0.12);
      state.hitstop = 0.045;
      vibrate(12);
      if (glass) worldLabel('OFF THE GLASS!', who, '#7fd6ff');
      else if (volley && who.z > -5 && Math.random() < 0.6) worldLabel('VOLLEY!', who, '#85b4a0');
    }
    updateSpeed();
    schedulePowerUps();
    planOpp();
    marker = null;
  }

  function updateSpeed() {
    const s = state.hits;
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
      if (!milestone && !fx.banner) {
        banner('SPEED UP!', { life: 1.1 });
        sfx.speedUp();
        state.cheerT = Math.max(state.cheerT, 0.9);
      }
    }
  }

  // ---- power-up scheduling
  function schedulePowerUps() {
    if (state.hits >= pu.nextPickup && !pu.pickup) {
      spawnPickup();
      pu.nextPickup = state.hits + 9 + Math.floor(Math.random() * 5);
    }
    if (state.hits >= pu.nextEvent && !pu.event) {
      startEvent();
      pu.nextEvent = state.hits + 11 + Math.floor(Math.random() * 6);
    }
  }

  function spawnPickup(force) {
    const types = Object.keys(PICKUPS).filter((t) => (t === 'guardian' ? !pu.guardian : !pu[t]));
    if (!types.length) return;
    let x = rand(-3.8, 3.8);
    if (Math.abs(x - player.x) < 1.5) x = clamp(player.x + (player.x > 0 ? -2.5 : 2.5), -3.8, 3.8);
    pu.pickup = { type: force || pick(types), x: x, z: rand(-8.2, -3.4), t: 0, life: 9 };
    sfx.spawn();
  }

  function collectPickup() {
    const k = pu.pickup.type, info = PICKUPS[k];
    if (k === 'guardian') pu.guardian = true;
    else pu[k] = info.shots;
    const p = scene.project(pu.pickup.x, 0.6, pu.pickup.z);
    sparks(p.x, p.y, 16, [info.color, '#ffffff'], 40, 110);
    ring(p.x, p.y, 14, info.color, 0.3);
    banner(info.name, { color: info.color, life: 1.1 });
    sfx.powerup();
    vibrate(20);
    pu.pickup = null;
  }

  function startEvent(force) {
    const pool = Object.keys(EVENTS).filter((e) => e !== pu.lastEvent);
    const e = force || pick(pool), info = EVENTS[e];
    pu.event = e;
    pu.lastEvent = e;
    pu.eventT = info.dur || 30;
    banner(info.name, { color: info.color, life: 1.4 });
    sfx.event();
    if (e === 'weather') { phys.bV = 0.62; phys.bH = 1.1; }
    else if (e === 'wave') state.cheerT = info.dur;
    else if (e === 'zone') pu.zone = { x: rand(-3, 3), z: rand(-3.4, -2.2), r: 1.15, left: 3 };
    else if (e === 'doubles') {
      const side = player.x > 0 ? -1 : 1;
      mate = makeFig('player', { x: side * 6, z: -4.6 });
      mate.side = side;
      mate.tx = side * 2.6;
      opp2 = makeFig('opp', { x: -side * 6, z: 4.8 });
      opp2.side = -side;
      opp2.tx = -side * 2.6;
    }
  }

  function endEvent() {
    const e = pu.event;
    pu.event = null;
    phys.bV = 1;
    phys.bH = 1;
    pu.zone = null;
    if (e === 'doubles') {
      [mate, opp2].forEach((f) => f && startExit(f));
      banner('DOUBLES OVER!', { color: '#e9ff3b', life: 1.3 });
      sfx.event();
    }
  }

  // Doubles partners leave through the gap in the side glass by the net, hop the boards and run up into the crowd.
  function startExit(f) {
    const s = f.side, back = f === mate ? -1 : 1, zd = 0.9 * back;
    f.leaving = true;
    f.exitT = 0;
    f.swing = null;
    f.prep = null;
    f.path = [[s * 4.3, zd], [s * 6.5, zd], [s * 8.2, zd + 0.5 * back], [s * 10, zd + 1.2 * back], [s * 11.4, zd + 2 * back]];
    f.pi = 0;
    worldLabel('SEE YA!', f, '#e9ff3b');
  }
  // Height of the ground (boards and stands) at a distance from the centre line.
  function exitHeight(ax) {
    if (ax < 6.5) return 0;
    if (ax < 7.6) { const t = (ax - 6.5) / 1.1; return 0.9 * t + 0.75 * Math.sin(Math.PI * t); }
    return 0.9 + 0.6 * (ax - 7.6);
  }

  function scorePlus(n) {
    fx.labels.push({ text: '+' + n, x: W / 2 + (W >= 400 ? 34 : 24), y: hudTop + 4, c: '#e9ff3b', life: 0.8, max: 0.8 });
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

    if (!feed && state.mode === 'play' && pu.zone && Math.random() < 0.65) {
      kind = 'floater';
      tx = pu.zone.x + rand(-0.4, 0.4);
    }

    let tz = -6.8, T = 1.55, bV = 0.72, bH = 0.86, label = null;
    if (kind === 'floater') { tz = pu.zone.z + rand(-0.3, 0.3); T = 1.75; }
    else if (kind === 'drive') { tz = rand(-7.8, -5.2); T = lerp(1.4, 1.22, d); }
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
    if (vs.on) { vsLosePoint(reason); return; }
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
      countdown: 1.8, lastCount: 0, newBest: false, scorePop: 0, hits: 0
    });
    resetPowerUps();
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
    $('over-hits').textContent = state.hits;
    $('over-new').hidden = !state.newBest;
    setBestText();
    showScreen('over');
    updateHudButtons();
    const again = $('btn-again');
    if (again && !matchMedia('(pointer: coarse)').matches) again.focus({ preventScroll: true });
  }

  function resetPowerUps() {
    Object.assign(pu, freshPU());
    phys.bV = 1;
    phys.bH = 1;
    mate = null;
    opp2 = null;
  }

  function toAttract() {
    showScreen('title');
    resetCourt();
    resetPowerUps();
    state.mode = 'attract';
    state.feedTimer = 0.8;
    updateHudButtons();
  }

  function setPaused(p) {
    if ((state.mode !== 'play' && state.mode !== 'countdown') || vs.on) p = false;
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
    const inGame = (state.mode === 'play' || state.mode === 'countdown') && !vs.on;
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

  // ------------------------------------------------------------------ 1v1: linking up
  const VS_HASH = /^#vs-([A-HJ-NP-Z2-9]{4})$/i;
  const vsEl = {
    heading: $('vs-heading'), msg: $('vs-msg'), code: $('vs-code'), status: $('vs-status'), tip: $('vs-tip'),
    share: $('btn-vs-share'), back: $('btn-vs-back'),
    oKicker: $('vso-kicker'), oHeading: $('vso-heading'), oScore: $('vso-score'), oStatus: $('vso-status'), rematch: $('btn-rematch')
  };
  const VS_ERRORS = {
    notfound: "THAT GAME HAS FINISHED OR THE LINK IS WRONG. ASK YOUR FRIEND FOR A NEW ONE.",
    timeout: "COULDN'T REACH YOUR FRIEND. CHECK YOU'RE BOTH ONLINE AND TRY AGAIN.",
    offline: "COULDN'T CONNECT. CHECK YOUR INTERNET AND TRY AGAIN.",
    failed: "SOMETHING WENT WRONG. TRY AGAIN."
  };

  function vsScreen(o) {
    vsEl.heading.textContent = o.heading || 'PLAY A FRIEND';
    vsEl.msg.textContent = o.msg || '';
    vsEl.code.hidden = !o.code;
    vsEl.code.textContent = o.code || '';
    vsEl.status.textContent = o.status || '';
    vsEl.status.className = 'vs-status' + (o.wait ? ' is-waiting' : '') + (o.bad ? ' is-bad' : '');
    vsEl.tip.hidden = !!o.bad;
    vsEl.share.hidden = !o.code;
    vsEl.share.textContent = navigator.share ? 'SEND LINK' : 'COPY LINK';
    showScreen('vs');
  }

  const vsUrl = (code) => location.origin + location.pathname + '#vs-' + code;

  function vsHost() {
    Sound.unlock();
    sfx.click();
    vsScreen({ msg: 'GETTING YOUR LINK...', wait: true });
    vs.pending = PP.Net.host({
      code(c) {
        vs.code = c;
        vsScreen({
          msg: 'SEND YOUR FRIEND THIS LINK. THE MATCH STARTS AS SOON AS THEY OPEN IT.',
          code: c, status: 'WAITING FOR YOUR FRIEND...', wait: true
        });
      },
      open(link) { vsConnected(link, 'host'); },
      error(kind) { vsScreen({ msg: VS_ERRORS[kind] || VS_ERRORS.failed, status: 'NO MATCH', bad: true }); }
    });
  }

  function vsJoin(code) {
    history.replaceState(null, '', location.pathname + location.search);
    vsScreen({ msg: "JOINING YOUR FRIEND'S MATCH...", status: 'CONNECTING...', wait: true });
    vs.pending = PP.Net.join(code.toUpperCase(), {
      open(link) { vsConnected(link, 'guest'); },
      error(kind) { vsScreen({ msg: VS_ERRORS[kind] || VS_ERRORS.failed, status: 'NO MATCH', bad: true }); }
    });
  }

  function vsShare() {
    Sound.unlock();
    const url = vsUrl(vs.code);
    if (navigator.share) {
      navigator.share({ title: 'CUPTC Padel Pong', text: 'Play me at Padel Pong! First to 7.', url: url }).catch(() => {});
      return;
    }
    const done = () => { vsEl.share.textContent = 'COPIED!'; setTimeout(() => { vsEl.share.textContent = 'COPY LINK'; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => window.prompt('Copy this link', url));
    else window.prompt('Copy this link', url);
  }

  // Back to the one-player game, with everything reset.
  function vsLeave() {
    if (vs.pending) vs.pending.cancel();
    if (vs.link) { vs.link.send({ t: 'bye' }); vs.link.close(); }
    location.replace(location.pathname + location.search);
  }

  function vsConnected(link, role) {
    vs.pending = null;
    vs.on = true;
    vs.role = role;
    vs.link = link;
    vs.first = true;
    vs.lastRx = performance.now();
    link.onmessage = vsOnMessage;
    link.onclose = () => vsLost('YOUR FRIEND LEFT THE MATCH.');
    window.addEventListener('pagehide', () => { if (vs.link) vs.link.send({ t: 'bye' }); });
    vsStartMatch();
  }

  function vsLost(msg) {
    if (!vs.on) return;
    vs.on = false;
    if (vs.link) vs.link.close();
    vs.link = null;
    state.mode = 'over';
    ball.live = false;
    ball.visible = false;
    marker = null;
    fx.banner = null;
    updateHudButtons();
    vsScreen({ heading: 'MATCH OVER', msg: msg + ' SCORE ' + vs.me + '-' + vs.them + '.', status: 'DISCONNECTED', bad: true });
  }

  // ------------------------------------------------------------------ 1v1: the match
  const vsIServe = () => ((vs.me + vs.them) % 2 === 0) === (vs.role === 'host');
  function vsSpeed() {
    state.speed = 1.12 + 1.3 * (1 - Math.exp(-state.hits / 12));
  }

  function vsStartMatch() {
    showScreen(null);
    resetCourt();
    resetPowerUps();
    vs.me = 0;
    vs.them = 0;
    vs.again = false;
    vs.theirAgain = false;
    fx.labels.length = 0;
    fx.banner = null;
    input.drag = null;
    vsNextPoint();
    if (vs.first) state.countdown = 3;
    vs.first = false;
  }

  function vsNextPoint() {
    Object.assign(state, {
      mode: 'countdown', paused: false, score: 0, hits: 0, speed: 1.12, level: 0, hitstop: 0, slowmo: 1,
      cheerT: 0, countdown: 1.8, lastCount: 0
    });
    ball.live = false;
    ball.visible = false;
    trail.length = 0;
    marker = null;
    opp.cheer = 0;
    player.cheer = 0;
    updateHudButtons();
  }

  function vsServe() {
    ball.x = clamp(player.x + 0.4, -4.5, 4.5);
    ball.y = 1.0;
    ball.z = player.z + 0.3;
    ball.side = -1;
    ball.bounces = 0;
    ball.wallHits = 0;
    ball.live = true;
    ball.visible = true;
    trail.length = 0;
    launch(ball, rand(-2.8, 2.8), rand(6.4, 8.6), 1.45, 1.05);
    ball.lastHit = 'player';
    ball.bV = 0.72;
    ball.bH = 0.86;
    player.swing = 'fh';
    player.swingT = 0;
    player.prep = null;
    state.hits = 1;
    vsSpeed();
    sfx.hit(1);
    vsSendHit('fh');
  }

  const r3 = (v) => Math.round(v * 1000) / 1000;
  function vsSendHit(swing) {
    if (!vs.link) return;
    vs.link.send({
      t: 'h', sw: swing, n: state.hits, sp: r3(state.speed),
      b: [ball.x, ball.y, ball.z, ball.vx, ball.vy, ball.vz, ball.bV, ball.bH].map(r3)
    });
  }

  // The friend hit the ball: take it from their racket, turned round to our end of the court.
  function vsOnHit(m) {
    if (state.mode === 'over' || state.mode === 'attract') return;
    if (state.mode === 'missed') vsNextPoint();
    if (state.mode !== 'play') { state.mode = 'play'; fx.banner = null; updateHudButtons(); }
    const b = m.b;
    Object.assign(ball, {
      x: -b[0], y: b[1], z: -b[2], vx: -b[3], vy: b[4], vz: -b[5], bV: b[6], bH: b[7],
      side: -b[2] < 0 ? -1 : 1, bounces: 0, wallHits: 0, lastHit: 'opp', live: true, visible: true
    });
    trail.length = 0;
    state.hits = m.n;
    state.speed = m.sp;
    // catch up the time the message spent travelling
    let lag = Math.min(0.15, vs.rtt / 2) * state.speed;
    while (lag > 0) {
      stepBall(ball, Math.min(1 / 240, lag), null);
      lag -= 1 / 240;
    }
    opp.swing = m.sw;
    opp.swingT = 0;
    opp.prep = null;
    if (m.sw === 'sm') {
      sfx.smash();
      shake(2, 0.15);
      worldLabel(pick(['VIBORA!', 'BANDEJA!', 'REMATE!']), opp, '#ff7eb6');
    } else {
      sfx.oppHit();
    }
    const p = scene.project(ball.x, ball.y, ball.z);
    sparks(p.x, p.y, 6, ['#ffffff', '#ff7eb6'], 30, 70);
    updateMarker();
    if (DEBUG_AUTO) planPlayerAI();
  }

  function vsLosePoint(reason) {
    vs.them++;
    if (vs.link) vs.link.send({ t: 'pt' });
    state.mode = 'missed';
    state.missTimer = 1.8;
    state.slowmo = 0.3;
    state.scorePop = 0.16;
    opp.cheer = 2.5;
    sfx.miss();
    shake(5, 0.4);
    vibrate(90);
    banner(reason, { color: '#ff4d6d', life: 1.6 });
  }

  function vsWinPoint() {
    if (state.mode === 'over' || state.mode === 'missed') return;
    vs.me++;
    state.mode = 'missed';
    state.missTimer = 1.8;
    state.slowmo = 1;
    state.scorePop = 0.16;
    state.cheerT = 1.4;
    player.cheer = 2;
    marker = null;
    sfx.milestone();
    vibrate(30);
    banner(vs.me >= VS_TARGET ? 'MATCH POINT WON!' : 'POINT!', { color: '#e9ff3b', life: 1.6 });
  }

  function vsMatchOver() {
    const won = vs.me > vs.them;
    state.mode = 'over';
    state.slowmo = 1;
    ball.live = false;
    ball.visible = false;
    marker = null;
    vsEl.oKicker.textContent = 'MATCH OVER';
    vsEl.oKicker.className = 'kicker' + (won ? '' : ' kicker--red');
    vsEl.oHeading.textContent = won ? 'YOU WIN!' : 'YOU LOSE';
    vsEl.oScore.textContent = vs.me + '-' + vs.them;
    vsEl.oStatus.textContent = '';
    vsEl.oStatus.className = 'vs-status';
    vsEl.rematch.hidden = false;
    vsEl.rematch.disabled = false;
    if (won) { confetti(W > 400 ? 90 : 60); state.cheerT = 2; player.cheer = 3; }
    else opp.cheer = 3;
    showScreen('vsover');
    updateHudButtons();
  }

  function vsRematch() {
    if (!vs.on || vs.again) return;
    Sound.unlock();
    sfx.click();
    vs.again = true;
    vs.link.send({ t: 'again' });
    if (vs.theirAgain) { vsStartMatch(); return; }
    vsEl.rematch.disabled = true;
    vsEl.oStatus.textContent = 'WAITING FOR YOUR FRIEND...';
    vsEl.oStatus.className = 'vs-status is-waiting';
  }

  function vsOnMessage(m) {
    if (!vs.on || !m || typeof m !== 'object') return;
    vs.lastRx = performance.now();
    if (m.t === 'p') {
      opp.tx = clamp(-m.x, OB.x0, OB.x1);
      opp.tz = clamp(-m.z, OB.z0, OB.z1);
    } else if (m.t === 'h') {
      vsOnHit(m);
    } else if (m.t === 'pt') {
      vsWinPoint();
    } else if (m.t === 'ping') {
      vs.link.send({ t: 'pong', s: m.s });
    } else if (m.t === 'pong') {
      const rtt = (performance.now() - m.s) / 1000;
      if (rtt >= 0 && rtt < 5) vs.rtt = vs.rtt * 0.7 + rtt * 0.3;
    } else if (m.t === 'again') {
      vs.theirAgain = true;
      if (vs.again && state.mode === 'over') vsStartMatch();
      else if (state.mode === 'over') {
        vsEl.oStatus.textContent = 'YOUR FRIEND WANTS A REMATCH!';
        vsEl.oStatus.className = 'vs-status is-waiting';
      }
    } else if (m.t === 'bye') {
      vsLost('YOUR FRIEND LEFT THE MATCH.');
    }
  }

  // Send our position, keep the lag estimate fresh, and notice if the friend has gone quiet.
  function vsTick(dt) {
    if (!vs.link) return;
    vs.posT -= dt;
    if (vs.posT <= 0) {
      vs.posT = 0.05;
      vs.link.send({ t: 'p', x: r3(player.x), z: r3(player.z) });
    }
    vs.pingT -= dt;
    if (vs.pingT <= 0) {
      vs.pingT = 1;
      vs.link.send({ t: 'ping', s: performance.now() });
    }
    if (performance.now() - vs.lastRx > 10000) vsLost('LOST THE CONNECTION TO YOUR FRIEND.');
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
    if (vs.on || !scr.vs.hidden) {
      if (e.code === 'KeyM') toggleMute();
      return;
    }
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
  $('btn-vs').addEventListener('click', (e) => { e.stopPropagation(); vsHost(); });
  vsEl.share.addEventListener('click', vsShare);
  vsEl.back.addEventListener('click', vsLeave);
  vsEl.rematch.addEventListener('click', vsRematch);
  $('btn-vs-leave').addEventListener('click', vsLeave);
  $('btn-resume').addEventListener('click', () => setPaused(false));
  btnPause.addEventListener('click', () => { Sound.unlock(); setPaused(!state.paused); });
  btnSound.addEventListener('click', toggleMute);
  const shareBtn = $('btn-share');
  if (navigator.share && shareBtn) {
    shareBtn.hidden = false;
    shareBtn.addEventListener('click', () => {
      navigator.share({
        title: 'CUPTC Padel Pong',
        text: 'I scored ' + state.score + ' in CUPTC Padel Pong with a ' + state.hits + '-hit rally. Beat that!',
        url: location.href
      }).catch(() => {});
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && controllable() && !vs.on) setPaused(true);
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
    if (vs.on) {
      // the friend's player follows the positions their phone sends
      if (!opp.swing && ball.live && ball.lastHit === 'player' && ball.z > -2) {
        const d = Math.hypot(ball.x - opp.x, ball.z - opp.z);
        opp.prep = ball.y > 2.1 && d < 3.5 ? 'sm' : ball.x <= opp.x ? 'fh' : 'bh';
      } else if (!opp.swing) {
        opp.prep = null;
      }
      const dv = towards(opp, 16);
      steerFig(opp, dv[0], dv[1], dt, 110);
      opp.x = clamp(opp.x, OB.x0, OB.x1);
      opp.z = clamp(opp.z, OB.z0, OB.z1);
      return;
    }
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
        if (ball.z < 0.2 && ball.y < reachH() && Math.hypot(ball.x - player.x, ball.z - player.z) < reach()) {
          playerHit(player);
          continue;
        }
        if (mate && !mate.leaving && ball.z < 0.2 && ball.y < REACH_H && Math.hypot(ball.x - mate.x, ball.z - mate.z) < REACH) {
          playerHit(mate);
          continue;
        }
        if (ball.side < 0 && ball.bounces >= 2) {
          if (pu.guardian && state.mode === 'play') guardianSave();
          else { miss('DOUBLE BOUNCE!'); continue; }
        }
      } else if (canPlay && ball.lastHit === 'player' && !vs.on) {
        if (oppContact(ball) || (ball.side > 0 && ball.bounces >= 2)) oppHit(false);
      }
      if (ball.y < -1 || Math.abs(ball.x) > 12 || Math.abs(ball.z) > 16) {
        if (ball.lastHit === 'opp') miss('MISSED!');
        ball.live = false;
      }
    }
  }

  // Glass Guardian: the ball that would have died pops back up off the glass.
  function guardianSave() {
    pu.guardian = false;
    ball.bounces = 1;
    ball.y = Math.max(ball.y, 0.3);
    ball.vy = 6.2;
    ball.vz = Math.max(ball.vz, 1.6);
    ball.vx *= 0.5;
    const p = scene.project(ball.x, ball.y, ball.z);
    sparks(p.x, p.y, 18, ['#ffc93a', '#fff4c2', '#ffffff'], 40, 120);
    ring(p.x, p.y, 16, '#ffc93a', 0.35);
    worldLabel('SAVED!', player, '#ffc93a');
    sfx.glass();
    sfx.powerup();
    updateMarker();
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
        if (!vs.on) feed();
        else if (vsIServe()) vsServe();
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
      if (state.missTimer <= 0) {
        if (!vs.on) gameOver();
        else if (vs.me >= VS_TARGET || vs.them >= VS_TARGET) vsMatchOver();
        else vsNextPoint();
      }
    }

    const dtLocal = dt * state.slowmo;
    const worldDt = dtLocal * state.speed;
    updatePlayer(dtLocal);
    updateOpp(vs.on ? dt : worldDt);
    if (vs.on) vsTick(dt);
    updatePowerUps(dt, dtLocal, worldDt);
    for (const f of [player, opp, mate, opp2]) {
      if (f && f.swing) {
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

  function updatePowerUps(dt, dtLocal, worldDt) {
    if (state.mode !== 'play' || vs.on) return;
    // pickups
    if (pu.pickup) {
      pu.pickup.t += dt;
      if (pu.pickup.t > pu.pickup.life) pu.pickup = null;
      else if (Math.hypot(player.x - pu.pickup.x, player.z - pu.pickup.z) < 0.8) collectPickup();
    }
    // timed events
    if (pu.event && EVENTS[pu.event].dur) {
      pu.eventT -= dt;
      if (pu.eventT <= 0) endEvent();
    }
    // doubles partners
    for (const f of [mate, opp2]) {
      if (!f) continue;
      if (f.leaving) {
        f.exitT += dt;
        const gone = () => { if (f === mate) mate = null; else opp2 = null; };
        if (f.fade != null) {
          // swallowed by the crowd
          f.fade -= dt * 1.25;
          f.y = exitHeight(Math.abs(f.x)) + (1 - f.fade) * 0.25;
          if (f.fade <= 0) gone();
          continue;
        }
        if (f.exitT > 7) { gone(); continue; }
        const [wx, wz] = f.path[f.pi];
        f.tx = wx;
        f.tz = wz;
        if (Math.hypot(wx - f.x, wz - f.z) < 0.4) {
          f.pi++;
          if (f.pi >= f.path.length) {
            f.fade = 1;
            const p = scene.project(f.x, f.y + 1, f.z);
            sparks(p.x, p.y, 34, ['#df2326', '#ffffff', '#85b4a0', '#e9ff3b'], 70, 190);
            ring(p.x, p.y, 22, '#ffffff', 0.5);
            worldLabel('WOO!', f, '#ffffff');
            state.cheerT = Math.max(state.cheerT, 1.8);
            continue;
          }
        }
        f.y = exitHeight(Math.abs(f.x));
      } else if (f === mate) {
        const lo = f.side > 0 ? 0.4 : -4.6, hi = f.side > 0 ? 4.6 : -0.4;
        f.tx = ball.lastHit === 'opp' && ball.live ? clamp(ball.x, lo, hi) : f.side * 2.6;
        f.tz = -4.6;
      } else {
        const lo = f.side > 0 ? 0.4 : -4.6, hi = f.side > 0 ? 4.6 : -0.4;
        f.tx = ball.lastHit === 'player' && ball.live ? clamp(ball.x, lo, hi) : f.side * 2.6;
        f.tz = 4.8;
      }
      // sprint across the court, then a slower scramble up the stands so you can watch them go
      const dv = towards(f, f.leaving ? (Math.abs(f.x) > 7.6 ? 4.2 : 9.5) : f === mate ? 7.5 : 8);
      steerFig(f, dv[0], dv[1], f === mate ? dtLocal : worldDt, 60);
      if (f.leaving) f.prep = null;
      else if (f === mate && !f.swing && ball.live && ball.lastHit === 'opp' && ball.z < 2) f.prep = ball.x >= f.x ? 'fh' : 'bh';
      else if (!f.swing) f.prep = null;
    }
    // rain
    if (pu.event === 'weather') {
      const want = Math.floor((W * H) / 700);
      while (rain.length < want) rain.push({ x: rand(0, W + 40), y: rand(-H, H), v: rand(150, 230) });
      for (const d of rain) {
        d.y += d.v * dt;
        d.x -= d.v * 0.22 * dt;
        if (d.y > H) {
          if (Math.random() < 0.15 && d.y > scene.hb) dust(d.x, H - rand(0, H * 0.6), 1, '#dce9ff');
          d.y = rand(-40, 0);
          d.x = rand(0, W + 40);
        }
      }
    } else if (rain.length) {
      rain.length = 0;
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

  // 9x9 pixel icons for pickups and the HUD
  const ICON_PAL = { k: '#1a1c2c', w: '#ffffff', s: '#d9e2ec', b: '#6b3e26', g: '#85b4a0', G: '#4f8069', y: '#ffc93a', Y: '#c98a12', l: '#fff4c2' };
  const ICON_ART = {
    big: ['..kkkk...', '.kgGgGk..', 'kgGgGgGk.', 'kGgGgGgk.', 'kgGgGgGk.', '.kgGgGk..', '..kkkk...', '...kk....', '...kk....'],
    guardian: ['.kkkkkkk.', 'kyyyyyyYk', 'kylyyyyYk', 'kyylyyyYk', 'kyyylyyYk', 'kyyyyyyYk', '.kyyyyYk.', '..kyyYk..', '...kkk...'],
  };
  const iconCache = {};
  function icon(name) {
    if (iconCache[name]) return iconCache[name];
    const art = ICON_ART[name];
    const c = document.createElement('canvas');
    c.width = 9;
    c.height = 9;
    const g = c.getContext('2d');
    art.forEach((row, y) => {
      for (let x = 0; x < 9; x++) {
        if (row[x] === '.') continue;
        g.fillStyle = ICON_PAL[row[x]];
        g.fillRect(x, y, 1, 1);
      }
    });
    iconCache[name] = c;
    return c;
  }

  function floorRing(x, z, R, color, n) {
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = scene.project(x + Math.cos(a) * R, 0, z + Math.sin(a) * R);
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
  }

  function drawPickup(ox, oy) {
    const pk = pu.pickup;
    const left = pk.life - pk.t;
    if (left < 2 && Math.floor(state.time * 10) % 2) return;
    const info = PICKUPS[pk.type];
    ctx.save();
    ctx.translate(ox, oy);
    floorRing(pk.x, pk.z, 0.45 + 0.08 * Math.sin(state.time * 6), info.color, 18);
    const g = scene.project(pk.x, 0, pk.z);
    ellipse(g.x, g.y, 5, 2, 'rgba(10, 16, 60, 0.35)');
    const p = scene.project(pk.x, 0.55 + 0.12 * Math.sin(state.time * 4), pk.z);
    const sc = W >= 400 ? 3 : 2;
    ctx.drawImage(icon(pk.type), Math.round(p.x - 4.5 * sc), Math.round(p.y - 9 * sc), 9 * sc, 9 * sc);
    ctx.restore();
  }

  function drawZone(ox, oy) {
    const z = pu.zone;
    ctx.save();
    ctx.translate(ox, oy);
    const pulse = Math.floor(state.time * 8) % 2;
    floorRing(z.x, z.z, z.r, pulse ? '#ffc93a' : '#fff4c2', 36);
    floorRing(z.x, z.z, z.r * 0.6, '#ffc93a', 20);
    ctx.restore();
  }

  function drawGuardian(ox, oy) {
    ctx.save();
    ctx.translate(ox, oy);
    ctx.fillStyle = Math.floor(state.time * 6) % 2 ? '#ffc93a' : '#fff4c2';
    for (let x = -5; x <= 5; x += 0.2) {
      const a = scene.project(x, 0, -9.92), b = scene.project(x, 1.2 + 0.2 * Math.sin(x * 2 + state.time * 5), -9.92);
      ctx.fillRect(Math.round(a.x), Math.round(b.y), 1, Math.max(1, Math.round(a.y - b.y)));
    }
    ctx.restore();
  }

  function drawRain() {
    ctx.fillStyle = 'rgba(40, 52, 66, 0.16)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(214, 226, 240, 0.8)';
    for (const d of rain) ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 3);
  }

  function drawFigShadow(f, ox, oy) {
    if (f.y > 0.05) return;
    const p = scene.project(f.x, 0, f.z);
    const rx = 0.36 * p.s * EXAG;
    ellipse(p.x + ox, p.y + oy, rx, Math.max(1, rx * floorSquash(f.x, f.z)), 'rgba(10, 16, 60, 0.38)');
  }

  function drawFig(f, ox, oy) {
    const p = scene.project(f.x, f.y || 0, f.z);
    const ps = figPose(f);
    const spr = Sprites.get(f.who, p.s * EXAG, ps.pose, ps.legs, ps.frame, f === player && pu.big > 0);
    if (f.fade != null) ctx.globalAlpha = Math.max(0, f.fade);
    ctx.drawImage(spr.c, Math.round(p.x - spr.ax) + ox, Math.round(p.y - spr.ay) + oy - ps.hop * 2);
    ctx.globalAlpha = 1;
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
    const spr = Sprites.ball(r, false);
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
    if (inGame && vs.on) {
      const big = W >= 400 ? 4 : 3;
      const pop = state.scorePop > 0 ? 1 : 0;
      drawText(vs.me + '-' + vs.them, W / 2, hudTop - pop * 2, {
        scale: big + pop, color: '#ffffff', color2: pop ? '#e9ff3b' : '#cfeee0'
      });
      drawText('YOU - FRIEND', W / 2, hudTop + 7 * big + 5, { scale: 1, color: '#b6d8c9' });
    } else if (inGame) {
      const big = W >= 400 ? 4 : 3;
      const pop = state.scorePop > 0 ? 1 : 0;
      drawText(String(state.score), W / 2, hudTop - pop * 2, {
        scale: big + pop, color: '#ffffff', color2: pop ? '#e9ff3b' : '#cfeee0'
      });
      drawText('BEST ' + Math.max(state.best, state.score), W / 2, hudTop + 7 * big + 5, { scale: 1, color: '#b6d8c9' });
      drawPowerHud(hudTop + 7 * big + 16, big);
    }

    const midY = Math.round(H * 0.4);
    if (state.mode === 'countdown') {
      const n = Math.max(1, Math.ceil(state.countdown / 0.6));
      const t = (state.countdown % 0.6) / 0.6;
      const s = (u === 2 ? 7 : 5) + (t > 0.8 ? 1 : 0);
      drawText(String(n), W / 2, midY - (7 * s) / 2, { scale: s, color: '#ffffff', color2: '#e9ff3b' });
      const sub = !vs.on ? 'GET READY' : vsIServe() ? 'YOUR SERVE' : 'FRIEND SERVES';
      drawText(sub, W / 2, midY + (7 * s) / 2 + 8, { scale: u, color: '#ffffff' });
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
      ctx.fillStyle = 'rgba(8, 22, 17, 0.45)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  // Active power-ups, event timer and the combo multiplier.
  function drawPowerHud(y, big) {
    const mult = pu.streak >= 10 ? 3 : pu.streak >= 5 ? 2 : 1;
    if (mult > 1) {
      const sw = Font.width(String(state.score), big);
      drawText('X' + mult, W / 2 + sw / 2 + 6, hudTop + 2, { scale: 2, color: '#e9ff3b' }, 'left');
    }
    const items = [];
    if (pu.big > 0) items.push({ icon: 'big', n: pu.big });
    if (pu.guardian) items.push({ icon: 'guardian', n: '' });
    if (pu.event) {
      const info = EVENTS[pu.event];
      let label = info.name.replace('!', '').split(' ')[0];
      let n = info.dur ? Math.ceil(pu.eventT) : '';
      if (pu.event === 'zone') { label = 'ZONE'; n = pu.zone ? pu.zone.left : ''; }
      items.push({ text: label, n: n, color: info.color });
    }
    const parts = items.map((it) => {
      const t = it.n === '' ? null : Font.render(String(it.n), { scale: 1, color: '#ffffff' });
      const lbl = it.text ? Font.render(it.text, { scale: 1, color: it.color }) : null;
      const w = (it.icon ? 9 : lbl.width) + (t ? t.width + 2 : 0);
      return { it: it, t: t, lbl: lbl, w: w };
    });
    const total = parts.reduce((a, p) => a + p.w, 0) + Math.max(0, parts.length - 1) * 6;
    let x = Math.round(W / 2 - total / 2);
    for (const p of parts) {
      if (p.it.icon) { ctx.drawImage(icon(p.it.icon), x, y); x += 9; }
      else { ctx.drawImage(p.lbl, x, y); x += p.lbl.width; }
      if (p.t) { ctx.drawImage(p.t, x + 2, y + 1); x += p.t.width + 2; }
      x += 6;
    }
  }

  function render() {
    if (!scene) return;
    const M = scene.M;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scene.sky, 0, 0);
    for (const c of clouds) ctx.drawImage(c.c, Math.round(c.x), c.y);
    if (pu.event === 'weather') {
      ctx.fillStyle = 'rgba(96, 108, 120, 0.4)';
      ctx.fillRect(0, 0, W, scene.hb);
    }

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
    [mate, opp2].forEach((f) => f && add(f.z, () => drawFigShadow(f, ox, oy), () => drawFig(f, ox, oy)));
    if (ball.visible) add(ball.z, () => drawBallShadow(ox, oy), () => drawBall(ox, oy));
    const drawSide = (list) => {
      list.sort((a, b) => b.z - a.z);
      list.forEach((o) => o.shadow());
      list.forEach((o) => o.draw());
    };
    drawSide(far);
    ctx.drawImage(scene.net, -M + ox, -M + oy);
    if (marker && state.mode !== 'attract') drawMarker(ox, oy);
    if (pu.zone) drawZone(ox, oy);
    if (pu.guardian) drawGuardian(ox, oy);
    if (pu.pickup) near.push({ z: pu.pickup.z, shadow: () => {}, draw: () => drawPickup(ox, oy) });
    drawSide(near);
    drawFx(ox, oy);
    if (pu.event === 'weather') drawRain();

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
    const dt = Math.min(vs.on ? 0.1 : 0.05, Math.max(0, (now - last) / 1000));
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
  const vsMatch = VS_HASH.exec(location.hash);
  if (vsMatch) vsJoin(vsMatch[1]);

  if (/[?&]debug\b/.test(location.search)) {
    window.__padel = {
      state: state, ball: ball, player: player, opp: opp, startGame: startGame, scene: () => scene,
      predict: (fn) => predict(ball, fn || aiPlayerContact, 5),
      pu: pu, vs: vs,
      startEvent: (e) => { if (pu.event) endEvent(); startEvent(e); },
      endEvent: () => { if (pu.event) endEvent(); },
      spawnPickup: (t) => spawnPickup(t),
      collect: () => { if (pu.pickup) { player.tx = pu.pickup.x; player.tz = pu.pickup.z; } }
    };
  }
})();
