'use strict';

/*
 * Fêtes de podium en 16 bits (refonte, réservée au responsable) : module séparé branché sur l'écran « récap ».
 *   Celebrations16.scene(kind, data, canvas, { onTitle, onNames }) → joue la fête « day », « week » ou « month » ; renvoie une fonction d'arrêt.
 *   Celebrations16.paper(article)  → peint le fond « plan de mine sur papier » de la Gazette (canvas.bg déjà inséré dans l'article).
 *   Celebrations16.SIZE            → taille du canevas par genre.
 * Les temps (en secondes) sont ceux des repères sonores de Sound.celebrate : ne pas les changer sans prévenir le fil des sons.
 */
(function (global) {
  const SIZE = { day: [200, 170], week: [200, 220], month: [200, 240] };
  const hash = (n) => Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;
  const ease = (k) => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);
  const clamp01 = (k) => Math.max(0, Math.min(1, k));
  const COLORS = ['#ffd84a', '#ff6a8a', '#5ee0ff', '#b28cff', '#7fcf5a'];

  function firework(x, cx, cy, color, k, r) {
    if (k < 0.25) {
      const y = Math.round(cy + (1 - k / 0.25) * 90);
      x.fillStyle = '#fff2a8';
      x.fillRect(cx, y, 1, 2);
      x.fillStyle = '#ff9a3c';
      x.fillRect(cx, y + 2, 1, 2);
      return;
    }
    const q = (k - 0.25) / 0.75;
    const rr = q * r;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      x.globalAlpha = 1 - q * 0.8;
      x.fillStyle = color;
      x.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr + q * q * 8), 2, 2);
      if (q < 0.6) {
        x.fillStyle = '#ffffff';
        x.fillRect(Math.round(cx + Math.cos(a) * rr * 0.55), Math.round(cy + Math.sin(a) * rr * 0.55), 1, 1);
      }
    }
    x.globalAlpha = 1;
  }

  function confetti(x, t, W, H, n) {
    for (let i = 0; i < n; i++) {
      x.fillStyle = COLORS[i % COLORS.length];
      x.fillRect(Math.floor(hash(i + 1.7) * W) + Math.round(Math.sin(t * 2 + i) * 3), Math.floor((hash(i + 9.2) * H + t * (16 + (i % 5) * 6)) % H), i % 3 ? 2 : 1, i % 2 ? 3 : 2);
    }
  }

  const spriteOf = (e) => (e && global.Avatar ? Avatar.canvas(e.avatar, { scale: 1, view: 'full', finish: true }) : null);
  function moleSprite(mood, prop) {
    if (!global.Mole16) return null;
    const c = document.createElement('canvas');
    Mole16.draw(c, mood, null, prop);
    return c;
  }
  const byRank = (data, rank) => data.entries.find((e) => e.rank === rank) || null;

  /**
   * Fête du jour, plus modeste : une veillée dans une galerie. Trois lanternes s'allument, les trois premiers arrivent d'un pas tranquille
   * et montent sur leur caisse, petits feux d'étincelles, la taupe sort de son trou pour applaudir. Durée : 3,4 s.
   * Repères (Sound.celebrate('day')) : 0,3 / 0,6 / 0,9 lanternes, 0,5 → 1,9 pas, 2,0 sauts, 2,4 étincelles et taupe.
   */
  function day(data, x, W, H, hooks) {
    const top = [byRank(data, 1), byRank(data, 2), byRank(data, 3)];
    const sp = top.map(spriteOf);
    const mole = moleSprite('happy', null);
    const ground = 140;
    // [rang, centre x, hauteur de la caisse, indice dans top, départ (s)]
    const steps = [[2, 52, 12, 1, 1.0], [1, 100, 20, 0, 1.5], [3, 148, 7, 2, 0.5]];
    const lamps = [[34, 0.3], [100, 0.6], [166, 0.9]];
    const sparks = ['#ffd84a', '#ff6a8a', '#5ee0ff'];
    let shown = false;
    return (t) => {
      // Mur de galerie en roche, étais de bois
      x.fillStyle = '#16101a';
      x.fillRect(0, 0, W, H);
      for (let y = 0; y < ground; y += 4) for (let i = 0; i < W; i += 4) {
        const n = hash(i * 1.3 + y * 7.1);
        x.fillStyle = n > 0.8 ? '#241a2c' : n < 0.15 ? '#110b15' : '#1b1422';
        x.fillRect(i, y, 4, 4);
      }
      x.fillStyle = '#5a3a1e';
      x.fillRect(0, 10, W, 6);
      x.fillStyle = '#7c5230';
      x.fillRect(0, 10, W, 2);
      [14, 186].forEach((px) => { x.fillStyle = '#5a3a1e'; x.fillRect(px - 3, 10, 6, ground - 10); x.fillStyle = '#7c5230'; x.fillRect(px - 3, 10, 2, ground - 10); });
      // Lanternes qui s'allument une à une
      lamps.forEach(([lx, at]) => {
        const on = t > at;
        const flick = on ? 0.85 + 0.15 * Math.sin(t * 9 + lx) : 0;
        x.fillStyle = '#3a2c22';
        x.fillRect(lx, 16, 1, 14);
        x.fillStyle = on ? '#ffd84a' : '#4a3a20';
        x.fillRect(lx - 3, 30, 7, 9);
        x.fillStyle = '#16121c';
        x.fillRect(lx - 4, 29, 9, 2);
        x.fillRect(lx - 4, 38, 9, 2);
        if (on) {
          x.fillStyle = '#fff2a8';
          x.fillRect(lx - 1, 32, 3, 4);
          const g = x.createRadialGradient(lx, 38, 2, lx, 38, 52);
          g.addColorStop(0, `rgba(255, 216, 74, ${0.28 * flick})`);
          g.addColorStop(1, 'rgba(255, 216, 74, 0)');
          x.fillStyle = g;
          x.fillRect(lx - 52, 0, 104, ground);
        }
      });
      // Sol de planches et rails
      x.fillStyle = '#2a1a0c';
      x.fillRect(0, ground, W, H - ground);
      x.fillStyle = '#3d2814';
      for (let i = 0; i < W; i += 8) x.fillRect(i, ground + 16, 5, 3);
      x.fillStyle = '#8f99a8';
      x.fillRect(0, ground + 14, W, 2);
      // Étincelles (petits feux), puis confettis
      if (t > 2.4) {
        for (let i = 0; i < 3; i++) {
          const k = ((t - 2.4) * 0.7 + i / 3) % 1;
          firework(x, 40 + i * 60 + Math.floor(hash(i + Math.floor((t - 2.4) * 0.7 + i / 3) * 3) * 16), 50 + (i % 2) * 14, sparks[i], 0.25 + k * 0.75, 14);
        }
        confetti(x, t, W, ground, 16);
      }
      // Caisses de minerai
      steps.forEach(([rank, cx, hgt, , at], i) => {
        const hh = Math.round(hgt * ease((t - 1.0 - i * 0.2) / 0.5));
        if (hh <= 0) return;
        const y0 = ground + 14 - hh;
        x.fillStyle = '#6a4422';
        x.fillRect(cx - 14, y0, 28, hh);
        x.fillStyle = '#9a6a3a';
        x.fillRect(cx - 14, y0, 28, 2);
        x.fillStyle = '#432812';
        for (let yy = y0 + 6; yy < ground + 14; yy += 6) x.fillRect(cx - 14, yy, 28, 1);
        for (let j = 0; j < 5; j++) {
          x.fillStyle = rank === 1 ? (j % 2 ? '#ffd84a' : '#c8941c') : rank === 2 ? (j % 2 ? '#d6dbe3' : '#8a8f98') : (j % 2 ? '#e0a060' : '#8a5a2b');
          x.fillRect(cx - 11 + j * 5, y0 - 3 + (j % 2), 4, 3);
        }
      });
      // Les trois arrivent de la droite, d'un pas tranquille, puis sautent sur leur caisse
      steps.forEach(([rank, cx, hgt, ti, at]) => {
        const s = sp[ti];
        if (!s || t < at) return;
        const walk = clamp01((t - at) / 0.9);
        const jump = clamp01((t - 2.0) / 0.35);
        const standY = ground + 14 - hgt - 30;
        const floorY = ground + 14 - 29;
        let px = Math.round(W + 12 + (cx - 9 - W - 12) * ease(walk));
        let py = floorY - (walk < 1 ? Math.round(Math.abs(Math.sin(t * 9 + rank)) * 2) : 0);
        if (jump > 0) py = Math.round(floorY + (standY - floorY) * jump - Math.sin(jump * Math.PI) * 10);
        if (jump >= 1 && t > 2.4) py = standY - Math.round(Math.abs(Math.sin(t * 5 + rank)) * (rank === 1 ? 4 : 2));
        x.drawImage(s, px, py);
      });
      // La taupe sort de son trou et applaudit
      x.fillStyle = '#0a0608';
      x.fillRect(4, ground + 12, 40, 6);
      if (mole && t > 2.4) {
        const k = ease((t - 2.4) / 0.4);
        x.save();
        x.beginPath();
        x.rect(0, 0, 60, ground + 14);
        x.clip();
        x.drawImage(mole, 6, Math.round(ground + 14 - 33 * k - Math.abs(Math.sin(t * 7)) * (k > 0.9 ? 2 : 0)));
        x.restore();
      }
      if (t > 2.4 && !shown) {
        shown = true;
        hooks.onNames();
      }
    };
  }

  /** Fête de la semaine : wagons, caisses de minerai en podium, dynamite en feu d'artifice, taupe qui applaudit. */
  function week(data, x, W, H, hooks) {
    const top = [byRank(data, 1), byRank(data, 2), byRank(data, 3)];
    const sp = top.map(spriteOf);
    const mole = moleSprite('cheer', 'confetti');
    const ground = 186;
    // [rang, centre x, hauteur de la caisse, minerai clair, minerai sombre, indice dans top]
    const steps = [[2, 46, 30, '#d6dbe3', '#8a8f98', 1], [1, 100, 46, '#ffd84a', '#c8941c', 0], [3, 154, 20, '#e0a060', '#8a5a2b', 2]];
    let shown = false;
    return (t) => {
      x.fillStyle = '#100a14';
      x.fillRect(0, 0, W, H);
      for (let y = 0; y < ground; y += 4) {
        x.fillStyle = y < 60 ? '#140d1c' : y < 120 ? '#1a1124' : '#20152a';
        x.fillRect(0, y, W, 4);
      }
      for (let i = 0; i < W; i += 4) {
        const d = 6 + Math.round(hash(i) * 8);
        x.fillStyle = '#0a0608';
        x.fillRect(i, 0, 4, d);
        x.fillStyle = '#2a1e2e';
        x.fillRect(i, d, 4, 2);
      }
      for (let i = 0; i < 9; i++) {
        const lx = 12 + i * 22;
        const ly = 46 + Math.round(Math.sin(i * 0.9) * 3);
        x.fillStyle = '#3a2c22';
        x.fillRect(lx - 11, ly - 2, 22, 1);
        const on = t > 0.6 + i * 0.08;
        x.fillStyle = on ? '#ffd84a' : '#4a3a20';
        x.fillRect(lx - 1, ly, 3, 4);
        if (on) {
          x.fillStyle = 'rgba(255,216,74,0.18)';
          x.fillRect(lx - 4, ly - 2, 9, 9);
        }
      }
      if (t > 5.2) {
        for (let i = 0; i < 6; i++) {
          const k = ((t - 5.2) * 0.55 + i / 6) % 1;
          firework(x, 20 + Math.floor(hash(i * 3.1 + Math.floor((t - 5.2) * 0.55 + i / 6)) * 160), 46 + Math.floor(hash(i * 5.7) * 50), COLORS[i % COLORS.length], k, 22);
        }
      }
      x.fillStyle = '#2a1a0c';
      x.fillRect(0, ground, W, H - ground);
      x.fillStyle = '#3d2814';
      for (let i = 0; i < W; i += 8) x.fillRect(i, ground + 6, 5, 3);
      x.fillStyle = '#8f99a8';
      x.fillRect(0, ground + 4, W, 2);
      steps.forEach(([rank, cx, hgt, light, dark], i) => {
        const hh = Math.round(hgt * ease((t - 3.6 - i * 0.12) / 0.6));
        if (hh <= 0) return;
        const y0 = ground - hh;
        x.fillStyle = '#6a4422';
        x.fillRect(cx - 18, y0, 36, hh);
        x.fillStyle = '#9a6a3a';
        x.fillRect(cx - 18, y0, 36, 2);
        x.fillStyle = '#432812';
        for (let yy = y0 + 8; yy < ground; yy += 8) x.fillRect(cx - 18, yy, 36, 1);
        for (let j = 0; j < 7; j++) {
          x.fillStyle = j % 2 ? light : dark;
          x.fillRect(cx - 15 + j * 4 + (j % 2), y0 - 3 + (j % 3 === 0 ? 1 : 0), 4, 3);
        }
        if (hh > 14) {
          x.font = '8px "Press Start 2P", monospace';
          x.textAlign = 'center';
          x.fillStyle = '#16121c';
          x.fillText(String(rank), cx + 1, y0 + 13);
          x.fillStyle = light;
          x.fillText(String(rank), cx, y0 + 12);
        }
      });
      // Wagons : 3e, puis 2e, puis 1er arrivent de la gauche ; les gagnants sautent sur leur caisse.
      steps.forEach(([rank, cx, hgt, , , ti]) => {
        const order = rank === 3 ? 0 : rank === 2 ? 1 : 2;
        const wx = Math.round(-40 + (cx + 40) * ease((t - 1.2 - order * 0.6) / 1.6));
        const jump = clamp01((t - 4.4 - order * 0.15) / 0.5);
        const standY = ground - hgt - 33;
        const inY = ground - 26;
        let py = inY;
        let px = wx - 9;
        if (jump > 0) {
          py = Math.round(inY + (standY - inY) * jump - Math.sin(jump * Math.PI) * 18);
          px = cx - 9;
        }
        if (jump >= 1 && t > 5.2) py = standY - Math.round(Math.abs(Math.sin(t * 5 + rank)) * (rank === 1 ? 6 : 3));
        const away = jump > 0 ? Math.round(cx + Math.max(0, t - 4.6) * 140) : wx;
        if (away < W + 20) {
          x.fillStyle = '#16121c';
          x.fillRect(away - 14, ground - 14, 28, 15);
          x.fillStyle = '#8f99a8';
          x.fillRect(away - 13, ground - 13, 26, 12);
          x.fillStyle = '#c3cbd6';
          x.fillRect(away - 13, ground - 13, 26, 2);
          x.fillStyle = '#16121c';
          x.fillRect(away - 10, ground + 1, 5, 4);
          x.fillRect(away + 5, ground + 1, 5, 4);
        }
        if (t > 1.2 && sp[ti]) {
          x.save();
          if (jump === 0) {
            x.beginPath();
            x.rect(0, 0, W, ground - 10);
            x.clip();
          }
          x.drawImage(sp[ti], px, py);
          x.restore();
        }
      });
      if (mole && t > 5.4) x.drawImage(mole, Math.round(-48 + 52 * ease((t - 5.4) / 0.5)), H - 33 - Math.round(Math.abs(Math.sin(t * 6)) * 2));
      if (t > 5.2) confetti(x, t, W, ground, 40);
      if (t > 5.2 && !shown) {
        shown = true;
        hooks.onNames();
      }
    };
  }

  /** Fête du mois : la foreuse de la gagnante perce la voûte d'une géode, colonnes de cristal, coupe, grand feu d'artifice. */
  function month(data, x, W, H, hooks) {
    const top = [byRank(data, 1), byRank(data, 2), byRank(data, 3)];
    const sp = top.map(spriteOf);
    const mole = moleSprite('stars', null);
    const ground = 204;
    const cols = [[2, 46, 38, ['#e6ecf5', '#bcc6d6', '#8592a8'], 1], [1, 100, 62, ['#ffe0ff', '#e59cff', '#b45ee8'], 0], [3, 154, 26, ['#ffd0a8', '#e8925a', '#b85d2c'], 2]];
    const colors = ['#e59cff', '#ffd84a', '#5ee0ff', '#ffffff', '#ff8ad6'];
    // Foreuse de la gagnante : celle qu'elle a personnalisée (`hooks.drill`, quand elle existera), sinon la foreuse par défaut.
    const model = global.Drills16 && Drills16.MODELS.some((m) => m.id === hooks.drill) ? hooks.drill : 'bourdon';
    let shown = false;
    return (t) => {
      const light = clamp01(t / 1.2);
      x.fillStyle = '#08040e';
      x.fillRect(0, 0, W, H);
      for (let r = 120; r > 30; r -= 6) {
        x.fillStyle = ['#1a0f2e', '#2a1a48', '#3e2a66', '#24163a'][(r / 6) % 4];
        x.globalAlpha = 0.25 + 0.75 * light;
        x.beginPath();
        x.ellipse(W / 2, 140, r * 1.1, r, 0, 0, Math.PI * 2);
        x.fill();
      }
      x.globalAlpha = 1;
      for (let i = 0; i < 26; i++) {
        const a = Math.PI + (i / 25) * Math.PI;
        const px = Math.round(W / 2 + Math.cos(a) * 118);
        const py = Math.round(140 + Math.sin(a) * 108);
        x.globalAlpha = 0.4 + 0.6 * light * (0.7 + 0.3 * Math.sin(t * 2 + i));
        x.fillStyle = i % 3 ? '#b45ee8' : '#e59cff';
        x.fillRect(px - 2, py, 4, 7);
        x.fillRect(px - 1, py + 7, 2, 4);
        x.fillStyle = '#ffe0ff';
        x.fillRect(px - 1, py + 1, 1, 4);
      }
      x.globalAlpha = 1;
      if (t > 3.9) {
        x.fillStyle = 'rgba(255, 240, 160, 0.09)';
        const sway = Math.round(Math.sin(t * 0.8) * 16);
        for (let i = 0; i < 46; i++) {
          x.fillRect(22 + sway + i, 20 + i * 4, 6 + i * 0.7, 4);
          x.fillRect(172 - sway - i, 20 + i * 4, 6 + i * 0.7, 4);
        }
      }
      if (t > 4.2) {
        for (let i = 0; i < 9; i++) {
          const k = ((t - 4.2) * 0.5 + i / 9) % 1;
          firework(x, 22 + Math.floor(hash(i * 3.3 + Math.floor((t - 4.2) * 0.5 + i / 9)) * 156), 40 + Math.floor(hash(i * 4.9) * 60), colors[i % colors.length], k, 28);
        }
      }
      x.fillStyle = '#1a0f2e';
      x.fillRect(0, ground, W, H - ground);
      x.fillStyle = '#3e2a66';
      for (let i = 0; i < W; i += 6) x.fillRect(i, ground, 4, 2);
      cols.forEach(([rank, cx, hgt, pal, ti]) => {
        const hh = Math.round(hgt * ease((t - 3.0 - (rank === 1 ? 0.3 : ti * 0.1)) / 0.8));
        if (hh <= 0) return;
        const y0 = ground - hh;
        x.fillStyle = pal[2];
        x.fillRect(cx - 16, y0 + 4, 32, hh - 4);
        x.fillStyle = pal[1];
        x.fillRect(cx - 12, y0 + 2, 24, hh - 2);
        x.fillStyle = pal[0];
        x.fillRect(cx - 8, y0, 6, hh);
        x.fillRect(cx + 4, y0 + 6, 2, hh - 6);
        if (hh > 16) {
          x.font = '8px "Press Start 2P", monospace';
          x.textAlign = 'center';
          x.fillStyle = '#16121c';
          x.fillText(String(rank), cx + 1, y0 + 17);
          x.fillStyle = '#ffffff';
          x.fillText(String(rank), cx, y0 + 16);
        }
        if (sp[ti] && (rank !== 1 || t > 3.3)) x.drawImage(sp[ti], cx - 9, y0 - 30 - (t > 4.2 ? Math.round(Math.abs(Math.sin(t * 5 + rank)) * (rank === 1 ? 6 : 3)) : 0));
      });
      const down = ease((t - 1.0) / 1.6);
      const up = clamp01((t - 3.0) / 0.8);
      if (t > 1.0 && up < 1 && global.Drills16) {
        const hub = Drills16.draw(x, model, { tipX: 100, tipY: Math.round(-10 + down * 150 - up * up * 200), px: 1, time: t, drilling: t < 2.6, view: { w: W, h: H } });
        if (hub && top[0] && global.Avatar) {
          const f = Avatar.canvas(top[0].avatar, { scale: 1, view: 'head', finish: true });
          x.save();
          x.beginPath();
          x.arc(hub.cx, hub.cy, Math.max(2, hub.r), 0, Math.PI * 2);
          x.clip();
          x.drawImage(f, Math.round(hub.cx - f.width / 2), Math.round(hub.cy - f.height / 2));
          x.restore();
        }
        if (t < 3.2) {
          for (let i = 0; i < 10; i++) {
            const k = ((t - 1.0) * 1.3 + i / 10) % 1;
            x.fillStyle = i % 2 ? '#3e2a66' : '#5a4088';
            x.fillRect(Math.round(86 + hash(i) * 28 + (i % 2 ? k * 10 : -k * 10)), Math.round(18 + k * 170), 3, 3);
          }
        }
      }
      if (t > 3.9) {
        const cx = 100;
        const cy = ground - 114 + Math.round(Math.sin(t * 2) * 2);
        x.fillStyle = '#e0b020';
        x.fillRect(cx - 6, cy, 12, 7);
        x.fillRect(cx - 4, cy + 7, 8, 3);
        x.fillRect(cx - 1, cy + 10, 2, 3);
        x.fillRect(cx - 4, cy + 13, 8, 2);
        x.fillRect(cx - 9, cy + 1, 3, 4);
        x.fillRect(cx + 6, cy + 1, 3, 4);
        x.fillStyle = '#ffd84a';
        x.fillRect(cx - 4, cy + 1, 3, 5);
        if (Math.sin(t * 4) > 0.6) {
          x.fillStyle = '#ffffff';
          x.fillRect(cx + 3, cy - 3, 1, 3);
          x.fillRect(cx + 2, cy - 2, 3, 1);
        }
      }
      if (t > 4.2) {
        for (let i = 0; i < 14; i++) {
          const gx = Math.floor(hash(i * 2.1) * 190) + Math.round(Math.sin(t + i) * 3);
          const gy = Math.floor((hash(i + 3.3) * ground + t * (14 + (i % 4) * 5)) % ground);
          x.fillStyle = colors[i % colors.length];
          x.fillRect(gx + 1, gy, 1, 3);
          x.fillRect(gx, gy + 1, 3, 1);
        }
      }
      if (mole && t > 4.4) x.drawImage(mole, Math.round(76 + 130 * (1 - ease((t - 4.4) / 0.5))), H - 33);
      if (t > 3.9) hooks.onTitle();
      if (t > 4.2 && !shown) {
        shown = true;
        hooks.onNames();
      }
    };
  }

  /**
   * Joue la fête sur `canvas` (200 × 220 ou 200 × 240). hooks : onTitle() quand le titre peut apparaître (mois), onNames() quand
   * les noms s'affichent, drill = modèle de foreuse 16-bit de la gagnante (mois). Mouvement réduit : image finale fixe.
   */
  function scene(kind, data, canvas, hooks = {}, reduced = false) {
    const [W, H] = SIZE[kind] || SIZE.week;
    canvas.width = W;
    canvas.height = H;
    const x = canvas.getContext('2d');
    x.imageSmoothingEnabled = false;
    const noop = () => {};
    const h = { onTitle: noop, onNames: noop, drill: null, ...hooks };
    const draw = (kind === 'month' ? month : kind === 'day' ? day : week)(data, x, W, H, h);
    if (reduced) {
      draw(99);
      return noop;
    }
    const t0 = performance.now();
    let raf = requestAnimationFrame(function step(now) {
      if (!canvas.isConnected) return;
      draw((now - t0) / 1000);
      raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }

  /** Fond de la Gazette : papier déchiré, grille de géomètre, plan de la mine à l'encre pâle, rose des vents, tache de café, tampon, punaises. */
  function paper(article) {
    const c = article.querySelector('canvas.bg');
    if (!c) return;
    const W = Math.round(article.clientWidth / 3);
    const H = Math.round(article.clientHeight / 3);
    if (!W || !H) return;
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    for (let i = 0; i < W; i++) {
      const t = 1 + Math.floor(hash(i * 1.7) * 3);
      const b = H - 1 - Math.floor(hash(i * 2.9 + 4) * 3);
      for (let y = t; y <= b; y++) {
        const edge = Math.min(i, W - 1 - i, y - t, b - y);
        const n = hash(i * 3.1 + y * 7.7);
        x.fillStyle = edge < 2 ? '#c9b385' : edge < 5 ? '#ddca9c' : n > 0.92 ? '#ddcda4' : n < 0.06 ? '#f2e8cc' : '#e9dcb8';
        x.fillRect(i, y, 1, 1);
      }
    }
    x.fillStyle = 'rgba(90, 70, 40, 0.10)';
    for (let i = 6; i < W; i += 8) x.fillRect(i, 4, 1, H - 8);
    for (let y = 6; y < H; y += 8) x.fillRect(3, y, W - 6, 1);
    const ink = 'rgba(52, 60, 96, 0.30)';
    x.fillStyle = ink;
    const sx = Math.round(W * 0.82);
    x.fillRect(sx, 22, 1, H - 40);
    x.fillRect(sx + 6, 22, 1, H - 40);
    for (let y = 26; y < H - 20; y += 5) x.fillRect(sx + 1, y, 5, 1);
    x.fillRect(sx - 6, 18, 19, 1);
    x.fillRect(sx - 3, 12, 1, 6);
    x.fillRect(sx + 9, 12, 1, 6);
    x.fillRect(sx - 3, 12, 13, 1);
    x.font = '7px VT323, monospace';
    [0.2, 0.38, 0.55, 0.72, 0.88].forEach((f, i) => {
      const y = Math.round(H * f);
      const len = Math.round(W * (0.35 + hash(i + 2) * 0.35));
      x.fillRect(sx - len, y, len, 1);
      x.fillRect(sx - len, y + 5, len, 1);
      for (let k = sx - len; k < sx; k += 4) if (hash(k + i) > 0.5) x.fillRect(k, y + 2, 2, 1);
      const rx = sx - len - 10;
      x.strokeStyle = ink;
      x.strokeRect(rx + 0.5, y - 4.5, 10, 14);
      if (i % 2) x.fillRect(rx + 3, y + 9, 1, Math.round(H * 0.08));
      x.textAlign = 'right';
      x.fillText(`−${[60, 140, 230, 320, 430][i]} m`, sx - 3, y - 2);
      x.textAlign = 'left';
      x.fillText(`Galerie ${i + 1}`, Math.max(4, rx), y + 18);
    });
    x.save();
    x.translate(sx + 12, 60);
    x.rotate(Math.PI / 2);
    x.fillText('Puits Sainte-Barbe', 0, 0);
    x.restore();
    const cx = W - 22;
    const cy = 34;
    x.fillStyle = 'rgba(52, 60, 96, 0.28)';
    for (let r = 0; r < 9; r++) {
      x.fillRect(cx, cy - r, 1, 1);
      x.fillRect(cx, cy + r, 1, 1);
      x.fillRect(cx - r, cy, 1, 1);
      x.fillRect(cx + r, cy, 1, 1);
    }
    x.textAlign = 'center';
    x.fillText('N', cx, cy - 11);
    x.fillStyle = 'rgba(120, 80, 40, 0.16)';
    for (let a = 0; a < 80; a++) {
      const ang = (a / 80) * Math.PI * 2;
      const r = 11 + Math.round(hash(a) * 1.5);
      x.fillRect(Math.round(22 + Math.cos(ang) * r), Math.round(H * 0.62 + Math.sin(ang) * r), 2, 2);
    }
    x.save();
    x.translate(W - 34, H - 26);
    x.rotate(-0.22);
    x.strokeStyle = 'rgba(160, 30, 24, 0.45)';
    x.lineWidth = 1;
    x.strokeRect(-24.5, -8.5, 49, 15);
    x.fillStyle = 'rgba(160, 30, 24, 0.5)';
    x.textAlign = 'center';
    x.fillText('VU ET APPROUVÉ', 0, -1);
    x.fillText('le contremaître', 0, 5);
    x.restore();
    [[8, 6], [W - 9, 6]].forEach(([px, py]) => {
      x.fillStyle = '#16121c';
      x.fillRect(px - 2, py - 1, 5, 5);
      x.fillStyle = '#d02e22';
      x.fillRect(px - 1, py, 3, 3);
      x.fillStyle = '#ffc0b0';
      x.fillRect(px - 1, py, 1, 1);
    });
  }

  global.Celebrations16 = { scene, paper, SIZE };
})(window);
