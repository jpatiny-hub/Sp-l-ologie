'use strict';

/*
 * Icônes des badges, en pixel art 12 × 12, posées sur un jeton 16 × 16 coloré selon la catégorie.
 * Chaque caractère d'un motif renvoie à une couleur de PAL ; « . » est transparent.
 */
(function (global) {
  const PAL = {
    k: '#1b1410', w: '#ffffff', y: '#f2c230', Y: '#a77f12', o: '#f07a1a', O: '#c25410', r: '#d9342b', R: '#8f1f19',
    g: '#5fa83a', G: '#2f6b1f', b: '#5ec8f0', B: '#2f5fd0', p: '#f28bb3', v: '#9b59b6', s: '#c9ccd3', S: '#7d7d86',
    n: '#8a5a2b', e: '#ece4cf', c: '#9fe8ff', m: '#4a4040', K: '#0d0d10', W: '#fff6b0', N: '#3a3a3a',
  };

  const TOKENS = {
    serie: '#3f5c7a', profondeur: '#6e2818', pepites: '#6b5520', exploit: '#2f5a3a', podium: '#5a3a6e', calendrier: '#4f3f2c', themes: '#2f5f6e', entrainement: '#6e4a2f', defi: '#2f4f7a', duel: '#6e2f2f', reactions: '#7a2f5a',
  };

  // Coupe de la Terre : la couche atteinte est mise en valeur.
  function earth(level) {
    const rows = [];
    for (let y = 0; y < 12; y++) {
      let row = '';
      for (let x = 0; x < 12; x++) {
        const r = Math.hypot(x - 5.5, y - 5.5);
        if (r > 5.8) row += '.';
        else if (x >= 6 && y <= 5) row += r > 4.6 ? 'n' : r > 3.2 ? (level === 1 ? 'r' : 'R') : r > 1.8 ? (level === 2 ? 'o' : 'O') : level >= 3 ? (level === 4 && r < 0.9 ? 'w' : 'y') : 'Y';
        else row += r > 4.6 ? 'n' : 'g';
      }
      rows.push(row);
    }
    return rows;
  }

  const ICONS = {
    maison: ['............', '.....rr.....', '....rrrr....', '...rrrrrr...', '..rrrrrrrr..', '.rrrrrrrrrr.', '..eeeeeeee..', '..ebbeennee.', '..ebbeennee.', '..eeeeennee.', '..kkkkkkkkk.', '............'],
    enveloppe: ['............', '............', 'kkkkkkkkkkkk', 'keSeeeeeeSek', 'keeSeeeeSeek', 'keeeSeeSeeek', 'keeeeSSeeeek', 'keeeeeeeeeek', 'keeeeeeeeeek', 'kkkkkkkkkkkk', '............', '............'],
    journal: ['............', 'kkkkkkkkkkkk', 'kwwwwwwwwwwk', 'kwkkkkwSSSwk', 'kwwwwwwwwwwk', 'kwSSSwkkkkwk', 'kwSSSwwwwwwk', 'kwwwwwSSSSwk', 'kwkkkkwwwwwk', 'kwwwwwwwwwwk', 'kkkkkkkkkkkk', '............'],
    lampe: ['............', '....kkkk....', '...kyyyyk...', '..kyywwyyk..', '..kyywwyyk..', '..kyyyyyyk..', '...kkkkkk...', '..kSSSSSSk..', '..kS....Sk..', '..kS....Sk..', '...kkkkkk...', '............'],
    pioche: ['............', '..kkkkkkk...', '.kSSSSSSSk..', 'kSk..kn.kSk.', 'kk...kn..kk.', '.....kn.....', '.....kn.....', '.....kn.....', '.....kn.....', '.....kn.....', '.....kk.....', '............'],
    'couche-1': earth(1),
    'couche-2': earth(2),
    'couche-3': earth(3),
    'couche-4': earth(4),
    carotte: ['............', '...kkkkkk...', '..kSSSSSSk..', '..kneeeenk..', '..kneeeenk..', '..kSSSSSSk..', '..kneeeenk..', '..kneeeenk..', '..kSSSSSSk..', '...kkkkkk...', '............', '............'],
    pepite: ['............', '............', '....kkkk....', '...kyywyk...', '..kyyyyyYk..', '.kyywyyyYYk.', '.kyyyyyYYYk.', '..kYyyYYYk..', '...kkkkkk...', '............', '............', '............'],
    diamant: ['............', '...kkkkkk...', '..kwcwccck..', '.kkkkkkkkkk.', '.kcwcccccck.', '..kccccbck..', '...kcccbk...', '....kcbk....', '.....kk.....', '............', '............', '............'],
    belier: ['.kkkk..kkkk.', 'keeeekkkeeek', 'ke.kekkek.ek', 'ke.ksssk.kek', '.kkksssskkk.', '...ksksksk..', '...kssssssk.', '....kssssk..', '....kskksk..', '.....kkkk...', '............', '............'],
    explosion: ['.....kk.....', '.k..kyyk..k.', '.kk.kyyk.kk.', '..kkkoykkk..', 'kkyyooooyykk', '.kyoorroyok.', 'kkyoorroyykk', '..kkoyoykk..', '.kk.kyyk.kk.', '.k..kyyk..k.', '.....kk.....', '............'],
    muraille: ['kk.kk.kk.kk.', 'ksskssksskss', 'kSSkSSkSSkSS', 'kkkkkkkkkkkk', 'ksssksssksss', 'kSSSkSSSkSSS', 'kkkkkkkkkkkk', 'ksskssksskss', 'kSSkSSkSSkSS', 'kkkkkkkkkkkk', '............', '............'],
    cheval: ['....kk......', '...knnk.....', '...knnnkkk..', '...knnnnnnk.', '....knnnnnk.', '....knnnnnk.', '...knnnnnnk.', '...kn.kn.kn.', '...kn.kn.kn.', '...kk.kk.kk.', '............', '............'],
    miroir: ['..kkkkkkkk..', '.kcccccccck.', 'kcwcccccccck', 'kwccccccccck', 'kcccccccccck', 'kcccccccccck', 'kcccccccccck', 'kcccccccccck', '.kcccccccck.', '..kkkkkkkk..', '....kssk....', '...kkkkkk...'],
    jumeaux: ['.kkk....kkk.', 'kyyyk..kyyyk', 'kykyk..kykyk', 'kyyyk..kyyyk', 'kyryk..kyryk', '.kkk....kkk.', '.kbk....kbk.', 'kbbbk..kbbbk', 'kbbbk..kbbbk', '.kkk....kkk.', '............', '............'],
    bouclier: ['.kkkkkkkkkk.', '.kBBBBBBBBk.', '.kBBBBBBgBk.', '.kBBBBBgBBk.', '.kBgBBgBBBk.', '.kBBggBBBBk.', '..kBBgBBBk..', '..kBBBBBBk..', '...kBBBBk...', '....kBBk....', '.....kk.....', '............'],
    medaille: ['..kkk..kkk..', '..kRk..kRk..', '...kRkkRk...', '....kRRk....', '....kkkk....', '...kyyyyk...', '..kyywyyYk..', '..kyyyyyYk..', '..kyyyyYYk..', '...kYYYYk...', '....kkkk....', '............'],
    trophee: ['..kkkkkkkk..', '.kkywyyyykk.', 'k.kyyyyyyk.k', 'k.kyyyyyyk.k', '.kkyyyyyykk.', '...kyyyyk...', '....kYYk....', '....kYYk....', '...kkYYkk...', '..kYYYYYYk..', '..kkkkkkkk..', '............'],
    couronne: ['............', '............', '.y...yy...y.', '.yy.yyyy.yy.', '.yyyyyyyyyy.', '.yyrybbyryy.', '.yyyyyyyyyy.', '.YYYYYYYYYY.', '............', '............', '............', '............'],
    'feu-artifice': ['.....y......', '.r...y...b..', '..r..y..b...', '...r.y.b....', '....rwb.....', 'yyyywwwyyyy.', '....bwr.....', '...b.y.r....', '..b..y..r...', '.b...y...r..', '.....y......', '............'],
    feve: ['..y..y..y...', '..yyyyyyy...', '..yrryrry...', '............', '.kkkkkkkkk..', 'kYyyyyyyyYk.', 'kyyYyyYyyyk.', 'kYyyyyyyYyk.', '.kkkkkkkkk..', '............', '............', '............'],
    fossile: ['............', '....eeeee...', '..ee.....e..', '.e...eee..e.', '.e..e...e.e.', 'e..e..e.e.e.', 'e..e.ee.e.e.', 'e..e....e.e.', '.e..eeee..e.', '.e.......e..', '..eeeeeee...', '............'],
    coeur: ['............', '..rr....rr..', '.rwrr..rrrr.', '.rwrrrrrrrr.', '.rrrrrrrrrr.', '..rrrrrrrr..', '...rrrrrr...', '....rrrr....', '.....rr.....', '............', '............', '............'],
    'calendrier-29': ['.k.k....k.k.', 'kkkkkkkkkkkk', 'kRRRRRRRRRRk', 'kwwwwwwwwwwk', 'kwwkkkwkkkwk', 'kwwwwkwkwkwk', 'kwwkkkwkkkwk', 'kwwkwwwwwkwk', 'kwwkkkwkkkwk', 'kwwwwwwwwwwk', 'kkkkkkkkkkkk', '............'],
    pi: ['............', '............', '.bbbbbbbbbb.', '.bbbbbbbbbb.', '...bb...bb..', '...bb...bb..', '...bb...bb..', '...bb...bb..', '..bb....bb..', '..bb.....bb.', '............', '............'],
    poisson: ['............', '............', '....bbbb...b', '..bbbbbbb.bb', '.bkbbbbbbbbb', 'bbbbbbbbbbb.', '.bbbbbbbbbbb', '..bbbbbbb.bb', '....bbbb...b', '............', '............', '............'],
    globe: ['....kkkk....', '..kkBggBkk..', '.kBBggggBBk.', '.kBBBggBBgk.', 'kBBBBBgBBggk', 'kBggBBBBBBgk', 'kBgggBBBBBBk', 'kBBggBBBggBk', '.kBBBBBBggk.', '.kBBBBBBBBk.', '..kkBBBBkk..', '....kkkk....'],
    oeuf: ['....kkkk....', '...kwwwwk...', '..kwwwwwwk..', '..kppppppk..', '.kpwpwpwpwk.', '.kwwwwwwwwk.', '.kbbbbbbbbk.', '.kbwbwbwbwk.', '..kwwwwwwk..', '..kwwwwwwk..', '...kkkkkk...', '............'],
    'lampe-mineur': ['...kkkkkk...', '..kyyyyyyk..', '.kyyyWWyyyk.', 'kkkkkkkkkkkk', '.kmmmmmmmmk.', '.kmwmmmmwmk.', '.kmmmmmmmmk.', '.kmmmrrmmmk.', '..kmmmmmmk..', '...kkkkkk...', '............', '............'],
    'drapeau-fierte': ['............', 'kkkkkkkkkkkk', 'krrrrrrrrrrk', 'kooooooooook', 'kyyyyyyyyyyk', 'kggggggggggk', 'kBBBBBBBBBBk', 'kvvvvvvvvvvk', 'kkkkkkkkkkkk', '............', '............', '............'],
    'etoile-or': ['.....yy.....', '.....yy.....', '....yyyy....', 'yyyyyyyyyyyy', '.yyyyyyyyyy.', '..yyyyyyyy..', '...yyyyyy...', '..yyyyyyyy..', '..yyy..yyy..', '.yyy....yyy.', '.yy......yy.', '............'],
    // Lanterne de mineur (accueil : série en cours), dessinée sans jeton.
    'lanterne-mineur': ['....kkkk....', '...k....k...', '...k....k...', '..kkkkkkkk..', '..kSSSSSSk..', '..kyyWWyyk..', '..kyWWWWyk..', '..kyWWWWyk..', '..kyyWWyyk..', '..kSSSSSSk..', '..kkkkkkkk..', '...kk..kk...'],
    // Étai de galerie : cadre de boisage qui retient la galerie (gel de série).
    galerie: ['....kkkk....', '..kkyyyykk..', '.kyy....yyk.', '.ky......yk.', 'ky........yk', 'ky...kk...yk', 'ky..kyyk..yk', 'ky...kk...yk', 'ky........yk', 'kknnnnnnnnkk', 'k.k.k.k.k.k.', '............'],
    etai: ['kkkkkkkkkkkk', 'knnnnnnnnnnk', 'kkkkkkkkkkkk', '.knk....knk.', '.knk....knk.', '.knk....knk.', '.knk....knk.', '.knk....knk.', '.knk....knk.', '.knk....knk.', 'kkkkkkkkkkkk', '............'],
    fanion: ['..k.........', '..kkkk......', '..kyyyyk....', '..kyyyyyyk..', '..kyyyyk....', '..kkkk......', '..k.........', '..k.........', '..k.........', '..k.........', '.kkk........', '............'],
    eclair: ['......kk....', '.....kyyk...', '....kyyk....', '...kyyk.....', '..kyyyyyk...', '..kkkyyk....', '....kyyk....', '...kyyk.....', '...kyk......', '...kk.......', '............', '............'],
    sablier: ['..kkkkkkkk..', '..kssssssk..', '...kyyyyk...', '....kyyk....', '.....kk.....', '....kyyk....', '...kyyyyk...', '..kyyyyyyk..', '..kkkkkkkk..', '............', '............', '............'],
    'calendrier-plein': ['..k......k..', '.kkkkkkkkkk.', '.kRRRRRRRRk.', '.kkkkkkkkkk.', '.kwwwwwwwwk.', '.kwgwgwgwwk.', '.kwwwwwwwwk.', '.kwgwgwgwwk.', '.kwwwwwwwwk.', '.kwgwgwgwwk.', '.kkkkkkkkkk.', '............'],
    cible: ['....kkkk....', '..kkrrrrkk..', '.krrrwwrrrk.', '.krwwrrwwrk.', 'krrwrkkrwrrk', 'krrwrkkrwrrk', '.krwwrrwwrk.', '.krrrwwrrrk.', '..kkrrrrkk..', '....kkkk....', '............', '............'],
    oeil: ['............', '..kkkkkkkk..', '.kwwwwwwwwk.', 'kwwwbbbbwwwk', 'kwwbkkkkbwwk', 'kwwbkkwkbwwk', 'kwwwbkkbwwwk', '.kwwwwwwwwk.', '..kkkkkkkk..', '............', '............', '............'],
    note: ['......kkkkk.', '......kyyyk.', '......kkkyk.', '......k..yk.', '......k..yk.', '......k..yk.', '..kkkkk.kkkk', '.kyyyyk.kyyk', '.kyyyyk.kyyk', '..kkkk...kk.', '............', '............'],
    livre: ['.kkkkkkkkkk.', '.kBBBBBBBBk.', '.kBeeeeeeBk.', '.kBekkkkeBk.', '.kBeeeeeeBk.', '.kBekkkeeBk.', '.kBeeeeeeBk.', '.kBBBBBBBBk.', '.kkkkkkkkkk.', '............', '............', '............'],
    sabre: ['..........bb', '.........bbc', '........bbc.', '.......bbc..', '......bbc...', '.....bbc....', '....kkk.....', '...kSSk.....', '..kSSk......', '..kkk.......', '............', '............'],
    lanterne: ['.....kk.....', '....kkkk....', '...kkkkkk...', '..krrrrrrk..', '.krrrWWrrrk.', '.krrWWWWrrk.', '.krrWWWWrrk.', '.krrrWWrrrk.', '..krrrrrrk..', '...kkkkkk...', '....kkkk....', '.....kk.....'],
    sentier: ['............', '.....nnnn...', '....nnnnnn..', '.....nnnn...', '..nn........', '.nnnn.......', '..nn....nn..', '.......nnnn.', '........nn..', '.nn.........', 'nnnn........', '.nn.........'],
    autoroute: ['.....yy.....', '.....SS.....', '.....yy.....', '....SssS....', '....SyyS....', '...SssssS...', '...SsyysS...', '..SssssssS..', '..SssyyssS..', '.SssssssssS.', '.SsssyysssS.', '.SssssssssS.'],
    drapeau: ['.k..........', '.kNNNyyyrrr.', '.kNNNyyyrrr.', '.kNNNyyyrrr.', '.kNNNyyyrrr.', '.kNNNyyyrrr.', '.k..........', '.k..........', '.k..........', '.k..........', 'kkk.........', '............'],
    taupe: ['............', '............', '...mmmmm....', '..mmmmmmm...', '.mmkmmmmmm..', '.mmmmmmmmmpp', '.mmmmmmmmmpp', '..mmmmmmmm..', '..w.w..w.w..', '............', '............', '............'],
    citrouille: ['......G.....', '.....GG.....', '..kkkkkkkk..', '.kooOooOook.', '.kyyooooyyok', '.koyooooyook', '.koooooooook', '.koyyyyyyyok', '.kooyoyoyook', '..kkkkkkkk..', '............', '............'],
    crane: ['............', '...kkkkkk...', '..kwwwwwwk..', '.kwwwwwwwwk.', '.kwkkwwkkwk.', '.kwkkwwkkwk.', '.kwwwwwwwwk.', '..kwwkkwwk..', '..kwkwkwwk..', '...kkkkkk...', '............', '............'],
    fantome: ['...kkkkkk...', '..kwwwwwwk..', '.kwwwwwwwwk.', '.kwkkwwkkwk.', '.kwkkwwkkwk.', '.kwwwwwwwwk.', '.kwwwkkwwwk.', '.kwwwwwwwwk.', '.kwwwwwwwwk.', '.kwkwkwkwkk.', '.k.k.k.k.k..', '............'],
    coquelicot: ['............', '...rr..rr...', '..rrrrrrrr..', '..rrrkkrrr..', '..rrkkkkrr..', '..rrrkkrrr..', '...rrrrrr...', '.....g......', '.....g..g...', '.....g.gg...', '.....gg.....', '.....g......'],
    casque: ['............', '....kkkk....', '...kyyyyk...', '..kyywwyyk..', '..kyyWWyyk..', '.kyyyyyyyyk.', 'kkkkkkkkkkkk', 'kYYYYYYYYYYk', '.kkkkkkkkkk.', '............', '............', '............'],
    mitre: ['.....yy.....', '....ryyr....', '...rryyrr...', '..rrryyrrr..', '..rrryyrrr..', '..rrryyrrr..', '..yyyyyyyy..', '..rrryyrrr..', '..rrryyrrr..', '..yyyyyyyy..', '............', '............'],
    sapin: ['.....y......', '....yyy.....', '.....g......', '....ggg.....', '...gggrg....', '...ggggg....', '..ggrgggg...', '..ggggggg...', '.gggggggrg..', '.ggggggggg..', '.....n......', '....nnn.....'],
    horloge: ['...kkkkkk...', '..kwwwwwwk..', '.kwwwkwwwwk.', 'kwwwwkwwwwwk', 'kwwwwkwwwwwk', 'kwwwwkwwwwwk', 'kwwwwwwwwwwk', 'kwwwwwwwwwwk', '.kwwwwwwwwk.', '..kwwwwwwk..', '...kkkkkk...', '............'],
    chat: ['.K........K.', '.KK......KK.', '.KKK....KKK.', '.KKKKKKKKKK.', 'KKKKKKKKKKKK', 'KKyyKKKKyyKK', 'KKyyKKKKyyKK', 'KKKKKppKKKKK', '.KKKKKKKKKK.', '..KKKKKKKK..', '............', '............'],
  };

  // Trophées des titres de mineur (1, 5, 10, 30, 100, 200 et 300 jours forés) : la coupe, dans une matière de plus en plus précieuse.
  [['n', 'm', 'e'], ['o', 'O', 'W'], ['s', 'S', 'w'], ['y', 'Y', 'W'], ['g', 'G', 'W'], ['c', 'b', 'w'], ['r', 'R', 'y']].forEach(([body, shade, light], i) => {
    ICONS[`titre-${i + 1}`] = ICONS.trophee.map((row) => [...row].map((ch) => (ch === 'y' ? body : ch === 'Y' ? shade : ch === 'w' ? light : ch)).join(''));
  });

  // Chiffres 3 × 5 pour le nombre affiché sur certains badges (série, pépites).
  const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111'];

  /** Dessine le badge dans un canevas 16 × 16. */
  function drawBadge(canvas, { icon, category, label, locked }) {
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 16, 16);
    // Jeton aux coins arrondis.
    ctx.fillStyle = locked ? '#2a2420' : TOKENS[category] || '#4f3f2c';
    ctx.fillRect(1, 0, 14, 16);
    ctx.fillRect(0, 1, 16, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(1, 1, 14, 1);
    const rows = ICONS[icon] || ICONS.pioche;
    rows.forEach((row, y) => {
      for (let x = 0; x < 12; x++) {
        const ch = row[x];
        if (!ch || ch === '.') continue;
        ctx.fillStyle = locked ? '#4a403a' : PAL[ch];
        ctx.fillRect(x + 2, y + 2, 1, 1);
      }
    });
    if (label && !locked) {
      const digits = [...String(label)];
      let x = 16 - digits.length * 4;
      ctx.fillStyle = '#000';
      ctx.fillRect(x - 1, 10, digits.length * 4 + 1, 6);
      digits.forEach((d) => {
        const bits = DIGITS[Number(d)];
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 15; i++) if (bits[i] === '1') ctx.fillRect(x + (i % 3), 11 + Math.floor(i / 3), 1, 1);
        x += 4;
      });
    }
  }

  /** Dessine une icône seule (sans jeton) sur un canvas de 16 × 16. */
  function drawIcon(canvas, icon, { dim = false } = {}) {
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 16, 16);
    (ICONS[icon] || ICONS.pioche).forEach((row, y) => {
      for (let x = 0; x < 12; x++) {
        const ch = row[x];
        if (!ch || ch === '.') continue;
        ctx.fillStyle = dim ? '#4a403a' : PAL[ch];
        ctx.fillRect(x + 2, y + 2, 1, 1);
      }
    });
  }

  /** Niveau de la flamme de la lanterne selon la série : de 1 (braise) à 5 (30 jours d'affilée ou plus). */
  function lanternLevel(days) {
    return days >= 30 ? 5 : days >= 14 ? 4 : days >= 7 ? 3 : days >= 3 ? 2 : days >= 1 ? 1 : 0;
  }

  // Intérieur de la lanterne (rangées 5 à 8, 6 colonnes) pour chaque niveau de flamme.
  const FLAMES = {
    0: ['SSSSSS', 'SSSSSS', 'SSSSSS', 'SSSSSS'],
    1: ['SSSSSS', 'SSSSSS', 'SSSSSS', 'SSooSS'],
    2: ['SSSSSS', 'SSSSSS', 'SSyySS', 'SyWWyS'],
    3: ['yyWWyy', 'yWWWWy', 'yWWWWy', 'yyWWyy'],
    4: ['yWWWWy', 'WWWWWW', 'WWWWWW', 'yWWWWy'],
    5: ['WWWWWW', 'WWWWWW', 'WWWWWW', 'WWWWWW'],
  };

  /** Lanterne de mineur dont la flamme grandit avec la série (jusqu'à un mois d'affilée). */
  function drawLantern(canvas, days, { dim = false } = {}) {
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 16, 16);
    const level = lanternLevel(days);
    const rows = ICONS['lanterne-mineur'].slice();
    FLAMES[level].forEach((inner, i) => {
      const row = rows[5 + i];
      rows[5 + i] = row.slice(0, 3) + inner + row.slice(9);
    });
    rows.forEach((row, y) => {
      for (let x = 0; x < 12; x++) {
        const ch = row[x];
        if (!ch || ch === '.') continue;
        ctx.fillStyle = dim ? '#4a403a' : PAL[ch];
        ctx.fillRect(x + 2, y + 2, 1, 1);
      }
    });
    // Étincelles autour de la lanterne quand la flamme est bien vive.
    if (!dim && level >= 4) {
      ctx.fillStyle = PAL.W;
      ctx.fillRect(1, 5, 1, 1);
      ctx.fillRect(14, 8, 1, 1);
      if (level === 5) {
        ctx.fillStyle = PAL.y;
        ctx.fillRect(0, 9, 1, 1);
        ctx.fillRect(15, 4, 1, 1);
        ctx.fillRect(2, 0, 1, 1);
      }
    }
  }


  // Icônes 16-bit de la barre du bas (refonte) : 16 × 16, contour sombre, ombrage venant d'en haut à gauche.
  const NAV16_PAL = { k: '#120c08', l: '#b9afb6', s: '#8a8088', S: '#5d555e', d: '#2b2330', R: '#7a2a14', o: '#f08a24', O: '#b85a12', y: '#ffc25a', W: '#fff2b0', w: '#ffffff', N: '#5a3a1c', n: '#8a5a2b', c: '#bff4ff', b: '#4fb6ec', B: '#2a5fc0', e: '#efe6cf', m: '#a89a78', r: '#d9342b' };
  const NAV16 = {"home": ["................", "......kkkk......", ".....klsssk.....", "....klsssssk....", "...klsddddssk...", "..klsddddddssk..", "..ksdddRRdddsk..", ".kssddRRRRddssk.", ".ksddRRooRRddsk.", ".ksddRooooRddsk.", "kssdRooyyooRdssk", "ksddRoyyyyoRddsk", "ksddRoyyyyoRddsk", "ksddRoyWWyoRddsk", "ksddRoyWWyoRddsk", ".kkkkkkkkkkkkkk."], "play": ["......kkkkkk....", "....kkWWWWWskk..", "...kWWsssssWWsk.", "..kWsssskkksWWsk", ".kWsskkk...ksWWs", ".kssk.....kNnsWs", "kSssk....kNnnkSs", "kSsk....kNnnkkSs", ".kk....kNnnk..kk", "......kNnnk.....", ".....kNnnk......", "....kNnnk.......", "...kNnnk........", "..kNnnk.........", "..knnk..........", "...kk..........."], "defis": ["................", ".......kk.......", ".....kkWck......", "....kwwWcck.....", "....kwWWccck....", "...kWWWWWWWWk...", "..kccccbbBBBBk..", ".kcccccbbBBBBBk.", "kccccccbBBBBBBBk", ".kcccccbBBBBBBk.", "..kccccbBBBBBk..", "...kcccbBBBBk...", "....kccbBBBk....", ".....kcbBBk.....", "......kbbk......", ".......kk......."], "messages": ["................", "................", ".kkkkkkkkkkkkkk.", "kwwwwwwwwwwwwwwk", "kemmwewewewemmek", "keeemwewewemeeek", "keeeemwewemeeeek", "keeeeerRRreeeeek", "keeeeeRmrreeeeek", "keeeeererreeeeek", "keeeeeeeeeeeeeek", "keeeeeeeeeeeeeek", "kmmmmmmmmmmmmmmk", ".kkkkkkkkkkkkkk.", "................", "................"], "mine": ["............k...", "...........kWk..", ".......kkkkWwWk.", "......kWWykkwk..", "....kkWWyyykk...", "...kWWWyyyyokk..", "..kWWwwyyyooook.", ".kWWWwyyyooooOk.", ".kWWyyyyooooOOOk", ".kWyyyyooooOOOOk", ".kyyyyooooOOOOk.", "..kyyooooOOOOOk.", "..kyooooOOOOkk..", "...koooOOOOk....", "....kkOOOkk.....", "......kkk......."], "admin": [".kkkkkkkkkkkkkk.", "kssssssssssssssk", "kssbbbbbBBBBBSSk", "kssbbbbbBBBBBSSk", "kssbbbbbBBBBBSSk", "kssbbbbbBBBwBSSk", "kssbbbbbBBwwBSSk", "kssbbwbbBwwBBSSk", "kssbbwwbwwBBBSSk", "kssbbbwwwBBBBSSk", ".kksbbbwBBBBSkk.", "...ksbbbBBBSk...", "....ksbbBBSk....", ".....ksbBSk.....", "......ksSk......", ".......kk......."]};
  /** Dessine l'icône 16-bit d'un onglet du bas (home, play, defis, messages, mine, admin) ; faux s'il n'y en a pas. */
  function drawNav16(canvas, kind) {
    const rows = NAV16[kind];
    if (!rows) return false;
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 16, 16);
    rows.forEach((row, y) => {
      for (let x = 0; x < 16; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        ctx.fillStyle = NAV16_PAL[ch];
        ctx.fillRect(x, y, 1, 1);
      }
    });
    return true;
  }

  global.Icons = { drawBadge, drawIcon, drawLantern, lanternLevel, drawNav16 };
})(window);
