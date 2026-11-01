// Tiny analytics client: sends events to /api/track (handled by server.py).
window.Track = (() => {
  const API = "/api/track";

  function storage(kind) {
    try {
      return window[kind];
    } catch {
      return null;
    }
  }
  const local = storage("localStorage");
  const session = storage("sessionStorage");

  function get(store, key) {
    try { return store && store.getItem(key); } catch { return null; }
  }
  function set(store, key, val) {
    try { store && store.setItem(key, val); } catch {}
  }

  // Anonymous random id per browser, used to count unique visitors.
  let vid = get(local, "vid");
  if (!vid) {
    vid = (crypto.randomUUID && crypto.randomUUID()) ||
      Math.random().toString(36).slice(2) + Date.now().toString(36);
    set(local, "vid", vid);
  }

  // Sends an event; resolves to the server's reply (aura earned) or null.
  // Pass { beacon: true } when the page is about to navigate away.
  function send(event, data = {}, { beacon = false } = {}) {
    const body = JSON.stringify({ event, vid, ...data });
    if (beacon) {
      try {
        if (navigator.sendBeacon && navigator.sendBeacon(API, body)) return Promise.resolve(null);
      } catch {}
    }
    return fetch(API, { method: "POST", body, keepalive: true })
      .then((r) => (r.status === 200 ? r.json() : null))
      .then((reply) => {
        if (reply && reply.aura) window.dispatchEvent(new CustomEvent("aura", { detail: reply }));
        return reply;
      })
      .catch(() => null);
  }

  // One visit per browser session; QR codes link with ?src=qr.
  function visit() {
    const params = new URLSearchParams(location.search);
    const src = params.get("src") === "qr" ? "qr" : "direct";
    if (params.has("src")) history.replaceState(null, "", location.pathname + location.hash);
    if (get(session, "counted")) return Promise.resolve(null);
    set(session, "counted", "1");
    return send("visit", { src });
  }

  return { vid, send, visit, get: (k) => get(local, k), set: (k, v) => set(local, k, v) };
})();
