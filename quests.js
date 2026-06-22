/**
 * ============================================================
 * QUESTS.JS — Récompenses de connexion quotidienne + Quêtes quotidiennes
 *
 * Deux systèmes distincts, regroupés ici car ils partagent la même logique
 * de date calendaire et le même mécanisme de distribution de récompenses
 * (GameState.grantReward).
 *
 *  1. CYCLES DE CONNEXION (LoginRewards)
 *     - Paramétrés en admin : N jours, chacun avec sa récompense.
 *     - Plusieurs cycles peuvent être actifs en parallèle.
 *     - La progression de chaque cycle avance d'un jour à chaque NOUVELLE
 *       date calendaire de connexion (jamais de remise à zéro sur un jour
 *       manqué), et reboucle au jour 1 après le dernier jour réclamé.
 *     - Distribution manuelle : le joueur doit cliquer sur "Récompense"
 *       pour recevoir le gain du jour courant.
 *
 *  2. QUÊTES QUOTIDIENNES (DailyQuests)
 *     - Catalogue fixe de 14 types de quêtes, paramétrables en admin
 *       (actif/inactif + récompense). 3 sont tirées aléatoirement chaque
 *       jour calendaire parmi celles actives.
 *     - Le jeu suit automatiquement la progression (combat, capture,
 *       gacha...) via les fonctions track*().
 *     - Distribution manuelle : le joueur réclame chaque quête complétée.
 * ============================================================
 */

'use strict';

const QuestSystem = (() => {

  // ─── UTILITAIRES DATE ────────────────────────────────────────────────────────

  /** Date calendaire locale du jour, au format 'YYYY-MM-DD' (insensible au fuseau). */
  function _todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ─── CYCLES DE RÉCOMPENSE DE CONNEXION ───────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Calcule, pour un cycle donné, l'état d'affichage courant : le jour à
   * réclamer (1-indexé pour l'affichage) et si la récompense du jour a déjà
   * été réclamée aujourd'hui.
   * @param {object} cycle - définition admin { id, name, active, days:[{reward}] }
   * @param {object} state - { dayIndex:number, lastClaimDate:string|null } (peut être vide)
   * @returns {{dayIndex:number, alreadyClaimedToday:boolean}}
   */
  function _resolveCycleState(cycle, state) {
    const s = state || { dayIndex: 0, lastClaimDate: null };
    const dayIndex = Math.max(0, Math.min(s.dayIndex || 0, cycle.days.length - 1));
    const alreadyClaimedToday = s.lastClaimDate === _todayKey();
    return { dayIndex, alreadyClaimedToday };
  }

  /**
   * Retourne la liste des cycles actifs avec leur état de progression actuel,
   * prêt à être affiché par l'UI (popup de connexion).
   * Ne modifie aucun état — lecture pure.
   * @returns {Array<{cycle:object, dayIndex:number, alreadyClaimedToday:boolean}>}
   */
  function getActiveLoginCycles() {
    const state = GameState.get();
    const cycles = (state.loginCycles || []).filter(c => c.active && c.days?.length > 0);
    const player = state.player;
    return cycles.map(cycle => {
      const cState = (player.loginCycleState || {})[cycle.id];
      const resolved = _resolveCycleState(cycle, cState);
      return { cycle, ...resolved };
    });
  }

  /**
   * Parmi les cycles actifs, retourne ceux qui ont encore une récompense non
   * réclamée aujourd'hui — c'est cette liste que l'UI doit présenter en
   * popups successifs au lancement du jeu.
   * @returns {Array<{cycle:object, dayIndex:number}>}
   */
  function getPendingLoginCycles() {
    return getActiveLoginCycles()
      .filter(c => !c.alreadyClaimedToday)
      .map(({ cycle, dayIndex }) => ({ cycle, dayIndex }));
  }

  /**
   * Réclame la récompense du jour courant d'un cycle de connexion : distribue
   * le gain, avance la progression d'un jour (avec rebouclage), et mémorise
   * la date de réclamation pour empêcher une double réclamation le même jour.
   * @param {string} cycleId
   * @returns {{success:boolean, reward?:object, dayIndex?:number}}
   */
  function claimLoginReward(cycleId) {
    const state = GameState.get();
    const cycle = (state.loginCycles || []).find(c => c.id === cycleId);
    if (!cycle || !cycle.active || !cycle.days?.length) return { success: false };

    const player = GameState.getPlayer();
    const cState = (player.loginCycleState || {})[cycleId];
    const { dayIndex, alreadyClaimedToday } = _resolveCycleState(cycle, cState);
    if (alreadyClaimedToday) return { success: false };

    const day = cycle.days[dayIndex];
    GameState.grantReward(day.reward);

    const nextDayIndex = (dayIndex + 1) % cycle.days.length; // reboucle au jour 1 après le dernier
    const newCycleState = {
      ...(player.loginCycleState || {}),
      [cycleId]: { dayIndex: nextDayIndex, lastClaimDate: _todayKey() },
    };
    GameState.updatePlayer({ loginCycleState: newCycleState });

    return { success: true, reward: day.reward, dayIndex };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ─── QUÊTES QUOTIDIENNES ─────────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * S'assure que le tirage du jour est à jour : si la date a changé depuis le
   * dernier tirage (ou qu'aucun tirage n'existe encore), sélectionne 3 quêtes
   * actives au hasard (sans doublon) et réinitialise progression/réclamations.
   * À appeler à chaque connexion ET à chaque accès à l'écran des quêtes (idempotent).
   * @returns {object} l'état dailyQuestState à jour
   */
  function ensureDailyQuestsRolled() {
    const player = GameState.getPlayer();
    const todayKey = _todayKey();
    const qState = player.dailyQuestState || {};

    if (qState.date === todayKey && Array.isArray(qState.questIds) && qState.questIds.length > 0) {
      return qState; // déjà tiré pour aujourd'hui
    }

    const state = GameState.get();
    const pool = (state.dailyQuests || []).filter(q => q.active);
    const picked = _pickRandomDistinct(pool, Math.min(3, pool.length)).map(q => q.id);

    const newState = {
      date: todayKey,
      questIds: picked,
      progress: {},
      claimed: {},
    };
    GameState.updatePlayer({ dailyQuestState: newState });
    return newState;
  }

  /** Pioche `count` éléments distincts d'un tableau, sans répétition. */
  function _pickRandomDistinct(arr, count) {
    const pool = [...arr];
    const result = [];
    while (pool.length > 0 && result.length < count) {
      const idx = Math.floor(Math.random() * pool.length);
      result.push(pool.splice(idx, 1)[0]);
    }
    return result;
  }

  /**
   * Retourne les 3 quêtes du jour avec leur définition complète et leur
   * progression courante, prêtes à être affichées par l'UI.
   * @returns {Array<{def:object, current:number, target:number, completed:boolean, claimed:boolean}>}
   */
  function getTodaysQuests() {
    const qState = ensureDailyQuestsRolled();
    const state = GameState.get();
    return qState.questIds
      .map(id => state.dailyQuests.find(q => q.id === id))
      .filter(Boolean)
      .map(def => {
        const current = qState.progress?.[def.id] || 0;
        const claimed = !!qState.claimed?.[def.id];
        return { def, current, target: def.target, completed: current >= def.target, claimed };
      });
  }

  /**
   * Incrémente la progression de toutes les quêtes actives du jour qui
   * correspondent au type d'événement donné. Plafonne à la cible (pas
   * d'utilité à compter au-delà). Ignore silencieusement si aucune quête
   * du jour ne correspond à ce type.
   * @param {string} type - cf. les valeurs `type` du catalogue DEFAULT_DAILY_QUESTS
   * @param {number} [amount=1]
   */
  function _track(type, amount = 1) {
    const qState = ensureDailyQuestsRolled();
    const state = GameState.get();
    const relevant = qState.questIds
      .map(id => state.dailyQuests.find(q => q.id === id))
      .filter(q => q && q.type === type);
    if (relevant.length === 0) return;

    const progress = { ...(qState.progress || {}) };
    relevant.forEach(q => {
      const cur = progress[q.id] || 0;
      progress[q.id] = Math.min(q.target, cur + amount);
    });
    GameState.updatePlayer({ dailyQuestState: { ...qState, progress } });
  }

  // ── API de tracking, appelée depuis le reste du jeu ─────────────────────────
  const trackCapture    = (n = 1) => _track('capture', n);
  const trackDefeat     = (n = 1) => _track('defeat', n);
  const trackPullEquip  = (n = 1) => _track('pullEquip', n);
  const trackPullChar   = (n = 1) => _track('pullChar', n);
  const trackLineWin    = (n = 1) => _track('line', n);
  const trackFullRandomWin = (n = 1) => _track('fullRandom', n);
  const trackStoryWin   = (n = 1) => _track('story', n);

  /**
   * Réclame la récompense d'une quête du jour complétée.
   * @param {string} questId
   * @returns {{success:boolean, reward?:object}}
   */
  function claimQuestReward(questId) {
    const qState = ensureDailyQuestsRolled();
    const state = GameState.get();
    const def = state.dailyQuests.find(q => q.id === questId);
    if (!def || !qState.questIds.includes(questId)) return { success: false };

    const current = qState.progress?.[questId] || 0;
    if (current < def.target) return { success: false };
    if (qState.claimed?.[questId]) return { success: false };

    GameState.grantReward(def.reward);

    const claimed = { ...(qState.claimed || {}), [questId]: true };
    GameState.updatePlayer({ dailyQuestState: { ...qState, claimed } });

    return { success: true, reward: def.reward };
  }

  // ─── API PUBLIQUE ─────────────────────────────────────────────────────────────

  return {
    // Connexion quotidienne
    getActiveLoginCycles, getPendingLoginCycles, claimLoginReward,
    // Quêtes quotidiennes
    ensureDailyQuestsRolled, getTodaysQuests, claimQuestReward,
    trackCapture, trackDefeat, trackPullEquip, trackPullChar,
    trackLineWin, trackFullRandomWin, trackStoryWin,
  };
})();
