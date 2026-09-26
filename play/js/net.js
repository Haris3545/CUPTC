/* Padel Pong — linking two phones for a 1v1 match.
   The phones talk directly to each other (WebRTC, through PeerJS). PeerJS's free public server only
   introduces them, using a short game code, and its relay steps in on networks that block direct links.
   The PeerJS library is loaded only when someone starts or joins a match.
   Add ?local to the page address to link two tabs in one browser instead (for testing). */
(function () {
  'use strict';
  const PP = window.PP;
  const PREFIX = 'cuptc-padelpong-';
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I
  const LOCAL = /[?&]local\b/.test(location.search);
  const JOIN_TIMEOUT = 20000;
  const peerOpts = () => Object.assign({ debug: 0 }, window.PP_PEER_OPTS); // tests point this at a local PeerJS server

  const newCode = () => Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

  let loading = null;
  function loadPeer() {
    if (window.Peer) return Promise.resolve();
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'js/vendor/peerjs.min.js';
        s.onload = resolve;
        s.onerror = () => { loading = null; reject(new Error('load')); };
        document.head.appendChild(s);
      });
    }
    return loading;
  }

  // What the game gets once the phones are linked: send(msg), close(), and onmessage / onclose to set.
  function makeLink(sendFn, closeFn) {
    const link = {
      open: true, onmessage: null, onclose: null,
      send(m) { if (link.open) { try { sendFn(m); } catch (e) { /* closing */ } } },
      close() { if (!link.open) return; link.open = false; try { closeFn(); } catch (e) { /* already gone */ } },
      _recv(m) { if (link.open && link.onmessage) link.onmessage(m); },
      _closed() { if (!link.open) return; link.open = false; if (link.onclose) link.onclose(); }
    };
    return link;
  }

  function fromConn(conn, peer) {
    const link = makeLink((m) => conn.send(m), () => { conn.close(); peer.destroy(); });
    conn.on('data', (m) => link._recv(m));
    conn.on('close', () => link._closed());
    conn.on('error', () => link._closed());
    // Once linked, drop off the public server so the code can't be used again.
    peer.disconnect();
    return link;
  }

  // ---- host: get a code, wait for a friend to open the link
  // cb.code(code) when the link is ready to send, cb.open(link) when the friend arrives, cb.error(kind).
  function host(cb) {
    let stopped = false, peer = null, bc = null;
    const handle = { cancel() { stopped = true; if (peer) peer.destroy(); if (bc) bc.close(); } };

    if (LOCAL) {
      const c = newCode();
      bc = new BroadcastChannel('pp-' + c);
      bc.onmessage = (e) => {
        if (stopped || !e.data || e.data.sys !== 'join') return;
        stopped = true;
        bc.postMessage({ sys: 'ok' });
        cb.open(fromChannel(bc));
      };
      setTimeout(() => cb.code(c), 0);
      return handle;
    }

    loadPeer().then(() => {
      const attempt = (tries) => {
        if (stopped) return;
        const c = newCode();
        peer = new window.Peer(PREFIX + c, peerOpts());
        peer.on('open', () => { if (!stopped) cb.code(c); });
        peer.on('connection', (conn) => {
          if (stopped) { conn.close(); return; }
          conn.on('open', () => {
            if (stopped) { conn.close(); return; }
            stopped = true;
            cb.open(fromConn(conn, peer));
          });
        });
        peer.on('error', (e) => {
          if (stopped) return;
          if (e.type === 'unavailable-id' && tries < 4) { peer.destroy(); attempt(tries + 1); return; }
          stopped = true;
          peer.destroy();
          cb.error(e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' ? 'offline' : 'failed');
        });
      };
      attempt(0);
    }).catch(() => { if (!stopped) cb.error('offline'); });
    return handle;
  }

  // ---- guest: open a friend's link
  function join(code, cb) {
    let stopped = false, peer = null, bc = null, timer = 0;
    const fail = (kind) => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      if (peer) peer.destroy();
      if (bc) bc.close();
      cb.error(kind);
    };
    const handle = { cancel() { stopped = true; clearTimeout(timer); if (peer) peer.destroy(); if (bc) bc.close(); } };
    timer = setTimeout(() => fail('timeout'), JOIN_TIMEOUT);

    if (LOCAL) {
      bc = new BroadcastChannel('pp-' + code);
      bc.onmessage = (e) => {
        if (stopped || !e.data || e.data.sys !== 'ok') return;
        stopped = true;
        clearTimeout(timer);
        cb.open(fromChannel(bc));
      };
      bc.postMessage({ sys: 'join' });
      return handle;
    }

    loadPeer().then(() => {
      if (stopped) return;
      peer = new window.Peer(peerOpts());
      peer.on('open', () => {
        if (stopped) return;
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        conn.on('open', () => {
          if (stopped) { conn.close(); return; }
          stopped = true;
          clearTimeout(timer);
          cb.open(fromConn(conn, peer));
        });
      });
      peer.on('error', (e) => fail(e.type === 'peer-unavailable' ? 'notfound'
        : e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' ? 'offline' : 'failed'));
    }).catch(() => fail('offline'));
    return handle;
  }

  function fromChannel(bc) {
    const link = makeLink((m) => bc.postMessage({ sys: 'msg', d: m }), () => { bc.postMessage({ sys: 'bye' }); bc.close(); });
    bc.onmessage = (e) => {
      if (!e.data) return;
      if (e.data.sys === 'msg') link._recv(e.data.d);
      else if (e.data.sys === 'bye') link._closed();
    };
    return link;
  }

  PP.Net = { host: host, join: join };
})();
