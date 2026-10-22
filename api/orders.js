// Private merch order sheets, read straight from Stripe, so every order ever paid is included.
// Needs ORDERS_KEY set in Vercel (a long random code); every request must carry it as ?key=.
// GET ?key=K                          -> a page listing each item, with its Google Sheets formula and a CSV download
// GET ?key=K&format=csv&item=all      -> every order on one sheet
// GET ?key=K&format=csv&item=<id>     -> one item's orders (sizes for each part, customisation, address),
//                                        then totals by size to send to the supplier
// In Google Sheets, one tab per item: =IMPORTDATA("https://cuptc.com/api/orders?key=K&format=csv&item=<id>")
import { env, readJSON, same, origin, fromRequest } from './_lib/core.js';
import { DEFAULT_MERCH, withDefaults } from './_lib/merch.js';
import { toOrder, itemSheet, allSheet, toCsv } from './_lib/orders.js';

let cache = null; // { at, orders }, so a sheet with several tabs refreshing at once asks Stripe only once

async function loadOrders() {
  if (cache && Date.now() - cache.at < 60e3) return cache.orders;
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(env('STRIPE_SECRET_KEY'));
  const collect = async (params) => {
    const out = [];
    for await (const s of stripe.checkout.sessions.list(params)) {
      if (s.metadata && s.metadata.kind === 'merch' && s.payment_status === 'paid') out.push(s);
    }
    return out;
  };
  let sessions;
  try {
    // with the charge, for the receipt number and refunds
    sessions = await collect({ status: 'complete', limit: 100, expand: ['data.payment_intent.latest_charge'] });
  } catch (e) {
    // a restricted Stripe key may not be allowed to read charges: carry on without them
    sessions = await collect({ status: 'complete', limit: 100 });
  }
  const orders = sessions.map(toOrder).sort((a, b) => a.created - b.created);
  cache = { at: Date.now(), orders };
  return orders;
}

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(base, key, sheets) {
  const url = (id) => base + '/api/orders?key=' + encodeURIComponent(key) + '&format=csv&item=' + encodeURIComponent(id);
  const rows = sheets.map((s) => `<tr><td><b>${esc(s.name)}</b><br><small>${s.count} order${s.count === 1 ? '' : 's'}</small></td>
    <td><input readonly value="${esc('=IMPORTDATA("' + url(s.id) + '")')}" onclick="this.select()"></td>
    <td><a href="${esc(url(s.id))}" download="${esc(s.name)}.csv">Download CSV</a></td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>CUPTC merch orders</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:900px;margin:32px auto;padding:0 16px;color:#1d2a24}
table{width:100%;border-collapse:collapse}td{padding:10px 8px;border-bottom:1px solid #dde5e0;vertical-align:top}
input{width:100%;font:12px ui-monospace,monospace;padding:6px;box-sizing:border-box}small{color:#667}a{color:#2f6b52}</style></head><body>
<h1>Merch orders</h1>
<p>Every paid merch order, straight from Stripe. Private: only works with your key, so don't share these links.</p>
<p><b>Google Sheets:</b> make one tab per item, click in cell A1 and paste that item's formula. Sheets refreshes it
about once an hour. To send a supplier one item's list, open its tab and use File &gt; Download.</p>
<table>${rows}</table></body></html>`;
}

export default async function handler(req, res) {
  fromRequest(req);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  const want = env('ORDERS_KEY');
  const q = new URL(req.url, 'http://x').searchParams;
  const key = q.get('key') || '';
  const fail = (code, msg) => { res.statusCode = code; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end(msg + '\n'); };
  if (!want || want.length < 16) return fail(503, 'Orders are not set up: add ORDERS_KEY (at least 16 characters) in Vercel.');
  if (!same(key, want)) return fail(401, 'Wrong or missing key.');
  if (!env('STRIPE_SECRET_KEY')) return fail(503, 'Stripe is not connected (demo mode), so there are no orders to show.');
  try {
    const [orders, stored] = await Promise.all([loadOrders(), readJSON('merch', DEFAULT_MERCH)]);
    const items = withDefaults(stored).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    // items no longer in the shop still get a sheet if they were ever ordered
    for (const id of new Set(orders.map((o) => o.item))) {
      if (id && !items.some((i) => i.id === id)) items.push({ id, name: id + ' (no longer in the shop)', sizes: '', parts: '' });
    }
    if (q.get('format') !== 'csv') {
      const sheets = [{ id: 'all', name: 'All orders', count: orders.length }]
        .concat(items.map((i) => ({ id: i.id, name: i.name, count: orders.filter((o) => o.item === i.id).length })));
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(page(origin(req), key, sheets));
    }
    const id = q.get('item') || 'all';
    let rows;
    if (id === 'all') rows = allSheet(items, orders);
    else {
      const item = items.find((i) => i.id === id);
      if (!item) return fail(404, 'No item with that id.');
      rows = itemSheet(item, orders.filter((o) => o.item === id));
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    return res.end(toCsv(rows));
  } catch (e) {
    console.error('orders', e);
    return fail(502, 'Could not read orders from Stripe: ' + (e && e.message ? e.message : 'unknown error'));
  }
}
