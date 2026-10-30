'use strict';

/*
 * Galeries 16-bit (essai réservé au responsable) : sous la surface, une suite de grottes mystérieuses, un palier par thème de couleur.
 * En haut, ossements et fossiles ; plus bas, une mine oubliée puis des gemmes de plus en plus rares ; tout au fond, un temple englouti
 * et un cœur prismatique. `build` peint le décor fixe dans le monde (une fois) ; `drawAnim` anime cascades, lucioles, lanternes,
 * méduses et cristaux flottants à chaque image.
 */
(function (global) {
  // Paliers (en points de score, comme les couches géologiques). rock : 5 teintes de la roche, de la plus sombre à la plus claire ;
  // back : 3 teintes du fond des grottes ; dark : intérieur du puits.
  const TIERS = [
    { from: 0, name: 'Racines', dark: '#140b05', rock: ['#24160c', '#3b2414', '#4a2f1a', '#5a3a20', '#6b4627'], back: ['#0e0804', '#160e07', '#1f140a'] },
    { from: 6, name: "L'ossuaire", dark: '#22150b', rock: ['#3a2614', '#5c3d22', '#7d5630', '#9c7040', '#b98b55'], back: ['#140c06', '#1d130a', '#28190e'] },
    { from: 30, name: 'Grotte aux fossiles', dark: '#151a22', rock: ['#2a3340', '#3e4a5a', '#566577', '#71819a', '#93a3b8'], back: ['#0b0f15', '#11171f', '#18202a'] },
    { from: 55, name: 'Galeries oubliées', dark: '#060608', rock: ['#0d0d10', '#17171c', '#22222a', '#30303a', '#454552'], back: ['#050506', '#09090b', '#0f0f12'] },
    { from: 80, name: "Caverne d'améthyste", dark: '#160c20', rock: ['#241632', '#382350', '#4f3470', '#6a4a8c', '#8a6aa8'], back: ['#0c0614', '#130a1e', '#1b1028'] },
    { from: 140, name: "Jardin d'émeraudes", dark: '#081814', rock: ['#0d2420', '#163a32', '#215246', '#2f6b5a', '#4a8a70'], back: ['#040e0b', '#081612', '#0c1f19'] },
    { from: 230, name: 'Lac de saphir', dark: '#081028', rock: ['#0d1838', '#142554', '#1e3670', '#2c4c90', '#4468b0'], back: ['#040818', '#070d22', '#0a142e'] },
    { from: 320, name: 'Forge des rubis', dark: '#220606', rock: ['#1a0a0a', '#2e1010', '#4a1616', '#6a2020', '#8c3028'], back: ['#0c0303', '#140606', '#1e0909'] },
    { from: 430, name: 'Temple englouti', dark: '#16140c', rock: ['#2a2414', '#4a3e22', '#6a5a32', '#8c7a48', '#b09c62'], back: ['#0a1010', '#0f1818', '#152121'] },
    { from: 520, name: 'Cœur prismatique', dark: '#10081c', rock: ['#1a0f2e', '#2a1a48', '#3e2a66', '#5a4088', '#7c60aa'], back: ['#04020a', '#080512', '#0d091b'] },
  ];
  // Cœur prismatique : la roche change de reflet par bandes.
  const PRISM_ROCKS = [
    TIERS[9].rock,
    ['#0c2228', '#123a44', '#1c5660', '#2a7a84', '#48a0a8'],
    ['#2a0c26', '#44143e', '#661e5a', '#8a2c78', '#b04a9a'],
  ];
  // Stalactites et stalagmites : probabilité par palier.
  const STAL = [0, 0.05, 0.2, 0.05, 0.1, 0.14, 0.12, 0.12, 0, 0];

  const GEMS = {
    amethyst: { o: '#1a0b26', l: '#d2acf5', m: '#9b59d6', d: '#5e2e8c', t: '#f8efff' },
    rose: { o: '#26101a', l: '#ffc4dc', m: '#f08ab4', d: '#a8486e', t: '#fff4f8' },
    emerald: { o: '#04140d', l: '#86f2ae', m: '#2fbf6a', d: '#147a44', t: '#ecfff2' },
    sapphire: { o: '#040a1c', l: '#92c8ff', m: '#3a7ae8', d: '#1c3e9a', t: '#eef6ff' },
    ruby: { o: '#1c0204', l: '#ff96a4', m: '#e0283c', d: '#8a0e1e', t: '#fff2f4' },
    obsidian: { o: '#000000', l: '#6a5a8a', m: '#241c34', d: '#0c0a12', t: '#c8b8ff' },
    topaz: { o: '#1c1004', l: '#ffe28e', m: '#f0a830', d: '#a0601a', t: '#fffbec' },
  };
  GEMS.ice = { o: '#06121c', l: '#dcf6ff', m: '#8ed0f0', d: '#3a7ab0', t: '#ffffff' };
  // Couleur de l'air (brume, lueurs, arrière-plan) et gemme des grands cristaux du premier plan, par palier.
  const AIR = ['#3a2412', '#6a4420', '#2a5a8a', '#5a3e1a', '#5a2ca0', '#12705a', '#1a4cb8', '#a02c12', '#1e6a60', '#5a24a0'];
  const RAINBOW = [GEMS.ruby, GEMS.topaz, GEMS.emerald, GEMS.sapphire, GEMS.amethyst, GEMS.rose];
  const rgbOf = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  // ---------- Variantes : chaque palier a plusieurs ambiances, tirées au sort pour chaque forage ----------
  /** Couleur HSL (h en degrés, s et l entre 0 et 1) → « #rrggbb ». */
  function hsl(h, sat, l) {
    const k = (n) => (n + h / 30) % 12;
    const a = sat * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * Math.max(0, Math.min(1, l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))));
    return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  /** Palette 16 bits à partir d'une teinte : les ombres virent vers le bleu, les lumières vers le jaune. */
  function paletteFrom(h, sat, lift = 1) {
    const shade = (k) => h + (k - 2) * -8;
    return {
      rock: [0.12, 0.2, 0.3, 0.42, 0.55].map((l, k) => hsl(shade(k), sat, Math.min(0.85, l * lift))),
      back: [0.05, 0.075, 0.1].map((l) => hsl(h - 14, sat * 0.8, l * lift)),
      dark: hsl(h - 10, sat * 0.7, 0.07 * lift),
      air: hsl(h, Math.min(1, sat * 1.4), 0.3 * Math.min(1.3, lift)),
    };
  }
  /** Gemme générée à partir d'une teinte (quand aucune gemme nommée ne convient). */
  const hueGem = (h) => ({ o: hsl(h, 0.6, 0.06), l: hsl(h + 10, 0.85, 0.78), m: hsl(h, 0.75, 0.52), d: hsl(h - 10, 0.7, 0.3), t: hsl(h + 20, 1, 0.95) });
  const gemOf = (spec) => (typeof spec === 'number' ? hueGem(spec) : GEMS[spec]);
  // Variante 0 : l'ambiance d'origine. gems : [principale, secondaire] (nom de GEMS ou teinte).
  const BASE_GEMS = [[null, null], [null, null], ['ice', 'ice'], ['topaz', 'topaz'], ['amethyst', 'rose'], ['emerald', 'emerald'], ['sapphire', 'sapphire'], ['ruby', 'obsidian'], ['topaz', 'topaz'], ['rainbow', 'rainbow']];
  const VARIANTS = [
    [],
    [{ name: 'Les catacombes', h: 215, s: 0.12 }, { name: 'Le cimetière englouti', h: 105, s: 0.22 }],
    [{ name: 'Grotte de calcite', h: 40, s: 0.25, lift: 1.25, gems: ['topaz', 'topaz'] }, { name: 'Grotte des glaces', h: 192, s: 0.38, lift: 1.25 }],
    [{ name: 'Mine de cuivre', h: 165, s: 0.25, gems: [170, 170] }, { name: 'Mine de sel', h: 345, s: 0.18, lift: 1.5, gems: [350, 350] }],
    [{ name: 'Caverne de citrine', h: 36, s: 0.45, gems: ['topaz', 28] }, { name: 'Grotte de glace', h: 205, s: 0.35, lift: 1.2, gems: ['ice', 'sapphire'] }],
    [{ name: 'Forêt de champignons', h: 300, s: 0.35, gems: [290, 320] }, { name: 'Jardin de jade', h: 140, s: 0.2, lift: 1.2, gems: [140, 140] }],
    [{ name: 'Lagon turquoise', h: 178, s: 0.55, gems: [176, 176] }, { name: 'Mer des perles', h: 225, s: 0.15, lift: 1.2, gems: [230, 'ice'] }],
    [{ name: "Forge d'ambre", h: 28, s: 0.6, gems: ['topaz', 24] }, { name: "Cœur d'obsidienne", h: 275, s: 0.25, gems: [280, 'obsidian'] }],
    [{ name: 'Temple de jade', h: 150, s: 0.3, gems: ['emerald', 'emerald'] }, { name: "Cité d'or", h: 45, s: 0.55, lift: 1.1, gems: ['topaz', 'topaz'] }],
    [{ name: 'Cœur stellaire', h: 230, s: 0.5 }, { name: 'Cœur solaire', h: 32, s: 0.6 }],
  ];
  // Sol de surface selon le paysage (voir pixel.js).
  const SOILS = { sable: { name: 'Sable des dunes', h: 40, s: 0.4, lift: 1.5 }, eboulis: { name: 'Éboulis', h: 210, s: 0.08, lift: 1.2 } };
  const BASE = TIERS.map((t, i) => ({ name: t.name, rock: t.rock.slice(), back: t.back.slice(), dark: t.dark, air: AIR[i], gems: BASE_GEMS[i] }));
  const AIR_RGB = AIR.map(rgbOf);
  const GEM_A = BASE_GEMS.map((g) => g[0]);
  const GEM_B = BASE_GEMS.map((g) => g[1]);
  const gemA = (t) => gemOf(GEM_A[t]);
  const gemB = (t) => gemOf(GEM_B[t]);

  /**
   * Choisit l'ambiance de chaque palier pour un forage : seed (entier, 0 = ambiances d'origine) et soil (sol de surface
   * imposé par le paysage, ou null). Les mêmes valeurs redonnent toujours le même décor.
   */
  function setSeed(seed, soil) {
    // Brassage de la graine : deux forages voisins (identifiants qui se suivent) donnent des décors sans rapport.
    let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    SEED = seed ? (h ^ (h >>> 16)) & 0xfffffff : 0;
    TIERS.forEach((tier, t) => {
      const options = VARIANTS[t];
      let v = BASE[t];
      const pickIndex = SEED ? Math.floor(hash(t, 1, 4242) * (options.length + 1)) : 0;
      const spec = t === 0 && soil && SOILS[soil] ? SOILS[soil] : pickIndex ? options[pickIndex - 1] : null;
      if (spec) v = { name: spec.name, ...paletteFrom(spec.h, spec.s, spec.lift), gems: spec.gems || BASE_GEMS[t] };
      tier.name = v.name;
      tier.rock = v.rock;
      tier.back = v.back;
      tier.dark = v.dark;
      AIR_RGB[t] = rgbOf(v.air);
      GEM_A[t] = v.gems[0];
      GEM_B[t] = v.gems[1];
    });
    PRISM_ROCKS[0] = TIERS[9].rock;
  }

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bay = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
  /** Tramage ordonné : la valeur v (0 → 1) devient l'un des n niveaux, avec le motif en damier typique des consoles 16 bits. */
  const level = (v, n, x, y) => Math.max(0, Math.min(n - 1, Math.floor(v * (n - 1) + bay(x, y))));

  // Graine de l'exploration en cours : chaque forage a ses propres palettes, contours de grottes et trouvailles.
  let SEED = 0;
  function hash(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 1 + SEED * 7919, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function vnoise(x, y, s, cell) {
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    const fx = x / cell - gx;
    const fy = y / cell - gy;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = hash(gx, gy, s);
    const b = hash(gx + 1, gy, s);
    const c = hash(gx, gy + 1, s);
    const d = hash(gx + 1, gy + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const fbm = (x, y, s) => vnoise(x, y, s, 14) * 0.55 + vnoise(x, y, s + 1, 6) * 0.3 + vnoise(x, y, s + 2, 2.5) * 0.15;

  function tierIndex(points) {
    let t = 0;
    for (let i = 0; i < TIERS.length; i++) if (points >= TIERS[i].from) t = i;
    return t;
  }

  // ---------- Petits motifs ----------
  const SKULL = ['.#####.', '#######', '#kk#kk#', '#kk#kk#', '.##k##.', '.#.#.#.'];
  const SKELETON = ['.##............', '#..#.#.#.#.....', '#..##########..', '.##..#.#.#.#.##', '.............#.#'];
  const RIBS = ['#.#####.#', '.#.###.#.', '#.#####.#', '.#.###.#.', '..#####..'];
  const LONGBONE = ['##.........##', '.###########.', '##.........##'];
  const BONE = ['##...##', '.#####.', '##...##'];
  const AMMONITE = ['..####.', '.#....#', '#..##.#', '#.#..##', '#.#.#..', '.#..#..', '..##...'];
  const TRILOBITE = ['.###.', '#####', '.#.#.', '#####', '.#.#.', '#####', '..#..'];
  const FISH = ['...#.#.#.#....#', '.##########..##', '#k#.#.#.#.#####', '.##########..##', '...#.#.#.#....#'];
  const COBWEB = ['#.#.#', '.###.', '##.##', '.#.#.', '#...#'];
  const LANTERN = ['.o.', 'ooo', 'oyo', 'oyo', 'ooo'];
  const CART = ['.bobobob.', 'ggggggggg', 'gGGGGGGGg', 'ggggggggg', '.w.....w.'];
  const PICKAXE = ['.hhh.', 'h.b.h', '..b..', '..b..', '..b..'];
  const CANDLE = ['f', 'w', 'w', 'w'];
  const MUSH = ['.ccc.', 'ccscc', 'csccc', '..t..', '..t..'];
  const MUSH_S = ['.cc.', 'cscc', '.t..'];
  const IDOL = [
    '...########...',
    '.############.',
    '##############',
    '###ee####ee###',
    '###ee####ee###',
    '##############',
    '######..######',
    '#####....#####',
    '##############',
    '###.######.###',
    '###..####..###',
    '####......####',
    '##############',
    '.############.',
  ];
  const GLYPHS = [
    ['###', '#.#', '###'],
    ['.#.', '###', '.#.'],
    ['#.#', '.#.', '#.#'],
    ['##.', '#..', '###'],
    ['#.#', '###', '..#'],
  ];
  const JELLY = ['.ppp.', 'pwppp', 'ppppp', 'p.p.p', '.p.p.', 'p...p'];
  const COINS = ['...y...', '..yYy..', '.yYyYy.', 'yYyYyYy'];

  /** Remplace chaque « # » par une teinte claire, moyenne ou sombre selon ses voisins (lumière venant d'en haut à gauche). */
  function shaded(rows) {
    const on = (x, y) => y >= 0 && y < rows.length && rows[y][x] !== undefined && rows[y][x] !== '.';
    return rows.map((row, y) => [...row].map((ch, x) => {
      if (ch !== '#') return ch;
      if (!on(x, y - 1) || !on(x - 1, y)) return 'l';
      if (!on(x, y + 1) || !on(x + 1, y)) return 'd';
      return 'm';
    }).join(''));
  }

  function build({ W, SKY, PPP, WORLD_H, set: put }) {
    const H = WORLD_H;
    const at = (d) => SKY + d;
    const open = new Uint8Array(W * H); // 1 = vide (grotte)
    const isOpen = (x, y) => x >= 0 && x < W && y >= 0 && y < H && open[y * W + x] === 1;
    const anim = [];
    // Pixels de décor (posés après la roche) : ils restent opaques ; le reste du vide laisse voir l'arrière-plan lointain.
    const deco = new Uint8Array(W * WORLD_H);
    let decoOn = false;
    const set = (x, y, color) => {
      if (decoOn && x >= 0 && x < W && y >= 0 && y < WORLD_H) deco[y * W + x] = 1;
      put(x, y, color);
    };

    // ---------- Creusement des grottes ----------
    function carve(cx, cd, rx, ry, rough = 0.3) {
      const cy = at(cd);
      for (let y = cy - ry - 3; y <= cy + ry + 3; y++) {
        for (let x = cx - rx - 3; x <= cx + rx + 3; x++) {
          if (x < 0 || x >= W || y <= SKY + 3 || y >= H) continue;
          const r = Math.hypot((x - cx) / rx, (y - cy) / ry);
          if (r <= 1 + (vnoise(x, y, 5, 5) - 0.5) * rough) open[y * W + x] = 1;
        }
      }
    }
    function carveRect(x0, d0, x1, d1) {
      for (let y = at(d0); y <= at(d1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) open[y * W + x] = 1;
    }
    function fill(x0, d0, x1, d1) {
      for (let y = at(d0); y <= at(d1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) open[y * W + x] = 0;
    }
    /** Niche voûtée (catacombes) : rectangle surmonté d'un demi-cercle. */
    function carveArch(x0, d0, w, h) {
      const r = (w - 1) / 2;
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const top = dy < r && Math.hypot(dx - r, dy - r) > r + 0.3;
          if (!top) open[at(d0 + dy) * W + x0 + dx] = 1;
        }
      }
    }

    // Ossuaire : catacombes à niches et salle funéraire.
    for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) carveArch(6 + i * 10, 20 + row * 13, 7, 9);
    carve(126, 36, 24, 11, 0.3);
    // Plus on descend, plus les salles sont grandes : la foreuse traverse de vastes cavernes ouvertes sur les lointains.
    // Grotte aux fossiles : salle basse avec un lac.
    carve(80, 86, 74, 17, 0.3);
    carve(40, 100, 30, 4, 0.2);
    // Galeries oubliées : deux galeries de mine étayées qui rejoignent le puits.
    carveRect(4, 138, 72, 152);
    carveRect(88, 118, 156, 133);
    // Caverne d'améthyste : géode géante.
    carve(80, 220, 72, 50, 0.25);
    // Jardin d'émeraudes : très haute salle avec cascade et étang.
    carve(80, 370, 72, 76, 0.25);
    carve(42, 434, 28, 5, 0.2);
    // Lac de saphir : mer souterraine traversée par le puits.
    carve(80, 550, 74, 72, 0.25);
    // Forge des rubis : cathédrale de basalte, lac de lave.
    carve(80, 752, 72, 90, 0.25);
    carve(38, 826, 26, 5, 0.2);
    // Temple englouti : grande salle hypostyle au sol plat.
    carve(80, 950, 74, 72, 0.12);
    fill(0, 1010, W - 1, 1030);
    // Cœur prismatique : immense vide étoilé.
    carve(80, 1124, 74, 66, 0.25);
    fill(0, 1188, W - 1, 1228 - 1);
    // Poches creusées au hasard dans la roche : chaque forage croise d'autres trouvailles.
    const pockets = [];
    for (let t = 1; t < TIERS.length; t++) {
      const top = TIERS[t].from * PPP + 8;
      const bottom = (t + 1 < TIERS.length ? TIERS[t + 1].from * PPP : 1186) - 8;
      const want = 1 + Math.floor(hash(t, 2, 4300) * 3);
      for (let k = 0, tries = 0; k < want && tries < 24; tries++) {
        const rx = 6 + Math.floor(hash(t, tries, 4301) * 5);
        const ry = 4 + Math.floor(hash(t, tries, 4302) * 3);
        const cx = rx + 2 + Math.floor(hash(t, tries, 4303) * (W - 2 * rx - 4));
        const cd = top + ry + Math.floor(hash(t, tries, 4304) * Math.max(1, bottom - top - 2 * ry));
        if (Math.abs(cx - 80) < rx + 14 || cd - ry < top - 8 || cd + ry > bottom + 8) continue;
        let clear = true;
        for (let y = at(cd) - ry - 4; y <= at(cd) + ry + 4 && clear; y++) for (let x = cx - rx - 4; x <= cx + rx + 4; x++) if (isOpen(x, y)) clear = false;
        if (!clear) continue;
        carve(cx, cd, rx, ry, 0.3);
        pockets.push({ t, cx, cd, roll: hash(t, tries, 4305) });
        k++;
      }
    }

    // ---------- Stalactites et stalagmites (font partie de la roche) ----------
    const tierAtD = (x, d) => {
      for (let t = TIERS.length - 1; t > 0; t--) {
        const edge = TIERS[t].from * PPP + Math.round(Math.sin(x * 0.17 + t * 2.1) * 1.5 + Math.sin(x * 0.05 + t) * 2) + (bay(x, d) - 0.5) * 3;
        if (d >= edge) return t;
      }
      return 0;
    };
    for (let y = SKY + 2; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const t = tierAtD(x, y - SKY);
        const p = STAL[t];
        if (!p) continue;
        if (!isOpen(x, y) && isOpen(x, y + 1) && hash(x, y, 300) < p) {
          const len = 2 + Math.floor(hash(x, y, 301) * 6);
          for (let k = 1; k <= len && isOpen(x, y + k); k++) open[(y + k) * W + x] = 0;
          for (let k = 1; k <= len >> 1 && isOpen(x + 1, y + k); k++) open[(y + k) * W + x + 1] = 0;
        } else if (!isOpen(x, y) && isOpen(x, y - 1) && hash(x, y, 302) < p * 0.5) {
          const len = 1 + Math.floor(hash(x, y, 303) * 4);
          for (let k = 1; k <= len && isOpen(x, y - k); k++) open[(y - k) * W + x] = 0;
        }
      }
    }

    // ---------- Peinture de la roche et du fond des grottes ----------
    function rockValue(t, x, d) {
      const n = fbm(x, d, t * 7);
      switch (t) {
        case 1: return 0.55 * n + 0.45 * (0.5 + 0.5 * Math.sin((d + 3 * Math.sin(x * 0.08)) * 0.45));
        case 2: {
          const bed = Math.floor(d / 8);
          if (d % 8 === 0 || (x + Math.floor(hash(bed, 0, 92) * 40)) % (16 + Math.floor(hash(bed, 1, 92) * 16)) === 0) return 0.05;
          return 0.3 + 0.45 * n + (bed % 2) * 0.1;
        }
        case 4: return 0.65 * n + 0.35 * hash(x, d, 44);
        case 6: return 0.5 * n + 0.5 * (0.5 + 0.5 * Math.sin(d * 0.18 + Math.sin(x * 0.07) * 2));
        case 8: {
          if (vnoise(x, d, 90, 10) < 0.33) return n * 0.8;
          const row = Math.floor(d / 6);
          const bx = (x + (row % 2) * 6) % 12;
          if (d % 6 === 0 || bx === 0) return 0.02;
          return 0.35 + 0.35 * n + hash(Math.floor((x + (row % 2) * 6) / 12), row, 91) * 0.25;
        }
        default: return n;
      }
    }
    function rockSpecial(t, x, d) {
      const n = hash(x, d, 400 + t);
      if (t === 3 && n > 0.985) return '#8a8fa0';
      if (t === 3 && n < 0.006) return '#e9c046';
      if (t === 5 && vnoise(x, d, 78, 12) > 0.55 && Math.abs(Math.sin(x * 0.15 + d * 0.07 + fbm(x, d, 77) * 6)) < 0.04) return '#4fc884';
      if (t === 7) {
        const crack = Math.abs(vnoise(x, d, 79, 11) * 0.7 + vnoise(x, d, 80, 4) * 0.3 - 0.5);
        if (crack < 0.012) return '#ff6a2a';
        if (crack < 0.03) return '#b8341c';
      }
      if (t === 9 && n > 0.993) return '#ffffff';
      if (t === 1 && n > 0.996) return '#e6dcc4';
      return null;
    }
    const rocksOf = (t, x, d) => (t === 9 ? PRISM_ROCKS[((Math.floor((x + d * 0.5 + Math.sin(d * 0.05) * 10) / 26) % 3) + 3) % 3] : TIERS[t].rock);

    for (let y = SKY + 1; y < H; y++) {
      const d = y - SKY;
      for (let x = 0; x < W; x++) {
        const t = tierAtD(x, d);
        const tier = TIERS[t];
        if (isOpen(x, y)) {
          // Fond de grotte : plus sombre au contact de la roche (ombre portée).
          const back = [...tier.back, rocksOf(t, x, d)[0]];
          let lv = level(fbm(x, d, 200 + t) * 0.75 + vnoise(x, d, 210 + t, 3) * 0.25, 4, x, y);
          if (!isOpen(x, y - 1) || !isOpen(x, y - 2) || !isOpen(x, y + 1)) lv = 0;
          else if (!isOpen(x - 1, y) || !isOpen(x + 1, y)) lv = Math.min(lv, 1);
          set(x, y, back[lv]);
          continue;
        }
        const rock = rocksOf(t, x, d);
        const special = rockSpecial(t, x, d);
        let lv = level(rockValue(t, x, d), 5, x, y);
        // Arêtes : dessus éclairé, dessous dans l'ombre, flancs selon la lumière (venant d'en haut à gauche).
        if (isOpen(x, y - 1)) lv = 4;
        else if (isOpen(x, y - 2)) lv = Math.max(lv, 3);
        else if (isOpen(x, y + 1)) lv = 0;
        else if (isOpen(x - 1, y)) lv = Math.max(lv, 3);
        else if (isOpen(x + 1, y)) lv = Math.min(lv, 1);
        set(x, y, special && lv > 0 && lv < 4 ? special : rock[lv]);
      }
    }

    // ---------- Outils de décor ----------
    decoOn = true;
    function sprite(rows, x0, y0, pal, outline) {
      const on = (dx, dy) => dy >= 0 && dy < rows.length && dx >= 0 && dx < rows[dy].length && rows[dy][dx] !== '.';
      if (outline) {
        const w = Math.max(...rows.map((r) => r.length));
        for (let dy = -1; dy <= rows.length; dy++) {
          for (let dx = -1; dx <= w; dx++) {
            if (!on(dx, dy) && (on(dx - 1, dy) || on(dx + 1, dy) || on(dx, dy - 1) || on(dx, dy + 1))) set(x0 + dx, y0 + dy, outline);
          }
        }
      }
      rows.forEach((row, dy) => [...row].forEach((ch, dx) => {
        if (ch !== '.' && pal[ch]) set(x0 + dx, y0 + dy, pal[ch]);
      }));
    }
    const BONE_PAL = { l: '#f4ecd6', m: '#d8ccac', d: '#a8987a', k: '#1a120a' };
    const OLD_BONE = { l: '#d8ccac', m: '#b8a888', d: '#8a7a5e', k: '#1a120a' };
    const fossil = (rows, x, d, pal = OLD_BONE) => sprite(shaded(rows), x, at(d), pal, '#1a120a');
    const floorBelow = (x, d) => {
      let y = at(d);
      while (y < H - 1 && isOpen(x, y + 1)) y++;
      return y; // dernier pixel vide
    };
    const ceilAbove = (x, d) => {
      let y = at(d);
      while (y > SKY && isOpen(x, y - 1)) y--;
      return y; // premier pixel vide
    };
    function crystal(x, y, h, w, pal, dir) {
      const half = (w - 1) / 2;
      const rows = [];
      for (let k = 0; k < h; k++) {
        const ww = Math.min(half, k);
        let row = '';
        for (let i = -half; i <= half; i++) {
          if (Math.abs(i) > ww) row += '.';
          else if (k === 0) row += 't';
          else row += i < 0 ? 'l' : i === 0 ? (k < 3 ? 't' : 'm') : 'd';
        }
        rows.push(row);
      }
      if (dir > 0) rows.reverse();
      const y0 = dir < 0 ? y - h + 1 : y;
      sprite(rows, x - half, y0, pal, pal.o);
      anim.push({ type: 'tw', x, y: dir < 0 ? y0 : y0 + h - 1, color: pal.t });
    }
    /** Grappe de cristaux posée au sol (dir = -1) ou suspendue au plafond (dir = 1). */
    function cluster(x, y, dir, pal, size = 1, seed = 0) {
      const r = (k) => hash(x, y, seed + k);
      crystal(x - 3, y, Math.round((3 + r(1) * 3) * size), 3, pal, dir);
      crystal(x + 3, y, Math.round((3 + r(2) * 3) * size), 3, pal, dir);
      if (size > 1) crystal(x - 6, y, Math.round(2 + r(4) * 2), 3, pal, dir);
      crystal(x, y, Math.round((6 + r(3) * 4) * size), 5, pal, dir);
    }
    function pool(x0, x1, d, colors, light) {
      for (let x = x0; x <= x1; x++) {
        for (let y = at(d); y < H && isOpen(x, y); y++) {
          set(x, y, y === at(d) ? light : colors[level(0.4 + (y - at(d)) * -0.04 + hash(x, y, 501) * 0.2, colors.length, x, y)]);
        }
      }
    }
    const glow = (x, y, r, color, a = 0.35, speed = 2) => anim.push({ type: 'glow', x, y, r, color, a, speed, ph: hash(x, y, 600) * 6 });
    /** Lanterne suspendue à une chaîne depuis le plafond de la salle (cherché au-dessus de la profondeur d). */
    function hangLantern(x, d, len, metal = '#3a3a44') {
      const top = ceilAbove(x, d);
      for (let k = 0; k < len; k++) set(x, top + k, k % 2 ? metal : '#1a1a20');
      sprite(LANTERN, x - 1, top + len, { o: metal, y: '#ffd36b' }, '#0a0a0c');
      anim.push({ type: 'glow', x, y: top + len + 3, r: 16, color: '255,200,100', a: 0.34, speed: 9, ph: x, flicker: true });
    }

    // ---------- Racines ----------
    [8, 23, 41, 57, 104, 118, 133, 150].forEach((x, i) => {
      let px = x;
      for (let y = 1; y < 10 + (i % 3) * 4; y++) {
        if (hash(x, y, 40) < 0.3) px += hash(x, y, 41) < 0.5 ? -1 : 1;
        set(px, at(y), y % 3 ? '#8a6a3f' : '#6e5230');
        if (hash(x, y, 42) < 0.15) set(px + 1, at(y), '#6e5230');
      }
    });
    sprite(['.pp...', 'p..p.p', '....p.'], 30, at(6), { p: '#e09a9a' }, '#3a1a10');

    // ---------- Ossuaire : crânes dans les niches, squelette, bougies ----------
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 6; i++) {
        const nx = 6 + i * 10;
        const base = 20 + row * 13 + 8;
        if (hash(i, row, 700) < 0.7) sprite(shaded(SKULL), nx, at(base - 5), BONE_PAL, '#140c06');
        else sprite(shaded(['##.##', '#####']), nx + 1, at(base - 1), BONE_PAL, '#140c06');
      }
    }
    const crypt = floorBelow(126, 38);
    sprite(shaded(SKELETON), 112, crypt - 4, BONE_PAL, '#140c06');
    sprite(shaded(SKULL), 134, crypt - 5, BONE_PAL, '#140c06');
    sprite(CANDLE, 108, crypt - 3, { f: '#ffd84a', w: '#f4efe0' }, '#140c06');
    sprite(CANDLE, 142, crypt - 3, { f: '#ffd84a', w: '#f4efe0' }, '#140c06');
    glow(108, crypt - 3, 7, '255,200,110', 0.4, 7);
    glow(142, crypt - 3, 7, '255,200,110', 0.4, 6);
    fossil(LONGBONE, 100, 14);
    fossil(BONE, 40, 50);
    fossil(RIBS, 140, 52);
    fossil(BONE, 100, 54);

    // ---------- Grotte aux fossiles : lac, gouttes, ammonites, poisson ----------
    const lakeD = 98;
    pool(8, 74, lakeD, ['#0e2a40', '#123a58', '#1a4e72'], '#7ac0e8');
    anim.push({ type: 'tw', x: 30, y: at(lakeD), color: '#d8f2ff' }, { type: 'tw', x: 52, y: at(lakeD), color: '#d8f2ff' });
    [22, 36, 52].forEach((x) => anim.push({ type: 'drip', x, y0: ceilAbove(x, 86) + 1, y1: at(lakeD), ph: hash(x, 0, 610) * 3 }));
    fossil(FISH, 118, floorBelow(124, 86) - 12);
    fossil(TRILOBITE, 142, 62);
    [[8, 64], [62, 62], [104, 106], [6, 106], [122, 62], [150, 104]].forEach(([x, d]) => fossil(AMMONITE, x, d, { l: '#e8dcc0', m: '#c4b494', d: '#94866a' }));
    hangLantern(30, 86, 4);
    hangLantern(128, 86, 3);

    // ---------- Galeries oubliées : iguanodon de Bernissart, étais, rails, berline, lanternes ----------
    const bone = '#d9cfb8';
    const line = (x0, y0, x1, y1, color) => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= n; i++) set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), color);
    };
    const yb = at(134);
    const spine = [[6, yb - 3], [14, yb - 6], [22, yb - 9], [29, yb - 11], [36, yb - 11], [42, yb - 10], [47, yb - 13], [50, yb - 15]];
    for (let i = 1; i < spine.length; i++) {
      line(...spine[i - 1], ...spine[i], bone);
      line(spine[i - 1][0], spine[i - 1][1] + 1, spine[i][0], spine[i][1] + 1, '#8a8068');
    }
    for (let i = 1; i < spine.length; i++) for (let x = spine[i - 1][0]; x < spine[i][0]; x += 2) set(x, spine[i - 1][1] + Math.round(((x - spine[i - 1][0]) / (spine[i][0] - spine[i - 1][0])) * (spine[i][1] - spine[i - 1][1])) - 1, bone);
    for (let x = 30; x <= 41; x += 2) line(x, yb - 10, x - 1, yb - 6 + ((x * 7) % 3), bone);
    sprite(shaded(['.####..', '#.#####', '.######', '..##.#.']), 49, yb - 18, BONE_PAL, '#000000');
    line(28, yb - 11, 31, yb - 5, bone);
    line(31, yb - 5, 27, yb - 1, bone);
    line(40, yb - 9, 43, yb - 5, bone);
    const mine = (x0, x1, top, bottom) => {
      for (let x = x0 + 2; x < x1; x += 13) {
        for (let y = top; y <= bottom; y++) {
          set(x, y, '#8a5a2b');
          set(x + 1, y, '#5e3a1a');
        }
        for (let k = -2; k <= 3; k++) {
          set(x + k, top, '#b07a43');
          set(x + k, top + 1, '#6b4627');
        }
      }
      for (let x = x0; x <= x1; x++) {
        set(x, bottom, '#7d7d86');
        if (x % 3 === 0) set(x, bottom - 1, '#5a3a20');
      }
    };
    mine(4, 70, at(138), at(152));
    mine(90, 156, at(118), at(133));
    sprite(CART, 124, at(128), { b: '#3a3a44', o: '#e9c046', g: '#6b6f78', G: '#4e525a', w: '#1b1b1f' }, '#000000');
    sprite(PICKAXE, 40, at(147), { h: '#a8b0bc', b: '#8a5a2b' }, '#000000');
    [[23, at(140)], [108, at(120)], [147, at(120)]].forEach(([x, y]) => {
      sprite(LANTERN, x - 1, y, { o: '#2a2a30', y: '#ffd36b' }, null);
      anim.push({ type: 'glow', x, y: y + 3, r: 12, color: '255,200,100', a: 0.32, speed: 9, ph: x, flicker: true });
    });
    sprite(COBWEB, 4, at(138) + 2, { '#': '#6e6e7a' }, null);
    sprite(COBWEB.map((r) => [...r].reverse().join('')), 151, at(118) + 2, { '#': '#6e6e7a' }, null);

    // ---------- Caverne d'améthyste : géode géante tapissée de cristaux ----------
    for (let x = 12; x <= 148; x += 7) {
      if (Math.abs(x - 80) < 13) continue;
      const pal = x > 100 && x < 130 ? gemB(4) : gemA(4);
      cluster(x, floorBelow(x, 220), -1, pal, hash(x, 0, 710) < 0.5 ? 1 : 1.4, 10);
      if (hash(x, 1, 711) < 0.8) cluster(x + 3, ceilAbove(x + 3, 220), 1, pal, hash(x, 2, 712) < 0.5 ? 0.8 : 1.2, 20);
    }
    glow(40, at(240), 34, '190,120,255', 0.14, 1.2);
    glow(124, at(230), 28, '255,140,200', 0.1, 1.5);
    // Petites géodes fermées dans la roche.
    [[8, 172], [152, 176], [6, 274], [150, 272]].forEach(([gx, d]) => {
      const gy = at(d);
      for (let y = -4; y <= 4; y++) {
        for (let x = -5; x <= 5; x++) {
          const r = Math.hypot(x / 5, y / 4);
          if (r > 1) continue;
          if (r > 0.75) set(gx + x, gy + y, '#9a94a8');
          else if (r > 0.3) set(gx + x, gy + y, ['#d2acf5', '#9b59d6', '#5e2e8c'][(Math.floor((Math.atan2(y, x) + Math.PI) * 2.5) % 3)]);
          else set(gx + x, gy + y, '#1a0b26');
        }
      }
      anim.push({ type: 'tw', x: gx - 1, y: gy - 2, color: '#ffffff' });
    });

    // ---------- Jardin d'émeraudes : cascade, champignons lumineux, lianes, lucioles ----------
    const pondD = 432;
    pool(10, 76, pondD, ['#06281e', '#0a3a2c', '#10503c'], '#7ef0c8');
    const fallTop = ceilAbove(30, 330);
    anim.push({ type: 'fall', x: 29, w: 4, y0: fallTop, y1: at(pondD), colors: ['#7ef0d8', '#3fc0b0', '#bff8ee', '#2a9a90'], speed: 40 });
    glow(31, at(pondD), 12, '120,255,220', 0.3, 3);
    [[100, 1], [104, 0], [112, 1], [120, 0], [126, 1], [134, 0], [140, 1], [8, 1]].forEach(([x, small]) => {
      const fy = floorBelow(x, 380);
      if (fy >= at(pondD) && x < 80) return;
      const pal = { c: x % 3 ? '#3fe0c0' : '#c070ff', s: '#e8fff8', t: '#cfe0c8' };
      sprite(small ? MUSH_S : MUSH, x - 2, fy - (small ? 2 : 4), pal, '#03100c');
      glow(x, fy - 3, small ? 6 : 10, x % 3 ? '80,255,210' : '200,120,255', 0.35, 1.5);
    });
    [12, 20, 40, 52, 62, 98, 108, 118, 132, 144].forEach((x, i) => {
      const top = ceilAbove(x, 370);
      const len = 10 + Math.floor(hash(x, 7, 720) * 22);
      let px = x;
      for (let k = 0; k < len && isOpen(px, top + k); k++) {
        if (hash(x, k, 721) < 0.25) px += hash(x, k, 722) < 0.5 ? -1 : 1;
        set(px, top + k, k % 4 === 3 ? '#4fc884' : '#2a8a58');
        if (k % 6 === 2) set(px + (k % 12 ? 1 : -1), top + k, '#4fc884');
      }
      set(px, top + len, '#c8ffe0');
      glow(px, top + len, 5, '150,255,200', 0.4, 2 + i * 0.3);
    });
    [[110, 0.9], [124, 1.3], [138, 1]].forEach(([x, k]) => cluster(x, ceilAbove(x, 370), 1, gemA(5), k, 40));
    anim.push({ type: 'fly', x: 50, y: at(380), rx: 34, ry: 40, n: 8, color: '#d8ff6a' }, { type: 'fly', x: 120, y: at(400), rx: 22, ry: 30, n: 6, color: '#d8ff6a' });

    // ---------- Lac de saphir : mer souterraine, cristaux bleus, méduses ----------
    const seaD = 578;
    pool(0, W - 1, seaD, ['#040c24', '#081838', '#0c2450', '#143268'], '#9ad0ff');
    for (let x = 10; x < W - 6; x += 8) {
      if (Math.abs(x - 80) < 12) continue;
      cluster(x, ceilAbove(x, 550), 1, hash(x, 4, 730) < 0.8 ? gemA(6) : gemB(6), hash(x, 2, 730) < 0.5 ? 1.3 : 0.8, 50);
    }
    // Îlots de cristal qui émergent de l'eau.
    [[28, 1.4], [128, 1.6]].forEach(([x, k]) => cluster(x, at(seaD) + 2, -1, gemA(6), k, 60));
    for (let i = 0; i < 10; i++) anim.push({ type: 'tw', x: 10 + Math.floor(hash(i, 3, 731) * 140), y: at(seaD), color: '#ffffff' });
    [[30, 590], [110, 596], [56, 604], [136, 588], [86, 612]].forEach(([x, d], i) => anim.push({ type: 'jelly', x, y: at(d), ph: i * 1.7, pal: i % 2 ? { p: '#ff8ad8', w: '#ffe0f4' } : { p: '#6ae8ff', w: '#e0fbff' } }));
    glow(80, at(seaD + 20), 50, '80,150,255', 0.12, 0.7);

    // ---------- Forge des rubis : cascade de lave, rubis, obsidienne, braises ----------
    const lavaD = 822;
    pool(8, 72, lavaD, ['#ffd25a', '#f7a23b', '#e8742a', '#c4481f'], '#fff1a8');
    const lavaTop = ceilAbove(48, 720);
    anim.push({ type: 'fall', x: 47, w: 5, y0: lavaTop, y1: at(lavaD), colors: ['#ffd25a', '#f7a23b', '#e8742a', '#fff1a8'], speed: 18 });
    glow(49, at(lavaD), 30, '255,120,40', 0.3, 2);
    glow(49, at(760), 20, '255,120,40', 0.12, 2.5);
    anim.push({ type: 'ember', x: 40, y: at(lavaD), w: 34 }, { type: 'ember', x: 60, y: at(lavaD), w: 20 });
    for (let x = 12; x <= 148; x += 8) {
      if (Math.abs(x - 80) < 12 || Math.abs(x - 48) < 5) continue;
      cluster(x, ceilAbove(x, 752), 1, gemA(7), hash(x, 3, 732) < 0.5 ? 1 : 1.4, 70);
    }
    for (let x = 98; x <= 150; x += 7) cluster(x, floorBelow(x, 752), -1, x % 2 ? gemB(7) : gemA(7), x % 2 ? 1.5 : 1.1, 80);

    // ---------- Temple englouti : colonnes, idole, glyphes, braseros, trésor ----------
    const templeFloor = at(1009);
    for (let x = 0; x < W; x++) set(x, templeFloor + 1, (x >> 3) % 2 ? '#b09c62' : '#8c7a48');
    const column = (cx, broken) => {
      const top = broken ? templeFloor - broken : ceilAbove(cx, 950);
      for (let y = top; y <= templeFloor; y++) {
        ['#5a4a2a', '#b09c62', '#d8c48a', '#b09c62', '#8c7a48', '#5a4a2a', '#3a3018'].forEach((col, k) => set(cx - 3 + k, y, col));
        if ((y - top) % 5 === 0) set(cx, y, '#8c7a48');
      }
      for (let k = -4; k <= 4; k++) {
        set(cx + k, templeFloor, '#8c7a48');
        set(cx + k, templeFloor - 1, '#d8c48a');
        if (!broken) {
          set(cx + k, top, '#d8c48a');
          set(cx + k, top + 1, '#8c7a48');
        }
      }
      if (broken) for (let k = -3; k <= 3; k++) for (let j = 0; j < Math.floor(hash(cx, k, 740) * 3); j++) set(cx + k, top - j, '#d8c48a');
    };
    column(18, 0);
    column(42, 34);
    column(124, 0);
    column(146, 48);
    [30, 134].forEach((x) => hangLantern(x, 950, 10, '#e9c046'));
    sprite(shaded(IDOL), 97, templeFloor - 14, { l: '#d8c48a', m: '#a8945a', d: '#6a5a32', e: '#2a1a08' }, '#1a1408');
    glow(101, templeFloor - 10, 4, '80,255,230', 0.6, 1.3);
    glow(108, templeFloor - 10, 4, '80,255,230', 0.6, 1.3);
    anim.push({ type: 'eyes', pts: [[100, templeFloor - 11], [101, templeFloor - 11], [107, templeFloor - 11], [108, templeFloor - 11], [100, templeFloor - 10], [101, templeFloor - 10], [107, templeFloor - 10], [108, templeFloor - 10]] });
    sprite(COINS, 52, templeFloor - 3, { y: '#e9c046', Y: '#fff1a8' }, '#3a2a08');
    anim.push({ type: 'tw', x: 55, y: templeFloor - 3, color: '#ffffff' });
    GLYPHS.forEach((g, i) => anim.push({ type: 'glyph', rows: g, x: 50 + (i % 3) * 6, y: at(950) + Math.floor(i / 3) * 6, ph: i * 0.9 }));
    GLYPHS.slice().reverse().forEach((g, i) => anim.push({ type: 'glyph', rows: g, x: 130 + (i % 2) * 6, y: at(946) + Math.floor(i / 2) * 6, ph: i * 1.1 + 3 }));
    [[28, templeFloor], [136, templeFloor]].forEach(([x, y]) => {
      sprite(['ooooo', '.ooo.', '..o..', '.ooo.'], x - 2, y - 3, { o: '#3a3018' }, null);
      anim.push({ type: 'flame', x, y: y - 4 });
      glow(x, y - 6, 14, '255,180,90', 0.3, 8);
    });

    // ---------- Cœur prismatique : étoiles, cristaux de toutes les couleurs, éclats flottants ----------
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(hash(i, 1, 750) * W);
      const y = at(1064 + Math.floor(hash(i, 2, 750) * 120));
      if (!isOpen(x, y)) continue;
      set(x, y, hash(i, 3, 750) < 0.5 ? '#6a5aa0' : '#ffffff');
      if (i % 3 === 0) anim.push({ type: 'tw', x, y, color: '#ffffff' });
    }
    for (let x = 12; x < W - 8; x += 9) {
      if (Math.abs(x - 80) < 12) continue;
      cluster(x, floorBelow(x, 1150), -1, RAINBOW[Math.floor(x / 9) % RAINBOW.length], 1.2, 100);
    }
    [[30, 1090], [60, 1120], [104, 1100], [130, 1130], [46, 1150], [118, 1160]].forEach(([x, d], i) => anim.push({ type: 'shard', x, y: at(d), ph: i * 1.3, pal: RAINBOW[i % RAINBOW.length] }));
    glow(80, at(1180), 40, '200,160,255', 0.14, 0.8);

    // ---------- Trouvailles des poches ----------
    const CHEST = ['.ooooo.', 'oyyyyyo', 'okkGkko', 'oyyyyyo', 'ooooooo'];
    const HELMET = ['..yyy..', '.yyyyl.', 'yyyyyyy', 'ooooooo'];
    const FINDS = [
      [],
      ['skull', 'skull', 'fossil', 'helmet', 'chest'],
      ['fossil', 'fossil', 'skull', 'pond', 'chest'],
      ['helmet', 'gems', 'fossil', 'chest'],
      ['gems', 'gems', 'geode', 'chest'],
      ['mush', 'gems', 'pond', 'chest'],
      ['gems', 'pond', 'chest', 'skull'],
      ['gems', 'gems', 'lava', 'chest'],
      ['chest', 'glyph', 'gems', 'skull'],
      ['gems', 'gems', 'chest'],
    ];
    pockets.forEach(({ t, cx, cd, roll }) => {
      const list = FINDS[t];
      const kind = list[Math.floor(roll * list.length)];
      const fy = floorBelow(cx, cd);
      const pal = GEM_A[t] === 'rainbow' ? RAINBOW[Math.floor(roll * 60) % RAINBOW.length] : gemA(t) || GEMS.topaz;
      if (kind === 'skull') sprite(shaded(SKULL), cx - 3, fy - 5, BONE_PAL, '#140c06');
      else if (kind === 'fossil') fossil([AMMONITE, TRILOBITE, FISH, RIBS][Math.floor(roll * 97) % 4], cx - 4, fy - SKY - 6);
      else if (kind === 'helmet') {
        sprite(HELMET, cx - 3, fy - 3, { y: '#f2c230', l: '#fff6c0', o: '#7a5d1f' }, '#1a1206');
        glow(cx + 2, fy - 2, 7, '255,240,180', 0.35, 1);
      } else if (kind === 'chest') {
        sprite(CHEST, cx - 3, fy - 4, { o: '#3a2410', y: '#a06d3a', k: '#5a3a20', G: '#ffd84a' }, '#100804');
        glow(cx, fy - 3, 9, '255,210,90', 0.3, 1.6);
        anim.push({ type: 'tw', x: cx, y: fy - 2, color: '#ffffff' });
      } else if (kind === 'pond') pool(cx - 10, cx + 10, fy - SKY - 1, ['#0e2a40', '#123a58', '#1a4e72'], '#7ac0e8');
      else if (kind === 'lava') {
        pool(cx - 10, cx + 10, fy - SKY - 1, ['#ffd25a', '#f7a23b', '#e8742a', '#c4481f'], '#fff1a8');
        glow(cx, fy - 2, 12, '255,120,40', 0.3, 2);
      } else if (kind === 'mush') {
        sprite(MUSH, cx - 2, fy - 4, { c: '#c070ff', s: '#e8fff8', t: '#cfe0c8' }, '#03100c');
        glow(cx, fy - 3, 9, '200,120,255', 0.35, 1.5);
      } else if (kind === 'glyph') {
        anim.push({ type: 'glyph', rows: GLYPHS[Math.floor(roll * 50) % GLYPHS.length], x: cx - 1, y: fy - 5, ph: roll * 6 });
      } else if (kind === 'geode') {
        cluster(cx, fy, -1, gemB(t) || pal, 0.8, 120);
        cluster(cx + 1, ceilAbove(cx + 1, cd), 1, gemB(t) || pal, 0.6, 121);
      } else cluster(cx, fy, -1, pal, 0.9, 110);
    });

    // Puits : là où il traverse une grotte, on voit la foreuse pendre au bout de son câble.
    const shaftOpen = new Uint8Array(H);
    for (let y = 0; y < H; y++) shaftOpen[y] = isOpen(76, y) && isOpen(80, y) && isOpen(84, y) ? 1 : 0;
    // Transparence du fond des grottes : ombre opaque au bord de la roche, puis de plus en plus transparent vers le centre.
    const dist = new Uint8Array(W * H).fill(255);
    for (let i = 0; i < W * H; i++) if (!open[i]) dist[i] = 0;
    for (let pass = 0; pass < 2; pass++) {
      const order = pass ? -1 : 1;
      for (let y = pass ? H - 1 : 0; pass ? y >= 0 : y < H; y += order) {
        for (let x = pass ? W - 1 : 0; pass ? x >= 0 : x < W; x += order) {
          const i = y * W + x;
          if (!dist[i]) continue;
          const px = x - order;
          const py = y - order;
          let best = dist[i];
          if (px >= 0 && px < W) best = Math.min(best, dist[i - order] + 1);
          if (py >= 0 && py < H) best = Math.min(best, dist[i - order * W] + 1);
          dist[i] = best;
        }
      }
    }
    const alpha = new Uint8Array(W * H).fill(255);
    const fade = [255, 255, 235, 170, 105, 50];
    for (let y = SKY + 1; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (open[i] && !deco[i]) alpha[i] = fade[Math.min(fade.length - 1, dist[i])] || 0;
        if (open[i] && !deco[i] && dist[i] >= fade.length) alpha[i] = 0;
      }
    }
    return { anim, shaftOpen, alpha };
  }

  function drawPattern(ctx, rows, x0, y0, pal) {
    rows.forEach((row, dy) => [...row].forEach((ch, dx) => {
      if (ch === '.' || !pal[ch]) return;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(x0 + dx, y0 + dy, 1, 1);
    }));
  }

  /** Éléments animés visibles entre cam et cam + h (coordonnées du monde ; le contexte est déjà décalé). */
  function drawAnim(ctx, anim, time, cam, h, calm) {
    const inView = (y, m = 16) => y >= cam - m && y <= cam + h + m;
    const t = calm ? 0 : time;
    anim.forEach((a, i) => {
      switch (a.type) {
        case 'tw': {
          if (!inView(a.y) || hash(i, Math.floor(time * 3 + i * 0.37), 70) < 0.82) return;
          ctx.fillStyle = a.color;
          ctx.fillRect(a.x, a.y, 1, 1);
          ctx.globalAlpha = 0.6;
          ctx.fillRect(a.x - 1, a.y, 1, 1);
          ctx.fillRect(a.x + 1, a.y, 1, 1);
          ctx.fillRect(a.x, a.y - 1, 1, 1);
          ctx.fillRect(a.x, a.y + 1, 1, 1);
          ctx.globalAlpha = 1;
          return;
        }
        case 'glow': {
          if (!inView(a.y, a.r)) return;
          const pulse = a.flicker ? Math.sin(time * a.speed + a.ph) * 0.05 + Math.sin(time * 23 + a.ph) * 0.03 : Math.sin(time * a.speed + a.ph) * a.a * 0.3;
          const alpha = Math.max(0, a.a + pulse);
          const g = ctx.createRadialGradient(a.x + 0.5, a.y + 0.5, 0, a.x + 0.5, a.y + 0.5, a.r);
          g.addColorStop(0, `rgba(${a.color},${alpha})`);
          g.addColorStop(1, `rgba(${a.color},0)`);
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = g;
          ctx.fillRect(a.x - a.r, a.y - a.r, a.r * 2 + 1, a.r * 2 + 1);
          ctx.globalCompositeOperation = 'source-over';
          return;
        }
        case 'fall': {
          if (a.y1 < cam - 4 || a.y0 > cam + h + 4) return;
          for (let y = Math.max(a.y0, cam - 2); y <= Math.min(a.y1, cam + h + 2); y++) {
            for (let k = 0; k < a.w; k++) {
              const n = hash(a.x + k, Math.floor((y - t * a.speed) / 2), 620);
              ctx.fillStyle = a.colors[Math.floor(n * a.colors.length)];
              ctx.fillRect(a.x + k, y, 1, 1);
            }
          }
          // Écume au pied de la cascade.
          for (let k = -2; k < a.w + 2; k++) {
            if (hash(a.x + k, Math.floor(t * 8), 621) < 0.5) {
              ctx.fillStyle = a.colors[2];
              ctx.fillRect(a.x + k, a.y1 - 1, 1, 1);
            }
          }
          return;
        }
        case 'drip': {
          if (!inView(a.y0, a.y1 - a.y0)) return;
          const period = 2.4;
          const p = (t + a.ph) % period;
          const y = a.y0 + p * p * 40;
          ctx.fillStyle = '#bfe6f3';
          if (y < a.y1) ctx.fillRect(a.x, Math.round(y), 1, 2);
          else if (y < a.y1 + 6) {
            ctx.fillRect(a.x - 1, a.y1 - 1, 1, 1);
            ctx.fillRect(a.x + 1, a.y1 - 1, 1, 1);
          }
          return;
        }
        case 'fly': {
          if (!inView(a.y, a.ry + 4)) return;
          for (let k = 0; k < a.n; k++) {
            if (Math.sin(time * 2.3 + k * 1.9) < -0.3) continue;
            const x = Math.round(a.x + Math.sin(t * 0.45 + k * 2.1) * a.rx + Math.sin(t * 1.7 + k) * 2);
            const y = Math.round(a.y + Math.cos(t * 0.37 + k * 1.3) * a.ry + Math.sin(t * 2.1 + k * 3) * 2);
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = a.color;
            ctx.fillRect(x - 1, y, 3, 1);
            ctx.fillRect(x, y - 1, 1, 3);
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#ffffe0';
            ctx.fillRect(x, y, 1, 1);
          }
          return;
        }
        case 'jelly': {
          if (!inView(a.y)) return;
          const x = Math.round(a.x + Math.sin(t * 0.3 + a.ph) * 6);
          const y = Math.round(a.y + Math.sin(t * 1.4 + a.ph) * 3);
          ctx.globalAlpha = 0.85;
          drawPattern(ctx, JELLY, x - 2, y, a.pal);
          ctx.globalAlpha = 1;
          return;
        }
        case 'shard': {
          if (!inView(a.y)) return;
          const y = Math.round(a.y + Math.sin(t * 1.1 + a.ph) * 4);
          const p = a.pal;
          drawPattern(ctx, ['..o..', '.oto.', 'oltdo', 'oltdo', 'olmdo', 'olmdo', '.omo.', '..o..'], a.x - 2, y, { o: p.o, l: p.l, m: p.m, d: p.d, t: p.t });
          return;
        }
        case 'ember': {
          if (!inView(a.y, 40)) return;
          for (let k = 0; k < 6; k++) {
            const life = (t * 0.6 + k * 0.37 + hash(k, 1, 630)) % 1;
            const x = Math.round(a.x - a.w / 2 + hash(k, Math.floor(t * 0.6 + k * 0.37 + hash(k, 1, 630)), 631) * a.w + Math.sin(t * 3 + k) * 1.5);
            ctx.fillStyle = life < 0.5 ? '#fff1a8' : '#e8742a';
            ctx.globalAlpha = 1 - life;
            ctx.fillRect(x, Math.round(a.y - life * 30), 1, 1);
          }
          ctx.globalAlpha = 1;
          return;
        }
        case 'glyph': {
          if (!inView(a.y)) return;
          const v = 0.25 + 0.75 * Math.max(0, Math.sin(time * 0.9 + a.ph));
          ctx.globalAlpha = v;
          drawPattern(ctx, a.rows, a.x, a.y, { '#': '#5ff0e0' });
          ctx.globalAlpha = 1;
          return;
        }
        case 'eyes': {
          if (!inView(a.pts[0][1])) return;
          ctx.fillStyle = Math.sin(time * 1.3) > -0.2 ? '#7ff8ec' : '#2aa89a';
          a.pts.forEach(([x, y]) => ctx.fillRect(x, y, 1, 1));
          return;
        }
        case 'flame': {
          if (!inView(a.y)) return;
          const f = Math.floor(time * 10) % 3;
          ctx.fillStyle = '#e8742a';
          ctx.fillRect(a.x - 1, a.y - 1, 3, 2);
          ctx.fillStyle = '#ffd25a';
          ctx.fillRect(a.x, a.y - 2 - (f === 1 ? 1 : 0), 1, 2);
          ctx.fillStyle = '#fff1a8';
          ctx.fillRect(a.x + (f === 2 ? 1 : 0) - (f === 0 ? 1 : 0), a.y - 3 - f % 2, 1, 1);
          return;
        }
        default:
      }
    });
  }

  // ---------- Profondeur : arrière-plan lointain, premier plan et atmosphère ----------
  const P_BACK = 0.55; // l'arrière-plan défile plus lentement que la roche…
  const P_FRONT = 1.35; // … et le premier plan plus vite : effet de profondeur
  const VIEW = 200;
  const css = (c, f = 1, a = 1) => `rgba(${Math.min(255, c[0] * f) | 0},${Math.min(255, c[1] * f) | 0},${Math.min(255, c[2] * f) | 0},${a})`;

  /** Couleur de l'air à une profondeur d (pixels sous la surface), fondue d'un palier à l'autre. */
  function airAt(d, PPP) {
    let t = 0;
    for (let i = 0; i < TIERS.length; i++) if (d >= TIERS[i].from * PPP) t = i;
    const c = AIR_RGB[t];
    if (t + 1 >= TIERS.length) return c;
    const next = TIERS[t + 1].from * PPP;
    const k = Math.max(0, Math.min(1, (d - (next - 30)) / 30));
    const n = AIR_RGB[t + 1];
    return [c[0] + (n[0] - c[0]) * k, c[1] + (n[1] - c[1]) * k, c[2] + (n[2] - c[2]) * k];
  }

  /**
   * Arrière-plan lointain (peint une fois, en gris) : brume, piliers et stalactites en silhouette, lointains éclats.
   * Il est teinté à l'affichage par la couleur de l'air à chaque hauteur de l'écran (voir drawBack).
   */
  function backdrop({ W, WORLD_H }) {
    const BH = Math.ceil((WORLD_H - VIEW) * P_BACK + VIEW) + 4;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = BH;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, BH);
    const steps = [0.16, 0.28, 0.42, 0.6, 0.82, 1.08];
    for (let r = 0; r < BH; r++) {
      for (let x = 0; x < W; x++) {
        let f = 0.3 + 0.45 * vnoise(x, r, 900, 38) + 0.25 * vnoise(x, r, 901, 11);
        f *= 0.75 + 0.25 * (1 - Math.abs(x - W / 2) / (W / 2));
        const far = vnoise(x, r * 0.07, 910, 8);
        const near = vnoise(x, r * 0.045, 920, 13);
        let glint = null;
        if (near > 0.66) {
          f = vnoise(x - 1, r * 0.045, 920, 13) <= 0.66 ? 0.9 : 0.12;
        } else if (far > 0.6) {
          f *= vnoise(x - 1, r * 0.07, 910, 8) <= 0.6 ? 0.75 : 0.45;
        } else if (hash(x, r, 930) > 0.996) glint = true;
        const lv = level(Math.min(1, f / 1.08), steps.length, x, r);
        const k = glint ? 1 : steps[lv] / 1.2;
        const i = (r * W + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * k);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /** Premier plan (peint une fois) : gros rochers sombres sur les bords, cristaux géants, os ou étais selon le palier. */
  function foreground({ W, SKY, PPP, WORLD_H }) {
    const FH = Math.ceil((WORLD_H - VIEW) * P_FRONT + VIEW) + 4;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = FH;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, FH);
    const put = (x, y, hex) => {
      if (x < 0 || x >= W || y < 0 || y >= FH) return;
      const c = rgbOf(hex);
      const i = (y * W + x) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    };
    const glows = [];
    const toHex = (c, f) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0')).join('');
    const sprite = (rows, x0, y0, pal, outline) => {
      const on = (dx, dy) => dy >= 0 && dy < rows.length && dx >= 0 && dx < rows[dy].length && rows[dy][dx] !== '.';
      if (outline) {
        const w = Math.max(...rows.map((row) => row.length));
        for (let dy = -1; dy <= rows.length; dy++) for (let dx = -1; dx <= w; dx++) if (!on(dx, dy) && (on(dx - 1, dy) || on(dx + 1, dy) || on(dx, dy - 1) || on(dx, dy + 1))) put(x0 + dx, y0 + dy, outline);
      }
      rows.forEach((row, dy) => [...row].forEach((ch, dx) => ch !== '.' && pal[ch] && put(x0 + dx, y0 + dy, pal[ch])));
    };
    /** Grand cristal (2 pixels par pixel de motif) pour le premier plan. */
    const bigCrystal = (x, y, h, pal, lean) => {
      for (let k = 0; k < h; k++) {
        const half = Math.min(3, 1 + Math.floor(k / 2));
        const cx = x + Math.round((h - k) * lean);
        for (let i = -half; i <= half; i++) {
          const col = k === 0 ? pal.t : i < -1 ? pal.l : i < 0 ? (k < 5 ? pal.t : pal.l) : i === 0 ? pal.m : pal.d;
          put(cx + i, y - h + k, col);
        }
        put(cx - half - 1, y - h + k, pal.o);
        put(cx + half + 1, y - h + k, pal.o);
      }
      put(x + Math.round(h * lean), y - h - 1, pal.o);
    };
    let r = 140;
    let n = 0;
    while (r < FH - 40) {
      const d = (r - VIEW / 2) / P_FRONT + VIEW / 2 - SKY;
      let t = 0;
      for (let i = 0; i < TIERS.length; i++) if (d >= TIERS[i].from * PPP) t = i;
      const air = AIR_RGB[t];
      const left = hash(n, 1, 950) < 0.5;
      const rx = 12 + Math.floor(hash(n, 2, 950) * 12);
      const ry = 22 + Math.floor(hash(n, 3, 950) * 26);
      const cx = left ? -6 : W + 5;
      const rim = toHex(air, 2.2);
      // Rocher en silhouette, bordé de lumière du côté du puits.
      for (let y = r - ry; y <= r + ry; y++) {
        for (let x = cx - rx; x <= cx + rx; x++) {
          const q = Math.hypot((x - cx) / rx, (y - r) / ry);
          if (q > 1 + (vnoise(x, y, 960 + n, 5) - 0.5) * 0.5) continue;
          const inner = left ? x + 1 : x - 1;
          const edge = Math.hypot((inner - cx) / rx, (y - r) / ry) > 1 + (vnoise(inner, y, 960 + n, 5) - 0.5) * 0.5;
          put(x, y, edge ? rim : toHex(air, 0.08 + 0.12 * (level(vnoise(x, y, 970, 4), 3, x, y) / 2)));
        }
      }
      const edgeX = left ? cx + rx - 2 : cx - rx + 2;
      const gem = GEM_A[t];
      if (gem) {
        const pal = gem === 'rainbow' ? RAINBOW[n % RAINBOW.length] : gemOf(gem);
        const top = r - Math.round(ry * 0.45);
        const lean = left ? 0.18 : -0.18;
        bigCrystal(edgeX - (left ? 6 : -6), top + 6, 10 + Math.floor(hash(n, 4, 950) * 6), pal, lean);
        bigCrystal(edgeX, top + 4, 16 + Math.floor(hash(n, 5, 950) * 10), pal, lean * 1.6);
        glows.push({ x: edgeX, y: top - 6, r: 26, color: rgbOf(pal.m), ph: n });
      } else if (t === 1) {
        sprite(shaded(SKULL).map((row) => row.replace(/./g, (ch) => ch + ch)), left ? 2 : W - 16, r - ry + 6, { l: '#e8dcc0', m: '#b8a888', d: '#7a6a50', k: '#0a0604' }, '#0a0604');
      }
      if (t === 3) {
        // Étai de bois et lanterne.
        for (let y = r - ry - 30; y <= r + ry; y++) for (let k = 0; k < 4; k++) put(edgeX + (left ? -k - 2 : k + 2), y, ['#a06d3a', '#8a5a2b', '#6b4627', '#4a2f1a'][k]);
        sprite(['.o.', 'ooo', 'oyo', 'oyo', 'ooo'], edgeX + (left ? 2 : -4), r - ry - 6, { o: '#1a1a20', y: '#ffd36b' }, null);
        glows.push({ x: edgeX + (left ? 3 : -3), y: r - ry - 3, r: 22, color: [255, 190, 90], ph: n, flicker: true });
      }
      r += 85 + Math.floor(hash(n, 6, 950) * 60);
      n++;
    }
    ctx.putImageData(img, 0, 0);
    return { canvas, glows };
  }

  /** Arrière-plan, à dessiner avant la roche (coordonnées écran). */
  function drawBack(ctx, back, cam, h, { SKY, PPP }) {
    ctx.drawImage(back, 0, Math.round(cam * P_BACK), back.width, h, 0, 0, back.width, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    for (let y = 0; y <= h; y += 10) g.addColorStop(y / h, css(airAt(Math.max(0, cam + y - SKY), PPP), 1.55));
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, back.width, h);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Premier plan et ses lueurs, à dessiner par-dessus la scène (coordonnées écran). */
  function drawFront(ctx, front, cam, h, time) {
    const y0 = Math.round(cam * P_FRONT);
    ctx.drawImage(front.canvas, 0, y0, front.canvas.width, h, 0, 0, front.canvas.width, h);
    ctx.globalCompositeOperation = 'lighter';
    for (const g of front.glows) {
      const y = g.y - y0;
      if (y < -g.r || y > h + g.r) continue;
      const a = g.flicker ? 0.3 + Math.sin(time * 9 + g.ph) * 0.04 + Math.sin(time * 23 + g.ph) * 0.03 : 0.26 + Math.sin(time * 1.3 + g.ph) * 0.06;
      const grad = ctx.createRadialGradient(g.x, y, 0, g.x, y, g.r);
      grad.addColorStop(0, css(g.color, 1, a));
      grad.addColorStop(1, css(g.color, 1, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(g.x - g.r, y - g.r, g.r * 2, g.r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Atmosphère (coordonnées écran) : lueur de l'air du palier, rayons de lumière, poussières lumineuses et vignette. */
  function drawAir(ctx, { W, SKY, PPP }, cam, h, time, calm) {
    const d = cam + h / 2 - SKY;
    const show = Math.max(0, Math.min(1, (d - 10) / 60));
    if (!show) return;
    const air = airAt(Math.max(0, d), PPP);
    const t = calm ? 0 : time;
    ctx.globalCompositeOperation = 'lighter';
    const top = ctx.createRadialGradient(W / 2, -h * 0.1, 0, W / 2, -h * 0.1, h * 0.95);
    top.addColorStop(0, css(air, 1.8, 0.32 * show));
    top.addColorStop(1, css(air, 1.6, 0));
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, h);
    // Rayons obliques venus d'en haut.
    for (let k = 0; k < 3; k++) {
      const x = 22 + k * 46 + Math.sin(t * 0.2 + k) * 6;
      ctx.fillStyle = css(air, 2.2, (0.035 + Math.sin(t * 0.7 + k * 2) * 0.015) * show);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 10, 0);
      ctx.lineTo(x + 34, h);
      ctx.lineTo(x + 14, h);
      ctx.closePath();
      ctx.fill();
    }
    // Brume mystique : nappes lumineuses qui dérivent lentement.
    for (let k = 0; k < 3; k++) {
      const mx = ((hash(k, 1, 990) * W + t * (2 + k)) % (W + 80)) - 40;
      const my = ((hash(k, 2, 990) * h - cam * (0.3 + k * 0.15)) % h + h) % h;
      const mist = ctx.createRadialGradient(mx, my, 0, mx, my, 46);
      mist.addColorStop(0, css(air, 2.4, (0.09 + Math.sin(t * 0.4 + k * 2) * 0.03) * show));
      mist.addColorStop(1, css(air, 2.4, 0));
      ctx.fillStyle = mist;
      ctx.fillRect(mx - 46, my - 46, 92, 92);
    }
    // Poussières lumineuses (bokeh).
    for (let i = 0; i < 22; i++) {
      const sp = 0.4 + hash(i, 1, 980) * 0.8;
      const x = ((hash(i, 2, 980) * W + t * sp * 3 + Math.sin(t * 0.5 + i) * 4) % W + W) % W;
      const y = ((hash(i, 3, 980) * h - t * sp * 4 - cam * (0.2 + sp * 0.3)) % h + h) % h;
      const r = 0.8 + hash(i, 4, 980) * 2.6;
      const twinkle = 0.75 + 0.25 * Math.sin(time * (1 + hash(i, 6, 980) * 2) + i);
      ctx.fillStyle = css(air, 3, (0.16 + hash(i, 5, 980) * 0.26) * twinkle * show);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    const vg = ctx.createRadialGradient(W / 2, h / 2, h * 0.32, W / 2, h / 2, h * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${0.3 * show})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, h);
  }

  global.Caves = { TIERS, tierIndex, setSeed, build, drawAnim, backdrop, foreground, drawBack, drawFront, drawAir };
})(window);
