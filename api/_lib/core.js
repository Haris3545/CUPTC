// Shared helpers for the API functions. Files in api/_lib are not deployed as routes.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// ------------------------------------------------------------------ settings (set these in Vercel)
export const env = (k) => (process.env[k] || '').trim();
export const PASSWORDS = () => ({
  member: env('MEMBER_PASSWORD'),
  committee: env('COMMITTEE_PASSWORD'),
  full: env('FULL_MEMBER_CODE'),
  discount: env('COMMITTEE_DISCOUNT_CODE')
});

// ------------------------------------------------------------------ prices (in pounds)
export const SALE_END = new Date('2026-10-11T23:59:59+01:00');
export const PRICES = { socialSale: 40, social: 50, committee: 20, full: 80 };
export const saleOn = () => Date.now() < SALE_END.getTime();
export function membershipPrice(kind, discountCode) {
  if (kind === 'full') return PRICES.full;
  const codes = PASSWORDS();
  if (discountCode && codes.discount && same(discountCode.toUpperCase(), codes.discount.toUpperCase())) return PRICES.committee;
  return saleOn() ? PRICES.socialSale : PRICES.social;
}

// ------------------------------------------------------------------ sign-in tokens
// A token is "role.expiry.signature". Roles: member, committee (committee can do everything a member can).
const secret = () => env('AUTH_SECRET') || crypto.createHash('sha256').update('cuptc:' + env('COMMITTEE_PASSWORD') + ':' + env('MEMBER_PASSWORD')).digest('hex');
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
// On Vercel: Vercel Blob (needs a Blob store connected, which sets BLOB_READ_WRITE_TOKEN).
// Locally (scripts/dev.js): files in .data/.
const LOCAL = path.join(process.cwd(), '.data');
const useBlob = () => !!env('BLOB_READ_WRITE_TOKEN');
export const storageReady = () => useBlob() || env('LOCAL_STORAGE') === '1';

// JSON documents are written under a new name each time and the older copies removed,
// so a read never gets a stale cached copy.
export async function readJSON(name, fallback) {
  if (useBlob()) {
    const { list } = await import('@vercel/blob');
    const { blobs } = await list({ prefix: 'data/' + name + '-' });
    if (!blobs.length) return fallback;
    blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    const r = await fetch(blobs[0].url, { cache: 'no-store' });
    return r.ok ? r.json() : fallback;
  }
  if (env('LOCAL_STORAGE') !== '1') return fallback;
  try { return JSON.parse(await fs.readFile(path.join(LOCAL, name + '.json'), 'utf8')); } catch { return fallback; }
}
export async function writeJSON(name, data) {
  if (useBlob()) {
    const { put, list, del } = await import('@vercel/blob');
    const { blobs: old } = await list({ prefix: 'data/' + name + '-' });
    await put('data/' + name + '-' + Date.now() + '.json', JSON.stringify(data), { access: 'public', contentType: 'application/json', addRandomSuffix: true });
    if (old.length) await del(old.map((b) => b.url));
    return;
  }
  await fs.mkdir(LOCAL, { recursive: true });
  await fs.writeFile(path.join(LOCAL, name + '.json'), JSON.stringify(data, null, 2));
}
export async function putImage(name, buf) {
  if (useBlob()) {
    const { put } = await import('@vercel/blob');
    const b = await put('uploads/' + name + '.jpg', buf, { access: 'public', contentType: 'image/jpeg', addRandomSuffix: true });
    return b.url;
  }
  const file = name + '-' + Date.now() + '.jpg';
  await fs.mkdir(path.join(LOCAL, 'uploads'), { recursive: true });
  await fs.writeFile(path.join(LOCAL, 'uploads', file), buf);
  return '/.data/uploads/' + file;
}
// Uploaded images live in Blob storage (or .data/uploads locally); everything else is a built-in image name.
export const isUploaded = (v) => /^(https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\/|\/\.data\/uploads\/)[\w./%-]+$/i.test(String(v || ''));
export async function removeImage(url) {
  if (!url) return;
  try {
    if (useBlob()) { const { del } = await import('@vercel/blob'); await del(url); }
    else await fs.unlink(path.join(process.cwd(), url));
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
