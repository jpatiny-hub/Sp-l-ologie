'use strict';

(function () {
  const $ = (id) => document.getElementById(id);
  const ROUNDS = 7;

  const app = {
    me: null,
    game: null,
    timer: null,
    busy: false,
    podiumWeek: null,
    meLoadedAt: 0,
  };

  // ---------- Scène pixel art ----------
  const scene = new Pixel.DrillScene($('scene'));
  scene.onDepth = (points) => {
    $('hud-depth').textContent = Pixel.formatDepth(points);
    $('hud-zone').textContent = Pixel.zoneName(points);
  };
  scene.setLayers([], false);

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
  async function api(path, body) {
    const opts = { credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      opts.method = 'POST';
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* réponse vide */
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Erreur réseau, réessaie.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function show(view) {
    document.querySelectorAll('.view').forEach((v) => (v.hidden = v.id !== `view-${view}`));
    $('stage').hidden = view === 'podium' && window.innerWidth < 860;
    $('topnav').hidden = !app.me;
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
    setTimerSeconds(app.me.timerSeconds);
    $('who').textContent = app.me.user.username;
    renderHome();
    show('home');
    loadMiniPodium();
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
  $('btn-podium').addEventListener('click', () => openPodium(null));

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
      alert(err.message);
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
      renderGame();
    } catch (err) {
      alert(err.message);
    } finally {
      app.busy = false;
    }
  });

  function showPrompt(round, remainingMs) {
    $('pane-ready').hidden = true;
    $('pane-prompt').hidden = false;
    $('prompt-index').textContent = `Thème ${round.slot + 1} sur ${ROUNDS}`;
    $('prompt-title').textContent = round.title;
    $('answer-error').textContent = '';
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
    const tick = () => {
      const left = deadline - performance.now();
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

  $('form-answer').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = $('answer-input');
    const text = input.value.trim();
    if (!text || app.busy) return;
    app.busy = true;
    try {
      const res = await api(`/api/game/${app.game.id}/answer`, { text });
      if (res.result === 'unknown') {
        $('answer-error').textContent = `« ${text} » ne fait pas partie des réponses connues pour ce thème. Essaie autre chose !`;
        input.classList.remove('shake');
        void input.offsetWidth;
        input.classList.add('shake');
        input.select();
        app.game = res.state;
      } else {
        roundFinished(res);
      }
    } catch (err) {
      $('answer-error').textContent = err.message;
    } finally {
      app.busy = false;
    }
  });

  $('btn-skip').addEventListener('click', () => skipRound());

  async function skipRound() {
    if (app.busy || !app.game) return;
    app.busy = true;
    stopTimer();
    try {
      roundFinished(await api(`/api/game/${app.game.id}/skip`, {}));
    } catch (err) {
      // La manche a pu être clôturée côté serveur entre-temps : on resynchronise.
      try {
        app.game = await api(`/api/game/${app.game.id}`);
        if (app.game.finished) showResults(app.game);
        else renderGame();
      } catch {
        alert(err.message);
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
    $('game-score').textContent = pts(state.score);

    $('feedback-theme').textContent = round.title;
    $('feedback-points').textContent = `+${round.points}`;
    const tier = $('feedback-tier');
    tier.textContent = round.tier.label;
    tier.style.color = Pixel.TIER_COLORS[round.tier.id];
    const answer = $('feedback-answer');
    const odds = $('feedback-odds');
    if (round.outcome === 'answer') {
      const understood = round.input && round.input.toLowerCase() !== round.answer.toLowerCase();
      answer.textContent = `Ta réponse : ${round.answer}${understood ? ` (tu as écrit « ${round.input} »)` : ''}`;
      const oneIn = Math.max(1, Math.round(1 / round.probability));
      odds.textContent = round.tier.id === 'pepite'
        ? 'Personne ne l\'avait encore trouvée !'
        : `Environ 1 joueur sur ${oneIn.toLocaleString('fr-BE')} y pense.`;
    } else {
      answer.textContent = round.outcome === 'timeout' ? 'Le chrono est arrivé à zéro.' : 'Tu as passé ce thème.';
      odds.textContent = '';
    }
    $('btn-next').textContent = state.finished ? 'Voir mon forage' : 'Thème suivant';
    $('btn-next').focus();
  }

  $('btn-next').addEventListener('click', () => {
    if (app.game.finished) showResults(app.game);
    else renderGame();
  });

  // ---------- Résultats ----------
  function showResults(state) {
    stopTimer();
    app.game = state;
    scene.setLayers(layersOf(state), false);
    scene.tour();
    $('results-title').textContent = state.mode === 'daily' ? 'Forage terminé !' : 'Entraînement terminé !';
    $('results-score').textContent = pts(state.score);
    const centre = state.score >= Pixel.MAX_POINTS;
    $('results-depth').textContent = centre
      ? 'Tu as atteint le centre de la Terre ! 6 371 km'
      : `Profondeur atteinte : ${Pixel.formatDepth(state.score)} · ${Pixel.zoneName(state.score)}`;

    const zones = $('results-zones');
    zones.replaceChildren();
    Pixel.ZONES.forEach((z) => zones.append(el('li', { class: state.score >= z.from ? 'reached' : '' }, z.name)));
    zones.append(el('li', { class: centre ? 'reached' : '' }, 'Centre de la Terre'));

    const list = $('results-answers');
    list.replaceChildren();
    state.rounds.forEach((r) => {
      const label = r.outcome === 'answer' ? r.answer : r.tier ? r.tier.label : '—';
      list.append(
        el(
          'li',
          {},
          el('span', { class: 'swatch', style: { background: Pixel.TIER_COLORS[r.tier ? r.tier.id : 'skip'] } }),
          el('span', {}, el('span', { class: 'theme' }, r.title || `Thème ${r.slot + 1}`), label),
          el('span', { class: 'pts' }, r.points != null ? `${r.points}` : '–'),
        ),
      );
    });
    $('share-status').textContent = '';
    show('results');
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
  $('btn-results-podium').addEventListener('click', () => openPodium(null));

  // ---------- Podium ----------
  async function openPodium(week) {
    stopTimer();
    try {
      const board = await api(`/api/leaderboard${week ? `?week=${week}` : ''}`);
      app.podiumWeek = board;
      renderPodium(board);
      show('podium');
    } catch (err) {
      alert(err.message);
    }
  }

  function renderPodium(board) {
    const start = formatDay(board.weekStart, { day: 'numeric', month: 'long' });
    const end = formatDay(board.weekEnd, { day: 'numeric', month: 'long' });
    $('week-label').textContent = `${board.isCurrent ? 'Cette semaine' : 'Semaine'} · du ${start} au ${end}`;
    $('btn-week-next').disabled = !board.hasNext;

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
          el('span', {}, e.username, ' ', el('span', { class: 'days' }, `(${e.days} j)`)),
          el('span', {}, pts(e.score)),
        ),
      );
    });
    if (!board.entries.length) ranking.append(el('li', {}, el('span', {}, ''), el('span', {}, 'Aucun forage cette semaine.'), el('span', {}, '')));
    $('my-rank').textContent = board.me
      ? `Ton rang : ${board.me.rank === 1 ? '1er' : `${board.me.rank}e`} sur ${board.entries.length} · ${pts(board.me.score)}`
      : 'Tu n\'as pas encore joué cette semaine.';
  }

  function shiftWeek(days) {
    const d = new Date(`${app.podiumWeek.weekStart}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    openPodium(d.toISOString().slice(0, 10));
  }
  $('btn-week-prev').addEventListener('click', () => shiftWeek(-7));
  $('btn-week-next').addEventListener('click', () => shiftWeek(7));
  $('btn-podium-home').addEventListener('click', () => goHome());

  // ---------- Démarrage ----------
  fitCanvas();
  goHome().catch(() => show('auth'));
})();
