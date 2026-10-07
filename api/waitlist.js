// Social padel waiting list (social membership is sold out). People pay £5 to join; at TARGET people
// the club opens a new weekly social session.
// GET: { count, target } where count = paid places (counted from Stripe) + `extra`.
// POST { extra }: committee only. `extra` is for genuine sign-ups taken outside the website (for example
//   names put down in person), so the count shown is always real people.
import { env, isCommittee, readJSON, writeJSON, storageReady, send, body, fromRequest } from './_lib/core.js';

export const TARGET = 20;
let cache = null;

// Paid waiting-list places: Stripe payments tagged kind=waitlist. In demo mode (no Stripe key) the
// demo payments are counted in storage instead.
async function paidCount() {
  const key = env('STRIPE_SECRET_KEY');
  if (!key) return (await readJSON('waitlist', {})).demoPaid || 0;
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(key);
  let n = 0, page;
  for (let i = 0; i < 20; i++) {
    const r = await stripe.paymentIntents.search({ query: "metadata['kind']:'waitlist' AND status:'succeeded'", limit: 100, page });
    n += r.data.length;
    if (!r.has_more) break;
    page = r.next_page;
  }
  return n;
}

export async function waitlistCount(fresh) {
  if (!fresh && cache && Date.now() - cache.at < 60000) return cache.value;
  const [paid, doc] = await Promise.all([paidCount(), readJSON('waitlist', {})]);
  const value = { paid, extra: Math.max(0, Number(doc.extra) || 0) };
  cache = { at: Date.now(), value };
  return value;
}

export default async function handler(req, res) {
  fromRequest(req);
  try {
    if (req.method === 'GET') {
      const c = await waitlistCount(isCommittee(req));
      if (isCommittee(req)) return send(res, 200, { count: c.paid + c.extra, paid: c.paid, extra: c.extra, target: TARGET });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=120');
      return res.end(JSON.stringify({ count: c.paid + c.extra, target: TARGET }));
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    if (!isCommittee(req)) return send(res, 401, { error: 'committee_only' });
    if (!storageReady()) return send(res, 503, { error: 'storage_not_configured' });
    const extra = Number(body(req).extra);
    if (!Number.isInteger(extra) || extra < 0 || extra > 500) return send(res, 400, { error: 'bad_number' });
    const doc = await readJSON('waitlist', {});
    await writeJSON('waitlist', { ...doc, extra });
    const c = await waitlistCount(true);
    return send(res, 200, { count: c.paid + c.extra, paid: c.paid, extra: c.extra, target: TARGET });
  } catch (e) {
    console.error('waitlist', e);
    return send(res, 503, { error: 'unavailable' });
  }
}
