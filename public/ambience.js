'use strict';

/*
 * Ambiance sonore de la mine (labo du responsable) : coups de pioche réalistes, grondement lointain et trois musiques
 * composées (Galerie, Forge, Cristal). Tout est synthétisé avec la Web Audio API ; rien à télécharger.
 *
 *   Ambience.make(ctx, out, noise, { taps, rumble, music }) → { tick(now), stop() }
 *
 * `tick(now)` programme les sons des prochaines fractions de seconde (à appeler toutes les 50 ms avec l'heure du contexte) :
 * le même code sert en direct et pour le rendu hors ligne des essais.
 */
(function (global) {
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  /** Réponse impulsionnelle d'une grotte : du bruit qui s'éteint, plus sombre au fil du temps. */
  function impulse(ctx, seconds = 2.4) {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = ctx.createBuffer(2, length, rate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      let smooth = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const white = Math.random() * 2 - 1;
        // Filtre passe-bas qui se ferme avec le temps : les aigus meurent en premier.
        const k = 0.9 - 0.8 * Math.pow(1 - t, 2);
        smooth = smooth * k + white * (1 - k);
        data[i] = smooth * Math.pow(1 - t, 2.6) * 2.2;
      }
    }
    return buffer;
  }

  function make(ctx, out, noise, { taps = false, rumble = false, music = null } = {}) {
    const nodes = [];
    const keep = (n) => (nodes.push(n), n);
    // Bruit blanc pour les éclats de roche et les gravats (le bruit « brun » de Sound n'a presque rien dans les aigus).
    const white = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const wd = white.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;

    // Bus général : compresseur doux pour ne jamais saturer, puis la sortie.
    const bus = keep(ctx.createGain());
    bus.gain.value = 0.32;
    const comp = keep(ctx.createDynamicsCompressor());
    comp.threshold.value = -26;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.002;
    comp.release.value = 0.22;
    // Limiteur final : rien ne dépasse jamais -3 dB, même si plusieurs sons se superposent.
    const limiter = keep(ctx.createDynamicsCompressor());
    limiter.threshold.value = -8;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    bus.connect(comp).connect(limiter).connect(out);

    // Réverbération de grotte, partagée.
    const verb = keep(ctx.createConvolver());
    verb.buffer = impulse(ctx);
    const verbIn = keep(ctx.createGain());
    verbIn.gain.value = 1;
    const verbOut = keep(ctx.createGain());
    verbOut.gain.value = 0.55;
    verbIn.connect(verb).connect(verbOut).connect(bus);

    // Écho de galerie (un peu sombre) pour les coups de pioche.
    const echo = keep(ctx.createDelay(1));
    echo.delayTime.value = 0.31;
    const echoFb = keep(ctx.createGain());
    echoFb.gain.value = 0.32;
    const echoTone = keep(ctx.createBiquadFilter());
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 2200;
    const echoOut = keep(ctx.createGain());
    echoOut.gain.value = 0.5;
    echo.connect(echoTone);
    echoTone.connect(echoFb).connect(echo);
    echoTone.connect(echoOut).connect(verbIn);
    echoOut.connect(bus);

    // ---- Briques sonores ----
    const env = (gain, t, attack, peak, decay) => {
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(peak, t + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    };
    const osc = (type, freq, t, dur, dest) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      o.connect(dest);
      o.start(t);
      o.stop(t + dur + 0.05);
      return o;
    };
    const burst = (t, dur, freq, q, peak, dest, type = 'bandpass') => {
      const src = ctx.createBufferSource();
      src.buffer = white;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      env(g, t, 0.002, peak, dur);
      src.connect(f).connect(g).connect(dest);
      src.start(t, Math.random() * 1.5);
      src.stop(t + dur + 0.05);
    };
    const toVerb = (node, amount) => {
      const send = ctx.createGain();
      send.gain.value = amount;
      node.connect(send).connect(verbIn);
    };

    /**
     * Un coup de pioche : choc sourd dans la roche, éclat de pierre, puis le « tink » du fer qui sonne (partiels inharmoniques),
     * et l'écho de la galerie. `far` éloigne le coup (plus sourd, plus bas).
     */
    function strike(t, power = 1, far = 0.6) {
      const dry = ctx.createGain();
      dry.gain.value = (1 - far * 0.5) * power;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 7000 - far * 4200;
      dry.connect(tone).connect(bus);
      toVerb(tone, 0.35 + far * 0.4);
      const send = ctx.createGain();
      send.gain.value = 0.45;
      tone.connect(send).connect(echo);
      // Choc : un coup sourd qui descend.
      const thud = ctx.createGain();
      const o = osc('sine', rand(120, 150), t, 0.12, thud);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.1);
      env(thud, t, 0.002, 0.4, 0.11);
      thud.connect(dry);
      // Éclat de roche : bruit passe-bande, plus un craquement aigu très bref.
      burst(t, rand(0.06, 0.1), rand(1500, 2300), 0.8, 0.5, dry);
      burst(t + 0.004, 0.025, rand(4200, 5600), 1.2, 0.22, dry);
      // Le fer qui sonne : trois partiels inharmoniques à décroissance différente.
      const base = rand(1500, 2100);
      for (const [ratio, peak, decay] of [[1, 0.13, 0.32], [2.32, 0.075, 0.18], [4.17, 0.04, 0.1], [6.43, 0.02, 0.06]]) {
        const g = ctx.createGain();
        osc('sine', base * ratio * rand(0.995, 1.005), t, decay, g);
        env(g, t + 0.001, 0.001, peak * power, decay);
        g.connect(dry);
      }
    }

    /** Gravats qui retombent après un coup : de minuscules claquements de pierre. */
    function pebbles(t) {
      const n = Math.floor(rand(3, 7));
      let at = t + rand(0.12, 0.3);
      for (let i = 0; i < n; i++) {
        burst(at, 0.018, rand(2500, 4800), 2.2, rand(0.03, 0.09) * (1 - i / (n + 1)), bus);
        at += rand(0.05, 0.22) * (1 + i * 0.35);
      }
    }

    // ---- Instruments ----
    function pad(t, dur, notes, peak, { attack = 1.2, tone = 1100 } = {}) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(tone * 0.5, t);
      lp.frequency.linearRampToValueAtTime(tone, t + dur * 0.5);
      lp.frequency.linearRampToValueAtTime(tone * 0.6, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + attack);
      g.gain.linearRampToValueAtTime(peak * 0.8, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.4);
      for (const n of notes) {
        for (const cents of [-7, 0, 7]) {
          const o = osc(cents === 0 ? 'triangle' : 'sawtooth', midi(n), t, dur + 1.4, lp);
          o.detune.value = cents;
        }
      }
      lp.connect(g);
      g.connect(bus);
      toVerb(g, 0.7);
    }
    function pluck(t, note, peak = 0.12, dur = 1.1, bright = 3200) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(bright, t);
      lp.frequency.exponentialRampToValueAtTime(500, t + dur);
      const g = ctx.createGain();
      env(g, t, 0.004, peak, dur);
      osc('triangle', midi(note), t, dur, lp);
      const g2 = ctx.createGain();
      g2.gain.value = 0.35;
      osc('sine', midi(note + 12), t, dur, g2).detune.value = 3;
      g2.connect(lp);
      lp.connect(g);
      g.connect(bus);
      toVerb(g, 0.55);
    }
    function bell(t, note, peak = 0.09, dur = 2.2) {
      const g = ctx.createGain();
      env(g, t, 0.003, peak, dur);
      for (const [ratio, amp] of [[1, 1], [2.01, 0.4], [3.02, 0.22], [4.97, 0.1]]) {
        const a = ctx.createGain();
        a.gain.value = amp;
        osc('sine', midi(note) * ratio, t, dur, a).detune.value = rand(-2, 2);
        a.connect(g);
      }
      g.connect(bus);
      toVerb(g, 0.8);
    }
    function bass(t, note, dur = 0.5, peak = 0.22) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      const g = ctx.createGain();
      env(g, t, 0.012, peak, dur);
      osc('triangle', midi(note), t, dur, lp);
      osc('sine', midi(note - 12), t, dur, lp);
      lp.connect(g);
      g.connect(bus);
    }
    function horn(t, note, dur = 1.6, peak = 0.07) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(500, t);
      lp.frequency.linearRampToValueAtTime(1500, t + dur * 0.4);
      lp.frequency.linearRampToValueAtTime(600, t + dur);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5;
      const vg = ctx.createGain();
      vg.gain.value = 6;
      vib.connect(vg);
      vib.start(t);
      vib.stop(t + dur + 0.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.25);
      g.gain.linearRampToValueAtTime(peak * 0.7, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
      for (const c of [-6, 6]) {
        const o = osc('sawtooth', midi(note), t, dur + 0.3, lp);
        o.detune.value = c;
        vg.connect(o.detune);
      }
      lp.connect(g);
      g.connect(bus);
      toVerb(g, 0.6);
    }
    function anvil(t, soft = 0.5) {
      const g = ctx.createGain();
      g.gain.value = soft;
      const base = rand(900, 1100);
      for (const [ratio, peak, decay] of [[1, 0.12, 0.5], [2.4, 0.07, 0.3], [3.9, 0.04, 0.2], [5.6, 0.02, 0.12]]) {
        const a = ctx.createGain();
        osc('sine', base * ratio, t, decay, a);
        env(a, t, 0.001, peak, decay);
        a.connect(g);
      }
      burst(t, 0.03, 3500, 1, 0.12, g);
      g.connect(bus);
      toVerb(g, 0.5);
    }
    function kick(t, peak = 0.3) {
      const g = ctx.createGain();
      const o = osc('sine', 110, t, 0.22, g);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
      env(g, t, 0.003, peak, 0.2);
      g.connect(bus);
    }
    function shaker(t, peak = 0.05) {
      burst(t, 0.05, 7500, 0.8, peak, bus, 'highpass');
    }

    // ---- Les trois musiques ----
    // Dorien en ré : degrés 0 à 6 = ré mi fa sol la si do ; (degré, octave) → note MIDI.
    const DORIAN = [0, 2, 3, 5, 7, 9, 10];
    const degree = (d, root = 62) => root + DORIAN[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
    // Motifs de deux mesures (8 temps), écrits en degrés ; null = silence ; [temps, degré, durée en temps].
    const MOTIFS = [
      [[0, 7, 1], [1, 9, 1], [2, 11, 1.5], [3.5, 10, 0.5], [4, 9, 2], [6.5, 7, 1]],
      [[0, 11, 1], [1, 9, 0.5], [1.5, 7, 0.5], [2, 6, 2], [4.5, 7, 1], [5.5, 9, 1.5]],
      [[0, 7, 2], [2, 8, 1], [3, 9, 1], [4, 11, 2], [6, 10, 1], [7, 9, 1]],
      [[1, 4, 1], [2, 7, 1.5], [3.5, 9, 0.5], [4, 8, 2], [6.5, 7, 1.5]],
    ];
    const CHORDS = [
      { root: 38, notes: [50, 53, 57, 60] }, // Ré mineur 7
      { root: 43, notes: [47, 50, 53, 55] }, // Sol 7 (sans la quinte basse)
      { root: 36, notes: [48, 52, 55, 59] }, // Do majeur 7
      { root: 45, notes: [48, 52, 55, 57] }, // La mineur 7
    ];
    const PROGRESSION = [0, 0, 1, 1, 2, 3, 0, 0]; // huit mesures

    const TRACKS = {
      // Calme, large, pour travailler : nappes, basse lente, mélodie qui respire.
      galerie: {
        bpm: 62,
        onStep(step, t, beat) {
          const bar = Math.floor(step / 16);
          const inBar = step % 16;
          const chord = CHORDS[PROGRESSION[bar % 8]];
          const barLen = beat * 4;
          if (inBar === 0) {
            pad(t, barLen * 1.05, chord.notes, 0.045, { tone: 1000 });
            bass(t, chord.root, barLen * 0.9, 0.2);
          }
          if (inBar === 8 && Math.random() < 0.6) bass(t, chord.root + 7, beat * 1.2, 0.1);
          // Mélodie : un motif de deux mesures toutes les deux mesures, avec variations.
          if (bar % 2 === 0 && inBar === 0 && Math.random() < 0.85) {
            const motif = pick(MOTIFS);
            const shift = pick([0, 0, 0, -7]);
            const drop = Math.random() < 0.35 ? Math.floor(Math.random() * motif.length) : -1;
            motif.forEach(([at, deg, len], i) => {
              if (i === drop) return;
              pluck(t + at * beat, degree(deg + shift), 0.1, Math.min(2.2, len * beat * 1.6 + 0.6), 2800);
            });
          }
          // Étincelles de fond, très rares.
          if (inBar % 4 === 2 && Math.random() < 0.08) bell(t, degree(pick([14, 11, 9, 7])) + 0, 0.045, 2.6);
        },
      },
      // Plus rythmé, comme au chantier : basse en ostinato, enclume, shaker, cor lointain.
      forge: {
        bpm: 84,
        onStep(step, t, beat) {
          const bar = Math.floor(step / 16);
          const s = step % 16;
          const chord = CHORDS[PROGRESSION[bar % 8]];
          if (s % 4 === 0) kick(t, s === 0 ? 0.26 : 0.18);
          if (s % 2 === 0) shaker(t, s % 4 === 2 ? 0.045 : 0.03);
          if (s === 4 || s === 12) anvil(t, 0.45);
          const line = [0, null, 0, null, 7, null, 0, 3, 0, null, 0, null, 10, null, 7, null];
          if (line[s] != null) bass(t, chord.root + line[s], beat * 0.45, 0.16);
          if (s === 0 && bar % 2 === 0) pad(t, beat * 8, chord.notes, 0.03, { tone: 800 });
          if (s === 0 && bar % 4 === 1 && Math.random() < 0.8) horn(t, degree(pick([4, 7, 8, 9])), beat * 3.2, 0.06);
        },
      },
      // Boîte à musique de cristaux : arpèges brillants, très aérés.
      cristal: {
        bpm: 72,
        onStep(step, t, beat) {
          const bar = Math.floor(step / 16);
          const s = step % 16;
          const chord = CHORDS[PROGRESSION[bar % 8]];
          if (s === 0) pad(t, beat * 4.2, chord.notes.map((n) => n + 12), 0.03, { tone: 1800, attack: 1.6 });
          if (s % 2 === 0) {
            const order = [0, 1, 2, 3, 2, 1, 3, 2];
            if (Math.random() < 0.8) bell(t, chord.notes[order[(s / 2) % 8] % 4] + 12 + (s % 8 === 6 ? 12 : 0), 0.06, 2.4);
          }
          if (s === 0) bass(t, chord.root + 12, beat * 3.5, 0.1);
        },
      },
    };

    // ---- Ordonnancement ----
    const state = {
      music: TRACKS[music] || null,
      step: 0,
      nextStep: null,
      nextPick: null,
      pickLeft: 0,
      stopped: false,
    };
    let rumbleSrc = null;
    let rumbleGain = null;
    if (rumble) {
      rumbleGain = keep(ctx.createGain());
      rumbleGain.gain.value = 0.0001;
      const src = keep(ctx.createBufferSource());
      src.buffer = noise;
      src.loop = true;
      const low = keep(ctx.createBiquadFilter());
      low.type = 'lowpass';
      low.frequency.value = 120;
      src.connect(low).connect(rumbleGain).connect(bus);
      // Deux ronflements très graves (ré et la), et une respiration lente de l'ensemble.
      for (const f of [36.7, 55]) {
        const o = keep(ctx.createOscillator());
        o.type = 'sine';
        o.frequency.value = f;
        const g = keep(ctx.createGain());
        g.gain.value = 0.35;
        o.connect(g).connect(rumbleGain);
        o.start();
      }
      const lfo = keep(ctx.createOscillator());
      lfo.frequency.value = 0.18;
      const lg = keep(ctx.createGain());
      lg.gain.value = 0.04;
      lfo.connect(lg).connect(rumbleGain.gain);
      lfo.start();
      src.start();
      rumbleSrc = src;
    }

    return {
      /** Programme tout ce qui doit sonner d'ici `now + 0.4` seconde. */
      tick(now) {
        if (state.stopped) return;
        const horizon = now + 0.4;
        if (rumbleGain && rumbleGain.gain.value < 0.05 && !state.rumbleUp) {
          state.rumbleUp = true;
          rumbleGain.gain.setTargetAtTime(0.06, now, 1.5);
        }
        if (taps) {
          if (state.nextPick === null) state.nextPick = now + rand(1.2, 3);
          while (state.nextPick < horizon) {
            const at = state.nextPick;
            if (state.pickLeft <= 0) {
              state.pickLeft = Math.random() < 0.3 ? 2 : Math.random() < 0.5 ? 3 : 1;
              state.pickSeries = 0;
            }
            strike(at, 0.75 + Math.random() * 0.25, rand(0.45, 0.8));
            if (Math.random() < 0.4) pebbles(at);
            state.pickLeft--;
            state.pickSeries++;
            // Dans une série, la cadence s'accélère un peu ; entre deux séries, de longs silences.
            state.nextPick = at + (state.pickLeft > 0 ? 0.52 - state.pickSeries * 0.03 + rand(-0.02, 0.04) : rand(3.5, 9));
          }
        }
        if (state.music) {
          const beat = 60 / state.music.bpm;
          const stepLen = beat / 4;
          if (state.nextStep === null) state.nextStep = now + 0.3;
          while (state.nextStep < horizon) {
            state.music.onStep(state.step, state.nextStep, beat);
            state.step++;
            state.nextStep += stepLen;
          }
        }
      },
      /** Fondu de sortie, puis les branchements sont défaits. */
      stop() {
        if (state.stopped) return;
        state.stopped = true;
        const t = ctx.currentTime;
        bus.gain.cancelScheduledValues(t);
        bus.gain.setValueAtTime(bus.gain.value, t);
        bus.gain.linearRampToValueAtTime(0.0001, t + 0.9);
        try {
          if (rumbleSrc) rumbleSrc.stop(t + 1);
        } catch {
          /* déjà arrêté */
        }
        setTimeout(() => {
          for (const n of nodes) {
            try {
              n.disconnect();
            } catch {
              /* déjà défait */
            }
          }
        }, 2500);
      },
    };
  }

  global.Ambience = { make, TRACKS: ['galerie', 'forge', 'cristal'] };
})(typeof window !== 'undefined' ? window : globalThis);
