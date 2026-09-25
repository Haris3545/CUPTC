// POST { kind: 'full' | 'discount', code } -> { ok, price? }. Checks membership codes without revealing them.
import { PASSWORDS, same, send, body, PRICES } from './_lib/core.js';

export default function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const { kind, code } = body(req);
  const want = PASSWORDS()[kind === 'full' ? 'full' : 'discount'];
  const ok = !!want && same(String(code || '').trim().toUpperCase(), want.toUpperCase());
  return send(res, 200, ok && kind !== 'full' ? { ok, price: PRICES.committee } : { ok });
}
