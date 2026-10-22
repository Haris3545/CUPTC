// Shared helpers for the API functions. Files in api/_lib are not deployed as routes.
import crypto from 'node:crypto';

// ------------------------------------------------------------------ settings (set these in Vercel)
// Values are trimmed and any quotes pasted around them are ignored.
export const env = (...keys) => {
  for (const k of keys) {
    const v = String(process.env[k] || '').trim().replace(/^(["'])(.*)\1$/, '$2').trim();
    if (v) return v;
  }
  return '';
};
export const PASSWORDS = () => ({
  member: env('MEMBER_PASSWORD', 'MEMBERS_PASSWORD'),
  committee: env('COMMITTEE_PASSWORD'),
  full: env('FULL_MEMBER_CODE', 'FULL_CODE'),
  // a second full membership code that also works
  fullAlt: env('FULL_MEMBER_CODE_2') || 'FULLMEMBERSHIP',
  discount: env('COMMITTEE_DISCOUNT_CODE', 'DISCOUNT_CODE'),
  // given to people on the social waiting list: their £5 comes off social membership
  waitlist: env('WAITLIST_CODE') || 'WAITINGLIST',
  // a second waiting-list code that works the same way
  waitlistAlt: env('WAITLIST_CODE_2') || 'SOCIALWAITLIST'
});
// Passwords and codes ignore capitals and spaces, so "cuptcmember2026" matches "CUPTCMEMBER2026".
export const norm = (v) => String(v || '').replace(/\s+/g, '').toUpperCase();
export const matches = (typed, want) => !!want && !!typed && same(norm(typed), norm(want));
export const isWaitlistCode = (typed) => { const p = PASSWORDS(); return matches(typed, p.waitlist) || matches(typed, p.waitlistAlt); };
export const isFullCode = (typed) => { const p = PASSWORDS(); return matches(typed, p.full) || matches(typed, p.fullAlt); };

// ------------------------------------------------------------------ prices (in pounds)
export const SALE_END = new Date('2026-10-11T23:59:59+01:00');
export const PRICES = { socialSale: 40, social: 50, committee: 20, waitlist: 45, full: 80 };
export const saleOn = () => Date.now() < SALE_END.getTime();
export function membershipPrice(kind, discountCode) {
  if (kind === 'full') return PRICES.full;
  const codes = PASSWORDS();
  if (matches(discountCode, codes.discount)) return PRICES.committee;
  if (isWaitlistCode(discountCode)) return PRICES.waitlist;
  return saleOn() ? PRICES.socialSale : PRICES.social;
}

// ------------------------------------------------------------------ sign-in tokens
// A token is "role.expiry.signature". Roles: member, committee (committee can do everything a member can).
const secret = () => env('AUTH_SECRET') || crypto.createHash('sha256').update('cuptc:' + PASSWORDS().committee + ':' + PASSWORDS().member).digest('hex');
const sign = (s) => crypto.createHmac('sha256', secret()).update(s).digest('base64url');
export function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
export function makeToken(role, days = 30) {
  const body = role + '.' + (Date.now() + days * 864e5);
  return body + '.' + sign(body);
}
export function roleOf(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [role, exp, sig] = t.split('.');
  if (!role || !exp || !sig || !same(sig, sign(role + '.' + exp)) || Date.now() > +exp) return null;
  return role;
}
export const isMember = (req) => ['member', 'committee'].includes(roleOf(req));
export const isCommittee = (req) => roleOf(req) === 'committee';

// ------------------------------------------------------------------ storage
// Three places data can live, picked automatically:
// - Cloudflare (cloudflare/worker.js): the STORE binding, an R2 bucket or a KV namespace.
// - Vercel: Vercel Blob. Connecting a Blob store sets either BLOB_READ_WRITE_TOKEN (older stores)
//   or BLOB_STORE_ID, in which case the function signs in with Vercel's own per-request OIDC token.
// - Locally (scripts/dev.js): files in .data/.
let platform = null; // set by the Cloudflare worker on each request: { store }
export const usePlatform = (p) => { platform = p; };
const cfStore = () => (platform && platform.store) || null;
const isR2 = (st) => typeof st.head === 'function';
export const host = () => (cfStore() ? 'cloudflare' : process.env.VERCEL_ENV ? 'vercel' : 'local');
const useBlob = () => !cfStore() && !!(env('BLOB_READ_WRITE_TOKEN') || env('BLOB_STORE_ID'));
const local = async () => {
  const [fs, path] = await Promise.all([import('node:fs/promises'), import('node:path')]);
  return { fs, path, dir: path.join(process.cwd(), '.data') };
};
let requestOidc = '';
// Call at the start of a handler that uses storage, so the OIDC token from the request is available.
export function fromRequest(req) {
  const t = req && req.headers && req.headers['x-vercel-oidc-token'];
  if (t) requestOidc = String(t);
}
const auth = () => (env('BLOB_READ_WRITE_TOKEN') ? {} : { oidcToken: requestOidc || undefined, storeId: env('BLOB_STORE_ID') || undefined });
export const storageReady = () => !!cfStore() || useBlob() || env('LOCAL_STORAGE') === '1';
// A real round trip to storage, for the status page.
export async function storageCheck() {
  const st = cfStore();
  if (st) {
    try { await st.get('data/merch.json'); return 'ok (cloudflare ' + (isR2(st) ? 'r2' : 'kv') + ')'; }
    catch (e) { return 'error: ' + String(e && e.message || e).slice(0, 160); }
  }
  if (!useBlob()) return env('LOCAL_STORAGE') === '1' ? 'ok (local)' : 'not connected';
  try {
    const { list } = await import('@vercel/blob');
    await list({ limit: 1, ...auth() });
    return 'ok';
  } catch (e) {
    return 'error: ' + String(e && e.message || e).slice(0, 160);
  }
}

// Raw files in Cloudflare storage (JSON documents and uploaded photos).
async function cfGet(key, as) {
  const st = cfStore();
  if (isR2(st)) {
    const o = await st.get(key);
    return o ? (as === 'json' ? o.json() : o) : null;
  }
  if (as === 'json') return st.get(key, 'json');
  const { value, metadata } = await st.getWithMetadata(key, 'arrayBuffer');
  return value ? { body: value, httpMetadata: { contentType: (metadata && metadata.type) || 'application/octet-stream' } } : null;
}
async function cfPut(key, value, type) {
  const st = cfStore();
  if (isR2(st)) await st.put(key, value, { httpMetadata: { contentType: type } });
  else await st.put(key, value, { metadata: { type } });
}
// An uploaded photo for the worker to serve at /uploads/..., or null.
export async function readUpload(key) {
  if (!cfStore() || !/^uploads\/[\w.-]+$/.test(key)) return null;
  return cfGet(key);
}

// On Vercel, JSON documents are written under a new name each time and the older copies removed,
// so a read never gets a stale cached copy.
export async function readJSON(name, fallback) {
  if (cfStore()) {
    const v = await cfGet('data/' + name + '.json', 'json');
    return v == null ? fallback : v;
  }
  if (useBlob()) {
    const { list } = await import('@vercel/blob');
    const { blobs } = await list({ prefix: 'data/' + name + '-', ...auth() });
    if (!blobs.length) return fallback;
    blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    const r = await fetch(blobs[0].url, { cache: 'no-store' });
    return r.ok ? r.json() : fallback;
  }
  if (env('LOCAL_STORAGE') !== '1') return fallback;
  const { fs, path, dir } = await local();
  try { return JSON.parse(await fs.readFile(path.join(dir, name + '.json'), 'utf8')); } catch { return fallback; }
}
export async function writeJSON(name, data) {
  if (cfStore()) return cfPut('data/' + name + '.json', JSON.stringify(data), 'application/json');
  if (useBlob()) {
    const { put, list, del } = await import('@vercel/blob');
    const { blobs: old } = await list({ prefix: 'data/' + name + '-', ...auth() });
    await put('data/' + name + '-' + Date.now() + '.json', JSON.stringify(data), { access: 'public', contentType: 'application/json', addRandomSuffix: true, ...auth() });
    if (old.length) await del(old.map((b) => b.url), auth());
    return;
  }
  const { fs, path, dir } = await local();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name + '.json'), JSON.stringify(data, null, 2));
}
export async function putImage(name, buf) {
  if (cfStore()) {
    const key = 'uploads/' + name + '-' + Date.now().toString(36) + '-' + crypto.randomBytes(5).toString('hex') + '.jpg';
    await cfPut(key, buf, 'image/jpeg');
    return '/' + key;
  }
  if (useBlob()) {
    const { put } = await import('@vercel/blob');
    const b = await put('uploads/' + name + '.jpg', buf, { access: 'public', contentType: 'image/jpeg', addRandomSuffix: true, ...auth() });
    return b.url;
  }
  const { fs, path, dir } = await local();
  const file = name + '-' + Date.now() + '.jpg';
  await fs.mkdir(path.join(dir, 'uploads'), { recursive: true });
  await fs.writeFile(path.join(dir, 'uploads', file), buf);
  return '/.data/uploads/' + file;
}
// Uploaded images live in storage (Vercel Blob, Cloudflare's /uploads/, or .data/uploads locally);
// everything else is a built-in image name.
export const isUploaded = (v) => /^(https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\/|\/uploads\/|\/\.data\/uploads\/)[\w./%-]+$/i.test(String(v || ''));
export async function removeImage(url) {
  if (!url) return;
  try {
    if (cfStore()) { if (String(url).startsWith('/uploads/')) await cfStore().delete(String(url).slice(1)); }
    else if (useBlob()) { const { del } = await import('@vercel/blob'); await del(url, auth()); }
    else { const { fs, path } = await local(); await fs.unlink(path.join(process.cwd(), url)); }
  } catch { /* already gone */ }
}

// ------------------------------------------------------------------ http
export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
export const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {});
export function origin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return proto.split(',')[0] + '://' + req.headers.host;
}
