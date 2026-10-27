// Starting shop contents, used until the committee saves its first change.
export const DEFAULT_MERCH = [
  { id: 'shirt', name: 'Club shirt', price: 24, delivery: 'To be confirmed', sizes: 'XS, S, M, L, XL', image: 'kit-shirt', order: 10, description: 'The white CUPTC shirt with green collar and trim, lion crest and sponsor on the front.', customisable: true, customPrice: 2 },
  { id: 'womens-bundle', name: "Women's bundle", price: 37, delivery: 'To be confirmed', sizes: 'XS, S, M, L, XL', image: 'kit-skort', order: 30, description: "Women's shirt and skort.", parts: 'Shirt, Skort' },
  { id: 'mens-bundle', name: "Men's bundle", price: 34, delivery: 'To be confirmed', sizes: 'XS, S, M, L, XL', image: 'kit-shorts', order: 40, description: "Men's shirt and shorts.", parts: 'Shirt, Shorts' }
];

// Shop sections, in order. featured: the large, dark showcase at the top. The committee can rename,
// reorder, add and remove them (saved as the 'shop' document).
export const DEFAULT_SECTIONS = [
  { id: 'flagship', name: 'Matchday Collection', blurb: 'The Saxon fleece, the full CUPTC kit and Canterbury trousers.', featured: true },
  { id: 'social', name: 'Social Padel', blurb: 'Illustrated shirts, hats and everything else for social padel.', featured: false }
];
// Shown until the committee's next change to the shop, then kept like any other item (so they can be
// edited or removed). v: the shop version that added them; a shop saved before that version gets them.
// match: an existing item with a name like this already covers it, so the placeholder isn't added.
const soon = (v, id, name, description, order, section, match) => ({ v, match, item: { id, name, description, price: 0, delivery: '', sizes: '', image: '', order, sections: [section], group: '', comingSoon: true } });
const PLACEHOLDERS = [
  soon(1, 'canterbury-trousers', 'Canterbury trousers', 'Club trousers from Canterbury. Coming soon.', 60, 'flagship', /trouser/i),
  soon(2, 'water-bottle', 'Water bottle', 'A CUPTC water bottle. Coming soon.', 80, 'social', /bottle/i),
  soon(2, 'boonie', 'Boonie hat', 'A CUPTC boonie hat. Coming soon.', 81, 'social', /boonie/i),
  soon(2, 'club-tie', 'Club tie', 'The CUPTC tie. Coming soon.', 82, 'social', /\btie\b/i),
  soon(2, 'stickers', 'Sticker pack', 'CUPTC stickers. Coming soon.', 83, 'social', /sticker/i),
  soon(2, 'sports-bag', 'Sports bag', 'A CUPTC sports bag. Coming soon.', 84, 'social', /\bbag\b/i)
];
export const SHOP_VERSION = 2;
const versionOf = (shop) => (shop ? shop.v || (shop.seeded ? 1 : 0) : 0);

// Where an item goes when the committee hasn't chosen yet, guessed from its name.
function guessSections(m) {
  const n = String(m.name || '');
  if (/social|illustrat|\bhat\b|\bcap\b|bucket|tote/i.test(n)) return ['social'];
  if (/fleece|saxon|bundle|kit|shirt|short|skort|trouser|canterbury|jacket|hoodie|quarter.?zip/i.test(n)) return ['flagship'];
  return [];
}
function guessGroup(m, sections) {
  if (!sections.includes('flagship')) return '';
  const n = String(m.name || '');
  if (/fleece|saxon/i.test(n)) return 'Saxon fleeces';
  if (/bundle|shirt|short|skort/i.test(n)) return 'Full kit';
  return '';
}

// Fills in settings the committee hasn't set yet:
// - parts: an item whose pieces are sized separately, e.g. 'Shirt, Shorts' (a size is picked for each).
//   The kit bundles get theirs until the committee saves the item, after which its own setting is used.
// - sections and group (items with the same group in a section share one card that opens to show them).
// Pass the 'shop' document to also add the placeholders before the shop has been set up.
export function withDefaults(items, shop) {
  let out = items.map((m) => {
    let x = m;
    if (x.parts === undefined) {
      const d = DEFAULT_MERCH.find((y) => y.id === x.id);
      const parts = d && d.parts ? d.parts
        : /women'?s\s+bundle/i.test(x.name || '') ? 'Shirt, Skort'
        : /men'?s\s+bundle/i.test(x.name || '') ? 'Shirt, Shorts' : '';
      if (parts) x = { ...x, parts };
    }
    if (!Array.isArray(x.sections)) {
      const sections = guessSections(x);
      x = { ...x, sections, group: x.group !== undefined ? x.group : guessGroup(x, sections) };
    }
    return x;
  });
  if (shop !== undefined) {
    const v = versionOf(shop);
    if (v < 2) {
      // version 2: the Canterbury trousers have their own card rather than sitting in the Full kit
      out = out.map((m) => (m.id === 'canterbury-trousers' && m.group === 'Full kit' ? { ...m, group: '' } : m));
    }
    for (const p of PLACEHOLDERS) {
      if (p.v <= v) continue;
      if (!out.some((m) => m.id === p.item.id || p.match.test(m.name || ''))) out = out.concat({ ...p.item, sections: p.item.sections.slice() });
    }
  }
  return out;
}
export function sectionsOf(shop) {
  const secs = shop && Array.isArray(shop.sections) ? shop.sections : DEFAULT_SECTIONS;
  if (versionOf(shop) >= 2) return secs;
  // version 2 renamed the showcase (only if it still had its original name and description)
  return secs.map((x) => (x.id === 'flagship' && x.name === 'Flagship Stash'
    ? { ...x, name: DEFAULT_SECTIONS[0].name, blurb: x.blurb === 'The official CUPTC kit and Saxon fleeces.' ? DEFAULT_SECTIONS[0].blurb : x.blurb }
    : x.id === 'social' && x.blurb === 'Illustrated shirts and the hat, for social padel.' ? { ...x, blurb: DEFAULT_SECTIONS[1].blurb } : x));
}
export const shopIsCurrent = (shop) => versionOf(shop) >= SHOP_VERSION;
export const listOf = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
