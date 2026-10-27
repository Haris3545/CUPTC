// GET ?card=<membership card> -> the card as an Apple Wallet pass (.pkpass).
// GET ?card=<card>&check=1   -> { ok } when Wallet passes are set up, so the button knows what to do.
// A pass has to be signed with the club's Apple "Pass Type ID" certificate. Set these in the hosting settings:
//   APPLE_PASS_TYPE_ID  e.g. pass.com.cuptc.membership      APPLE_TEAM_ID  the 10-character Apple team ID
//   APPLE_PASS_CERT     the pass certificate, PEM           APPLE_PASS_KEY its private key, PEM
//   APPLE_PASS_KEY_PASSWORD  if the key has one             APPLE_WWDR_CERT Apple's WWDR (G4) certificate, PEM
// Without them the button explains that Wallet passes are coming soon.
import crypto from 'node:crypto';
import forge from 'node-forge';
import { env, send, origin } from './_lib/core.js';
import { readCard, CARD_ENDS } from './club.js';
import { WALLET_IMAGES } from './_lib/wallet-images.js';

const pem = (k) => env(k).replace(/\\n/g, '\n');
const ready = () => ['APPLE_PASS_TYPE_ID', 'APPLE_TEAM_ID', 'APPLE_PASS_CERT', 'APPLE_PASS_KEY', 'APPLE_WWDR_CERT'].every((k) => env(k));

// A plain (uncompressed) zip, which is all Wallet needs.
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const n = Buffer.from(name), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26); local.writeUInt16LE(0, 28);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0, 8); cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(0, 12); cen.writeUInt16LE(0x21, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(n.length, 28); cen.writeUInt16LE(0, 30); cen.writeUInt16LE(0, 32); cen.writeUInt16LE(0, 34); cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38); cen.writeUInt32LE(offset, 42);
    parts.push(local, n, data);
    central.push(cen, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, cd, end]);
}

// The detached PKCS #7 signature of manifest.json that Wallet checks.
function signManifest(manifest) {
  const cert = forge.pki.certificateFromPem(pem('APPLE_PASS_CERT'));
  const wwdr = forge.pki.certificateFromPem(pem('APPLE_WWDR_CERT'));
  const keyPem = pem('APPLE_PASS_KEY');
  const key = env('APPLE_PASS_KEY_PASSWORD') ? forge.pki.decryptRsaPrivateKey(keyPem, env('APPLE_PASS_KEY_PASSWORD')) : forge.pki.privateKeyFromPem(keyPem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifest.toString('binary'));
  p7.addCertificate(cert);
  p7.addCertificate(wwdr);
  p7.addSigner({
    key, certificate: cert, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [{ type: forge.pki.oids.contentType, value: forge.pki.oids.data }, { type: forge.pki.oids.messageDigest }, { type: forge.pki.oids.signingTime, value: new Date() }]
  });
  p7.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');
}

export default async function handler(req, res) {
  const q = new URL(req.url, 'http://x').searchParams;
  const token = q.get('card') || '';
  const c = readCard(token);
  if (!c || !c.current) return send(res, 400, { error: 'card_invalid' });
  if (!ready()) return send(res, 503, { error: 'wallet_not_set_up' });
  if (q.get('check')) return send(res, 200, { ok: true });
  try {
    const checkUrl = origin(req) + '/#check=' + token;
    const pass = {
      formatVersion: 1,
      passTypeIdentifier: env('APPLE_PASS_TYPE_ID'),
      teamIdentifier: env('APPLE_TEAM_ID'),
      serialNumber: crypto.createHash('sha256').update(token).digest('hex').slice(0, 24),
      organizationName: 'CUPTC',
      description: 'CUPTC membership card',
      logoText: 'CUPTC',
      foregroundColor: 'rgb(244, 241, 234)',
      labelColor: 'rgb(133, 180, 160)',
      backgroundColor: 'rgb(19, 38, 31)',
      expirationDate: new Date(CARD_ENDS).toISOString(),
      generic: {
        primaryFields: [{ key: 'name', label: 'MEMBER', value: c.name }],
        secondaryFields: [{ key: 'type', label: 'MEMBERSHIP', value: c.label }, { key: 'year', label: 'SEASON', value: String(c.year).replace('-', '–') }],
        auxiliaryFields: [{ key: 'no', label: 'CARD NO.', value: c.id }],
        backFields: [{ key: 'about', label: 'Cambridge University Padel Tennis Club', value: 'Show this card at club sessions. Scanning the code checks it with the club. Questions: secretary@cuptc.com' }]
      },
      barcodes: [{ format: 'PKBarcodeFormatQR', message: checkUrl, messageEncoding: 'iso-8859-1', altText: 'No. ' + c.id }]
    };
    const files = { 'pass.json': Buffer.from(JSON.stringify(pass)) };
    for (const [name, b64] of Object.entries(WALLET_IMAGES)) files[name] = Buffer.from(b64, 'base64');
    const manifest = Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(files).map(([n, d]) => [n, crypto.createHash('sha1').update(d).digest('hex')]))));
    files['manifest.json'] = manifest;
    files.signature = signManifest(manifest);
    const out = zip(files);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
    res.setHeader('Content-Disposition', 'attachment; filename="cuptc-membership.pkpass"');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.end(out);
  } catch (e) {
    console.error('pass', e);
    return send(res, 500, { error: 'wallet_failed' });
  }
}
