/**
 * ============================================================
 * SERVICE-WORKER.JS — WildBeast Chronicles (PWA)
 *
 * Stratégie : "stale-while-revalidate" avec détection de version.
 *
 *  1. Au lancement, le jeu se sert INSTANTANÉMENT depuis le cache
 *     (fonctionne même hors-ligne, démarrage rapide).
 *  2. En parallèle, le Service Worker vérifie `version.json` sur le
 *     serveur. Si le numéro de version a changé, TOUS les fichiers
 *     du jeu sont re-téléchargés en arrière-plan dans un nouveau cache.
 *  3. Une fois le nouveau cache prêt, l'app est notifiée
 *     ('UPDATE_READY'). La mise à jour devient active au prochain
 *     lancement complet du jeu (rechargement de page), jamais en
 *     plein milieu d'une partie en cours.
 *
 * Pour publier une mise à jour : il suffit d'incrémenter le champ
 * "version" dans version.json lors du déploiement. Tout le reste
 * est automatique.
 * ============================================================
 */

'use strict';

// ⚠️ Incrémenter ce préfixe UNIQUEMENT si la structure du cache change
// (ex: nouveaux fichiers ajoutés à APP_SHELL). Pour une mise à jour de
// contenu normale, il suffit de changer version.json — pas ce fichier.
const CACHE_PREFIX = 'wildbeast-cache';

// Liste de tous les fichiers nécessaires au fonctionnement hors-ligne du jeu.
// Les fichiers audio importés par l'utilisateur (IndexedDB) ne sont PAS ici :
// ils sont gérés séparément par audio.js et n'ont pas besoin du cache HTTP.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './utils.js',
  './database.js',
  './state.js',
  './quests.js',
  './shop.js',
  './engine.js',
  './evolution.js',
  './playerlevelup.js',
  './audio.js',
  './gacha.js',
  './passives.js',
  './ui.js',
  './dailyrewards.js',
  './admin.js',
  './save.js',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
];

let _activeCacheName = null;

// ─── INSTALLATION ────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cacheName = `${CACHE_PREFIX}-installing`;
      const cache = await caches.open(cacheName);
      // addAll échoue globalement si UN SEUL fichier 404 : on tolère les échecs
      // individuels pour ne pas bloquer toute l'installation du Service Worker.
      await Promise.allSettled(
        APP_SHELL.map((url) => cache.add(url).catch((e) => {
          console.warn('[SW] Échec mise en cache (install) :', url, e);
        }))
      );
      // Active immédiatement la nouvelle version du SW sans attendre
      // la fermeture des onglets existants.
      self.skipWaiting();
    })()
  );
});

// ─── ACTIVATION ──────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Prend le contrôle immédiat de toutes les pages ouvertes
      await self.clients.claim();

      // Renomme le cache "installing" en cache versionné, si présent
      const installingCache = await caches.open(`${CACHE_PREFIX}-installing`);
      const keys = await installingCache.keys();
      if (keys.length > 0) {
        const version = await _fetchVersion();
        const finalName = `${CACHE_PREFIX}-v${version || 'unknown'}`;
        await _copyCache(`${CACHE_PREFIX}-installing`, finalName);
        await caches.delete(`${CACHE_PREFIX}-installing`);
        _activeCacheName = finalName;
      }

      // Supprime tous les anciens caches (versions précédentes)
      const allCaches = await caches.keys();
      await Promise.all(
        allCaches
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== _activeCacheName)
          .map((name) => caches.delete(name))
      );
    })()
  );
});

async function _copyCache(fromName, toName) {
  const fromCache = await caches.open(fromName);
  const toCache = await caches.open(toName);
  const requests = await fromCache.keys();
  await Promise.all(
    requests.map(async (req) => {
      const res = await fromCache.match(req);
      if (res) await toCache.put(req, res);
    })
  );
}

async function _fetchVersion() {
  try {
    const res = await fetch('./version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.version || null;
  } catch (e) {
    return null;
  }
}

// ─── INTERCEPTION DES REQUÊTES (stale-while-revalidate) ─────────────────────

// Fichiers qui doivent TOUJOURS être lus depuis le réseau, jamais depuis le
// cache du Service Worker : leur intérêt même est d'être vérifiés à chaque
// fois pour détecter une mise à jour (version.json est déjà lu en direct
// par le SW lui-même hors de ce handler ; database_export.json est lu par
// la page via fetch() — s'il passait par le cache stale-while-revalidate,
// la page recevrait systématiquement l'ancienne version mise en cache au
// lieu d'aller vérifier le réseau comme elle le demande explicitement).
const NETWORK_ONLY_FILES = ['./version.json', './database_export.json'];

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ne traiter que les requêtes GET du même domaine (ignore API externes, etc.)
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (NETWORK_ONLY_FILES.some((f) => url.pathname.endsWith(f.replace('./', '/')))) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(
        () => new Response('', { status: 503, statusText: 'Hors-ligne' })
      )
    );
    return;
  }

  event.respondWith(_staleWhileRevalidate(request));
});

async function _staleWhileRevalidate(request) {
  const cache = await caches.open(await _getActiveCacheName());
  const cached = await cache.match(request);

  // Lance la requête réseau en arrière-plan dans tous les cas (même si on a
  // déjà une réponse en cache) : c'est ce qui permet la détection silencieuse
  // de mise à jour pour le PROCHAIN lancement du jeu.
  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null); // pas de réseau : on retombe sur le cache silencieusement

  // Réponse immédiate depuis le cache si disponible (rapide, fonctionne hors-ligne)
  if (cached) {
    return cached;
  }

  // Sinon (premher chargement, rien en cache) : attendre le réseau
  const networkResponse = await networkFetch;
  if (networkResponse) return networkResponse;

  // Ni cache ni réseau : fallback minimal pour éviter un écran blanc
  if (request.mode === 'navigate') {
    return new Response(
      '<h1>Hors-ligne</h1><p>Le jeu n\'a pas encore été mis en cache. Connecte-toi à internet une première fois.</p>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
  return new Response('', { status: 503, statusText: 'Service indisponible (hors-ligne)' });
}

async function _getActiveCacheName() {
  if (_activeCacheName) return _activeCacheName;
  const allCaches = await caches.keys();
  const versioned = allCaches.filter((n) => n.startsWith(CACHE_PREFIX) && n !== `${CACHE_PREFIX}-installing`);
  _activeCacheName = versioned[0] || `${CACHE_PREFIX}-installing`;
  return _activeCacheName;
}

// ─── DÉTECTION DE MISE À JOUR (vérification périodique en arrière-plan) ─────

/**
 * Compare la version distante à la version utilisée pour construire le cache
 * actif. Si elles diffèrent, re-télécharge tout l'App Shell dans un nouveau
 * cache versionné et notifie les pages ouvertes ('UPDATE_READY') pour qu'elles
 * puissent informer le joueur (ex: bannière "Relance le jeu pour mettre à jour").
 */
async function _checkForUpdate() {
  const remoteVersion = await _fetchVersion();
  if (!remoteVersion) return;

  const activeCacheName = await _getActiveCacheName();
  const activeVersion = activeCacheName.replace(`${CACHE_PREFIX}-v`, '');

  if (remoteVersion === activeVersion) return; // déjà à jour

  // Nouvelle version détectée : télécharger l'App Shell complet dans un
  // nouveau cache, SANS toucher au cache actif (le joueur continue sur la
  // version actuelle jusqu'au prochain lancement).
  const newCacheName = `${CACHE_PREFIX}-v${remoteVersion}`;
  const newCache = await caches.open(newCacheName);
  const results = await Promise.allSettled(
    APP_SHELL.map((url) => fetch(url, { cache: 'no-store' }).then((res) => {
      if (res.status === 200) return newCache.put(url, res);
    }))
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > APP_SHELL.length / 2) {
    // Trop d'échecs (connexion instable) : on abandonne cette tentative,
    // elle sera retentée à la prochaine vérification.
    await caches.delete(newCacheName);
    return;
  }

  _activeCacheName = newCacheName;

  // Nettoyer les anciens caches versionnés (sauf celui encore utilisé par
  // les onglets ouverts, qui sera nettoyé à la prochaine activation)
  const allCaches = await caches.keys();
  await Promise.all(
    allCaches
      .filter((n) => n.startsWith(CACHE_PREFIX) && n !== newCacheName && n !== `${CACHE_PREFIX}-installing`)
      .map((n) => caches.delete(n))
  );

  // Notifier toutes les pages ouvertes : mise à jour prête, effective au
  // prochain rechargement complet.
  const clientsList = await self.clients.matchAll({ type: 'window' });
  clientsList.forEach((client) => {
    client.postMessage({ type: 'UPDATE_READY', version: remoteVersion });
  });
}

// Déclenché manuellement par la page (voir index.html) à chaque démarrage du
// jeu, plutôt qu'avec un setInterval dans le Service Worker (qui peut être
// mis en veille par le navigateur et n'est pas fiable pour du polling).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CHECK_FOR_UPDATE') {
    event.waitUntil(_checkForUpdate());
  }
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
