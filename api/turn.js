// GET /api/turn: the relay servers Padel Pong's 1v1 uses when two phones can't link directly
// (eduroam and some mobile networks block direct links). { iceServers } or { iceServers: null }.
// Uses Cloudflare's TURN service when CF_TURN_KEY_ID and CF_TURN_API_TOKEN are set in Vercel
// (Cloudflare dashboard > Realtime > TURN Server > Create; free for the first 1,000 GB a month).
// Without them the game falls back to PeerJS's free relay, which is often unreliable.
import { env, send } from './_lib/core.js';

const TTL = 6 * 3600; // seconds the credentials last
let cache = null;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const id = env('CF_TURN_KEY_ID'), token = env('CF_TURN_API_TOKEN');
  if (!id || !token) return send(res, 200, { iceServers: null });
  // reuse credentials until they're half used up
  if (cache && Date.now() < cache.until) return send(res, 200, { iceServers: cache.servers });
  try {
    const r = await fetch('https://rtc.live.cloudflare.com/v1/turn/keys/' + encodeURIComponent(id) + '/credentials/generate-ice-servers', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TTL }),
      signal: AbortSignal.timeout(4000)
    });
    if (!r.ok) throw new Error('cloudflare ' + r.status);
    const d = await r.json();
    const servers = [].concat(d.iceServers || []).filter((s) => s && s.urls);
    if (!servers.length) throw new Error('no servers');
    cache = { servers, until: Date.now() + TTL * 500 };
    return send(res, 200, { iceServers: servers });
  } catch (e) {
    console.error('turn', e);
    return send(res, 200, { iceServers: null });
  }
}
