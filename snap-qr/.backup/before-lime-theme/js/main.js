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

  // ---- "Bored?" carousel: swipe (or tap a tab) between the game and the memes ----
  const bored = $("bored"), track = $("boredTrack");
  const tabs = [...bored.querySelectorAll(".bored-tab")];
  const dots = [...bored.querySelectorAll(".bored-dots i")];
  const slidesShown = () => [...track.children].filter((el) => !el.hidden);
  let boredAt = 0;

  function showBoredAt(i) {
    boredAt = i;
    tabs.forEach((t, k) => { t.classList.toggle("on", k === i); t.setAttribute("aria-selected", k === i); });
    dots.forEach((d, k) => d.classList.toggle("on", k === i));
  }
  track.addEventListener("scroll", () => {
    const list = slidesShown();
    const step = list.length > 1 ? list[1].offsetLeft - list[0].offsetLeft : 1;
    const i = Math.min(list.length - 1, Math.round(track.scrollLeft / step));
    if (i !== boredAt) showBoredAt(i);
  }, { passive: true });
  tabs.forEach((t, k) => t.addEventListener("click", () => {
    const el = slidesShown()[k];
    if (el) track.scrollTo({ left: el.offsetLeft - track.firstElementChild.offsetLeft, behavior: "smooth" });
  }));

  // memes.js announces when the meme card appears; then tabs + dots show up.
  // First visit only: a small slide-and-back nudge so people notice it swipes.
  window.addEventListener("bored:change", () => {
    const multi = slidesShown().length > 1;
    bored.classList.toggle("multi", multi);
    if (!multi || Track.get("boredNudge") || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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
  };

  // ---- Best score ----
  let best = Number(Track.get("stackBest")) || 0;
  const showBest = () => { $("bestHome").textContent = best; $("bestOver").textContent = best; };
  showBest();

  // ---- Game ----
  const demo = new StackTower($("demoCanvas"), { demo: true, transparent: true, fit: [0.42, 0.55] });
  demo.start();

  const game = new StackTower($("gameCanvas"), { sound: Sfx, onGameOver: showOver });
  const home = $("home"), screen = $("game"), sheet = $("overSheet");
  let lastScore = 0;

  function openGame() {
    Sfx.unlock();
    home.classList.remove("active");
    screen.classList.add("active");
    sheet.hidden = true;
    demo.stop();
    game.start();
    Track.send("game_start");
    history.pushState({ game: 1 }, "");
  }

  function closeGame() {
    game.stop();
    sheet.hidden = true;
    $("shareModal").hidden = true;
    $("boardModal").hidden = true;
    screen.classList.remove("active");
    home.classList.add("active");
    demo.start();
  }

  function showOver(score, perfects = 0) {
    if (!screen.classList.contains("active")) return;
    lastScore = score;
    const isBest = score > best;
    if (isBest) { best = score; Track.set("stackBest", best); }
    showBest();
    $("finalScore").textContent = score;
    $("newBest").hidden = !isBest;
    sheet.hidden = false;
    if (isBest) FX.confetti();
    const gain = $("auraGain");
    gain.hidden = true;
    Track.send("game_over", { score, perfects }).then((r) => {
      if (!r || !r.aura) return;
      gain.textContent = r.aura > 0 ? `✨ +${r.aura.toLocaleString()} aura` : `💀 ${r.aura} aura`;
      gain.classList.toggle("neg", r.aura < 0);
      gain.hidden = false;
    });

    const name = Track.get("playerName");
    $("nameForm").hidden = !!name || score === 0;
    $("rankLine").hidden = true;
    if (name && score > 0) submitScore(score);
    else if (board && board.you) showRank();
  }

  $("playBtn").addEventListener("click", openGame);
  $("againBtn").addEventListener("click", () => {
    sheet.hidden = true;
    game.start();
    Track.send("game_start");
  });
  $("backBtn").addEventListener("click", () => history.back());
  $("homeBtn").addEventListener("click", () => history.back());
  window.addEventListener("popstate", () => {
    if (screen.classList.contains("active")) closeGame();
  });

  $("gameCanvas").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    Sfx.unlock();
    game.place();
  });
  window.addEventListener("keydown", (e) => {
    if ((e.code === "Space" || e.code === "Enter") && screen.classList.contains("active") && sheet.hidden) {
      e.preventDefault();
      game.place();
    }
  });

  // ---- Leaderboard ----
  let board = null;
  const modal = $("boardModal");

  async function api(path, body) {
    const res = await fetch(path, body ? { method: "POST", body: JSON.stringify(body) } : { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    return res.json();
  }

  async function loadBoard() {
    try {
      board = await api(`/api/leaderboard?vid=${encodeURIComponent(Track.vid)}`);
      renderBoard();
    } catch {}
  }

  async function submitScore(score) {
    try {
      board = await api("/api/score", {
        vid: Track.vid, name: Track.get("playerName"), score, ownerKey: Track.get("ownerKey") || "",
      });
      renderBoard();
      showRank();
    } catch {}
  }

  function showRank() {
    const you = board && board.you;
    if (!you) return;
    $("rankLine").textContent = `🏅 Rank #${you.rank} of ${board.players} · View leaderboard`;
    $("rankLine").hidden = false;
  }

  function renderBoard() {
    if (!board) return;
    const chip = $("toBeat");
    const target = board.owner || board.top[0];
    if (target) {
      chip.textContent = board.owner
        ? `👑 Beat ${board.owner.name}'s score: ${board.owner.score}`
        : `🏆 Top score: ${target.score} by ${target.name}`;
      chip.hidden = false;
    }

    const list = $("boardList");
    list.replaceChildren();
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
      : you.rank > 10 ? `You're #${you.rank} with ${you.score}. Keep stacking!` : "";
  }

  function openBoard() {
    modal.hidden = false;
    loadBoard();
  }
  const closeBoard = () => { modal.hidden = true; };

  $("boardBtn").addEventListener("click", openBoard);
  $("toBeat").addEventListener("click", openBoard);
  $("rankLine").addEventListener("click", openBoard);
  $("boardClose").addEventListener("click", closeBoard);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeBoard(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeBoard(); });
  $("boardPlay").addEventListener("click", () => {
    closeBoard();
    if (screen.classList.contains("active")) $("againBtn").click();
    else openGame();
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

  loadBoard();

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
  const shareText = () => `I stacked ${lastScore} blocks in Stack Tower 🔥 Think you can beat me? 👉`;
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
    Track.send("share");
    if (navigator.share) {
      try {
        await navigator.share({ title: "Stack Tower", text: shareText(), url: shareUrl() });
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
