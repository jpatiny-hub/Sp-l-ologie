'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client } = require('./helpers');

async function trio(app) {
  const adam = client(app.base);
  const eve = client(app.base);
  const lou = client(app.base);
  await adam('/api/signup', { username: 'adam', password: 'secret123' });
  await eve('/api/signup', { username: 'eve', password: 'secret123' });
  await lou('/api/signup', { username: 'lou', password: 'secret123' });
  return { adam, eve, lou };
}

test('messagerie : envoi, non lus, lecture et liste des conversations', async () => {
  const app = await startServer();
  try {
    const { adam, eve, lou } = await trio(app);
    assert.equal((await eve('/api/me')).data.unreadMessages, 0);
    const sent = await adam('/api/messages/send', { to: 'eve', text: '  Salut Eve !  ' });
    assert.equal(sent.status, 200);
    assert.equal(sent.data.messages.length, 1);
    assert.equal(sent.data.messages[0].body, 'Salut Eve !');
    assert.equal(sent.data.messages[0].mine, true);
    await adam('/api/messages/send', { to: 'eve', text: 'Tu as fait quel score ?' });
    assert.equal((await eve('/api/me')).data.unreadMessages, 2);
    const list = (await eve('/api/messages')).data;
    assert.equal(list.unread, 2);
    assert.equal(list.conversations.length, 1);
    assert.equal(list.conversations[0].username, 'adam');
    assert.equal(list.conversations[0].unread, 2);
    assert.equal(list.conversations[0].last.body, 'Tu as fait quel score ?');
    const thread = (await eve('/api/messages/thread?with=adam')).data;
    assert.deepEqual(thread.messages.map((m) => m.body), ['Salut Eve !', 'Tu as fait quel score ?']);
    assert.equal(thread.messages[0].mine, false);
    assert.equal((await eve('/api/me')).data.unreadMessages, 0, 'lus à l\'ouverture');
    await eve('/api/messages/send', { to: 'adam', text: 'Bien !' });
    assert.equal((await adam('/api/me')).data.unreadMessages, 1);
    // Les autres joueurs ne voient rien de cette conversation.
    assert.equal((await lou('/api/messages')).data.conversations.length, 0);
    assert.equal((await lou('/api/messages/thread?with=adam')).data.messages.length, 0);
    assert.equal((await lou('/api/messages/people')).data.people.length, 2);
  } finally {
    await app.close();
  }
});

test('messagerie : validations, limite de débit, blocage', async () => {
  const app = await startServer();
  try {
    const { adam, eve } = await trio(app);
    assert.equal((await adam('/api/messages/send', { to: 'adam', text: 'moi' })).status, 400);
    assert.equal((await adam('/api/messages/send', { to: 'inconnu', text: 'hello' })).status, 404);
    assert.equal((await adam('/api/messages/send', { to: 'eve', text: '   ' })).status, 400);
    assert.equal((await adam('/api/messages/send', { to: 'eve', text: 'x'.repeat(501) })).status, 400);
    const anon = client(app.base);
    assert.equal((await anon('/api/messages')).status, 401);
    // Blocage : Eve ne reçoit plus rien d'Adam.
    await eve('/api/messages/block', { username: 'adam' });
    assert.equal((await adam('/api/messages/send', { to: 'eve', text: 'coucou' })).status, 403);
    assert.equal((await eve('/api/messages/send', { to: 'adam', text: 'coucou' })).status, 409, 'on ne peut pas écrire à quelqu\'un qu\'on a bloqué');
    await eve('/api/messages/block', { username: 'adam', blocked: false });
    assert.equal((await adam('/api/messages/send', { to: 'eve', text: 'coucou' })).status, 200);
    // Débit : 20 messages par minute au plus.
    for (let i = 0; i < 19; i++) assert.equal((await adam('/api/messages/send', { to: 'eve', text: `m${i}` })).status, 200);
    assert.equal((await adam('/api/messages/send', { to: 'eve', text: 'trop' })).status, 429);
    app.clock.now += 61 * 1000;
    assert.equal((await adam('/api/messages/send', { to: 'eve', text: 'ok' })).status, 200);
  } finally {
    await app.close();
  }
});

test('messagerie : signalement au responsable et effacement des vieux messages', async () => {
  const app = await startServer();
  try {
    const { adam, eve } = await trio(app); // adam : responsable
    await adam('/api/messages/send', { to: 'eve', text: 'premier' });
    const second = (await adam('/api/messages/send', { to: 'eve', text: 'deuxième' })).data.messages[1];
    assert.equal((await adam('/api/messages/report', { id: second.id })).status, 404, 'seul le destinataire signale');
    assert.equal((await eve('/api/messages/report', { id: second.id })).status, 200);
    assert.equal((await eve('/api/admin/message-reports')).status, 403);
    const reports = (await adam('/api/admin/message-reports')).data.reports;
    assert.equal(reports.length, 1);
    assert.equal(reports[0].from, 'adam');
    assert.equal(reports[0].reporter, 'eve');
    assert.equal(reports[0].body, 'deuxième');
    assert.deepEqual(reports[0].context.map((c) => c.body), ['premier', 'deuxième']);
    await adam('/api/admin/message-reports/handled', { id: second.id });
    assert.equal((await adam('/api/admin/message-reports')).data.reports.length, 0);
    app.clock.now += 91 * 24 * 3600 * 1000;
    const again = client(app.base); // la session a expiré entre-temps
    await again('/api/login', { username: 'eve', password: 'secret123' });
    assert.equal((await again('/api/messages')).data.conversations.length, 0, 'plus de 90 jours : effacés');
  } finally {
    await app.close();
  }
});
