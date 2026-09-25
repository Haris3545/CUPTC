// POST { kind: 'social' | 'full' | 'merch', code?, fullCode?, itemId?, size?, custom? }
// custom: the name to print on the back, for items the committee has marked customisable.
// Donations: { kind: 'donation', amount (pounds), monthly?, name?, message? }
// With STRIPE_SECRET_KEY set: creates a Stripe Checkout session (card, Apple Pay, Google Pay) -> { url }.
// With DEMO_PAYMENTS=on instead: returns the lines for the simulated sheet -> { demo: true, title, lines }.
import { PASSWORDS, matches, env, membershipPrice, isMember, readJSON, send, body, origin, fromRequest } from './_lib/core.js';
import { DEFAULT_MERCH } from './_lib/merch.js';

// Letters (any language), numbers, spaces and . ' - &, up to 16 characters.
const NAME_OK = /^[\p{L}\p{N} .'&-]{1,16}$/u;

export default async function handler(req, res) {
  fromRequest(req);
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  try {
    const b = body(req);
    let title, name, amount, meta = { kind: b.kind };
    const lines = [];
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
      if (b.custom != null && String(b.custom).trim() !== '') {
        const custom = String(b.custom).trim().replace(/\s+/g, ' ');
        if (!item.customisable) return send(res, 400, { error: 'not_customisable' });
        if (!NAME_OK.test(custom)) return send(res, 400, { error: 'custom_name' });
        lines.push(['Name on the back: ' + custom, Number(item.customPrice ?? 2)]);
        meta.custom = custom;
      }
    } else if (b.kind === 'donation') {
      amount = Math.round(Number(b.amount) * 100) / 100;
      if (!(amount >= 1 && amount <= 5000)) return send(res, 400, { error: 'donation_amount' });
      const monthly = !!b.monthly;
      title = 'Donation to CUPTC';
      name = monthly ? 'Monthly donation to CUPTC' : 'Donation to CUPTC';
      meta = { kind: 'donation', amount: String(amount), monthly: monthly ? 'yes' : 'no',
        name: String(b.name || '').trim().slice(0, 60), message: String(b.message || '').trim().slice(0, 300) };
    } else return send(res, 400, { error: 'kind' });
    lines.unshift([name, amount]);
    const recurring = meta.kind === 'donation' && meta.monthly === 'yes';

    const key = env('STRIPE_SECRET_KEY');
    if (key) {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(key);
      const back = origin(req) + '/';
      const where = meta.kind === 'merch' ? 'members' : meta.kind === 'donation' ? 'support' : 'membership';
      const session = await stripe.checkout.sessions.create({
        mode: recurring ? 'subscription' : 'payment',
        line_items: lines.map(([n, a]) => ({ quantity: 1, price_data: { currency: 'gbp', unit_amount: Math.round(a * 100), product_data: { name: n }, ...(recurring ? { recurring: { interval: 'month' } } : {}) } })),
        metadata: meta,
        ...(recurring ? { subscription_data: { metadata: meta } } : { customer_creation: 'always' }),
        ...(meta.kind === 'donation' && !recurring ? { submit_type: 'donate' } : {}),
        shipping_address_collection: meta.kind === 'merch' ? { allowed_countries: ['GB'] } : undefined,
        success_url: back + '?paid={CHECKOUT_SESSION_ID}#' + where,
        cancel_url: back + '#' + where
      });
      return send(res, 200, { url: session.url });
    }
    if (env('DEMO_PAYMENTS') === 'on') return send(res, 200, { demo: true, title, lines, meta });
    return send(res, 503, { error: 'payments_not_configured' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'server' });
  }
}
