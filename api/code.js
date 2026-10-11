// POST { kind: 'full' | 'discount', code } -> { ok, price?, type? }. Checks membership codes without revealing them.
// For 'discount' the code can be the committee code (£20) or the waiting-list code (£45).
import { PASSWORDS, matches, send, body, PRICES } from './_lib/core.js';

export default function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const { kind, code } = body(req);
  const codes = PASSWORDS();
  if (kind === 'full') {
    if (!codes.full) return send(res, 503, { error: 'not_configured' });
    return send(res, 200, { ok: matches(code, codes.full) });
  }
  if (matches(code, codes.discount)) return send(res, 200, { ok: true, price: PRICES.committee, type: 'committee' });
  if (matches(code, codes.waitlist)) return send(res, 200, { ok: true, price: PRICES.waitlist, type: 'waitlist' });
  return send(res, 200, { ok: false });
}
