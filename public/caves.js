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
  const RAINBOW = [GEMS.ruby, GEMS.topaz, GEMS.emerald, GEMS.sapphire, GEMS.amethyst, GEMS.rose];

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bay = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
  /** Tramage ordonné : la valeur v (0 → 1) devient l'un des n niveaux, avec le motif en damier typique des consoles 16 bits. */
  const level = (v, n, x, y) => Math.max(0, Math.min(n - 1, Math.floor(v * (n - 1) + bay(x, y))));

  function hash(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 1, 2246822519);
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

  function build({ W, SKY, PPP, WORLD_H, set }) {
    const H = WORLD_H;
    const at = (d) => SKY + d;
    const open = new Uint8Array(W * H); // 1 = vide (grotte)
    const isOpen = (x, y) => x >= 0 && x < W && y >= 0 && y < H && open[y * W + x] === 1;
    const anim = [];

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
    carve(126, 38, 22, 8, 0.3);
    // Grotte aux fossiles : grande salle avec un lac, petite salle à droite.
    carve(38, 86, 32, 14, 0.35);
    carve(128, 76, 22, 9, 0.35);
    // Galeries oubliées : deux galeries de mine étayées qui rejoignent le puits.
    carveRect(4, 140, 72, 151);
    carveRect(88, 121, 156, 132);
    // Caverne d'améthyste : géode géante et deux salles de quartz rose.
    carve(38, 218, 28, 24, 0.25);
    carve(128, 196, 22, 11, 0.3);
    carve(124, 256, 20, 10, 0.3);
    // Jardin d'émeraudes : haute salle à cascade, salle aux émeraudes, salle aux champignons.
    carve(42, 372, 32, 44, 0.3);
    carve(126, 320, 26, 15, 0.3);
    carve(124, 424, 24, 17, 0.3);
    // Lac de saphir : mer souterraine traversée par le puits.
    carve(80, 548, 74, 30, 0.25);
    carve(30, 616, 20, 10, 0.3);
    carve(130, 612, 20, 12, 0.3);
    // Forge des rubis : cascade de lave, salle d'obsidienne.
    carve(40, 724, 30, 30, 0.3);
    carve(126, 792, 28, 24, 0.3);
    carve(122, 690, 16, 9, 0.3);
    // Temple englouti : grande salle hypostyle au sol plat.
    carve(80, 950, 74, 44, 0.15);
    fill(0, 984, W - 1, 1000);
    // Cœur prismatique : immense vide étoilé.
    carve(80, 1124, 74, 66, 0.25);
    fill(0, 1188, W - 1, 1228 - 1);
    // Cuvettes des lacs (eau, eau verte, lave).
    carve(38, 98, 26, 4, 0.2);
    carve(42, 414, 24, 5, 0.2);
    carve(40, 752, 22, 5, 0.2);

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
    const lakeD = 95;
    pool(8, 70, lakeD, ['#0e2a40', '#123a58', '#1a4e72'], '#7ac0e8');
    anim.push({ type: 'tw', x: 30, y: at(lakeD), color: '#d8f2ff' }, { type: 'tw', x: 48, y: at(lakeD), color: '#d8f2ff' });
    [22, 36, 52].forEach((x) => anim.push({ type: 'drip', x, y0: ceilAbove(x, 80) + 1, y1: at(lakeD), ph: hash(x, 0, 610) * 3 }));
    fossil(FISH, 116, 72);
    fossil(TRILOBITE, 142, 74 - 2);
    [[8, 66], [62, 64], [144, 94], [104, 96], [6, 104], [120, 64]].forEach(([x, d]) => fossil(AMMONITE, x, d, { l: '#e8dcc0', m: '#c4b494', d: '#94866a' }));

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
    mine(4, 70, at(140), at(151));
    mine(90, 156, at(121), at(132));
    sprite(CART, 124, at(127), { b: '#3a3a44', o: '#e9c046', g: '#6b6f78', G: '#4e525a', w: '#1b1b1f' }, '#000000');
    sprite(PICKAXE, 40, at(146), { h: '#a8b0bc', b: '#8a5a2b' }, '#000000');
    [[23, at(142)], [108, at(123)], [147, at(123)]].forEach(([x, y]) => {
      sprite(LANTERN, x - 1, y, { o: '#2a2a30', y: '#ffd36b' }, null);
      anim.push({ type: 'glow', x, y: y + 3, r: 12, color: '255,200,100', a: 0.32, speed: 9, ph: x, flicker: true });
    });
    sprite(COBWEB, 4, at(140) + 2, { '#': '#6e6e7a' }, null);
    sprite(COBWEB.map((r) => [...r].reverse().join('')), 151, at(121) + 2, { '#': '#6e6e7a' }, null);

    // ---------- Caverne d'améthyste ----------
    for (let x = 14; x <= 62; x += 7) {
      const fy = floorBelow(x, 218);
      if (fy - at(218) < 30) cluster(x, fy, -1, GEMS.amethyst, x % 2 ? 1 : 1.3, 10);
      const cy = ceilAbove(x + 3, 218);
      if (at(218) - cy < 30 && hash(x, 1, 711) < 0.75) cluster(x + 3, cy, 1, GEMS.amethyst, 0.8, 20);
    }
    [[116, 196], [136, 196], [114, 256], [132, 256]].forEach(([x, d], i) => cluster(x, floorBelow(x, d), -1, GEMS.rose, i % 2 ? 1 : 0.8, 30));
    glow(38, at(220), 26, '190,120,255', 0.16, 1.2);
    // Petites géodes fermées dans la roche.
    [[108, 172], [148, 232], [10, 262], [98, 270]].forEach(([gx, d]) => {
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
    const pondD = 410;
    pool(14, 70, pondD, ['#06281e', '#0a3a2c', '#10503c'], '#7ef0c8');
    const fallTop = ceilAbove(30, 360);
    anim.push({ type: 'fall', x: 29, w: 4, y0: fallTop, y1: at(pondD), colors: ['#7ef0d8', '#3fc0b0', '#bff8ee', '#2a9a90'], speed: 40 });
    glow(31, at(pondD), 10, '120,255,220', 0.3, 3);
    [[13, 1], [16, 0], [68, 0], [72, 1], [112, 1], [118, 0], [128, 0], [136, 1]].forEach(([x, small]) => {
      const fy = floorBelow(x, x < 100 ? 380 : 424);
      if (x < 100 && fy >= at(pondD)) return;
      const pal = { c: x % 3 ? '#3fe0c0' : '#c070ff', s: '#e8fff8', t: '#cfe0c8' };
      sprite(small ? MUSH_S : MUSH, x - 2, fy - (small ? 2 : 4), pal, '#03100c');
      glow(x, fy - 3, small ? 6 : 9, x % 3 ? '80,255,210' : '200,120,255', 0.35, 1.5);
    });
    [[20, 372], [38, 372], [56, 372], [112, 424], [134, 424], [122, 320]].forEach(([x, d], i) => {
      const top = ceilAbove(x, d);
      const len = 8 + Math.floor(hash(x, d, 720) * 14);
      let px = x;
      for (let k = 0; k < len && isOpen(px, top + k); k++) {
        if (hash(x, k, 721) < 0.25) px += hash(x, k, 722) < 0.5 ? -1 : 1;
        set(px, top + k, k % 4 === 3 ? '#4fc884' : '#2a8a58');
      }
      set(px, top + len, '#c8ffe0');
      glow(px, top + len, 5, '150,255,200', 0.4, 2 + i * 0.3);
    });
    [[118, 320], [134, 320], [126, 320]].forEach(([x, d], i) => cluster(x, floorBelow(x, d), -1, GEMS.emerald, i === 2 ? 1.2 : 0.9, 40));
    anim.push({ type: 'fly', x: 42, y: at(360), rx: 26, ry: 30, n: 7, color: '#d8ff6a' }, { type: 'fly', x: 124, y: at(420), rx: 18, ry: 10, n: 4, color: '#d8ff6a' });

    // ---------- Lac de saphir : mer souterraine, cristaux bleus, méduses ----------
    const seaD = 556;
    pool(0, W - 1, seaD, ['#040c24', '#081838', '#0c2450', '#143268'], '#9ad0ff');
    for (let x = 14; x < W - 10; x += 9) {
      const cy = ceilAbove(x, 540);
      if (at(540) - cy < 34 && Math.abs(x - 80) > 12) cluster(x, cy, 1, GEMS.sapphire, hash(x, 2, 730) < 0.5 ? 1 : 0.7, 50);
    }
    [[30, 616], [130, 612]].forEach(([x, d]) => cluster(x, floorBelow(x, d), -1, GEMS.sapphire, 1.1, 60));
    for (let i = 0; i < 8; i++) anim.push({ type: 'tw', x: 10 + Math.floor(hash(i, 3, 731) * 140), y: at(seaD), color: '#ffffff' });
    [[30, 566], [110, 570], [56, 574], [136, 562]].forEach(([x, d], i) => anim.push({ type: 'jelly', x, y: at(d), ph: i * 1.7, pal: i % 2 ? { p: '#ff8ad8', w: '#ffe0f4' } : { p: '#6ae8ff', w: '#e0fbff' } }));

    // ---------- Forge des rubis : cascade de lave, rubis, obsidienne, braises ----------
    const lavaD = 748;
    pool(12, 70, lavaD, ['#ffd25a', '#f7a23b', '#e8742a', '#c4481f'], '#fff1a8');
    const lavaTop = ceilAbove(52, 712);
    anim.push({ type: 'fall', x: 51, w: 4, y0: lavaTop, y1: at(lavaD), colors: ['#ffd25a', '#f7a23b', '#e8742a', '#fff1a8'], speed: 18 });
    glow(53, at(lavaD), 22, '255,120,40', 0.28, 2);
    anim.push({ type: 'ember', x: 40, y: at(lavaD), w: 28 });
    for (let x = 16; x <= 64; x += 8) {
      const cy = ceilAbove(x, 712);
      if (at(712) - cy < 34 && Math.abs(x - 52) > 4) cluster(x, cy, 1, GEMS.ruby, 0.8, 70);
    }
    for (let x = 106; x <= 148; x += 7) {
      const fy = floorBelow(x, 792);
      cluster(x, fy, -1, x % 2 ? GEMS.obsidian : GEMS.ruby, x % 2 ? 1.3 : 1, 80);
    }
    cluster(122, floorBelow(122, 690), -1, GEMS.ruby, 1, 90);

    // ---------- Temple englouti : colonnes, idole, glyphes, braseros, trésor ----------
    const templeFloor = at(983);
    for (let x = 0; x < W; x++) set(x, templeFloor + 1, (x >> 3) % 2 ? '#b09c62' : '#8c7a48');
    const column = (cx, broken) => {
      const top = broken ? templeFloor - broken : ceilAbove(cx, 960);
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
    column(16, 0);
    column(40, 22);
    column(124, 0);
    column(148, 30);
    sprite(shaded(IDOL), 97, templeFloor - 14, { l: '#d8c48a', m: '#a8945a', d: '#6a5a32', e: '#2a1a08' }, '#1a1408');
    glow(101, templeFloor - 10, 4, '80,255,230', 0.6, 1.3);
    glow(108, templeFloor - 10, 4, '80,255,230', 0.6, 1.3);
    anim.push({ type: 'eyes', pts: [[100, templeFloor - 11], [101, templeFloor - 11], [107, templeFloor - 11], [108, templeFloor - 11], [100, templeFloor - 10], [101, templeFloor - 10], [107, templeFloor - 10], [108, templeFloor - 10]] });
    sprite(COINS, 52, templeFloor - 3, { y: '#e9c046', Y: '#fff1a8' }, '#3a2a08');
    anim.push({ type: 'tw', x: 55, y: templeFloor - 3, color: '#ffffff' });
    GLYPHS.forEach((g, i) => anim.push({ type: 'glyph', rows: g, x: 50 + (i % 3) * 6, y: at(930) + Math.floor(i / 3) * 6, ph: i * 0.9 }));
    GLYPHS.slice().reverse().forEach((g, i) => anim.push({ type: 'glyph', rows: g, x: 130 + (i % 2) * 6, y: at(926) + Math.floor(i / 2) * 6, ph: i * 1.1 + 3 }));
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

    // Puits : là où il traverse une grotte, on voit la foreuse pendre au bout de son câble.
    const shaftOpen = new Uint8Array(H);
    for (let y = 0; y < H; y++) shaftOpen[y] = isOpen(76, y) && isOpen(80, y) && isOpen(84, y) ? 1 : 0;
    return { anim, shaftOpen };
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

  global.Caves = { TIERS, tierIndex, build, drawAnim };
})(window);
