// GET: custom committee photos { photos: { slug: url } }.
// POST { slug, image: "data:image/jpeg;base64,..." }: upload a new photo. DELETE ?slug=: go back to the original.
// Uploads need the committee sign-in.
import { isCommittee, readJSON, writeJSON, putImage, removeImage, storageReady, send, body, fromRequest } from './_lib/core.js';

const SLUG = /^[a-z0-9-]{1,40}$/;

export default async function handler(req, res) {
  fromRequest(req);
  try {
    const photos = await readJSON('committee', {});
    if (req.method === 'GET') return send(res, 200, { photos });
    if (!isCommittee(req)) return send(res, 401, { error: 'committee_only' });
    if (!storageReady()) return send(res, 503, { error: 'storage_not_configured' });
    const slug = String((req.method === 'DELETE' ? req.query.slug : body(req).slug) || '');
    if (!SLUG.test(slug)) return send(res, 400, { error: 'bad_slug' });
    if (req.method === 'POST') {
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(body(req).image || ''));
      if (!m) return send(res, 400, { error: 'jpeg_required' });
      const buf = Buffer.from(m[1], 'base64');
      if (buf.length > 1.5e6) return send(res, 413, { error: 'too_big' });
      const url = await putImage('committee-' + slug, buf);
      await removeImage(photos[slug]);
      await writeJSON('committee', { ...photos, [slug]: url });
      return send(res, 200, { url });
    }
    if (req.method === 'DELETE') {
      await removeImage(photos[slug]);
      const next = { ...photos };
      delete next[slug];
      await writeJSON('committee', next);
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'method' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'server' });
  }
}
