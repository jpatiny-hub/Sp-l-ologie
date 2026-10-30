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
  /** Titre choisi par le joueur, à poser après son pseudo (rien s'il n'en affiche pas). */
  function titleChip(label) {
    return label ? el('span', { class: 'ptitle' }, label) : null;
  }
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
  const settings = { text: 'normal', sound: true, volume: 60, colors: 'normal', theme: 'sombre', lisible: false, btn: 'normal', onehand: false, contrast: false, calm: false, mole: true };
  const BETA_FLAGS = ['betaKeys', 'betaHints', 'betaSkin', 'betaMascot', 'betaNav', 'betaFx', 'betaSocial', 'betaWarm', 'betaHome', 'betaProfil'];
  for (const flag of BETA_FLAGS) settings[flag] = true;
  // Refonte 16-bit : réservée au responsable, désactivée au départ. `betaRefonte` active tout d'un coup ; les autres cases, un morceau à la fois pour comparer.
  const REFONTE_FLAGS = ['betaRefonte', 'betaCaves', 'betaMole16', 'betaGalerie', 'betaSon16'];
  for (const flag of REFONTE_FLAGS) settings[flag] = false;
  settings.betaDrill16 = ''; // foreuse 16-bit à l'essai (refonte, responsable seulement)
  // Ambiance sonore : coups de pioche, grondement, musiques d'accueil, bruits de boutons et chrono sonore, au choix de chaque joueur : coups de pioche, grondement et musique « Galerie » activés au départ, le reste non.
  const AMBIENT_FLAGS = ['labTaps', 'labRumble'];
  const LAB_FLAGS = [...AMBIENT_FLAGS, 'labTabs', 'labClicks', 'labTimer'];
  settings.labMusic = 'galerie';
  let ambientKey = ''; // dernier état de l'ambiance sonore (voir syncAmbient)
  for (const flag of LAB_FLAGS) settings[flag] = AMBIENT_FLAGS.includes(flag);
  /**
   * Versions du jeu que le responsable peut revoir sur son appareil (section « Ancienne version » des réglages).
   * À chaque nouvelle version majeure ou thématique (Halloween, Noël…), ajouter une ligne : `date` (AAAA-MM-JJ), `label`, `hint` et
   * les réglages d'interface (`flags`) qui la reproduisent.
   */
  const ALL_BETA = (value) => Object.fromEntries(BETA_FLAGS.map((f) => [f, value]));
  const VERSIONS = [
    { id: 'actuelle', date: null, label: 'Version actuelle', hint: 'Tout le nouveau look, comme les joueurs.', flags: ALL_BETA(true) },
    { id: '2026-10-27', date: '2026-10-27', label: 'Version du 27 octobre 2026', hint: "Avant le nouveau look : ancien accueil, ancien profil, sans barre du bas ni mascotte à l'accueil.", flags: ALL_BETA(false) },
  ];
  const home = { moved: false, origin: new Map() }; // état du nouvel accueil (voir layoutHome)
  const prof = { moved: false, tab: 'apercu', timelineAll: false, locked: { body: false, bit: false, timer: false } }; // état du nouveau profil (voir layoutProfile)
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    // Ancien réglage « mode daltonien » (case à cocher) : devenu « rouge-vert ».
    if (saved.colorblind && !saved.colors) saved.colors = 'rouge-vert';
    delete saved.colorblind;
    // Les anciens réglages de la bêta (tout décoché par défaut) ne valent plus : le nouveau look est la norme.
    if (saved.betaV !== 2) for (const flag of BETA_FLAGS) delete saved[flag];
    Object.assign(settings, saved);
    if (saved.labMelody && !saved.labMusic) settings.labMusic = 'galerie'; // ancienne case « Mélodie douce »
    settings.betaV = 2;
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

  // Thème clair : choisi, imposé par la lecture facile, ou celui de l'appareil quand « Comme mon appareil » est retenu.
  const lightQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  const isLight = () => settings.lisible || settings.theme === 'clair' || (settings.theme === 'auto' && !!(lightQuery && lightQuery.matches));
  if (lightQuery && lightQuery.addEventListener) lightQuery.addEventListener('change', () => settings.theme === 'auto' && applySettings());
  /** Nouveautés à l'essai : réservées au responsable du jeu, une par une. */
  const labOn = (name) => !!(app.me && settings[name]);
  // Nouveau look : pour tous les joueurs ; le responsable peut en retirer des morceaux dans les réglages pour comparer.
  /** Un morceau de la refonte 16-bit : uniquement pour le responsable, s'il active toute la refonte ou ce morceau. */
  const refonteOn = (name) => !!(app.me && app.me.isAdmin && (settings.betaRefonte || settings[name]));
  /** Galeries 16-bit : grottes mystérieuses par paliers sous la surface. */
  const cavesOn = () => refonteOn('betaCaves');
  /** Taupe en 16 bits. */
  const mole16On = () => !!(refonteOn('betaMole16') && window.Mole16);
  /** Galerie vivante : accueil sans cadre devant les grottes animées. */
  const galerieOn = () => refonteOn('betaGalerie');
  /** Sons 16-bit : un bruit par minerai, wagonnet, taupe, onglets, foreuses spéciales et célébrations. */
  const son16On = () => refonteOn('betaSon16');
  const betaOn = (name) => !!(app.me && (!app.me.isAdmin || settings[name]));

  const isHalloween = () => document.documentElement.dataset.season === 'halloween';
  const reducedMotion = () => !!(settings.calm || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches));
  let hauntTimer = null;

  /** Décor de saison (Halloween…) : interface et scène de forage, sauf en lecture facile et en thème clair. */
  function applySeason() {
    // La refonte 16-bit n'a pas de décor de saison (Halloween, Noël…) : il était fait pour l'ancien style.
    const id = app.me && app.me.season && settings.season !== false && !REFONTE_FLAGS.some(refonteOn) ? app.me.season : null;
    const plain = isLight();
    const root = document.documentElement;
    if (id && !plain) root.dataset.season = id;
    else delete root.dataset.season;
    const wanted = id && !plain ? id : null;
    if ((Pixel.currentSeason || null) !== wanted || Pixel.isCaves() !== cavesOn()) {
      Pixel.currentSeason = wanted;
      Pixel.setSeason(wanted);
      Pixel.setCaves(cavesOn());
      if (typeof scene !== 'undefined') scene.rebuild();
    }
    hauntSync();
    Pixel.setSkullMode(!!(app.me && app.me.skullDay));
    $('skull-banner').hidden = !(app.me && app.me.skullDay);
  }

  function applySettings() {
    const root = document.documentElement;
    if (settings.text === 'normal') delete root.dataset.text;
    else root.dataset.text = settings.text;
    Sound.configure({ enabled: settings.sound, volume: settings.volume / 100 });
    Pixel.setColorblind(settings.colors);
    applySeason();
    root.toggleAttribute('data-mole16', mole16On());
    root.toggleAttribute('data-galerie', galerieOn());
    Galerie.setOn(galerieOn(), reducedMotion());
    if (typeof scene !== 'undefined') scene.drill16 = app.me && app.me.isAdmin && settings.betaDrill16 ? settings.betaDrill16 : null;
    placeChallenge();
    root.classList.toggle('colorblind', settings.colors !== 'normal');
    if (settings.colors === 'normal') delete root.dataset.colors;
    else root.dataset.colors = settings.colors;
    // Confort : taille des boutons, mode une main, haut contraste, animations réduites.
    if (settings.btn === 'normal') delete root.dataset.btn;
    else root.dataset.btn = settings.btn;
    root.toggleAttribute('data-onehand', !!settings.onehand);
    root.toggleAttribute('data-contrast', !!settings.contrast);
    root.toggleAttribute('data-calm', !!settings.calm);
    // Lecture facile : police lisible, espacements larges et fond crème doux (apparence claire).
    if (settings.lisible) root.dataset.lisible = '';
    else delete root.dataset.lisible;
    if (isLight()) root.dataset.theme = 'clair';
    else delete root.dataset.theme;
    root.toggleAttribute('data-beta-skin', betaOn('betaSkin'));
    root.toggleAttribute('data-beta-nav', betaOn('betaNav') || betaOn('betaHome'));
    root.toggleAttribute('data-beta-home', betaOn('betaHome'));
    layoutHome(betaOn('betaHome'));
    root.toggleAttribute('data-beta-profil', betaOn('betaProfil'));
    layoutProfile(betaOn('betaProfil'));
    root.toggleAttribute('data-beta-fx', betaOn('betaFx'));
    applyDaypart();
    updateNav();
    syncAmbient();
    if (app.me && app.me.today) {
      renderBetaHello();
      renderBetaSocial();
    }
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
  scene.onDrill = (on, zone) => Sound.drill(on, zone, son16On() ? scene.drill16 : null);
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
    Sound.drill(true, zone, son16On() ? scene.drill16 : null);
  };
  scene.setLayers([], false);
  applySettings();
  initFolds('view-home');
  initMole16();
  $('challenge-card').addEventListener('toggle', () => {
    if ($('challenge-card').open) {
      renderCollective();
      renderWeekly();
    }
  });

  $('btn-sound').addEventListener('click', () => {
    settings.sound = !settings.sound;
    applySettings();
    saveSettings();
    if (settings.sound) Sound.reveal();
  });

  // Inviter des amis : feuille de partage du téléphone, ou copie du lien du jeu.
  async function shareApp() {
    const url = `${location.origin}/`;
    const data = { title: 'Spéléologie', text: 'Rejoins-moi dans la mine : 7 thèmes par jour, des réponses à trouver et un podium entre amis.', url };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showNotice('Lien du jeu copié : colle-le dans un message à tes amis.');
    } catch {
      showNotice(`Lien du jeu : ${url}`);
    }
  }
  document.querySelectorAll('[data-invite]').forEach((b) => b.addEventListener('click', shareApp));

  // Tiroir « Plus » : musée, Petit Mineur, règles, invitation et Contre maître, hors de l'accueil.
  const FEED_SEEN_KEY = 'speleo-feed-seen';
  function updateDrawerDot() {
    const n = app.drawerNews || {};
    $('drawer-dot').hidden = !(n.admin || n.feed);
  }
  /** Le journal de la mine est ouvert : les nouvelles sont lues (tiroir « Plus » et onglet Journal). */
  function markFeedSeen() {
    app.drawerNews = app.drawerNews || {};
    if (app.feedNewest) {
      try {
        localStorage.setItem(FEED_SEEN_KEY, String(app.feedNewest));
      } catch {
        /* stockage indisponible : la pastille reviendra */
      }
      app.drawerNews.feed = false;
      app.feedNew = 0;
      updateDrawerDot();
      if (typeof updateBubbles === 'function' && !$('bottom-nav').hidden) updateBubbles();
    }
  }
  $('drawer-tab').addEventListener('click', () => {
    $('drawer').showModal();
    markFeedSeen();
  });
  $('btn-drawer-close').addEventListener('click', () => $('drawer').close());
  $('drawer').addEventListener('click', (event) => {
    if (event.target === $('drawer')) return $('drawer').close();
    const button = event.target.closest('button.btn');
    if (button && button.id !== 'btn-feed-more') $('drawer').close();
  });

  const settingsForm = $('form-settings');
  $('btn-settings').addEventListener('click', () => {
    settingsForm.elements.text.value = settings.text;
    settingsForm.elements.sound.checked = settings.sound;
    settingsForm.elements.volume.value = settings.volume;
    settingsForm.elements.colors.value = settings.colors;
    settingsForm.elements.theme.value = settings.theme;
    settingsForm.elements.btn.value = settings.btn;
    settingsForm.elements.onehand.checked = settings.onehand;
    settingsForm.elements.contrast.checked = settings.contrast;
    settingsForm.elements.calm.checked = settings.calm;
    settingsForm.elements.mole.checked = settings.mole !== false;
    settingsForm.elements.lisible.checked = settings.lisible;
    settingsForm.elements.season.checked = settings.season !== false;
    settingsForm.querySelectorAll('input[name=theme]').forEach((i) => (i.disabled = settings.lisible));
    $('beta-box').hidden = !(app.me && app.me.isAdmin);
    $('refonte-box').hidden = $('beta-box').hidden;
    for (const name of REFONTE_FLAGS) settingsForm.elements[name].checked = !!settings[name];
    const drillBox = $('refonte-drill16');
    if (drillBox.children.length === 1) {
      for (const m of Drills16.MODELS) drillBox.append(el('label', {}, el('input', { type: 'radio', name: 'betaDrill16', value: m.id }), ` ${m.nom}${m.quand ? ` (${m.quand})` : ''}`));
    }
    settingsForm.elements.betaDrill16.value = settings.betaDrill16 || '';
    renderVersions();
    for (const name of BETA_FLAGS) settingsForm.elements[name].checked = !!settings[name];
    $('lab-box').hidden = !app.me;
    for (const name of LAB_FLAGS) settingsForm.elements[name].checked = !!settings[name];
    settingsForm.elements.labMusic.value = settings.labMusic || '';
    renderInstall();
    $('settings').showModal();
  });
  /** Boutons « Version de telle date » : un toucher règle d'un coup toutes les cases de l'interface. */
  function currentVersion() {
    return VERSIONS.find((v) => BETA_FLAGS.every((f) => !!settings[f] === !!v.flags[f])) || null;
  }
  function renderVersions() {
    const active = currentVersion();
    $('version-list').replaceChildren(
      ...VERSIONS.map((v) => {
        const on = !!active && active.id === v.id;
        const button = el('button', { class: `btn${on ? '' : ' secondary'} version-btn`, type: 'button', 'aria-pressed': String(on) }, el('strong', {}, v.label), el('span', {}, v.hint));
        button.addEventListener('click', () => {
          Object.assign(settings, v.flags);
          for (const name of BETA_FLAGS) settingsForm.elements[name].checked = !!settings[name];
          applySettings();
          saveSettings();
          renderVersions();
        });
        return button;
      }),
      ...(active ? [] : [el('p', { class: 'hint' }, 'Réglage personnalisé (voir le réglage détaillé).')]),
    );
  }

  settingsForm.addEventListener('input', () => {
    const colors = settings.colors;
    settings.text = settingsForm.elements.text.value || 'normal';
    settings.sound = settingsForm.elements.sound.checked;
    settings.volume = Number(settingsForm.elements.volume.value);
    settings.colors = settingsForm.elements.colors.value || 'normal';
    settings.theme = settingsForm.elements.theme.value || 'sombre';
    settings.btn = settingsForm.elements.btn.value || 'normal';
    settings.onehand = settingsForm.elements.onehand.checked;
    settings.contrast = settingsForm.elements.contrast.checked;
    settings.calm = settingsForm.elements.calm.checked;
    settings.mole = settingsForm.elements.mole.checked;
    settings.lisible = settingsForm.elements.lisible.checked;
    settings.season = settingsForm.elements.season.checked;
    for (const name of BETA_FLAGS) settings[name] = settingsForm.elements[name].checked;
    for (const name of REFONTE_FLAGS) settings[name] = settingsForm.elements[name].checked;
    settings.betaDrill16 = settingsForm.elements.betaDrill16.value || '';
    for (const name of LAB_FLAGS) settings[name] = settingsForm.elements[name].checked;
    settings.labMusic = settingsForm.elements.labMusic.value || '';
    settingsForm.querySelectorAll('input[name=theme]').forEach((i) => (i.disabled = settings.lisible));
    applySettings();
    saveSettings();
    fitCanvas();
    if (!$('beta-box').hidden) renderVersions();
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
    // Forage sans cadre (galerie vivante) : la coupe remplit tout l'écran, derrière l'interface.
    const frameless = galerieOn() && (app.view === 'game' || app.view === 'results');
    document.documentElement.toggleAttribute('data-frameless', frameless);
    scene.focus = frameless ? 0.62 : 0.6;
    if (frameless) {
      const scale = window.innerWidth / Pixel.WIDTH;
      scene.setViewHeight(window.innerHeight / scale, 480);
      canvas.style.width = '100vw';
      canvas.style.height = '100vh';
      return;
    }
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
      // Dès le premier échec, un bandeau explique l'attente (mise à jour en cours, réseau coupé…) au lieu d'un écran figé.
      showConnection(true, attempt);
      await sleep(RETRY_DELAYS[attempt]);
    }
    showConnection(false);
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

  /** Bandeau « on réessaie » pendant les nouvelles tentatives ; navigator.onLine distingue réseau coupé et mise à jour du jeu. */
  function showConnection(on, attempt = 0) {
    const banner = $('conn-banner');
    if (!banner) return;
    banner.hidden = !on;
    if (on) $('conn-text').textContent = navigator.onLine === false ? 'Plus de réseau : on réessaie dès que ça revient…' : attempt >= 2 ? 'Le jeu redémarre pour une mise à jour : on réessaie…' : 'Connexion difficile : on réessaie…';
  }

  // Erreurs du navigateur (bouton sans effet, écran figé…) : envoyées au journal du responsable, quelques-unes par visite.
  let reportedErrors = 0;
  function reportClientError(message, detail) {
    if (reportedErrors >= 5) return;
    reportedErrors++;
    const view = [...document.querySelectorAll('.view')].find((v) => !v.hidden);
    fetch('/api/client-error', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: String(message || 'Erreur').slice(0, 300), detail: String(detail || '').slice(0, 1500), view: view ? view.id : null }),
    }).catch(() => {});
  }
  window.addEventListener('error', (e) => reportClientError(e.message, `${e.filename || ''}:${e.lineno || 0}:${e.colno || 0}\n${e.error && e.error.stack ? e.error.stack : ''}`));
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    if (reason && reason.status !== undefined) return; // erreur d'appel au serveur déjà montrée au joueur
    reportClientError(reason && reason.message ? reason.message : String(reason), reason && reason.stack);
  });

  // Message passager (remplace les fenêtres d'alerte, qui bloquent la page).
  let noticeTimer = null;
  function showNotice(text) {
    const box = $('notice');
    box.textContent = warm(text);
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

  // En quittant le profil ou la zone du responsable, leurs sections repliables se referment d'elles-mêmes.
  const AUTO_CLOSE_VIEWS = ['profile', 'admin'];
  function closeFoldsOfLeftView(view) {
    for (const id of AUTO_CLOSE_VIEWS) {
      const section = $(`view-${id}`);
      if (id === view || !section || section.hidden) continue;
      section.querySelectorAll('details[open]').forEach((d) => (d.open = false));
    }
  }

  // Mesure d'audience : chaque changement d'écran compte comme une page vue (nom de l'écran seulement).
  let trackedView = null;
  function trackView(view) {
    if (view === trackedView) return;
    const first = trackedView === null;
    trackedView = view;
    if (first || !window._paq) return; // la première page vue est envoyée au chargement
    window._paq.push(['setCustomUrl', `/${view}`]);
    window._paq.push(['setDocumentTitle', view]);
    window._paq.push(['trackPageView']);
  }

  /**
   * Rafraîchit les pastilles de l'onglet « Mine » (journal et musée) : au retour sur l'application, en changeant d'écran et à la fin
   * d'un forage ou d'un duel, sans minuterie. `force` ignore le délai de 20 secondes entre deux rafraîchissements.
   */
  let mineRefreshedAt = 0;
  function refreshMine(force = false) {
    if (!app.me || document.hidden) return;
    const now = Date.now();
    if (!force && now - mineRefreshedAt < 20000) return;
    mineRefreshedAt = now;
    loadFeed();
    loadMuseumNote();
  }
  document.addEventListener('visibilitychange', () => {
    refreshMine();
    syncSoftRefresh();
  });

  /**
   * Rafraîchissement doux : tant que l'accueil est affiché et l'onglet visible, une mise à jour discrète par minute
   * (pastilles, vie de la mine, messages). Le minuteur s'arrête dès qu'on quitte l'accueil ou que l'onglet passe en arrière-plan.
   */
  let softTimer = null;
  function syncSoftRefresh() {
    const on = !!(app.me && app.view === 'home' && !document.hidden);
    if (on && !softTimer) {
      softTimer = setInterval(async () => {
        if (document.hidden || app.view !== 'home') return syncSoftRefresh();
        refreshMine(true);
        renderBetaSocial();
        try {
          const { unread } = await api('/api/messages');
          updateMessageDot(unread);
        } catch {
          /* le prochain tour réessaiera */
        }
      }, 60000);
    } else if (!on && softTimer) {
      clearInterval(softTimer);
      softTimer = null;
    }
  }

  /** Ambiance sonore de l'accueil (labo du responsable) : seulement sur l'accueil, onglet visible, son activé. */
  function syncAmbient() {
    const on = !!(app.me && app.view === 'home' && !document.hidden && settings.sound && (AMBIENT_FLAGS.some((f) => settings[f]) || settings.labMusic));
    const key = on ? [...AMBIENT_FLAGS.map((f) => settings[f]), settings.labMusic].join() : '';
    if (key === ambientKey) return;
    ambientKey = key;
    if (on) Sound.ambient({ taps: settings.labTaps, rumble: settings.labRumble, music: settings.labMusic || null });
    else Sound.ambientStop();
  }
  document.addEventListener('visibilitychange', syncAmbient);

  /**
   * Ambiance sonore : petits bruits de bouton. Onglets majeurs (barre du bas) et mineurs (onglets dans un écran),
   * puis les boutons du forage et des duels.
   */
  document.addEventListener(
    'click',
    (event) => {
      if (!app.me || !settings.sound || !event.target.closest) return;
      const target = event.target.closest('button, .tab');
      if (!target || target.disabled) return;
      if (son16On()) {
        const nav = target.closest('#bottom-nav button, button[data-centre]');
        if (nav) return Sound.nav([...nav.parentNode.children].indexOf(nav));
      }
      if (settings.labTabs) {
        if (target.closest('#bottom-nav')) return Sound.click('tab');
        if (target.matches('.tab, [role="tab"]') || target.closest('.mini-tabs, .pf-tabs, .wr-tabs, #period-tabs')) return Sound.click('subtab');
      }
      if (settings.labClicks && target.closest('#view-game, #view-duel, #duel-lists, #mode-dialog, #play-sheet-body, #view-results')) return Sound.click('press');
    },
    true,
  );

  function show(view) {
    trackView(view);
    closeFoldsOfLeftView(view);
    document.querySelectorAll('.view').forEach((v) => (v.hidden = v.id !== `view-${view}`));
    // Sur téléphone, la scène de forage ne sert qu'en partie et dans les résultats : pas sur l'accueil.
    $('stage').hidden = (view === 'podium' || view === 'profile' || view === 'home' || view === 'recap' || view === 'duel' || view === 'admin' || view === 'museum' || view === 'messages') && window.innerWidth < 860;
    if (view === 'profile') startPreview();
    if (view !== 'game') $('focus-keeper').blur();
    updateBanner();
    $('who').hidden = !app.me;
    $('btn-messages').hidden = !app.me;
    $('btn-invite').hidden = !app.me;
    $('drawer-tab').hidden = !(view === 'home' && app.me);
    app.view = view;
    syncSoftRefresh();
    if (view !== 'museum') {
      setMinePastilles();
      if (view !== 'game') refreshMine();
    }
    updateNav();
    syncAmbient();
    if ($('drawer').open) $('drawer').close();
    if ($('play-sheet').open) $('play-sheet').close(); // un duel lancé depuis la feuille « Jouer » ouvre le forage : la feuille se referme
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

  /** Couches du forage dans la scène ; dans les galeries 16-bit, chaque forage a aussi son propre décor. */
  function sceneLayers(state, animate) {
    scene.setSeed(state && state.id);
    scene.setLayers(layersOf(state), animate);
  }

  function layersOf(state) {
    return state.rounds.filter((r) => r.status === 'done' && r.tier).map((r) => ({ points: r.points, tier: r.tier.id }));
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
  // Le code d'invitation n'est demandé que si le responsable en a défini un.
  function refreshSignupInfo() {
    api('/api/signup-info')
      .then((info) => ($('invite-field').hidden = !info.inviteRequired))
      .catch(() => {});
  }
  refreshSignupInfo();
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

  bindForm('form-signup', async ({ username, password, confirm, inviteCode }, form) => {
    if (password !== confirm) throw new Error('Les deux mots de passe ne correspondent pas.');
    const data = await api('/api/signup', { username, password, inviteCode });
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

  // ---------- Petit tutoriel (première connexion) ----------
  const TIERS_TUTO = [
    ['evident', 'Gravier', '10 à 20 pts', 'tout le monde y pense'],
    ['courant', 'Soufre', '20 à 40 pts', 'une réponse courante'],
    ['original', 'Cuivre', '40 à 60 pts', 'une réponse originale'],
    ['rare', 'Rubis', '60 à 90 pts', 'très peu de joueurs y pensent'],
    ['pepite', 'Pépite !', '100 pts', 'personne ne l\'avait encore trouvée'],
  ];
  const tutoIcon = (name, size = 48) => {
    const c = el('canvas', { width: '16', height: '16', 'aria-hidden': 'true' });
    Icons.drawIcon(c, name);
    c.style.width = `${size}px`;
    c.style.height = `${size}px`;
    return c;
  };
  const SLIDES = [
    {
      title: 'Bienvenue dans la mine !',
      art: () => {
        const mole = el('canvas', { class: 'tuto-mole', width: '16', height: '16', 'aria-hidden': 'true' });
        drawMascot(mole, 'happy');
        return el('div', { class: 'tuto-art-row' }, mole, tutoIcon('pioche', 64));
      },
      body: () => [
        el('p', {}, 'Chaque jour, tu creuses le plus profond possible en répondant à ', el('strong', {}, '7 thèmes'), '.'),
        el('p', {}, 'Plus tu marques de points, plus ta foreuse descend à travers les couches de la Terre, jusqu\'au centre.'),
      ],
    },
    {
      title: 'Trouve la réponse la moins probable',
      art: () => el('div', { class: 'tuto-ladder' }, ...TIERS_TUTO.map(([id, label, points, hint]) => {
        const chip = el('span', { class: 'tuto-chip' });
        chip.style.background = Pixel.TIER_COLORS[id];
        return el('div', { class: 'tuto-rung' }, chip, el('strong', {}, label), el('span', { class: 'tuto-points' }, points), el('span', { class: 'muted small' }, hint));
      })),
      body: () => [
        el('p', {}, 'Pour chaque thème, par exemple « Un fruit rouge », donne une réponse correcte. Mais ne choisis pas la plus évidente : ', el('strong', {}, 'moins il y a de joueurs qui y pensent, plus tu gagnes de points'), '.'),
        el('p', { class: 'muted' }, 'Fraise ? Tout le monde y pense. Airelle ? Beaucoup moins !'),
      ],
    },
    {
      title: 'Le forage du jour',
      art: () => {
        const dots = el('div', { class: 'tuto-dots7' }, ...Array.from({ length: 7 }, () => (() => { const d = el('span', { class: 'tuto-dot7' }); d.addEventListener('click', () => Sound.click('valid')); return d; })()));
        return el('div', { class: 'tuto-art-col' }, dots, el('div', { class: 'tuto-timer' }, el('strong', {}, '30'), el('span', { class: 'muted' }, ' secondes par thème')));
      },
      body: () => [
        el('p', {}, 'Chaque jour, tous les joueurs reçoivent ', el('strong', {}, 'les mêmes 7 thèmes'), ', avec ', el('strong', {}, '30 secondes'), ' pour répondre à chacun. Une seule partie par jour.'),
        el('p', {}, 'Les nouveaux thèmes arrivent à 2 h du matin. Compare ton score à celui des autres sur le podium !'),
      ],
    },
    {
      title: 'Duel et mode infini',
      art: () => el('div', { class: 'tuto-art-row' }, el('div', { class: 'tuto-mode' }, tutoIcon('sabre', 56), el('strong', {}, 'Duel')), el('div', { class: 'tuto-mode' }, tutoIcon('lampe', 56), el('strong', {}, 'Infini'))),
      body: () => [
        el('p', {}, el('strong', {}, 'Duel : '), 'défie un joueur sur 7 thèmes. Chacun joue quand il veut, et le résultat est dévoilé le lendemain matin.'),
        el('p', {}, el('strong', {}, 'Infini : '), 'des thèmes au hasard, autant que tu veux, pour t\'entraîner. Ça ne compte pas pour le podium.'),
        el('p', { class: 'muted' }, 'Chacun des deux existe en deux versions : ', el('strong', {}, 'Standard'), ' (30 secondes par thème) ou ', el('strong', {}, 'À l\'aise'), ' (sans chrono).'),
      ],
    },
    {
      title: 'À toi de jouer !',
      art: () => {
        const mole = el('canvas', { class: 'tuto-mole', width: '16', height: '16', 'aria-hidden': 'true' });
        drawMascot(mole, 'idle');
        return el('div', { class: 'tuto-art-row' }, mole, tutoIcon('diamant', 64));
      },
      body: () => [
        el('p', {}, 'Tape ta réponse sans te soucier des accents ni des petites fautes : si elle ressemble à une réponse connue, le jeu te la propose.'),
        el('p', {}, 'Réponse refusée alors que tu la crois juste ? Tu peux la signaler, et réessayer tant que le chrono tourne.'),
        el('p', {}, el('strong', {}, 'Bon forage, mineur !')),
      ],
    },
  ];
  const tuto = { index: 0, first: false };

  function renderTutorial() {
    const slide = SLIDES[tuto.index];
    $('tuto-title').textContent = slide.title;
    $('tuto-art').replaceChildren(slide.art());
    $('tuto-body').replaceChildren(...slide.body());
    $('tuto-dots').replaceChildren(
      ...SLIDES.map((_, i) => {
        const pip = el('span', { class: `tuto-pip${i === tuto.index ? ' on' : ''}` });
        pip.addEventListener('click', () => {
          Sound.click('valid');
          if (i === tuto.index) return;
          tuto.index = i;
          renderTutorial();
        });
        return pip;
      }),
    );
    $('tuto-prev').hidden = tuto.index === 0;
    const last = tuto.index === SLIDES.length - 1;
    $('tuto-next').textContent = last ? 'C\'est parti !' : 'Suivant ›';
    $('tuto-skip').hidden = last;
  }
  function openTutorial(first = false) {
    tuto.index = 0;
    tuto.first = first;
    renderTutorial();
    if (!$('tutorial').open) $('tutorial').showModal();
  }
  function closeTutorial() {
    if ($('tutorial').open) $('tutorial').close();
    if (tuto.first && app.me && !app.me.tutorialSeen) {
      app.me.tutorialSeen = true;
      api('/api/tutorial/seen', {}).catch(() => {});
    }
    tuto.first = false;
  }
  $('tuto-next').addEventListener('click', () => {
    Sound.click('valid');
    if (tuto.index >= SLIDES.length - 1) return closeTutorial();
    tuto.index++;
    renderTutorial();
  });
  $('tuto-prev').addEventListener('click', () => {
    if (tuto.index > 0) tuto.index--;
    renderTutorial();
  });
  $('tuto-skip').addEventListener('click', closeTutorial);
  $('tutorial').addEventListener('cancel', (event) => {
    event.preventDefault();
    closeTutorial();
  });
  $('tutorial').addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') $('tuto-next').click();
    else if (event.key === 'ArrowLeft' && tuto.index > 0) $('tuto-prev').click();
  });
  $('btn-tuto-again').addEventListener('click', () => {
    $('settings').close();
    openTutorial(false);
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
    applySeason();
    applySettings();
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
    updateMessageDot(app.me.unreadMessages || 0);
    if (app.me.celebrations && app.me.celebrations.length) openCelebrations(app.me.celebrations);
    if (!app.me.tutorialSeen) openTutorial(true);
  }

  async function loadCarnetSummary() {
    $('carnet-dot').hidden = !app.me.unseenBadges;
    $('report-banner').hidden = !app.me.unreadReports;
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
    renderAnnouncements();
    renderInstallNudge();
    renderNews();
    const today = app.me.today;
    $('today-date').textContent = formatDay(today.day, { weekday: 'long', day: 'numeric', month: 'long' });
    const status = $('today-status');
    status.replaceChildren();
    const button = $('btn-daily');
    if (!today.gameId) {
      if (!galerieOn()) status.append(el('p', {}, '7 thèmes t\'attendent. Prêt à creuser ?'));
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
        .then((state) => sceneLayers(state, false))
        .catch(() => {});
    }
    renderStreak();
    renderBetaHello();
    renderBetaSocial();
    updateNav();
    renderDuelDot();
    renderAdminHome();
    loadFeed();
    loadMuseumNote();
    if (!$('mode-duel').hidden) loadDuels();
    updateCountdown();
  }

  // ---------- Bêta : mascotte, ambiance, navigation, vie de la mine, textes ----------
  // La taupe mineuse : 16 × 16 pixels, trois humeurs (éveillée, yeux fermés pour le clin d'œil, endormie).
  const MOLE_COLORS = { z: '#9fe8ff', o: '#1b1410', b: '#8a5a32', d: '#5d3a1e', p: '#f0a0a0', h: '#f2c230', H: '#a77f12', w: '#ffffff', k: '#1b1410', l: '#fff4b0', c: '#e8d8b0' };
  const MOLE = [
    '....oooooooo....',
    '...ohhhhhhhhHo..',
    '..ohhhhllhhhhHo.',
    '..oHHHHHHHHHHHo.',
    '...obbbbbbbbbo..',
    '..obbwwbbbbwwbo.',
    '..obbwkbbbbwkbo.',
    '..obbbbbppbbbbo.',
    '..obbbbkkkkbbbo.',
    '...obbbbbbbbbo..',
    '..ocbbbbbbbbbco.',
    '..ocbbbbbbbbbco.',
    '...obbbbbbbbbo..',
    '...oddbbbbbddo..',
    '....oddoooddo...',
    '................',
  ];
  const OX = 4; // la taupe occupe les colonnes 4 à 19 d'un canevas de 24 × 16 ; les outils dépassent de chaque côté
  function drawMascot(canvas, mood, gaze, prop) {
    if (mole16On()) return Mole16.draw(canvas, mood, gaze, prop);
    canvas.width = 24;
    canvas.height = 16;
    const rows = MOLE.map((r) => r.split(''));
    const set = (y, x, ch) => { if (rows[y] && x >= 0 && x < 16) rows[y][x] = ch; };
    if (mood === 'blink' || mood === 'sleep') {
      for (const y of [5, 6]) for (const x of [5, 6, 11, 12]) set(y, x, 'b');
      for (const x of [5, 6, 11, 12]) set(6, x, 'k');
    }
    if (mood === 'look') for (const x of [6, 12]) { set(5, x, 'w'); set(6, x, 'k'); set(6, x - 1, 'w'); }
    if (mood === 'happy') {
      for (const x of [7, 8, 9]) set(7, x, 'p');
      for (const x of [6, 7, 8, 9, 10]) set(8, x, 'k');
      set(7, 4, 'p'); set(7, 13, 'p');
    }
    if (mood === 'sad') {
      // Sourcils tombants, paupière à moitié baissée, bouche en U renversé et une larme.
      for (const x of [5, 6, 11, 12]) set(4, x, 'k');
      for (const x of [5, 6, 11, 12]) set(5, x, 'b');
      for (const x of [7, 8, 9, 10]) set(8, x, 'b');
      set(8, 8, 'k'); set(8, 9, 'k'); set(9, 7, 'k'); set(9, 10, 'k');
      set(7, 4, 'z'); set(8, 4, 'z');
    }
    if (mood === 'stars') {
      // Des étoiles dans les yeux.
      for (const x of [5, 11]) {
        for (const [dy, dx, ch] of [[-1, 0, 'h'], [0, -1, 'h'], [0, 0, 'l'], [0, 1, 'h'], [1, 0, 'h'], [-1, 1, 'l'], [1, 1, 'l']]) set(5 + dy + 0, x + dx, ch);
      }
      for (const x of [7, 8, 9]) set(7, x, 'p');
      for (const x of [6, 7, 8, 9, 10]) set(8, x, 'k');
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 24, 16);
    rows.forEach((row, y) => row.forEach((ch, x) => {
      if (ch === '.') return;
      ctx.fillStyle = MOLE_COLORS[ch];
      ctx.fillRect(x + OX, y, 1, 1);
    }));
  }

  /**
   * La taupe en forage : une bulle et une humeur selon ce qui se passe. Jamais de réaction à la rareté en duel.
   */
  const MOLE_LINES = {
    start: ['Allez, on creuse !', 'Je sens du filon par ici…', 'À toi de jouer, mineur !', 'Mine de rien, ça va être bien !', 'Le casque est vissé, on y va !'],
    wrong: ['Pas de panique, je ne suis pas au bout de mes galeries !', 'Raté… mais ça ne mine pas le moral !', 'Hmm… creuse une autre piste !', 'Gneiss essai ! Mais pas la bonne roche.', 'Un coup de pioche à côté, ça arrive.'],
    confirm: ['Tu y es presque, je le sens !', 'Tu voulais dire ça ? Je te laisse juge.'],
    low: ['Du caillou ordinaire, mais du caillou quand même !', 'Une réponse bien connue… ça rapporte toujours un peu.', 'On a vu plus rare, mais on avance !'],
    mid: ['Joli filon !', 'Pas mal du tout, ça roche !', 'Du bon minerai, bravo !', 'Là, tu creuses profond !'],
    high: ["Quel filon ! C'est du rare !", 'Waouh, je suis taupe-là !', 'Tu as du flair, mineur !', 'Du rubis, ni plus ni moins !'],
    pepite: ["C'est taupissime !!!", "UNE PÉPITE ! Je n'en reviens pas !", 'Tu es au taupe, mineur !', "Du pur diamant… enfin, de l'or !", 'Je vais en faire des taupes-ries de joie !'],
    skip: ['On passe ? Ça arrive, même aux meilleurs mineurs.', 'Pas grave, un autre thème nous attend !'],
    hurry: ['Plus que 5 secondes !', 'Vite, vite, vite !', 'Le chrono file, mineur !'],
    timeout: ['Le chrono a eu raison de nous… la prochaine fois !', 'Trop tard ! Même les taupes ont des journées sans.'],
    duel: ["Réponse enregistrée ! Suspense jusqu'au résultat…", 'Bien joué ! Le contremaître garde le secret.', 'Chut… personne ne sait rien avant demain !'],
  };
  const MOLE_MOODS = { start: 'look', wrong: 'sad', confirm: 'look', low: 'idle', mid: 'happy', high: 'happy', pepite: 'stars', skip: 'sad', timeout: 'sad', duel: 'happy' };
  // Taupe 16 bits : humeur et accessoire propres à chaque situation (la réaction ne dépend jamais de la rareté en duel).
  const MOLE16_LOOKS = {
    start: ['look'], wrong: ['confused', 'question'], confirm: ['think', 'loupe'], low: ['idle'], mid: ['happy'], high: ['cheer', 'confetti'],
    pepite: ['stars', 'confetti'], skip: ['meh'], timeout: ['dizzy', 'dizzy'], duel: ['shh', 'shh'], hurry: ['worry'],
  };
  const moleLast = {};
  /** Fait parler la taupe dans la zone `where` (« prompt » ou « feedback ») ; coupée par le réglage « Mascotte en forage ». */
  function moleSay(where, event) {
    const box = $(`mole-${where}`);
    if (!box) return;
    if (settings.mole === false) {
      box.hidden = true;
      return;
    }
    const lines = MOLE_LINES[event] || [];
    if (!lines.length) return void (box.hidden = true);
    let text = lines[Math.floor(Math.random() * lines.length)];
    if (lines.length > 1 && text === moleLast[event]) text = lines[(lines.indexOf(text) + 1) % lines.length];
    moleLast[event] = text;
    box.hidden = false;
    const look = mole16On() && MOLE16_LOOKS[event];
    drawMascot(box.querySelector('canvas'), look ? look[0] : MOLE_MOODS[event] || 'idle', null, look ? look[1] : null);
    box.querySelector('.bubble').textContent = text;
    box.dataset.mood = MOLE_MOODS[event] || 'idle';
    box.dataset.event = event;
    delete box.dataset.typing;
    box.dataset.where = where;
  }

  // ---------- Taupe 16 bits (essai) : le regard suit le doigt, un toucher la fait réagir ----------
  const moleGaze = { x: 0, y: 0 };
  const POKE_LINES = ['Hihi, ça chatouille !', 'Aïe ! Mon casque !', 'Oui, mineur ?', 'Tu as trouvé mon point faible…', 'On creuse ou on papote ?', 'Pas touche à la lampe !', 'Je ne suis pas un caillou !', 'Encore ? Là, tu me gênes.', 'Toc toc ! C\'est la taupe.'];
  const POKE_MOODS = ['happy', 'sad', 'look', 'happy', 'look', 'sad', 'happy', 'sad', 'happy'];
  /** Relance une animation CSS d'une classe sur l'élément (retire, force le calcul, remet). */
  function replayClass(node, name) {
    node.classList.remove(name);
    void node.offsetWidth;
    node.classList.add(name);
  }
  /** Redessine la taupe d'accueil / de profil avec une humeur et un regard donnés. */
  function moleRedraw(mascot, mood) {
    const open = mascot.querySelector('.m-open');
    if (open) drawMascot(open, mood, moleGaze);
  }
  function molePoke(mascot) {
    if (!mole16On()) return;
    app.molePokes = (app.molePokes || 0) + 1;
    const sleeping = mascot.dataset.mood === 'sleep';
    if (!mascot.dataset.base) mascot.dataset.base = mascot.dataset.mood || 'idle';
    let i = app.molePokes % POKE_LINES.length;
    let mood = POKE_MOODS[i];
    let text = POKE_LINES[i];
    if (sleeping) { mood = 'look'; text = 'Hein ? Quoi ? Je ne dormais pas !'; }
    else if (app.molePokes % 10 === 0) { mood = 'stars'; text = 'Tu es mon mineur préféré !'; }
    mascot.dataset.mood = mood === 'happy' || mood === 'stars' ? 'happy' : mood;
    moleRedraw(mascot, mood);
    replayClass(mascot, 'poked');
    if (son16On()) Sound.mole(sleeping ? 'wake' : mood);
    else Sound.click('valid');
    let say = mascot.querySelector('.m-say');
    if (!say) { say = el('span', { class: 'm-say', 'aria-hidden': 'true' }); mascot.append(say); }
    say.textContent = text;
    say.hidden = false;
    clearTimeout(mascot.pokeTimer);
    mascot.pokeTimer = setTimeout(() => {
      say.hidden = true;
      mascot.dataset.mood = mascot.dataset.base;
      moleRedraw(mascot, mascot.dataset.base);
    }, 2400);
  }
  function initMole16() {
    let frame = 0;
    document.addEventListener('pointermove', (e) => {
      if (!mole16On() || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        for (const mascot of document.querySelectorAll('.beta-mascot')) {
          const rect = mascot.getBoundingClientRect();
          if (!rect.width || mascot.dataset.mood === 'sleep' || mascot.querySelector('.m-say:not([hidden])')) continue;
          const dx = e.clientX - (rect.left + rect.width / 2);
          const dy = e.clientY - (rect.top + rect.height / 2);
          const gx = dx > 50 ? 1 : dx < -50 ? -1 : 0;
          const gy = dy > 40 ? 1 : 0;
          if (gx === moleGaze.x && gy === moleGaze.y) return;
          moleGaze.x = gx;
          moleGaze.y = gy;
          for (const m of document.querySelectorAll('.beta-mascot')) if (m.dataset.mood !== 'sleep') moleRedraw(m, m.dataset.base || m.dataset.mood);
          return;
        }
      });
    });
    document.addEventListener('click', (e) => {
      if (!mole16On()) return;
      const mascot = e.target.closest && e.target.closest('.beta-mascot');
      if (mascot) return void molePoke(mascot);
      const box = e.target.closest && e.target.closest('.game-mole');
      if (box && box.dataset.event) {
        replayClass(box, 'poked');
        moleSay(box.dataset.where, box.dataset.event);
      }
    });
  }
  const moleEventFor = (tierId) => ({ evident: 'low', courant: 'low', original: 'mid', rare: 'high', pepite: 'pepite', skip: 'skip', timeout: 'timeout' })[tierId] || 'low';

  // Outils de la taupe : motifs posés sur le canevas de 24 × 16, au-dessus de la taupe.
  const TOOL_COLORS = { k: '#1b1410', n: '#8a5a2b', S: '#c9ccd3', s: '#7d7d86', y: '#f2c230', Y: '#a77f12', W: '#fff6b0', f: '#ff9a2e', r: '#d9342b', R: '#8f1f19', c: '#9fe8ff', B: '#5ec8f0', w: '#ffffff', e: '#ece4cf', p: '#f3e9d2', P: '#b8a68a', g: '#5fa83a', t: '#c9a36b', h: '#e8d8b0' };
  function stamp(ctx, x, y, rows) {
    rows.forEach((row, dy) => [...row].forEach((ch, dx) => {
      if (ch === '.') return;
      ctx.fillStyle = TOOL_COLORS[ch];
      ctx.fillRect(x + dx, y + dy, 1, 1);
    }));
  }
  const hand = (ctx, x, y) => stamp(ctx, x, y, ['kh', 'hh']);
  function plan(ctx) {
    stamp(ctx, 5, 9, ['kkkkkkkkkkkkkk', 'kPPPPPppppppPk', 'kpppnnpppprprk', 'kpppppnnpprrpk', 'kpPPpppnnrprPk', 'kkkkkkkkkkkkkk']);
    hand(ctx, 6, 9);
    hand(ctx, 16, 9);
  }
  // Chaque activité : une phrase de la taupe, un dessin et une animation douce (classe CSS).
  const ACTIVITIES = {
    pioche: {
      say: 'Encore un petit coup de pioche !',
      anim: 'swing',
      draw(ctx) {
        stamp(ctx, 13, 1, ['..kkkkkkk...', '.kSSSSSSSk..', 'kSk..kn.kSk.', 'kk...kn..kk.', '.....kn.....', '.....kn.....', '.....kn.....', '.....kn.....', '.....kn.....', '.....kn.....', '.....kk.....']);
        hand(ctx, 17, 9);
      },
    },
    lanterne: {
      say: 'Ma lanterne éclaire le chemin.',
      anim: 'glow',
      draw(ctx) {
        stamp(ctx, 1, 8, ['..kk..', '.k..k.', 'ksssSk', 'kyWWyk', 'kWWWWk', 'kyWWyk', 'ksssSk']);
        hand(ctx, 6, 9);
      },
    },
    plan: { say: 'Je vérifie le plan de la galerie…', anim: 'bob', mood: 'look', draw: plan },
    cafe: {
      say: 'Pause café avant de redescendre.',
      anim: 'bob',
      draw(ctx) {
        stamp(ctx, 18, 3, ['.e.', 'e..', '.e.']);
        stamp(ctx, 16, 7, ['knnnnk..', 'keeeek..', 'keeeekkk', 'keeeek.k', 'keeeekkk', 'kkkkkk..']);
        hand(ctx, 15, 10);
      },
    },
    diamant: {
      say: 'Regarde ce que j\'ai trouvé !',
      anim: 'sparkle',
      mood: 'happy',
      draw(ctx) {
        stamp(ctx, 17, 6, ['.kkkkk.', 'kcwccBk', 'kkkkkkk', '.kcccBk', '..kcBk.', '...kk..']);
        stamp(ctx, 22, 3, ['.w.', 'www', '.w.']);
        hand(ctx, 16, 10);
      },
    },
    wagonnet: {
      say: 'Je remonte le minerai du jour.',
      anim: 'roll',
      draw(ctx) {
        stamp(ctx, 0, 9, ['..yyYyyYy...', '.yyyyyyyyyy.', 'kkkkkkkkkkkk', 'kSSSSSSSSSSk', '.ksssssssssk', '..kkk..kkk..']);
        hand(ctx, 6, 10);
      },
    },
    dynamite: {
      say: 'Reculez… un tout petit boum !',
      anim: 'flicker',
      draw(ctx) {
        stamp(ctx, 19, 5, ['..yf', '.kk.', 'kRRk', 'krrk', 'krrk', 'krrk', 'kRRk', '.kk.']);
        hand(ctx, 17, 10);
      },
    },
    carnet: {
      say: 'Je note les trouvailles du jour.',
      anim: 'scribble',
      mood: 'look',
      draw(ctx) {
        stamp(ctx, 1, 8, ['kkkkkk', 'kppppk', 'kpPPpk', 'kppppk', 'kpPPpk', 'kppppk', 'kkkkkk']);
        stamp(ctx, 18, 7, ['..yr', '.yy.', 'yy..', 'k...']);
        hand(ctx, 6, 10);
        hand(ctx, 16, 9);
      },
    },
    sandwich: {
      say: 'Un petit casse-croûte, ça creuse !',
      anim: 'bob',
      mood: 'happy',
      draw(ctx) {
        stamp(ctx, 17, 6, ['.tttt.', 'tggggt', 'trrrrt', 'tggggt', '.tttt.']);
        hand(ctx, 16, 10);
      },
    },
    sieste: { say: 'Zzz… la mine dort.', anim: '', mood: 'sleep', draw() {} },
  };
  const ACTIVITY_KEY = 'speleo-mascot-last';
  /** Une activité différente à chaque ouverture de la page (jamais deux fois de suite la même) ; la nuit, la taupe dort. */
  function pickActivity() {
    if (brusselsHour() < 6) return 'sieste';
    const ids = Object.keys(ACTIVITIES).filter((id) => id !== 'sieste');
    let last = null;
    try { last = localStorage.getItem(ACTIVITY_KEY); } catch { /* sans stockage : au hasard */ }
    const choices = ids.filter((id) => id !== last);
    const id = choices[Math.floor(Math.random() * choices.length)];
    try { localStorage.setItem(ACTIVITY_KEY, id); } catch { /* sans stockage */ }
    return id;
  }
  function drawActivity(canvas, id) {
    const ctx = canvas.getContext('2d');
    canvas.width = 24;
    canvas.height = 16;
    ctx.clearRect(0, 0, 24, 16);
    if (mole16On()) return Mole16.tool(canvas, id);
    ACTIVITIES[id].draw(ctx);
  }

  /** Heure (0 à 23) à Bruxelles. */
  function brusselsHour() {
    const part = new Intl.DateTimeFormat('fr-BE', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Brussels' }).formatToParts(new Date()).find((p) => p.type === 'hour');
    return part ? Number(part.value) : 12;
  }

  /** Moment de la journée (heure de Bruxelles) : teinte douce du décor quand l'ambiance est active. */
  function applyDaypart() {
    const root = document.documentElement;
    if (!betaOn('betaFx')) return void delete root.dataset.daypart;
    const hour = brusselsHour();
    root.dataset.daypart = hour < 6 ? 'nuit' : hour < 12 ? 'matin' : hour < 18 ? 'jour' : hour < 22 ? 'soir' : 'nuit';
    const layer = $('fx-layer');
    if (!layer.childElementCount) {
      for (let i = 0; i < 14; i++) {
        const fly = el('span', { class: 'firefly' });
        fly.style.setProperty('--x', `${Math.round(Math.random() * 100)}%`);
        fly.style.setProperty('--y', `${Math.round(40 + Math.random() * 60)}%`);
        fly.style.setProperty('--d', `${(6 + Math.random() * 8).toFixed(1)}s`);
        fly.style.setProperty('--delay', `${(-Math.random() * 10).toFixed(1)}s`);
        layer.append(fly);
      }
    }
  }

  /** Étincelles autour du résultat d'un thème (rare : quelques-unes ; pépite : une gerbe dorée). */
  function burstSparks(parent, tierId) {
    const count = tierId === 'pepite' ? 22 : tierId === 'rare' ? 12 : 0;
    if (!count || reducedMotion()) return;
    const colors = tierId === 'pepite' ? ['#f2c230', '#fff4b0', '#ffffff', '#7fd8ff'] : ['#f2c230', '#fff4b0'];
    const burst = el('div', { class: 'sparks', 'aria-hidden': 'true' });
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const dist = 50 + Math.random() * 70;
      const spark = el('span', { class: 'spark' });
      spark.style.setProperty('--dx', `${Math.round(Math.cos(angle) * dist)}px`);
      spark.style.setProperty('--dy', `${Math.round(Math.sin(angle) * dist - 20)}px`);
      spark.style.setProperty('--c', colors[i % colors.length]);
      burst.append(spark);
    }
    parent.append(burst);
    setTimeout(() => burst.remove(), 1100);
  }

  /**
   * Récompense renforcée : plusieurs vagues d'étoiles, un éclat doré et un gros « pop » des points pour une pépite ;
   * une vague plus discrète pour une réponse rare. Rien pour les autres (et rien si les animations sont réduites).
   */
  function rewardShower(pane, tierId) {
    if (reducedMotion() || (tierId !== 'pepite' && tierId !== 'rare')) return;
    const big = tierId === 'pepite';
    pane.classList.remove('reward-flash');
    void pane.offsetWidth;
    pane.classList.add('reward-flash');
    const waves = big ? 3 : 1;
    for (let w = 0; w < waves; w++) {
      setTimeout(() => burstSparks(pane, big ? 'pepite' : 'rare'), w * 260);
    }
    if (big) {
      const points = $('feedback-points');
      points.classList.remove('pop-big');
      void points.offsetWidth;
      points.classList.add('pop-big');
    }
  }

  // ---------- Nouvel accueil (bêta) ----------
  /** Déplace un bloc existant (avec ses identifiants et ses écouteurs) vers `target` ; `restore` le remet à sa place d'origine. */
  function relocate(node, target) {
    if (!home.origin.has(node)) home.origin.set(node, { parent: node.parentNode, next: node.nextSibling });
    target.append(node);
  }
  function restore(node) {
    const o = home.origin.get(node);
    if (o && o.parent) o.parent.insertBefore(node, o.next && o.next.parentNode === o.parent ? o.next : null);
  }

  /**
   * Nouvel accueil : le portrait, la lanterne et les étais rejoignent la fiche de la taupe ; le forage du jour passe en deuxième ;
   * le duel et l'infini quittent la page pour la feuille « Jouer » de la barre du bas. Rien n'est recréé : les blocs existants
   * sont déplacés, puis remis en place quand l'option est coupée.
   */
  function layoutHome(on) {
    if (on === home.moved) return;
    home.moved = on;
    const nodes = {
      player: document.querySelector('.home-profile'),
      chips: document.querySelector('.home-chips'),
      note: $('streak-note'),
      tabs: $('mode-tabs'),
      duel: $('mode-duel'),
      training: $('mode-training'),
      feed: $('feed-fold'),
      rules: document.querySelector('#drawer .rules'),
    };
    const title = document.querySelector('.play-card > h2');
    if (on) {
      relocate(nodes.player, $('hero-player'));
      relocate(nodes.chips, $('hero-chips'));
      relocate(nodes.note, $('hero-chips'));
      relocate(nodes.training, $('play-sheet-body'));
      relocate(nodes.duel, $('play-sheet-body'));
      home.texts = home.texts || { duel: nodes.duel.querySelector('p').textContent, training: nodes.training.querySelector('p').textContent };
      nodes.duel.querySelector('p').textContent = 'Défie un joueur sur 7 thèmes. Résultat dévoilé le lendemain matin.';
      nodes.training.querySelector('p').textContent = 'Des thèmes au hasard, sans classement.';
      relocate(nodes.feed, $('mine-journal'));
      relocate(nodes.rules, $('mine-rules'));
      nodes.tabs.hidden = true;
      nodes.duel.hidden = false;
      nodes.training.hidden = false;
      $('mode-daily').hidden = false;
      title.textContent = 'Forage du jour';
    } else {
      for (const key of ['player', 'chips', 'note', 'tabs', 'duel', 'training', 'feed', 'rules']) restore(nodes[key]);
      if (home.texts) {
        nodes.duel.querySelector('p').textContent = home.texts.duel;
        nodes.training.querySelector('p').textContent = home.texts.training;
      }
      nodes.tabs.hidden = false;
      const active = document.querySelector('#mode-tabs .tab.active');
      const mode = active ? active.dataset.mode : 'daily';
      $('mode-daily').hidden = mode !== 'daily';
      nodes.duel.hidden = mode !== 'duel';
      nodes.training.hidden = mode !== 'training';
      title.textContent = 'Jouer';
    }
  }

  /** Icônes en pixel art de la barre du bas (le profil montre la tête du personnage du joueur). */
  const NAV_ICONS = { home: 'maison', play: 'pioche', defis: 'diamant', messages: 'enveloppe', mine: 'pepite', admin: 'bouclier' };
  function drawNavIcons() {
    document.querySelectorAll('#bottom-nav button').forEach((button) => {
      const kind = button.dataset.nav;
      const slot = button.querySelector('.nav-ico');
      if (kind === 'profile') {
        const head = app.me && app.me.avatar ? avatarEl(app.me.avatar, 'head', 2) : null;
        if (head) return void slot.replaceChildren(head);
      }
      const canvas = slot.querySelector('canvas') || el('canvas', { width: '16', height: '16', 'aria-hidden': 'true' });
      if (!canvas.parentNode) slot.replaceChildren(canvas);
      Icons.drawIcon(canvas, NAV_ICONS[kind] || 'lampe');
    });
  }

  /** Pastilles de la barre du bas : un nombre ou un point quand il y a du nouveau dans l'onglet. */
  function setBubble(kind, value) {
    const bubble = document.querySelector(`#bottom-nav [data-nav="${kind}"] .nav-bubble:not(.blue)`);
    if (!bubble) return;
    const n = typeof value === 'number' ? value : value ? 1 : 0;
    bubble.hidden = !n;
    bubble.textContent = typeof value === 'number' && n > 0 ? (n > 9 ? '9+' : String(n)) : '';
    bubble.classList.toggle('dot', typeof value !== 'number');
  }
  function updateBubbles() {
    const me = app.me;
    if (!me) return;
    setBubble('messages', me.unreadMessages || 0);
    setBubble('play', me.today && !me.today.finished ? true : !$('duel-dot').hidden);
    setBubble('profile', me.unseenBadges || 0);
    setBubble('defis', galerieOn() && defisMilestone() > 0);
    // « Mine » : nouvelles pépites au musée, plus les nouvelles du journal (les annonces de pépites y sont déjà comptées au musée).
    // Deux pastilles pour « Mine » : rouge pour les nouvelles du journal, bleue pour les nouvelles pépites du musée.
    setBubble('mine', app.feedNew || 0);
    const blue = document.querySelector('#bottom-nav [data-nav="mine"] .nav-bubble.blue');
    if (blue) {
      blue.hidden = !app.museumNew;
      blue.textContent = app.museumNew > 9 ? '9+' : String(app.museumNew || '');
    }
    setBubble('admin', me.isAdmin ? app.adminPending || 0 : 0);
  }

  /**
   * Défis (essai galerie vivante) : onglet du bas avec une pastille quand un défi commence, atteint 50 % ou est réussi.
   * Palier 0 = rien, 1 = commencé, 2 = à moitié, 3 = réussi (le plus haut des deux défis) ; le palier vu est mémorisé par défi.
   */
  function defisState() {
    const st = app.me && app.me.streak;
    const ch = st && st.challenge;
    const col = app.me && app.me.collective;
    const level = (frac) => (frac >= 1 ? 3 : frac >= 0.5 ? 2 : frac > 0 ? 1 : 0);
    return [
      ch ? { key: `week:${ch.id}`, level: level(ch.progress / ch.goal) } : null,
      col ? { key: `month:${col.month}`, level: level(col.total / col.goal) } : null,
    ].filter(Boolean);
  }
  const DEFIS_KEY = 'speleologie.defisVus';
  function defisVus() {
    try { return JSON.parse(localStorage.getItem(DEFIS_KEY)) || {}; } catch { return {}; }
  }
  const defisMilestone = () => defisState().reduce((n, d) => n + (d.level > (defisVus()[d.key] || 0) ? 1 : 0), 0);
  function markDefisSeen() {
    const seen = defisVus();
    for (const d of defisState()) seen[d.key] = d.level;
    try { localStorage.setItem(DEFIS_KEY, JSON.stringify(seen)); } catch { /* sans stockage */ }
    updateBubbles();
  }
  /** En mode galerie vivante, le bloc des défis quitte l'accueil pour la fenêtre « Défis » du bas. */
  function placeChallenge() {
    const card = $('challenge-card');
    const inSheet = card.parentNode === $('defis-sheet-body');
    if (galerieOn() && !inSheet) {
      card.open = true;
      $('defis-sheet-body').append(card);
    } else if (!galerieOn() && inSheet) {
      document.querySelector('.podium-card').before(card);
    }
  }

  /** Barre du bas : mêmes destinations que sur l'accueil, plus le musée et le journal. */
  function updateNav() {
    const nav = $('bottom-nav');
    if (!nav) return;
    const view = app.view;
    const hiddenViews = ['auth', 'game', 'recap', 'duel'];
    nav.hidden = !((betaOn('betaNav') || betaOn('betaHome')) && app.me && view && !hiddenViews.includes(view));
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('active', (b.dataset.nav === 'home' && view === 'home') || (b.dataset.nav === 'podium' && view === 'podium') || (b.dataset.nav === 'messages' && view === 'messages') || (b.dataset.nav === 'mine' && view === 'museum') || (b.dataset.nav === 'admin' && view === 'admin') || (b.dataset.nav === 'profile' && view === 'profile')));
    nav.querySelector('[data-nav="admin"]').hidden = !(app.me && app.me.isAdmin);
    if (!nav.hidden) {
      drawNavIcons();
      updateBubbles();
    }
  }
  $('bottom-nav').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-nav]');
    if (!button) return;
    const go = button.dataset.nav;
    if (go === 'messages') return openMessages();
    if (go === 'defis') {
      renderCollective();
      renderWeekly();
      $('defis-sheet').showModal();
      if (galerieOn()) flip($('defis-sheet'), button, false);
      return markDefisSeen();
    }
    if (go === 'profile') return $('btn-carnet').click();
    if (go === 'admin') return openAdmin();
    if (go === 'mine') {
      if (betaOn('betaHome')) {
        $('feed-fold').open = true;
        await Promise.all([loadFeed(), loadMuseumNote()]);
      }
      // Ce qui était nouveau reste signalé dans l'écran (pastilles rouge et bleue) jusqu'à ce qu'on le quitte.
      const fresh = { feed: app.feedNew || 0, museum: app.museumNew || 0 };
      await openMuseum();
      setMinePastilles(fresh);
      return markFeedSeen();
    }
    if (go === 'play' && betaOn('betaHome')) {
      if (app.view !== 'home') await goHome();
      loadDuels();
      setVoie('');
      $('play-sheet').showModal();
      document.documentElement.toggleAttribute('data-play-open', galerieOn());
      return Galerie.resetWagon();
    }
    if (app.view !== 'home') await goHome();
    if (go === 'play') document.querySelector('.play-card').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    else window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  });
  $('btn-defis-close').addEventListener('click', () => closeCentre($('defis-sheet')));
  $('defis-sheet').addEventListener('click', (event) => event.target === $('defis-sheet') && closeCentre($('defis-sheet')));

  /*
   * Accueil sans cadre (essai galerie vivante) : le podium et la vie de la mine sont des lignes du fil ; touchées, elles s'ouvrent au centre
   * de l'écran en grandissant depuis leur place, puis y retournent à la fermeture. Le bloc d'origine est déplacé dans la fenêtre, puis remis.
   */
  const CENTRE = { podium: { title: 'Podium', node: () => document.querySelector('.podium-card') }, social: { title: 'Dans la mine', node: () => $('beta-social') } };
  let centreSource = null;
  let centreBack = null;
  function flip(dialog, from, reverse) {
    if (!from || reducedMotion() || !dialog.animate) return null;
    const a = from.getBoundingClientRect();
    const b = dialog.getBoundingClientRect();
    if (!b.width || !b.height) return null;
    const start = { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`, opacity: 0.2, transformOrigin: 'top left' };
    const end = { transform: 'none', opacity: 1, transformOrigin: 'top left' };
    return dialog.animate(reverse ? [end, { ...start, opacity: 0 }] : [start, end], { duration: reverse ? 260 : 380, easing: reverse ? 'cubic-bezier(.4,0,.6,1)' : 'cubic-bezier(.2,.8,.2,1)' });
  }
  function openCentre(kind, from) {
    const spec = CENTRE[kind];
    const node = spec && spec.node();
    if (!node) return;
    centreBack = { node, parent: node.parentNode, next: node.nextSibling, hidden: node.hidden };
    node.hidden = false;
    $('centre-title').textContent = spec.title;
    $('centre-body').replaceChildren(node);
    centreSource = from;
    $('centre-sheet').showModal();
    flip($('centre-sheet'), from, false);
  }
  function closeCentre(dialog) {
    if (!dialog.open) return;
    const from = dialog === $('centre-sheet') ? centreSource : document.querySelector('#bottom-nav [data-nav="defis"]');
    const anim = galerieOn() ? flip(dialog, from, true) : null;
    if (anim) anim.onfinish = () => dialog.close();
    else dialog.close();
  }
  $('centre-sheet').addEventListener('close', () => {
    if (centreBack) {
      centreBack.node.hidden = centreBack.hidden;
      centreBack.parent.insertBefore(centreBack.node, centreBack.next);
      centreBack = null;
    }
    if (centreSource) centreSource.focus();
  });
  $('btn-centre-close').addEventListener('click', () => closeCentre($('centre-sheet')));
  $('centre-sheet').addEventListener('click', (event) => event.target === $('centre-sheet') && closeCentre($('centre-sheet')));
  $('home-feed').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-centre]');
    if (button) openCentre(button.dataset.centre, button);
  });
  /*
   * Départ en wagonnet (essai galerie vivante) : au toucher, le wagonnet file vers la droite, l'accueil glisse avec lui,
   * puis l'écran de forage arrive par la gauche. Sans animation (réglage ou système), le forage démarre tout de suite.
   */
  let departing = false;
  async function departAndPlay(event) {
    if (!galerieOn() || reducedMotion() || app.view !== 'home') return;
    event.stopImmediatePropagation();
    if (departing) return;
    departing = true;
    const home = $('view-home');
    const slide = home.animate ? home.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(60%)', opacity: 0 }], { duration: 520, delay: 180, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }) : null;
    if (son16On()) Sound.wagon(1);
    await Galerie.departWagon();
    if (slide) await slide.finished.catch(() => {});
    await startGame('daily');
    if (slide) slide.cancel();
    departing = false;
    Galerie.resetWagon();
    const layout = document.querySelector('.layout');
    if (app.view !== 'home' && layout.animate) layout.animate([{ transform: 'translateX(-45%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  $('btn-daily').addEventListener('click', departAndPlay, true);
  $('wagon').addEventListener('click', () => $('btn-daily').click());
  Galerie.mountWagon($('wagon'));
  /*
   * Aiguillage de « Jouer » (galerie vivante) : le wagonnet part à droite vers le forage du jour, à gauche vers le duel ou l'illimité ;
   * l'écran glisse dans le même sens, et le bouton de retour ramène à l'aiguillage.
   */
  Galerie.mountWagon($('switch'), 'switch');
  /** '' : l'aiguillage ; 'duel' ou 'training' : le panneau de ce mode. Hors galerie vivante, la feuille montre les deux modes. */
  function setVoie(voie) {
    const on = galerieOn();
    $('play-sheet').dataset.voie = on ? voie : '';
    $('aiguillage').hidden = !on || !!voie;
    $('btn-voie-back').hidden = !on || !voie;
    $('play-sheet-body').hidden = on && !voie;
    $('mode-duel').hidden = on && voie !== 'duel';
    $('mode-training').hidden = on && voie !== 'training';
    $('voie-duel-dot').hidden = $('duel-dot').hidden;
    $('play-sheet').querySelector('.drawer-head h2').textContent = { duel: 'Duel', training: 'Illimité' }[on && voie] || 'Jouer';
  }
  const slideIn = (el, from) => el.animate && !reducedMotion() ? el.animate([{ transform: `translateX(${from})`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' }).finished.catch(() => {}) : Promise.resolve();
  let switching = false;
  document.querySelectorAll('[data-voie]').forEach((button) =>
    button.addEventListener('click', async () => {
      if (switching) return;
      switching = true;
      const voie = button.dataset.voie;
      const calm = reducedMotion();
      if (voie === 'daily') {
        if (!calm) await Galerie.departWagon(1, $('switch'));
        $('play-sheet').close();
        switching = false;
        await startGame('daily');
        if (app.view !== 'home') slideIn(document.querySelector('.layout'), '-45%');
        return;
      }
      if (!calm) await Galerie.departWagon(-1, $('switch'));
      setVoie(voie);
      if (voie === 'duel') loadDuels();
      await slideIn($('play-sheet-body'), '45%');
      switching = false;
    }),
  );
  $('play-sheet').addEventListener('close', () => document.documentElement.removeAttribute('data-play-open'));
  $('btn-voie-back').addEventListener('click', async () => {
    setVoie('');
    Galerie.resetWagon();
    await slideIn($('aiguillage'), '-45%');
  });
  $('btn-sheet-close').addEventListener('click', () => $('play-sheet').close());
  $('play-sheet').addEventListener('click', (event) => {
    if (event.target === $('play-sheet')) return $('play-sheet').close();
    const button = event.target.closest('button.btn');
    if (button && button.id !== 'btn-duel-new' && button.id !== 'btn-voie-back') $('play-sheet').close();
  });

  /** La vie de la mine : combien de mineurs ont foré aujourd'hui, les derniers forages terminés et leurs pépites. */
  async function renderBetaSocial() {
    const card = $('beta-social');
    card.hidden = !((betaOn('betaSocial') || betaOn('betaHome')) && app.me && app.me.today);
    const feedRow = document.querySelector('#home-feed [data-centre="social"]');
    feedRow.hidden = card.hidden;
    if (card.hidden) return;
    try {
      const mine = await api('/api/mine-today');
      $('feed-social-text').textContent = mine.started ? `${plural(mine.started, 'mineur', 'mineurs')} aujourd'hui` : 'encore calme';
      const text = $('beta-social-text');
      if (!mine.started) text.textContent = 'La mine est encore silencieuse : tu pourrais être le premier à descendre aujourd\'hui !';
      else text.textContent = `${plural(mine.started, 'mineur est descendu', 'mineurs sont descendus')} aujourd'hui, ${mine.finished} ${mine.finished > 1 ? 'ont fini' : 'a fini'} leur forage.`;
      $('beta-social-list').replaceChildren(
        ...mine.recent.map((r) => {
          const gem = r.pepites
            ? el('span', { class: 'gem' }, (() => { const c = el('canvas', { width: '16', height: '16', 'aria-hidden': 'true' }); Icons.drawIcon(c, 'pepite'); return c; })(), el('span', {}, r.pepites > 1 ? `${r.pepites} pépites !` : 'Pépite !'))
            : null;
          return el('li', { class: `beta-social-row${r.pepites ? ' has-gem' : ''}` }, whoEl(r.avatar, r.username), el('span', { class: 'muted' }, `${pts(r.score)}`), gem);
        }),
      );
    } catch {
      card.hidden = true;
      feedRow.hidden = true;
    }
  }

  /** Textes plus chaleureux (bêta) : remplace quelques messages secs par des phrases plus humaines. */
  const WARM = [
    [/^Le serveur ne répond pas pour le moment\./, 'Oups, la mine ne répond pas pour le moment. On souffle un instant et on réessaie !'],
    [/^Connecte-toi pour jouer\./, 'Il faut descendre avec ton compte : connecte-toi d\'abord !'],
    [/^Trop de tentatives\./, 'Doucement, mineur ! Attends quelques minutes avant de réessayer.'],
    [/^Identifiant ou mot de passe incorrect\./, 'Hmm, ces identifiants ne passent pas la porte de la mine. Vérifie et réessaie !'],
    [/^Erreur inattendue, réessaie\./, 'Un éboulement imprévu ! Réessaie dans un instant.'],
  ];
  const warm = (text) => {
    if (!betaOn('betaWarm') || typeof text !== 'string') return text;
    const hit = WARM.find(([re]) => re.test(text));
    return hit ? hit[1] : text;
  };

  /** Fiche d'accueil (bêta) : salutation, la taupe et son activité du jour, puis portrait, lanterne et étais. */
  function renderBetaHello() {
    const card = $('beta-hello');
    if (!card) return;
    const today = app.me && app.me.today;
    card.hidden = !((betaOn('betaSkin') || betaOn('betaMascot') || betaOn('betaHome')) && today);
    if (card.hidden) return;
    const hour = brusselsHour();
    const hello = hour >= 18 || hour < 5 ? 'Bonsoir' : 'Bonjour';
    $('beta-greet').textContent = `${hello} ${app.me.user.username} !`;
    const mascot = $('beta-mascot');
    mascot.hidden = !(betaOn('betaMascot') || betaOn('betaHome'));
    const withMascot = !mascot.hidden;
    if (!app.mascotActivity) app.mascotActivity = pickActivity();
    const activity = ACTIVITIES[app.mascotActivity];
    if (withMascot) {
      const mood = activity.mood || (hour < 6 ? 'sleep' : 'idle');
      drawMascot($('mascot-open'), mood, moleGaze);
      drawMascot($('mascot-blink'), mood === 'look' ? 'look' : 'blink', moleGaze);
      drawActivity($('mascot-tool'), app.mascotActivity);
      mascot.dataset.mood = mood;
      mascot.dataset.base = mood;
      mascot.dataset.anim = activity.anim || '';
      mascot.title = activity.say;
    }
    // Phrase de la taupe, suivie de l'avancement du forage.
    const st = app.me.streak;
    let tail;
    if (!today.gameId) tail = galerieOn() ? (st && st.current > 1 ? `${st.current} jours d'affilée !` : '') : st && st.current > 1 ? `${st.current} jours d'affilée : 7 thèmes t'attendent !` : '7 nouveaux thèmes t\'attendent.';
    else if (!today.finished) tail = `Plus que ${ROUNDS - (today.roundsDone || 0)} thème${ROUNDS - (today.roundsDone || 0) > 1 ? 's' : ''} à creuser.`;
    else tail = `Beau forage : ${pts(today.score)} aujourd'hui !`;
    $('beta-sub').textContent = withMascot ? `« ${activity.say} » ${tail}` : tail;
    const done = today.finished ? ROUNDS : today.roundsDone || 0;
    $('beta-dots').replaceChildren(...Array.from({ length: ROUNDS }, (_, i) => el('span', { class: `beta-dot${i < done ? ' on' : ''}` })));
    $('beta-dots').hidden = betaOn('betaHome');
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
    // Résumé toujours visible quand le bloc des défis est replié.
    const bits = [];
    if (ch) bits.push(ch.done ? 'Semaine réussie !' : `Semaine ${ch.progress}/${ch.goal}`);
    if (collective) bits.push(`Mois ${Math.min(100, Math.round((collective.total / collective.goal) * 100))} %`);
    $('challenge-sub').textContent = bits.join(' · ');
    const frac = ch ? ch.progress / ch.goal : collective ? collective.total / collective.goal : 0;
    $('challenge-mini').style.width = `${Math.max(0, Math.min(100, Math.round(frac * 100)))}%`;
    renderCollective();
    renderWeekly();
    renderCollectiveBanner();
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

  // Défi collectif réussi : un message à l'ouverture de l'application, une seule fois par mois et par appareil.
  function renderCollectiveBanner() {
    const banner = $('collective-banner');
    const c = app.me && app.me.collective;
    const key = c && `speleo-collective-seen-${c.month}`;
    let seen = false;
    try {
      seen = !!c && localStorage.getItem(key) === '1';
    } catch {
      /* le message reste affiché */
    }
    banner.hidden = !c || !c.reached || seen;
    if (banner.hidden) return;
    const mine = (c.players.find((p) => p.me) || {}).points || 0;
    const icon = $('collective-banner-icon');
    const ctx = icon.getContext('2d');
    ctx.clearRect(0, 0, 7, 6);
    sprite(ctx, DIAMOND, { c: '#5ee0ff', w: '#ffffff' }, 0, 0);
    $('collective-banner-text').textContent = `Vous avez creusé le tunnel du mois jusqu'au diamant, ensemble : ${c.total.toLocaleString('fr-BE')} points.${mine ? ` Ta part : ${mine.toLocaleString('fr-BE')} points.` : ''} Merci à tous les mineurs ! (toucher pour fermer)`;
  }

  $('collective-banner').addEventListener('click', () => {
    $('collective-banner').hidden = true;
    const c = app.me && app.me.collective;
    try {
      if (c) localStorage.setItem(`speleo-collective-seen-${c.month}`, '1');
    } catch {
      /* tant pis : le message reviendra */
    }
  });

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

  const MAX_LISTED_ANSWERS = 300;
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

  // ---------- Halloween : éléments macabres des défis, yeux qui clignent ----------
  const HW_SKULL = ['.######.', '########', '#..##..#', '#..##..#', '########', '.#.##.#.', '..####..'];
  const HW_BONE = ['##.....##', '.#######.', '##.....##'];
  const HW_GHOST = ['..www..', '.wwwww.', 'wwkwkww', 'wwwwwww', 'wwwwwww', 'wwwwwww', 'w.www.w'];

  function drawHorror(ctx, w, h, t, opts) {
    const bone = { '#': '#d9cfb4' };
    opts.skulls.forEach(([x, y]) => sprite(ctx, HW_SKULL, bone, x, y));
    opts.bones.forEach(([x, y]) => sprite(ctx, HW_BONE, bone, x, y));
    if (opts.eyes) {
      // Deux yeux rouges qui clignent lentement dans le noir du tunnel.
      const [ex, ey] = opts.eyes;
      if (Math.sin(t * 1.3) > -0.55) {
        ctx.fillStyle = '#ff3b3b';
        ctx.fillRect(ex, ey, 2, 1);
        ctx.fillRect(ex + 5, ey, 2, 1);
      }
    }
    // Un fantôme translucide traverse le tunnel.
    ctx.globalAlpha = 0.5;
    const gx = Math.round(((t * 9) % (w + 16)) - 8);
    sprite(ctx, HW_GHOST, { w: '#e8e0ff', k: '#241437' }, gx, opts.ghostY + Math.round(Math.sin(t * 2) * 2));
    ctx.globalAlpha = 1;
  }

  function spawnEyes() {
    if (document.hidden || !isHalloween() || reducedMotion()) return;
    // Pas pendant une manche : le chrono doit rester équitable.
    if (!$('view-game').hidden || document.querySelector('dialog[open]')) return;
    const eyes = el('div', { class: 'haunt-eyes', 'aria-hidden': 'true' });
    const left = Math.random() < 0.5;
    eyes.style.top = `${8 + Math.random() * 80}%`;
    if (left) eyes.style.left = '1%';
    else eyes.style.right = '1%';
    document.body.append(eyes);
    setTimeout(() => eyes.remove(), 3800);
  }
  function hauntSync() {
    const on = isHalloween();
    if (on && !hauntTimer) {
      setTimeout(spawnEyes, 4000);
      hauntTimer = setInterval(spawnEyes, 13000);
    } else if (!on && hauntTimer) {
      clearInterval(hauntTimer);
      hauntTimer = null;
    }
  }

  // ---------- Défi de la semaine : ton personnage creuse à la pioche vers un diamant ----------
  const WW = 110;
  const WH = 44;
  let weeklyRock = null;

  function weeklyBackdrop() {
    if (weeklyRock) return weeklyRock;
    const c = document.createElement('canvas');
    c.width = WW;
    c.height = WH;
    const ctx = c.getContext('2d');
    const base = ['#4a2f1a', '#5a3a20', '#6b4627', '#3b2414'];
    for (let y = 0; y < WH; y += 2) {
      for (let x = 0; x < WW; x += 2) {
        const v = Math.abs(Math.sin(x * 4.1414 + y * 91.717) * 43758.5453) % 1;
        ctx.fillStyle = v < 0.3 ? base[0] : v < 0.6 ? base[1] : v < 0.85 ? base[2] : base[3];
        ctx.fillRect(x, y, 2, 2);
      }
    }
    weeklyRock = c;
    return c;
  }

  /** Le personnage du joueur (sans objet en main) avance dans un tunnel, pioche en main, vers un diamant : l'avancée suit le défi. */
  function drawWeekly(canvas, ch, avatar, t) {
    const ctx = canvas.getContext('2d');
    const ty = 6;
    const th = 34;
    const floor = ty + th - 2;
    const f = Math.min(1, ch.progress / ch.goal);
    const reach = WW - 52;
    // Défi réussi : le personnage va jusqu'au diamant et le saisit.
    const x0 = ch.done ? WW - 46 : Math.round(4 + (reach - 4) * f);
    ctx.drawImage(weeklyBackdrop(), 0, 0);
    // Tunnel creusé jusqu'au personnage, cavité autour du diamant.
    ctx.fillStyle = '#120d0a';
    ctx.fillRect(0, ty, x0 + 26, th);
    ctx.fillRect(WW - 22, ty + 8, 22, th - 8);
    ctx.fillStyle = '#2a1a0c';
    ctx.fillRect(0, ty + th, x0 + 26, 1);
    for (let x = 12; x < x0; x += 24) {
      ctx.fillStyle = '#8a5a2b';
      ctx.fillRect(x, ty - 1, 2, th + 1);
    }
    // Le diamant, au bout (dans la main du personnage quand le défi est réussi).
    const a = (Math.sin(t * 6) + 1) / 2;
    const dx = ch.done ? x0 + 21 : WW - 15;
    const dy = ch.done ? floor - 21 : floor - 6;
    sprite(ctx, DIAMOND, { c: '#5ee0ff', w: '#ffffff' }, dx, dy);
    ctx.fillStyle = `rgba(255,255,255,${(ch.done ? 1 : 0.5) * a})`;
    ctx.fillRect(dx + 3, dy - 4, 1, 5);
    ctx.fillRect(dx + 1, dy - 2, 5, 1);
    if (isHalloween()) drawHorror(ctx, WW, WH, t, { skulls: [[WW - 34, floor - 6]], bones: [[WW - 50, floor - 2], [WW - 70, floor - 2]], eyes: [WW - 44, ty + 14], ghostY: ty + 6 });
    // Le personnage, sans son objet habituel.
    const who = window.Avatar ? Avatar.sprite({ ...(avatar || {}), objet: 'aucun' }) : null;
    if (who) ctx.drawImage(who, x0, floor - 28 + 1);
    if (ch.done) {
      // Le bras tendu jusqu'au diamant.
      ctx.fillStyle = '#f0c090';
      for (let i = 0; i < 9; i++) ctx.fillRect(x0 + 12 + i, floor - 14 - Math.floor(i * 0.7), 2, 2);
      return;
    }
    // Coup de pioche : levée, milieu, impact, milieu.
    const frame = [0, 1, 2, 1][Math.floor(t * 4) % 4];
    const hx = x0 + 12;
    const hy = floor - 28 + 17;
    const handle = '#8a5a2b';
    const iron = '#c9ced6';
    const px = (x, y, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    };
    if (frame === 0) {
      for (let i = 0; i < 8; i++) px(hx + 1 + Math.floor(i * 0.7), hy - i, handle);
      for (let i = -3; i <= 3; i++) px(hx + 6 + i, hy - 8 + (Math.abs(i) === 3 ? 1 : 0), iron);
    } else if (frame === 1) {
      for (let i = 0; i < 9; i++) px(hx + 1 + i, hy - Math.floor(i * 0.3), handle);
      for (let i = -3; i <= 3; i++) px(hx + 10, hy - 3 + i, iron);
    } else {
      for (let i = 0; i < 9; i++) px(hx + 1 + i, hy + Math.floor(i * 0.5), handle);
      for (let i = -3; i <= 3; i++) px(hx + 10 + Math.floor(Math.abs(i) * 0.3), hy + 4 + i, iron);
      // Éclats de roche à l'impact.
      [[13, 2], [14, 5], [15, 0], [12, 7]].forEach(([dx, dy], k) => px(hx + dx + ((k + Math.floor(t * 8)) % 2), hy + dy - ((k + Math.floor(t * 8)) % 3), '#c9a46b'));
    }
  }

  function renderWeekly() {
    const ch = app.me && app.me.streak && app.me.streak.challenge;
    if (!ch) return;
    const canvas = $('weekly-canvas');
    const scale = Math.max(1, Math.min(4, Math.floor((canvas.parentElement.clientWidth || 330) / WW)));
    canvas.style.width = `${WW * scale}px`;
    canvas.style.height = `${WH * scale}px`;
    drawWeekly(canvas, ch, app.me.avatar, 0);
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
    if (isHalloween()) drawHorror(ctx, CW, CH, t, { skulls: [[28, 0], [66, 0], [10, 33], [46, 33]], bones: [[88, 34], [24, 34]], eyes: [pile - 18, ty + 4], ghostY: ty + 12 });
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
    const duel = data.duel;
    $('collective-duel-title').hidden = $('collective-duel-bar').hidden = $('collective-duel-note').hidden = !duel;
    if (duel) {
      $('collective-duel-title').textContent = duel.reached ? 'Défi duel du mois réussi : bravo à tous les duellistes !' : `Défi duel : terminons ${duel.goal} duels ensemble avant la fin du mois.`;
      $('collective-duel-fill').style.width = `${Math.min(100, Math.round((duel.total / duel.goal) * 100))}%`;
      $('collective-duel-bar').setAttribute('aria-valuemax', String(duel.goal));
      $('collective-duel-bar').setAttribute('aria-valuenow', String(Math.min(duel.goal, duel.total)));
      $('collective-duel-note').textContent = `${duel.total} sur ${duel.goal} duels terminés ce mois-ci, dont ${duel.mine} avec toi.`;
    }
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
    if (!app.me || $('view-home').hidden || document.hidden) return;
    if (reducedMotion()) return;
    const data = app.me.collective;
    if (data && !$('challenge-month').hidden) drawCollective($('collective-canvas'), data, performance.now() / 1000);
    const ch = app.me.streak && app.me.streak.challenge;
    if (ch && !$('challenge-week').hidden) drawWeekly($('weekly-canvas'), ch, app.me.avatar, performance.now() / 1000);
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
      $('mode-duel').hidden = tab.dataset.mode !== 'duel';
      $('mode-training').hidden = tab.dataset.mode !== 'training';
      if (tab.dataset.mode === 'duel') loadDuels();
    }),
  );
  $('btn-daily').addEventListener('click', () => startGame('daily'));
  $('btn-training').addEventListener('click', async () => {
    const choice = await askMode({
      title: 'Infini',
      sub: 'Des thèmes au hasard, autant que tu veux. Ça ne compte pas pour le podium.',
      standardText: '30 secondes par thème.',
      aiseText: 'Sans chrono. Ne compte ni pour les badges ni pour les statistiques.',
    });
    if (choice) startGame('training', { noTimer: choice.mode === 'aise', timerSec: { eclair: 15, long: 60 }[choice.mode] || null });
  });
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

  async function startGame(mode, options = {}) {
    try {
      const state = await api('/api/game/start', { mode, ...options });
      enterGame(state);
    } catch (err) {
      showNotice(err.message);
    }
  }

  function enterGame(state) {
    app.game = state;
    sceneLayers(state, false);
    if (state.finished) return showResults(state);
    // Sons 16-bit : le wagonnet part à droite pour le forage du jour (déjà joué au départ depuis l'accueil), à gauche pour un duel ou l'infini.
    if (son16On() && !departing && !state.rounds.some((r) => r.status === 'done')) Sound.wagon(state.mode === 'daily' ? 1 : -1);
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
        if (r.status === 'done' && !r.tier && state.mode === 'duel') pip.style.background = '#8aa0b8';
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
    $('game-mode').textContent = s.mode === 'daily' ? 'Forage du jour' : s.mode === 'duel' ? `Duel contre ${s.duel ? s.duel.opponent : '?'}` : s.noTimer ? 'Entraînement · À l\'aise' : 'Entraînement';
    $('game-progress').textContent = `${Math.min(done + 1, ROUNDS)}/${ROUNDS}`;
    $('game-score').textContent = s.score == null ? '—' : pts(s.score);
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

  /**
   * Intitulé du thème : le texte est du contenu généré (CSS), donc absent de la sélection et du presse-papiers ; les lecteurs d'écran
   * le lisent grâce à l'étiquette. Ce n'est qu'un frein (une capture d'écran passe toujours), pas une garantie.
   */
  function protectText(node, text) {
    node.textContent = '';
    node.dataset.t = text;
    node.classList.add('protected');
    node.setAttribute('aria-label', text);
  }

  // Signaux discrets envoyés avec chaque réponse (texte collé, temps passé hors de la page, tentatives de copie) : de simples
  // indices pour le responsable du jeu, ils ne bloquent ni ne punissent rien.
  let signals = { p: 0, a: 0, n: 0, c: 0, e: 0, away: 0 };
  const resetSignals = () => (signals = { p: 0, a: 0, n: 0, c: 0, e: 0, away: 0 });
  const currentSignals = () => ({ p: signals.p, a: signals.a, n: signals.n, c: signals.c, e: signals.e });
  const roundOn = () => !$('pane-prompt').hidden;
  const inField = (event) => !!(event.target && event.target.closest && event.target.closest('input, textarea'));
  $('answer-input').addEventListener('paste', () => (signals.p += 1));
  $('answer-input').addEventListener('drop', () => (signals.p += 1));
  $('answer-input').addEventListener('input', () => {
    signals.e += 1;
    // Taupe 16 bits : pendant que tu écris, elle regarde vers le bas, vers ta réponse.
    const box = $('mole-prompt');
    if (mole16On() && !box.hidden && box.dataset.event === 'start' && !box.dataset.typing) {
      box.dataset.typing = '1';
      drawMascot(box.querySelector('canvas'), 'look', { x: 0, y: 1 });
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (roundOn()) signals.away = Date.now();
    } else if (signals.away) {
      signals.a += Date.now() - signals.away;
      signals.n += 1;
      signals.away = 0;
    }
  });
  for (const type of ['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart']) {
    $('pane-prompt').addEventListener(type, (event) => {
      if (inField(event)) return;
      event.preventDefault();
      if (type === 'copy' || type === 'contextmenu') signals.c += 1;
    });
  }

  function showPrompt(round, remainingMs) {
    app.tried = new Set();
    app.triedTexts = [];
    renderTried();
    $('pane-ready').hidden = true;
    $('pane-prompt').hidden = false;
    updateBanner();
    $('prompt-index').textContent = `Thème ${round.slot + 1} sur ${ROUNDS}`;
    protectText($('prompt-title'), round.title);
    resetSignals();
    const jokerReady = !!(app.game.joker && app.game.joker.available);
    $('btn-skip').textContent = jokerReady ? 'Galerie de secours' : 'Passer';
    $('joker-note').hidden = !jokerReady;
    if (jokerReady) Icons.drawIcon($('joker-icon'), 'galerie');
    $('answer-error').textContent = '';
    clearPending();
    hideReport();
    moleSay('prompt', 'start');
    const input = $('answer-input');
    input.value = '';
    input.focus();
    // Mode « À l'aise » : pas de chrono.
    const noTimer = !!app.game.noTimer;
    $('timer').hidden = noTimer;
    $('notimer-note').hidden = !noTimer;
    if (noTimer) stopTimer();
    else startTimer(remainingMs);
  }

  function startTimer(remainingMs) {
    stopTimer();
    const total = app.game.timerSeconds * 1000;
    const deadline = performance.now() + remainingMs;
    const canvas = $('timer-canvas');
    const skin = (app.skin && app.skin.timer) || 'batterie';
    const calm = reducedMotion();
    let lastSecond = null;
    const tick = () => {
      const left = deadline - performance.now();
      const second = Math.ceil(left / 1000);
      if (second > 0 && second !== lastSecond) {
        // Labo (responsable) : un tic par seconde, de la couleur du chrono choisi ; sinon le tic habituel des cinq dernières secondes.
        if (second === 5 && mole16On()) moleSay('prompt', 'hurry');
        if (labOn('labTimer')) Sound.chrono(skin, second, second <= 5);
        else if (second <= 5) Sound.tick(second <= 3);
      }
      if (second !== lastSecond && (second % 10 === 0 || second <= 5)) $('timer-sr').textContent = `${Math.max(0, second)} secondes`;
      lastSecond = second;
      Timers.draw(canvas, skin, left / 1000, total / 1000, performance.now(), settings.colors, calm);
      $('timer-count').textContent = left > 0 ? String(second) : '0';
      $('timer').classList.toggle('last', left > 0 && left <= 5000);
      if (left <= 0) {
        stopTimer();
        // Chrono écoulé : pas de galerie de secours, la manche se clôt et le joueur passe à la suite.
        skipRound({ expired: true });
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
      const res = await api(`/api/game/${app.game.id}/answer`, { text, ...extra, sig: currentSignals() });
      if (res.result === 'confirm') {
        app.game = res.state;
        app.pending = { text, suggestion: res.suggestion };
        $('confirm-suggestion').textContent = `« ${res.suggestion} »`;
        $('answer-confirm').hidden = false;
        $('answer-actions').hidden = true;
        hideReport();
        $('answer-error').textContent = '';
        moleSay('prompt', 'confirm');
        Sound.ask();
        if (betaOn('betaKeys')) $('btn-confirm-yes').focus();
      } else if (res.result === 'unknown') {
        clearPending();
        $('answer-error').textContent = extra.reject
          ? 'D\'accord, essaie autre chose !'
          : betaOn('betaHints') && res.hint
            ? `« ${text} » : ${res.hint.text}`
            : betaOn('betaWarm')
              ? `Hmm, « ${text} » n'est pas dans mes plans de la mine pour ce thème. Essaie une autre piste !`
              : `« ${text} » ne fait pas partie des réponses connues pour ce thème. Essaie autre chose !`;
        app.tried.add(triedKey(text));
        // Correction facile : on garde la saisie et le curseur à la fin quand on y est presque ; sinon on repart de zéro.
        app.triedTexts = [text, ...(app.triedTexts || []).filter((t) => triedKey(t) !== triedKey(text))].slice(0, 6);
        renderTried();
        input.classList.remove('shake');
        void input.offsetWidth;
        input.classList.add('shake');
        if (res.hint && (res.hint.kind === 'presque' || res.hint.kind === 'partiel')) input.setSelectionRange(input.value.length, input.value.length);
        else input.select();
        app.game = res.state;
        offerReport(text);
        moleSay('prompt', 'wrong');
        Sound.wrong();
      } else {
        clearPending();
        roundFinished(res);
      }
    } catch (err) {
      // La réponse a pu être notée juste avant une coupure : on reprend l'état du serveur.
      if ((err.status === 409 || err.status === 0) && (await resync())) return;
      $('answer-error').textContent = warm(err.message);
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
      sceneLayers(state, true);
      if (state.finished) showResults(state);
      else renderGame();
      return true;
    } catch {
      return false;
    }
  }

  /** Les essais refusés de ce thème, à toucher pour les reprendre dans la zone de saisie et les corriger. */
  function renderTried() {
    const list = app.triedTexts || [];
    $('answer-tried').hidden = !list.length;
    $('answer-tried-list').replaceChildren(
      ...list.map((text) => {
        const chip = el('button', { class: 'tried-chip', type: 'button', title: 'Reprendre cet essai pour le corriger' }, text);
        chip.addEventListener('click', () => {
          const input = $('answer-input');
          clearPending();
          input.value = text;
          input.focus();
          input.setSelectionRange(text.length, text.length);
          $('answer-error').textContent = '';
        });
        return chip;
      }),
    );
  }

  // Réponses déjà refusées pendant ce thème (retours précis, bêta) : inutile de renvoyer la même.
  const triedKey = (text) => text.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '');
  app.tried = new Set();

  $('form-answer').addEventListener('submit', (event) => {
    event.preventDefault();
    const text = $('answer-input').value.trim();
    if (!text) return;
    if (betaOn('betaHints') && !app.pending && app.tried.has(triedKey(text))) {
      $('answer-error').textContent = `Tu as déjà essayé « ${text} » pour ce thème : cherche une autre piste.`;
      return;
    }
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

  // Clavier (bêta) : O / N et flèches pour la proposition de correction, flèches dans les onglets, « / » pour chercher, « ? » pour l'aide.
  const KEYS_HELP = 'Clavier : Entrée valide · ← → choisissent · O ou N répondent à « Tu voulais dire ? » · / cherche dans une liste · Échap annule';
  document.addEventListener('keydown', (event) => {
    if (!betaOn('betaKeys') || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    const typing = !!target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
    const confirmOpen = !$('view-game').hidden && !$('answer-confirm').hidden;
    const key = (event.key || '').toLowerCase();
    if (confirmOpen) {
      const yes = $('btn-confirm-yes');
      const no = $('btn-confirm-no');
      if (key === 'escape' || (!typing && key === 'n')) {
        event.preventDefault();
        return no.click();
      }
      if (!typing && (key === 'o' || key === 'y')) {
        event.preventDefault();
        return yes.click();
      }
      if (!typing && (key === 'arrowleft' || key === 'arrowright')) {
        event.preventDefault();
        return (document.activeElement === yes ? no : yes).focus();
      }
    }
    if (typing) return;
    if (key === '?') return showNotice(KEYS_HELP);
    if (key === '/') {
      const search = [...document.querySelectorAll('.answer-search')].find((i) => i.offsetParent !== null);
      if (search) {
        event.preventDefault();
        search.focus();
      }
      return;
    }
    const tab = target && target.closest ? target.closest('[role=tab]') : null;
    if ((key === 'arrowleft' || key === 'arrowright') && tab) {
      const tabs = [...tab.parentElement.querySelectorAll('[role=tab]')].filter((t) => !t.hidden);
      const next = tabs[(tabs.indexOf(tab) + (key === 'arrowright' ? 1 : tabs.length - 1)) % tabs.length];
      if (next && next !== tab) {
        event.preventDefault();
        next.focus();
        next.click();
      }
    }
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

  async function skipRound({ expired = false } = {}) {
    if (expired) {
      const dialog = $('gallery-dialog');
      if (dialog.open) dialog.close();
    }
    if (app.busy || !app.game) return;
    // Joker : un thème par partie peut être changé gratuitement ; au-delà, passer coûte le thème.
    if (!expired && app.game.joker && app.game.joker.available && !(await askGallery())) return;
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
        sceneLayers(app.game, false);
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
    if (state.mode === 'duel') return duelRoundFinished({ round, state });
    stopTimer();
    app.game = state;
    holdKeyboard();
    sceneLayers(state, true);
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
    if (betaOn('betaFx')) {
      const points = $('feedback-points');
      points.classList.remove('pop');
      void points.offsetWidth;
      points.classList.add('pop');
      burstSparks($('pane-feedback'), round.tier.id);
    }
    moleSay('feedback', moleEventFor(round.tier.id));
    rewardShower($('pane-feedback'), round.tier.id);
    if (son16On()) Sound.ore(round.tier.id, pepites);
    else Sound.tier(round.tier.id, pepites);
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

  /** Pendant un duel : la réponse est validée (ou non), mais ni points ni rareté avant le résultat. */
  function duelRoundFinished({ round, state }) {
    stopTimer();
    app.game = state;
    holdKeyboard();
    renderPips(state);
    $('pane-prompt').hidden = true;
    $('pane-ready').hidden = true;
    $('pane-feedback').hidden = false;
    updateBanner();
    $('game-score').textContent = '—';
    moleSay('feedback', 'duel');
    $('feedback-theme').textContent = round.title;
    $('feedback-points').textContent = round.outcome === 'answer' ? '✓' : '—';
    const tier = $('feedback-tier');
    delete tier.dataset.tier;
    tier.style.color = '';
    tier.textContent = round.outcome === 'answer' ? 'Réponse validée' : 'Pas de réponse';
    Sound.reveal();
    if (round.outcome === 'answer') {
      const understood = round.input && round.input.toLowerCase() !== round.answer.toLowerCase();
      $('feedback-answer').textContent = `Ta réponse : ${round.answer}${understood ? ` (tu as écrit « ${round.input} »)` : ''}`;
      $('feedback-odds').textContent = 'La rareté se révélera à la fin du duel.';
    } else {
      $('feedback-answer').textContent = round.outcome === 'timeout' ? 'Le chrono est arrivé à zéro.' : 'Tu as passé ce thème.';
      $('feedback-odds').textContent = '';
    }
    $('feedback-others').textContent = '';
    $('btn-next').textContent = state.finished ? 'Voir le duel' : 'Thème suivant';
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
    refreshMine(true);
    app.game = state;
    if (state.mode === 'duel') return afterDuelGame(state);
    sceneLayers(state, false);
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
      // Les très grands thèmes (plusieurs milliers de réponses) ne s'affichent pas d'un bloc : on guide vers la recherche.
      const hidden = Math.max(0, shown.length - MAX_LISTED_ANSWERS);
      shown.slice(0, MAX_LISTED_ANSWERS).forEach(({ a, hit }) => {
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
      if (hidden) list.append(el('li', { class: 'muted none' }, `… et ${plural(hidden, 'autre réponse', 'autres réponses')} : précise ta recherche pour les voir.`));
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
    ['exploit', 'Exploits'], ['serie', 'Séries de forages'], ['profondeur', 'Profondeur'], ['pepites', 'Pépites'], ['themes', 'Thèmes rencontrés'], ['entrainement', 'Entraînement'], ['duel', 'Duels'], ['reactions', 'Réactions'], ['defi', 'Défis de la semaine'], ['podium', 'Podiums'], ['calendrier', 'Jours particuliers'],
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

  function initFolds(viewId = 'view-profile') {
    const view = $(viewId);
    view.querySelectorAll('details.fold').forEach((d) => {
      d.open = foldOpen(d.dataset.fold, d.dataset.fold === 'profil' || d.dataset.fold === 'defis');
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
  const AVATAR_ORDER = ['espece', 'modele', 'forme', 'corpulence', 'cheveux', 'couleur', 'peau', 'yeux', 'barbe', 'trait', 'iris', 'bouche', 'piercing', 'tatouage', 'accessoire', 'aura', 'dos', 'chapeau', 'tenue', 'objet', 'compagnon', 'lieu'];
  // Selon le type de personnage : catégories sans effet (masquées) et noms/couleurs adaptés.
  const SPECIES_UI = {
    humain: { hide: ['modele'] },
    nain: { hide: ['modele'] },
    robot: { hide: ['forme', 'cheveux', 'barbe', 'yeux', 'trait', 'bouche', 'piercing', 'tatouage', 'tenue', 'iris'], labels: { peau: 'Carrosserie', couleur: 'Lentilles' }, swatch: { peau: 'robot', couleur: 'lentilles' } },
    taupe: { hide: ['cheveux', 'couleur', 'barbe', 'trait', 'bouche', 'piercing', 'tatouage', 'iris', 'modele'], labels: { peau: 'Pelage' }, swatch: { peau: 'taupe' } },
    citrouille: { hide: ['forme', 'cheveux', 'couleur', 'barbe', 'yeux', 'trait', 'bouche', 'piercing', 'tatouage', 'iris', 'modele'], labels: { peau: 'Citrouille' }, swatch: { peau: 'citrouille' } },
    squelette: { hide: ['cheveux', 'barbe', 'trait', 'bouche', 'piercing', 'tatouage', 'iris', 'modele'], labels: { peau: 'Os', couleur: 'Lueur des orbites' }, swatch: { peau: 'squelette', couleur: 'lentilles' } },
    fantome: { hide: ['forme', 'corpulence', 'cheveux', 'couleur', 'barbe', 'yeux', 'trait', 'bouche', 'piercing', 'tatouage', 'tenue', 'iris', 'modele'], labels: { peau: 'Drap' }, swatch: { peau: 'fantome' } },
    champignon: { hide: ['forme', 'cheveux', 'couleur', 'barbe', 'yeux', 'trait', 'iris', 'bouche', 'piercing', 'tatouage', 'chapeau', 'modele'], labels: { peau: 'Chapeau du champignon' }, swatch: { peau: 'champignon' } },
    'ver-luisant': { hide: ['forme', 'corpulence', 'cheveux', 'couleur', 'barbe', 'yeux', 'trait', 'iris', 'bouche', 'piercing', 'tatouage', 'tenue', 'modele'], labels: { peau: 'Corps' }, swatch: { peau: 'ver-luisant' } },
    diablotin: { hide: ['forme', 'trait', 'yeux', 'iris', 'bouche', 'modele'], labels: { peau: 'Peau' }, swatch: { peau: 'diablotin' } },
    grenouille: { hide: ['forme', 'cheveux', 'couleur', 'barbe', 'yeux', 'trait', 'iris', 'bouche', 'piercing', 'tatouage', 'modele'], labels: { peau: 'Peau' }, swatch: { peau: 'grenouille' } },
    golem: { hide: ['forme', 'cheveux', 'couleur', 'barbe', 'yeux', 'trait', 'bouche', 'piercing', 'tatouage', 'tenue', 'iris', 'modele'], labels: { peau: 'Cristaux' }, swatch: { peau: 'golem' } },
  };
  const speciesOf = (draft) => SPECIES_UI[draft.espece] || {};

  function renderAvatarEditor(profile) {
    const catalog = profile.avatarCatalog;
    const inCatalog = (slot) => !!catalog[slot] && catalog[slot].options.length > 1; // « traits » n'existe que pour le responsable (bêta)
    const draft = { ...profile.avatar };
    const shown = (slot) => inCatalog(slot) && !(speciesOf(draft).hide || []).includes(slot);
    // « Juste le poil » n'existe que pour la taupe ; on en sort dès qu'on change de type.
    const optionsOf = (slot) => catalog[slot].options.filter((o) => slot !== 'tenue' || o.id !== 'poil' || draft.espece === 'taupe');
    const labelOf = (slot) => (speciesOf(draft).labels || {})[slot] || catalog[slot].label;
    const swatchOf = (slot, id) => {
      const key = (speciesOf(draft).swatch || {})[slot];
      return key ? (window.Avatar.SWATCHES[key] || {})[id] : (SWATCH[slot] || {})[id];
    };
    // Tenue d'origine d'un type : ses réglages, sauf ce qui n'est pas encore débloqué.
    const applyStory = (species) => {
      const story = window.Avatar.STORIES[species];
      if (!story) return;
      for (const [slot, id] of Object.entries(story.preset)) {
        const opt = catalog[slot] && catalog[slot].options.find((o) => o.id === id);
        if (opt && opt.unlocked) draft[slot] = id;
      }
      // Le nain se choisit avec sa barbe, sauf si le joueur en a déjà une.
      const look = story.look || {};
      if (look.barbe && draft.barbe === 'aucune') draft.barbe = look.barbe;
    };
    const onChoice = (slot, id) => {
      draft[slot] = id;
      if (slot === 'espece') {
        applyStory(id);
        if (draft.tenue === 'poil' && id !== 'taupe') draft.tenue = 'mineur';
      }
    };
    const preview = () => {
      $('prof-avatar').replaceChildren(avatarEl(draft, 'full', 6));
      if (betaOn('betaProfil')) $('pf-portrait').replaceChildren(avatarEl(draft, 'full', 6));
    };
    $('prof-name').textContent = app.me.user.username;
    const buildRows = () => AVATAR_ORDER.filter(shown).map((slot) => {
      const cat = catalog[slot];
      const options = optionsOf(slot);
      const label = el('span', { class: 'val' });
      const swatch = el('span', { class: 'swatch' });
      const refresh = () => {
        const opt = options.find((o) => o.id === draft[slot]) || options[0];
        label.textContent = `${opt.unlocked ? '' : '🔒 '}${opt.label}`;
        label.classList.toggle('locked', !opt.unlocked);
        swatch.style.background = swatchOf(slot, opt.id) || 'transparent';
      };
      const step = (dir) => {
        const i = options.findIndex((o) => o.id === draft[slot]);
        onChoice(slot, options[(i + dir + options.length) % options.length].id);
        preview();
        commit();
        if (slot === 'espece') $('avatar-options').replaceChildren(...buildRows());
        else refresh();
      };
      const prev = el('button', { class: 'arr', type: 'button', 'aria-label': `${cat.label} précédent` }, '◀');
      const next = el('button', { class: 'arr', type: 'button', 'aria-label': `${cat.label} suivant` }, '▶');
      prev.addEventListener('click', () => step(-1));
      next.addEventListener('click', () => step(1));
      refresh();
      return el('div', { class: 'opt' }, el('span', { class: 'lab' }, labelOf(slot)), prev, el('span', { class: 'val-wrap' }, swatchOf(slot, draft[slot]) ? swatch : null, label), next);
    });
    // Vestiaire (bêta) : des vignettes à toucher, rangées en quatre onglets, au lieu de dix lignes de flèches.
    function wardrobe() {
      const GROUPS = [
        ['Type', ['espece', 'modele', 'aura']],
        ['Tête', ['cheveux', 'couleur', 'chapeau']],
        ['Visage', ['peau', 'yeux', 'iris', 'bouche', 'barbe', 'trait', 'piercing']],
        ['Corps', ['forme', 'corpulence', 'tenue', 'accessoire', 'dos', 'tatouage']],
        ['Outil', ['objet', 'compagnon', 'lieu']],
      ].filter(([, slots]) => slots.some(inCatalog)); // sans le vestiaire 16-bit (joueurs pendant la bêta), pas d'onglet « Type » vide
      const FULL = new Set(['espece', 'modele', 'aura', 'dos', 'forme', 'corpulence', 'tenue', 'objet', 'tatouage']);
      const THUMBS = new Set(['espece', 'modele', 'aura', 'dos', 'iris', 'forme', 'corpulence', 'cheveux', 'couleur', 'peau', 'yeux', 'barbe', 'trait', 'bouche', 'piercing', 'tatouage', 'accessoire', 'chapeau', 'tenue', 'objet', 'compagnon']);
      let current = 0;
      const tabs = el('div', { class: 'wr-tabs', role: 'tablist' });
      const panel = el('div', { class: 'wr-panel' });
      const render = () => {
        tabs.replaceChildren(
          ...GROUPS.map(([name], i) => {
            const b = el('button', { class: `tab${i === current ? ' active' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(i === current) }, name);
            b.addEventListener('click', () => { current = i; render(); });
            return b;
          }),
        );
        panel.replaceChildren(
          ...(GROUPS[current][1].some(shown) ? GROUPS[current][1].filter(shown) : []).map((slot) => {
            const grid = el('div', { class: `wr-grid${THUMBS.has(slot) ? '' : ' text'}` });
            optionsOf(slot).forEach((opt) => {
              const selected = draft[slot] === opt.id;
              const content = THUMBS.has(slot) ? avatarEl(slot === 'espece' ? window.Avatar.thumb(opt.id) : { ...draft, [slot]: opt.id }, FULL.has(slot) ? 'full' : 'bust', 2) : null;
              const b = el('button', { class: `wr-opt${selected ? ' sel' : ''}${opt.unlocked ? '' : ' locked'}`, type: 'button', title: opt.unlocked ? opt.label : opt.hint || opt.label, 'aria-pressed': String(selected) }, content, el('span', { class: 'wr-lab' }, `${opt.unlocked ? '' : '🔒 '}${opt.label}`));
              b.addEventListener('click', () => {
                onChoice(slot, opt.id);
                preview();
                commit();
                render();
              });
              grid.append(b);
            });
            const story = slot === 'espece' ? window.Avatar.STORIES[draft.espece] : slot === 'modele' ? { text: window.Avatar.MODELS[draft.modele] } : null;
            const again = slot === 'espece' ? el('button', { class: 'btn ghost', type: 'button' }, "Reprendre la tenue d'origine") : null;
            if (again) again.addEventListener('click', () => { applyStory(draft.espece); preview(); commit(); render(); });
            return el('div', { class: 'wr-slot' }, el('h4', {}, labelOf(slot)), grid, story ? el('p', { class: 'muted small' }, story.text) : null, again);
          }),
        );
        if (!panel.children.length) panel.append(el('p', { class: 'muted small' }, 'Rien à régler ici pour ce type de personnage.'));
      };
      const random = el('button', { class: 'btn ghost', type: 'button' }, 'Au hasard');
      random.addEventListener('click', () => {
        for (const slot of AVATAR_ORDER.filter(inCatalog)) {
          const free = optionsOf(slot).filter((o) => o.unlocked);
          onChoice(slot, free[Math.floor(Math.random() * free.length)].id);
        }
        preview();
        commit();
        render();
      });
      render();
      return el('div', { class: 'wardrobe' }, tabs, panel, random);
    }

    $('avatar-options').replaceChildren(...(betaOn('betaProfil') ? [wardrobe()] : buildRows()));
    // Refonte en bêta : l'anniversaire n'est proposé qu'au responsable.
    if (betaOn('betaProfil') && app.me && app.me.isAdmin) $('avatar-options').append(birthdayBlock(profile.birthday));
    preview();
    let timer = null;
    function commit() {
      clearTimeout(timer);
      const locked = AVATAR_ORDER.filter(inCatalog).map((slot) => catalog[slot].options.find((o) => o.id === draft[slot])).filter((o) => o && !o.unlocked);
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

  /** Anniversaire facultatif : jour et mois, jamais montrés aux autres joueurs. */
  function birthdayBlock(current) {
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const [m0, d0] = current ? current.split('-').map(Number) : [0, 0];
    const day = el('select', { 'aria-label': 'Jour' }, el('option', { value: '' }, 'Jour'), ...Array.from({ length: 31 }, (_, i) => el('option', { value: String(i + 1) }, String(i + 1))));
    const month = el('select', { 'aria-label': 'Mois' }, el('option', { value: '' }, 'Mois'), ...MONTHS.map((n, i) => el('option', { value: String(i + 1) }, n)));
    day.value = d0 ? String(d0) : '';
    month.value = m0 ? String(m0) : '';
    const status = el('span', { class: 'muted small', role: 'status' });
    const save = el('button', { class: 'btn ghost', type: 'button' }, 'Enregistrer');
    save.addEventListener('click', async () => {
      const blank = !day.value && !month.value;
      if (!blank && (!day.value || !month.value)) { status.textContent = 'Choisis le jour et le mois.'; return; }
      const value = blank ? null : `${month.value.padStart(2, '0')}-${day.value.padStart(2, '0')}`;
      try {
        await api('/api/profile/birthday', { birthday: value });
        status.textContent = value ? 'Anniversaire enregistré.' : 'Anniversaire effacé.';
      } catch (err) {
        status.textContent = err.message;
      }
    });
    return el('div', { class: 'wr-slot' }, el('h4', {}, 'Ton anniversaire (facultatif)'),
      el('p', { class: 'muted small' }, 'Les autres joueurs ne le voient pas. Si tu fores ce jour-là, tu reçois un cadeau pour ton personnage.'),
      el('div', { class: 'row' }, day, month, save), status);
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

  // ---------- Nouveau profil (bêta) ----------
  const RANKS = [
    [0, 'Taupe novice'],
    [1, 'Apprenti foreur'],
    [5, 'Mineur confirmé'],
    [10, 'Mineur de fond'],
    [30, 'Maître foreur'],
    [100, 'Gardien du noyau'],
    [200, 'Seigneur des galeries'],
    [300, 'Légende de la mine'],
  ];
  /** Titre du mineur selon ses jours forés, et ce qu'il lui manque pour le suivant. */
  function rankOf(days) {
    let index = 0;
    RANKS.forEach(([n], i) => { if (days >= n) index = i; });
    const next = RANKS[index + 1];
    return { index, title: RANKS[index][1], next: next ? { title: next[1], remaining: next[0] - days } : null };
  }

  /** Le nouveau profil déplace des blocs existants (rien n'est recréé) : calendrier, coupe de la Terre, prochains badges. */
  function layoutProfile(on) {
    if (on === prof.moved) return;
    prof.moved = on;
    const next = $('next-badges');
    const calendar = $('chart-calendar');
    const earth = $('chart-earth');
    const heading = document.querySelector('#fold-profil .fold-t h2');
    const sub = $('profil-sub');
    const calHead = calendar.previousElementSibling;
    const earthHead = earth.previousElementSibling;
    if (on) {
      for (const h of [calHead, earthHead]) if (h && h.tagName === 'H3') h.hidden = true;
      relocate(next, $('pf-next'));
      const cal = el('h3', { id: 'pf-cal-title' }, 'Tes jours forés');
      const ear = el('h3', { id: 'pf-earth-title' }, 'Ta meilleure profondeur');
      $('pf-charts').append(cal);
      relocate(calendar, $('pf-charts'));
      $('pf-charts').append(ear);
      relocate(earth, $('pf-charts'));
      heading.textContent = 'Vestiaire';
      sub.textContent = 'ton personnage et ton pseudo';
    } else {
      for (const h of document.querySelectorAll('#fold-stats-fix, #view-profile h3[hidden]')) h.hidden = false;
      restore(next);
      restore(calendar);
      restore(earth);
      for (const id of ['pf-cal-title', 'pf-earth-title']) if ($(id)) $(id).remove();
      heading.textContent = 'Profil';
      sub.textContent = 'ton nom et ton personnage';
    }
  }

  function setProfileTab(tab) {
    prof.tab = tab;
    $('view-profile').dataset.active = tab;
    $('pf-tabs').querySelectorAll('button').forEach((b) => {
      const active = b.dataset.ptabGo === tab;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
  }
  $('pf-tabs').addEventListener('click', (event) => {
    const b = event.target.closest('button[data-ptab-go]');
    if (!b) return;
    setProfileTab(b.dataset.ptabGo);
    $('pf-tabs').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  });
  $('btn-pf-allbadges').addEventListener('click', () => setProfileTab('badges'));

  const dayLabel = (day) => formatDay(day, { day: 'numeric', month: 'long', year: 'numeric' });

  const chosenTitleLabel = (profile) => ((profile.titles || []).find((t) => t.id === profile.title) || {}).label || null;

  /** Cadre du titre sur la carte de mineur : le titre affiché (sinon celui du rang), à toucher pour en changer. */
  function renderTitleFrame(profile) {
    const rank = rankOf(profile.stats.daysPlayed);
    const chosen = chosenTitleLabel(profile);
    const trophy = rank.index > 0 ? el('canvas', { class: 'pf-trophy', width: '16', height: '16', 'aria-hidden': 'true' }) : null;
    if (trophy) Icons.drawIcon(trophy, `titre-${rank.index}`);
    $('pf-title').replaceChildren(...(trophy ? [trophy] : []), el('span', {}, chosen || rank.title), el('span', { class: 'caret', 'aria-hidden': 'true' }, '▾'));
    $('pf-title').title = 'Choisir le titre affiché à côté de ton pseudo';
    $('pf-title-hint').textContent = chosen ? '' : 'Touche le cadre pour choisir un titre à afficher à côté de ton pseudo.';
  }

  /** Liste des titres : ceux qu'on a débloqués à toucher, puis ceux à gagner avec leur condition. */
  function renderTitleList(profile) {
    const titles = profile.titles || [];
    const choose = async (t) => {
      try {
        await api('/api/profile/title', { title: t ? t.id : null });
        profile.title = t ? t.id : null;
        renderTitleFrame(profile);
        $('title-dialog').close();
      } catch (err) {
        showNotice(err.message);
      }
    };
    const row = (t) => {
      const on = t ? profile.title === t.id : !profile.title;
      const b = el(
        'button',
        { class: `tl-row${on ? ' sel' : ''}${t && !t.unlocked ? ' locked' : ''}`, type: 'button', 'aria-pressed': String(on) },
        el('span', { class: 'tl-mark', 'aria-hidden': 'true' }, on ? '▶' : t && !t.unlocked ? '🔒' : ''),
        el('span', { class: 'tl-name' }, t ? t.label : 'Aucun titre'),
        t && !t.unlocked ? el('span', { class: 'tl-hint' }, t.hint) : null,
      );
      if (!t || t.unlocked) b.addEventListener('click', () => choose(t));
      else b.disabled = true;
      return b;
    };
    const mine = titles.filter((t) => t.unlocked);
    const rest = titles.filter((t) => !t.unlocked);
    $('title-list').replaceChildren(
      row(null),
      ...mine.map(row),
      ...(rest.length ? [el('h3', {}, `À gagner (${rest.length})`), ...rest.map(row)] : []),
    );
  }
  $('pf-title').addEventListener('click', () => {
    if (!app.profile) return;
    renderTitleList(app.profile);
    $('title-dialog').showModal();
  });
  $('title-close').addEventListener('click', () => $('title-dialog').close());
  $('title-dialog').addEventListener('click', (event) => event.target === $('title-dialog') && $('title-dialog').close());

  /** Carte de mineur : portrait, titre, série et étais, et un mot de la taupe. */
  function renderProfileHero(profile) {
    const st = profile.stats;
    const rank = rankOf(st.daysPlayed);
    $('pf-portrait').replaceChildren(avatarEl(profile.avatar, 'full', 6));
    $('pf-name').textContent = app.me.user.username;
    renderTitleFrame(profile);
    $('pf-since').textContent = profile.joinedAt ? `Mineur depuis le ${dayLabel(new Date(profile.joinedAt).toISOString().slice(0, 10))}` : '';
    const lantern = el('canvas', { class: 'streak-lantern', width: '16', height: '16', 'aria-hidden': 'true' });
    Icons.drawLantern(lantern, st.currentStreak, { dim: st.currentStreak === 0 });
    const props = Array.from({ length: 3 }, (_, i) => {
      const c = el('canvas', { class: `freeze-icon${i < st.freezes ? ' full' : ''}`, width: '16', height: '16', title: i < st.freezes ? 'Étai disponible' : 'Emplacement vide' });
      Icons.drawIcon(c, 'etai', { dim: i >= st.freezes });
      return c;
    });
    $('pf-chips').replaceChildren(
      el('div', { class: 'streak lit' }, lantern, el('span', { class: 'streak-count' }, st.currentStreak > 0 ? plural(st.currentStreak, 'jour', 'jours') : 'Pas de série')),
      el('div', { class: 'freezes' }, ...props),
    );
    // La taupe commente : le prochain titre s'il est proche, sinon le prochain badge.
    const nexts = (app.me.streak && (app.me.streak.nexts || (app.me.streak.next ? [app.me.streak.next] : []))) || [];
    let text;
    if (rank.next && rank.next.remaining <= 5) text = `Encore ${plural(rank.next.remaining, 'jour foré', 'jours forés')} et tu deviens « ${rank.next.title} » !`;
    else if (nexts.length) text = `Plus que ${nexts[0].remaining} ${nexts[0].unit} pour le badge « ${nexts[0].name} ».`;
    else if (rank.next) text = `Prochain titre : « ${rank.next.title} », dans ${plural(rank.next.remaining, 'jour foré', 'jours forés')}.`;
    else text = 'Quelle belle carrière de mineur : tu as atteint le plus haut titre !';
    $('pf-bubble').textContent = text;
    if (!app.mascotActivity) app.mascotActivity = pickActivity();
    const activity = ACTIVITIES[app.mascotActivity];
    const mole = $('pf-mole');
    const [open, blink, tool] = mole.querySelectorAll('canvas');
    const mood = activity.mood || 'idle';
    drawMascot(open, mood, moleGaze);
    drawMascot(blink, mood === 'look' ? 'look' : 'blink', moleGaze);
    drawActivity(tool, app.mascotActivity);
    mole.dataset.mood = mood;
    mole.dataset.base = mood;
    mole.dataset.anim = activity.anim || '';
  }

  /** Six chiffres clés avec leur icône en pixel art. */
  function renderProfileTiles(profile) {
    const st = profile.stats;
    const earned = profile.badges.filter((b) => b.count).length;
    const tiles = [
      ['calendrier-29', 'Jours forés', String(st.daysPlayed)],
      ['trophee', 'Meilleur score', pts(st.bestScore)],
      ['carotte', 'Profondeur max', Pixel.formatDepth(st.bestScore)],
      ['pepite', 'Pépites', String(st.pepites)],
      ['lampe', 'Série record', plural(st.bestStreak, 'jour', 'jours')],
      ['medaille', 'Badges', `${earned} / ${profile.badges.length}`],
    ];
    $('pf-tile-grid').replaceChildren(
      ...tiles.map(([icon, label, value]) => {
        const c = el('canvas', { width: '16', height: '16', 'aria-hidden': 'true' });
        Icons.drawIcon(c, icon);
        return el('li', { class: 'pf-tile' }, c, el('strong', {}, value), el('span', { class: 'muted small' }, label));
      }),
    );
  }

  /** Vitrine : les six derniers badges obtenus, comme sur une étagère. */
  function renderProfileShowcase(profile) {
    const got = profile.badges.filter((b) => b.count).sort((a, b) => String(b.lastOn).localeCompare(String(a.lastOn)));
    const box = $('pf-showcase-list');
    box.replaceChildren(...(got.length ? got.slice(0, 6).map(badgeTile) : [el('p', { class: 'muted' }, 'Pas encore de badge : fore aujourd\'hui pour décrocher le premier !')]));
    $('btn-pf-allbadges').textContent = `Voir les ${profile.badges.length} badges`;
  }

  /** Titres de mineur : sept trophées, de plus en plus précieux, qui se débloquent aux jours forés 1, 5, 10, 30, 100, 200 et 300. */
  function renderProfileTitles(profile) {
    const st = profile.stats;
    const rank = rankOf(st.daysPlayed);
    $('pf-title-row').replaceChildren(
      ...RANKS.slice(1).map(([n, name], i) => {
        const got = st.daysPlayed >= n;
        const c = el('canvas', { width: '16', height: '16', 'aria-hidden': 'true' });
        Icons.drawIcon(c, `titre-${i + 1}`, { dim: !got });
        const when = st.titleDays && st.titleDays[n] ? ` · obtenu le ${dayLabel(st.titleDays[n])}` : '';
        return el('li', { class: `pf-title-item${got ? ' got' : ''}${rank.index === i + 1 ? ' current' : ''}`, title: `${name} : ${plural(n, 'jour foré', 'jours forés')}${when}` }, c, el('strong', {}, String(n)), el('span', { class: 'muted' }, name));
      }),
    );
    $('pf-title-note').textContent = rank.next ? `Prochain titre : « ${rank.next.title} », dans ${plural(rank.next.remaining, 'jour foré', 'jours forés')}.` : 'Tu as décroché tous les titres : bravo, légende de la mine !';
  }

  /** Journal de bord : l'arrivée dans la mine puis chaque badge, du plus récent au plus ancien. */
  function renderProfileTimeline(profile) {
    const events = profile.badges.filter((b) => b.count && b.firstOn).map((b) => ({ day: b.firstOn, icon: b.icon, label: `Badge « ${b.name} »`, badge: b }));
    if (profile.joinedAt) events.push({ day: new Date(profile.joinedAt).toISOString().slice(0, 10), icon: 'pioche', label: 'Arrivée dans la mine' });
    RANKS.slice(1).forEach(([n, name], i) => {
      const day = profile.stats.titleDays && profile.stats.titleDays[n];
      if (day) events.push({ day, icon: `titre-${i + 1}`, label: `Titre « ${name} »` });
    });
    events.sort((a, b) => b.day.localeCompare(a.day));
    const shown = prof.timelineAll ? events : events.slice(0, 8);
    $('pf-timeline-list').replaceChildren(
      ...shown.map((e) => {
        const c = el('canvas', { width: '16', height: '16', 'aria-hidden': 'true' });
        Icons.drawIcon(c, e.icon);
        return el('li', {}, c, el('div', {}, el('span', {}, e.label), el('span', { class: 'muted small' }, dayLabel(e.day))));
      }),
    );
    $('btn-pf-more').hidden = prof.timelineAll || events.length <= 8;
  }
  $('btn-pf-more').addEventListener('click', () => {
    prof.timelineAll = true;
    renderProfileTimeline(app.profile);
  });

  /** Carte à partager : une image avec le portrait, le titre et trois chiffres. */
  async function shareProfileCard() {
    const profile = app.profile;
    const st = profile.stats;
    const status = $('pf-share-status');
    status.textContent = '';
    try {
      await document.fonts.ready;
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 270;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const bg = ctx.createLinearGradient(0, 0, 480, 270);
      bg.addColorStop(0, '#3a2c22');
      bg.addColorStop(1, '#1b1410');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 480, 270);
      ctx.strokeStyle = '#f2c230';
      ctx.lineWidth = 6;
      ctx.strokeRect(6, 6, 468, 258);
      const portrait = avatarEl(profile.avatar, 'full', 1);
      ctx.fillStyle = '#120d0a';
      ctx.fillRect(26, 26, 150, 218);
      ctx.drawImage(portrait, 51, 36, 100, 175);
      ctx.fillStyle = '#f2c230';
      ctx.font = '20px "Press Start 2P", monospace';
      ctx.fillText(app.me.user.username.slice(0, 14), 196, 62);
      ctx.fillStyle = '#f3e9d2';
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.fillText(rankOf(st.daysPlayed).title, 196, 92);
      ctx.font = '26px VT323, monospace';
      const lines = [`${st.daysPlayed} jours forés`, `Meilleur forage : ${st.bestScore} pts`, `${st.pepites} pépites trouvées`, `Série record : ${st.bestStreak} j`];
      lines.forEach((line, i) => ctx.fillText(line, 196, 134 + i * 34));
      ctx.fillStyle = '#b8a68a';
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillText('SPÉLÉOLOGIE', 196, 252);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const file = new File([blob], 'carte-de-mineur.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Ma carte de mineur' });
      } else {
        const link = el('a', { href: URL.createObjectURL(blob), download: 'carte-de-mineur.png' });
        link.click();
        status.textContent = 'Carte enregistrée sur cet appareil.';
      }
    } catch (err) {
      if (err && err.name !== 'AbortError') status.textContent = 'Impossible de créer la carte sur cet appareil.';
    }
  }
  $('btn-pf-share').addEventListener('click', shareProfileCard);

  /** Nouveau profil : appelé après l'affichage de l'écran (les blocs sont tous ouverts, les onglets choisissent ce qu'on voit). */
  function finishBetaProfile(profile) {
    const on = betaOn('betaProfil');
    $('pf-hero').hidden = !on;
    $('pf-tabs').hidden = !on;
    for (const id of ['pf-tiles', 'pf-titles', 'pf-showcase', 'pf-charts', 'pf-timeline']) $(id).hidden = !on;
    $('pf-next').hidden = !on || $('next-badges').hidden;
    if (!on) return void delete $('view-profile').dataset.active;
    document.querySelectorAll('#view-profile > details.fold').forEach((d) => (d.open = true));
    $('next-badges').open = true;
    prof.timelineAll = false;
    renderProfileHero(profile);
    renderProfileTiles(profile);
    renderProfileTitles(profile);
    renderProfileShowcase(profile);
    renderProfileTimeline(profile);
    setProfileTab(prof.tab || 'apercu');
  }

  async function openProfile() {
    stopTimer();
    try {
      const profile = await api('/api/profile');
      app.profile = profile;
      app.skin = profile.skin;
      renderProfile(profile);
      show('profile');
      initFolds();
      finishBetaProfile(profile);
      loadSuggestions();
      loadMyReports();
      loadBilan(app.bilanMonth || null);
      if (profile.badges.some((b) => b.isNew)) {
        api('/api/profile/seen', {}).catch(() => {});
        if (app.me) app.me.unseenBadges = 0;
      }
    } catch (err) {
      showNotice(err.message);
    }
  }

  // ---------- Musée des pépites ----------
  /**
   * Annonce de l'arrivée de Jack-o'-lantern (31 octobre) au-dessus du journal de la mine : du 28 au 31 octobre,
   * avec un compte à rebours et un épouvantail à tête de citrouille aux yeux verts. On n'en dit pas plus.
   */
  function drawJack() {
    const draw = (id, rows, pal) => {
      const ctx = $(id).getContext('2d');
      ctx.clearRect(0, 0, 32, 48);
      rows.forEach((row, y) => [...row.padEnd(32, '.')].forEach((c, x) => {
        if (pal[c]) {
          ctx.fillStyle = pal[c];
          ctx.fillRect(x, y, 1, 1);
        }
      }));
    };
    // Tête (citrouille), cou, chapeau de paille, bras en croix, haillons et poteau : 32 x 48.
    const base = [
      '..........kkkkkkkkkk..........',
      '.........kssssssssssk.........',
      '......kkkkkssssssssskkkkk.....',
      '.....kssssssssssssssssssk.....',
      '..........kkkkkkkkkk..........',
      '........kkoooooooooookk.......',
      '.......koooooooooooooook......',
      '......kooooooooooooooooook.....',
      '......koooooooooooooooook......',
      '......kooooooooooooooooook.....',
      '......kooooooooooooooooook.....',
      '......kooooooooooooooooook.....',
      '......kooooooooooooooooook.....',
      '......kooooooooooooooooook.....',
      '.......kooooooooooooooook......',
      '........kkoooooooooookk.......',
      '..........kkkkggkkkkk.........',
      '.............kgk..............',
      '.....kkkkkkkkkgkkkkkkkkkk.....',
      '....kwwwkwwwwkgkwwwwkwwwwk....',
      '...kswkkskkkkkgkkkkkkwkwwk....',
      '...kk.kkcccccccccccckk.kk.....',
      '.......kcccccccccccck.........',
      '.......kcpcccccccpcck.........',
      '.......kcccccccccccck.........',
      '.......kccppcccccccck.........',
      '.......kcccccccccpcck.........',
      '.......kkcccccccccckk.........',
      '........kwkwkwkwkwkk..........',
      '.............kgk..............',
      '.............kgk..............',
      '.............kgk..............',
      '.............kgk..............',
      '.............kgk..............',
      '.............kgk..............',
      '.............kgk..............',
      '.............kgk..............',
      '.............kgk..............',
      '.............kgk..............',
      '.............kgk..............',
      '.............kgk..............',
      '.............kgk..............',
      '.............kgk..............',
      '.............kgk..............',
      '.............kgk..............',
      '.............kgk..............',
      '.............kgk..............',
      '.............kkk..............',
    ];
    draw('jack-base', base, { k: '#1b1410', s: '#d9b84a', o: '#d9772b', c: '#4a3a5c', p: '#7a5a8a', w: '#e8c547', g: '#6b4a2b' });
    // Yeux et bouche : un vert qui luit (le halo vit dans le CSS, sans minuteur).
    const glow = new Array(48).fill('.'.repeat(32)).map((r) => r.split(''));
    const put = (x, y, w = 1, h = 1) => {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) glow[y + j][x + i] = 'e';
    };
    put(10, 10, 2, 2); // œil gauche
    put(17, 10, 2, 2); // œil droit
    put(9, 13, 1, 1);
    put(11, 14, 8, 1); // bouche
    put(10, 13, 1, 1);
    put(19, 13, 1, 1);
    put(12, 13, 1, 1);
    put(15, 13, 1, 1);
    put(18, 13, 1, 1);
    draw('jack-glow', glow.map((r) => r.join('')), { e: '#7dff5a' });
  }
  function renderJack() {
    const card = $('jack-card');
    const day = app.me && app.me.today && app.me.today.day;
    const md = day ? day.slice(5) : '';
    const show = betaOn('betaHome') && day && md >= '10-28' && md <= '10-31';
    card.hidden = !show;
    if (!show) return;
    const left = 31 - Number(md.slice(3));
    drawJack();
    $('jack-title').textContent = left === 0 ? "Jack-o'-lantern arrive ce soir" : left === 1 ? "Jack-o'-lantern arrive demain" : `Jack-o'-lantern arrive dans ${left} jours`;
    $('jack-sub').textContent = left === 0 ? 'Quelque chose remue dans les galeries…' : 'Quelque chose approche dans les galeries…';
  }

  function setMinePastilles({ feed = 0, museum = 0 } = {}) {
    const set = (id, n) => {
      $(id).hidden = !n;
      $(id).textContent = n > 9 ? '9+' : String(n || '');
    };
    set('journal-pastille', feed);
    set('museum-pastille', museum);
  }

  async function openMuseum() {
    try {
      const data = await api('/api/museum');
      app.museum = data;
      app.museumNew = 0;
      writeKey(MUSEUM_SEEN_KEY, data.total);
      writeKey(MUSEUM_TODAY_KEY, `${data.day}:${data.todayCount || 0}`);
      renderMuseum();
      renderJack();
      show('museum');
    } catch (err) {
      showNotice(err.message);
    }
  }

  function renderMuseum() {
    const d = app.museum;
    $('museum-intro').textContent = `${plural(d.total, 'pépite découverte', 'pépites découvertes')} par le groupe${d.todayCount ? ` (et ${plural(d.todayCount, 'nouvelle', 'nouvelles')} aujourd'hui, à dévoiler demain)` : ''}.`;
    const top = Math.max(1, ...d.players.map((p) => p.count));
    $('museum-players').replaceChildren(
      ...d.players.map((p) => {
        const fill = el('span', { class: 'fill' });
        fill.style.width = `${Math.round((p.count / top) * 100)}%`;
        return el('li', { class: p.me ? 'me' : '' }, el('span', { class: 'who' }, avatarEl(p.avatar, 'head', 2), p.username), el('span', { class: 'track' }, fill), el('span', { class: 'n' }, String(p.count)));
      }),
    );
    if (!d.players.length) $('museum-players').append(el('li', { class: 'muted' }, 'Aucune pépite pour l\'instant : à vous de creuser !'));
    const q = $('museum-search').value.trim().toLowerCase();
    const shown = d.entries.filter((e) => !q || `${e.answer} ${e.theme} ${e.username}`.toLowerCase().includes(q));
    const box = $('museum-list');
    box.replaceChildren();
    let day = null;
    let list = null;
    for (const e of shown) {
      if (e.day !== day) {
        day = e.day;
        box.append(el('h3', {}, formatDay(day, { weekday: 'long', day: 'numeric', month: 'long' })));
        list = el('ul', { class: 'museum-list' });
        box.append(list);
      }
      const gem = el('canvas', { class: 'museum-gem', width: '16', height: '16', 'aria-hidden': 'true' });
      Icons.drawIcon(gem, 'pepite');
      list.append(el('li', { class: e.me ? 'me' : '' }, gem, el('div', { class: 'museum-what' }, el('strong', {}, e.answer), el('span', { class: 'muted small' }, e.duel ? `${e.theme} · en duel` : e.theme)), el('span', { class: 'who' }, avatarEl(e.avatar, 'head', 2), e.username)));
    }
    if (!shown.length && d.entries.length) box.append(el('p', { class: 'muted' }, 'Rien ne correspond à cette recherche.'));
  }

  $('btn-museum').addEventListener('click', () => openMuseum());
  $('btn-museum-home').addEventListener('click', () => goHome());
  $('museum-search').addEventListener('input', () => app.museum && renderMuseum());

  const MUSEUM_SEEN_KEY = 'speleo-museum-seen';
  // Pépites du jour déjà vues (« AAAA-MM-JJ:n ») : elles n'entrent au musée que le lendemain, mais l'onglet « Mine » les signale tout de suite.
  const MUSEUM_TODAY_KEY = 'speleo-museum-today';
  const readKey = (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const writeKey = (key, value) => {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* sans stockage */
    }
  };
  /** Nouvelles pépites : celles qui viennent d'entrer au musée, plus celles du jour pas encore vues. */
  function museumFresh(d) {
    let seen = readKey(MUSEUM_SEEN_KEY);
    const [seenDay, seenN] = (readKey(MUSEUM_TODAY_KEY) || '').split(':');
    if (seen === null) {
      writeKey(MUSEUM_SEEN_KEY, d.total);
      seen = String(d.total);
    }
    let base = Number(seen);
    // Le jour a changé : les pépites du jour déjà vues viennent d'entrer au musée, on ne les compte pas deux fois.
    if (seenDay && d.day && seenDay < d.day) {
      if (d.day && Date.parse(`${d.day}T12:00:00Z`) - Date.parse(`${seenDay}T12:00:00Z`) <= 86400000) base += Number(seenN) || 0;
      writeKey(MUSEUM_SEEN_KEY, Math.min(base, d.total));
      writeKey(MUSEUM_TODAY_KEY, `${d.day}:0`);
    }
    const todaySeen = seenDay === d.day ? Number(seenN) || 0 : 0;
    return Math.max(0, d.total - Math.min(base, d.total)) + Math.max(0, (d.todayCount || 0) - todaySeen);
  }
  async function loadMuseumNote() {
    try {
      const d = await api('/api/museum?light=1');
      app.museumTotal = d.total;
      app.museumDay = d.day;
      app.museumTodayCount = d.todayCount || 0;
      app.museumNew = museumFresh(d);
      if (!$('bottom-nav').hidden) updateBubbles();
      $('museum-note').textContent = d.total
        ? `${plural(d.total, 'pépite découverte', 'pépites découvertes')} par le groupe${d.todayCount ? `, et ${plural(d.todayCount, 'nouvelle', 'nouvelles')} aujourd'hui à dévoiler demain` : ''}.`
        : "Toutes les réponses que personne n'avait trouvées avant.";
    } catch {
      /* la note reste générique */
    }
  }

  // ---------- Le Petit Mineur : les dernières nouvelles de la mine ----------
  function ago(ts, now) {
    const min = Math.max(0, Math.round((now - ts) / 60000));
    if (min < 2) return "à l'instant";
    if (min < 60) return `il y a ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `il y a ${h} h`;
    const d = Math.round(h / 24);
    return d === 1 ? 'hier' : `il y a ${d} jours`;
  }

  /**
   * Journal de la mine. Nouvel accueil : cinq nouvelles récentes, « Tout voir » pour le reste, et un jour précis au choix.
   * `date` (AAAA-MM-JJ) : uniquement les nouvelles de ce jour-là.
   */
  async function loadFeed(limit, date = null) {
    const nice = betaOn('betaHome');
    if (limit === undefined) limit = nice ? 5 : 3;
    try {
      const { events: all, now } = await api(`/api/feed?limit=${date ? 60 : nice && limit > 10 ? 60 : Math.max(limit, 10)}${date ? `&date=${date}` : ''}`);
      const events = all.slice(0, limit);
      app.feedLimit = limit;
      app.feedDate = date;
      if (!date) {
        app.feedNewest = all.reduce((m, e) => Math.max(m, e.ts || 0), 0);
        let seen = 0;
        try {
          seen = Number(localStorage.getItem(FEED_SEEN_KEY)) || 0;
        } catch {
          /* sans stockage : pas de pastille pour le journal */
          seen = app.feedNewest;
        }
        app.drawerNews = app.drawerNews || {};
        app.drawerNews.feed = app.feedNewest > seen;
        app.feedNew = all.filter((e) => (e.ts || 0) > seen && e.type !== 'pepite').length;
        updateDrawerDot();
        if (!$('bottom-nav').hidden) updateBubbles();
      }
      $('feed-list').replaceChildren(
        ...events.map((e) => {
          const icon = el('canvas', { class: 'feed-icon', width: '16', height: '16', 'aria-hidden': 'true' });
          Icons.drawIcon(icon, e.icon);
          return el('li', {}, icon, e.user ? avatarEl(e.user.avatar, 'head', 2) : null, el('div', { class: 'feed-text' }, el('span', {}, e.text), el('span', { class: 'feed-ago' }, date ? hourOf(e.ts) : ago(e.ts, now))));
        }),
      );
      if (!events.length) {
        $('feed-list').append(el('li', { class: 'muted' }, date ? 'Rien de notable ce jour-là.' : betaOn('betaWarm') ? 'Pas encore de nouvelles : la mine est calme… pour l\'instant !' : 'Pas encore de nouvelles : la mine est calme.'));
      }
      $('feed-tools').hidden = !nice;
      const today = app.me && app.me.today ? app.me.today.day : null;
      $('feed-label').textContent = date ? `${date === today ? 'Aujourd\'hui · ' : ''}${formatDay(date, { weekday: 'long', day: 'numeric', month: 'long' })}` : 'Dernières nouvelles';
      $('btn-feed-next').disabled = !date;
      const more = $('btn-feed-more');
      more.hidden = date ? false : limit >= (nice ? 60 : 10) || all.length <= limit;
      more.textContent = nice ? 'Tout voir' : 'Plus de nouvelles';
      if (date) more.hidden = true;
    } catch {
      /* le journal est facultatif */
    }
  }
  const hourOf = (ts) => new Date(ts).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' });
  $('btn-feed-more').addEventListener('click', () => loadFeed(betaOn('betaHome') ? 60 : 10));
  // Parcourir le journal jour par jour (flèches, comme le podium) : « Dernières nouvelles » est l'état de départ.
  const shiftFeedDay = (day, n) => {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  $('btn-feed-prev').addEventListener('click', () => {
    const today = app.me && app.me.today ? app.me.today.day : null;
    if (!today) return;
    loadFeed(60, app.feedDate ? shiftFeedDay(app.feedDate, -1) : today);
  });
  $('btn-feed-next').addEventListener('click', () => {
    const today = app.me && app.me.today ? app.me.today.day : null;
    if (!app.feedDate) return;
    const next = shiftFeedDay(app.feedDate, 1);
    loadFeed(...(today && next > today ? [] : [60, next]));
  });

  // ---------- Annonces du responsable ----------
  function renderAnnouncements() {
    const list = (app.me && app.me.announcements) || [];
    $('announce-card').hidden = !list.length;
    $('announce-list').replaceChildren(...list.map((a) => el('p', { class: 'announce-text' }, a.text)));
  }

  $('btn-announce-ok').addEventListener('click', () => {
    const list = (app.me && app.me.announcements) || [];
    if (!list.length) return;
    const last = Math.max(...list.map((a) => a.id));
    app.me.announcements = [];
    renderAnnouncements();
    api('/api/announcements/seen', { id: last }).catch(() => {});
  });

  async function loadAdminAnnouncements() {
    const card = $('admin-announcements');
    card.hidden = !(app.me && app.me.isAdmin);
    if (card.hidden) return;
    try {
      const { announcements } = await api('/api/admin/announcements');
      const state = { active: 'en ligne', expired: 'terminée', removed: 'retirée' };
      $('announce-admin-list').replaceChildren(
        ...announcements.map((a) => {
          const row = el('li', { class: 'report' }, el('p', {}, a.text), el('p', { class: 'muted small' }, `${formatDay(new Date(a.createdAt).toISOString().slice(0, 10), { day: 'numeric', month: 'long' })} · ${state[a.status]}${a.status === 'active' ? ` jusqu'au ${formatDay(new Date(a.expiresAt).toISOString().slice(0, 10), { day: 'numeric', month: 'long' })}` : ''}`));
          if (a.status === 'active') {
            const remove = el('button', { class: 'btn ghost small-btn', type: 'button' }, 'Retirer');
            remove.addEventListener('click', async () => {
              remove.disabled = true;
              try {
                await api('/api/admin/announcements/remove', { id: a.id });
                loadAdminAnnouncements();
              } catch (err) {
                $('announce-status').textContent = err.message;
                remove.disabled = false;
              }
            });
            row.append(remove);
          }
          return row;
        }),
      );
    } catch (err) {
      $('announce-status').textContent = err.message;
    }
  }

  $('form-announce').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = $('announce-status');
    status.textContent = '';
    try {
      await api('/api/admin/announcements', { text: $('announce-text').value, days: Number($('announce-days').value) });
      $('announce-text').value = '';
      status.textContent = 'Annonce publiée : les joueurs la verront à leur prochaine ouverture du jeu.';
      loadAdminAnnouncements();
    } catch (err) {
      status.textContent = err.message;
    }
  });

  // ---------- Santé du jeu (responsable) ----------
  const agoText = (ms) => {
    const min = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (min < 60) return `il y a ${min} min`;
    if (min < 48 * 60) return `il y a ${Math.round(min / 60)} h`;
    return `il y a ${Math.round(min / 1440)} j`;
  };
  const sizeText = (bytes) => (bytes == null ? '?' : bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} Mo` : `${Math.round(bytes / 1024)} Ko`);
  const uptimeText = (s) => (s < 3600 ? `${Math.round(s / 60)} min` : s < 172800 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} j`);

  async function loadHealth() {
    const card = $('admin-health');
    card.hidden = !(app.me && app.me.isAdmin);
    if (card.hidden) return;
    try {
      app.health = await api('/api/admin/health');
      renderHealth();
    } catch (err) {
      $('health-state').textContent = err.message;
    }
  }

  function renderHealth() {
    const h = app.health;
    const state = $('health-state');
    state.className = `health-state ${h.ok ? 'ok' : 'bad'}`;
    state.textContent = h.ok ? '✓ Tout va bien.' : `⚠ ${h.problems.join(' ')}`;
    $('health-sub').textContent = h.ok ? 'tout va bien' : 'à vérifier';
    const line = (label, value) => el('li', { class: 'health-line' }, el('span', {}, label), el('span', { class: 'muted' }, value));
    $('health-facts').replaceChildren(
      line('Version de la page', `${h.version}${h.release ? ` · mise en ligne ${h.release.slice(0, 7)}` : ''}`),
      line('Fonctionne depuis', uptimeText(h.uptimeSeconds)),
      line('Base de données', `${sizeText(h.database.bytes)} · intégrité : ${h.database.integrity}`),
      line('Comptes · parties', `${h.totals.users} · ${h.totals.games}`),
      line('À traiter', `${plural(h.totals.reportsPending, 'signalement', 'signalements')} · ${plural(h.totals.duelsToValidate, 'duel à valider', 'duels à valider')}`),
    );
    $('health-backups').replaceChildren(
      ...(h.backups.list.length
        ? h.backups.list.map((b) => line(`${b.kind} · ${b.name.replace(/^speleologie-|\.sqlite$/g, '')}`, `${agoText(b.at)} · ${sizeText(b.bytes)}`))
        : [el('li', { class: 'muted' }, 'Aucune sauvegarde.')]),
    );
    $('health-errors').replaceChildren(
      ...(h.errors.recent.length
        ? h.errors.recent.map((e) =>
            el(
              'li',
              { class: 'health-err' },
              el('strong', {}, `${e.kind} · ${e.message}`),
              el('span', { class: 'muted' }, ` ${agoText(e.at)}${e.path ? ` · ${e.path}` : ''}`),
              e.detail ? el('pre', {}, e.detail) : null,
            ),
          )
        : [el('li', { class: 'muted' }, 'Aucune erreur enregistrée.')]),
    );
  }

  $('btn-health-backup').addEventListener('click', async () => {
    try {
      const res = await api('/api/admin/backup', {});
      showNotice(`Sauvegarde créée : ${res.name}`);
      loadHealth();
    } catch (err) {
      showNotice(err.message);
    }
  });
  $('btn-health-clear').addEventListener('click', async () => {
    if (!window.confirm('Vider le journal des erreurs ?')) return;
    await api('/api/admin/errors/clear', {}).catch(() => {});
    loadHealth();
  });
  $('btn-health-copy').addEventListener('click', async () => {
    const h = app.health;
    if (!h) return;
    const text = [
      `Santé du jeu : ${h.ok ? 'OK' : h.problems.join(' ')}`,
      `Version ${h.version} (${h.release || '?'}), en marche depuis ${uptimeText(h.uptimeSeconds)}, Node ${h.node}`,
      `Base ${sizeText(h.database.bytes)}, intégrité ${h.database.integrity}; ${h.totals.users} comptes, ${h.totals.games} parties`,
      `Sauvegardes : ${h.backups.list.map((b) => `${b.kind} ${b.name}`).join(', ') || 'aucune'}`,
      'Erreurs récentes :',
      ...h.errors.recent.map((e) => `- ${new Date(e.at).toISOString()} ${e.kind} ${e.path || ''} ${e.message}${e.detail ? `\n${e.detail}` : ''}`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showNotice('Rapport copié.');
    } catch {
      showNotice('Copie impossible sur cet appareil.');
    }
  });

  // ---------- Contre maître (responsable du jeu) ----------
  // Administration en trois onglets : contenu (thèmes, réponses), joueurs (suivi, duels, messages) et jeu (santé, annonces).
  // Une pastille sur l'onglet totalise ce qui attend le responsable.
  const ADMIN_TAB_OF = { reports: 'contenu', suggestions: 'contenu', duels: 'joueurs', msgreports: 'joueurs', suspicions: 'joueurs' };
  app.adminCounts = {};
  function setAdminCount(key, n) {
    app.adminCounts[key] = n;
    for (const tab of ['contenu', 'joueurs', 'jeu']) {
      const total = Object.entries(app.adminCounts).reduce((sum, [k, v]) => sum + (ADMIN_TAB_OF[k] === tab ? v : 0), 0);
      const dot = $(`atab-count-${tab}`);
      dot.hidden = !total;
      dot.textContent = total;
    }
  }
  function setAdminTab(tab) {
    app.adminTab = tab;
    $('view-admin').dataset.active = tab;
    $('admin-tabs').querySelectorAll('button').forEach((b) => {
      const active = b.dataset.atabGo === tab;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
  }
  $('admin-tabs').addEventListener('click', (event) => {
    const b = event.target.closest('button[data-atab-go]');
    if (b) setAdminTab(b.dataset.atabGo);
  });

  // ---------- Suspicions (responsable du jeu) ----------
  async function loadSuspicions(days = app.suspDays || 14) {
    const card = $('admin-suspicions');
    card.hidden = !(app.me && app.me.isAdmin);
    if (card.hidden) return;
    app.suspDays = days;
    $('susp-tabs').querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', Number(t.dataset.susp) === days));
    try {
      const { players } = await api(`/api/admin/suspicions?days=${days}`);
      const marked = players.filter((p) => p.level !== 'rien');
      setAdminCount('suspicions', marked.length);
      $('susp-sub').textContent = marked.length ? `${plural(marked.length, 'joueur à regarder', 'joueurs à regarder')}` : 'rien à signaler';
      $('susp-status').textContent = players.length ? '' : `Aucune réponse enregistrée sur ${days} jours.`;
      const tagText = { forte: 'Plusieurs signaux', 'a-observer': 'À observer' };
      $('susp-list').replaceChildren(
        ...players.map((p) => {
          const counts = [
            p.pastes ? `${p.pastes} collé${p.pastes > 1 ? 's' : ''}` : null,
            p.copies ? `${p.copies} copie${p.copies > 1 ? 's' : ''} tentée${p.copies > 1 ? 's' : ''}` : null,
            p.fastRare ? `${p.fastRare} rapide${p.fastRare > 1 ? 's' : ''}` : null,
            p.away ? `${p.away} page${p.away > 1 ? 's' : ''} quittée${p.away > 1 ? 's' : ''}` : null,
          ].filter(Boolean);
          const head = el(
            'span',
            { class: 'what' },
            el('strong', {}, p.username, p.level !== 'rien' ? el('span', { class: `susp-tag ${p.level}` }, tagText[p.level]) : null),
            el('span', { class: 'muted' }, `${plural(p.rounds, 'thème', 'thèmes')} sur ${days} jours${counts.length ? ` · ${counts.join(' · ')}` : ''}`),
          );
          const item = el('li', { class: `report susp ${p.level === 'rien' ? 'handled' : 'pending'}` }, head);
          if (p.flagged.length) {
            item.append(
              el(
                'details',
                { class: 'fold-inner' },
                el('summary', {}, 'Voir les thèmes concernés'),
                ...p.flagged.map((f) =>
                  el('p', { class: 'muted susp-why' }, `${formatDay(f.day, { day: 'numeric', month: 'short' })} · ${f.mode === 'daily' ? 'forage du jour' : f.mode === 'duel' ? 'duel' : 'infini'} · « ${f.theme} »${f.answer ? ` → ${f.answer}` : ''} : ${f.why.join(', ')}`),
                ),
              ),
            );
          }
          return item;
        }),
      );
    } catch (err) {
      $('susp-status').textContent = err.message;
    }
  }
  $('susp-tabs').addEventListener('click', (event) => {
    const t = event.target.closest('.tab');
    if (t) loadSuspicions(Number(t.dataset.susp));
  });

  async function openAdmin() {
    if (!app.me || !app.me.isAdmin) return;
    stopTimer();
    show('admin');
    setAdminTab(app.adminTab || 'contenu');
    initFolds('view-admin');
    loadHealth();
    loadAdminAnnouncements();
    loadReports();
    loadInvite();
    loadUnknownAnswers();
    loadProbe();
    loadReverse();
    loadMessageReports();
    loadAdminSuggestions();
    loadPendingDuels();
    loadSuspicions();
    loadDashboard();
  }
  $('btn-admin').addEventListener('click', () => openAdmin());
  $('btn-admin-home').addEventListener('click', () => goHome());

  /** Bouton de l'accueil, visible seulement pour le responsable : nombre de signalements et de propositions à traiter. */
  async function renderAdminHome() {
    const card = $('admin-home');
    card.hidden = !(app.me && app.me.isAdmin);
    if (card.hidden) return;
    try {
      const [dash, sug] = await Promise.all([api('/api/admin/dashboard'), api('/api/admin/theme-suggestions')]);
      const pending = (sug.suggestions || []).filter((x) => !x.handled).length;
      const bits = [];
      if (dash.pendingReports) bits.push(plural(dash.pendingReports, 'signalement à vérifier', 'signalements à vérifier'));
      if (pending) bits.push(plural(pending, 'thème proposé à examiner', 'thèmes proposés à examiner'));
      $('admin-home-note').textContent = bits.length ? bits.join(' · ') : 'Rien à traiter pour le moment.';
      app.drawerNews = app.drawerNews || {};
      app.drawerNews.admin = bits.length > 0;
      app.adminPending = (dash.pendingReports || 0) + pending;
      if (!$('bottom-nav').hidden) updateBubbles();
      updateDrawerDot();
    } catch {
      /* le bouton reste utilisable sans ces compteurs */
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
    renderSkulls(profile.skulls);
  }

  /** Collection de crânes (jours de collection) : un compteur par qualité, et les récompenses à atteindre. */
  function renderSkulls(sk) {
    const fold = $('fold-cranes');
    fold.hidden = !sk || (!sk.total && !sk.active);
    if (fold.hidden) return;
    const order = ['evident', 'courant', 'original', 'rare', 'pepite'];
    $('skull-grid').replaceChildren(
      ...order.map((tier) => {
        const icon = el('canvas', { class: `skull-icon${sk.counts[tier] ? '' : ' none'}`, width: '8', height: '7', 'aria-hidden': 'true' });
        sprite(icon.getContext('2d'), HW_SKULL, { '#': Pixel.TIER_COLORS[tier] || '#888' }, 0, 0);
        return el('div', { class: 'skull-cell' }, icon, el('strong', {}, String(sk.counts[tier])), el('span', { class: 'muted small' }, sk.labels[tier]));
      }),
    );
    $('skulls-sub').textContent = `${plural(sk.total, 'crâne', 'crânes')} au total`;
    $('skull-note').textContent = sk.complete
      ? "Les cinq qualités sont réunies : l'apparence « Jack-o'-lantern » est à toi."
      : `${Math.min(sk.total, sk.target)} / ${sk.target} crânes pour le badge « Collectionneur de crânes » · réunis les cinq qualités pour l'apparence « Jack-o'-lantern ».`;
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
            el('span', { class: 'fold-t' }, el('span', {}, title), el('span', { class: 'muted small' }, ` ${earned}/${all.length}`), betaOn('betaProfil') ? el('span', { class: 'mini-bar', 'aria-hidden': 'true' }, (() => { const f = el('span', { class: 'mini-fill' }); f.style.width = `${Math.round((earned / all.length) * 100)}%`; return f; })()) : null, fresh ? el('span', { class: 'new-dot' }, 'nouveau') : null),
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
    const NAMES = { body: 'carrosseries', bit: 'forets', timer: 'chronos' };
    const filtered = (type, list) => (betaOn('betaProfil') && !prof.locked[type] ? list.filter((s) => s.unlocked) : list);
    // Lien « Voir celles à gagner » sous chaque liste (nouveau profil seulement).
    document.querySelectorAll('.wk-toggle').forEach((b) => {
      const type = b.dataset.wk;
      const list = { body: app.profile.bodies, bit: app.profile.bits, timer: app.profile.timers }[type];
      const locked = list.filter((s) => !s.unlocked).length;
      b.hidden = !betaOn('betaProfil') || !locked;
      b.textContent = prof.locked[type] ? `Masquer les ${NAMES[type]} à gagner` : `Voir les ${locked} ${NAMES[type]} à gagner`;
    });
    const grid = (type, list, target) => {
      const current = type === 'body' ? app.skin.body : app.skin.bit;
      target.replaceChildren(
        ...filtered(type, list).map((s) => {
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
      ...filtered('timer', app.profile.timers).map((t) => {
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

  document.querySelectorAll('.wk-toggle').forEach((b) =>
    b.addEventListener('click', () => {
      prof.locked[b.dataset.wk] = !prof.locked[b.dataset.wk];
      renderWorkshop();
    }),
  );

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

  // ---------- Duels à valider (responsable du jeu) ----------
  async function loadPendingDuels() {
    const card = $('admin-duels');
    card.hidden = !(app.me && app.me.isAdmin);
    if (card.hidden) return;
    try {
      const { duels } = await api('/api/admin/duels/pending');
      setAdminCount('duels', duels.length);
      $('duels-valid-sub').textContent = duels.length ? `${duels.length} en attente de 2 h 30` : 'rien en attente';
      $('duels-valid-list').replaceChildren(
        ...duels.map((d) => {
          const btn = el('button', { class: 'btn small-btn', type: 'button' }, 'Valider maintenant');
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
              await api('/api/admin/duels/validate', { id: d.id });
              $('duels-valid-status').textContent = `Duel ${d.challenger} contre ${d.opponent} validé.`;
              loadPendingDuels();
            } catch (err) {
              $('duels-valid-status').textContent = err.message;
              btn.disabled = false;
            }
          });
          return el('li', { class: 'report pending' }, el('span', { class: 'what' }, el('strong', {}, `${d.challenger} contre ${d.opponent}`)), btn);
        }),
      );
    } catch (err) {
      $('duels-valid-status').textContent = err.message;
    }
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
    setAdminCount('reports', app.reports.filter((r) => r.status === 'pending').length);
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
        // Réponse non reconnue : le responsable désigne la réponse visée (geste ponctuel, les règles ne changent pas).
        // Une seule liste par signalement, partagée par « Accorder les points » et « Accepter ».
        let pick = null;
        if (!r.inTheme && ((r.reporters || []).some((p) => p.creditableDay) || r.status === 'pending')) {
          pick = el('select', { 'aria-label': 'Réponse visée' }, el('option', { value: '' }, 'Réponse visée…'));
          api(`/api/admin/theme-answers?themeId=${encodeURIComponent(r.themeId)}`)
            .then(({ answers }) => answers.forEach((a) => pick.append(el('option', { value: a.key }, a.label))))
            .catch(() => {});
          item.append(pick);
        }
        (r.reporters || []).filter((p) => p.creditableDay).forEach((p) => {
          const give = el('button', { class: 'link', type: 'button' }, `Accorder les points à ${p.username} (${p.duel ? 'duel' : 'forage'} du ${longDay(p.creditableDay)})`);
          give.addEventListener('click', async () => {
            const answerKey = pick ? pick.value : undefined;
            if (pick && !answerKey) return showNotice('Choisis d\'abord la réponse visée.');
            const what = pick ? pick.selectedOptions[0].textContent : r.input;
            if (!window.confirm(`Accorder à ${p.username} les points de « ${what} » pour ${p.duel ? 'son duel' : 'le forage'} du ${longDay(p.creditableDay)} ?${p.duel ? ' Le résultat du duel sera révisé.' : ''}`)) return;
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
        // Un seul geste : points à tous les signalants (forages et duels), retour « acceptée » et signalement traité.
        if ((r.reporters || []).some((p) => p.creditableDay) || r.status === 'pending') {
          const all = el('button', { class: 'link', type: 'button' }, 'Accepter : points à tous + retour + traité');
          all.addEventListener('click', async () => {
            const answerKey = pick ? pick.value : undefined;
            if (pick && !answerKey) return showNotice('Choisis d\'abord la réponse visée.');
            if (!window.confirm(`Accepter « ${r.input} » : accorder les points à tous les signalants qui peuvent les recevoir (les duels concernés seront révisés) et envoyer le retour ?`)) return;
            try {
              const res = await api('/api/admin/reports/grant', { themeId: r.themeId, inputKey: r.inputKey, answerKey, message: msg.value });
              showNotice(`${plural(res.granted.length, 'joueur crédité', 'joueurs crédités')}${res.skipped.length ? `, ${res.skipped.length} sans manche à créditer` : ''}.`);
              await loadReports();
            } catch (err) {
              showNotice(err.message);
            }
          });
          item.append(all);
        }
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

  // Décisions en lot : aperçu d'abord, puis application.
  async function runDecisions(dryRun) {
    const out = $('decisions-result');
    let decisions;
    try {
      decisions = JSON.parse($('decisions-text').value);
    } catch {
      return out.replaceChildren(el('li', {}, 'Le texte collé n\'est pas du JSON valide.'));
    }
    if (!dryRun && !window.confirm(`Appliquer ${plural(decisions.length, 'décision', 'décisions')} ? Les points seront accordés et les retours envoyés.`)) return;
    try {
      const { results } = await api('/api/admin/reports/decisions', { decisions, dryRun });
      out.replaceChildren(
        ...results.map((r) => el('li', { class: `report ${r.ok ? 'handled' : 'pending'}` }, el('strong', {}, `${r.ok ? '✓' : '✗'} « ${r.input} »`), el('span', { class: 'muted' }, ` ${r.themeId} — ${r.note}`))),
      );
      if (!dryRun) loadReports();
    } catch (err) {
      out.replaceChildren(el('li', {}, err.message));
    }
  }
  $('btn-decisions-preview').addEventListener('click', () => runDecisions(true));
  $('btn-decisions-apply').addEventListener('click', () => runDecisions(false));

  // Décider un par un : une fenêtre, un signalement à la fois, aperçu des conséquences avant d'accepter.
  const REFUSALS = [
    ['Ne correspond pas au thème', 'Cette réponse ne correspond pas au thème.'],
    ['Trop vague', 'Cette réponse est trop vague pour ce thème : sois plus précis.'],
    ['Déjà connue sous un autre nom', 'Cette réponse existe déjà sous un autre nom : essaie son nom exact.'],
    ['Hors liste', 'Cette réponse ne fait pas partie de la liste fermée de ce thème.'],
  ];
  const decide = { queue: [], index: 0, later: new Set(), done: 0, busy: false };

  function decideKey(r) {
    return `${r.themeId}|${r.inputKey}`;
  }

  function openDecide() {
    decide.queue = (app.reports || []).filter((r) => r.status === 'pending');
    decide.later = new Set();
    decide.index = 0;
    decide.done = 0;
    if (!decide.queue.length) return showNotice('Aucun signalement à traiter.');
    const dialog = $('decide-dialog');
    if (!dialog.open) dialog.showModal();
    renderDecide();
  }

  function nextDecide() {
    // Prochain signalement non reporté ; fin de file : on propose de revenir sur ceux mis de côté.
    const rest = decide.queue.filter((r) => r.status === 'pending' && !decide.later.has(decideKey(r)));
    if (rest.length) {
      decide.index = decide.queue.indexOf(rest[0]);
      return renderDecide();
    }
    const postponed = decide.queue.filter((r) => r.status === 'pending');
    $('decide-count').textContent = '';
    $('decide-body').replaceChildren(
      el('p', {}, decide.done ? `✓ ${plural(decide.done, 'décision appliquée', 'décisions appliquées')}.` : 'Rien n\'a été décidé.'),
      postponed.length
        ? el('button', { class: 'btn secondary', type: 'button', id: 'decide-again' }, `Revoir les ${postponed.length} mis de côté`)
        : el('p', { class: 'muted' }, 'Plus aucun signalement à traiter.'),
    );
    const again = $('decide-again');
    if (again) again.addEventListener('click', () => { decide.later = new Set(); nextDecide(); });
  }

  function renderDecide() {
    const r = decide.queue[decide.index];
    if (!r || r.status !== 'pending') return nextDecide();
    const pending = decide.queue.filter((x) => x.status === 'pending');
    $('decide-count').textContent = `${pending.length} à traiter`;
    const known = !!r.inTheme;
    const message = el('textarea', { rows: 2, maxlength: 600, 'aria-label': 'Message au joueur' });
    message.value = 'Réponse acceptée : merci pour ton signalement !';
    const preview = el('p', { class: 'muted small decide-preview', role: 'status' });
    // Réponse visée : champ avec liste des réponses du thème (saisie semi-automatique), suggestions en un geste.
    const listId = 'decide-answers';
    const target = el('input', { list: listId, placeholder: 'Réponse visée du thème…', autocomplete: 'off', 'aria-label': 'Réponse visée' });
    const datalist = el('datalist', { id: listId });
    const near = el('div', { class: 'decide-near' });
    const choose = (label) => {
      target.value = label;
      refreshPreview();
    };
    (r.near || []).forEach((label) => {
      const chip = el('button', { class: 'chip', type: 'button' }, label);
      chip.addEventListener('click', () => choose(label));
      near.append(chip);
    });
    const body = {
      themeId: r.themeId,
      input: r.input,
      verdict: 'accepter',
    };
    let previewTimer = 0;
    const refreshPreview = () => {
      clearTimeout(previewTimer);
      if (!known && !target.value.trim()) {
        preview.textContent = 'Choisis la réponse visée pour voir ce qui se passera.';
        return;
      }
      previewTimer = setTimeout(async () => {
        try {
          const { results } = await api('/api/admin/reports/decisions', { decisions: [{ ...body, answer: known ? undefined : target.value.trim() }], dryRun: true });
          preview.textContent = results[0].ok ? `Si tu acceptes : ${results[0].note}` : /non reconnue/.test(results[0].note) ? 'Cette réponse n\'est pas dans le thème : choisis-en une dans la liste.' : results[0].note;
        } catch (err) {
          preview.textContent = err.message;
        }
      }, 150);
    };
    target.addEventListener('input', refreshPreview);
    if (!known) {
      api(`/api/admin/theme-answers?themeId=${encodeURIComponent(r.themeId)}`)
        .then(({ answers }) => datalist.replaceChildren(...answers.map((a) => el('option', { value: a.label }))))
        .catch(() => {});
    }
    const refusals = el('select', { 'aria-label': 'Message de refus' }, el('option', { value: '' }, 'Message de refus…'), ...REFUSALS.map(([label, text]) => el('option', { value: text }, label)));
    refusals.addEventListener('change', () => {
      if (refusals.value) message.value = refusals.value;
    });

    const apply = async (verdict) => {
      if (decide.busy) return;
      if (verdict === 'accepter' && !known && !target.value.trim()) return showNotice('Choisis d\'abord la réponse visée.');
      decide.busy = true;
      try {
        const decision = { themeId: r.themeId, input: r.input, verdict, message: message.value };
        if (verdict === 'accepter' && !known) decision.answer = target.value.trim();
        const { results } = await api('/api/admin/reports/decisions', { decisions: [decision], dryRun: false });
        if (!results[0].ok) {
          preview.textContent = results[0].note;
          return;
        }
        r.status = 'handled';
        decide.done++;
        showNotice(`${verdict === 'accepter' ? 'Acceptée' : 'Refusée'} : ${results[0].note}`);
        loadReports();
        nextDecide();
      } catch (err) {
        preview.textContent = err.message;
      } finally {
        decide.busy = false;
      }
    };
    const accept = el('button', { class: 'btn', type: 'button', id: 'decide-accept' }, 'Accepter (A)');
    const refuse = el('button', { class: 'btn secondary', type: 'button', id: 'decide-refuse' }, 'Refuser (R)');
    const later = el('button', { class: 'btn ghost', type: 'button', id: 'decide-later' }, 'Plus tard (S)');
    const ask = el('button', { class: 'btn ghost', type: 'button' }, 'Copier pour Claude');
    accept.addEventListener('click', () => apply('accepter'));
    refuse.addEventListener('click', () => apply('refuser'));
    later.addEventListener('click', () => {
      decide.later.add(decideKey(r));
      nextDecide();
    });
    ask.addEventListener('click', async () => {
      const line = `${r.themeId} (${r.themeTitle}) : ${r.input} — ${plural(r.players, 'joueur', 'joueurs')}`;
      try {
        await navigator.clipboard.writeText(line);
        showNotice('Copié : colle-le dans la conversation avec Claude.');
      } catch {
        showNotice(line);
      }
      decide.later.add(decideKey(r));
      nextDecide();
    });

    $('decide-body').replaceChildren(
      el('p', { class: 'muted' }, r.themeTitle),
      el('p', { class: 'decide-input' }, `« ${r.input} »`),
      el('p', { class: 'muted' }, `${plural(r.players, 'joueur la propose', 'joueurs la proposent')}${r.reporters && r.reporters.length ? ` : ${r.reporters.map((p) => p.username).join(', ')}` : ''}`),
      known
        ? el('p', {}, `Le thème la reconnaît déjà comme « ${r.inTheme} » : accepter rend les points aux joueurs concernés.`)
        : el('div', {}, el('label', {}, 'Réponse visée', target, datalist), near),
      preview,
      el('label', {}, 'Message au joueur', message),
      refusals,
      el('div', { class: 'decide-actions' }, accept, refuse, later, ask),
    );
    refreshPreview();
  }

  $('btn-decide').addEventListener('click', openDecide);
  $('decide-close').addEventListener('click', () => $('decide-dialog').close());
  $('decide-dialog').addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const press = { a: 'decide-accept', r: 'decide-refuse', s: 'decide-later' }[(event.key || '').toLowerCase()];
    if (press && $(press)) {
      event.preventDefault();
      $(press).click();
    }
  });

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

  // ---------- Code d'invitation (responsable du jeu) ----------
  async function loadInvite() {
    const card = $('admin-invite');
    card.hidden = !(app.me && app.me.isAdmin);
    if (card.hidden) return;
    try {
      const { code } = await api('/api/admin/invite-code');
      $('invite-input').value = code || '';
      $('invite-sub').textContent = code ? 'inscriptions sur invitation' : 'inscriptions libres';
    } catch (err) {
      $('invite-status').textContent = err.message;
    }
  }
  $('form-invite').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const { code } = await api('/api/admin/invite-code', { code: $('invite-input').value });
      $('invite-sub').textContent = code ? 'inscriptions sur invitation' : 'inscriptions libres';
      $('invite-status').textContent = code ? `Code enregistré : « ${code} ». Donne-le aux personnes que tu invites.` : 'Plus de code : les inscriptions sont libres.';
    } catch (err) {
      $('invite-status').textContent = err.message;
    }
  });

  // ---------- Réponses refusées (responsable du jeu) ----------
  async function loadUnknownAnswers() {
    const card = $('admin-unknown');
    card.hidden = !(app.me && app.me.isAdmin);
    if (card.hidden) return;
    try {
      const { answers } = await api('/api/admin/unknown-answers');
      app.unknownAnswers = answers;
      renderUnknownAnswers();
    } catch (err) {
      $('unknown-status').textContent = err.message;
    }
  }

  function renderUnknownAnswers() {
    const answers = app.unknownAnswers || [];
    $('unknown-list').replaceChildren(
      ...answers.map((a) => {
        const ignore = el('button', { class: 'link', type: 'button' }, 'Ignorer');
        ignore.addEventListener('click', async () => {
          try {
            await api('/api/admin/unknown-answers/ignore', { themeId: a.themeId, inputKey: a.inputKey });
            app.unknownAnswers = app.unknownAnswers.filter((x) => x !== a);
            renderUnknownAnswers();
          } catch (err) {
            $('unknown-status').textContent = err.message;
          }
        });
        return el('li', { class: 'report' }, el('span', { class: 'what' }, el('strong', {}, `« ${a.input} »`), el('span', { class: 'muted' }, a.themeTitle)), el('span', { class: 'muted' }, plural(a.count, 'fois', 'fois')), ignore);
      }),
    );
    if (!answers.length) $('unknown-list').append(el('li', { class: 'muted' }, 'Aucune saisie refusée à examiner.'));
  }

  $('btn-copy-unknown').addEventListener('click', async () => {
    const answers = app.unknownAnswers || [];
    const text = answers.length ? answers.map((a) => `${a.themeId} (${a.themeTitle}) : ${a.input} — ${plural(a.count, 'fois', 'fois')}`).join('\n') : 'Aucune saisie refusée.';
    try {
      await navigator.clipboard.writeText(text);
      $('unknown-status').textContent = `${plural(answers.length, 'saisie copiée', 'saisies copiées')} : colle-les dans la conversation.`;
    } catch {
      $('unknown-status').textContent = text;
    }
  });



  // ---------- Messagerie entre joueurs ----------
  function updateMessageDot(n) {
    if (app.me) app.me.unreadMessages = n;
    const dot = $('msg-dot');
    dot.hidden = !n;
    dot.textContent = n > 9 ? '9+' : String(n || '');
    $('btn-messages').setAttribute('aria-label', n ? `Messages (${plural(n, 'non lu', 'non lus')})` : 'Messages');
    if (!$('bottom-nav').hidden) updateBubbles();
  }

  /** Portrait d'un correspondant : la petite taupe pour le Contremaître, sinon le personnage du joueur. */
  function msgPortrait(person) {
    if (!person.system) return avatarEl(person.avatar, 'head', 2);
    const canvas = el('canvas', { class: 'msg-mole', 'aria-hidden': 'true' });
    drawMascot(canvas, 'idle');
    return canvas;
  }

  function msgTime(at) {
    const d = new Date(at);
    const sameDay = new Date().toDateString() === d.toDateString();
    return sameDay ? d.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' });
  }

  async function openMessages(withUser) {
    show('messages');
    if (withUser) return openThread(withUser);
    $('msg-list-pane').hidden = false;
    $('msg-thread-pane').hidden = true;
    $('msg-status').textContent = '';
    try {
      const [{ conversations, unread }, { people }] = await Promise.all([api('/api/messages'), api('/api/messages/people')]);
      updateMessageDot(unread);
      app.msgPeople = people;
      $('msg-people').replaceChildren(...people.map((p) => el('option', { value: p.username })));
      const list = $('msg-conversations');
      list.replaceChildren(
        ...conversations.map((c) => {
          const button = el(
            'button',
            { type: 'button' },
            msgPortrait(c),
            el('span', { class: 'who-name' }, c.username),
            el('span', { class: 'msg-last' }, `${c.last.mine ? 'Toi : ' : ''}${c.last.body}`),
            c.unread ? el('span', { class: 'tab-dot' }, String(c.unread)) : el('span', { class: 'muted small' }, msgTime(c.last.at)),
          );
          button.addEventListener('click', () => openThread(c.username));
          return el('li', { class: c.unread ? 'unread' : '' }, button);
        }),
      );
      if (!conversations.length) list.append(el('li', { class: 'muted' }, 'Aucune conversation pour l\'instant : écris à un joueur ci-dessus.'));
    } catch (err) {
      $('msg-status').textContent = err.message;
    }
  }

  async function openThread(name) {
    app.msgWith = name;
    $('msg-list-pane').hidden = true;
    $('msg-thread-pane').hidden = false;
    $('msg-thread-status').textContent = '';
    try {
      renderThread(await api(`/api/messages/thread?with=${encodeURIComponent(name)}`));
    } catch (err) {
      $('msg-thread-status').textContent = err.message;
    }
  }

  function renderThread(data) {
    app.msgWith = data.with.username;
    updateMessageDot(data.unread);
    $('msg-with').textContent = data.with.username;
    // Le Contremaître n'écoute pas : pas de zone de réponse, de blocage ni de signalement.
    $('form-msg-send').hidden = !!data.with.system;
    $('btn-msg-block').hidden = !!data.with.system;
    const block = $('btn-msg-block');
    block.textContent = data.blocked ? 'Débloquer ce joueur' : 'Bloquer ce joueur';
    block.onclick = async () => {
      try {
        renderThread(await api('/api/messages/block', { username: data.with.username, blocked: !data.blocked }));
      } catch (err) {
        $('msg-thread-status').textContent = err.message;
      }
    };
    const list = $('msg-thread');
    list.replaceChildren(
      ...data.messages.map((m) => {
        const meta = el('span', { class: 'msg-meta' }, msgTime(m.at));
        if (!m.mine && !data.with.system) {
          const report = el('button', { class: 'link', type: 'button' }, 'Signaler');
          report.addEventListener('click', async () => {
            try {
              await api('/api/messages/report', { id: m.id });
              report.replaceWith(el('span', {}, 'Signalé au responsable'));
            } catch (err) {
              $('msg-thread-status').textContent = err.message;
            }
          });
          meta.append(' · ', report);
        }
        return el('li', { class: m.mine ? 'mine' : '' }, m.body, meta);
      }),
    );
    if (!data.messages.length && !data.with.system) list.append(el('li', { class: 'muted' }, `Écris le premier message à ${data.with.username}.`));
    list.scrollTop = list.scrollHeight;
  }

  $('btn-messages').addEventListener('click', () => openMessages());
  $('btn-messages-home').addEventListener('click', () => show('home'));
  $('btn-msg-back').addEventListener('click', () => openMessages());
  $('form-msg-new').addEventListener('submit', (event) => {
    event.preventDefault();
    const wanted = $('msg-new-to').value.trim().toLowerCase();
    const person = (app.msgPeople || []).find((p) => p.username.toLowerCase() === wanted);
    if (!person) return void ($('msg-status').textContent = 'Choisis un joueur dans la liste proposée.');
    $('msg-new-to').value = '';
    openThread(person.username);
  });
  $('form-msg-send').addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = $('msg-input').value.trim();
    if (!text || !app.msgWith) return;
    try {
      renderThread(await api('/api/messages/send', { to: app.msgWith, text }));
      $('msg-input').value = '';
      $('msg-thread-status').textContent = '';
    } catch (err) {
      $('msg-thread-status').textContent = err.message;
    }
  });
  $('msg-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      $('form-msg-send').requestSubmit();
    }
  });
  // Pas de minuterie : le compteur de messages non lus se rafraîchit quand l'onglet redevient visible.
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden || !app.me) return;
    try {
      const { unread } = await api('/api/messages');
      updateMessageDot(unread);
      if (!$('view-messages').hidden) {
        if ($('msg-thread-pane').hidden) openMessages();
        else if (app.msgWith) openThread(app.msgWith);
      }
    } catch {
      /* hors ligne : on garde le dernier compteur */
    }
  });

  // Messages signalés (responsable du jeu).
  async function loadMessageReports() {
    const card = $('admin-msg-reports');
    card.hidden = !(app.me && app.me.isAdmin);
    if (card.hidden) return;
    try {
      const { reports } = await api('/api/admin/message-reports');
      setAdminCount('msgreports', reports.length);
      $('msg-reports-status').textContent = reports.length ? '' : 'Aucun message signalé.';
      $('msg-reports-list').replaceChildren(
        ...reports.map((r) => {
          const done = el('button', { class: 'link', type: 'button' }, 'Traité');
          done.addEventListener('click', async () => {
            try {
              await api('/api/admin/message-reports/handled', { id: r.id });
              loadMessageReports();
            } catch (err) {
              $('msg-reports-status').textContent = err.message;
            }
          });
          return el(
            'li',
            { class: 'report' },
            el('span', { class: 'what' }, el('strong', {}, `${r.from} → ${r.to}`), el('span', { class: 'muted' }, `signalé par ${r.reporter} le ${new Date(r.reportedAt).toLocaleString('fr-BE')}`)),
            ...r.context.map((c) => el('span', { class: c.body === r.body ? '' : 'muted small' }, `${c.from} : ${c.body}`)),
            done,
          );
        }),
      );
    } catch (err) {
      $('msg-reports-status').textContent = err.message;
    }
  }

  // ---------- Mode inversé (ébauche, responsable du jeu) ----------
  const VERDICTS = { juste: 'Juste !', proche: 'Proche', non: 'Non', incompris: 'Non compris', vague: 'Trop vague' };

  async function loadReverse() {
    const card = $('admin-reverse');
    card.hidden = !(app.me && app.me.isAdmin);
    if (card.hidden) return;
    try {
      renderReverse(await api('/api/admin/reverse'));
    } catch (err) {
      $('reverse-body').replaceChildren(el('p', { class: 'muted' }, err.message));
    }
  }

  async function reverseAction(path, body) {
    try {
      renderReverse(await api(`/api/admin/reverse/${path}`, body || {}));
    } catch (err) {
      showNotice(err.message);
    }
  }

  function renderReverse(state) {
    const body = $('reverse-body');
    const start = el('button', { class: 'btn', type: 'button' }, state.active ? 'Nouvelle partie' : 'Lancer une partie');
    start.addEventListener('click', () => reverseAction('start'));
    if (!state.active) return body.replaceChildren(start);
    if (state.finished) {
      return body.replaceChildren(el('p', {}, el('strong', {}, `Partie terminée : ${pts(state.score)} sur ${state.rounds * 100}.`)), start);
    }
    const over = state.status !== 'playing';
    const parts = [
      el('p', { class: 'muted small' }, `Manche ${state.round}/${state.rounds} · score ${pts(state.score)} · indice ${state.clues.length}/${state.cluesTotal}${over ? '' : ` · si tu trouves maintenant : ${pts(state.potential)}`}`),
      el('ol', { class: 'reverse-clues' }, ...state.clues.map((c) => el('li', {}, el('strong', {}, c.label), el('span', { class: 'muted small' }, ` niveau ${c.level}`)))),
    ];
    if (state.guesses.length) {
      parts.push(
        el(
          'ul',
          { class: 'report-list reverse-guesses' },
          ...state.guesses.map((g) =>
            el(
              'li',
              { class: `report reverse-${g.verdict}` },
              el('span', { class: 'what' }, el('strong', {}, `« ${g.text} » : ${VERDICTS[g.verdict] || g.verdict}`), el('span', { class: 'muted small' }, g.note)),
              el(
                'span',
                { class: 'muted small' },
                `Mots compris : ${g.words.length ? g.words.join(', ') : '—'}${g.candidates.length ? ` · thèmes proches : ${g.candidates.map((c) => `${c.title} (${c.score}${c.clues ? `, ${c.clues} indice${c.clues > 1 ? 's' : ''}` : ''})`).join(' ; ')}` : ''}`,
              ),
            ),
          ),
        ),
      );
    }
    if (over) {
      parts.push(
        el('p', {}, el('strong', {}, state.status === 'found' ? `Trouvé : +${pts(state.points)}.` : 'Raté : 0 point.'), ` Le thème était « ${state.theme} ».`),
      );
      const next = el('button', { class: 'btn', type: 'button' }, state.lastRound ? 'Voir le score' : 'Manche suivante');
      next.addEventListener('click', () => reverseAction('next'));
      parts.push(next);
    } else {
      const input = el('input', { type: 'text', maxlength: '200', autocomplete: 'off', placeholder: 'Mots-clés du thème (ex. « pokémon acier »)', 'aria-label': 'Mots-clés du thème' });
      const form = el('form', { class: 'form' }, input, el('button', { class: 'btn', type: 'submit' }, 'Proposer'));
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (input.value.trim()) reverseAction('guess', { text: input.value });
      });
      const giveUp = el('button', { class: 'btn ghost', type: 'button' }, 'Abandonner cette manche');
      giveUp.addEventListener('click', () => reverseAction('giveup'));
      parts.push(form, giveUp);
      setTimeout(() => input.focus(), 0);
    }
    parts.push(start);
    body.replaceChildren(...parts);
  }

  // ---------- Tester un thème (responsable du jeu) ----------
  async function loadProbe() {
    const card = $('admin-probe');
    card.hidden = !(app.me && app.me.isAdmin);
    if (card.hidden || app.probeThemes) return;
    try {
      const { themes } = await api('/api/admin/theme-test');
      app.probeThemes = themes;
      $('probe-themes').replaceChildren(...themes.map((t) => el('option', { value: t.title }, `${t.id}${t.active ? '' : ' (inactif)'} · ${t.answers} réponses`)));
    } catch (err) {
      $('probe-status').textContent = err.message;
    }
  }

  $('form-probe').addEventListener('submit', async (event) => {
    event.preventDefault();
    const wanted = $('probe-theme').value.trim().toLowerCase();
    const theme = (app.probeThemes || []).find((t) => t.title.toLowerCase() === wanted || t.id === wanted);
    const inputs = $('probe-inputs').value.split('\n').map((x) => x.trim()).filter(Boolean);
    if (!theme) return void ($('probe-status').textContent = 'Choisis un thème dans la liste proposée.');
    if (!inputs.length) return void ($('probe-status').textContent = 'Tape au moins une réponse.');
    try {
      const { results } = await api('/api/admin/theme-test', { themeId: theme.id, inputs });
      $('probe-status').textContent = `${theme.title} : ${plural(theme.answers, 'réponse', 'réponses')} dans le thème.`;
      $('probe-list').replaceChildren(
        ...results.map((r) =>
          r.found
            ? el('li', { class: 'report' }, el('span', { class: 'what' }, el('strong', {}, `« ${r.input} »`), el('span', { class: 'muted' }, `reconnu comme « ${r.label} » (niveau ${r.level}) · ${r.via}${r.confirm ? ' · le joueur doit confirmer' : ''}`)), el('span', { class: 'muted' }, `${r.points} points · ${r.tier}${r.pepite ? ' (pépite si personne ne l\'a encore donnée)' : ''} · donnée ${plural(r.given, 'fois', 'fois')}`))
            : el('li', { class: 'report' }, el('span', { class: 'what' }, el('strong', {}, `« ${r.input} »`), el('span', { class: 'muted' }, `refusé · le plus proche : ${r.near.join(' ; ')}`))),
        ),
      );
    } catch (err) {
      $('probe-status').textContent = err.message;
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
  }

  async function loadAdminSuggestions() {
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

  $('fold-signalements').addEventListener('toggle', () => {
    if (!$('fold-signalements').open) return;
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
            r.duel ? el('span', {}, r.duel) : null,
          );
        }),
      );
      $('report-mine-empty').hidden = reports.length > 0;
      $('report-mine-sub').textContent = reports.length ? `${reports.length} signalement${reports.length > 1 ? 's' : ''}, du plus récent au plus ancien` : 'les réponses que tu as signalées et ce qu\'on en a fait';
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
    setAdminCount('suggestions', all.filter((s) => !s.handled).length);
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
  $('report-banner').addEventListener('click', async () => {
    await openProfile();
    const fold = $('fold-signalements');
    fold.open = true;
    fold.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (app.me) app.me.unreadReports = 0;
  });
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
          el('span', { class: 'who-av' }, avatarEl(e.avatar), el('span', { class: 'who-name' }, e.username, titleChip(e.title), board.period === 'day' ? null : el('span', { class: 'days' }, ` (${e.days} j)`))),
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

  // ---------- Duels ----------
  const MODE_NAMES = { standard: 'Standard', aise: "À l'aise", eclair: 'Éclair (15 s)', long: 'Long (60 s)' };

  /** Fenêtre flottante : choix du mode (standard ou à l'aise), puis, pour un duel, de l'adversaire. Renvoie { mode, opponent } ou null. */
  function askMode({ title, sub, standardText, aiseText, eclairText = '15 secondes par thème : réflexes !', longText = '60 secondes par thème : le temps de chercher.', opponents = null }) {
    return new Promise((resolve) => {
      const dialog = $('mode-dialog');
      const ac = new AbortController();
      const on = (node, type, fn) => node.addEventListener(type, fn, { signal: ac.signal });
      let result = null;
      $('mode-title').textContent = title;
      $('mode-sub').textContent = sub;
      $('mode-standard-text').textContent = standardText;
      $('mode-aise-text').textContent = aiseText;
      $('mode-eclair-text').textContent = eclairText;
      $('mode-long-text').textContent = longText;
      $('mode-step-mode').hidden = false;
      $('mode-step-opponent').hidden = true;
      const finish = (value) => {
        result = value;
        dialog.close();
      };
      const pick = (mode) => {
        if (!opponents) return finish({ mode });
        $('mode-title').textContent = `Duel ${(MODE_NAMES[mode] || mode).toLowerCase()} : qui défier ?`;
        $('mode-step-mode').hidden = true;
        $('mode-step-opponent').hidden = false;
        $('mode-opponent-sub').textContent = opponents.length ? 'Ton adversaire jouera les mêmes 7 thèmes, quand il voudra.' : "Aucun autre joueur n'est inscrit pour l'instant.";
        $('mode-opponents').replaceChildren(
          ...opponents.map((o) => {
            const record = o.wins + o.losses + o.draws ? `${o.wins} victoire${o.wins > 1 ? 's' : ''} · ${o.losses} défaite${o.losses > 1 ? 's' : ''}${o.draws ? ` · ${o.draws} égalité${o.draws > 1 ? 's' : ''}` : ''}` : 'jamais affronté';
            const button = el('button', { class: 'btn', type: 'button' }, o.busy ? 'En cours' : 'Défier');
            button.disabled = o.busy;
            on(button, 'click', () => finish({ mode, opponent: o.username }));
            return el('li', {}, avatarEl(o.avatar, 'head', 2), el('div', { class: 'opp-id' }, el('strong', {}, o.username), el('span', { class: 'muted small' }, record)), button);
          }),
        );
      };
      on($('mode-standard'), 'click', () => pick('standard'));
      on($('mode-aise'), 'click', () => pick('aise'));
      on($('mode-eclair'), 'click', () => pick('eclair'));
      on($('mode-long'), 'click', () => pick('long'));
      on($('mode-cancel'), 'click', () => finish(null));
      on(dialog, 'click', (event) => event.target === dialog && finish(null));
      dialog.addEventListener(
        'close',
        () => {
          ac.abort();
          resolve(result);
        },
        { once: true },
      );
      dialog.showModal();
    });
  }

  function renderDuelDot() {
    const d = app.me && app.me.duels;
    const n = d ? d.invites + d.unseen : 0;
    $('duel-dot').hidden = !n;
    $('duel-dot').textContent = String(n);
  }

  async function loadDuels() {
    try {
      const data = await api('/api/duels');
      app.duels = data;
      app.me.duels = { invites: data.received.filter((r) => r.status === 'invited').length, unseen: data.results.filter((r) => !r.seen).length };
      renderDuelDot();
      renderDuels(data);
    } catch (err) {
      $('duel-lists').replaceChildren(el('p', { class: 'muted' }, err.message));
    }
  }

  /** Temps qu'il reste pour répondre à un duel (sans minuterie : calculé à l'affichage). */
  function timeLeft(expiresAt) {
    const hours = Math.max(0, Math.round((expiresAt - Date.now()) / 3600000));
    if (hours >= 48) return `forfait dans ${Math.floor(hours / 24)} jours`;
    if (hours <= 0) return 'forfait imminent';
    return `forfait dans ${hours} h`;
  }

  function renderDuels(data) {
    const box = $('duel-lists');
    const person = (o) => el('span', { class: 'who-av' }, avatarEl(o.avatar, 'head', 2), el('span', { class: 'who-name' }, o.username));
    const section = (title, rows) => (rows.length ? el('div', { class: 'duel-section' }, el('h3', {}, title), el('ul', { class: 'duel-list' }, ...rows)) : null);
    const act = (label, fn, secondary) => {
      const b = el('button', { class: `btn${secondary ? ' secondary' : ''}`, type: 'button' }, label);
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await fn();
        } catch (err) {
          showNotice(err.message);
          b.disabled = false;
        }
      });
      return b;
    };
    const received = data.received.map((d) =>
      el(
        'li',
        {},
        el('div', { class: 'duel-row' }, person(d.other), el('span', { class: 'muted small' }, `te défie · ${MODE_NAMES[d.mode]}${d.status === 'invited' ? ` · ${timeLeft(d.expiresAt)}` : ''}`)),
        el(
          'div',
          { class: 'duel-actions' },
          ...(d.status === 'invited'
            ? [
                act('Relever le défi', async () => enterGame(await api(`/api/duels/${d.id}/accept`, {}))),
                act('Refuser', async () => {
                  await api(`/api/duels/${d.id}/decline`, {});
                  await loadDuels();
                }, true),
              ]
            : [act('Reprendre', async () => enterGame(await api(`/api/game/${d.gameId}`)))]),
        ),
      ),
    );
    const sent = data.sent.map((d) =>
      el(
        'li',
        {},
        el('div', { class: 'duel-row' }, person(d.other), el('span', { class: 'muted small' }, d.status === 'waiting' ? `en attente de sa réponse · ${MODE_NAMES[d.mode]} · ${timeLeft(d.expiresAt)}` : `à finir · ${MODE_NAMES[d.mode]}`)),
        d.status === 'playing' ? el('div', { class: 'duel-actions' }, act('Reprendre', async () => enterGame(await api(`/api/game/${d.gameId}`)))) : null,
      ),
    );
    const checking = (data.checking || []).map((d) => {
      const row = el('li', { class: 'duel-result' }, el('div', { class: 'duel-row' }, person(d.other), el('span', { class: 'muted small' }, 'en attente de vérification par le contremaître')));
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      const open = () => openDuelResult(d.id);
      row.addEventListener('click', open);
      row.addEventListener('keydown', (event) => (event.key === 'Enter' || event.key === ' ') && (event.preventDefault(), open()));
      return row;
    });
    const results = data.results.map((d) => {
      const label = d.outcome === 'win' ? 'Victoire' : d.outcome === 'loss' ? 'Défaite' : 'Égalité';
      const row = el(
        'li',
        { class: `duel-result ${d.outcome}` },
        el('div', { class: 'duel-row' }, person(d.other), el('span', { class: 'duel-outcome' }, `${label} ${d.myScore} – ${d.theirScore}${d.revised ? ' (révisé)' : ''}`), d.seen ? null : el('span', { class: 'tab-dot' }, '!')),
      );
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      const open = () => openDuelResult(d.id);
      row.addEventListener('click', open);
      row.addEventListener('keydown', (event) => (event.key === 'Enter' || event.key === ' ') && (event.preventDefault(), open()));
      return row;
    });
    const r = data.record;
    // Nouvel accueil : trois résultats récents seulement, le reste sur demande.
    const compact = betaOn('betaHome') && !app.duelResultsAll && results.length > 3;
    const more = betaOn('betaHome') && results.length > 3 ? el('button', { class: 'link', type: 'button' }, compact ? `Voir les ${results.length} résultats` : 'Réduire la liste') : null;
    if (more) {
      more.addEventListener('click', () => {
        app.duelResultsAll = !app.duelResultsAll;
        renderDuels(data);
      });
    }
    box.replaceChildren(
      ...[
        section('À toi de jouer', received),
        section('En cours', sent),
        section('Chez le contremaître', checking),
        section('Résultats', compact ? results.slice(0, 3) : results),
        more,
        r.wins + r.losses + r.draws ? el('p', { class: 'muted small' }, `Bilan : ${r.wins} victoire${r.wins > 1 ? 's' : ''}, ${r.losses} défaite${r.losses > 1 ? 's' : ''}${r.draws ? `, ${r.draws} égalité${r.draws > 1 ? 's' : ''}` : ''}.`) : null,
      ].filter(Boolean),
    );
  }

  $('btn-duel-new').addEventListener('click', async () => {
    let data = app.duels;
    try {
      data = await api('/api/duels');
      app.duels = data;
    } catch (err) {
      return showNotice(err.message);
    }
    const choice = await askMode({
      title: 'Lancer un duel',
      sub: 'Sept thèmes, les mêmes pour vous deux. Chacun joue de son côté.',
      standardText: '30 secondes par thème.',
      aiseText: 'Sans chrono : prenez le temps de réfléchir.',
      opponents: data.opponents,
    });
    if (!choice || !choice.opponent) return;
    try {
      enterGame(await api('/api/duels', { opponent: choice.opponent, mode: choice.mode }));
    } catch (err) {
      showNotice(err.message);
    }
  });

  // ---------- Duel en attente de vérification : le contremaître examine les plans ----------
  const FW = 110;
  const FH = 44;
  const FOREMAN = [
    '....hhhhhh....',
    '...hhhhhhhh...',
    '..HHHHHHHHHH..',
    '...ssssssss...',
    '...sesssses...',
    '...ssssssss...',
    '...sbbbbbbs...',
    '....ssssss....',
    '..oooooooooo..',
    '.oooyooooyooo.',
    '.oooooooooooo.',
    '.soooooooooos.',
  ];
  const FOREMAN_PAL = { h: '#f4f4f4', H: '#c9ced6', s: '#e0a878', e: '#1b1410', b: '#5a3a20', o: '#f08a1c', y: '#f2e030' };

  function drawForeman(canvas, t) {
    const ctx = canvas.getContext('2d');
    ctx.drawImage(weeklyBackdrop(), 0, 0);
    ctx.fillStyle = '#120d0a';
    ctx.fillRect(0, 4, FW, FH - 4);
    // Lampe suspendue et halo.
    ctx.fillStyle = 'rgba(242,194,48,0.12)';
    ctx.fillRect(30, 4, 50, 22);
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(54, 0, 2, 5);
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(51, 5, 8, 2);
    // Le contremaître, tête qui dodeline un peu.
    const bob = Math.round(Math.sin(t * 2.2));
    sprite(ctx, FOREMAN, FOREMAN_PAL, 48, 9 + bob);
    // Table et plan bleu.
    ctx.fillStyle = '#6b4627';
    ctx.fillRect(10, 30, 90, 3);
    ctx.fillStyle = '#4a2f1a';
    ctx.fillRect(14, 33, 3, 11);
    ctx.fillRect(93, 33, 3, 11);
    ctx.fillStyle = '#2a5db0';
    ctx.fillRect(20, 23, 70, 8);
    ctx.fillStyle = '#9cc3ff';
    for (let x = 24; x < 86; x += 10) ctx.fillRect(x, 24, 1, 6);
    ctx.fillRect(21, 26, 68, 1);
    ctx.fillRect(21, 29, 68, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(28, 25, 8, 4);
    ctx.fillRect(48, 24, 12, 1);
    ctx.fillRect(48, 28, 12, 1);
    ctx.fillRect(70, 25, 10, 4);
    // Coches vertes au fil de la vérification (une toutes les 1,5 s, par cycle de 6 s).
    const done = Math.floor((t % 6) / 1.5);
    ctx.fillStyle = '#7fcf5a';
    [[32, 26], [54, 26], [75, 26], [42, 29]].slice(0, done + 1).forEach(([x, y]) => {
      ctx.fillRect(x, y + 1, 1, 1);
      ctx.fillRect(x + 1, y + 2, 1, 1);
      ctx.fillRect(x + 2, y + 1, 1, 1);
      ctx.fillRect(x + 3, y, 1, 1);
    });
    // Loupe qui balaie le plan.
    const mx = 30 + Math.round(50 * (0.5 + 0.5 * Math.sin(t * 1.1)));
    ctx.fillStyle = 'rgba(138,208,255,0.55)';
    ctx.fillRect(mx - 3, 19, 7, 7);
    ctx.fillStyle = '#c9ced6';
    ctx.fillRect(mx - 4, 18, 9, 1);
    ctx.fillRect(mx - 4, 26, 9, 1);
    ctx.fillRect(mx - 4, 19, 1, 7);
    ctx.fillRect(mx + 4, 19, 1, 7);
    ctx.fillStyle = '#8a5a2b';
    for (let i = 0; i < 6; i++) ctx.fillRect(mx + 5 + i, 25 + i - 3, 1, 1);
    ctx.fillStyle = '#e0a878';
    ctx.fillRect(mx + 11, 24, 2, 2);
  }

  function renderForeman() {
    const canvas = $('duel-foreman');
    const scale = Math.max(1, Math.min(4, Math.floor((canvas.parentElement.clientWidth || 330) / FW)));
    canvas.style.width = `${FW * scale}px`;
    canvas.style.height = `${FH * scale}px`;
    drawForeman(canvas, 0);
  }
  setInterval(() => {
    if (document.hidden || $('view-duel').hidden || $('duel-wait').hidden || $('duel-foreman').hidden) return;
    if (reducedMotion()) return;
    drawForeman($('duel-foreman'), performance.now() / 1000);
  }, 120);

  /** Duel joué par les deux : rien n'est dévoilé avant la vérification du lendemain. */
  function showDuelChecking() {
    $('duel-wait-text').textContent = 'En attente de vérification par le contremaître. Reviens demain pour voir les résultats du chantier ! ⚒️';
    $('duel-foreman').hidden = false;
    $('duel-wait').hidden = false;
    $('duel-reveal').hidden = true;
    show('duel');
    renderForeman();
  }

  // Fin de la partie d'un duel : en attente de l'adversaire, ou résultat à révéler.
  async function afterDuelGame(state) {
    try {
      const result = await api(`/api/duels/${state.duel.id}/result`);
      if (result.pending) return showDuelChecking();
      openDuelReveal(result);
    } catch (err) {
      if (err.status !== 409) return showNotice(err.message);
      $('duel-wait-text').textContent = `${state.duel.opponent} n'a pas encore joué. Tu verras le résultat dans l'onglet « Duel » de l'accueil, dès que ce sera fait : la rareté de tes réponses reste secrète jusque-là.`;
      $('duel-foreman').hidden = true;
      $('duel-wait').hidden = false;
      $('duel-reveal').hidden = true;
      show('duel');
    }
  }

  async function openDuelResult(id) {
    try {
      const result = await api(`/api/duels/${id}/result`);
      if (result.pending) return showDuelChecking();
      openDuelReveal(result);
    } catch (err) {
      showNotice(err.message);
    }
  }

  $('btn-duel-wait-home').addEventListener('click', () => goHome());
  $('btn-duel-home').addEventListener('click', () => goHome());

  let duelScenes = null;
  let duelRun = 0;

  /** Révélation : thème après thème, les deux foreuses creusent en même temps et les points s'ajoutent. */
  async function openDuelReveal(result) {
    const run = ++duelRun;
    $('duel-wait').hidden = true;
    $('duel-reveal').hidden = false;
    $('duel-final').hidden = true;
    $('duel-badges').hidden = true;
    $('btn-duel-skip').hidden = false;
    show('duel');
    $('duel-title').textContent = `${result.a.username} contre ${result.b.username}`;
    $('duel-name-a').textContent = result.a.username;
    $('duel-name-b').textContent = result.b.username;
    $('duel-total-a').textContent = '0 pts';
    $('duel-total-b').textContent = '0 pts';
    $('duel-lines').replaceChildren();
    if (!duelScenes) duelScenes = [new Pixel.DrillScene($('duel-canvas-a')), new Pixel.DrillScene($('duel-canvas-b'))];
    const scale = Math.max(1, Math.floor((($('duel-reveal').clientWidth || 340) - 40) / 2 / Pixel.WIDTH));
    [$('duel-canvas-a'), $('duel-canvas-b')].forEach((canvas, i) => {
      duelScenes[i].setViewHeight(150);
      canvas.style.width = `${Pixel.WIDTH * scale}px`;
      canvas.style.height = `${duelScenes[i].h * scale}px`;
      duelScenes[i].setSkin(i ? result.b.skin : result.a.skin);
      duelScenes[i].setAvatar(i ? result.b.avatar : result.a.avatar);
      duelScenes[i].setLayers([], false);
    });
    const layers = [[], []];
    const totals = [0, 0];
    let skipping = false;
    const skip = () => {
      skipping = true;
      $('btn-duel-skip').hidden = true;
    };
    $('btn-duel-skip').onclick = skip;
    const settled = async () => {
      const t0 = performance.now();
      while (!skipping && duelRun === run && performance.now() - t0 < 9000) {
        if (duelScenes.every((sc) => Math.abs(sc.depth - sc.target) < 0.8)) break;
        await sleep(150);
      }
      if (!skipping && duelRun === run) await sleep(650);
    };
    const mineIsA = result.a.me;
    for (const [i, t] of result.themes.entries()) {
      if (duelRun !== run) return;
      layers[0].push({ points: t.a.points, tier: t.a.tier });
      layers[1].push({ points: t.b.points, tier: t.b.tier });
      duelScenes[0].setLayers(layers[0], !skipping);
      duelScenes[1].setLayers(layers[1], !skipping);
      totals[0] += t.a.points;
      totals[1] += t.b.points;
      const line = (side, mark) => {
        const swatch = el('span', { class: 'swatch' });
        swatch.style.background = Pixel.TIER_COLORS[side.tier] || '#666';
        const sym = settings.colors !== 'normal' ? Pixel.TIER_SYMBOLS[side.tier] || '' : '';
        return el('span', { class: `duel-cell${mark ? ' best' : ''}` }, swatch, el('span', { class: 'what' }, `${sym ? `${sym} ` : ''}${side.outcome === 'answer' ? side.answer : side.outcome === 'timeout' ? 'temps écoulé' : 'passé'}`), el('span', { class: 'pts' }, `+${side.points}`));
      };
      $('duel-lines').append(
        el('li', {}, el('p', { class: 'duel-theme' }, `${i + 1}. ${t.title}`), el('div', { class: 'duel-pair' }, line(t.a, t.a.points > t.b.points), line(t.b, t.b.points > t.a.points))),
      );
      const mine = mineIsA ? t.a : t.b;
      if (!skipping) {
        const pepites = (mineIsA ? layers[0] : layers[1]).filter((l) => l.tier === 'pepite').length;
        if (son16On()) Sound.ore(mine.tier, pepites);
        else Sound.tier(mine.tier, pepites);
      }
      await settled();
      $('duel-total-a').textContent = pts(totals[0]);
      $('duel-total-b').textContent = pts(totals[1]);
      if (!skipping) window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
    if (duelRun !== run) return;
    $('btn-duel-skip').hidden = true;
    $('duel-total-a').textContent = pts(result.a.score);
    $('duel-total-b').textContent = pts(result.b.score);
    const me = mineIsA ? result.a : result.b;
    const other = mineIsA ? result.b : result.a;
    $('duel-banner').textContent =
      result.winner == null
        ? `Égalité parfaite : ${pts(me.score)} partout !`
        : (result.winner === 'a') === mineIsA
          ? `Victoire ! Tu bats ${other.username} : ${me.score} à ${other.score}.`
          : `Défaite : ${other.username} gagne ${other.score} à ${me.score}.`;
    if (result.revision) {
      const was = result.revision.winner == null ? 'égalité' : (result.revision.winner === 'a') === mineIsA ? 'victoire' : 'défaite';
      const old = mineIsA ? `${result.revision.a} à ${result.revision.b}` : `${result.revision.b} à ${result.revision.a}`;
      $('duel-banner').textContent += ` Résultat révisé après un signalement accepté (avant : ${was}, ${old}).`;
    }
    $('duel-final').hidden = false;
    if (son16On()) Sound.duelResult(result.winner == null ? 'draw' : (result.winner === 'a') === mineIsA ? 'win' : 'loss');
    // Revanche en un clic : un nouveau duel contre le même joueur, avec les mêmes règles.
    const rematch = $('btn-duel-rematch');
    rematch.disabled = false;
    rematch.textContent = `Revanche contre ${other.username}`;
    rematch.onclick = async () => {
      rematch.disabled = true;
      try {
        enterGame(await api('/api/duels', { opponent: other.username, mode: result.mode }));
      } catch (err) {
        showNotice(err.message);
        rematch.disabled = false;
      }
    };
    api(`/api/duels/${result.id}/seen`, {}).catch(() => {});
    if (app.me && app.me.duels) {
      app.me.duels.unseen = Math.max(0, app.me.duels.unseen - 1);
    }
    try {
      const profile = await api('/api/profile');
      const fresh = profile.badges.filter((b) => b.isNew);
      if (fresh.length && duelRun === run && !$('view-duel').hidden) {
        app.profile = profile;
        $('duel-badges').replaceChildren(el('h3', {}, 'Nouveaux badges'), ...fresh.map(badgeItem));
        $('duel-badges').hidden = false;
        Sound.badge();
      }
    } catch {
      /* les badges restent visibles dans le profil */
    }
  }

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

  const CELEBRATION = {
    day: { title: 'Le podium du jour', gazette: 'du jour', wins: 'remporte le jour', mine: 'Ta journée', nothing: "Tu n'as pas creusé ce jour-là : à toi de jouer aujourd'hui !", sky: ['#0b1026', '#121a3d', '#1b2552'], bursts: 4, radius: 24, speed: 0.9 },
    week: { title: 'Le podium de la semaine', gazette: 'de la semaine', wins: 'remporte la semaine', mine: 'Ta semaine', nothing: "Tu n'as pas creusé cette semaine-là : rendez-vous cette semaine !", sky: ['#150b26', '#20123d', '#2c1a52'], bursts: 6, radius: 28, speed: 1 },
    month: { title: 'Le podium du mois', gazette: 'du mois', wins: 'remporte le mois', mine: 'Ton mois', nothing: "Tu n'as pas creusé ce mois-là : un nouveau mois commence !", sky: ['#07161c', '#0c2a33', '#123d47'], bursts: 9, radius: 32, speed: 1.15 },
  };
  const BURST_PALETTES = [
    ['#ffd84a', '#ff6a8a', '#5ee0ff', '#b28cff', '#7fcf5a'],
    ['#ff9a3c', '#ffd84a', '#ff5c5c', '#fff2a8', '#ff8ad6'],
    ['#5ee0ff', '#8ab4ff', '#b28cff', '#7fffd4', '#ffffff'],
    ['#ffd84a', '#fff2a8', '#e0b020', '#ffffff', '#ffb347'],
  ];

  function celebrationPeriodText(data, long) {
    if (data.kind === 'day') return formatDay(data.start, { weekday: 'long', day: 'numeric', month: 'long' });
    if (data.kind === 'month') return formatDay(data.start, { month: 'long', year: 'numeric' });
    const opts = { day: 'numeric', month: 'long' };
    return long ? `Semaine du ${formatDay(data.start, opts)} au ${formatDay(data.end, opts)}` : `${formatDay(data.start, opts)} – ${formatDay(data.end, opts)}`;
  }

  /** Podiums à montrer à la suite (jour, semaine, mois), puis retour à l'accueil. */
  function openCelebrations(list) {
    app.celebrationQueue = list.slice();
    nextCelebration();
  }

  async function nextCelebration() {
    const item = (app.celebrationQueue || []).shift();
    if (!item) {
      show('home');
      return;
    }
    try {
      const data = await api(`/api/celebration?kind=${item.kind}&start=${item.start}`);
      app.recap = data;
      renderRecap(data);
      show('recap');
      window.scrollTo(0, 0);
      startFireworks(data);
    } catch {
      /* les podiums sont un bonus : s'ils échouent, on reste sur l'accueil */
      app.celebrationQueue = [];
    }
  }

  function startFireworks(data) {
    clearInterval(recapTimer);
    const conf = CELEBRATION[data.kind] || CELEBRATION.week;
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
    // Chaque célébration a sa variante : la date choisit les couleurs, l'emplacement des feux et un effet de plus.
    const seed = [...data.start].reduce((n, ch) => n * 31 + ch.charCodeAt(0), 7) % 9973;
    const colors = BURST_PALETTES[seed % BURST_PALETTES.length];
    const effect = ['confettis', 'etoiles', 'diamants', 'lampes'][Math.floor(seed / 7) % 4];
    const bursts = Array.from({ length: conf.bursts }, (_, i) => [
      14 + Math.floor(hash(seed + i * 3.1) * 132),
      22 + Math.floor(hash(seed + i * 5.7) * 70),
      colors[i % colors.length],
      (i * 0.7) % 3,
    ]);
    const steps = [[2, 14, 40, 150, '#9aa0aa'], [1, 60, 40, 140, '#e0b020'], [3, 106, 40, 160, '#b27a3e']]; // [place, x, largeur, haut, couleur]
    const extra = (t) => {
      if (effect === 'confettis') {
        for (let i = 0; i < 30; i++) {
          ctx.fillStyle = colors[i % colors.length];
          ctx.fillRect(Math.floor(hash(seed + i) * 158) + Math.round(Math.sin(t * 2 + i) * 3), Math.floor((hash(i + 9) * 190 + t * (22 + (i % 5) * 6)) % 175), 2, 3);
        }
      } else if (effect === 'etoiles') {
        for (let i = 0; i < 3; i++) {
          const k = (t * 0.45 + i / 3) % 1;
          const x = Math.round(150 - k * 150 + hash(seed + i) * 40);
          const y = Math.round(k * 90 + i * 8);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x, y, 2, 2);
          ctx.fillStyle = '#9fb4ff';
          ctx.fillRect(x + 3, y - 2, 2, 1);
          ctx.fillRect(x + 6, y - 4, 2, 1);
        }
      } else if (effect === 'diamants') {
        for (let i = 0; i < 9; i++) {
          const x = Math.floor(hash(seed + i * 2) * 150) + Math.round(Math.sin(t + i) * 4);
          const y = Math.floor((hash(i + 3) * 190 + t * (14 + (i % 4) * 5)) % 170);
          ctx.fillStyle = '#5ee0ff';
          ctx.fillRect(x + 1, y, 1, 3);
          ctx.fillRect(x, y + 1, 3, 1);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x + 1, y + 1, 1, 1);
        }
      } else {
        for (let i = 0; i < 7; i++) {
          const x = Math.floor(hash(seed + i * 4) * 148) + Math.round(Math.sin(t * 0.8 + i) * 4);
          const y = 170 - ((hash(i + 5) * 170 + t * (10 + (i % 3) * 4)) % 170);
          ctx.fillStyle = '#ffd84a';
          ctx.fillRect(x, Math.round(y), 3, 4);
          ctx.fillStyle = '#fff2a8';
          ctx.fillRect(x + 1, Math.round(y) + 1, 1, 1);
        }
      }
    };
    const draw = (t) => {
      for (let y = 0; y < 190; y += 2) {
        ctx.fillStyle = y < 70 ? conf.sky[0] : y < 125 ? conf.sky[1] : conf.sky[2];
        ctx.fillRect(0, y, 160, 2);
      }
      for (let i = 0; i < 36; i++) {
        ctx.fillStyle = Math.sin(t * 3 + i) > 0 ? '#ffffff' : '#6a73a0';
        ctx.fillRect(Math.floor(hash(i + 1) * 160), Math.floor(hash(i + 50) * 100), 1, 1);
      }
      if (data.kind === 'month') {
        // Projecteurs de gala derrière le podium.
        ctx.fillStyle = 'rgba(255, 240, 160, 0.10)';
        for (let i = 0; i < 40; i++) {
          const sway = Math.round(Math.sin(t * 0.8) * 14);
          ctx.fillRect(40 + sway - i * 0.6, 20 + i * 3, 6 + i * 0.5, 3);
          ctx.fillRect(110 - sway - i * 0.1, 20 + i * 3, 6 + i * 0.5, 3);
        }
      }
      bursts.forEach(([cx, cy, color, phase]) => {
        const k = (t * conf.speed * 0.9 + phase / 3) % 1;
        const r = k * conf.radius;
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
      extra(t);
      if (data.kind === 'week') {
        // Guirlande de fanions.
        for (let x = 0; x < 160; x += 10) {
          ctx.fillStyle = colors[(x / 10) % colors.length];
          ctx.fillRect(x, 4 + Math.round(Math.sin(x / 14) * 2), 5, 2);
          ctx.fillRect(x + 1, 6 + Math.round(Math.sin(x / 14) * 2), 3, 2);
          ctx.fillRect(x + 2, 8 + Math.round(Math.sin(x / 14) * 2), 1, 1);
        }
      }
      ctx.fillStyle = '#2a1a0c';
      ctx.fillRect(0, 170, 160, 20);
      steps.forEach(([place, x, w, top, color]) => {
        ctx.fillStyle = color;
        ctx.fillRect(x, top + 20, w, 190 - top - 20);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(x, top + 20, w, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x + w / 2 - 2, top + 28, 4, 8);
        const sprite = sprites[place];
        if (sprite) {
          const jump = Math.round(Math.abs(Math.sin(t * 5 + place * 1.4)) * 8);
          ctx.drawImage(sprite, x + w / 2 - 8, top + 20 - 28 - jump);
        }
      });
      if (data.kind === 'month' && sprites[1]) {
        // Coupe du mois au-dessus du vainqueur.
        const cx = 80;
        const cy = 84 + Math.round(Math.sin(t * 2) * 2);
        ctx.fillStyle = '#e0b020';
        ctx.fillRect(cx - 6, cy, 12, 7);
        ctx.fillRect(cx - 4, cy + 7, 8, 3);
        ctx.fillRect(cx - 1, cy + 10, 2, 4);
        ctx.fillRect(cx - 4, cy + 14, 8, 2);
        ctx.fillStyle = '#ffd84a';
        ctx.fillRect(cx - 4, cy + 1, 3, 5);
        ctx.fillStyle = '#e0b020';
        ctx.fillRect(cx - 9, cy + 1, 3, 4);
        ctx.fillRect(cx + 6, cy + 1, 3, 4);
      }
    };
    draw(0);
    if (reducedMotion()) return;
    recapTimer = setInterval(() => {
      if ($('view-recap').hidden || document.hidden) return;
      draw(performance.now() / 1000);
    }, 80);
  }

  function renderRecap(data) {
    const conf = CELEBRATION[data.kind] || CELEBRATION.week;
    const queue = app.celebrationQueue || [];
    $('recap-title').textContent = data.kind === 'week' ? 'Bravo les mineurs !' : conf.title;
    $('recap-sub').textContent = data.kind === 'week' ? celebrationPeriodText(data, true) : celebrationPeriodText(data);
    $('recap-canvas').setAttribute('aria-label', `${conf.title} sous un feu d'artifice`);
    $('recap-fireworks').hidden = false;
    $('recap-gazette').hidden = true;
    if (son16On()) Sound.celebrate(data.kind);
    $('recap-names').replaceChildren(
      ...[2, 1, 3].map((place) => {
        const e = data.entries.find((x) => x.rank === place);
        return el('div', { class: `recap-name p${place}${e && e.me ? ' me' : ''}` }, el('span', { class: 'who-name' }, e ? e.username : '—'), el('span', { class: 'score' }, e ? pts(e.score) : ''));
      }),
    );
    const onPodium = data.me && data.me.rank <= 3;
    $('recap-note').hidden = !onPodium;
    $('recap-note').textContent = onPodium ? (data.me.rank === 1 ? 'Tu es en haut du podium, bravo champion·ne !' : 'Tu es sur le podium, bravo !') : '';
    $('btn-recap-next').textContent = 'Voir la Gazette de la mine';
    // Gazette
    const g = $('recap-gazette');
    const champ = data.champion;
    const line = (label, value) => el('div', { class: 'gz-line' }, el('span', {}, label), el('span', {}, value));
    const mine = data.me;
    const rankText = (n) => (n === 1 ? '1er' : `${n}e`);
    const nextKind = queue[0] && CELEBRATION[queue[0].kind];
    g.replaceChildren(
      el('h2', { class: 'gz-title' }, 'La Gazette de la mine'),
      el('p', { class: 'gz-date' }, `Édition ${conf.gazette} · ${celebrationPeriodText(data, true)}`),
      champ ? el('p', { class: 'gz-headline' }, `${champ.username} ${conf.wins} avec ${pts(champ.score)} !`) : null,
      el(
        'ul',
        { class: 'gz-ranking' },
        ...data.entries.map((e) =>
          el(
            'li',
            { class: e.me ? 'me' : '' },
            e.rank <= 3 ? medalCanvas(e.rank) : el('span', { class: 'gz-rank' }, `${e.rank}.`),
            avatarEl(e.avatar, 'head', 2),
            el('span', { class: 'who-name' }, e.username, titleChip(e.title)),
            el('span', {}, data.kind === 'day' ? pts(e.score) : `${pts(e.score)} · ${e.days} j`),
          ),
        ),
      ),
      el(
        'div',
        { class: 'gz-moments' },
        el('h3', {}, 'Les moments forts'),
        data.kind !== 'day' && data.best ? line('Meilleur forage', `${data.best.username}, ${pts(data.best.score)} (${formatDay(data.best.day, data.kind === 'week' ? { weekday: 'long' } : { day: 'numeric', month: 'long' })})`) : null,
        data.rarest ? line('Réponse la plus rare', `« ${data.rarest.answer} » (${data.rarest.username}, ${pts(data.rarest.points)})`) : null,
        data.applauded ? line('Réponse la plus applaudie', `« ${data.applauded.answer} » (${data.applauded.username}, ${data.applauded.reactions} réaction${data.applauded.reactions > 1 ? 's' : ''})`) : null,
        line('Pépites trouvées', String(data.pepites)),
        line('Forages terminés', `${data.games} par ${plural(data.players, 'joueur', 'joueurs')}`),
      ),
      mine
        ? el(
            'div',
            { class: 'gz-moments' },
            el('h3', {}, conf.mine),
            line('Ton rang', `${rankText(mine.rank)} sur ${data.players}`),
            data.kind === 'day' ? line('Ton score', pts(mine.score)) : line('Ton total', pts(mine.score)),
            data.kind === 'day' ? line('Réponses données', String(mine.answers)) : line('Forages', `${mine.days} sur ${data.daysInPeriod}`),
            data.kind !== 'day' ? line('Moyenne par forage', pts(mine.average)) : null,
            data.kind !== 'day' ? line('Ton meilleur forage', `${pts(mine.best)}${mine.bestDay ? ` (${formatDay(mine.bestDay, data.kind === 'week' ? { weekday: 'long' } : { day: 'numeric', month: 'long' })})` : ''}`) : null,
            mine.bestAnswer ? line('Ta meilleure réponse', `« ${mine.bestAnswer.answer} » (${pts(mine.bestAnswer.points)})`) : null,
            line('Pépites / réponses rares', `${mine.pepites} / ${mine.rares}`),
          )
        : el('p', { class: 'gz-date' }, conf.nothing),
      el('button', { class: 'btn', id: 'btn-recap-done', type: 'button' }, nextKind ? `Suite : ${nextKind.title.toLowerCase()}` : 'À la mine !'),
    );
    $('btn-recap-done').addEventListener('click', finishRecap);
  }

  $('btn-recap-next').addEventListener('click', () => {
    $('recap-fireworks').hidden = true;
    $('recap-gazette').hidden = false;
    if (son16On()) Sound.paper();
    window.scrollTo(0, 0);
  });

  async function finishRecap() {
    clearInterval(recapTimer);
    const done = app.recap;
    if (done) api('/api/celebration/seen', { kind: done.kind, start: done.start }).catch(() => {});
    if (app.me && done) {
      app.me.celebrations = (app.me.celebrations || []).filter((c) => !(c.kind === done.kind && c.start === done.start));
      app.me.recap = null;
    }
    app.recap = null;
    nextCelebration();
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
  /** Responsable : associe après coup une réponse du thème à la manche d'un joueur, ou remplace celle qu'il avait donnée. */
  function assignButton(day, back, player, round, theme) {
    const replacing = round.outcome === 'answer';
    const button = el(
      'button',
      { type: 'button', class: 'assign-btn', title: replacing ? 'Remplacer la réponse de ce joueur' : 'Associer une réponse à cette manche' },
      replacing ? 'Modifier…' : 'Associer…',
    );
    button.addEventListener('click', async () => {
      const dialog = $('assign-dialog');
      let answers = [];
      try {
        answers = (await api(`/api/admin/theme-answers?themeId=${encodeURIComponent(round.themeId)}`)).answers;
      } catch (err) {
        return showNotice(err.message);
      }
      let chosen = null;
      const ac = new AbortController();
      const on = (node, type, fn) => node.addEventListener(type, fn, { signal: ac.signal });
      $('assign-title').textContent = replacing ? 'Modifier la réponse' : 'Associer une réponse';
      $('assign-sub').textContent = `${player.username} · « ${theme.title} » · ${replacing ? `réponse actuelle : « ${round.answer} » (${pts(round.points || 0)})` : round.outcome === 'timeout' ? 'temps écoulé' : 'thème passé'}`;
      $('assign-search').value = '';
      $('assign-status').textContent = '';
      $('assign-confirm').disabled = true;
      $('assign-confirm').textContent = replacing ? 'Remplacer' : 'Associer';
      const draw = () => {
        const q = $('assign-search').value.trim().toLowerCase();
        const shown = answers.filter((a) => !q || a.label.toLowerCase().includes(q)).slice(0, 80);
        $('assign-list').replaceChildren(
          ...shown.map((a) => {
            const item = el('li', {}, el('button', { type: 'button', class: `assign-item${chosen === a ? ' on' : ''}` }, a.label));
            item.firstChild.addEventListener('click', () => {
              chosen = a;
              $('assign-confirm').disabled = false;
              $('assign-confirm').textContent = `${replacing ? 'Remplacer par' : 'Associer'} « ${a.label} »`;
              draw();
            });
            return item;
          }),
        );
        if (!shown.length) $('assign-list').append(el('li', { class: 'muted' }, 'Aucune réponse ne correspond.'));
      };
      draw();
      on($('assign-search'), 'input', draw);
      on($('assign-cancel'), 'click', () => dialog.close());
      on(dialog, 'click', (event) => event.target === dialog && dialog.close());
      on($('assign-confirm'), 'click', async () => {
        if (!chosen) return;
        $('assign-confirm').disabled = true;
        try {
          const res = await api('/api/admin/assign', { day, username: player.username, themeId: round.themeId, answerKey: chosen.key });
          dialog.close();
          await openCompare(day, back);
          showNotice(
            res.previous
              ? `« ${res.previous.answer} » remplacée par « ${res.answer} » pour ${player.username} : ${pts(res.previous.points)} → ${pts(res.points)}.`
              : `« ${res.answer} » associée à ${player.username} : +${res.points} points.`,
          );
        } catch (err) {
          $('assign-status').textContent = err.message;
          $('assign-confirm').disabled = false;
        }
      });
      dialog.addEventListener('close', () => ac.abort(), { once: true });
      dialog.showModal();
      $('assign-search').focus();
    });
    return button;
  }

  async function openCompare(day, back = 'podium') {
    // Les thèmes dépliés ne sont gardés que pour le même jour (ex. après une modification du responsable).
    if (app.compareDay !== day) app.compareOpen = new Set();
    app.compareDay = day;
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
          el('p', { class: 'muted small' }, '★ : seul(e) à avoir donné cette réponse · = toi : même réponse que la tienne. Touche un thème pour voir les réponses des autres joueurs, et un symbole sous une réponse pour réagir.'),
          el(
            'div',
            { class: 'score-bars' },
            ...data.players.map((p) =>
              el(
                'div',
                { class: `score-bar${p.me ? ' me' : ''}` },
                el('span', { class: 'who' }, avatarEl(p.avatar, 'head', 2), el('span', { class: 'who-text' }, p.username, titleChip(p.title))),
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
                el('span', { class: 'who' }, avatarEl(p.avatar, 'head', 2), el('span', { class: 'who-text' }, p.username, titleChip(p.title))),
                el('span', { class: 'what' }, what),
                el('span', { class: 'pts' }, r.outcome === 'joker' ? '—' : pts(r.points || 0)),
                app.me && app.me.isAdmin && (r.outcome === 'timeout' || r.outcome === 'skip' || r.outcome === 'answer') ? assignButton(day, back, p, r, th) : null,
              ),
            );
            if (r.rid && r.outcome === 'answer' && (!p.me || Object.keys(r.reactions || {}).length)) list.append(reactionRow(r, p.me));
          });
        // Un thème = une ligne repliée (ta réponse et ton score) ; on la déplie pour voir les réponses des autres joueurs.
        const key = `${th.themeId}${th.spare ? '*' : ''}`;
        const mineWhat = !mine ? '' : mine.r.outcome === 'answer' ? mine.r.answer : mine.r.outcome === 'joker' ? 'Galerie de secours' : mine.r.outcome === 'timeout' ? 'temps écoulé' : 'passé';
        const summary = el(
          'summary',
          { class: 'compare-sum' },
          el('span', { class: 'compare-title' }, th.spare ? `${i + 1}. Galerie de secours : ${th.title}` : `${i + 1}. ${th.title}`),
          mine
            ? el(
                'span',
                { class: 'compare-mine' },
                el('span', { class: 'swatch', style: { background: Pixel.TIER_COLORS[mine.r.tier] || '#666' } }),
                el('span', { class: 'what' }, mineWhat),
                el('span', { class: 'pts' }, mine.r.outcome === 'joker' ? '—' : pts(mine.r.points || 0)),
              )
            : null,
          el('span', { class: 'pm', 'aria-hidden': 'true' }),
        );
        const details = el('details', { class: 'compare-theme' }, summary, list);
        if (app.compareOpen && app.compareOpen.has(key)) details.open = true;
        details.addEventListener('toggle', () => {
          app.compareOpen = app.compareOpen || new Set();
          if (details.open) app.compareOpen.add(key);
          else app.compareOpen.delete(key);
        });
        body.append(details);
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

  // ---------- Installation sur l'écran d'accueil ----------
  let installPrompt = null;
  const standalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  function renderInstall() {
    if (standalone()) {
      $('install-text').textContent = 'Le jeu est déjà installé sur cet appareil.';
      $('btn-install').hidden = true;
      return;
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    $('btn-install').hidden = !installPrompt;
    $('install-text').textContent = installPrompt
      ? "Ajoute le jeu à l'écran d'accueil : il s'ouvre en plein écran, comme une application."
      : ios
        ? "Sur iPhone : touche le bouton Partager du navigateur, puis « Sur l'écran d'accueil »."
        : "Dans le menu de ton navigateur, choisis « Installer l'application » ou « Ajouter à l'écran d'accueil ».";
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    renderInstall();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    renderInstall();
  });
  $('btn-install').addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
    renderInstall();
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  /**
   * Invitation à installer le jeu, sur l'accueil : sans application installée, un cadre explique comment faire selon l'appareil.
   * Depuis un navigateur intégré à une autre application (Messenger, Instagram…), l'installation est impossible : on propose de
   * copier le lien pour l'ouvrir dans Chrome ou Safari. « Plus tard » la repousse de deux jours ; elle s'arrête après cinq reports.
   */
  const INSTALL_KEY = 'speleo-install-nudge';
  const inAppBrowser = () => /FBAN|FBAV|FB_IAB|Instagram|Messenger|Snapchat|TikTok|LinkedInApp|Twitter|MicroMessenger|Line\/|; wv\)/i.test(navigator.userAgent);
  function installNudgeState() {
    try {
      return JSON.parse(localStorage.getItem(INSTALL_KEY)) || { n: 0, until: 0 };
    } catch {
      return { n: 0, until: 0 };
    }
  }
  function renderInstallNudge() {
    const card = $('install-card');
    const state = installNudgeState();
    if (!app.me || standalone() || state.n >= 5 || Date.now() < state.until) {
      card.hidden = true;
      return;
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const now = $('btn-install-now');
    now.hidden = true;
    if (inAppBrowser()) {
      $('install-title').textContent = 'Ouvre le jeu dans ton navigateur';
      $('install-body').textContent = "Tu as ouvert le jeu depuis une autre application : il ne peut pas s'y installer. Copie le lien, ouvre-le dans Chrome ou Safari, puis installe le jeu pour le retrouver en plein écran, d'un seul toucher.";
      now.textContent = 'Copier le lien du jeu';
      now.hidden = false;
      now.onclick = async () => {
        try {
          await navigator.clipboard.writeText(location.origin + location.pathname);
          now.textContent = 'Lien copié ! Colle-le dans ton navigateur.';
        } catch {
          now.textContent = location.origin + location.pathname;
        }
      };
    } else if (installPrompt) {
      $('install-title').textContent = 'Installe le jeu sur ton appareil';
      $('install-body').textContent = "Un toucher et le jeu rejoint ton écran d'accueil : il s'ouvre en plein écran, comme une application, sans barre d'adresse.";
      now.textContent = "Installer l'application";
      now.hidden = false;
      now.onclick = async () => {
        installPrompt.prompt();
        await installPrompt.userChoice.catch(() => {});
        installPrompt = null;
        renderInstallNudge();
      };
    } else {
      $('install-title').textContent = 'Installe le jeu sur ton appareil';
      $('install-body').textContent = ios
        ? "Sur iPhone, dans Safari : touche le bouton Partager, puis « Sur l'écran d'accueil ». Le jeu s'ouvrira en plein écran, comme une application."
        : "Dans le menu de ton navigateur, choisis « Installer l'application » ou « Ajouter à l'écran d'accueil » : le jeu s'ouvrira en plein écran, comme une application.";
    }
    card.hidden = false;
  }
  $('btn-install-later').addEventListener('click', () => {
    const state = installNudgeState();
    try {
      localStorage.setItem(INSTALL_KEY, JSON.stringify({ n: state.n + 1, until: Date.now() + 2 * 86400000 }));
    } catch {
      /* sans stockage : le cadre reviendra */
    }
    $('install-card').hidden = true;
  });
  window.addEventListener('appinstalled', renderInstallNudge);
  window.addEventListener('beforeinstallprompt', () => setTimeout(renderInstallNudge, 0));

  // ---------- Réglages et sections repliables : icônes et en-têtes plus lisibles ----------
  const SETTINGS_ICONS = { 'Taille du texte': 'livre', 'Taille des boutons': 'pioche', Confort: 'casque', Lecture: 'journal', Son: 'note', Apparence: 'miroir', Couleurs: 'diamant', 'Ancienne version (contremaître)': 'horloge', Tutoriel: 'taupe', 'Ambiance sonore': 'note', 'Inviter des amis': 'enveloppe', "Installer l'application": 'maison' };
  /** Chaque groupe de réglages devient une section repliable avec son icône ; seule la première reste ouverte au départ. */
  function decorateSettings() {
    document.querySelectorAll('#form-settings > fieldset').forEach((fieldset, index) => {
      const legend = fieldset.querySelector('legend');
      if (!legend) return;
      const icon = el('canvas', { class: 'sec-icon', width: '16', height: '16', 'aria-hidden': 'true' });
      const title = legend.textContent.trim();
      Icons.drawIcon(icon, SETTINGS_ICONS[title] || 'lampe');
      // La légende d'un fieldset s'affiche à cheval sur sa bordure : on la garde pour les lecteurs d'écran et on dessine un vrai en-tête.
      const head = el('div', { class: 'sec-head', role: 'button', tabindex: '0', 'aria-expanded': String(index === 0) }, icon, el('span', {}, title), el('span', { class: 'pm', 'aria-hidden': 'true' }));
      legend.classList.add('sr-only');
      fieldset.prepend(head);
      fieldset.classList.add('sec');
      if (index > 0) fieldset.classList.add('closed');
      const toggle = () => {
        const closed = fieldset.classList.toggle('closed');
        head.setAttribute('aria-expanded', String(!closed));
      };
      head.addEventListener('click', toggle);
      head.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      });
    });
  }
  decorateSettings();

  const FOLD_ICONS = { defis: 'trophee', profil: 'casque', cranes: 'crane', badges: 'medaille', atelier: 'pioche', carnet: 'journal', bilan: 'horloge', stats: 'cible', proposer: 'livre', 'mes-signalements': 'drapeau', sante: 'lampe', annonces: 'enveloppe', suggestions: 'livre', signalements: 'drapeau', 'duels-valider': 'trophee', suspicions: 'oeil', invitation: 'fanion', refusees: 'cible', essai: 'oeil', 'messages-signales': 'bouclier', inverse: 'miroir', tableau: 'trophee' };
  /** Une petite icône pixel art devant le titre de chaque section repliable. */
  function decorateFolds() {
    document.querySelectorAll('details.fold[data-fold] > summary').forEach((summary) => {
      const key = summary.parentElement.dataset.fold;
      if (!FOLD_ICONS[key] || summary.querySelector('.fold-icon')) return;
      const icon = el('canvas', { class: 'fold-icon', width: '16', height: '16', 'aria-hidden': 'true' });
      Icons.drawIcon(icon, FOLD_ICONS[key]);
      summary.prepend(icon);
    });
  }
  decorateFolds();

  // ---------- Démarrage ----------
  fitCanvas();
  goHome().catch(() => show('auth'));
})();
