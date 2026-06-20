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
      version:    gameState.config?.game?.version || '1.0.0',
      timestamp:  Date.now(),
      config:     gameState.config,
      types:      gameState.types,
      typeMatrix: gameState.typeMatrix,
      characters: gameState.characters,
      equipment:  gameState.equipment,
      banners:    gameState.banners,
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
        version:    global.version    || player.version || '1.0.0',
        config:     global.config,
        types:      global.types,
        typeMatrix: global.typeMatrix,
        characters: global.characters,
        equipment:  global.equipment,
        banners:    global.banners,
        player:     player.player,
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
        banners:    gameState.banners,
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

  return {
    getActiveSlot, setActiveSlot, getSlotsInfo,
    save, saveGlobalConfig, load, loadGlobalConfig, clear,
    startAutosave, stopAutosave,
    exportToFile, importFromFile,
    saveSettings, loadSettings,
    restoreActiveSlot,
  };
})();
