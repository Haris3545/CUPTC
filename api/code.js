// POST { kind: 'full' | 'discount', code } -> { ok, price? }. Checks membership codes without revealing them.
import { PASSWORDS, matches, send, body, PRICES } from './_lib/core.js';

export default function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const { kind, code } = body(req);
  const want = PASSWORDS()[kind === 'full' ? 'full' : 'discount'];
  if (!want) return send(res, 503, { error: 'not_configured' });
  const ok = matches(code, want);
  return send(res, 200, ok && kind !== 'full' ? { ok, price: PRICES.committee } : { ok });
}
