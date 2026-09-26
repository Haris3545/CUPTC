// Padel Pong leaderboard. No accounts: a player picks a name the first time they add a score.
// GET: the top scores { entries: [{ id, name, score }] }.
// POST { op: 'submit', key, name, score }: a player's score. `key` is a random code kept on their device,
//   so the same device updates its own entry (only ever upwards) instead of adding another.
//   Names are unique; once an entry has a name it keeps it (only the committee can change it).
// POST { op: 'rename', id, name } or { op: 'remove', id }: committee only, to tidy up names.
import crypto from 'node:crypto';
import { isCommittee, readJSON, writeJSON, storageReady, send, body, fromRequest } from './_lib/core.js';

// Scores already on the board before it went live. Anyone who adds a score under one of these names
// takes over that entry (the higher score stays).
const SEED = [
  { id: 'seed-haris', name: 'Haris', score: 187, owner: '', at: '2026-09-26' },
  { id: 'seed-aki', name: 'Aki', score: 175, owner: '', at: '2026-09-26' }
];
const NAME_OK = /^[A-Za-z0-9][A-Za-z0-9 .'_-]{0,11}$/;
const KEY_OK = /^[A-Za-z0-9]{16,64}$/;
const MAX_SCORE = 5000;
const KEEP = 300; // entries stored
const SHOW = 50;  // entries shown

const tidy = (v) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
const same = (a, b) => a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase();
const ownerOf = (key) => crypto.createHash('sha256').update('padel-pong:' + key).digest('hex');
const ranked = (list) => list.slice().sort((a, b) => b.score - a.score || String(a.at).localeCompare(String(b.at)));
const pub = (list) => ranked(list).slice(0, SHOW).map((r) => ({ id: r.id, name: r.name, score: r.score }));

// A short-lived copy, so a burst of players finishing games doesn't hit storage every time.
let cache = null;
async function load() {
  if (cache && Date.now() - cache.at < 15000) return cache.list.map((r) => ({ ...r }));
  const list = await readJSON('leaderboard', SEED);
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
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=15, stale-while-revalidate=60');
      return res.end(JSON.stringify({ entries: pub(list) }));
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    if (!storageReady()) return send(res, 503, { error: 'storage_not_configured' });
    const b = body(req);
    let list = await load();

    if (b.op === 'submit') {
      const key = String(b.key || '');
      const score = Number(b.score);
      if (!KEY_OK.test(key)) return send(res, 400, { error: 'bad_key' });
      if (!Number.isInteger(score) || score < 1 || score > MAX_SCORE) return send(res, 400, { error: 'bad_score' });
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
    return send(res, 200, { entries: pub(list) });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'server' });
  }
}
