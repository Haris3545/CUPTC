// GET: the shop (prices and delivery only for signed-in members).
// POST { item }: add or update an item. DELETE ?id=: remove one. Both need the committee sign-in.
import crypto from 'node:crypto';
import { isMember, isCommittee, readJSON, writeJSON, storageReady, send, body, isUploaded, removeImage, fromRequest } from './_lib/core.js';
import { DEFAULT_MERCH } from './_lib/merch.js';

// Every uploaded photo an item uses (main and extras), so replaced ones can be tidied away.
const uploads = (m) => [m.image].concat(m.images || []).filter(isUploaded);
const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

export default async function handler(req, res) {
  fromRequest(req);
  try {
    const items = await readJSON('merch', DEFAULT_MERCH);
    if (req.method === 'GET') {
      const member = isMember(req);
      const out = items.slice().sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((m) => (member ? m : { id: m.id, name: m.name, description: m.description, image: m.image, order: m.order, customisable: !!m.customisable, images: m.images || [], sizeChart: m.sizeChart || '' }));
      return send(res, 200, { items: out, member });
    }
    if (!isCommittee(req)) return send(res, 401, { error: 'committee_only' });
    if (!storageReady()) return send(res, 503, { error: 'storage_not_configured' });
    if (req.method === 'POST') {
      const i = body(req).item || {};
      const item = {
        id: clean(i.id, 60) || crypto.randomUUID().slice(0, 8),
        name: clean(i.name, 80), description: clean(i.description, 400),
        price: Math.max(0, Math.round((Number(i.price) || 0) * 100) / 100),
        delivery: clean(i.delivery, 60), sizes: clean(i.sizes, 80), image: isUploaded(i.image) || /^[a-z0-9-]{0,40}$/.test(i.image || '') ? clean(i.image, 400) : '',
        order: Number(i.order) || 0,
        images: (Array.isArray(i.images) ? i.images : []).map((v) => String(v || '')).filter((v) => isUploaded(v) || /^[a-z0-9-]{1,40}$/.test(v)).slice(0, 8),
        sizeChart: String(i.sizeChart || '').slice(0, 1200),
        customisable: !!i.customisable,
        customPrice: Math.max(0, Math.round((i.customPrice === '' || i.customPrice == null ? 2 : Number(i.customPrice) || 0) * 100) / 100)
      };
      if (!item.name) return send(res, 400, { error: 'name_required' });
      const before = items.find((m) => m.id === item.id);
      const next = items.filter((m) => m.id !== item.id).concat(item);
      await writeJSON('merch', next);
      if (before) for (const u of uploads(before)) if (!uploads(item).includes(u)) await removeImage(u);
      return send(res, 200, { item });
    }
    if (req.method === 'DELETE') {
      const id = clean(req.query.id, 60);
      const gone = items.find((m) => m.id === id);
      await writeJSON('merch', items.filter((m) => m.id !== id));
      if (gone) for (const u of uploads(gone)) await removeImage(u);
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'method' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'server' });
  }
}
