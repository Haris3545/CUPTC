// POST { kind: 'social' | 'full' | 'merch', code?, fullCode?, itemId?, size?, custom? }
// custom: the name to print on the back, for items the committee has marked customisable.
// Donations: { kind: 'donation', amount (pounds), monthly?, name?, message? }
// Memberships also need details: { ecName, ecPhone, medical?, policies: true, photos: bool, privacy: true },
// the answers to the questions asked before paying. They're saved with the payment in Stripe.
// With STRIPE_SECRET_KEY set: creates a Stripe Checkout session (card, Apple Pay, Google Pay) -> { url }.
// With DEMO_PAYMENTS=on instead: returns the lines for the simulated sheet -> { demo: true, title, lines }.
import { PASSWORDS, matches, env, membershipPrice, isMember, readJSON, send, body, origin, fromRequest } from './_lib/core.js';
import { DEFAULT_MERCH } from './_lib/merch.js';

// Letters (any language), numbers, spaces and . ' - &, up to 16 characters.
const NAME_OK = /^[\p{L}\p{N} .'&-]{1,16}$/u;
const PHONE_OK = /^\+?[0-9 ()-]{7,20}$/;
const PRIVACY_VERSION = 'August 2026';
const text = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

// The questions every new member answers before paying. Returns the Stripe metadata, or an error code.
function memberDetails(d) {
  d = d && typeof d === 'object' ? d : {};
  const ecName = text(d.ecName, 80), ecPhone = text(d.ecPhone, 20), medical = text(d.medical, 450);
  if (!ecName) return { error: 'details_ec_name' };
  if (!PHONE_OK.test(ecPhone) || ecPhone.replace(/\D/g, '').length < 7) return { error: 'details_ec_phone' };
  if (d.policies !== true) return { error: 'details_policies' };
  if (d.privacy !== true) return { error: 'details_privacy' };
  return {
    meta: {
      emergency_contact_name: ecName,
      emergency_contact_phone: ecPhone,
      medical_conditions: medical || 'None given',
      club_policies: 'Agreed',
      photography_consent: d.photos === true ? 'Yes' : 'No',
      privacy_notice: 'Agreed (' + PRIVACY_VERSION + ' version)',
      agreed_at: new Date().toISOString()
    }
  };
}

export default async function handler(req, res) {
  fromRequest(req);
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  try {
    const b = body(req);
    let title, name, amount, meta = { kind: b.kind };
    const lines = [];
    if (b.kind === 'social' || b.kind === 'full') {
      const det = memberDetails(b.details);
      if (det.error) return send(res, 400, { error: det.error });
      Object.assign(meta, det.meta);
    }
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
        ...(recurring ? { subscription_data: { metadata: meta } } : { customer_creation: 'always', payment_intent_data: { metadata: meta } }),
        ...(meta.kind === 'donation' && !recurring ? { submit_type: 'donate' } : {}),
        ...(meta.kind === 'social' || meta.kind === 'full' ? { custom_text: { submit: { message: 'Please use your Cambridge email address (@cam.ac.uk). That is how we add you to the newsletter, where you book onto social padel.' } } } : {}),
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
