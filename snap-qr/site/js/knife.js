// Knife Hit: tap to throw knives into a spinning target. Hit a knife that's already stuck and it's over.
// Same interface as StackTower (start/stop/place, onGameOver), so it shares the game screen.
// One class drives both the real game and the self-playing demo on the home card.
(() => {
  const GAP = 0.15;        // closest two knives may sit (radians); closer = clash
  const APPLE_HIT = 0.22;  // how close to an apple counts as hitting it
  const THROW_SPEED = 2600; // px per second
  const BOSS_EVERY = 5;

  const CLEAR = ["Stage cleared!", "Clean! 🔥", "Too easy 😮‍💨", "Sharp! 🎯", "Built different"];
  const BOSS = ["BOSS DOWN 👑", "Boss cooked 💀", "GOAT 🐐"];
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const diff = (a, b) => {
    const d = Math.abs((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
    return d;
  };

  class KnifeHit {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.demo = !!opts.demo;
      this.transparent = !!opts.transparent;
      this.sound = opts.sound || null;
      this.onGameOver = opts.onGameOver || (() => {});
      this.running = false;
      this.raf = 0;
      this.stars = Array.from({ length: 50 }, () => ({
        x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.3, a: Math.random() * 0.5 + 0.15,
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
      // Target size and positions (the demo card is short and wide, the game screen tall)
      this.R = this.demo ? Math.min(this.w * 0.2, this.h * 0.3) : Math.min(this.w * 0.31, this.h * 0.19);
      this.cx = this.w / 2;
      this.cy = this.demo ? this.h * 0.38 : this.h * 0.33;
      this.L = this.R * 0.95;          // knife length
      this.kw = this.R * 0.085;        // knife width
      this.baseY = this.demo ? this.h - this.L * 0.6 : this.h * 0.84; // where the next knife waits (its tip)
    }

    reset() {
      this.hue = Math.floor(Math.random() * 360);
      this.score = 0;
      this.stage = 0;
      this.over = false;
      this.popups = [];
      this.pieces = [];
      this.falling = [];
      this.sparks = [];
      this.shake = 0;
      this.hintAlpha = this.demo ? 0 : 1;
      this.demoCooldown = 0.8;
      this.nextStage();
    }

    nextStage() {
      this.stage++;
      this.boss = this.stage % BOSS_EVERY === 0;
      this.t = 0;
      this.angle = Math.random() * Math.PI * 2;
      this.knivesLeft = this.boss ? 10 : 5 + Math.min(this.stage, 4);
      this.knivesTotal = this.knivesLeft;
      this.flying = null;
      this.flash = 0;
      this.bump = 0;
      this.clearing = 0;
      this.banner = this.stage === 1 && !this.demo ? 0 : 1.4;
      // Knives already stuck in the target, spaced apart, from stage 2 on
      this.stuck = [];
      const pre = this.boss ? 3 : Math.min(this.stage - 1, 3);
      while (this.stuck.length < pre) {
        const a = Math.random() * Math.PI * 2;
        if (this.stuck.every((s) => diff(s, a) > GAP * 3)) this.stuck.push(a);
      }
      // Sometimes an apple sits on the rim: +2 if you hit it
      this.apples = [];
      if (Math.random() < (this.boss ? 1 : 0.4)) {
        for (let i = 0; i < 200 && !this.apples.length; i++) {
          const a = Math.random() * Math.PI * 2;
          if (this.stuck.every((s) => diff(s, a) > GAP * 2)) this.apples.push({ a, hit: false });
        }
      }
      // Each stage spins differently; bosses reverse and speed up
      const base = Math.min(1.7 + this.stage * 0.12, 3.6) * (Math.random() < 0.5 ? 1 : -1);
      const kind = this.boss ? 3 : this.stage === 1 ? 0 : Math.floor(Math.random() * 3);
      this.spin = (t) => {
        if (kind === 0) return base;
        if (kind === 1) return base * (1 + 0.65 * Math.sin(t * 1.4));                // speeds up and slows down
        if (kind === 2) return base * (Math.sin(t * 0.9) > -0.3 ? 1 : -0.7);          // occasional reverse
        return base * 1.35 * (Math.sin(t * 1.1) > 0 ? 1 : -1) * (1 + 0.3 * Math.sin(t * 3));
      };
      this.stageHue = (this.hue + (this.stage - 1) * 47) % 360;
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

    // Throw a knife (called on tap)
    place() {
      if (this.over || this.flying || this.clearing > 0 || this.knivesLeft <= 0) return;
      this.knivesLeft--;
      this.flying = { y: this.baseY };
      this.hintAlpha = 0;
      if (this.sound && this.sound.throwKnife) this.sound.throwKnife();
    }

    land() {
      const contact = Math.PI / 2 - this.angle; // the target's bottom point, in its own rotating frame
      this.flying = null;
      if (this.stuck.some((s) => diff(s, contact) < GAP)) return this.clash(contact);

      this.stuck.push(contact);
      this.score++;
      this.flash = 1;
      this.bump = 1;
      this.burst(this.cx, this.cy + this.R, 6, "#fff");
      let text = null;
      for (const ap of this.apples) {
        if (!ap.hit && diff(ap.a, contact) < APPLE_HIT) {
          ap.hit = true;
          this.score += 2;
          text = "🍎 +2";
          const [x, y] = this.rim(ap.a, this.R + this.R * 0.14);
          this.burst(x, y, 14, "#ff4d6d");
          if (this.sound && this.sound.apple) this.sound.apple();
        }
      }
      if (text) this.popups.push({ text, t: 0 });
      if (this.sound && this.sound.knife) this.sound.knife(this.knivesTotal - this.knivesLeft);
      if (!this.demo && navigator.vibrate) navigator.vibrate(10);
      if (this.knivesLeft === 0) this.clearStage();
    }

    clash(contact) {
      // The knife bounces off and spins away
      this.falling.push({ x: this.cx, y: this.cy + this.R + this.L * 0.5, vx: (Math.random() < 0.5 ? -1 : 1) * 260, vy: 380, rot: Math.PI, vr: 14 });
      this.burst(this.cx, this.cy + this.R, 10, "#ffd166");
      this.over = true;
      this.shake = 14;
      if (this.demo) { this.demoTimer = 1.3; return; }
      if (this.sound) this.sound.over();
      if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
      setTimeout(() => this.onGameOver(this.score, this.stage), 900);
    }

    clearStage() {
      // Target shatters, knives fly off, then the next stage
      this.clearing = 1.1;
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = this.angle + (i / n) * Math.PI * 2;
        this.pieces.push({ a0: (i / n) * Math.PI * 2, a1: ((i + 1) / n) * Math.PI * 2, rot: this.angle, x: this.cx, y: this.cy,
          vx: Math.cos(a) * (180 + Math.random() * 160), vy: Math.sin(a) * (180 + Math.random() * 160) - 200, vr: (Math.random() - 0.5) * 6, life: 1 });
      }
      for (const s of this.stuck) {
        const wa = s + this.angle;
        const [x, y] = this.rim(s, this.R + this.L * 0.4);
        this.falling.push({ x, y, vx: Math.cos(wa) * 320, vy: Math.sin(wa) * 320 - 180, rot: wa - Math.PI / 2, vr: (Math.random() - 0.5) * 12 });
      }
      this.stuck = [];
      this.apples = [];
      this.burst(this.cx, this.cy, 26, `hsl(${this.stageHue}, 90%, 70%)`);
      if (!this.demo) this.popups.push({ text: this.boss ? pick(BOSS) : pick(CLEAR), t: 0, big: true });
      if (this.sound && this.sound.stageClear) this.sound.stageClear();
      if (!this.demo && navigator.vibrate) navigator.vibrate([15, 40, 25]);
    }

    rim(localAngle, r) {
      const a = localAngle + this.angle;
      return [this.cx + Math.cos(a) * r, this.cy + this.bumpY() + Math.sin(a) * r];
    }
    bumpY() { return -this.bump * this.R * 0.05; }

    burst(x, y, n, color) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 220;
        this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color });
      }
    }

    // Demo: throw when the bottom of the target is clear
    demoThink(dt) {
      if (this.over) {
        this.demoTimer -= dt;
        if (this.demoTimer <= 0) this.reset();
        return;
      }
      this.demoCooldown -= dt;
      if (this.demoCooldown > 0 || this.flying || this.clearing > 0) return;
      const contact = Math.PI / 2 - this.angle;
      const clear = this.stuck.every((s) => diff(s, contact) > GAP * 2.2);
      if (clear || Math.random() < 0.004) {
        this.place();
        this.demoCooldown = 0.45 + Math.random() * 0.5;
      }
      if (this.stage > 3) { this.reset(); }
    }

    update(dt) {
      this.t += dt;
      if (!this.over && this.clearing <= 0) this.angle += this.spin(this.t) * dt;
      if (this.demo) this.demoThink(dt);

      if (this.flying) {
        this.flying.y -= THROW_SPEED * dt;
        if (this.flying.y <= this.cy + this.R) this.land();
      }
      if (this.clearing > 0) {
        this.clearing -= dt;
        if (this.clearing <= 0) this.nextStage();
      }
      for (const p of this.pieces) {
        p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= dt * 0.9;
      }
      this.pieces = this.pieces.filter((p) => p.life > 0);
      for (const k of this.falling) {
        k.vy += 1400 * dt; k.x += k.vx * dt; k.y += k.vy * dt; k.rot += k.vr * dt;
      }
      this.falling = this.falling.filter((k) => k.y < this.h + this.L * 2);
      for (const s of this.sparks) {
        s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 300 * dt; s.life -= dt * 2.2;
      }
      this.sparks = this.sparks.filter((s) => s.life > 0);
      for (const p of this.popups) p.t += dt;
      this.popups = this.popups.filter((p) => p.t < 1.2);
      this.flash = Math.max(0, this.flash - dt * 6);
      this.bump = Math.max(0, this.bump - dt * 8);
      this.shake = Math.max(0, this.shake - dt * 40);
      if (this.banner > 0) this.banner -= dt;
    }

    // A knife with its tip at (x, y), rotated so the tip points along `rot` (0 = up)
    knife(x, y, rot, alpha = 1) {
      const { ctx, L, kw } = this;
      const blade = L * 0.58, guard = kw * 0.5;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.rotate(rot);
      const g = ctx.createLinearGradient(-kw / 2, 0, kw / 2, 0);
      g.addColorStop(0, "#f4f6fa");
      g.addColorStop(0.55, "#c9d0db");
      g.addColorStop(1, "#8b94a3");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(kw / 2, blade * 0.22);
      ctx.lineTo(kw / 2, blade);
      ctx.lineTo(-kw / 2, blade);
      ctx.lineTo(-kw / 2, blade * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#2b2f38";
      ctx.fillRect(-kw * 0.95, blade, kw * 1.9, guard);
      ctx.fillStyle = `hsl(${(this.stageHue + 180) % 360}, 75%, 55%)`;
      const hy = blade + guard, hl = L - hy;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-kw * 0.5, hy, kw, hl, kw * 0.45) : ctx.rect(-kw * 0.5, hy, kw, hl);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(-kw * 0.15, hy + hl * 0.15, kw * 0.18, hl * 0.6);
      ctx.restore();
    }

    target() {
      const { ctx, R, cx } = this;
      const cy = this.cy + this.bumpY();
      const hue = this.stageHue;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.angle);
      // glow
      ctx.shadowColor = `hsla(${hue}, 90%, 60%, 0.6)`;
      ctx.shadowBlur = R * 0.5;
      const g = ctx.createRadialGradient(0, -R * 0.3, R * 0.1, 0, 0, R);
      g.addColorStop(0, `hsl(${hue}, 70%, 62%)`);
      g.addColorStop(1, `hsl(${hue}, 65%, 30%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // rings + notches so the spin is easy to see
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = Math.max(1.5, R * 0.03);
      for (const f of [0.75, 0.5, 0.25]) {
        ctx.beginPath();
        ctx.arc(0, 0, R * f, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(0,0,0,0.22)";
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * R * 0.82, Math.sin(a) * R * 0.82);
        ctx.lineTo(Math.cos(a) * R * 0.97, Math.sin(a) * R * 0.97);
        ctx.stroke();
      }
      ctx.fillStyle = this.boss ? "#ffd166" : "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(0, 0, R * (this.boss ? 0.16 : 0.09), 0, Math.PI * 2);
      ctx.fill();
      if (this.boss) {
        ctx.font = `${R * 0.2}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("👑", 0, 0);
      }
      ctx.restore();
      if (this.flash > 0) {
        ctx.globalAlpha = this.flash * 0.35;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    render() {
      const { ctx, w, h } = this;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;

      if (this.transparent) {
        ctx.clearRect(0, 0, w, h);
      } else {
        // Colourful sky that changes every stage (like Stack Tower)
        const hue = this.stageHue, t = performance.now() / 1000;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, `hsl(${hue + 50}, 65%, 24%)`);
        g.addColorStop(0.55, `hsl(${hue}, 60%, 12%)`);
        g.addColorStop(1, `hsl(${hue - 40}, 65%, 5%)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        const rg = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, h * 0.6);
        rg.addColorStop(0, `hsla(${hue + 20}, 90%, 60%, 0.25)`);
        rg.addColorStop(1, "transparent");
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#fff";
        for (const [i, s] of this.stars.entries()) {
          ctx.globalAlpha = s.a * (0.55 + 0.45 * Math.sin(t * 2 + i));
          ctx.beginPath();
          ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      ctx.save();
      ctx.translate(sx, sy);

      // Shattered target pieces
      for (const p of this.pieces) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = `hsl(${this.stageHue}, 65%, 45%)`;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, this.R, p.a0, p.a1);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      if (this.clearing <= 0) {
        // Stuck knives (drawn behind the target so the blade looks embedded)
        for (const s of this.stuck) {
          const [x, y] = this.rim(s, this.R - this.L * 0.18);
          this.knife(x, y, s + this.angle - Math.PI / 2, 1); // tip inside, handle pointing out
        }
        this.target();
        for (const ap of this.apples) {
          if (ap.hit) continue;
          const [x, y] = this.rim(ap.a, this.R + this.R * 0.14);
          ctx.font = `${this.R * 0.28}px serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("🍎", x, y);
        }
      }

      for (const k of this.falling) this.knife(k.x, k.y, k.rot, 1);
      if (this.flying) this.knife(this.cx, this.flying.y, 0);
      else if (!this.over && this.knivesLeft > 0 && this.clearing <= 0) this.knife(this.cx, this.baseY, 0);

      for (const s of this.sparks) {
        ctx.globalAlpha = Math.max(0, s.life);
        ctx.fillStyle = s.color;
        ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      if (this.demo) return;

      const font = '"Space Grotesk", system-ui, sans-serif';
      const mono = '"JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Score + stage
      if (!this.over) {
        ctx.font = `700 56px ${font}`;
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.shadowColor = "rgba(0,0,0,0.3)";
        ctx.shadowBlur = 18;
        ctx.fillText(this.score, w / 2, h * 0.07 + 24);
        ctx.shadowBlur = 0;
      }
      ctx.font = `700 12px ${mono}`;
      ctx.fillStyle = this.boss ? "#ffd166" : "rgba(255,255,255,0.7)";
      ctx.fillText(this.boss ? `BOSS · STAGE ${this.stage}` : `STAGE ${this.stage}`, w / 2, h * 0.07 + 62);
      // stage progress dots (5 per round, the 5th is the boss)
      const inRound = ((this.stage - 1) % BOSS_EVERY) + 1;
      for (let i = 1; i <= BOSS_EVERY; i++) {
        ctx.fillStyle = i < inRound ? "rgba(255,255,255,0.85)" : i === inRound ? "#ffd166" : "rgba(255,255,255,0.22)";
        ctx.beginPath();
        ctx.arc(w / 2 + (i - 3) * 16, h * 0.07 + 80, i === BOSS_EVERY ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Knives left (bottom-left column)
      for (let i = 0; i < this.knivesTotal; i++) {
        const used = i >= this.knivesLeft;
        ctx.globalAlpha = used ? 0.2 : 0.9;
        ctx.fillStyle = "#fff";
        const x = 24, y = h * 0.92 - i * 18;
        ctx.beginPath();
        ctx.moveTo(x, y - 7);
        ctx.lineTo(x + 3, y - 2);
        ctx.lineTo(x + 3, y + 7);
        ctx.lineTo(x - 3, y + 7);
        ctx.lineTo(x - 3, y - 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Popups (apple bonus, stage cleared)
      for (const p of this.popups) {
        ctx.globalAlpha = Math.max(0, 1 - p.t / 1.2);
        ctx.font = `700 ${p.big ? 30 : 24}px ${font}`;
        ctx.fillStyle = "#fff";
        ctx.shadowColor = `hsl(${this.stageHue}, 90%, 60%)`;
        ctx.shadowBlur = 18;
        ctx.fillText(p.text, w / 2, this.cy + this.R + 60 - p.t * 40);
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      // "Stage N" / "BOSS" banner at the start of each stage
      if (this.banner > 0 && this.stage > 1 && !this.over) {
        ctx.globalAlpha = Math.min(1, this.banner * 2);
        ctx.font = `700 ${this.boss ? 34 : 28}px ${font}`;
        ctx.fillStyle = this.boss ? "#ffd166" : "#fff";
        ctx.fillText(this.boss ? "👑 BOSS STAGE" : `Stage ${this.stage}`, w / 2, this.cy + this.R + 70);
        ctx.globalAlpha = 1;
      }

      if (this.hintAlpha > 0 && !this.over) {
        ctx.globalAlpha = this.hintAlpha * (0.65 + 0.35 * Math.sin(performance.now() / 300));
        ctx.font = `500 15px ${mono}`;
        ctx.fillStyle = "#fff";
        ctx.fillText("Tap to throw. Don't hit a knife!", w / 2, this.cy + this.R + 70);
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

  window.KnifeHit = KnifeHit;
})();
