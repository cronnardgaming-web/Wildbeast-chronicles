/**
 * ============================================================
 * PASSIVES.JS — Système de passifs liés aux types
 *
 * Chaque type (Prédateur, Herbivore, Rapace, Aquatique, Reptile, Insecte,
 * Venimeux, Nocturne, Colosse, Rusé, Cryptide) confère un passif. Un créature
 * bi-type cumule les passifs de ses deux types. Cryptide est spécial : au
 * début du combat, il pioche aléatoirement le passif d'un AUTRE type.
 *
 * Ce module est volontairement séparé du moteur de combat (engine.js) :
 * il expose des fonctions pures qui prennent l'état du combat en argument
 * et retournent des événements de déclenchement ({ passive, source, ... })
 * qu'engine.js applique et que ui.js anime.
 * ============================================================
 */

'use strict';

const PassiveSystem = (() => {

  // ─── RÉSOLUTION DES PASSIFS D'UN COMBATTANT ──────────────────────────────────

  /**
   * Retourne la liste des passifs effectifs d'un combattant (résolution du
   * cas Cryptide incluse si déjà tiré au sort en début de combat).
   * @param {object} combatant - doit porter type1, type2, et éventuellement
   *                              _cryptideRolledPassiveId (assigné par rollBattleStartPassives)
   * @param {object} passivesCfg - state.config.passives (table typeId → définition)
   * @returns {Array<object>} définitions de passifs (dédupliquées par id)
   */
  function getEffectivePassives(combatant, passivesCfg) {
    const ids = new Set();
    if (combatant.type1) ids.add(combatant.type1);
    if (combatant.type2) ids.add(combatant.type2);

    const out = [];
    ids.forEach((typeId) => {
      if (typeId === 'Cryptide') {
        // Cryptide ne donne pas son propre passif "Mystère" en combat actif :
        // il est remplacé par le passif tiré au sort (résolu au début du combat).
        const rolledId = combatant._cryptideRolledPassiveId;
        if (rolledId && passivesCfg[rolledId]) out.push(passivesCfg[rolledId]);
        else if (passivesCfg['Cryptide']) out.push(passivesCfg['Cryptide']); // repli si pas encore tiré
      } else if (passivesCfg[typeId]) {
        out.push(passivesCfg[typeId]);
      }
    });
    return out;
  }

  /**
   * À appeler une fois par combattant Cryptide au tout début du combat :
   * tire au sort un passif parmi tous les AUTRES types et le mémorise sur
   * le combattant (_cryptideRolledPassiveId), pour le reste du combat.
   * @param {Array<object>} allCombatants - playerTeam + enemyTeam
   * @param {object} passivesCfg
   * @returns {Array<{instanceId, passiveId, passiveName}>} pour notifier l'UI
   */
  function rollBattleStartPassives(allCombatants, passivesCfg) {
    const otherTypeIds = Object.keys(passivesCfg).filter(id => id !== 'Cryptide');
    const results = [];

    allCombatants.forEach((c) => {
      const isCryptide = c.type1 === 'Cryptide' || c.type2 === 'Cryptide';
      if (!isCryptide || otherTypeIds.length === 0) return;
      const pickedId = otherTypeIds[Math.floor(Math.random() * otherTypeIds.length)];
      c._cryptideRolledPassiveId = pickedId;
      results.push({
        instanceId: c.instanceId,
        passiveId: pickedId,
        passiveName: passivesCfg[pickedId]?.name || pickedId,
      });
    });

    return results;
  }

  // ─── STATUTS (poison, paralysie, charme) ─────────────────────────────────────
  // Stockés directement sur le combattant : combatant.statuses = [{ type, ... }]

  function _ensureStatuses(combatant) {
    if (!combatant.statuses) combatant.statuses = [];
    return combatant.statuses;
  }

  function hasStatus(combatant, type) {
    return (combatant.statuses || []).some(s => s.type === type);
  }

  function addStatus(combatant, status) {
    const statuses = _ensureStatuses(combatant);
    // Un statut du même type se rafraîchit plutôt que de s'empiler
    const existingIdx = statuses.findIndex(s => s.type === status.type);
    if (existingIdx >= 0) statuses[existingIdx] = status;
    else statuses.push(status);
  }

  function removeStatus(combatant, type) {
    if (!combatant.statuses) return;
    combatant.statuses = combatant.statuses.filter(s => s.type !== type);
  }

  function clearAllStatuses(combatant) {
    combatant.statuses = [];
  }

  // ─── TRIGGERS ─────────────────────────────────────────────────────────────────
  // Chaque fonction renvoie un tableau d'événements { passive, sourceId, ... }
  // décrivant ce qui s'est déclenché, pour qu'engine.js applique les effets et
  // que ui.js puisse les afficher/animer dans l'ordre.

  /**
   * Trigger 'onAttack' : juste avant qu'un combattant attaque.
   * Gère Meute (fire/Prédateur) et Mue (metal/Reptile).
   * @param {object} attacker
   * @param {Array<object>} allyTeam - l'équipe de l'attaquant (pour Meute)
   * @param {object} passivesCfg
   * @returns {Array<object>} événements déclenchés
   */
  function triggerOnAttack(attacker, allyTeam, passivesCfg) {
    const events = [];
    const passives = getEffectivePassives(attacker, passivesCfg);

    passives.forEach((p) => {
      if (p.trigger !== 'onAttack') return;
      if (Math.random() >= p.chance) return;

      if (p.id === 'fire') {
        // Meute : booste un autre allié vivant au hasard pour SA prochaine attaque.
        // S'il n'y a aucun autre allié vivant (attaquant seul survivant de son
        // équipe), le bonus s'applique sur l'attaquant lui-même.
        const others = allyTeam.filter(c => c.alive && c.instanceId !== attacker.instanceId);
        const target = others.length > 0
          ? others[Math.floor(Math.random() * others.length)]
          : attacker;
        addStatus(target, { type: 'atkBoost', value: p.value, attacksLeft: 1, source: 'fire' });
        events.push({ passiveId: 'fire', passive: p, sourceId: attacker.instanceId, targetId: target.instanceId });
      } else if (p.id === 'metal') {
        // Mue : retire toutes les altérations d'état sur soi-même
        if ((attacker.statuses || []).length > 0) {
          clearAllStatuses(attacker);
          events.push({ passiveId: 'metal', passive: p, sourceId: attacker.instanceId, targetId: attacker.instanceId });
        }
      }
    });

    return events;
  }

  /**
   * Trigger 'onHit' : après qu'une attaque a touché sa cible (dégâts appliqués).
   * Gère Paralysie (electric/Insecte), Venin (chaos/Venimeux), Hypnose (magic/Rusé).
   * @param {object} attacker
   * @param {object} target
   * @param {object} passivesCfg
   * @returns {Array<object>} événements déclenchés
   */
  function triggerOnHit(attacker, target, passivesCfg) {
    const events = [];
    const passives = getEffectivePassives(attacker, passivesCfg);

    passives.forEach((p) => {
      if (p.trigger !== 'onHit') return;
      if (!target.alive) return;
      if (Math.random() >= p.chance) return;

      if (p.id === 'electric') {
        addStatus(target, { type: 'paralysis', attacksLeft: p.value || 1, source: 'electric' });
        events.push({ passiveId: 'electric', passive: p, sourceId: attacker.instanceId, targetId: target.instanceId });
      } else if (p.id === 'chaos') {
        addStatus(target, { type: 'poison', pctPerTurn: p.value || 2, turnsLeft: p.value2 || 5, source: 'chaos' });
        events.push({ passiveId: 'chaos', passive: p, sourceId: attacker.instanceId, targetId: target.instanceId });
      } else if (p.id === 'magic') {
        addStatus(target, { type: 'charm', attacksLeft: p.value || 1, source: 'magic' });
        events.push({ passiveId: 'magic', passive: p, sourceId: attacker.instanceId, targetId: target.instanceId });
      }
    });

    return events;
  }

  /**
   * Trigger 'onDamaged' : un combattant vient de subir des dégâts.
   * Gère Contre-Attaque (light/Colosse).
   * @param {object} defender - celui qui vient de subir les dégâts
   * @param {object} attacker - celui qui a infligé les dégâts (cible de la contre-attaque)
   * @param {object} passivesCfg
   * @returns {Array<object>} événements { passiveId, passive, sourceId, targetId, counterAttack:true }
   */
  function triggerOnDamaged(defender, attacker, passivesCfg) {
    const events = [];
    if (!defender.alive || !attacker.alive) return events;
    const passives = getEffectivePassives(defender, passivesCfg);

    passives.forEach((p) => {
      if (p.trigger !== 'onDamaged') return;
      if (Math.random() >= p.chance) return;

      if (p.id === 'light') {
        events.push({ passiveId: 'light', passive: p, sourceId: defender.instanceId, targetId: attacker.instanceId, counterAttack: true });
      }
    });

    return events;
  }

  /**
   * Trigger 'onTurnEnd' : à la fin de chaque tour complet (toutes équipes confondues).
   * Gère Régénération (nature/Herbivore) et Tsunami (water/Aquatique), ainsi que
   * le tic des statuts actifs (poison).
   * @param {Array<object>} playerTeam
   * @param {Array<object>} enemyTeam
   * @param {object} passivesCfg
   * @returns {Array<object>} événements déclenchés (regen, tsunami, poisonTick)
   */
  function triggerOnTurnEnd(playerTeam, enemyTeam, passivesCfg) {
    const events = [];
    const allTeams = [
      { team: playerTeam, opponents: enemyTeam },
      { team: enemyTeam,  opponents: playerTeam },
    ];

    allTeams.forEach(({ team, opponents }) => {
      team.filter(c => c.alive).forEach((source) => {
        const passives = getEffectivePassives(source, passivesCfg);
        passives.forEach((p) => {
          if (p.trigger !== 'onTurnEnd') return;
          if (Math.random() >= p.chance) return;

          if (p.id === 'nature') {
            // Régénération : soigne l'allié (de la même équipe que source) avec le moins de PV
            const aliveAllies = team.filter(c => c.alive);
            if (aliveAllies.length === 0) return;
            const lowest = aliveAllies.reduce((min, c) =>
              (c.currentHp / c.maxHp) < (min.currentHp / min.maxHp) ? c : min, aliveAllies[0]);
            const healAmount = Math.round(lowest.maxHp * (p.value / 100));
            if (healAmount > 0 && lowest.currentHp < lowest.maxHp) {
              lowest.currentHp = Math.min(lowest.maxHp, lowest.currentHp + healAmount);
              events.push({ passiveId: 'nature', passive: p, sourceId: source.instanceId, targetId: lowest.instanceId, healAmount });
            }
          } else if (p.id === 'water') {
            // Tsunami : dégâts à TOUS les adversaires vivants
            const aliveOpponents = opponents.filter(c => c.alive);
            if (aliveOpponents.length === 0) return;
            const hitTargets = [];
            aliveOpponents.forEach((opp) => {
              const dmg = Math.max(1, Math.round(opp.maxHp * (p.value / 100)));
              opp.currentHp = Math.max(0, opp.currentHp - dmg);
              if (opp.currentHp <= 0) { opp.alive = false; opp.currentHp = 0; }
              hitTargets.push({ instanceId: opp.instanceId, damage: dmg });
            });
            events.push({ passiveId: 'water', passive: p, sourceId: source.instanceId, targets: hitTargets });
          }
        });
      });
    });

    // Tic des statuts actifs (poison) sur tous les combattants vivants
    [...playerTeam, ...enemyTeam].filter(c => c.alive).forEach((c) => {
      const poison = (c.statuses || []).find(s => s.type === 'poison');
      if (poison) {
        const dmg = Math.max(1, Math.round(c.maxHp * (poison.pctPerTurn / 100)));
        c.currentHp = Math.max(0, c.currentHp - dmg);
        if (c.currentHp <= 0) { c.alive = false; c.currentHp = 0; }
        poison.turnsLeft--;
        events.push({ passiveId: 'chaos', passive: passivesCfg.chaos, sourceId: c.instanceId, targetId: c.instanceId, poisonTick: dmg });
        if (poison.turnsLeft <= 0) removeStatus(c, 'poison');
      }
    });

    return events;
  }

  // ─── EFFETS PASSIFS PERMANENTS (sans jet aléatoire) ──────────────────────────

  /** Bonus de dégâts critiques additionnel (Œil Vif / ice / Rapace) — fraction (ex: 0.25) */
  function getCritBonus(combatant, passivesCfg) {
    const passives = getEffectivePassives(combatant, passivesCfg);
    const p = passives.find(p => p.id === 'ice' && p.trigger === 'passive');
    return p ? (p.value / 100) : 0;
  }

  /** Bonus d'esquive additionnel (Ombre / shadow / Nocturne) — fraction (ex: 0.07) */
  function getEvasionBonus(combatant, passivesCfg) {
    const passives = getEffectivePassives(combatant, passivesCfg);
    const p = passives.find(p => p.id === 'shadow' && p.trigger === 'passive');
    return p ? (p.value / 100) : 0;
  }

  /** Bonus d'ATK temporaire actif (Meute reçue) — fraction (ex: 0.10), consommé après l'attaque */
  function consumeAtkBoost(combatant) {
    const statuses = combatant.statuses || [];
    const boost = statuses.find(s => s.type === 'atkBoost');
    if (!boost) return 0;
    boost.attacksLeft--;
    if (boost.attacksLeft <= 0) removeStatus(combatant, 'atkBoost');
    return boost.value / 100;
  }

  // ─── API PUBLIQUE ─────────────────────────────────────────────────────────────

  return {
    getEffectivePassives, rollBattleStartPassives,
    hasStatus, addStatus, removeStatus, clearAllStatuses,
    triggerOnAttack, triggerOnHit, triggerOnDamaged, triggerOnTurnEnd,
    getCritBonus, getEvasionBonus, consumeAtkBoost,
  };
})();
