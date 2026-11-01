// Home page wiring: profile, Snapchat button, game screen, sounds.
(() => {
  const cfg = window.SITE_CONFIG;
  const $ = (id) => document.getElementById(id);
  const snapUrl = `https://www.snapchat.com/add/${encodeURIComponent(cfg.snapUsername)}`;

  // Owner link (?owner=KEY, printed by server.py) marks this phone's scores as yours.
  const params = new URLSearchParams(location.search);
  if (params.has("owner")) {
    Track.set("ownerKey", params.get("owner"));
    params.delete("owner");
    const qs = params.toString();
    history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : "") + location.hash);
  }

  Track.visit();

  // ---- Profile ----
  $("name").textContent = cfg.name;
  typeRoles($("role"), cfg.roles && cfg.roles.length ? cfg.roles : [cfg.role || ""]);
  $("tagline").textContent = cfg.tagline;
  $("tagline").hidden = !cfg.tagline;
  $("footer").textContent = `© ${new Date().getFullYear()} ${cfg.name}`;
  if (cfg.avatar) {
    const img = new Image();
    img.src = cfg.avatar;
    img.alt = cfg.name;
    $("avatar").replaceChildren(img);
  } else {
    $("avatar").textContent = cfg.name.trim().charAt(0).toUpperCase();
  }
  for (const el of document.querySelectorAll(".snap-link")) {
    el.href = snapUrl;
    el.addEventListener("click", () => Track.send("snap_click", {}, { beacon: true }));
  }

  // Types each role out, holds it, deletes it, moves to the next.
  function typeRoles(el, roles) {
    if (roles.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = roles[0];
      return;
    }
    let i = 0, n = 0, deleting = false;
    (function tick() {
      const chars = Array.from(roles[i]);
      n += deleting ? -1 : 1;
      el.textContent = chars.slice(0, n).join("");
      let delay = deleting ? 28 : 55 + Math.random() * 55;
      if (!deleting && n === chars.length) { deleting = true; delay = 1800; }
      else if (deleting && n === 0) { deleting = false; i = (i + 1) % roles.length; delay = 350; }
      setTimeout(tick, delay);
    })();
  }

  // ---- Tap sparkles (anywhere except the game itself and text boxes) ----
  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest("#gameCanvas, .meme-feed, textarea, input")) return;
    FX.sparkle(e.clientX, e.clientY);
  });

  // ---- Gentle 3D tilt on cards (mouse only) ----
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
    for (const card of document.querySelectorAll(".game-card, .meme-card, .msg-card")) {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(900px) rotateX(${-y * 5}deg) rotateY(${x * 5}deg)`;
      });
      card.addEventListener("pointerleave", () => { card.style.transform = ""; });
    }
  }

  // ---- "Bored?" carousel: swipe (or tap a tab) between Stack Tower, Knife Hit and the memes ----
  const bored = $("bored"), track = $("boredTrack"), dotsBox = bored.querySelector(".bored-dots");
  const allTabs = [...bored.querySelectorAll(".bored-tab")];
  const slidesShown = () => [...track.children].filter((el) => !el.hidden);
  // A tab (and its dot) only shows while its card does (the meme card appears once memes load)
  const tabsShown = () => allTabs.filter((t) => !$(t.dataset.card).hidden);
  let boredAt = 0;

  function showBoredAt(i) {
    boredAt = i;
    tabsShown().forEach((t, k) => { t.classList.toggle("on", k === i); t.setAttribute("aria-selected", k === i); });
    [...dotsBox.children].forEach((d, k) => d.classList.toggle("on", k === i));
  }
  function layoutBored() {
    for (const t of allTabs) t.hidden = $(t.dataset.card).hidden;
    const n = slidesShown().length;
    dotsBox.replaceChildren(...Array.from({ length: n }, () => document.createElement("i")));
    bored.classList.toggle("multi", n > 1);
    showBoredAt(Math.min(boredAt, n - 1));
  }
  track.addEventListener("scroll", () => {
    const list = slidesShown();
    const step = list.length > 1 ? list[1].offsetLeft - list[0].offsetLeft : 1;
    const i = Math.min(list.length - 1, Math.round(track.scrollLeft / step));
    if (i !== boredAt) showBoredAt(i);
  }, { passive: true });
  allTabs.forEach((t) => t.addEventListener("click", () => {
    const el = $(t.dataset.card);
    if (!el.hidden) track.scrollTo({ left: el.offsetLeft - track.firstElementChild.offsetLeft, behavior: "smooth" });
  }));
  layoutBored();

  // memes.js announces when the meme card appears. First visit only: a small
  // slide-and-back nudge so people notice the cards swipe.
  let nudgeSet = false;
  window.addEventListener("bored:change", () => {
    layoutBored();
    if (nudgeSet || slidesShown().length < 2 || Track.get("boredNudge") || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    nudgeSet = true;
    new IntersectionObserver((entries, obs) => {
      if (!entries[0].isIntersecting) return;
      obs.disconnect();
      Track.set("boredNudge", "1");
      setTimeout(() => {
        if (track.scrollLeft > 0) return;
        track.style.scrollSnapType = "none";
        track.scrollTo({ left: 70, behavior: "smooth" });
        setTimeout(() => {
          track.scrollTo({ left: 0, behavior: "smooth" });
          setTimeout(() => { track.style.scrollSnapType = ""; }, 500);
        }, 550);
      }, 900);
    }, { threshold: 0.7 }).observe(track);
  });
  window.dispatchEvent(new Event("bored:change"));

  // ---- Sounds (Web Audio, no files needed) ----
  const Sfx = {
    ctx: null,
    muted: Track.get("muted") === "1",
    unlock() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!this.ctx && AC) this.ctx = new AC();
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    },
    tone(freq, dur, { type = "sine", vol = 0.18, to = 0, delay = 0 } = {}) {
      if (this.muted || !this.ctx) return;
      const t = this.ctx.currentTime + delay;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    place(combo, perfect) {
      if (perfect) {
        const f = 523 * Math.pow(2, Math.min(combo - 1, 12) / 12);
        this.tone(f, 0.25, { type: "triangle" });
        this.tone(f * 1.5, 0.3, { vol: 0.1, delay: 0.06 });
      } else {
        this.tone(210, 0.12, { type: "triangle", to: 120, vol: 0.25 });
      }
    },
    over() {
      this.tone(260, 0.6, { type: "sawtooth", to: 60, vol: 0.12 });
    },
    // Knife Hit
    throwKnife() {
      this.tone(900, 0.08, { type: "triangle", to: 500, vol: 0.06 });
    },
    knife(n) {
      this.tone(160 + Math.min(n, 10) * 12, 0.09, { type: "square", to: 90, vol: 0.1 });
      this.tone(1200, 0.05, { type: "triangle", vol: 0.05 });
    },
    apple() {
      this.tone(880, 0.15, { type: "triangle" });
      this.tone(1320, 0.2, { vol: 0.08, delay: 0.05 });
    },
    stageClear() {
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, { type: "triangle", vol: 0.12, delay: i * 0.07 }));
    },
  };

  // ---- Games: Stack Tower + Knife Hit share one game screen, game-over sheet and leaderboard modal ----
  const home = $("home"), screen = $("game"), sheet = $("overSheet");
  const GAMES = {
    stack: {
      name: "Stack Tower",
      engine: new StackTower($("gameCanvas"), { sound: Sfx, onGameOver: (score, perfects) => showOver(score, { perfects }) }),
      demo: new StackTower($("demoCanvas"), { demo: true, transparent: true, fit: [0.42, 0.55] }),
      bestKey: "stackBest",
      bestHome: $("bestHome"),
      share: (n) => `I stacked ${n} blocks in Stack Tower 🔥 Think you can beat me? 👉`,
      keepGoing: "Keep stacking!",
    },
    hit: {
      name: "Knife Hit",
      engine: new KnifeHit($("gameCanvas"), { sound: Sfx, onGameOver: (score, stage) => showOver(score, { stage }) }),
      demo: new KnifeHit($("hitDemo"), { demo: true, transparent: true }),
      bestKey: "hitBest",
      bestHome: $("hitBestHome"),
      share: (n) => `I hit ${n} in Knife Hit 🎯 Think you can beat me? 👉`,
      keepGoing: "Keep throwing!",
    },
  };
  for (const g of Object.values(GAMES)) g.best = Number(Track.get(g.bestKey)) || 0;
  let active = "stack"; // the game on the game screen
  let lastScore = 0;

  // ---- Best scores ("Your best", saved on this phone) ----
  const showBest = () => {
    for (const g of Object.values(GAMES)) g.bestHome.textContent = g.best;
    $("bestOver").textContent = GAMES[active].best;
  };
  showBest();

  // ---- Game screen ----
  const demosOn = (on) => { for (const g of Object.values(GAMES)) on ? g.demo.start() : g.demo.stop(); };
  demosOn(true);

  function openGame(key) {
    Sfx.unlock();
    const wasOpen = screen.classList.contains("active");
    GAMES[active].engine.stop();
    active = key;
    home.classList.remove("active");
    screen.classList.add("active");
    sheet.hidden = true;
    demosOn(false);
    showBest();
    GAMES[active].engine.start();
    Track.send("game_start", { game: active });
    if (!wasOpen) history.pushState({ game: 1 }, "");
  }

  function closeGame() {
    GAMES[active].engine.stop();
    sheet.hidden = true;
    $("shareModal").hidden = true;
    $("boardModal").hidden = true;
    screen.classList.remove("active");
    home.classList.add("active");
    demosOn(true);
  }

  function showOver(score, extra = {}) {
    if (!screen.classList.contains("active")) return;
    const g = GAMES[active];
    lastScore = score;
    const isBest = score > g.best;
    if (isBest) { g.best = score; Track.set(g.bestKey, score); }
    showBest();
    $("finalScore").textContent = score;
    $("newBest").hidden = !isBest;
    sheet.hidden = false;
    if (isBest) FX.confetti();
    const gain = $("auraGain");
    gain.hidden = true;
    Track.send("game_over", { game: active, score, perfects: extra.perfects || 0, stage: extra.stage || 0 }).then((r) => {
      if (!r || !r.aura) return;
      gain.textContent = r.aura > 0 ? `✨ +${r.aura.toLocaleString()} aura` : `💀 ${r.aura} aura`;
      gain.classList.toggle("neg", r.aura < 0);
      gain.hidden = false;
    });

    const name = Track.get("playerName");
    $("nameForm").hidden = !!name || score === 0;
    $("rankLine").hidden = true;
    if (name && score > 0) submitScore(score);
    else if (boards[active] && boards[active].you) showRank();
  }

  $("playBtn").addEventListener("click", () => openGame("stack"));
  $("hitPlayBtn").addEventListener("click", () => openGame("hit"));
  $("againBtn").addEventListener("click", () => {
    sheet.hidden = true;
    GAMES[active].engine.start();
    Track.send("game_start", { game: active });
  });
  $("backBtn").addEventListener("click", () => history.back());
  $("homeBtn").addEventListener("click", () => history.back());
  window.addEventListener("popstate", () => {
    if (screen.classList.contains("active")) closeGame();
  });

  $("gameCanvas").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    Sfx.unlock();
    GAMES[active].engine.place();
  });
  window.addEventListener("keydown", (e) => {
    if ((e.code === "Space" || e.code === "Enter") && screen.classList.contains("active") && sheet.hidden) {
      e.preventDefault();
      GAMES[active].engine.place();
    }
  });

  // ---- Leaderboards (one per game) ----
  const boards = {};        // game key -> board from the server
  let boardGame = "stack";  // which game's board the modal shows
  const modal = $("boardModal");

  async function api(path, body) {
    const res = await fetch(path, body ? { method: "POST", body: JSON.stringify(body) } : { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    return res.json();
  }

  async function loadBoard(key) {
    try {
      boards[key] = await api(`/api/leaderboard?game=${key}&vid=${encodeURIComponent(Track.vid)}`);
      if (key === boardGame) renderBoard();
    } catch {}
  }

  async function submitScore(score) {
    const key = active;
    try {
      boards[key] = await api("/api/score", {
        game: key, vid: Track.vid, name: Track.get("playerName"), score, ownerKey: Track.get("ownerKey") || "",
      });
      if (key === boardGame) renderBoard();
      showRank();
    } catch {}
  }

  function showRank() {
    const board = boards[active], you = board && board.you;
    if (!you) return;
    $("rankLine").textContent = `🏅 Rank #${you.rank} of ${board.players} · View leaderboard`;
    $("rankLine").hidden = false;
  }

  function renderBoard() {
    const board = boards[boardGame];
    $("boardTitle").textContent = `🏆 ${GAMES[boardGame].name}`;
    const list = $("boardList");
    list.replaceChildren();
    if (!board) return;
    if (!board.top.length) {
      const li = document.createElement("li");
      li.className = "board-empty";
      li.textContent = "No scores yet. Be the first!";
      list.append(li);
    }
    const medals = ["🥇", "🥈", "🥉"];
    board.top.forEach((e, i) => {
      const li = document.createElement("li");
      li.className = [e.you && "you", e.owner && "owner"].filter(Boolean).join(" ");
      const rank = document.createElement("span");
      rank.className = "rank";
      rank.textContent = medals[i] || i + 1;
      const name = document.createElement("span");
      name.className = "pname";
      name.textContent = e.name + (e.owner ? " 👑" : "");
      if (e.you) {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = "YOU";
        name.append(tag);
      }
      const sc = document.createElement("span");
      sc.className = "pscore";
      sc.textContent = e.score;
      li.append(rank, name, sc);
      list.append(li);
    });

    $("boardSub").textContent = board.players
      ? `${board.players} player${board.players === 1 ? "" : "s"} · best score each`
      : "";
    const you = board.you;
    $("boardYou").textContent = !you
      ? "Play a game and save your name to get on the board."
      : you.rank > 10 ? `You're #${you.rank} with ${you.score}. ${GAMES[boardGame].keepGoing}` : "";
  }

  function openBoard(key) {
    boardGame = key;
    $("boardSub").textContent = "";
    $("boardYou").textContent = "";
    renderBoard();
    modal.hidden = false;
    loadBoard(key);
  }
  const closeBoard = () => { modal.hidden = true; };

  $("boardBtn").addEventListener("click", () => openBoard("stack"));
  $("hitBoardBtn").addEventListener("click", () => openBoard("hit"));
  $("rankLine").addEventListener("click", () => openBoard(active));
  $("boardClose").addEventListener("click", closeBoard);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeBoard(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeBoard(); });
  $("boardPlay").addEventListener("click", () => {
    closeBoard();
    if (screen.classList.contains("active") && boardGame === active) $("againBtn").click();
    else openGame(boardGame);
  });

  $("nameInput").value = Track.get("playerName") || "";
  $("nameForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("nameInput").value.replace(/\s+/g, " ").trim().slice(0, 16);
    if (!name) {
      const f = $("nameForm");
      f.classList.remove("shake");
      void f.offsetWidth;
      f.classList.add("shake");
      return;
    }
    Track.set("playerName", name);
    $("nameInput").blur();
    $("nameForm").hidden = true;
    submitScore(lastScore);
  });

  // ---- Anonymous messages ----
  const msgText = $("msgText");
  const showCount = () => { $("msgCount").textContent = `${msgText.value.length}/300`; };
  for (const prompt of cfg.messagePrompts || []) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "msg-chip";
    chip.textContent = prompt;
    chip.addEventListener("click", () => {
      msgText.value = `${prompt} — `;
      showCount();
      msgText.focus();
    });
    $("msgChips").append(chip);
  }
  msgText.addEventListener("input", showCount);

  $("msgForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = msgText.value.trim();
    if (!text) {
      const f = $("msgForm");
      f.classList.remove("shake");
      void f.offsetWidth;
      f.classList.add("shake");
      return;
    }
    const btn = $("msgSend");
    btn.disabled = true;
    try {
      const res = await fetch("/api/message", { method: "POST", body: JSON.stringify({ text }) });
      if (res.status === 429) throw new Error("Slow down! Try again in a few minutes.");
      if (!res.ok) throw new Error("Couldn't send. Try again?");
      msgText.value = "";
      showCount();
      $("msgForm").hidden = true;
      $("msgDone").hidden = false;
      FX.confetti(70);
    } catch (err) {
      flash(err.message || "Couldn't send. Try again?");
    } finally {
      btn.disabled = false;
    }
  });
  $("msgAgain").addEventListener("click", () => {
    $("msgDone").hidden = true;
    $("msgForm").hidden = false;
    msgText.focus();
  });

  // ---- Mute ----
  const muteBtn = $("muteBtn");
  const showMute = () => muteBtn.classList.toggle("muted", Sfx.muted);
  showMute();
  muteBtn.addEventListener("click", () => {
    Sfx.muted = !Sfx.muted;
    Track.set("muted", Sfx.muted ? "1" : "0");
    showMute();
  });

  // ---- Share ----
  const toast = $("toast");
  function flash(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1800);
  }
  // Native share sheet needs https; over plain http (testing on Wi-Fi) we show our own sheet.
  const shareModal = $("shareModal");
  const shareText = () => GAMES[active].share(lastScore);
  const shareUrl = () => location.origin + location.pathname;

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.append(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand("copy"); } catch {}
    ta.remove();
    return ok;
  }

  $("shareBtn").addEventListener("click", async () => {
    Track.send("share", { game: active });
    if (navigator.share) {
      try {
        await navigator.share({ title: GAMES[active].name, text: shareText(), url: shareUrl() });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return; // user closed the sheet
      }
    }
    $("sharePreview").textContent = `${shareText()} ${shareUrl()}`;
    $("shareWa").href = `https://wa.me/?text=${encodeURIComponent(`${shareText()} ${shareUrl()}`)}`;
    shareModal.hidden = false;
  });
  $("shareCopy").addEventListener("click", async () => {
    const ok = await copyText(`${shareText()} ${shareUrl()}`);
    flash(ok ? "Copied! Paste it anywhere 📋" : "Couldn't copy. Long-press the text above");
  });
  $("shareClose").addEventListener("click", () => { shareModal.hidden = true; });
  shareModal.addEventListener("click", (e) => { if (e.target === shareModal) shareModal.hidden = true; });
})();
