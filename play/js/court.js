/* Padel Pong — camera + static scene.
 * The court is ray-cast pixel by pixel (SNES "Mode 7" style) into low-res canvases
 * once per resize, so every line and wall stays perfectly crisp. */
(function () {
  'use strict';
  const PP = (window.PP = window.PP || {});

  // Real padel dimensions (metres). Net at z = 0, the player's half is z < 0.
  const COURT = { hw: 5, hl: 10, service: 6.95, net: 0.88, netSide: 0.92 };
  PP.COURT = COURT;
  PP.sideWallHeight = (z) => (Math.abs(z) >= 8 ? 4 : 3);

  const C = {
    court: [46, 108, 214], courtGrain: [40, 98, 198], courtEdge: [30, 74, 160],
    line: [246, 249, 255],
    apron: [52, 66, 108], apronGrain: [46, 58, 96],
    grass1: [66, 176, 92], grass2: [54, 158, 82], grassMid: [60, 167, 87],
    glass: [200, 238, 255], frame: [36, 40, 56], frameHi: [96, 104, 130], mesh: [20, 24, 38],
    netMesh: [14, 20, 34], tape: [255, 255, 255], post: [36, 40, 56],
    sil: [58, 29, 86], silHi: [80, 44, 110], lit: [255, 206, 112],
    trees: [42, 24, 70], treesHi: [60, 38, 94],
    stand: [64, 70, 104], standBack: [44, 38, 82], step: [118, 124, 160], seat: [79, 128, 105],
    board: [30, 64, 52], boardTop: [16, 28, 26], boardText: [133, 180, 160]
  };
  const CROWD_SHIRT = [[255, 255, 255], [223, 35, 38], [133, 180, 160], [42, 60, 128], [255, 225, 77],
    [255, 126, 182], [127, 214, 255], [255, 184, 107], [26, 28, 44]];
  const CROWD_SKIN = [[243, 193, 155], [226, 163, 118], [182, 118, 80], [128, 82, 56]];
  const CROWD_HAIR = [[42, 29, 22], [107, 62, 38], [26, 28, 44], [230, 190, 110]];
  const SKY_LOW = [255, 186, 110];

  // 1-bit bitmap of the advertising board text, built from the pixel font.
  function boardBitmap(text) {
    const w = text.length * 6;
    const bits = new Uint8Array(w * 7);
    for (let i = 0; i < text.length; i++) {
      const gl = PP.Font.glyph(text[i]);
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 5; x++) if (gl[y][x] === '#') bits[y * w + i * 6 + x] = 1;
      }
    }
    return { w: w, bits: bits };
  }
  const SKY = [[0, [34, 24, 84]], [0.42, [108, 44, 144]], [0.76, [255, 94, 140]], [1, [255, 186, 110]]];
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  function hash(x, z) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function lerpCol(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function skyAt(t) {
    for (let i = 1; i < SKY.length; i++) {
      if (t <= SKY[i][0]) {
        const a = SKY[i - 1], b = SKY[i];
        return lerpCol(a[1], b[1], (t - a[0]) / (b[0] - a[0]));
      }
    }
    return SKY[SKY.length - 1][1];
  }

  function makeCamera(e, R) {
    const pos = { x: 0, y: R * Math.sin(e), z: -0.5 - R * Math.cos(e) };
    return { pos: pos, sinA: Math.sin(e), cosA: Math.cos(e), e: e };
  }

  function toCam(cam, x, y, z) {
    const dx = x - cam.pos.x, dy = y - cam.pos.y, dz = z - cam.pos.z;
    return [dx, dy * cam.cosA + dz * cam.sinA, -dy * cam.sinA + dz * cam.cosA];
  }

  /**
   * Build the scene for a W x H game-pixel screen.
   * opts.top / opts.bottom: pixels to keep clear for the HUD / safe areas.
   * opts.margin: extra pixels rendered around the edges (used for screen shake).
   */
  function build(W, H, opts) {
    const top = opts.top, bottom = opts.bottom, M = opts.margin;
    const R = 25;
    const avail = H - top - bottom;

    // Pick the camera elevation: low and cinematic on wide screens, steeper on tall
    // phone screens so the court fills the display.
    function measure(e) {
      const cam = makeCamera(e, R);
      const n = toCam(cam, 0, 0, -10.8), t = toCam(cam, 0, 4.1, 10), c = toCam(cam, 5, 0, -9.8);
      const yN = n[1] / n[2], yT = t[1] / t[2], xW = c[0] / c[2];
      return { cam: cam, fw: (W / 2 - 1) / xW, fh: (avail * 0.86) / (yT - yN), yN: yN };
    }
    let deg = 24;
    for (; deg <= 58; deg += 0.5) {
      const m = measure((deg * Math.PI) / 180);
      if (m.fh <= m.fw) break;
    }
    const m = measure((Math.min(deg, 58) * Math.PI) / 180);
    const cam = m.cam;
    const f = Math.min(m.fw, m.fh);
    const cx = Math.floor(W / 2) + 0.5; // centre on a pixel so the centre line is crisp
    const cy = H - bottom + f * m.yN;
    const pos = cam.pos;

    function project(x, y, z) {
      const c = toCam(cam, x, y, z);
      const iz = 1 / c[2];
      return { x: cx + f * c[0] * iz, y: cy - f * c[1] * iz, s: f * iz };
    }
    function rayDir(sx, sy) {
      const xc = (sx - cx) / f, yc = -(sy - cy) / f;
      return [xc, yc * cam.cosA - cam.sinA, yc * cam.sinA + cam.cosA];
    }
    function unproject(sx, sy) {
      const d = rayDir(sx, sy);
      if (d[1] >= -1e-4) return null;
      const t = -pos.y / d[1];
      return { x: pos.x + t * d[0], z: pos.z + t * d[2] };
    }

    const farTop = project(0, 4, 10).y;
    const hb = Math.max(4, Math.round(farTop - Math.max(4, H * 0.035)));

    const BW = W + M * 2, BH = H + M * 2;

    // ---------------- sky (screen space, not shaken)
    const sky = document.createElement('canvas');
    sky.width = W;
    sky.height = H;
    {
      const g = sky.getContext('2d');
      const img = g.createImageData(W, H);
      const d = img.data;
      const N = Math.max(7, Math.round(hb / 5));
      const sunR = Math.max(9, Math.min(46, Math.round(Math.min(W * 0.2, hb * 0.5))));
      const sunX = Math.round(W * 0.7), sunY = hb - Math.round(sunR * 0.35);
      for (let y = 0; y < H; y++) {
        const t = Math.min(1, y / Math.max(1, hb));
        for (let x = 0; x < W; x++) {
          const tt = t * N + (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5);
          let col = skyAt(Math.max(0, Math.min(N, Math.round(tt))) / N);
          const dx = x - sunX, dy = y - sunY, dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= sunR) {
            const rel = dy / sunR;
            const period = Math.max(3, Math.round(sunR / 4));
            const gap = rel > 0.1 ? Math.min(period - 1, Math.floor(1 + rel * period * 0.55)) : 0;
            const inGap = gap > 0 && ((dy % period) + period) % period < gap;
            if (!inGap) col = lerpCol([255, 244, 128], [255, 108, 96], (dy + sunR) / (2 * sunR));
          } else if (dist <= sunR * 1.45 && BAYER[(y & 3) * 4 + (x & 3)] < 7) {
            col = lerpCol(col, [255, 190, 150], 0.35);
          }
          const p = (y * W + x) * 4;
          d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    }

    // ---------------- world: skyline, stands, surroundings, court, walls
    // Rendered twice: the second copy has the crowd on its feet for celebrations.
    const board = boardBitmap('CUPTC  *  ');

    function crowdCol(ax, z, cheer) {
      const ru = (ax - 7.6) / 0.8, r = Math.floor(ru), fu = ru - r;
      const sv = (z + 100) / 0.6, sIdx = Math.floor(sv), fv = sv - sIdx;
      if (fu < 0.12) return C.step;
      const h = hash(r * 7 + 3, sIdx);
      if (h % 100 >= 84) return C.seat;
      const lift = cheer && h & 16 ? 0.24 : 0;
      const hu = fu - lift;
      if (hu > 0.56 && hu < 0.86 && fv > 0.28 && fv < 0.72) {
        return hu > 0.76 ? CROWD_HAIR[(h >>> 9) % CROWD_HAIR.length] : CROWD_SKIN[(h >>> 5) % CROWD_SKIN.length];
      }
      if (hu > 0.12 && hu <= 0.58 && fv > 0.14 && fv < 0.86) return CROWD_SHIRT[(h >>> 12) % CROWD_SHIRT.length];
      if (lift && fu > 0.8 && (fv < 0.2 || fv > 0.8)) return CROWD_SKIN[(h >>> 5) % CROWD_SKIN.length];
      return C.stand;
    }

    function boardCol(z, y, side) {
      if (y > 0.82) return C.boardTop;
      const col = Math.floor((side > 0 ? -z : z) / 0.12);
      const row = Math.floor((0.8 - y) / 0.115);
      if (row >= 0 && row < 7) {
        const w = board.w;
        const cc = ((col % w) + w) % w;
        if (board.bits[row * w + cc]) return C.boardText;
      }
      return C.board;
    }

    function renderWorld(cheer) {
      const canvas = document.createElement('canvas');
      canvas.width = BW;
      canvas.height = BH;
      const g = canvas.getContext('2d');
      const img = g.createImageData(BW, BH);
      const d = img.data;
      const put = (i, j, col) => {
        if (i < 0 || j < 0 || i >= BW || j >= BH) return;
        const p = (j * BW + i) * 4;
        d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
      };

      for (let j = 0; j < BH; j++) {
        const sy = j - M;
        if (sy < hb) continue;
        const dRow = rayDir(0, sy + 0.5), dNext = rayDir(0, sy + 1.5);
        const dy = dRow[1], dz = dRow[2];
        const hitsFloor = dy < 0;
        const tF = hitsFloor ? -pos.y / dy : Infinity;
        const zF = pos.z + tF * dz;
        const zN = dNext[1] < 0 ? pos.z + (-pos.y / dNext[1]) * dNext[2] : zF + 50;
        const dzRow = Math.abs(zN - zF);
        const dxPx = tF / f;

        for (let i = 0; i < BW; i++) {
          const sx = i - M;
          const xc = (sx + 0.5 - cx) / f;
          let col;
          let tHit = tF;
          if (!hitsFloor) {
            col = SKY_LOW;
          } else {
            const x = pos.x + tF * xc;
            const ax = Math.abs(x), az = Math.abs(zF);
            if (ax <= 5 && az <= 10) {
              const lwz = Math.max(0.03, dzRow * 0.5), lwx = Math.max(0.03, dxPx * 0.5);
              if (Math.abs(az - COURT.service) < lwz || (ax < lwx && az <= COURT.service)) col = C.line;
              else if (Math.min(5 - ax, 10 - az) < Math.max(0.1, dxPx * 0.8)) col = C.courtEdge;
              else col = (hash(Math.floor(x * 6), Math.floor(zF * 6)) & 7) === 0 ? C.courtGrain : C.court;
            } else if (ax <= 7.2 && zF >= -13.5 && zF <= 12.5) {
              col = (hash(Math.floor(x * 5), Math.floor(zF * 5)) & 7) === 0 ? C.apronGrain : C.apron;
            } else if (dzRow > 1.4) {
              col = C.grassMid;
            } else {
              col = Math.floor((zF + 1000) / 2.5) & 1 ? C.grass1 : C.grass2;
            }
          }

          // Spectator stands along both sides, with advertising boards in front.
          if (xc !== 0) {
            const axc = Math.abs(xc), side = xc > 0 ? 1 : -1;
            let t = 7.2 / axc;
            if (t < tHit) {
              const y = pos.y + t * dy, z = pos.z + t * dz;
              if (y >= 0 && y <= 0.9 && Math.abs(z) <= 12.5) { tHit = t; col = boardCol(z, y, side); }
            }
            t = (0.9 - 7.6 * 0.6 - pos.y) / (dy - 0.6 * axc);
            if (t > 0 && t < tHit) {
              const ax = t * axc, z = pos.z + t * dz;
              if (ax >= 7.6 && ax <= 14 && Math.abs(z) <= 13) { tHit = t; col = crowdCol(ax, z, cheer); }
            }
            t = 14 / axc;
            if (t < tHit) {
              const y = pos.y + t * dy, z = pos.z + t * dz;
              if (y >= 0 && y <= 5.35 && Math.abs(z) <= 13) { tHit = t; col = y > 5.1 ? C.step : C.standBack; }
            }
          }

          // Court walls: far glass (z = 10) and the two side walls (x = +/-5).
          let tw = Infinity, type = null, u = 0, v = 0;
          if (dz > 0) {
            const t = (10 - pos.z) / dz;
            if (t < tHit) {
              const wx = pos.x + t * xc, wy = pos.y + t * dy;
              if (wx >= -5 && wx <= 5 && wy >= 0 && wy <= 4) { tw = t; type = 'far'; u = wx; v = wy; }
            }
          }
          if (xc !== 0) {
            const t = ((xc > 0 ? 5 : -5) - pos.x) / xc;
            if (t > 0 && t < tHit && t < tw) {
              const wz = pos.z + t * dz, wy = pos.y + t * dy;
              if (wz >= -10 && wz <= 10 && wy >= 0 && wy <= PP.sideWallHeight(wz)) { tw = t; type = 'side'; u = wz; v = wy; }
            }
          }
          if (type) {
            const pw = tw / f;
            let glassTop, wallTop, postD;
            if (type === 'far') {
              glassTop = 3; wallTop = 4;
              const q = (((u + 1) % 2) + 2) % 2; postD = Math.min(q, 2 - q);
            } else {
              const a = Math.abs(u);
              glassTop = a >= 8 ? 3 : a >= 6 ? 2 : 0;
              wallTop = a >= 8 ? 4 : 3;
              const q = ((u % 2) + 2) % 2; postD = Math.min(q, 2 - q);
            }
            const barW = Math.max(0.05, pw * 0.6);
            if (postD < Math.max(0.05, pw * 0.6)) {
              col = C.frame;
            } else if (Math.abs(v - wallTop) < barW || (glassTop > 0 && Math.abs(v - glassTop) < barW * 0.8)) {
              col = C.frame;
            } else if (v < glassTop) {
              col = lerpCol(col, C.glass, 0.38);
              const st = (((u * 0.8 + v * 0.55) % 2.4) + 2.4) % 2.4;
              if (st < 0.12 || (st > 0.26 && st < 0.32)) col = lerpCol(col, [255, 255, 255], 0.5);
            } else {
              // chain-link fence: a diagonal lattice of dark pixels
              col = ((sx + sy) & 3) === 0 || ((sx - sy) & 3) === 0 ? C.mesh : lerpCol(col, C.mesh, 0.15);
            }
          }
          put(i, j, col);
        }
      }

      drawSkyline(put);
      g.putImageData(img, 0, 0);
      return canvas;
    }

    // Cambridge skyline silhouette standing on the backdrop line (rows above hb).
    function drawSkyline(put) {
      const u = Math.max(1, Math.min(3, Math.floor(Math.min(W / 210, (hb * 0.62) / 31))));
      const base = hb + M; // buffer row of the ground line
      const fill = (x0, bottomPx, w, h, col) => {
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) put(Math.round(x0) + x + M, base - 1 - bottomPx - y, col);
        }
      };
      const tri = (xc, bottomPx, halfW, h, col) => {
        for (let y = 0; y < h; y++) {
          const hw = Math.round(halfW * (1 - y / h));
          for (let x = -hw; x <= hw; x++) put(Math.round(xc) + x + M, base - 1 - bottomPx - y, col);
        }
      };
      // trees along the Backs
      for (let x = -M; x < W + M; x++) {
        const th = Math.round((3 + 2.2 * Math.sin(x * 0.13) + 1.6 * Math.sin(x * 0.37 + 1.3) + 1.2 * Math.sin(x * 0.07 + 4)) * u) + 2 * u;
        for (let y = 0; y < th; y++) put(x + M, base - 1 - y, y === th - 1 && (hash(x, 7) & 3) === 0 ? C.treesHi : C.trees);
      }
      // gabled college buildings
      const house = (x, w, h, roof) => {
        fill(x, 0, w * u, h * u, C.sil);
        tri(x + (w * u) / 2, h * u, (w * u) / 2, roof * u, C.sil);
        for (let wx = 2; wx < w - 1; wx += 3) {
          for (let wy = 2; wy < h - 2; wy += 4) {
            fill(x + wx * u, wy * u, u, 2 * u, (hash(Math.round(x) + wx, wy) & 3) === 0 ? C.lit : C.silHi);
          }
        }
      };
      house(W * 0.03, 16, 9, 5);
      house(W * 0.5, 20, 8, 5);
      house(W * 0.8, 15, 11, 6);
      // King's College Chapel
      {
        const cx0 = Math.round(W * 0.28);
        fill(cx0 - 26 * u, 0, 52 * u, 15 * u, C.sil);
        for (let x = -26; x < 26; x += 2) fill(cx0 + x * u, 15 * u, u, u, C.sil);
        [-19, -12, -5, 2, 9, 16].forEach((p, idx) => {
          fill(cx0 + p * u, 3 * u, 2 * u, 9 * u, idx === 2 ? C.lit : C.silHi);
        });
        [-22, -15, -8, -1, 6, 13, 20].forEach((p) => {
          fill(cx0 + p * u, 15 * u, u, 4 * u, C.sil);
          fill(cx0 + p * u - Math.floor(u / 2), 15 * u, u + 1, u, C.sil);
        });
        [cx0 - 31 * u, cx0 + 25 * u].forEach((tx) => {
          fill(tx, 0, 6 * u, 24 * u, C.sil);
          fill(tx, 24 * u, u, 5 * u, C.sil);
          fill(tx + 5 * u, 24 * u, u, 5 * u, C.sil);
          fill(tx + 2 * u, 24 * u, 2 * u, 3 * u, C.sil);
          fill(tx + 2 * u, 27 * u, u, 3 * u, C.sil);
          fill(tx + 2 * u, 6 * u, 2 * u, 4 * u, C.silHi);
        });
      }
      // Great St Mary's style tower
      {
        const tx = Math.round(W * 0.64);
        fill(tx, 0, 10 * u, 22 * u, C.sil);
        [0, 3, 6, 9].forEach((p) => fill(tx + p * u, 22 * u, u, p === 0 || p === 9 ? 4 * u : 2 * u, C.sil));
        fill(tx + 4 * u, 13 * u, 2 * u, 4 * u, C.lit);
        fill(tx + 4 * u, 5 * u, 2 * u, 4 * u, C.silHi);
      }
      // a spire
      {
        const sx0 = Math.round(W * 0.92);
        fill(sx0 - 2 * u, 0, 5 * u, 13 * u, C.sil);
        tri(sx0, 13 * u, 2.5 * u, 16 * u, C.sil);
        fill(sx0, 6 * u, u, 3 * u, C.lit);
      }
    }

    const world = renderWorld(false);
    const worldCheer = renderWorld(true);

    // ---------------- net (transparent layer drawn between the two halves)
    const net = document.createElement('canvas');
    net.width = BW;
    net.height = BH;
    {
      const g = net.getContext('2d');
      const img = g.createImageData(BW, BH);
      const d = img.data;
      for (let j = 0; j < BH; j++) {
        const sy = j - M;
        for (let i = 0; i < BW; i++) {
          const sx = i - M;
          const r = rayDir(sx + 0.5, sy + 0.5), r2 = rayDir(sx + 0.5, sy + 1.5);
          if (r[2] <= 0 || r2[2] <= 0) continue;
          const t = (0 - pos.z) / r[2];
          const x = pos.x + t * r[0], y = pos.y + t * r[1];
          const rowH = Math.abs(y - (pos.y + ((0 - pos.z) / r2[2]) * r2[1]));
          const ax = Math.abs(x);
          const pw = t / f;
          let col = null, a = 255;
          if (ax <= 5.08 && ax >= 5 - Math.max(0.06, pw * 0.7) && y >= 0 && y <= 1.0) {
            col = C.post;
          } else if (ax <= 5) {
            const netTop = COURT.net + (ax / 5) * (COURT.netSide - COURT.net);
            if (y >= 0 && y <= netTop) {
              if (y > netTop - Math.max(0.05, rowH)) col = C.tape;
              else if (((sx + sy) & 1) === 0) { col = C.netMesh; a = 215; }
              else if (y < Math.max(0.04, rowH * 0.9)) col = C.netMesh;
            }
          }
          if (!col) continue;
          const p = (j * BW + i) * 4;
          d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = a;
        }
      }
      g.putImageData(img, 0, 0);
    }

    return {
      W: W, H: H, M: M, f: f, hb: hb, cam: cam,
      sky: sky, world: world, worldCheer: worldCheer, net: net,
      project: project, unproject: unproject
    };
  }

  PP.Scene = { build: build };
})();
