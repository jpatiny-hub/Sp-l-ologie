'use strict';

(function () {
  const $ = (id) => document.getElementById(id);
  const ROUNDS = 7;

  const app = {
    me: null,
    game: null,
    timer: null,
    busy: false,
    podium: null,
    profile: null,
    skin: { body: 'classique', bit: 'standard' },
    meLoadedAt: 0,
    // Proposition de correction en attente de confirmation : { text, suggestion }.
    pending: null,
  };

  // ---------- Paramètres (propres à l'appareil) ----------
  const SETTINGS_KEY = 'speleologie.settings';
  const settings = { text: 'normal', sound: true, volume: 60, colorblind: false };
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {});
  } catch {
    /* stockage indisponible : réglages par défaut */
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* stockage indisponible : les réglages valent pour cette visite */
    }
  }

  function applySettings() {
    const root = document.documentElement;
    if (settings.text === 'normal') delete root.dataset.text;
    else root.dataset.text = settings.text;
    Sound.configure({ enabled: settings.sound, volume: settings.volume / 100 });
    Pixel.setColorblind(settings.colorblind);
    root.classList.toggle('colorblind', settings.colorblind);
    const button = $('btn-sound');
    button.setAttribute('aria-pressed', String(settings.sound));
    button.setAttribute('aria-label', settings.sound ? 'Couper le son' : 'Activer le son');
    button.classList.toggle('muted', !settings.sound);
  }

  // ---------- Scène pixel art ----------
  const scene = new Pixel.DrillScene($('scene'));
  scene.onDepth = (points) => {
    $('hud-depth').textContent = Pixel.formatDepth(points);
    $('hud-zone').textContent = Pixel.zoneName(points);
  };
  scene.onDrill = (on, zone) => Sound.drill(on, zone);
  // Fin du forage : une fois dézoomé, on affiche la distance restante jusqu'au centre de la Terre.
  scene.onOverview = (progress) => {
    const box = $('hud-remaining');
    box.hidden = progress < 1;
    if (progress >= 1 && app.game) {
      box.textContent = app.game.score >= Pixel.MAX_POINTS ? 'Centre de la Terre atteint !' : `Il reste ${Pixel.formatRemaining(app.game.score)} jusqu'au centre`;
    }
  };
  // Pendant les résultats, toucher la scène alterne entre la vue d'ensemble et la visite du puits.
  $('scene').addEventListener('click', () => {
    if ($('view-results').hidden) return;
    if (scene.mode === 'overview') scene.tour();
    else scene.overview();
  });
  scene.onZone = (zone) => {
    Sound.layer(zone);
    Sound.drill(true, zone);
  };
  scene.setLayers([], false);
  applySettings();

  $('btn-sound').addEventListener('click', () => {
    settings.sound = !settings.sound;
    applySettings();
    saveSettings();
    if (settings.sound) Sound.reveal();
  });

  const settingsForm = $('form-settings');
  $('btn-settings').addEventListener('click', () => {
    settingsForm.elements.text.value = settings.text;
    settingsForm.elements.sound.checked = settings.sound;
    settingsForm.elements.volume.value = settings.volume;
    settingsForm.elements.colorblind.checked = settings.colorblind;
    $('settings').showModal();
  });
  settingsForm.addEventListener('input', () => {
    const colorblind = settings.colorblind;
    settings.text = settingsForm.elements.text.value || 'normal';
    settings.sound = settingsForm.elements.sound.checked;
    settings.volume = Number(settingsForm.elements.volume.value);
    settings.colorblind = settingsForm.elements.colorblind.checked;
    applySettings();
    saveSettings();
    fitCanvas();
    if (colorblind !== settings.colorblind) refreshColors();
  });
  // Un clic en dehors de la fenêtre la ferme.
  $('settings').addEventListener('click', (event) => {
    if (event.target === $('settings')) $('settings').close();
  });

  /** Redessine ce qui dépend de la palette des raretés. */
  function refreshColors() {
    if (!$('view-results').hidden && app.game) renderResults(app.game);
    const tier = $('feedback-tier');
    if (tier.dataset.tier) tier.style.color = Pixel.TIER_COLORS[tier.dataset.tier];
  }

  // Agrandissement entier (pixels nets). Sur téléphone, on garde au moins un facteur 2
  // et on réduit plutôt la hauteur visible de la coupe.
  function fitCanvas() {
    const canvas = $('scene');
    const wide = window.innerWidth >= 860;
    const maxW = wide ? 520 : Math.min(window.innerWidth - 40, 520);
    const playing = app.game && !app.game.finished && !$('view-game').hidden;
    const maxH = wide ? window.innerHeight - 110 : window.innerHeight * (playing ? 0.34 : 0.42);
    let scale = Math.floor(Math.min(maxW / Pixel.WIDTH, maxH / Pixel.HEIGHT));
    if (!wide) scale = Math.max(scale, Math.min(2, Math.floor(maxW / Pixel.WIDTH)));
    scale = Math.max(1, scale);
    scene.setViewHeight(maxH / scale);
    canvas.style.width = `${Pixel.WIDTH * scale}px`;
    canvas.style.height = `${scene.h * scale}px`;
  }
  window.addEventListener('resize', fitCanvas);

  // ---------- Utilitaires ----------
  // Serveur momentanément injoignable (redémarrage lors d'une mise à jour) : on réessaie en
  // silence pendant une dizaine de secondes avant d'afficher une erreur.
  const RETRY_DELAYS = [500, 1000, 1500, 2000, 2500, 3000];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function api(path, body) {
    const opts = { credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      opts.method = 'POST';
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    let res = null;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetch(path, opts);
        // 502 à 504 : le proxy répond mais le jeu redémarre.
        if (res.status < 502 || res.status > 504) break;
      } catch {
        res = null;
      }
      if (attempt >= RETRY_DELAYS.length) break;
      await sleep(RETRY_DELAYS[attempt]);
    }
    if (!res || (res.status >= 502 && res.status <= 504)) {
      const err = new Error('Le serveur ne répond pas pour le moment. Réessaie dans un instant.');
      err.status = 0;
      throw err;
    }
    noteVersion(res.headers.get('X-App-Version'));
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* réponse vide */
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Erreur inattendue, réessaie.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // Message passager (remplace les fenêtres d'alerte, qui bloquent la page).
  let noticeTimer = null;
  function showNotice(text) {
    const box = $('notice');
    box.textContent = text;
    box.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (box.hidden = true), 6000);
  }

  // ---------- Nouvelle version ----------
  let loadedVersion = null;
  let newVersion = false;

  function noteVersion(version) {
    if (!version) return;
    if (!loadedVersion) loadedVersion = version;
    else if (version !== loadedVersion && !newVersion) {
      newVersion = true;
      updateBanner();
    }
  }

  /** Le bandeau n'apparaît jamais pendant une manche : seulement entre deux thèmes ou hors partie. */
  function updateBanner() {
    const playing = !$('view-game').hidden && !$('pane-prompt').hidden;
    $('update-banner').hidden = !newVersion || playing;
  }
  $('btn-reload').addEventListener('click', () => location.reload());

  // Vérification régulière, même sans action du joueur.
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      fetch('/api/health', { credentials: 'same-origin' })
        .then((res) => noteVersion(res.headers.get('X-App-Version')))
        .catch(() => {});
    }
  }, 5 * 60 * 1000);

  function show(view) {
    document.querySelectorAll('.view').forEach((v) => (v.hidden = v.id !== `view-${view}`));
    $('stage').hidden = (view === 'podium' || view === 'profile') && window.innerWidth < 860;
    if (view === 'profile') startPreview();
    updateBanner();
    $('who').hidden = !app.me;
    $('settings-account').hidden = !app.me;
    fitCanvas();
    window.scrollTo(0, 0);
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'style') Object.assign(node.style, v);
      else node.setAttribute(k, v);
    }
    for (const child of children) if (child != null) node.append(child);
    return node;
  }

  function formatDay(day, opts) {
    return new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-BE', { timeZone: 'UTC', ...opts });
  }

  function formatDuration(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  }

  function pts(n) {
    return `${n} pt${n > 1 ? 's' : ''}`;
  }

  function layersOf(state) {
    return state.rounds.filter((r) => r.status === 'done').map((r) => ({ points: r.points, tier: r.tier.id }));
  }

  function plural(n, one, many) {
    return `${n.toLocaleString('fr-BE')}\u00a0${n > 1 ? many : one}`;
  }

  function othersText(n) {
    if (n == null) return '';
    return n === 0 ? 'Personne d\'autre ne l\'a encore donnée.' : `Déjà donnée par ${plural(n, 'autre joueur', 'autres joueurs')}.`;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs = {}, text) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    return node;
  }

  function setTimerSeconds(seconds) {
    document.querySelectorAll('.timer-seconds').forEach((n) => (n.textContent = seconds));
  }

  // ---------- Authentification ----------
  function showAuthTab(tab) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('[data-pane]').forEach((f) => (f.hidden = f.dataset.pane !== tab));
    document.querySelectorAll('[data-pane] .error').forEach((e) => (e.textContent = ''));
  }
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showAuthTab(t.dataset.tab)));
  document.querySelectorAll('[data-tab-link]').forEach((t) => t.addEventListener('click', () => showAuthTab(t.dataset.tabLink)));

  function bindForm(id, handler) {
    const form = $(id);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const error = form.querySelector('.error');
      const button = form.querySelector('button[type=submit]');
      error.textContent = '';
      button.disabled = true;
      try {
        await handler(Object.fromEntries(new FormData(form)), form);
      } catch (err) {
        error.textContent = err.message;
      } finally {
        button.disabled = false;
      }
    });
  }

  bindForm('form-login', async ({ username, password }, form) => {
    await api('/api/login', { username, password });
    form.reset();
    await goHome();
  });

  bindForm('form-signup', async ({ username, password, confirm }, form) => {
    if (password !== confirm) throw new Error('Les deux mots de passe ne correspondent pas.');
    const data = await api('/api/signup', { username, password });
    form.reset();
    showRecoveryCode(data.recoveryCode);
  });

  bindForm('form-recover', async (fields, form) => {
    const data = await api('/api/recover', fields);
    form.reset();
    showRecoveryCode(data.recoveryCode);
  });

  function showRecoveryCode(code) {
    $('recovery-code').textContent = code;
    show('recovery');
  }
  $('btn-copy-code').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('recovery-code').textContent);
      $('btn-copy-code').textContent = 'Code copié !';
    } catch {
      $('btn-copy-code').textContent = 'Copie impossible : recopie-le à la main';
    }
  });
  $('btn-recovery-done').addEventListener('click', () => goHome());

  $('btn-logout').addEventListener('click', async () => {
    $('settings').close();
    stopTimer();
    await api('/api/logout', {}).catch(() => {});
    app.me = null;
    app.game = null;
    scene.setLayers([], false);
    showAuthTab('login');
    show('auth');
  });

  // ---------- Accueil ----------
  async function goHome() {
    stopTimer();
    const me = await api('/api/me');
    if (!me.user) {
      app.me = null;
      show('auth');
      return;
    }
    app.me = me;
    app.meLoadedAt = Date.now();
    app.game = null;
    app.skin = me.skin;
    scene.setSkin(me.skin);
    setTimerSeconds(app.me.timerSeconds);
    $('who').textContent = app.me.user.username;
    $('settings-user').textContent = app.me.user.username;
    renderHome();
    show('home');
    loadMiniPodium();
    loadCarnetSummary();
  }

  async function loadCarnetSummary() {
    $('carnet-dot').hidden = !app.me.unseenBadges;
    try {
      const profile = await api('/api/profile');
      const earned = profile.badges.filter((b) => b.count).length;
      const streak = profile.stats.currentStreak;
      $('carnet-summary').textContent = `${streak ? `Série en cours : ${plural(streak, 'jour', 'jours')}` : 'Pas de série en cours'} · ${plural(earned, 'badge', 'badges')} sur ${profile.badges.length}`;
    } catch {
      /* résumé facultatif */
    }
  }

  function renderHome() {
    const today = app.me.today;
    $('today-date').textContent = formatDay(today.day, { weekday: 'long', day: 'numeric', month: 'long' });
    const status = $('today-status');
    status.replaceChildren();
    const button = $('btn-daily');
    if (!today.gameId) {
      status.append(el('p', {}, '7 thèmes t\'attendent. Prêt à creuser ?'));
      button.textContent = 'Commencer le forage';
      scene.setLayers([], false);
    } else if (!today.finished) {
      status.append(el('p', {}, `Forage en cours : ${today.roundsDone}/${ROUNDS} thèmes, ${pts(today.score)}.`));
      button.textContent = 'Reprendre le forage';
    } else {
      status.append(
        el('p', { class: 'big' }, pts(today.score)),
        el('p', {}, `${Pixel.formatDepth(today.score)} · ${Pixel.zoneName(today.score)}`),
      );
      button.textContent = 'Revoir mon forage';
    }
    if (today.gameId) {
      api(`/api/game/${today.gameId}`)
        .then((state) => scene.setLayers(layersOf(state), false))
        .catch(() => {});
    }
    updateCountdown();
  }

  function updateCountdown() {
    if (!app.me) return;
    const left = app.me.nextResetMs - (Date.now() - app.meLoadedAt);
    if (left <= 0 && !$('view-home').hidden) {
      goHome();
      return;
    }
    $('next-reset').textContent = `Nouveaux thèmes dans ${formatDuration(left)}`;
  }
  setInterval(updateCountdown, 1000);

  $('btn-daily').addEventListener('click', () => startGame('daily'));
  $('btn-training').addEventListener('click', () => startGame('training'));
  $('btn-podium').addEventListener('click', () => openPodium('week', null));

  async function loadMiniPodium() {
    const list = $('mini-podium');
    try {
      const board = await api('/api/leaderboard');
      list.replaceChildren();
      const medals = ['🥇', '🥈', '🥉'];
      board.entries.slice(0, 3).forEach((e) => {
        list.append(el('li', { class: e.me ? 'me' : '' }, el('span', {}, `${medals[e.rank - 1] || e.rank + '.'} ${e.username}`), el('span', {}, pts(e.score))));
      });
      if (!board.entries.length) list.append(el('li', {}, 'Personne n\'a encore creusé cette semaine.'));
      if (board.me && board.me.rank > 3) list.append(el('li', { class: 'me' }, el('span', {}, `${board.me.rank}. toi`), el('span', {}, pts(board.me.score))));
    } catch {
      list.replaceChildren(el('li', {}, 'Classement indisponible.'));
    }
  }

  // ---------- Partie ----------
  async function startGame(mode) {
    try {
      const state = await api('/api/game/start', { mode });
      enterGame(state);
    } catch (err) {
      showNotice(err.message);
    }
  }

  function enterGame(state) {
    app.game = state;
    scene.setLayers(layersOf(state), false);
    if (state.finished) return showResults(state);
    show('game');
    renderGame();
  }

  function renderGame() {
    const s = app.game;
    const done = s.rounds.filter((r) => r.status === 'done').length;
    $('game-mode').textContent = s.mode === 'daily' ? 'Forage du jour' : 'Entraînement';
    $('game-progress').textContent = `${Math.min(done + 1, ROUNDS)}/${ROUNDS}`;
    $('game-score').textContent = pts(s.score);
    setTimerSeconds(s.timerSeconds);
    $('pane-feedback').hidden = true;

    const active = s.rounds.find((r) => r.status === 'active');
    if (active) return showPrompt(active, s.current ? s.current.remainingMs : 0);
    const next = s.rounds.find((r) => r.status === 'pending');
    $('pane-prompt').hidden = true;
    $('pane-ready').hidden = false;
    $('ready-title').textContent = `Thème ${next.slot + 1} sur ${ROUNDS}`;
    $('btn-reveal').focus();
  }

  $('btn-reveal').addEventListener('click', async () => {
    if (app.busy) return;
    app.busy = true;
    try {
      app.game = await api(`/api/game/${app.game.id}/reveal`, {});
      Sound.reveal();
      renderGame();
    } catch (err) {
      showNotice(err.message);
    } finally {
      app.busy = false;
    }
  });

  function showPrompt(round, remainingMs) {
    $('pane-ready').hidden = true;
    $('pane-prompt').hidden = false;
    updateBanner();
    $('prompt-index').textContent = `Thème ${round.slot + 1} sur ${ROUNDS}`;
    $('prompt-title').textContent = round.title;
    $('answer-error').textContent = '';
    clearPending();
    hideReport();
    const input = $('answer-input');
    input.value = '';
    input.focus();
    startTimer(remainingMs);
  }

  function startTimer(remainingMs) {
    stopTimer();
    const total = app.game.timerSeconds * 1000;
    const deadline = performance.now() + remainingMs;
    const bar = $('timer-bar');
    let lastSecond = null;
    const tick = () => {
      const left = deadline - performance.now();
      const second = Math.ceil(left / 1000);
      if (second <= 5 && second > 0 && second !== lastSecond) Sound.tick(second <= 3);
      lastSecond = second;
      const ratio = Math.max(0, Math.min(1, left / total));
      bar.style.width = `${ratio * 100}%`;
      bar.classList.toggle('warn', left < 15000 && left >= 7000);
      bar.classList.toggle('danger', left < 7000);
      if (left <= 0) {
        stopTimer();
        skipRound();
      }
    };
    tick();
    app.timer = setInterval(tick, 100);
  }

  function stopTimer() {
    if (app.timer) clearInterval(app.timer);
    app.timer = null;
  }

  function clearPending() {
    app.pending = null;
    $('answer-confirm').hidden = true;
    $('answer-actions').hidden = false;
  }

  async function sendAnswer(text, extra = {}) {
    if (app.busy) return;
    app.busy = true;
    const input = $('answer-input');
    try {
      const res = await api(`/api/game/${app.game.id}/answer`, { text, ...extra });
      if (res.result === 'confirm') {
        app.game = res.state;
        app.pending = { text, suggestion: res.suggestion };
        $('confirm-suggestion').textContent = `« ${res.suggestion} »`;
        $('answer-confirm').hidden = false;
        $('answer-actions').hidden = true;
        hideReport();
        $('answer-error').textContent = '';
        Sound.ask();
      } else if (res.result === 'unknown') {
        clearPending();
        $('answer-error').textContent = extra.reject
          ? 'D\'accord, essaie autre chose !'
          : `« ${text} » ne fait pas partie des réponses connues pour ce thème. Essaie autre chose !`;
        input.classList.remove('shake');
        void input.offsetWidth;
        input.classList.add('shake');
        input.select();
        app.game = res.state;
        offerReport(text);
        Sound.wrong();
      } else {
        clearPending();
        roundFinished(res);
      }
    } catch (err) {
      // La réponse a pu être notée juste avant une coupure : on reprend l'état du serveur.
      if (err.status === 409 && (await resync())) return;
      $('answer-error').textContent = err.message;
    } finally {
      app.busy = false;
    }
  }

  // ---------- Signaler une réponse refusée ----------
  function hideReport() {
    app.refused = null;
    $('btn-report').hidden = true;
    $('report-status').hidden = true;
  }

  function offerReport(text) {
    app.refused = text;
    const button = $('btn-report');
    button.textContent = `Je pense que « ${text} » est correcte`;
    button.hidden = false;
    $('report-status').hidden = true;
  }

  $('btn-report').addEventListener('click', async () => {
    const text = app.refused;
    if (!text || !app.game) return;
    $('btn-report').hidden = true;
    const status = $('report-status');
    status.hidden = false;
    try {
      const res = await api(`/api/game/${app.game.id}/report`, { text });
      status.textContent = res.status === 'known'
        ? `« ${res.label} » est déjà acceptée : valide-la !`
        : `Merci ! « ${text} » sera vérifiée et ajoutée si elle est correcte. Tu peux continuer à jouer.`;
    } catch (err) {
      status.textContent = err.message;
    }
    $('answer-input').focus();
  });

  /** Recharge la partie depuis le serveur après un imprévu. Renvoie true si l'affichage a changé. */
  async function resync() {
    try {
      const state = await api(`/api/game/${app.game.id}`);
      const before = app.game.rounds.filter((r) => r.status === 'done').length;
      const after = state.rounds.filter((r) => r.status === 'done').length;
      app.game = state;
      if (after === before) return false;
      stopTimer();
      clearPending();
      scene.setLayers(layersOf(state), true);
      if (state.finished) showResults(state);
      else renderGame();
      return true;
    } catch {
      return false;
    }
  }

  $('form-answer').addEventListener('submit', (event) => {
    event.preventDefault();
    const text = $('answer-input').value.trim();
    if (!text) return;
    // Entrée sans rien changer : on accepte la proposition affichée.
    if (app.pending && app.pending.text === text) sendAnswer(text, { accept: app.pending.suggestion });
    else sendAnswer(text);
  });
  $('answer-input').addEventListener('input', () => {
    if (app.pending && $('answer-input').value.trim() !== app.pending.text) clearPending();
  });
  $('btn-confirm-yes').addEventListener('click', () => {
    if (app.pending) sendAnswer(app.pending.text, { accept: app.pending.suggestion });
  });
  $('btn-confirm-no').addEventListener('click', () => {
    if (app.pending) sendAnswer(app.pending.text, { reject: true });
    $('answer-input').focus();
  });

  $('btn-skip').addEventListener('click', () => skipRound());

  async function skipRound() {
    if (app.busy || !app.game) return;
    app.busy = true;
    stopTimer();
    clearPending();
    try {
      roundFinished(await api(`/api/game/${app.game.id}/skip`, {}));
    } catch (err) {
      // La manche a pu être clôturée côté serveur entre-temps : on resynchronise.
      try {
        app.game = await api(`/api/game/${app.game.id}`);
        scene.setLayers(layersOf(app.game), false);
        if (app.game.finished) showResults(app.game);
        else renderGame();
      } catch {
        showNotice(err.message);
      }
    } finally {
      app.busy = false;
    }
  }

  function roundFinished({ round, state }) {
    stopTimer();
    app.game = state;
    scene.setLayers(layersOf(state), true);
    $('pane-prompt').hidden = true;
    $('pane-ready').hidden = true;
    $('pane-feedback').hidden = false;
    updateBanner();
    $('game-score').textContent = pts(state.score);

    $('feedback-theme').textContent = round.title;
    $('feedback-points').textContent = `+${round.points}`;
    const tier = $('feedback-tier');
    tier.textContent = round.tier.label;
    tier.dataset.tier = round.tier.id;
    tier.style.color = Pixel.TIER_COLORS[round.tier.id];
    Sound.tier(round.tier.id);
    const answer = $('feedback-answer');
    const odds = $('feedback-odds');
    if (round.outcome === 'answer') {
      const understood = round.input && round.input.toLowerCase() !== round.answer.toLowerCase();
      answer.textContent = `Ta réponse : ${round.answer}${understood ? ` (tu as écrit « ${round.input} »)` : ''}`;
      const oneIn = Math.max(1, Math.round(1 / round.probability));
      odds.textContent = round.tier.id === 'pepite'
        ? 'Personne ne l\'avait encore trouvée !'
        : `Environ 1 joueur sur ${oneIn.toLocaleString('fr-BE')} y pense.`;
      $('feedback-others').textContent = othersText(round.othersCount);
    } else {
      answer.textContent = round.outcome === 'timeout' ? 'Le chrono est arrivé à zéro.' : 'Tu as passé ce thème.';
      odds.textContent = '';
      $('feedback-others').textContent = '';
    }
    $('btn-next').textContent = state.finished ? 'Voir mon forage' : 'Thème suivant';
    $('btn-next').focus();
  }

  $('btn-next').addEventListener('click', () => {
    if (app.game.finished) showResults(app.game);
    else renderGame();
  });

  // ---------- Résultats ----------
  const TIER_ORDER = ['pepite', 'rare', 'original', 'courant', 'evident'];
  const TIER_LABELS = { pepite: 'Pépite', rare: 'Rubis', original: 'Cuivre', courant: 'Soufre', evident: 'Gravier' };

  function showResults(state) {
    stopTimer();
    app.game = state;
    scene.setLayers(layersOf(state), false);
    scene.overview();
    renderResults(state);
    $('share-status').textContent = '';
    $('results-badges').hidden = true;
    show('results');
    if (state.mode === 'daily') showNewBadges();
  }

  async function showNewBadges() {
    try {
      const profile = await api('/api/profile');
      const fresh = profile.badges.filter((b) => b.isNew);
      if (!fresh.length || $('view-results').hidden) return;
      app.profile = profile;
      $('results-badge-list').replaceChildren(...fresh.map(badgeItem));
      $('results-badges').hidden = false;
      Sound.badge();
    } catch {
      /* les badges restent visibles dans le carnet */
    }
  }

  function renderResults(state) {
    $('results-title').textContent = state.mode === 'daily' ? `Forage du ${formatDay(state.day, { day: 'numeric', month: 'long' })} terminé` : 'Entraînement terminé';
    $('results-score').textContent = state.score;
    const centre = state.score >= Pixel.MAX_POINTS;
    $('results-depth').textContent = centre ? '−6 371 km' : `−${Pixel.formatDepth(state.score)}`;
    $('results-zone').textContent = centre ? 'Tu as atteint le centre de la Terre !' : `Ta foreuse s'est arrêtée dans : ${Pixel.zoneName(state.score)}`;
    renderDistribution(state);
    renderDiveLog(state);
    renderCatch(state);
  }

  /** Courbe des scores du jour (estimation par noyau) et position du joueur. */
  function renderDistribution(state) {
    const scores = state.dayScores || [];
    const box = $('results-distribution');
    box.hidden = scores.length < 2;
    if (box.hidden) return;
    const chart = $('distribution-chart');
    chart.replaceChildren();
    const W = 320;
    const left = 8;
    const right = W - 8;
    const base = 96;
    const top = 14;
    const max = 700;
    const x = (v) => left + (Math.min(max, v) / max) * (right - left);
    const n = scores.length;
    const mean = scores.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 30;
    const bw = Math.max(20, 1.06 * sd * n ** -0.2);
    const density = (v) => scores.reduce((sum, s) => sum + Math.exp(-0.5 * ((v - s) / bw) ** 2), 0);
    const points = [];
    let peak = 0;
    for (let v = 0; v <= max; v += 5) {
      const d = density(v);
      points.push([v, d]);
      if (d > peak) peak = d;
    }
    const y = (d) => base - (d / peak) * (base - top);
    const line = points.map(([v, d], i) => `${i ? 'L' : 'M'}${x(v).toFixed(1)},${y(d).toFixed(1)}`).join('');
    chart.append(
      svg('path', { d: `${line}L${right},${base}L${left},${base}Z`, class: 'area' }),
      svg('path', { d: line, class: 'curve' }),
      svg('line', { x1: left, y1: base, x2: right, y2: base, class: 'axis' }),
    );
    for (let v = 0; v <= max; v += 100) {
      chart.append(svg('line', { x1: x(v), y1: base, x2: x(v), y2: base + 3, class: 'axis' }), svg('text', { x: x(v), y: base + 14, class: 'tick' }, v));
    }
    scores.forEach((sc) => chart.append(svg('rect', { x: x(sc) - 1, y: base - 3, width: 2, height: 3, class: 'dot' })));
    const me = x(state.score);
    chart.append(
      svg('line', { x1: me, y1: y(density(state.score)), x2: me, y2: base, class: 'me' }),
      svg('rect', { x: me - 3, y: y(density(state.score)) - 3, width: 6, height: 6, class: 'me-dot' }),
      svg('text', { x: me, y: y(density(state.score)) - 8, class: 'me-label' }, 'TOI'),
    );
    const others = n - 1;
    const below = scores.filter((sc) => sc < state.score).length;
    const pct = Math.round((below / others) * 100);
    chart.setAttribute('aria-label', `Répartition des ${n} scores du jour`);
    $('results-percentile').textContent = `Mieux que ${pct}\u00a0% des joueurs du jour (${plural(n, 'forage', 'forages')} aujourd'hui)`;
  }

  /** Carnet de forage : une colonne par thème, d'autant plus profonde que la réponse est rare. */
  function renderDiveLog(state) {
    const chart = $('divelog-chart');
    chart.replaceChildren();
    const left = 74;
    const right = 312;
    const top = 8;
    const bottom = 172;
    const core = bottom + 14;
    const y = (p) => top + (Math.max(0, Math.min(100, p)) / 100) * (bottom - top);
    // Bandes de rareté, colorées comme des couches de plus en plus profondes ; la pépite tout au fond.
    const bands = [
      [top, y(20), 'evident', '#4a2f1a'],
      [y(20), y(40), 'courant', '#8e5f31'],
      [y(40), y(60), 'original', '#64717e'],
      [y(60), bottom, 'rare', '#5e2013'],
      [bottom, core, 'pepite', '#b5561a'],
    ];
    bands.forEach(([y0, y1, id, fill]) => {
      chart.append(
        svg('rect', { x: left, y: y0, width: right - left, height: y1 - y0, fill, class: 'band' }),
        svg('text', { x: left - 6, y: (y0 + y1) / 2 + 4, class: 'band-label' }, TIER_LABELS[id]),
      );
    });
    const step = (right - left) / state.rounds.length;
    state.rounds.forEach((r, i) => {
      const cx = left + step * (i + 0.5);
      chart.append(svg('text', { x: cx, y: core + 16, class: 'tick' }, i + 1));
      if (r.status !== 'done') return;
      const tierId = r.tier ? r.tier.id : 'skip';
      const color = Pixel.TIER_COLORS[tierId];
      const depth = r.outcome === 'answer' ? r.points : 0;
      const end = depth >= 100 ? (bottom + core) / 2 : y(depth);
      chart.append(svg('line', { x1: cx, y1: top, x2: cx, y2: end, stroke: color, class: 'shaft' }));
      chart.append(svg('rect', { x: cx - 6, y: end - 6, width: 12, height: 12, fill: color, class: 'marker' }));
      if (settings.colorblind && Pixel.TIER_SYMBOLS[tierId]) chart.append(svg('text', { x: cx, y: end + 4, class: 'glyph' }, Pixel.TIER_SYMBOLS[tierId]));
    });
  }

  function swatch(tierId) {
    const node = el('span', { class: 'swatch', style: { background: Pixel.TIER_COLORS[tierId] } });
    if (settings.colorblind) node.textContent = Pixel.TIER_SYMBOLS[tierId] || '';
    return node;
  }

  /** Liste des réponses du joueur ; un appui sur un thème dévoile toutes ses réponses. */
  function renderCatch(state) {
    const list = $('results-answers');
    list.replaceChildren();
    state.rounds.forEach((r) => {
      const tierId = r.tier ? r.tier.id : 'skip';
      const label = r.outcome === 'answer' ? r.answer : r.tier ? r.tier.label : '—';
      const details = el('div', { class: 'theme-answers', hidden: '' });
      const button = el(
        'button',
        { class: 'catch-row', type: 'button', 'aria-expanded': 'false' },
        el('span', { class: 'num' }, String(r.slot + 1)),
        swatch(tierId),
        el(
          'span',
          { class: 'what' },
          el('span', { class: 'theme' }, r.title || `Thème ${r.slot + 1}`),
          el('span', { class: 'answer' }, label),
          r.outcome === 'answer' ? el('span', { class: 'others' }, othersText(r.othersCount)) : null,
        ),
        el('span', { class: 'pts', style: { color: Pixel.TIER_COLORS[tierId] } }, r.points != null ? String(r.points) : '–'),
      );
      button.addEventListener('click', () => toggleThemeAnswers(state, r, button, details));
      list.append(el('li', {}, button, details));
    });
  }

  async function toggleThemeAnswers(state, round, button, details) {
    const open = details.hidden;
    details.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (!open || details.dataset.loaded) return;
    details.replaceChildren(el('p', { class: 'muted' }, 'Chargement des réponses…'));
    try {
      const data = await api(`/api/game/${state.id}/answers?slot=${round.slot}`);
      details.dataset.loaded = '1';
      renderThemeAnswers(details, data, state.id);
    } catch (err) {
      details.replaceChildren(el('p', { class: 'error' }, err.message));
    }
  }

  function renderThemeAnswers(details, data, gameId) {
    const counts = {};
    data.answers.forEach((a) => (counts[a.tier] = (counts[a.tier] || 0) + 1));
    const chips = el('div', { class: 'chips' });
    const list = el('ul', { class: 'answer-list' });
    let filter = 'all';
    const draw = () => {
      list.replaceChildren();
      data.answers
        .filter((a) => filter === 'all' || a.tier === filter)
        .slice()
        .reverse()
        .forEach((a) => {
          list.append(
            el(
              'li',
              { class: a.mine ? 'mine' : '' },
              swatch(a.tier),
              el('span', {}, a.label, a.mine ? el('span', { class: 'you' }, ' ← toi') : null),
              el('span', { class: 'muted' }, a.count ? `×${a.count}` : ''),
              el('span', { class: 'pts', style: { color: Pixel.TIER_COLORS[a.tier] } }, String(a.points)),
            ),
          );
        });
      chips.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.filter === filter));
    };
    const chip = (id, text, n) => {
      const b = el('button', { class: `chip${id === 'all' ? '' : ` t-${id}`}`, type: 'button', 'data-filter': id }, text, el('span', { class: 'n' }, ` ${n}`));
      if (id !== 'all') b.style.color = Pixel.TIER_COLORS[id];
      b.addEventListener('click', () => {
        filter = id;
        draw();
      });
      chips.append(b);
    };
    chip('all', 'Toutes', data.answers.length);
    TIER_ORDER.forEach((id) => counts[id] && chip(id, TIER_LABELS[id], counts[id]));
    // Une bonne réponse manque à la liste : le joueur peut la signaler.
    const missing = el('form', { class: 'missing-form', autocomplete: 'off' });
    const field = el('input', { maxlength: '80', placeholder: 'Une bonne réponse manque ?', 'aria-label': 'Réponse manquante', autocapitalize: 'off', spellcheck: 'false' });
    const note = el('p', { class: 'muted small', role: 'status' });
    missing.append(field, el('button', { class: 'btn small-btn', type: 'submit' }, 'Signaler'));
    missing.addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = field.value.trim();
      if (!text) return;
      try {
        const res = await api(`/api/game/${gameId}/report`, { slot: data.slot, text });
        note.textContent = res.status === 'known' ? `« ${res.label} » fait déjà partie des réponses.` : `Merci ! « ${text} » sera vérifiée.`;
        if (res.status !== 'known') field.value = '';
      } catch (err) {
        note.textContent = err.message;
      }
    });
    details.replaceChildren(
      el('p', { class: 'muted small' }, 'De la plus rare à la plus évidente, avec les points qu\'elle rapporterait aujourd\'hui et le nombre de fois qu\'elle a été donnée.'),
      chips,
      list,
      missing,
      note,
    );
    draw();
  }

  function shareText(state) {
    const day = formatDay(state.day, { day: '2-digit', month: '2-digit' });
    const squares = state.rounds.map((r) => (r.tier ? r.tier.emoji : '⬛')).join('');
    const where = state.score >= Pixel.MAX_POINTS ? 'Centre de la Terre !' : `${Pixel.formatDepth(state.score)} · ${Pixel.zoneName(state.score)}`;
    const title = state.mode === 'daily' ? `⛏️ Spéléologie du ${day}` : '⛏️ Spéléologie (entraînement)';
    return `${title}\n${squares} ${pts(state.score)}\n📍 ${where}\n${location.origin}`;
  }

  $('btn-share').addEventListener('click', async () => {
    const text = shareText(app.game);
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        $('share-status').textContent = 'Résultat copié : colle-le où tu veux !';
      }
    } catch {
      $('share-status').textContent = text;
    }
  });
  $('btn-results-home').addEventListener('click', () => goHome());
  $('btn-results-podium').addEventListener('click', () => openPodium('week', null));

  // ---------- Carnet : badges et atelier ----------
  const CATEGORIES = [
    ['exploit', 'Exploits'], ['serie', 'Séries de forages'], ['profondeur', 'Profondeur'], ['pepites', 'Pépites'], ['podium', 'Podiums'], ['calendrier', 'Jours particuliers'],
  ];

  function longDay(day) {
    return formatDay(day, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function unlockName(unlock) {
    const list = app.profile ? (unlock.type === 'body' ? app.profile.bodies : app.profile.bits) : [];
    const skin = list.find((s) => s.id === unlock.id);
    return skin ? `${unlock.type === 'body' ? 'carrosserie' : 'foret'} « ${skin.name} »` : '';
  }

  function badgeItem(b) {
    const locked = !b.count;
    const icon = el('canvas', { class: 'badge-icon', width: '16', height: '16' });
    Icons.drawBadge(icon, { icon: b.icon, category: b.category, label: b.label, locked });
    let meta = null;
    if (!locked) {
      if (b.years) meta = b.years.length > 1 ? `Années : ${b.years.join(', ')}` : `Le ${longDay(b.lastOn)}`;
      else if (b.count > 1) meta = `${b.count} fois · dernière le ${longDay(b.lastOn)}`;
      else meta = `Obtenu le ${longDay(b.firstOn)}`;
    }
    const unlock = b.unlock ? unlockName(b.unlock) : '';
    return el(
      'div',
      { class: `badge${locked ? ' locked' : ''}${b.isNew ? ' new' : ''}` },
      icon,
      el(
        'div',
        { class: 'badge-text' },
        el('strong', {}, b.name, b.isNew ? el('span', { class: 'new-dot' }, 'nouveau') : null),
        el('span', {}, b.description),
        meta ? el('span', { class: 'muted' }, meta) : null,
        unlock ? el('span', { class: 'unlock' }, `${locked ? 'Débloquera' : 'A débloqué'} : ${unlock}`) : null,
      ),
    );
  }

  async function openProfile() {
    stopTimer();
    try {
      const profile = await api('/api/profile');
      app.profile = profile;
      app.skin = profile.skin;
      renderProfile(profile);
      show('profile');
      loadReports();
      if (profile.badges.some((b) => b.isNew)) {
        api('/api/profile/seen', {}).catch(() => {});
        if (app.me) app.me.unseenBadges = 0;
      }
    } catch (err) {
      showNotice(err.message);
    }
  }

  function renderProfile(profile) {
    const st = profile.stats;
    const stats = [
      ['Série en cours', plural(st.currentStreak, 'jour', 'jours')],
      ['Meilleure série', plural(st.bestStreak, 'jour', 'jours')],
      ['Jours forés', String(st.daysPlayed)],
      ['Pépites trouvées', String(st.pepites)],
      ['Meilleur forage', pts(st.bestScore)],
    ];
    $('profile-stats').replaceChildren(...stats.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
    const sections = $('badge-sections');
    sections.replaceChildren();
    CATEGORIES.forEach(([id, title]) => {
      const list = profile.badges.filter((b) => b.category === id);
      if (!list.length) return;
      const earned = list.filter((b) => b.count).length;
      sections.append(
        el('h3', {}, title, el('span', { class: 'muted small' }, ` ${earned}/${list.length}`)),
        el('div', { class: 'badge-list' }, ...list.map(badgeItem)),
      );
    });
    renderWorkshop();
  }

  function drawSkin(canvas, skin, time, drilling) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    Pixel.drawDrill(ctx, skin, Math.floor(canvas.width / 2) - 8, canvas.height - 2, time, drilling);
  }

  function renderWorkshop() {
    const grid = (type, list, target) => {
      const current = type === 'body' ? app.skin.body : app.skin.bit;
      target.replaceChildren(
        ...list.map((s) => {
          const thumb = el('canvas', { class: 'skin-thumb', width: '22', height: '30' });
          drawSkin(thumb, type === 'body' ? { body: s.id, bit: app.skin.bit } : { body: app.skin.body, bit: s.id }, 0, false);
          const selected = s.id === current;
          const button = el(
            'button',
            { type: 'button', class: `skin${s.unlocked ? '' : ' locked'}${selected ? ' selected' : ''}`, 'aria-pressed': String(selected), title: s.unlocked ? s.name : s.hint },
            thumb,
            el('span', {}, s.unlocked ? s.name : `🔒 ${s.name}`),
          );
          button.addEventListener('click', () => chooseSkin(type, s));
          return button;
        }),
      );
    };
    grid('body', app.profile.bodies, $('skin-bodies'));
    grid('bit', app.profile.bits, $('skin-bits'));
  }

  async function chooseSkin(type, s) {
    const status = $('skin-status');
    if (!s.unlocked) {
      status.textContent = `${s.name} : ${s.hint}`;
      return;
    }
    const next = { ...app.skin, [type]: s.id };
    try {
      const res = await api('/api/profile/skin', next);
      app.skin = res.skin;
      app.profile.skin = res.skin;
      scene.setSkin(res.skin);
      status.textContent = `C'est monté : ${s.name}.`;
      Sound.reveal();
      renderWorkshop();
    } catch (err) {
      status.textContent = err.message;
    }
  }

  // Aperçu animé de la foreuse, tant que le carnet est affiché.
  let previewRunning = false;
  function startPreview() {
    if (previewRunning) return;
    previewRunning = true;
    const canvas = $('skin-preview');
    const ctx = canvas.getContext('2d');
    const loop = (t) => {
      if ($('view-profile').hidden) {
        previewRunning = false;
        return;
      }
      const time = t / 1000;
      ctx.fillStyle = '#3a2414';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#24160c';
      ctx.fillRect(7, 0, 18, canvas.height);
      const shake = Math.round(Math.sin(time * 60));
      Pixel.drawDrill(ctx, app.skin, 8 + shake, canvas.height - 3, time, true);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ---------- Réponses signalées (responsable du jeu) ----------
  async function loadReports() {
    const card = $('admin-reports');
    card.hidden = !(app.me && app.me.isAdmin);
    if (card.hidden) return;
    try {
      const { reports } = await api('/api/admin/reports');
      app.reports = reports;
      renderReports();
    } catch (err) {
      $('reports-status').textContent = err.message;
    }
  }

  function renderReports() {
    const list = $('report-list');
    const labels = { pending: 'à vérifier', handled: 'traitée', added: 'ajoutée au thème' };
    const tab = app.reportTab || 'pending';
    const shown = app.reports.filter((r) => (r.status === 'pending') === (tab === 'pending'));
    $('count-pending').textContent = `(${app.reports.filter((r) => r.status === 'pending').length})`;
    $('count-done').textContent = `(${app.reports.filter((r) => r.status !== 'pending').length})`;
    document.querySelectorAll('#report-tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.reports === tab));
    $('btn-copy-reports').hidden = tab !== 'pending';
    list.replaceChildren(
      ...shown.map((r) => {
        const item = el(
          'li',
          { class: `report ${r.status}` },
          el('span', { class: 'what' }, el('strong', {}, `« ${r.input} »`), el('span', { class: 'muted' }, r.themeTitle)),
          el(
            'span',
            { class: 'muted' },
            `${plural(r.players, 'joueur', 'joueurs')} · ${labels[r.status]}${r.credited ? ` · points accordés à ${r.credited}` : ''}`,
          ),
        );
        if (r.status === 'pending') {
          const done = el('button', { class: 'link', type: 'button' }, 'Marquer comme traitée');
          done.addEventListener('click', async () => {
            await api('/api/admin/reports/handled', { themeId: r.themeId, inputKey: r.inputKey }).catch(() => {});
            r.status = 'handled';
            renderReports();
          });
          item.append(done);
        }
        return item;
      }),
    );
    if (!shown.length) list.append(el('li', { class: 'muted' }, tab === 'pending' ? 'Aucun signalement à traiter.' : 'Aucun signalement traité pour l\'instant.'));
  }

  document.querySelectorAll('#report-tabs .tab').forEach((t) =>
    t.addEventListener('click', () => {
      app.reportTab = t.dataset.reports;
      renderReports();
    }),
  );

  $('btn-copy-reports').addEventListener('click', async () => {
    const pending = (app.reports || []).filter((r) => r.status === 'pending');
    const text = pending.length
      ? pending.map((r) => `${r.themeId} (${r.themeTitle}) : ${r.input} — ${plural(r.players, 'joueur', 'joueurs')}`).join('\n')
      : 'Aucun signalement en attente.';
    try {
      await navigator.clipboard.writeText(text);
      $('reports-status').textContent = `${plural(pending.length, 'signalement copié', 'signalements copiés')} : colle-les dans la conversation.`;
    } catch {
      $('reports-status').textContent = text;
    }
  });

  $('btn-carnet').addEventListener('click', () => openProfile());
  $('btn-results-carnet').addEventListener('click', () => openProfile());
  $('btn-profile-home').addEventListener('click', () => goHome());

  // ---------- Podium ----------
  async function openPodium(period, date) {
    stopTimer();
    try {
      const params = new URLSearchParams({ period });
      if (date) params.set('date', date);
      const board = await api(`/api/leaderboard?${params}`);
      app.podium = board;
      renderPodium(board);
      show('podium');
    } catch (err) {
      showNotice(err.message);
    }
  }

  function periodLabel(board) {
    if (board.period === 'day') {
      const day = formatDay(board.start, { weekday: 'long', day: 'numeric', month: 'long' });
      return board.isCurrent ? `Aujourd'hui · ${day}` : day;
    }
    if (board.period === 'month') {
      const month = formatDay(board.start, { month: 'long', year: 'numeric' });
      return board.isCurrent ? `Ce mois-ci · ${month}` : month;
    }
    const start = formatDay(board.start, { day: 'numeric', month: 'long' });
    const end = formatDay(board.end, { day: 'numeric', month: 'long' });
    return `${board.isCurrent ? 'Cette semaine' : 'Semaine'} · du ${start} au ${end}`;
  }

  function renderPodium(board) {
    document.querySelectorAll('#period-tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.period === board.period));
    $('week-label').textContent = periodLabel(board);
    $('btn-week-next').disabled = !board.next;

    const podium = $('podium');
    podium.replaceChildren();
    [2, 1, 3].forEach((place) => {
      const entry = board.entries.filter((e) => e.rank === place)[0] || null;
      const step = el('div', { class: `step p${place}${entry ? '' : ' empty'}` });
      step.append(
        el('span', { class: 'name' }, entry ? entry.username : '—'),
        el('span', { class: 'score' }, entry ? pts(entry.score) : ''),
        el('div', { class: 'block' }, String(place)),
      );
      podium.append(step);
    });

    const ranking = $('ranking');
    ranking.replaceChildren();
    board.entries.forEach((e) => {
      ranking.append(
        el(
          'li',
          { class: e.me ? 'me' : '' },
          el('span', {}, `${e.rank}.`),
          el('span', {}, e.username, board.period === 'day' ? null : el('span', { class: 'days' }, ` (${e.days} j)`)),
          el('span', {}, pts(e.score)),
        ),
      );
    });
    if (!board.entries.length) ranking.append(el('li', {}, el('span', {}, ''), el('span', {}, 'Aucun forage sur cette période.'), el('span', {}, '')));
    const when = { day: 'ce jour-là', week: 'cette semaine', month: 'ce mois-ci' }[board.period];
    $('my-rank').textContent = board.me
      ? `Ton rang : ${board.me.rank === 1 ? '1er' : `${board.me.rank}e`} sur ${board.entries.length} · ${pts(board.me.score)}`
      : `Tu n'as pas joué ${when}.`;
  }

  document.querySelectorAll('#period-tabs .tab').forEach((t) => t.addEventListener('click', () => openPodium(t.dataset.period, null)));
  $('btn-week-prev').addEventListener('click', () => openPodium(app.podium.period, app.podium.prev));
  $('btn-week-next').addEventListener('click', () => app.podium.next && openPodium(app.podium.period, app.podium.next));
  $('btn-podium-home').addEventListener('click', () => goHome());

  // ---------- Démarrage ----------
  fitCanvas();
  goHome().catch(() => show('auth'));
})();
