/**
 * ============================================================
 * SHOP.JS — Système d'objets génériques + Boutique
 *
 * Deux systèmes complémentaires :
 *
 *  1. ITEMS (ItemSystem)
 *     - Chaque objet (cf. GameDatabase.DEFAULT_ITEMS / admin) porte une
 *       liste `effects`, chacun d'un type tiré du catalogue fermé
 *       GameDatabase.ITEM_EFFECT_TYPES (ex: gainEnergy, grantCurrency...).
 *     - useItem() applique TOUS les effets d'un objet en une fois, décrémente
 *       l'inventaire, et retourne un résumé détaillé pour que l'UI affiche
 *       le bon message/animation.
 *     - Les effets avec targetsCharacter:true (ex: gainCharLevel) exigent
 *       qu'une créature soit choisie au préalable par l'appelant (l'UI doit
 *       donc imposer cette sélection avant d'autoriser le bouton "Utiliser").
 *
 *  2. BOUTIQUE (ShopSystem)
 *     - Catalogue d'articles (GameDatabase.DEFAULT_SHOP_ITEMS / admin),
 *       chacun référencant un équipement, un objet, ou un personnage existant,
 *       avec son propre prix/devise et ses limites d'achat (aucune, par jour,
 *       ou à vie sur le compte).
 *     - purchase() vérifie les fonds et les limites, débite la monnaie, livre
 *       l'article (ajoute à l'inventaire/collection selon la catégorie), et
 *       met à jour le suivi d'achats du joueur.
 * ============================================================
 */

'use strict';

const ItemSystem = (() => {

  /** Retourne la définition d'effet (catalogue) pour un type donné. */
  function getEffectTypeDef(type) {
    return GameDatabase.ITEM_EFFECT_TYPES.find(e => e.type === type) || null;
  }

  /**
   * Un objet nécessite-t-il qu'une créature soit choisie avant utilisation ?
   * @param {object} itemDef
   * @returns {boolean}
   */
  function requiresCharacterTarget(itemDef) {
    return (itemDef.effects || []).some(eff => getEffectTypeDef(eff.type)?.targetsCharacter);
  }

  /**
   * Applique un objet : exécute tous ses effets, décrémente l'inventaire.
   * @param {string} itemId
   * @param {string|null} targetInstanceId - requis si l'objet a un effet targetsCharacter
   * @returns {{success:boolean, error?:string, results?:Array<object>}}
   */
  function useItem(itemId, targetInstanceId = null) {
    const state = GameState.get();
    const itemDef = (state.items || []).find(i => i.id === itemId);
    if (!itemDef) return { success: false, error: 'Objet inconnu.' };

    const player = GameState.getPlayer();
    const have = player.inventory?.[itemId] || 0;
    if (have < 1) return { success: false, error: 'Tu ne possèdes pas cet objet.' };

    const needsTarget = requiresCharacterTarget(itemDef);
    if (needsTarget && !targetInstanceId) {
      return { success: false, error: 'Choisis une créature avant d\'utiliser cet objet.' };
    }
    let targetInst = null, targetDef = null;
    if (needsTarget) {
      targetInst = GameState.getPlayerChar(targetInstanceId);
      if (!targetInst) return { success: false, error: 'Créature introuvable.' };
      targetDef = GameState.getCharDef(targetInst.charId);
    }

    const results = [];
    (itemDef.effects || []).forEach((eff) => {
      results.push(_applyEffect(eff, targetInstanceId));
    });

    // Décrémenter l'inventaire (après application : les effets ne peuvent pas
    // échouer individuellement une fois la vérification de cible passée, donc
    // l'ordre n'a pas d'incidence pratique sur la cohérence).
    const inv = { ...(player.inventory || {}) };
    inv[itemId] = Math.max(0, (inv[itemId] || 0) - 1);
    GameState.updatePlayer({ inventory: inv });

    return { success: true, results, itemDef, targetInst, targetDef };
  }

  /** Applique un effet unique et retourne un résumé de ce qu'il a produit. */
  function _applyEffect(eff, targetInstanceId) {
    switch (eff.type) {
      case 'gainEnergy': {
        GameState.modifyResources({ energy: eff.amount || 0 });
        return { type: eff.type, amount: eff.amount || 0 };
      }
      case 'healEnergyFull': {
        const player = GameState.getPlayer();
        const missing = Math.max(0, player.energy.max - player.energy.current);
        if (missing > 0) GameState.modifyResources({ energy: missing });
        return { type: eff.type, amount: missing };
      }
      case 'grantCurrency': {
        GameState.grantReward({ crystals: eff.crystals || 0, gold: eff.gold || 0 });
        return { type: eff.type, crystals: eff.crystals || 0, gold: eff.gold || 0 };
      }
      case 'gainPlayerXp': {
        const res = GameState.addPlayerXp(eff.amount || 0);
        return { type: eff.type, amount: eff.amount || 0, levelUps: res?.levelUps || [] };
      }
      case 'gainCharLevel': {
        const inst = GameState.getPlayerChar(targetInstanceId);
        if (!inst) return { type: eff.type, applied: false };
        const cfg = GameState.getConfig().level;
        const levels = Math.max(1, eff.levels || 1);
        let totalXpNeeded = 0;
        let simulatedLevel = inst.level;
        let simulatedXp = inst.xp;
        for (let i = 0; i < levels; i++) {
          const xpNeeded = GameDatabase.xpForLevel(simulatedLevel + 1, cfg);
          totalXpNeeded += Math.max(1, xpNeeded - simulatedXp);
          simulatedXp = 0;
          simulatedLevel++;
        }
        const xpResult = GameState.addXpToCharacter(targetInstanceId, totalXpNeeded);
        return { type: eff.type, levels, applied: true, levelUps: xpResult?.levelUps || [], evolved: xpResult?.evolved || null };
      }
      case 'gainCharXp': {
        const xpResult = GameState.addXpToCharacter(targetInstanceId, eff.amount || 0);
        return { type: eff.type, amount: eff.amount || 0, levelUps: xpResult?.levelUps || [], evolved: xpResult?.evolved || null };
      }
      default:
        return { type: eff.type, applied: false };
    }
  }

  /** Description lisible d'un objet à partir de ses effets (utile pour l'admin et l'UI). */
  function describeEffects(effects) {
    return (effects || []).map((eff) => {
      const def = getEffectTypeDef(eff.type);
      if (!def) return eff.type;
      switch (eff.type) {
        case 'gainEnergy':    return `+${eff.amount || 0} ⚡ Énergie`;
        case 'healEnergyFull':return `🔋 Énergie au maximum`;
        case 'grantCurrency': {
          const parts = [];
          if (eff.crystals) parts.push(`+${eff.crystals} 💎`);
          if (eff.gold) parts.push(`+${eff.gold} 🪙`);
          return parts.join(' ') || '—';
        }
        case 'gainPlayerXp':  return `+${eff.amount || 0} 🌟 XP Joueur`;
        case 'gainCharLevel': return `+${eff.levels || 1} niveau(x) à une créature`;
        case 'gainCharXp':    return `+${eff.amount || 0} XP à une créature`;
        default: return def.label;
      }
    });
  }

  return { getEffectTypeDef, requiresCharacterTarget, useItem, describeEffects };
})();

const ShopSystem = (() => {

  /**
   * Calcule l'état d'achat courant d'un article pour le joueur : combien de
   * fois il reste possible de l'acheter (null = illimité), et s'il est
   * actuellement bloqué par une limite.
   * @param {object} shopItem
   * @returns {{remaining:number|null, blocked:boolean}}
   */
  function getPurchaseAvailability(shopItem) {
    const player = GameState.getPlayer();
    const pState = (player.shopPurchaseState || {})[shopItem.id];
    const limit = shopItem.limit || { type: 'none', amount: 0 };

    if (limit.type === 'none' || !limit.amount) return { remaining: null, blocked: false };

    if (limit.type === 'lifetime') {
      const used = pState?.lifetimeCount || 0;
      const remaining = Math.max(0, limit.amount - used);
      return { remaining, blocked: remaining <= 0 };
    }

    if (limit.type === 'daily') {
      const isToday = pState?.dailyDate === GameUtils.todayKey();
      const used = isToday ? (pState?.dailyCount || 0) : 0;
      const remaining = Math.max(0, limit.amount - used);
      return { remaining, blocked: remaining <= 0 };
    }

    return { remaining: null, blocked: false };
  }

  /**
   * Retourne tous les articles actifs de la boutique, enrichis de leur
   * définition d'origine (équipement/objet/personnage), prix, et
   * disponibilité d'achat courante — prêt à être affiché par l'UI.
   * @param {string} [category] - filtre optionnel 'equipment'|'item'|'character'
   */
  function getShopListing(category = null) {
    const state = GameState.get();
    const items = (state.shopItems || []).filter(s => s.active && (!category || s.category === category));

    return items.map((shopItem) => {
      let refDef = null;
      if (shopItem.category === 'equipment') refDef = state.equipment.find(e => e.id === shopItem.refId);
      else if (shopItem.category === 'item') refDef = state.items.find(i => i.id === shopItem.refId);
      else if (shopItem.category === 'character') refDef = state.characters.find(c => c.id === shopItem.refId);

      const { remaining, blocked } = getPurchaseAvailability(shopItem);
      return { shopItem, refDef, remaining, blocked };
    }).filter(entry => entry.refDef); // ignore les articles dont la référence a été supprimée
  }

  /**
   * Tente d'acheter un article de la boutique : vérifie les fonds et les
   * limites, débite la monnaie, livre l'article, met à jour le suivi d'achats.
   * @param {string} shopItemId
   * @returns {{success:boolean, error?:string, category?:string, refDef?:object, addResult?:object}}
   */
  function purchase(shopItemId) {
    const state = GameState.get();
    const shopItem = (state.shopItems || []).find(s => s.id === shopItemId && s.active);
    if (!shopItem) return { success: false, error: 'Article indisponible.' };

    const { blocked } = getPurchaseAvailability(shopItem);
    if (blocked) return { success: false, error: 'Limite d\'achat atteinte pour cet article.' };

    const player = GameState.getPlayer();
    const price = shopItem.price || 0;
    const currency = shopItem.currency === 'gold' ? 'gold' : 'crystals';
    if ((player.currency?.[currency] || 0) < price) {
      return { success: false, error: currency === 'gold' ? 'Or insuffisant !' : 'Gemmes insuffisantes !' };
    }

    let refDef = null, addResult = null;
    if (shopItem.category === 'equipment') {
      refDef = state.equipment.find(e => e.id === shopItem.refId);
      if (!refDef) return { success: false, error: 'Équipement introuvable.' };
    } else if (shopItem.category === 'item') {
      refDef = state.items.find(i => i.id === shopItem.refId);
      if (!refDef) return { success: false, error: 'Objet introuvable.' };
    } else if (shopItem.category === 'character') {
      refDef = state.characters.find(c => c.id === shopItem.refId);
      if (!refDef) return { success: false, error: 'Créature introuvable.' };
    } else {
      return { success: false, error: 'Catégorie d\'article invalide.' };
    }

    // Débiter la monnaie
    GameState.modifyResources({ [currency]: -price });

    // Livrer l'article selon sa catégorie
    if (shopItem.category === 'equipment') {
      const instance = {
        instanceId: `einst_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        equipId:    refDef.id,
        obtainedAt: Date.now(),
        equippedBy: null,
      };
      const updatedInv = [...(player.equipInventory || []), instance];
      GameState.updatePlayer({ equipInventory: updatedInv });
      addResult = { instance };
    } else if (shopItem.category === 'item') {
      const inv = { ...(player.inventory || {}) };
      inv[refDef.id] = (inv[refDef.id] || 0) + 1;
      GameState.updatePlayer({ inventory: inv });
      addResult = { itemId: refDef.id };
    } else if (shopItem.category === 'character') {
      addResult = GameState.addCharacterToCollection(refDef.id, 'shop');
    }

    _recordPurchase(shopItemId);

    return { success: true, category: shopItem.category, refDef, addResult, price, currency };
  }

  /** Met à jour le compteur d'achats (quotidien + à vie) pour un article. */
  function _recordPurchase(shopItemId) {
    const player = GameState.getPlayer();
    const prevState = (player.shopPurchaseState || {})[shopItemId] || {};
    const todayKey = GameUtils.todayKey();
    const isToday = prevState.dailyDate === todayKey;

    const newEntry = {
      lifetimeCount: (prevState.lifetimeCount || 0) + 1,
      dailyDate:     todayKey,
      dailyCount:    (isToday ? (prevState.dailyCount || 0) : 0) + 1,
    };

    const newState = { ...(player.shopPurchaseState || {}), [shopItemId]: newEntry };
    GameState.updatePlayer({ shopPurchaseState: newState });
  }

  return { getShopListing, getPurchaseAvailability, purchase };
})();
