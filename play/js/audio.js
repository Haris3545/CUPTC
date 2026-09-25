/* Padel Pong — tiny chiptune sound effects made with WebAudio (no audio files). */
(function () {
  'use strict';
  var PP = (window.PP = window.PP || {});

  var STORE_KEY = 'cuptc-padel-muted';
  var ctx = null;
  var master = null;
  var noiseBuf = null;
  var muted = false;
  try { muted = localStorage.getItem(STORE_KEY) === '1'; } catch (e) { /* storage unavailable */ }

  function unlock() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function ready() { return ctx && ctx.state === 'running' && !muted; }

  function tone(type, f0, f1, dur, vol, when) {
    var t = ctx.currentTime + (when || 0);
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, freq, type, when) {
    var t = ctx.currentTime + (when || 0);
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var filt = ctx.createBiquadFilter();
    filt.type = type || 'bandpass';
    filt.frequency.value = freq || 2000;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  function arp(notes, step, type, vol) {
    for (var i = 0; i < notes.length; i++) tone(type || 'square', notes[i], notes[i], step * 1.6, vol || 0.09, i * step);
  }

  var sfx = {
    // Rising pitch as the rally gets longer.
    hit: function (rally) {
      if (!ready()) return;
      var f = 520 * Math.pow(2, Math.min(rally, 36) / 36);
      tone('square', f, f * 0.5, 0.09, 0.16);
      tone('triangle', f * 2, f, 0.05, 0.08);
      noise(0.04, 0.12, 3200);
    },
    smash: function () {
      if (!ready()) return;
      noise(0.18, 0.28, 900, 'lowpass');
      tone('square', 260, 60, 0.22, 0.16);
      tone('square', 1040, 520, 0.08, 0.08);
    },
    oppHit: function () {
      if (!ready()) return;
      tone('square', 330, 190, 0.08, 0.1);
      noise(0.035, 0.08, 2400);
    },
    bounce: function (near) {
      if (!ready()) return;
      tone('triangle', near ? 190 : 150, 80, 0.07, near ? 0.16 : 0.09);
    },
    glass: function () {
      if (!ready()) return;
      tone('sine', 2093, 2093, 0.14, 0.09);
      tone('sine', 3136, 3136, 0.1, 0.05, 0.012);
      noise(0.05, 0.05, 7000, 'highpass');
    },
    speedUp: function () {
      if (!ready()) return;
      arp([523, 659, 784, 1047], 0.055, 'square', 0.08);
    },
    milestone: function () {
      if (!ready()) return;
      arp([523, 659, 784, 1047, 784, 1047, 1319], 0.07, 'square', 0.09);
      noise(0.9, 0.06, 1200, 'bandpass', 0.1);
    },
    miss: function () {
      if (!ready()) return;
      tone('square', 440, 110, 0.45, 0.13);
      tone('square', 330, 70, 0.55, 0.1, 0.14);
    },
    count: function () {
      if (!ready()) return;
      tone('square', 660, 660, 0.1, 0.1);
    },
    go: function () {
      if (!ready()) return;
      tone('square', 1320, 1320, 0.22, 0.1);
      tone('square', 990, 990, 0.22, 0.06);
    },
    click: function () {
      if (!ready()) return;
      tone('square', 880, 880, 0.045, 0.07);
    }
  };

  PP.Audio = {
    unlock: unlock,
    sfx: sfx,
    isMuted: function () { return muted; },
    setMuted: function (m) {
      muted = !!m;
      try { localStorage.setItem(STORE_KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ }
      if (master) master.gain.value = muted ? 0 : 0.55;
    }
  };
})();
