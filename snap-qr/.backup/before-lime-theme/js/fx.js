// Visual effects overlay: tap sparkles and confetti bursts, drawn on one fixed canvas.
window.FX = (() => {
  const canvas = document.getElementById("fx");
  const ctx = canvas.getContext("2d");
  const COLORS = ["#7c3aed", "#a78bfa", "#ec4899", "#f9a8d4", "#f97316", "#ffffff"];
  const EMOJI = ["✨", "💫", "⭐", "💜", "🔥"];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let parts = [];
  let raf = 0, last = 0, dpr = 1, w = 0, h = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  resize();
  window.addEventListener("resize", resize);

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function drawSparkle(r) {
    // Four-pointed star
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const len = i % 2 ? r * 0.35 : r;
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    }
    ctx.closePath();
    ctx.fill();
  }

  function loop(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.life -= dt;
      p.vy += p.g * dt;
      p.vx *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.fade));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.emoji) {
        ctx.font = `${p.size}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.emoji, 0, 0);
      } else if (p.kind === "star") {
        ctx.fillStyle = p.color;
        drawSparkle(p.size);
      } else {
        ctx.fillStyle = p.color;
        ctx.scale(1, Math.cos(p.rot * 3)); // flutter
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    parts = parts.filter((p) => p.life > 0 && p.y < h + 60);
    raf = parts.length ? requestAnimationFrame(loop) : 0;
    if (!raf) ctx.clearRect(0, 0, w, h);
  }

  function kick() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function sparkle(x, y) {
    if (reduce) return;
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 120 + Math.random() * 180;
      parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 260, drag: 0.94,
        life: 0.7, fade: 0.45, size: 4 + Math.random() * 5, kind: "star",
        color: pick(COLORS), rot: 0, vr: (Math.random() - 0.5) * 8,
      });
    }
    if (Math.random() < 0.6) {
      parts.push({
        x, y, vx: (Math.random() - 0.5) * 80, vy: -220, g: 200, drag: 0.98,
        life: 0.9, fade: 0.5, size: 20, emoji: pick(EMOJI), rot: 0, vr: (Math.random() - 0.5) * 3,
      });
    }
    kick();
  }

  function confetti(n = 140) {
    if (reduce) return;
    for (let i = 0; i < n; i++) {
      parts.push({
        x: w / 2 + (Math.random() - 0.5) * w * 0.3, y: h * 0.6,
        vx: (Math.random() - 0.5) * 1000, vy: -(500 + Math.random() * 800), g: 1000, drag: 0.985,
        life: 2.6 + Math.random(), fade: 0.8, size: 8 + Math.random() * 6, kind: "rect",
        color: pick(COLORS), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
      });
    }
    kick();
  }

  return { sparkle, confetti };
})();
