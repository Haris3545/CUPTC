// GET /api/status: which settings this deployment can see. Shows yes/no only, never the values.
import { PASSWORDS, env, storageReady, send } from './_lib/core.js';

export default function handler(req, res) {
  const p = PASSWORDS();
  const key = env('STRIPE_SECRET_KEY');
  return send(res, 200, {
    environment: process.env.VERCEL_ENV || 'local',
    MEMBER_PASSWORD: !!p.member,
    COMMITTEE_PASSWORD: !!p.committee,
    FULL_MEMBER_CODE: !!p.full,
    COMMITTEE_DISCOUNT_CODE: !!p.discount,
    AUTH_SECRET: !!env('AUTH_SECRET'),
    storage: storageReady(),
    stripe: key ? (key.startsWith('sk_live') ? 'live' : 'test') : false,
    // Names only (never values) of settings that look password-related, to spot a misspelt name.
    similarNames: Object.keys(process.env).filter((k) => /PASSWORD|PASWORD|MEMBER|COMMITTEE|DISCOUNT|FULL_?CODE/i.test(k) && !/ASKPASS|^(npm_|VERCEL_|NODE_|CLAUDE)/i.test(k)).sort()
  });
}
