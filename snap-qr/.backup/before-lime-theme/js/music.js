// Background music: a soft, romantic piano + tanpura loop with strings, made with Web Audio (no audio files).
// Kept calm and steady on purpose: it sits behind the page, it shouldn't steal attention.
// Phones only allow sound after a tap, so it starts on the visitor's first tap anywhere.
window.Music = (() => {
  const VOLUME = 0.32; // master level (soft)
  const BPM = 72;
  const BEAT = 60 / BPM;
  const BAR = BEAT * 4;

  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // G – D/F# – Em7 – Cmaj7, one chord per bar (MIDI): bass, alternate bass, upper strings.
  // `last` swaps the upper notes for the second half of the bar (Dsus4 -> D).
  const CHORDS = [
    { bass: 43, alt: 50, up: [55, 57, 59] }, // Gadd9
    { bass: 42, alt: 45, up: [57, 62, 66] }, // D/F#
    { bass: 40, alt: 47, up: [55, 59, 62] }, // Em7
    { bass: 48, alt: 43, up: [55, 59, 64] }, // Cmaj7
    { bass: 43, alt: 50, up: [55, 57, 59] }, // Gadd9
    { bass: 42, alt: 45, up: [57, 62, 66] }, // D/F#
    { bass: 48, alt: 43, up: [55, 59, 64] }, // Cmaj7
    { bass: 38, alt: 45, up: [57, 62, 67], last: [57, 62, 66] }, // Dsus4 -> D
  ];

  // Left-hand rolling chord per eighth note: "b" bass, "a" alternate bass, 0-2 upper notes.
  const ROLL = ["b", 0, 1, 2, "a", 2, 1, 0];

  // Builds the instruments on a context; scheduleBar(i, t) plays bar i at time t.
  // opts.only = ["piano", ...] plays just those parts (used for testing the mix).
  function createSong(ctx, out, opts = {}) {
    const on = (part) => !opts.only || opts.only.includes(part);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 2.5;
    const warm = ctx.createBiquadFilter();
    warm.type = "lowpass";
    warm.frequency.value = 3500;
    warm.connect(comp).connect(out);

    // Reverb from a generated impulse response.
    const verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    }
    verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    verb.connect(wet).connect(warm);

    function bus(pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      p.connect(warm);
      return p;
    }
    const leftBus = bus(-0.12);

    function send(node, dest, amount) {
      const s = ctx.createGain();
      s.gain.value = amount;
      node.connect(s).connect(dest);
    }
    function osc(type, freq, t, dur, dest) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.connect(dest);
      o.start(t);
      o.stop(t + dur + 0.05);
    }

    // Felt piano: a few pure partials, the higher ones fading first, softened by a filter.
    const PARTIALS = [[1, 1], [2, 0.3], [3, 0.1], [4, 0.04]];
    function piano(m, t, vol, dest) {
      const f0 = hz(m);
      const ring = 3.2 - (m - 48) * 0.03; // low notes ring longer
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = Math.min(2200, f0 * 5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(vol * 0.4, t + 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ring);
      lp.connect(g).connect(dest);
      send(g, verb, 0.55);
      PARTIALS.forEach(([k, amp], i) => {
        const pg = ctx.createGain();
        pg.gain.setValueAtTime(amp, t);
        pg.gain.exponentialRampToValueAtTime(amp * 0.02, t + ring / (i + 1));
        pg.connect(lp);
        osc("sine", f0 * k * (1 + 0.0004 * k * k), t, ring, pg); // tiny stretch like real strings
      });
    }

    // Soft string pad: detuned triangles with a slow swell and a gentle vibrato.
    function strings(notes, t, dur) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 1000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.022, t + 1.6);
      g.gain.setValueAtTime(0.022, t + dur - 0.3);
      g.gain.linearRampToValueAtTime(0, t + dur + 1.2);
      f.connect(g).connect(warm);
      send(g, verb, 0.7);
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 4.5;
      depth.gain.value = 4; // cents
      lfo.connect(depth);
      lfo.start(t);
      lfo.stop(t + dur + 1.3);
      for (const m of notes) {
        for (const d of [-6, 6]) {
          const o = ctx.createOscillator();
          o.type = "triangle";
          o.frequency.value = hz(m + 12);
          o.detune.value = d;
          depth.connect(o.detune);
          o.connect(f);
          o.start(t);
          o.stop(t + dur + 1.3);
        }
      }
    }
    // Tanpura: a soft drone plucking Pa, Sa, Sa, low Sa once per beat, each string ringing long.
    const TANPURA = [50, 55, 55, 43];
    function tanpura(m, t) {
      const f0 = hz(m);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1300;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.03, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + BEAT * 4);
      lp.connect(g).connect(warm);
      send(g, verb, 0.5);
      // The tanpura's shimmer: higher harmonics that bloom slightly after the pluck.
      [[1, 1], [2, 0.5], [3, 0.35], [4, 0.25], [5, 0.15], [6, 0.1]].forEach(([k, amp]) => {
        const hg = ctx.createGain();
        hg.gain.setValueAtTime(amp * 0.4, t);
        hg.gain.linearRampToValueAtTime(amp, t + 0.5 + k * 0.08);
        hg.connect(lp);
        osc("sine", f0 * k, t, BEAT * 4, hg);
      });
    }
    // Round, quiet bass on the root.
    function bass(m, t, dur) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.02, t + dur * 0.8);
      g.gain.linearRampToValueAtTime(0, t + dur);
      g.connect(warm);
      osc("sine", hz(m + 12), t, dur, g);
    }

    // The same calm feel every bar, start to end: no lead melody, nothing that grabs attention.
    function scheduleBar(i, t) {
      const b = i % 8;
      const chord = CHORDS[b];

      if (on("piano")) {
        ROLL.forEach((s, k) => {
          const up = k >= 4 && chord.last ? chord.last : chord.up;
          const m = s === "b" ? chord.bass : s === "a" ? chord.alt : up[s];
          const human = Math.random() * 0.015;
          const vol = s === "b" ? 0.09 : s === "a" ? 0.07 : 0.05;
          piano(m, t + k * BEAT * 0.5 + human, vol, leftBus);
        });
      }
      if (on("strings")) strings(chord.up, t, BAR);
      if (on("bass")) bass(chord.bass, t, BAR * 0.95);
      if (on("tanpura")) TANPURA.forEach((m, k) => tanpura(m, t + k * BEAT));
    }
    return { scheduleBar };
  }

  // ---- Live playback ----
  let ctx = null;
  let master = null;
  let song = null;
  let bar = 0;
  let nextAt = 0;
  let enabled = true;
  const listeners = new Set();

  function tick() {
    if (!ctx || ctx.state !== "running") return;
    if (nextAt < ctx.currentTime) nextAt = ctx.currentTime + 0.1;
    while (nextAt < ctx.currentTime + 0.6) {
      song.scheduleBar(bar++, nextAt);
      nextAt += BAR;
    }
  }
  function fadeTo(v, secs) {
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(v, t + secs);
  }
  function emit() {
    for (const fn of listeners) fn(playing());
  }
  function playing() {
    return !!ctx && enabled && ctx.state === "running";
  }

  // iPhones mute web page audio with the ring/silent switch unless the page counts as media
  // (like Spotify). Then only the volume buttons control it. Newer Safari has a switch for this;
  // older iPhones need a silent looping <audio> playing alongside. Android isn't affected.
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let keepAlive = null;
  function mediaMode(on) {
    if (navigator.audioSession) {
      try { navigator.audioSession.type = on ? "playback" : "auto"; } catch {}
      return;
    }
    if (!isIOS) return;
    if (!keepAlive) {
      keepAlive = new Audio(URL.createObjectURL(silence()));
      keepAlive.loop = true;
      keepAlive.setAttribute("playsinline", "");
    }
    if (on) keepAlive.play().catch(() => {});
    else keepAlive.pause();
  }
  // One second of silence as a tiny WAV file (8 kHz, 8-bit mono).
  function silence() {
    const n = 8000;
    const v = new DataView(new ArrayBuffer(44 + n));
    const text = (at, str) => [...str].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
    text(0, "RIFF");
    v.setUint32(4, 36 + n, true);
    text(8, "WAVEfmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true);
    v.setUint32(28, 8000, true);
    v.setUint16(32, 1, true);
    v.setUint16(34, 8, true);
    text(36, "data");
    v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    return new Blob([v], { type: "audio/wav" });
  }

  // Called on user taps: creates/resumes the audio (browsers need a gesture for this).
  function start() {
    if (!enabled || document.hidden) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    mediaMode(true);
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      song = createSong(ctx, master);
      ctx.onstatechange = emit;
      setInterval(tick, 150);
    }
    const go = () => {
      tick();
      fadeTo(VOLUME, 2.5);
      emit();
    };
    if (ctx.state === "running") go();
    else ctx.resume().then(go, () => {});
  }
  function stop() {
    if (!ctx || ctx.state !== "running") return emit();
    fadeTo(0, 0.4);
    setTimeout(() => {
      if (!enabled || document.hidden) {
        ctx.suspend();
        mediaMode(false); // back to normal: the silent switch mutes the page again
      }
    }, 450);
  }
  function setEnabled(on) {
    enabled = on;
    Track.set("music", on ? "1" : "0");
    on ? start() : stop();
    emit();
  }

  function init() {
    enabled = Track.get("music") !== "0";
    const btn = document.getElementById("musicBtn");
    const show = () => btn && btn.classList.toggle("on", playing());
    listeners.add(show);
    show();

    // The first tap anywhere starts the music (not on the toggle itself, which handles its own tap).
    // Finger-up events, not finger-down: iPhones only count the tap once the finger lifts, and an
    // audio player created before that can stay stuck silent.
    const onTap = (e) => {
      if (btn && btn.contains(e.target)) return;
      if (playing()) {
        if (keepAlive && keepAlive.paused) keepAlive.play().catch(() => {}); // iOS may block it after a tab switch
        return;
      }
      start();
    };
    for (const ev of ["pointerup", "touchend", "click", "keydown"]) {
      document.addEventListener(ev, onTap, { capture: true, passive: true });
    }
    if (btn) btn.addEventListener("click", () => setEnabled(!playing()));

    // Pause when the tab is hidden (switched app, locked phone); continue when back.
    document.addEventListener("visibilitychange", () => {
      if (!ctx) return;
      if (document.hidden) {
        ctx.suspend();
        if (keepAlive) keepAlive.pause();
      } else if (enabled) {
        mediaMode(true);
        ctx.resume().then(() => { tick(); fadeTo(VOLUME, 1.2); }, () => {});
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { createSong, BAR, VOLUME, setEnabled, playing };
})();
