'use strict';

/*
 * Fond animé « Galerie vivante » : décor 16-bit en défilement lent derrière l'interface (galerie et lanternes, cristaux, cascade, contremaître).
 * Essai réservé au responsable (réglage betaGalerie) ; figé si l'animation est réduite, en pause quand la page est cachée.
 */
(function (global) {
  const SCENE_IDS = ['gallery', 'crystal', 'waterfall', 'foreman'];
  const SCENE_MS = 14000;
  let canvas = null;
  let running = false;
  let calm = false;
  let started = 0;
  let raf = 0;

  const W = 120, H = 240; // définition du décor, agrandi sans lissage
  const hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n = (n + (n << 3)) | 0; n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967296; };

  function rock(g, t, f, base, ceilY, floorY, tone, spikes) {
    // Un plan de roche : plafond et sol ondulés, avec stalactites. f = vitesse relative (parallaxe).
    const ox = Math.floor(t * 14 * f);
    for (let x = 0; x < W; x++) {
      const c = x + ox;
      const ce = ceilY + 6 * Math.sin(c * .07) + 3 * Math.sin(c * .19 + 1);
      const fl = floorY + 5 * Math.sin(c * .05 + 2) + 2 * Math.sin(c * .23);
      g.fillStyle = tone[0]; g.fillRect(x, 0, 1, ce);
      g.fillStyle = tone[1]; g.fillRect(x, ce, 1, 2);
      g.fillStyle = tone[0]; g.fillRect(x, fl, 1, H - fl);
      g.fillStyle = tone[1]; g.fillRect(x, fl, 1, 2);
      if (spikes && hash(c * 7 + base) < .07) { const L = 6 + Math.floor(hash(c + base) * 12); g.fillStyle = tone[0]; for (let k = 0; k < L; k++) g.fillRect(x, ce + k, 1, 1); }
    }
  }
  function beams(g, t, f, color, gap) {
    const ox = Math.floor(t * 14 * f);
    for (let x = -gap; x < W + gap; x += gap) {
      const px = x - (ox % gap);
      g.fillStyle = color; g.fillRect(px, 20, 5, H - 60); g.fillRect(px - 6, 18, 17, 6);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(px + 3, 24, 2, H - 64);
    }
  }
  function lantern(g, x, y, t, glow) {
    const fl = .75 + .25 * Math.sin(t * 7 + x) + .08 * Math.sin(t * 17 + x * 2);
    const sw = Math.round(Math.sin(t * 1.3 + x) * 1.5);
    const gr = g.createRadialGradient(x + sw, y + 4, 1, x + sw, y + 4, 34);
    gr.addColorStop(0, `rgba(255,170,60,${.55 * fl * glow})`); gr.addColorStop(1, 'rgba(255,170,60,0)');
    g.fillStyle = gr; g.fillRect(x - 36, y - 30, 74, 74);
    g.fillStyle = '#2a2a2a'; g.fillRect(x + sw, y - 10, 1, 10);
    g.fillStyle = '#3b3b3b'; g.fillRect(x + sw - 2, y, 5, 1); g.fillRect(x + sw - 2, y + 7, 5, 1);
    g.fillStyle = fl > .85 ? '#ffe08a' : '#ffb347'; g.fillRect(x + sw - 1, y + 1, 3, 6);
  }
  function crystals(g, t, f, palette, n, floorY) {
    const ox = Math.floor(t * 14 * f);
    for (let i = 0; i < n; i++) {
      const wx = i * 29 + Math.floor(hash(i) * 14);
      const px = ((wx - ox) % (n * 29) + n * 29) % (n * 29) - 20;
      if (px < -12 || px > W + 12) continue;
      const col = palette[Math.floor(hash(i + 9) * palette.length)];
      const hgt = 10 + Math.floor(hash(i + 3) * 18), up = hash(i + 5) < .6;
      const pulse = .6 + .4 * Math.sin(t * 2 + i * 1.7);
      const y0 = up ? floorY + 4 : 24;
      g.globalAlpha = .22 * pulse; g.fillStyle = col; g.fillRect(px - 8, y0 - (up ? hgt + 8 : -8) , 20, hgt + 8); g.globalAlpha = 1;
      g.fillStyle = col;
      for (let k = 0; k < hgt; k++) { const w = Math.max(1, 5 - Math.floor(k * 5 / hgt)); const yy = up ? y0 - k : y0 + k; g.fillRect(px - Math.floor(w / 2), yy, w, 1); }
      g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(px - 1, up ? y0 - hgt + 2 : y0 + hgt - 3, 1, 3);
    }
  }
  function fireflies(g, t, n, color) {
    for (let i = 0; i < n; i++) {
      const x = (hash(i) * W + Math.sin(t * .6 + i * 3) * 10 + t * 2 * (hash(i + 1) - .3)) % W;
      const y = 60 + hash(i + 2) * 120 + Math.cos(t * .7 + i * 2) * 8;
      const a = .5 + .5 * Math.sin(t * 2.4 + i * 4);
      g.fillStyle = color; g.globalAlpha = a; g.fillRect(Math.floor((x + W) % W), Math.floor(y), 1, 1);
      g.globalAlpha = a * .3; g.fillRect(Math.floor((x + W) % W) - 1, Math.floor(y), 3, 1); g.fillRect(Math.floor((x + W) % W), Math.floor(y) - 1, 1, 3); g.globalAlpha = 1;
    }
  }
  function waterfall(g, t, x0, w) {
    for (let x = 0; x < w; x++) for (let k = 0; k < 9; k++) {
      const sp = 40 + hash(x * 9 + k) * 40, y = ((t * sp + hash(x + k * 31) * H) % (H - 70)) + 20;
      g.fillStyle = hash(x * 3 + k) < .3 ? '#d8f4ff' : '#6fc3e6'; g.fillRect(x0 + x, Math.floor(y), 1, 5);
    }
    g.fillStyle = 'rgba(190,235,255,.28)';
    for (let i = 0; i < 14; i++) g.fillRect(x0 - 8 + Math.floor(hash(i) * (w + 16)), H - 62 - Math.floor(((t * 14 + i * 7) % 18)), 3, 2);
  }
  function foreman(g, t, x, y) {
    // Contremaître vu de dos, lampe allumée, tenant sa lanterne.
    const bob = Math.round(Math.sin(t * 1.5) * .6);
    g.fillStyle = '#0b0b0d'; g.fillRect(x - 6, y - 24 + bob, 12, 24); g.fillRect(x - 7, y - 20 + bob, 3, 12);
    g.fillStyle = '#ffd23a'; g.fillRect(x - 6, y - 30 + bob, 12, 6); g.fillRect(x - 8, y - 25 + bob, 16, 2);
    g.fillStyle = '#fff6c0'; g.fillRect(x + 6, y - 28 + bob, 2, 2);
    const gr = g.createLinearGradient(x + 8, 0, x + 60, 0);
    g.save(); g.globalAlpha = .22 + .05 * Math.sin(t * 4); g.fillStyle = '#ffe9a0'; g.beginPath(); g.moveTo(x + 8, y - 27 + bob); g.lineTo(x + 70, y - 55); g.lineTo(x + 70, y + 2); g.closePath(); g.fill(); g.restore();
    g.fillStyle = '#2a2a2a'; g.fillRect(x + 9, y - 14 + bob, 4, 5); g.fillStyle = '#ffb347'; g.fillRect(x + 10, y - 13 + bob, 2, 3);
  }

  const SCENES = {
    gallery: (g, t) => {
      g.fillStyle = '#17120e'; g.fillRect(0, 0, W, H);
      rock(g, t, .25, 1, 30, 150, ['#241b14', '#33261b'], true);
      beams(g, t, .55, '#4a3322', 56);
      lantern(g, 20, 40, t, 1); lantern(g, 80, 40, t + 2, 1);
      rock(g, t, 1, 2, 12, 178, ['#120e0b', '#1d1610'], true);
      // rails au sol
      g.fillStyle = '#6a6a70'; g.fillRect(0, 205, W, 2); g.fillStyle = '#3a2a1a'; const ox = Math.floor(t * 14);
      for (let x = -ox % 10; x < W; x += 10) g.fillRect(x, 207, 3, 3);
      fireflies(g, t, 8, '#ffcf70');
    },
    crystal: (g, t) => {
      g.fillStyle = '#0d0a1c'; g.fillRect(0, 0, W, H);
      rock(g, t, .2, 3, 24, 160, ['#171230', '#241c47'], true);
      crystals(g, t, .35, ['#c25bff', '#5be0ff', '#7dff9b'], 6, 130);
      rock(g, t, .8, 4, 10, 190, ['#0c0919', '#150f2c'], true);
      crystals(g, t, 1, ['#ff5ba8', '#5bb0ff', '#c8ff5b', '#c25bff'], 6, 186);
      fireflies(g, t, 12, '#9fffe0');
    },
    waterfall: (g, t) => {
      g.fillStyle = '#08141c'; g.fillRect(0, 0, W, H);
      rock(g, t * .5, .2, 5, 28, 170, ['#0f2431', '#183645'], true);
      g.fillStyle = '#18506b'; g.fillRect(34, 0, 46, H - 52);
      waterfall(g, t, 40, 34);
      rock(g, t * .3, .5, 6, 10, 196, ['#07101a', '#0e1e2b'], true);
      g.fillStyle = '#2f89b0'; g.fillRect(0, 196, W, 44);
      g.fillStyle = '#8fdcf5'; for (let x = 0; x < W; x += 6) g.fillRect(x + Math.floor(Math.sin(t * 2 + x) * 2), 198 + (x % 12 ? 3 : 0), 3, 1);
      fireflies(g, t, 8, '#bfeaff');
    },
    foreman: (g, t) => {
      g.fillStyle = '#121216'; g.fillRect(0, 0, W, H);
      rock(g, t, .15, 7, 30, 150, ['#1d1d23', '#2a2a32'], true);
      beams(g, t, .4, '#3a3a40', 70);
      lantern(g, 98, 46, t, .8);
      rock(g, t, .6, 8, 12, 176, ['#0e0e12', '#18181e'], true);
      foreman(g, t, 40, 190 - 0);
      g.fillStyle = '#26262c'; g.fillRect(0, 190, W, 50);
      fireflies(g, t, 6, '#ffd890');
    },
  };

  function frame(now) {
    raf = 0;
    if (!running || !canvas) return;
    const g = canvas.getContext('2d');
    const el = Math.max(0, now - started);
    const t = calm ? 3 : el / 1000;
    const scene = SCENE_IDS[Math.floor((calm ? 0 : el) / SCENE_MS) % SCENE_IDS.length];
    g.clearRect(0, 0, W, H);
    SCENES[scene](g, t);
    if (!calm && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (running && !raf) raf = requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', kick);

  /** Active ou coupe le fond ; `reduced` fige le décor sur une image fixe. */
  function setOn(on, reduced) {
    calm = !!reduced;
    if (on && !canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'galerie-bg';
      canvas.width = W;
      canvas.height = H;
      canvas.setAttribute('aria-hidden', 'true');
      document.body.prepend(canvas);
    }
    if (canvas) canvas.hidden = !on;
    if (on && !running) started = performance.now();
    running = !!on;
    if (running) {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    }
  }

  global.Galerie = { setOn };
})(window);
