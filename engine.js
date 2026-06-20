/**
 * ============================================================
 * ENGINE.JS — Moteur de combat tour par tour
 * Gère l'initialisation, l'ordre d'action, les dégâts,
 * les captures et les récompenses de fin de combat.
 * ============================================================
 */

'use strict';

const CombatEngine = (() => {

  // ─── ÉTAT INTERNE DU COMBAT ──────────────────────────────────────────────────

  let _battle    = null;   // État courant du combat
  let _onEvent   = null;   // Callback d'événements (pour l'UI)

  // ─── STRUCTURES ──────────────────────────────────────────────────────────────

  /**
   * Crée un combattant (joueur ou ennemi) à partir d'une instance et sa définition
   * @param {object} instance   - Instance du créature (collection joueur ou ennemi généré)
   * @param {object} charDef    - Définition du créature
   * @param {boolean} isEnemy
   * @returns {object} Combattant
   */
  function _buildCombatant(instance, charDef, isEnemy) {
    const state   = GameState.get();
    const cfg     = state.config;

    // Stats de base calculées
    const computed = GameDatabase.computeStats(
      charDef,
      instance.level,
      instance.awakening || 0,
      cfg.awakening,
      charDef.rarity,
      cfg.level
    );

    // Bonus équipement (résolu via les exemplaires d'inventaire équipés)
    const eqBonus = GameDatabase.computeEquipBonus(
      instance.equipment,
      state.player.equipInventory,
      state.equipment
    );

    const finalStats = {
      hp:  Math.min(99999, computed.hp  + eqBonus.hp),
      atk: Math.min(9999,  computed.atk + eqBonus.atk),
      def: Math.min(9999,  computed.def + eqBonus.def),
      spd: Math.min(9999,  computed.spd + eqBonus.spd),
    };

    return {
      instanceId: instance.instanceId,
      charId:     charDef.id,
      name:       charDef.name,
      portrait:   charDef.portrait,
      rarity:     charDef.rarity,
      type1:      charDef.type1,
      type2:      charDef.type2,
      level:      instance.level,
      awakening:  instance.awakening || 0,
      isEnemy,
      maxHp:      finalStats.hp,
      currentHp:  finalStats.hp,
      atk:        finalStats.atk,
      def:        finalStats.def,
      spd:        finalStats.spd,
      alive:      true,
      captured:   false,
    };
  }

  /**
   * Génère une équipe ennemie aléatoire.
   * Les ennemis ont un léger désavantage de stats (enemyStatRatio configurable)
   * et un niveau calé sur le niveau moyen du joueur avec une variation réduite.
   */
  /**
   * Choisit un créature au hasard dans une liste, pondéré par la rareté
   * (selon cfg.combat.enemyRarityWeights configuré en admin). Repli sur un
   * poids égal pour tous si aucune pondération valide n'est trouvée.
   * @param {Array<object>} chars
   * @param {Object<string,number>} rarityWeights
   * @returns {object}
   */
  function _pickWeightedRandomChar(chars, rarityWeights) {
    const weighted = chars.map(c => ({ c, w: Math.max(0, rarityWeights?.[c.rarity] ?? 1) }));
    const total = weighted.reduce((s, x) => s + x.w, 0);
    if (total <= 0) return chars[Math.floor(Math.random() * chars.length)];

    let roll = Math.random() * total;
    for (const x of weighted) {
      roll -= x.w;
      if (roll <= 0) return x.c;
    }
    return weighted[weighted.length - 1].c;
  }

  /**
   * Choisit un élément au hasard dans un pool pré-pondéré [{c, weight}, ...].
   * @param {Array<{c:object, weight:number}>} pool
   * @returns {object}
   */
  function _pickFromWeightedPool(pool) {
    const total = pool.reduce((s, x) => s + x.weight, 0);
    if (total <= 0) return pool[Math.floor(Math.random() * pool.length)].c;
    let roll = Math.random() * total;
    for (const x of pool) {
      roll -= x.weight;
      if (roll <= 0) return x.c;
    }
    return pool[pool.length - 1].c;
  }

  /**
   * Un créature est éligible aux pools d'ennemis aléatoires/arène s'il est de
   * stade 0 (forme de base, toujours disponible), ou si c'est une forme évoluée
   * que le joueur a déjà débloquée (présente dans son Bestiaire).
   */
  function _isEligibleWildChar(charDef, player) {
    return charDef.evolutionStage === 0 || !!player.bestiaire?.[charDef.id];
  }

  // ─── ÉQUILIBRAGE ADAPTATIF (ANTI-SNOWBALL) ───────────────────────────────────
  // Problème ciblé : un créature évolué + équipé + awakened peut devenir
  // largement plus fort que ce que son niveau seul suggère, alors que les
  // ennemis sauvages (sans équipement, sans awakening, niveau calé sur la
  // moyenne joueur) ne suivent pas cette progression. Résultat : les combats
  // s'effondrent en non-évènement après les premières heures de jeu.
  //
  // Solution : on mesure, pour l'équipe du joueur, à quel point ses stats
  // RÉELLES dépassent celles d'une version "nue" du même personnage — à la
  // forme DE BASE de sa lignée (donc l'évolution compte aussi), au même
  // niveau, sans équipement ni awakening. Cet écart ("ratio de puissance")
  // est ensuite reporté sur les stats des ennemis générés, de façon croisée :
  // un surplus d'ATK joueur renforce la DEF/PV ennemis (ils survivent plus
  // longtemps face à cette frappe), un surplus de PV/DEF joueur renforce
  // l'ATK ennemie (ils redeviennent une menace face à cette résilience).

  /**
   * Retrouve la forme de base (stade 0) de la lignée d'un créature donné.
   * Repli sur le personnage lui-même si sa lignée est introuvable (solo, etc.)
   */
  function _getLineBaseForm(charDef, allChars) {
    if (!charDef) return charDef;
    return allChars.find(c => c.evolutionLine === charDef.evolutionLine && c.evolutionStage === 0) || charDef;
  }

  /**
   * Moyenne géométrique, sur toute l'équipe, du ratio (stat réelle ÷ stat "nue")
   * pour une statistique donnée. Toujours ≥ 1 en pratique (équipement et
   * awakening ne peuvent qu'ajouter, jamais retirer).
   * @param {Array<object>} teamInstances - Instances de la collection (équipe active)
   * @param {'hp'|'atk'|'def'|'spd'} stat
   * @returns {number}
   */
  function _computeStatRatio(teamInstances, stat) {
    const state = GameState.get();
    let sumLog = 0, count = 0;

    teamInstances.forEach(inst => {
      const def = GameState.getCharDef(inst.charId);
      if (!def) return;
      const baseForm = _getLineBaseForm(def, state.characters);

      const vanilla = GameDatabase.computeStats(
        baseForm, inst.level, 0, state.config.awakening, baseForm.rarity, state.config.level
      );
      const realBase = GameDatabase.computeStats(
        def, inst.level, inst.awakening || 0, state.config.awakening, def.rarity, state.config.level
      );
      const eqBonus = GameDatabase.computeEquipBonus(inst.equipment, state.player.equipInventory, state.equipment);

      const realVal    = realBase[stat] + (eqBonus[stat] || 0);
      const vanillaVal = vanilla[stat];
      if (vanillaVal > 0) {
        sumLog += Math.log(Math.max(0.05, realVal / vanillaVal));
        count++;
      }
    });

    return count > 0 ? Math.exp(sumLog / count) : 1;
  }

  /**
   * Calcule le profil de puissance complet (4 stats) de l'équipe active.
   * @param {Array<object>} teamInstances
   * @returns {{hp:number, atk:number, def:number, spd:number}}
   */
  function _computePowerProfile(teamInstances) {
    return {
      hp:  _computeStatRatio(teamInstances, 'hp'),
      atk: _computeStatRatio(teamInstances, 'atk'),
      def: _computeStatRatio(teamInstances, 'def'),
      spd: _computeStatRatio(teamInstances, 'spd'),
    };
  }

  /**
   * Applique le ratio de stats "historique" (enemyStatRatio) PUIS le bonus
   * adaptatif croisé à un combattant ennemi déjà construit par _buildCombatant.
   * @param {object} combatant - Combattant ennemi (modifié en place)
   * @param {{hp,atk,def,spd}} powerProfile - Profil de puissance du joueur
   * @param {number} baseStatRatio - cfg.combat.enemyStatRatio (malus historique, défaut 0.85)
   * @param {number} scalingFactor - cfg.combat.adaptiveScalingFactor (0 = désactivé, 1 = parité totale)
   */
  function _applyAdaptiveScaling(combatant, powerProfile, baseStatRatio, scalingFactor) {
    const sf = Math.max(0, Math.min(1, scalingFactor ?? 0));

    // Croisé : l'ATK ennemie répond à la résilience joueur (PV+DEF),
    // la DEF/PV ennemie répond à l'offensive joueur (ATK).
    const tankiness = Math.sqrt(Math.max(0.01, powerProfile.def) * Math.max(0.01, powerProfile.hp));
    const offense   = powerProfile.atk;
    const speed     = powerProfile.spd;

    const atkMult = baseStatRatio * (1 + (tankiness - 1) * sf);
    const defMult = baseStatRatio * (1 + (offense   - 1) * sf);
    const spdMult = baseStatRatio * (1 + (speed     - 1) * sf * 0.5); // amorti : impact indirect (ordre des tours, esquive, crit)
    const hpMult  = 1             * (1 + (offense   - 1) * sf);       // les PV n'ont pas de malus de base, seulement le bonus adaptatif

    combatant.maxHp     = Math.max(1, Math.floor(combatant.maxHp * hpMult));
    combatant.currentHp = combatant.maxHp;
    combatant.atk = Math.max(1, Math.floor(combatant.atk * atkMult));
    combatant.def = Math.max(0, Math.floor(combatant.def * defMult));
    combatant.spd = Math.max(1, Math.floor(combatant.spd * spdMult));
  }

  function _generateEnemyTeam(size) {
    const state   = GameState.get();
    const cfg     = state.config.combat;
    const chars   = state.characters.filter(c => _isEligibleWildChar(c, state.player));
    const enemies = [];
    const statRatio = cfg.enemyStatRatio ?? 0.85;

    const playerTeam   = GameState.getTeam();
    const powerProfile = _computePowerProfile(playerTeam);
    const avgLevel = playerTeam.length
      ? Math.round(playerTeam.reduce((s, c) => s + c.level, 0) / playerTeam.length)
      : 1;

    for (let i = 0; i < size; i++) {
      const charDef = _pickWeightedRandomChar(chars, cfg.enemyRarityWeights);
      // Variation réduite : ±2 niveaux autour de la moyenne joueur
      const enemyLevel = Math.max(1, avgLevel + Math.floor(Math.random() * 5) - 2);

      const enemyInstance = {
        instanceId: `enemy_${Date.now()}_${i}`,
        charId: charDef.id,
        level: enemyLevel,
        awakening: 0,
        equipment: [null, null, null],
      };

      const combatant = _buildCombatant(enemyInstance, charDef, true);
      _applyAdaptiveScaling(combatant, powerProfile, statRatio, cfg.adaptiveScalingFactor);
      enemies.push(combatant);
    }
    return enemies;
  }

  /**
   * Génère une équipe ennemie pour un combat de lignée : 3 emplacements, chacun
   * tiré indépendamment parmi la forme de base et les formes évoluées de cette
   * lignée déjà débloquées par le joueur. Chaque stade d'évolution divise par 2
   * la chance d'apparition par rapport au stade précédent (la forme de base
   * n'est pas une "évolution" et garde toujours le poids plein).
   * @param {string} lineId - ID de la lignée évolutive (champ evolutionLine)
   * @returns {Array<object>} Tableau de combattants ennemis (vide si lignée introuvable/désactivée)
   */
  function _generateEnemyTeamFromLine(lineId) {
    const state = GameState.get();
    const cfg   = state.config.combat;
    const statRatio = cfg.enemyStatRatio ?? 0.85;
    const COPIES = 3;

    const lineMembers = state.characters
      .filter(c => c.evolutionLine === lineId)
      .sort((a, b) => a.evolutionStage - b.evolutionStage);

    const baseChar = lineMembers[0];
    if (!baseChar || baseChar.availableInLineCombat === false) return [];

    // Pool pondéré : stade 0 (poids plein) + formes évoluées débloquées (poids ÷2 par stade)
    const weightedPool = lineMembers
      .filter(c => _isEligibleWildChar(c, state.player))
      .map(c => ({ c, weight: Math.pow(0.5, c.evolutionStage) }));

    const playerTeam = GameState.getTeam();
    const powerProfile = _computePowerProfile(playerTeam);
    const avgLevel = playerTeam.length
      ? Math.round(playerTeam.reduce((s, c) => s + c.level, 0) / playerTeam.length)
      : 1;

    return Array.from({ length: COPIES }, (_, i) => {
      const charDef = _pickFromWeightedPool(weightedPool);
      const enemyLevel = Math.max(1, avgLevel + Math.floor(Math.random() * 3) - 1);
      const enemyInstance = {
        instanceId: `enemy_${Date.now()}_${i}`,
        charId: charDef.id,
        level: enemyLevel,
        awakening: 0,
        equipment: [null, null, null],
      };
      const combatant = _buildCombatant(enemyInstance, charDef, true);
      _applyAdaptiveScaling(combatant, powerProfile, statRatio, state.config.combat.adaptiveScalingFactor);
      return combatant;
    });
  }

  /**
   * Tire au hasard une équipe parmi les créatures déjà débloqués par le joueur
   * (utilisé par le mode 'fullRandom'). L'équipe d'origine n'est pas modifiée ici :
   * c'est à l'appelant de la restaurer après le combat.
   * @param {number} maxSize - Taille maximale d'équipe (config.game.maxTeamSize)
   * @returns {Array<string>} Tableau d'instanceId (peut être plus court si collection réduite)
   */
  function _pickRandomTeam(maxSize) {
    const player = GameState.getPlayer();
    const pool = [...player.collection];
    // Mélange de Fisher-Yates
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, maxSize).map(inst => inst.instanceId);
  }

  /**
   * Génère une équipe ennemie d'arène : 6 créatures partageant tous le type
   * donné (en type principal OU secondaire), tirés au sort en respectant les
   * poids de fréquence par rareté configurés en admin. Les formes évoluées déjà
   * débloquées par le joueur sont éligibles au même titre que les formes de base.
   * @param {string} typeId
   * @returns {Array<object>} Tableau de 6 combattants ennemis (vide si type sans créature éligible)
   */
  function _generateArenaTeam(typeId) {
    const state = GameState.get();
    const cfg   = state.config.combat;
    const statRatio = cfg.enemyStatRatio ?? 0.85;
    const SIZE = 6;

    const eligible = state.characters.filter(c =>
      (c.type1 === typeId || c.type2 === typeId) && _isEligibleWildChar(c, state.player)
    );
    if (eligible.length === 0) return [];

    const playerTeam = GameState.getTeam();
    const powerProfile = _computePowerProfile(playerTeam);
    const avgLevel = playerTeam.length
      ? Math.round(playerTeam.reduce((s, c) => s + c.level, 0) / playerTeam.length)
      : 1;

    return Array.from({ length: SIZE }, (_, i) => {
      const charDef = _pickWeightedRandomChar(eligible, cfg.enemyRarityWeights);
      const enemyLevel = Math.max(1, avgLevel + Math.floor(Math.random() * 5) - 2);
      const enemyInstance = {
        instanceId: `enemy_${Date.now()}_${i}`,
        charId: charDef.id,
        level: enemyLevel,
        awakening: 0,
        equipment: [null, null, null],
      };
      const combatant = _buildCombatant(enemyInstance, charDef, true);
      _applyAdaptiveScaling(combatant, powerProfile, statRatio, cfg.adaptiveScalingFactor);
      return combatant;
    });
  }

  /**
   * Génère des ennemis pour le mode Odyssée (histoire).
   * Le niveau de base est calé sur la moyenne de l'équipe joueur, puis les
   * modificateurs d'épreuve (élite / boss) et de sanctuaire sont appliqués
   * APRÈS l'équilibrage adaptatif, dans cet ordre :
   *   1. Génération de base (niveaux calés sur l'équipe joueur)
   *   2. Équilibrage adaptatif (anti-snowball)
   *   3. Boost d'épreuve (élite +10%, boss +25%)
   *   4. Bonus de sanctuaire (+10% par sanctuaire supplémentaire accompli, appliqué aux stats)
   *
   * @param {number} size - Nombre d'ennemis
   * @param {number} world - Sanctuaire courant (1-indexé)
   * @param {number} subLevel - Épreuve courante (1-25)
   */
  function _generateStoryEnemyTeam(size, world, subLevel) {
    const state   = GameState.get();
    const cfg     = state.config.combat;
    const storyCfg = cfg.story || {};
    const statRatio = cfg.enemyStatRatio ?? 0.85;

    const chars = state.characters.filter(c => _isEligibleWildChar(c, state.player));
    if (chars.length === 0) return [];

    const playerTeam = GameState.getTeam();
    const powerProfile = _computePowerProfile(playerTeam);
    const avgLevel = playerTeam.length
      ? Math.round(playerTeam.reduce((s, c) => s + c.level, 0) / playerTeam.length)
      : 1;

    // Déterminer le type d'épreuve
    const eliteSubs  = storyCfg.eliteSubLevels || [10, 20];
    const bossSub    = storyCfg.bossSubLevel    || 25;
    const isElite    = eliteSubs.includes(subLevel);
    const isBoss     = subLevel === bossSub;
    const sublevelBoost = isBoss ? (storyCfg.bossStatBoost ?? 0.25) : isElite ? (storyCfg.eliteStatBoost ?? 0.10) : 0;

    // Bonus de sanctuaire : +X% par sanctuaire supplémentaire accompli (sanctuaire 1 = 0%, sanctuaire 2 = +10%…)
    const worldBoost = (world - 1) * (storyCfg.worldStatBoost ?? 0.10);

    // Facteur total post-équilibrage = (1 + sublevelBoost) × (1 + worldBoost)
    const postScalingMult = (1 + sublevelBoost) * (1 + worldBoost);

    return Array.from({ length: size }, (_, i) => {
      const charDef = _pickWeightedRandomChar(chars, cfg.enemyRarityWeights);

      // Le niveau de base est ajusté par le boost d'épreuve
      const baseLevel = Math.max(1, avgLevel + Math.floor(Math.random() * 5) - 2);
      const enemyLevel = Math.max(1, Math.round(baseLevel * (1 + sublevelBoost)));

      const enemyInstance = {
        instanceId: `enemy_${Date.now()}_${i}`,
        charId: charDef.id,
        level: enemyLevel,
        awakening: 0,
        equipment: [null, null, null],
      };

      const combatant = _buildCombatant(enemyInstance, charDef, true);
      // Étape 1 : équilibrage adaptatif (anti-snowball)
      _applyAdaptiveScaling(combatant, powerProfile, statRatio, cfg.adaptiveScalingFactor);
      // Étape 2 : boosts de progression (élite/boss + sanctuaire) appliqués APRÈS
      if (postScalingMult !== 1) {
        combatant.maxHp     = Math.max(1, Math.floor(combatant.maxHp * postScalingMult));
        combatant.currentHp = combatant.maxHp;
        combatant.atk = Math.max(1, Math.floor(combatant.atk * postScalingMult));
        combatant.def = Math.max(0, Math.floor(combatant.def * postScalingMult));
        combatant.spd = Math.max(1, Math.floor(combatant.spd * postScalingMult));
      }
      // Marquer le type de rencontre pour l'interface
      combatant.storyEncounterType = isBoss ? 'boss' : isElite ? 'elite' : 'normal';
      return combatant;
    });
  }

  // ─── INITIALISATION ──────────────────────────────────────────────────────────

  /**
   * Démarre un nouveau combat
   * @param {Function} onEvent - Callback appelé à chaque événement de combat
   * @param {object} [options]
   * @param {'random'|'story'|'line'|'fullRandom'|'arena'} [options.mode='random']
   * @param {string} [options.lineId] - ID de lignée évolutive (mode 'line')
   * @param {string} [options.arenaType] - ID du type d'arène (mode 'arena')
   * @param {number} [options.storyWorld] - Sanctuaire Odyssée (mode 'story')
   * @param {number} [options.storySubLevel] - Épreuve Odyssée (mode 'story')
   * @returns {object|null} État initial du combat, ou null si erreur
   */
  function start(onEvent, options = {}) {
    const mode = options.mode || (options.lineId ? 'line' : 'random');
    const { lineId = null, arenaType = null, storyWorld = 1, storySubLevel = 1 } = options;

    _onEvent = onEvent;
    const state = GameState.get();
    const cfg   = state.config;

    // Régénérer l'énergie
    GameState.regenEnergy();

    // Vérifier l'énergie (coût spécifique au mode)
    const player = GameState.getPlayer();
    const energyCost = cfg.energy.costs?.[mode] ?? cfg.energy.combatCost ?? 10;
    if (cfg.energy.enabled && player.energy.current < energyCost) {
      _emit('error', { message: 'Énergie insuffisante !' });
      return null;
    }

    // Combat Full Aléatoire : on tire une équipe au hasard dans la collection du
    // joueur pour ce combat ; l'équipe d'origine sera restaurée à la fin du combat.
    let restoreTeam = null;
    if (mode === 'fullRandom') {
      restoreTeam = [...player.team];
      const randomTeamIds = _pickRandomTeam(cfg.game.maxTeamSize);
      if (randomTeamIds.length === 0) {
        _emit('error', { message: "Aucune créature débloquée pour composer une équipe !" });
        return null;
      }
      GameState.setTeam(randomTeamIds);
    }

    // Construire l'équipe joueur
    const teamInstances = GameState.getTeam();
    if (teamInstances.length === 0) {
      if (restoreTeam) GameState.setTeam(restoreTeam); // rien à restaurer en pratique ici, mais par sécurité
      _emit('error', { message: "Aucune créature dans l'équipe !" });
      return null;
    }

    const playerTeam = teamInstances.map(inst => {
      const def = GameState.getCharDef(inst.charId);
      return _buildCombatant(inst, def, false);
    });

    // Déterminer l'équipe ennemie selon le mode
    let enemyTeam;
    if (mode === 'line') {
      enemyTeam = _generateEnemyTeamFromLine(lineId);
      if (enemyTeam.length === 0) {
        if (restoreTeam) GameState.setTeam(restoreTeam);
        _emit('error', { message: 'Lignée évolutive introuvable ou indisponible !' });
        return null;
      }
    } else if (mode === 'arena') {
      enemyTeam = _generateArenaTeam(arenaType);
      if (enemyTeam.length === 0) {
        if (restoreTeam) GameState.setTeam(restoreTeam);
        _emit('error', { message: 'Aucun personnage disponible pour cette arène !' });
        return null;
      }
    } else if (mode === 'story') {
      const esCfg = cfg.game.enemyTeamSize;
      let enemySize;
      if (esCfg.mode === 'fixed') enemySize = esCfg.value;
      else if (esCfg.mode === 'random') enemySize = esCfg.min + Math.floor(Math.random() * (esCfg.max - esCfg.min + 1));
      else enemySize = esCfg.value || 3;

      // Vérifier s'il existe un snapshot de l'équipe ennemie d'un essai précédent
      // pour cette même épreuve (défaite en cours). Si oui, on restaure exactement
      // la même équipe (PV intégralement régénérés) pour garantir des adversaires
      // identiques jusqu'à la victoire.
      const pending = state.player.story?.pendingEnemies;
      if (pending && pending.world === storyWorld && pending.subLevel === storySubLevel) {
        enemyTeam = pending.snapshot.map((s, i) => ({
          ...s,
          instanceId: `enemy_${Date.now()}_${i}`,
          currentHp: s.maxHp,
          alive: true,
          isEnemy: true,
        }));
      } else {
        enemyTeam = _generateStoryEnemyTeam(enemySize, storyWorld, storySubLevel);
        const snapshot = enemyTeam.map(e => ({
          charId: e.charId, level: e.level, rarity: e.rarity,
          type1: e.type1, type2: e.type2, name: e.name, portrait: e.portrait,
          maxHp: e.maxHp, atk: e.atk, def: e.def, spd: e.spd,
          storyEncounterType: e.storyEncounterType, awakening: 0,
        }));
        const playerStory = state.player.story || { world: storyWorld, subLevel: 0 };
        GameState.updatePlayer({ story: { ...playerStory, pendingEnemies: { world: storyWorld, subLevel: storySubLevel, snapshot } } });
      }
    } else {
      // 'random' et 'fullRandom' utilisent la même génération d'ennemis classique
      const esCfg = cfg.game.enemyTeamSize;
      let enemySize;
      if (esCfg.mode === 'fixed')  enemySize = esCfg.value;
      else if (esCfg.mode === 'random') enemySize = esCfg.min + Math.floor(Math.random() * (esCfg.max - esCfg.min + 1));
      else enemySize = esCfg.value || 3;
      enemyTeam = _generateEnemyTeam(enemySize);
    }

    // Consommer l'énergie
    if (cfg.energy.enabled) {
      GameState.modifyResources({ energy: -energyCost });
    }

    // Construire l'état du combat
    _battle = {
      turn:         1,
      phase:        'player',   // 'player' (en attente d'action) | 'enemy' (IA en cours) | 'end'
      mode,
      lineId:       lineId || null,
      arenaType:    arenaType || null,
      storyWorld:   mode === 'story' ? storyWorld : null,
      storySubLevel: mode === 'story' ? storySubLevel : null,
      restoreTeam,               // équipe à restaurer en fin de combat (mode 'fullRandom'), sinon null
      playerTeam,
      enemyTeam,
      turnOrder:    [],         // Ordre d'action de la manche en cours (vitesse décroissante)
      turnIndex:    0,          // Position courante dans turnOrder
      currentActor: null,       // instanceId du combattant dont c'est le tour
      log:          [],
      result:       null,       // 'victory' | 'defeat'
      capturable:   [],         // Ennemis capturables après victoire
      rewards:      null,
    };

    // Mettre à jour les stats de combat
    GameState.updatePlayer({
      stats: { ...player.stats, totalBattles: player.stats.totalBattles + 1 },
    });

    _emit('battleStart', { battle: _battle });
    // Léger différé : laisse l'interface afficher la scène de combat avant que
    // le premier acteur (potentiellement un ennemi plus rapide) n'agisse.
    setTimeout(() => _startRound(), 50);
    return _battle;
  }

  // ─── DÉROULEMENT DU COMBAT ────────────────────────────────────────────────────

  /**
   * Construit l'ordre d'action de la manche : tous les combattants vivants
   * (alliés ET ennemis confondus), triés par vitesse décroissante.
   * En cas d'égalité de vitesse, l'ordre est départagé aléatoirement.
   */
  function _buildTurnOrder() {
    const all = [..._battle.playerTeam, ..._battle.enemyTeam].filter(c => c.alive);
    return all
      .map(c => ({ instanceId: c.instanceId, isEnemy: c.isEnemy, spd: c.spd, _r: Math.random() }))
      .sort((a, b) => (b.spd - a.spd) || (a._r - b._r))
      .map(({ instanceId, isEnemy }) => ({ instanceId, isEnemy }));
  }

  function _findCombatant(instanceId, isEnemy) {
    const team = isEnemy ? _battle.enemyTeam : _battle.playerTeam;
    return team.find(c => c.instanceId === instanceId);
  }

  /** Démarre une nouvelle manche : recalcule l'ordre de vitesse et lance le premier acteur */
  function _startRound() {
    if (!_battle) return;
    _battle.turnOrder = _buildTurnOrder();
    _battle.turnIndex = 0;
    _emit('roundStart', { turn: _battle.turn, battle: _battle });
    _advanceTurn();
  }

  /**
   * Fait avancer la file d'action d'un cran :
   * - si c'est un ennemi, l'IA agit automatiquement (avec un court délai pour l'animation)
   * - si c'est un allié, on attend l'action du joueur via playerAttack()
   * - si la manche est terminée, on en démarre une nouvelle
   */
  function _advanceTurn() {
    if (!_battle) return;

    if (_battle.turnIndex >= _battle.turnOrder.length) {
      _battle.turn++;
      _startRound();
      return;
    }

    const entry      = _battle.turnOrder[_battle.turnIndex];
    const combatant  = _findCombatant(entry.instanceId, entry.isEnemy);

    // Combattant déjà KO entre-temps (mort plus tôt dans la manche) : on passe au suivant
    if (!combatant || !combatant.alive) {
      _battle.turnIndex++;
      _advanceTurn();
      return;
    }

    if (entry.isEnemy) {
      _battle.phase        = 'enemy';
      _battle.currentActor = combatant.instanceId;

      const players = _battle.playerTeam.filter(p => p.alive);
      if (players.length === 0) { _checkBattleEnd(); return; }

      const target = _aiChooseTarget(combatant, players);
      if (target) {
        const result = _executeAttack(combatant, target);
        _logAction(combatant, target, result);
        _emit('enemyAttack', { attacker: combatant, target, result });
      }

      _battle.turnIndex++;
      if (_checkBattleEnd()) return;
      setTimeout(_advanceTurn, 750);
    } else {
      _battle.phase        = 'player';
      _battle.currentActor = combatant.instanceId;
      _emit('playerTurn', { actor: combatant, battle: _battle });
      // On attend ici l'appel à playerAttack() depuis l'interface
    }
  }

  /**
   * Exécute l'action du créature allié dont c'est actuellement le tour
   * @param {string} attackerInstanceId - ID de l'attaquant joueur (doit être l'acteur courant)
   * @param {string} targetInstanceId   - ID de la cible ennemie
   */
  function playerAttack(attackerInstanceId, targetInstanceId) {
    if (!_battle || _battle.phase !== 'player') return;
    if (_battle.currentActor !== attackerInstanceId) return; // ce n'est pas son tour

    const attacker = _battle.playerTeam.find(c => c.instanceId === attackerInstanceId && c.alive);
    const target   = _battle.enemyTeam.find(c => c.instanceId === targetInstanceId && c.alive);

    if (!attacker || !target) return;

    const result = _executeAttack(attacker, target);
    _logAction(attacker, target, result);
    _emit('playerAttack', { attacker, target, result });

    _battle.turnIndex++;
    if (_checkBattleEnd()) return;
    setTimeout(_advanceTurn, 750);
  }

  /**
   * IA : choisit la cible optimale pour un ennemi
   * Priorité : faiblesse élémentaire > dégâts max > n'importe qui
   */
  /**
   * Choisit la cible d'une attaque ennemie. 75% du temps, choisit tactiquement
   * la meilleure cible (dégâts pondérés par l'efficacité de type + bonus coup
   * fatal) ; 25% du temps, attaque une cible aléatoire parmi les vivantes.
   */
  function _aiChooseTarget(attacker, targets) {
    const alive = targets.filter(t => t.alive);
    if (alive.length === 0) return targets[0] || null;

    // 25% du temps : attaque aléatoire plutôt que le meilleur choix tactique
    if (Math.random() < 0.25) {
      return alive[Math.floor(Math.random() * alive.length)];
    }

    const state  = GameState.get();
    const matrix = state.typeMatrix;

    let best     = null;
    let bestScore = -1;

    for (const target of alive) {
      const mult  = GameDatabase.getTypeEffectiveness(attacker.type1, target.type1, target.type2, matrix);
      const dmg   = Math.max(1, attacker.atk - target.def) * mult;
      // Score : dégâts pondérés + bonus si coup fatal
      const score = dmg + (dmg >= target.currentHp ? 10000 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = target;
      }
    }
    return best || alive[0];
  }

  /**
   * Calcule et applique les dégâts d'une attaque
   *
   * Formule : ATK² / (ATK + DEF)
   *   → garantit des dégâts significatifs même contre une haute DEF
   *   → un ennemi avec DEF = ATK reçoit encore ~50% des dégâts max
   *   → un ennemi avec DEF = 0 reçoit 100% (ATK), DEF = ATK → 50%, DEF = 3×ATK → 25%
   *
   * Variance  : ±5% aléatoire sur le résultat final
   * Critique  : chance basée sur la VIT de l'attaquant → spd / (spd + critDivisor)
   *             multiplicateur : critMultiplier (défaut ×1.5)
   *
   * @param {object} attacker
   * @param {object} target
   * @returns {{ damage, multiplier, critical, evaded, variance }}
   */
  function _executeAttack(attacker, target) {
    const state  = GameState.get();
    const cfg    = state.config.combat;
    const matrix = state.typeMatrix;

    // ── Efficacité de type ──────────────────────────────────────────────────
    const mult = GameDatabase.getTypeEffectiveness(attacker.type1, target.type1, target.type2, matrix);

    // ── Esquive via vitesse (cap configurable) ──────────────────────────────
    const spdDiff    = target.spd - attacker.spd;
    const evadeChance = Math.min(cfg.speedEvasionCap, Math.max(0, spdDiff / 9999));
    if (Math.random() < evadeChance) {
      return { damage: 0, multiplier: mult, critical: false, evaded: true, variance: 0 };
    }

    // ── Formule de dégâts : ATK² / (ATK + DEF) ─────────────────────────────
    // Avec un plancher à 1 pour ATK et DEF afin d'éviter la division par zéro
    const atk    = Math.max(1, attacker.atk);
    const def    = Math.max(0, target.def);
    const baseDmg = (atk * atk) / (atk + def);

    // ── Variance ±5% ────────────────────────────────────────────────────────
    const variancePct = (Math.random() * 0.10) - 0.05;   // −5 % à +5 %
    const afterVariance = baseDmg * (1 + variancePct);

    // ── Coup critique (basé sur VIT de l'attaquant) ─────────────────────────
    const critDivisor    = cfg.critDivisor    ?? 200;   // plus bas → plus de crits
    const critMultiplier = cfg.critMultiplier ?? 1.5;
    const critChance     = attacker.spd / (attacker.spd + critDivisor);
    const critical       = Math.random() < critChance;
    const critFactor     = critical ? critMultiplier : 1;

    // ── Bonus joueur vs ennemi ───────────────────────────────────────────────
    // Le joueur bénéficie d'un léger avantage structurel
    const playerBonus = (!attacker.isEnemy && target.isEnemy) ? (cfg.playerDmgBonus ?? 1.15) : 1;
    const enemyPenalty = (attacker.isEnemy && !target.isEnemy) ? (cfg.enemyDmgPenalty ?? 0.80) : 1;

    // ── Calcul final ────────────────────────────────────────────────────────
    const rawDamage = afterVariance * mult * critFactor * playerBonus * enemyPenalty;
    const damage    = Math.max(cfg.minDamage ?? 1, Math.floor(rawDamage));

    target.currentHp = Math.max(0, target.currentHp - damage);
    if (target.currentHp <= 0) {
      target.alive     = false;
      target.currentHp = 0;
    }

    return { damage, multiplier: mult, critical, evaded: false, variance: Math.round(variancePct * 100) };
  }

  // ─── FIN DE COMBAT ────────────────────────────────────────────────────────────

  /**
   * Vérifie si le combat est terminé
   * @returns {boolean} true si combat terminé
   */
  function _checkBattleEnd() {
    if (!_battle) return true;

    const playerAlive = _battle.playerTeam.some(c => c.alive);
    const enemyAlive  = _battle.enemyTeam.some(c => c.alive);

    if (!playerAlive) {
      _endBattle('defeat');
      return true;
    }
    if (!enemyAlive) {
      _endBattle('victory');
      return true;
    }
    return false;
  }

  /**
   * Conclut le combat et calcule les récompenses
   * @param {'victory'|'defeat'} result
   */
  function _endBattle(result) {
    if (!_battle) return;
    _battle.phase  = 'end';
    _battle.result = result;

    // Combat Full Aléatoire : on restaure l'équipe d'origine du joueur maintenant
    // que le combat est terminé (gagné ou perdu).
    if (_battle.restoreTeam) {
      GameState.setTeam(_battle.restoreTeam);
    }

    const state  = GameState.get();
    const cfg    = state.config;

    if (result === 'victory') {
      // Mode Odyssée : enregistrer la progression et effacer le snapshot d'ennemis
      if (_battle.mode === 'story' && _battle.storyWorld != null && _battle.storySubLevel != null) {
        GameState.completeStoryLevel(_battle.storyWorld, _battle.storySubLevel);
        const s = GameState.getPlayer().story || {};
        GameState.updatePlayer({ story: { ...s, pendingEnemies: null } });
      }

      // XP, pièces d'or et diamants — montants configurables depuis l'administration
      const xpEarned  = Math.floor(_battle.enemyTeam.reduce((s, e) => {
        const baseXp    = e.level * cfg.combat.rewardXpPerEnemy;
        const bonusPct  = cfg.combat.enemyXpBonusByRarity?.[e.rarity] || 0;
        return s + baseXp * (1 + bonusPct / 100);
      }, 0));
      const gold      = Math.floor(_battle.enemyTeam.length * cfg.combat.rewardGoldPerEnemy);
      const diamonds  = Math.floor(_battle.enemyTeam.length * cfg.combat.rewardDiamondsPerEnemy);

      // Distribuer XP
      const levelUps = {};
      _battle.playerTeam.forEach(combatant => {
        if (combatant.alive) {
          const res = GameState.addXpToCharacter(combatant.instanceId, xpEarned);
          if (res?.levelUps?.length) levelUps[combatant.instanceId] = res;
        }
      });

      // XP joueur : accordée pour chaque ennemi vaincu (taux configurable en admin)
      const plCfg = cfg.playerLevel || {};
      if (plCfg.xpPerEnemyKill) {
        GameState.addPlayerXp(_battle.enemyTeam.length * plCfg.xpPerEnemyKill);
      }

      // Ressources
      GameState.modifyResources({ crystals: diamonds, gold });

      // Drop d'objet : 1% de chance par ennemi vaincu d'obtenir une Potion d'Énergie
      const ENERGY_POTION_DROP_RATE = 0.01;
      let energyPotionsDropped = 0;
      _battle.enemyTeam.forEach(() => {
        if (Math.random() < ENERGY_POTION_DROP_RATE) energyPotionsDropped++;
      });
      if (energyPotionsDropped > 0) {
        const p = GameState.getPlayer();
        const inv = { ...(p.inventory || {}) };
        inv['item_energy_potion'] = (inv['item_energy_potion'] || 0) + energyPotionsDropped;
        GameState.updatePlayer({ inventory: inv });
      }

      // Possibilité de capture : fusionner les ennemis identiques (même créature)
      // en un seul choix, avec une probabilité doublée à chaque exemplaire "virtuel"
      // (ex. 4 exemplaires → taux de base × 2⁴ au lieu de 4 choix séparés au taux de base).
      // Une forme évoluée compte pour 2 exemplaires virtuels par stade d'évolution
      // (la forme de base, stade 0, compte normalement pour 1 ; une 3e évolution
      // compte donc pour 6, conformément à la règle demandée). Taux plafonné à 50%.
      const groupedByChar = {};
      _battle.enemyTeam.forEach(enemy => {
        if (!groupedByChar[enemy.charId]) groupedByChar[enemy.charId] = [];
        groupedByChar[enemy.charId].push(enemy);
      });
      _battle.capturable = Object.values(groupedByChar).map(group => {
        const charDef = GameState.getCharDef(group[0].charId);
        const stage = charDef?.evolutionStage || 0;
        const perEntryWeight = stage === 0 ? 1 : 2 * stage;
        const virtualCount = group.length * perEntryWeight;
        // -1 sur l'exposant : un seul exemplaire (rien à fusionner) ne doit donner
        // aucun bonus et garder le taux de base tel quel (2⁰ = ×1).
        const mergedRate = Math.min(0.5, cfg.combat.captureBaseRate * Math.pow(2, Math.max(0, virtualCount - 1)));
        return {
          ...group[0],
          captureRate: mergedRate,
          mergedCount: group.length,
        };
      });

      // Mettre à jour les stats victoires
      const player = GameState.getPlayer();
      GameState.updatePlayer({
        stats: { ...player.stats, totalVictories: player.stats.totalVictories + 1 },
      });

      _battle.rewards = { xpEarned, gold, diamonds, levelUps, energyPotionsDropped };
      _emit('victory', { battle: _battle, rewards: _battle.rewards });

    } else {
      _emit('defeat', { battle: _battle });
    }
  }

  /**
   * Tente de capturer un ennemi vaincu
   * @param {string} enemyInstanceId
   * @returns {{ success: boolean, result: object }}
   */
  function attemptCapture(enemyInstanceId) {
    if (!_battle || _battle.result !== 'victory') return null;

    const capturable = _battle.capturable.find(c => c.instanceId === enemyInstanceId && !c.captured);
    if (!capturable) return null;

    const success = Math.random() < capturable.captureRate;
    if (success) {
      capturable.captured = true;
      const addResult = GameState.addCharacterToCollection(capturable.charId, 'combat');
      const player = GameState.getPlayer();
      GameState.updatePlayer({
        stats: { ...player.stats, totalCaptures: player.stats.totalCaptures + 1 },
      });
      _emit('capture', { success: true, charId: capturable.charId, addResult });
      return { success: true, addResult };
    } else {
      _emit('capture', { success: false, charId: capturable.charId });
      return { success: false };
    }
  }

  // ─── UTILITAIRES ─────────────────────────────────────────────────────────────

  function _logAction(attacker, target, result) {
    if (!_battle) return;
    let msg;
    if (result.evaded) {
      msg = `💨 ${target.name} esquive l'attaque de ${attacker.name} !`;
    } else {
      const critText = result.critical ? ' 💥 CRITIQUE !' : '';
      const effText  = result.multiplier >= 2.0 ? ' ⚡ Super efficace !' :
                       result.multiplier <= 0.5 && result.multiplier > 0 ? ' 🔽 Peu efficace...' :
                       result.multiplier === 0 ? ' ❌ Aucun effet !' : '';
      const hpLeft   = target.alive ? ` [${target.currentHp}♥]` : ` 💀 KO !`;
      msg = `${attacker.isEnemy ? '👹' : '⚔️'} ${attacker.name} → ${target.name} : ${result.damage} dégâts${critText}${effText}${hpLeft}`;
    }
    _battle.log.push(msg);
    if (_battle.log.length > 50) _battle.log.shift();
  }

  function _emit(event, data = {}) {
    if (_onEvent) {
      try { _onEvent(event, data); } catch (e) { console.error('[CombatEngine] Event error:', e); }
    }
  }

  /** Retourne l'état courant du combat */
  const getBattle = () => _battle;

  /** Réinitialise le combat */
  const reset = () => { _battle = null; };

  // ─── API PUBLIQUE ─────────────────────────────────────────────────────────────

  return { start, playerAttack, attemptCapture, getBattle, reset, _aiChooseTarget, _computePowerProfile };
})();
