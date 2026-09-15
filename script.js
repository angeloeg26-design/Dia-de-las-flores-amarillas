(() => {
  'use strict';

  /* =========================================================
     CONFIG & UTILIDADES
     ========================================================= */

  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d', { alpha: false });

  const introEl = document.getElementById('intro');
  const overlayTitle = document.getElementById('titleBlock');
  const phraseEl = document.getElementById('phraseText');
  const finalMessageEl = document.getElementById('finalMessage');
  const restartHintEl = document.getElementById('restartHint');

  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  resize();

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const wait = ms => new Promise(res => setTimeout(res, ms));

  /* =========================================================
     DETECCIÓN DE CAPACIDAD DEL DISPOSITIVO
     ========================================================= */

  function detectQuality() {
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    const area = window.innerWidth * window.innerHeight;
    let score = 0;
    score += cores >= 6 ? 2 : cores >= 4 ? 1 : 0;
    score += mem >= 6 ? 2 : mem >= 4 ? 1 : 0;
    score += area <= 500000 ? 1 : 0;
    if (score >= 4) return 'high';
    if (score >= 2) return 'mid';
    return 'low';
  }

  const QUALITY = detectQuality();
  const Q = {
    high: { maxParticles: 420, trailAlpha: 0.16, glow: true, shadowBlur: 14 },
    mid: { maxParticles: 260, trailAlpha: 0.22, glow: true, shadowBlur: 8 },
    low: { maxParticles: 140, trailAlpha: 0.32, glow: false, shadowBlur: 0 }
  }[QUALITY];

  /* =========================================================
     PALETA DORADA
     ========================================================= */

  const GOLD_HUES = [42, 45, 48, 38, 50]; // tonos cálidos dorados/amarillos

  function goldColor(alpha, hueShift = 0, light = 62) {
    const h = GOLD_HUES[randInt(0, GOLD_HUES.length - 1)] + hueShift;
    return `hsla(${h}, 92%, ${light}%, ${alpha})`;
  }

  /* =========================================================
     PARTÍCULAS
     ========================================================= */

  let particles = [];
  const MODE = { FREE: 0, FORMING: 1, HELD: 2, RELEASING: 3, FADING: 4 };
  const SHAPE = { DOT: 0, STAR: 1, HEART: 2 };

  class Particle {
    constructor(x, y, opts = {}) {
      this.reset(x, y, opts);
    }
    reset(x, y, opts = {}) {
      this.x = x;
      this.y = y;
      this.vx = opts.vx !== undefined ? opts.vx : rand(-0.15, 0.15);
      this.vy = opts.vy !== undefined ? opts.vy : rand(-0.22, -0.04);
      this.baseSize = opts.size || rand(1.1, 3.2);
      this.size = this.baseSize;
      this.alpha = 0;
      this.targetAlpha = opts.alpha !== undefined ? opts.alpha : rand(0.35, 0.9);
      this.hueShift = rand(-6, 6);
      this.light = rand(55, 74);
      this.shape = opts.shape !== undefined ? opts.shape : SHAPE.DOT;
      this.mode = MODE.FREE;
      this.tx = null;
      this.ty = null;
      this.formT = 0;
      this.formDuration = opts.formDuration || rand(900, 1600);
      this.formStart = 0;
      this.ox = x; // origen al iniciar una formación
      this.oy = y;
      this.twinklePhase = rand(0, Math.PI * 2);
      this.twinkleSpeed = rand(0.02, 0.05);
      this.life = 0;
      this.maxLife = opts.maxLife || rand(6000, 13000);
      this.holdUntil = 0;
      this.dead = false;
      this.drift = rand(0.4, 1);
    }
    setFormationTarget(tx, ty, delayMs = 0, duration) {
      this.tx = tx;
      this.ty = ty;
      this.ox = this.x;
      this.oy = this.y;
      this.formDuration = duration || this.formDuration;
      this.formStart = performance.now() + delayMs;
      this.mode = MODE.FORMING;
    }
    release() {
      this.mode = MODE.RELEASING;
      this.vx = rand(-0.5, 0.5);
      this.vy = rand(-0.7, -0.1);
      this.formStart = performance.now();
    }
    update(dt, now) {
      this.life += dt;
      this.twinklePhase += this.twinkleSpeed * dt * 0.06;

      if (this.mode === MODE.FREE) {
        this.x += this.vx * this.drift;
        this.y += this.vy * this.drift;
        this.vx += rand(-0.008, 0.008);
        this.vy += rand(-0.008, 0.008);
        this.vx = clamp(this.vx, -0.35, 0.35);
        this.vy = clamp(this.vy, -0.5, 0.15);
        this.alpha += (this.targetAlpha - this.alpha) * 0.02;
        if (this.life > this.maxLife) {
          this.targetAlpha = 0;
          if (this.alpha < 0.02) this.dead = true;
        }
      } else if (this.mode === MODE.FORMING) {
        const elapsed = now - this.formStart;
        if (elapsed < 0) {
          // esperando su turno
          this.alpha += (this.targetAlpha - this.alpha) * 0.03;
        } else {
          const t = clamp(elapsed / this.formDuration, 0, 1);
          const e = easeInOutCubic(t);
          this.x = lerp(this.ox, this.tx, e);
          this.y = lerp(this.oy, this.ty, e);
          this.alpha += ((this.targetAlpha) - this.alpha) * 0.04;
          if (t >= 1) {
            this.mode = MODE.HELD;
          }
        }
      } else if (this.mode === MODE.HELD) {
        this.x = this.tx + Math.sin(this.twinklePhase * 1.3) * 0.6;
        this.y = this.ty + Math.cos(this.twinklePhase * 1.1) * 0.6;
        this.alpha += (this.targetAlpha - this.alpha) * 0.05;
      } else if (this.mode === MODE.RELEASING) {
        const elapsed = now - this.formStart;
        const t = clamp(elapsed / 1400, 0, 1);
        this.x += this.vx;
        this.y += this.vy;
        this.vy -= 0.001;
        this.alpha = lerp(this.targetAlpha, 0, easeOutCubic(t));
        if (t >= 1) {
          this.mode = MODE.FADING;
          this.dead = true;
        }
      }

      const flicker = 0.75 + 0.25 * Math.sin(this.twinklePhase);
      this.size = this.baseSize * flicker;
    }
    draw(g) {
      if (this.alpha <= 0.01) return;
      const a = clamp(this.alpha, 0, 1);
      g.save();
      g.globalAlpha = a;
      const color = `hsla(${GOLD_HUES[2] + this.hueShift}, 92%, ${this.light}%, 1)`;
      if (Q.glow) {
        g.shadowBlur = Q.shadowBlur * (this.size / 2.2);
        g.shadowColor = color;
      }
      if (this.shape === SHAPE.DOT) {
        g.beginPath();
        g.fillStyle = color;
        g.arc(this.x, this.y, Math.max(this.size, 0.4), 0, Math.PI * 2);
        g.fill();
      } else if (this.shape === SHAPE.STAR) {
        drawStar(g, this.x, this.y, this.size * 1.8, color);
      } else if (this.shape === SHAPE.HEART) {
        drawMiniHeart(g, this.x, this.y, this.size * 1.6, color);
      }
      g.restore();
    }
  }

  function drawStar(g, x, y, r, color) {
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const ang = (Math.PI / 2) * i;
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
    }
    g.strokeStyle = color;
    g.lineWidth = Math.max(r * 0.12, 0.4);
    g.stroke();
  }

  function drawMiniHeart(g, x, y, s, color) {
    g.beginPath();
    g.fillStyle = color;
    g.moveTo(x, y + s * 0.3);
    g.bezierCurveTo(x - s, y - s * 0.6, x - s * 0.4, y - s * 1.2, x, y - s * 0.5);
    g.bezierCurveTo(x + s * 0.4, y - s * 1.2, x + s, y - s * 0.6, x, y + s * 0.3);
    g.fill();
  }

  function spawnParticle(x, y, opts) {
    if (particles.length >= Q.maxParticles + 120) return null;
    const p = new Particle(x, y, opts);
    particles.push(p);
    return p;
  }

  function ambientSpawnBudget() {
    return Q.maxParticles;
  }

  /* =========================================================
     GENERADORES DE FORMAS (puntos objetivo)
     ========================================================= */

  function heartPoints(cx, cy, scale, count) {
    const pts = [];
    for (let i = 0; i < count; i++) {
      const t = (i / count) * Math.PI * 2;
      let x = 16 * Math.pow(Math.sin(t), 3);
      let y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      // relleno leve: jitter radial hacia el interior para dar volumen
      const jitter = rand(0.72, 1.0);
      pts.push({ x: cx + x * scale * jitter, y: cy + y * scale * jitter });
    }
    return pts;
  }

  function sunflowerPoints(cx, cy, scale, count) {
    const pts = [];
    const petals = 13;
    for (let i = 0; i < count; i++) {
      if (i % 4 === 0) {
        // centro
        const r = rand(0, 1) * scale * 3.2;
        const a = rand(0, Math.PI * 2);
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
      } else {
        const petalIndex = randInt(0, petals - 1);
        const baseAng = (petalIndex / petals) * Math.PI * 2;
        const spread = rand(-0.12, 0.12);
        const rr = rand(3.4, 8.2) * scale;
        const ang = baseAng + spread;
        pts.push({
          x: cx + Math.cos(ang) * rr,
          y: cy + Math.sin(ang) * rr * 0.94
        });
      }
    }
    return pts;
  }

  /* =========================================================
     GIRASOLES DECORATIVOS (dibujados con canvas)
     ========================================================= */

  let sunflowerSprites = [];

  function spawnSunflowerSprite() {
    if (sunflowerSprites.length > 3) return;
    sunflowerSprites.push({
      x: rand(W * 0.12, W * 0.88),
      y: rand(H * 0.18, H * 0.78),
      scale: 0,
      targetScale: rand(0.55, 1.05),
      rot: rand(0, Math.PI * 2),
      rotSpeed: rand(0.0006, 0.0016) * (Math.random() < 0.5 ? -1 : 1),
      life: 0,
      maxLife: rand(5200, 8200),
      phase: 'in',
      lastEmit: 0
    });
  }

  function updateAndDrawSunflowers(dt, now) {
    for (let i = sunflowerSprites.length - 1; i >= 0; i--) {
      const s = sunflowerSprites[i];
      s.life += dt;
      s.rot += s.rotSpeed * dt;

      if (s.phase === 'in') {
        s.scale += (s.targetScale - s.scale) * 0.02;
        if (s.scale > s.targetScale * 0.96) s.phase = 'hold';
      } else if (s.phase === 'hold') {
        if (s.life > s.maxLife * 0.7) s.phase = 'out';
      } else if (s.phase === 'out') {
        s.scale += (0 - s.scale) * 0.02;
        if (s.scale < 0.02) {
          sunflowerSprites.splice(i, 1);
          continue;
        }
      }

      if (now - s.lastEmit > 260) {
        s.lastEmit = now;
        if (particles.length < ambientSpawnBudget()) {
          spawnParticle(s.x + rand(-8, 8), s.y + rand(-8, 8), {
            vx: rand(-0.1, 0.1), vy: rand(-0.35, -0.1),
            size: rand(0.8, 2), alpha: rand(0.3, 0.6)
          });
        }
      }

      drawSunflower(ctx, s.x, s.y, 26 * s.scale, s.rot, clamp(s.scale, 0, 1));
    }
  }

  function drawSunflower(g, x, y, r, rot, alpha) {
    if (alpha <= 0.02) return;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.globalAlpha = alpha * 0.9;
    const petals = 13;
    for (let i = 0; i < petals; i++) {
      const ang = (i / petals) * Math.PI * 2;
      g.save();
      g.rotate(ang);
      g.beginPath();
      const grad = g.createLinearGradient(0, -r * 0.35, 0, -r * 1.05);
      grad.addColorStop(0, 'rgba(255, 214, 120, 0.95)');
      grad.addColorStop(1, 'rgba(255, 170, 60, 0.15)');
      g.fillStyle = grad;
      g.ellipse(0, -r * 0.72, r * 0.24, r * 0.42, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.beginPath();
    const centerGrad = g.createRadialGradient(0, 0, 1, 0, 0, r * 0.34);
    centerGrad.addColorStop(0, 'rgba(120, 74, 22, 0.95)');
    centerGrad.addColorStop(1, 'rgba(80, 48, 14, 0.85)');
    g.fillStyle = centerGrad;
    g.arc(0, 0, r * 0.32, 0, Math.PI * 2);
    g.fill();
    if (Q.glow) {
      g.shadowBlur = 16;
      g.shadowColor = 'rgba(255, 200, 100, 0.5)';
    }
    g.restore();
  }

  /* =========================================================
     ONDAS DE TOQUE
     ========================================================= */

  let ripples = [];
  function spawnRipple(x, y) {
    ripples.push({ x, y, r: 2, alpha: 0.5, life: 0 });
  }
  function updateAndDrawRipples(dt) {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.life += dt;
      rp.r += dt * 0.12;
      rp.alpha -= dt * 0.0009;
      if (rp.alpha <= 0) { ripples.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = clamp(rp.alpha, 0, 1);
      ctx.strokeStyle = 'rgba(255, 210, 130, 0.8)';
      ctx.lineWidth = 1.2;
      if (Q.glow) { ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(255,200,110,0.6)'; }
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* =========================================================
     INTERACCIÓN DEL USUARIO
     ========================================================= */

  let holding = false;
  let pointerX = W / 2, pointerY = H / 2;
  let lastHoldEmit = 0;
  let experienceStarted = false;

  function burstAt(x, y, count, opts = {}) {
    const n = Math.min(count, Math.max(0, Q.maxParticles - particles.length));
    for (let i = 0; i < n; i++) {
      const ang = rand(0, Math.PI * 2);
      const speed = rand(0.4, opts.speed || 2.4);
      spawnParticle(x, y, {
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - rand(0, 0.4),
        size: rand(1, 3.4),
        alpha: rand(0.5, 0.95),
        shape: Math.random() < 0.06 ? SHAPE.STAR : (Math.random() < 0.04 ? SHAPE.HEART : SHAPE.DOT),
        maxLife: rand(2400, 5200)
      });
    }
  }

  function handlePointerDown(x, y) {
    holding = true;
    pointerX = x; pointerY = y;
    spawnRipple(x, y);
    burstAt(x, y, randInt(10, 18));
    if (Math.random() < 0.35) {
      burstAt(x, y, 1, { speed: 0.2 });
      const p = spawnParticle(x, y, { size: rand(2, 3.2), alpha: 0.8, shape: SHAPE.HEART, vx: rand(-0.2,0.2), vy: rand(-0.5,-0.2), maxLife: 3200 });
    }
  }
  function handlePointerMove(x, y) {
    pointerX = x; pointerY = y;
  }
  function handlePointerUp() {
    holding = false;
  }

  canvas.addEventListener('pointerdown', e => {
    if (!experienceStarted) return;
    handlePointerDown(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', e => {
    if (!experienceStarted) return;
    if (e.pressure > 0 || holding) handlePointerMove(e.clientX, e.clientY);
  });
  window.addEventListener('pointerup', handlePointerUp);
  window.addEventListener('pointercancel', handlePointerUp);

  /* =========================================================
     FRASES ROMÁNTICAS
     ========================================================= */

  const PHRASES = [
    'Cada flor amarilla me recuerda a ti.',
    'Gracias por llenar mis días de luz.',
    'Que nunca nos falten motivos para sonreír.',
    'Eres una de las cosas más bonitas que me ha regalado la vida.',
    'Te elegiría una y otra vez.'
  ];

  async function showPhrase(text, holdMs = 2600) {
    phraseEl.textContent = text;
    phraseEl.classList.add('visible');
    await wait(holdMs);
    phraseEl.classList.remove('visible');
    await wait(900);
  }

  /* =========================================================
     FORMACIONES
     ========================================================= */

  function gatherParticlesForFormation(count) {
    // reutiliza partículas libres existentes; crea nuevas si faltan
    const pool = particles.filter(p => p.mode === MODE.FREE);
    const chosen = [];
    for (let i = 0; i < count; i++) {
      if (pool[i]) {
        chosen.push(pool[i]);
      } else {
        const p = spawnParticle(rand(W * 0.3, W * 0.7), rand(H * 0.3, H * 0.7), {
          size: rand(1.2, 2.6), alpha: 0
        });
        if (p) chosen.push(p);
      }
    }
    return chosen;
  }

  async function formShape(points, opts = {}) {
    const chosen = gatherParticlesForFormation(points.length);
    const duration = opts.duration || 1500;
    chosen.forEach((p, i) => {
      const target = points[i % points.length];
      const delay = opts.stagger ? rand(0, opts.stagger) : 0;
      p.targetAlpha = opts.alpha !== undefined ? opts.alpha : rand(0.7, 1);
      p.setFormationTarget(target.x, target.y, delay, duration + rand(-150, 150));
    });
    await wait(duration + (opts.stagger || 0) + 300);
    return chosen;
  }

  async function releaseShape(chosen, staggerMs = 500) {
    chosen.forEach(p => {
      setTimeout(() => { if (!p.dead) p.release(); }, rand(0, staggerMs));
    });
    await wait(staggerMs + 1500);
  }

  /* =========================================================
     SECUENCIA PRINCIPAL
     ========================================================= */

  async function runSequence() {
    experienceStarted = true;

    // Fase 0: explosión suave desde el centro
    const cx = W / 2, cy = H / 2;
    burstAt(cx, cy, Math.min(60, Q.maxParticles * 0.4), { speed: 1.6 });
    await wait(900);

    // Fase 1: título
    overlayTitle.classList.add('visible');
    await wait(1600);

    // Fase 2: girasoles ambientales comienzan a aparecer
    const sunflowerInterval = setInterval(() => {
      if (Math.random() < 0.7) spawnSunflowerSprite();
    }, 2600);

    // Fase 3: frases románticas
    for (const phrase of PHRASES) {
      await showPhrase(phrase);
    }

    await wait(400);

    // Fase 4: formación — corazón pequeño
    let shape = heartPoints(cx, cy - H * 0.02, Math.min(W, H) * 0.011, 90);
    let chosen = await formShape(shape, { duration: 1700, stagger: 500, alpha: 0.85 });
    await wait(1800);
    await releaseShape(chosen, 700);

    // Fase 5: formación — girasol de partículas
    shape = sunflowerPoints(cx, cy, Math.min(W, H) * 0.012, 110);
    chosen = await formShape(shape, { duration: 1800, stagger: 600, alpha: 0.85 });
    await wait(2000);
    await releaseShape(chosen, 700);

    clearInterval(sunflowerInterval);
    // dejar que los girasoles restantes se disuelvan
    await wait(600);

    // Fase 6: corazón final — el más espectacular
    await buildFinalHeart(cx, cy);
  }

  async function buildFinalHeart(cx, cy) {
    const scale = Math.min(W, H) * 0.016;

    // pequeños puntos dorados dispersos convergiendo primero
    burstAt(cx, cy, Math.min(30, Q.maxParticles - particles.length), { speed: 0.6 });
    await wait(500);

    // contorno
    const outline = heartPoints(cx, cy, scale, 70);
    let chosenOutline = await formShape(outline, { duration: 1600, stagger: 500, alpha: 0.75 });
    await wait(500);

    // relleno denso
    const fillPts = [];
    const fillCount = Math.min(160, Q.maxParticles - 40);
    for (let i = 0; i < fillCount; i++) {
      const t = rand(0, Math.PI * 2);
      const rscale = Math.sqrt(rand(0, 1));
      let x = 16 * Math.pow(Math.sin(t), 3);
      let y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      fillPts.push({ x: cx + x * scale * rscale, y: cy + y * scale * rscale });
    }
    const chosenFill = await formShape(fillPts, { duration: 1900, stagger: 700, alpha: 0.95 });

    await wait(700);

    // mensaje final, solo cuando el corazón está casi terminado
    finalMessageEl.classList.add('visible');

    // partículas orbitando alrededor del corazón indefinidamente
    keepFinalAmbience(cx, cy, scale);

    await wait(3600);
    restartHintEl.classList.add('visible');
  }

  let finalAmbienceTimer = null;
  function keepFinalAmbience(cx, cy, scale) {
    if (finalAmbienceTimer) clearInterval(finalAmbienceTimer);
    finalAmbienceTimer = setInterval(() => {
      if (particles.length < Q.maxParticles) {
        const ang = rand(0, Math.PI * 2);
        const r = rand(scale * 9, scale * 16);
        spawnParticle(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.7, {
          size: rand(0.8, 2.2),
          alpha: rand(0.3, 0.7),
          shape: Math.random() < 0.15 ? SHAPE.STAR : SHAPE.DOT,
          vx: rand(-0.1, 0.1),
          vy: rand(-0.25, -0.05),
          maxLife: rand(3000, 6000)
        });
      }
    }, 320);
  }

  /* =========================================================
     REINICIO
     ========================================================= */

  function resetExperience() {
    particles = [];
    sunflowerSprites = [];
    ripples = [];
    if (finalAmbienceTimer) clearInterval(finalAmbienceTimer);
    overlayTitle.classList.remove('visible');
    phraseEl.classList.remove('visible');
    finalMessageEl.classList.remove('visible');
    restartHintEl.classList.remove('visible');
    experienceStarted = false;
  }

  restartHintEl.addEventListener('click', async () => {
    if (!restartHintEl.classList.contains('visible')) return;
    restartHintEl.classList.remove('visible');
    finalMessageEl.classList.remove('visible');
    await wait(1200);
    resetExperience();
    await wait(300);
    runSequence();
  });

  /* =========================================================
     PANTALLA INICIAL
     ========================================================= */

  function startExperience() {
    if (experienceStarted) return;
    introEl.classList.add('hidden');
    runSequence();
  }

  introEl.addEventListener('pointerdown', startExperience, { once: true });

  /* =========================================================
     BUCLE DE AMBIENTE (partículas libres de fondo)
     ========================================================= */

  let lastAmbientSpawn = 0;

  function maintainAmbientParticles(now) {
    if (!experienceStarted) return;
    const freeCount = particles.filter(p => p.mode === MODE.FREE).length;
    const budget = Math.floor(ambientSpawnBudget() * 0.55);
    if (freeCount < budget && now - lastAmbientSpawn > 90) {
      lastAmbientSpawn = now;
      const shapeRoll = Math.random();
      spawnParticle(rand(0, W), rand(H * 0.15, H), {
        size: rand(0.8, 2.8),
        alpha: rand(0.25, 0.75),
        shape: shapeRoll < 0.03 ? SHAPE.STAR : (shapeRoll < 0.05 ? SHAPE.HEART : SHAPE.DOT),
        vy: rand(-0.3, -0.05)
      });
    }
    if (holding && now - lastHoldEmit > 55) {
      lastHoldEmit = now;
      if (particles.length < Q.maxParticles) {
        spawnParticle(pointerX + rand(-10, 10), pointerY + rand(-10, 10), {
          size: rand(0.9, 2.4), alpha: rand(0.4, 0.8),
          vx: rand(-0.3, 0.3), vy: rand(-0.6, -0.1), maxLife: rand(1800, 3400)
        });
      }
    }
  }

  /* =========================================================
     RENDER LOOP
     ========================================================= */

  let lastFrame = performance.now();

  function frame(now) {
    const dt = Math.min(now - lastFrame, 48);
    lastFrame = now;

    // estela suave: en vez de limpiar totalmente, se pinta un rectángulo
    // translúcido para dejar un rastro luminoso sutil
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(5, 4, 10, ${Q.trailAlpha})`;
    ctx.fillRect(0, 0, W, H);

    maintainAmbientParticles(now);

    updateAndDrawSunflowers(dt, now);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.update(dt, now);
      p.draw(ctx);
      if (p.dead) particles.splice(i, 1);
    }

    updateAndDrawRipples(dt);

    requestAnimationFrame(frame);
  }

  // fondo inicial sólido antes de arrancar
  ctx.fillStyle = '#05040a';
  ctx.fillRect(0, 0, W, H);

  requestAnimationFrame(frame);

})();
