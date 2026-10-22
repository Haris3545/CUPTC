// Stand-in for @vercel/blob in the Cloudflare build: storage there uses the STORE binding instead,
// so these are never called.
const off = () => { throw new Error('Vercel Blob is not available on Cloudflare'); };
export const list = off, put = off, del = off, head = off;
