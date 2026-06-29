/**
 * ============================================================
 * STATE.JS — Gestionnaire d'état central du jeu
 * Single source of truth. Toutes les mutations passent ici.
 * Architecture flux unidirectionnel (préparé pour Redux-like)
 * ============================================================
 */

'use strict';

const GameState = (() => {

  // ─── ÉTAT INTERNE ────────────────────────────────────────────────────────────

  let _state = null;
  let _listeners = [];   // Abonnés aux changements d'état

  // ─── INITIALISATION ──────────────────────────────────────────────────────────

  /**
   * Initialise l'état à partir des données sauvegardées ou par défaut
   * @param {object|null} savedData - Données de sauvegarde (ou null pour new game)
   */
  function init(savedData) {
    if (savedData) {
      // Migration : fusionner avec les défauts pour les nouvelles clés
      _state = _mergeWithDefaults(savedData);
    } else {
      _state = _buildDefaultState();
    }
    _migrateEquipmentRefs();
    _notify('init');
    return _state;
  }

  /**
   * Migration : avant le suivi par exemplaire, inst.equipment[slot] stockait l'ID
   * de définition de l'équipement (ex. "equip_001"), ce qui permettait au même
   * équipement d'être "équipé" sur plusieurs créatures à la fois. On convertit
   * désormais ces références vers l'ID d'exemplaire d'inventaire (equipInventory)
   * correspondant, et on maintient equippedBy en conséquence. Idempotent : ne fait
   * rien sur un état déjà migré.
   */
  function _migrateEquipmentRefs() {
    const player = _state.player;
    if (!player) return;
    player.equipInventory = player.equipInventory || [];
    player.equipInventory.forEach(ei => { if (ei.equippedBy === undefined) ei.equippedBy = null; });

    (player.collection || []).forEach(inst => {
      if (!Array.isArray(inst.equipment)) return;
      inst.equipment = inst.equipment.map(slotVal => {
        if (!slotVal) return null;

        // Déjà un ID d'exemplaire d'inventaire valide ?
        const asInstance = player.equipInventory.find(ei => ei.instanceId === slotVal);
        if (asInstance) {
          if (!asInstance.equippedBy) asInstance.equippedBy = inst.instanceId;
          return slotVal;
        }

        // Ancien format (ID de définition) : chercher un exemplaire libre correspondant
        const free = player.equipInventory.find(ei => ei.equipId === slotVal && !ei.equippedBy);
        if (free) {
          free.equippedBy = inst.instanceId;
          return free.instanceId;
        }

        // Impossible à résoudre proprement : on vide le slot plutôt que de garder une référence invalide
        return null;
      });
    });
  }

  /** Construit un état vierge à partir de la DB */
  function _buildDefaultState() {
    return {
      config:       JSON.parse(JSON.stringify(GameDatabase.DEFAULT_CONFIG)),
      types:        JSON.parse(JSON.stringify(GameDatabase.DEFAULT_TYPES)),
      typeMatrix:   JSON.parse(JSON.stringify(GameDatabase.DEFAULT_TYPE_MATRIX)),
      characters:   JSON.parse(JSON.stringify(GameDatabase.DEFAULT_CHARACTERS)),
      equipment:    JSON.parse(JSON.stringify(GameDatabase.DEFAULT_EQUIPMENT)),
      items:        JSON.parse(JSON.stringify(GameDatabase.DEFAULT_ITEMS)),
      equipBanners: JSON.parse(JSON.stringify(GameDatabase.DEFAULT_EQUIP_BANNERS)),
      banners:      JSON.parse(JSON.stringify(GameDatabase.DEFAULT_BANNERS)),
      dailyQuests:  JSON.parse(JSON.stringify(GameDatabase.DEFAULT_DAILY_QUESTS)),
      weeklyQuests: JSON.parse(JSON.stringify(GameDatabase.DEFAULT_WEEKLY_QUESTS)),
      eventQuests:  JSON.parse(JSON.stringify(GameDatabase.DEFAULT_EVENT_QUESTS)),
      tagCategories: JSON.parse(JSON.stringify(GameDatabase.DEFAULT_TAG_CATEGORIES)),
      loginCycles:  JSON.parse(JSON.stringify(GameDatabase.DEFAULT_LOGIN_CYCLES)),
      shopItems:    JSON.parse(JSON.stringify(GameDatabase.DEFAULT_SHOP_ITEMS)),
      patchNotes:   { id: '', blocks: [] },
      events:       { current: null, next: null },
      player:       JSON.parse(JSON.stringify(GameDatabase.DEFAULT_PLAYER)),
    };
  }

  /** Fusionne les données sauvegardées avec les valeurs par défaut */
  /** Migre l'ancien format { id, text } vers le nouveau { id, blocks:[...] } */
  function _migratePatchNotes(pn) {
    if (!pn) return null;
    if (Array.isArray(pn.blocks)) return pn; // déjà nouveau format
    // Ancien format : { id, text } → convertir en un bloc unique sans titre ni image
    if (pn.text) {
      return { id: pn.id || '', blocks: [{ title: 'Note de mise à jour', image: '', text: pn.text }] };
    }
    return { id: pn.id || '', blocks: [] };
  }

  function _mergeWithDefaults(saved) {
    const defaults = _buildDefaultState();
    return {
      config:       _mergeConfig(defaults.config, saved.config),
      types:        saved.types        || defaults.types,
      typeMatrix:   saved.typeMatrix   || defaults.typeMatrix,
      characters:   saved.characters   || defaults.characters,
      equipment:    saved.equipment    || defaults.equipment,
      items:        saved.items        || defaults.items,
      equipBanners: saved.equipBanners || defaults.equipBanners,
      banners:      saved.banners      || defaults.banners,
      dailyQuests:  saved.dailyQuests  || defaults.dailyQuests,
      weeklyQuests: saved.weeklyQuests || defaults.weeklyQuests,
      eventQuests:  saved.eventQuests  || defaults.eventQuests,
      tagCategories: saved.tagCategories || defaults.tagCategories,
      loginCycles:  saved.loginCycles  || defaults.loginCycles,
      shopItems:    saved.shopItems    || defaults.shopItems,
      patchNotes:   _migratePatchNotes(saved.patchNotes) || defaults.patchNotes,
      events:       saved.events       || defaults.events,
      player:       _mergePlayer(defaults.player, saved.player),
    };
  }

  /**
   * Fusionne la config sauvegardée avec les défauts, niveau par niveau,
   * pour que les nouveaux champs ajoutés par une mise à jour du jeu
   * apparaissent même sur une ancienne sauvegarde.
   */
  function _mergeConfig(defaults, saved) {
    if (!saved) return defaults;
    // Fusion profonde des passifs : type par type, pour qu'un nouveau type/passif
    // ajouté plus tard dans DEFAULT_PASSIVES n'écrase pas et ne soit pas perdu
    // face à une ancienne sauvegarde qui n'a pas encore ce type.
    const mergedPassives = { ...defaults.passives };
    if (saved.passives) {
      Object.keys(saved.passives).forEach((typeId) => {
        mergedPassives[typeId] = { ...defaults.passives?.[typeId], ...saved.passives[typeId] };
      });
    }
    return {
      ...defaults,
      ...saved,
      game:      { ...defaults.game,      ...(saved.game      || {}) },
      combat:    {
        ...defaults.combat, ...(saved.combat || {}),
        story: { ...defaults.combat.story, ...((saved.combat || {}).story || {}) },
        costs: { ...defaults.combat?.costs, ...((saved.combat || {}).costs || {}) },
      },
      level:     { ...defaults.level,     ...(saved.level     || {}) },
      energy:    { ...defaults.energy,    ...(saved.energy    || {}),
        costs: { ...defaults.energy?.costs, ...((saved.energy || {}).costs || {}) },
      },
      gacha:     { ...defaults.gacha,     ...(saved.gacha     || {}) },
      audio:     { ...defaults.audio,     ...(saved.audio     || {}) },
      awakening: { ...defaults.awakening, ...(saved.awakening || {}) },
      passives:  mergedPassives,
    };
  }

  function _mergePlayer(defaults, saved) {
    if (!saved) return defaults;
    // Migration : ancienne clé "pokedex" → "bestiaire"
    const bestiaire = saved.bestiaire || saved.pokedex || {};
    return {
      ...defaults,
      ...saved,
      currency:  { ...defaults.currency,  ...(saved.currency  || {}) },
      energy:    { ...defaults.energy,     ...(saved.energy    || {}) },
      stats:     { ...defaults.stats,      ...(saved.stats     || {}) },
      bestiaire: bestiaire,
      story:     { ...defaults.story,      ...(saved.story     || {}) },
      loginCycleState: { ...defaults.loginCycleState, ...(saved.loginCycleState || {}) },
      dailyQuestState: {
        ...defaults.dailyQuestState,
        ...(saved.dailyQuestState || {}),
        progress: { ...(saved.dailyQuestState?.progress || {}) },
        claimed:  { ...(saved.dailyQuestState?.claimed  || {}) },
      },
      shopPurchaseState:  { ...defaults.shopPurchaseState, ...(saved.shopPurchaseState || {}) },
      shopDailyRotation:  saved.shopDailyRotation || null,
    };
  }

  // ─── GETTERS ─────────────────────────────────────────────────────────────────

  const get = () => _state;

  const getPlayer = () => _state.player;

  const getConfig  = () => _state.config;
  const getTypes   = () => _state.types;
  const getMatrix  = () => _state.typeMatrix;
  const getCharDefs  = () => _state.characters;
  const getEquipDefs = () => _state.equipment;
  const getBanners   = () => _state.banners;
  const getItemDefs  = () => _state.items;
  const getDailyQuestDefs = () => _state.dailyQuests;
  const getLoginCycles    = () => _state.loginCycles;
  const getShopItems      = () => _state.shopItems;

  /** Retourne la définition d'un créature par son ID */
  const getCharDef = (id) => _state.characters.find(c => c.id === id);

  /** Retourne une instance de créature dans la collection du joueur */
  const getPlayerChar = (instanceId) =>
    _state.player.collection.find(c => c.instanceId === instanceId);

  /** Retourne les membres de l'équipe active */
  const getTeam = () =>
    _state.player.team.map(iid => getPlayerChar(iid)).filter(Boolean);

  // ─── MUTATIONS JOUEUR ────────────────────────────────────────────────────────

  /**
   * Ajoute un créature à la collection du joueur
   * Gère l'awakening si déjà possédé
   * @param {string} charDefId - ID de la définition
   * @param {string} source    - 'gacha' | 'combat' | 'admin'
   * @returns {{ isNew: boolean, awakening: boolean, instance: object }}
   */
  function addCharacterToCollection(charDefId, source = 'gacha') {
    const charDef = getCharDef(charDefId);
    if (!charDef) return null;

    // Vérifier si la lignée est déjà possédée (quelque forme que ce soit)
    // AVANT d'accorder l'XP joueur : ainsi l'event 'playerLevelUp' (et le
    // 'playerChanged' qui suit) ne peut pas déclencher un renderSpecimens()
    // avec un awakening pas encore muté.
    //
    // Guard : si evolutionLine est absent/undefined sur l'une ou l'autre des
    // définitions, on compare directement par charId pour éviter que
    // undefined === undefined ne génère un faux positif d'awakening.
    const lineOwned = charDef.evolutionLine
      ? _state.player.collection.find(c => {
          const def = getCharDef(c.charId);
          return def?.evolutionLine && def.evolutionLine === charDef.evolutionLine;
        })
      : _state.player.collection.find(c => c.charId === charDefId);

    let result;

    if (lineOwned) {
      // Awakening : incrémenter EN PREMIER, avant tout _notify ou addPlayerXp
      const awakTarget = lineOwned;
      const oldAwk = awakTarget.awakening || 0;
      const maxAwk = _state.config.awakening.maxLevel;
      awakTarget.awakening = Math.min(oldAwk + 1, maxAwk);
      result = { isNew: false, awakening: true, instance: awakTarget };
    } else {
      // Nouveau créature : l'ajouter EN PREMIER à la collection
      const instance = _createCharInstance(charDef);
      _state.player.collection.push(instance);
      _registerBestiaire(charDef);
      result = { isNew: true, awakening: false, instance };
    }

    // XP joueur accordée après la mutation : les events 'playerLevelUp' /
    // 'playerChanged' verront donc la collection et l'awakening déjà à jour.
    const plCfg = _state.config.playerLevel || {};
    if (plCfg.xpPerCapture) addPlayerXp(plCfg.xpPerCapture);

    // Notifier l'UI du résultat final (après XP joueur pour que HUD et
    // specimens soient cohérents en un seul re-render)
    if (result.isNew) {
      _notify('characterAdded', { instance: result.instance });
    } else {
      _notify('awakening', { instanceId: result.instance.instanceId });
    }

    _autoSave();
    return result;
  }

  /**
   * Crée une instance de créature pour la collection
   * @param {object} charDef
   * @returns {object} Instance
   */
  function _createCharInstance(charDef) {
    return {
      instanceId: `inst_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      charId:     charDef.id,
      level:      1,
      xp:         0,
      awakening:  0,
      equipment:  [null, null, null],  // 3 slots
      nickname:   null,
      obtainedAt: Date.now(),
    };
  }

  /**
   * Enregistre un créature dans le Bestiaire
   * @param {object} charDef
   */
  function _registerBestiaire(charDef) {
    if (!_state.player.bestiaire[charDef.id]) {
      _state.player.bestiaire[charDef.id] = {
        discovered: true,
        portrait:   charDef.portrait,
        name:       charDef.name,
        rarity:     charDef.rarity,
        type1:      charDef.type1,
        type2:      charDef.type2,
        discoveredAt: Date.now(),
      };
    }
  }

  /**
   * Ajoute de l'XP à un créature et gère la montée de niveau + évolution
   * @param {string} instanceId
   * @param {number} xpAmount
   * @returns {{ levelUps: number[], evolved: object|null }}
   */
  function addXpToCharacter(instanceId, xpAmount) {
    const inst = getPlayerChar(instanceId);
    if (!inst) return null;

    inst.xp += xpAmount;
    const levelUps = [];
    let evolved = null;

    // Boucle de montée de niveau
    while (true) {
      const xpNeeded = GameDatabase.xpForLevel(inst.level + 1, _state.config.level);
      if (inst.xp >= xpNeeded) {
        inst.xp -= xpNeeded;
        inst.level++;
        levelUps.push(inst.level);

        // Vérifier évolution
        const charDef = getCharDef(inst.charId);
        if (charDef?.evolvesTo && charDef.evolutionCondition) {
          const cond = charDef.evolutionCondition;
          if (cond.type === 'level' && inst.level >= cond.value) {
            evolved = _evolveCharacter(inst, charDef);
          }
        }
      } else {
        break;
      }
    }

    if (levelUps.length > 0) _notify('levelUp', { instanceId, levelUps, evolved });
    _autoSave();
    return { levelUps, evolved };
  }

  /**
   * Fait évoluer un créature (remplace la forme précédente)
   * @param {object} inst     - Instance actuelle
   * @param {object} charDef  - Définition actuelle
   * @returns {object} Nouvelle définition
   */
  function _evolveCharacter(inst, charDef) {
    const nextDef = getCharDef(charDef.evolvesTo);
    if (!nextDef) return null;

    // Remplacer l'ID du créature dans l'instance
    inst.charId = nextDef.id;

    // Enregistrer la nouvelle forme dans le Bestiaire
    _registerBestiaire(nextDef);

    _notify('evolved', { instanceId: inst.instanceId, newCharId: nextDef.id });
    return nextDef;
  }

  /** Met à jour l'équipe active */
  function setTeam(instanceIds) {
    const maxSize = _state.config.game.maxTeamSize;
    _state.player.team = instanceIds.slice(0, maxSize);
    _notify('teamChanged');
    _autoSave();
  }

  /**
   * Ajoute/retire une pièce d'équipement sur un créature.
   * @param {string} instanceId  - Instance du créature
   * @param {number} slot        - 0 (arme), 1 (armure) ou 2 (accessoire)
   * @param {string|null} invInstanceId - ID d'exemplaire d'inventaire à équiper, ou null pour retirer
   * @returns {{success:boolean, reason?:string, equippedBy?:string}}
   */
  function equipItem(instanceId, slot, invInstanceId) {
    const inst = getPlayerChar(instanceId);
    if (!inst || slot < 0 || slot > 2) return { success: false, reason: 'invalid' };

    const inv = _state.player.equipInventory || [];
    const prevInvId = inst.equipment[slot];

    // Libérer l'ancien exemplaire de ce slot, le cas échéant
    if (prevInvId) {
      const prevEntry = inv.find(ei => ei.instanceId === prevInvId);
      if (prevEntry) prevEntry.equippedBy = null;
    }

    if (invInstanceId) {
      const entry = inv.find(ei => ei.instanceId === invInstanceId);
      if (!entry) return { success: false, reason: 'not_found' };

      // Un même exemplaire physique ne peut être équipé que par un seul créature à la fois
      if (entry.equippedBy && entry.equippedBy !== instanceId) {
        // On restaure l'exemplaire précédent pour ne pas laisser le slot vide par erreur
        if (prevInvId) {
          const prevEntry = inv.find(ei => ei.instanceId === prevInvId);
          if (prevEntry) prevEntry.equippedBy = instanceId;
        }
        return { success: false, reason: 'already_equipped', equippedBy: entry.equippedBy };
      }

      entry.equippedBy = instanceId;
      inst.equipment[slot] = invInstanceId;
    } else {
      inst.equipment[slot] = null;
    }

    _notify('equipmentChanged', { instanceId, slot, equipId: invInstanceId });
    _autoSave();
    return { success: true };
  }

  /** Modifie les ressources du joueur (monnaie, énergie) */
  function modifyResources(changes) {
    const p = _state.player;
    if (changes.crystals  !== undefined) p.currency.crystals  = Math.max(0, (p.currency.crystals  || 0) + changes.crystals);
    if (changes.gold      !== undefined) p.currency.gold      = Math.max(0, (p.currency.gold      || 0) + changes.gold);
    if (changes.energy    !== undefined) p.energy.current     = Math.max(0, Math.min(p.energy.max, p.energy.current + changes.energy));
    _notify('resourceChanged');
    _autoSave();
  }

  /**
   * Distribue une récompense composite (gemmes + or + items) au joueur.
   * Utilisé par le système de récompense de connexion quotidienne et le
   * système de quêtes quotidiennes.
   * @param {{crystals?:number, gold?:number, items?:Object<string,number>}} reward
   */
  function grantReward(reward) {
    if (!reward) return;
    const p = _state.player;
    if (reward.crystals) p.currency.crystals = (p.currency.crystals || 0) + reward.crystals;
    if (reward.gold)     p.currency.gold     = (p.currency.gold     || 0) + reward.gold;
    if (reward.items) {
      const inv = { ...(p.inventory || {}) };
      Object.entries(reward.items).forEach(([itemId, qty]) => {
        if (!qty) return;
        inv[itemId] = (inv[itemId] || 0) + qty;
      });
      p.inventory = inv;
    }
    // Récompense équipement : crée une instance dans equipInventory
    if (reward.equipment) {
      const equipIds = Array.isArray(reward.equipment) ? reward.equipment : [reward.equipment];
      const equipInv = [...(p.equipInventory || [])];
      equipIds.forEach(equipId => {
        if (!equipId) return;
        const def = (_state.equipment || []).find(e => e.id === equipId);
        if (!def) return;
        equipInv.push({
          instanceId: 'einst_reward_' + Date.now() + '_' + Math.random().toString(36).slice(2),
          equipId,
          obtainedAt: Date.now(),
          equippedBy: null,
        });
      });
      p.equipInventory = equipInv;
    }
    // Récompense animal : ajoute à la collection (ou awakening)
    if (reward.characters) {
      const charIds = Array.isArray(reward.characters) ? reward.characters : [reward.characters];
      charIds.forEach(charId => {
        if (!charId) return;
        addCharacterToCollection(charId, 'reward');
      });
    }
    _notify('resourceChanged');
    _autoSave();
  }

  /** Régénère l'énergie selon le temps écoulé */
  function regenEnergy() {
    const cfg = _state.config.energy;
    if (!cfg.enabled) return;
    const p = _state.player;
    const now = Date.now();
    const elapsed = (now - p.energy.lastRegen) / 60000; // minutes
    const regen = Math.floor(elapsed * cfg.regenPerMinute);
    if (regen > 0) {
      p.energy.current = Math.min(p.energy.max, p.energy.current + regen);
      p.energy.lastRegen = now;
    }
  }

  // ─── MUTATIONS ADMIN ─────────────────────────────────────────────────────────

  /** Remplace la config globale */
  function updateConfig(newConfig) {
    _state.config = JSON.parse(JSON.stringify(newConfig));
    _notify('configChanged');
    _autoSave();
  }

  /** Met à jour un créature dans la DB */
  function updateCharDef(charId, data) {
    const idx = _state.characters.findIndex(c => c.id === charId);
    if (idx === -1) return false;
    _state.characters[idx] = { ..._state.characters[idx], ...data };
    _notify('charDefChanged');
    _autoSave();
    return true;
  }

  /** Ajoute un nouveau créature à la DB */
  function addCharDef(charData) {
    _state.characters.push(charData);
    _notify('charDefAdded');
    _autoSave();
  }

  /** Supprime un créature de la DB */
  function removeCharDef(charId) {
    _state.characters = _state.characters.filter(c => c.id !== charId);
    _notify('charDefRemoved');
    _autoSave();
  }

  /**
   * Réordonne la liste des créatures selon l'ordre d'IDs fourni (drag & drop admin).
   * Les IDs absents de la liste fournie sont conservés à la fin, par sécurité.
   * @param {Array<string>} orderedIds
   */
  function reorderCharDefs(orderedIds) {
    const byId = new Map(_state.characters.map(c => [c.id, c]));
    const reordered = orderedIds.map(id => byId.get(id)).filter(Boolean);
    _state.characters.forEach(c => { if (!orderedIds.includes(c.id)) reordered.push(c); });
    _state.characters = reordered;
    _notify('charDefsReordered');
    _autoSave();
  }

  /** Met à jour la matrice de types */
  function updateTypeMatrix(matrix) {
    _state.typeMatrix = JSON.parse(JSON.stringify(matrix));
    _notify('matrixChanged');
    _autoSave();
  }

  /** Met à jour les types */
  function updateTypes(types) {
    _state.types = JSON.parse(JSON.stringify(types));
    _notify('typesChanged');
    _autoSave();
  }

  /** Ajoute un équipement à la DB */
  function addEquipDef(data) {
    _state.equipment.push(data);
    _notify('equipDefAdded');
    _autoSave();
  }

  /** Met à jour un équipement */
  function updateEquipDef(id, data) {
    const idx = _state.equipment.findIndex(e => e.id === id);
    if (idx === -1) return false;
    _state.equipment[idx] = { ..._state.equipment[idx], ...data };
    _notify('equipDefChanged');
    _autoSave();
    return true;
  }

  /** Supprime un équipement */
  function removeEquipDef(id) {
    _state.equipment = _state.equipment.filter(e => e.id !== id);
    _notify('equipDefRemoved');
    _autoSave();
  }

  /**
   * Réordonne la liste des équipements selon l'ordre d'IDs fourni (drag & drop admin).
   * @param {Array<string>} orderedIds
   */
  function reorderEquipDefs(orderedIds) {
    const byId = new Map(_state.equipment.map(e => [e.id, e]));
    const reordered = orderedIds.map(id => byId.get(id)).filter(Boolean);
    _state.equipment.forEach(e => { if (!orderedIds.includes(e.id)) reordered.push(e); });
    _state.equipment = reordered;
    _notify('equipDefsReordered');
    _autoSave();
  }

  /**
   * Réordonne la liste des types selon l'ordre d'IDs fourni (drag & drop admin).
   * @param {Array<string>} orderedIds
   */
  function reorderTypes(orderedIds) {
    const byId = new Map(_state.types.map(t => [t.id, t]));
    const reordered = orderedIds.map(id => byId.get(id)).filter(Boolean);
    _state.types.forEach(t => { if (!orderedIds.includes(t.id)) reordered.push(t); });
    _state.types = reordered;
    _notify('typesReordered');
    _autoSave();
  }

  /** Mise à jour des bannières gacha */
  function updateBanners(banners) {
    _state.banners = JSON.parse(JSON.stringify(banners));
    _notify('bannersChanged');
    _autoSave();
  }

  /** Remplace complètement le catalogue de quêtes quotidiennes (admin) */
  function updateDailyQuestDefs(quests) {
    _state.dailyQuests = JSON.parse(JSON.stringify(quests));
    _notify('dailyQuestDefsChanged');
    _autoSave();
  }

  /** Remplace complètement la liste des cycles de récompense de connexion (admin) */
  function updateLoginCycles(cycles) {
    _state.loginCycles = JSON.parse(JSON.stringify(cycles));
    _notify('loginCyclesChanged');
    _autoSave();
  }

  /** Remplace les catégories de tags (admin) */
  function updateTagCategories(cats) {
    _state.tagCategories = JSON.parse(JSON.stringify(cats));
    _notify('tagCategoriesChanged');
    _autoSave();
  }

  /** Remplace les quêtes hebdomadaires (admin) */
  function updateWeeklyQuestDefs(quests) {
    _state.weeklyQuests = JSON.parse(JSON.stringify(quests));
    _notify('weeklyQuestsChanged');
    _autoSave();
  }

  /** Remplace les quêtes d'event (admin) */
  function updateEventQuestDefs(quests) {
    _state.eventQuests = JSON.parse(JSON.stringify(quests));
    _notify('eventQuestsChanged');
    _autoSave();
  }

  /** Met à jour les tags d'une lignée évolutive (stockés sur la forme de base) */
  function updateLineTags(evolutionLine, tags) {
    const base = _state.characters.find(c => (c.evolutionLine || c.id) === evolutionLine && (c.evolutionStage || 0) === 0);
    if (!base) return;
    base.tags = JSON.parse(JSON.stringify(tags));
    _notify('charDefsChanged');
    _autoSave();
  }

  /** Récupère les tags d'une lignée (depuis la forme de base) */
  function getLineTags(evolutionLine) {
    const base = _state.characters.find(c => (c.evolutionLine || c.id) === evolutionLine && (c.evolutionStage || 0) === 0);
    return base?.tags || [];
  }

  /** Remplace complètement le catalogue d'objets (admin) */
  function updateItemDefs(items) {
    _state.items = JSON.parse(JSON.stringify(items));
    _notify('itemDefsChanged');
    _autoSave();
  }

  /** Remplace complètement le catalogue d'articles de la boutique (admin) */
  function updateShopItems(shopItems) {
    _state.shopItems = JSON.parse(JSON.stringify(shopItems));
    _notify('shopItemsChanged');
    _autoSave();
  }

  /**
   * Met à jour les notes de mise à jour (tableau de blocs).
   * @param {{ id: string, blocks: Array<{title:string, image:string, text:string}> }} patchNotes
   */
  function updatePatchNotes(patchNotes) {
    _state.patchNotes = { id: patchNotes.id || '', blocks: patchNotes.blocks || [] };
    _notify('patchNotesChanged');
    _autoSave();
  }

  /** Remplace complètement le joueur (admin) */
  function updatePlayer(playerData) {
    _state.player = { ..._state.player, ...playerData };
    _notify('playerChanged');
    _autoSave();
  }

  /**
   * Ajoute de l'XP au JOUEUR (distinct de l'XP des créatures) et gère la
   * montée(s) de niveau. À chaque niveau gagné : +playerLevel.energyPerLevel
   * d'énergie maximum, et l'énergie courante est entièrement régénérée au
   * nouveau total.
   * @param {number} xpAmount
   * @returns {{ levelUps: number[], energyGained: number, newEnergyMax: number }|null}
   */
  function addPlayerXp(xpAmount) {
    if (!xpAmount || xpAmount <= 0) return null;
    const player = _state.player;
    const plCfg  = _state.config.playerLevel || { xpBase: 80, xpExponent: 1.6, energyPerLevel: 5 };

    player.experience = (player.experience || 0) + xpAmount;
    const levelUps = [];
    let energyGained = 0;

    while (true) {
      const xpNeeded = GameDatabase.xpForLevel(player.level + 1, plCfg);
      if (player.experience >= xpNeeded) {
        player.experience -= xpNeeded;
        player.level++;
        levelUps.push(player.level);

        // +energyPerLevel d'énergie MAX, et régénération complète au nouveau total
        const bonus = plCfg.energyPerLevel || 5;
        player.energy = player.energy || { current: 0, max: 100 };
        player.energy.max += bonus;
        player.energy.current = player.energy.max; // régénération complète
        energyGained += bonus;
      } else {
        break;
      }
    }

    if (levelUps.length > 0) {
      _notify('playerLevelUp', {
        levelUps,
        newLevel: player.level,
        energyGained,
        newEnergyMax: player.energy.max,
        playerName: player.name,
      });
    }
    _notify('playerChanged');
    _autoSave();
    return { levelUps, energyGained, newEnergyMax: player.energy.max };
  }

  // ─── ÉVÉNEMENTS ──────────────────────────────────────────────────────────────

  /** Abonne un listener aux changements d'état */
  function subscribe(fn) {
    _listeners.push(fn);
    return () => { _listeners = _listeners.filter(l => l !== fn); }; // Unsubscribe
  }

  function _notify(event, data = {}) {
    _listeners.forEach(fn => {
      try { fn(event, data, _state); } catch (e) { console.error('[GameState] Listener error:', e); }
    });
  }

  // ─── AUTOSAVE INTERNE ─────────────────────────────────────────────────────────

  let _autoSaveFn = null;
  function setAutoSaveFn(fn) { _autoSaveFn = fn; }
  function _autoSave() { if (_autoSaveFn) _autoSaveFn(_state); }

  // ─── PROGRESSION MODE ODYSSÉE ───────────────────────────────────────────────

  /**
   * Retourne la prochaine épreuve accessible (non encore accomplie).
   * { world: number, subLevel: number }
   */
  function getStoryNext() {
    const s = _state.player.story || { world: 1, subLevel: 0 };
    const cfg = _state.config.combat.story || {};
    const perWorld = cfg.subLevelsPerWorld || 25;
    let { world, subLevel } = s;
    if (subLevel >= perWorld) { world++; subLevel = 0; }
    return { world, subLevel: subLevel + 1 };
  }

  /**
   * Marque une épreuve comme accomplie et met à jour la progression.
   * @param {number} world
   * @param {number} subLevel
   */
  function completeStoryLevel(world, subLevel) {
    const s = _state.player.story || { world: 1, subLevel: 0 };
    const cfg = _state.config.combat.story || {};
    const perWorld = cfg.subLevelsPerWorld || 25;
    if (world !== s.world) return; // sécurité : ne peut avancer que dans le sanctuaire actuel

    const newSubLevel = subLevel;
    let newWorld = world;
    if (newSubLevel >= perWorld) {
      newWorld = world + 1;
      _state.player.story = { world: newWorld, subLevel: 0 };
    } else {
      _state.player.story = { world, subLevel: newSubLevel };
    }
    _notify('storyProgress');
    _autoSave();
  }


  // ─── IMPORT SÉPARÉ : BASE DE DONNÉES ──────────────────────────────────────────

  /**
   * Applique une base de données de jeu importée, SANS toucher aux données joueur.
   * Remplace config, types, typeMatrix, characters, equipment, items, equipBanners,
   * banners, dailyQuests, loginCycles, patchNotes — et rien d'autre.
   * Compatible avec les fichiers exportés par SaveSystem.exportGameDatabase().
   * @param {object} data - données parsées depuis le fichier d'import
   */
  function applyGameDatabase(data) {
    const defaults = _buildDefaultState();
    if (data.config)        _state.config        = _mergeConfig(defaults.config, data.config);
    if (data.types)         _state.types         = data.types;
    if (data.typeMatrix)    _state.typeMatrix     = data.typeMatrix;
    if (data.characters)    _state.characters     = data.characters;
    if (data.equipment)     _state.equipment      = data.equipment;
    if (data.items)         _state.items          = data.items;
    if (data.equipBanners)  _state.equipBanners   = data.equipBanners;
    if (data.banners) {
      // Ne pas conserver les bannières event : elles seront réinjectées
      // proprement par EventSystem.tick() — évite les doublons au rechargement.
      _state.banners = data.banners.filter(b => !b.isEventBanner);
    }
    if (data.dailyQuests)   _state.dailyQuests    = data.dailyQuests;
    if (data.weeklyQuests)  _state.weeklyQuests   = data.weeklyQuests;
    if (data.tagCategories) _state.tagCategories  = data.tagCategories;
    if (data.loginCycles)   _state.loginCycles    = data.loginCycles;
    if (data.shopItems)     _state.shopItems      = data.shopItems;
    if (data.patchNotes)    _state.patchNotes     = _migratePatchNotes(data.patchNotes) || _state.patchNotes;
    if (data.eventQuests?.length) _state.eventQuests = data.eventQuests;
    if (data.events)        _state.events         = data.events;
    _notify('configChanged');
  }
  /**
   * Applique les données joueur importées dans le slot courant, SANS toucher
   * à la configuration du jeu (types, créatures, config…).
   * Compatible avec les fichiers exportés par SaveSystem.exportPlayerData().
   * @param {object} data - données parsées depuis le fichier d'import
   */
  function applyPlayerData(data) {
    const defaults = _buildDefaultState();
    if (data.player) {
      _state.player = _mergePlayer(defaults.player, data.player);
    }
    // config, types, characters, etc. inchangés
    _notify('playerChanged');
    _autoSave();
  }

  // ─── API PUBLIQUE ─────────────────────────────────────────────────────────────

  return {
    init, get,
    getPlayer, getConfig, getTypes, getMatrix,
    getCharDefs, getEquipDefs, getBanners, getItemDefs, getDailyQuestDefs, getLoginCycles, getShopItems,
    getCharDef, getPlayerChar, getTeam,
    addCharacterToCollection, addXpToCharacter, addPlayerXp, setTeam, equipItem,
    modifyResources, grantReward, regenEnergy,
    updateConfig, updateCharDef, addCharDef, removeCharDef, reorderCharDefs,
    updateTypeMatrix, updateTypes, reorderTypes, addEquipDef, updateEquipDef, removeEquipDef, reorderEquipDefs,
    updateBanners, updateDailyQuestDefs, updateWeeklyQuestDefs, updateEventQuestDefs,
    updateLoginCycles, updateItemDefs, updateShopItems, updatePatchNotes, updatePlayer,
    updateTagCategories, updateLineTags, getLineTags,
    applyGameDatabase, applyPlayerData,
    subscribe, setAutoSaveFn,
    getStoryNext, completeStoryLevel,
    /** Persiste les données d'événement (appelé par EventSystem) */
    _saveEvents(eventsObj) {
      _state.events = eventsObj;
      _notify('eventsChanged');
      _autoSave();
    },
  };
})();
