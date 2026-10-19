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
    serie: '#3f5c7a', profondeur: '#6e2818', pepites: '#6b5520', exploit: '#2f5a3a', podium: '#5a3a6e', calendrier: '#4f3f2c', themes: '#2f5f6e',
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
    lampe: ['............', '....kkkk....', '...kyyyyk...', '..kyywwyyk..', '..kyywwyyk..', '..kyyyyyyk..', '...kkkkkk...', '..kSSSSSSk..', '..kS....Sk..', '..kS....Sk..', '...kkkkkk...', '............'],
    pioche: ['............', '..kkkkkkk...', '.kSSSSSSSk..', 'kSk..kn.kSk.', 'kk...kn..kk.', '.....kn.....', '.....kn.....', '.....kn.....', '.....kn.....', '.....kn.....', '.....kk.....', '............'],
    'couche-1': earth(1),
    'couche-2': earth(2),
    'couche-3': earth(3),
    'couche-4': earth(4),
    carotte: ['............', '...kkkkkk...', '..kSSSSSSk..', '..kneeeenk..', '..kneeeenk..', '..kSSSSSSk..', '..kneeeenk..', '..kneeeenk..', '..kSSSSSSk..', '...kkkkkk...', '............', '............'],
    pepite: ['............', '............', '....kkkk....', '...kyywyk...', '..kyyyyyYk..', '.kyywyyyYYk.', '.kyyyyyYYYk.', '..kYyyYYYk..', '...kkkkkk...', '............', '............', '............'],
    diamant: ['............', '...kkkkkk...', '..kwcwccck..', '.kkkkkkkkkk.', '.kcwcccccck.', '..kccccbck..', '...kcccbk...', '....kcbk....', '.....kk.....', '............', '............', '............'],
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
    lanterne: ['.....kk.....', '....kkkk....', '...kkkkkk...', '..krrrrrrk..', '.krrrWWrrrk.', '.krrWWWWrrk.', '.krrWWWWrrk.', '.krrrWWrrrk.', '..krrrrrrk..', '...kkkkkk...', '....kkkk....', '.....kk.....'],
    sentier: ['............', '.....nnnn...', '....nnnnnn..', '.....nnnn...', '..nn........', '.nnnn.......', '..nn....nn..', '.......nnnn.', '........nn..', '.nn.........', 'nnnn........', '.nn.........'],
    autoroute: ['.....yy.....', '.....SS.....', '.....yy.....', '....SssS....', '....SyyS....', '...SssssS...', '...SsyysS...', '..SssssssS..', '..SssyyssS..', '.SssssssssS.', '.SsssyysssS.', '.SssssssssS.'],
    drapeau: ['.k..........', '.kNNNyyyrrr.', '.kNNNyyyrrr.', '.kNNNyyyrrr.', '.kNNNyyyrrr.', '.kNNNyyyrrr.', '.k..........', '.k..........', '.k..........', '.k..........', 'kkk.........', '............'],
    taupe: ['............', '............', '...mmmmm....', '..mmmmmmm...', '.mmkmmmmmm..', '.mmmmmmmmmpp', '.mmmmmmmmmpp', '..mmmmmmmm..', '..w.w..w.w..', '............', '............', '............'],
    citrouille: ['......G.....', '.....GG.....', '..kkkkkkkk..', '.kooOooOook.', '.kyyooooyyok', '.koyooooyook', '.koooooooook', '.koyyyyyyyok', '.kooyoyoyook', '..kkkkkkkk..', '............', '............'],
    fantome: ['...kkkkkk...', '..kwwwwwwk..', '.kwwwwwwwwk.', '.kwkkwwkkwk.', '.kwkkwwkkwk.', '.kwwwwwwwwk.', '.kwwwkkwwwk.', '.kwwwwwwwwk.', '.kwwwwwwwwk.', '.kwkwkwkwkk.', '.k.k.k.k.k..', '............'],
    coquelicot: ['............', '...rr..rr...', '..rrrrrrrr..', '..rrrkkrrr..', '..rrkkkkrr..', '..rrrkkrrr..', '...rrrrrr...', '.....g......', '.....g..g...', '.....g.gg...', '.....gg.....', '.....g......'],
    casque: ['............', '....kkkk....', '...kyyyyk...', '..kyywwyyk..', '..kyyWWyyk..', '.kyyyyyyyyk.', 'kkkkkkkkkkkk', 'kYYYYYYYYYYk', '.kkkkkkkkkk.', '............', '............', '............'],
    mitre: ['.....yy.....', '....ryyr....', '...rryyrr...', '..rrryyrrr..', '..rrryyrrr..', '..rrryyrrr..', '..yyyyyyyy..', '..rrryyrrr..', '..rrryyrrr..', '..yyyyyyyy..', '............', '............'],
    sapin: ['.....y......', '....yyy.....', '.....g......', '....ggg.....', '...gggrg....', '...ggggg....', '..ggrgggg...', '..ggggggg...', '.gggggggrg..', '.ggggggggg..', '.....n......', '....nnn.....'],
    horloge: ['...kkkkkk...', '..kwwwwwwk..', '.kwwwkwwwwk.', 'kwwwwkwwwwwk', 'kwwwwkwwwwwk', 'kwwwwkwwwwwk', 'kwwwwwwwwwwk', 'kwwwwwwwwwwk', '.kwwwwwwwwk.', '..kwwwwwwk..', '...kkkkkk...', '............'],
    chat: ['.K........K.', '.KK......KK.', '.KKK....KKK.', '.KKKKKKKKKK.', 'KKKKKKKKKKKK', 'KKyyKKKKyyKK', 'KKyyKKKKyyKK', 'KKKKKppKKKKK', '.KKKKKKKKKK.', '..KKKKKKKK..', '............', '............'],
  };

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

  global.Icons = { drawBadge };
})(window);
