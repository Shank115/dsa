// Aura points (✨ XP for doing things on the page) and the live "vibing here rn" counter.
(() => {
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toLocaleString();
  let aura = null;

  // ---- Aura ----
  async function loadAura() {
    try {
      const res = await fetch(`/api/aura?vid=${encodeURIComponent(Track.vid)}`, { cache: "no-store" });
      if (!res.ok) return;
      aura = await res.json();
      render();
    } catch {}
  }

  function render() {
    if (!aura) return;
    const you = aura.you;
    $("auraTotal").textContent = fmt(you.aura);
    $("auraBig").textContent = fmt(you.aura);
    $("auraRankTitle").textContent = you.title;
    const next = you.next;
    $("auraBar").style.width = next
      ? `${Math.min(100, ((you.aura - next.from) / (next.need - next.from)) * 100)}%`
      : "100%";
    $("auraNext").textContent = next
      ? `${fmt(next.need - you.aura)} more to become ${next.title}`
      : "Max level. You're literally the GOAT 🐐";

    const list = $("auraList");
    list.replaceChildren();
    if (!aura.top.length) {
      const li = document.createElement("li");
      li.className = "board-empty";
      li.textContent = "Nobody's farming yet. Be first 🌾";
      list.append(li);
    }
    const medals = ["🥇", "🥈", "🥉"];
    aura.top.forEach((e, i) => {
      const li = document.createElement("li");
      li.className = e.you ? "you" : "";
      const rank = document.createElement("span");
      rank.className = "rank";
      rank.textContent = medals[i] || i + 1;
      const name = document.createElement("span");
      name.className = "pname";
      name.textContent = e.name;
      const t = document.createElement("small");
      t.className = "ptitle";
      t.textContent = e.title;
      name.append(t);
      const pts = document.createElement("span");
      pts.className = "pscore";
      pts.textContent = fmt(e.aura);
      li.append(rank, name, pts);
      list.append(li);
    });
    $("auraYou").textContent = you.rank && you.rank > 10
      ? `You're #${you.rank} of ${aura.players}. Keep farming 🌾`
      : !Track.get("playerName") && you.aura
        ? "Save your name after a game to show up with it here."
        : "";
  }

  // Floating "+150 aura ✨" under the aura pill
  function pop(headline, detail, negative = false) {
    const el = document.createElement("div");
    el.className = "aura-pop" + (negative ? " neg" : "");
    const big = document.createElement("b");
    big.textContent = headline;
    const why = document.createElement("span");
    why.textContent = detail;
    el.append(big, why);
    $("auraPops").append(el);
    setTimeout(() => el.remove(), 2600);
    const pill = $("auraPill");
    pill.classList.remove("bump");
    void pill.offsetWidth;
    pill.classList.add("bump");
  }

  window.addEventListener("aura", (e) => {
    const r = e.detail;
    const oldTitle = aura && aura.you.title;
    pop(r.aura > 0 ? `+${fmt(r.aura)} aura ✨` : `${fmt(r.aura)} aura 💀`, r.reason, r.aura < 0);
    if (aura) {
      aura.you.aura = r.total;
      aura.you.title = r.title;
      render();
    }
    if (oldTitle && r.title !== oldTitle && r.aura > 0) {
      setTimeout(() => {
        pop(`Level up! ${r.title}`, "new aura title unlocked");
        FX.confetti(90);
      }, 700);
    }
    loadAura();
  });

  const modal = $("auraModal");
  $("auraPill").addEventListener("click", () => {
    modal.hidden = false;
    loadAura();
  });
  $("auraClose").addEventListener("click", () => { modal.hidden = true; });
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });

  // ---- Live "vibing here rn" counter ----
  async function ping() {
    if (document.visibilityState !== "visible") return;
    try {
      const res = await fetch("/api/ping", { method: "POST", body: JSON.stringify({ vid: Track.vid }) });
      if (!res.ok) return;
      const { online } = await res.json();
      $("liveText").textContent = online > 1 ? `${online} vibing here rn 👀` : "just you rn 🫠";
      $("liveCount").hidden = false;
    } catch {}
  }
  document.addEventListener("visibilitychange", ping);

  loadAura();
  ping();
  setInterval(ping, 20000);
})();
