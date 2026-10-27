// The site on Cloudflare Workers. Static files (index.html, img/, play/ ...) are served straight from
// the assets; this worker only runs for /api/*, /uploads/* (photos uploaded in the Members Area) and the
// old Vercel analytics address. The api/ handlers are the same ones Vercel runs: each Request is turned
// into the Node-style req/res they expect.
import { usePlatform, readUpload } from '../api/_lib/core.js';
import checkout from '../api/checkout.js';
import club from '../api/club.js';
import code from '../api/code.js';
import committee from '../api/committee.js';
import confirm from '../api/confirm.js';
import leaderboard from '../api/leaderboard.js';
import login from '../api/login.js';
import me from '../api/me.js';
import merchImage from '../api/merch-image.js';
import merch from '../api/merch.js';
import migrate from '../api/migrate.js';
import orders from '../api/orders.js';
import status from '../api/status.js';
import turn from '../api/turn.js';
import waitlist from '../api/waitlist.js';

const API = { checkout, club, code, committee, confirm, leaderboard, login, me, 'merch-image': merchImage, merch, migrate, orders, status, turn, waitlist };

async function runHandler(handler, request, url) {
  const headers = {};
  request.headers.forEach((v, k) => { headers[k] = v; });
  headers.host = url.host;
  headers['x-forwarded-proto'] = url.protocol.replace(':', '');
  let body = {};
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const raw = await request.text();
    if (raw && /json/.test(headers['content-type'] || '')) { try { body = JSON.parse(raw); } catch { body = {}; } }
  }
  const req = { method: request.method, url: url.pathname + url.search, headers, body, query: Object.fromEntries(url.searchParams) };
  return new Promise((resolve, reject) => {
    const out = new Headers();
    let done = false;
    const res = {
      statusCode: 200,
      setHeader(k, v) { out.set(k, String(v)); },
      getHeader(k) { return out.get(k); },
      end(b) {
        if (done) return;
        done = true;
        resolve(new Response(request.method === 'HEAD' || b == null ? null : b, { status: this.statusCode, headers: out }));
      }
    };
    Promise.resolve()
      .then(() => handler(req, res))
      .then(() => { if (!done) { done = true; resolve(new Response(null, { status: res.statusCode, headers: out })); } }, reject);
  });
}

export default {
  async fetch(request, env) {
    // settings (passwords, Stripe key...) as process.env, as on Vercel
    for (const [k, v] of Object.entries(env)) if (typeof v === 'string') process.env[k] = v;
    usePlatform({ store: env.STORE || null });
    const url = new URL(request.url);
    const p = url.pathname;
    try {
      if (p.startsWith('/api/')) {
        const handler = API[p.slice(5).replace(/\/+$/, '')];
        if (!handler) return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
        return await runHandler(handler, request, url);
      }
      if (p.startsWith('/uploads/')) {
        const o = await readUpload(decodeURIComponent(p.slice(1)));
        if (!o) return new Response('Not found', { status: 404 });
        return new Response(o.body, { headers: { 'Content-Type': (o.httpMetadata && o.httpMetadata.contentType) || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });
      }
      // index.html still asks for Vercel's analytics script; Cloudflare Web Analytics replaces it
      if (p.startsWith('/_vercel/')) return new Response('', { headers: { 'Content-Type': 'text/javascript', 'Cache-Control': 'public, max-age=86400' } });
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(e);
      return new Response(JSON.stringify({ error: 'server' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }
};
