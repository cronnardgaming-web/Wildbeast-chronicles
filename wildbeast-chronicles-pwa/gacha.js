/**
 * ============================================================
 * GACHA.JS — Système d'invocation
 * Gère les tirages simples et x10, la pitié, les bannières
 * ============================================================
 */

'use strict';

const GachaSystem = (() => {

  // ─── TIRAGE ──────────────────────────────────────────────────────────────────

  /**
   * Effectue un tirage simple
   * @param {string} bannerId
   * @returns {object|null} Résultat { char, isNew, awakening } ou null si erreur
   */
  function pullSingle(bannerId) {
    const state = GameState.get();
    const cfg   = state.config.gacha;
    const cost  = cfg.singlePullCost;
    const player = GameState.getPlayer();

    if (player.currency.crystals < cost) {
      return { error: 'Gemmes insuffisants !' };
    }

    GameState.modifyResources({ crystals: -cost });
    const result = _doPull(bannerId, state);
    _updateStats(1);
    return result;
  }

  /**
   * Effectue un tirage x10
   * @param {string} bannerId
   * @returns {Array<object>|object} Tableau de résultats ou erreur
   */
  function pullTen(bannerId) {
    const state  = GameState.get();
    const cfg    = state.config.gacha;
    const cost   = cfg.tenPullCost;
    const player = GameState.getPlayer();

    if (player.currency.crystals < cost) {
      return { error: 'Gemmes insuffisants !' };
    }

    GameState.modifyResources({ crystals: -cost });
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(_doPull(bannerId, state));
    }
    _updateStats(10);
    return results;
  }

  // ─── LOGIQUE INTERNE ──────────────────────────────────────────────────────────

  /**
   * Effectue un tirage dans une bannière donnée
   * @param {string} bannerId
   * @param {object} state
   * @returns {object} { char: charDef, isNew, awakening }
   */
  function _doPull(bannerId, state) {
    const banner = state.banners.find(b => b.id === bannerId) || state.banners[0];
    const cfg    = state.config.gacha;
    const player = state.player;

    // Obtenir le pool de créatures
    let pool = _getPool(banner, state.characters);

    // Pity counters
    const pityKey = bannerId;
    if (!player.pity[pityKey]) {
      player.pity[pityKey] = { pulls: 0, rareGuarantee: 0, epicGuarantee: 0, legendaryGuarantee: 0 };
    }
    const pity = player.pity[pityKey];
    pity.pulls++;
    pity.rareGuarantee++;
    pity.epicGuarantee++;
    pity.legendaryGuarantee++;

    // Déterminer la rareté
    let rarity = _rollRarity(state, pity, cfg);

    // Garanties de pitié
    if (pity.legendaryGuarantee >= cfg.guaranteedLegendaryAfter) {
      rarity = 'legendary';
      pity.legendaryGuarantee = 0;
      pity.epicGuarantee = 0;
      pity.rareGuarantee = 0;
    } else if (pity.epicGuarantee >= cfg.guaranteedEpicAfter) {
      rarity = rarity === 'legendary' ? rarity : 'epic';
      if (rarity === 'epic') { pity.epicGuarantee = 0; pity.rareGuarantee = 0; }
    } else if (pity.rareGuarantee >= cfg.guaranteedRareAfter) {
      if (['common', 'uncommon'].includes(rarity)) { rarity = 'rare'; pity.rareGuarantee = 0; }
    }

    // Reset des pity selon ce qui est sorti
    if (['legendary', 'mythic'].includes(rarity)) { pity.legendaryGuarantee = 0; pity.epicGuarantee = 0; pity.rareGuarantee = 0; }
    else if (rarity === 'epic') { pity.epicGuarantee = 0; pity.rareGuarantee = 0; }
    else if (['rare'].includes(rarity)) { pity.rareGuarantee = 0; }

    // Filtrer le pool par rareté
    let rarityPool = pool.filter(c => c.rarity === rarity);
    if (rarityPool.length === 0) rarityPool = pool; // fallback

    // Boost des créatures mis en avant dans la bannière
    let selected;
    if (banner.featured?.length > 0 && banner.featuredRateBoost > 1) {
      const featuredInPool = rarityPool.filter(c => banner.featured.includes(c.id));
      if (featuredInPool.length > 0 && Math.random() < 0.5) {
        selected = featuredInPool[Math.floor(Math.random() * featuredInPool.length)];
      }
    }
    if (!selected) {
      selected = rarityPool[Math.floor(Math.random() * rarityPool.length)];
    }

    // Ajouter à la collection
    const addResult = GameState.addCharacterToCollection(selected.id, 'gacha');

    return {
      char: selected,
      isNew:     addResult?.isNew     || false,
      awakening: addResult?.awakening || false,
      instance:  addResult?.instance  || null,
    };
  }

  /**
   * Détermine la rareté du tirage via les poids configurables
   * Lit en priorité config.gacha.dropRates, sinon fallback sur GameDatabase.RARITIES
   */
  function _rollRarity(state, pity, cfg) {
    const dropRates = cfg.dropRates || {};
    const rarities  = GameDatabase.RARITIES;
    const roll = Math.random() * 100;
    let cumulative = 0;
    const order = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
    for (const r of order) {
      // Poids depuis config (éditable admin) ou fallback database
      const weight = dropRates[r] !== undefined ? dropRates[r] : (rarities[r]?.gachaWeight || 0);
      cumulative += weight;
      if (roll < cumulative) return r;
    }
    return 'common';
  }

  /**
   * Retourne le pool de créatures pour une bannière
   */
  function _getPool(banner, allChars) {
    // Seuls les créatures de stade 0 (formes de base) sont invocables
    // sauf si explicitement dans featured
    const base = allChars.filter(c => c.evolutionStage === 0);
    return base;
  }

  function _updateStats(pullCount) {
    const player = GameState.getPlayer();
    GameState.updatePlayer({
      stats: { ...player.stats, totalPulls: player.stats.totalPulls + pullCount },
    });
  }

  // ─── API PUBLIQUE ─────────────────────────────────────────────────────────────

  return { pullSingle, pullTen };
})();
