// POST { image: "data:image/jpeg;base64,..." } -> { url }. Uploads a shop photo. Needs the committee sign-in.
import { isCommittee, putImage, storageReady, send, body, fromRequest } from './_lib/core.js';

export default async function handler(req, res) {
  fromRequest(req);
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!isCommittee(req)) return send(res, 401, { error: 'committee_only' });
  if (!storageReady()) return send(res, 503, { error: 'storage_not_configured' });
  try {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(body(req).image || ''));
    if (!m) return send(res, 400, { error: 'jpeg_required' });
    const buf = Buffer.from(m[1], 'base64');
    if (buf.length > 2.5e6) return send(res, 413, { error: 'too_big' });
    return send(res, 200, { url: await putImage('merch', buf) });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'server' });
  }
}
