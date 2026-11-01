// Stack Tower: isometric block-stacking game drawn on a <canvas>.
// One class drives both the real game and the self-playing demo on the home page.
(() => {
  const C = Math.cos(Math.PI / 6);
  const S = 0.5;
  const BASE = 170;   // starting block size (world units)
  const LAYER = 34;   // block height
  const RANGE = 220;  // how far a block slides from the tower
  const PERFECT = 6;  // tolerance for a "perfect" drop

  // Compliments for perfect drops; the longer the streak, the more hype.
  const PRAISE = [
    ["Nice!", "Clean!", "Perfect!", "Smooth!"],
    ["Awesome!", "Nailed it!", "So good!", "Crisp!"],
    ["Insane!", "On fire 🔥", "Beast mode!", "Built different"],
    ["Unreal!", "GOAT 🐐", "Messi-level 🐐", "Unstoppable!", "Legendary!"],
  ];
  const praise = (combo) => {
    const tier = PRAISE[Math.min(PRAISE.length - 1, Math.floor((combo - 1) / 2))];
    return tier[Math.floor(Math.random() * tier.length)];
  };

  class StackTower {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.demo = !!opts.demo;
      this.transparent = !!opts.transparent;
      this.fit = opts.fit || [0.5, 0.32];
      this.sound = opts.sound || null;
      this.onGameOver = opts.onGameOver || (() => {});
      this.running = false;
      this.raf = 0;
      this.stars = Array.from({ length: 60 }, () => ({
        x: Math.random(), y: Math.random(),
        r: Math.random() * 1.5 + 0.3, a: Math.random() * 0.5 + 0.15,
      }));
      this.loop = this.loop.bind(this);
      window.addEventListener("resize", () => this.resize());
      this.resize();
      this.reset();
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = Math.max(1, r.width);
      this.h = Math.max(1, r.height);
      this.canvas.width = Math.round(this.w * this.dpr);
      this.canvas.height = Math.round(this.h * this.dpr);
      const towerW = BASE * 2 * C;
      this.baseScale = Math.min((this.w * this.fit[0]) / towerW, (this.h * this.fit[1]) / towerW);
    }

    reset() {
      this.hue = Math.floor(Math.random() * 360);
      this.bgHue = this.hue;
      this.stack = [{ x: -BASE / 2, z: -BASE / 2, w: BASE, d: BASE, y: -LAYER * 9, h: LAYER * 10, hue: this.hue, base: true }];
      this.score = 0;
      this.combo = 0;
      this.perfects = 0;
      this.axis = "x";
      this.debris = [];
      this.ripples = [];
      this.popups = [];
      this.over = false;
      this.demoTimer = 0;
      this.camY = this.camTarget = this.topY();
      this.zoom = this.zoomTarget = 1;
      this.anchor = this.anchorTarget = 0.6;
      this.shake = 0;
      this.hintAlpha = this.demo ? 0 : 1;
      this.spawn();
    }

    start() {
      this.resize();
      this.reset();
      this.running = true;
      this.last = performance.now();
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(this.loop);
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }

    top() { return this.stack[this.stack.length - 1]; }
    topY() { const t = this.top(); return t.y + t.h; }
    speed() { return this.demo ? 240 : Math.min(190 + this.score * 4, 520); }

    spawn() {
      const p = (this.prev = this.top());
      this.axis = this.axis === "x" ? "z" : "x";
      this.offset = -RANGE;
      this.dir = 1;
      this.current = { x: p.x, z: p.z, w: p.w, d: p.d, y: p.y + p.h, h: LAYER, hue: this.hue + this.stack.length * 8 };
      this.aim = Math.random() < 0.7 ? 0 : (Math.random() * 2 - 1) * 14;
      this.slide();
    }

    slide() {
      const k = this.axis;
      this.current[k] = this.prev[k] + this.offset;
    }

    // Drop the sliding block onto the tower.
    place() {
      if (this.over || !this.current) return;
      const cur = this.current, prev = this.prev;
      const pos = this.axis, size = pos === "x" ? "w" : "d";
      let delta = cur[pos] - prev[pos];
      const perfect = Math.abs(delta) <= PERFECT;
      if (perfect) { cur[pos] = prev[pos]; delta = 0; }

      const overlap = prev[size] - Math.abs(delta);
      if (overlap <= 0) {
        this.addDebris(cur, delta || 1);
        this.current = null;
        this.end();
        return;
      }

      if (perfect) {
        this.combo++;
        this.perfects++;
        if (this.combo >= 3 && cur[size] < BASE) {
          const g = Math.min(8, BASE - cur[size]);
          cur[size] += g;
          cur[pos] -= g / 2;
        }
        this.ripples.push({ b: { ...cur }, t: 0 });
        this.popups.push({ text: praise(this.combo), combo: this.combo, hue: cur.hue, t: 0 });
      } else {
        const cut = { ...cur };
        if (delta > 0) {
          cut[pos] = prev[pos] + prev[size];
          cut[size] = delta;
        } else {
          cut[size] = -delta;
          cur[pos] = prev[pos];
        }
        cur[size] = overlap;
        this.addDebris(cut, delta);
        this.combo = 0;
      }

      this.stack.push(cur);
      this.score++;
      this.camTarget = this.topY();
      if (this.sound) this.sound.place(this.combo, perfect);
      if (!this.demo && navigator.vibrate) navigator.vibrate(perfect ? 18 : 8);

      if (this.demo && this.stack.length > 15) {
        this.current = null;
        this.demoTimer = 1.4;
        return;
      }
      this.spawn();
    }

    addDebris(b, delta) {
      const push = Math.sign(delta) * 70;
      this.debris.push({
        ...b, vy: 0, alpha: 1, behind: delta < 0,
        vx: this.axis === "x" ? push : 0,
        vz: this.axis === "z" ? push : 0,
      });
    }

    end() {
      this.over = true;
      this.combo = 0;
      if (this.demo) { this.demoTimer = 1.2; return; }
      this.shake = 16;
      if (this.sound) this.sound.over();
      if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
      // Zoom out to show the whole tower above the results sheet.
      const span = this.topY() + BASE * 2 * S + 60;
      this.zoomTarget = Math.min(1, (this.h * 0.4) / (span * this.baseScale));
      this.camTarget = this.topY() / 2;
      this.anchorTarget = 0.3;
      setTimeout(() => this.onGameOver(this.score, this.perfects), 900);
    }

    update(dt) {
      if (this.current) {
        this.offset += this.dir * this.speed() * dt;
        if (this.offset > RANGE) { this.offset = RANGE; this.dir = -1; }
        else if (this.offset < -RANGE) { this.offset = -RANGE; this.dir = 1; }
        this.slide();
        if (this.demo && this.dir === 1 && this.offset >= this.aim) this.place();
      }
      if (this.demoTimer > 0) {
        this.demoTimer -= dt;
        if (this.demoTimer <= 0) this.reset();
      }

      for (const d of this.debris) {
        d.vy += 1600 * dt;
        d.y -= d.vy * dt;
        d.x += d.vx * dt;
        d.z += d.vz * dt;
        d.alpha -= dt * 0.7;
      }
      this.debris = this.debris.filter((d) => d.alpha > 0);
      for (const r of this.ripples) r.t += dt;
      this.ripples = this.ripples.filter((r) => r.t < 0.7);
      for (const p of this.popups) p.t += dt;
      this.popups = this.popups.filter((p) => p.t < 1.1);

      this.camY += (this.camTarget - this.camY) * Math.min(1, dt * 5);
      this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 2.5);
      this.anchor += (this.anchorTarget - this.anchor) * Math.min(1, dt * 2.5);
      const targetHue = this.current ? this.current.hue : this.top().hue;
      this.bgHue += (targetHue - this.bgHue) * Math.min(1, dt * 2);
      this.shake = Math.max(0, this.shake - dt * 40);
      if (this.score > 0) this.hintAlpha = Math.max(0, this.hintAlpha - dt * 3);
    }

    P(x, y, z) {
      return [
        this.ox + (x - z) * C * this.s,
        this.oy + ((x + z) * S - (y - this.camY)) * this.s,
      ];
    }

    poly(pts, fill) {
      const c = this.ctx;
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.closePath();
      c.fillStyle = fill;
      c.strokeStyle = fill;
      c.fill();
      c.stroke();
    }

    box(b, alpha) {
      const { x, z, w, d, y, h } = b;
      const x1 = x + w, z1 = z + d, y1 = y + h;
      const sat = b.base ? 45 : 72;
      const l = b.base ? -16 : 0;
      this.ctx.globalAlpha = alpha;
      this.ctx.lineWidth = 1;
      this.ctx.lineJoin = "round";
      this.poly([this.P(x1, y1, z), this.P(x1, y1, z1), this.P(x1, y, z1), this.P(x1, y, z)], `hsl(${b.hue}, ${sat}%, ${50 + l}%)`);
      this.poly([this.P(x, y1, z1), this.P(x1, y1, z1), this.P(x1, y, z1), this.P(x, y, z1)], `hsl(${b.hue}, ${sat - 6}%, ${39 + l}%)`);
      this.poly([this.P(x, y1, z), this.P(x1, y1, z), this.P(x1, y1, z1), this.P(x, y1, z1)], `hsl(${b.hue}, ${sat + 6}%, ${66 + l}%)`);
      this.ctx.globalAlpha = 1;
    }

    render() {
      const { ctx, w, h } = this;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      if (this.transparent) {
        ctx.clearRect(0, 0, w, h);
      } else {
        const hue = this.bgHue;
        const t = performance.now() / 1000;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, `hsl(${hue + 60}, 70%, 28%)`);
        g.addColorStop(0.5, `hsl(${hue + 10}, 65%, 15%)`);
        g.addColorStop(1, `hsl(${hue - 30}, 70%, 6%)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        // Drifting aurora glows plus a soft halo behind the tower top
        const glow = (x, y, r, color) => {
          const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
          rg.addColorStop(0, color);
          rg.addColorStop(1, "transparent");
          ctx.fillStyle = rg;
          ctx.fillRect(0, 0, w, h);
        };
        glow(w * (0.25 + 0.15 * Math.sin(t * 0.3)), h * 0.2, w * 0.9, `hsla(${hue + 100}, 90%, 60%, 0.22)`);
        glow(w * (0.8 + 0.12 * Math.cos(t * 0.25)), h * 0.55, w * 0.85, `hsla(${hue - 50}, 90%, 60%, 0.18)`);
        glow(w / 2, h * this.anchor, h * 0.35, `hsla(${hue}, 95%, 65%, 0.16)`);
        const par = this.camY * 0.08;
        ctx.fillStyle = "#fff";
        for (const [i, s] of this.stars.entries()) {
          ctx.globalAlpha = s.a * (0.55 + 0.45 * Math.sin(t * 2 + i));
          const sy = (((s.y * h + par) % h) + h) % h;
          ctx.beginPath();
          ctx.arc(s.x * w, sy, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      this.ox = w / 2 + (Math.random() - 0.5) * this.shake;
      this.oy = h * this.anchor + (Math.random() - 0.5) * this.shake;
      this.s = this.baseScale * this.zoom;

      for (const d of this.debris) if (d.behind) this.box(d, d.alpha);
      for (const b of this.stack) this.box(b, 1);
      if (this.current) this.box(this.current, 1);
      for (const d of this.debris) if (!d.behind) this.box(d, d.alpha);

      for (const r of this.ripples) {
        const m = r.t * 80, b = r.b, yT = b.y + b.h;
        ctx.globalAlpha = Math.max(0, 1 - r.t / 0.7);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2.5;
        const pts = [
          this.P(b.x - m, yT, b.z - m), this.P(b.x + b.w + m, yT, b.z - m),
          this.P(b.x + b.w + m, yT, b.z + b.d + m), this.P(b.x - m, yT, b.z + b.d + m),
        ];
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (this.demo) return;

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const font = '"Space Grotesk", system-ui, sans-serif';
      const body = '"JetBrains Mono", ui-monospace, monospace';

      for (const p of this.popups) {
        ctx.globalAlpha = Math.max(0, 1 - p.t / 1.1);
        ctx.font = `700 ${22 + Math.min(p.combo, 6) * 2}px ${font}`;
        ctx.shadowColor = `hsl(${p.hue}, 90%, 60%)`;
        ctx.shadowBlur = 18;
        ctx.fillStyle = "#fff";
        ctx.fillText(p.text, w / 2, h * 0.25 - p.t * 40);
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      if (!this.over) {
        ctx.font = `700 64px ${font}`;
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.shadowColor = "rgba(0,0,0,0.25)";
        ctx.shadowBlur = 20;
        ctx.fillText(this.score, w / 2, h * 0.14 + 10);
        ctx.shadowBlur = 0;
      }

      if (this.hintAlpha > 0 && !this.over) {
        ctx.globalAlpha = this.hintAlpha * (0.65 + 0.35 * Math.sin(performance.now() / 300));
        ctx.font = `500 15px ${body}`;
        ctx.fillStyle = "#fff";
        ctx.fillText("Tap anywhere to drop the block", w / 2, h * 0.22 + 10);
        ctx.globalAlpha = 1;
      }
    }

    loop(t) {
      if (!this.running) return;
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.update(dt);
      this.render();
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  window.StackTower = StackTower;
})();
