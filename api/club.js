// The Members Area's Club life and Social sections.
// GET (members): { session, whatsapp, directory }; the committee also gets { feedback }.
// GET ?check=<card>: is this membership card genuine? (anyone, e.g. someone scanning it at the courts)
// POST { op, ... }:
//   members:   card { email }                     -> { card } made from their paid membership in Stripe
//              feedback { kind, message, name?, contact? }
//              dir-save { key, name, college, level, contact, note }   dir-remove { key }
//   committee: session { state, note }   whatsapp { url }   card-make { name, type }
//              feedback-remove { id }    dir-remove { id }
import crypto from 'node:crypto';
import { isMember, isCommittee, readJSON, writeJSON, storageReady, send, body, env, signFor, same, fromRequest } from './_lib/core.js';

// The membership year a card is for, and when cards for it stop being valid.
export const YEAR = '2026-27';
export const CARD_ENDS = Date.parse('2027-10-01T00:00:00+01:00');
export const TYPES = { social: 'Social member', full: 'Full member', committee: 'Committee' };
const STATES = ['on', 'cancelled', 'changed'];
const LEVELS = ['Beginner', 'Improver', 'Intermediate', 'Advanced'];
const KEY_OK = /^[A-Za-z0-9]{16,64}$/;

const tidy = (v, n) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, n);
const text = (v, n) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim().slice(0, n);
const ownerOf = (key) => crypto.createHash('sha256').update('cuptc-directory:' + key).digest('hex');

// A card is "payload.signature", payload = base64url(JSON {n: name, t: type, y: year, i: id}).
function makeCard(name, type) {
  const payload = Buffer.from(JSON.stringify({ n: name, t: type, y: YEAR, i: crypto.randomBytes(3).toString('hex').toUpperCase() })).toString('base64url');
  return payload + '.' + signFor('card', payload).slice(0, 22);
}
export function readCard(card) {
  const m = /^([A-Za-z0-9_-]{8,400})\.([A-Za-z0-9_-]{22})$/.exec(String(card || ''));
  if (!m || !same(m[2], signFor('card', m[1]).slice(0, 22))) return null;
  try {
    const c = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
    return { name: c.n, type: c.t, label: TYPES[c.t] || 'Member', year: c.y, id: c.i, current: c.y === YEAR && Date.now() < CARD_ENDS };
  } catch { return null; }
}

// The member's paid membership in Stripe, found by the email they paid with.
async function membershipFor(email) {
  const key = env('STRIPE_SECRET_KEY');
  if (!key) return null;
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(key);
  const list = await stripe.checkout.sessions.list({ customer_details: { email }, status: 'complete', limit: 100 });
  const paid = list.data.filter((s) => s.payment_status === 'paid' && s.metadata && (s.metadata.kind === 'social' || s.metadata.kind === 'full'));
  if (!paid.length) return null;
  const best = paid.find((s) => s.metadata.kind === 'full') || paid[0];
  return { name: (best.customer_details && best.customer_details.name) || '', type: best.metadata.kind };
}

const club = () => readJSON('club', {});
export default async function handler(req, res) {
  fromRequest(req);
  try {
    const q = new URL(req.url, 'http://x').searchParams;
    if (req.method === 'GET' && q.has('check')) {
      const c = readCard(q.get('check'));
      return send(res, 200, c ? { valid: c.current, ...c } : { valid: false });
    }
    if (!isMember(req)) return send(res, 401, { error: 'members_only' });
    const committee = isCommittee(req);

    if (req.method === 'GET') {
      const [c, dir] = await Promise.all([club(), readJSON('directory', [])]);
      const out = {
        session: c.session || null,
        whatsapp: c.whatsapp || '',
        directory: dir.map(({ owner, ...d }) => d).sort((a, b) => a.name.localeCompare(b.name))
      };
      if (committee) out.feedback = (await readJSON('feedback', [])).slice().reverse();
      return send(res, 200, out);
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const b = body(req);

    if (b.op === 'card') {
      const email = tidy(b.email, 120).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: 'card_email' });
      const m = await membershipFor(email);
      if (!m) return send(res, 404, { error: 'card_not_found' });
      return send(res, 200, { card: makeCard(tidy(m.name, 60) || email.split('@')[0], m.type) });
    }

    if (!storageReady()) return send(res, 503, { error: 'storage_not_configured' });

    if (b.op === 'feedback') {
      const kind = b.kind === 'welfare' ? 'welfare' : 'feedback';
      const message = text(b.message, 3000);
      if (message.length < 3) return send(res, 400, { error: 'feedback_empty' });
      const list = await readJSON('feedback', []);
      list.push({ id: crypto.randomUUID().slice(0, 8), kind, message, name: tidy(b.name, 80), contact: tidy(b.contact, 120), at: new Date().toISOString() });
      await writeJSON('feedback', list.slice(-500));
      return send(res, 200, { ok: true });
    }

    if (b.op === 'dir-save') {
      const key = String(b.key || '');
      if (!KEY_OK.test(key)) return send(res, 400, { error: 'bad_key' });
      const entry = { name: tidy(b.name, 60), college: tidy(b.college, 60), level: LEVELS.includes(b.level) ? b.level : '', contact: tidy(b.contact, 80), note: tidy(b.note, 160) };
      if (!entry.name) return send(res, 400, { error: 'dir_name' });
      const list = await readJSON('directory', []);
      const owner = ownerOf(key);
      const row = list.find((d) => d.owner === owner);
      if (row) Object.assign(row, entry, { at: new Date().toISOString() });
      else { if (list.length >= 1000) return send(res, 409, { error: 'dir_full' }); list.push({ id: crypto.randomUUID().slice(0, 8), owner, ...entry, at: new Date().toISOString() }); }
      await writeJSON('directory', list);
      return send(res, 200, { ok: true, id: (row || list[list.length - 1]).id });
    }
    if (b.op === 'dir-remove') {
      const list = await readJSON('directory', []);
      const gone = b.key && KEY_OK.test(String(b.key)) ? ownerOf(String(b.key)) : null;
      const next = list.filter((d) => !(gone && d.owner === gone) && !(committee && b.id && d.id === b.id));
      await writeJSON('directory', next);
      return send(res, 200, { ok: true });
    }

    if (!committee) return send(res, 401, { error: 'committee_only' });
    if (b.op === 'session') {
      const c = await club();
      c.session = STATES.includes(b.state) ? { state: b.state, note: text(b.note, 300), at: new Date().toISOString() } : null;
      await writeJSON('club', c);
      return send(res, 200, { session: c.session });
    }
    if (b.op === 'whatsapp') {
      const url = tidy(b.url, 200);
      if (url && !/^https:\/\/(chat\.whatsapp\.com\/[A-Za-z0-9]+|whatsapp\.com\/channel\/[A-Za-z0-9]+)\/?$/.test(url)) return send(res, 400, { error: 'whatsapp_url' });
      const c = await club();
      c.whatsapp = url;
      await writeJSON('club', c);
      return send(res, 200, { whatsapp: url });
    }
    if (b.op === 'card-make') {
      const name = tidy(b.name, 60);
      if (!name) return send(res, 400, { error: 'card_name' });
      return send(res, 200, { card: makeCard(name, TYPES[b.type] ? b.type : 'social') });
    }
    if (b.op === 'feedback-remove') {
      const list = await readJSON('feedback', []);
      await writeJSON('feedback', list.filter((f) => f.id !== b.id));
      return send(res, 200, { ok: true });
    }
    return send(res, 400, { error: 'op' });
  } catch (e) {
    console.error('club', e);
    return send(res, 500, { error: 'server' });
  }
}
