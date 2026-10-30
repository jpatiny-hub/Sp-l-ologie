'use strict';

/*
 * Fond animé « Galerie vivante » : les grottes des galeries de forage (caves.js) défilent lentement derrière l'interface
 * (refonte 16-bit, réservée au responsable). Un palier toutes les 14 s, de l'ossuaire au cœur prismatique, avec les mêmes décors,
 * animations, premier plan et lueurs que pendant le forage, et l'ambiance du forage en cours (graine de caves.js).
 * Figé si l'animation est réduite, en pause quand la page est cachée.
 */
(function (global) {
  const SCENE_MS = 14000;
  const DRIFT = 3; // pixels de décor par seconde : la caméra descend doucement dans le palier
  // Paliers montrés (on saute « Racines », juste sous la surface).
  const FIRST = 1;

  let canvas = null;
  let running = false;
  let calm = false;
  let started = 0;
  let raf = 0;
  let cave = null; // monde des grottes, construit pour une graine donnée

  /** Construit le monde des grottes avec l'ambiance actuelle de caves.js (sans toucher à la graine du forage). */
  function buildCave() {
    const { WIDTH: W, SKY, PPP, WORLD_H } = global.Pixel;
    const dims = { W, SKY, PPP, WORLD_H };
    const world = document.createElement('canvas');
    world.width = W;
    world.height = WORLD_H;
    const ctx = world.getContext('2d');
    const img = ctx.createImageData(W, WORLD_H);
    const set = (x, y, hex) => {
      if (x < 0 || x >= W || y < 0 || y >= WORLD_H) return;
      const n = parseInt(hex.slice(1), 16);
      const i = (y * W + x) * 4;
      img.data[i] = n >> 16;
      img.data[i + 1] = (n >> 8) & 255;
      img.data[i + 2] = n & 255;
      img.data[i + 3] = 255;
    };
    const built = global.Caves.build({ ...dims, set });
    for (let i = 0; i < built.alpha.length; i++) img.data[i * 4 + 3] = built.alpha[i];
    ctx.putImageData(img, 0, 0);
    return { seed: global.Caves.seed(), dims, world, anim: built.anim, back: global.Caves.backdrop(dims), front: global.Caves.foreground(dims) };
  }

  const tierCount = () => global.Caves.TIERS.length - FIRST;

  function frame(now) {
    raf = 0;
    if (!running || !canvas) return;
    if (!cave || cave.seed !== global.Caves.seed()) cave = buildCave();
    const { dims, world } = cave;
    const h = canvas.height;
    const el = Math.max(0, now - started);
    const time = calm ? 3 : el / 1000;
    const scene = Math.floor((calm ? 0 : el) / SCENE_MS);
    const tier = global.Caves.TIERS[FIRST + (scene % tierCount())];
    const since = calm ? 0 : (el % SCENE_MS) / 1000;
    // Toujours sous la surface (pas de ciel au-dessus de l'ossuaire).
    const cam = Math.max(dims.SKY + 4, Math.min(dims.WORLD_H - h, Math.round(dims.SKY + tier.from * dims.PPP - h / 3 + since * DRIFT)));
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = tier.dark;
    g.fillRect(0, 0, canvas.width, h);
    global.Caves.drawBack(g, cave.back, cam, h, dims);
    g.drawImage(world, 0, cam, dims.W, h, 0, 0, dims.W, h);
    global.Caves.drawAnim(g, cave.anim, time, cam, h, calm);
    global.Caves.drawFront(g, cave.front, cam, h, time);
    global.Caves.drawAir(g, dims, cam, h, time, calm);
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
      canvas.width = global.Pixel.WIDTH;
      canvas.height = global.Pixel.HEIGHT;
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
  /** Pour les captures et les essais : affiche directement le palier n (0 = ossuaire … 8 = cœur prismatique). */
  function showTier(n) {
    started = performance.now() - n * SCENE_MS - 2000;
  }

  global.Galerie = { setOn, showTier, get TIER_COUNT() { return tierCount(); } };
})(window);
