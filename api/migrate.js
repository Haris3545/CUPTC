// Moving the site's saved data from Vercel to Cloudflare. Both steps need ?key= matching ORDERS_KEY.
// On the old (Vercel) site:   GET ?key=K&op=export        -> every saved document as JSON
// On the new (Cloudflare) site: GET ?key=K&from=<old site> (or &merch=<Blob file address>&committee=...
//   when the old site is down) -> fetches that export, copies every uploaded
//   photo into Cloudflare storage, points the documents at the copies and saves them. Safe to run again:
//   run it once to try the new site, then again just before switching the domain over.
import { env, same, readJSON, writeJSON, putImage, isUploaded, host, fromRequest, send } from './_lib/core.js';

const DOCS = ['merch', 'shop', 'leaderboard', 'committee', 'waitlist'];

// Every uploaded photo address in a document (Vercel Blob addresses only)
function photos(doc, out) {
  if (typeof doc === 'string') { if (/^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\//i.test(doc) && isUploaded(doc)) out.add(doc); }
  else if (Array.isArray(doc)) doc.forEach((v) => photos(v, out));
  else if (doc && typeof doc === 'object') Object.values(doc).forEach((v) => photos(v, out));
  return out;
}
const swap = (doc, map) => (typeof doc === 'string' ? (map.get(doc) || doc)
  : Array.isArray(doc) ? doc.map((v) => swap(v, map))
  : doc && typeof doc === 'object' ? Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, swap(v, map)])) : doc);

export default async function handler(req, res) {
  fromRequest(req);
  const want = env('ORDERS_KEY');
  const q = new URL(req.url, 'http://x').searchParams;
  if (!want || want.length < 16) return send(res, 503, { error: 'ORDERS_KEY (16+ characters) is not set' });
  if (!same(q.get('key') || '', want)) return send(res, 401, { error: 'wrong_key' });

  if (q.get('op') === 'export') {
    const docs = {};
    for (const name of DOCS) {
      const v = await readJSON(name, null);
      if (v != null) docs[name] = v;
    }
    return send(res, 200, { from: host(), at: new Date().toISOString(), docs });
  }

  const from = String(q.get('from') || '').replace(/\/+$/, '');
  // Or straight from the files in Vercel Blob storage (Storage > Blob > Browser > data/), for when the
  // old site itself is down: &merch=<file address>&committee=...&leaderboard=...&waitlist=...
  const direct = DOCS.filter((n) => q.get(n));
  if (!from && !direct.length) return send(res, 400, { error: 'add &from= with the old site address, e.g. https://cuptc.vercel.app, or &merch= etc. with Blob file addresses' });
  if (host() !== 'cloudflare') return send(res, 400, { error: 'run the copy on the new Cloudflare site, not here' });
  try {
    let docs = {};
    if (direct.length) {
      for (const name of direct) {
        const url = String(q.get(name)).trim();
        if (!/^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\/[\w./%-]+\.json$/i.test(url)) return send(res, 400, { error: name + ': not a Vercel Blob .json address' });
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) return send(res, 502, { error: name + ': Vercel Blob said ' + r.status });
        docs[name] = await r.json();
      }
    } else {
      const r = await fetch(from + '/api/migrate?op=export&key=' + encodeURIComponent(want), { cache: 'no-store' });
      if (!r.ok) return send(res, 502, { error: 'old site said ' + r.status + ': ' + (await r.text()).slice(0, 200) });
      docs = (await r.json()).docs;
    }
    const map = new Map(), failed = [];
    for (const url of photos(docs, new Set())) {
      try {
        const img = await fetch(url);
        if (!img.ok) throw new Error(String(img.status));
        const name = (url.split('/').pop() || 'photo').replace(/\.[a-z]+$/i, '').replace(/[^\w-]/g, '').slice(0, 40) || 'photo';
        map.set(url, await putImage(name, Buffer.from(await img.arrayBuffer())));
      } catch (e) {
        failed.push(url); // keeps pointing at the old copy, which still works while Vercel Blob is up
      }
    }
    const copied = [];
    for (const name of DOCS) {
      if (docs[name] === undefined) continue;
      let doc = swap(docs[name], map);
      // keep scores set on the new site since the switch: the higher score wins for the same player
      if (name === 'leaderboard' && Array.isArray(doc)) {
        const now = await readJSON('leaderboard', []);
        const key = (r) => String(r.name || '').replace(/\s+/g, '').toLowerCase();
        const all = new Map(doc.map((r) => [key(r), r]));
        for (const r of Array.isArray(now) ? now : []) {
          const old = all.get(key(r));
          if (!old || r.score > old.score) all.set(key(r), old ? { ...old, ...r, owner: r.owner || old.owner } : r);
        }
        doc = [...all.values()];
      }
      await writeJSON(name, doc);
      copied.push(name);
    }
    return send(res, 200, { ok: true, copied, photos: map.size, photosFailed: failed });
  } catch (e) {
    console.error('migrate', e);
    return send(res, 500, { error: String(e && e.message || e).slice(0, 200) });
  }
}
