// GET: who the sign-in token belongs to -> { role: 'member' | 'committee' | null }. Used to check a saved sign-in on page load.
import { roleOf, send } from './_lib/core.js';

export default function handler(req, res) {
  return send(res, 200, { role: roleOf(req) });
}
