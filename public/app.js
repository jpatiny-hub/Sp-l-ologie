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

  // ---------- Avatars ----------
  /** Canevas d'avatar ('bust' dans les listes, 'full' sur le podium et le profil). */
  function avatarEl(avatar, view = 'bust', scale = 2) {
    return avatar && window.Avatar ? Avatar.canvas(avatar, { scale, view }) : null;
  }
  /** Pseudo précédé de son avatar, pour les listes. */
  function whoEl(avatar, username, className = 'who-av') {
    return el('span', { class: className }, avatarEl(avatar), el('span', { class: 'who-name' }, username));
  }
  function showMyAvatar() {
    if (!app.me || !app.me.avatar) return;
    scene.setAvatar(app.me.avatar);
    $('home-avatar').replaceChildren(avatarEl(app.me.avatar, 'bust', 3));
  }

  // ---------- Paramètres (propres à l'appareil) ----------
  const SETTINGS_KEY = 'speleologie.settings';
  const settings = { text: 'normal', sound: true, volume: 60, colors: 'normal', theme: 'sombre', lisible: false };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    // Ancien réglage « mode daltonien » (case à cocher) : devenu « rouge-vert ».
    if (saved.colorblind && !saved.colors) saved.colors = 'rouge-vert';
    delete saved.colorblind;
    Object.assign(settings, saved);
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
    Pixel.setColorblind(settings.colors);
    root.classList.toggle('colorblind', settings.colors !== 'normal');
    if (settings.colors === 'normal') delete root.dataset.colors;
    else root.dataset.colors = settings.colors;
    // Lecture facile : police lisible, espacements larges et fond crème doux (apparence claire).
    if (settings.lisible) root.dataset.lisible = '';
    else delete root.dataset.lisible;
    if (settings.theme === 'clair' || settings.lisible) root.dataset.theme = 'clair';
    else delete root.dataset.theme;
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
    settingsForm.elements.colors.value = settings.colors;
    settingsForm.elements.theme.value = settings.theme;
    settingsForm.elements.lisible.checked = settings.lisible;
    settingsForm.querySelectorAll('input[name=theme]').forEach((i) => (i.disabled = settings.lisible));
    $('settings').showModal();
  });
  settingsForm.addEventListener('input', () => {
    const colors = settings.colors;
    settings.text = settingsForm.elements.text.value || 'normal';
    settings.sound = settingsForm.elements.sound.checked;
    settings.volume = Number(settingsForm.elements.volume.value);
    settings.colors = settingsForm.elements.colors.value || 'normal';
    settings.theme = settingsForm.elements.theme.value || 'sombre';
    settings.lisible = settingsForm.elements.lisible.checked;
    settingsForm.querySelectorAll('input[name=theme]').forEach((i) => (i.disabled = settings.lisible));
    applySettings();
    saveSettings();
    fitCanvas();
    if (colors !== settings.colors) refreshColors();
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
    // Sur téléphone, la scène de forage ne sert qu'en partie et dans les résultats : pas sur l'accueil.
    $('stage').hidden = (view === 'podium' || view === 'profile' || view === 'home' || view === 'recap') && window.innerWidth < 860;
    if (view === 'profile') startPreview();
    if (view !== 'game') $('focus-keeper').blur();
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
    showMyAvatar();
    setTimerSeconds(app.me.timerSeconds);
    $('who').textContent = app.me.user.username;
    $('home-name').textContent = app.me.user.username;
    $('settings-user').textContent = app.me.user.username;
    renderHome();
    show('home');
    loadMiniPodium();
    loadCarnetSummary();
    if (app.me.recap) openRecap(app.me.recap);
  }

  async function loadCarnetSummary() {
    $('carnet-dot').hidden = !app.me.unseenBadges;
    try {
      const profile = await api('/api/profile');
      const earned = profile.badges.filter((b) => b.count).length;
      $('carnet-summary').textContent = `${plural(earned, 'badge', 'badges')} sur ${profile.badges.length}`;
    } catch {
      /* résumé facultatif */
    }
  }

  /** Une note peut avoir un résumé en quelques lignes (`highlights`) : le détail passe alors dans « Voir le détail ». */
  function renderNews() {
    const news = (app.me && app.me.news) || [];
    $('news-card').hidden = !news.length;
    if (!news.length) return;
    const quick = news.flatMap((n) => n.highlights || []);
    const detailed = news.filter((n) => n.highlights && n.highlights.length);
    const plain = news.filter((n) => !(n.highlights && n.highlights.length));
    $('news-title').textContent = quick.length ? 'Quoi de neuf ?' : news.length === 1 ? news[0].title : 'Nouveautés du jeu';
    $('news-quick').replaceChildren(
      ...quick.map((h) => {
        const c = el('canvas', { class: 'news-icon', width: '16', height: '16', 'aria-hidden': 'true' });
        Icons.drawIcon(c, h.icon);
        return el('li', {}, c, el('span', {}, h.text));
      }),
    );
    $('news-more').hidden = !detailed.length;
    $('news-detail-list').replaceChildren(...detailed.flatMap((n) => n.items.map((text) => el('li', {}, text))));
    $('news-list').replaceChildren(...plain.flatMap((n) => n.items.map((text) => el('li', {}, text))));
  }

  $('btn-news-ok').addEventListener('click', async () => {
    const news = (app.me && app.me.news) || [];
    if (!news.length) return;
    const last = Math.max(...news.map((n) => n.id));
    app.me.news = [];
    renderNews();
    api('/api/news/seen', { id: last }).catch(() => {});
  });

  function renderHome() {
    renderNews();
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
    renderStreak();
    updateCountdown();
  }

  /** Série en cours (lanterne de mineur) et badge le plus proche. */
  function renderStreak() {
    const card = $('streak-card');
    const st = app.me && app.me.streak;
    if (!st) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const left = app.me.nextResetMs - (Date.now() - app.meLoadedAt);
    const atRisk = st.current > 0 && !st.playedToday && left < 6 * 3600 * 1000;
    card.classList.toggle('lit', st.current > 0 && !atRisk);
    card.classList.toggle('risk', atRisk);
    card.classList.toggle('out', st.current === 0);
    Icons.drawLantern($('streak-lantern'), st.current, { dim: st.current === 0 });
    $('streak-lantern').dataset.level = String(Icons.lanternLevel(st.current));
    $('streak-count').textContent = st.current > 0 ? plural(st.current, 'jour', 'jours') : 'Pas de série';
    if (st.current === 0) $('streak-note').textContent = 'Fore aujourd\'hui pour rallumer ta lanterne.';
    else if (st.playedToday) $('streak-note').textContent = 'Ta lanterne brille : reviens demain pour la garder allumée.';
    else $('streak-note').textContent = st.freezes > 0 ? `Il reste ${formatDuration(left)} pour forer aujourd'hui.` : `Plus que ${formatDuration(left)} pour ne pas perdre ta série.`;
    // Étais de galerie (gels de série) : discrets sur le profil, le détail s'ouvre au toucher.
    const freezeCard = $('freeze-card');
    freezeCard.hidden = st.freezes == null;
    if (st.freezes != null) {
      $('freeze-icons').replaceChildren(
        ...[0, 1, 2].map((i) => {
          const c = el('canvas', { class: `freeze-icon${i < st.freezes ? ' full' : ''}`, width: '16', height: '16', title: i < st.freezes ? 'Étai disponible' : 'Emplacement vide' });
          Icons.drawIcon(c, 'etai', { dim: i >= st.freezes });
          return c;
        }),
      );
      let note = `Tu as ${plural(st.freezes, 'étai', 'étais')} en réserve.`;
      if (st.pendingFreezes > 0) note = `Tu as manqué ${plural(st.pendingFreezes, 'jour', 'jours')} : ${st.pendingFreezes > 1 ? 'des étais seront utilisés' : 'un étai sera utilisé'} dès que tu fores.`;
      else if (st.frozenRecently && st.frozenRecently.length) note = `Un étai a sauvé ta série le ${formatDay(st.frozenRecently[st.frozenRecently.length - 1], { day: 'numeric', month: 'long' })}.`;
      else if (atRisk && st.freezes > 0) note = 'Si tu rates aujourd\'hui, un étai protégera ta série.';
      $('freeze-note').textContent = note;
    }
    const ch = st.challenge;
    const collective = app.me.collective;
    $('challenge-card').hidden = !ch && !collective;
    $('challenge-tab-month').hidden = !collective;
    $('challenge-week').hidden = !ch || (challengeTab === 'month' && !!collective);
    $('challenge-month').hidden = !collective || challengeTab !== 'month' && !!ch;
    renderCollective();
    if (ch) {
      $('challenge-text').textContent = ch.text;
      $('challenge-fill').style.width = `${Math.round((ch.progress / ch.goal) * 100)}%`;
      $('challenge-bar').setAttribute('aria-valuemax', String(ch.goal));
      $('challenge-bar').setAttribute('aria-valuenow', String(ch.progress));
      $('challenge-note').textContent = ch.done
        ? 'Défi réussi, bravo ! Un nouveau t\'attend lundi.'
        : `${ch.progress} sur ${ch.goal} · ${plural(ch.daysLeft, 'jour restant', 'jours restants')} (aujourd'hui compris).`;
    }
    const nexts = st.nexts || (st.next ? [st.next] : []);
    $('next-badges').hidden = !nexts.length;
    $('next-badges-list').replaceChildren(
      ...nexts.map((n) => {
        const c = el('canvas', { class: 'next-badge-icon', width: '16', height: '16', 'aria-hidden': 'true' });
        Icons.drawIcon(c, n.icon);
        return el('li', {}, c, el('span', {}, el('strong', {}, n.name), ` : encore ${n.remaining} ${n.unit}`));
      }),
    );
  }

  // ---------- Défi collectif du mois ----------
  let challengeTab = 'week';
  document.querySelectorAll('#challenge-tabs .tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      challengeTab = tab.dataset.challenge;
      document.querySelectorAll('#challenge-tabs .tab').forEach((t) => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      renderStreak();
    }),
  );

  const COLLECTIVE_COLORS = ['#e0b020', '#6fb5f0', '#e86aa8', '#7fcf5a', '#b28cff', '#ff8a4a', '#5ee0d0', '#c9ced6'];
  const CW = 110;
  const CH = 40;
  const DRILL_SIDE = ['..yyyyyyyy......', '.yyyyyyyyyy.....', 'yyyykkkkyyy.....', 'yyyykwwkyyy.ggg.', 'yyyykkkkyyyggggg', '.yyyyyyyyyy.ggg.', '..tttttttt......', '.tt.tt.tt.tt....'];
  const DRILL_PAL = { y: '#f2c230', k: '#1b1410', w: '#8ad0ff', g: '#c9ced6', t: '#444444' };
  const DIAMOND = ['..ccc..', '.cwwcc.', 'ccccccc', '.ccccc.', '..ccc..', '...c...'];
  let collectiveRock = null;

  function collectiveBackdrop() {
    if (collectiveRock) return collectiveRock;
    const c = document.createElement('canvas');
    c.width = CW;
    c.height = CH;
    const ctx = c.getContext('2d');
    const base = ['#4a2f1a', '#5a3a20', '#6b4627', '#3b2414'];
    for (let y = 0; y < CH; y += 2) {
      for (let x = 0; x < CW; x += 2) {
        const v = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        ctx.fillStyle = v < 0.3 ? base[0] : v < 0.6 ? base[1] : v < 0.85 ? base[2] : base[3];
        ctx.fillRect(x, y, 2, 2);
      }
    }
    collectiveRock = c;
    return c;
  }

  function sprite(ctx, rows, pal, x0, y0) {
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === '.') return;
        ctx.fillStyle = pal[ch];
        ctx.fillRect(x0 + x, y0 + y, 1, 1);
      }),
    );
  }

  /** Tunnel creusé ensemble : la foreuse avance avec les points du mois, chaque joueur a sa couleur, un tas de diamants au bout. */
  function drawCollective(canvas, data, t) {
    const ctx = canvas.getContext('2d');
    const ty = 8;
    const th = 24;
    const pile = CW - 26;
    const reach = pile - 18;
    const f = Math.min(1, data.total / data.goal);
    const head = Math.round(2 + (reach - 2) * f);
    ctx.drawImage(collectiveBackdrop(), 0, 0);
    // Tunnel creusé jusqu'à la foreuse, puis cavité autour des diamants.
    ctx.fillStyle = '#120d0a';
    ctx.fillRect(0, ty, head + 16, th);
    ctx.fillRect(pile - 4, ty - 2, CW - pile + 4, th + 4);
    ctx.fillStyle = '#2a1a0c';
    ctx.fillRect(0, ty + th, head + 16, 1);
    for (let x = 14; x < head; x += 22) {
      ctx.fillStyle = '#8a5a2b';
      ctx.fillRect(x, ty - 1, 2, th + 1);
    }
    // Plancher coloré : la part de tunnel creusée par chaque joueur.
    let from = 0;
    const span = head + 14;
    data.players.forEach((p, i) => {
      const w = i === data.players.length - 1 ? span - from : Math.round((span * p.points) / Math.max(1, data.total));
      ctx.fillStyle = COLLECTIVE_COLORS[i % COLLECTIVE_COLORS.length];
      ctx.fillRect(from, ty + th - 4, Math.max(0, w), 3);
      from += w;
    });
    const bob = Math.round(Math.sin(t * 10));
    sprite(ctx, DRILL_SIDE, DRILL_PAL, head, ty + 8 + bob);
    if (!data.reached) for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#f2c230';
      ctx.fillRect(head + 16 + i * 3, ty + 11 + ((i + Math.floor(t * 10)) % 3), 1, 1);
    }
    // Tas de diamants : 3 + 2 + 1, plus ou moins brillants selon la progression.
    const lit = data.reached ? 1 : 0.55 + 0.45 * f;
    ctx.globalAlpha = lit;
    [[0, 17], [8, 17], [16, 17], [4, 11], [12, 11], [8, 5]].forEach(([dx, dy]) => sprite(ctx, DIAMOND, { c: '#5ee0ff', w: '#ffffff' }, pile + dx, ty + dy - 1));
    ctx.globalAlpha = 1;
    const spark = (x, y, k) => {
      const a = (Math.sin(t * 6 + k) + 1) / 2;
      ctx.fillStyle = `rgba(255,255,255,${(data.reached ? 1 : 0.5) * a})`;
      ctx.fillRect(x, y - 2, 1, 5);
      ctx.fillRect(x - 2, y, 5, 1);
    };
    spark(pile + 3, ty + 6, 0);
    spark(pile + 18, ty + 12, 2);
    spark(pile + 11, ty + 2, 4);
    if (data.reached) {
      spark(pile + 6, ty + 20, 1);
      spark(pile + 21, ty + 3, 3);
    }
  }

  function renderCollective() {
    const data = app.me && app.me.collective;
    if (!data) return;
    $('collective-title').textContent = data.reached ? 'Le diamant est atteint, bravo à tous !' : `Creusons ensemble ${data.goal.toLocaleString('fr-BE')} points avant la fin du mois.`;
    $('collective-total').textContent = `${data.total.toLocaleString('fr-BE')} / ${data.goal.toLocaleString('fr-BE')} points`;
    $('collective-left').textContent = data.daysLeft > 0 ? plural(data.daysLeft, 'jour restant', 'jours restants') : '';
    $('collective-legend').replaceChildren(
      ...data.players.map((p, i) => {
        const swatch = el('span', { class: 'swatch' });
        swatch.style.background = COLLECTIVE_COLORS[i % COLLECTIVE_COLORS.length];
        return el('li', { class: p.me ? 'me' : '' }, swatch, avatarEl(p.avatar, 'head', 2), el('span', { class: 'who-name' }, p.username), el('span', {}, pts(p.points)));
      }),
    );
    $('collective-note').textContent = data.reached
      ? `Objectif atteint le ${formatDay(data.reachedOn, { day: 'numeric', month: 'long' })}. Continuez à creuser, le tas de diamants brille pour tout le monde !`
      : 'Chaque point de ton forage du jour fait avancer la foreuse. Chaque couleur est la part de tunnel creusée par un joueur.';
    const canvas = $('collective-canvas');
    const scale = Math.max(1, Math.min(4, Math.floor((canvas.parentElement.clientWidth || 330) / CW)));
    canvas.style.width = `${CW * scale}px`;
    canvas.style.height = `${CH * scale}px`;
    drawCollective(canvas, data, 0);
  }
  setInterval(() => {
    const data = app.me && app.me.collective;
    if (!data || $('view-home').hidden || $('challenge-month').hidden || document.hidden) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    drawCollective($('collective-canvas'), data, performance.now() / 1000);
  }, 100);

  $('freeze-card').addEventListener('click', () => $('freeze-dialog').showModal());
  $('freeze-close').addEventListener('click', () => $('freeze-dialog').close());
  $('freeze-dialog').addEventListener('click', (event) => event.target === $('freeze-dialog') && $('freeze-dialog').close());

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

  document.querySelectorAll('#mode-tabs .tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      document.querySelectorAll('#mode-tabs .tab').forEach((t) => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      $('mode-daily').hidden = tab.dataset.mode !== 'daily';
      $('mode-training').hidden = tab.dataset.mode !== 'training';
    }),
  );
  $('btn-daily').addEventListener('click', () => startGame('daily'));
  $('btn-training').addEventListener('click', () => startGame('training'));
  $('btn-podium').addEventListener('click', () => openPodium(homePodiumPeriod, null));

  let homePodiumPeriod = 'day';

  document.querySelectorAll('#home-podium-tabs .tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      homePodiumPeriod = tab.dataset.period;
      loadMiniPodium();
    }),
  );

  async function loadMiniPodium() {
    const box = $('mini-podium');
    document.querySelectorAll('#home-podium-tabs .tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.period === homePodiumPeriod);
      t.setAttribute('aria-selected', String(t.dataset.period === homePodiumPeriod));
    });
    try {
      const board = await api(`/api/leaderboard?period=${homePodiumPeriod}`);
      if (board.period !== homePodiumPeriod) return;
      buildPodium(box, board.entries, 2);
      const when = { day: 'aujourd\'hui', week: 'cette semaine', month: 'ce mois-ci' }[homePodiumPeriod];
      $('mini-podium-me').textContent = !board.entries.length
        ? `Personne n'a encore creusé ${when}.`
        : board.me
          ? `Ton rang : ${board.me.rank === 1 ? '1er' : `${board.me.rank}e`} · ${pts(board.me.score)}`
          : `Tu n'as pas encore joué ${when}.`;
    } catch {
      box.replaceChildren();
      $('mini-podium-me').textContent = 'Classement indisponible.';
    }
  }

  // ---------- Partie ----------
  // Clavier du téléphone : un champ invisible reprend le focus quand le thème se termine, pour que le clavier
  // reste ouvert jusqu'au thème suivant. Entrée y enchaîne les étapes (thème suivant, révéler le thème).
  const keeper = $('focus-keeper');
  let paneChangedAt = 0;
  function keyboardHeld() {
    return document.activeElement === keeper;
  }
  function holdKeyboard() {
    if (document.activeElement === $('answer-input') || keyboardHeld()) keeper.focus({ preventScroll: true });
    paneChangedAt = performance.now();
  }
  keeper.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.repeat) return;
    event.preventDefault();
    // Petit délai : une seconde pression d'Entrée tout de suite après la validation ne doit pas enchaîner.
    if (performance.now() - paneChangedAt < 350) return;
    if (!$('pane-feedback').hidden) $('btn-next').click();
    else if (!$('pane-ready').hidden) $('btn-reveal').click();
  });
  // Toucher ces boutons ne doit pas retirer le focus du champ relais (sinon le clavier se ferme).
  ['btn-next', 'btn-reveal'].forEach((id) => $(id).addEventListener('mousedown', (event) => keyboardHeld() && event.preventDefault()));

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

  /** Sept pastilles : la couleur de rareté de chaque thème déjà joué, la manche en cours clignote. */
  function renderPips(state) {
    const box = $('game-pips');
    const active = state.rounds.findIndex((r) => r.status !== 'done');
    box.replaceChildren(
      ...state.rounds.map((r, i) => {
        const pip = el('span', { class: `pip${i === active ? ' now' : ''}` });
        if (r.status === 'done' && r.tier) {
          pip.style.background = Pixel.TIER_COLORS[r.tier.id] || '#4a4a4a';
          if (settings.colors !== 'normal') pip.textContent = Pixel.TIER_SYMBOLS[r.tier.id] || '';
          pip.title = r.tier.label;
        }
        return pip;
      }),
    );
  }

  function renderGame() {
    const s = app.game;
    renderPips(s);
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
    if (!keyboardHeld()) $('btn-reveal').focus();
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
    const jokerReady = !!(app.game.joker && app.game.joker.available);
    $('btn-skip').textContent = jokerReady ? 'Galerie de secours' : 'Passer';
    $('joker-note').hidden = !jokerReady;
    if (jokerReady) Icons.drawIcon($('joker-icon'), 'galerie');
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
    const canvas = $('timer-canvas');
    const skin = (app.skin && app.skin.timer) || 'batterie';
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let lastSecond = null;
    const tick = () => {
      const left = deadline - performance.now();
      const second = Math.ceil(left / 1000);
      if (second <= 5 && second > 0 && second !== lastSecond) Sound.tick(second <= 3);
      if (second !== lastSecond && (second % 10 === 0 || second <= 5)) $('timer-sr').textContent = `${Math.max(0, second)} secondes`;
      lastSecond = second;
      Timers.draw(canvas, skin, left / 1000, total / 1000, performance.now(), settings.colors, calm);
      $('timer-count').textContent = left > 0 ? String(second) : '0';
      $('timer').classList.toggle('last', left > 0 && left <= 5000);
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
    $('timer').classList.remove('last');
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

  /** Fenêtre de la galerie de secours (joker) : renvoie true si le joueur la prend. */
  function askGallery() {
    return new Promise((resolve) => {
      const dialog = $('gallery-dialog');
      Icons.drawIcon($('gallery-icon'), 'galerie');
      let answer = false;
      const done = (value) => {
        answer = value;
        dialog.close();
      };
      const yes = () => done(true);
      const no = () => done(false);
      const backdrop = (event) => {
        if (event.target === dialog) done(false);
      };
      $('gallery-yes').addEventListener('click', yes);
      $('gallery-no').addEventListener('click', no);
      dialog.addEventListener('click', backdrop);
      dialog.addEventListener(
        'close',
        () => {
          $('gallery-yes').removeEventListener('click', yes);
          $('gallery-no').removeEventListener('click', no);
          dialog.removeEventListener('click', backdrop);
          resolve(answer);
        },
        { once: true },
      );
      dialog.showModal();
      $('gallery-yes').focus();
    });
  }

  async function skipRound() {
    if (app.busy || !app.game) return;
    // Joker : un thème par partie peut être changé gratuitement ; au-delà, passer coûte le thème.
    if (app.game.joker && app.game.joker.available && !(await askGallery())) return;
    app.busy = true;
    stopTimer();
    clearPending();
    try {
      const res = await api(`/api/game/${app.game.id}/skip`, {});
      if (res.result === 'joker') {
        app.game = res.state;
        Sound.reveal();
        renderGame();
        showNotice('Galerie de secours empruntée : voici un autre thème.');
        return;
      }
      roundFinished(res);
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
    holdKeyboard();
    scene.setLayers(layersOf(state), true);
    renderPips(state);
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
    const pepites = state.rounds.filter((r) => r.tier && r.tier.id === 'pepite').length;
    Sound.tier(round.tier.id, pepites);
    Sound.buzz(round.tier.id, pepites);
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
    if (!keyboardHeld()) $('btn-next').focus();
    paneChangedAt = performance.now();
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
    $('btn-results-compare').hidden = state.mode !== 'daily';
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
      if (settings.colors !== 'normal' && Pixel.TIER_SYMBOLS[tierId]) chart.append(svg('text', { x: cx, y: end + 4, class: 'glyph' }, Pixel.TIER_SYMBOLS[tierId]));
    });
  }

  function swatch(tierId) {
    const node = el('span', { class: 'swatch', style: { background: Pixel.TIER_COLORS[tierId] } });
    if (settings.colors !== 'normal') node.textContent = Pixel.TIER_SYMBOLS[tierId] || '';
    return node;
  }

  /** Une carte repliable par thème ; à l'intérieur, un bouton déplie la liste de toutes les réponses. */
  function renderCatch(state) {
    const list = $('results-answers');
    list.replaceChildren();
    // Meilleure réponse du jour.
    const answered = state.rounds.filter((r) => r.outcome === 'answer');
    const best = answered.slice().sort((a, b) => (b.points || 0) - (a.points || 0))[0];
    $('results-best').hidden = !best;
    if (best) {
      const bestSw = $('results-best-sw');
      bestSw.style.background = Pixel.TIER_COLORS[best.tier.id];
      bestSw.textContent = settings.colors !== 'normal' ? Pixel.TIER_SYMBOLS[best.tier.id] || '' : '';
      $('results-best-answer').textContent = best.answer;
      $('results-best-theme').textContent = `${best.title} · ${best.tier.label.toLowerCase()} · ${pts(best.points)}`;
    }
    state.rounds.forEach((r) => {
      const tierId = r.tier ? r.tier.id : 'skip';
      const label = r.outcome === 'answer' ? r.answer : r.tier ? r.tier.label : '—';
      const body = el('div', { class: 'theme-body', hidden: '' });
      const header = el(
        'button',
        { class: 'catch-row', type: 'button', 'aria-expanded': 'false' },
        swatch(tierId),
        el('span', { class: 'what' }, el('span', { class: 'theme' }, `${r.slot + 1}. ${r.title || `Thème ${r.slot + 1}`}`), el('span', { class: 'answer' }, label)),
        el('span', { class: 'pts', style: { color: Pixel.TIER_COLORS[tierId] } }, r.points != null ? String(r.points) : '–'),
        el('span', { class: 'pm', 'aria-hidden': 'true' }),
      );
      // Détail du thème : ta saisie, la rareté, puis le bouton qui déplie toutes les réponses.
      body.append(el('p', { class: 'theme-full' }, r.title || ''));
      if (r.outcome === 'answer') {
        const understood = r.input && r.input.toLowerCase() !== r.answer.toLowerCase();
        if (understood) body.append(el('p', { class: 'muted' }, `Tu avais écrit « ${r.input} ».`));
        if (r.probability) body.append(el('p', { class: 'muted' }, `Environ 1 joueur sur ${Math.max(1, Math.round(1 / r.probability)).toLocaleString('fr-BE')} y pense.`));
        body.append(el('p', { class: 'muted' }, othersText(r.othersCount)));
      } else {
        body.append(el('p', { class: 'muted' }, r.outcome === 'timeout' ? 'Le chrono est arrivé à zéro.' : 'Tu as passé ce thème.'));
      }
      const all = el('div', { class: 'theme-answers', hidden: '' });
      const showAll = el('button', { class: 'btn secondary small-btn show-all', type: 'button', 'aria-expanded': 'false' }, 'Toutes les réponses du thème');
      showAll.addEventListener('click', () => toggleThemeAnswers(state, r, showAll, all));
      body.append(showAll, all);
      header.addEventListener('click', () => {
        const open = body.hidden;
        body.hidden = !open;
        header.setAttribute('aria-expanded', String(open));
        header.closest('.card').classList.toggle('open', open);
      });
      list.append(el('div', { class: 'card theme-card' }, header, body));
    });
  }

  async function toggleThemeAnswers(state, round, button, details) {
    const open = details.hidden;
    details.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? 'Masquer les réponses' : 'Toutes les réponses du thème';
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
    let query = '';
    // Recherche sans accents ni ponctuation, dans le nom affiché et dans les variantes acceptées.
    const squash = (t) => String(t).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
    const search = el('input', { type: 'search', class: 'answer-search', placeholder: 'Chercher une réponse…', 'aria-label': 'Chercher parmi les réponses', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const found = (a) => {
      const q = squash(query);
      if (!q) return { ok: true, alias: null };
      if (squash(a.label).includes(q)) return { ok: true, alias: null };
      const alias = (a.aliases || []).find((n) => squash(n).includes(q));
      return { ok: Boolean(alias), alias: alias || null };
    };
    const draw = () => {
      list.replaceChildren();
      const shown = data.answers
        .filter((a) => filter === 'all' || a.tier === filter)
        .map((a) => ({ a, hit: found(a) }))
        .filter((x) => x.hit.ok)
        .reverse();
      if (!shown.length) list.append(el('li', { class: 'muted none' }, query ? 'Aucune réponse ne correspond. Elle manque peut-être : tu peux la signaler plus bas.' : 'Aucune réponse.'));
      shown.forEach(({ a, hit }) => {
          list.append(
            el(
              'li',
              { class: a.mine ? 'mine' : '' },
              swatch(a.tier),
              el('span', {}, a.label, hit.alias ? el('span', { class: 'muted' }, ` (= ${hit.alias})`) : null, a.mine ? el('span', { class: 'you' }, ' ← toi') : null),
              el('span', { class: 'muted', title: a.trainingCount ? `${plural(a.trainingCount, 'fois', 'fois')} en mode illimité` : '' }, `${a.count ? `×${a.count}` : ''}${a.trainingCount ? ` ∞${a.trainingCount}` : ''}`.trim()),
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
    search.addEventListener('input', () => {
      query = search.value;
      draw();
    });
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
      el('p', { class: 'muted small' }, 'De la plus rare à la plus évidente, avec les points qu\'elle rapporterait aujourd\'hui. ×N : donnée N fois dans les forages du jour ; ∞N : donnée N fois en mode illimité.'),
      search,
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
    ['exploit', 'Exploits'], ['serie', 'Séries de forages'], ['profondeur', 'Profondeur'], ['pepites', 'Pépites'], ['themes', 'Thèmes rencontrés'], ['entrainement', 'Entraînement'], ['defi', 'Défis de la semaine'], ['podium', 'Podiums'], ['calendrier', 'Jours particuliers'],
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

  // Carnet : sections repliables, dont l'état est gardé sur l'appareil.
  function foldOpen(id, fallback) {
    try {
      const v = localStorage.getItem(`speleo-fold-${id}`);
      return v == null ? fallback : v === '1';
    } catch {
      return fallback;
    }
  }

  function watchFolds(root) {
    root.querySelectorAll('details[data-fold]').forEach((d) => {
      if (d.dataset.watched) return;
      d.dataset.watched = '1';
      d.addEventListener('toggle', () => {
        try {
          localStorage.setItem(`speleo-fold-${d.dataset.fold}`, d.open ? '1' : '0');
        } catch {
          /* stockage indisponible : l'état n'est simplement pas retenu */
        }
      });
    });
  }

  function initFolds() {
    const view = $('view-profile');
    view.querySelectorAll('details.fold').forEach((d) => {
      d.open = foldOpen(d.dataset.fold, d.dataset.fold === 'profil');
    });
    watchFolds(view);
  }

  // Badge : une pastille dans le tableau, le détail s'ouvre dans une fenêtre flottante.
  function badgeTile(b) {
    const locked = !b.count;
    const icon = el('canvas', { class: 'badge-icon', width: '16', height: '16' });
    Icons.drawBadge(icon, { icon: b.icon, category: b.category, label: b.label, locked });
    const tile = el('button', { class: `badge-tile${locked ? ' locked' : ''}${b.isNew ? ' new' : ''}`, type: 'button', title: b.name, 'aria-label': `${b.name}${locked ? ' (pas encore obtenu)' : ''}` }, icon, el('span', { class: 'badge-tile-name' }, b.name));
    tile.addEventListener('click', () => openBadge(b));
    return tile;
  }

  function openBadge(b) {
    const locked = !b.count;
    Icons.drawBadge($('badge-pop-icon'), { icon: b.icon, category: b.category, label: b.label, locked });
    $('badge-pop-title').textContent = b.name;
    $('badge-pop-desc').textContent = b.description;
    let meta = locked ? 'Pas encore obtenu.' : '';
    if (!locked) {
      if (b.years) meta = b.years.length > 1 ? `Années : ${b.years.join(', ')}` : `Le ${longDay(b.lastOn)}`;
      else if (b.count > 1) meta = `${b.count} fois · dernière le ${longDay(b.lastOn)}`;
      else meta = `Obtenu le ${longDay(b.firstOn)}`;
    }
    $('badge-pop-meta').textContent = meta;
    const unlock = b.unlock ? unlockName(b.unlock) : '';
    $('badge-pop-unlock').textContent = unlock ? `${locked ? 'Débloquera' : 'A débloqué'} : ${unlock}` : '';
    $('badge-pop').hidden = false;
    $('badge-pop-close').focus();
  }

  function closeBadge() {
    $('badge-pop').hidden = true;
  }
  $('badge-pop-close').addEventListener('click', closeBadge);
  $('badge-pop').addEventListener('click', (e) => e.target === $('badge-pop') && closeBadge());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && !$('badge-pop').hidden && closeBadge());


  // ---------- Profil : avatar et pseudo ----------
  const SWATCH = {
    peau: { clair: '#f1c9a5', mat: '#d9a066', brun: '#9c6a43', fonce: '#6b4328' },
    couleur: { brun: '#4a2f1a', noir: '#1b1410', blond: '#e8c547', roux: '#c4562a', gris: '#b8b8c0', rose: '#e86aa8', bleu: '#4a86e8' },
  };
  const AVATAR_ORDER = ['forme', 'cheveux', 'couleur', 'peau', 'yeux', 'barbe', 'chapeau', 'tenue', 'objet', 'lieu'];

  function renderAvatarEditor(profile) {
    const catalog = profile.avatarCatalog;
    const draft = { ...profile.avatar };
    const preview = () => {
      $('prof-avatar').replaceChildren(avatarEl(draft, 'full', 6));
    };
    $('prof-name').textContent = app.me.user.username;
    const rows = AVATAR_ORDER.map((slot) => {
      const cat = catalog[slot];
      const label = el('span', { class: 'val' });
      const swatch = el('span', { class: 'swatch' });
      const refresh = () => {
        const opt = cat.options.find((o) => o.id === draft[slot]) || cat.options[0];
        label.textContent = `${opt.unlocked ? '' : '🔒 '}${opt.label}`;
        label.classList.toggle('locked', !opt.unlocked);
        if (SWATCH[slot]) swatch.style.background = SWATCH[slot][opt.id] || 'transparent';
      };
      const step = (dir) => {
        const i = cat.options.findIndex((o) => o.id === draft[slot]);
        draft[slot] = cat.options[(i + dir + cat.options.length) % cat.options.length].id;
        refresh();
        preview();
        commit();
      };
      const prev = el('button', { class: 'arr', type: 'button', 'aria-label': `${cat.label} précédent` }, '◀');
      const next = el('button', { class: 'arr', type: 'button', 'aria-label': `${cat.label} suivant` }, '▶');
      prev.addEventListener('click', () => step(-1));
      next.addEventListener('click', () => step(1));
      refresh();
      return el('div', { class: 'opt' }, el('span', { class: 'lab' }, cat.label), prev, el('span', { class: 'val-wrap' }, SWATCH[slot] ? swatch : null, label), next);
    });
    $('avatar-options').replaceChildren(...rows);
    preview();
    let timer = null;
    function commit() {
      clearTimeout(timer);
      const locked = AVATAR_ORDER.map((slot) => catalog[slot].options.find((o) => o.id === draft[slot])).filter((o) => o && !o.unlocked);
      if (locked.length) {
        $('avatar-status').textContent = `🔒 ${locked.map((o) => o.hint).join(' — ')} (pas enregistré tant que ce n'est pas débloqué)`;
        return;
      }
      $('avatar-status').textContent = '';
      timer = setTimeout(async () => {
        try {
          const res = await api('/api/profile/avatar', { avatar: draft });
          app.me.avatar = res.avatar;
          showMyAvatar();
          $('avatar-status').textContent = 'Personnage enregistré.';
        } catch (err) {
          $('avatar-status').textContent = err.message;
        }
      }, 500);
    }
  }

  $('btn-rename').addEventListener('click', () => {
    $('form-rename').hidden = false;
    $('rename-name').value = app.me.user.username;
    $('rename-password').value = '';
    $('rename-status').textContent = '';
    $('rename-name').focus();
  });
  $('btn-rename-cancel').addEventListener('click', () => {
    $('form-rename').hidden = true;
  });
  $('form-rename').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = $('rename-status');
    status.textContent = '';
    try {
      const res = await api('/api/profile/rename', { username: $('rename-name').value, password: $('rename-password').value });
      app.me.user.username = res.user.username;
      $('who').textContent = res.user.username;
      $('settings-user').textContent = res.user.username;
      $('prof-name').textContent = res.user.username;
      $('rename-password').value = '';
      $('form-rename').hidden = true;
      status.textContent = `C'est fait : tu t'appelles maintenant ${res.user.username}. Prochain changement possible dans une semaine.`;
    } catch (err) {
      status.textContent = err.message;
    }
  });

  async function openProfile() {
    stopTimer();
    try {
      const profile = await api('/api/profile');
      app.profile = profile;
      app.skin = profile.skin;
      renderProfile(profile);
      show('profile');
      initFolds();
      loadReports();
      loadSuggestions();
      loadBilan(app.bilanMonth || null);
      loadDashboard();
      if (profile.badges.some((b) => b.isNew)) {
        api('/api/profile/seen', {}).catch(() => {});
        if (app.me) app.me.unseenBadges = 0;
      }
    } catch (err) {
      showNotice(err.message);
    }
  }

  function renderPlayerStats(ps) {
    const block = (title, rows) =>
      el('div', { class: 'stats-block' }, el('h3', {}, title), el('dl', { class: 'stats' }, ...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])));
    const best = (b) => (b ? `${pts(b.points)} · ${b.answer} (${b.theme})` : '—');
    const d = ps.daily;
    const t = ps.training;
    $('player-stats').replaceChildren(
      el('p', {}, el('strong', {}, `${ps.themesSeen} thèmes rencontrés`), ' au total, tous modes confondus.'),
      block('Forages du jour', [
        ['Thèmes rencontrés', `${d.themes} (${d.distinctThemes} différents)`],
        ['Réponses données', String(d.answers)],
        ['Moyenne par réponse', pts(d.average)],
        ['Pépites', String(d.pepites)],
        ['Meilleure réponse', best(d.best)],
      ]),
      block('Mode illimité', [
        ['Forages terminés', String(t.games)],
        ['Thèmes rencontrés', String(t.themes)],
        ['Réponses données', String(t.answers)],
        ['Moyenne par réponse', pts(t.average)],
        ['Pépites', String(t.pepites)],
        ['Meilleur forage', pts(t.bestScore)],
        ['Meilleure réponse', best(t.best)],
      ]),
    );
  }

  // ---------- Graphiques du carnet ----------
  function scoreTier(score) {
    return score >= 500 ? 'pepite' : score >= 350 ? 'rare' : score >= 200 ? 'original' : score >= 80 ? 'courant' : 'evident';
  }

  function renderCharts(c, bestScore) {
    if (!c) return;
    // Calendrier des jours forés : une colonne par semaine (lundi en haut), une case par jour.
    const cal = $('chart-calendar');
    cal.replaceChildren();
    const cell = 15;
    const gap = 3;
    const left = 20;
    const weeks = Math.ceil(c.calendar.length / 7);
    cal.setAttribute('viewBox', `0 0 ${left + weeks * (cell + gap)} ${7 * (cell + gap) + 2}`);
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach((d, i) => cal.append(svg('text', { x: 0, y: 11 + i * (cell + gap), class: 'cal-label' }, d)));
    c.calendar.forEach((d, i) => {
      const w = Math.floor(i / 7);
      const row = i % 7;
      const played = d.score != null;
      const rect = svg('rect', {
        x: left + w * (cell + gap),
        y: row * (cell + gap),
        width: cell,
        height: cell,
        fill: played ? Pixel.TIER_COLORS[scoreTier(d.score)] : 'var(--well)',
        opacity: d.future ? 0.35 : 1,
        class: `cal-cell${d.day === app.me.today.day ? ' today' : ''}`,
      });
      rect.append(svg('title', {}, `${formatDay(d.day, { weekday: 'long', day: 'numeric', month: 'long' })}${played ? ` · ${pts(d.score)}` : ''}`));
      cal.append(rect);
    });

    // Courbe des derniers scores, avec la moyenne en pointillés.
    const line = $('chart-recent');
    line.replaceChildren();
    if (c.recent.length < 2) {
      line.append(svg('text', { x: 160, y: 62, 'text-anchor': 'middle', class: 'cal-label' }, 'Il faut au moins deux forages pour tracer la courbe.'));
    } else {
      const W = 320;
      const H = 120;
      const pad = { l: 34, r: 8, t: 10, b: 18 };
      const max = Math.max(100, ...c.recent.map((r) => r.score));
      const x = (i) => pad.l + (i / (c.recent.length - 1)) * (W - pad.l - pad.r);
      const y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
      const avg = c.recent.reduce((n, r) => n + r.score, 0) / c.recent.length;
      [0, max / 2, max].forEach((v) => {
        line.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'grid' }), svg('text', { x: pad.l - 4, y: y(v) + 4, 'text-anchor': 'end', class: 'cal-label' }, String(Math.round(v))));
      });
      line.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(avg), y2: y(avg), class: 'avg' }), svg('text', { x: W - pad.r, y: y(avg) - 3, 'text-anchor': 'end', class: 'cal-label' }, `moyenne ${Math.round(avg)}`));
      line.append(svg('polyline', { points: c.recent.map((r, i) => `${x(i)},${y(r.score)}`).join(' '), class: 'curve' }));
      c.recent.forEach((r, i) => {
        const dot = svg('rect', { x: x(i) - 3, y: y(r.score) - 3, width: 6, height: 6, fill: Pixel.TIER_COLORS[scoreTier(r.score)], class: 'dot' });
        dot.append(svg('title', {}, `${formatDay(r.day, { day: 'numeric', month: 'long' })} · ${pts(r.score)}`));
        line.append(dot);
      });
      line.append(
        svg('text', { x: pad.l, y: H - 4, class: 'cal-label' }, formatDay(c.recent[0].day, { day: 'numeric', month: 'short' })),
        svg('text', { x: W - pad.r, y: H - 4, 'text-anchor': 'end', class: 'cal-label' }, formatDay(c.recent[c.recent.length - 1].day, { day: 'numeric', month: 'short' })),
      );
    }

    // Répartition de tes réponses par rareté.
    const total = Object.values(c.tiers).reduce((a, b) => a + b, 0);
    const bars = $('chart-tiers');
    bars.replaceChildren();
    if (!total) bars.append(el('p', { class: 'muted' }, 'Pas encore de réponse dans un forage du jour.'));
    ['pepite', 'rare', 'original', 'courant', 'evident'].forEach((id) => {
      const n = c.tiers[id];
      const pct = total ? Math.round((n / total) * 100) : 0;
      bars.append(
        el(
          'div',
          { class: 'tier-bar' },
          swatch(id),
          el('span', { class: 'tier-name' }, TIER_LABELS[id]),
          el('span', { class: 'tier-track' }, el('span', { class: 'tier-fill', style: { width: `${pct}%`, background: Pixel.TIER_COLORS[id] } })),
          el('span', { class: 'tier-n' }, `${n} · ${pct} %`),
        ),
      );
    });
    if (c.signature) bars.append(el('p', { class: 'muted small' }, `Ta réponse signature : « ${c.signature.answer} » (${plural(c.signature.n, 'fois', 'fois')}).`));

    // Coupe de la Terre avec ta meilleure profondeur.
    const earth = $('chart-earth');
    earth.replaceChildren();
    const zones = Pixel.ZONES;
    const top = 6;
    const bottom = 144;
    const toY = (points) => top + (Math.min(points, Pixel.MAX_POINTS) / Pixel.MAX_POINTS) * (bottom - top);
    zones.forEach((z, i) => {
      const y0 = toY(z.from);
      const y1 = i + 1 < zones.length ? toY(zones[i + 1].from) : bottom;
      earth.append(svg('rect', { x: 20, y: y0, width: 60, height: Math.max(1, y1 - y0), fill: z.colors[0] }));
      if (y1 - y0 > 16) earth.append(svg('text', { x: 90, y: (y0 + y1) / 2 + 4, class: 'cal-label' }, z.name));
    });
    const best = toY(bestScore || 0);
    earth.append(svg('line', { x1: 14, x2: 86, y1: best, y2: best, class: 'best-line' }), svg('rect', { x: 8, y: best - 4, width: 8, height: 8, class: 'best-mark' }));
    earth.append(svg('text', { x: 200, y: Math.min(bottom - 4, Math.max(14, best + 4)), class: 'best-label' }, `${Pixel.formatDepth(bestScore || 0)} · ${pts(bestScore || 0)}`));
  }

  // ---------- Bilan du mois ----------
  function shiftMonth(month, n) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  async function loadBilan(month) {
    try {
      const b = await api(`/api/month${month ? `?month=${month}` : ''}`);
      app.bilanMonth = b.month;
      app.bilanCurrent = app.bilanCurrent || b.month;
      $('bilan-label').textContent = formatDay(`${b.month}-01`, { month: 'long', year: 'numeric' });
      $('btn-bilan-next').disabled = b.month >= app.bilanCurrent;
      const rows = [
        ['Jours forés', String(b.days)],
        ['Points marqués', String(b.totalPoints)],
        ['Moyenne par forage', b.days ? pts(b.average) : '—'],
        ['Pépites · réponses rares', `${b.pepites} · ${b.rares}`],
        ['Thèmes passés ou expirés', String(b.skipped)],
      ];
      const body = $('bilan-body');
      body.replaceChildren(el('dl', { class: 'stats' }, ...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])));
      if (b.bestGame) body.append(el('p', {}, `Ton meilleur forage : ${pts(b.bestGame.score)} le ${formatDay(b.bestGame.day, { day: 'numeric', month: 'long' })}.`));
      if (b.bestRound) body.append(el('p', {}, `Ta meilleure manche : « ${b.bestRound.answer} » (${b.bestRound.theme}), ${pts(b.bestRound.points)}.`));
      if (b.signature) body.append(el('p', {}, `Ta réponse signature : « ${b.signature.answer} » (${plural(b.signature.n, 'fois', 'fois')}).`));
      if (b.days && b.previous.days) {
        const delta = b.average - b.previous.average;
        body.append(el('p', { class: 'muted' }, delta === 0 ? 'Ta moyenne par forage est stable par rapport au mois précédent.' : `Ta moyenne par forage ${delta > 0 ? 'progresse' : 'recule'} de ${Math.abs(delta)} points par rapport au mois précédent.`));
      }
      if (!b.days) body.append(el('p', { class: 'muted' }, 'Aucun forage ce mois-là.'));
    } catch (err) {
      $('bilan-body').textContent = err.message;
    }
  }
  $('btn-bilan-prev').addEventListener('click', () => app.bilanMonth && loadBilan(shiftMonth(app.bilanMonth, -1)));
  $('btn-bilan-next').addEventListener('click', () => app.bilanMonth && loadBilan(shiftMonth(app.bilanMonth, 1)));

  // ---------- Tableau de bord du responsable ----------
  async function loadDashboard() {
    const card = $('admin-dashboard');
    card.hidden = !(app.me && app.me.isAdmin);
    if (card.hidden) return;
    try {
      const d = await api('/api/admin/dashboard');
      const list = (items, render) => (items.length ? el('ul', { class: 'report-list' }, ...items.map((i) => el('li', {}, render(i)))) : el('p', { class: 'muted' }, 'Rien pour l\'instant.'));
      $('dashboard-body').replaceChildren(
        el('p', {}, `${plural(d.activePlayersThisWeek, 'joueur actif', 'joueurs actifs')} cette semaine sur ${d.totalPlayers} inscrits · ${plural(d.trainingGames, 'forage illimité terminé', 'forages illimités terminés')} · ${plural(d.pendingReports, 'signalement à vérifier', 'signalements à vérifier')}.`),
        el('h3', {}, 'Forages terminés, 7 derniers jours'),
        list(d.perDay, (r) => `${formatDay(r.day, { weekday: 'short', day: 'numeric', month: 'short' })} : ${plural(r.n, 'forage', 'forages')}`),
        el('h3', {}, 'Réponses refusées les plus fréquentes'),
        list(d.refused, (r) => `« ${r.input} » ×${r.n} — ${r.theme}`),
        el('h3', {}, 'Thèmes où l\'on se fait le plus refuser'),
        list(d.refusedThemes, (r) => `${r.theme} : ${r.n}`),
      );
    } catch (err) {
      $('dashboard-body').textContent = err.message;
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
    renderAvatarEditor(profile);
    renderPlayerStats(profile.playerStats);
    renderCharts(profile.playerStats.charts, st.bestScore);
    renderBadgeSections();
    renderWorkshop();
  }

  // Recherche et filtre des badges du carnet.
  const badgeView = { query: '', filter: 'all' };
  const squash = (t) => String(t).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');

  function renderBadgeSections() {
    const profile = app.profile;
    if (!profile) return;
    const sections = $('badge-sections');
    sections.replaceChildren();
    const q = squash(badgeView.query);
    const searching = Boolean(q) || badgeView.filter !== 'all';
    let shown = 0;
    CATEGORIES.forEach(([id, title]) => {
      const all = profile.badges.filter((b) => b.category === id);
      if (!all.length) return;
      const list = all.filter((b) => {
        if (badgeView.filter === 'got' && !b.count) return false;
        if (badgeView.filter === 'todo' && b.count) return false;
        return !q || squash(`${b.name} ${b.description}`).includes(q);
      });
      if (!list.length) return;
      shown += list.length;
      const earned = all.filter((b) => b.count).length;
      const fresh = list.some((b) => b.isNew);
      sections.append(
        el(
          'details',
          { class: 'badge-group', 'data-fold': `badges-${id}`, ...((searching || foldOpen(`badges-${id}`, true)) ? { open: '' } : {}) },
          el(
            'summary',
            {},
            el('span', { class: 'fold-t' }, el('span', {}, title), el('span', { class: 'muted small' }, ` ${earned}/${all.length}`), fresh ? el('span', { class: 'new-dot' }, 'nouveau') : null),
            el('span', { class: 'pm', 'aria-hidden': 'true' }),
          ),
          el('div', { class: 'badge-table' }, ...list.map(badgeTile)),
        ),
      );
    });
    if (!shown) sections.append(el('p', { class: 'muted' }, 'Aucun badge ne correspond.'));
    watchFolds(sections);
  }
  $('badge-search').addEventListener('input', () => {
    badgeView.query = $('badge-search').value;
    renderBadgeSections();
  });
  $('badge-filter').addEventListener('click', (event) => {
    const b = event.target.closest('button[data-filter]');
    if (!b) return;
    badgeView.filter = b.dataset.filter;
    $('badge-filter').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    renderBadgeSections();
  });

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
    // Chrono : aperçu du décompte à 18 secondes.
    const current = app.skin.timer || 'batterie';
    $('skin-timers').replaceChildren(
      ...app.profile.timers.map((t) => {
        const thumb = el('canvas', { class: 'skin-thumb timer', width: '96', height: '20' });
        Timers.draw(thumb, t.id, 18, 30, 0, settings.colors, true);
        const selected = t.id === current;
        const button = el(
          'button',
          { type: 'button', class: `skin timer-skin${t.unlocked ? '' : ' locked'}${selected ? ' selected' : ''}`, 'aria-pressed': String(selected), title: t.unlocked ? t.name : t.hint },
          thumb,
          el('span', {}, t.unlocked ? t.name : `🔒 ${t.name}`),
        );
        button.addEventListener('click', () => chooseSkin('timer', t));
        return button;
      }),
    );
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
    const labels = { pending: 'à vérifier', handled: 'traitée' };
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
            `${plural(r.players, 'joueur', 'joueurs')} · ${labels[r.status]}${r.inTheme ? ` · reconnue par le thème comme « ${r.inTheme} »` : ''}${r.credited ? ` · points accordés à ${r.credited}` : ''}`,
          ),
        );
        (r.reporters || []).filter((p) => p.creditableDay).forEach((p) => {
          // Réponse non reconnue : le responsable désigne la réponse visée (geste ponctuel, les règles ne changent pas).
          let pick = null;
          if (!r.inTheme) {
            pick = el('select', { 'aria-label': 'Réponse visée' }, el('option', { value: '' }, 'Réponse visée…'));
            api(`/api/admin/theme-answers?themeId=${encodeURIComponent(r.themeId)}`)
              .then(({ answers }) => answers.forEach((a) => pick.append(el('option', { value: a.key }, a.label))))
              .catch(() => {});
          }
          const give = el('button', { class: 'link', type: 'button' }, `Accorder les points à ${p.username} (forage du ${longDay(p.creditableDay)})`);
          give.addEventListener('click', async () => {
            const answerKey = pick ? pick.value : undefined;
            if (pick && !answerKey) return showNotice('Choisis d\'abord la réponse visée.');
            const what = pick ? pick.selectedOptions[0].textContent : r.input;
            if (!window.confirm(`Accorder à ${p.username} les points de « ${what} » pour le forage du ${longDay(p.creditableDay)} ?`)) return;
            try {
              const res = await api('/api/admin/reports/credit', { themeId: r.themeId, inputKey: r.inputKey, username: p.username, answerKey });
              p.creditableDay = null;
              p.credited = true;
              r.credited += 1;
              showNotice(`${p.username} : ${res.points} points accordés.`);
              renderReports();
            } catch (err) {
              showNotice(err.message);
            }
          });
          if (pick) item.append(pick);
          item.append(give);
        });
        // Retour aux joueurs : verdict et message, visibles dans leur onglet « Mes signalements ».
        const msg = el('textarea', { rows: 2, maxlength: 600, placeholder: 'Message au joueur (pourquoi oui ou non)' });
        msg.value = (r.reply && r.reply.message) || '';
        const status = el('span', { class: 'muted small' }, r.reply ? `Retour envoyé : ${r.reply.verdict === 'accepted' ? 'acceptée' : 'refusée'}.` : '');
        const send = (verdict, label) => {
          const b = el('button', { class: 'link', type: 'button' }, label);
          b.addEventListener('click', async () => {
            try {
              await api('/api/admin/reports/reply', { themeId: r.themeId, inputKey: r.inputKey, verdict, message: msg.value });
              r.reply = { verdict, message: msg.value };
              status.textContent = `Retour envoyé : ${verdict === 'accepted' ? 'acceptée' : 'refusée'}.`;
            } catch (err) {
              status.textContent = err.message;
            }
          });
          return b;
        };
        item.append(msg, el('span', {}, send('accepted', 'Envoyer : acceptée'), ' · ', send('refused', 'Envoyer : refusée')), status);
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

  // ---------- Thèmes proposés ----------
  async function loadSuggestions() {
    try {
      const { suggestions } = await api('/api/themes/suggestions');
      renderMySuggestions(suggestions);
      loadMyReports();
    } catch {
      /* la section reste vide */
    }
    const card = $('admin-suggestions');
    card.hidden = !(app.me && app.me.isAdmin);
    if (card.hidden) return;
    try {
      const { suggestions } = await api('/api/admin/theme-suggestions');
      app.suggestions = suggestions;
      renderSuggestions();
    } catch (err) {
      $('suggestions-status').textContent = err.message;
    }
  }

  $('fold-proposer').addEventListener('toggle', () => {
    if (!$('fold-proposer').open) return;
    loadMyReports();
    if (!$('report-mine-dot').hidden) api('/api/reports/mine/seen', {}).then(() => ($('report-mine-dot').hidden = true)).catch(() => {});
  });

  // Retour du responsable sur les réponses que le joueur a signalées.
  async function loadMyReports() {
    try {
      const { reports, unread } = await api('/api/reports/mine');
      const list = $('report-mine');
      list.replaceChildren(
        ...reports.map((r) => {
          const state = r.verdict === 'accepted' ? 'Acceptée' : r.verdict === 'refused' ? 'Refusée' : r.status === 'handled' ? 'Examinée' : 'En attente d\'examen';
          return el(
            'li',
            { class: `report ${r.status}` },
            el('span', { class: 'what' }, el('strong', {}, `« ${r.input} »`), el('span', { class: 'muted' }, r.themeTitle)),
            el('span', { class: 'muted' }, `${state}${r.points != null ? ` · +${r.points} points accordés` : ''}`),
            r.message ? el('span', {}, r.message) : null,
          );
        }),
      );
      $('report-mine-title').hidden = !reports.length;
      $('report-mine-dot').hidden = !unread;
    } catch {
      /* la section reste vide */
    }
  }

  function renderMySuggestions(list) {
    $('suggest-mine').replaceChildren(
      ...list.map((s) =>
        el(
          'li',
          { class: `report ${s.handled ? 'handled' : 'pending'}` },
          el('span', { class: 'what' }, el('strong', {}, s.title)),
          el('span', { class: 'muted' }, s.handled ? 'Examinée, merci !' : 'En attente d\'examen'),
        ),
      ),
    );
  }

  $('form-suggest').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = $('suggest-status');
    status.textContent = '';
    try {
      await api('/api/themes/suggest', { title: $('suggest-title').value, details: $('suggest-details').value });
      $('suggest-title').value = '';
      $('suggest-details').value = '';
      status.textContent = 'Merci ! Ta proposition est bien reçue.';
      loadSuggestions();
    } catch (err) {
      status.textContent = err.message;
    }
  });

  function renderSuggestions() {
    const tab = app.suggestionTab || 'pending';
    const all = app.suggestions || [];
    const shown = all.filter((s) => !s.handled === (tab === 'pending'));
    $('count-sug-pending').textContent = `(${all.filter((s) => !s.handled).length})`;
    $('count-sug-done').textContent = `(${all.filter((s) => s.handled).length})`;
    document.querySelectorAll('#suggestion-tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.suggestions === tab));
    $('btn-copy-suggestions').hidden = tab !== 'pending';
    const list = $('suggestion-list');
    list.replaceChildren(
      ...shown.map((s) => {
        const item = el(
          'li',
          { class: `report ${s.handled ? 'handled' : 'pending'}` },
          el('span', { class: 'what' }, el('strong', {}, s.title), s.details ? el('span', { class: 'muted' }, s.details) : null),
          el('span', { class: 'muted' }, `proposé par ${s.username} · ${formatDay(new Date(s.createdAt).toISOString().slice(0, 10), { day: 'numeric', month: 'long' })}`),
        );
        if (!s.handled) {
          const done = el('button', { class: 'link', type: 'button' }, 'Marquer comme traité');
          done.addEventListener('click', async () => {
            await api('/api/admin/theme-suggestions/handled', { id: s.id }).catch(() => {});
            s.handled = true;
            renderSuggestions();
          });
          item.append(done);
        }
        return item;
      }),
    );
    if (!shown.length) list.append(el('li', { class: 'muted' }, tab === 'pending' ? 'Aucune proposition à traiter.' : 'Aucune proposition traitée pour l\'instant.'));
  }

  document.querySelectorAll('#suggestion-tabs .tab').forEach((t) =>
    t.addEventListener('click', () => {
      app.suggestionTab = t.dataset.suggestions;
      renderSuggestions();
    }),
  );

  $('btn-copy-suggestions').addEventListener('click', async () => {
    const pending = (app.suggestions || []).filter((s) => !s.handled);
    const text = pending.length
      ? pending.map((s) => `${s.title}${s.details ? ` — ${s.details.replace(/\s+/g, ' ')}` : ''} (proposé par ${s.username})`).join('\n')
      : 'Aucune proposition en attente.';
    try {
      await navigator.clipboard.writeText(text);
      $('suggestions-status').textContent = `${plural(pending.length, 'proposition copiée', 'propositions copiées')} : colle-les dans la conversation.`;
    } catch {
      $('suggestions-status').textContent = text;
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

  /** Trois marches avec le personnage de chacun ; `scale` règle la taille des personnages. */
  function buildPodium(podium, entries, scale) {
    podium.replaceChildren();
    [2, 1, 3].forEach((place) => {
      const entry = entries.filter((e) => e.rank === place)[0] || null;
      const step = el('div', { class: `step p${place}${entry ? '' : ' empty'}` });
      step.append(
        el('span', { class: 'name' }, entry ? entry.username : '—'),
        el('span', { class: 'score' }, entry ? pts(entry.score) : ''),
        el('span', { class: 'avatar-slot' }, entry ? avatarEl(entry.avatar, 'full', scale) : null),
        el('div', { class: 'block' }, String(place)),
      );
      podium.append(step);
    });
  }

  function renderPodium(board) {
    document.querySelectorAll('#period-tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.period === board.period));
    $('week-label').textContent = periodLabel(board);
    $('btn-week-next').disabled = !board.next;

    buildPodium($('podium'), board.entries, 3);

    const ranking = $('ranking');
    ranking.replaceChildren();
    board.entries.forEach((e) => {
      ranking.append(
        el(
          'li',
          { class: e.me ? 'me' : '' },
          el('span', {}, `${e.rank}.`),
          el('span', { class: 'who-av' }, avatarEl(e.avatar), el('span', { class: 'who-name' }, e.username, board.period === 'day' ? null : el('span', { class: 'days' }, ` (${e.days} j)`))),
          el('span', {}, pts(e.score)),
        ),
      );
    });
    if (!board.entries.length) ranking.append(el('li', {}, el('span', {}, ''), el('span', {}, 'Aucun forage sur cette période.'), el('span', {}, '')));
    $('btn-compare').hidden = board.period !== 'day' || !board.entries.length;
    const when = { day: 'ce jour-là', week: 'cette semaine', month: 'ce mois-ci' }[board.period];
    $('my-rank').textContent = board.me
      ? `Ton rang : ${board.me.rank === 1 ? '1er' : `${board.me.rank}e`} sur ${board.entries.length} · ${pts(board.me.score)}`
      : `Tu n'as pas joué ${when}.`;
  }

  document.querySelectorAll('#period-tabs .tab').forEach((t) => t.addEventListener('click', () => openPodium(t.dataset.period, null)));
  $('btn-week-prev').addEventListener('click', () => openPodium(app.podium.period, app.podium.prev));
  $('btn-week-next').addEventListener('click', () => app.podium.next && openPodium(app.podium.period, app.podium.next));
  $('btn-podium-home').addEventListener('click', () => goHome());

  // ---------- Récap du lundi : feu d'artifice, puis la Gazette de la mine ----------
  let recapTimer = null;

  function medalCanvas(place) {
    const colors = { 1: ['#c8941c', '#ffd84a'], 2: ['#8a8f98', '#d6dbe3'], 3: ['#8a5a2b', '#c98a4b'] }[place];
    const c = el('canvas', { class: 'medal', width: '14', height: '18', 'aria-hidden': 'true' });
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(3, 0, 3, 5);
    ctx.fillStyle = '#2a5db0';
    ctx.fillRect(8, 0, 3, 5);
    ctx.fillStyle = colors[0];
    ctx.fillRect(2, 5, 10, 11);
    ctx.fillRect(3, 4, 8, 13);
    ctx.fillStyle = colors[1];
    ctx.fillRect(4, 7, 6, 7);
    ctx.fillStyle = colors[0];
    ctx.fillRect(6, 8, 2, 5);
    return c;
  }

  async function openRecap(week) {
    try {
      const data = await api(`/api/recap?week=${week}`);
      app.recap = data;
      renderRecap(data);
      show('recap');
      startFireworks(data);
    } catch {
      /* le récap est un bonus : s'il échoue, on reste sur l'accueil */
    }
  }

  function startFireworks(data) {
    clearInterval(recapTimer);
    const canvas = $('recap-canvas');
    const ctx = canvas.getContext('2d');
    const scale = Math.max(1, Math.min(3, Math.floor((canvas.parentElement.clientWidth || 320) / 160)));
    canvas.style.width = `${160 * scale}px`;
    canvas.style.height = `${190 * scale}px`;
    const sprites = {};
    [1, 2, 3].forEach((place) => {
      const e = data.entries.find((x) => x.rank === place);
      if (e && window.Avatar) sprites[place] = Avatar.sprite(e.avatar);
    });
    const hash = (n) => Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;
    const bursts = [[34, 40, '#ffd84a', 0], [124, 34, '#ff6a8a', 0.8], [80, 66, '#5ee0ff', 1.5], [140, 84, '#b28cff', 2.2], [18, 90, '#7fcf5a', 2.8]];
    const steps = [[2, 14, 40, 150, '#9aa0aa'], [1, 60, 40, 140, '#e0b020'], [3, 106, 40, 160, '#b27a3e']]; // [place, x, largeur, haut, couleur]
    const draw = (t) => {
      for (let y = 0; y < 190; y += 2) {
        ctx.fillStyle = y < 70 ? '#0b1026' : y < 125 ? '#121a3d' : '#1b2552';
        ctx.fillRect(0, y, 160, 2);
      }
      for (let i = 0; i < 36; i++) {
        ctx.fillStyle = Math.sin(t * 3 + i) > 0 ? '#ffffff' : '#6a73a0';
        ctx.fillRect(Math.floor(hash(i + 1) * 160), Math.floor(hash(i + 50) * 100), 1, 1);
      }
      bursts.forEach(([cx, cy, color, phase]) => {
        const k = (t * 0.9 + phase / 3) % 1;
        const r = k * 24;
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          ctx.fillStyle = color;
          ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r + k * k * 10), 2, 2);
          if (k < 0.7) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(Math.round(cx + Math.cos(a) * r * 0.6), Math.round(cy + Math.sin(a) * r * 0.6 + k * k * 8), 1, 1);
          }
        }
      });
      ctx.fillStyle = '#2a1a0c';
      ctx.fillRect(0, 170, 160, 20);
      steps.forEach(([place, x, w, top, color]) => {
        ctx.fillStyle = color;
        ctx.fillRect(x, top + 20, w, 190 - top - 20);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(x, top + 20, w, 3);
        const sprite = sprites[place];
        if (sprite) {
          const jump = Math.round(Math.abs(Math.sin(t * 5 + place * 1.4)) * 8);
          ctx.drawImage(sprite, x + w / 2 - 8, top + 20 - 28 - jump);
        }
      });
    };
    draw(0);
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    recapTimer = setInterval(() => {
      if ($('view-recap').hidden || document.hidden) return;
      draw(performance.now() / 1000);
    }, 80);
  }

  function renderRecap(data) {
    $('recap-sub').textContent = `Semaine du ${formatDay(data.start, { day: 'numeric', month: 'long' })} au ${formatDay(data.end, { day: 'numeric', month: 'long' })}`;
    $('recap-fireworks').hidden = false;
    $('recap-gazette').hidden = true;
    $('recap-names').replaceChildren(
      ...[2, 1, 3].map((place) => {
        const e = data.entries.find((x) => x.rank === place);
        return el('div', { class: `recap-name p${place}` }, el('span', { class: 'who-name' }, e ? e.username : '—'), el('span', { class: 'score' }, e ? pts(e.score) : ''));
      }),
    );
    // Gazette
    const g = $('recap-gazette');
    const champ = data.champion;
    const line = (label, value) => el('div', { class: 'gz-line' }, el('span', {}, label), el('span', {}, value));
    const mine = data.me;
    g.replaceChildren(
      el('h2', { class: 'gz-title' }, 'La Gazette de la mine'),
      el('p', { class: 'gz-date' }, `Semaine du ${formatDay(data.start, { day: 'numeric', month: 'long' })} au ${formatDay(data.end, { day: 'numeric', month: 'long' })}`),
      champ ? el('p', { class: 'gz-headline' }, `${champ.username}, champion(ne) de la semaine : ${pts(champ.score)} !`) : null,
      el(
        'ul',
        { class: 'gz-ranking' },
        ...data.entries.map((e) =>
          el(
            'li',
            { class: e.me ? 'me' : '' },
            e.rank <= 3 ? medalCanvas(e.rank) : el('span', { class: 'gz-rank' }, `${e.rank}.`),
            avatarEl(e.avatar, 'head', 2),
            el('span', { class: 'who-name' }, e.username),
            el('span', {}, `${pts(e.score)} · ${e.days} j`),
          ),
        ),
      ),
      el(
        'div',
        { class: 'gz-moments' },
        el('h3', {}, 'Les moments forts'),
        data.best ? line('Meilleur forage', `${data.best.username}, ${pts(data.best.score)} (${formatDay(data.best.day, { weekday: 'long' })})`) : null,
        data.rarest ? line('Réponse la plus rare', `« ${data.rarest.answer} » (${data.rarest.username}, ${pts(data.rarest.points)})`) : null,
        data.applauded ? line('Réponse la plus applaudie', `« ${data.applauded.answer} » (${data.applauded.username}, ${data.applauded.reactions} réaction${data.applauded.reactions > 1 ? 's' : ''})`) : null,
        line('Pépites trouvées', String(data.pepites)),
        line('Forages terminés', `${data.games} par ${plural(data.players, 'joueur', 'joueurs')}`),
      ),
      mine
        ? el(
            'div',
            { class: 'gz-moments' },
            el('h3', {}, 'Ta semaine'),
            line('Ton rang', `${mine.rank === 1 ? '1er' : `${mine.rank}e`} sur ${data.players}`),
            line('Forages', `${mine.days} sur 7`),
            line('Ton meilleur forage', pts(mine.best)),
            line('Pépites / réponses rares', `${mine.pepites} / ${mine.rares}`),
          )
        : el('p', { class: 'gz-date' }, "Tu n'as pas creusé cette semaine : rendez-vous cette semaine !"),
      el('button', { class: 'btn', id: 'btn-recap-done', type: 'button' }, 'À la mine !'),
    );
    $('btn-recap-done').addEventListener('click', finishRecap);
  }

  $('btn-recap-next').addEventListener('click', () => {
    $('recap-fireworks').hidden = true;
    $('recap-gazette').hidden = false;
    window.scrollTo(0, 0);
  });

  async function finishRecap() {
    clearInterval(recapTimer);
    if (app.recap) api('/api/recap/seen', { week: app.recap.start }).catch(() => {});
    if (app.me) app.me.recap = null;
    app.recap = null;
    show('home');
  }

  // ---------- Réactions aux réponses des autres ----------
  const REACTIONS = [
    { id: 'bienvu', label: 'Bien vu', pal: { c: '#5ee0ff', w: '#ffffff' }, map: ['..ccc...', '.ccwcc..', 'ccccccc.', '.ccccc..', '..ccc...', '...c....', '........', '........'] },
    { id: 'coeur', label: "J'aime", pal: { r: '#e2553f' }, map: ['.rr.rr..', 'rrrrrrr.', 'rrrrrrr.', '.rrrrr..', '..rrr...', '...r....', '........', '........'] },
    { id: 'creuse', label: 'Bien creusé', pal: { g: '#c9ced6', b: '#8a5a2b' }, map: ['.ggg....', 'g...g...', '....gb..', '...gb...', '..gb....', '.gb.....', 'gb......', 'b.......'] },
    { id: 'audace', label: 'Audacieux', pal: { o: '#e8742a', y: '#ffd84a' }, map: ['...o....', '..oo.o..', '.ooyoo..', '.ooyyo..', 'ooyyyoo.', '.oyyyo..', '..ooo...', '........'] },
    { id: 'surprise', label: 'Surprenant', pal: { y: '#f2c230', k: '#1b1410' }, map: ['.yyyyy..', 'yyyyyyy.', 'yk.y.ky.', 'yyyyyyy.', 'yyykyyy.', 'yyykyyy.', '.yyyyy..', '........'] },
  ];

  function reactionIcon(def) {
    const c = el('canvas', { class: 'react-icon', width: '8', height: '8', 'aria-hidden': 'true' });
    const ctx = c.getContext('2d');
    def.map.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === '.') return;
        ctx.fillStyle = def.pal[ch];
        ctx.fillRect(x, y, 1, 1);
      }),
    );
    return c;
  }

  /** Ligne de réactions sous une réponse : on peut réagir à celle des autres, pas à la sienne. */
  function reactionRow(r, own) {
    const row = el('li', { class: 'reaction-row' });
    const state = { counts: { ...r.reactions }, mine: r.mine };
    const draw = () => {
      row.replaceChildren(
        ...REACTIONS.filter((def) => !own || state.counts[def.id]).map((def) => {
          const n = state.counts[def.id] || 0;
          const button = el('button', { type: 'button', class: `react${state.mine === def.id ? ' on' : ''}`, title: def.label, 'aria-label': `${def.label}${n ? ` (${n})` : ''}`, 'aria-pressed': String(state.mine === def.id) }, reactionIcon(def), n ? String(n) : null);
          if (own) button.disabled = true;
          else
            button.addEventListener('click', async () => {
              const kind = state.mine === def.id ? null : def.id;
              try {
                const res = await api('/api/reactions', { rid: r.rid, kind });
                state.counts = res.reactions;
                state.mine = res.mine;
                draw();
              } catch (err) {
                showNotice(err.message);
              }
            });
          return button;
        }),
      );
    };
    draw();
    return row;
  }

  // ---------- Comparaison des réponses d'un jour ----------
  async function openCompare(day, back = 'podium') {
    app.compareBack = back;
    try {
      const data = await api(`/api/compare?date=${day}`);
      $('compare-title').textContent = `Réponses du ${longDay(day)}`;
      const body = $('compare-body');
      body.replaceChildren();
      if (!data.players.length) body.append(el('p', { class: 'muted' }, 'Aucun forage terminé ce jour-là.'));
      if (data.players.length) {
        const top = Math.max(1, ...data.players.map((p) => p.score));
        body.append(
          el('h3', {}, 'Scores du jour'),
          el('p', { class: 'muted small' }, '★ : seul(e) à avoir donné cette réponse · = toi : même réponse que la tienne. Touche un symbole sous une réponse pour réagir.'),
          el(
            'div',
            { class: 'score-bars' },
            ...data.players.map((p) =>
              el(
                'div',
                { class: `score-bar${p.me ? ' me' : ''}` },
                el('span', { class: 'who' }, avatarEl(p.avatar, 'head', 2), p.username),
                el('span', { class: 'track' }, el('span', { class: 'fill', style: { width: `${Math.round((p.score / top) * 100)}%`, background: Pixel.TIER_COLORS[scoreTier(p.score)] } })),
                el('span', { class: 'n' }, pts(p.score)),
              ),
            ),
          ),
        );
      }
      data.themes.forEach((th, i) => {
        const list = el('ul', { class: 'compare-list' });
        const entries = data.players.map((p) => ({ p, r: p.rounds.find((x) => x.themeId === th.themeId && !!x.spare === !!th.spare) })).filter(({ r }) => r);
        const norm = (t) => String(t || '').toLowerCase();
        const given = new Map();
        entries.forEach(({ r }) => r.outcome === 'answer' && given.set(norm(r.answer), (given.get(norm(r.answer)) || 0) + 1));
        const mine = entries.find(({ p }) => p.me);
        entries
          .sort((a, b) => (b.r.points || 0) - (a.r.points || 0))
          .forEach(({ p, r }) => {
            const what = r.outcome === 'answer' ? r.answer : r.outcome === 'joker' ? 'Galerie de secours' : r.outcome === 'timeout' ? 'temps écoulé' : 'passé';
            // Repères : seul(e) à avoir donné cette réponse, ou même réponse que la tienne.
            let mark = '';
            if (r.outcome === 'answer') {
              if (given.get(norm(r.answer)) === 1) mark = ' alone';
              else if (!p.me && mine && mine.r.outcome === 'answer' && norm(mine.r.answer) === norm(r.answer)) mark = ' same';
            }
            list.append(
              el(
                'li',
                { class: `${p.me ? 'me' : ''}${mark}${r.outcome === 'joker' ? ' joker' : ''}${r.spare ? ' spare' : ''}` },
                el('span', { class: 'swatch', style: { background: Pixel.TIER_COLORS[r.tier] || '#666' } }),
                el('span', { class: 'who' }, avatarEl(p.avatar, 'head', 2), p.username),
                el('span', { class: 'what' }, what),
                el('span', { class: 'pts' }, r.outcome === 'joker' ? '—' : pts(r.points || 0)),
              ),
            );
            if (r.rid && r.outcome === 'answer' && (!p.me || Object.keys(r.reactions || {}).length)) list.append(reactionRow(r, p.me));
          });
        body.append(el('h3', {}, th.spare ? `${i + 1}. Galerie de secours : ${th.title}` : `${i + 1}. ${th.title}`), list);
      });
      show('compare');
    } catch (err) {
      showNotice(err.message);
    }
  }
  $('btn-compare').addEventListener('click', () => openCompare(app.podium.start));
  $('btn-results-compare').addEventListener('click', () => openCompare(app.me.today.day, 'results'));
  $('btn-compare-back').addEventListener('click', () => show(app.compareBack || 'podium'));

  // ---------- Raccourcis clavier ----------
  // Récapitulatif : flèches haut/bas pour passer d'un thème à l'autre (Entrée ou Espace l'ouvre).
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if ($('view-results').hidden || event.target.closest('input, textarea, select')) return;
    const rows = [...document.querySelectorAll('#results-answers .catch-row')];
    if (!rows.length) return;
    const at = rows.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? Math.min(rows.length - 1, at + 1) : Math.max(0, at <= 0 ? 0 : at - 1);
    event.preventDefault();
    rows[at === -1 ? 0 : next].focus();
  });

  // ---------- Démarrage ----------
  fitCanvas();
  goHome().catch(() => show('auth'));
})();
