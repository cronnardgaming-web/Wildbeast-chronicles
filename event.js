/**
 * ============================================================
 * EVENT.JS — Système d'Événements Décadaires (WildBeast Chronicles)
 *
 * Un Event se déclenche le 8, le 18 et le 28 de chaque mois.
 * Chaque Event est centré sur un Tag (ex: "Ailé", "Afrique") et regroupe :
 *   - Une bannière Gacha dédiée (formes de base du tag uniquement)
 *   - Des quêtes liées au tag (captures, combats de ces créatures)
 *   - Un mode combat "Event : Invasion" (ennemis du tag uniquement)
 *   - Un mode combat "Event : Défi" (idem + équipe joueur du même tag forcée)
 *   - Des réductions boutique sur les créatures du tag
 *   - Un décompte par rareté des créatures du tag dans la collection
 *
 * Structure d'un Event (stocké dans state.events) :
 * {
 *   id: 'evt_xxx',
 *   tagId: 'tag_ailé',
 *   tagLabel: 'Ailé',
 *   startDate: <timestamp>,      // debut réel (8/18/28 à 0h00)
 *   endDate: <timestamp>,        // fin (= startDate + durationDays jours)
 *   durationDays: 10,
 *   bannerId: 'banner_event_xxx',
 *   shopDiscountPct: 20,         // % de réduction sur les créatures du tag
 *   questIds: ['eq_xxx_1', ...], // IDs injectés dans eventQuests
 *   invasionConfig: { energyCost: 15 },
 *   defiConfig:     { energyCost: 20 },
 *   active: true,
 *   customTitle: '',             // titre admin facultatif
 *   newCharIds: [],              // IDs de créatures ajoutées au roster via cet event
 * }
 *
 * state.events = {
 *   current: <Event|null>,
 *   next:    <Event|null>,   // pré-configuré en admin
 * }
 * ============================================================
 */

'use strict';

const EventSystem = (() => {

  // ─── CONSTANTES ──────────────────────────────────────────────────────────────

  /** Jours du mois où un event démarre (toujours à 0h00 heure locale) */
  const EVENT_DAYS = [8, 18, 28];

  /** Durée par défaut d'un event (jusqu'au prochain EVENT_DAY) */
  const DEFAULT_DURATION_DAYS = 10;

  /** Réduction boutique par défaut (%) */
  const DEFAULT_SHOP_DISCOUNT = 20;

  /** Coût énergie combats event */
  const DEFAULT_ENERGY_INVASION = 15;
  const DEFAULT_ENERGY_DEFI     = 20;

  // ─── HELPERS DATES ───────────────────────────────────────────────────────────

  /** Timestamp du prochain (ou actuel) jour d'event ≥ now */
  function nextEventStart(fromDate = new Date()) {
    const d = new Date(fromDate);
    const day = d.getDate();
    // Trouver le prochain EVENT_DAY ≥ day dans ce mois, sinon le premier du mois suivant
    const nextDay = EVENT_DAYS.find(ed => ed >= day);
    if (nextDay) {
      return new Date(d.getFullYear(), d.getMonth(), nextDay, 0, 0, 0, 0).getTime();
    }
    // Mois suivant
    return new Date(d.getFullYear(), d.getMonth() + 1, EVENT_DAYS[0], 0, 0, 0, 0).getTime();
  }

  /** Timestamp du début de l'event SUIVANT (après startTs) */
  function nextEventStartAfter(startTs) {
    const d = new Date(startTs + 1); // +1ms pour éviter de retomber sur le même jour
    return nextEventStart(d);
  }


  // ─── ACCÈS À L'ÉTAT ──────────────────────────────────────────────────────────

  function _getEvents() {
    const state = GameState.get();
    if (!state.events) state.events = { current: null, next: null };
    return state.events;
  }

  /** Retourne l'event courant si actif, sinon null */
  function getCurrent() {
    const evts = _getEvents();
    const evt  = evts.current;
    if (!evt || !evt.active) return null;
    const now = Date.now();
    if (now < evt.startDate || now > evt.endDate) return null;
    return evt;
  }

  /**
   * Retourne l'event courant s'il est actif (même si startDate pas encore atteint),
   * ou null. Utilisé pour afficher la bannière et les quêtes dès que l'event
   * est configuré et activé en admin, sans attendre le startDate exact.
   */
  function getActiveOrPending() {
    const evts = _getEvents();
    const evt  = evts.current;
    if (!evt || !evt.active) return null;
    if (Date.now() > evt.endDate) return null;   // terminé : on n'affiche plus rien
    return evt;
  }

  /** Retourne l'event pré-configuré suivant (toujours, même inactif) */
  function getNext() {
    return _getEvents().next || null;
  }

  // ─── CRÉATURES DU TAG ────────────────────────────────────────────────────────

  /**
   * Retourne toutes les créatures de stade 0 (forme de base) portant ce tag.
   * @param {string} tagId
   * @returns {Array<object>} définitions de créatures
   */
  function getBaseCharsForTag(tagId) {
    if (!tagId) return [];
    const state = GameState.get();
    return state.characters.filter(c => {
      if ((c.evolutionStage || 0) !== 0) return false;
      const tags = c.tags || [];
      return tags.includes(tagId);
    });
  }

  /**
   * Retourne TOUTES les créatures (toutes formes) portant ce tag.
   */
  function getAllCharsForTag(tagId) {
    if (!tagId) return [];
    const state = GameState.get();
    return state.characters.filter(c => {
      // Une forme évoluée hérite du tag de sa forme de base (même evolutionLine)
      const baseOfLine = state.characters.find(b =>
        b.evolutionLine === c.evolutionLine && (b.evolutionStage || 0) === 0
      ) || c;
      return (baseOfLine.tags || []).includes(tagId);
    });
  }

  /**
   * Décompte par rareté des créatures possédant ce tag dans la collection joueur.
   * @param {string} tagId
   * @returns {object} { common:N, uncommon:N, rare:N, epic:N, legendary:N, mythic:N }
   */
  function getTagCollectionStats(tagId) {
    const state   = GameState.get();
    const player  = GameState.getPlayer();
    const tagChars = new Set(getAllCharsForTag(tagId).map(c => c.id));
    const counts  = { common:0, uncommon:0, rare:0, epic:0, legendary:0, mythic:0 };
    player.collection.forEach(inst => {
      if (!tagChars.has(inst.charId)) return;
      const def = GameState.getCharDef(inst.charId);
      if (def?.rarity && counts[def.rarity] !== undefined) counts[def.rarity]++;
    });
    return counts;
  }

  // ─── GÉNÉRATION D'UN EVENT ───────────────────────────────────────────────────

  /**
   * Crée un objet Event à partir d'un tagId et d'une date de début.
   * Génère les quêtes et la bannière associées.
   */
  function buildEvent(tagId, startDate, opts = {}) {
    const state   = GameState.get();
    const allTags = getAllTags(state);
    const tagDef  = allTags.find(t => t.id === tagId);
    if (!tagDef && tagId) return null;

    const id        = `evt_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const startTs   = startDate instanceof Date ? startDate.getTime() : startDate;
    const endTs     = startTs + (opts.durationDays || DEFAULT_DURATION_DAYS) * 24 * 3600 * 1000;
    const bannerId  = `banner_event_${id}`;
    const label     = tagDef?.label || tagId;

    // Quêtes générées automatiquement pour ce tag
    const quests = _generateEventQuests(id, tagId, label, opts);

    return {
      id,
      tagId,
      tagLabel: label,
      customTitle: opts.customTitle || '',
      startDate:   startTs,
      endDate:     endTs,
      durationDays: opts.durationDays || DEFAULT_DURATION_DAYS,
      bannerId,
      shopDiscountPct: opts.shopDiscountPct ?? DEFAULT_SHOP_DISCOUNT,
      questIds:    quests.map(q => q.id),
      quests,                              // stockés inline, injectés dans eventQuests à l'activation
      invasionConfig: {
        energyCost: opts.invasionEnergyCost ?? DEFAULT_ENERGY_INVASION,
      },
      defiConfig: {
        energyCost: opts.defiEnergyCost ?? DEFAULT_ENERGY_DEFI,
      },
      active:      opts.active !== false,
      newCharIds:  opts.newCharIds || [],
    };
  }

  function _generateEventQuests(eventId, tagId, tagLabel, opts = {}) {
    const base = `${eventId}_q`;
    const t    = tagLabel;
    return [
      {
        id: `${base}_capture3`, type: 'capture', tagId, target: 3, active: true,
        label: `Capturer 3 créatures ${t}`,
        reward: { crystals: 150, gold: 0, items: {} },
      },
      {
        id: `${base}_capture10`, type: 'capture', tagId, target: 10, active: true,
        label: `Capturer 10 créatures ${t}`,
        reward: { crystals: 400, gold: 0, items: { item_energy_potion: 1 } },
      },
      {
        id: `${base}_defeat10`, type: 'defeat', tagId, target: 10, active: true,
        label: `Battre 10 créatures ${t} en combat`,
        reward: { crystals: 0, gold: 500, items: {} },
      },
      {
        id: `${base}_defeat30`, type: 'defeat', tagId, target: 30, active: true,
        label: `Battre 30 créatures ${t} en combat`,
        reward: { crystals: 300, gold: 0, items: {} },
      },
      {
        id: `${base}_invasion5`, type: 'eventInvasion', tagId, target: 5, active: true,
        label: `Remporter 5 combats Invasion ${t}`,
        reward: { crystals: 500, gold: 0, items: {} },
      },
      {
        id: `${base}_defi3`, type: 'eventDefi', tagId, target: 3, active: true,
        label: `Remporter 3 Défis ${t}`,
        reward: { crystals: 0, gold: 800, items: { item_energy_potion: 2 } },
      },
    ];
  }

  /** Collecte tous les tags de toutes les catégories */
  function getAllTags(state) {
    const cats = state.tagCategories || [];
    return cats.flatMap(c => c.tags || []);
  }

  // ─── ACTIVATION / DÉSACTIVATION ──────────────────────────────────────────────

  /**
   * Injecte quêtes + bannière + nouvelles créatures d'un event dans le state.
   * Utilisé par activateNext() et activateCurrent().
   */
  function _injectEventAssets(evt) {
    const state = GameState.get();
    // Quêtes : garder uniquement les quêtes non-event existantes + ajouter les quêtes de cet event
    const existingEQ = (state.eventQuests || []).filter(q => !q.id.startsWith(evt.id + '_q') && !q.id.startsWith('evt_'));
    GameState.updateEventQuestDefs([...existingEQ, ...(evt.quests || [])]);
    GameState.updatePlayer({ eventQuestState: { progress: {}, claimed: {} } });
    // Bannière gacha : purger toutes les bannières event ET les éventuels doublons par bannerId
    const existingBanners = (state.banners || []).filter(b => !b.isEventBanner && b.id !== evt.bannerId);
    const baseChars = getBaseCharsForTag(evt.tagId);
    const newBanner = {
      id:               evt.bannerId,
      name:             'Event : ' + evt.tagLabel,
      description:      'Toutes les créatures ' + evt.tagLabel + ' disponibles en bannière !',
      active:           true,
      featured:         baseChars.map(c => c.id),
      pool:             'tag',
      tagId:            evt.tagId,
      featuredRateBoost: 2.0,
      isEventBanner:    true,
    };
    GameState.updateBanners([...existingBanners, newBanner]);
    // Nouvelles créatures au roster
    if (evt.newCharIds?.length) {
      evt.newCharIds.forEach(charId => {
        const def = GameState.getCharDef(charId);
        if (def) GameState.updateCharDef(charId, { ...def, active: true, eventUnlocked: true });
      });
    }
  }

  /**
   * Active directement l'event courant (déjà dans events.current) :
   * injecte la bannière et les quêtes s'ils ne sont pas encore dans le state.
   * Appelé par _evtActivate() dans l'admin et par tick().
   */
  function activateCurrent() {
    const evts = _getEvents();
    const evt  = evts.current;
    if (!evt) return false;
    _injectEventAssets(evt);
    return true;
  }

  /**
   * Active l'event "next" comme event courant :
   *  - Injecte ses quêtes dans eventQuests
   *  - Crée la bannière gacha dans banners
   *  - Débloque les créatures newCharIds dans le roster
   */
  function activateNext() {
    const evts = _getEvents();
    if (!evts.next) return false;
    const evt = evts.next;
    _injectEventAssets(evt);
    // Promouvoir next → current
    const state2 = GameState.get();
    state2.events = { current: evt, next: null };
    GameState._saveEvents(state2.events);
    return true;
  }

  /**
   * Désactive l'event courant :
   *  - Retire les quêtes event
   *  - Supprime la bannière event
   */
  function deactivateCurrent() {
    const evts = _getEvents();
    if (!evts.current) return;

    const state = GameState.get();

    // Retirer les quêtes de cet event
    const filteredEQ = (state.eventQuests || []).filter(q =>
      !q.id.startsWith(`${evts.current.id}_q`)
    );
    GameState.updateEventQuestDefs(filteredEQ);

    // Retirer la bannière event
    const filteredBanners = (state.banners || []).filter(b =>
      b.id !== evts.current.bannerId
    );
    GameState.updateBanners(filteredBanners);

    const state2 = GameState.get();
    state2.events = { ...evts, current: null };
    GameState._saveEvents(state2.events);
  }

  // ─── TICK (à appeler au démarrage et lors du changement de jour) ─────────────

  /**
   * Vérifie si un event doit être activé ou désactivé.
   * À appeler au chargement du jeu et périodiquement (ex: toutes les minutes).
   */
  function tick() {
    const now  = Date.now();
    const evts = _getEvents();

    // Désactiver l'event courant s'il est terminé
    if (evts.current && evts.current.active && now > evts.current.endDate) {
      deactivateCurrent();
      return;
    }

    // Activer le "next" si son startDate est atteint
    if (!evts.current && evts.next && evts.next.active && now >= evts.next.startDate) {
      activateNext();
      return;
    }

    // Event courant actif : s'assurer que ses quêtes ET sa bannière sont bien
    // injectées dans le state (elles peuvent être absentes après un rechargement
    // si la sauvegarde de la config globale était faite avant l'injection).
    if (evts.current && evts.current.active && now >= evts.current.startDate && now <= evts.current.endDate) {
      const state = GameState.get();
      const hasQuests  = (state.eventQuests || []).some(q => q.id.startsWith(evts.current.id));
      const hasBanner  = (state.banners     || []).some(b => b.id === evts.current.bannerId);
      if (!hasQuests || !hasBanner) {
        _injectEventAssets(evts.current);
      }
    }
  }

  // ─── COMBAT "INVASION" & "DÉFI" ──────────────────────────────────────────────

  /**
   * Génère une équipe ennemie parmi les créatures du tag de l'event courant.
   * Utilisé par CombatEngine pour les modes 'eventInvasion' et 'eventDefi'.
   * @param {string} tagId
   * @param {object} cfg  - config du jeu
   * @returns {Array<object>} combatants
   */
  /**
   * Génère une équipe ennemie pour les modes Event (Invasion / Défi).
   *
   * Respecte exactement les mêmes règles que les autres modes de combat :
   * - Les formes évoluées ne peuvent apparaître que si le joueur les a débloquées
   *   (présentes dans son Bestiaire) — même règle que _isEligibleWildChar dans engine.js.
   * - Le tirage est pondéré par rareté ET par stade d'évolution (stade 0 = poids plein,
   *   stade N = poids divisé par 2^N) — même logique que _generateEnemyTeamFromLine.
   * - Le scaling adaptatif (anti-snowball) est délégué à engine.js via les instances
   *   brutes retournées ici ; c'est engine.js qui construit les combattants finaux.
   *
   * @param {string} tagId
   * @param {object} cfg  - config du jeu (state.config)
   * @returns {Array<object>} instances brutes (pas encore des combattants)
   */
  function generateEventEnemyTeam(tagId, cfg) {
    const state  = GameState.get();
    const player = state.player;

    // Taille de l'équipe ennemie (même config que les autres modes)
    const esCfg = cfg.game.enemyTeamSize;
    let size;
    if (esCfg.mode === 'fixed')        size = esCfg.value;
    else if (esCfg.mode === 'random')  size = esCfg.min + Math.floor(Math.random() * (esCfg.max - esCfg.min + 1));
    else                               size = 3;

    // Toutes les créatures du tag (toutes formes évolutives), filtrées par :
    //  1. active !== false (pas désactivée en admin)
    //  2. stade 0 OU déjà débloquée par le joueur dans son Bestiaire
    const allTagChars = getAllCharsForTag(tagId).filter(c => {
      if (c.active === false) return false;
      return c.evolutionStage === 0 || !!player.bestiaire?.[c.id];
    });

    if (allTagChars.length === 0) return [];

    // Pool pondéré : stade 0 → poids 1, stade 1 → 0.5, stade 2 → 0.25, etc.
    // + pondération additionnelle par rareté (même config que les combats normaux)
    const rarityWeights = cfg.combat?.enemyRarityWeights || {};
    const weightedPool = allTagChars.map(c => {
      const stageWeight  = Math.pow(0.5, c.evolutionStage || 0);
      const rarityWeight = Math.max(0, rarityWeights[c.rarity] ?? 1);
      return { c, weight: stageWeight * rarityWeight };
    }).filter(x => x.weight > 0);

    if (weightedPool.length === 0) return [];

    // Niveau calé sur l'équipe joueur (±2 niveaux, même logique que _generateEnemyTeam)
    const playerTeam = GameState.getTeam();
    const avgLevel   = playerTeam.length
      ? Math.round(playerTeam.reduce((s, c) => s + c.level, 0) / playerTeam.length)
      : 1;

    const enemies = [];
    for (let i = 0; i < size; i++) {
      // Tirage pondéré dans le pool
      const total = weightedPool.reduce((s, x) => s + x.weight, 0);
      let roll    = Math.random() * total;
      let picked  = weightedPool[weightedPool.length - 1].c;
      for (const x of weightedPool) {
        roll -= x.weight;
        if (roll <= 0) { picked = x.c; break; }
      }

      const lvl = Math.max(1, avgLevel + Math.floor(Math.random() * 5) - 2);
      enemies.push({
        instanceId: `enemy_event_${Date.now()}_${i}`,
        charId:     picked.id,
        level:      lvl,
        awakening:  0,
        xp:         0,
        equipment:  [null, null, null],
      });
    }
    return enemies;
  }

  /**
   * Vérifie que l'équipe joueur respecte la contrainte du mode Défi
   * (tous les membres doivent posséder le tag de l'event).
   * @param {string} tagId
   * @returns {{ ok:boolean, missing:Array<string> }}
   */
  function validateDefiTeam(tagId) {
    const state    = GameState.get();
    const tagChars = new Set(getAllCharsForTag(tagId).map(c => c.id));
    const team     = GameState.getTeam();
    const missing  = [];
    team.forEach(inst => {
      if (!tagChars.has(inst.charId)) {
        const def = GameState.getCharDef(inst.charId);
        missing.push(def?.name || inst.charId);
      }
    });
    return { ok: missing.length === 0, missing };
  }

  // ─── BOUTIQUE — PRIX RÉDUITS ─────────────────────────────────────────────────

  /**
   * Retourne les articles boutique des créatures du tag avec prix barré/réduit.
   * @param {string} tagId
   * @param {number} discountPct
   * @returns {Array<{shopItem, refDef, originalPrice, reducedPrice, remaining, blocked}>}
   */
  function getEventShopListing(tagId, discountPct) {
    const state    = GameState.get();
    const tagCharIds = new Set(getBaseCharsForTag(tagId).map(c => c.id));
    return (state.shopItems || [])
      .filter(s => s.active && s.category === 'character' && tagCharIds.has(s.refId))
      .map(s => {
        const refDef = state.characters.find(c => c.id === s.refId);
        if (!refDef) return null;
        const { remaining, blocked } = ShopSystem.getPurchaseAvailability(s);
        const originalPrice = s.price;
        const reducedPrice  = Math.max(1, Math.round(originalPrice * (1 - discountPct / 100)));
        return { shopItem: s, refDef, originalPrice, reducedPrice, remaining, blocked };
      })
      .filter(Boolean);
  }

  // ─── API ADMIN ────────────────────────────────────────────────────────────────

  /**
   * Sauvegarde un event pré-configuré dans le slot "next".
   * @param {object} eventObj - retour de buildEvent()
   */
  function saveNextEvent(eventObj) {
    const state = GameState.get();
    if (!state.events) state.events = { current: null, next: null };
    state.events.next = eventObj;
    GameState._saveEvents(state.events);
  }

  /**
   * Sauvegarde l'event courant (modifications admin).
   */
  function saveCurrentEvent(eventObj) {
    const state = GameState.get();
    if (!state.events) state.events = { current: null, next: null };
    state.events.current = eventObj;
    GameState._saveEvents(state.events);
  }

  /**
   * Tire un tag au hasard parmi tous les tags disponibles.
   * @returns {object|null} { id, label }
   */
  function pickRandomTag() {
    const state = GameState.get();
    const tags  = getAllTags(state);
    if (!tags.length) return null;
    return tags[Math.floor(Math.random() * tags.length)];
  }

  // ─── GACHA — POOL FILTRÉ PAR TAG ─────────────────────────────────────────────

  /**
   * Retourne le pool de tirage pour une bannière event (formes de base du tag).
   * Appelé par GachaSystem quand banner.pool === 'tag'.
   */
  function getEventBannerPool(banner, allChars) {
    if (!banner.tagId) return allChars.filter(c => (c.evolutionStage || 0) === 0);
    return allChars.filter(c =>
      (c.evolutionStage || 0) === 0 &&
      (c.tags || []).includes(banner.tagId)
    );
  }

  // ─── API PUBLIQUE ─────────────────────────────────────────────────────────────

  return {
    EVENT_DAYS,
    nextEventStart, nextEventStartAfter,
    getCurrent, getActiveOrPending, getNext,
    getBaseCharsForTag, getAllCharsForTag, getAllTags, getTagCollectionStats,
    buildEvent, pickRandomTag,
    activateNext, activateCurrent, deactivateCurrent, tick,
    generateEventEnemyTeam, validateDefiTeam,
    getEventShopListing,
    saveNextEvent, saveCurrentEvent, getEventBannerPool,
  };
})();
