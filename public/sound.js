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
  let drill = null;
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
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function ready() {
    return enabled && audio() && ctx.state !== 'closed';
  }

  /** Note simple avec enveloppe percussive. */
  function tone(freq, { at = 0, dur = 0.15, type = 'square', gain = 0.2, to = null } = {}) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Bouffée de bruit filtré (chocs, éboulis). */
  function burst({ at = 0, dur = 0.25, freq = 400, gain = 0.4, type = 'lowpass' } = {}) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  // Gamme pentatonique : chaque couche traversée sonne un peu plus aigu.
  const PENTA = [262, 294, 330, 392, 440, 523, 587, 659, 784, 880];

  const Sound = {
    configure(options) {
      if ('enabled' in options) enabled = Boolean(options.enabled);
      if ('volume' in options) volume = Math.max(0, Math.min(1, options.volume));
      if (master) master.gain.setTargetAtTime(enabled ? volume : 0, ctx.currentTime, 0.05);
      if (!enabled) this.drill(false);
    },

    unlock() {
      if (enabled) audio();
    },

    /** Bruit continu de la foreuse ; la roche plus dure (zone plus profonde) sonne plus aigu. */
    drill(on, zone = 0) {
      if (!on) {
        if (drill) {
          const { src, osc, out } = drill;
          out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.06);
          src.stop(ctx.currentTime + 0.3);
          osc.stop(ctx.currentTime + 0.3);
          drill = null;
        }
        return;
      }
      if (!ready()) return;
      if (drill) {
        drill.filter.frequency.setTargetAtTime(220 + zone * 110, ctx.currentTime, 0.1);
        drill.osc.frequency.setTargetAtTime(48 + zone * 7, ctx.currentTime, 0.1);
        return;
      }
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 220 + zone * 110;
      filter.Q.value = 1.2;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 48 + zone * 7;
      const oscGain = ctx.createGain();
      oscGain.gain.value = 0.05;
      // Vibration du moteur : le volume pulse rapidement.
      const out = ctx.createGain();
      out.gain.value = 0.0001;
      out.gain.setTargetAtTime(0.5, ctx.currentTime, 0.05);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 16;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.18;
      lfo.connect(lfoGain).connect(out.gain);
      src.connect(filter).connect(out);
      osc.connect(oscGain).connect(out);
      out.connect(master);
      src.start();
      osc.start();
      lfo.start();
      src.onended = () => lfo.stop();
      drill = { src, osc, filter, out };
    },

    /** Passage d'une couche géologique : choc sourd puis petite note. */
    layer(zone) {
      if (!ready()) return;
      tone(140, { dur: 0.3, type: 'sine', gain: 0.5, to: 45 });
      burst({ dur: 0.2, freq: 600, gain: 0.25 });
      tone(PENTA[zone % PENTA.length] * 2, { at: 0.08, dur: 0.25, type: 'triangle', gain: 0.12 });
    },

    /** Réponse validée : plus elle est rare, plus l'arpège monte. */
    tier(id) {
      if (!ready()) return;
      const steps = { evident: 1, courant: 2, original: 3, rare: 4, pepite: 6 }[id] || 0;
      if (!steps) return this.miss();
      const notes = [392, 494, 587, 784, 988, 1175];
      for (let i = 0; i < steps; i++) tone(notes[i], { at: i * 0.07, dur: 0.14, type: 'square', gain: 0.1 });
      if (id === 'pepite') {
        for (let i = 0; i < 8; i++) tone(1400 + Math.random() * 1600, { at: 0.45 + i * 0.05, dur: 0.12, type: 'sine', gain: 0.06 });
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
  };

  ['pointerdown', 'keydown'].forEach((type) => global.addEventListener(type, () => Sound.unlock(), { passive: true }));

  global.Sound = Sound;
})(window);
