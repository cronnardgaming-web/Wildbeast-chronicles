/**
 * ============================================================
 * UI.JS — Interface utilisateur du jeu
 * Gère tous les écrans : Collection, Équipe, Expédition, Combat, Bestiaire
 * ============================================================
 */

'use strict';

const GameUI = (() => {

  // ─── ÉTAT UI ──────────────────────────────────────────────────────────────────
  let _currentScreen = 'collection';
  let _battle        = null;
  let _combatMode    = 'story';   // 'story' | 'line' | 'fullRandom' | 'arena'
  let _selectedLine  = null;       // ID de la lignée évolutive choisie en mode 'line'
  let _selectedArenaType = null;   // ID du type choisi en mode 'arena'
  let _gachaTab      = 'chars';   // 'chars' | 'equip'
  let _equipCharId   = null;       // instanceId du perso sélectionné dans l'écran équip

  // instanceId du spécimen dont la fiche détail est actuellement ouverte en modal,
  // ou null si aucune fiche n'est ouverte. Permet de rafraîchir la fiche en live
  // quand l'état change (level up, awakening, évolution…).
  let _openDetailInstanceId = null;

  // Tri des listes de créatures (mémorisé indépendamment par écran)
  let _collectionSort   = 'name';
  let _collectionFilters = { search: '', rarity: '', type: '', statKey: 'level', statMin: '' };
  let _teamSort          = 'name';
  let _teamFilters       = { search: '', rarity: '', type: '', statKey: 'level', statMin: '', tag: '' };
  let _equipSort         = 'name';   // tri du sélecteur de créature (écran Équiper)
  let _equipShowUnequippedOnly = false; // filtre "afficher seulement les bêtes sans équipement"

  // Onglet d'équipement actif dans l'écran Équiper, et tri/filtre par onglet
  let _equipInvTab = 'weapon';
  let _equipInvSort = { weapon: 'name', armor: 'name', accessory: 'name' };
  let _equipInvFilters = {
    weapon:    { search: '', rarity: '', statKey: 'atk', statMin: '' },
    armor:     { search: '', rarity: '', statKey: 'def', statMin: '' },
    accessory: { search: '', rarity: '', statKey: 'hp',  statMin: '' },
  };

  const RARITY_ORDER  = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  const STAT_OPTIONS  = [
    { key: 'level', label: 'Niveau' },
    { key: 'hp',    label: 'PV' },
    { key: 'atk',   label: 'ATK' },
    { key: 'def',   label: 'DEF' },
    { key: 'spd',   label: 'Vitesse' },
  ];

  // Slots d'équipement : 3 emplacements fixes, dans l'ordre des index 0/1/2
  const EQUIP_SLOT_ORDER  = GameDatabase.EQUIP_SLOTS || ['weapon', 'armor', 'accessory'];
  const EQUIP_SLOT_LABELS = { weapon: '⚔️ Arme', armor: '🛡️ Armure', accessory: '💍 Accessoire' };

  // ─── HELPERS RECADRAGE PORTRAITS ────────────────────────────────────────────────

  /**
   * Génère le HTML d'un <img> recadré pour la vignette collection (carré).
   * L'image est en position:absolute → le conteneur DOIT avoir position:relative + overflow:hidden.
   * @returns {string|null} HTML ou null si pas de src
   */
  function _cropImgHtml(src, name, crop) {
    if (!src) return null;
    const zoom = Math.max(1, Math.min(5, crop.zoom ?? 1));
    const x = crop.x ?? 50;
    const y = crop.y ?? 20;
    return `<img src="${src}" alt="${name || ''}"
      style="position:absolute;width:${zoom * 100}%;height:${zoom * 100}%;
             max-width:none;max-height:none;object-fit:cover;
             object-position:${x}% ${y}%;display:block;
             left:${(1 - zoom) * x}%;top:${(1 - zoom) * y}%">`;
  }

  /**
   * Génère le HTML d'un portrait combat recadré en cercle.
   *
   * Utilise un <img> positionné en px absolus calculés via onload, reproduisant
   * exactement la formule de la preview de l'éditeur de recadrage admin
   * (scale = containerSize / (2 * r_px) ; left/top centrés sur cx/cy).
   *
   * imgW/imgH stockés dans combatCrop (depuis admin) → calcul parfait.
   * Sinon fallback sur naturalWidth/naturalHeight au chargement.
   *
   * @returns {string|null} HTML ou null si pas de src
   */
  function _combatCropImgHtml(src, name, crop) {
    if (!src) return null;

    const cx = crop.cx ?? 50;
    const cy = crop.cy ?? 50;
    const r  = Math.max(1, crop.r ?? 30);
    const encoded = encodeURIComponent(JSON.stringify({
      cx, cy, r,
      imgW: crop.imgW || 0,
      imgH: crop.imgH || 0,
    }));

    const escapedSrc  = src.replace(/"/g, '&quot;');
    const escapedName = (name || '').replace(/"/g, '&quot;');

    return `<img src="${escapedSrc}" alt="${escapedName}"
      data-combat-crop="${encoded}"
      onload="_applyCombatCropOnLoad(this)"
      style="position:absolute;visibility:hidden;max-width:none;max-height:none;display:block">`;
  }

  /**
   * Applique le recadrage combat en px absolus sur un <img> après son chargement.
   * Exposée globalement (via GameUI) pour être appelable depuis l'attribut onload HTML.
   * Même formule que _applyCombatPreview dans admin.js :
   *   scale = containerSize/2 / r_px
   *   left  = containerSize/2 - cx_px * scale
   *   top   = containerSize/2 - cy_px * scale
   */
  function _applyCombatCropOnLoad(img) {
    try {
      const crop = JSON.parse(decodeURIComponent(img.dataset.combatCrop));
      const W = crop.imgW || img.naturalWidth;
      const H = crop.imgH || img.naturalHeight;
      if (!W || !H) return;
      const cont = img.parentElement;
      const contSize = (cont && cont.offsetWidth) ? cont.offsetWidth : 74;
      const rPx   = crop.r / 100 * Math.min(W, H);
      const scale  = (contSize / 2) / rPx;
      const cxPx  = crop.cx / 100 * W;
      const cyPx  = crop.cy / 100 * H;
      img.style.position   = 'absolute';
      img.style.width      = (W * scale) + 'px';
      img.style.height     = (H * scale) + 'px';
      img.style.left       = (contSize / 2 - cxPx * scale) + 'px';
      img.style.top        = (contSize / 2 - cyPx * scale) + 'px';
      img.style.maxWidth   = 'none';
      img.style.maxHeight  = 'none';
      img.style.objectFit  = '';
      img.style.display    = 'block';
      img.style.visibility = 'visible';
    } catch (e) { /* crop invalide */ }
  }

  /** Portrait pour la vignette collection et les petites cartes équipe/lobby */
  function _portraitImgHtml(def) {
    const crop = def?.portraitCrop || GameDatabase.defaultPortraitCrop();
    return _cropImgHtml(def?.portrait, def?.name, crop)
      || `<div class="card-portrait-placeholder">${(def?.name || '?').charAt(0)}</div>`;
  }

  /** Portrait pour la fiche personnage (grand rectangle vertical) */
  function _detailPortraitImgHtml(def) {
    const crop = def?.detailCrop || GameDatabase.defaultDetailCrop();
    return _cropImgHtml(def?.portrait, def?.name, crop)
      || `<div class="detail-portrait-placeholder">${(def?.name || '?').charAt(0)}</div>`;
  }

  /** Portrait pour le badge combat (cercle) */
  function _combatPortraitImgHtml(def) {
    const crop = def?.combatCrop || GameDatabase.defaultCombatCrop();
    return _combatCropImgHtml(def?.portrait, def?.name, crop)
      || `<div class="portrait-ph">${(def?.name || '?').charAt(0)}</div>`;
  }

  // ─── TRI & FILTRES DES PERSONNAGES ───────────────────────────────────────────────

  /**
   * Décore une liste d'instances avec leur définition et leurs stats calculées.
   * @param {Array<object>} instances
   * @param {object} state
   * @returns {Array<{inst:object, def:object, stats:object}>}
   */
  function _decorateInstances(instances, state) {
    return instances.map(inst => {
      const def = GameState.getCharDef(inst.charId);
      if (!def) return null;
      const stats = GameDatabase.computeStats(def, inst.level, inst.awakening || 0,
        state.config.awakening, def.rarity, state.config.level);
      return { inst, def, stats };
    }).filter(Boolean);
  }

  /**
   * Filtre une liste décorée de créatures selon une recherche par nom, une rareté,
   * un type (principal ou secondaire), et un seuil minimum sur une stat au choix.
   * @param {Array<{inst,def,stats}>} decorated
   * @param {{search:string, rarity:string, type:string, statKey:string, statMin:string}} filters
   */
  function _applyCharFilters(decorated, filters) {
    if (!filters) return decorated;
    return decorated.filter(({ inst, def, stats }) => {
      if (filters.search && !def.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.rarity && def.rarity !== filters.rarity) return false;
      if (filters.type && def.type1 !== filters.type && def.type2 !== filters.type) return false;
      if (filters.statKey && filters.statMin !== '' && filters.statMin != null) {
        const val = filters.statKey === 'level' ? inst.level : stats[filters.statKey];
        if (val < Number(filters.statMin)) return false;
      }
      // Filtre par tag : on vérifie les tags de la forme de base de la lignée
      if (filters.tag) {
        const lineId  = def.evolutionLine || def.id;
        const lineTags = GameState.getLineTags(lineId);
        if (!lineTags.includes(filters.tag)) return false;
      }
      return true;
    });
  }

  /**
   * Trie une liste décorée de créatures.
   * @param {Array<{inst,def,stats}>} decorated
   * @param {'name'|'level'|'rarity'|'type'|'hp'|'atk'|'def'|'spd'} sortKey
   * @param {object} state
   */
  function _sortDecoratedChars(decorated, sortKey, state) {
    const types = state.types;
    const typeIndex   = (id) => { const idx = types.findIndex(t => t.id === id); return idx === -1 ? 999 : idx; };
    const rarityIndex = (r)  => { const idx = RARITY_ORDER.indexOf(r); return idx === -1 ? 0 : idx; };
    const sorted = [...decorated];
    switch (sortKey) {
      case 'level':  sorted.sort((a, b) => b.inst.level - a.inst.level || a.def.name.localeCompare(b.def.name)); break;
      case 'rarity':  sorted.sort((a, b) => rarityIndex(b.def.rarity) - rarityIndex(a.def.rarity) || a.def.name.localeCompare(b.def.name)); break;
      case 'type':    sorted.sort((a, b) => typeIndex(a.def.type1) - typeIndex(b.def.type1) || a.def.name.localeCompare(b.def.name)); break;
      case 'hp':      sorted.sort((a, b) => b.stats.hp  - a.stats.hp); break;
      case 'atk':     sorted.sort((a, b) => b.stats.atk - a.stats.atk); break;
      case 'def':     sorted.sort((a, b) => b.stats.def - a.stats.def); break;
      case 'spd':     sorted.sort((a, b) => b.stats.spd - a.stats.spd); break;
      case 'name':
      default:        sorted.sort((a, b) => a.def.name.localeCompare(b.def.name)); break;
    }
    return sorted;
  }

  /** Pipeline complet : décore, filtre puis trie une liste de créatures */
  function _decorateFilterSortChars(instances, sortKey, filters, state) {
    return _sortDecoratedChars(_applyCharFilters(_decorateInstances(instances, state), filters), sortKey, state);
  }

  /** Génère un menu déroulant de tri (créatures) couvrant tous les critères demandés */
  function _renderSortSelect(id, current) {
    return `
      <select class="sort-select" id="${id}">
        <option value="name"   ${current === 'name'   ? 'selected' : ''}>Trier : Nom (A-Z)</option>
        <option value="level"  ${current === 'level'  ? 'selected' : ''}>Trier : Niveau</option>
        <option value="rarity" ${current === 'rarity' ? 'selected' : ''}>Trier : Rareté</option>
        <option value="type"   ${current === 'type'   ? 'selected' : ''}>Trier : Type</option>
        <option value="hp"     ${current === 'hp'     ? 'selected' : ''}>Trier : PV</option>
        <option value="atk"    ${current === 'atk'    ? 'selected' : ''}>Trier : Attaque</option>
        <option value="def"    ${current === 'def'    ? 'selected' : ''}>Trier : Défense</option>
        <option value="spd"    ${current === 'spd'    ? 'selected' : ''}>Trier : Vitesse</option>
      </select>
    `;
  }

  /**
   * Génère la barre de filtres réutilisable pour les écrans de créatures
   * (recherche par nom, rareté, type, seuil minimum sur une stat au choix).
   */
  function _renderCharFilterBar(prefix, filters, state, showTagFilter = false) {
    // Construire le sélecteur de tags (uniquement si showTagFilter)
    let tagSelectHtml = '';
    if (showTagFilter) {
      const allCats = state.tagCategories || [];
      const allTags = allCats.flatMap(cat => cat.tags.map(t => ({ ...t, catName: cat.name })));
      if (allTags.length > 0) {
        // Grouper les options par catégorie
        const grouped = allCats
          .filter(cat => cat.tags.length > 0)
          .map(cat =>
            `<optgroup label="${cat.name}">`
            + cat.tags.map(t =>
                `<option value="${t.id}" ${filters.tag === t.id ? 'selected' : ''}>${t.label}</option>`
              ).join('')
            + '</optgroup>'
          ).join('');
        tagSelectHtml = `
          <select class="sort-select team-tag-filter" id="${prefix}-filter-tag">
            <option value="">🏷️ Tous les tags</option>
            ${grouped}
          </select>`;
      }
    }

    return `
      <div class="filter-bar">
        <input type="text" class="search-input" id="${prefix}-search" placeholder="Rechercher un nom..." value="${filters.search || ''}">
        <select class="sort-select" id="${prefix}-filter-rarity">
          <option value="">Toutes raretés</option>
          ${RARITY_ORDER.map(r => `<option value="${r}" ${filters.rarity === r ? 'selected' : ''}>${RARITY_LABELS_FR[r]}</option>`).join('')}
        </select>
        <select class="sort-select" id="${prefix}-filter-type">
          <option value="">Tous types</option>
          ${state.types.map(t => `<option value="${t.id}" ${filters.type === t.id ? 'selected' : ''}>${t.icon} ${t.name}</option>`).join('')}
        </select>
        ${tagSelectHtml}
        <div class="stat-filter-group">
          <select class="sort-select" id="${prefix}-filter-statkey">
            ${STAT_OPTIONS.map(s => `<option value="${s.key}" ${filters.statKey === s.key ? 'selected' : ''}>${s.label} ≥</option>`).join('')}
          </select>
          <input type="number" class="search-input stat-filter-input" id="${prefix}-filter-statmin" placeholder="min." value="${filters.statMin || ''}">
        </div>
      </div>
    `;
  }

  /** Lie les contrôles de la barre de filtres aux champs de l'objet filters fourni, et appelle onChange à chaque modification */
  function _bindCharFilterBar(prefix, filters, onChange) {
    document.getElementById(`${prefix}-search`)?.addEventListener('input', e => { filters.search = e.target.value; onChange(); });
    document.getElementById(`${prefix}-filter-rarity`)?.addEventListener('change', e => { filters.rarity = e.target.value; onChange(); });
    document.getElementById(`${prefix}-filter-type`)?.addEventListener('change', e => { filters.type = e.target.value; onChange(); });
    document.getElementById(`${prefix}-filter-statkey`)?.addEventListener('change', e => { filters.statKey = e.target.value; onChange(); });
    document.getElementById(`${prefix}-filter-statmin`)?.addEventListener('input', e => { filters.statMin = e.target.value; onChange(); });
    // Filtre tag (optionnel — présent uniquement si showTagFilter=true)
    document.getElementById(`${prefix}-filter-tag`)?.addEventListener('change', e => { filters.tag = e.target.value; onChange(); });
  }

  const RARITY_LABELS_FR = {
    common: 'Commune', uncommon: 'Peu commune', rare: 'Rare',
    epic: 'Épique', legendary: 'Légendaire', mythic: 'Mythique',
  };

  // ─── INITIALISATION ──────────────────────────────────────────────────────────

  function init() {
    _renderNav();
    _bindNav();
    _bindSwipeNavigation();
    AudioSystem.init().then(() => AudioSystem.playGlobal());
    _bindMusicToggle();
    showScreen('specimens');
    _startResourceTicker();

    // Abonner aux changements d'état
    GameState.subscribe((event, data) => {
      _onStateChange(event, data);
    });
  }

  /**
   * Navigation par swipe horizontal entre les écrans principaux (mobile).
   * Désactivée sur l'écran de combat (le swipe y interférerait avec le ciblage
   * tactique des actions) et sur tout carrousel horizontal interne déjà
   * scrollable (sélecteur de créature, barre d'ordre de tour, etc.).
   */
  function _bindSwipeNavigation() {
    const SCREEN_ORDER = ['collection', 'team', 'combat', 'gacha', 'equip', 'atlas'];
    const SWIPE_THRESHOLD   = 60;   // px minimum pour valider un swipe
    const SWIPE_MAX_VERTICAL = 70;  // tolérance verticale avant d'annuler (scroll vertical prioritaire)

    const content = document.querySelector('.main-content');
    if (!content) return;

    let startX = 0, startY = 0, tracking = false;

    content.addEventListener('touchstart', (e) => {
      // Ignore si le swipe démarre dans un carrousel horizontal interne
      // (il a déjà son propre scroll, pas question de le court-circuiter)
      if (e.target.closest('.equip-char-picker, .turn-order-bar, .modal-box, #admin-panel')) {
        tracking = false;
        return;
      }
      // Pas de swipe de navigation pendant un combat actif (réservé au ciblage)
      if (_currentScreen === 'combat' && document.getElementById('screen-combat')?.querySelector('.battle-scene')) {
        tracking = false;
        return;
      }
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      tracking = true;
    }, { passive: true });

    content.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (Math.abs(dy) > SWIPE_MAX_VERTICAL) return;      // swipe trop vertical : scroll normal, on ignore
      if (Math.abs(dx) < SWIPE_THRESHOLD) return;          // trop court : pas un swipe volontaire

      const idx = SCREEN_ORDER.indexOf(_currentScreen);
      if (idx === -1) return;

      if (dx < 0 && idx < SCREEN_ORDER.length - 1) {
        showScreen(SCREEN_ORDER[idx + 1]); // swipe vers la gauche → écran suivant
      } else if (dx > 0 && idx > 0) {
        showScreen(SCREEN_ORDER[idx - 1]); // swipe vers la droite → écran précédent
      }
    }, { passive: true });
  }

  /** Branche le bouton flottant de musique (présent une seule fois dans le DOM, jamais recréé) */
  function _bindMusicToggle() {
    const btn    = document.getElementById('music-toggle');
    const popup  = document.getElementById('volume-popup');
    const slider = document.getElementById('volume-slider');
    const valEl  = document.getElementById('volume-value');
    if (!btn) return;
    _updateMusicToggle();

    // Clic sur le bouton : mute/unmute + afficher/masquer la popup volume
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      AudioSystem.toggleMute();
      _updateMusicToggle();
      if (popup) popup.classList.toggle('open');
    });

    // Slider de volume
    if (slider) {
      slider.addEventListener('input', () => {
        const vol = parseInt(slider.value) / 100;
        AudioSystem.setVolume(vol);
        if (valEl) valEl.textContent = `${slider.value}%`;
        // Si on monte le volume et qu'on était muet, réactiver
        if (vol > 0 && AudioSystem.isMuted()) {
          AudioSystem.toggleMute();
          _updateMusicToggle();
        }
      });
    }

    // Fermer la popup si on clique ailleurs
    document.addEventListener('click', (e) => {
      if (popup && popup.classList.contains('open') && !popup.contains(e.target) && e.target !== btn) {
        popup.classList.remove('open');
      }
    });
  }

  /** Met à jour l'icône et l'état visuel du bouton musique selon l'état coupé/actif */
  function _updateMusicToggle() {
    const btn = document.getElementById('music-toggle');
    if (!btn) return;
    const muted = AudioSystem.isMuted();
    btn.textContent = muted ? '🔇' : '🔊';
    btn.classList.toggle('is-on', !muted);
  }

  function _onStateChange(event, data) {
    // ── Animation d'évolution : priorité absolue avant tout re-render ──────
    if (event === 'evolved') {
      _handleEvolution(data);
      return;
    }

    // ── Animation de montée de niveau JOUEUR : priorité absolue ─────────────
    if (event === 'playerLevelUp') {
      _handlePlayerLevelUp(data);
      return;
    }

    _updateHUD();
    if (_currentScreen === 'specimens') renderSpecimens();
    if (_currentScreen === 'team') renderTeam();
    if (_currentScreen === 'atlas') renderAtlas();
    if (_currentScreen === 'inventory') renderInventory();
    if (_currentScreen === 'shop') _renderShopGrid();

    // Quêtes : re-render complet si event/quêtes changent, sinon juste quotidiennes
    if (_currentScreen === 'quests') {
      if (['eventQuestsChanged', 'eventsChanged', 'playerChanged'].includes(event)) {
        renderDailyQuests();
      } else {
        _renderDailyQuestsList();
      }
    }

    // Gacha : re-render si les bannières changent (création bannière event)
    if (_currentScreen === 'gacha' && ['bannersChanged', 'eventsChanged'].includes(event)) {
      renderExpédition();
    }

    // Combat : re-render lobby si event change (affiche/masque boutons event)
    if (_currentScreen === 'combat' && event === 'eventsChanged') {
      if (!document.getElementById('screen-combat')?.querySelector('.battle-scene')) {
        renderCombatLobby();
      }
    }

    // ── Rafraîchissement de la fiche détail ouverte ─────────────────────────
    if (_openDetailInstanceId) {
      const needsRefresh = ['levelUp', 'awakening', 'characterAdded',
        'equipmentChanged', 'playerChanged', 'resourceChanged'].includes(event);
      if (needsRefresh) {
        const inst = GameState.getPlayerChar(_openDetailInstanceId);
        if (inst) _openCharDetail(_openDetailInstanceId);
        else _closeModal();
      }
    }
  }

  /**
   * Déclenche l'animation plein écran de montée de niveau du joueur.
   * @param {object} data - { levelUps, newLevel, energyGained, newEnergyMax, playerName }
   */
  function _handlePlayerLevelUp(data) {
    PlayerLevelUpAnimator.play(data).then(() => {
      _updateHUD();
      if (_currentScreen === 'specimens') renderSpecimens();
      if (_currentScreen === 'team') renderTeam();
      if (_currentScreen === 'atlas') renderAtlas();
      // Rafraîchir la fiche ouverte si l'énergie/stats du joueur ont changé
      if (_openDetailInstanceId) {
        const inst = GameState.getPlayerChar(_openDetailInstanceId);
        if (inst) _openCharDetail(_openDetailInstanceId);
      }
    });
  }

  /**
   * Déclenche l'animation plein écran d'évolution puis rafraîchit l'UI.
   * @param {object} data - { instanceId, newCharId } émis par GameState
   */
  function _handleEvolution(data) {
    const { instanceId, newCharId } = data;

    // Récupérer la définition de la NOUVELLE forme (déjà appliquée dans l'instance)
    const nextDef = GameState.getCharDef(newCharId);
    if (!nextDef) return;

    // Retrouver l'ancienne définition via l'historique des évolutions :
    // on cherche le créature dont evolvesTo === newCharId
    const state   = GameState.get();
    const prevDef = state.characters.find(c => c.evolvesTo === newCharId) || nextDef;

    // Lancer l'animation et re-render l'UI après fermeture
    EvolutionAnimator.play(prevDef, nextDef).then(() => {
      _updateHUD();
      if (_currentScreen === 'specimens') renderSpecimens();
      if (_currentScreen === 'team') renderTeam();
      if (_currentScreen === 'atlas') renderAtlas();
      if (_currentScreen === 'combat') {
        // Mettre à jour la carte du combattant dans la scène de combat
        _refreshCombatantCard(instanceId, nextDef);
      }
      // Rafraîchir la fiche si c'est précisément ce créature qui est ouvert
      // (son charId a changé → la fiche doit montrer la nouvelle forme)
      if (_openDetailInstanceId === instanceId) {
        const inst = GameState.getPlayerChar(instanceId);
        if (inst) _openCharDetail(instanceId);
        else _closeModal();
      }
    });
  }

  /**
   * Rafraîchit visuellement la carte d'un combattant après évolution en combat.
   * @param {string} instanceId
   * @param {object} nextDef
   */
  function _refreshCombatantCard(instanceId, nextDef) {
    const card = document.getElementById(`fighter-${instanceId}`);
    if (!card) return;
    const portrait = card.querySelector('.fighter-portrait');
    if (portrait) {
      portrait.innerHTML = _combatPortraitImgHtml(nextDef);
    }
    const nameEl = card.querySelector('.fighter-name');
    if (nameEl) {
      const lvlSmall = nameEl.querySelector('small')?.outerHTML || '';
      nameEl.innerHTML = `${nextDef.name} ${lvlSmall}`;
    }
  }

  // ─── NAVIGATION ──────────────────────────────────────────────────────────────

  function _renderNav() {
    const nav = document.getElementById('main-nav');
    if (!nav) return;
    const screens = [
      { id: 'specimens', icon: '🔬', label: 'Spécimens' },
      { id: 'team',       icon: '🌿', label: 'Terrain'     },
      { id: 'combat',     icon: '⚔️', label: 'Arène'     },
      { id: 'gacha',      icon: '🧭', label: 'Expédition'   },
      { id: 'equip',      icon: '🎽', label: 'Équipement'    },
      { id: 'shop',       icon: '🏪', label: 'Marché'   },
      { id: 'inventory',  icon: '🎒', label: 'Sacoche' },
      { id: 'atlas',  icon: '🗺️', label: 'Atlas'  },
      { id: 'quests',     icon: '📋', label: 'Missions'     },
    ];
    nav.innerHTML = screens.map(s =>
      `<button class="nav-btn" data-screen="${s.id}">
        <span class="nav-icon">${s.icon}</span>
        <span class="nav-label">${s.label}</span>
        ${s.id === 'quests' ? '<span class="nav-badge" id="quests-nav-badge" style="display:none;">0</span>' : ''}
      </button>`
    ).join('');
  }

  function _bindNav() {
    document.getElementById('main-nav')?.addEventListener('click', e => {
      const btn = e.target.closest('.nav-btn');
      if (btn) showScreen(btn.dataset.screen);
    });
  }

  function showScreen(screenId) {
    _currentScreen = screenId;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === screenId));
    const el = document.getElementById(`screen-${screenId}`);
    if (el) el.classList.add('active');

    AudioSystem.playGlobal();

    const renderers = {
      specimens:  renderSpecimens,
      team:       renderTeam,
      combat:     renderCombatLobby,
      gacha:      renderExpédition,
      equip:      renderEquip,
      atlas:      renderAtlas,
      quests:     renderDailyQuests,
      inventory:  renderInventory,
      shop:       renderShop,
    };
    renderers[screenId]?.();
    _updateHUD();
  }

  // ─── HUD (RESSOURCES) ─────────────────────────────────────────────────────────

  function _updateHUD() {
    GameState.regenEnergy();
    const player = GameState.getPlayer();
    const cfg    = GameState.getConfig();
    const hud    = document.getElementById('hud');
    if (!hud) return;
    const energyPct = cfg.energy.enabled ? Math.round((player.energy.current / player.energy.max) * 100) : 100;

    // Ligne nom + niveau + barre de progression XP (créée une seule fois, mise à jour ensuite)
    let nameRow = document.getElementById('hud-player-row');
    if (!nameRow) {
      nameRow = document.createElement('div');
      nameRow.id = 'hud-player-row';
      nameRow.className = 'hud-player';
      hud.insertBefore(nameRow, hud.firstChild);
    }
    const plCfg     = cfg.playerLevel || { xpBase: 80, xpExponent: 1.6 };
    const playerXp  = player.experience || 0;
    const xpNeeded  = GameDatabase.xpForLevel((player.level || 1) + 1, plCfg);
    const xpPct     = xpNeeded > 0 ? Math.min(100, Math.round((playerXp / xpNeeded) * 100)) : 0;
    nameRow.innerHTML = `
      <div class="hud-player-top">
        <span class="hud-player-name">${GameUtils.escapeHtml(player.name || 'Naturaliste')}</span>
        <span class="hud-player-level">Niv. ${player.level || 1}</span>
      </div>
      <div class="hud-player-xp-bar" title="${playerXp} / ${xpNeeded} XP">
        <div class="hud-player-xp-fill" style="width:${xpPct}%"></div>
      </div>
    `;

    // Ligne ressources (sous-conteneur dédié pour ne pas écraser le badge compte / bouton sauvegarde)
    let resRow = document.getElementById('hud-resources');
    if (!resRow) {
      resRow = document.createElement('div');
      resRow.id = 'hud-resources';
      hud.appendChild(resRow);
    }
    // Préserver le badge compte / bouton sauvegarde (injecté séparément par index.html)
    // avant de réécrire le contenu des ressources.
    const accountWrap = document.getElementById('hud-account-wrap');
    resRow.innerHTML = `
      <div class="hud-item">
        <span class="hud-icon">💎</span>
        <span class="hud-val">${player.currency.crystals.toLocaleString()}</span>
      </div>
      <div class="hud-item">
        <span class="hud-icon">🪙</span>
        <span class="hud-val">${(player.currency.gold || 0).toLocaleString()}</span>
      </div>
      <div class="hud-item" title="Énergie">
        <span class="hud-icon">⚡</span>
        <span class="hud-val">${cfg.energy.enabled ? `${player.energy.current}/${player.energy.max}` : '∞'}</span>
        ${cfg.energy.enabled ? `<div class="hud-bar"><div class="hud-bar-fill" style="width:${energyPct}%"></div></div>` : ''}
      </div>
      <div class="hud-item">
        <span class="hud-icon">🏆</span>
        <span class="hud-val">${player.stats.totalVictories}V</span>
      </div>
    `;
    if (accountWrap) resRow.appendChild(accountWrap); // réinjecté après réécriture

    _updateQuestsBadge();
  }

  /** Met à jour le badge de notification de l'onglet Quêtes (nb de missions complétées non réclamées) */
  function _updateQuestsBadge() {
    const badge = document.getElementById('quests-nav-badge');
    if (!badge) return;
    const todays = QuestSystem.getTodaysQuests();
    const readyCount = todays.filter(q => q.completed && !q.claimed).length;
    if (readyCount > 0) {
      badge.textContent = String(readyCount);
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }


  function _startResourceTicker() {
    setInterval(_updateHUD, 15000);
  }

  // ─── COLLECTION ───────────────────────────────────────────────────────────────

  function renderSpecimens() {
    const el = document.getElementById('screen-specimens');
    if (!el) return;
    const player = GameState.getPlayer();
    const state  = GameState.get();

    el.innerHTML = `
      <div class="screen-header">
        <h2>Spécimens <span class="badge">${player.collection.length}</span></h2>
      </div>
      <div class="screen-controls">
        ${_renderSortSelect('col-sort', _collectionSort)}
      </div>
      ${_renderCharFilterBar('col', _collectionFilters, state)}
      <div class="card-grid" id="collection-grid"></div>
    `;

    _refreshCollectionGrid();

    document.getElementById('col-sort')?.addEventListener('change', e => {
      _collectionSort = e.target.value;
      _refreshCollectionGrid();
    });
    _bindCharFilterBar('col', _collectionFilters, _refreshCollectionGrid);
  }

  function _refreshCollectionGrid() {
    const state  = GameState.get();
    const player = GameState.getPlayer();
    _renderSpecimensGrid(_decorateFilterSortChars(player.collection, _collectionSort, _collectionFilters, state));
  }

  function _renderSpecimensGrid(decorated) {
    const grid = document.getElementById('collection-grid');
    if (!grid) return;

    if (decorated.length === 0) {
      const hasAny = GameState.getPlayer().collection.length > 0;
      grid.innerHTML = `<p class="empty-msg">${hasAny ? 'Aucun créature ne correspond aux filtres.' : 'Aucun créature dans la collection.'}</p>`;
      return;
    }

    const state = GameState.get();
    const types = state.types;
    grid.innerHTML = decorated.map(({ inst, def, stats }) => {
      const t1 = types.find(t => t.id === def.type1);
      const t2 = def.type2 ? types.find(t => t.id === def.type2) : null;
      const equipBonus = GameDatabase.computeEquipBonus(inst.equipment, state.player.equipInventory, state.equipment);
      return _buildCharCard(def, inst, stats, t1, t2, { equipBonus });
    }).join('');

    grid.querySelectorAll('.char-card').forEach(card => {
      card.addEventListener('click', () => _openCharDetail(card.dataset.instanceId));
      _bindDoubleTap(card, () => _quickToggleTeam(card.dataset.instanceId));
    });
  }

  /**
   * Détecte un double-tap (ou double-clic souris) sur un élément, sans
   * dépendre de l'événement 'dblclick' natif qui est peu fiable au tactile
   * (délai et tolérance différents selon les navigateurs mobiles).
   * @param {HTMLElement} el
   * @param {Function} callback
   */
  function _bindDoubleTap(el, callback) {
    const DOUBLE_TAP_DELAY = 320; // ms
    let lastTap = 0;
    el.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTap < DOUBLE_TAP_DELAY) {
        e.preventDefault(); // empêche le tap simple ('click') de se déclencher en plus
        callback();
      }
      lastTap = now;
    });
    // Repli souris (desktop / tests) : double-clic natif
    el.addEventListener('dblclick', (e) => {
      e.preventDefault();
      callback();
    });
  }

  /** Ajoute/retire rapidement une créature de l'équipe depuis la Collection (raccourci double-tap) */
  function _quickToggleTeam(instanceId) {
    const cfg = GameState.getConfig();
    const currentTeam = GameState.getPlayer().team.filter(Boolean);
    if (navigator.vibrate) navigator.vibrate(15); // retour haptique léger si disponible (Android)
    if (currentTeam.includes(instanceId)) {
      GameState.setTeam(currentTeam.filter(id => id !== instanceId));
      _showToast('➖ Retiré(e) de l\'équipe');
    } else if (currentTeam.length < cfg.game.maxTeamSize) {
      GameState.setTeam([...currentTeam, instanceId]);
      _showToast('➕ Ajouté(e) à l\'équipe');
    } else {
      _showToast(`Équipe pleine ! (max ${cfg.game.maxTeamSize})`);
    }
  }

  function _buildCharCard(def, inst, stats, t1, t2, opts = {}) {
    const rarityDef = GameDatabase.RARITIES[def.rarity] || {};
    const maxAwk    = GameState.getConfig().awakening.maxLevel;
    const awakStars = '★'.repeat(inst.awakening || 0) + '☆'.repeat(Math.max(0, maxAwk - (inst.awakening || 0)));
    const xpNeeded  = GameDatabase.xpForLevel(inst.level + 1, GameState.getConfig().level);
    const xpPct     = Math.min(100, Math.round((inst.xp / xpNeeded) * 100));
    const inTeamClass = opts.inTeam ? 'in-team' : '';
    const awkMaxClass = (inst.awakening || 0) >= maxAwk ? 'awakening-max' : '';
    const eb = opts.equipBonus || { hp: 0, atk: 0, def: 0, spd: 0 };

    return `
    <div class="char-card rarity-${def.rarity} ${inTeamClass} ${awkMaxClass}" data-instance-id="${inst.instanceId}" ${opts.inTeam ? 'style="opacity:.6"' : ''}>
      <div class="card-portrait" style="position:relative;overflow:hidden;">
        ${_portraitImgHtml(def)}
        <div class="card-rarity-badge" style="background:${rarityDef.color || '#888'}">${rarityDef.name || def.rarity}</div>
        ${opts.inTeam ? '<div class="in-team-badge">ÉQUIPE</div>' : ''}
      </div>
      <div class="card-info">
        <div class="card-name">${def.name}</div>
        <div class="card-level">Niv. <strong>${inst.level}</strong></div>
        <div class="card-types">
          ${t1 ? `<span class="type-badge" style="background:${t1.color}">${t1.icon} ${t1.name}</span>` : ''}
          ${t2 ? `<span class="type-badge" style="background:${t2.color}">${t2.icon} ${t2.name}</span>` : ''}
        </div>
        <div class="card-awakening">${awakStars}</div>
        <div class="xp-bar" title="XP ${inst.xp} / ${xpNeeded}">
          <div class="xp-bar-fill" style="width:${xpPct}%"></div>
        </div>
        <div class="card-stats-mini">
          <span title="PV">♥ ${_formatStatWithBonus(stats.hp + eb.hp, eb.hp)}</span>
          <span title="ATK">⚔ ${_formatStatWithBonus(stats.atk + eb.atk, eb.atk)}</span>
          <span title="DEF">🛡 ${_formatStatWithBonus(stats.def + eb.def, eb.def)}</span>
          <span title="VIT">💨 ${_formatStatWithBonus(stats.spd + eb.spd, eb.spd)}</span>
        </div>
      </div>
    </div>`;
  }

  // ─── DÉTAIL PERSONNAGE ────────────────────────────────────────────────────────

  function _openCharDetail(instanceId) {
    const inst  = GameState.getPlayerChar(instanceId);
    if (!inst) return;
    _openDetailInstanceId = instanceId;   // mémoriser pour rafraîchissement live
    const def   = GameState.getCharDef(inst.charId);
    const state = GameState.get();
    const stats = GameDatabase.computeStats(def, inst.level, inst.awakening || 0,
      state.config.awakening, def.rarity, state.config.level);
    const eqBonus = GameDatabase.computeEquipBonus(inst.equipment, state.player.equipInventory, state.equipment);

    const modal = document.getElementById('modal');
    if (!modal) return;

    const rarityDef = GameDatabase.RARITIES[def.rarity] || {};
    const types     = GameState.getTypes();
    const t1 = types.find(t => t.id === def.type1);
    const t2 = def.type2 ? types.find(t => t.id === def.type2) : null;
    const xpNeeded = GameDatabase.xpForLevel(inst.level + 1, state.config.level);

    modal.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop">
        <div class="modal-box">
          <button class="modal-close" id="modal-close">✕</button>
          <div class="detail-layout">
            <div class="detail-portrait ${(inst.awakening || 0) >= state.config.awakening.maxLevel ? 'awakening-max' : ''}" style="position:relative;overflow:hidden;">
              ${_detailPortraitImgHtml(def)}
              <div class="detail-rarity" style="background:${rarityDef.color}">${rarityDef.name}</div>
            </div>
            <div class="detail-info">
              <h3>${def.name}</h3>
              <p class="detail-desc">${def.description}</p>
              <div class="detail-types">
                ${t1 ? `<span class="type-badge" style="background:${t1.color}">${t1.icon} ${t1.name}</span>` : ''}
                ${t2 ? `<span class="type-badge" style="background:${t2.color}">${t2.icon} ${t2.name}</span>` : ''}
              </div>
              ${_buildTagsHtml(def, state)}
              ${_buildPassivesHtml(def, state)}
              ${_buildTypeAffinitiesHtml(def, state)}
              <div class="detail-level">Niveau <strong>${inst.level}</strong> — XP : ${inst.xp} / ${xpNeeded}</div>
              <div class="detail-awakening">Évolution Avancée : ${'★'.repeat(inst.awakening || 0)}</div>
              <div class="stat-grid">
                <div class="stat-row"><span>♥ PV</span><strong>${_formatStatWithBonus(stats.hp + eqBonus.hp, eqBonus.hp)}</strong></div>
                <div class="stat-row"><span>⚔ ATK</span><strong>${_formatStatWithBonus(stats.atk + eqBonus.atk, eqBonus.atk)}</strong></div>
                <div class="stat-row"><span>🛡 DEF</span><strong>${_formatStatWithBonus(stats.def + eqBonus.def, eqBonus.def)}</strong></div>
                <div class="stat-row"><span>💨 VIT</span><strong>${_formatStatWithBonus(stats.spd + eqBonus.spd, eqBonus.spd)}</strong></div>
              </div>
              <div class="detail-equip">
                <h4>Équipements</h4>
                <div class="equip-slots">
                  ${EQUIP_SLOT_ORDER.map((slotKey, slot) => {
                    const invId = inst.equipment[slot];
                    const invEntry = invId ? state.player.equipInventory.find(ei => ei.instanceId === invId) : null;
                    const eq = invEntry ? state.equipment.find(e => e.id === invEntry.equipId) : null;
                    return `<div class="equip-slot" data-slot="${slot}" data-instance="${instanceId}">
                      ${eq ? `<strong>${eq.name}</strong><br><small>${_formatEquipBonuses(eq.bonuses)}</small>` : `<span class="empty-slot">Vide</span>`}
                    </div>`;
                  }).join('')}
                </div>
              </div>
              ${def.evolvesTo ? `<div class="detail-evo">Évolue en <strong>${GameState.getCharDef(def.evolvesTo)?.name || '?'}</strong> au niveau <strong>${def.evolutionCondition?.value || '?'}</strong></div>` : ''}
            </div>
          </div>
        </div>
      </div>`;

    modal.style.display = 'block';
    document.getElementById('modal-close')?.addEventListener('click', _closeModal);
    document.getElementById('modal-backdrop')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) _closeModal();
    });
  }

  /**
   * Construit le HTML des passifs hérités par un créature, d'après son type1
   * et type2. Gère le cas spécial Cryptide (passif tiré au hasard, affiché
   * comme "inconnu jusqu'au combat" puisqu'il n'est résolu qu'en combat).
   * @param {object} def - définition du créature (type1, type2)
   * @param {object} state
   * @returns {string} HTML
   */
  /** Génère les pills de tags pour la fiche personnage */
  function _buildTagsHtml(def, state) {
    const lineTags = GameState.getLineTags(def.evolutionLine || def.id) || [];
    if (!lineTags.length) return '';
    const cats = state.tagCategories || [];
    const pills = lineTags.map(tagId => {
      let label = tagId;
      cats.forEach(cat => { const t = cat.tags.find(t => t.id === tagId); if (t) label = t.label; });
      return `<span style="display:inline-block;background:rgba(74,222,128,.12);border:1px solid #4ade80;color:#4ade80;border-radius:999px;padding:2px 8px;font-size:.68rem;">${label}</span>`;
    }).join('');
    return `<div style="display:flex;flex-wrap:wrap;gap:4px;margin:6px 0;">🏷️ ${pills}</div>`;
  }

  function _buildPassivesHtml(def, state) {
    const passivesCfg = state.config.passives || GameDatabase.DEFAULT_PASSIVES;
    const typeIds = [def.type1, def.type2].filter(Boolean);
    if (typeIds.length === 0) return '';

    const cards = typeIds.map((typeId) => {
      const p = passivesCfg[typeId];
      if (!p) return '';

      if (typeId === 'Cryptide') {
        return `<div class="passive-card passive-card-cryptide">
          <div class="passive-card-header"><span class="passive-icon">${p.icon}</span><strong>${p.name}</strong></div>
          <div class="passive-card-desc">${p.description} <em>Le passif réellement actif est révélé au début de chaque combat.</em></div>
        </div>`;
      }

      const chancePct = Math.round((p.chance ?? 0) * 100);
      const triggerLabel = p.trigger === 'passive' ? 'Toujours actif' : `${chancePct}% de chance — ${PASSIVE_TRIGGER_LABELS_UI[p.trigger] || p.trigger}`;
      return `<div class="passive-card">
        <div class="passive-card-header"><span class="passive-icon">${p.icon}</span><strong>${p.name}</strong></div>
        <div class="passive-card-desc">${p.description}</div>
        <div class="passive-card-trigger">${triggerLabel}</div>
      </div>`;
    }).join('');

    return `<div class="detail-passives"><h4>Passifs</h4><div class="passive-card-list">${cards}</div></div>`;
  }

  /**
   * Construit le tableau des affinités de types pour un créature donné.
   * Affiche :
   *  - Dégâts infligés : quels types adverses subissent x2, x0.5 des attaques de ce créature
   *  - Dégâts reçus    : quels types adverses lui infligent x2, x0.5
   * Pour les doubles types, les multiplicateurs se combinent (x4, x0.25).
   * @param {object} def   - définition du créature (type1, type2)
   * @param {object} state
   * @returns {string} HTML
   */
  function _buildTypeAffinitiesHtml(def, state) {
    const matrix = state.typeMatrix || GameDatabase.DEFAULT_TYPE_MATRIX;
    const allTypes = state.types || GameDatabase.DEFAULT_TYPES;

    const attackTypes = [def.type1, def.type2].filter(Boolean);

    // dealtBuckets  : types ennemis touchés → { typeObj } (on déduplique par id)
    // receivedBuckets : types attaquants ennemis → typeObj
    const dealtBuckets    = { 2: new Map(), 0.5: new Map() };
    const receivedBuckets = { 4: [], 2: [], 0.5: [], 0.25: [] };

    allTypes.forEach(atkType => {
      // Dégâts infligés : chaque type d'attaque de CE créature sur atkType défenseur mono-type
      attackTypes.forEach(myAtkType => {
        const mult = GameDatabase.getTypeEffectiveness(myAtkType, atkType.id, null, matrix);
        if (mult === 2 && !dealtBuckets[2].has(atkType.id))   dealtBuckets[2].set(atkType.id, atkType);
        if (mult === 0.5 && !dealtBuckets[0.5].has(atkType.id)) dealtBuckets[0.5].set(atkType.id, atkType);
      });

      // Dégâts reçus : atkType attaque CE créature (défenseur bi-type)
      const multRec = GameDatabase.getTypeEffectiveness(atkType.id, def.type1, def.type2 || null, matrix);
      if      (multRec === 4)    receivedBuckets[4].push(atkType);
      else if (multRec === 2)    receivedBuckets[2].push(atkType);
      else if (multRec === 0.5)  receivedBuckets[0.5].push(atkType);
      else if (multRec === 0.25) receivedBuckets[0.25].push(atkType);
    });

    function _typePill(typeDef) {
      if (!typeDef) return '';
      return `<span class="affinity-pill" style="background:${typeDef.color}" title="${typeDef.name}">${typeDef.icon} ${typeDef.name}</span>`;
    }

    function _bucketRow(label, colorCls, types) {
      if (!types || types.length === 0) return '';
      return `<div class="affinity-row ${colorCls}">
        <span class="affinity-mult">${label}</span>
        <div class="affinity-pills">${types.map(t => _typePill(t)).join('')}</div>
      </div>`;
    }

    const dealtHtml = [
      _bucketRow('×2',   'aff-super',  [...dealtBuckets[2].values()]),
      _bucketRow('×0.5', 'aff-resist', [...dealtBuckets[0.5].values()]),
    ].filter(Boolean).join('');

    const receivedHtml = [
      _bucketRow('×4',    'aff-ultra',  receivedBuckets[4]),
      _bucketRow('×2',    'aff-super',  receivedBuckets[2]),
      _bucketRow('×0.5',  'aff-resist', receivedBuckets[0.5]),
      _bucketRow('×0.25', 'aff-immune', receivedBuckets[0.25]),
    ].filter(Boolean).join('');

    if (!dealtHtml && !receivedHtml) return '';

    return `<div class="detail-affinities">
      <h4>Affinités de types</h4>
      ${dealtHtml ? `<div class="affinity-section">
        <div class="affinity-section-label">⚔️ Dégâts infligés</div>
        <div class="affinity-table">${dealtHtml}</div>
      </div>` : ''}
      ${receivedHtml ? `<div class="affinity-section">
        <div class="affinity-section-label">🛡️ Dégâts reçus</div>
        <div class="affinity-table">${receivedHtml}</div>
      </div>` : ''}
    </div>`;
  }

  const PASSIVE_TRIGGER_LABELS_UI = {
    onAttack:      'en attaquant',
    onHit:         'en touchant',
    onDamaged:     'en subissant des dégâts',
    onTurnEnd:     'en fin de tour',
    onBattleStart: 'en début de combat',
  };

  function _formatEquipBonuses(bonuses) {
    return Object.entries(bonuses)
      .filter(([,v]) => v !== 0)
      .map(([k,v]) => `${k.toUpperCase()}+${v}`)
      .join(' ');
  }

  /**
   * Formate une valeur de stat totale avec le delta apporté par l'équipement,
   * affiché en vert (+XX) si positif ou en rouge (-WW) si négatif. Sans delta,
   * retourne simplement la valeur.
   */
  function _formatStatWithBonus(total, bonus) {
    if (!bonus) return `${total}`;
    const cls  = bonus > 0 ? 'stat-bonus-pos' : 'stat-bonus-neg';
    const sign = bonus > 0 ? '+' : '';
    return `${total} <span class="${cls}">${sign}${bonus}</span>`;
  }

  /** Décrit en quelques mots quel créature détient actuellement un exemplaire d'équipement */
  function _describeEquippedBy(equippedByInstanceId) {
    if (!equippedByInstanceId) return null;
    const holderInst = GameState.getPlayerChar(equippedByInstanceId);
    const holderDef  = holderInst ? GameState.getCharDef(holderInst.charId) : null;
    if (!holderDef) return null;
    return { name: holderDef.name, portrait: holderDef.portrait };
  }

  function _closeModal() {
    const modal = document.getElementById('modal');
    if (modal) modal.style.display = 'none';
    _openDetailInstanceId = null;   // plus de fiche ouverte
  }

  // ─── QUÊTES QUOTIDIENNES ────────────────────────────────────────────────────────

  /** Icône représentative par type de quête (cohérent avec le thème du jeu). */
  const QUEST_TYPE_ICONS = {
    capture:            '🪤',
    defeat:             '⚔️',
    pullEquip:          '🛡️',
    pullChar:           '💎',
    line:               '🧬',
    fullRandom:         '🎰',
    story:              '🗺️',
    eventInvasion:      '🎪',
    eventDefi:          '⚔️',
    completeQuest:      '📋',
    completeQuestDaily: '📅',
    completeQuestWeekly:'📆',
    completeQuestEvent: '🎉',
  };

  /** Rendu de l'écran "Quêtes" (onglet de navigation principal). */
  // Helper : compte à rebours jusqu'à une date cible
  function _questCountdown(targetDate) {
    const ms = targetDate - Date.now();
    if (ms <= 0) return 'Expiré';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}j ${h % 24}h`;
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${m}m ${s % 60}s`;
  }

  function _startQuestCountdownTimers() {
    // Met à jour tous les compteurs de l'écran quêtes toutes les secondes
    if (window._questCdTimer) clearInterval(window._questCdTimer);
    window._questCdTimer = setInterval(() => {
      document.querySelectorAll('[data-quest-timer]').forEach(el => {
        const ts = parseInt(el.dataset.questTimer, 10);
        el.textContent = _questCountdown(ts);
      });
    }, 1000);
  }

  function renderDailyQuests() {
    const el = document.getElementById('screen-quests');
    if (!el) return;

    const daily   = QuestSystem.getTodaysQuests();
    const weekly  = QuestSystem.getWeeklyQuests();
    const events  = QuestSystem.getEventQuests();
    const evt     = (typeof EventSystem !== 'undefined') ? EventSystem.getActiveOrPending() : null;

    const readyD = daily.filter(q => q.completed && !q.claimed).length;
    const readyW = weekly.filter(q => q.completed && !q.claimed).length;
    const readyE = events.filter(q => q.completed && !q.claimed).length;
    const totalReady = readyD + readyW + readyE;

    const todayEnd = (() => { const d = new Date(); d.setHours(23,59,59,999); return d.getTime(); })();
    const weekEnd  = (() => {
      const d = new Date(); const dow = d.getDay(); const diff = (7 - dow) % 7 || 7;
      d.setDate(d.getDate() + diff); d.setHours(0,0,0,0); return d.getTime();
    })();
    const evtEnd = evt?.endDate || 0;
    const showEventBlock = !!(evt || events.length > 0);

    // Résumé de progression par section
    const doneD = daily.filter(q => q.claimed).length;
    const doneW = weekly.filter(q => q.claimed).length;
    const doneE = events.filter(q => q.claimed).length;

    // Mémoriser quels blocs étaient ouverts avant le re-render
    const wasOpenD = document.getElementById('quests-details-daily')?.hasAttribute('open') ?? true;
    const wasOpenW = document.getElementById('quests-details-weekly')?.hasAttribute('open') ?? false;
    const wasOpenE = document.getElementById('quests-details-event')?.hasAttribute('open') ?? true;

    el.innerHTML = `
      <div class="screen-header"><h2>📋 Missions</h2></div>

      ${totalReady > 0 ? `
        <div class="quests-ready-banner">
          🎁 ${totalReady} récompense${totalReady > 1 ? 's' : ''} prête${totalReady > 1 ? 's' : ''} à réclamer !
        </div>` : ''}

      ${showEventBlock ? `
        <details class="quests-accordion quests-accordion-event" id="quests-details-event" ${wasOpenE ? 'open' : ''}>
          <summary class="quests-accordion-summary">
            <span class="quests-summary-left">
              <span class="quests-section-icon">🎪</span>
              <span class="quests-summary-title">${evt ? (evt.customTitle || ('Événement : ' + evt.tagLabel)) : 'Quêtes d’Événement'}</span>
              ${readyE > 0 ? '<span class="quests-ready-badge">' + readyE + '</span>' : ''}
            </span>
            <span class="quests-summary-right">
              <span class="quests-summary-progress">${doneE}/${events.length}</span>
              ${evt ? '<span class="quests-section-timer" data-quest-timer="' + evtEnd + '">' + _questCountdown(evtEnd) + '</span>' : ''}
              <span class="quests-chevron">▾</span>
            </span>
          </summary>
          <div class="quests-accordion-body">
            ${events.length
              ? '<div class="quests-screen-list" id="quests-event-list"></div>'
              : '<p class="quests-empty">Aucune quête d’événement active.</p>'}
          </div>
        </details>` : ''}

      <details class="quests-accordion" id="quests-details-daily" ${wasOpenD ? 'open' : ''}>
        <summary class="quests-accordion-summary">
          <span class="quests-summary-left">
            <span class="quests-section-icon">📅</span>
            <span class="quests-summary-title">Quotidiennes</span>
            ${readyD > 0 ? '<span class="quests-ready-badge">' + readyD + '</span>' : ''}
          </span>
          <span class="quests-summary-right">
            <span class="quests-summary-progress">${doneD}/${daily.length}</span>
            <span class="quests-section-timer" data-quest-timer="${todayEnd}">${_questCountdown(todayEnd)}</span>
            <span class="quests-chevron">▾</span>
          </span>
        </summary>
        <div class="quests-accordion-body">
          <div class="quests-screen-list" id="quests-daily-list"></div>
        </div>
      </details>

      <details class="quests-accordion" id="quests-details-weekly" ${wasOpenW ? 'open' : ''}>
        <summary class="quests-accordion-summary">
          <span class="quests-summary-left">
            <span class="quests-section-icon">📆</span>
            <span class="quests-summary-title">Hebdomadaires</span>
            ${readyW > 0 ? '<span class="quests-ready-badge">' + readyW + '</span>' : ''}
          </span>
          <span class="quests-summary-right">
            <span class="quests-summary-progress">${doneW}/${weekly.length}</span>
            <span class="quests-section-timer" data-quest-timer="${weekEnd}">${_questCountdown(weekEnd)}</span>
            <span class="quests-chevron">▾</span>
          </span>
        </summary>
        <div class="quests-accordion-body">
          <div class="quests-screen-list" id="quests-weekly-list"></div>
        </div>
      </details>
    `;

    _renderQuestList('daily-list',  daily,  _claimDailyQuest);
    _renderQuestList('weekly-list', weekly, _claimWeeklyQuest);
    if (events.length) _renderQuestList('event-list', events, _claimEventQuest);

    _startQuestCountdownTimers();
  }

    /** (Re)génère uniquement la liste de missions à l'intérieur de l'écran déjà affiché. */
  function _renderDailyQuestsList() {
    const quests = QuestSystem.getTodaysQuests();
    _renderQuestList('daily-list', quests, _claimDailyQuest);
  }

  function _renderQuestList(listId, quests, claimFn) {
    const listEl = document.getElementById('quests-' + listId);
    if (!listEl) return;
    if (!quests.length) {
      listEl.innerHTML = '<p class="quests-empty">Aucune quête active.</p>';
      return;
    }
    const isEventList = listId === 'event-list';
    listEl.innerHTML = quests.map(q => {
      const pct   = Math.min(100, Math.round((q.current / q.target) * 100));
      const icon  = QUEST_TYPE_ICONS[q.def.type] || '📋';
      const state = q.claimed ? 'claimed' : q.completed ? 'ready' : 'active';
      const pinnedBadge = q.isPinned
        ? '<span class="quest-pinned-badge">BONUS</span>'
        : '';
      const evtClass = isEventList ? ' quest-card-event' : '';

      return `
        <div class="quest-card quest-card-${state}${evtClass}">
          <div class="quest-card-left">
            <div class="quest-card-icon-wrap quest-icon-${state}">${icon}</div>
          </div>
          <div class="quest-card-body">
            <div class="quest-card-label">${GameUtils.escapeHtml(q.def.label)}${pinnedBadge}</div>
            <div class="quest-card-progress-row">
              <div class="quest-card-progressbar">
                <div class="quest-card-progressfill quest-fill-${state}" style="width:${pct}%"></div>
              </div>
              <span class="quest-card-pct">${pct}%</span>
            </div>
            <div class="quest-card-progresstext">${q.current} / ${q.target}</div>
            <div class="quest-card-reward">
              <span class="quest-card-reward-label">🎁</span>
              ${_formatQuestRewardLine(q.def.reward)}
            </div>
          </div>
          <button class="quest-claim-btn quest-claim-${state}" data-quest-id="${q.def.id}"
            ${!q.completed || q.claimed ? 'disabled' : ''}>
            ${q.claimed ? '✓' : q.completed ? 'Réclamer' : '🔒'}
          </button>
        </div>`;
    }).join('');
    listEl.querySelectorAll('.quest-claim-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => claimFn(btn.dataset.questId));
    });
  }

    function _formatQuestRewardLine(reward) {
    const parts = [];
    if (reward.crystals) parts.push(`<span class="quest-reward-chip">+${reward.crystals} 💎</span>`);
    if (reward.gold) parts.push(`<span class="quest-reward-chip">+${reward.gold} 🪙</span>`);
    if (reward.items) {
      const itemDefs = GameState.getItemDefs();
      Object.entries(reward.items).forEach(([itemId, qty]) => {
        if (!qty) return;
        const def = itemDefs.find(i => i.id === itemId);
        parts.push(`<span class="quest-reward-chip">+${qty} ${def?.icon || ''} ${def?.name || itemId}</span>`.trim());
      });
    }
    if (reward.equipment) {
      const equipId = Array.isArray(reward.equipment) ? reward.equipment[0] : reward.equipment;
      if (equipId) {
        const def = GameState.get().equipment?.find(e => e.id === equipId);
        parts.push(`<span class="quest-reward-chip">⚙️ ${def?.name || equipId}</span>`);
      }
    }
    if (reward.characters) {
      const charId = Array.isArray(reward.characters) ? reward.characters[0] : reward.characters;
      if (charId) {
        const def = GameState.getCharDef(charId);
        parts.push(`<span class="quest-reward-chip">🐾 ${def?.name || charId}</span>`);
      }
    }
    return parts.join('') || '<span class="quest-reward-chip">—</span>';
  }

  function _claimDailyQuest(questId) {
    const res = QuestSystem.claimQuestReward(questId);
    if (!res.success) return;
    _updateHUD();
    _renderQuestList('daily-list', QuestSystem.getTodaysQuests(), _claimDailyQuest);
    _showToast('🎁 Récompense de quête reçue !', 'success');
  }

  function _claimWeeklyQuest(questId) {
    const res = QuestSystem.claimWeeklyQuestReward(questId);
    if (!res.success) return;
    _updateHUD();
    _renderQuestList('weekly-list', QuestSystem.getWeeklyQuests(), _claimWeeklyQuest);
    _showToast('🎁 Récompense hebdomadaire reçue !', 'success');
  }

  function _claimEventQuest(questId) {
    const res = QuestSystem.claimEventQuestReward(questId);
    if (!res.success) return;
    _updateHUD();
    _renderQuestList('event-list', QuestSystem.getEventQuests(), _claimEventQuest);
    _showToast('🎁 Récompense d\'événement reçue !', 'success');
  }

  // ─── ÉQUIPE ───────────────────────────────────────────────────────────────────

  function renderTeam() {
    const el = document.getElementById('screen-team');
    if (!el) return;
    const player = GameState.getPlayer();
    const cfg    = GameState.getConfig();
    const state  = GameState.get();
    const types  = state.types;

    el.innerHTML = `
      <div class="screen-header"><h2>Mon Équipe <small>(${GameState.getTeam().length}/${cfg.game.maxTeamSize})</small></h2></div>
      <div class="team-slots" id="team-slots">
        ${Array.from({length: cfg.game.maxTeamSize}, (_, i) => {
          const member = player.team[i] ? player.collection.find(c => c.instanceId === player.team[i]) : null;
          const def    = member ? GameState.getCharDef(member.charId) : null;
          const stats  = (member && def) ? GameDatabase.computeStats(def, member.level, member.awakening || 0,
            state.config.awakening, def.rarity, state.config.level) : null;
          const eb = member ? GameDatabase.computeEquipBonus(member.equipment, player.equipInventory, state.equipment) : null;
          const t1 = def ? types.find(t => t.id === def.type1) : null;
          const t2 = def?.type2 ? types.find(t => t.id === def.type2) : null;
          const isAwkMax = member ? (member.awakening || 0) >= state.config.awakening.maxLevel : false;
          return `
          <div class="team-slot ${member ? 'filled' : 'empty'}" data-slot="${i}">
            ${member && def ? `
              <div class="team-member-card ${isAwkMax ? 'awakening-max' : ''}" data-instance-id="${member.instanceId}">
                <div class="team-portrait" style="position:relative;overflow:hidden;">
                  ${_portraitImgHtml(def)}
                </div>
                <div class="team-info">
                  <div class="team-name">${def.name}</div>
                  <div class="team-level">Niv. ${member.level}</div>
                  <div class="team-types">
                    ${t1 ? `<span class="type-badge" style="background:${t1.color}">${t1.icon} ${t1.name}</span>` : ''}
                    ${t2 ? `<span class="type-badge" style="background:${t2.color}">${t2.icon} ${t2.name}</span>` : ''}
                  </div>
                  <div class="team-stats-mini">
                    <span title="PV">♥ ${_formatStatWithBonus(stats.hp + eb.hp, eb.hp)}</span>
                    <span title="ATK">⚔ ${_formatStatWithBonus(stats.atk + eb.atk, eb.atk)}</span>
                    <span title="DEF">🛡 ${_formatStatWithBonus(stats.def + eb.def, eb.def)}</span>
                    <span title="VIT">💨 ${_formatStatWithBonus(stats.spd + eb.spd, eb.spd)}</span>
                  </div>
                </div>
                <button class="btn-remove-team" data-instance-id="${member.instanceId}">✕</button>
              </div>` :
              `<div class="empty-slot-label">+ Ajouter</div>`}
          </div>`;
        }).join('')}
      </div>
      <div class="screen-header" style="margin-top:2rem">
        <h2>Spécimens</h2>
      </div>
      <div class="screen-controls">
        ${_renderSortSelect('team-sort', _teamSort)}
      </div>
      ${_renderCharFilterBar('team', _teamFilters, state, true)}
      ${_teamFilters.tag ? (() => {
        // Retrouver le label du tag actif pour l'afficher dans le bandeau
        const allCats = state.tagCategories || [];
        let tagLabel = _teamFilters.tag;
        allCats.forEach(cat => {
          const found = cat.tags.find(t => t.id === _teamFilters.tag);
          if (found) tagLabel = found.label;
        });
        return '<div class="team-tag-active-banner">'
          + '<span>🏷️ Filtre actif : <strong>' + tagLabel + '</strong></span>'
          + '<button id="btn-clear-tag-filter">✕ Effacer</button>'
          + '</div>';
      })() : ''}
      <div class="card-grid" id="team-collection-grid"></div>
    `;

    _refreshTeamCollectionGrid();

    document.getElementById('team-sort')?.addEventListener('change', e => {
      _teamSort = e.target.value;
      _refreshTeamCollectionGrid();
    });
    _bindCharFilterBar('team', _teamFilters, _refreshTeamCollectionGrid);
    // Bouton effacement rapide du filtre tag
    document.getElementById('btn-clear-tag-filter')?.addEventListener('click', () => {
      _teamFilters.tag = '';
      renderTeam(); // re-render complet pour mettre à jour le select et le bandeau
    });

    // Boutons retrait de l'équipe
    el.querySelectorAll('.btn-remove-team').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const iid = btn.dataset.instanceId;
        GameState.setTeam(GameState.getPlayer().team.filter(id => id !== iid));
      });
    });
  }

  /** Rafraîchit la grille de sélection de créatures dans l'écran Équipe (triée + filtrée) */
  function _refreshTeamCollectionGrid() {
    const state  = GameState.get();
    const player = GameState.getPlayer();
    const cfg    = state.config;
    const grid   = document.getElementById('team-collection-grid');
    if (!grid) return;

    const inTeam = new Set(player.team.filter(Boolean));
    const types  = state.types;
    const decorated = _decorateFilterSortChars(player.collection, _teamSort, _teamFilters, state);

    if (decorated.length === 0) {
      const hasAny = player.collection.length > 0;
      grid.innerHTML = `<p class="empty-msg">${hasAny ? 'Aucun créature ne correspond aux filtres.' : 'Aucun créature dans la collection.'}</p>`;
      return;
    }

    grid.innerHTML = decorated.map(({ inst, def, stats }) => {
      const t1 = types.find(t => t.id === def.type1);
      const t2 = def.type2 ? types.find(t => t.id === def.type2) : null;
      const equipBonus = GameDatabase.computeEquipBonus(inst.equipment, player.equipInventory, state.equipment);
      return _buildCharCard(def, inst, stats, t1, t2, { inTeam: inTeam.has(inst.instanceId), equipBonus });
    }).join('');

    grid.querySelectorAll('.char-card').forEach(card => {
      card.addEventListener('click', () => {
        const iid = card.dataset.instanceId;
        const currentTeam = GameState.getPlayer().team.filter(Boolean);
        if (inTeam.has(iid)) {
          GameState.setTeam(currentTeam.filter(id => id !== iid));
        } else if (currentTeam.length < cfg.game.maxTeamSize) {
          GameState.setTeam([...currentTeam, iid]);
        } else {
          _showToast(`Équipe pleine ! (max ${cfg.game.maxTeamSize})`);
        }
      });
    });
  }

  // ─── COMBAT ───────────────────────────────────────────────────────────────────

  function renderCombatLobby() {
    const el = document.getElementById('screen-combat');
    if (!el) return;
    const team  = GameState.getTeam();
    const costs = GameState.getConfig().energy.costs || {};
    const evt   = (typeof EventSystem !== 'undefined') ? EventSystem.getActiveOrPending() : null;

    const evtInvActive  = _combatMode === 'eventInvasion' ? 'active' : '';
    const evtDefiActive = _combatMode === 'eventDefi'     ? 'active' : '';
    const evtInvCost    = evt?.invasionConfig?.energyCost ?? 15;
    const evtDefiCost   = evt?.defiConfig?.energyCost     ?? 20;
    const eventButtons  = evt ? `
      <button class="combat-mode-btn combat-event-btn ${evtInvActive}" data-mode="eventInvasion">
        <span class="combat-event-btn-inner">
          🎪 Invasion<br><span class="combat-event-tag">${evt.tagLabel}</span>
        </span>
        <span class="energy-cost-badge evt-badge">⚡${evtInvCost}</span>
      </button>
      <button class="combat-mode-btn combat-event-btn ${evtDefiActive}" data-mode="eventDefi">
        <span class="combat-event-btn-inner">
          ⚔️ Défi<br><span class="combat-event-tag">${evt.tagLabel}</span>
        </span>
        <span class="energy-cost-badge evt-badge">⚡${evtDefiCost}</span>
      </button>` : '';

    el.innerHTML = `
      <div class="screen-header"><h2>⚔ Combat</h2></div>
      ${evt ? `<div style="background:linear-gradient(90deg,#14532d,#1a3a2a);border:1px solid #4ade80;border-radius:var(--radius);padding:8px 14px;margin-bottom:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-size:1.1rem;">🎪</span>
        <strong style="color:#4ade80;">${evt.customTitle || `Événement : ${evt.tagLabel}`}</strong>
        <span style="font-size:.75rem;color:#86efac;margin-left:auto;" id="combat-evt-countdown">Fin dans : ${GameUtils.formatCountdown(evt.endDate - Date.now())}</span>
      </div>` : ''}
      <div class="combat-mode-tabs">
        <button class="combat-mode-btn ${_combatMode === 'story' ? 'active' : ''}" data-mode="story">
          ⚔️ Exploration <span class="energy-cost-badge">⚡${costs.story ?? 10}</span>
        </button>
        <button class="combat-mode-btn ${_combatMode === 'line' ? 'active' : ''}" data-mode="line">
          🔭 Par espèce <span class="energy-cost-badge">⚡${costs.line ?? 20}</span>
        </button>
        <button class="combat-mode-btn ${_combatMode === 'fullRandom' ? 'active' : ''}" data-mode="fullRandom">
          🎰 Full Aléatoire <span class="energy-cost-badge">⚡${costs.fullRandom ?? 10}</span>
        </button>
        <button class="combat-mode-btn ${_combatMode === 'arena' ? 'active' : ''}" data-mode="arena">
          🏛️ Arène <span class="energy-cost-badge">⚡${costs.arena ?? 15}</span>
        </button>
        ${eventButtons}
      </div>
      <div class="combat-lobby">
        <div id="combat-mode-content-top"></div>
        <div class="team-preview">
          <h3>Votre équipe</h3>
          ${_combatMode === 'fullRandom' ? `<p class="combat-mode-note">🎰 Une équipe sera tirée au sort dans votre collection pour ce combat. Votre équipe actuelle sera restaurée juste après.</p>` : ''}
          ${_combatMode === 'eventDefi' && evt ? `<p class="combat-mode-note" style="color:#facc15;">⚔️ Défi ${evt.tagLabel} : tous vos combattants doivent posséder le tag <strong>${evt.tagLabel}</strong> !</p>` : ''}
          <div class="lobby-team">
            ${team.length === 0
              ? '<p class="empty-msg">Composez votre équipe dans l\'onglet Équipe.</p>'
              : team.map(inst => {
                  const def = GameState.getCharDef(inst.charId);
                  const state = GameState.get();
                  const stats = GameDatabase.computeStats(def, inst.level, inst.awakening||0,
                    state.config.awakening, def.rarity, state.config.level);
                  return `<div class="lobby-member">
                    <div class="lobby-portrait" style="position:relative;overflow:hidden;">${_portraitImgHtml(def)}</div>
                    <div><strong>${def.name}</strong> Niv.${inst.level}</div>
                    <div style="font-size:0.75rem;color:#aaa">♥${stats.hp} ⚔${stats.atk} 🛡${stats.def} 💨${stats.spd}</div>
                  </div>`;
                }).join('')}
          </div>
        </div>
        <div id="combat-mode-content"></div>
      </div>
      <div id="battle-area" style="display:none"></div>
    `;

    el.querySelectorAll('.combat-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (_combatMode === btn.dataset.mode) return;
        _combatMode = btn.dataset.mode;
        _selectedLine = null;
        _selectedArenaType = null;
        renderCombatLobby();
      });
    });

    if (evt) {
      const cdEl = document.getElementById('combat-evt-countdown');
      if (cdEl) {
        setInterval(() => {
          cdEl.textContent = `Fin dans : ${GameUtils.formatCountdown(evt.endDate - Date.now())}`;
        }, 1000);
      }
    }

    _renderCombatModeContent();
  }

  /** Affiche le contenu adapté au mode de combat sélectionné */
  function _renderCombatModeContent() {
    if (_combatMode === 'line') { renderCombatByLine(); return; }
    if (_combatMode === 'arena') { renderCombatArena(); return; }
    if (_combatMode === 'story') { renderCombatStory(); return; }
    if (_combatMode === 'eventInvasion' || _combatMode === 'eventDefi') {
      _renderEventCombatContent(_combatMode);
      return;
    }

    const top     = document.getElementById('combat-mode-content-top');
    const content = document.getElementById('combat-mode-content');
    if (!top) return;

    // mode === 'fullRandom'
    const player = GameState.getPlayer();
    top.innerHTML = player.collection.length > 0
      ? `<button class="btn-primary btn-launch-combat" id="btn-launch" style="width:100%;margin-bottom:8px">🎰 Lancer le Combat Full Aléatoire</button>`
      : '<p class="empty-msg">Aucune créature débloquée pour composer une équipe.</p>';
    if (content) content.innerHTML = '';
    document.getElementById('btn-launch')?.addEventListener('click', () => _launchCombat({ mode: 'fullRandom' }));
  }

  function _renderEventCombatContent(mode) {
    const top     = document.getElementById('combat-mode-content-top');
    const content = document.getElementById('combat-mode-content');
    if (!top) return;

    const evt = (typeof EventSystem !== 'undefined') ? EventSystem.getActiveOrPending() : null;
    if (!evt) {
      top.innerHTML = '<p class="empty-msg">Aucun événement actif en ce moment.</p>';
      if (content) content.innerHTML = '';
      return;
    }

    const isDefi     = mode === 'eventDefi';
    const tagChars   = EventSystem.getBaseCharsForTag(evt.tagId);
    const energyCost = isDefi ? (evt.defiConfig?.energyCost ?? 20) : (evt.invasionConfig?.energyCost ?? 15);

    // Compteur rareté depuis la DATABASE (formes de base du tag), pas la collection joueur
    const RARITIES = ['common','uncommon','rare','epic','legendary','mythic'];
    const RLABELS  = { common:'Commune',uncommon:'Peu Commune',rare:'Rare',epic:'Épique',legendary:'Légendaire',mythic:'Mythique' };
    const RCOLORS  = { common:'#9ca3af',uncommon:'#6fcc6f',rare:'#60a5fa',epic:'#c084fc',legendary:'#fbbf24',mythic:'#f87171' };
    const RGRAD    = { common:'#374151,#4b5563',uncommon:'#14532d,#166534',rare:'#1e3a5f,#1d4ed8',epic:'#3b0764,#6b21a8',legendary:'#451a03,#92400e',mythic:'#4c0519,#9f1239' };
    const dbCounts = {};
    RARITIES.forEach(r => { dbCounts[r] = 0; });
    tagChars.forEach(c => { if (c.rarity && dbCounts[c.rarity] !== undefined) dbCounts[c.rarity]++; });

    // Bouton mis en valeur avec gradient event
    const evtTitle    = isDefi ? ('Défi ' + evt.tagLabel) : ('Invasion ' + evt.tagLabel);
    const evtSubtitle = isDefi
      ? ('Votre équipe entière doit être <strong>' + evt.tagLabel + '</strong> — ennemis aussi')
      : ('Affrontez des créatures <strong>' + evt.tagLabel + '</strong> — équipe libre');
    const evtIcon     = isDefi ? '⚔️' : '🎪';
    const evtBtnLabel = isDefi ? '⚔️ Lancer le Défi' : "🎪 Lancer l'Invasion";

    top.innerHTML = `
      <div style="background:linear-gradient(135deg,#0f3320,#1a2a14);border:2px solid #4ade80;border-radius:var(--radius-lg);padding:14px 16px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
          <span style="font-size:1.3rem;">${evtIcon}</span>
          <div>
            <div style="font-family:var(--font-display);font-weight:800;font-size:1rem;color:#4ade80;">${evtTitle}</div>
            <div style="font-size:.72rem;color:#86efac;margin-top:2px;">${evtSubtitle}</div>
          </div>
          <span style="margin-left:auto;background:#14532d;color:#4ade80;padding:4px 10px;border-radius:999px;font-weight:700;font-size:.8rem;">⚡${energyCost}</span>
        </div>
        <button class="btn-primary btn-launch-combat" id="btn-launch-event" style="width:100%;background:linear-gradient(135deg,#166534,#15803d);border:1px solid #4ade80;font-size:1rem;">
          ${evtBtnLabel}
        </button>
      </div>
    `;

    if (content) content.innerHTML = `
      <div style="margin-top:4px;">
        <div style="font-size:.75rem;color:var(--text-dim);font-weight:700;margin-bottom:6px;">
          📊 Créatures ${evt.tagLabel} dans la database (formes de base)
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;">
          ${RARITIES.filter(r => dbCounts[r] > 0).map(r => `
            <span style="font-size:.72rem;padding:3px 10px;border-radius:999px;background:linear-gradient(135deg,${RGRAD[r]});color:${RCOLORS[r]};font-weight:700;border:1px solid ${RCOLORS[r]}44;">
              ${RLABELS[r]} : ${dbCounts[r]}
            </span>`).join('')}
          ${RARITIES.every(r => !dbCounts[r]) ? '<span style="color:var(--text-faint);font-size:.75rem;">Aucune créature avec ce tag</span>' : ''}
        </div>
        <details>
          <summary style="font-size:.72rem;color:var(--text-dim);cursor:pointer;">
            🐾 ${tagChars.length} espèce${tagChars.length > 1 ? 's' : ''} — voir la liste
          </summary>
          <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">
            ${tagChars.map(c => `<span style="font-size:.68rem;padding:2px 7px;border-radius:999px;background:linear-gradient(135deg,${RGRAD[c.rarity]||RGRAD.common});color:${RCOLORS[c.rarity]||RCOLORS.common};border:1px solid ${(RCOLORS[c.rarity]||RCOLORS.common)}44;">${c.name}</span>`).join('') || '<em style="color:#888">—</em>'}
          </div>
        </details>
      </div>
    `;

    document.getElementById('btn-launch-event')?.addEventListener('click', () => {
      _launchCombat({ mode, eventTagId: evt.tagId });
    });
  }

  /**
   * Affiche la sélection d'arène : le joueur choisit un type, et affronte 6 ennemis
   * partageant tous ce type (en principal ou secondaire).
   */
  function renderCombatArena() {
    const top     = document.getElementById('combat-mode-content-top');
    const content = document.getElementById('combat-mode-content');
    if (!content) return;
    const state   = GameState.get();
    const team    = GameState.getTeam();
    const bestiaire = state.player.bestiaire || {};

    // Pour chaque type, calculer combien de lignées DISTINCTES le joueur a débloquées
    // (au moins 1 créature de la lignée dans le bestiaire, ayant ce type en type1 ou type2)
    const ARENA_REQUIRED_LINES = 6;

    const typeUnlockData = state.types.map(t => {
      // Trouver toutes les lignées qui ont au moins un membre avec ce type
      const linesWithType = new Set();
      state.characters.forEach(c => {
        if (c.type1 === t.id || c.type2 === t.id) {
          linesWithType.add(c.evolutionLine);
        }
      });
      // Parmi ces lignées, combien ont leur forme de base dans le bestiaire du joueur ?
      let unlockedLines = 0;
      linesWithType.forEach(lineId => {
        const baseForm = state.characters
          .filter(c => c.evolutionLine === lineId)
          .sort((a, b) => a.evolutionStage - b.evolutionStage)[0];
        if (baseForm && bestiaire[baseForm.id]) unlockedLines++;
      });
      return {
        type:          t,
        totalLines:    linesWithType.size,
        unlockedLines,
        isUnlocked:    unlockedLines >= ARENA_REQUIRED_LINES,
      };
    });

    const unlockedArenas = typeUnlockData.filter(d => d.isUnlocked).length;
    const totalArenas    = typeUnlockData.length;

    content.innerHTML = `
      <h3 class="combat-line-title">Choisissez une arène</h3>
      <p class="combat-line-subtitle">
        ${unlockedArenas}/${totalArenas} arène${unlockedArenas > 1 ? 's' : ''} débloquée${unlockedArenas > 1 ? 's' : ''}
        — Débloquez ${ARENA_REQUIRED_LINES} lignées d'un même type pour accéder à son arène.
      </p>
      <div class="evo-line-grid">
        ${typeUnlockData.map(({ type: t, totalLines, unlockedLines, isUnlocked }) => {
          if (isUnlocked) {
            return `
            <div class="evo-line-card arena-card ${_selectedArenaType === t.id ? 'selected' : ''}" data-arena-type="${t.id}" title="Arène ${t.name}">
              <div class="arena-type-icon" style="background:${t.color}">${t.icon}</div>
              <div class="evo-line-name" style="color:${t.color}">Arène ${t.name}</div>
              <div class="evo-line-meta">
                <span class="evo-line-count">6 ennemis ${t.name}</span>
              </div>
            </div>`;
          } else {
            // Verrouillée : afficher la progression
            const progress = Math.min(unlockedLines, ARENA_REQUIRED_LINES);
            const pct      = Math.round((progress / ARENA_REQUIRED_LINES) * 100);
            return `
            <div class="evo-line-card arena-card locked" title="Débloquez ${ARENA_REQUIRED_LINES - unlockedLines} lignée(s) ${t.name} de plus">
              <div class="arena-type-icon" style="background:#333;opacity:0.6">${t.icon}</div>
              <div class="evo-line-name" style="color:#666">Arène ${t.name}</div>
              <div class="evo-line-meta">
                <span class="evo-line-count" style="color:#555">${progress}/${ARENA_REQUIRED_LINES} lignées</span>
              </div>
              <div class="arena-progress-bar">
                <div class="arena-progress-fill" style="width:${pct}%;background:${t.color}"></div>
              </div>
              <div class="lock-badge">🔒</div>
            </div>`;
          }
        }).join('')}
      </div>
    `;

    if (top) {
      top.innerHTML = _selectedArenaType && team.length > 0
        ? `<button class="btn-primary btn-launch-combat" id="btn-launch-arena" style="width:100%;margin-bottom:8px">🏛️ Entrer dans l'arène</button>`
        : '';
      document.getElementById('btn-launch-arena')?.addEventListener('click', () => _launchCombat({ mode: 'arena', arenaType: _selectedArenaType }));
    }

    // Seules les arènes débloquées sont cliquables
    content.querySelectorAll('.arena-card:not(.locked)').forEach(card => {
      card.addEventListener('click', () => {
        _selectedArenaType = card.dataset.arenaType;
        renderCombatArena();
      });
    });
  }

  /**
   * Affiche la sélection de lignée évolutive pour un combat thématique :
   * le joueur choisit une lignée et affronte tous ses stades d'évolution
   */
  /**
   * ── MODE ODYSSÉE ──
   * Affiche la progression par Sanctuaire/Épreuve. Chaque épreuve est soit normale,
   * soit élite (x10 et x20 de chaque sanctuaire, en violet), soit boss (x25, en rouge).
   * Une épreuve ne peut être rejouée une fois accomplie (en cas de défaite, la même
   * équipe ennemie est conservée pour les réessais).
   */
  function renderCombatStory() {
    const top     = document.getElementById('combat-mode-content-top');
    const content = document.getElementById('combat-mode-content');
    if (!content) return;

    const state    = GameState.get();
    const player   = GameState.getPlayer();
    const storyCfg = state.config.combat.story || {};
    const perWorld = storyCfg.subLevelsPerWorld || 25;
    const eliteSubs = storyCfg.eliteSubLevels   || [10, 20];
    const bossSub   = storyCfg.bossSubLevel      || 25;

    // Progression actuelle
    const progress = player.story || { world: 1, subLevel: 0 };
    const { world } = progress;
    const completedSub = progress.subLevel;    // dernière épreuve ACCOMPLIE dans ce sanctuaire
    const nextSub = completedSub + 1;          // prochaine à jouer (ou 26 si sanctuaire fini, géré par _endBattle)
    const worldComplete = completedSub >= perWorld;

    // Bonus de sanctuaire visible au joueur
    const worldBoost = (world - 1) * (storyCfg.worldStatBoost ?? 0.10);

    // Bouton de lancement en haut
    const team = GameState.getTeam();
    if (top) {
      if (team.length > 0 && !worldComplete) {
        const sub = nextSub;
        const isElite = eliteSubs.includes(sub);
        const isBoss  = sub === bossSub;
        const typeLabel = isBoss ? '💀 Boss' : isElite ? '⚔ Élite' : '▶';
        top.innerHTML = `
          <button class="btn-primary btn-launch-combat story-launch-btn ${isBoss ? 'story-boss-btn' : isElite ? 'story-elite-btn' : ''}"
                  id="btn-launch" style="width:100%;margin-bottom:8px">
            ${typeLabel} Lancer Sanctuaire ${world} — Épreuve ${sub}
          </button>
        `;
        document.getElementById('btn-launch')?.addEventListener('click', () =>
          _launchCombat({ mode: 'story', storyWorld: world, storySubLevel: sub })
        );
      } else {
        top.innerHTML = worldComplete
          ? `<p class="combat-mode-note">🎉 Sanctuaire ${world} accompli ! Le prochain s'ouvre devant toi…</p>`
          : '';
      }
    }

    // Grille des 25 épreuves du sanctuaire courant
    const cells = Array.from({ length: perWorld }, (_, i) => {
      const sub = i + 1;
      const done   = sub <= completedSub;
      const active = sub === nextSub && !worldComplete;
      const isElite = eliteSubs.includes(sub);
      const isBoss  = sub === bossSub;

      let cls  = 'story-sub-cell';
      let label = '';
      if (isBoss)  { cls += ' story-boss-cell';  label = '💀 BOSS'; }
      else if (isElite) { cls += ' story-elite-cell'; label = '⚔ ÉLITE'; }
      if (done)   cls += ' story-done';
      if (active) cls += ' story-active';
      if (!done && !active) cls += ' story-locked';

      return `
        <div class="${cls}" title="Sanctuaire ${world} — Épreuve ${sub}${isElite ? ' (Élite)' : ''}${isBoss ? ' (Boss)' : ''}">
          <div class="story-sub-number">${world}-${sub}</div>
          ${label ? `<div class="story-sub-badge">${label}</div>` : ''}
          ${done ? '<div class="story-sub-done">✓</div>' : ''}
        </div>
      `;
    }).join('');

    content.innerHTML = `
      <div class="story-header">
        <div class="story-world-title">🌸 Sanctuaire ${world}</div>
        ${worldBoost > 0 ? `<div class="story-world-bonus">+${Math.round(worldBoost * 100)}% stats ennemies</div>` : ''}
        <div class="story-progress-bar-wrap">
          <div class="story-progress-bar" style="width:${Math.min(100, (completedSub / perWorld) * 100)}%"></div>
        </div>
        <div class="story-progress-label">${completedSub} / ${perWorld} Épreuves</div>
      </div>
      <div class="story-sub-grid">${cells}</div>
      <div class="story-legend">
        <span class="story-legend-item story-elite-legend">⚔ Élite : +10% niveau & stats</span>
        <span class="story-legend-item story-boss-legend">💀 Boss : +25% niveau & stats</span>
      </div>
    `;
  }

  function renderCombatByLine() {
    const top     = document.getElementById('combat-mode-content-top');
    const content = document.getElementById('combat-mode-content');
    if (!content) return;
    const state   = GameState.get();
    const team    = GameState.getTeam();
    const bestiaire = state.player.bestiaire || {};

    // Bouton en haut
    if (top) {
      top.innerHTML = _selectedLine && team.length > 0
        ? `<button class="btn-primary btn-launch-combat" id="btn-launch-line" style="width:100%;margin-bottom:8px">⚔ Affronter cette lignée</button>`
        : '';
      document.getElementById('btn-launch-line')?.addEventListener('click', () => _launchCombat({ mode: 'line', lineId: _selectedLine }));
    }

    // Regrouper par lignée, récupérer la forme de base (stade 0)
    const lines = {};
    state.characters.forEach(c => {
      if (!lines[c.evolutionLine]) lines[c.evolutionLine] = [];
      lines[c.evolutionLine].push(c);
    });

    // Construire les entrées : disponibles (admin ON + bestiaire débloqué) et verrouillées (admin ON + pas encore vu)
    // Les lignées désactivées en admin (availableInLineCombat === false) sont complètement masquées.
    const lineEntries = Object.entries(lines)
      .map(([lineId, chars]) => {
        const sorted   = chars.slice().sort((a, b) => a.evolutionStage - b.evolutionStage);
        const baseForm = sorted[0];
        return { lineId, baseForm };
      })
      .filter(({ baseForm }) => baseForm.availableInLineCombat !== false)  // masquer si désactivé en admin
      .map(({ lineId, baseForm }) => ({
        lineId,
        baseForm,
        unlocked: !!bestiaire[baseForm.id],   // débloqué = forme de base présente dans le bestiaire
      }))
      .sort((a, b) => {
        // Débloquées en premier, puis par nom
        if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
        return a.baseForm.name.localeCompare(b.baseForm.name);
      });

    const unlockedCount = lineEntries.filter(e => e.unlocked).length;
    const totalCount    = lineEntries.length;

    content.innerHTML = `
      <h3 class="combat-line-title">Choisissez une lignée à affronter</h3>
      <p class="combat-line-subtitle">
        ${unlockedCount}/${totalCount} lignée${unlockedCount > 1 ? 's' : ''} débloquée${unlockedCount > 1 ? 's' : ''}
        — Débloquez une forme de base dans le Catalogue pour affronter sa lignée.
      </p>
      <div class="evo-line-grid">
        ${lineEntries.map(({ lineId, baseForm, unlocked }) => {
          const t1        = state.types.find(t => t.id === baseForm.type1);
          const rarityDef = GameDatabase.RARITIES[baseForm.rarity] || {};
          if (unlocked) {
            return `
            <div class="evo-line-card ${_selectedLine === lineId ? 'selected' : ''}" data-line="${lineId}" title="Affronter la lignée de ${baseForm.name}">
              <div class="evo-line-portrait">
                ${baseForm.portrait ? `<img src="${baseForm.portrait}" alt="${baseForm.name}">` : `<span>${baseForm.name.charAt(0)}</span>`}
              </div>
              <div class="evo-line-name" style="color:${rarityDef.color}">${baseForm.name}</div>
              <div class="evo-line-meta">
                ${t1 ? `<span class="type-badge" style="background:${t1.color}">${t1.icon} ${t1.name}</span>` : ''}
                <span class="evo-line-count">×3 exemplaires</span>
              </div>
            </div>`;
          } else {
            // Verrouillée : portrait flouté, cadenas, pas cliquable
            return `
            <div class="evo-line-card locked" title="Débloquée en obtenant ${baseForm.name} via le Expédition ou un combat">
              <div class="evo-line-portrait locked-portrait">
                ${baseForm.portrait
                  ? `<img src="${baseForm.portrait}" alt="???" style="filter:blur(6px) brightness(0.4)">`
                  : `<span style="opacity:0.2">${baseForm.name.charAt(0)}</span>`}
                <div class="lock-overlay">🔒</div>
              </div>
              <div class="evo-line-name" style="color:#666">???</div>
              <div class="evo-line-meta">
                <span class="evo-line-count" style="color:#555">Non débloquée</span>
              </div>
            </div>`;
          }
        }).join('')}
      </div>
      ${_selectedLine && team.length > 0 ? `` : ''}
    `;

    // Seules les cartes débloquées sont cliquables
    content.querySelectorAll('.evo-line-card:not(.locked)').forEach(card => {
      card.addEventListener('click', () => {
        _selectedLine = card.dataset.line;
        renderCombatByLine();
      });
    });
  }

  function _launchCombat(options) {
    const battleArea = document.getElementById('battle-area');
    const lobby = document.querySelector('.combat-lobby');
    if (!battleArea || !lobby) return;

    _battle = CombatEngine.start(_onBattleEvent, options);
    if (!_battle) {
      // L'erreur a déjà été émise via _onBattleEvent, mais on double sécurise
      const player = GameState.getPlayer();
      const cfg = GameState.getConfig();
      const energyCost = cfg.energy.costs?.[options.mode] ?? cfg.energy.combatCost;
      if (options.mode !== 'fullRandom' && player.team.length === 0) {
        _showToast("Composez d'abord votre équipe !", 'error');
      } else if (cfg.energy.enabled && player.energy.current < energyCost) {
        _showToast("Énergie insuffisante !", 'error');
      }
      return;
    }

    lobby.style.display = 'none';
    battleArea.style.display = 'block';
    AudioSystem.playCombat();
    _renderBattle();
  }

  function _renderBattle() {
    const area = document.getElementById('battle-area');
    if (!area || !_battle) return;

    const b = _battle;
    area.innerHTML = `
      <div class="battle-scene">
        <div class="battle-side battle-enemy">
          <h3>Ennemis</h3>
          <div class="battle-fighters" id="enemy-fighters">
            ${b.enemyTeam.map((e, i) => _renderFighter(e, i)).join('')}
          </div>
        </div>
        <div class="battle-vs">⚔</div>
        <div class="battle-side battle-player">
          <h3>Votre équipe</h3>
          <div class="battle-fighters" id="player-fighters">
            ${b.playerTeam.map((p, i) => _renderFighter(p, i)).join('')}
          </div>
        </div>
      </div>
      <div class="turn-order-bar" id="turn-order-bar"></div>
      <div class="battle-controls" id="battle-controls">
        <div class="battle-actions" id="battle-actions"></div>
      </div>
      <div class="battle-log" id="battle-log"></div>
    `;

    _renderTurnOrderBar();
    _renderBattleControls();
    _bindFighterPortraitClicks();
  }

  /**
   * Attache un listener sur chaque .fighter-portrait dans l'arène de combat :
   * un clic ouvre la fiche détaillée du combattant (comme dans la collection).
   * Pour les ennemis (pas dans la collection joueur), affiche une fiche simplifiée.
   */
  function _bindFighterPortraitClicks() {
    document.querySelectorAll('.fighter-card').forEach(card => {
      const portrait = card.querySelector('.fighter-portrait');
      if (!portrait) return;
      const instanceId = card.id.replace('fighter-', '');
      portrait.style.cursor = 'pointer';
      portrait.title = 'Voir la fiche';
      portrait.addEventListener('click', () => {
        // Cherche d'abord dans la collection joueur
        const playerInst = GameState.getPlayerChar(instanceId);
        if (playerInst) {
          _openCharDetail(instanceId);
          return;
        }
        // Ennemi : fiche simplifiée construite depuis le combattant _battle
        if (!_battle) return;
        const combatant = [..._battle.enemyTeam, ..._battle.playerTeam].find(c => c.instanceId === instanceId);
        if (combatant) _openEnemyFighterDetail(combatant);
      });
    });
  }

  /**
   * Fiche simplifiée pour un ennemi (pas dans la collection du joueur) :
   * affiche portrait, types, stats actuelles, affinités.
   */
  function _openEnemyFighterDetail(combatant) {
    const modal = document.getElementById('modal');
    if (!modal) return;
    const state = GameState.get();
    const def = GameState.getCharDef(combatant.charId || combatant.id);
    const types = state.types;
    const t1 = types.find(t => t.id === combatant.type1);
    const t2 = combatant.type2 ? types.find(t => t.id === combatant.type2) : null;
    const rarityDef = GameDatabase.RARITIES[combatant.rarity] || {};

    const affinHtml = def ? _buildTypeAffinitiesHtml(def, state) : _buildTypeAffinitiesHtml(combatant, state);

    modal.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop">
        <div class="modal-box">
          <button class="modal-close" id="modal-close">✕</button>
          <div class="detail-layout">
            <div class="detail-portrait" style="position:relative;overflow:hidden;">
              ${_detailPortraitImgHtml(def || combatant)}
              <div class="detail-rarity" style="background:${rarityDef.color || '#888'}">${rarityDef.name || combatant.rarity}</div>
            </div>
            <div class="detail-info">
              <h3>${combatant.name}</h3>
              ${def?.description ? `<p class="detail-desc">${def.description}</p>` : ''}
              <div class="detail-types">
                ${t1 ? `<span class="type-badge" style="background:${t1.color}">${t1.icon} ${t1.name}</span>` : ''}
                ${t2 ? `<span class="type-badge" style="background:${t2.color}">${t2.icon} ${t2.name}</span>` : ''}
              </div>
              ${def ? _buildPassivesHtml(def, state) : ''}
              ${affinHtml}
              <div class="detail-level">Niveau <strong>${combatant.level}</strong></div>
              <div class="stat-grid">
                <div class="stat-row"><span>♥ PV</span><strong>${combatant.currentHp} / ${combatant.maxHp}</strong></div>
                <div class="stat-row"><span>⚔ ATK</span><strong>${combatant.atk}</strong></div>
                <div class="stat-row"><span>🛡 DEF</span><strong>${combatant.def}</strong></div>
                <div class="stat-row"><span>💨 VIT</span><strong>${combatant.spd}</strong></div>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    modal.style.display = 'block';
    document.getElementById('modal-close')?.addEventListener('click', _closeModal);
    document.getElementById('modal-backdrop')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) _closeModal();
    });
  }

  /**
   * Affiche la frise de l'ordre d'action de la manche en cours (vitesse décroissante),
   * avec l'acteur actif mis en évidence — alliés et ennemis confondus.
   */
  function _renderTurnOrderBar() {
    const bar = document.getElementById('turn-order-bar');
    if (!bar || !_battle) return;

    const upcoming = _battle.turnOrder.slice(_battle.turnIndex, _battle.turnIndex + 8);
    if (upcoming.length === 0) { bar.innerHTML = ''; return; }

    bar.innerHTML = `
      <span class="turn-order-label">Ordre :</span>
      <div class="turn-order-chips">
        ${upcoming.map((entry, i) => {
          const team = entry.isEnemy ? _battle.enemyTeam : _battle.playerTeam;
          const c = team.find(x => x.instanceId === entry.instanceId);
          if (!c) return '';
          return `<div class="turn-chip ${i === 0 ? 'active' : ''} ${entry.isEnemy ? 'is-enemy' : 'is-ally'}" title="${c.name}" style="position:relative;overflow:hidden;">
            ${_portraitImgHtml(GameState.getCharDef(c.charId) || c)}
          </div>`;
        }).join('')}
      </div>
    `;
  }

  function _renderFighter(combatant, index = 0) {
    const hpPct = Math.round((combatant.currentHp / combatant.maxHp) * 100);
    const hpColor = hpPct > 60 ? '#4ade80' : hpPct > 25 ? '#facc15' : '#f87171';
    const state = GameState.get();
    const t1 = state.types.find(t => t.id === combatant.type1);
    const t2 = combatant.type2 ? state.types.find(t => t.id === combatant.type2) : null;
    const maxAwk = state.config.awakening.maxLevel;
    const isAwkMax = (combatant.awakening || 0) >= maxAwk;
    return `
    <div class="fighter-card rarity-${combatant.rarity} ${combatant.alive ? '' : 'defeated'}" id="fighter-${combatant.instanceId}" style="--enter-delay:${index * 80}ms">
      <div class="fighter-status-badges" id="status-badges-${combatant.instanceId}">${_buildStatusBadgesHtml(combatant)}</div>
      <div class="fighter-portrait ${isAwkMax ? 'awakening-max' : ''}" style="position:relative;overflow:hidden;">
        ${_combatPortraitImgHtml(GameState.getCharDef(combatant.charId) || combatant)}
      </div>
      <div class="fighter-types">
        ${t1 ? `<span class="type-chip" style="background:${t1.color}" title="${t1.name}">${t1.icon}</span>` : ''}
        ${t2 ? `<span class="type-chip" style="background:${t2.color}" title="${t2.name}">${t2.icon}</span>` : ''}
      </div>
      <div class="fighter-info">
        <div class="fighter-name">${combatant.name} <small>Niv.${combatant.level}</small></div>
        <div class="hp-bar">
          <div class="hp-bar-fill" style="width:${hpPct}%;background:${hpColor}"></div>
        </div>
        <div class="hp-text">${combatant.alive ? `${combatant.currentHp} / ${combatant.maxHp}` : 'KO'}</div>
      </div>
    </div>`;
  }

  /**
   * Icônes/labels d'affichage pour chaque type de statut actif sur un combattant.
   * 'positive' détermine la couleur du badge (vert = bénéfique, rouge = nuisible).
   */
  const STATUS_BADGE_INFO = {
    atkBoost:   { icon: '⚔️', label: 'ATK boostée',  positive: true  },
    poison:     { icon: '☠️', label: 'Empoisonné',   positive: false },
    paralysis:  { icon: '⚡', label: 'Paralysé',      positive: false },
    charm:      { icon: '💞', label: 'Charmé',        positive: false },
  };

  /**
   * Construit le HTML des badges de statut affichés en haut à droite d'une
   * carte de combattant, visibles tant que l'altération (positive ou négative)
   * n'est pas dissipée.
   * @param {object} combatant
   * @returns {string} HTML
   */
  function _buildStatusBadgesHtml(combatant) {
    const statuses = combatant.statuses || [];
    if (statuses.length === 0) return '';
    return statuses.map((s) => {
      const info = STATUS_BADGE_INFO[s.type];
      if (!info) return '';
      return `<span class="status-badge ${info.positive ? 'status-badge-positive' : 'status-badge-negative'}" title="${info.label}">${info.icon}</span>`;
    }).join('');
  }

  /** Rafraîchit uniquement les badges de statut d'une carte (sans tout re-render) */
  function _refreshStatusBadges(combatant) {
    const el = document.getElementById(`status-badges-${combatant.instanceId}`);
    if (el) el.innerHTML = _buildStatusBadgesHtml(combatant);
  }

  function _renderBattleControls() {
    const actionsEl = document.getElementById('battle-actions');
    if (!actionsEl || !_battle) return;

    _highlightActiveFighter();

    if (_battle.phase === 'end') return;

    const state  = GameState.get();
    const typeOf = (id) => state.types.find(t => t.id === id);

    if (_battle.phase === 'enemy') {
      const enemy = _battle.enemyTeam.find(c => c.instanceId === _battle.currentActor);
      actionsEl.innerHTML = `<p class="turn-waiting">👹 ${enemy ? enemy.name : "L'ennemi"} agit...</p>`;
      return;
    }

    // phase === 'player' : c'est au tour du créature allié _battle.currentActor
    const actor = _battle.playerTeam.find(c => c.instanceId === _battle.currentActor && c.alive);
    const enemies = _battle.enemyTeam.filter(c => c.alive);

    if (!actor) {
      actionsEl.innerHTML = '';
      return;
    }

    const t1 = typeOf(actor.type1);

    actionsEl.innerHTML = `
      <p class="turn-actor">${t1 ? t1.icon : ''} C'est le tour de <strong>${actor.name}</strong> !</p>
      <div class="target-select">
        <label>Cible :</label>
        <div class="fighter-btns">
          ${enemies.map(e => {
            let multBadge = '';
            const mult = GameDatabase.getTypeEffectiveness(actor.type1, e.type1, e.type2, state.typeMatrix);
            if (mult !== 1) {
              const cls = mult >= 2 ? 'mult-super' : mult === 0 ? 'mult-immune' : mult <= 0.5 ? 'mult-low' : 'mult-mid';
              multBadge = `<span class="target-mult ${cls}">×${_formatMult(mult)}</span>`;
            }
            return `<button class="btn-target" data-iid="${e.instanceId}">${e.name} (${e.currentHp}♥)${multBadge}</button>`;
          }).join('')}
        </div>
      </div>
    `;

    actionsEl.querySelectorAll('.btn-target').forEach(btn => {
      btn.addEventListener('click', () => {
        actionsEl.querySelectorAll('.btn-target').forEach(b => b.disabled = true);
        CombatEngine.playerAttack(actor.instanceId, btn.dataset.iid);
      });
    });
  }

  /** Met en évidence la carte du combattant dont c'est actuellement le tour */
  function _highlightActiveFighter() {
    if (!_battle) return;
    document.querySelectorAll('.fighter-card.active-turn').forEach(el => el.classList.remove('active-turn'));
    if (_battle.phase === 'player' || _battle.phase === 'enemy') {
      const card = document.getElementById(`fighter-${_battle.currentActor}`);
      card?.classList.add('active-turn');
    }
  }

  function _onBattleEvent(event, data) {
    _battle = CombatEngine.getBattle();
    const log = document.getElementById('battle-log');

    if (['playerAttack', 'enemyAttack'].includes(event)) {
      // Mise à jour immédiate de la frise / mise en évidence : l'acteur courant
      // doit apparaître actif dès le début de son action, pas seulement après coup.
      _renderTurnOrderBar();
      _highlightActiveFighter();

      if (log && _battle?.log?.length) {
        log.innerHTML = [..._battle.log].reverse().slice(0, 8).map(l => `<div class="log-line">${l}</div>`).join('');
      }
      _playAttackAnimation(data.attacker, data.target, data.result);
      setTimeout(() => { _renderTurnOrderBar(); _renderBattleControls(); _refreshAllStatusBadges(); }, 900);
    }

    if (event === 'playerTurn') {
      _renderTurnOrderBar();
      _renderBattleControls();
    }

    if (event === 'passiveTriggered') {
      _playPassiveAnimations(data.events);
      if (log && _battle?.log?.length) {
        log.innerHTML = [..._battle.log].reverse().slice(0, 8).map(l => `<div class="log-line">${l}</div>`).join('');
      }
    }

    if (event === 'victory') {
      _playLevelUpAnimations(data.rewards?.levelUps);
      _showBattleResult('victory', data);
    }
    if (event === 'defeat') {
      _showBattleResult('defeat', data);
    }

    if (event === 'error') {
      _showToast(data.message, 'error');
    }
  }

  /**
   * Joue l'animation complète d'une attaque : élan de l'attaquant vers la cible,
   * puis impact (flash, tremblement, nombres flottants) une fois le coup "porté".
   */
  function _playAttackAnimation(attacker, target, result) {
    const attackerCard = document.getElementById(`fighter-${attacker.instanceId}`);
    const targetCard   = document.getElementById(`fighter-${target.instanceId}`);

    if (!attackerCard || !targetCard) {
      _updateFighterCard(target);
      return;
    }

    const attackerPortrait = attackerCard.querySelector('.fighter-portrait');
    const lungeClass = attacker.isEnemy ? 'lunge-down' : 'lunge-up';
    attackerPortrait?.classList.add(lungeClass);

    setTimeout(() => {
      attackerPortrait?.classList.remove(lungeClass);
      _resolveImpact(targetCard, target, result);
      _updateFighterCard(target);
    }, 260);
  }

  /** Formate un multiplicateur de dégâts pour l'affichage (×2, ×0.5, ×2.25...) */
  function _formatMult(m) {
    if (m % 1 === 0) return String(m);
    return m.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  function _resolveImpact(targetCard, target, result) {
    const targetPortrait = targetCard.querySelector('.fighter-portrait');

    if (result.evaded) {
      _spawnFloatText(targetCard, '💨 Esquive !', 'float-evade');
      return;
    }

    AudioSystem.playHitSfx(result.multiplier);

    targetPortrait?.classList.add('hit-flash', result.critical ? 'shake-big' : 'shake-hit');
    setTimeout(() => targetPortrait?.classList.remove('hit-flash', 'shake-big', 'shake-hit'), 480);

    _spawnFloatText(targetCard, `-${result.damage}`, result.critical ? 'float-dmg float-crit-dmg' : 'float-dmg', 0);

    if (result.critical) {
      _spawnFloatText(targetCard, 'CRITIQUE !', 'float-crit-label', 1);
    }

    if (result.multiplier >= 2.0) {
      _spawnFloatText(targetCard, `×${_formatMult(result.multiplier)} Super efficace !`, 'float-mult float-mult-super', result.critical ? 2 : 1);
    } else if (result.multiplier > 0 && result.multiplier <= 0.5) {
      _spawnFloatText(targetCard, `×${_formatMult(result.multiplier)} Peu efficace...`, 'float-mult float-mult-low', result.critical ? 2 : 1);
    } else if (result.multiplier === 0) {
      _spawnFloatText(targetCard, 'Aucun effet !', 'float-mult float-mult-immune', result.critical ? 2 : 1);
    }
  }

  /** Affiche un texte flottant temporaire au-dessus d'une carte de combattant */
  function _spawnFloatText(card, text, cls, stack = 0) {
    const el = document.createElement('div');
    el.className = `float-text ${cls}`;
    el.style.setProperty('--stack', stack);
    el.textContent = text;
    card.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  /**
   * Joue une animation de montée de niveau sur les cartes de combattants encore
   * affichées sur l'écran de combat (flash doré + texte flottant), à partir des
   * infos de level-up renvoyées par le moteur dans les récompenses de victoire.
   * @param {Object<string,{levelUps:number[], evolved:object|null}>} levelUpInfo
   */
  function _playLevelUpAnimations(levelUpInfo) {
    if (!levelUpInfo) return;
    const evolutionQueue = [];

    Object.entries(levelUpInfo).forEach(([instanceId, info], i) => {
      const card = document.getElementById(`fighter-${instanceId}`);
      const finalLevel = info.levelUps[info.levelUps.length - 1];

      if (info.evolved) evolutionQueue.push(info.evolved);

      if (!card) return;
      const portrait = card.querySelector('.fighter-portrait');

      setTimeout(() => {
        portrait?.classList.add('level-up-flash');
        setTimeout(() => portrait?.classList.remove('level-up-flash'), 1000);
        _spawnFloatText(card, `🎉 NIVEAU ${finalLevel} !`, 'float-levelup', 0);
        AudioSystem.playSfx(AudioSystem.SFX_KEYS.levelUp);
      }, i * 200); // léger échelonnement si plusieurs créatures montent de niveau
    });

    // Les évolutions méritent un traitement à part, bien plus marquant : un écran
    // de révélation dédié, enchaîné pour chaque créature qui a évolué.
    if (evolutionQueue.length > 0) {
      setTimeout(() => _showEvolutionShowcase(evolutionQueue), 400);
    }
  }

  /**
   * Joue les animations de déclenchement de passifs (un ou plusieurs événements
   * survenus au même trigger, ex: plusieurs alliés régénèrent en même temps).
   * Chaque événement affiche une bannière avec le nom du passif, et une
   * animation visuelle adaptée sur la/les carte(s) concernée(s).
   * @param {Array<object>} events - événements renvoyés par PassiveSystem (engine.js)
   */
  function _playPassiveAnimations(events) {
    if (!events || events.length === 0) return;
    // Échelonnement : si plusieurs passifs se déclenchent au même moment
    // (ex: deux alliés Aquatique avec Tsunami), on les enchaîne proprement
    // plutôt que de les superposer en désordre.
    events.forEach((evt, i) => {
      setTimeout(() => _playOnePassiveAnimation(evt), i * 650);
    });
    // Rafraîchit les badges de statut de tous les combattants (les statuts
    // peuvent avoir été ajoutés, retirés, ou avoir expiré suite à ces événements).
    const totalDelay = events.length * 650;
    setTimeout(_refreshAllStatusBadges, totalDelay + 100);
  }

  /** Rafraîchit les badges de statut sur toutes les cartes de combattants affichées */
  function _refreshAllStatusBadges() {
    const battle = CombatEngine.getBattle();
    if (!battle) return;
    [...battle.playerTeam, ...battle.enemyTeam].forEach(_refreshStatusBadges);
  }

  function _playOnePassiveAnimation(evt) {
    const { passiveId, passive, sourceId, targetId, targets } = evt;
    if (!passive) return;

    const sourceCard = sourceId ? document.getElementById(`fighter-${sourceId}`) : null;

    // ── Révélation Cryptide : bannière spéciale annonçant le passif tiré ─────
    if (evt.cryptideReveal) {
      if (sourceCard) {
        _spawnPassiveBanner(sourceCard, `🐉 Mystère → ${passive.icon} ${passive.name}`, 'passive-banner-cryptide');
      }
      return;
    }

    // ── Paralysie qui empêche d'agir ce tour-ci ──────────────────────────────
    if (evt.paralyzedSkip) {
      if (sourceCard) {
        _spawnPassiveBanner(sourceCard, `⚡ ${passive.name} !`, 'passive-banner-electric');
        _spawnFloatText(sourceCard, 'Paralysé !', 'float-status float-status-paralysis', 0);
        sourceCard.classList.add('passive-shake-paralysis');
        setTimeout(() => sourceCard.classList.remove('passive-shake-paralysis'), 500);
      }
      AudioSystem.playSfx(AudioSystem.SFX_KEYS.hitResist);
      return;
    }

    // ── Tic de poison (dégâts périodiques) ───────────────────────────────────
    if (evt.poisonTick !== undefined) {
      if (sourceCard) {
        _spawnFloatText(sourceCard, `☠️ -${evt.poisonTick}`, 'float-dmg float-poison-tick', 0);
        sourceCard.querySelector('.fighter-portrait')?.classList.add('passive-poison-pulse');
        setTimeout(() => sourceCard.querySelector('.fighter-portrait')?.classList.remove('passive-poison-pulse'), 600);
        _updateFighterCard(CombatEngine.getBattle()?.playerTeam.find(c => c.instanceId === sourceId)
          || CombatEngine.getBattle()?.enemyTeam.find(c => c.instanceId === sourceId));
      }
      return;
    }

    const targetCard = targetId ? document.getElementById(`fighter-${targetId}`) : null;

    switch (passiveId) {
      // ── Meute (fire) : aura orange sur l'allié boosté ───────────────────────
      case 'fire': {
        if (sourceCard) _spawnPassiveBanner(sourceCard, `🐺 ${passive.name} !`, 'passive-banner-fire');
        if (targetCard) {
          _spawnFloatText(targetCard, `⚔️ +${passive.value}% ATK`, 'float-status float-status-buff', 0);
          targetCard.classList.add('passive-aura-fire');
          setTimeout(() => targetCard.classList.remove('passive-aura-fire'), 1100);
        }
        break;
      }

      // ── Régénération (nature) : éclat vert + soin sur l'allié ciblé ─────────
      case 'nature': {
        if (sourceCard) _spawnPassiveBanner(sourceCard, `🌱 ${passive.name} !`, 'passive-banner-nature');
        if (targetCard) {
          _spawnFloatText(targetCard, `+${evt.healAmount} ♥`, 'float-heal', 0);
          targetCard.classList.add('passive-aura-nature');
          setTimeout(() => targetCard.classList.remove('passive-aura-nature'), 1100);
          const battle = CombatEngine.getBattle();
          const c = battle?.playerTeam.find(x => x.instanceId === targetId) || battle?.enemyTeam.find(x => x.instanceId === targetId);
          if (c) _updateFighterCard(c);
        }
        AudioSystem.playSfx(AudioSystem.SFX_KEYS.levelUp); // son positif de repli, pas de SFX dédié au heal
        break;
      }

      // ── Mue (metal) : éclair blanc sur soi, retire les altérations ──────────
      case 'metal': {
        if (sourceCard) {
          _spawnPassiveBanner(sourceCard, `🐍 ${passive.name} !`, 'passive-banner-metal');
          _spawnFloatText(sourceCard, '✨ Purifié', 'float-status float-status-cleanse', 0);
          sourceCard.querySelector('.fighter-portrait')?.classList.add('passive-flash-cleanse');
          setTimeout(() => sourceCard.querySelector('.fighter-portrait')?.classList.remove('passive-flash-cleanse'), 700);
        }
        break;
      }

      // ── Paralysie infligée (electric) ────────────────────────────────────────
      case 'electric': {
        if (sourceCard) _spawnPassiveBanner(sourceCard, `⚡ ${passive.name} !`, 'passive-banner-electric');
        if (targetCard) {
          _spawnFloatText(targetCard, '⚡ Paralysé !', 'float-status float-status-paralysis', 0);
          targetCard.querySelector('.fighter-portrait')?.classList.add('passive-zap');
          setTimeout(() => targetCard.querySelector('.fighter-portrait')?.classList.remove('passive-zap'), 500);
        }
        break;
      }

      // ── Venin infligé (chaos) ────────────────────────────────────────────────
      case 'chaos': {
        if (sourceCard) _spawnPassiveBanner(sourceCard, `☠️ ${passive.name} !`, 'passive-banner-chaos');
        if (targetCard) {
          _spawnFloatText(targetCard, '☠️ Empoisonné !', 'float-status float-status-poison', 0);
          targetCard.querySelector('.fighter-portrait')?.classList.add('passive-poison-pulse');
          setTimeout(() => targetCard.querySelector('.fighter-portrait')?.classList.remove('passive-poison-pulse'), 700);
        }
        break;
      }

      // ── Contre-Attaque (light) ───────────────────────────────────────────────
      case 'light': {
        if (sourceCard) {
          _spawnPassiveBanner(sourceCard, `🦍 ${passive.name} !`, 'passive-banner-light');
          sourceCard.querySelector('.fighter-portrait')?.classList.add('passive-counter-flash');
          setTimeout(() => sourceCard.querySelector('.fighter-portrait')?.classList.remove('passive-counter-flash'), 500);
        }
        break;
      }

      // ── Hypnose / charme infligé (magic) ─────────────────────────────────────
      case 'magic': {
        if (sourceCard) _spawnPassiveBanner(sourceCard, `🦊 ${passive.name} !`, 'passive-banner-magic');
        if (targetCard) {
          _spawnFloatText(targetCard, '💞 Charmé !', 'float-status float-status-charm', 0);
          targetCard.querySelector('.fighter-portrait')?.classList.add('passive-charm-spin');
          setTimeout(() => targetCard.querySelector('.fighter-portrait')?.classList.remove('passive-charm-spin'), 700);
        }
        break;
      }

      // ── Tsunami (water) : vague sur tous les adversaires touchés ─────────────
      case 'water': {
        if (sourceCard) _spawnPassiveBanner(sourceCard, `🌊 ${passive.name} !`, 'passive-banner-water');
        (targets || []).forEach((t, i) => {
          setTimeout(() => {
            const tc = document.getElementById(`fighter-${t.instanceId}`);
            if (!tc) return;
            _spawnWaveEffect(tc);
            _spawnFloatText(tc, `-${t.damage}`, 'float-dmg float-tsunami-dmg', 0);
            tc.querySelector('.fighter-portrait')?.classList.add('shake-hit');
            setTimeout(() => tc.querySelector('.fighter-portrait')?.classList.remove('shake-hit'), 480);
            const battle = CombatEngine.getBattle();
            const c = battle?.playerTeam.find(x => x.instanceId === t.instanceId) || battle?.enemyTeam.find(x => x.instanceId === t.instanceId);
            if (c) _updateFighterCard(c);
          }, i * 120);
        });
        AudioSystem.playSfx(AudioSystem.SFX_KEYS.hitNormal);
        break;
      }

      default:
        if (sourceCard) _spawnPassiveBanner(sourceCard, `${passive.icon || '✨'} ${passive.name} !`, 'passive-banner-default');
    }
  }

  /**
   * Affiche une bannière de nom de passif au-dessus d'une carte de combattant,
   * façon "float-text" mais en plus large et plus visible (le passif doit se
   * démarquer clairement d'un simple texte de dégâts).
   */
  function _spawnPassiveBanner(card, text, cls) {
    const el = document.createElement('div');
    el.className = `passive-banner ${cls}`;
    el.textContent = text;
    card.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  /** Effet visuel de vague traversant la carte (utilisé par Tsunami) */
  function _spawnWaveEffect(card) {
    const el = document.createElement('div');
    el.className = 'passive-wave-effect';
    card.appendChild(el);
    setTimeout(() => el.remove(), 800);
  }

  /**
   * Affiche un écran de révélation plein écran pour chaque évolution survenue,
   * enchaînées une par une (portrait agrandi, animation "punchy" du mot ÉVOLUTION).
   * Avance automatiquement après quelques secondes, ou au clic/tap.
   * @param {Array<object>} queue - Définitions des créatures après évolution
   */
  function _showEvolutionShowcase(queue) {
    if (!queue || queue.length === 0) return;

    let overlay = document.getElementById('evolution-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'evolution-overlay';
      overlay.className = 'evolution-overlay';
      document.body.appendChild(overlay);
    }

    let idx = 0;
    let timer = null;

    function showNext() {
      if (idx >= queue.length) {
        overlay.classList.remove('visible');
        setTimeout(() => overlay.remove(), 300);
        return;
      }

      const charDef = queue[idx];
      const state = GameState.get();
      const rarityDef = GameDatabase.RARITIES[charDef.rarity] || {};
      const t1 = state.types.find(t => t.id === charDef.type1);
      const t2 = charDef.type2 ? state.types.find(t => t.id === charDef.type2) : null;
      const stepLabel = queue.length > 1 ? `<div class="evolution-step">${idx + 1} / ${queue.length}</div>` : '';

      // Forcer le redémarrage des animations même si c'est déjà le même créature
      overlay.classList.remove('visible');
      overlay.innerHTML = `
        <div class="evolution-burst" style="background:radial-gradient(circle, ${rarityDef.color || '#f4c267'}55, transparent 70%)"></div>
        ${stepLabel}
        <div class="evolution-portrait-wrap rarity-${charDef.rarity}">
          ${charDef.portrait
            ? `<img class="evolution-portrait" src="${charDef.portrait}" alt="${charDef.name}">`
            : `<div class="evolution-portrait evolution-portrait-ph">${charDef.name.charAt(0)}</div>`}
        </div>
        <div class="evolution-title">✨ ÉVOLUTION ! ✨</div>
        <div class="evolution-name" style="color:${rarityDef.color}">${charDef.name}</div>
        <div class="evolution-meta">
          <span class="evolution-rarity-badge" style="color:${rarityDef.color}">${rarityDef.name}</span>
          ${t1 ? `<span class="type-badge" style="background:${t1.color}">${t1.icon} ${t1.name}</span>` : ''}
          ${t2 ? `<span class="type-badge" style="background:${t2.color}">${t2.icon} ${t2.name}</span>` : ''}
        </div>
        <div class="evolution-hint">Touchez pour continuer</div>
      `;

      // Léger délai pour que le navigateur reparte bien du début de l'animation
      requestAnimationFrame(() => overlay.classList.add('visible'));

      AudioSystem.playSfx(AudioSystem.SFX_KEYS.evolution);
      idx++;

      clearTimeout(timer);
      timer = setTimeout(showNext, 3000);
    }

    overlay.onclick = () => { clearTimeout(timer); showNext(); };
    showNext();
  }

  function _updateFighterCard(combatant) {
    const card = document.getElementById(`fighter-${combatant.instanceId}`);
    if (!card) return;
    const hpPct = Math.round((combatant.currentHp / combatant.maxHp) * 100);
    const hpColor = hpPct > 60 ? '#4ade80' : hpPct > 25 ? '#facc15' : '#f87171';
    const fill = card.querySelector('.hp-bar-fill');
    const txt  = card.querySelector('.hp-text');
    if (fill) { fill.style.width = hpPct + '%'; fill.style.background = hpColor; }
    if (txt)  txt.textContent = combatant.alive ? `${combatant.currentHp} / ${combatant.maxHp}` : 'KO';
    if (!combatant.alive) {
      card.classList.add('defeated');
      card.style.animation = 'shake 0.4s ease';
    }
  }

  /**
   * Construit le récapitulatif des déclenchements de passifs survenus pendant
   * le combat (regroupés par passif, avec le nombre d'occurrences et la liste
   * des combattants à l'origine du déclenchement).
   * @param {Array<object>} passiveLog - battle.passiveLog (accumulé par engine.js)
   * @returns {string} HTML, ou chaîne vide si aucun passif ne s'est déclenché
   */
  function _buildPassiveRecapHtml(passiveLog) {
    if (!passiveLog || passiveLog.length === 0) return '';

    const battle = CombatEngine.getBattle();
    const findName = (instanceId) => {
      if (!instanceId || !battle) return '?';
      const c = battle.playerTeam.find(x => x.instanceId === instanceId)
             || battle.enemyTeam.find(x => x.instanceId === instanceId);
      return c ? c.name : '?';
    };

    // Regroupement par passiveId : { passive, icon, count, sources: Set<name> }
    const grouped = {};
    passiveLog.forEach((evt) => {
      const key = evt.passiveId || evt.passive?.id || 'unknown';
      if (!grouped[key]) {
        grouped[key] = {
          name: evt.passive?.name || key,
          icon: evt.passive?.icon || '✨',
          count: 0,
          sources: new Set(),
        };
      }
      grouped[key].count++;
      grouped[key].sources.add(findName(evt.sourceId));
    });

    const rows = Object.values(grouped)
      .sort((a, b) => b.count - a.count)
      .map(g => {
        const sourceList = [...g.sources].join(', ');
        return `<div class="passive-recap-row">
          <span class="passive-recap-icon">${g.icon}</span>
          <span class="passive-recap-name">${g.name}</span>
          <span class="passive-recap-count">×${g.count}</span>
          <span class="passive-recap-sources">${sourceList}</span>
        </div>`;
      }).join('');

    return `<div class="passive-recap">
      <h4>💫 Passifs déclenchés</h4>
      <div class="passive-recap-list">${rows}</div>
    </div>`;
  }

  function _showBattleResult(result, data) {
    const controls = document.getElementById('battle-controls');
    if (!controls) return;

    const isVictory = result === 'victory';
    const battle = CombatEngine.getBattle();

    AudioSystem.playResultSfx(result);

    let captureHtml = '';
    if (isVictory && battle?.capturable?.length) {
      captureHtml = `<div class="capture-section">
        <h4>Tentatives de capture :</h4>
        <div class="capture-btns">
          ${battle.capturable.filter(c => !c.captured).map(c => `
            <button class="btn-capture" data-iid="${c.instanceId}" data-char-id="${c.charId}">
              Capturer ${c.name}${c.mergedCount > 1 ? ` ×${c.mergedCount}` : ''} (${Math.round(c.captureRate*100)}%)
            </button>`).join('')}
        </div>
        <div id="capture-reveal"></div>
        <div id="capture-log"></div>
      </div>`;
    }

    const passiveRecapHtml = _buildPassiveRecapHtml(battle?.passiveLog);

    controls.innerHTML = `
      <div class="battle-result ${isVictory ? 'result-victory' : 'result-defeat'}">
        <h2>${isVictory ? '🏆 Victoire !' : '💀 Défaite...'}</h2>
        ${battle?.mode === 'story' && battle.storyWorld != null ? `
          <div style="font-size:.8rem;color:${isVictory ? '#4ade80' : '#f87171'};margin-bottom:6px;font-family:var(--font-display);">
            ${isVictory
              ? `✨ Sanctuaire ${battle.storyWorld} — Épreuve ${battle.storySubLevel} accomplie !`
              : `💢 Sanctuaire ${battle.storyWorld} — Épreuve ${battle.storySubLevel} — Réessaie, les mêmes adversaires t'attendent.`}
          </div>` : ''}
        ${isVictory && data.rewards ? `
          <div class="rewards">
            <span>+${data.rewards.xpEarned} XP</span>
            <span>+${data.rewards.gold} 🪙</span>
            <span>+${data.rewards.diamonds} 💎</span>
            ${data.rewards.energyPotionsDropped > 0 ? `<span>+${data.rewards.energyPotionsDropped} 🧪 Potion d'Énergie</span>` : ''}
          </div>` : ''}
        ${passiveRecapHtml}
        ${captureHtml}
        <button class="btn-primary" id="btn-back-lobby">Retour au lobby</button>
      </div>
    `;

    document.getElementById('btn-back-lobby')?.addEventListener('click', () => {
      CombatEngine.reset();
      _battle = null;
      AudioSystem.playGlobal();
      renderCombatLobby();
    });

    controls.querySelectorAll('.btn-capture').forEach(btn => {
      btn.addEventListener('click', () => {
        const res = CombatEngine.attemptCapture(btn.dataset.iid);
        const revealEl = document.getElementById('capture-reveal');
        const logEl    = document.getElementById('capture-log');
        btn.disabled = true;
        if (res?.success) {
          btn.style.background = '#4ade80';
          btn.textContent = '✓ Capturé !';
          const awakeningMax = _checkAwakeningMaxAndGrantPill(res.addResult);
          _updateHUD();
          _playCaptureReveal(revealEl, btn.dataset.charId, res.addResult, awakeningMax);
        } else {
          btn.style.background = '#f87171';
          btn.textContent = '✗ Raté';
          if (logEl) logEl.innerHTML += `<div class="log-line">Le créature s'échappe...</div>`;
        }
      });
    });
  }

  /**
   * Joue l'animation de révélation (retournement de carte) d'un créature capturé,
   * en réutilisant exactement le même système que pour une obtention par Expédition :
   * "NOUVEAU !" s'il vient de rejoindre la collection, "Évolution Avancée +1" s'il était déjà
   * possédé, ou "AWAKENING MAX" avec Pillule de Puissance s'il atteint le palier max.
   * @param {HTMLElement} container - où injecter la carte
   * @param {string} charId - ID de la définition du créature capturé
   * @param {{isNew:boolean, awakening:boolean, instance:object}} addResult
   * @param {boolean} awakeningMax
   */
  function _playCaptureReveal(container, charId, addResult, awakeningMax) {
    if (!container || !addResult) return;
    const state = GameState.get();
    const char  = GameState.getCharDef(charId);
    if (!char) return;

    // Remplace toute révélation précédente plutôt que de l'empiler dessous
    container.innerHTML = '';

    const wrapId = `capture-reveal-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const holder = document.createElement('div');
    holder.className = 'capture-reveal-holder';
    holder.innerHTML = `
      <div class="gacha-card-wrap" id="${wrapId}">
        <div class="gacha-card-inner">
          <div class="gacha-card-back">
            <div class="gacha-card-back-glow"></div>
            <div class="gacha-card-back-icon">✦</div>
          </div>
          <div class="gacha-card-front"></div>
        </div>
      </div>
    `;
    container.appendChild(holder);

    const result = { char, isNew: addResult.isNew, awakening: addResult.awakening, awakeningMax };
    setTimeout(() => _flipCard(null, result, state, wrapId), 250);
  }

  // ─── GACHA ────────────────────────────────────────────────────────────────────

  function renderExpédition() {
    const el = document.getElementById('screen-gacha');
    if (!el) return;
    const state = GameState.get();

    el.innerHTML = `
      <div class="screen-header"><h2>💎 Invocations</h2></div>
      <div class="gacha-tabs">
        <button class="gacha-tab ${_gachaTab === 'chars' ? 'active' : ''}" data-tab="chars">💎 Créatures</button>
        <button class="gacha-tab ${_gachaTab === 'equip' ? 'active' : ''}" data-tab="equip">⚙️ Équipements</button>
      </div>
      <div id="gacha-tab-content"></div>
      <div id="gacha-results"></div>
    `;

    el.querySelectorAll('.gacha-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        _gachaTab = btn.dataset.tab;
        document.querySelectorAll('.gacha-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === _gachaTab));
        _renderExpéditionTabContent();
        document.getElementById('gacha-results').innerHTML = '';
      });
    });

    _renderExpéditionTabContent();
  }

  function _renderExpéditionTabContent() {
    const el = document.getElementById('gacha-tab-content');
    if (!el) return;
    const state = GameState.get();

    if (_gachaTab === 'chars') {
      const cfg     = state.config.gacha;
      const evt     = (typeof EventSystem !== 'undefined') ? EventSystem.getActiveOrPending() : null;

      // Séparer bannière(s) event et bannières normales
      const eventBanners  = state.banners.filter(b => b.active && b.isEventBanner);
      const normalBanners = state.banners.filter(b => b.active && !b.isEventBanner);

      const RCOLORS = { common:'#9ca3af',uncommon:'#6fcc6f',rare:'#60a5fa',epic:'#c084fc',legendary:'#fbbf24',mythic:'#f87171' };

      const renderBannerCard = (b, isEvent = false) => {
        const wrapStyle    = isEvent
          ? 'background:linear-gradient(135deg,#0a2a15,#112a10);border:2px solid #d4af37;box-shadow:0 0 18px rgba(212,175,55,.25);'
          : '';
        const h3Style = isEvent ? 'color:#d4af37;' : '';
        const btnExtraClass = isEvent ? ' btn-event-gacha' : '';

        // Bloc déroulant des animaux de la bannière (avec couleurs par rareté)
        let featuredBlock = '';
        if (isEvent && b.featured?.length) {
          const pills = b.featured.map(cid => {
            const def = state.characters.find(c => c.id === cid);
            if (!def) return '';
            const col = RCOLORS[def.rarity] || '#888';
            return '<span style="font-size:.65rem;padding:2px 8px;border-radius:999px;background:var(--surface-2);color:'
              + col + ';border:1px solid ' + col + '44;white-space:nowrap;">' + def.name + '</span>';
          }).filter(Boolean).join('');
          featuredBlock = '<details style="margin:8px 0 4px;">'
            + '<summary style="font-size:.72rem;color:#d4af37;cursor:pointer;font-weight:700;list-style:none;display:flex;align-items:center;gap:6px;">'
            + '<span style="font-size:.8rem;">▶</span> '
            + b.featured.length + ' espèce' + (b.featured.length > 1 ? 's' : '') + ' invocables'
            + '</summary>'
            + '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;">' + pills + '</div>'
            + '</details>';
        } else if (!isEvent && b.featured?.length) {
          const pills = b.featured.slice(0, 6).map(cid => {
            const def = state.characters.find(c => c.id === cid);
            if (!def) return '';
            const col = RCOLORS[def.rarity] || '#888';
            return '<span style="font-size:.65rem;padding:1px 7px;border-radius:999px;background:var(--surface-2);color:'
              + col + ';border:1px solid ' + col + '44;">' + def.name + '</span>';
          }).filter(Boolean).join('');
          featuredBlock = '<div style="display:flex;flex-wrap:wrap;gap:4px;margin:8px 0 4px;">'
            + pills
            + (b.featured.length > 6 ? '<span style="font-size:.65rem;color:var(--text-faint);">+' + (b.featured.length - 6) + '</span>' : '')
            + '</div>';
        }

        const evtBadge = isEvent
          ? '<div style="font-size:.68rem;color:#d4af37;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;gap:5px;">'
            + '<span style="display:inline-block;width:18px;height:2px;background:#d4af37;border-radius:1px;"></span>'
            + '🎪 Bannière Événement'
            + '<span style="display:inline-block;width:18px;height:2px;background:#d4af37;border-radius:1px;"></span>'
            + '</div>'
          : '';

        return `
          <div class="banner-card" style="${wrapStyle}">
            ${evtBadge}
            <div class="banner-header"><h3 style="${h3Style}">${b.name}</h3><p>${b.description}</p></div>
            ${featuredBlock}
            <div class="banner-actions">
              <button class="btn-gacha btn-single${btnExtraClass}" data-banner="${b.id}">
                ✦ Invoquer ×1<br><small>${cfg.singlePullCost} 💎</small>
              </button>
              <button class="btn-gacha btn-ten${btnExtraClass}" data-banner="${b.id}">
                ✦✦ Invoquer ×10<br><small>${cfg.tenPullCost} 💎</small>
              </button>
            </div>
          </div>`;
      };

      el.innerHTML = `
        <div class="gacha-currency">
          <span class="hud-icon">💎</span>
          <span>${state.player.currency.crystals.toLocaleString()} Cristaux</span>
        </div>
        <div class="banner-list">
          ${eventBanners.map(b => renderBannerCard(b, true)).join('')}
          ${normalBanners.map(b => renderBannerCard(b, false)).join('')}
        </div>`;

      el.querySelectorAll('.btn-single').forEach(btn => btn.addEventListener('click', () => _doExpéditionPull(btn.dataset.banner, 1)));
      el.querySelectorAll('.btn-ten').forEach(btn => btn.addEventListener('click', () => _doExpéditionPull(btn.dataset.banner, 10)));

    } else {
      // Expédition équipements
      const equipBanners = (state.equipBanners || []).filter(b => b.active);
      el.innerHTML = `
        <div class="gacha-currency">
          <span class="hud-icon">🪙</span>
          <span>${(state.player.currency.gold || 0).toLocaleString()} Or</span>
        </div>
        <div class="banner-list">
          ${equipBanners.map(b => `
            <div class="banner-card equip-banner-card">
              <div class="banner-header"><h3>${b.name}</h3><p>${b.description}</p></div>
              <div class="banner-actions">
                <button class="btn-gacha btn-single btn-equip-pull" data-banner="${b.id}" data-count="1">
                  ⚙️ Obtenir ×1<br><small>${b.singlePullCost} 🪙</small>
                </button>
                <button class="btn-gacha btn-ten btn-equip-pull" data-banner="${b.id}" data-count="10">
                  ⚙️⚙️ Obtenir ×10<br><small>${b.tenPullCost} 🪙</small>
                </button>
              </div>
            </div>`).join('')}
          ${equipBanners.length === 0 ? '<p class="empty-msg">Aucune bannière d\'équipement active.</p>' : ''}
        </div>`;
      el.querySelectorAll('.btn-equip-pull').forEach(btn => {
        btn.addEventListener('click', () => _doEquipExpéditionPull(btn.dataset.banner, Number(btn.dataset.count)));
      });
    }
  }

  function _doExpéditionPull(bannerId, count) {
    // Désactiver les boutons pendant l'animation
    document.querySelectorAll('.btn-gacha').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });

    const results = count === 1
      ? [GachaSystem.pullSingle(bannerId)]
      : GachaSystem.pullTen(bannerId);

    if (results[0]?.error) {
      _showToast(results[0].error, 'error');
      document.querySelectorAll('.btn-gacha').forEach(b => { b.disabled = false; b.style.opacity = ''; });
      return;
    }

    // ── Détection Évolution Avancée Max + attribution Pillule ──────────────────────────
    results.forEach(r => { r.awakeningMax = _checkAwakeningMaxAndGrantPill(r); });

    _updateHUD();
    _showExpéditionAnimation(results, () => {
      document.querySelectorAll('.btn-gacha').forEach(b => { b.disabled = false; b.style.opacity = ''; });
    });
  }

  /**
   * Détecte si un résultat d'obtention (gacha ou capture) atteint l'Évolution Avancée
   * maximum à un créature déjà possédé, et lui octroie une Pillule de Puissance
   * le cas échéant. Renvoie true si l'Évolution Avancée max vient d'être atteint.
   * @param {{awakening?:boolean, instance?:object}} addResult
   * @returns {boolean}
   */
  function _checkAwakeningMaxAndGrantPill(addResult) {
    const maxAwk = GameState.getConfig().awakening.maxLevel;
    const isMax = !!(addResult?.awakening && addResult.instance && (addResult.instance.awakening || 0) >= maxAwk);
    if (isMax) {
      const p = GameState.getPlayer();
      const inv = { ...(p.inventory || {}) };
      inv['item_power_pill'] = (inv['item_power_pill'] || 0) + 1;
      GameState.updatePlayer({ inventory: inv });
    }
    return isMax;
  }

  /**
   * Affiche l'animation de tirage gacha.
   * Chaque carte apparaît face cachée puis se retourne pour révéler le créature.
   * @param {Array} results - Résultats du tirage
   * @param {Function} onDone - Callback une fois l'animation terminée
   */
  function _showExpéditionAnimation(results, onDone) {
    const el = document.getElementById('gacha-results');
    if (!el) { onDone?.(); return; }

    const state = GameState.get();

    // Construire la grille de cartes dos initial
    el.innerHTML = `<div class="gacha-result-grid" id="gacha-anim-grid">
      ${results.map((_, i) => `
        <div class="gacha-card-wrap" id="gacha-card-${i}">
          <div class="gacha-card-inner">
            <div class="gacha-card-back">
              <div class="gacha-card-back-glow"></div>
              <div class="gacha-card-back-icon">✦</div>
            </div>
            <div class="gacha-card-front"></div>
          </div>
        </div>
      `).join('')}
    </div>
    <button class="btn-primary gacha-skip-btn" id="gacha-skip-btn" style="margin-top:16px;">⏩ Passer l'animation</button>`;

    el.scrollIntoView({ behavior: 'smooth' });

    let cancelled = false;
    const skipBtn = document.getElementById('gacha-skip-btn');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        cancelled = true;
        _revealAll(results, state, el, onDone);
      });
    }

    // Révéler les cartes une à une avec délai
    results.forEach((r, i) => {
      const delay = cancelled ? 0 : (results.length === 1 ? 400 : i * 220 + 300);
      setTimeout(() => {
        if (cancelled) return;
        _flipCard(i, r, state);
        // Après le dernier, retirer le bouton skip
        if (i === results.length - 1) {
          setTimeout(() => {
            const s = document.getElementById('gacha-skip-btn');
            if (s) s.style.display = 'none';
            onDone?.();
          }, 600);
        }
      }, delay);
    });
  }

  /** Retourne une carte individuelle et affiche son contenu */
  function _flipCard(index, result, state, elementId = `gacha-card-${index}`) {
    const wrap = document.getElementById(elementId);
    if (!wrap) return;

    const rarityDef = GameDatabase.RARITIES[result.char.rarity] || {};
    const t1 = state.types.find(t => t.id === result.char.type1);

    // ── Construire le statut (nouveau / Évolution Avancée / max) ────────────────────
    let statusHtml;
    if (result.awakeningMax) {
      statusHtml = `<div class="gacha-status status-awk-max">★ AWAKENING MAX ★<br><small>💊 Pillule de Puissance !</small></div>`;
    } else if (result.awakening) {
      statusHtml = `<div class="gacha-status">✨ Évolution Avancée +1</div>`;
    } else if (result.isNew) {
      statusHtml = `<div class="gacha-status status-new">✦ NOUVEAU !</div>`;
    } else {
      statusHtml = `<div class="gacha-status"></div>`;
    }

    // Remplir le front avant le flip
    const front = wrap.querySelector('.gacha-card-front');
    if (front) {
      front.innerHTML = `
        <div class="gacha-portrait" style="position:relative;overflow:hidden;">
          ${_portraitImgHtml(result.char)}
        </div>
        <div class="gacha-info">
          <div class="gacha-name">${result.char.name}</div>
          <div class="gacha-rarity" style="color:${rarityDef.color}">${rarityDef.name}</div>
          ${t1 ? `<div class="gacha-type"><span class="type-badge" style="background:${t1.color}">${t1.icon}</span></div>` : ''}
          ${statusHtml}
        </div>
      `;
    }

    // Classes spéciales pour les états
    wrap.classList.add(`rarity-${result.char.rarity}`);
    wrap.style.setProperty('--rarity-color', rarityDef.color || '#888');
    if (result.isNew)        wrap.classList.add('is-new');
    if (result.awakeningMax) wrap.classList.add('is-awk-max');

    // Déclencher le flip CSS
    wrap.classList.add('flipped');
    AudioSystem.playSfx(AudioSystem.SFX_KEYS.gachaPull);

    // ── Animations post-flip ─────────────────────────────────────────────────
    const highRarity = ['epic','legendary','mythic'].includes(result.char.rarity);
    if (highRarity) {
      setTimeout(() => wrap.classList.add('gacha-card-shine'), 500);
    }

    // Burst "Nouveau !" flottant
    if (result.isNew && !result.awakeningMax) {
      setTimeout(() => {
        const badge = document.createElement('div');
        badge.className = 'new-char-burst';
        badge.textContent = '✦ NOUVEAU !';
        wrap.appendChild(badge);
        setTimeout(() => badge.remove(), 1400);
      }, 580);
    }
  }

  /** Révèle immédiatement toutes les cartes (skip) */
  function _revealAll(results, state, el, onDone) {
    const skipBtn = document.getElementById('gacha-skip-btn');
    if (skipBtn) skipBtn.style.display = 'none';

    results.forEach((r, i) => {
      setTimeout(() => _flipCard(i, r, state), i * 40);
    });

    setTimeout(() => onDone?.(), results.length * 40 + 300);
  }

  // ─── ÉQUIPEMENT ──────────────────────────────────────────────────────────────

  /**
   * Écran principal de gestion des équipements.
   * Deux panneaux : sélection du perso + gestion des slots, et utilisation des items.
   */
  function renderEquip() {
    const el = document.getElementById('screen-equip');
    if (!el) return;
    const state  = GameState.get();
    const player = state.player;

    el.innerHTML = `
      <div class="screen-header"><h2>⚙️ Équipements</h2></div>

      <!-- ── Sélection du créature ── -->
      <div class="equip-section">
        <div class="equip-section-title" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <span>Choisir un créature</span>
          ${_renderSortSelect('equip-sort', _equipSort)}
        </div>
        <div class="equip-char-picker" id="equip-char-picker">
          ${(() => {
            let instances = player.collection;
            if (_equipShowUnequippedOnly) {
              instances = instances.filter(inst => !inst.equipment || inst.equipment.every(s => !s));
            }
            if (instances.length === 0) {
              return _equipShowUnequippedOnly
                ? '<p class="empty-msg" style="margin:0;padding:.5rem">Aucune créature sans équipement.</p>'
                : '<p class="empty-msg" style="margin:0;padding:.5rem">Aucune créature dans la collection.</p>';
            }
            return _sortDecoratedChars(_decorateInstances(instances, state), _equipSort, state).map(({ inst, def }) => {
              const rarityDef = GameDatabase.RARITIES[def.rarity] || {};
              return `<div class="equip-char-mini ${_equipCharId === inst.instanceId ? 'selected' : ''}"
                        data-iid="${inst.instanceId}"
                        style="border-top:3px solid ${rarityDef.color || '#888'}">
                <div style="width:48px;height:48px;border-radius:6px;overflow:hidden;position:relative;margin:0 auto 4px;background:var(--surface-2);">
                  ${_portraitImgHtml(def)}
                </div>
                <div class="equip-char-mini-name">${def.name}</div>
                <div class="equip-char-mini-level">Niv.${inst.level}</div>
              </div>`;
            }).join('');
          })()}
        </div>
      </div>

      <!-- ── Slots d'équipement ── -->
      <div id="equip-slots-section">
        ${_equipCharId ? _buildEquipSlots(_equipCharId, state) : '<p class="empty-msg" style="margin:0;padding:1rem">Sélectionne un créature ci-dessus.</p>'}
      </div>

      <!-- ── Inventaire équipements ── -->
      <div class="equip-section" id="equip-inv-section" style="margin-top:18px">
        <div class="equip-section-title">Équipements en stock <span class="badge">${player.equipInventory?.length || 0}</span></div>
        ${_renderEquipInventorySection()}
      </div>
    `;

    // ── Bind picker ──
    el.querySelectorAll('.equip-char-mini').forEach(card => {
      card.addEventListener('click', () => {
        _equipCharId = card.dataset.iid;
        renderEquip();
      });
    });

    document.getElementById('equip-sort')?.addEventListener('change', e => {
      _equipSort = e.target.value;
      renderEquip();
    });

    // ── Bind slots ──
    el.querySelectorAll('.equip-slot-card').forEach(card => {
      card.addEventListener('click', () => {
        const slot = parseInt(card.dataset.slot);
        if (!isNaN(slot) && _equipCharId) _openEquipSlotModal(_equipCharId, slot);
      });
    });

    // ── Bind inventaire équipement (onglets + tri + filtres) ──
    _bindEquipInventorySection();
  }

  /**
   * Génère la structure de la section "Équipements en stock" : 3 onglets
   * (Armes / Armures / Accessoires), chacun avec son propre tri et ses filtres.
   */
  function _renderEquipInventorySection() {
    return `
      <div class="equip-inv-tabs">
        ${EQUIP_SLOT_ORDER.map(slotKey => `
          <button class="equip-inv-tab-btn ${_equipInvTab === slotKey ? 'active' : ''}" data-slot-tab="${slotKey}">
            ${EQUIP_SLOT_LABELS[slotKey]}
          </button>
        `).join('')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
        <button id="btn-auto-equip" style="background:linear-gradient(135deg,var(--accent2),var(--accent2-deep));border:none;border-radius:999px;color:#fff;font-size:.74rem;font-weight:700;padding:7px 14px;cursor:pointer;white-space:nowrap">⚡ Équipement auto</button>
        <button id="btn-unequip-all" style="background:var(--danger);border:none;border-radius:999px;color:#fff;font-size:.74rem;font-weight:700;padding:7px 14px;cursor:pointer;white-space:nowrap">🗑️ Déséquiper tout</button>
        <label style="display:flex;align-items:center;gap:6px;font-size:.74rem;color:var(--text-dim);cursor:pointer;white-space:nowrap">
          <input type="checkbox" id="chk-unequipped-only" ${_equipShowUnequippedOnly ? 'checked' : ''} style="accent-color:var(--accent2)">
          Sans équipement uniquement
        </label>
      </div>
      <div class="screen-controls">
        ${_renderEquipSortSelect('equip-inv-sort', _equipInvSort[_equipInvTab])}
      </div>
      ${_renderEquipFilterBar('equip-inv', _equipInvFilters[_equipInvTab])}
      <div class="equip-inv-grid" id="equip-inv-grid"></div>
    `;
  }

  /** Lie les onglets, le tri et les filtres de la section inventaire d'équipement */
  function _bindEquipInventorySection() {
    document.querySelectorAll('.equip-inv-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _equipInvTab = btn.dataset.slotTab;
        const container = document.getElementById('equip-inv-section');
        if (container) {
          const badge = `<span class="badge">${GameState.getPlayer().equipInventory?.length || 0}</span>`;
          container.innerHTML = `<div class="equip-section-title">Équipements en stock ${badge}</div>${_renderEquipInventorySection()}`;
          _bindEquipInventorySection();
        }
      });
    });

    // Bouton déséquiper tout
    document.getElementById('btn-unequip-all')?.addEventListener('click', () => {
      _unequipAll();
      renderEquip();
    });

    // Bouton équipement automatique
    document.getElementById('btn-auto-equip')?.addEventListener('click', () => {
      _autoEquip();
      renderEquip();
    });

    // Filtre "sans équipement uniquement" — filtre la liste de persos dans le picker
    document.getElementById('chk-unequipped-only')?.addEventListener('change', e => {
      _equipShowUnequippedOnly = e.target.checked;
      _refreshEquipCharPicker();
    });

    document.getElementById('equip-inv-sort')?.addEventListener('change', e => {
      _equipInvSort[_equipInvTab] = e.target.value;
      _refreshEquipInventoryGrid();
    });
    _bindEquipFilterBar('equip-inv', _equipInvFilters[_equipInvTab], _refreshEquipInventoryGrid);

    _refreshEquipInventoryGrid();
  }

  /** Trie une liste décorée d'exemplaires d'équipement ({invInst, def}) */
  function _sortEquipInv(decorated, sortKey) {
    const rarityIndex = (r) => { const idx = RARITY_ORDER.indexOf(r); return idx === -1 ? 0 : idx; };
    const sorted = [...decorated];
    switch (sortKey) {
      case 'rarity': sorted.sort((a, b) => rarityIndex(b.def.rarity) - rarityIndex(a.def.rarity) || a.def.name.localeCompare(b.def.name)); break;
      case 'hp':     sorted.sort((a, b) => (b.def.bonuses.hp  || 0) - (a.def.bonuses.hp  || 0)); break;
      case 'atk':    sorted.sort((a, b) => (b.def.bonuses.atk || 0) - (a.def.bonuses.atk || 0)); break;
      case 'def':    sorted.sort((a, b) => (b.def.bonuses.def || 0) - (a.def.bonuses.def || 0)); break;
      case 'spd':    sorted.sort((a, b) => (b.def.bonuses.spd || 0) - (a.def.bonuses.spd || 0)); break;
      case 'name':
      default:       sorted.sort((a, b) => a.def.name.localeCompare(b.def.name)); break;
    }
    return sorted;
  }

  /** Filtre une liste décorée d'exemplaires d'équipement selon la recherche, la rareté et un seuil de stat */
  function _applyEquipFilters(decorated, filters) {
    if (!filters) return decorated;
    return decorated.filter(({ def }) => {
      if (filters.search && !def.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.rarity && def.rarity !== filters.rarity) return false;
      if (filters.statKey && filters.statMin !== '' && filters.statMin != null) {
        const val = def.bonuses[filters.statKey] || 0;
        if (val < Number(filters.statMin)) return false;
      }
      return true;
    });
  }

  /** Menu déroulant de tri pour l'inventaire d'équipement */
  function _renderEquipSortSelect(id, current) {
    return `
      <select class="sort-select" id="${id}">
        <option value="name"   ${current === 'name'   ? 'selected' : ''}>Trier : Nom (A-Z)</option>
        <option value="rarity" ${current === 'rarity' ? 'selected' : ''}>Trier : Rareté</option>
        <option value="hp"     ${current === 'hp'     ? 'selected' : ''}>Trier : PV</option>
        <option value="atk"    ${current === 'atk'    ? 'selected' : ''}>Trier : ATK</option>
        <option value="def"    ${current === 'def'    ? 'selected' : ''}>Trier : DEF</option>
        <option value="spd"    ${current === 'spd'    ? 'selected' : ''}>Trier : Vitesse</option>
      </select>
    `;
  }

  /** Barre de filtres pour l'inventaire d'équipement (recherche, rareté, seuil de stat) */
  function _renderEquipFilterBar(prefix, filters) {
    return `
      <div class="filter-bar">
        <input type="text" class="search-input" id="${prefix}-search" placeholder="Rechercher un nom..." value="${filters.search || ''}">
        <select class="sort-select" id="${prefix}-filter-rarity">
          <option value="">Toutes raretés</option>
          ${RARITY_ORDER.map(r => `<option value="${r}" ${filters.rarity === r ? 'selected' : ''}>${RARITY_LABELS_FR[r]}</option>`).join('')}
        </select>
        <div class="stat-filter-group">
          <select class="sort-select" id="${prefix}-filter-statkey">
            <option value="hp"  ${filters.statKey === 'hp'  ? 'selected' : ''}>PV ≥</option>
            <option value="atk" ${filters.statKey === 'atk' ? 'selected' : ''}>ATK ≥</option>
            <option value="def" ${filters.statKey === 'def' ? 'selected' : ''}>DEF ≥</option>
            <option value="spd" ${filters.statKey === 'spd' ? 'selected' : ''}>Vitesse ≥</option>
          </select>
          <input type="number" class="search-input stat-filter-input" id="${prefix}-filter-statmin" placeholder="min." value="${filters.statMin || ''}">
        </div>
      </div>
    `;
  }

  function _bindEquipFilterBar(prefix, filters, onChange) {
    document.getElementById(`${prefix}-search`)?.addEventListener('input', e => { filters.search = e.target.value; onChange(); });
    document.getElementById(`${prefix}-filter-rarity`)?.addEventListener('change', e => { filters.rarity = e.target.value; onChange(); });
    document.getElementById(`${prefix}-filter-statkey`)?.addEventListener('change', e => { filters.statKey = e.target.value; onChange(); });
    document.getElementById(`${prefix}-filter-statmin`)?.addEventListener('input', e => { filters.statMin = e.target.value; onChange(); });
  }

  /** Rafraîchit la grille de l'onglet d'équipement actif (filtré par slot, trié, filtré) */
  /**
   * Regroupe une liste d'exemplaires d'équipement par equipId pour gagner de la
   * place dans l'inventaire : les exemplaires NON équipés et identiques sont
   * fusionnés en une seule "pile" avec un compteur. Les exemplaires déjà équipés
   * restent affichés individuellement (chacun a un porteur distinct à montrer).
   * @param {Array<{invInst, def}>} items
   * @returns {Array<{invInst, def, instances:Array, count:number, stacked:boolean}>}
   */
  function _groupEquipStacks(items) {
    const freeGroups = {};
    const units = [];
    items.forEach(({ invInst, def }) => {
      if (invInst.equippedBy) {
        units.push({ invInst, def, instances: [invInst], count: 1, stacked: false });
      } else {
        if (!freeGroups[def.id]) freeGroups[def.id] = { def, instances: [] };
        freeGroups[def.id].instances.push(invInst);
      }
    });
    Object.values(freeGroups).forEach(group => {
      units.push({
        invInst: group.instances[0],
        def: group.def,
        instances: group.instances,
        count: group.instances.length,
        stacked: group.instances.length > 1,
      });
    });
    return units;
  }

  /** Déséquipe tous les équipements de toutes les créatures */
  function _unequipAll() {
    const state = GameState.get();
    state.player.collection.forEach(inst => {
      for (let slot = 0; slot < 3; slot++) {
        if (inst.equipment?.[slot]) {
          GameState.equipItem(inst.instanceId, slot, null);
        }
      }
    });
    _showToast('Tous les équipements ont été retirés.', 'info');
  }

  /**
   * Équipement automatique : déséquipe tout, puis équipe les meilleures pièces
   * aux meilleures créatures (classées par niveau puis rareté).
   * Stratégie : trier les créatures de la meilleure à la moins bonne, trier les
   * items par "score total de bonus" décroissant, assigner slot par slot.
   */
  function _autoEquip() {
    // 1. Déséquiper tout
    _unequipAll();

    const state = GameState.get();
    const inv   = state.player.equipInventory || [];

    // 2. Classer les créatures (meilleures en premier)
    const RARITY_W = { mythic: 6, legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
    const chars = [...state.player.collection].sort((a, b) => {
      const da = GameState.getCharDef(a.charId);
      const db = GameState.getCharDef(b.charId);
      const ra = RARITY_W[da?.rarity] || 0;
      const rb = RARITY_W[db?.rarity] || 0;
      if (b.level !== a.level) return b.level - a.level;
      return rb - ra;
    });

    // 3. Classer les items de chaque type par score total de bonus (décroissant)
    const _itemScore = (def) => Object.values(def.bonuses || {}).reduce((s, v) => s + (v || 0), 0);
    const weaponPool    = inv.filter(ei => { const d = state.equipment.find(e => e.id === ei.equipId); return d && GameDatabase.resolveEquipSlot(d) === 'weapon'; })
                             .sort((a, b) => { const da = state.equipment.find(e => e.id === a.equipId); const db = state.equipment.find(e => e.id === b.equipId); return _itemScore(db) - _itemScore(da); });
    const armorPool     = inv.filter(ei => { const d = state.equipment.find(e => e.id === ei.equipId); return d && GameDatabase.resolveEquipSlot(d) === 'armor'; })
                             .sort((a, b) => { const da = state.equipment.find(e => e.id === a.equipId); const db = state.equipment.find(e => e.id === b.equipId); return _itemScore(db) - _itemScore(da); });
    const accessoryPool = inv.filter(ei => { const d = state.equipment.find(e => e.id === ei.equipId); return d && GameDatabase.resolveEquipSlot(d) === 'accessory'; })
                             .sort((a, b) => { const da = state.equipment.find(e => e.id === a.equipId); const db = state.equipment.find(e => e.id === b.equipId); return _itemScore(db) - _itemScore(da); });

    const pools = [weaponPool, armorPool, accessoryPool];
    const poolIdx = [0, 0, 0];

    // 4. Assigner : chaque créature reçoit le meilleur item disponible pour chaque slot
    chars.forEach(inst => {
      for (let slot = 0; slot < 3; slot++) {
        const pool = pools[slot];
        if (poolIdx[slot] < pool.length) {
          GameState.equipItem(inst.instanceId, slot, pool[poolIdx[slot]].instanceId);
          poolIdx[slot]++;
        }
      }
    });

    _showToast('Équipement automatique appliqué ! ⚡', 'success');
  }

  function _refreshEquipCharPicker() {
    const state  = GameState.get();
    const player = state.player;
    const picker = document.getElementById('equip-char-picker');
    if (!picker) return;

    let instances = player.collection;
    if (_equipShowUnequippedOnly) {
      instances = instances.filter(inst =>
        !inst.equipment || inst.equipment.every(s => !s)
      );
    }

    if (instances.length === 0) {
      picker.innerHTML = '<p class="empty-msg" style="margin:0;padding:.5rem">Aucune créature sans équipement.</p>';
      return;
    }

    picker.innerHTML = _sortDecoratedChars(_decorateInstances(instances, state), _equipSort, state).map(({ inst, def }) => {
      const rarityDef = GameDatabase.RARITIES[def.rarity] || {};
      return `<div class="equip-char-mini ${_equipCharId === inst.instanceId ? 'selected' : ''}"
                data-iid="${inst.instanceId}"
                style="border-top:3px solid ${rarityDef.color || '#888'}">
        <div style="width:48px;height:48px;border-radius:6px;overflow:hidden;position:relative;margin:0 auto 4px;background:var(--surface-2);">
          ${_portraitImgHtml(def)}
        </div>
        <div class="equip-char-mini-name">${def.name}</div>
        <div class="equip-char-mini-level">Niv.${inst.level}</div>
      </div>`;
    }).join('');

    picker.querySelectorAll('.equip-char-mini').forEach(card => {
      card.addEventListener('click', () => {
        _equipCharId = card.dataset.iid;
        renderEquip();
      });
    });
  }

  function _refreshEquipInventoryGrid() {
    const state = GameState.get();
    const grid = document.getElementById('equip-inv-grid');
    if (!grid) return;

    const inv = state.player.equipInventory || [];
    const decoratedAll = inv.map(invInst => {
      const def = state.equipment.find(e => e.id === invInst.equipId);
      if (!def) return null;
      return { invInst, def };
    }).filter(Boolean).filter(({ def }) => GameDatabase.resolveEquipSlot(def) === _equipInvTab);

    const grouped  = _groupEquipStacks(decoratedAll);
    const filtered = _applyEquipFilters(grouped, _equipInvFilters[_equipInvTab]);
    const sorted   = _sortEquipInv(filtered, _equipInvSort[_equipInvTab]);

    if (sorted.length === 0) {
      grid.innerHTML = `<p class="empty-msg" style="margin:0;padding:.8rem">${decoratedAll.length === 0 ? `Aucun ${EQUIP_SLOT_LABELS[_equipInvTab].replace(/^\S+\s/, '').toLowerCase()} en stock.<br>Utilisez le Expédition Équipements !` : 'Aucun équipement ne correspond aux filtres.'}</p>`;
      return;
    }

    grid.innerHTML = sorted.map(({ invInst, def, count, stacked }) => {
      const rarityDef = GameDatabase.RARITIES[def.rarity] || {};
      const holder = !stacked ? _describeEquippedBy(invInst.equippedBy) : null;
      return `
        <div class="equip-inv-card rarity-${def.rarity}" data-inst-id="${invInst.instanceId}" data-equip-id="${def.id}">
          ${count > 1 ? `<div class="equip-inv-stack-badge">×${count}</div>` : ''}
          <div class="equip-inv-name">${def.name}</div>
          <div class="equip-inv-rarity" style="color:${rarityDef.color}">${rarityDef.name}</div>
          <div class="equip-inv-bonuses">${_formatEquipBonuses(def.bonuses)}</div>
          ${holder ? `
            <div class="equip-inv-holder" title="Équipé par ${holder.name}">
              <span class="equip-inv-holder-portrait" style="position:relative;overflow:hidden;">${_portraitImgHtml(holder)}</span>
              <span class="equip-inv-holder-name">${holder.name}</span>
            </div>` : ''}
        </div>`;
    }).join('');
  }

  /** Construit le HTML des 3 slots d'équipement pour un créature */
  function _buildEquipSlots(instanceId, state) {
    const inst = GameState.getPlayerChar(instanceId);
    if (!inst) return '';
    const def = GameState.getCharDef(inst.charId);

    const slotsHtml = EQUIP_SLOT_ORDER.map((slotKey, slot) => {
      const invId    = inst.equipment?.[slot] || null;
      const invEntry = invId ? state.player.equipInventory.find(ei => ei.instanceId === invId) : null;
      const eqDef    = invEntry ? state.equipment.find(e => e.id === invEntry.equipId) : null;
      const rarityDef = eqDef ? (GameDatabase.RARITIES[eqDef.rarity] || {}) : {};
      return `
        <div class="equip-slot-card ${eqDef ? 'filled' : ''}" data-slot="${slot}" style="${eqDef ? `border-top:3px solid ${rarityDef.color || '#888'}` : ''}">
          <span class="equip-slot-label">${EQUIP_SLOT_LABELS[slotKey]}</span>
          ${eqDef ? `
            <span class="equip-slot-name">${eqDef.name}</span>
            <span class="equip-slot-rarity" style="color:${rarityDef.color}">${rarityDef.name}</span>
            <span class="equip-slot-bonuses">${_formatEquipBonuses(eqDef.bonuses)}</span>
            <button class="equip-remove-btn" data-slot="${slot}" data-iid="${instanceId}">Retirer</button>
          ` : `<span style="color:var(--text-faint);font-size:.75rem">Vide — Cliquer pour équiper</span>`}
        </div>`;
    }).join('');

    const rarityDef = GameDatabase.RARITIES[def.rarity] || {};
    return `
      <div class="equip-section">
        <div class="equip-section-title" style="display:flex;align-items:center;gap:8px">
          <span style="color:${rarityDef.color}">${def.name}</span>
          <span style="color:var(--text-faint);font-size:.7rem">Niv.${inst.level}</span>
        </div>
        <div class="equip-slots-row" id="equip-slots-row">
          ${slotsHtml}
        </div>
      </div>`;
  }



  /**
   * Ouvre un modal pour choisir l'équipement à mettre dans un slot.
   * Seuls les équipements correspondant au slot (Arme / Armure / Accessoire) sont proposés.
   * Un même exemplaire physique ne peut être équipé que par un seul créature à la fois :
   * ceux déjà utilisés par un autre créature sont affichés mais non sélectionnables,
   * avec un petit repère (portrait/nom) indiquant qui le porte.
   * @param {string} instanceId - ID de l'instance du créature
   * @param {number} slot - 0 (arme), 1 (armure) ou 2 (accessoire)
   */
  function _openEquipSlotModal(instanceId, slot) {
    const state    = GameState.get();
    const inst     = GameState.getPlayerChar(instanceId);
    const def      = GameState.getCharDef(inst?.charId);
    const slotKey  = EQUIP_SLOT_ORDER[slot];
    const inv      = (state.player.equipInventory || []).filter(ei => {
      const ed = state.equipment.find(e => e.id === ei.equipId);
      return ed && GameDatabase.resolveEquipSlot(ed) === slotKey;
    });
    const modal    = document.getElementById('modal');
    if (!modal) return;

    const currentInvId = inst.equipment?.[slot] || null;
    const currentDef    = currentInvId
      ? state.equipment.find(e => e.id === state.player.equipInventory.find(ei => ei.instanceId === currentInvId)?.equipId)
      : null;

    modal.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop">
        <div class="modal-box">
          <button class="modal-close" id="modal-close">✕</button>
          <h3 style="font-family:var(--font-display);margin:0 0 4px">Slot ${EQUIP_SLOT_LABELS[slotKey]}</h3>
          <p style="font-size:.8rem;color:var(--text-dim);margin:0 0 14px">Créature : ${def?.name}</p>

          ${currentInvId ? `
            <div style="margin-bottom:14px;padding:10px 14px;background:var(--surface-2);border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:space-between;gap:10px">
              <span style="font-size:.82rem">Équipé : <strong>${currentDef?.name || '?'}</strong></span>
              <button id="btn-unequip" style="background:var(--danger);border:none;border-radius:999px;color:#fff;font-size:.72rem;font-weight:700;padding:6px 12px;cursor:pointer">
                Retirer
              </button>
            </div>
          ` : ''}

          <div class="equip-section-title" style="margin-bottom:8px">Choisir dans l'inventaire</div>
          ${inv.length === 0
            ? `<p class="empty-msg" style="margin:0;padding:.8rem">Aucun équipement de type ${EQUIP_SLOT_LABELS[slotKey]} en stock.<br>Faites du Expédition Équipements !</p>`
            : `<div class="equip-inv-grid" id="equip-pick-grid">
                ${_groupEquipStacks(inv.map(ei => {
                  const ed = state.equipment.find(e => e.id === ei.equipId);
                  return ed ? { invInst: ei, def: ed } : null;
                }).filter(Boolean)).map(({ invInst: ei, def: ed, count, stacked }) => {
                  const rd = GameDatabase.RARITIES[ed.rarity] || {};
                  const isCurrent = !stacked && ei.instanceId === currentInvId;
                  const usedElsewhere = !stacked && ei.equippedBy && !isCurrent;
                  const holder = usedElsewhere ? _describeEquippedBy(ei.equippedBy) : null;
                  const locked = isCurrent || usedElsewhere;
                  return `
                    <div class="equip-inv-card rarity-${ed.rarity} ${isCurrent ? 'current-equip' : ''} ${usedElsewhere ? 'used-elsewhere' : ''}"
                         data-equip-id="${ed.id}" data-inst-id="${ei.instanceId}"
                         style="${locked ? 'opacity:.5;pointer-events:none' : 'cursor:pointer'}">
                      ${count > 1 ? `<div class="equip-inv-stack-badge">×${count}</div>` : ''}
                      <div class="equip-inv-name">${ed.name}</div>
                      <div class="equip-inv-rarity" style="color:${rd.color}">${rd.name}</div>
                      <div class="equip-inv-bonuses">${_formatEquipBonuses(ed.bonuses)}</div>
                      ${isCurrent ? '<div style="font-size:.62rem;color:var(--accent);margin-top:4px">Actuellement équipé</div>' : ''}
                      ${holder ? `
                        <div class="equip-inv-holder" title="Équipé par ${holder.name}">
                          <span class="equip-inv-holder-portrait" style="position:relative;overflow:hidden;">${_portraitImgHtml(holder)}</span>
                          <span class="equip-inv-holder-name">Porté par ${holder.name}</span>
                        </div>` : ''}
                    </div>`;
                }).join('')}
              </div>`}
        </div>
      </div>`;

    modal.style.display = 'block';
    document.getElementById('modal-close')?.addEventListener('click', _closeModal);
    document.getElementById('modal-backdrop')?.addEventListener('click', e => { if (e.target === e.currentTarget) _closeModal(); });

    document.getElementById('btn-unequip')?.addEventListener('click', () => {
      GameState.equipItem(instanceId, slot, null);
      _closeModal();
      renderEquip();
    });

    modal.querySelectorAll('#equip-pick-grid .equip-inv-card').forEach(card => {
      card.addEventListener('click', () => {
        const result = GameState.equipItem(instanceId, slot, card.dataset.instId);
        if (result?.success) {
          _showToast('Équipement posé !', 'success');
        } else {
          _showToast("Cet équipement est déjà porté par un autre créature.", 'error');
        }
        _closeModal();
        renderEquip();
      });
    });
  }

  // ─── GACHA ÉQUIPEMENTS ────────────────────────────────────────────────────────

  /** Effectue un tirage de gacha d'équipement */
  function _doEquipExpéditionPull(bannerId, count) {
    const state  = GameState.get();
    const banner = (state.equipBanners || []).find(b => b.id === bannerId);
    if (!banner) return;

    const cost   = count === 1 ? banner.singlePullCost : banner.tenPullCost;
    const player = GameState.getPlayer();
    if ((player.currency.gold || 0) < cost) {
      _showToast('Or insuffisant !', 'error');
      return;
    }

    document.querySelectorAll('.btn-equip-pull').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });

    GameState.modifyResources({ gold: -cost });

    const results = [];
    for (let i = 0; i < count; i++) {
      results.push(_rollEquipPull(banner, state));
    }

    if (typeof QuestSystem !== 'undefined') QuestSystem.trackPullEquip(count);

    _updateHUD();
    _showEquipResults(results, () => {
      document.querySelectorAll('.btn-equip-pull').forEach(b => { b.disabled = false; b.style.opacity = ''; });
    });
  }

  /** Tire un équipement aléatoire selon les taux de la bannière */
  function _rollEquipPull(banner, state) {
    const rarity = _rollEquipRarity(banner);
    const pool   = state.equipment.filter(e => e.rarity === rarity);
    const def    = pool.length > 0
      ? pool[Math.floor(Math.random() * pool.length)]
      : state.equipment[Math.floor(Math.random() * state.equipment.length)];

    if (!def) return null;

    const instance = {
      instanceId: `einst_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      equipId:    def.id,
      obtainedAt: Date.now(),
      equippedBy: null,
    };

    const p = GameState.getPlayer();
    const updatedInv = [...(p.equipInventory || []), instance];
    GameState.updatePlayer({ equipInventory: updatedInv });

    return { equip: def, instance };
  }

  /** Tire une rareté selon les dropRates de la bannière */
  function _rollEquipRarity(banner) {
    const rates = banner.dropRates || {};
    const roll  = Math.random() * 100;
    let cum     = 0;
    const order = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
    for (const r of order) {
      cum += (rates[r] || 0);
      if (roll < cum) return r;
    }
    return 'common';
  }

  /** Affiche les résultats du gacha équipement sous forme de cartes */
  function _showEquipResults(results, onDone) {
    const el = document.getElementById('gacha-results');
    if (!el) { onDone?.(); return; }

    el.innerHTML = `
      <div class="equip-result-grid">
        ${results.filter(Boolean).map((r, i) => {
          const rarityDef = GameDatabase.RARITIES[r.equip.rarity] || {};
          const delay     = i * 80;
          return `
            <div class="equip-result-card rarity-${r.equip.rarity}" style="animation-delay:${delay}ms">
              <div class="equip-result-icon">⚙️</div>
              <div class="equip-result-name">${r.equip.name}</div>
              <div class="equip-result-rarity" style="color:${rarityDef.color}">${rarityDef.name}</div>
              <div class="equip-result-bonuses">${_formatEquipBonuses(r.equip.bonuses)}</div>
            </div>`;
        }).join('')}
      </div>`;

    el.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => onDone?.(), results.length * 80 + 400);
  }

  // ─── INVENTAIRE (objets génériques) ──────────────────────────────────────────

  let _inventoryPendingItemId = null; // objet en attente de sélection de cible (créature)

  /** Rendu de l'écran "Inventaire" (onglet de navigation principal). */
  function renderInventory() {
    const el = document.getElementById('screen-inventory');
    if (!el) return;

    const state = GameState.get();
    const player = state.player;
    const owned = (state.items || []).filter(def => (player.inventory?.[def.id] || 0) > 0);

    el.innerHTML = `
      <div class="screen-header"><h2>🎒 Inventaire</h2></div>
      ${owned.length === 0
        ? '<p class="empty-msg">Aucun objet en stock. Trouve-en en jouant ou achète-en à la Boutique !</p>'
        : `<div class="inventory-list" id="inventory-list"></div>`}
      <div id="inventory-target-picker"></div>
    `;

    if (owned.length > 0) _renderInventoryList();
  }

  function _renderInventoryList() {
    const listEl = document.getElementById('inventory-list');
    if (!listEl) return;

    const state = GameState.get();
    const player = state.player;
    const owned = (state.items || []).filter(def => (player.inventory?.[def.id] || 0) > 0);

    listEl.innerHTML = owned.map((def) => {
      const count = player.inventory[def.id] || 0;
      const needsTarget = ItemSystem.requiresCharacterTarget(def);
      const effectLines = ItemSystem.describeEffects(def.effects);
      const isPendingTarget = _inventoryPendingItemId === def.id;
      return `
        <div class="inventory-card ${isPendingTarget ? 'is-picking-target' : ''}">
          <div class="inventory-card-icon">${def.icon || '🎁'}</div>
          <div class="inventory-card-body">
            <div class="inventory-card-name">${GameUtils.escapeHtml(def.name)}</div>
            ${def.description ? `<div class="inventory-card-desc">${GameUtils.escapeHtml(def.description)}</div>` : ''}
            <div class="inventory-card-effects">${effectLines.map(l => `<span class="quest-reward-chip">${l}</span>`).join('')}</div>
          </div>
          <div class="inventory-card-side">
            <span class="inventory-card-count">×${count}</span>
            <button class="btn-item-use" data-item-id="${def.id}" data-needs-target="${needsTarget ? '1' : '0'}">
              ${isPendingTarget ? 'Annuler' : 'Utiliser'}
            </button>
          </div>
        </div>`;
    }).join('');

    listEl.querySelectorAll('.btn-item-use').forEach(btn => {
      btn.addEventListener('click', () => {
        const itemId = btn.dataset.itemId;
        const needsTarget = btn.dataset.needsTarget === '1';
        if (_inventoryPendingItemId === itemId) {
          _inventoryPendingItemId = null;
          _renderInventoryList();
          document.getElementById('inventory-target-picker').innerHTML = '';
          return;
        }
        if (needsTarget) {
          _inventoryPendingItemId = itemId;
          _renderInventoryList();
          _renderInventoryTargetPicker(itemId);
        } else {
          _runUseItem(itemId, null);
        }
      });
    });
  }

  /** Affiche un sélecteur de créature pour les objets qui ciblent un personnage. */
  function _renderInventoryTargetPicker(itemId) {
    const host = document.getElementById('inventory-target-picker');
    if (!host) return;
    const state = GameState.get();
    const player = state.player;

    if (player.collection.length === 0) {
      host.innerHTML = '<p class="empty-msg">Aucune créature dans ta collection.</p>';
      return;
    }

    host.innerHTML = `
      <div class="equip-section" style="margin-top:14px;">
        <div class="equip-section-title">Choisis une créature</div>
        <div class="equip-char-picker">
          ${_decorateInstances(player.collection, state).map(({ inst, def }) => {
            const rarityDef = GameDatabase.RARITIES[def.rarity] || {};
            return `<div class="equip-char-mini" data-iid="${inst.instanceId}" style="border-top:3px solid ${rarityDef.color || '#888'}">
              <div style="width:48px;height:48px;border-radius:6px;overflow:hidden;position:relative;margin:0 auto 4px;background:var(--surface-2);">
                ${_portraitImgHtml(def)}
              </div>
              <div class="equip-char-mini-name">${def.name}</div>
              <div class="equip-char-mini-level">Niv.${inst.level}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
    host.querySelectorAll('.equip-char-mini').forEach(card => {
      card.addEventListener('click', () => _runUseItem(itemId, card.dataset.iid));
    });
  }

  /** Exécute réellement l'utilisation d'un objet et affiche le résultat. */
  function _runUseItem(itemId, targetInstanceId) {
    const res = ItemSystem.useItem(itemId, targetInstanceId);
    if (!res.success) {
      _showToast(res.error || 'Impossible d\'utiliser cet objet.', 'error');
      return;
    }

    _inventoryPendingItemId = null;
    AudioSystem.playSfx(AudioSystem.SFX_KEYS.levelUp);

    // Message de résumé selon les effets appliqués
    const lines = [];
    let evolved = null;
    res.results.forEach((r) => {
      if (r.type === 'gainEnergy' || r.type === 'healEnergyFull') lines.push(`+${r.amount} ⚡`);
      if (r.type === 'grantCurrency') {
        if (r.crystals) lines.push(`+${r.crystals} 💎`);
        if (r.gold) lines.push(`+${r.gold} 🪙`);
      }
      if (r.type === 'gainPlayerXp') lines.push(`+${r.amount} 🌟 XP`);
      if (r.type === 'gainCharLevel' || r.type === 'gainCharXp') {
        if (r.evolved) evolved = r.evolved;
      }
    });
    const targetName = res.targetDef?.name ? ` sur ${res.targetDef.name}` : '';
    _showToast(`${res.itemDef.icon || ''} ${res.itemDef.name} utilisé${targetName} ! ${lines.join(' ')}`.trim(), 'success');

    if (evolved) setTimeout(() => _showEvolutionShowcase([evolved]), 350);

    renderInventory();
    if (_currentScreen === 'specimens') renderSpecimens();
    _updateHUD();
  }

  // ─── BOUTIQUE ─────────────────────────────────────────────────────────────────

  let _shopFilter = 'all'; // 'all' | 'equipment' | 'item' | 'character'

  /** Rendu de l'écran "Boutique" (onglet de navigation principal). */
  function renderShop() {
    const el = document.getElementById('screen-shop');
    if (!el) return;
    el.innerHTML = `
      <div class="screen-header"><h2>🛒 Boutique</h2></div>
      <div id="shop-grid"></div>
    `;
    _renderShopGrid();
  }


  // ── Rotation quotidienne du marché ─────────────────────────────────────────
  function _getShopDailyRotation() {
    const today  = GameUtils.todayKey();
    const player = GameState.getPlayer();
    const cached = player.shopDailyRotation;
    const ROTATION_VERSION = 2; // Incrémenter si la structure de rotation change
    if (cached?.dayKey === today && cached?.v === ROTATION_VERSION) return cached;

    const state = GameState.get();
    const evt   = (typeof EventSystem !== 'undefined') ? EventSystem.getActiveOrPending() : null;

    // 3 créatures du tag event en boutique
    let eventCharIds = [];
    if (evt) {
      const pool = EventSystem.getBaseCharsForTag(evt.tagId)
        .filter(c => (state.shopItems || []).some(s => s.active && s.category === 'character' && s.refId === c.id));
      eventCharIds = _shuffle([...pool]).slice(0, 3).map(c => c.id);
    }

    // 9 articles aléatoires hors items fixes (pill/potion) et hors event chars
    const fixedIds     = new Set(['item_power_pill', 'item_energy_potion']);
    const eventCharSet = new Set(eventCharIds);
    const regularPool  = (state.shopItems || []).filter(s => {
      if (!s.active) return false;
      if (s.category === 'item' && fixedIds.has(s.refId)) return false;
      if (s.category === 'character' && eventCharSet.has(s.refId)) return false;
      return true;
    });
    const regularIds = _shuffle([...regularPool]).slice(0, 12).map(s => s.id);

    const rotation = { dayKey: today, v: ROTATION_VERSION, eventCharIds, regularIds };
    GameState.updatePlayer({ shopDailyRotation: rotation });
    return rotation;
  }

  function _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function _renderShopGrid() {
    const gridEl = document.getElementById('shop-grid');
    if (!gridEl) return;
    const state    = GameState.get();
    const evt      = (typeof EventSystem !== 'undefined') ? EventSystem.getActiveOrPending() : null;
    const rotation = _getShopDailyRotation();

    const RCOLORS = { common:'#9ca3af',uncommon:'#6fcc6f',rare:'#60a5fa',epic:'#c084fc',legendary:'#fbbf24',mythic:'#f87171' };

    const renderCard = (shopItem, refDef, opts = {}) => {
      const { originalPrice = null, reducedPrice = null, isEvent = false } = opts;
      const { remaining, blocked } = ShopSystem.getPurchaseAvailability(shopItem);
      const currencyIcon = shopItem.currency === 'gold' ? '🪙' : '💎';
      const visual = shopItem.category === 'character'
        ? (refDef.portrait
            ? `<img class="shop-card-portrait" src="${refDef.portrait}" alt="${refDef.name}">`
            : `<div class="shop-card-icon">${refDef.name.charAt(0)}</div>`)
        : `<div class="shop-card-icon">${refDef.icon || (shopItem.category === 'equipment' ? '⚙️' : '🎁')}</div>`;

      const rarityCol  = RCOLORS[refDef.rarity] || '#888';
      const rarityBorder = shopItem.category !== 'item' ? `border-color:${rarityCol};box-shadow:0 0 0 1px ${rarityCol}22;` : '';
      const eventBorder  = isEvent ? 'border-color:#d4af37;box-shadow:0 0 0 2px rgba(212,175,55,.2);' : '';
      const limitText = shopItem.limit?.type === 'daily'
        ? `Limite : ${remaining}/${shopItem.limit.amount} aujourd'hui`
        : shopItem.limit?.type === 'lifetime'
          ? `Limite : ${remaining}/${shopItem.limit.amount} au total`
          : '';
      const priceHtml = (isEvent && originalPrice !== null && reducedPrice !== null)
        ? `<div style="display:flex;align-items:center;gap:5px;justify-content:center;margin:4px 0;">
             <span style="text-decoration:line-through;color:var(--text-faint);font-size:.75rem;">${originalPrice} ${currencyIcon}</span>
             <span style="color:#d4af37;font-weight:800;font-size:.95rem;">${reducedPrice} ${currencyIcon}</span>
           </div>`
        : `<div class="shop-card-price">${shopItem.price} ${currencyIcon}</div>`;
      const evtAttr = (isEvent && reducedPrice !== null) ? ` data-evt-price="${reducedPrice}"` : '';

      return `
        <div class="shop-card ${blocked ? 'is-blocked' : ''}" style="${rarityBorder}${eventBorder}">
          ${isEvent ? '<div class="shop-card-event-badge">✦ PROMO EVENT ✦</div>' : ''}
          ${visual}
          <div class="shop-card-name">${GameUtils.escapeHtml(refDef.name)}</div>
          ${limitText ? `<div class="shop-card-limit">${limitText}</div>` : ''}
          ${priceHtml}
          <button class="shop-buy-btn" data-shop-id="${shopItem.id}"${evtAttr} ${blocked ? 'disabled' : ''}>
            ${blocked ? 'Épuisé' : 'Acheter'}
          </button>
        </div>`;
    };

    // ── LIGNE 1 : Pillule de Puissance + Potion d'Énergie (fixes, toujours visibles)
    const pinned = ['item_power_pill', 'item_energy_potion'].map(itemId => {
      const s = (state.shopItems || []).find(sh => sh.active && sh.category === 'item' && sh.refId === itemId);
      const d = state.items.find(i => i.id === itemId);
      return (s && d) ? renderCard(s, d) : '';
    }).join('');

    // ── LIGNE 2 : 3 créatures du tag event avec réduction
    let evtSectionHtml = '';
    if (evt && rotation.eventCharIds?.length) {
      const disc = evt.shopDiscountPct || 0;
      const evtCards = rotation.eventCharIds.map(charId => {
        const s = (state.shopItems || []).find(sh => sh.active && sh.category === 'character' && sh.refId === charId);
        const d = state.characters.find(c => c.id === charId);
        if (!s || !d) return '';
        const orig = s.price;
        const red  = Math.max(1, Math.round(orig * (1 - disc / 100)));
        return renderCard(s, d, { originalPrice: orig, reducedPrice: red, isEvent: true });
      }).join('');
      if (evtCards.replace(/\s/g, '')) {
        evtSectionHtml = `
          <div class="shop-section shop-section-event">
            <div class="shop-section-header shop-section-header-event">
              <span class="shop-section-icon">🎪</span>
              <span>${evt.customTitle || ('Offres ' + evt.tagLabel)}</span>
              ${disc ? '<span class="shop-evt-discount">-' + disc + '%</span>' : ''}
              <span class="shop-section-sub" style="margin-left:auto;">Fin le ${GameUtils.formatDate(evt.endDate)}</span>
            </div>
            <div class="shop-grid-inner">${evtCards}</div>
          </div>`;
      }
    }

    // ── LIGNES 3-5 : 9 articles aléatoires du jour
    const regularCards = rotation.regularIds.map(shopId => {
      const s = (state.shopItems || []).find(sh => sh.id === shopId && sh.active);
      if (!s) return '';
      let d;
      if (s.category === 'equipment') d = state.equipment.find(e => e.id === s.refId);
      else if (s.category === 'item') d = state.items.find(i => i.id === s.refId);
      else d = state.characters.find(c => c.id === s.refId);
      return (d) ? renderCard(s, d) : '';
    }).join('');

    const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate()+1); d.setHours(0,0,0,0); return d.getTime(); })();
    if (!pinned && !evtSectionHtml && !regularCards) {
      gridEl.innerHTML = '<p class="empty-msg">Aucun article disponible pour le moment.</p>';
      return;
    }

    gridEl.innerHTML = `
      <div style="font-size:.72rem;color:var(--text-faint);text-align:right;margin-bottom:12px;">
        🔄 Renouvellement dans <strong id="shop-refresh-cd">${typeof _questCountdown === 'function' ? _questCountdown(tomorrow) : '—'}</strong>
      </div>
      ${pinned ? `
        <div class="shop-section">
          <div class="shop-section-header">
            <span class="shop-section-icon">📦</span>
            <span>Consommables</span>
          </div>
          <div class="shop-grid-inner">${pinned}</div>
        </div>` : ''}
      ${evtSectionHtml}
      ${regularCards ? `
        <div class="shop-section">
          <div class="shop-section-header">
            <span class="shop-section-icon">🛒</span>
            <span>Sélection du jour</span>
            <span class="shop-section-sub">12 articles renouvelés chaque jour</span>
          </div>
          <div class="shop-grid-inner">${regularCards}</div>
        </div>` : ''}
    `;

    // Timer renouvellement (utilise _questCountdown défini dans la section Missions)
    if (window._shopCdTimer) clearInterval(window._shopCdTimer);
    window._shopCdTimer = setInterval(() => {
      const el = document.getElementById('shop-refresh-cd');
      if (el && typeof _questCountdown === 'function') el.textContent = _questCountdown(tomorrow);
    }, 1000);

    gridEl.querySelectorAll('.shop-buy-btn[data-evt-price]:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => _runShopPurchaseEvent(btn.dataset.shopId, parseInt(btn.dataset.evtPrice, 10)));
    });
    gridEl.querySelectorAll('.shop-buy-btn:not([data-evt-price]):not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => _runShopPurchase(btn.dataset.shopId));
    });
  }

  /** Achat normal (consommables + sélection du jour) */
  function _runShopPurchase(shopItemId) {
    const res = ShopSystem.purchase(shopItemId);
    if (!res.success) { _showToast(res.error || 'Achat impossible.', 'error'); return; }
    AudioSystem.playSfx(AudioSystem.SFX_KEYS.gachaPull);
    const icon = res.category === 'item' ? (res.refDef.icon || '🎁')
               : res.category === 'equipment' ? '⚙️' : '✦';
    let msg = `${icon} ${res.refDef.name} acheté !`;
    if (res.category === 'character' && res.addResult?.awakening) msg = `${res.refDef.name} déjà possédé : éveil ! ✦`;
    _showToast(msg, 'success');
    _renderShopGrid();
    _updateHUD();
  }

  /** Achat event (prix réduit appliqué temporairement) */
  function _runShopPurchaseEvent(shopItemId, reducedPrice) {
    const state    = GameState.get();
    const shopItem = (state.shopItems || []).find(s => s.id === shopItemId);
    if (!shopItem) { _showToast('Article introuvable.', 'error'); return; }
    const orig = shopItem.price;
    shopItem.price = reducedPrice;
    const res = ShopSystem.purchase(shopItemId);
    shopItem.price = orig;
    if (!res.success) { _showToast(res.error || 'Achat impossible.', 'error'); return; }
    AudioSystem.playSfx(AudioSystem.SFX_KEYS.gachaPull);
    let msg = `${res.refDef.name} acheté au prix event 🎪 !`;
    if (res.category === 'character' && res.addResult?.awakening) msg = `${res.refDef.name} déjà possédé : éveil ! ✦`;
    _showToast(msg, 'success');
    _renderShopGrid();
    _updateHUD();
  }


  function refDefIcon(res) {
    if (res.category === 'item') return res.refDef.icon || '🎁';
    if (res.category === 'equipment') return '⚙️';
    return '✦';
  }

  // ─── POKÉDEX ─────────────────────────────────────────────────────────────────

  function renderAtlas() {
    const el = document.getElementById('screen-atlas');
    if (!el) return;
    const state   = GameState.get();
    const bestiaire = state.player.bestiaire;
    const allChars = state.characters;

    // Progression globale (sur tous les créatures)
    const discovered = Object.keys(bestiaire).length;
    const total = allChars.length;
    const pct = total ? Math.round((discovered / total) * 100) : 0;

    // N'afficher que les premières formes (evolutionStage === 0)
    // Grouper tous les créatures par lignée pour pouvoir les retrouver au clic
    const baseChars = allChars.filter(c => c.evolutionStage === 0);

    el.innerHTML = `
      <div class="screen-header"><h2>📖 Bestiaire</h2></div>
      <div class="bestiaire-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="progress-text">${discovered} / ${total} découverts (${pct}%)</div>
      </div>
      <div class="bestiaire-grid">
        ${baseChars.map(char => {
          const entry = bestiaire[char.id];
          const types = state.types;
          const t1 = types.find(t => t.id === char.type1);
          const rarityDef = GameDatabase.RARITIES[char.rarity] || {};
          // Compter les formes découvertes dans la lignée
          const lineChars = allChars.filter(c => c.evolutionLine === char.evolutionLine);
          const lineDiscovered = lineChars.filter(c => bestiaire[c.id]).length;
          return `
          <div class="bestiaire-entry ${entry ? 'discovered' : 'unknown'}" data-line="${char.evolutionLine}" style="cursor:pointer">
            <div class="bestiaire-portrait" style="position:relative;overflow:hidden;">
              ${entry && char.portrait ? _portraitImgHtml(char) :
                entry ? `<div class="portrait-ph">${char.name.charAt(0)}</div>` :
                `<div class="unknown-silhouette">?</div>`}
            </div>
            <div class="bestiaire-info">
              <div class="bestiaire-name">${entry ? char.name : '???'}</div>
              <div class="bestiaire-rarity" style="color:${rarityDef.color}">${entry ? rarityDef.name : ''}</div>
              ${entry && t1 ? `<span class="type-badge" style="background:${t1.color}">${t1.icon}</span>` : ''}
              ${lineChars.length > 1
                ? `<div class="bestiaire-line-count">${lineDiscovered}/${lineChars.length} formes</div>`
                : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    `;

    // Clic sur une entrée → modal de la lignée évolutive
    el.querySelectorAll('.bestiaire-entry').forEach(entry => {
      entry.addEventListener('click', () => _openBestiaireLine(entry.dataset.line));
    });
  }

  /**
   * Ouvre un modal affichant toutes les formes d'une lignée évolutive.
   * Les formes débloquées sont affichées en 540×675, les autres en "?".
   * @param {string} evolutionLine - ID de la lignée
   */
  function _openBestiaireLine(evolutionLine) {
    const state   = GameState.get();
    const bestiaire = state.player.bestiaire;
    const types   = state.types;

    // Récupérer et trier les formes de la lignée par stade
    const lineChars = state.characters
      .filter(c => c.evolutionLine === evolutionLine)
      .sort((a, b) => a.evolutionStage - b.evolutionStage);

    if (lineChars.length === 0) return;

    const modal = document.getElementById('modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop">
        <div class="modal-box modal-bestiaire-line">
          <button class="modal-close" id="modal-close">✕</button>
          <h3 class="bestiaire-line-title">Lignée évolutive</h3>
          <div class="bestiaire-line-forms">
            ${lineChars.map((char, i) => {
              const entry    = bestiaire[char.id];
              const rarityDef = GameDatabase.RARITIES[char.rarity] || {};
              const t1 = types.find(t => t.id === char.type1);
              const t2 = char.type2 ? types.find(t => t.id === char.type2) : null;
              return `
              ${i > 0 ? '<div class="bestiaire-line-arrow">→</div>' : ''}
              <div class="bestiaire-line-form ${entry ? 'discovered' : 'unknown'}">
                <div class="bestiaire-line-portrait">
                  ${entry && char.portrait
                    ? `<img src="${char.portrait}" alt="${char.name}" style="width:100%;height:100%;object-fit:cover;object-position:center 20%;">`
                    : entry
                      ? `<div class="portrait-ph large">${char.name.charAt(0)}</div>`
                      : `<div class="unknown-silhouette large">?</div>`}
                </div>
                <div class="bestiaire-line-info">
                  <div class="bestiaire-line-name">${entry ? char.name : '???'}</div>
                  <div class="bestiaire-line-rarity" style="color:${rarityDef.color}">${entry ? rarityDef.name : ''}</div>
                  <div class="bestiaire-line-types">
                    ${entry && t1 ? `<span class="type-badge" style="background:${t1.color}">${t1.icon} ${t1.name}</span>` : ''}
                    ${entry && t2 ? `<span class="type-badge" style="background:${t2.color}">${t2.icon} ${t2.name}</span>` : ''}
                  </div>
                  ${entry && char.description ? `<div class="bestiaire-line-desc">${char.description}</div>` : ''}
                  ${entry && char.evolvesTo
                    ? `<div class="bestiaire-line-evo-hint">Évolue au niveau <strong>${char.evolutionCondition?.value || '?'}</strong></div>`
                    : ''}
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>`;

    modal.style.display = 'block';
    document.getElementById('modal-close')?.addEventListener('click', _closeModal);
    document.getElementById('modal-backdrop')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) _closeModal();
    });
  }

  // ─── TOAST ────────────────────────────────────────────────────────────────────

  function _showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('toast-show'), 10);
    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ─── API PUBLIQUE ─────────────────────────────────────────────────────────────

  return {
    init, showScreen,
    renderSpecimens, renderTeam, renderExpédition, renderEquip, renderAtlas, renderCombatLobby, renderCombatByLine,
    renderDailyQuests, renderInventory, renderShop,
    _showEvolutionShowcase,
    _updateQuestsBadge,
    _applyCombatCropOnLoad,
  };
})();

// Exposée globalement pour les attributs onload="..." des portraits combat.
function _applyCombatCropOnLoad(img) { GameUI._applyCombatCropOnLoad(img); }
