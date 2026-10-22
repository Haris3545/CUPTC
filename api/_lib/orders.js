// Merch orders as spreadsheet rows, built from Stripe Checkout sessions (see api/orders.js).
import { listOf } from './merch.js';

// Before 14 October 2026 the only customisation on offer was a name on the back.
const LABEL_CHANGE = Date.parse('2026-10-14T00:00:00Z');

const money = (pence) => (Number(pence || 0) / 100).toFixed(2);
const day = (secs) => new Date(secs * 1000).toISOString().slice(0, 16).replace('T', ' ');

function address(s) {
  const sd = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || null;
  const a = sd && sd.address;
  if (!a) return '';
  return [sd.name, a.line1, a.line2, a.city, a.state, a.postal_code, a.country === 'GB' ? '' : a.country].filter(Boolean).join(', ');
}

// One paid merch order, in a shape that doesn't depend on Stripe's.
export function toOrder(s) {
  const m = s.metadata || {};
  const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
  const charge = pi && pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  const c = s.customer_details || {};
  const custom = m.custom || '';
  return {
    created: s.created,
    date: day(s.created),
    receipt: (charge && charge.receipt_number) || '',
    ref: String((pi && pi.id) || s.payment_intent || s.id || ''),
    name: c.name || '',
    email: c.email || '',
    phone: c.phone || '',
    item: m.item || '',
    size: m.size || '',
    custom,
    customLabel: custom ? m.custom_label || (s.created * 1000 < LABEL_CHANGE ? 'Name on the back' : 'Customisation') : '',
    address: address(s),
    paid: money(s.amount_total),
    status: charge && charge.refunded ? 'Refunded' : charge && charge.amount_refunded ? 'Part refunded' : 'Paid'
  };
}

// "Shirt: S, Shorts: L" -> { Shirt: 'S', Shorts: 'L' }. An order from before the item was split into
// parts has a single size, which then applies to every part.
function partSizes(size, parts) {
  const out = {};
  const bits = String(size || '').split(',').map((x) => x.trim()).filter(Boolean);
  const named = bits.every((b) => b.includes(':'));
  if (named && bits.length) {
    bits.forEach((b) => { const i = b.indexOf(':'); out[b.slice(0, i).trim().toLowerCase()] = b.slice(i + 1).trim(); });
    return { sizes: parts.map((p) => out[p.toLowerCase()] || ''), whole: false };
  }
  return { sizes: parts.map(() => size || ''), whole: !!size };
}

const cell = (v) => {
  const t = String(v == null ? '' : v);
  // keep spreadsheets from treating names like "=SUM(...)" as formulas
  const safe = /^[=+\-@\t\r]/.test(t) ? "'" + t : t;
  return /[",\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
};
export const toCsv = (rows) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

const tally = (list) => {
  const n = new Map();
  list.filter(Boolean).forEach((v) => n.set(v, (n.get(v) || 0) + 1));
  return n;
};
const bySize = (sizeOrder) => (a, b) => {
  const ia = sizeOrder.indexOf(a[0]), ib = sizeOrder.indexOf(b[0]);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || String(a[0]).localeCompare(String(b[0]));
};

// The rows for one item's sheet: every order, then totals to send to the supplier.
export function itemSheet(item, orders) {
  const parts = listOf(item.parts), sizeOrder = listOf(item.sizes);
  const hasCustom = item.customisable || orders.some((o) => o.custom);
  const head = ['Order date', 'Receipt no.', 'Name', 'Email', 'Phone']
    .concat(parts.length ? ['Contents'].concat(parts.map((p) => p + ' size')) : ['Size'])
    .concat(hasCustom ? ['Customisation', 'Customisation text'] : [])
    .concat(['Delivery address', 'Paid (£)', 'Status', 'Stripe payment']);
  const rows = [head];
  const live = [];
  for (const o of orders) {
    const ps = parts.length ? partSizes(o.size, parts) : null;
    rows.push([o.date, o.receipt, o.name, o.email, o.phone]
      .concat(ps ? ['Full ' + item.name + ' (' + parts.join(' + ') + ')' + (ps.whole ? ', one size for all' : '')].concat(ps.sizes) : [o.size])
      .concat(hasCustom ? [o.custom ? o.customLabel : '', o.custom] : [])
      .concat([o.address, o.paid, o.status, o.ref]));
    if (o.status !== 'Refunded') live.push({ o, ps });
  }
  // Totals for the supplier (refunded orders left out)
  rows.push([], ['TOTALS FOR SUPPLIER', '', live.length + ' order' + (live.length === 1 ? '' : 's') + ' (refunds left out)']);
  const groups = parts.length ? parts.map((p, i) => [p, live.map((x) => x.ps.sizes[i])]) : [['', live.map((x) => x.o.size)]];
  for (const [label, sizes] of groups) {
    rows.push([label ? label + ' size' : 'Size', 'How many']);
    [...tally(sizes)].sort(bySize(sizeOrder)).forEach(([s, n]) => rows.push([s, n]));
    if (!sizes.filter(Boolean).length) rows.push(['(no sizes)', live.length]);
    rows.push([]);
  }
  const customs = live.filter((x) => x.o.custom);
  if (customs.length) {
    rows.push(['CUSTOMISATIONS', 'Size', 'Text']);
    customs.forEach(({ o, ps }) => rows.push([o.customLabel, ps ? parts.map((p, i) => p + ' ' + ps.sizes[i]).join(', ') : o.size, o.custom]));
  }
  return rows;
}

// Every order on one sheet.
export function allSheet(items, orders) {
  const name = (id) => (items.find((i) => i.id === id) || {}).name || id;
  const rows = [['Order date', 'Receipt no.', 'Item', 'Size(s)', 'Customisation', 'Customisation text', 'Name', 'Email', 'Phone', 'Delivery address', 'Paid (£)', 'Status', 'Stripe payment']];
  orders.forEach((o) => rows.push([o.date, o.receipt, name(o.item), o.size, o.custom ? o.customLabel : '', o.custom, o.name, o.email, o.phone, o.address, o.paid, o.status, o.ref]));
  return rows;
}
