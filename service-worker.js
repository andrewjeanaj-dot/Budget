// A incrementer apres TOUTE modification d'un fichier de l'app, sinon les
// telephones gardent l'ancienne version en cache.
const VERSION = 'v9';
const CACHE_STATIQUE = `budget-statique-${VERSION}`;

const FICHIERS_A_METTRE_EN_CACHE = [
  'index.html', 'ajout.html', 'mouvements.html', 'budget.html', 'tendance.html', 'categories.html', 'epargne.html', 'sauvegarde.html', 'plus.html',
  'css/style.css',
  'js/format.js', 'js/db.js', 'js/local.js', 'js/donnees.js', 'js/nav.js',
  'js/graphique.js', 'js/saisie.js', 'js/budget.js', 'js/tendance.js', 'js/categories.js',
  'js/epargne.js', 'js/sauvegarde.js', 'js/plus.js',
  'js/mouvements.js', 'js/accueil.js', 'js/page-ajout.js', 'js/page-mouvements.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  // cache:'reload' : va toujours chercher la vraie version en ligne. Sans
  // cela, le cache HTTP du navigateur peut renvoyer d'anciens fichiers.
  event.waitUntil(
    caches.open(CACHE_STATIQUE).then((cache) => cache.addAll(
      FICHIERS_A_METTRE_EN_CACHE.map((f) => new Request(f, { cache: 'reload' }))
    ))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(
        noms.filter((n) => n !== CACHE_STATIQUE).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

async function cachePuisReseau(request) {
  // Sert immediatement depuis le cache (instantane, marche hors ligne) et
  // rafraichit en arriere-plan pour la prochaine ouverture.
  const cache = await caches.open(CACHE_STATIQUE);
  const enCache = await cache.match(request, { ignoreSearch: true });
  const reseau = fetch(request, { cache: 'reload' })
    .then((reponse) => {
      if (reponse && reponse.ok) cache.put(request, reponse.clone()).catch(() => {});
      return reponse;
    })
    .catch(() => null);

  if (enCache) return enCache;
  const reponse = await reseau;
  if (reponse) return reponse;
  if (request.mode === 'navigate') {
    const repli = await cache.match('index.html');
    if (repli) return repli;
  }
  return new Response('Hors ligne', { status: 503, statusText: 'Hors ligne' });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;
  event.respondWith(cachePuisReseau(event.request));
});
