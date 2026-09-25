/* Padel Pong — procedural 16-bit sprites.
 * Figures are drawn from a simple skeleton at whatever scale the camera needs,
 * rasterised without anti-aliasing and given a 1px outline, then cached. */
(function () {
  'use strict';
  const PP = (window.PP = window.PP || {});

  const PAL = [
    null,       // 0  transparent
    '#1a1c2c',  // 1  outline
    '#ffffff',  // 2  white
    '#c9d3e6',  // 3  white shade
    '#85b4a0',  // 4  club green (logo)
    '#4f8069',  // 5  club green dark
    '#f3c19b',  // 6  skin
    '#d8966c',  // 7  skin shade
    '#6b3e26',  // 8  hair
    '#442617',  // 9  hair dark
    '#df2326',  // 10 lion red (logo)
    '#9c1719',  // 11 red dark
    '#2a3c80',  // 12 navy
    '#1b2656',  // 13 navy dark
    '#23262f',  // 14 racket frame
    '#8f98ad',  // 15 sole grey
    '#e2a376',  // 16 skin 2
    '#b67650',  // 17 skin 2 shade
    '#2a1d16',  // 18 hair 2
    '#e9ff3b',  // 19 ball
    '#a9c40c',  // 20 ball shade
    '#fbffd6'   // 21 ball highlight
  ];
  const RGB = PAL.map((h) => (h ? [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] : null));
  const OUTLINE = 1;
  const TMP_SHOE = 60;

  const KITS = {
    player: {
      shirt: 2, shirtS: 3, collar: 4, shorts: 2, shortsS: 3, skin: 6, skinS: 7,
      hair: 8, hairS: 9, face: 4, faceS: 5, sock: 2, shoe: 2, sole: 5, band: 0
    },
    opp: {
      shirt: 10, shirtS: 11, collar: 2, shorts: 12, shortsS: 13, skin: 16, skinS: 17,
      hair: 18, hairS: 18, face: 10, faceS: 11, sock: 2, shoe: 2, sole: 15, band: 2
    }
  };

  // Hand positions (h), racket angle in degrees (a) and free hand (f), in body space:
  // metres, +x towards the racket side, +y up.
  const POSES = {
    ready:     { h: [0.33, 0.96], a: 58, f: [-0.27, 0.87] },
    fh_prep:   { h: [0.46, 1.24], a: 70, f: [-0.36, 1.02] },
    fh_hit:    { h: [0.52, 1.12], a: 8, f: [-0.34, 0.98] },
    fh_follow: { h: [-0.14, 1.46], a: 150, f: [-0.30, 0.92] },
    bh_prep:   { h: [-0.40, 1.22], a: 110, f: [-0.36, 1.10] },
    bh_hit:    { h: [-0.52, 1.12], a: 172, f: [-0.28, 0.92] },
    bh_follow: { h: [0.26, 1.46], a: 30, f: [-0.30, 0.90] },
    sm_prep:   { h: [0.30, 1.76], a: -105, f: [-0.24, 1.90] },
    sm_hit:    { h: [0.18, 2.10], a: 84, f: [-0.26, 1.50] },
    sm_follow: { h: [-0.20, 1.00], a: 230, f: [-0.30, 0.95] },
    cheer:     { h: [0.30, 1.98], a: 80, f: [-0.30, 1.98] }
  };
  const RUN_FRAMES = 6;

  class Pix {
    constructor(w, h) {
      this.w = w;
      this.h = h;
      this.d = new Uint8Array(w * h);
    }
    put(x, y, c) {
      if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c;
    }
    get(x, y) {
      return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : 0;
    }
    capsule(x0, y0, x1, y1, r, c) {
      const minX = Math.floor(Math.min(x0, x1) - r), maxX = Math.ceil(Math.max(x0, x1) + r);
      const minY = Math.floor(Math.min(y0, y1) - r), maxY = Math.ceil(Math.max(y0, y1) + r);
      const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-9, r2 = r * r;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5, py = y + 0.5;
          let t = ((px - x0) * dx + (py - y0) * dy) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = x0 + t * dx - px, ey = y0 + t * dy - py;
          if (ex * ex + ey * ey <= r2) this.put(x, y, c);
        }
      }
    }
    circle(cx, cy, r, c) {
      this.capsule(cx, cy, cx, cy, r, c);
    }
    ellipse(cx, cy, ra, rb, ang, c) {
      const ca = Math.cos(ang), sa = Math.sin(ang), R = Math.max(ra, rb);
      for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
        for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
          const px = x + 0.5 - cx, py = y + 0.5 - cy;
          const u = px * ca + py * sa, v = -px * sa + py * ca;
          if ((u * u) / (ra * ra) + (v * v) / (rb * rb) <= 1) this.put(x, y, c);
        }
      }
    }
    poly(pts, c) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
        minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
      }
      for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
        for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
          const px = x + 0.5, py = y + 0.5;
          let inside = false;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
            if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
          }
          if (inside) this.put(x, y, c);
        }
      }
    }
    outline(c) {
      const src = this.d.slice(), w = this.w, h = this.h;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (src[y * w + x]) continue;
          if ((x > 0 && src[y * w + x - 1]) || (x < w - 1 && src[y * w + x + 1]) ||
              (y > 0 && src[(y - 1) * w + x]) || (y < h - 1 && src[(y + 1) * w + x])) {
            this.d[y * w + x] = c;
          }
        }
      }
    }
    toCanvas() {
      const c = document.createElement('canvas');
      c.width = this.w;
      c.height = this.h;
      const g = c.getContext('2d');
      const img = g.createImageData(this.w, this.h);
      for (let i = 0; i < this.d.length; i++) {
        const col = RGB[this.d[i]];
        if (!col) continue;
        img.data[i * 4] = col[0];
        img.data[i * 4 + 1] = col[1];
        img.data[i * 4 + 2] = col[2];
        img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      return c;
    }
  }

  function legPose(mode, frame) {
    if (mode === 'run') {
      const ph = (frame / RUN_FRAMES) * Math.PI * 2;
      const s = Math.sin(ph), c = Math.cos(ph);
      const liftL = Math.max(0, s) * 0.17, liftR = Math.max(0, -s) * 0.17;
      return {
        bob: 0.035 * Math.abs(s) - 0.01,
        L: { foot: [-0.11 + 0.03 * c, liftL], knee: [-0.125, 0.34 + liftL * 0.7] },
        R: { foot: [0.11 - 0.03 * c, liftR], knee: [0.125, 0.34 + liftR * 0.7] }
      };
    }
    if (mode === 'ready') {
      return {
        bob: -0.045,
        L: { foot: [-0.18, 0], knee: [-0.18, 0.31] },
        R: { foot: [0.18, 0], knee: [0.18, 0.31] }
      };
    }
    return {
      bob: 0,
      L: { foot: [-0.11, 0], knee: [-0.105, 0.34] },
      R: { foot: [0.11, 0], knee: [0.105, 0.34] }
    };
  }

  function drawFigure(who, k, poseName, legsMode, frame) {
    const kit = KITS[who];
    const back = who === 'player'; // player is seen from behind, opponent from the front
    const mir = back ? 1 : -1;     // screen direction of the racket hand
    const W = Math.ceil(k * 2.5) + 8, H = Math.ceil(k * 2.95) + 8;
    const px = new Pix(W, H);
    const ox = Math.floor(W / 2), oy = H - 3;
    const X = (x) => ox + x * k;
    const Y = (y) => oy - y * k;
    const R = (m, min) => Math.max(min === undefined ? 0.6 : min, m * k);

    const legs = legPose(legsMode, frame);
    let U = legs.bob;
    if (legsMode !== 'run' && frame % 2 === 1) U -= 1 / k; // idle breathing: 1px
    const base = POSES[poseName] || POSES.ready;
    let hand = base.h.slice(), free = base.f.slice();
    if (legsMode === 'run' && poseName === 'ready') {
      const sw = Math.sin((frame / RUN_FRAMES) * Math.PI * 2) * 0.08;
      hand = [0.33, 0.96 + sw];
      free = [-0.27, 0.9 - sw];
    }

    // ---- legs, socks, shoes
    [legs.L, legs.R].forEach((L, i) => {
      const side = i === 0 ? -1 : 1;
      const hip = [side * 0.095, 0.64 + U];
      px.capsule(X(hip[0]), Y(hip[1]), X(L.knee[0]), Y(L.knee[1] + U * 0.5), R(0.064), kit.skin);
      px.capsule(X(L.knee[0]), Y(L.knee[1] + U * 0.5), X(L.foot[0]), Y(L.foot[1] + 0.09), R(0.056), kit.skin);
      px.capsule(X(L.foot[0]), Y(L.foot[1] + 0.07), X(L.foot[0]), Y(L.foot[1] + 0.17), R(0.062), kit.sock);
      px.capsule(X(L.foot[0] - 0.035), Y(L.foot[1] + 0.05), X(L.foot[0] + 0.035), Y(L.foot[1] + 0.05), R(0.06), TMP_SHOE);
    });

    // ---- shorts
    px.poly([[X(-0.2), Y(0.9 + U)], [X(0.2), Y(0.9 + U)], [X(0.215), Y(0.575 + U)], [X(-0.215), Y(0.575 + U)]], kit.shorts);
    px.poly([[X(0.1), Y(0.9 + U)], [X(0.2), Y(0.9 + U)], [X(0.215), Y(0.575 + U)], [X(0.11), Y(0.575 + U)]], kit.shortsS);
    if (k >= 14) px.capsule(X(0), Y(0.575 + U), X(0), Y(0.66 + U), 0.5, kit.shortsS);

    // ---- arms
    function drawArm(shoulderBX, handB) {
      const S = [shoulderBX * mir, 1.34 + U];
      let Hd = [handB[0] * mir, handB[1] + U];
      const a = 0.27, b = 0.25;
      let dx = Hd[0] - S[0], dy = Hd[1] - S[1];
      let d = Math.hypot(dx, dy);
      const maxD = a + b - 0.001;
      if (d > maxD) {
        Hd = [S[0] + (dx * maxD) / d, S[1] + (dy * maxD) / d];
        dx = Hd[0] - S[0];
        dy = Hd[1] - S[1];
        d = maxD;
      }
      const cosA = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * Math.max(d, 1e-6))));
      const ang = Math.atan2(dy, dx) + Math.acos(cosA) * (S[0] >= 0 ? 1 : -1);
      const E = [S[0] + Math.cos(ang) * a, S[1] + Math.sin(ang) * a];
      px.capsule(X(S[0]), Y(S[1]), X(E[0]), Y(E[1]), R(0.052), kit.skin);
      px.capsule(X(E[0]), Y(E[1]), X(Hd[0]), Y(Hd[1]), R(0.048), kit.skin);
      const sl = [S[0] + (E[0] - S[0]) * 0.45, S[1] + (E[1] - S[1]) * 0.45];
      px.capsule(X(S[0]), Y(S[1]), X(sl[0]), Y(sl[1]), R(0.078), kit.shirt);
      px.circle(X(Hd[0]), Y(Hd[1]), R(0.054), kit.skin);
      return Hd;
    }

    function drawRacket(Hd, deg) {
      const th = (deg * Math.PI) / 180;
      const dx = Math.cos(th) * mir, dy = Math.sin(th);
      px.capsule(X(Hd[0] - dx * 0.04), Y(Hd[1] - dy * 0.04), X(Hd[0] + dx * 0.14), Y(Hd[1] + dy * 0.14), R(0.026, 0.55), 14);
      const c = [Hd[0] + dx * 0.29, Hd[1] + dy * 0.29];
      const ang = Math.atan2(-dy, dx);
      const ra = Math.max(1.6, 0.165 * k), rb = Math.max(1.2, 0.135 * k);
      px.ellipse(X(c[0]), Y(c[1]), ra, rb, ang, kit.face);
      if (ra >= 3) px.ellipse(X(c[0]) + 0.6 * Math.cos(ang), Y(c[1]) + 0.6 * Math.sin(ang), ra - 1.4, rb - 1.2, ang, kit.faceS);
      if (ra >= 3.4) {
        // the drilled holes of a padel racket
        for (let yy = -2; yy <= 2; yy++) {
          for (let xx = -2; xx <= 2; xx++) {
            if ((xx + yy) & 1) continue;
            const u = xx * 1.6, v = yy * 1.6;
            if ((u * u) / ((ra - 1.6) * (ra - 1.6)) + (v * v) / ((rb - 1.4) * (rb - 1.4)) > 1) continue;
            const hx = X(c[0]) + u * Math.cos(ang) - v * Math.sin(ang);
            const hy = Y(c[1]) + u * Math.sin(ang) + v * Math.cos(ang);
            px.put(Math.floor(hx), Math.floor(hy), OUTLINE);
          }
        }
      }
    }

    // free arm first so the torso overlaps the shoulder
    drawArm(-0.2, free);

    // At rest the racket is held at the side, partly behind the body, so it goes
    // under the torso instead of showing through it.
    const racketBehind = poseName === 'ready';
    if (racketBehind) drawRacket(drawArm(0.2, hand), base.a);

    // ---- torso
    px.poly([[X(-0.225), Y(1.4 + U)], [X(0.225), Y(1.4 + U)], [X(0.19), Y(0.86 + U)], [X(-0.19), Y(0.86 + U)]], kit.shirt);
    px.circle(X(-0.19), Y(1.34 + U), R(0.078), kit.shirt);
    px.circle(X(0.19), Y(1.34 + U), R(0.078), kit.shirt);
    px.poly([[X(0.12), Y(1.4 + U)], [X(0.225), Y(1.4 + U)], [X(0.19), Y(0.86 + U)], [X(0.1), Y(0.86 + U)]], kit.shirtS);

    // ---- neck + collar
    px.capsule(X(0), Y(1.38 + U), X(0), Y(1.5 + U), R(0.062), kit.skin);
    if (back) {
      const cr = Math.max(0.8, 0.045 * k);
      px.capsule(X(-0.1), Y(1.415 + U), X(0.1), Y(1.415 + U), cr, kit.collar);
      px.capsule(X(-0.1), Y(1.415 + U), X(-0.075), Y(1.47 + U), cr * 0.8, kit.collar);
      px.capsule(X(0.1), Y(1.415 + U), X(0.075), Y(1.47 + U), cr * 0.8, kit.collar);
    } else {
      const cr = Math.max(0.55, 0.03 * k);
      px.capsule(X(-0.1), Y(1.42 + U), X(0), Y(1.33 + U), cr, kit.collar);
      px.capsule(X(0.1), Y(1.42 + U), X(0), Y(1.33 + U), cr, kit.collar);
    }

    // ---- head
    const hy = 1.6 + U;
    if (back) {
      px.circle(X(-0.158), Y(hy - 0.02), R(0.04), kit.skin);
      px.circle(X(0.158), Y(hy - 0.02), R(0.04), kit.skin);
      px.circle(X(0.02), Y(hy - 0.02), R(0.15), kit.hairS);
      px.circle(X(-0.012), Y(hy + 0.01), R(0.142), kit.hair);
    } else {
      px.circle(X(-0.158), Y(hy - 0.02), R(0.04), kit.skin);
      px.circle(X(0.158), Y(hy - 0.02), R(0.04), kit.skin);
      px.circle(X(0), Y(hy), R(0.158), kit.hair);
      px.ellipse(X(0), Y(hy - 0.035), R(0.14), R(0.118), 0, kit.skin);
      if (kit.band) px.capsule(X(-0.15), Y(hy + 0.07), X(0.15), Y(hy + 0.07), R(0.024, 0.5), kit.band);
      const ey = Math.floor(Y(hy - 0.01));
      const ex = Math.max(1, Math.round(0.058 * k));
      px.put(ox - ex, ey, OUTLINE);
      px.put(ox + ex - 1, ey, OUTLINE);
    }

    // ---- racket arm + racket
    if (!racketBehind) drawRacket(drawArm(0.2, hand), base.a);

    // ---- shoes get a coloured sole on their bottom row
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (px.d[y * W + x] !== TMP_SHOE) continue;
        px.d[y * W + x] = px.get(x, y + 1) === TMP_SHOE ? kit.shoe : kit.sole;
      }
    }
    px.outline(OUTLINE);
    return { c: px.toCanvas(), ax: ox, ay: oy + 0.5 };
  }

  const cache = new Map();

  function get(who, k, pose, legs, frame) {
    const kq = Math.max(5, Math.round(k * 2) / 2);
    const key = who + '|' + kq + '|' + pose + '|' + legs + '|' + frame;
    let s = cache.get(key);
    if (!s) {
      s = drawFigure(who, kq, pose, legs, frame);
      if (cache.size > 900) cache.delete(cache.keys().next().value);
      cache.set(key, s);
    }
    return s;
  }

  const ballCache = new Map();

  function ball(r) {
    const rq = Math.max(1.5, Math.round(r * 2) / 2);
    let s = ballCache.get(rq);
    if (s) return s;
    const size = Math.ceil(rq * 2) + 4;
    const px = new Pix(size, size);
    const c = size / 2;
    px.circle(c, c, rq, 19);
    if (rq >= 2) px.ellipse(c + rq * 0.25, c + rq * 0.3, rq * 0.75, rq * 0.55, 0.6, 20);
    if (rq >= 2) px.circle(c - rq * 0.2, c - rq * 0.25, rq * 0.55, 19);
    px.put(Math.floor(c - rq * 0.45), Math.floor(c - rq * 0.45), 21);
    px.outline(OUTLINE);
    s = { c: px.toCanvas(), a: c };
    ballCache.set(rq, s);
    return s;
  }

  PP.Sprites = {
    get: get,
    ball: ball,
    RUN_FRAMES: RUN_FRAMES,
    PAL: PAL,
    clear: function () { cache.clear(); }
  };
})();
