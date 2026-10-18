'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./src/config');
const { openDb } = require('./src/db');
const { loadThemes } = require('./src/themes');
const { GameService, HttpError } = require('./src/game');
const { msUntilNextDay, isDay } = require('./src/dates');
const auth = require('./src/auth');

const SESSION_MS = config.SESSION_DAYS * 24 * 3600 * 1000;
const MAX_BODY = 10 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  // Le jeu n'est accessible qu'à ceux qui ont le lien : pas d'indexation.
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

function createApp({
  db,
  themes,
  now = Date.now,
  secureCookies = false,
  publicDir = config.PUBLIC_DIR,
  clientIpHeader = config.CLIENT_IP_HEADER,
}) {
  const game = new GameService(db, themes, now);
  const loginLimiter = new auth.RateLimiter(10, 15 * 60 * 1000);
  const signupLimiter = new auth.RateLimiter(10, 60 * 60 * 1000);

  function send(res, status, body, headers = {}) {
    res.writeHead(status, { ...SECURITY_HEADERS, 'Cache-Control': 'no-store', ...headers });
    res.end(body);
  }

  function json(res, status, data, headers = {}) {
    send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  }

  // Adresse du visiteur, pour limiter les tentatives de connexion et d'inscription.
  // - Derrière un tunnel Cloudflare, X-Forwarded-For peut ne contenir que l'adresse du tunnel :
  //   CLIENT_IP_HEADER=cf-connecting-ip fait lire l'en-tête posé par Cloudflare. À ne régler que
  //   si Cloudflare est bien devant le serveur, sinon n'importe quel visiteur pourrait l'inventer.
  // - Sinon, la dernière adresse de X-Forwarded-For est celle ajoutée par le proxy : contrairement
  //   aux précédentes, le visiteur ne peut pas l'inventer.
  function clientIp(req) {
    if (clientIpHeader) {
      const direct = String(req.headers[clientIpHeader] || '').trim();
      if (direct) return direct;
    }
    const forwarded = String(req.headers['x-forwarded-for'] || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    return forwarded[forwarded.length - 1] || req.socket.remoteAddress || 'inconnu';
  }

  function parseCookies(req) {
    const out = {};
    for (const part of String(req.headers.cookie || '').split(';')) {
      const i = part.indexOf('=');
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
  }

  function sessionCookie(token, maxAgeMs) {
    const attrs = [`sid=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
    if (secureCookies) attrs.push('Secure');
    return attrs.join('; ');
  }

  function createSession(userId) {
    const token = auth.newSessionToken();
    const t = now();
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
      auth.hashToken(token),
      userId,
      t,
      t + SESSION_MS,
    );
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(t);
    return sessionCookie(token, SESSION_MS);
  }

  /** Utilisateur connecté (ou null). Prolonge la session si elle a plus d'un mois. */
  function currentUser(req, res) {
    const token = parseCookies(req).sid;
    if (!token) return null;
    const tokenHash = auth.hashToken(token);
    const row = db
      .prepare(
        `SELECT u.id, u.username, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(tokenHash, now());
    if (!row) return null;
    if (row.expires_at - now() < SESSION_MS - 30 * 24 * 3600 * 1000) {
      db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(now() + SESSION_MS, tokenHash);
      res.setHeader('Set-Cookie', sessionCookie(token, SESSION_MS));
    }
    return { id: row.id, username: row.username };
  }

  function requireUser(req, res) {
    const user = currentUser(req, res);
    if (!user) throw new HttpError(401, 'Connecte-toi pour jouer.');
    return user;
  }

  async function readJson(req) {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
      throw new HttpError(415, 'Requête JSON attendue.');
    }
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) throw new HttpError(413, 'Requête trop volumineuse.');
      chunks.push(chunk);
    }
    if (!size) return {};
    try {
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return data && typeof data === 'object' ? data : {};
    } catch {
      throw new HttpError(400, 'JSON invalide.');
    }
  }

  function userView(user) {
    return { username: user.username };
  }

  const routes = {
    'POST /api/signup': async (req, res) => {
      const ip = clientIp(req);
      if (signupLimiter.blocked(ip, now())) throw new HttpError(429, 'Trop de comptes créés. Réessaie plus tard.');
      const { username, password } = await readJson(req);
      const problem = auth.validateUsername(username) || auth.validatePassword(password);
      if (problem) throw new HttpError(400, problem);
      const display = username.normalize('NFC').trim();
      const key = auth.usernameKey(display);
      if (db.prepare('SELECT 1 FROM users WHERE username_key = ?').get(key)) {
        throw new HttpError(409, 'Cet identifiant est déjà pris.');
      }
      const recoveryCode = auth.newRecoveryCode();
      const [passwordHash, recoveryHash] = await Promise.all([
        auth.hashSecret(password),
        auth.hashSecret(auth.normalizeRecoveryCode(recoveryCode)),
      ]);
      let userId;
      try {
        userId = Number(
          db
            .prepare(
              'INSERT INTO users (username, username_key, password_hash, recovery_hash, created_at) VALUES (?, ?, ?, ?, ?)',
            )
            .run(display, key, passwordHash, recoveryHash, now()).lastInsertRowid,
        );
      } catch (err) {
        if (String(err.message).includes('UNIQUE')) throw new HttpError(409, 'Cet identifiant est déjà pris.');
        throw err;
      }
      signupLimiter.fail(ip, now());
      json(res, 201, { user: userView({ username: display }), recoveryCode }, { 'Set-Cookie': createSession(userId) });
    },

    'POST /api/login': async (req, res) => {
      const { username, password } = await readJson(req);
      if (typeof username !== 'string' || typeof password !== 'string') throw new HttpError(400, 'Identifiant et mot de passe requis.');
      const key = auth.usernameKey(username.trim());
      const limiterKey = `${clientIp(req)}|${key}`;
      if (loginLimiter.blocked(limiterKey, now())) throw new HttpError(429, 'Trop de tentatives. Réessaie dans quelques minutes.');
      const user = db.prepare('SELECT * FROM users WHERE username_key = ?').get(key);
      if (!user || !(await auth.verifySecret(password, user.password_hash))) {
        loginLimiter.fail(limiterKey, now());
        throw new HttpError(401, 'Identifiant ou mot de passe incorrect.');
      }
      loginLimiter.reset(limiterKey);
      json(res, 200, { user: userView(user) }, { 'Set-Cookie': createSession(user.id) });
    },

    'POST /api/logout': async (req, res) => {
      const token = parseCookies(req).sid;
      if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(auth.hashToken(token));
      json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
    },

    // Mot de passe oublié : le code de récupération donné à l'inscription permet d'en choisir un nouveau.
    'POST /api/recover': async (req, res) => {
      const { username, recoveryCode, newPassword } = await readJson(req);
      if (typeof username !== 'string') throw new HttpError(400, 'Identifiant requis.');
      const problem = auth.validatePassword(newPassword);
      if (problem) throw new HttpError(400, problem);
      const key = auth.usernameKey(username.trim());
      const limiterKey = `${clientIp(req)}|${key}|recover`;
      if (loginLimiter.blocked(limiterKey, now())) throw new HttpError(429, 'Trop de tentatives. Réessaie dans quelques minutes.');
      const user = db.prepare('SELECT * FROM users WHERE username_key = ?').get(key);
      const code = auth.normalizeRecoveryCode(recoveryCode);
      if (!user || !code || !(await auth.verifySecret(code, user.recovery_hash))) {
        loginLimiter.fail(limiterKey, now());
        throw new HttpError(401, 'Identifiant ou code de récupération incorrect.');
      }
      loginLimiter.reset(limiterKey);
      const nextCode = auth.newRecoveryCode();
      const [passwordHash, recoveryHash] = await Promise.all([
        auth.hashSecret(newPassword),
        auth.hashSecret(auth.normalizeRecoveryCode(nextCode)),
      ]);
      db.prepare('UPDATE users SET password_hash = ?, recovery_hash = ? WHERE id = ?').run(passwordHash, recoveryHash, user.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
      json(res, 200, { user: userView(user), recoveryCode: nextCode }, { 'Set-Cookie': createSession(user.id) });
    },

    // Vérification de bon fonctionnement utilisée par l'hébergeur.
    'GET /api/health': async (req, res) => {
      db.prepare('SELECT 1').get();
      json(res, 200, { ok: true });
    },

    'GET /api/me': async (req, res) => {
      const user = currentUser(req, res);
      if (!user) return json(res, 200, { user: null });
      json(res, 200, {
        user: userView(user),
        today: game.todaySummary(user.id),
        nextResetMs: msUntilNextDay(now()),
        timerSeconds: config.TIMER_SECONDS,
      });
    },

    'POST /api/game/start': async (req, res) => {
      const user = requireUser(req, res);
      const { mode } = await readJson(req);
      json(res, 200, game.startGame(user.id, mode));
    },

    'GET /api/game/:id': async (req, res, id) => {
      const user = requireUser(req, res);
      json(res, 200, game.state(id, user.id));
    },

    'POST /api/game/:id/reveal': async (req, res, id) => {
      const user = requireUser(req, res);
      await readJson(req);
      json(res, 200, game.reveal(id, user.id));
    },

    'POST /api/game/:id/answer': async (req, res, id) => {
      const user = requireUser(req, res);
      const { text, accept, reject } = await readJson(req);
      json(res, 200, game.answer(id, user.id, text, { accept: typeof accept === 'string' ? accept : null, reject: reject === true }));
    },

    'POST /api/game/:id/skip': async (req, res, id) => {
      const user = requireUser(req, res);
      await readJson(req);
      json(res, 200, game.skip(id, user.id));
    },

    'GET /api/game/:id/answers': async (req, res, id, url) => {
      const user = requireUser(req, res);
      json(res, 200, game.themeAnswers(id, user.id, Number(url.searchParams.get('slot'))));
    },

    // ?period=day|week|month (semaine par défaut) & date=AAAA-MM-JJ (un jour de la période voulue).
    'GET /api/leaderboard': async (req, res, _id, url) => {
      const user = requireUser(req, res);
      const date = url.searchParams.get('date') || url.searchParams.get('week');
      json(res, 200, game.leaderboard(isDay(date) ? date : game.today(), user.id, url.searchParams.get('period') || 'week'));
    },
  };

  function findRoute(method, pathname) {
    const direct = routes[`${method} ${pathname}`];
    if (direct) return { handler: direct };
    const m = pathname.match(/^\/api\/game\/(\d+)(\/[a-z]+)?$/);
    if (m) {
      const handler = routes[`${method} /api/game/:id${m[2] || ''}`];
      if (handler) return { handler, id: Number(m[1]) };
    }
    return null;
  }

  async function serveStatic(req, res, pathname) {
    const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
    const file = path.resolve(publicDir, rel);
    if (!file.startsWith(path.resolve(publicDir) + path.sep)) return send(res, 404, 'Introuvable');
    try {
      const data = await fs.promises.readFile(file);
      const type = MIME[path.extname(file)] || 'application/octet-stream';
      const cache = file.includes(`${path.sep}fonts${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
      send(res, 200, req.method === 'HEAD' ? undefined : data, { 'Content-Type': type, 'Cache-Control': cache });
    } catch {
      send(res, 404, 'Introuvable', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
  }

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        const route = findRoute(req.method, url.pathname);
        if (!route) throw new HttpError(404, 'Route inconnue.');
        await route.handler(req, res, route.id, url);
      } else if (req.method === 'GET' || req.method === 'HEAD') {
        await serveStatic(req, res, url.pathname);
      } else {
        throw new HttpError(405, 'Méthode non autorisée.');
      }
    } catch (err) {
      if (err instanceof HttpError) return json(res, err.status, { error: err.message });
      console.error(err);
      json(res, 500, { error: 'Erreur interne du serveur.' });
    }
  };
}

function main() {
  // En production, la base doit vivre hors du dossier de l'application : celui-ci est remplacé
  // à chaque déploiement et les anciennes versions sont supprimées.
  if (process.env.NODE_ENV === 'production' && !process.env.DATA_DIR) {
    console.error('DATA_DIR doit indiquer un dossier permanent pour la base de données (production).');
    process.exit(1);
  }
  const themes = loadThemes(config.THEMES_DIR);
  for (const theme of themes.values()) {
    for (const warning of theme.warnings) console.warn(`[thème ${theme.id}] ${warning}`);
  }
  const db = openDb(path.join(config.DATA_DIR, 'speleologie.sqlite'));
  const handler = createApp({ db, themes, secureCookies: process.env.NODE_ENV === 'production' });
  // HOST=127.0.0.1 : seul le proxy de la machine peut joindre le jeu.
  http.createServer(handler).listen(config.PORT, config.HOST, () => {
    console.log(`${config.GAME_NAME} : ${themes.size} thèmes chargés, écoute sur ${config.HOST || '*'}:${config.PORT}`);
  });
}

if (require.main === module) main();

module.exports = { createApp };
