/**
 * ============================================================
 * SAVE.JS — Système de sauvegarde multi-comptes
 *
 * Architecture :
 *  - UNE clé globale  "wildbeast_global_config"  → tout ce que l'admin modifie
 *    (config, types, typeMatrix, characters, equipment, banners)
 *    Partagée entre tous les comptes.
 *
 *  - TROIS clés joueur "wildbeast_save_slot_1/2/3" → données propres à chaque
 *    dresseur (player : collection, gemmes, progression, pity…)
 *
 * Ainsi, une modification admin s'applique immédiatement à tous les comptes,
 * et la progression d'un compte n'interfère jamais avec un autre.
 * ============================================================
 */

'use strict';

const SaveSystem = (() => {

  const GLOBAL_CONFIG_KEY = 'wildbeast_global_config';
  const SLOT_PREFIX       = 'wildbeast_save_slot_';   // + "1" | "2" | "3"
  const SETTINGS_KEY      = 'wildbeast_settings';
  const ACTIVE_SLOT_KEY   = 'wildbeast_active_slot';
  const AUTOSAVE_INTERVAL = 30000; // 30 secondes

  let _activeSlot     = 1;
  let _autosaveTimer  = null;
  let _onSaveCallback = null;

  // ─── SLOT ACTIF ──────────────────────────────────────────────────────────────

  function getActiveSlot() { return _activeSlot; }

  function setActiveSlot(slot) {
    _activeSlot = Math.max(1, Math.min(3, parseInt(slot) || 1));
    localStorage.setItem(ACTIVE_SLOT_KEY, String(_activeSlot));
  }

  function _slotKey(slot) { return SLOT_PREFIX + slot; }

  // ─── SÉPARATION CONFIG / JOUEUR ──────────────────────────────────────────────

  /**
   * Extrait la partie "config globale" d'un état complet du jeu.
   * Ce sont les données modifiées via le panneau admin.
   */
  function _extractGlobalConfig(gameState) {
    return {
      version:       gameState.config?.game?.version || '1.0.0',
      timestamp:     Date.now(),
      config:        gameState.config,
      types:         gameState.types,
      typeMatrix:    gameState.typeMatrix,
      characters:    gameState.characters,
      equipment:     gameState.equipment,
      items:         gameState.items,
      equipBanners:  gameState.equipBanners,
      banners:       gameState.banners,
      dailyQuests:   gameState.dailyQuests,
      weeklyQuests:  gameState.weeklyQuests,
      eventQuests:   gameState.eventQuests,
      tagCategories: gameState.tagCategories,
      loginCycles:   gameState.loginCycles,
      shopItems:     gameState.shopItems,
      patchNotes:    gameState.patchNotes,
      events:        gameState.events || { current: null, next: null },
    };
  }

  /**
   * Extrait la partie "données joueur" d'un état complet du jeu.
   */
  function _extractPlayerData(gameState) {
    return {
      version:   gameState.config?.game?.version || '1.0.0',
      timestamp: Date.now(),
      player:    gameState.player,
    };
  }

  // ─── SAUVEGARDE ──────────────────────────────────────────────────────────────

  /**
   * Sauvegarde l'état complet :
   *  - config globale → clé partagée
   *  - données joueur → clé du slot actif
   */
  function save(gameState, slot) {
    const targetSlot = slot ?? _activeSlot;
    let ok = true;
    try {
      // 1. Config globale (partagée)
      localStorage.setItem(GLOBAL_CONFIG_KEY, JSON.stringify(_extractGlobalConfig(gameState)));
      // 2. Données joueur (propres au slot)
      localStorage.setItem(_slotKey(targetSlot), JSON.stringify(_extractPlayerData(gameState)));
      if (_onSaveCallback) _onSaveCallback('success', targetSlot);
    } catch (e) {
      console.error('[SaveSystem] Échec de sauvegarde slot ' + targetSlot + ':', e);
      if (_onSaveCallback) _onSaveCallback('error', targetSlot, e);
      ok = false;
    }
    return ok;
  }

  /**
   * Sauvegarde uniquement la config globale (appelé depuis l'écran d'accueil
   * avant qu'un compte soit sélectionné).
   */
  function saveGlobalConfig(gameState) {
    try {
      localStorage.setItem(GLOBAL_CONFIG_KEY, JSON.stringify(_extractGlobalConfig(gameState)));
      return true;
    } catch (e) {
      console.error('[SaveSystem] Échec sauvegarde config globale :', e);
      return false;
    }
  }

  /**
   * Charge et fusionne : config globale + données joueur du slot actif.
   * Retourne null si aucune donnée (nouvelle partie).
   */
  function load(slot) {
    const targetSlot = slot ?? _activeSlot;
    try {
      const rawGlobal = localStorage.getItem(GLOBAL_CONFIG_KEY);
      const rawPlayer = localStorage.getItem(_slotKey(targetSlot));
      if (!rawGlobal && !rawPlayer) return null;
      const global = rawGlobal ? JSON.parse(rawGlobal) : {};
      const player = rawPlayer ? JSON.parse(rawPlayer) : {};
      // Fusionner en un état complet
      return {
        version:       global.version    || player.version || '1.0.0',
        config:        global.config,
        types:         global.types,
        typeMatrix:    global.typeMatrix,
        characters:    global.characters,
        equipment:     global.equipment,
        items:         global.items,
        equipBanners:  global.equipBanners,
        banners:       global.banners,
        dailyQuests:   global.dailyQuests,
        weeklyQuests:  global.weeklyQuests,
        eventQuests:   global.eventQuests,
        tagCategories: global.tagCategories,
        loginCycles:   global.loginCycles,
        shopItems:     global.shopItems,
        patchNotes:    global.patchNotes,
        events:        global.events || { current: null, next: null },
        player:        player.player,
      };
    } catch (e) {
      console.error('[SaveSystem] Échec de chargement slot ' + targetSlot + ':', e);
      return null;
    }
  }

  /**
   * Charge uniquement la config globale (pour l'admin sur l'écran d'accueil).
   */
  function loadGlobalConfig() {
    try {
      const raw = localStorage.getItem(GLOBAL_CONFIG_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  /**
   * Efface les données joueur d'un slot (ne touche pas à la config globale).
   */
  function clear(slot) {
    const targetSlot = slot ?? _activeSlot;
    localStorage.removeItem(_slotKey(targetSlot));
  }

  // ─── MÉTADONNÉES DES SLOTS ───────────────────────────────────────────────────

  function getSlotsInfo() {
    // Nombre total de créatures disponibles = taille du bestiaire global (config partagée)
    let totalCreatures = 0;
    try {
      const raw = localStorage.getItem(GLOBAL_CONFIG_KEY);
      if (raw) {
        const global = JSON.parse(raw);
        totalCreatures = Array.isArray(global.characters) ? global.characters.length : 0;
      }
    } catch (e) { /* ignore */ }

    return [1, 2, 3].map(slot => {
      try {
        const raw = localStorage.getItem(_slotKey(slot));
        if (!raw) return { slot, empty: true, totalCreatures };
        const data = JSON.parse(raw);
        const bestiaire = data.player?.bestiaire || {};
        return {
          slot,
          empty:           false,
          playerName:      data.player?.name  || 'Dresseur',
          playerLevel:     data.player?.level || 1,
          timestamp:       data.timestamp     || null,
          totalPulls:      data.player?.stats?.totalPulls || 0,
          bestiaireFound:  Object.keys(bestiaire).length,
          totalCreatures,
        };
      } catch (e) { return { slot, empty: true, totalCreatures }; }
    });
  }

  // ─── AUTOSAVE ────────────────────────────────────────────────────────────────

  function startAutosave(getState, onSave) {
    _onSaveCallback = onSave;
    if (_autosaveTimer) clearInterval(_autosaveTimer);
    _autosaveTimer = setInterval(() => {
      const state = getState();
      if (state) save(state);
    }, AUTOSAVE_INTERVAL);
  }

  function stopAutosave() {
    if (_autosaveTimer) { clearInterval(_autosaveTimer); _autosaveTimer = null; }
  }

  // ─── EXPORT / IMPORT ─────────────────────────────────────────────────────────

  function exportToFile(gameState, slot) {
    const targetSlot = slot ?? _activeSlot;
    try {
      const payload = {
        version:    gameState.config?.game?.version || '1.0.0',
        exportDate: new Date().toISOString(),
        slot:       targetSlot,
        player:     gameState.player,
        config:     gameState.config,
        types:      gameState.types,
        typeMatrix: gameState.typeMatrix,
        characters: gameState.characters,
        equipment:  gameState.equipment,
        items:      gameState.items,
        equipBanners: gameState.equipBanners,
        banners:    gameState.banners,
        dailyQuests: gameState.dailyQuests,
        loginCycles: gameState.loginCycles,
        shopItems:   gameState.shopItems,
        patchNotes:  gameState.patchNotes,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `wildbeast_compte${targetSlot}_${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error('[SaveSystem] Échec export:', e); }
  }

  function importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try { resolve(JSON.parse(e.target.result)); }
        catch (err) { reject(new Error('Fichier JSON invalide')); }
      };
      reader.onerror = () => reject(new Error('Erreur lecture fichier'));
      reader.readAsText(file);
    });
  }

  // ─── SETTINGS ────────────────────────────────────────────────────────────────

  function saveSettings(settings) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

  function loadSettings() {
    try { const r = localStorage.getItem(SETTINGS_KEY); return r ? JSON.parse(r) : {}; }
    catch (e) { return {}; }
  }

  // ─── INIT ────────────────────────────────────────────────────────────────────

  function restoreActiveSlot() {
    const stored = parseInt(localStorage.getItem(ACTIVE_SLOT_KEY));
    if (stored >= 1 && stored <= 3) _activeSlot = stored;
    return _activeSlot;
  }


  // ─── EXPORT / IMPORT SÉPARÉS ─────────────────────────────────────────────────

  /**
   * CATÉGORIES D'EXPORT
   * ─────────────────────────────────────────────────────────────────────────────
   * CONFIG JEU (wildbeast_db_export) :
   *   config, types, typeMatrix, characters, equipment, items, equipBanners,
   *   banners, dailyQuests, loginCycles, patchNotes
   *   → Tout ce que l'admin paramètre. Permet de reconstruire le jeu sur
   *     une installation vierge sans toucher à la progression des joueurs.
   *
   * DONNÉES JOUEURS (wildbeast_player_export) :
   *   player (collection, currency, energy, bestiaire, pity, stats, story,
   *           loginCycleState, dailyQuestState, inventory, etc.)
   *   → Tout ce qui est propre à un compte joueur. Peut être importé sur
   *     une nouvelle installation sans écraser la config du jeu.
   * ─────────────────────────────────────────────────────────────────────────────
   */

  /**
   * Exporte UNIQUEMENT la configuration du jeu (base de données fonctionnelle).
   * N'inclut aucune donnée de joueur.
   *
   * Le fichier est TOUJOURS nommé "database_export.json" (nom fixe, sans
   * horodatage) : c'est ce nom exact qu'il faut déposer sur GitHub à côté
   * des fichiers .js pour que chaque appareil le détecte automatiquement
   * au démarrage (cf. _checkRemoteDatabaseUpdate dans index.html) et
   * applique les nouveautés (nouvelles créatures, quêtes, etc.) sans
   * jamais toucher à la progression personnelle des joueurs.
   * @param {object} gameState
   */
  function exportGameDatabase(gameState) {
    try {
      // forceVersion : incrémenter ce champ dans l'admin (config → version force)
      // pour garantir que TOUS les appareils réappliquent la BDD même si leur
      // clé locale correspond déjà à l'exportDate. Utile après un bug de mémorisation.
      const payload = {
        _exportType: 'wildbeast_db_export',
        _exportVersion: '1.0',
        exportDate: new Date().toISOString(),
        gameVersion: gameState.config?.game?.version || '1.0.0',
        forceVersion: gameState.config?.game?.forceVersion || '1',
        config:        gameState.config,
        types:         gameState.types,
        typeMatrix:    gameState.typeMatrix,
        characters:    gameState.characters,
        equipment:     gameState.equipment,
        items:         gameState.items,
        equipBanners:  gameState.equipBanners,
        banners:       gameState.banners,
        dailyQuests:   gameState.dailyQuests,
        weeklyQuests:  gameState.weeklyQuests,
        eventQuests:   gameState.eventQuests,
        tagCategories: gameState.tagCategories,
        loginCycles:   gameState.loginCycles,
        shopItems:     gameState.shopItems,
        patchNotes:    gameState.patchNotes,
        events:        gameState.events || { current: null, next: null },
      };
      _downloadJson(payload, `database_export.json`);
    } catch (e) { console.error('[SaveSystem] Échec export base de données:', e); }
  }
  /**
   * Exporte UNIQUEMENT les données du joueur actif (slot courant).
   * N'inclut aucune config de jeu.
   * @param {object} gameState
   * @param {number} [slot] - slot à exporter (défaut : slot actif)
   */
  function exportPlayerData(gameState, slot) {
    const targetSlot = slot ?? _activeSlot;
    try {
      const payload = {
        _exportType: 'wildbeast_player_export',
        _exportVersion: '1.0',
        exportDate: new Date().toISOString(),
        gameVersion: gameState.config?.game?.version || '1.0.0',
        slot: targetSlot,
        // ── Données joueur uniquement ────────────────────────────────────────
        player: gameState.player,
        // ── NON inclus : config, types, characters, equipment, banners… ──────
      };
      _downloadJson(payload, `wildbeast_joueur${targetSlot}_${_dateStamp()}.json`);
    } catch (e) { console.error('[SaveSystem] Échec export données joueur:', e); }
  }

  /**
   * Importe une base de données de jeu depuis un fichier JSON.
   * Ne touche PAS aux données des joueurs (slots de sauvegarde).
   * @param {File} file
   * @returns {Promise<object>} Données DB importées (à passer à GameState.applyGameDatabase)
   */
  function importGameDatabase(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (data._exportType && data._exportType !== 'wildbeast_db_export') {
            reject(new Error(
              'Ce fichier contient des données JOUEUR, pas une base de données de jeu.\n' +
              'Utilisez "Import Données Joueurs" pour ce type de fichier.'
            ));
            return;
          }
          resolve(data);
        } catch (err) { reject(new Error('Fichier JSON invalide : ' + err.message)); }
      };
      reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
      reader.readAsText(file);
    });
  }

  /**
   * Importe les données d'un joueur depuis un fichier JSON.
   * Ne touche PAS à la configuration du jeu (types, créatures, config…).
   * @param {File} file
   * @returns {Promise<object>} Données joueur importées (à passer à GameState.applyPlayerData)
   */
  function importPlayerData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (data._exportType && data._exportType !== 'wildbeast_player_export') {
            reject(new Error(
              'Ce fichier contient une BASE DE DONNÉES de jeu, pas des données joueur.\n' +
              'Utilisez "Import Base de Données" pour ce type de fichier.'
            ));
            return;
          }
          resolve(data);
        } catch (err) { reject(new Error('Fichier JSON invalide : ' + err.message)); }
      };
      reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
      reader.readAsText(file);
    });
  }

  /** Utilitaire : télécharge un objet JSON sous forme de fichier */
  function _downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  /** Utilitaire : horodatage compact pour les noms de fichiers */
  function _dateStamp() {
    return new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', 'h');
  }

  // ─── MISE À JOUR DISTANTE DE LA BASE DE DONNÉES (déploiement GitHub) ─────────
  //
  // Pendant que le Service Worker gère la mise à jour des fichiers .js (via
  // version.json), ce mécanisme gère la mise à jour du CONTENU du jeu
  // (créatures, types, quêtes, cycles…) déposé sous le nom fixe
  // "database_export.json" à côté des autres fichiers sur GitHub.
  //
  // Suivi par appareil (localStorage) : on retient le `gameVersion` du
  // dernier database_export.json appliqué, pour ne jamais le réappliquer
  // inutilement si rien n'a changé depuis le dernier déploiement.

  // ⚠️ Le suffixe "_v2" change délibérément la clé par rapport à une version
  // antérieure de ce mécanisme qui comparait par erreur sur `gameVersion`
  // (un champ que l'admin ne modifie jamais en pratique, donc toujours
  // identique d'un export à l'autre) : ce changement de clé garantit que tout
  // appareil ayant déjà mémorisé une valeur via l'ancienne logique repart
  // sur une base propre et redétecte correctement la mise à jour en cours.
  const REMOTE_DB_VERSION_KEY = 'wildbeast_remote_db_version_v2';

  function getAppliedDbVersion() {
    return localStorage.getItem(REMOTE_DB_VERSION_KEY);
  }

  function _setAppliedDbVersion(version) {
    localStorage.setItem(REMOTE_DB_VERSION_KEY, String(version));
  }

  /**
   * Va chercher database_export.json sur le serveur (même origine que le jeu)
   * et indique s'il contient une version plus récente que celle déjà appliquée
   * sur cet appareil. Ne modifie rien — lecture pure, sûre à appeler à tout moment.
   *
   * ⚠️ La comparaison se base en priorité sur `exportDate` (horodatage généré
   * automatiquement à CHAQUE clic sur "Export BDD"), pas sur `gameVersion`
   * (qui reflète config.game.version — un champ que l'admin ne modifie quasiment
   * jamais en pratique, et qui resterait donc identique d'un export à l'autre,
   * empêchant toute détection de changement).
   * @returns {Promise<{available:boolean, data?:object}>}
   */
  /**
   * Calcule une empreinte légère du contenu de la BDD distante.
   * Elle change dès qu'un champ significatif est modifié : nombre de
   * créatures, de quêtes, version du jeu, ou état de l'event courant.
   * Complète la comparaison sur exportDate pour couvrir les cas où
   * l'exportDate ne change pas (mauvaise manipulation) ou a été mal
   * mémorisé par une version précédente du client.
   */
  function _dbContentFingerprint(data) {
    const chars  = (data.characters  || []).length;
    const quests = (data.dailyQuests || []).length
                 + (data.weeklyQuests || []).length
                 + (data.eventQuests  || []).length;
    const evtId  = data.events?.current?.id || data.events?.next?.id || '';
    const gv     = data.gameVersion || '';
    const fv     = data.forceVersion || '';   // champ optionnel pour forcer la mise à jour
    return `${chars}|${quests}|${evtId}|${gv}|${fv}`;
  }

  async function checkRemoteDatabaseUpdate() {
    try {
      const res = await fetch('./database_export.json', { cache: 'no-store' });
      if (!res.ok) return { available: false };
      const data = await res.json();
      if (!data || data._exportType !== 'wildbeast_db_export') return { available: false };

      // Clé composite : exportDate + empreinte de contenu
      // N'importe lequel qui change → mise à jour détectée
      const remoteKey  = (data.exportDate || '') + '|' + _dbContentFingerprint(data);
      const appliedKey = getAppliedDbVersion();

      if (remoteKey === appliedKey) return { available: false };

      return { available: true, data, remoteKey };
    } catch (e) {
      // Pas de fichier déposé, pas de réseau, ou JSON invalide : silencieux.
      return { available: false };
    }
  }

  /**
   * Applique une base de données distante déjà récupérée (cf.
   * checkRemoteDatabaseUpdate) et mémorise sa version comme "appliquée"
   * sur cet appareil. Ne touche JAMAIS aux données joueur — y compris lors
   * de la persistance : on sauvegarde uniquement la config globale
   * (saveGlobalConfig), jamais via save() qui écrirait aussi le joueur
   * actuellement en mémoire (potentiellement vide/par défaut si ce check
   * s'exécute avant la sélection d'un compte) dans le slot actif, écrasant
   * sa vraie progression.
   * @param {object} data - le JSON de database_export.json
   */
  function applyRemoteDatabase(data, remoteKey) {
    GameState.applyGameDatabase(data);
    saveGlobalConfig(GameState.get());
    // Stocker la clé composite (exportDate + empreinte) pour la prochaine comparaison
    const key = remoteKey || ((data.exportDate || '') + '|' + _dbContentFingerprint(data));
    _setAppliedDbVersion(key);
  }

  return {
    getActiveSlot, setActiveSlot, getSlotsInfo,
    save, saveGlobalConfig, load, loadGlobalConfig, clear,
    startAutosave, stopAutosave,
    exportToFile, importFromFile,
    exportGameDatabase, importGameDatabase,
    exportPlayerData, importPlayerData,
    checkRemoteDatabaseUpdate, applyRemoteDatabase, getAppliedDbVersion,
    saveSettings, loadSettings,
    restoreActiveSlot,
  };
})();
