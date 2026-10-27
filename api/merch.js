// GET: the shop and its sections (prices and delivery only for signed-in members).
// POST { item }: add or update an item. POST { sections }: save the list of shop sections.
// DELETE ?id=: remove an item. Changes need the committee sign-in.
import crypto from 'node:crypto';
import { isMember, isCommittee, readJSON, writeJSON, storageReady, send, body, isUploaded, removeImage, fromRequest } from './_lib/core.js';
import { DEFAULT_MERCH, withDefaults, sectionsOf } from './_lib/merch.js';

// Every uploaded photo an item uses (main and extras), so replaced ones can be tidied away.
const uploads = (m) => [m.image].concat(m.images || []).filter(isUploaded);
const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const slug = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);

export default async function handler(req, res) {
  fromRequest(req);
  try {
    const shop = await readJSON('shop', null);
    let items = withDefaults(await readJSON('merch', DEFAULT_MERCH), shop);
    const sections = sectionsOf(shop);
    if (req.method === 'GET') {
      const member = isMember(req);
      const out = items.slice().sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((m) => (member ? m : { id: m.id, name: m.name, description: m.description, image: m.image, order: m.order, customisable: !!m.customisable, customLabel: m.customLabel || '', parts: m.parts || '', images: m.images || [], sizeChart: m.sizeChart || '', sections: m.sections || [], group: m.group || '', comingSoon: !!m.comingSoon }));
      return send(res, 200, { items: out, member, sections });
    }
    if (!isCommittee(req)) return send(res, 401, { error: 'committee_only' });
    if (!storageReady()) return send(res, 503, { error: 'storage_not_configured' });
    // The first change to the shop keeps the guessed sections and placeholders as real settings.
    if (!(shop && shop.seeded)) {
      await writeJSON('merch', items);
      await writeJSON('shop', { sections, seeded: true });
    }
    if (req.method === 'POST' && Array.isArray(body(req).sections)) {
      const seen = new Set();
      const next = body(req).sections.slice(0, 12).map((x) => {
        let id = slug(x && x.id) || slug(x && x.name) || 'section';
        while (seen.has(id)) id += '-' + crypto.randomBytes(2).toString('hex');
        seen.add(id);
        return { id, name: clean(x && x.name, 40), blurb: clean(x && x.blurb, 160), featured: !!(x && x.featured) };
      }).filter((x) => x.name);
      if (!next.length) return send(res, 400, { error: 'sections_required' });
      await writeJSON('shop', { sections: next, seeded: true });
      return send(res, 200, { sections: next });
    }
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
        customLabel: clean(i.customLabel, 40),
        parts: clean(i.parts, 80),
        customPrice: Math.max(0, Math.round((i.customPrice === '' || i.customPrice == null ? 2 : Number(i.customPrice) || 0) * 100) / 100),
        sections: (Array.isArray(i.sections) ? i.sections : []).map((v) => slug(v)).filter((v) => v && sections.some((x) => x.id === v)).slice(0, 12),
        group: clean(i.group, 40),
        comingSoon: !!i.comingSoon
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
