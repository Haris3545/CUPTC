// POST { password } -> { role, token }. Works for the members and the committee password.
import { PASSWORDS, same, makeToken, send, body } from './_lib/core.js';

export default function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const pw = String(body(req).password || '').trim();
  const p = PASSWORDS();
  if (!p.member || !p.committee) return send(res, 503, { error: 'not_configured' });
  if (pw && same(pw, p.committee)) return send(res, 200, { role: 'committee', token: makeToken('committee') });
  if (pw && same(pw, p.member)) return send(res, 200, { role: 'member', token: makeToken('member') });
  return send(res, 401, { error: 'wrong_password' });
}
