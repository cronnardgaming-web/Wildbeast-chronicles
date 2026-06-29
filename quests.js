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


  // ─── IDs FIXES DES QUÊTES "TERMINAISON" ÉPINGLÉES ───────────────────────────
  // Ces quêtes sont toujours présentes, jamais tirées aléatoirement.
  // Elles utilisent des IDs stables pour que la progression survive aux rechargements.
  const PINNED_DAILY_COMPLETE_ID  = 'pinned_daily_complete';
  const PINNED_WEEKLY_COMPLETE_ID = 'pinned_weekly_complete';
  const PINNED_EVENT_COMPLETE_ID  = 'pinned_event_complete';

  /**
   * Insère les quêtes épinglées dans leurs tableaux de définitions respectifs
   * si elles n'y sont pas encore. Appelé au démarrage (ensureDailyQuestsRolled,
   * ensureWeeklyQuestsRolled) pour qu'elles soient visibles et éditables dans
   * l'onglet Quêtes de l'admin.
   * L'admin peut modifier leur target/reward — ces modifications sont conservées.
   */
  function _ensurePinnedQuestsExist() {
    const state = GameState.get();

    // Quête daily épinglée
    if (!(state.dailyQuests || []).find(q => q.id === PINNED_DAILY_COMPLETE_ID)) {
      const total = state.config?.quests?.dailyCount ?? 3;
      const newDailyDefs = [...(state.dailyQuests || []), {
        id:     PINNED_DAILY_COMPLETE_ID,
        type:   'completeQuestDaily',
        target: total,
        targetLabel: 'quêteQuotidienne',
        label:  `Terminer ${total} Quêtes Quotidiennes`,
        active: true,
        tagId:  null,
        reward: { crystals: 200, gold: 0, items: {} },
        _pinned: true,
      }];
      GameState.updateDailyQuestDefs(newDailyDefs);
    }

    // Quête weekly épinglée
    if (!(state.weeklyQuests || []).find(q => q.id === PINNED_WEEKLY_COMPLETE_ID)) {
      const total = state.config?.quests?.weeklyCount ?? 7;
      const newWeeklyDefs = [...(state.weeklyQuests || []), {
        id:     PINNED_WEEKLY_COMPLETE_ID,
        type:   'completeQuestWeekly',
        target: total,
        targetLabel: 'quêteHebdomadaire',
        label:  `Terminer ${total} Quêtes Hebdomadaires`,
        active: true,
        tagId:  null,
        reward: { crystals: 0, gold: 1000, items: {} },
        _pinned: true,
      }];
      GameState.updateWeeklyQuestDefs(newWeeklyDefs);
    }

    // Quête event épinglée (dans eventQuests — pas liée à un event spécifique,
    // toujours présente dans le tableau de définitions)
    if (!(state.eventQuests || []).find(q => q.id === PINNED_EVENT_COMPLETE_ID)) {
      const newEventDefs = [...(state.eventQuests || []), {
        id:     PINNED_EVENT_COMPLETE_ID,
        type:   'completeQuestEvent',
        target: 1,
        targetLabel: 'quêteEvent',
        label:  "Terminer toutes les Quêtes d'Événement",
        active: true,
        tagId:  null,
        reward: { crystals: 1000, gold: 500, items: {} },
        _pinned: true,
      }];
      GameState.updateEventQuestDefs(newEventDefs);
    }
  }

  /**
   * Clé de la semaine courante : année + numéro de semaine ISO (lundi = début).
   * Utilisée pour détecter un changement de semaine et re-tirer les quêtes hebdo.
   */
  function _weekKey() {
    const d = new Date();
    // Ajuster au lundi de la semaine courante
    const day = d.getDay() || 7; // dimanche=0 → 7
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day - 1));
    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, '0');
    const day2 = String(monday.getDate()).padStart(2, '0');
    return `${y}-W${m}-${day2}`;
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
    const alreadyClaimedToday = s.lastClaimDate === GameUtils.todayKey();
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
      [cycleId]: { dayIndex: nextDayIndex, lastClaimDate: GameUtils.todayKey() },
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
    // Garantir que les quêtes épinglées existent dans les définitions (éditables en admin)
    _ensurePinnedQuestsExist();

    const player = GameState.getPlayer();
    const todayKey = GameUtils.todayKey();
    const qState = player.dailyQuestState || {};

    if (qState.date === todayKey && Array.isArray(qState.questIds) && qState.questIds.length > 0) {
      return qState; // déjà tiré pour aujourd'hui
    }

    const state = GameState.get();
    // Exclure les quêtes épinglées du tirage aléatoire — elles sont toujours présentes
    const PINNED_IDS = new Set([PINNED_DAILY_COMPLETE_ID, PINNED_WEEKLY_COMPLETE_ID, PINNED_EVENT_COMPLETE_ID]);
    const pool = (state.dailyQuests || []).filter(q => q.active && !PINNED_IDS.has(q.id));
    const count = state.config?.quests?.dailyCount ?? 3;
    const picked = _pickRandomDistinct(pool, Math.min(count, pool.length)).map(q => q.id);

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
    const state  = GameState.get();

    const randomQuests = qState.questIds
      .map(id => state.dailyQuests.find(q => q.id === id))
      .filter(Boolean)
      .map(def => {
        const current = qState.progress?.[def.id] || 0;
        const claimed = !!qState.claimed?.[def.id];
        return { def, current, target: def.target, completed: current >= def.target, claimed };
      });

    // Quête épinglée "Terminer X Quêtes Quotidiennes" — toujours affichée
    const pinnedDef = _getPinnedDailyCompleteDef(state, qState);
    const pinnedCurrent = qState.progress?.[PINNED_DAILY_COMPLETE_ID] || 0;
    const pinnedClaimed  = !!qState.claimed?.[PINNED_DAILY_COMPLETE_ID];
    const pinned = {
      def:       pinnedDef,
      current:   pinnedCurrent,
      target:    pinnedDef.target,
      completed: pinnedCurrent >= pinnedDef.target,
      claimed:   pinnedClaimed,
      isPinned:  true,
    };

    return [...randomQuests, pinned];
  }

  /**
   * Retourne la définition de la quête épinglée daily-complete.
   * Lit depuis state.dailyQuests pour respecter les modifications admin.
   */
  function _getPinnedDailyCompleteDef(state, qState) {
    const stored = (state.dailyQuests || []).find(q => q.id === PINNED_DAILY_COMPLETE_ID);
    if (stored) return stored;
    // Fallback si pas encore créée (avant le premier appel à _ensurePinnedQuestsExist)
    const total = qState?.questIds?.length || state.config?.quests?.dailyCount || 3;
    return {
      id:     PINNED_DAILY_COMPLETE_ID,
      type:   'completeQuestDaily',
      target: total,
      label:  `Terminer ${total} quête${total > 1 ? 's' : ''} quotidienne${total > 1 ? 's' : ''}`,
      active: true,
      reward: { crystals: 200, gold: 0, items: {} },
    };
  }

  /**
   * Incrémente la progression de toutes les quêtes actives du jour qui
   * correspondent au type d'événement donné. Plafonne à la cible (pas
   * d'utilité à compter au-delà). Ignore silencieusement si aucune quête
   * du jour ne correspond à ce type.
   * @param {string} type - cf. les valeurs `type` du catalogue DEFAULT_DAILY_QUESTS
   * @param {number} [amount=1]
   */
  function _track(type, amount = 1, tagId = null) {
    const qState = ensureDailyQuestsRolled();
    const state = GameState.get();
    const relevant = qState.questIds
      .map(id => state.dailyQuests.find(q => q.id === id))
      .filter(q => {
        if (!q) return false;
        // Si la quête exige un tag, le tag fourni doit correspondre exactement
        if (q.tagId && q.tagId !== tagId) return false;
        return q.type === type;
      });
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
    const state  = GameState.get();

    // Gérer la quête épinglée (non dans questIds aléatoires)
    const isPinned = questId === PINNED_DAILY_COMPLETE_ID;
    let def;
    if (isPinned) {
      def = _getPinnedDailyCompleteDef(state, qState);
    } else {
      def = state.dailyQuests.find(q => q.id === questId);
      if (!def || !qState.questIds.includes(questId)) return { success: false };
    }

    const current = qState.progress?.[questId] || 0;
    if (current < def.target) return { success: false };
    if (qState.claimed?.[questId]) return { success: false };

    GameState.grantReward(def.reward);

    // Tracking cloisonné AVANT le claimed, pour que le même updatePlayer final
    // voie la progression à jour (évite l'écrasement par le spread de l'ancien qState).
    if (!isPinned) _trackDailyComplete();

    // Relire qState après le tracking (il a pu être muté par updatePlayer dans _trackDailyComplete)
    const freshState = ensureDailyQuestsRolled();
    const claimed = { ...(freshState.claimed || {}), [questId]: true };
    GameState.updatePlayer({ dailyQuestState: { ...freshState, claimed } });

    return { success: true, reward: def.reward };
  }

  /** Incrémente UNIQUEMENT la quête épinglée "Terminer X quêtes quotidiennes". */
  function _trackDailyComplete() {
    const qState    = ensureDailyQuestsRolled();
    const state     = GameState.get();
    const pinnedDef = _getPinnedDailyCompleteDef(state, qState);
    const progress  = { ...(qState.progress || {}) };
    const cur       = progress[PINNED_DAILY_COMPLETE_ID] || 0;
    progress[PINNED_DAILY_COMPLETE_ID] = Math.min(pinnedDef.target, cur + 1);
    GameState.updatePlayer({ dailyQuestState: { ...qState, progress } });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ─── QUÊTES HEBDOMADAIRES ────────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * S'assure que les quêtes hebdomadaires du lundi courant sont tirées.
   * Re-tire si la semaine a changé. Idempotent.
   */
  function ensureWeeklyQuestsRolled() {
    const player = GameState.getPlayer();
    const weekKey = _weekKey();
    const wState = player.weeklyQuestState || {};

    if (wState.week === weekKey && Array.isArray(wState.questIds) && wState.questIds.length > 0) {
      return wState;
    }

    const state = GameState.get();
    const count = state.config?.quests?.weeklyCount ?? 7;
    // Exclure les quêtes épinglées du tirage aléatoire
    const PINNED_IDS = new Set([PINNED_DAILY_COMPLETE_ID, PINNED_WEEKLY_COMPLETE_ID, PINNED_EVENT_COMPLETE_ID]);
    const pool  = (state.weeklyQuests || []).filter(q => q.active && !PINNED_IDS.has(q.id));
    const picked = _pickRandomDistinct(pool, Math.min(count, pool.length)).map(q => q.id);

    const newState = { week: weekKey, questIds: picked, progress: {}, claimed: {} };
    GameState.updatePlayer({ weeklyQuestState: newState });
    return newState;
  }

  function getWeeklyQuests() {
    const wState = ensureWeeklyQuestsRolled();
    const state  = GameState.get();

    const randomQuests = wState.questIds
      .map(id => (state.weeklyQuests || []).find(q => q.id === id))
      .filter(Boolean)
      .map(def => {
        const current = wState.progress?.[def.id] || 0;
        const claimed = !!wState.claimed?.[def.id];
        return { def, current, target: def.target, completed: current >= def.target, claimed };
      });

    // Quête épinglée "Terminer X Quêtes Hebdomadaires"
    const pinnedDef = _getPinnedWeeklyCompleteDef(state, wState);
    const pinnedCurrent = wState.progress?.[PINNED_WEEKLY_COMPLETE_ID] || 0;
    const pinnedClaimed  = !!wState.claimed?.[PINNED_WEEKLY_COMPLETE_ID];
    const pinned = {
      def:       pinnedDef,
      current:   pinnedCurrent,
      target:    pinnedDef.target,
      completed: pinnedCurrent >= pinnedDef.target,
      claimed:   pinnedClaimed,
      isPinned:  true,
    };

    return [...randomQuests, pinned];
  }

  function _getPinnedWeeklyCompleteDef(state, wState) {
    const stored = (state.weeklyQuests || []).find(q => q.id === PINNED_WEEKLY_COMPLETE_ID);
    if (stored) return stored;
    const total = wState?.questIds?.length || state.config?.quests?.weeklyCount || 7;
    return {
      id:     PINNED_WEEKLY_COMPLETE_ID,
      type:   'completeQuestWeekly',
      target: total,
      label:  `Terminer ${total} quête${total > 1 ? 's' : ''} hebdomadaire${total > 1 ? 's' : ''}`,
      active: true,
      reward: { crystals: 0, gold: 1000, items: {} },
    };
  }

  function claimWeeklyQuestReward(questId) {
    const wState   = ensureWeeklyQuestsRolled();
    const state    = GameState.get();
    const isPinned = questId === PINNED_WEEKLY_COMPLETE_ID;
    let def;
    if (isPinned) {
      def = _getPinnedWeeklyCompleteDef(state, wState);
    } else {
      def = (state.weeklyQuests || []).find(q => q.id === questId);
      if (!def || !wState.questIds.includes(questId)) return { success: false };
    }
    if ((wState.progress?.[questId] || 0) < def.target) return { success: false };
    if (wState.claimed?.[questId]) return { success: false };

    GameState.grantReward(def.reward);
    if (!isPinned) _trackWeeklyComplete();
    // Relire après tracking pour ne pas écraser la progression
    const freshWState = ensureWeeklyQuestsRolled();
    const claimed = { ...(freshWState.claimed || {}), [questId]: true };
    GameState.updatePlayer({ weeklyQuestState: { ...freshWState, claimed } });
    return { success: true, reward: def.reward };
  }

  function _trackWeeklyComplete() {
    const wState    = ensureWeeklyQuestsRolled();
    const state     = GameState.get();
    const pinnedDef = _getPinnedWeeklyCompleteDef(state, wState);
    const progress  = { ...(wState.progress || {}) };
    const cur       = progress[PINNED_WEEKLY_COMPLETE_ID] || 0;
    progress[PINNED_WEEKLY_COMPLETE_ID] = Math.min(pinnedDef.target, cur + 1);
    GameState.updatePlayer({ weeklyQuestState: { ...wState, progress } });
  }

  function _trackWeekly(type, amount = 1, tagId = null) {
    const wState = ensureWeeklyQuestsRolled();
    const state  = GameState.get();
    const relevant = wState.questIds
      .map(id => (state.weeklyQuests || []).find(q => q.id === id))
      .filter(q => {
        if (!q) return false;
        // Si la quête exige un tag, le tag fourni doit correspondre exactement
        if (q.tagId && q.tagId !== tagId) return false;
        return q.type === type;
      });
    if (!relevant.length) return;
    const progress = { ...(wState.progress || {}) };
    relevant.forEach(q => { progress[q.id] = Math.min(q.target, (progress[q.id] || 0) + amount); });
    GameState.updatePlayer({ weeklyQuestState: { ...wState, progress } });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ─── QUÊTES D'ÉVÉNEMENT ──────────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════════

  /** Retourne toutes les quêtes d'event actives avec leur progression. */
  function getEventQuests() {
    const player = GameState.getPlayer();
    const state  = GameState.get();
    const eState = player.eventQuestState || { progress: {}, claimed: {} };

    const regularQuests = (state.eventQuests || [])
      .filter(q => q.active && q.id !== PINNED_EVENT_COMPLETE_ID)
      .map(def => {
        const current = eState.progress?.[def.id] || 0;
        const claimed = !!eState.claimed?.[def.id];
        return { def, current, target: def.target, completed: current >= def.target, claimed };
      });

    // Quête épinglée "Terminer Toutes les Quêtes d'Événement" — uniquement si event actif
    const evt = (typeof EventSystem !== 'undefined') ? EventSystem.getCurrent() : null;
    if (!evt || regularQuests.length === 0) return regularQuests;

    const pinnedDef = _getPinnedEventCompleteDef(state, regularQuests.length);
    const pinnedCurrent = eState.progress?.[PINNED_EVENT_COMPLETE_ID] || 0;
    const pinnedClaimed  = !!eState.claimed?.[PINNED_EVENT_COMPLETE_ID];
    const pinned = {
      def:       pinnedDef,
      current:   pinnedCurrent,
      target:    pinnedDef.target,
      completed: pinnedCurrent >= pinnedDef.target,
      claimed:   pinnedClaimed,
      isPinned:  true,
    };

    return [...regularQuests, pinned];
  }

  function _getPinnedEventCompleteDef(state, totalRegularQuests) {
    const stored = (state.eventQuests || []).find(q => q.id === PINNED_EVENT_COMPLETE_ID);
    if (stored) {
      // Si l'admin n'a pas personnalisé le target, on le met à jour dynamiquement
      // pour refléter le nombre réel de quêtes d'event actives
      if (!stored._targetCustomized) {
        return { ...stored, target: totalRegularQuests };
      }
      return stored;
    }
    return {
      id:     PINNED_EVENT_COMPLETE_ID,
      type:   'completeQuestEvent',
      target: totalRegularQuests,
      label:  "Terminer toutes les qu00eates d'00e9v00e9nement",
      active: true,
      reward: { crystals: 1000, gold: 500, items: {} },
    };
  }

  function claimEventQuestReward(questId) {
    const player   = GameState.getPlayer();
    const state    = GameState.get();
    const eState   = player.eventQuestState || { progress: {}, claimed: {} };
    const isPinned = questId === PINNED_EVENT_COMPLETE_ID;
    let def;
    if (isPinned) {
      const regularCount = (state.eventQuests || []).filter(q => q.active && q.id !== PINNED_EVENT_COMPLETE_ID).length;
      def = _getPinnedEventCompleteDef(state, regularCount);
    } else {
      def = (state.eventQuests || []).find(q => q.id === questId);
      if (!def || !def.active) return { success: false };
    }
    if ((eState.progress?.[questId] || 0) < def.target) return { success: false };
    if (eState.claimed?.[questId]) return { success: false };

    GameState.grantReward(def.reward);
    if (!isPinned) _trackEventComplete();
    // Relire après tracking pour ne pas écraser la progression
    const freshPlayer = GameState.getPlayer();
    const freshEState = freshPlayer.eventQuestState || { progress: {}, claimed: {} };
    const claimed = { ...(freshEState.claimed || {}), [questId]: true };
    GameState.updatePlayer({ eventQuestState: { ...freshEState, claimed } });
    return { success: true, reward: def.reward };
  }

  function _trackEventComplete() {
    const player    = GameState.getPlayer();
    const state     = GameState.get();
    const eState    = player.eventQuestState || { progress: {}, claimed: {} };
    const regularCount = (state.eventQuests || []).filter(q => q.active && q.id !== PINNED_EVENT_COMPLETE_ID).length;
    const pinnedDef = _getPinnedEventCompleteDef(state, regularCount);
    const progress  = { ...(eState.progress || {}) };
    const cur       = progress[PINNED_EVENT_COMPLETE_ID] || 0;
    progress[PINNED_EVENT_COMPLETE_ID] = Math.min(pinnedDef.target, cur + 1);
    GameState.updatePlayer({ eventQuestState: { ...eState, progress } });
  }

  function _trackEvent(type, amount = 1, tagId = null) {
    const player = GameState.getPlayer();
    const state  = GameState.get();
    const eState = player.eventQuestState || { progress: {}, claimed: {} };
    const relevant = (state.eventQuests || []).filter(q => {
      if (!q.active) return false;
      // Si la quête exige un tag spécifique, le tag fourni doit correspondre exactement
      if (q.tagId && q.tagId !== tagId) return false;
      // Si la quête n'exige pas de tag, elle s'incrémente toujours (quelles que soient les victimes)
      return q.type === type;
    });
    if (!relevant.length) return;
    const progress = { ...(eState.progress || {}) };
    relevant.forEach(q => { progress[q.id] = Math.min(q.target, (progress[q.id] || 0) + amount); });
    GameState.updatePlayer({ eventQuestState: { ...eState, progress } });
  }

  // ─── TRACKING UNIFIÉ (quotidien + hebdo + event) ─────────────────────────────

  /**
   * Incrémente les quêtes (daily + weekly + event) qui exigent EXACTEMENT ce tagId.
   * Contrairement à _trackAll, ne touche pas aux quêtes sans tagId (génériques).
   * Utilisé pour les victoires sur des ennemis d'un tag précis.
   */
  function _trackTagged(type, amount, tagId) {
    // Daily
    const qState = ensureDailyQuestsRolled();
    const state  = GameState.get();
    const dailyRelevant = qState.questIds
      .map(id => state.dailyQuests.find(q => q.id === id))
      .filter(q => q && q.tagId === tagId && q.type === type);
    if (dailyRelevant.length) {
      const progress = { ...(qState.progress || {}) };
      dailyRelevant.forEach(q => { progress[q.id] = Math.min(q.target, (progress[q.id] || 0) + amount); });
      GameState.updatePlayer({ dailyQuestState: { ...qState, progress } });
    }

    // Weekly
    const wState = ensureWeeklyQuestsRolled();
    const weeklyRelevant = wState.questIds
      .map(id => (state.weeklyQuests || []).find(q => q.id === id))
      .filter(q => q && q.tagId === tagId && q.type === type);
    if (weeklyRelevant.length) {
      const progress = { ...(wState.progress || {}) };
      weeklyRelevant.forEach(q => { progress[q.id] = Math.min(q.target, (progress[q.id] || 0) + amount); });
      GameState.updatePlayer({ weeklyQuestState: { ...wState, progress } });
    }

    // Event
    const player = GameState.getPlayer();
    const eState = player.eventQuestState || { progress: {}, claimed: {} };
    const eventRelevant = (state.eventQuests || [])
      .filter(q => q.active && q.tagId === tagId && q.type === type);
    if (eventRelevant.length) {
      const progress = { ...(eState.progress || {}) };
      eventRelevant.forEach(q => { progress[q.id] = Math.min(q.target, (progress[q.id] || 0) + amount); });
      GameState.updatePlayer({ eventQuestState: { ...eState, progress } });
    }
  }

  function _trackAll(type, amount = 1, tagId = null) {
    _track(type, amount, tagId);
    _trackWeekly(type, amount, tagId);
    _trackEvent(type, amount, tagId);
  }

  // ─── API PUBLIQUE ─────────────────────────────────────────────────────────────

  return {
    // Connexion quotidienne
    getActiveLoginCycles, getPendingLoginCycles, claimLoginReward,
    // Quêtes quotidiennes
    ensureDailyQuestsRolled, getTodaysQuests, claimQuestReward,
    // Quêtes hebdomadaires
    ensureWeeklyQuestsRolled, getWeeklyQuests, claimWeeklyQuestReward,
    // Quêtes d'event
    getEventQuests, claimEventQuestReward,
    // Tracking (remplace les anciens trackX — rétrocompatibles)
    trackCapture:           (n = 1, tagId = null) => _trackAll('capture',       n, tagId),
    trackDefeat:            (n = 1, tagId = null) => _trackAll('defeat',        n, tagId),
    // Victoires par tag des ennemis réellement vaincus (quel que soit le mode de combat)
    // N'incrémente que les quêtes qui ont un tagId correspondant — pas les génériques.
    trackDefeatTagged:      (n = 1, tagId = null) => {
      if (!tagId) return;
      _trackTagged('defeat', n, tagId);
    },
    trackPullEquip:         (n = 1)               => _trackAll('pullEquip',     n),
    trackPullChar:          (n = 1, tagId = null) => _trackAll('pullChar',      n, tagId),
    trackLineWin:           (n = 1)               => _trackAll('line',          n),
    trackFullRandomWin:     (n = 1)               => _trackAll('fullRandom',    n),
    trackStoryWin:          (n = 1)               => _trackAll('story',         n),
    // Event combat tracking
    trackEventInvasionWin:  (n = 1) => {
      const evt = (typeof EventSystem !== 'undefined') ? EventSystem.getCurrent() : null;
      _trackAll('eventInvasion', n, evt?.tagId || null);
    },
    trackEventDefiWin:      (n = 1) => {
      const evt = (typeof EventSystem !== 'undefined') ? EventSystem.getCurrent() : null;
      _trackAll('eventDefi', n, evt?.tagId || null);
    },
  };
})();
