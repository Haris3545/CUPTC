// Local preview: `npm run dev`, then open http://localhost:3000
// Serves the site and runs the api/ functions the same way Vercel does, with uploads saved to .data/.
// Settings come from a .env file if there is one (see .env.example); anything missing gets a dev-only default.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env */ }
const DEV = { MEMBER_PASSWORD: 'member', COMMITTEE_PASSWORD: 'committee', FULL_MEMBER_CODE: 'full', COMMITTEE_DISCOUNT_CODE: 'discount', DEMO_PAYMENTS: 'on', LOCAL_STORAGE: '1' };
for (const [k, v] of Object.entries(DEV)) if (!process.env[k]) process.env[k] = v;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const PORT = Number(process.env.PORT) || 3000;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z-]/g, '');
    const file = path.join(ROOT, 'api', name + '.js');
    if (!name || !fs.existsSync(file)) { res.statusCode = 404; return res.end('{}'); }
    let raw = '';
    for await (const c of req) raw += c;
    try { req.body = raw && /json/.test(req.headers['content-type'] || '') ? JSON.parse(raw) : {}; } catch { req.body = {}; }
    req.query = Object.fromEntries(url.searchParams);
    const mod = await import(pathToFileURL(file).href + '?t=' + fs.statSync(file).mtimeMs);
    return mod.default(req, res);
  }
  let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || /(^|[/\\])(node_modules|\.git|\.env)/.test(p)) { res.statusCode = 404; return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log('CUPTC running at http://localhost:' + PORT);
  console.log('Dev passwords: members "' + process.env.MEMBER_PASSWORD + '", committee "' + process.env.COMMITTEE_PASSWORD + '", full code "' + process.env.FULL_MEMBER_CODE + '", discount "' + process.env.COMMITTEE_DISCOUNT_CODE + '"');
});
