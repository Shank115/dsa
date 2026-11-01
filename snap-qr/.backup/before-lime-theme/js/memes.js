// Meme scroll: a full-screen swipe feed, freshly shuffled on every open with unseen memes first.
// Lives inside the home page (not a new page) so the background music keeps playing.
(() => {
  const cfg = window.SITE_CONFIG;
  const $ = (id) => document.getElementById(id);
  const SNAP_EVERY = 15; // an "add me on Snap" card after this many memes
  const AHEAD = 5;       // images preloaded ahead of the current one
  const BEHIND = 2;
  const KEEP = 15;       // images further away than this are released to save memory
  const snapUrl = `https://www.snapchat.com/add/${encodeURIComponent(cfg.snapUsername)}`;

  const home = $("home"), screen = $("memes"), feed = $("memeFeed"), card = $("memeCard");
  let memes = [];
  let slides = [];   // { kind: "meme" | "snap", m?, el, img? }
  let current = 0;
  let shown = 0;     // memes added to the feed so far (for spacing the Snap cards)
  let viewed = 0;    // memes viewed since the feed was opened (sent as one event on close)
  let observer = null;

  const readSet = (key) => {
    try { return new Set(JSON.parse(Track.get(key) || "[]")); } catch { return new Set(); }
  };
  const seen = readSet("memesSeen");
  const liked = readSet("memesLiked");
  const saveSet = (key, set, max) => Track.set(key, JSON.stringify([...set].slice(-max)));
  const src = (m) => `memes/${m.id}.webp`;

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  // ---- Home card: a fan of 3 memes that keeps changing ----
  function startPreview() {
    const imgs = [...$("memeFan").querySelectorAll("img")];
    const pick = () => shuffle(memes.slice()).slice(0, imgs.length);
    const show = () => pick().forEach((m, i) => {
      const img = imgs[i];
      img.classList.remove("in");
      img.onload = () => img.classList.add("in");
      img.src = src(m);
    });
    show();
    if (memes.length > imgs.length) {
      setInterval(() => { if (home.classList.contains("active") && !document.hidden) show(); }, 4000);
    }
  }

  // ---- Feed ----
  const ICONS = {
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2.4 4.5 6.2 4.5c2.2 0 3.6 1.2 4.3 2.4h3c.7-1.2 2.1-2.4 4.3-2.4 3.8 0 5.8 3.9 4.2 7.2C19.5 16.4 12 21 12 21z" fill="currentColor"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
    ghost: (() => {
      const g = document.querySelector(".snap-link .ghost").cloneNode(true);
      g.setAttribute("class", "ghost"); // drop the home button's icon padding
      return g.outerHTML;
    })(),
  };

  // The feed never ends: near the bottom another shuffled round is added.
  // The first round puts memes this phone hasn't seen yet first.
  function build() {
    slides = [];
    shown = 0;
    feed.replaceChildren();
    feed.scrollTop = 0;
    current = -1;
    if (observer) observer.disconnect();
    observer = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setCurrent(Number(e.target.dataset.i));
    }, { root: feed, threshold: 0.6 });
    addRound(true);
    setCurrent(0);
  }

  function addRound(first) {
    const order = first
      ? [...shuffle(memes.filter((m) => !seen.has(m.id))), ...shuffle(memes.filter((m) => seen.has(m.id)))]
      : shuffle(memes.slice());
    const last = slides.findLast((t) => t.kind === "meme");
    if (last && order.length > 1 && order[0].id === last.m.id) [order[0], order[1]] = [order[1], order[0]];
    const added = [];
    for (const m of order) {
      added.push({ kind: "meme", m });
      if (++shown % SNAP_EVERY === 0) added.push({ kind: "snap" });
    }
    const els = added.map((t) => {
      slides.push(t);
      return makeSlide(t, slides.length - 1);
    });
    feed.append(...els);
    for (const el of els) observer.observe(el);
  }

  function makeSlide(s, i) {
    const el = document.createElement("div");
    el.className = `meme-slide ${s.kind}`;
    el.dataset.i = i;
    s.el = el;
    if (s.kind === "meme") {
      el.innerHTML = `
        <figure class="meme-frame" style="--ar:${s.m.w / s.m.h}">
          <img alt="Meme" draggable="false" decoding="async">
        </figure>
        <div class="meme-actions">
          <button class="meme-act like${liked.has(s.m.id) ? " on" : ""}" type="button" aria-pressed="${liked.has(s.m.id)}">${ICONS.heart}<span>Like</span></button>
          <button class="meme-act share" type="button">${ICONS.share}<span>Share</span></button>
          <a class="meme-act snap snap-link" href="${snapUrl}">${ICONS.ghost}<span>Add me</span></a>
        </div>`;
      s.img = el.querySelector("img");
      s.img.addEventListener("load", () => s.img.classList.add("in"));
      const frame = el.querySelector(".meme-frame");
      let lastTap = 0;
      frame.addEventListener("pointerup", (e) => {
        const now = e.timeStamp;
        if (now - lastTap < 320) {
          lastTap = 0;
          burst(frame, e);
          if (!liked.has(s.m.id)) toggleLike(s);
        } else {
          lastTap = now;
        }
      });
      el.querySelector(".like").addEventListener("click", () => toggleLike(s));
      el.querySelector(".share").addEventListener("click", () => shareMeme(s));
    } else if (s.kind === "snap") {
      el.innerHTML = `
        <div class="meme-promo">
          <div class="promo-emoji" aria-hidden="true">😂</div>
          <h2>Enjoying the memes?</h2>
          <p>Let's be friends on Snap 👻</p>
          <a class="btn btn-snap snap-link" href="${snapUrl}">${ICONS.ghost}<span>Add me on Snapchat</span></a>
          <p class="promo-hint">or keep scrolling ↓</p>
        </div>`;
    }
    for (const a of el.querySelectorAll(".snap-link")) {
      a.addEventListener("click", () => Track.send("snap_click", { from: "memes" }, { beacon: true }));
    }
    return el;
  }

  function setCurrent(i) {
    if (i === current || !slides[i]) return;
    current = i;
    const s = slides[i];
    if (i >= slides.length - 4) addRound(false);
    if (s.kind === "meme") {
      if (!s.counted) {
        s.counted = true;
        viewed++;
        seen.delete(s.m.id); // re-add so it moves to the end (most recent)
        seen.add(s.m.id);
        saveSet("memesSeen", seen, 5000);
      }
    }
    if (i > 0) $("memeHint").hidden = true;
    slides.forEach((t, k) => {
      if (!t.img) return;
      if (k >= i - BEHIND && k <= i + AHEAD) {
        if (!t.img.getAttribute("src")) t.img.src = src(t.m);
      } else if (Math.abs(k - i) > KEEP && t.img.getAttribute("src")) {
        t.img.removeAttribute("src");
        t.img.classList.remove("in");
      }
    });
  }

  function toggleLike(s) {
    const on = !liked.has(s.m.id);
    on ? liked.add(s.m.id) : liked.delete(s.m.id);
    saveSet("memesLiked", liked, 5000);
    const btn = s.el.querySelector(".like");
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on);
    if (on) {
      btn.classList.remove("pop");
      void btn.offsetWidth;
      btn.classList.add("pop");
    }
    Track.send(on ? "meme_like" : "meme_unlike", { id: s.m.id });
  }

  function burst(frame, e) {
    const r = frame.getBoundingClientRect();
    const h = document.createElement("span");
    h.className = "meme-burst";
    h.innerHTML = ICONS.heart;
    h.style.left = `${e.clientX - r.left}px`;
    h.style.top = `${e.clientY - r.top}px`;
    frame.append(h);
    setTimeout(() => h.remove(), 900);
  }

  // ---- Share: the meme itself as an image when the phone allows it, else the link ----
  const toast = $("toast");
  function flash(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1800);
  }
  function asJpeg(img) {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    return new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.9));
  }
  async function shareMeme(s) {
    const url = location.origin + location.pathname;
    const text = `😂 1000s of memes on ${cfg.name}'s page 👉 ${url}`;
    Track.send("meme_share", { id: s.m.id });
    try {
      if (navigator.share) {
        // WhatsApp treats .webp as a sticker, so share a JPEG copy.
        const blob = s.img.complete && s.img.naturalWidth ? await asJpeg(s.img) : null;
        const file = blob && new File([blob], "meme.jpg", { type: "image/jpeg" });
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text });
        } else {
          await navigator.share({ title: "Memes", text });
        }
        return;
      }
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
      flash("Link copied! Send it to the group chat 📋");
    } catch {
      flash("Share needs https. Works once the site is live");
    }
  }

  // ---- Open / close ----
  function open() {
    home.classList.remove("active");
    screen.classList.add("active");
    viewed = 0;
    build();
    $("memeHint").hidden = !!Track.get("memeHint");
    Track.set("memeHint", "1");
    Track.send("meme_open");
    history.pushState({ memes: 1 }, "");
  }
  function sendSession(beacon = false) {
    if (viewed) Track.send("meme_session", { count: viewed }, { beacon });
    viewed = 0;
  }
  function close() {
    sendSession();
    screen.classList.remove("active");
    home.classList.add("active");
    if (observer) observer.disconnect();
    feed.replaceChildren();
    slides = [];
  }

  $("memeBtn").addEventListener("click", open);
  $("memeBack").addEventListener("click", () => history.back());
  window.addEventListener("popstate", () => {
    if (screen.classList.contains("active")) close();
  });
  window.addEventListener("pagehide", () => {
    if (screen.classList.contains("active")) sendSession(true);
  });
  window.addEventListener("keydown", (e) => {
    if (!screen.classList.contains("active")) return;
    const dir = { ArrowDown: 1, ArrowUp: -1, j: 1, k: -1 }[e.key];
    if (dir) {
      e.preventDefault();
      feed.scrollBy({ top: dir * feed.clientHeight, behavior: "smooth" });
    } else if (e.key === "Escape") {
      history.back();
    }
  });

  fetch("memes/memes.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      memes = (data && data.items) || [];
      if (!memes.length) return;
      card.hidden = false;
      window.dispatchEvent(new Event("bored:change"));
      startPreview();
    })
    .catch(() => {});
})();
