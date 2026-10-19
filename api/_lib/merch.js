// Starting shop contents, used until the committee saves its first change.
export const DEFAULT_MERCH = [
  { id: 'shirt', name: 'Club shirt', price: 24, delivery: 'To be confirmed', sizes: 'XS, S, M, L, XL', image: 'kit-shirt', order: 10, description: 'The white CUPTC shirt with green collar and trim, lion crest and sponsor on the front.', customisable: true, customPrice: 2 },
  { id: 'womens-bundle', name: "Women's bundle", price: 37, delivery: 'To be confirmed', sizes: 'XS, S, M, L, XL', image: 'kit-skort', order: 30, description: "Women's shirt and skort.", parts: 'Shirt, Skort' },
  { id: 'mens-bundle', name: "Men's bundle", price: 34, delivery: 'To be confirmed', sizes: 'XS, S, M, L, XL', image: 'kit-shorts', order: 40, description: "Men's shirt and shorts.", parts: 'Shirt, Shorts' }
];

// parts: an item whose pieces are sized separately, e.g. 'Shirt, Shorts' (a size is picked for each).
// The kit bundles get theirs here until the committee saves the item, after which its own setting is used.
export function withDefaults(items) {
  return items.map((m) => {
    if (m.parts !== undefined) return m;
    const d = DEFAULT_MERCH.find((x) => x.id === m.id);
    const parts = d && d.parts ? d.parts
      : /women'?s\s+bundle/i.test(m.name || '') ? 'Shirt, Skort'
      : /men'?s\s+bundle/i.test(m.name || '') ? 'Shirt, Shorts' : '';
    return parts ? { ...m, parts } : m;
  });
}
export const listOf = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
