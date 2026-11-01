'use strict';

/*
 * Bruitages synthétisés avec la Web Audio API : aucun fichier son à télécharger.
 * Le navigateur n'autorise le son qu'après un geste du joueur : le contexte audio est
 * créé (ou réveillé) au premier clic ou à la première touche.
 */
(function (global) {
  let ctx = null;
  let master = null;
  let noise = null;
  let white = null;
  let cave = null;
  let drill = null;
  let amb = null;
  let enabled = true;
  let volume = 0.6;

  function audio() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? volume : 0;
      master.connect(ctx.destination);
      // Bruit « brun » (grave, granuleux) : base du bruit de forage et des chocs.
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noise.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        data[i] = last * 3.5;
      }
      // Bruit blanc : éclats, souffles et grelots (le bruit brun n'a presque rien dans les aigus).
      white = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const wd = white.getChannelData(0);
      for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function ready() {
    return enabled && audio() && ctx.state !== 'closed';
  }

  /** Écho de grotte (sons 16-bit) : un retour filtré qui fait résonner la galerie. */
  function echo() {
    if (!cave) {
      cave = ctx.createGain();
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.21;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1900;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.34;
      cave.connect(delay).connect(filter).connect(feedback).connect(delay);
      filter.connect(master);
    }
    return cave;
  }

  /** Relie un son à sa sortie (`dest`, sinon le volume général), avec placement gauche-droite (`pan`) et écho de grotte (`wet`). */
  function route(node, { dest = null, pan = 0, wet = 0 }) {
    let out = dest || master;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      p.connect(out);
      out = p;
    }
    node.connect(out);
    // L'écho rejoint directement le volume général : pas pour les sons coupables en route (bruitages de foreuse).
    if (wet && !dest) {
      const send = ctx.createGain();
      send.gain.value = wet;
      node.connect(send).connect(echo());
    }
  }

  /** Note simple avec enveloppe percussive. */
  function tone(freq, { at = 0, dur = 0.15, type = 'square', gain = 0.2, to = null, ...out } = {}) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    route(g, out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Bouffée de bruit filtré (chocs, éboulis) ; `bright` prend le bruit blanc, `to` fait glisser le filtre. */
  function burst({ at = 0, dur = 0.25, freq = 400, gain = 0.4, type = 'lowpass', to = null, q = 1, bright = false, ...out } = {}) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = bright ? white : noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (to) filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g);
    route(g, out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /** Éclat métallique (cuivre, pièces, cloches) : partiels inharmoniques qui s'éteignent à des vitesses différentes. */
  function ping(freq, { at = 0, dur = 0.6, gain = 0.1, ...out } = {}) {
    tone(freq, { at, dur, type: 'sine', gain, ...out });
    tone(freq * 2.76, { at, dur: dur * 0.5, type: 'sine', gain: gain * 0.45, ...out });
    tone(freq * 5.4, { at, dur: dur * 0.25, type: 'sine', gain: gain * 0.25, ...out });
  }

  /** Feu d'artifice : sifflement qui monte, explosion sourde, puis crépitement. */
  function firework(at = 0, pan = 0, big = false, dest = null) {
    burst({ at, dur: 0.55, freq: 500, to: 3200, type: 'bandpass', q: 6, gain: 0.12, bright: true, pan, dest });
    tone(700, { at, dur: 0.5, type: 'sine', gain: 0.025, to: 1900, pan, dest });
    const bang = at + 0.55;
    burst({ at: bang, dur: big ? 1.1 : 0.8, freq: 260, gain: big ? 0.7 : 0.5, pan, wet: 0.35, dest });
    tone(90, { at: bang, dur: 0.4, type: 'sine', gain: 0.3, to: 40, pan, dest });
    const sparks = big ? 22 : 14;
    for (let i = 0; i < sparks; i++) {
      burst({ at: bang + 0.15 + Math.random() * 0.9, dur: 0.03, freq: 4000 + Math.random() * 3000, type: 'highpass', gain: 0.05 + Math.random() * 0.05, bright: true, pan: Math.max(-1, Math.min(1, pan + (Math.random() - 0.5) * 0.5)), dest });
    }
  }

  /** Petites ritournelles jouées par-dessus la foreuse selon son modèle (fêtes, plasma, vapeur…), programmées pour 7 s. */
  const DRILL_FX = {
    plasma(dest) {
      for (let t = 0; t < 7; t += 0.08 + Math.random() * 0.2) burst({ at: t, dur: 0.025, freq: 3500 + Math.random() * 4000, type: 'highpass', gain: 0.06 + Math.random() * 0.08, bright: true, dest });
      for (let t = 0.2; t < 7; t += 1.1 + Math.random()) tone(1800, { at: t, dur: 0.18, type: 'sawtooth', gain: 0.025, to: 400, dest });
    },
    vapeur(dest) {
      for (let t = 0; t < 7; t += 0.34) {
        burst({ at: t, dur: 0.16, freq: 1400, to: 700, type: 'bandpass', q: 1.5, gain: 0.16, bright: true, dest });
        burst({ at: t + 0.17, dur: 0.02, freq: 3200, type: 'bandpass', q: 8, gain: 0.08, bright: true, dest });
      }
      for (let t = 1.2; t < 7; t += 2.4) tone(1175, { at: t, dur: 0.5, type: 'triangle', gain: 0.04, to: 1100, dest });
    },
    lourd(dest) {
      for (let t = 0.3; t < 7; t += 0.7 + Math.random() * 0.6) {
        burst({ at: t, dur: 0.18, freq: 180, gain: 0.35, dest });
        ping(330 + Math.random() * 80, { at: t, dur: 0.25, gain: 0.03, dest });
      }
    },
    cristal(dest) {
      for (let t = 0.1; t < 7; t += 0.18 + Math.random() * 0.3) tone(PENTA[5 + Math.floor(Math.random() * 5)] * 2, { at: t, dur: 0.4, type: 'sine', gain: 0.035, dest, wet: 0.4 });
    },
    bulles(dest) {
      for (let t = 0; t < 7; t += 0.1 + Math.random() * 0.3) {
        const f = 250 + Math.random() * 400;
        tone(f, { at: t, dur: 0.07, type: 'sine', gain: 0.08, to: f * 2.6, dest });
      }
    },
    grelots(dest, bells) {
      // Grelots en rythme (deux par temps) ; Noël ajoute quelques notes de cloche.
      for (let t = 0; t < 7; t += 0.25) {
        for (let k = 0; k < 3; k++) burst({ at: t + k * 0.018, dur: 0.06, freq: 6500 + Math.random() * 1500, type: 'bandpass', q: 9, gain: t % 0.5 < 0.01 ? 0.12 : 0.07, bright: true, dest });
      }
      if (bells) [784, 659, 587, 523, 587, 659, 784].forEach((f, i) => ping(f, { at: 0.5 + i * 0.5, dur: 0.7, gain: 0.04, dest, wet: 0.3 }));
    },
    cupidon(dest) {
      // Battements de cœur, avec une petite harpe qui monte de temps en temps.
      for (let t = 0; t < 7; t += 0.8) {
        tone(70, { at: t, dur: 0.12, type: 'sine', gain: 0.35, to: 50, dest });
        tone(64, { at: t + 0.17, dur: 0.14, type: 'sine', gain: 0.28, to: 45, dest });
      }
      for (let t = 0.6; t < 7; t += 2.4) [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, { at: t + i * 0.05, dur: 0.35, type: 'triangle', gain: 0.04, dest, wet: 0.3 }));
    },
    halloween(dest) {
      for (let t = 0; t < 7; t += 0.12 + Math.random() * 0.25) {
        const f = 120 + Math.random() * 180;
        tone(f, { at: t, dur: 0.09, type: 'sine', gain: 0.1, to: f * 3, dest });
      }
      // Petit thérémine qui ondule.
      for (let t = 0.5; t < 7; t += 2.5) {
        tone(440, { at: t, dur: 0.6, type: 'sine', gain: 0.04, to: 620, dest, wet: 0.4 });
        tone(620, { at: t + 0.6, dur: 0.8, type: 'sine', gain: 0.04, to: 330, dest, wet: 0.4 });
      }
    },
    fete(dest) {
      for (let t = 0.2; t < 7; t += 0.15 + Math.random() * 0.5) burst({ at: t, dur: 0.05, freq: 2500 + Math.random() * 2500, type: 'bandpass', q: 2, gain: 0.12, bright: true, dest, pan: Math.random() - 0.5 });
      for (let t = 1; t < 7; t += 2.5) firework(t, Math.random() - 0.5, false, dest);
    },
    paques(dest) {
      for (let t = 0.2; t < 7; t += 0.5 + Math.random() * 0.6) {
        tone(2600, { at: t, dur: 0.06, type: 'sine', gain: 0.05, to: 3300, dest });
        tone(2700, { at: t + 0.09, dur: 0.06, type: 'sine', gain: 0.05, to: 3400, dest });
      }
    },
    craie(dest) {
      for (let t = 0; t < 7; t += 0.22 + Math.random() * 0.2) burst({ at: t, dur: 0.07 + Math.random() * 0.08, freq: 2800 + Math.random() * 1500, type: 'bandpass', q: 7, gain: 0.08, bright: true, dest });
    },
    chevalier(dest) {
      for (let t = 0.4; t < 7; t += 1.2) ping(523, { at: t, dur: 0.5, gain: 0.06, dest, wet: 0.3 });
      for (let t = 0; t < 7; t += 0.3) burst({ at: t, dur: 0.04, freq: 900, type: 'bandpass', q: 3, gain: 0.08, dest });
    },
    tresor(dest) {
      for (let t = 0.1; t < 7; t += 0.15 + Math.random() * 0.4) ping(2400 + Math.random() * 1600, { at: t, dur: 0.18, gain: 0.04, dest });
      for (let t = 0.8; t < 7; t += 2.2) tone(150, { at: t, dur: 0.6, type: 'sawtooth', gain: 0.025, to: 110, dest });
    },
  };
  const DRILL_FAMILY = {
    comete: 'plasma', horloger: 'vapeur', mammouth: 'lourd', fournaise: 'lourd', amethyste: 'cristal', nautile: 'bulles', poisson: 'bulles',
    noel: 'grelots', sapin: 'grelots', nicolas: 'grelots', gille: 'grelots', cupidon: 'cupidon', chaudron: 'halloween', citrouille: 'halloween',
    nouvelan: 'fete', gateau: 'fete', paques: 'paques', pi: 'craie', chevalier: 'chevalier', pirate: 'tresor', pionnier: 'tresor',
  };

  // Gamme pentatonique : chaque couche traversée sonne un peu plus aigu.
  const PENTA = [262, 294, 330, 392, 440, 523, 587, 659, 784, 880];

  const Sound = {
    configure(options) {
      if ('enabled' in options) enabled = Boolean(options.enabled);
      if ('volume' in options) volume = Math.max(0, Math.min(1, options.volume));
      if (master) master.gain.setTargetAtTime(enabled ? volume : 0, ctx.currentTime, 0.05);
      if (!enabled) {
        this.drill(false);
        this.ambientStop();
      }
    },

    unlock() {
      if (enabled) audio();
    },

    /**
     * Bruit continu de la foreuse ; la roche plus dure (zone plus profonde) sonne plus aigu.
     * `model` (sons 16-bit) : identifiant de la foreuse 16-bit ; les modèles spéciaux ajoutent leurs bruitages (grelots, plasma…).
     */
    drill(on, zone = 0, model = null) {
      if (!on) {
        if (drill) {
          const { src, osc, out, fx } = drill;
          out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.06);
          src.stop(ctx.currentTime + 0.3);
          osc.stop(ctx.currentTime + 0.3);
          if (fx) {
            fx.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
          }
          drill = null;
        }
        return;
      }
      if (!ready()) return;
      const family = model ? DRILL_FAMILY[model] : null;
      // Le plasma fond la roche : moins de bruit de broyage. Les foreuses lourdes grondent plus bas.
      const deep = family === 'lourd' ? 0.65 : 1;
      const grind = family === 'plasma' ? 0.35 : 1;
      if (drill) {
        drill.filter.frequency.setTargetAtTime((220 + zone * 110) * deep, ctx.currentTime, 0.1);
        drill.osc.frequency.setTargetAtTime((48 + zone * 7) * deep, ctx.currentTime, 0.1);
        return;
      }
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = (220 + zone * 110) * deep;
      filter.Q.value = 1.2;
      const grindGain = ctx.createGain();
      grindGain.gain.value = grind;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = (48 + zone * 7) * deep;
      const oscGain = ctx.createGain();
      oscGain.gain.value = family === 'plasma' ? 0.11 : 0.05;
      // Vibration du moteur : le volume pulse rapidement.
      const out = ctx.createGain();
      out.gain.value = 0.0001;
      out.gain.setTargetAtTime(0.5, ctx.currentTime, 0.05);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = family === 'plasma' ? 7 : 16;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.18;
      lfo.connect(lfoGain).connect(out.gain);
      src.connect(filter).connect(grindGain).connect(out);
      osc.connect(oscGain).connect(out);
      out.connect(master);
      src.start();
      osc.start();
      lfo.start();
      src.onended = () => lfo.stop();
      let fx = null;
      if (family) {
        fx = ctx.createGain();
        fx.connect(master);
        DRILL_FX[family](fx, model === 'noel' || model === 'sapin');
      }
      drill = { src, osc, filter, out, fx };
    },

    /**
     * Ambiance de l'accueil (essai réservé au responsable) : coups de pioche dans la roche, grondement lointain et musique
     * composée (« galerie », « forge » ou « cristal »). Le moteur est dans ambience.js ; `ambientStop()` coupe tout en fondu.
     */
    ambient({ taps = false, rumble = false, music = null } = {}) {
      this.ambientStop();
      if (!(taps || rumble || music) || !ready() || !global.Ambience) return;
      const engine = global.Ambience.make(ctx, master, noise, { taps, rumble, music });
      const timer = setInterval(() => {
        if (ctx.state === 'running') engine.tick(ctx.currentTime);
      }, 50);
      amb = { engine, timer };
    },

    ambientStop() {
      if (!amb) return;
      clearInterval(amb.timer);
      amb.engine.stop();
      amb = null;
    },

    /** Passage d'une couche géologique : choc sourd puis petite note. */
    layer(zone) {
      if (!ready()) return;
      tone(140, { dur: 0.3, type: 'sine', gain: 0.5, to: 45 });
      burst({ dur: 0.2, freq: 600, gain: 0.25 });
      tone(PENTA[zone % PENTA.length] * 2, { at: 0.08, dur: 0.25, type: 'triangle', gain: 0.12 });
    },

    /**
     * Réponse validée : plus elle est rare, plus l'arpège monte.
     * `pepites` : nombre de pépites trouvées dans la partie, celle-ci comprise ; chaque pépite de plus
     * ajoute du « scintillement » (plus d'étincelles, et une note de plus dans la montée finale).
     */
    tier(id, pepites = 1) {
      if (!ready()) return;
      const steps = { evident: 1, courant: 2, original: 3, rare: 4, pepite: 6 }[id] || 0;
      if (!steps) return this.miss();
      const notes = [392, 494, 587, 784, 988, 1175];
      for (let i = 0; i < steps; i++) tone(notes[i], { at: i * 0.07, dur: 0.14, type: 'square', gain: 0.1 });
      if (id === 'pepite') {
        const n = Math.max(1, Math.min(7, pepites));
        const sparks = 6 + n * 4;
        for (let i = 0; i < sparks; i++) tone(1400 + Math.random() * (1600 + n * 250), { at: 0.45 + i * 0.045, dur: 0.12, type: 'sine', gain: 0.05 + n * 0.004 });
        // Montée de carillon : une note de plus à chaque pépite.
        for (let i = 0; i < n; i++) tone(PENTA[(i + 4) % PENTA.length] * 4, { at: 0.5 + sparks * 0.045 + i * 0.06, dur: 0.28, type: 'triangle', gain: 0.09 });
      }
    },

    /** Vibration du téléphone (si le son est activé) : une impulsion par pépite, une légère pour un Rubis. */
    buzz(id, pepites = 1) {
      if (!enabled || !global.navigator || typeof global.navigator.vibrate !== 'function') return;
      if (id === 'pepite') {
        const n = Math.max(1, Math.min(6, pepites));
        const pattern = [];
        for (let i = 0; i < n; i++) pattern.push(45, 55);
        global.navigator.vibrate(pattern);
      } else if (id === 'rare') {
        global.navigator.vibrate(25);
      }
    },

    /** Réponse inconnue. */
    wrong() {
      if (!ready()) return;
      tone(196, { dur: 0.09, gain: 0.12 });
      tone(147, { at: 0.1, dur: 0.16, gain: 0.12 });
    },

    /** Le jeu propose une correction : petite question montante. */
    ask() {
      if (!ready()) return;
      tone(523, { dur: 0.08, type: 'triangle', gain: 0.15 });
      tone(784, { at: 0.09, dur: 0.12, type: 'triangle', gain: 0.15 });
    },

    /** Thème passé ou temps écoulé. */
    miss() {
      if (!ready()) return;
      tone(330, { dur: 0.5, type: 'sawtooth', gain: 0.08, to: 90 });
    },

    /** Dernières secondes du chrono. */
    tick(urgent) {
      if (!ready()) return;
      tone(urgent ? 1320 : 990, { dur: 0.04, type: 'square', gain: 0.05 });
    },

    /**
     * Petits bruits de bouton, très discrets :
     * « valid » (validation douce, tutoriel), « tab » (onglet majeur), « subtab » (onglet mineur), « press » (bouton de forage ou de duel).
     */
    click(kind = 'press') {
      if (!ready()) return;
      if (kind === 'valid') {
        tone(660, { dur: 0.07, type: 'triangle', gain: 0.09 });
        tone(990, { at: 0.06, dur: 0.11, type: 'triangle', gain: 0.08 });
      } else if (kind === 'tab') {
        tone(330, { dur: 0.06, type: 'triangle', gain: 0.09, to: 260 });
        burst({ dur: 0.03, freq: 1800, gain: 0.05, type: 'bandpass' });
      } else if (kind === 'subtab') {
        tone(760, { dur: 0.04, type: 'sine', gain: 0.07, to: 620 });
      } else {
        burst({ dur: 0.035, freq: 2400, gain: 0.07, type: 'bandpass' });
        tone(520, { dur: 0.05, type: 'square', gain: 0.035, to: 400 });
      }
    },

    /**
     * Chrono sonore, une fois par seconde, selon l'apparence du chrono choisie : batterie (bip électronique), mèche (crépitement),
     * wagonnet (cliquetis de rails) et lanterne (petite clochette). Plus aigu et plus rapproché quand le temps presse.
     */
    chrono(style, second, urgent) {
      if (!ready()) return;
      if (style === 'meche') {
        burst({ dur: 0.12, freq: urgent ? 5200 : 3800, gain: urgent ? 0.1 : 0.06, type: 'highpass' });
        tone(urgent ? 700 : 420, { at: 0.02, dur: 0.05, type: 'sawtooth', gain: 0.03 });
      } else if (style === 'wagonnet') {
        burst({ dur: 0.04, freq: 900, gain: urgent ? 0.14 : 0.09, type: 'bandpass' });
        burst({ at: urgent ? 0.1 : 0.16, dur: 0.04, freq: 700, gain: urgent ? 0.12 : 0.07, type: 'bandpass' });
      } else if (style === 'lanterne') {
        tone(urgent ? 1568 : 1175, { dur: 0.35, type: 'sine', gain: urgent ? 0.06 : 0.04 });
        tone((urgent ? 1568 : 1175) * 2.01, { dur: 0.2, type: 'sine', gain: 0.012 });
      } else {
        tone(urgent ? 1320 : 880, { dur: 0.05, type: 'square', gain: urgent ? 0.05 : 0.03 });
        if (urgent) tone(1320, { at: 0.09, dur: 0.05, type: 'square', gain: 0.04 });
      }
    },

    /** Nouveau badge : petite fanfare. */
    badge() {
      if (!ready()) return;
      [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: 0.3 + i * 0.1, dur: i === 3 ? 0.4 : 0.12, type: 'square', gain: 0.09 }));
    },

    /** Révélation d'un thème. */
    reveal() {
      if (!ready()) return;
      tone(660, { dur: 0.06, gain: 0.08 });
      tone(990, { at: 0.06, dur: 0.1, gain: 0.08 });
    },

    // ---------- Sons 16-bit (refonte) ----------

    /**
     * Minerai trouvé, un bruit par matière : Gravier (gravats qui roulent), Soufre (bouffée qui pétille), Cuivre (tintement
     * métallique), Rubis (carillon de cristal) et Pépite (« kaching » doré puis fanfare, plus scintillante à chaque pépite).
     */
    ore(id, pepites = 1) {
      if (!ready()) return;
      if (id === 'evident') {
        for (let i = 0; i < 4; i++) burst({ at: i * 0.055 + Math.random() * 0.02, dur: 0.06, freq: 900 + Math.random() * 700, gain: 0.3 });
        tone(110, { dur: 0.18, type: 'sine', gain: 0.25, to: 60 });
        tone(392, { at: 0.22, dur: 0.12, type: 'triangle', gain: 0.1 });
      } else if (id === 'courant') {
        burst({ dur: 0.38, freq: 2600, to: 700, type: 'bandpass', q: 1.2, gain: 0.18, bright: true });
        for (let i = 0; i < 6; i++) tone(1400 + Math.random() * 1200, { at: 0.12 + i * 0.04, dur: 0.04, type: 'sine', gain: 0.04 });
        tone(392, { at: 0.1, dur: 0.1, type: 'square', gain: 0.07 });
        tone(523, { at: 0.2, dur: 0.16, type: 'square', gain: 0.07 });
      } else if (id === 'original') {
        [392, 494, 587].forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.1, type: 'square', gain: 0.07 }));
        ping(1046, { at: 0.2, dur: 0.8, gain: 0.12, wet: 0.3 });
        ping(1568, { at: 0.32, dur: 0.6, gain: 0.06, wet: 0.3 });
      } else if (id === 'rare') {
        [587, 784, 988, 1175].forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.16, type: 'triangle', gain: 0.1 }));
        [2349, 2793, 3136, 3729].forEach((f, i) => tone(f, { at: 0.26 + i * 0.07, dur: 0.9, type: 'sine', gain: 0.045, wet: 0.5 }));
        for (let i = 0; i < 8; i++) tone(3000 + Math.random() * 2500, { at: 0.5 + i * 0.05, dur: 0.1, type: 'sine', gain: 0.025, pan: Math.random() - 0.5 });
      } else if (id === 'pepite') {
        burst({ dur: 0.07, freq: 5000, type: 'highpass', gain: 0.16, bright: true });
        ping(1568, { dur: 0.5, gain: 0.1 });
        ping(2093, { at: 0.09, dur: 0.7, gain: 0.1, wet: 0.3 });
        [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: 0.3 + i * 0.09, dur: i === 3 ? 0.45 : 0.12, type: 'square', gain: 0.08 }));
        [131, 196, 262].forEach((f, i) => tone(f, { at: 0.3 + i * 0.12, dur: 0.2, type: 'triangle', gain: 0.14 }));
        const n = Math.max(1, Math.min(7, pepites));
        const sparks = 6 + n * 4;
        for (let i = 0; i < sparks; i++) tone(1400 + Math.random() * (1600 + n * 250), { at: 0.8 + i * 0.045, dur: 0.12, type: 'sine', gain: 0.05 + n * 0.004, pan: Math.random() * 1.2 - 0.6 });
        for (let i = 0; i < n; i++) tone(PENTA[(i + 4) % PENTA.length] * 4, { at: 0.85 + sparks * 0.045 + i * 0.06, dur: 0.28, type: 'triangle', gain: 0.09, wet: 0.4 });
      } else {
        this.miss();
      }
    },

    /** Changement d'onglet : petit « blip » dont la note dépend de l'onglet (de gauche à droite, de plus en plus aigu). */
    nav(index = 0) {
      if (!ready()) return;
      const f = PENTA[Math.max(0, index) % PENTA.length] * 2;
      tone(f, { dur: 0.07, type: 'square', gain: 0.05, to: f * 0.94, wet: 0.15 });
      burst({ dur: 0.02, freq: 2600, type: 'bandpass', gain: 0.04, bright: true });
    },

    /** Wagonnet qui démarre et file à droite (`dir` = 1, forage du jour) ou à gauche (-1, duel) : grincement, cliquetis de rails qui s'accélèrent. */
    wagon(dir = 1) {
      if (!ready()) return;
      const t = ctx.currentTime;
      let dest = master;
      if (ctx.createStereoPanner) {
        dest = ctx.createStereoPanner();
        dest.pan.setValueAtTime(0, t);
        dest.pan.linearRampToValueAtTime(0.15 * dir, t + 0.3);
        dest.pan.linearRampToValueAtTime(0.95 * dir, t + 1.1);
        dest.connect(master);
      }
      tone(190, { dur: 0.22, type: 'sawtooth', gain: 0.04, to: 150, dest });
      burst({ dur: 1.1, freq: 260, to: 700, gain: 0.35, dest });
      let at = 0.12;
      for (let gap = 0.19; at < 1.05; gap = Math.max(0.05, gap * 0.8)) {
        burst({ at, dur: 0.035, freq: 1100, type: 'bandpass', q: 4, gain: 0.26, dest });
        burst({ at: at + gap * 0.35, dur: 0.035, freq: 850, type: 'bandpass', q: 4, gain: 0.2, dest });
        at += gap;
      }
    },

    /**
     * La taupe : « happy » (petit rire), « sad » (aïe, boing), « look » (hein ?), « stars » (rire et étincelles),
     * « wake » (reniflement, réveil en sursaut), « talk » (babillage le temps d'une bulle).
     */
    mole(kind = 'happy') {
      if (!ready()) return;
      const lift = 0.9 + Math.random() * 0.2;
      if (kind === 'sad') {
        burst({ dur: 0.06, freq: 700, gain: 0.25 });
        tone(780 * lift, { at: 0.03, dur: 0.24, type: 'square', gain: 0.06, to: 300 });
      } else if (kind === 'look') {
        tone(480 * lift, { dur: 0.09, type: 'triangle', gain: 0.1, to: 520 });
        tone(560 * lift, { at: 0.12, dur: 0.14, type: 'triangle', gain: 0.1, to: 760 });
      } else if (kind === 'wake') {
        burst({ dur: 0.08, freq: 500, gain: 0.25 });
        burst({ at: 0.1, dur: 0.08, freq: 450, gain: 0.25 });
        tone(300, { at: 0.25, dur: 0.22, type: 'triangle', gain: 0.1, to: 720 });
      } else if (kind === 'talk') {
        const n = 5 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) tone(PENTA[3 + Math.floor(Math.random() * 4)] * 1.5, { at: i * 0.075, dur: 0.05, type: 'square', gain: 0.035 });
      } else {
        [0, 1, 2, 3].forEach((i) => tone((900 + i * 120) * lift, { at: i * 0.07, dur: 0.06, type: 'triangle', gain: 0.09, to: (1150 + i * 120) * lift }));
        if (kind === 'stars') for (let i = 0; i < 8; i++) tone(2000 + Math.random() * 2000, { at: 0.3 + i * 0.05, dur: 0.12, type: 'sine', gain: 0.04, pan: Math.random() - 0.5 });
      }
    },

    /**
     * La foreuse traverse une galerie (vie de mine) : un bruit court et discret par réaction, placé du côté où elle se joue
     * (`pan` de -1 à 1), avec l'écho de la grotte. Toujours le même bruit pour une galerie donnée : rien sur la réponse.
     */
    gallery(kind, pan = 0) {
      if (!ready()) return;
      const p = Math.max(-1, Math.min(1, pan));
      const out = { pan: p, wet: 0.3 };
      burst({ dur: 0.35, freq: 380, to: 160, gain: 0.12, ...out }); // souffle de poussière, commun à toutes
      if (kind === 'chauves') {
        for (let i = 0; i < 7; i++) burst({ at: 0.05 + i * 0.07, dur: 0.05, freq: 1800 + Math.random() * 900, type: 'bandpass', q: 3, gain: 0.07, bright: true, pan: p * (0.4 + i * 0.09) });
        tone(5200, { at: 0.12, dur: 0.05, type: 'sine', gain: 0.012, to: 6400, ...out });
      } else if (kind === 'wagon') {
        tone(1650, { at: 0.05, dur: 0.5, type: 'sawtooth', gain: 0.018, to: 1250, ...out }); // freins qui crissent
        burst({ at: 0.05, dur: 0.55, freq: 2600, type: 'bandpass', q: 5, gain: 0.05, bright: true, ...out });
        ping(330, { at: 0.62, dur: 0.35, gain: 0.05, ...out }); // le wagon cogne la butée
      } else if (kind === 'mineur') {
        tone(520, { at: 0.12, dur: 0.1, type: 'triangle', gain: 0.06, to: 760, ...out }); // « oh ! »
        ping(1200, { at: 0.3, dur: 0.3, gain: 0.03, ...out }); // la lanterne qui tinte
      } else if (kind === 'taupe') {
        tone(620, { at: 0.1, dur: 0.08, type: 'triangle', gain: 0.07, to: 700, ...out });
        tone(740, { at: 0.22, dur: 0.12, type: 'triangle', gain: 0.07, to: 1000, ...out });
      } else if (kind === 'canari') {
        [0, 1, 2, 3].forEach((i) => tone(2600 + (i % 2) * 500, { at: 0.08 + i * 0.07, dur: 0.05, type: 'sine', gain: 0.03, to: 3300 + (i % 2) * 400, ...out }));
      } else if (kind === 'goutte') {
        [0, 1, 2].forEach((i) => tone(900 + i * 260, { at: 0.06 + i * 0.11, dur: 0.07, type: 'sine', gain: 0.045, to: 1900 + i * 300, ...out }));
      } else if (kind === 'cailloux') {
        for (let i = 0; i < 6; i++) burst({ at: 0.1 + i * 0.08 + Math.random() * 0.04, dur: 0.04, freq: 900 + Math.random() * 700, type: 'bandpass', q: 4, gain: 0.12, ...out });
      }
    },

    /** Un feu d'artifice seul, placé de -1 (gauche) à 1 (droite) : pour l'accorder à une animation. */
    firework(pan = 0, big = false) {
      if (!ready()) return;
      firework(0, pan, big);
    },

    /**
     * Célébration d'un podium, calée sur l'animation (repères minutés de la maquette des podiums) :
     * « week » : goutte et écho, lampes qui s'allument, wagons qui arrivent, frein et caisses, sauts, dynamite, taupe, fanfare ;
     * « month » : grondement, foreuse de la gagnante (`drill` = son modèle 16-bit) qui perce la voûte, éboulis, cristaux
     * qui montent, coupe qui brille, grand feu d'artifice, taupe émerveillée ; « day » : petite fanfare et trois feux.
     */
    celebrate(kind = 'week', { drill: model = null } = {}) {
      if (!ready()) return;
      const fanfare = (at, notes) => {
        for (const [f, d] of notes) {
          tone(f, { at, dur: d * 0.9, type: 'square', gain: 0.07, wet: 0.2 });
          tone(f * 1.003, { at, dur: d * 0.9, type: 'sawtooth', gain: 0.022 });
          tone(f / 2, { at, dur: d * 0.9, type: 'triangle', gain: 0.1 });
          at += d;
        }
      };
      if (kind === 'month') {
        const t = ctx.currentTime;
        tone(42, { dur: 1.4, type: 'sine', gain: 0.35, to: 36 });
        burst({ dur: 1.3, freq: 120, gain: 0.3, wet: 0.3 });
        // Foreuse de 1,0 s à 2,6 s : moteur, broyage et bruitage de son modèle.
        const gate = ctx.createGain();
        gate.gain.setValueAtTime(0.0001, t);
        gate.gain.setValueAtTime(0.0001, t + 0.95);
        gate.gain.linearRampToValueAtTime(1, t + 1.1);
        gate.gain.setValueAtTime(1, t + 2.5);
        gate.gain.linearRampToValueAtTime(0.0001, t + 2.7);
        gate.connect(master);
        burst({ at: 1, dur: 1.65, freq: 330, type: 'bandpass', q: 1.2, gain: 0.5, dest: gate });
        tone(55, { at: 1, dur: 1.65, type: 'sawtooth', gain: 0.06, to: 75, dest: gate });
        for (let at = 1; at < 2.6; at += 0.0625) burst({ at, dur: 0.05, freq: 500, gain: 0.12, dest: gate });
        const family = model ? DRILL_FAMILY[model] : null;
        if (family) DRILL_FX[family](gate, model === 'noel' || model === 'sapin');
        for (let i = 0; i < 9; i++) burst({ at: 2.6 + i * 0.07 + Math.random() * 0.05, dur: 0.12, freq: 400 + Math.random() * 500, gain: 0.25, pan: Math.random() - 0.5 });
        burst({ at: 2.75, dur: 0.5, freq: 900, to: 300, type: 'bandpass', gain: 0.12, bright: true });
        [784, 880, 988, 1175, 1319, 1568, 1760].forEach((f, i) => tone(f, { at: 3 + i * 0.11, dur: 0.6, type: 'sine', gain: 0.05, wet: 0.5 }));
        ping(2093, { at: 3.9, dur: 1, gain: 0.09, wet: 0.5 });
        for (let i = 0; i < 12; i++) firework(4.2 + i * 0.5 + Math.random() * 0.25, Math.random() * 1.6 - 0.8, i === 0 || i === 11);
        tone(380, { at: 4.4, dur: 0.5, type: 'triangle', gain: 0.1, to: 640 });
        tone(640, { at: 4.9, dur: 0.4, type: 'triangle', gain: 0.07, to: 520 });
        fanfare(4.6, [[392, 0.15], [392, 0.15], [392, 0.15], [523, 0.45], [494, 0.15], [523, 0.15], [659, 0.3], [784, 0.8]]);
        return;
      }
      if (kind === 'week') {
        // Goutte et écho de galerie.
        tone(1400, { dur: 0.08, type: 'sine', gain: 0.08, to: 600, wet: 0.6 });
        for (let i = 0; i < 9; i++) burst({ at: 0.6 + i * 0.08, dur: 0.02, freq: 2400, type: 'bandpass', q: 5, gain: 0.08, bright: true, pan: -0.8 + i * 0.2 });
        // Wagons qui roulent de gauche à droite (1,2 s → 3,6 s), puis coup de frein.
        const t = ctx.currentTime;
        let dest = master;
        if (ctx.createStereoPanner) {
          dest = ctx.createStereoPanner();
          dest.pan.setValueAtTime(-0.9, t + 1.2);
          dest.pan.linearRampToValueAtTime(0.1, t + 3.6);
          dest.connect(master);
        }
        burst({ at: 1.2, dur: 2.4, freq: 300, gain: 0.25, dest });
        for (let at = 1.2; at < 3.6; at += 0.2) burst({ at, dur: 0.035, freq: 1000, type: 'bandpass', q: 4, gain: 0.18, dest });
        tone(2600, { at: 3.55, dur: 0.3, type: 'sawtooth', gain: 0.025, to: 2200, dest });
        burst({ at: 3.55, dur: 0.3, freq: 3500, type: 'bandpass', q: 6, gain: 0.08, bright: true, dest });
        [0, 0.12, 0.24].forEach((d, i) => { burst({ at: 3.9 + d, dur: 0.2, freq: 220, gain: 0.25, pan: [-0.5, 0, 0.5][i] }); tone(80, { at: 3.9 + d, dur: 0.2, type: 'sine', gain: 0.2, to: 50 }); });
        [0, 0.15, 0.3].forEach((d, i) => tone(330 + i * 110, { at: 4.4 + d, dur: 0.12, type: 'square', gain: 0.05, to: 700 + i * 150 }));
        // Mèches qui grésillent, puis la dynamite part en feu d'artifice.
        burst({ at: 4.9, dur: 0.4, freq: 5000, type: 'highpass', gain: 0.08, bright: true });
        for (let i = 0; i < 6; i++) firework(5.2 + i * 0.6 + Math.random() * 0.25, Math.random() * 1.6 - 0.8);
        [0, 1, 2, 3].forEach((i) => tone(900 + i * 140, { at: 5.4 + i * 0.07, dur: 0.06, type: 'triangle', gain: 0.08, to: 1200 + i * 140 }));
        fanfare(6, [[392, 0.15], [523, 0.15], [659, 0.15], [784, 0.4], [659, 0.15], [784, 0.6]]);
        return;
      }
      // « day » : veillée dans la galerie (3,4 s). Lanternes qui s'allument (0,3 / 0,6 / 0,9), pas tranquilles des trois premiers
      // (0,5 → 1,9), petits sauts sur les caisses (2,0), étincelles et taupe qui applaudit (2,4), fanfare courte.
      [0.3, 0.6, 0.9].forEach((at, i) => {
        burst({ at, dur: 0.03, freq: 2200, type: 'bandpass', q: 4, gain: 0.1, bright: true, pan: -0.6 + i * 0.6 });
        tone(660 + i * 110, { at: at + 0.02, dur: 0.1, type: 'triangle', gain: 0.05, wet: 0.4 });
      });
      for (let at = 0.5; at < 1.9; at += 0.28) burst({ at, dur: 0.05, freq: 260, gain: 0.07, pan: 0.6 - (at - 0.5) * 0.5 });
      [0, 0.12, 0.24].forEach((d, i) => tone(330 + i * 110, { at: 2 + d, dur: 0.1, type: 'square', gain: 0.045, to: 600 + i * 120 }));
      for (let i = 0; i < 3; i++) firework(2.4 + i * 0.5 + Math.random() * 0.1, Math.random() * 1.6 - 0.8);
      tone(440, { at: 2.4, dur: 0.3, type: 'triangle', gain: 0.08, to: 700 });
      fanfare(2.5, [[523, 0.12], [659, 0.12], [784, 0.4]]);
    },

    /** Gazette : papier qu'on déplie (ou qu'on feuillette, `flip`). */
    paper(flip = false) {
      if (!ready()) return;
      const n = flip ? 3 : 1;
      for (let i = 0; i < n; i++) {
        burst({ at: i * 0.22, dur: 0.18, freq: 2200, to: 900, type: 'bandpass', q: 0.9, gain: 0.05, bright: true });
        burst({ at: i * 0.22 + 0.12, dur: 0.1, freq: 4000, type: 'highpass', gain: 0.025, bright: true });
      }
      if (!flip) burst({ at: 0.25, dur: 0.3, freq: 1500, to: 3000, type: 'bandpass', gain: 0.04, bright: true });
    },

    /** Petit « tada » : ton nom est sur le podium. */
    tada() {
      if (!ready()) return;
      tone(784, { dur: 0.1, type: 'square', gain: 0.07 });
      tone(1047, { at: 0.12, dur: 0.35, type: 'square', gain: 0.07, wet: 0.3 });
      tone(523, { at: 0.12, dur: 0.35, type: 'triangle', gain: 0.1 });
    },

    /** Résultat d'un duel, à la révélation seulement : « win », « loss » ou « draw ». */
    duelResult(outcome) {
      if (!ready()) return;
      if (outcome === 'win') {
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.1, dur: i === 5 ? 0.5 : 0.1, type: 'square', gain: 0.08, wet: 0.2 }));
      } else if (outcome === 'loss') {
        [392, 370, 349].forEach((f, i) => tone(f, { at: i * 0.28, dur: 0.26, type: 'square', gain: 0.07 }));
        tone(330, { at: 0.84, dur: 0.7, type: 'square', gain: 0.07, to: 300 });
      } else {
        tone(523, { dur: 0.16, type: 'triangle', gain: 0.1 });
        tone(523, { at: 0.22, dur: 0.3, type: 'triangle', gain: 0.1 });
      }
    },

    /** Score qui grimpe : cliquetis de plus en plus aigu pendant `dur` secondes. */
    countUp(dur = 1.2) {
      if (!ready()) return;
      const n = Math.round(dur * 18);
      for (let i = 0; i < n; i++) tone(500 + (i / n) * 1300, { at: (i / n) * dur, dur: 0.03, type: 'square', gain: 0.03 });
      tone(1760, { at: dur, dur: 0.3, type: 'triangle', gain: 0.07, wet: 0.3 });
    },

    /** Vestiaire : on enfile une pièce (froissement, petit déclic). */
    equip() {
      if (!ready()) return;
      burst({ dur: 0.12, freq: 1800, to: 900, type: 'bandpass', q: 0.8, gain: 0.1, bright: true });
      ping(1320, { at: 0.1, dur: 0.15, gain: 0.05 });
    },
  };

  ['pointerdown', 'keydown'].forEach((type) => global.addEventListener(type, () => Sound.unlock(), { passive: true }));

  global.Sound = Sound;
})(window);
