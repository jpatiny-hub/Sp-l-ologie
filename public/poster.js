'use strict';

/*
 * Affiche du 31 octobre : épouvantail à tête de citrouille aux flammes vertes, dessiné par code dans un canevas 200 x 120
 * (palette limitée, tramage ordonné, graine fixe : le dessin est toujours identique). Poster.draw(canvas) le peint.
 */
(function (global) {
    var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    function bayer(x, y) { return (BAYER[(y & 3) * 4 + (x & 3)] + .5) / 16; }
    function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    var HEX = {};
    function rgb(c) { if (!HEX[c]) HEX[c] = [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)]; return HEX[c]; }

    var THEMES = {
      vert: {
        flame: ['#efffd6', '#9dff5a', '#3fcf3a', '#1a7a2a'],
        wisp: ['#efffd6', '#9dff5a', '#3fcf3a', '#1a7a2a'],
        eyeEdge: '#7dff5a', eyeCore: '#efffd6',
        mouth: ['#efffd6', '#9dff5a', '#3fcf3a'],
        glow: [70, 230, 80], ember: ['#9dff5a', '#3fcf3a', '#efffd6']
      }
    };

    function draw(canvas, theme, seed) {
      var W = canvas.width, H = canvas.height, ctx = canvas.getContext('2d');
      var img = ctx.createImageData(W, H), D = img.data, R = mulberry(seed), T = THEMES[theme];
      function put(x, y, c) {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        var k = rgb(c), i = (y * W + x) * 4; D[i] = k[0]; D[i + 1] = k[1]; D[i + 2] = k[2]; D[i + 3] = 255;
      }
      function get(x, y) { var i = (y * W + x) * 4; return [D[i], D[i + 1], D[i + 2]]; }
      function line(x0, y0, x1, y1, c, w) {
        w = w || 1; var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
        for (var i = 0; i <= n; i++) {
          var x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
          for (var a = 0; a < w; a++) for (var b = 0; b < w; b++) put(x + a - (w >> 1), y + b - (w >> 1), c);
        }
      }
      function inPoly(pts, px, py) {
        var c = false;
        for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
          if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c;
        }
        return c;
      }
      function bbox(pts) { var a = 1e9, b = 1e9, c = -1e9, d = -1e9; pts.forEach(function (p) { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); }); return [Math.floor(a), Math.floor(b), Math.ceil(c), Math.ceil(d)]; }
      function fillPoly(pts, colorAt) {
        var b = bbox(pts);
        for (var y = b[1]; y <= b[3]; y++) for (var x = b[0]; x <= b[2]; x++) if (inPoly(pts, x + .5, y + .5)) { var c = typeof colorAt === 'function' ? colorAt(x, y) : colorAt; if (c) put(x, y, c); }
      }
      function pick(ramp, v, x, y) { var i = Math.floor(v * (ramp.length - 1) + bayer(x, y) * .98); return ramp[Math.max(0, Math.min(ramp.length - 1, i))]; }
      function blendTo(x, y, col, a) { if (x < 0 || y < 0 || x >= W || y >= H) return; if (bayer(x, y) < a) put(x, y, col); }

      // ---- Ciel et brume ----
      var PURPLE = ['#0a0812', '#151021', '#21172f', '#33223f', '#4a3354', '#6a4a72'];
      var TEAL = ['#060e0e', '#0a1716', '#0f2221', '#16302d'];
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var f = Math.exp(-((x - 118) * (x - 118) / (2 * 42 * 42) + (y - 64) * (y - 64) / (2 * 32 * 32)));
        var top = Math.min(1, y / 40);
        var v = f * (.45 + .55 * top);
        if (v + (bayer(x, y) - .5) * .25 > .28) put(x, y, pick(PURPLE, Math.min(1, v * 1.25), x, y));
        else put(x, y, pick(TEAL, .25 + .55 * (y / H), x, y));
      }

      // ---- Arbres morts (fond) ----
      function branch(x, y, ang, len, w, depth) {
        for (var i = 0; i < len; i++) {
          ang += (R() - .5) * .35;
          x += Math.cos(ang); y += Math.sin(ang);
          put(x, y, '#0d0a14'); if (w > 1) put(x + 1, y, '#0d0a14');
          if (depth > 0 && R() < .07) branch(x, y, ang + (R() < .5 ? -.7 : .7), len * .5, 1, depth - 1);
        }
      }
      [[140, 90, -1.57, 70, 2], [176, 90, -1.5, 60, 2], [96, 90, -1.62, 50, 1], [196, 70, -1.7, 40, 2], [4, 40, -.3, 40, 1]].forEach(function (t) { branch(t[0], t[1], t[2], t[3], t[4], 3); });
      var GY = 88;

      // ---- Sol ----
      var G = ['#08150f', '#0d241b', '#143628', '#1f4a36'];
      for (var gy = GY; gy < H; gy++) for (var gx = 0; gx < W; gx++) {
        var near = Math.exp(-((gx - 150) * (gx - 150) / (2 * 40 * 40)));
        put(gx, gy, pick(G, .15 + .5 * near + .25 * (1 - (gy - GY) / (H - GY)) * .6, gx, gy));
      }
      for (var gx2 = 0; gx2 < W; gx2++) if (R() < .5) { var gl = 2 + Math.floor(R() * 3); for (var k = 0; k < gl; k++) put(gx2, GY - k + (R() < .3 ? 1 : 0), k === gl - 1 ? '#2d6a4a' : '#143628'); }
      for (var s = 0; s < 70; s++) { var tx = Math.floor(R() * W), ty = GY + 2 + Math.floor(R() * (H - GY - 3)); put(tx, ty, '#2b6a4c'); put(tx, ty - 1, '#2b6a4c'); }

      // ---- Lueur chaude autour de la tête ----
      var hx = 46, hy = 40;
      for (var ly = 0; ly < H; ly++) for (var lx = 0; lx < W; lx++) {
        var d = Math.hypot(lx - hx, (ly - hy) * 1.1) / 62;
        if (d < 1) { var a = (1 - d) * (1 - d) * .75; if (bayer(lx, ly) < a) { var p = get(lx, ly); put(lx, ly, '#' + [0, 1, 2].map(function (i) { var m = Math.round(p[i] * .5 + T.glow[i] * .35); return ('0' + Math.min(255, m).toString(16)).slice(-2); }).join('')); } }
      }

      // ---- Bougies fondues (premier plan droit) ----
      function flame(fx, fy, h, c) {
        for (var i = 0; i < h; i++) { var wdt = i < h * .35 ? 1 : (i < h * .7 ? 2 : 3); var cc = i < h * .3 ? T.flame[0] : i < h * .6 ? T.flame[1] : i < h * .85 ? T.flame[2] : T.flame[3]; for (var j = 0; j < wdt; j++) put(fx - (wdt >> 1) + j + (i < 2 ? 0 : 0), fy - i, cc); }
        put(fx, fy - h, T.flame[3]);
      }
      function wisp(x, y, ang, len, curve, cols) {
        for (var i = 0; i < len; i++) {
          ang += curve + (R() - .5) * .25; x += Math.cos(ang); y += Math.sin(ang);
          var c = cols[Math.min(cols.length - 1, Math.floor(i / len * cols.length))];
          if (R() < 1 - i / len * .7) put(x, y, c);
          if (R() < .25) put(x + 1, y, c);
        }
      }
      function candle(cx, base, w, h, melt) {
        var topY = base - h, left = cx - w / 2, right = cx + w / 2;
        for (var y = topY; y < base; y++) for (var x = left; x < right; x++) {
          var u = (x - left) / w, vv = (y - topY) / h;
          var wob = Math.sin(u * 9 + melt) * 3 + Math.sin(u * 17 + melt * 2) * 1.5;
          var edgeTop = topY + 3 + wob + Math.pow(Math.abs(u - .5) * 2, 2) * 9;
          if (y < edgeTop) continue;
          var drip = Math.sin(u * 14 + melt * 3);
          if (u < .04 + .05 * Math.sin(y / 3 + melt) || u > .98 - .04 * Math.sin(y / 4 + melt * 2)) continue;
          var c = u < .3 ? '#f1e6bd' : u < .62 ? '#dcc994' : u < .85 ? '#b9a370' : '#8a7a52';
          if (drip > .7 && vv > .12) c = u < .5 ? '#cdb985' : '#a08c5c';
          if (Math.sin(u * 23 + melt) > .93 && vv > .2) c = '#7a6a45';
          if ((x * 3 + y * 7) % 11 === 0 && u < .5) c = '#fff6d8';
          if (y < topY + 11 && bayer(x, y) < .3 * (1 - (y - topY) / 11)) c = T.flame[1];
          put(x, y, c);
        }
        // gouttes de cire
        for (var i = 0; i < 3; i++) { var dx = left + 3 + R() * (w - 6), dl = 4 + R() * h * .25; for (var j = 0; j < dl; j++) put(dx, topY + h * .25 + j, '#c9b57e'); put(dx, topY + h * .25 + dl, '#f1e6bd'); }
        // mèche et flamme
        var wx = cx + (R() - .5) * 3, wy = topY + 2;
        line(wx, wy, wx + 1, wy - 6, '#1a1210', 1);
        flame(wx + 1, wy - 7, 7, T.flame);
        wisp(wx + 1, wy - 16, -1.6 + (R() - .5) * .6, 14 + R() * 8, (R() - .5) * .12, T.wisp);
      }
      candle(194, 106, 12, 30, 1.3);    // lointaine (haut droite)
      candle(130, 100, 14, 34, 4.1);    // souche (centre)
      candle(150, 119, 26, 30, 2.2);    // moyenne
      candle(104, 118, 18, 17, 5.6);    // petite (centre gauche)
      candle(178, 121, 40, 52, .7);     // grande (premier plan)

      // ---- Corps : cape en lambeaux ----
      var CLOAK = [[0, 58], [10, 62], [28, 66], [44, 66], [58, 64], [70, 72], [72, 90], [66, 108], [64, 120], [0, 120]];
      fillPoly(CLOAK, function (x, y) { return pick(['#0b0810', '#120d18', '#1a1424'], .25 + .35 * (x / 80), x, y); });
      // lambeaux gris-bleu
      var RAGS = ['#3d4356', '#5a6275', '#7d869c', '#a3acc0'];
      for (var i2 = 0; i2 < 56; i2++) {
        var rx0 = 1 + i2 * 1.25, ry0 = 60 + Math.sin(i2 * 1.3) * 3 + R() * 4 + (rx0 > 40 ? (rx0 - 40) * .5 : 0);
        var rl = 16 + R() * 34, slope = -.6 + R() * .5, rc = RAGS[Math.floor(R() * RAGS.length)];
        var rw = 2 + Math.floor(R() * 2);
        for (var t2 = 0; t2 < rl; t2++) {
          var px = rx0 + slope * t2 + Math.sin(t2 / 5 + i2) * .8, py = ry0 + t2 * 1.0;
          var wv = t2 < rl * .7 ? rw : 1;
          for (var o3 = 0; o3 < wv; o3++) put(px + o3, py, o3 === 0 ? rc : (t2 % 3 === 0 ? RAGS[3] : RAGS[Math.max(0, RAGS.indexOf(rc) - 1)]));
        }
      }
      // cape sombre au centre (zone entre cou et torse)
      fillPoly([[28, 62], [46, 62], [58, 70], [54, 90], [34, 92], [24, 78]], function (x, y) { return pick(['#07050b', '#0e0913'], .3, x, y); });
      // médaillon
      for (var my = -3; my <= 3; my++) for (var mx = -3; mx <= 3; mx++) if (mx * mx + my * my <= 9) put(52 + mx, 82 + my, (mx + my < -1) ? '#fff0a0' : (mx + my > 2 ? '#a77f12' : '#e0b030'));
      line(52, 72, 52, 79, '#a77f12', 1);
      // braises sur la cape
      [[33, 71], [47, 69], [55, 77], [30, 86], [60, 66], [40, 74]].forEach(function (p) { flame(p[0], p[1], 5, T.flame); put(p[0] + 2, p[1] - 3, T.ember[0]); });

      // ---- Bras droit en griffes ----
      var ARM = [[58, 66], [80, 63], [98, 56], [106, 44], [112, 28]];
      for (var q = 0; q < ARM.length - 1; q++) {
        var wd = 9 - q * 1.6;
        var steps = 24;
        for (var s2 = 0; s2 <= steps; s2++) {
          var xx = ARM[q][0] + (ARM[q + 1][0] - ARM[q][0]) * s2 / steps, yy = ARM[q][1] + (ARM[q + 1][1] - ARM[q][1]) * s2 / steps;
          for (var o = -wd / 2; o < wd / 2; o++) put(xx, yy + o, o < -wd / 2 + 1.5 ? '#2a1420' : '#0c0810');
          put(xx, yy + wd / 2, '#8a2a1a');
        }
      }
      fillPoly([[102, 38], [108, 26], [122, 24], [128, 34], [118, 48]], function (x, y) { return pick(['#0c0810', '#1a1020', '#3a1a24'], .2 + (y < 32 ? .2 : 0), x, y); });
      var claws = [[108, 29, -2.15, 26], [113, 25, -1.85, 34], [118, 24, -1.45, 38], [123, 26, -1.05, 34], [127, 31, -.7, 26]];
      claws.forEach(function (cl) {
        var x = cl[0], y = cl[1], ang = cl[2], L = cl[3];
        for (var t3 = 0; t3 < L; t3++) {
          ang += .028 + (t3 > L * .6 ? .03 : 0);
          x += Math.cos(ang); y += Math.sin(ang);
          var th = t3 < L * .45 ? 4 : (t3 < L * .75 ? 3 : (t3 < L * .92 ? 2 : 1));
          put(x, y - th / 2 - .5, '#a8321e');
          for (var o2 = 0; o2 < th; o2++) put(x, y - th / 2 + o2, o2 === 0 ? '#3a1218' : '#0c0810');
        }
        put(x, y, '#e45a30');
      });
      // étincelles le long du bras
      for (var sp = 0; sp < 16; sp++) { var u2 = R(); put(100 + u2 * 70 + R() * 12, 15 + R() * 42 - u2 * 10, T.ember[Math.floor(R() * 3)]); }

      // ---- Main gauche (griffes qui pendent, éclairées par le feu) ----
      fillPoly([[46, 84], [68, 86], [66, 98], [50, 98]], function (x, y) { return pick(['#0c0810', '#1a1020', '#4a2a22'], .15 + (x > 60 ? .35 : 0), x, y); });
      for (var f2 = 0; f2 < 5; f2++) {
        var fx = 50 + f2 * 4, fy = 97, fa = 1.2 - f2 * .08;
        for (var t4 = 0; t4 < 22 - Math.abs(f2 - 2) * 3; t4++) {
          fx += Math.cos(fa) * .6 + .1; fy += Math.sin(fa) * .9;
          put(fx, fy, t4 < 10 ? '#d9822f' : '#f2b04a'); put(fx + 1, fy, t4 < 10 ? '#8a4a1a' : '#d9822f');
          if (t4 > 6 && t4 % 5 === 0) put(fx - 1, fy, '#ffd34a');
        }
      }

      // ---- Tête de citrouille ----
      var cx = hx, cy = hy, rx = 27, ry = 23, th0 = -.2;
      var cs = Math.cos(-th0), sn = Math.sin(-th0), cs2 = Math.cos(th0), sn2 = Math.sin(th0);
      function loc(x, y) { var dx = x + .5 - cx, dy = y + .5 - cy; return [dx * cs - dy * sn, dx * sn + dy * cs]; }
      function wld(u, v) { return [cx + u * cs2 - v * sn2, cy + u * sn2 + v * cs2]; }
      function inside(x, y) { var l = loc(x, y), a = l[0] / rx, b = l[1] / ry; return a * a + b * b <= 1; }
      var RED = ['#4a0a0a', '#7a1410', '#b02a14', '#d84a1c', '#f07a2a'];
      for (var py2 = 0; py2 < H; py2++) for (var px2 = 0; px2 < W; px2++) {
        if (!inside(px2, py2)) continue;
        var l2 = loc(px2, py2), au = Math.abs(l2[0]) / rx;
        var sh = .3 + .5 * Math.cos(l2[0] / rx * 1.45) + .22 * (l2[1] / ry) + .12;
        var c = pick(RED, Math.max(0, Math.min(1, sh)), px2, py2);
        if (Math.abs(au - .36) < .028 || Math.abs(au - .72) < .028) c = RED[Math.max(0, (RED.indexOf(c)) - 2)];
        put(px2, py2, c);
        if (!inside(px2 + 1, py2) || !inside(px2 - 1, py2) || !inside(px2, py2 + 1) || !inside(px2, py2 - 1)) put(px2, py2, '#1a0505');
      }
      // yeux furieux
      function eyePoly(sg) { return [wld(sg * 22, -10), wld(sg * 4, -1), wld(sg * 20, 4)]; }
      function shrink(pts, k) { var cxm = 0, cym = 0; pts.forEach(function (p) { cxm += p[0] / pts.length; cym += p[1] / pts.length; }); return pts.map(function (p) { return [cxm + (p[0] - cxm) * k, cym + (p[1] - cym) * k]; }); }
      [-1, 1].forEach(function (sg) {
        var ep = eyePoly(sg);
        fillPoly(ep, '#2a0705');
        fillPoly(shrink(ep, .86), T.eyeEdge);
        fillPoly(shrink(ep, .55), T.eyeCore);
      });
      // nez
      fillPoly([wld(0, 3), wld(-3.5, 9), wld(3.5, 9)], '#2a0705');
      // bouche : zigzag haut et bas, dents de chair qui s'imbriquent
      var top = [], bot = [], N = 8;
      for (var i3 = 0; i3 <= N; i3++) { var uu = -22 + i3 * 44 / N; top.push(wld(uu, i3 % 2 ? 14 : 7)); }
      for (var i4 = N; i4 >= 0; i4--) { var uu2 = -22 + i4 * 44 / N; bot.push(wld(uu2, i4 % 2 ? 22 : 16)); }
      var mouthPoly = top.concat(bot);
      var mc = wld(0, 14.5);
      function mouthPix(x, y) {
        var dd = Math.hypot((x - mc[0]) / 24, (y - mc[1]) / 8);
        return pick([T.mouth[2], T.mouth[1], T.mouth[0]], 1 - Math.min(1, dd), x, y);
      }
      var bb = bbox(mouthPoly);
      for (var my2 = bb[1]; my2 <= bb[3]; my2++) for (var mx2 = bb[0]; mx2 <= bb[2]; mx2++) {
        if (inPoly(mouthPoly, mx2 + .5, my2 + .5) && inside(mx2, my2)) put(mx2, my2, mouthPix(mx2, my2));
      }
      for (var my3 = bb[1] - 1; my3 <= bb[3] + 1; my3++) for (var mx3 = bb[0] - 1; mx3 <= bb[2] + 1; mx3++) {
        if (!inPoly(mouthPoly, mx3 + .5, my3 + .5) && inside(mx3, my3) && (inPoly(mouthPoly, mx3 + 1.5, my3 + .5) || inPoly(mouthPoly, mx3 - .5, my3 + .5) || inPoly(mouthPoly, mx3 + .5, my3 + 1.5) || inPoly(mouthPoly, mx3 + .5, my3 - .5))) put(mx3, my3, '#2a0705');
      }
      // couronne de feuilles
      var base = wld(0, -ry + 3);
      for (var bl = 0; bl < 12; bl++) {
        var a0 = -Math.PI / 2 + th0 + (bl - 5.5) * .24, L = 11 + (6 - Math.abs(bl - 5.5)) * 1.6 + R() * 3;
        var tx = base[0] + Math.cos(a0) * L, ty = base[1] + Math.sin(a0) * L;
        line(base[0], base[1], tx, ty, '#143f3a', 2);
        line(base[0], base[1] + 1, tx, ty, '#2f8272', 1);
      }
      // mèches blanches
      [[-.25, 22], [.1, 28], [.45, 20]].forEach(function (w) { wisp(base[0], base[1] - 6, -Math.PI / 2 + w[0], w[1], w[0] * .06, ['#e8ecf6', '#b8c0d6', '#6a7290']); });
      // fumée de feu du côté gauche de la tête, comme sur l'illustration
      var e1 = wld(-22, -10);
      for (var w2 = 0; w2 < 7; w2++) wisp(e1[0] + R() * 4, e1[1] + R() * 6, -2.3 + (R() - .5) * 1.1, 20 + R() * 16, .03, T.wisp);
      var e2 = wld(22, -10);
      for (var w3 = 0; w3 < 3; w3++) wisp(e2[0], e2[1], -1.2 + (R() - .5) * .8, 10 + R() * 8, -.04, T.wisp);
      // gouttes de feu sous le menton
      var chin = wld(2, 22);
      for (var dr = 0; dr < 4; dr++) { var dx2 = chin[0] - 6 + dr * 5, dl2 = 4 + R() * 10; for (var j2 = 0; j2 < dl2; j2++) put(dx2, chin[1] + 1 + j2, j2 < dl2 - 1 ? T.flame[2] : T.flame[1]); }
      // lueur du regard sur le cou
      for (var gy3 = 60; gy3 < 70; gy3++) for (var gx4 = 26; gx4 < 60; gx4++) blendTo(gx4, gy3, T.flame[3], .18 * (1 - (gy3 - 60) / 10));

      // ---- Braises dans l'air ----
      for (var em = 0; em < 90; em++) {
        var ex = R() * W, ey = R() * (H - 10), c = T.ember[Math.floor(R() * 3)];
        if (R() < .65) { var near = Math.hypot(ex - 50, ey - 45) < 55 || ex > 120 && ey > 40; if (!near) continue; }
        put(ex, ey, c);
      }
      // lucioles sombres au loin
      for (var ff = 0; ff < 14; ff++) put(60 + R() * 130, 10 + R() * 60, '#8a9a3a');

      // ---- Vignette sombre sur les bords ----
      for (var vy = 0; vy < H; vy++) for (var vx = 0; vx < W; vx++) {
        var dv = Math.max(Math.abs(vx - W / 2) / (W / 2), Math.abs(vy - H / 2) / (H / 2));
        var av = Math.max(0, (dv - .86) / .14) * .55;
        if (bayer(vx, vy) < av) { var pp = get(vx, vy); put(vx, vy, '#' + pp.map(function (m) { return ('0' + Math.round(m * .35).toString(16)).slice(-2); }).join('')); }
      }
      ctx.putImageData(img, 0, 0);
    }

  global.Poster = { draw: (canvas) => draw(canvas, 'vert', 7), WIDTH: 200, HEIGHT: 120 };
})(window);
