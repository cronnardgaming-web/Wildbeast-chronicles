/**
 * ============================================================
 * AUDIO.JS — Musique de fond (interface globale + combats)
 * Fichiers audio importés depuis le PC du joueur (PC admin), stockés
 * localement dans IndexedDB, et joués via un lecteur <audio> natif :
 * lecture automatique, boucle continue, bascule globale/combat.
 * Aucune dépendance réseau (contrairement à un embed YouTube, sujet
 * aux restrictions d'autoplay et d'intégration).
 * ============================================================
 */

'use strict';

const AudioSystem = (() => {

  const DB_NAME    = 'chronowaifu_audio';
  const DB_VERSION = 1;
  const STORE_NAME = 'tracks';

  let _db          = null;
  let _audioEl     = null;
  let _currentKind = null;   // 'global' | 'combat' | null
  let _muted       = true;   // Démarre coupé : seul moyen fiable de garantir l'autoplay
  let _globalSavedTime = 0;  // Position (s) où reprendre la musique globale après un combat
  const _blobUrls  = { global: null, combat: null }; // URLs objet en cours, à révoquer proprement

  // ─── INDEXEDDB ──────────────────────────────────────────────────────────────

  function _openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB indisponible')); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
          req.result.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  /** Enregistre (ou remplace) le fichier audio d'un type donné */
  function saveTrack(kind, file) {
    if (!_db || !file) return Promise.resolve(false);
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(file, kind);
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => reject(tx.error);
    });
  }

  /** Supprime le fichier audio d'un type donné */
  function removeTrack(kind) {
    if (!_db) return Promise.resolve(false);
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(kind);
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => reject(tx.error);
    });
  }

  function _loadTrackBlob(kind) {
    if (!_db) return Promise.resolve(null);
    return new Promise((resolve) => {
      const tx  = _db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(kind);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => resolve(null);
    });
  }

  /** @returns {Promise<boolean>} true si un fichier est enregistré pour ce type */
  async function hasTrack(kind) {
    const blob = await _loadTrackBlob(kind);
    return !!blob;
  }

  // ─── INITIALISATION ────────────────────────────────────────────────────────

  async function init() {
    try { _db = await _openDb(); }
    catch (e) { console.error('[AudioSystem] IndexedDB indisponible, musique désactivée :', e); }

    _audioEl = document.getElementById('bg-audio-player');
    if (_audioEl) {
      _audioEl.loop = false; // on gère nous-mêmes la boucle (plus fiable sur certains navigateurs)
      _audioEl.muted = _muted;
      _audioEl.volume = 1;
      _audioEl.addEventListener('ended', () => {
        // Boucle continue : on relance depuis le début, quelle que soit la piste en cours.
        // (la musique globale ne "boucle" donc que si elle va jusqu'au bout sans être coupée par un combat)
        _audioEl.currentTime = 0;
        _audioEl.play().catch(() => { /* lecture bloquée, attend une interaction */ });
      });
    }
  }

  // ─── LECTURE ──────────────────────────────────────────────────────────────

  /**
   * Joue la musique de fond globale (interface, hors combat).
   * Si elle avait été interrompue par un combat, reprend exactement où elle
   * s'était arrêtée plutôt que de repartir de zéro.
   * @param {boolean} [force=false] - Recharge depuis le début même si déjà en cours
   *                                   (utilisé après import d'un nouveau fichier en admin)
   */
  async function playGlobal(force = false) {
    const cfg = GameState.get() ? GameState.getConfig() : null;
    if (cfg?.audio?.enabled === false) return;
    if (!_audioEl) return;
    if (_currentKind === 'global' && !force) return; // déjà en cours : on ne touche à rien

    const blob = await _loadTrackBlob('global');
    if (!blob) { _audioEl.pause(); _currentKind = null; return; }

    if (force || _blobUrls.global === null) {
      if (_blobUrls.global) URL.revokeObjectURL(_blobUrls.global);
      _blobUrls.global = URL.createObjectURL(blob);
      if (force) _globalSavedTime = 0; // nouveau fichier : on ne reprend pas une ancienne position
    }

    _audioEl.src = _blobUrls.global;
    _audioEl.currentTime = _globalSavedTime; // reprend exactement où elle s'était arrêtée
    _currentKind = 'global';
    _audioEl.muted = _muted;
    _audioEl.play().catch(() => { /* autoplay bloqué tant que le joueur n'a pas interagi */ });
  }

  /**
   * Joue la musique de combat. Repart TOUJOURS de zéro (exigence du jeu),
   * et met en pause la musique globale en mémorisant sa position exacte
   * pour la reprendre plus tard sans la faire repartir de zéro.
   * Repli automatique sur la musique globale si aucune musique de combat n'est définie.
   */
  async function playCombat() {
    const cfg = GameState.get() ? GameState.getConfig() : null;
    if (cfg?.audio?.enabled === false) return;
    if (!_audioEl) return;

    // Mémoriser la position de la musique globale avant de l'interrompre
    if (_currentKind === 'global') {
      _globalSavedTime = _audioEl.currentTime || 0;
    }

    const blob = await _loadTrackBlob('combat');
    if (!blob) { await playGlobal(); return; } // pas de musique de combat définie : on reste sur la globale

    if (_blobUrls.combat) URL.revokeObjectURL(_blobUrls.combat);
    _blobUrls.combat = URL.createObjectURL(blob);

    _audioEl.src = _blobUrls.combat;
    _audioEl.currentTime = 0; // la musique de combat repart toujours de zéro
    _currentKind = 'combat';
    _audioEl.muted = _muted;
    _audioEl.play().catch(() => { /* autoplay bloqué tant que le joueur n'a pas interagi */ });
  }

  function stop() {
    _currentKind = null;
    _globalSavedTime = 0;
    _audioEl?.pause();
  }

  // ─── BRUITAGES DE COMBAT (effets sonores ponctuels) ─────────────────────────
  // Contrairement à la musique de fond, chaque bruitage utilise un nouvel objet
  // Audio() à la volée : ça permet à plusieurs sons de se chevaucher (plusieurs
  // coups rapprochés) sans interrompre la musique de fond qui continue de jouer.

  const SFX_KEYS = {
    hitNormal: 'sfx_hit_normal',
    hitResist: 'sfx_hit_resist',
    hitWeak:   'sfx_hit_weak',
    victory:   'sfx_victory',
    defeat:    'sfx_defeat',
    levelUp:   'sfx_levelup',
    evolution: 'sfx_evolution',
    gachaPull: 'sfx_gacha_pull',
  };

  // Bruitages "de coup" exclus de l'atténuation (ils sont volontairement courts et
  // déjà nombreux ; ce sont les autres — victoire/défaite, level up, évolution,
  // tirage Gacha — qui doivent clairement ressortir par-dessus la musique).
  const NON_DUCKING_KEYS = new Set([SFX_KEYS.hitNormal, SFX_KEYS.hitResist, SFX_KEYS.hitWeak]);

  const DUCK_VOLUME = 0.25; // -75% : dans la fourchette demandée (-70 à -80%)
  let _duckCount = 0;

  /** Baisse le volume de la musique de fond (compteur pour gérer les sons qui se chevauchent) */
  function _duck() {
    _duckCount++;
    if (_audioEl) _audioEl.volume = DUCK_VOLUME;
  }

  /** Restaure le volume normal une fois que tous les bruitages "ducking" en cours sont terminés */
  function _unduck() {
    _duckCount = Math.max(0, _duckCount - 1);
    if (_duckCount === 0 && _audioEl) _audioEl.volume = 1;
  }

  /** Joue un bruitage ponctuel par sa clé de stockage (cf. SFX_KEYS) */
  async function playSfx(key) {
    const cfg = GameState.get() ? GameState.getConfig() : null;
    if (cfg?.audio?.enabled === false) return;
    if (!key) return;

    const blob = await _loadTrackBlob(key);
    if (!blob) return; // aucun bruitage importé pour cette clé : silence

    const shouldDuck = !NON_DUCKING_KEYS.has(key);
    if (shouldDuck) _duck();

    const url = URL.createObjectURL(blob);
    const sfxEl = new Audio(url);
    sfxEl.muted = _muted;
    const cleanup = () => { URL.revokeObjectURL(url); if (shouldDuck) _unduck(); };
    sfxEl.addEventListener('ended', cleanup);
    sfxEl.play().catch(cleanup); // lecture bloquée : on libère/restaure immédiatement
  }

  /**
   * Joue le bruitage de coup adapté au multiplicateur d'efficacité de type
   * (normal / résistance-immunité / faiblesse), selon les mêmes seuils que
   * l'indicateur visuel déjà affiché en combat.
   * @param {number} multiplier
   */
  function playHitSfx(multiplier) {
    let key;
    if (multiplier >= 2.0) key = SFX_KEYS.hitWeak;
    else if (multiplier <= 0.5) key = SFX_KEYS.hitResist; // couvre aussi l'immunité (0)
    else key = SFX_KEYS.hitNormal;
    playSfx(key);
  }

  /** Joue le bruitage de fin de combat (victoire ou défaite) */
  function playResultSfx(result) {
    playSfx(result === 'victory' ? SFX_KEYS.victory : SFX_KEYS.defeat);
  }

  // ─── VOLUME / MUTE ────────────────────────────────────────────────────────

  /** Coupe/active le son. Renvoie le nouvel état (true = coupé). */
  function toggleMute() {
    _muted = !_muted;
    if (_audioEl) {
      _audioEl.muted = _muted;
      if (!_muted) _audioEl.play().catch(() => {});
    }
    return _muted;
  }

  const isMuted = () => _muted;

  /** Règle le volume (0 à 1). Si vol > 0 et son coupé, ne pas couper à nouveau. */
  function setVolume(vol) {
    if (_audioEl) _audioEl.volume = Math.max(0, Math.min(1, vol));
    if (vol === 0 && !_muted) { _muted = true; if (_audioEl) _audioEl.muted = true; }
    else if (vol > 0 && _muted) { /* laisser le toggle mute gérer */ }
  }

  // ─── API PUBLIQUE ─────────────────────────────────────────────────────────

  return {
    init, saveTrack, removeTrack, hasTrack, playGlobal, playCombat, stop, toggleMute, isMuted, setVolume,
    playSfx, playHitSfx, playResultSfx, SFX_KEYS,
  };
})();
