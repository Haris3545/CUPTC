// POST { session } after Stripe sends someone back, or { demo: meta } in demo mode.
// For a paid membership it returns the members password and signs them in.
import { env, PASSWORDS, makeToken, send, body } from './_lib/core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  try {
    const b = body(req);
    let meta;
    if (b.session && env('STRIPE_SECRET_KEY')) {
      const Stripe = (await import('stripe')).default;
      const s = await new Stripe(env('STRIPE_SECRET_KEY')).checkout.sessions.retrieve(String(b.session));
      if (s.payment_status !== 'paid') return send(res, 402, { error: 'not_paid' });
      meta = s.metadata || {};
    } else if (b.demo && env('DEMO_PAYMENTS') === 'on') {
      meta = b.demo;
    } else return send(res, 400, { error: 'nothing_to_confirm' });

    if (meta.kind === 'donation') {
      return send(res, 200, { kind: 'donation', amount: Number(meta.amount) || 0, monthly: meta.monthly === 'yes' });
    }
    if (meta.kind === 'social' || meta.kind === 'full') {
      return send(res, 200, { kind: meta.kind, password: PASSWORDS().member, token: makeToken('member') });
    }
    return send(res, 200, { kind: 'merch', delivery: meta.delivery || '', custom: meta.custom || '' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'server' });
  }
}
