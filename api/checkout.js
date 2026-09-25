// POST { kind: 'social' | 'full' | 'merch', code?, fullCode?, itemId?, size? }
// With STRIPE_SECRET_KEY set: creates a Stripe Checkout session (card, Apple Pay, Google Pay) -> { url }.
// With DEMO_PAYMENTS=on instead: returns the lines for the simulated sheet -> { demo: true, title, lines }.
import { PASSWORDS, matches, env, membershipPrice, isMember, readJSON, send, body, origin, fromRequest } from './_lib/core.js';
import { DEFAULT_MERCH } from './_lib/merch.js';

export default async function handler(req, res) {
  fromRequest(req);
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  try {
    const b = body(req);
    let title, name, amount, meta = { kind: b.kind };
    if (b.kind === 'social') {
      amount = membershipPrice('social', b.code);
      title = 'CUPTC Social membership';
      name = 'Social membership 2026–27';
    } else if (b.kind === 'full') {
      if (!matches(b.fullCode, PASSWORDS().full)) return send(res, 403, { error: 'full_code' });
      amount = membershipPrice('full');
      title = 'CUPTC Full membership';
      name = 'Full membership 2026–27';
    } else if (b.kind === 'merch') {
      if (!isMember(req)) return send(res, 401, { error: 'members_only' });
      const item = (await readJSON('merch', DEFAULT_MERCH)).find((m) => m.id === b.itemId);
      if (!item) return send(res, 404, { error: 'no_item' });
      const size = String(b.size || '').slice(0, 20);
      amount = item.price;
      title = 'CUPTC shop';
      name = item.name + (size ? ' (' + size + ')' : '');
      meta = { kind: 'merch', item: item.id, size, delivery: item.delivery || '' };
    } else return send(res, 400, { error: 'kind' });

    const key = env('STRIPE_SECRET_KEY');
    if (key) {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(key);
      const back = origin(req) + '/';
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ quantity: 1, price_data: { currency: 'gbp', unit_amount: Math.round(amount * 100), product_data: { name } } }],
        metadata: meta,
        customer_creation: 'always',
        shipping_address_collection: meta.kind === 'merch' ? { allowed_countries: ['GB'] } : undefined,
        success_url: back + '?paid={CHECKOUT_SESSION_ID}#' + (meta.kind === 'merch' ? 'members' : 'membership'),
        cancel_url: back + '#' + (meta.kind === 'merch' ? 'members' : 'membership')
      });
      return send(res, 200, { url: session.url });
    }
    if (env('DEMO_PAYMENTS') === 'on') return send(res, 200, { demo: true, title, lines: [[name, amount]], meta });
    return send(res, 503, { error: 'payments_not_configured' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'server' });
  }
}
