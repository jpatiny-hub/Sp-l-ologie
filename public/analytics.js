// Mesure d'audience Matomo (instance du responsable du jeu). Aucune donnée de compte n'est transmise :
// seulement les pages vues (accueil, profil, etc.).
(function () {
  var _paq = (window._paq = window._paq || []);
  _paq.push(['trackPageView']);
  _paq.push(['enableLinkTracking']);
  (function () {
    var u = 'https://piwik.weesky.net/';
    _paq.push(['setTrackerUrl', u + 'matomo.php']);
    _paq.push(['setSiteId', '17']);
    var d = document;
    var g = d.createElement('script');
    var s = d.getElementsByTagName('script')[0];
    g.async = true;
    g.src = u + 'matomo.js';
    s.parentNode.insertBefore(g, s);
  })();
})();
