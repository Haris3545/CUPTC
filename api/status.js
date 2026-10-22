// GET /api/status: which settings this deployment can see. Shows yes/no only, never the values.
import { PASSWORDS, env, storageCheck, fromRequest, send } from './_lib/core.js';

export default async function handler(req, res) {
  fromRequest(req);
  const p = PASSWORDS();
  const key = env('STRIPE_SECRET_KEY');
  return send(res, 200, {
    environment: process.env.VERCEL_ENV || 'local',
    MEMBER_PASSWORD: !!p.member,
    COMMITTEE_PASSWORD: !!p.committee,
    FULL_MEMBER_CODE: !!p.full,
    COMMITTEE_DISCOUNT_CODE: !!p.discount,
    AUTH_SECRET: !!env('AUTH_SECRET'),
    // If these match, the members password signs people in as committee.
    passwordsDifferent: !!p.member && !!p.committee && p.member.replace(/\s+/g, '').toUpperCase() !== p.committee.replace(/\s+/g, '').toUpperCase(),
    storage: await storageCheck(),
    // Relay for Padel Pong 1v1 on networks that block direct links between phones.
    // Private merch order sheets at /api/orders?key=...
    ORDERS_KEY: env('ORDERS_KEY').length >= 16 ? true : env('ORDERS_KEY') ? 'too short (needs 16+ characters)' : false,
    padelPongRelay: !!(env('CF_TURN_KEY_ID') && env('CF_TURN_API_TOKEN')),
    // Secret (sk_) and restricted (rk_) keys both say live or test in their prefix.
    stripe: key ? (/^(sk|rk)_live_/.test(key) ? 'live' : /^(sk|rk)_test_/.test(key) ? 'test' : 'unrecognised key') : false,
    // Names only (never values) of settings that look password-related, to spot a misspelt name.
    similarNames: Object.keys(process.env).filter((k) => /PASSWORD|PASWORD|MEMBER|COMMITTEE|DISCOUNT|FULL_?CODE/i.test(k) && !/ASKPASS|^(npm_|VERCEL_|NODE_|CLAUDE)/i.test(k)).sort()
  });
}
