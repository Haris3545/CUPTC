// Padel Pong leaderboard. No accounts: a player picks a name the first time they add a score.
// GET: every entry, best first { entries: [{ id, name, score }] }.
// POST { op: 'start' }: a signed ticket for a game that is starting { ticket }.
// POST { op: 'submit', key, name, score, ticket }: a player's score. `key` is a random code kept on their device,
//   so the same device updates its own entry (only ever upwards) instead of adding another.
//   Names are unique; once an entry has a name it keeps it (only the committee can change it).
// POST { op: 'rename', id, name } or { op: 'remove', id }: committee only, to tidy up names.
import crypto from 'node:crypto';
import { isCommittee, readJSON, writeJSON, storageReady, send, body, fromRequest, env, PASSWORDS } from './_lib/core.js';

// Scores already on the board before it went live. Anyone who adds a score under one of these names
// takes over that entry (the higher score stays). Raising a score here also raises it on the live board.
const SEED = [
  { id: 'seed-haris', name: 'Haris', score: 187, owner: '', at: '2026-09-26' },
  { id: 'seed-aki', name: 'Aki', score: 260, owner: '', at: '2026-09-26' }
];
const NAME_OK = /^[A-Za-z0-9][A-Za-z0-9 .'_-]{0,11}$/;
const KEY_OK = /^[A-Za-z0-9]{16,64}$/;
const MAX_SCORE = 100000;
const KEEP = 300; // entries stored

// Anti-cheat. Every game gets a ticket from the server when it starts, signed so it can't be forged,
// and a score is only accepted if the game's own rules could produce it in the time since that ticket.
// This stops scores being made up in the browser or sent without playing; the committee's Remove
// button handles the rest.
//
// maxScore(secs) is the best score a perfect player could reach in that time with every lucky break:
// every ball returned as fast as the rules allow (the fastest player shot is a 0.7s smash and the
// fastest reply reaches the player 0.39s later, both sped up as the rally ramps to 2.32x), a 0.045s
// freeze on each hit, the combo from the first hit (x2 from 5, x3 from 10), and every event either
// Crowd Wave (points x2 for 10s) or Smash Zone (+5 on each of 3 hits), alternating, as soon as the
// game allows (from 10 hits, then every 11). It starts after the 1.8s countdown. Keep it in step
// with the scoring in play/js/game.js.
function maxScore(secs) {
  let t = 1.8, hits = 0, score = 0, next = 10, event = null, waveLeft = 0, zoneLeft = 0, last = 'zone';
  for (;;) {
    const dt = 1.09 / (1.12 + 1.2 * (1 - Math.exp(-hits / 40))) + 0.045;
    if (t + dt > secs) return score;
    t += dt;
    if (event === 'wave' && (waveLeft -= dt) <= 0) event = null;
    hits++;
    let pts = (event === 'wave' ? 2 : 1) * (hits >= 10 ? 3 : hits >= 5 ? 2 : 1);
    if (event === 'zone') { pts += 5; if (--zoneLeft <= 0) event = null; }
    score += pts;
    if (hits >= next && !event) {
      event = last = last === 'wave' ? 'zone' : 'wave';
      if (event === 'wave') waveLeft = 10; else zoneLeft = 3;
      next = hits + 11;
    }
  }
}
const SCORE_MARGIN = 1.05; // a little slack for timing differences between the phone and the server
const TICKET_LIFE = 3 * 3600e3;
const ticketKey = () => crypto.createHash('sha256').update('padel-pong-ticket:' + (env('AUTH_SECRET') || PASSWORDS().committee + ':' + PASSWORDS().member)).digest();
const signTicket = (body) => crypto.createHmac('sha256', ticketKey()).update(body).digest('base64url');
function newTicket() {
  const body = Date.now().toString(36) + '.' + crypto.randomBytes(6).toString('base64url');
  return body + '.' + signTicket(body);
}
// Returns the seconds since the game started, or null for a missing, forged or stale ticket.
function ticketAge(t) {
  const m = /^([a-z0-9]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(t || ''));
  if (!m) return null;
  const want = signTicket(m[1] + '.' + m[2]);
  if (want.length !== m[3].length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(m[3]))) return null;
  const age = Date.now() - parseInt(m[1], 36);
  return age >= 0 && age <= TICKET_LIFE ? age / 1000 : null;
}
const used = new Map(); // tickets already spent on a score (best effort, per server instance)

const tidy = (v) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
const same = (a, b) => a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase();
const ownerOf = (key) => crypto.createHash('sha256').update('padel-pong:' + key).digest('hex');
const ranked = (list) => list.slice().sort((a, b) => b.score - a.score || String(a.at).localeCompare(String(b.at)));
const pub = (list) => ranked(list).slice(0, KEEP).map((r) => ({ id: r.id, name: r.name, score: r.score }));

// A short-lived copy, so a burst of players finishing games doesn't hit storage every time.
// If storage is slow or down, the last copy is used rather than leaving players waiting.
let cache = null;
const within = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('storage_timeout')), ms))]);
async function load() {
  if (cache && Date.now() - cache.at < 15000) return cache.list.map((r) => ({ ...r }));
  let list;
  try {
    list = await within(readJSON('leaderboard', SEED), 6000);
  } catch (e) {
    if (cache) return cache.list.map((r) => ({ ...r }));
    throw e;
  }
  for (const s of SEED) {
    const row = list.find((r) => r.id === s.id);
    if (row && row.score < s.score) row.score = s.score;
  }
  cache = { at: Date.now(), list };
  return list.map((r) => ({ ...r }));
}
async function save(list) {
  const kept = ranked(list).slice(0, KEEP);
  await writeJSON('leaderboard', kept);
  cache = { at: Date.now(), list: kept };
  return kept;
}

export default async function handler(req, res) {
  fromRequest(req);
  try {
    if (req.method === 'GET') {
      const list = await load();
      if (isCommittee(req)) return send(res, 200, { entries: pub(list, true) });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=15, stale-while-revalidate=60');
      return res.end(JSON.stringify({ entries: pub(list) }));
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const b = body(req);
    if (b.op === 'start') return send(res, 200, { ticket: newTicket() });
    if (!storageReady()) return send(res, 503, { error: 'storage_not_configured' });
    let list = await load();

    if (b.op === 'submit') {
      const key = String(b.key || '');
      const score = Number(b.score);
      if (!KEY_OK.test(key)) return send(res, 400, { error: 'bad_key' });
      if (!Number.isInteger(score) || score < 1 || score > MAX_SCORE) return send(res, 400, { error: 'bad_score' });
      const secs = ticketAge(b.ticket);
      if (secs == null) return send(res, 400, { error: 'unverified' });
      if (score > maxScore(secs) * SCORE_MARGIN + 5) return send(res, 400, { error: 'unverified' });
      const spent = used.get(b.ticket);
      if (spent != null && spent !== score) return send(res, 400, { error: 'unverified' });
      used.set(b.ticket, score);
      if (used.size > 5000) used.delete(used.keys().next().value);
      const owner = ownerOf(key);
      let row = list.find((r) => r.owner === owner);
      let changed = false;
      if (!row) {
        const name = tidy(b.name);
        if (!NAME_OK.test(name)) return send(res, 400, { error: 'bad_name' });
        const taken = list.find((r) => same(r.name, name));
        if (taken && taken.owner) return send(res, 409, { error: 'name_taken' });
        if (taken) {
          row = taken;
          row.owner = owner;
        } else {
          row = { id: crypto.randomUUID().slice(0, 8), name, score: 0, owner, at: '' };
          list.push(row);
        }
        changed = true;
      }
      if (score > row.score) {
        row.score = score;
        row.at = new Date().toISOString();
        changed = true;
      }
      if (changed) list = await save(list);
      const rank = ranked(list).findIndex((r) => r.id === row.id) + 1;
      return send(res, 200, { you: { id: row.id, name: row.name, score: row.score, rank }, entries: pub(list) });
    }

    if (!isCommittee(req)) return send(res, 401, { error: 'committee_only' });
    const row = list.find((r) => r.id === String(b.id || ''));
    if (!row) return send(res, 404, { error: 'not_found' });
    if (b.op === 'rename') {
      const name = tidy(b.name);
      if (!NAME_OK.test(name)) return send(res, 400, { error: 'bad_name' });
      if (list.some((r) => r !== row && same(r.name, name))) return send(res, 409, { error: 'name_taken' });
      row.name = name;
    } else if (b.op === 'remove') {
      list = list.filter((r) => r !== row);
    } else {
      return send(res, 400, { error: 'op' });
    }
    list = await save(list);
    return send(res, 200, { entries: pub(list, true) });
  } catch (e) {
    console.error('leaderboard', e);
    return send(res, 503, { error: 'unavailable' });
  }
}
