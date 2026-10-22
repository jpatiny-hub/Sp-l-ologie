'use strict';

/*
 * Service worker minimal : il rend l'application installable (écran d'accueil du téléphone) sans rien mettre en cache.
 * Le jeu a toujours besoin du serveur ; les mises à jour de l'interface restent gérées par le bandeau « Recharger ».
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  /* requêtes laissées au réseau */
});
