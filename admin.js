/**
 * ============================================================
 * ADMIN.JS — Interface d'administration du jeu
 * Gestion complète : créatures, types, équipements, gacha,
 * évolutions, awakening, joueurs, ressources, combat.
 * Architecture modulaire par onglets, prête pour migration online.
 * ============================================================
 */

'use strict';

const AdminPanel = (() => {

  // ─── ÉTAT INTERNE ────────────────────────────────────────────────────────────

  let _visible   = false;
  let _activeTab = 'characters';
  let _editingId = null;   // ID de l'entité en cours d'édition
  let _dragState = { kind: null, id: null, lineId: null };  // suivi du glisser-déposer en cours
  let _evoSortKey = 'name'; // 'name' | 'rarity' — ordre d'affichage des lignées dans l'onglet Évolutions

  // ─── CONSTANTES ──────────────────────────────────────────────────────────────

  const TABS = [
    // ── Créatures & Monde ──────────────────────────────
    { id: 'characters', label: '👤 Espèces'      },
    { id: 'evolutions', label: '🌀 Évolutions'   },
    { id: 'types',      label: '🔮 Types'        },
    { id: 'passives',   label: '💫 Passifs'      },
    { id: 'tags',       label: '🏷️ Tags'          },
    // ── Équipement & Économie ─────────────────────────
    { id: 'equipment',  label: '⚙️ Équipements'  },
    { id: 'items',      label: '🎁 Objets'       },
    { id: 'shop',       label: '🛒 Boutique'     },
    { id: 'gacha',      label: '🎲 Gacha'        },
    { id: 'awakening',  label: '⭐ Awakening'    },
    // ── Progression & Événements ──────────────────────
    { id: 'quests',     label: '📋 Quêtes'       },
    { id: 'daily',      label: '📅 Connexion'    },
    { id: 'event',      label: '🎪 Événement'    },
    { id: 'combat',     label: '⚔️ Combat'        },
    // ── Administration ────────────────────────────────
    { id: 'player',     label: '🎮 Joueur'       },
    { id: 'resources',  label: '💎 Ressources'   },
    { id: 'audio',      label: '🎵 Audio'        },
    { id: 'patchnotes', label: '📝 Note MàJ'     },
  ];

  const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  const RARITY_LABELS = {
    common: 'Commune', uncommon: 'Peu Commune', rare: 'Rare',
    epic: 'Épique', legendary: 'Légendaire', mythic: 'Mythique',
  };
  const EQUIP_SLOT_LABELS = { weapon: '⚔️ Arme', armor: '🛡️ Armure', accessory: '💍 Accessoire' };
  const EQUIP_SLOT_ORDER_ADMIN = ['weapon', 'armor', 'accessory'];

  // ─── INITIALISATION ──────────────────────────────────────────────────────────

  /**
   * Initialise le panneau admin et injecte le HTML dans le DOM
   */
  function init() {
    _buildPanel();
    _bindGlobalEvents();
    _bindEvtPublic();
  }

  /**
   * Construit la structure HTML du panneau admin
   */
  function _buildPanel() {
    const existing = document.getElementById('admin-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'admin-panel';
    panel.innerHTML = `
      <div id="admin-overlay"></div>
      <div id="admin-container">
        <div id="admin-header">
          <h2>⚙️ Administration — WildBeast Chronicles</h2>
          <div id="admin-header-actions">
            <button class="admin-btn admin-btn-success" onclick="AdminPanel.exportGameDatabase()" title="Exporte la config, créatures, types, bannières, passifs…">📦 Export BDD</button>
            <button class="admin-btn admin-btn-success" onclick="AdminPanel.exportPlayerData()" title="Exporte la progression du joueur actif (collection, gemmes, niveau…)">🧑 Export Joueur</button>
            <div class="admin-header-sep"></div>
            <button class="admin-btn" onclick="AdminPanel.switchAccount()" style="background:#1e3a22;border-color:#2d4a30;color:var(--text);">🔄 Changer de compte</button>
            <div class="admin-header-sep"></div>
            <button class="admin-btn admin-btn-warning" onclick="AdminPanel.importGameDatabase()" title="Importe une base de données de jeu sans toucher aux données joueur">📦 Import BDD</button>
            <button class="admin-btn admin-btn-warning" onclick="AdminPanel.importPlayerData()" title="Importe des données joueur sans toucher à la config du jeu">🧑 Import Joueur</button>
            <div class="admin-header-sep"></div>
            <button class="admin-btn admin-btn-danger"  onclick="AdminPanel.hide()">✕ Fermer</button>
          </div>
        </div>
        <div id="admin-tabs">
          <div class="admin-tab-group-label">🐾 Créatures</div>
          ${TABS.slice(0,5).map(t => `
            <button class="admin-tab ${t.id === _activeTab ? 'active' : ''}"
                    data-tab="${t.id}" onclick="AdminPanel.switchTab('${t.id}')">
              ${t.label}
            </button>`).join('')}
          <div class="admin-tab-group-label">💰 Économie</div>
          ${TABS.slice(5,10).map(t => `
            <button class="admin-tab ${t.id === _activeTab ? 'active' : ''}"
                    data-tab="${t.id}" onclick="AdminPanel.switchTab('${t.id}')">
              ${t.label}
            </button>`).join('')}
          <div class="admin-tab-group-label">📅 Progression</div>
          ${TABS.slice(10,14).map(t => `
            <button class="admin-tab ${t.id === _activeTab ? 'active' : ''}"
                    data-tab="${t.id}" onclick="AdminPanel.switchTab('${t.id}')">
              ${t.label}
            </button>`).join('')}
          <div class="admin-tab-group-label">⚙️ Admin</div>
          ${TABS.slice(14).map(t => `
            <button class="admin-tab ${t.id === _activeTab ? 'active' : ''}"
                    data-tab="${t.id}" onclick="AdminPanel.switchTab('${t.id}')">
              ${t.label}
            </button>`).join('')}
        </div>
        <div id="admin-content">
          <div id="admin-loading">Chargement...</div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    _injectStyles();
  }

  /**
   * Injecte les styles CSS dédiés à l'admin
   */
  function _injectStyles() {
    const existing = document.getElementById('admin-styles');
    if (existing) return;
    const style = document.createElement('style');
    style.id = 'admin-styles';
    style.textContent = `
      /* ════════════════════════════════════════════════════════
         ADMIN PANEL — Thème Naturaliste
         ════════════════════════════════════════════════════════ */
      #admin-panel { display:none; position:fixed; inset:0; z-index:9999; }
      #admin-panel.visible { display:flex; }
      #admin-overlay {
        position:absolute; inset:0;
        background:rgba(0,0,0,.7);
        backdrop-filter:blur(4px);
      }
      #admin-container {
        position:relative; z-index:1; margin:auto;
        width:96vw; max-width:1280px; height:93vh; height:93dvh;
        background:linear-gradient(160deg, #0d1a10, #0a1208);
        border:1px solid #253d2a;
        border-top:2px solid rgba(91,191,122,.3);
        border-radius:14px;
        display:flex; flex-direction:column; overflow:hidden;
        box-shadow:0 0 60px rgba(0,0,0,.9), 0 0 0 1px rgba(91,191,122,.08) inset;
        padding-top:env(safe-area-inset-top);
        font-family:'Inter', system-ui, sans-serif;
      }
      #admin-header {
        display:flex; align-items:center; justify-content:space-between;
        flex-wrap:wrap; gap:8px;
        padding:12px 20px;
        background:rgba(5,13,7,.6);
        border-bottom:1px solid #1a2d1f;
        flex-shrink:0;
        backdrop-filter:blur(6px);
      }
      #admin-header h2 {
        margin:0; font-size:1rem; font-weight:700;
        font-family:'Playfair Display', Georgia, serif;
        color:#c8a96e; letter-spacing:.04em;
        display:flex; align-items:center; gap:8px;
      }
      #admin-header-actions {
        display:flex; gap:6px; flex-wrap:wrap; align-items:center;
      }
      .admin-header-sep{
        width:1px; height:22px; background:rgba(255,255,255,.1); flex-shrink:0;
      }
      @media (max-width:640px){
        #admin-header-actions{ width:100%; }
        #admin-header-actions .admin-btn{ flex:1 1 auto; min-width:0; padding:7px 8px; font-size:.7rem; }
        .admin-header-sep{ display:none; }
      }

      /* ── ONGLETS ── */
      #admin-tabs {
        display:flex; flex-wrap:wrap; gap:3px; padding:8px 14px;
        background:#080f0a;
        border-bottom:1px solid #1a2d1f;
        flex-shrink:0;
      }
      .admin-tab {
        padding:7px 13px; border:1px solid transparent; border-radius:7px;
        cursor:pointer; font-size:.78rem; font-weight:500;
        background:transparent; color:#5a7a5e;
        transition:all .18s;
        min-height:34px; touch-action:manipulation;
        letter-spacing:.02em;
      }
      .admin-tab:hover { background:#132118; color:#8fa88f; border-color:#253d2a; }
      .admin-tab-group-label {
        font-size:.6rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
        color:#4a6a4a; padding:2px 4px; margin-top:2px;
      }
      .admin-tab.active {
        background:linear-gradient(135deg, #1a3d22, #132118);
        color:#5bbf7a; border-color:#2d6e3a;
        font-weight:700;
        box-shadow:0 0 0 1px rgba(91,191,122,.15) inset;
      }

      /* ── CONTENU ── */
      #admin-content {
        flex:1; overflow-y:auto; padding:20px 22px;
        -webkit-overflow-scrolling:touch; touch-action:pan-y;
        overscroll-behavior-y:contain;
      }
      #admin-content::-webkit-scrollbar{ width:5px; }
      #admin-content::-webkit-scrollbar-track{ background:transparent; }
      #admin-content::-webkit-scrollbar-thumb{ background:#253d2a; border-radius:3px; }

      /* ── SECTIONS ── */
      .admin-section { margin-bottom:28px; }
      .admin-section-title {
        font-size:.9rem; font-weight:700; color:#c8a96e;
        border-bottom:1px solid #1a2d1f; padding-bottom:7px; margin-bottom:14px;
        letter-spacing:.04em; text-transform:uppercase; font-size:.78rem;
        display:flex; align-items:center; gap:6px;
      }
      .admin-sep { border:none; border-top:1px solid #1a2d1f; margin:24px 0; }

      /* ── GRILLE ET FORMULAIRES ── */
      .admin-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px,1fr)); gap:12px; }
      .admin-field { display:flex; flex-direction:column; gap:5px; }
      .admin-field label { font-size:.75rem; color:#8fa88f; font-weight:500; letter-spacing:.02em; }
      .admin-field input, .admin-field select, .admin-field textarea {
        background:#0d1a10; border:1px solid #253d2a; border-radius:7px;
        color:#f0ede6; padding:8px 11px; font-size:.83rem; outline:none;
        font-family:'Inter', sans-serif;
        transition:border-color .18s, box-shadow .18s;
      }
      .admin-field input:focus, .admin-field select:focus, .admin-field textarea:focus {
        border-color:#5bbf7a;
        box-shadow:0 0 0 3px rgba(91,191,122,.12);
      }
      .admin-field textarea { min-height:70px; resize:vertical; }
      .admin-field select option { background:#0d1a10; }

      /* ── BOUTONS ── */
      .admin-btn {
        padding:8px 15px; border:1px solid transparent; border-radius:7px;
        cursor:pointer; font-size:.8rem; font-weight:600;
        transition:all .18s; min-height:36px; touch-action:manipulation;
        letter-spacing:.02em; font-family:'Inter', sans-serif;
      }
      .admin-btn:active{ transform:scale(.97); }
      .admin-btn-primary  { background:#132d1c; color:#5bbf7a; border-color:#253d2a; }
      .admin-btn-primary:hover  { background:#1a3d26; border-color:#5bbf7a; }
      .admin-btn-success  { background:#1a4a2a; color:#5bbf7a; border-color:#2d6e3a; }
      .admin-btn-success:hover  { background:#1f5a32; border-color:#5bbf7a; box-shadow:0 0 0 2px rgba(91,191,122,.15); }
      .admin-btn-warning  { background:#3d2e12; color:#c8a96e; border-color:#5a4420; }
      .admin-btn-warning:hover  { background:#4d3a18; border-color:#c8a96e; }
      .admin-btn-danger   { background:#3d1220; color:#e05a6a; border-color:#5a1e2e; }
      .admin-btn-danger:hover   { background:#4d1828; border-color:#e05a6a; }
      .admin-btn-secondary { background:#1a2520; color:#8fa88f; border-color:#253d2a; }
      .admin-btn-secondary:hover { background:#202e26; border-color:#8fa88f; }
      .admin-btn-sm { padding:4px 10px; font-size:.72rem; min-height:28px; border-radius:5px; }
      .admin-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; }

      /* ── LISTE D'ITEMS ── */
      .admin-list { display:flex; flex-direction:column; gap:8px; }
      .admin-list-item {
        display:flex; align-items:center; gap:10px;
        background:#0d1a10; border:1px solid #1a2d1f;
        border-radius:9px; padding:12px 14px;
        transition:border-color .15s;
      }
      .admin-list-item:hover{ border-color:#253d2a; }
      .admin-list-item.dragging { opacity:.3; }

      /* ── DRAG ── */
      .drag-handle {
        cursor:grab; color:#3a5a3e; font-size:1rem; flex-shrink:0;
        padding:0 3px; user-select:none; touch-action:none;
        transition:color .15s;
      }
      .drag-handle:hover{ color:#5bbf7a; }
      .drag-handle:active { cursor:grabbing; }
      .admin-list-item.drag-over { border-color:#4ade80; box-shadow:0 0 0 1px #4ade80 inset; }
      .admin-list-item.just-saved, .evo-chain-member.just-saved {
        animation: adminJustSaved 1.5s ease;
      }
      @keyframes adminJustSaved {
        0%   { box-shadow:0 0 0 2px #f4c267, 0 0 16px 2px rgba(244,194,103,.6); background:rgba(244,194,103,.12); }
        100% { box-shadow:0 0 0 0 rgba(244,194,103,0); background:transparent; }
      }
      .evo-chain-member.dragging { opacity:.35; }
      .evo-chain-member.drag-over { box-shadow:0 0 0 2px #4ade80; border-radius:6px; }
      /* ── CARTES LISTE ── */
      .admin-list { display:flex; flex-direction:column; gap:8px; }
      .admin-list-item {
        background:#0f3460; border:1px solid #333; border-radius:8px;
        padding:12px 16px; display:flex; align-items:center; gap:12px;
        transition:border-color .2s;
      }
      .admin-list-item:hover { border-color:#e94560; }
      .admin-list-item-info { flex:1; min-width:0; }
      .admin-list-item-name { font-weight:600; color:#e8d5b7; font-size:.9rem; }
      .admin-list-item-sub  { font-size:.75rem; color:#888; margin-top:2px; }
      .admin-list-item-actions { display:flex; gap:6px; flex-shrink:0; }
      /* ── TAGS/BADGES ── */
      .badge {
        display:inline-block; padding:2px 8px; border-radius:12px;
        font-size:.72rem; font-weight:600; margin-right:4px;
      }
      .badge-common    { background:#374151; color:#d1d5db; }
      .badge-uncommon  { background:#064e3b; color:#6ee7b7; }
      .badge-rare      { background:#1e3a5f; color:#93c5fd; }
      .badge-epic      { background:#3b1d6e; color:#c4b5fd; }
      .badge-legendary { background:#78350f; color:#fcd34d; }
      .badge-mythic    { background:#7f1d1d; color:#fca5a5; }
      /* ── MATRICES ── */
      .type-matrix-table { border-collapse:collapse; font-size:.72rem; width:100%; overflow-x:auto; display:block; }
      .type-matrix-table th, .type-matrix-table td { padding:4px 6px; border:1px solid #333; text-align:center; }
      .type-matrix-table th { background:#0f3460; color:#aaa; position:sticky; top:0; }
      .type-matrix-table td input {
        width:45px; text-align:center; background:transparent; border:none;
        color:#fff; font-size:.72rem;
      }
      .mult-super   { color:#4ade80; font-weight:700; }
      .mult-low     { color:#f87171; }
      .mult-immune  { color:#6b7280; }
      /* ── PORTRAIT ── */
      .admin-portrait-preview {
        width:80px; height:100px; object-fit:cover; border-radius:6px;
        border:1px solid #444; background:#0f3460;
      }
      /* ── STAT ROW ── */
      .stat-row { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
      .stat-row label { width:60px; font-size:.8rem; color:#aaa; }
      .stat-row input { flex:1; }
      .stat-row .stat-max { font-size:.72rem; color:#666; }
      /* ── NOTIFICATION ── */
      #admin-notification {
        position:fixed; bottom:20px; right:20px; z-index:99999;
        background:#22c55e; color:#fff; padding:10px 18px; border-radius:8px;
        font-size:.85rem; font-weight:600; opacity:0; transition:opacity .3s;
        pointer-events:none;
      }
      #admin-notification.show { opacity:1; }
      #admin-notification.error { background:#e94560; }
      /* ── SCROLLBAR ── */
      #admin-content::-webkit-scrollbar { width:6px; }
      #admin-content::-webkit-scrollbar-track { background:#0f3460; }
      #admin-content::-webkit-scrollbar-thumb { background:#e94560; border-radius:3px; }
      /* ── SÉPARATEUR ── */
      .admin-sep { border:none; border-top:1px solid #2a2a4e; margin:20px 0; }
    `;
    document.head.appendChild(style);

    // Conteneur de notification
    const notif = document.createElement('div');
    notif.id = 'admin-notification';
    document.body.appendChild(notif);
  }

  // ─── GLISSER-DÉPOSER (réorganisation des listes) ──────────────────────────────

  /**
   * Démarre un glissement. `kind` identifie le type de liste ('char' | 'equip' | 'evo'),
   * `lineId` n'est utilisé que pour 'evo' (réorganisation au sein d'une même lignée).
   */
  function _dragStart(e, kind, id, lineId = null) {
    _dragState = { kind, id, lineId };
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', id); } catch (err) { /* ignoré (ex. environnement de test) */ }
    }
    e.currentTarget.classList.add('dragging');
  }

  function _dragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  }

  function _dragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  }

  function _dragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  }

  /** Dépose sur un créature : réordonne la liste complète des créatures */
  function _dragDropChar(e, targetId) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (_dragState.kind !== 'char' || !_dragState.id || _dragState.id === targetId) return;

    const ids = GameState.get().characters.map(c => c.id);
    const fromIdx = ids.indexOf(_dragState.id);
    const toIdx   = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    ids.splice(fromIdx, 1);
    ids.splice(ids.indexOf(targetId) + (fromIdx < toIdx ? 1 : 0), 0, _dragState.id);
    GameState.reorderCharDefs(ids);
    switchTab('characters');
  }

  /** Dépose sur un équipement : réordonne la liste complète des équipements */
  function _dragDropEquip(e, targetId) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (_dragState.kind !== 'equip' || !_dragState.id || _dragState.id === targetId) return;

    const ids = GameState.get().equipment.map(eq => eq.id);
    const fromIdx = ids.indexOf(_dragState.id);
    const toIdx   = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    ids.splice(fromIdx, 1);
    ids.splice(ids.indexOf(targetId) + (fromIdx < toIdx ? 1 : 0), 0, _dragState.id);
    GameState.reorderEquipDefs(ids);
    switchTab('equipment');
  }

  /** Dépose sur un type : réordonne la liste complète des types */
  function _dragDropType(e, targetId) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (_dragState.kind !== 'type' || !_dragState.id || _dragState.id === targetId) return;

    const ids = GameState.get().types.map(t => t.id);
    const fromIdx = ids.indexOf(_dragState.id);
    const toIdx   = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    ids.splice(fromIdx, 1);
    ids.splice(ids.indexOf(targetId) + (fromIdx < toIdx ? 1 : 0), 0, _dragState.id);
    GameState.reorderTypes(ids);
    switchTab('types');
  }

  /**
   * Dépose au sein d'une chaîne d'évolution : réordonne les stades de cette lignée
   * (renumérote evolutionStage et reconstruit les pointeurs evolvesTo en conséquence).
   * Refuse silencieusement si les deux éléments n'appartiennent pas à la même lignée.
   */
  function _dragDropEvoStage(e, lineId, targetCharId) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (_dragState.kind !== 'evo' || !_dragState.id || _dragState.id === targetCharId) return;
    if (_dragState.lineId !== lineId) {
      _notify("❌ Impossible de mélanger deux lignées évolutives différentes.", 'error');
      return;
    }

    const state = GameState.get();
    const members = state.characters
      .filter(c => (c.evolutionLine || c.id) === lineId)
      .sort((a, b) => (a.evolutionStage || 0) - (b.evolutionStage || 0));
    const ids = members.map(c => c.id);
    const fromIdx = ids.indexOf(_dragState.id);
    const toIdx   = ids.indexOf(targetCharId);
    if (fromIdx === -1 || toIdx === -1) return;

    ids.splice(fromIdx, 1);
    ids.splice(ids.indexOf(targetCharId) + (fromIdx < toIdx ? 1 : 0), 0, _dragState.id);

    // Renumérote les stades dans le nouvel ordre et reconstruit la chaîne evolvesTo
    ids.forEach((id, i) => {
      const isLast = i === ids.length - 1;
      GameState.updateCharDef(id, { evolutionStage: i, evolvesTo: isLast ? null : ids[i + 1] });
    });

    _notify('✅ Ordre de la lignée mis à jour.');
    switchTab('evolutions');
  }

  // ─── UPGRADE ──────────────────────────────────────────────────────────────────

  /**
   * Incrémente le nombre final d'une chaîne (ex: "Ours1" → "Ours2", "char_001" → "char_002"),
   * en conservant le même nombre de chiffres (zero-padding préservé). Si la chaîne ne se
   * termine pas par un nombre, ajoute "2" à la fin.
   * @param {string} str
   * @returns {string}
   */
  function _incrementTrailingNumber(str) {
    if (!str) return str;
    const match = String(str).match(/^(.*?)(\d+)$/);
    if (!match) return `${str}2`;
    const [, prefix, numStr] = match;
    const incremented = String(parseInt(numStr, 10) + 1).padStart(numStr.length, '0');
    return prefix + incremented;
  }

  /**
   * Crée la fiche "stade suivant" d'un créature : ID, Stade d'évolution et Evolue
   * vers sont incrémentés de 1 ; Nom, Rareté, Types, Lignée évolutive, Condition
   * d'évolution, portrait et description sont copiés à l'identique ; les stats de
   * base sont chacune augmentées de 6% (arrondi à l'unité supérieure).
   */
  function _upgradeCharacter(charId) {
    const c = GameState.getCharDef(charId);
    if (!c) return;

    const newId = _incrementTrailingNumber(c.id);
    if (GameState.getCharDef(newId)) {
      _notify(`❌ Un créature avec l'ID "${newId}" existe déjà.`, 'error');
      return;
    }

    const upgraded = JSON.parse(JSON.stringify(c));
    upgraded.id             = newId;
    upgraded.evolutionStage = (c.evolutionStage || 0) + 1;
    upgraded.evolvesTo      = c.evolvesTo ? _incrementTrailingNumber(c.evolvesTo) : c.evolvesTo;
    upgraded.baseStats = {
      hp:  Math.ceil((c.baseStats?.hp  || 0) * 1.06),
      atk: Math.ceil((c.baseStats?.atk || 0) * 1.06),
      def: Math.ceil((c.baseStats?.def || 0) * 1.06),
      spd: Math.ceil((c.baseStats?.spd || 0) * 1.06),
    };
    // Nom, Rareté, Type principal/secondaire, Lignée évolutive, Cond. d'évol,
    // portrait et description restent identiques (déjà copiés via le clone ci-dessus).

    GameState.addCharDef(upgraded);
    _notify(`✅ "${c.name}" upgradé : nouvelle fiche "${newId}" créée (stats +6%).`);
    switchTab('characters');
    // _renderTab() différé son rendu de 10ms en interne : on attend qu'il soit posé
    // avant de pré-remplir le formulaire d'édition, sinon les champs n'existent pas encore.
    setTimeout(() => _editCharacter(newId), 30);
  }

  /** Duplique un équipement à l'identique sous un nouvel ID, prêt à être ajusté */
  function _duplicateEquip(equipId) {
    const e = GameState.get().equipment.find(x => x.id === equipId);
    if (!e) return;
    const suffix = Date.now().toString(36);
    const copy = JSON.parse(JSON.stringify(e));
    copy.id   = `${equipId}_copy${suffix}`;
    copy.name = `${e.name} (copie)`;

    GameState.addEquipDef(copy);
    _notify(`✅ "${e.name}" dupliqué sous le nom "${copy.name}".`);
    switchTab('equipment');
    _editEquip(copy.id);
  }

  // ─── NAVIGATION PAR ONGLETS ───────────────────────────────────────────────────

  /**
   * Change l'onglet actif et recharge le contenu
   * @param {string} tabId
   */
  function switchTab(tabId) {
    _activeTab = tabId;

    // Mise à jour visuelle des onglets
    document.querySelectorAll('.admin-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    _renderTab(tabId);
  }

  /**
   * Affiche le contenu du bon onglet
   * @param {string} tabId
   */
  function _renderTab(tabId) {
    const content = document.getElementById('admin-content');
    if (!content) return;
    content.innerHTML = '<div id="admin-loading">Chargement...</div>';

    // Timeout minimal pour éviter le freeze sur gros états
    setTimeout(() => {
      try {
        switch (tabId) {
          case 'characters': content.innerHTML = _renderCharactersTab(); break;
          case 'types':      content.innerHTML = _renderTypesTab();      break;
          case 'passives':   content.innerHTML = _renderPassivesTab();   break;
          case 'equipment':  content.innerHTML = _renderEquipmentTab();  break;
          case 'items':      content.innerHTML = _renderItemsTab();      break;
          case 'shop':       content.innerHTML = _renderShopTab();       break;
          case 'gacha':      content.innerHTML = _renderGachaTab();      break;
          case 'evolutions': content.innerHTML = _renderEvolutionsTab(); break;
          case 'tags':       content.innerHTML = _renderTagsTab();       break;
          case 'quests':     content.innerHTML = _renderQuestsTab();     break;
          case 'event':      _renderEventTab(content);                   break;
          case 'awakening':  content.innerHTML = _renderAwakeningTab();  break;
          case 'player':     content.innerHTML = _renderPlayerTab();     break;
          case 'resources':  content.innerHTML = _renderResourcesTab();  break;
          case 'combat':     content.innerHTML = _renderCombatTab();     break;
          case 'audio':      content.innerHTML = _renderAudioTab();      break;
          case 'daily':      content.innerHTML = _renderDailyTab();      break;
          case 'patchnotes': content.innerHTML = _renderPatchNotesTab(); break;
          default:           content.innerHTML = '<p style="color:#888">Onglet inconnu.</p>';
        }
      } catch (e) {
        content.innerHTML = `<p style="color:#e94560">Erreur : ${e.message}</p>`;
        console.error('[AdminPanel] Render error:', e);
      }
    }, 10);
  }

  // ─── ONGLET PERSONNAGES ───────────────────────────────────────────────────────

  function _renderCharactersTab() {
    const state = GameState.get();
    const chars = state.characters;
    const types = state.types;

    const passivesCfg = state.config.passives || GameDatabase.DEFAULT_PASSIVES;
    const typeOptions = types.map(t => {
      const passiveName = passivesCfg[t.id]?.name;
      return `<option value="${t.id}">${t.icon} ${t.name}${passiveName ? ` — ${passiveName}` : ''}</option>`;
    }).join('');
    const rarityOptions = RARITIES.map(r => `<option value="${r}">${RARITY_LABELS[r]}</option>`).join('');

    return `
      <div class="admin-section">
        <div class="admin-section-title">Créer / Modifier un créature</div>
        <div class="admin-grid">
          <div class="admin-field">
            <label>ID (auto si vide)</label>
            <input type="text" id="char-id" placeholder="char_001" />
          </div>
          <div class="admin-field">
            <label>Nom *</label>
            <input type="text" id="char-name" placeholder="Ex: Ignis" />
          </div>
          <div class="admin-field">
            <label>Rareté *</label>
            <select id="char-rarity">${rarityOptions}</select>
          </div>
          <div class="admin-field">
            <label>Type principal *</label>
            <select id="char-type1"><option value="">— Choisir —</option>${typeOptions}</select>
          </div>
          <div class="admin-field">
            <label>Type secondaire</label>
            <select id="char-type2"><option value="">— Aucun —</option>${typeOptions}</select>
          </div>
          <div class="admin-field">
            <label>Lignée évolutive (ID)</label>
            <input type="text" id="char-evo-line" placeholder="line_001" />
          </div>
          <div class="admin-field">
            <label>Stade d'évolution</label>
            <input type="number" id="char-evo-stage" value="0" min="0" max="4" />
          </div>
          <div class="admin-field">
            <label>Évolue vers (ID créature)</label>
            <input type="text" id="char-evolves-to" placeholder="char_002" />
          </div>
          <div class="admin-field">
            <label>Cond. d'évol. (type)</label>
            <select id="char-evo-cond-type">
              <option value="level">Niveau</option>
              <option value="item">Objet</option>
            </select>
          </div>
          <div class="admin-field">
            <label>Cond. d'évol. (valeur)</label>
            <input type="number" id="char-evo-cond-value" placeholder="15" min="1" />
          </div>
        </div>
        <div class="admin-field" style="margin-top:12px;">
          <label>Description</label>
          <textarea id="char-desc" placeholder="Description du créature..."></textarea>
        </div>
        <div class="admin-grid" style="margin-top:12px;">
          <div>
            <p style="font-size:.8rem; color:#aaa; margin-bottom:8px;">Stats de base</p>
            <div class="stat-row">
              <label>PV</label>
              <input type="number" id="char-hp" value="350" min="1" max="99999" />
              <span class="stat-max">max 99999</span>
            </div>
            <div class="stat-row">
              <label>ATK</label>
              <input type="number" id="char-atk" value="50" min="1" max="9999" />
              <span class="stat-max">max 9999</span>
            </div>
            <div class="stat-row">
              <label>DEF</label>
              <input type="number" id="char-def" value="40" min="1" max="9999" />
              <span class="stat-max">max 9999</span>
            </div>
            <div class="stat-row">
              <label>VIT</label>
              <input type="number" id="char-spd" value="50" min="1" max="9999" />
              <span class="stat-max">max 9999</span>
            </div>
          </div>
          <div class="admin-field">
            <label>Portrait (URL ou base64)</label>
            <input type="text" id="char-portrait" placeholder="https://... ou vide" oninput="AdminPanel._previewPortrait(this.value)" />
            <img id="char-portrait-preview" class="admin-portrait-preview" src="" alt="Aperçu" style="margin-top:8px; display:none;" />
            <button type="button" class="admin-btn admin-btn-primary admin-btn-sm" style="margin-top:8px;" onclick="AdminPanel._openCropEditor()">✂️ Recadrer les portraits</button>
          </div>
        </div>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._saveCharacter()">💾 Enregistrer</button>
          <button class="admin-btn admin-btn-primary" onclick="AdminPanel._clearCharForm()">🗑️ Vider</button>
        </div>
      </div>

      <hr class="admin-sep" />

      <div class="admin-section">
        <div class="admin-section-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span>Liste des créatures (${chars.length})</span>
          <select class="sort-select" id="char-list-sort" onchange="AdminPanel._sortCharList(this.value)">
            <option value="">Trier par...</option>
            <option value="id">ID</option>
            <option value="name">Nom (A-Z)</option>
            <option value="rarity">Rareté</option>
          </select>
        </div>
        <div class="admin-list" id="char-list">
          ${chars.map(c => _renderCharListItem(c)).join('')}
        </div>
      </div>
    `;
  }

  /** Trie la liste des créatures par ID, nom ou rareté (persiste l'ordre, comme le drag&drop) */
  function _sortCharList(key) {
    if (!key) return;
    const state = GameState.get();
    const rarityIndex = (r) => { const idx = RARITIES.indexOf(r); return idx === -1 ? 0 : idx; };
    const sorted = [...state.characters];
    if (key === 'id') sorted.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));
    else if (key === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (key === 'rarity') sorted.sort((a, b) => rarityIndex(b.rarity) - rarityIndex(a.rarity) || a.name.localeCompare(b.name));
    GameState.reorderCharDefs(sorted.map(c => c.id));
    switchTab('characters');
  }

  function _renderCharListItem(c) {
    const state = GameState.get();
    const types = state.types;
    const t1 = types.find(t => t.id === c.type1);
    const t2 = types.find(t => t.id === c.type2);
    const rarityLabel = RARITY_LABELS[c.rarity] || c.rarity;

    return `
      <div class="admin-list-item" draggable="true" data-drag-id="${c.id}"
           ondragstart="AdminPanel._dragStart(event,'char','${c.id}')"
           ondragover="AdminPanel._dragOver(event)"
           ondragleave="AdminPanel._dragLeave(event)"
           ondrop="AdminPanel._dragDropChar(event,'${c.id}')"
           ondragend="AdminPanel._dragEnd(event)">
        <span class="drag-handle" title="Glisser pour réorganiser">⠿</span>
        ${c.portrait ? `<img src="${c.portrait}" style="width:40px;height:50px;object-fit:cover;border-radius:4px;" />` : `<div style="width:40px;height:50px;background:#333;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#666;font-size:.7rem;">?</div>`}
        <div class="admin-list-item-info">
          <div class="admin-list-item-name">
            ${c.name}
            <span class="badge badge-${c.rarity}">${rarityLabel}</span>
          </div>
          <div class="admin-list-item-sub">
            ID: ${c.id} | Lignée: ${c.evolutionLine || '—'} | Stage: ${c.evolutionStage ?? '—'}
            | ${t1 ? t1.icon + ' ' + t1.name : '—'}${t2 ? ' / ' + t2.icon + ' ' + t2.name : ''}
          </div>
          <div class="admin-list-item-sub">
            PV:${c.baseStats.hp} ATK:${c.baseStats.atk} DEF:${c.baseStats.def} VIT:${c.baseStats.spd}
            ${c.evolvesTo ? `→ ${c.evolvesTo} (niv. ${c.evolutionCondition?.value || '?'})` : ''}
          </div>
        </div>
        <div class="admin-list-item-actions">
          <button class="admin-btn admin-btn-primary admin-btn-sm" onclick="AdminPanel._editCharacter('${c.id}')">✏️ Éditer</button>
          <button class="admin-btn admin-btn-secondary admin-btn-sm" onclick="AdminPanel._upgradeCharacter('${c.id}')">⬆️ Upgrade</button>
          <button class="admin-btn admin-btn-danger admin-btn-sm"  onclick="AdminPanel._deleteCharacter('${c.id}')">🗑️</button>
        </div>
      </div>
    `;
  }

  /** Prévisualise le portrait */
  function _previewPortrait(url) {
    const preview = document.getElementById('char-portrait-preview');
    if (!preview) return;
    if (url) {
      preview.src = url;
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }
  }

  /** Enregistre ou crée un créature */
  function _saveCharacter() {
    const id       = document.getElementById('char-id')?.value.trim() || `char_${Date.now()}`;
    const name     = document.getElementById('char-name')?.value.trim();
    const rarity   = document.getElementById('char-rarity')?.value;
    const type1    = document.getElementById('char-type1')?.value;
    const type2    = document.getElementById('char-type2')?.value || null;
    const desc     = document.getElementById('char-desc')?.value.trim() || '';
    const portrait = document.getElementById('char-portrait')?.value.trim() || null;
    const evoLine  = document.getElementById('char-evo-line')?.value.trim() || `line_${id}`;
    const evoStage = parseInt(document.getElementById('char-evo-stage')?.value || '0');
    const evolvesTo = document.getElementById('char-evolves-to')?.value.trim() || null;
    const condType  = document.getElementById('char-evo-cond-type')?.value;
    const condVal   = parseInt(document.getElementById('char-evo-cond-value')?.value || '0');

    if (!name) { _notify('❌ Le nom est obligatoire.', 'error'); return; }
    if (!type1) { _notify('❌ Le type principal est obligatoire.', 'error'); return; }

    const charData = {
      id,
      name,
      description: desc,
      portrait,
      rarity,
      evolutionLine: evoLine,
      evolutionStage: evoStage,
      type1,
      type2,
      baseStats: {
        hp:  Math.min(99999, parseInt(document.getElementById('char-hp')?.value  || '350')),
        atk: Math.min(9999,  parseInt(document.getElementById('char-atk')?.value || '50')),
        def: Math.min(9999,  parseInt(document.getElementById('char-def')?.value || '40')),
        spd: Math.min(9999,  parseInt(document.getElementById('char-spd')?.value || '50')),
      },
      evolutionCondition: condVal > 0 ? { type: condType, value: condVal } : null,
      evolvesTo: evolvesTo || null,
      // Inclure les crops si l'éditeur a été utilisé pour ce nouveau personnage
      ...(_cropCurrentCharId === id || !GameState.getCharDef(id) ? {
        portraitCrop: { ..._cropVign   },
        detailCrop:   { ..._cropDetail },
        combatCrop:   { ..._cropCombat },
      } : {}),
    };

    const existing = GameState.getCharDef(id);
    if (existing) {
      GameState.updateCharDef(id, charData);
      _notify(`✅ Espèce "${name}" mis à jour.`);
    } else {
      GameState.addCharDef(charData);
      _notify(`✅ Espèce "${name}" créé.`);
    }

    _clearCharForm();
    // Rafraîchir juste la liste
    const list = document.getElementById('char-list');
    if (list) {
      const chars = GameState.get().characters;
      list.innerHTML = chars.map(c => _renderCharListItem(c)).join('');
    }
    _scrollToListItem(id);
  }

  /** Remplit le formulaire pour éditer un créature */
  function _editCharacter(charId) {
    const c = GameState.getCharDef(charId);
    if (!c) return;

    _setVal('char-id', c.id);
    _setVal('char-name', c.name);
    _setVal('char-rarity', c.rarity);
    _setVal('char-type1', c.type1);
    _setVal('char-type2', c.type2 || '');
    _setVal('char-desc', c.description || '');
    _setVal('char-portrait', c.portrait || '');
    _setVal('char-evo-line', c.evolutionLine || '');
    _setVal('char-evo-stage', c.evolutionStage ?? 0);
    _setVal('char-evolves-to', c.evolvesTo || '');
    _setVal('char-evo-cond-type', c.evolutionCondition?.type || 'level');
    _setVal('char-evo-cond-value', c.evolutionCondition?.value || '');
    _setVal('char-hp', c.baseStats.hp);
    _setVal('char-atk', c.baseStats.atk);
    _setVal('char-def', c.baseStats.def);
    _setVal('char-spd', c.baseStats.spd);

    if (c.portrait) _previewPortrait(c.portrait);

    // Scroll vers le formulaire
    document.getElementById('admin-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    _notify(`✏️ Édition de "${c.name}"`);
  }

  /** Supprime un créature */
  function _deleteCharacter(charId) {
    const c = GameState.getCharDef(charId);
    if (!c) return;
    if (!confirm(`Supprimer "${c.name}" (${charId}) ? Cette action est irréversible.`)) return;
    GameState.removeCharDef(charId);
    _notify(`🗑️ Espèce supprimé.`);
    switchTab('characters');
  }

  /** Vide le formulaire créature */
  function _clearCharForm() {
    ['char-id','char-name','char-desc','char-portrait','char-evo-line',
     'char-evolves-to','char-evo-cond-value'].forEach(id => _setVal(id, ''));
    _setVal('char-rarity', 'common');
    _setVal('char-type1', '');
    _setVal('char-type2', '');
    _setVal('char-evo-stage', '0');
    _setVal('char-hp', '350');
    _setVal('char-atk', '50');
    _setVal('char-def', '40');
    _setVal('char-spd', '50');
    const preview = document.getElementById('char-portrait-preview');
    if (preview) preview.style.display = 'none';
  }

  // ─── ONGLET TYPES ────────────────────────────────────────────────────────────

  function _renderTypesTab() {
    const state  = GameState.get();
    const types  = state.types;
    const matrix = state.typeMatrix;

    const typesList = types.map(t => `
      <div class="admin-list-item" draggable="true" data-drag-id="${t.id}"
           ondragstart="AdminPanel._dragStart(event,'type','${t.id}')"
           ondragover="AdminPanel._dragOver(event)"
           ondragleave="AdminPanel._dragLeave(event)"
           ondrop="AdminPanel._dragDropType(event,'${t.id}')"
           ondragend="AdminPanel._dragEnd(event)">
        <span class="drag-handle" title="Glisser pour réorganiser">⠿</span>
        <div style="font-size:1.5rem;">${t.icon}</div>
        <div class="admin-list-item-info">
          <div class="admin-list-item-name" style="color:${t.color}">${t.name}</div>
          <div class="admin-list-item-sub">ID: ${t.id}</div>
        </div>
        <div class="admin-list-item-actions">
          <button class="admin-btn admin-btn-primary admin-btn-sm" onclick="AdminPanel._editType('${t.id}')">✏️</button>
          <button class="admin-btn admin-btn-danger  admin-btn-sm" onclick="AdminPanel._deleteType('${t.id}')">🗑️</button>
        </div>
      </div>
    `).join('');

    // Matrice des types interactive
    const matrixHtml = _buildTypeMatrix(types, matrix);

    return `
      <div class="admin-section">
        <div class="admin-section-title">Créer / Modifier un type</div>
        <div class="admin-grid">
          <div class="admin-field">
            <label>ID (slug, ex: fire)</label>
            <input type="text" id="type-id" placeholder="fire" />
          </div>
          <div class="admin-field">
            <label>Nom affiché</label>
            <input type="text" id="type-name" placeholder="Feu" />
          </div>
          <div class="admin-field">
            <label>Couleur</label>
            <input type="color" id="type-color" value="#FF4500" />
          </div>
          <div class="admin-field">
            <label>Icône (emoji)</label>
            <input type="text" id="type-icon" placeholder="🔥" maxlength="4" />
          </div>
        </div>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._saveType()">💾 Enregistrer</button>
          <button class="admin-btn admin-btn-primary" onclick="AdminPanel._clearTypeForm()">🗑️ Vider</button>
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">Types existants</div>
        <div class="admin-list">${typesList}</div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">Matrice des types (cliquer pour modifier)</div>
        <p style="font-size:.78rem; color:#888; margin-bottom:10px;">
          Valeurs : 2.0 = super efficace 🟢 | 0.5 = peu efficace 🔴 | 0 = immunité ⚫ | 1.0 = normal
        </p>
        <div style="overflow-x:auto;">${matrixHtml}</div>
        <div class="admin-actions" style="margin-top:12px;">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._saveMatrix()">💾 Sauver la matrice</button>
        </div>
      </div>
    `;
  }

  function _buildTypeMatrix(types, matrix) {
    const ids = types.map(t => t.id);
    let html = `<table class="type-matrix-table"><thead><tr><th>ATK ↓ / DEF →</th>`;
    types.forEach(t => { html += `<th title="${t.name}">${t.icon}</th>`; });
    html += '</tr></thead><tbody>';

    ids.forEach(atk => {
      const atkType = types.find(t => t.id === atk);
      html += `<tr><th>${atkType?.icon || ''} ${atkType?.name || atk}</th>`;
      ids.forEach(def => {
        const val = matrix[atk]?.[def] ?? 1.0;
        let cls = '';
        if (val >= 2.0) cls = 'mult-super';
        else if (val <= 0) cls = 'mult-immune';
        else if (val < 1.0) cls = 'mult-low';
        html += `<td class="${cls}"><input type="number" step="0.5" min="0" max="4"
                   value="${val}" data-atk="${atk}" data-def="${def}"
                   style="width:45px;background:transparent;border:none;color:inherit;text-align:center;font-size:.72rem;"
                   onchange="AdminPanel._matrixCellChanged(this)" /></td>`;
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    return html;
  }

  function _matrixCellChanged(input) {
    // Feedback visuel immédiat
    const val = parseFloat(input.value);
    input.parentElement.className = val >= 2.0 ? 'mult-super' : val <= 0 ? 'mult-immune' : val < 1.0 ? 'mult-low' : '';
  }

  function _saveMatrix() {
    const state  = GameState.get();
    const types  = state.types;
    const ids    = types.map(t => t.id);
    const matrix = {};

    ids.forEach(atk => {
      matrix[atk] = {};
      ids.forEach(def => {
        const input = document.querySelector(`input[data-atk="${atk}"][data-def="${def}"]`);
        matrix[atk][def] = input ? parseFloat(input.value) || 1.0 : 1.0;
      });
    });

    GameState.updateTypeMatrix(matrix);
    _notify('✅ Matrice des types sauvegardée.');
  }

  function _saveType() {
    const id   = document.getElementById('type-id')?.value.trim();
    const name = document.getElementById('type-name')?.value.trim();
    const color = document.getElementById('type-color')?.value;
    const icon  = document.getElementById('type-icon')?.value.trim();

    if (!id || !name) { _notify('❌ ID et Nom sont obligatoires.', 'error'); return; }

    const state = GameState.get();
    const existing = state.types.find(t => t.id === id);
    const newTypes = existing
      ? state.types.map(t => t.id === id ? { ...t, name, color, icon } : t)
      : [...state.types, { id, name, color, icon }];

    GameState.updateTypes(newTypes);
    _notify(`✅ Type "${name}" enregistré.`);
    _clearTypeForm();
    switchTab('types');
  }

  function _editType(typeId) {
    const state = GameState.get();
    const t = state.types.find(x => x.id === typeId);
    if (!t) return;
    _setVal('type-id', t.id);
    _setVal('type-name', t.name);
    _setVal('type-color', t.color);
    _setVal('type-icon', t.icon);
    document.getElementById('admin-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function _deleteType(typeId) {
    if (!confirm(`Supprimer le type "${typeId}" ? Cela peut casser des créatures.`)) return;
    const state = GameState.get();
    GameState.updateTypes(state.types.filter(t => t.id !== typeId));
    _notify('🗑️ Type supprimé.');
    switchTab('types');
  }

  function _clearTypeForm() {
    ['type-id', 'type-name', 'type-icon'].forEach(id => _setVal(id, ''));
    _setVal('type-color', '#FF4500');
  }

  // ─── ONGLET PASSIFS ───────────────────────────────────────────────────────────
  // Un passif est lié à un type : tout créature ayant ce type (sur type1 ou type2)
  // hérite automatiquement de son passif. Cet onglet est aussi conçu pour
  // accueillir, plus tard, le paramétrage des attaques actives.

  const PASSIVE_TRIGGER_LABELS = {
    onAttack:      'Avant d\'attaquer',
    onHit:         'En touchant une cible',
    onDamaged:     'En subissant des dégâts',
    onTurnEnd:     'À la fin du tour',
    onBattleStart: 'Au début du combat',
    passive:       'Toujours actif (sans jet)',
  };

  function _renderPassivesTab() {
    const state = GameState.get();
    const types = state.types;
    const passivesCfg = state.config.passives || GameDatabase.DEFAULT_PASSIVES;

    const cards = types.map(t => {
      const p = passivesCfg[t.id] || {};
      const isPermanent = p.trigger === 'passive';
      const isCryptide = t.id === 'Cryptide';
      return `
      <div class="admin-section" style="border-left:3px solid ${t.color}; margin-bottom:14px;">
        <div class="admin-section-title">${t.icon} ${t.name} — <span style="color:${t.color}">${p.name || '(aucun passif)'}</span></div>
        <div class="admin-grid">
          <div class="admin-field">
            <label>Nom du passif</label>
            <input type="text" id="passive-name-${t.id}" value="${_escapeAttr(p.name || '')}" placeholder="Nom du passif" />
          </div>
          <div class="admin-field">
            <label>Icône (emoji)</label>
            <input type="text" id="passive-icon-${t.id}" value="${_escapeAttr(p.icon || '')}" maxlength="4" />
          </div>
          <div class="admin-field">
            <label>Déclencheur</label>
            <select id="passive-trigger-${t.id}" ${isCryptide ? 'disabled' : ''}>
              ${Object.entries(PASSIVE_TRIGGER_LABELS).map(([val, label]) =>
                `<option value="${val}" ${p.trigger === val ? 'selected' : ''}>${label}</option>`
              ).join('')}
            </select>
          </div>
          <div class="admin-field">
            <label>Chance de déclenchement (%)</label>
            <input type="number" id="passive-chance-${t.id}" value="${Math.round((p.chance ?? 0) * 100)}"
                   min="0" max="100" step="1" ${isPermanent || isCryptide ? 'disabled' : ''} />
          </div>
          <div class="admin-field">
            <label>Valeur principale ${_passiveValueHint(t.id)}</label>
            <input type="number" id="passive-value-${t.id}" value="${p.value ?? 0}" step="1" />
          </div>
          ${p.value2 !== undefined ? `
          <div class="admin-field">
            <label>Valeur secondaire (durée en tours)</label>
            <input type="number" id="passive-value2-${t.id}" value="${p.value2 ?? 0}" step="1" min="1" />
          </div>` : ''}
        </div>
        <div class="admin-field" style="margin-top:8px;">
          <label>Description (affichée en combat et sur la fiche créature)</label>
          <textarea id="passive-desc-${t.id}" rows="2" style="width:100%;">${_escapeAttr(p.description || '')}</textarea>
        </div>
      </div>`;
    }).join('');

    return `
      <div class="admin-section">
        <div class="admin-section-title">💫 Passifs liés aux types</div>
        <p style="font-size:.78rem; color:#888; margin-bottom:12px;">
          Chaque créature hérite automatiquement du passif de son type 1 ET de son
          type 2 (si bi-type, les deux passifs se cumulent). Le type Cryptide est
          spécial : au lieu de "Mystère", chaque créature Cryptide tire au sort
          (une fois, en début de combat) le passif d'un autre type au hasard.
          Les attaques actives seront paramétrables ici également dans une future mise à jour.
        </p>
      </div>
      <hr class="admin-sep" />
      ${cards}
      <div class="admin-actions" style="position:sticky; bottom:0; background:#1a1a2e; padding:14px 0; margin-top:8px;">
        <button class="admin-btn admin-btn-success" onclick="AdminPanel._savePassives()">💾 Enregistrer tous les passifs</button>
        <button class="admin-btn admin-btn-primary" onclick="AdminPanel._resetPassivesToDefault()">↺ Réinitialiser aux valeurs par défaut</button>
      </div>
    `;
  }

  /** Petit indice contextuel sur l'unité de la "valeur principale" selon le type de passif */
  function _passiveValueHint(typeId) {
    const hints = {
      fire: '(% bonus ATK)', nature: '(% PV max soignés)', ice: '(% bonus crit)',
      water: '(% PV max en dégâts)', metal: '', electric: '(tours de paralysie)',
      shadow: '(% esquive bonus)', chaos: '(% PV max perdus/tour)', light: '',
      magic: '(attaques charmées)', Cryptide: '',
    };
    return hints[typeId] || '';
  }

  function _savePassives() {
    const state = GameState.get();
    const types = state.types;
    const newPassives = { ...(state.config.passives || {}) };

    types.forEach((t) => {
      const existing = newPassives[t.id] || {};
      const trigger = document.getElementById(`passive-trigger-${t.id}`)?.value || existing.trigger || 'passive';
      const chanceRaw = document.getElementById(`passive-chance-${t.id}`)?.value;
      const updated = {
        id: t.id,
        name: document.getElementById(`passive-name-${t.id}`)?.value.trim() || existing.name || t.name,
        icon: document.getElementById(`passive-icon-${t.id}`)?.value.trim() || existing.icon || t.icon,
        description: document.getElementById(`passive-desc-${t.id}`)?.value.trim() || existing.description || '',
        trigger,
        chance: trigger === 'passive' ? 1.0 : Math.max(0, Math.min(100, parseFloat(chanceRaw ?? '0'))) / 100,
        value: parseFloat(document.getElementById(`passive-value-${t.id}`)?.value ?? existing.value ?? 0),
      };
      if (existing.value2 !== undefined) {
        const v2 = document.getElementById(`passive-value2-${t.id}`)?.value;
        updated.value2 = v2 !== undefined ? parseFloat(v2) : existing.value2;
      }
      newPassives[t.id] = updated;
    });

    GameState.updateConfig({ ...state.config, passives: newPassives });
    _notify('✅ Passifs enregistrés.');
    switchTab('passives');
  }

  function _resetPassivesToDefault() {
    if (!confirm('Réinitialiser TOUS les passifs aux valeurs par défaut du jeu ? Tes modifications seront perdues.')) return;
    const state = GameState.get();
    GameState.updateConfig({ ...state.config, passives: JSON.parse(JSON.stringify(GameDatabase.DEFAULT_PASSIVES)) });
    _notify('↺ Passifs réinitialisés.');
    switchTab('passives');
  }

  // ─── ONGLET ÉQUIPEMENTS ───────────────────────────────────────────────────────

  function _renderEquipmentTab() {
    const state  = GameState.get();
    const equips = state.equipment;
    const rarityOptions = RARITIES.map(r => `<option value="${r}">${RARITY_LABELS[r]}</option>`).join('');
    const slotLabel = (e) => EQUIP_SLOT_LABELS[GameDatabase.resolveEquipSlot(e)];

    const list = equips.map(e => `
      <div class="admin-list-item" draggable="true" data-drag-id="${e.id}"
           ondragstart="AdminPanel._dragStart(event,'equip','${e.id}')"
           ondragover="AdminPanel._dragOver(event)"
           ondragleave="AdminPanel._dragLeave(event)"
           ondrop="AdminPanel._dragDropEquip(event,'${e.id}')"
           ondragend="AdminPanel._dragEnd(event)">
        <span class="drag-handle" title="Glisser pour réorganiser">⠿</span>
        <div class="admin-list-item-info">
          <div class="admin-list-item-name">
            ${e.name}
            <span class="badge badge-${e.rarity}">${RARITY_LABELS[e.rarity] || e.rarity}</span>
          </div>
          <div class="admin-list-item-sub">ID: ${e.id} | Slot: ${slotLabel(e)}</div>
          <div class="admin-list-item-sub">
            PV:+${e.bonuses.hp} ATK:+${e.bonuses.atk} DEF:+${e.bonuses.def} VIT:+${e.bonuses.spd}
          </div>
        </div>
        <div class="admin-list-item-actions">
          <button class="admin-btn admin-btn-primary admin-btn-sm" onclick="AdminPanel._editEquip('${e.id}')">✏️</button>
          <button class="admin-btn admin-btn-secondary admin-btn-sm" onclick="AdminPanel._duplicateEquip('${e.id}')">📋</button>
          <button class="admin-btn admin-btn-danger  admin-btn-sm" onclick="AdminPanel._deleteEquip('${e.id}')">🗑️</button>
        </div>
      </div>
    `).join('');

    return `
      <div class="admin-section">
        <div class="admin-section-title">Créer / Modifier un équipement</div>
        <div class="admin-grid">
          <div class="admin-field">
            <label>ID</label>
            <input type="text" id="eq-id" placeholder="equip_001" />
          </div>
          <div class="admin-field">
            <label>Nom *</label>
            <input type="text" id="eq-name" placeholder="Anneau de Rubis" />
          </div>
          <div class="admin-field">
            <label>Rareté</label>
            <select id="eq-rarity">${rarityOptions}</select>
          </div>
          <div class="admin-field">
            <label>Slot</label>
            <select id="eq-slot">
              <option value="weapon">⚔️ Arme</option>
              <option value="armor">🛡️ Armure</option>
              <option value="accessory">💍 Accessoire</option>
            </select>
          </div>
          <div class="admin-field">
            <label>Niveau max</label>
            <input type="number" id="eq-maxlevel" value="10" min="1" max="100" />
          </div>
        </div>
        <div class="admin-field" style="margin-top:10px;">
          <label>Description</label>
          <textarea id="eq-desc" placeholder="Description..."></textarea>
        </div>
        <p style="font-size:.8rem; color:#aaa; margin:12px 0 6px;">Bonus</p>
        <div class="admin-grid">
          <div class="admin-field"><label>+PV</label><input type="number" id="eq-hp" value="0" min="0" /></div>
          <div class="admin-field"><label>+ATK</label><input type="number" id="eq-atk" value="0" min="0" /></div>
          <div class="admin-field"><label>+DEF</label><input type="number" id="eq-def" value="0" min="0" /></div>
          <div class="admin-field"><label>+VIT</label><input type="number" id="eq-spd" value="0" min="0" /></div>
        </div>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._saveEquip()">💾 Enregistrer</button>
          <button class="admin-btn admin-btn-primary" onclick="AdminPanel._clearEquipForm()">🗑️ Vider</button>
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span>Équipements (${equips.length})</span>
          <select class="sort-select" id="eq-list-sort" onchange="AdminPanel._sortEquipList(this.value)">
            <option value="">Trier par...</option>
            <option value="name">Nom (A-Z)</option>
            <option value="rarity">Rareté</option>
            <option value="slot">Type d'équipement</option>
          </select>
        </div>
        <div class="admin-list">${list}</div>
      </div>
    `;
  }

  /** Trie la liste des équipements par nom, rareté ou type de slot (persiste l'ordre) */
  function _sortEquipList(key) {
    if (!key) return;
    const state = GameState.get();
    const rarityIndex = (r) => { const idx = RARITIES.indexOf(r); return idx === -1 ? 0 : idx; };
    const slotIndex = (e) => EQUIP_SLOT_ORDER_ADMIN.indexOf(GameDatabase.resolveEquipSlot(e));
    const sorted = [...state.equipment];
    if (key === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (key === 'rarity') sorted.sort((a, b) => rarityIndex(b.rarity) - rarityIndex(a.rarity) || a.name.localeCompare(b.name));
    else if (key === 'slot') sorted.sort((a, b) => slotIndex(a) - slotIndex(b) || a.name.localeCompare(b.name));
    GameState.reorderEquipDefs(sorted.map(e => e.id));
    switchTab('equipment');
  }

  function _saveEquip() {
    const id   = document.getElementById('eq-id')?.value.trim() || `equip_${Date.now()}`;
    const name = document.getElementById('eq-name')?.value.trim();
    if (!name) { _notify('❌ Nom obligatoire.', 'error'); return; }

    const data = {
      id,
      name,
      rarity:    document.getElementById('eq-rarity')?.value,
      slot:      document.getElementById('eq-slot')?.value,
      description: document.getElementById('eq-desc')?.value.trim() || '',
      level: 1,
      maxLevel: parseInt(document.getElementById('eq-maxlevel')?.value || '10'),
      bonuses: {
        hp:  parseInt(document.getElementById('eq-hp')?.value  || '0'),
        atk: parseInt(document.getElementById('eq-atk')?.value || '0'),
        def: parseInt(document.getElementById('eq-def')?.value || '0'),
        spd: parseInt(document.getElementById('eq-spd')?.value || '0'),
      },
    };

    const state = GameState.get();
    if (state.equipment.find(e => e.id === id)) {
      GameState.updateEquipDef(id, data);
      _notify(`✅ Équipement "${name}" mis à jour.`);
    } else {
      GameState.addEquipDef(data);
      _notify(`✅ Équipement "${name}" créé.`);
    }
    _clearEquipForm();
    switchTab('equipment');
    // _renderTab() differe son rendu de 10ms en interne : on attend qu'il soit posé
    setTimeout(() => _scrollToListItem(id), 20);
  }

  function _editEquip(id) {
    const state = GameState.get();
    const e = state.equipment.find(x => x.id === id);
    if (!e) return;
    _setVal('eq-id', e.id);
    _setVal('eq-name', e.name);
    _setVal('eq-rarity', e.rarity);
    _setVal('eq-slot', GameDatabase.resolveEquipSlot(e));
    _setVal('eq-desc', e.description || '');
    _setVal('eq-maxlevel', e.maxLevel || 10);
    _setVal('eq-hp',  e.bonuses.hp);
    _setVal('eq-atk', e.bonuses.atk);
    _setVal('eq-def', e.bonuses.def);
    _setVal('eq-spd', e.bonuses.spd);
    document.getElementById('admin-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function _deleteEquip(id) {
    if (!confirm(`Supprimer l'équipement "${id}" ?`)) return;
    GameState.removeEquipDef(id);
    _notify('🗑️ Équipement supprimé.');
    switchTab('equipment');
  }

  function _clearEquipForm() {
    ['eq-id','eq-name','eq-desc'].forEach(id => _setVal(id, ''));
    _setVal('eq-rarity', 'common');
    _setVal('eq-slot', 'weapon');
    _setVal('eq-maxlevel', '10');
    ['eq-hp','eq-atk','eq-def','eq-spd'].forEach(id => _setVal(id, '0'));
  }

  // ─── ONGLET OBJETS ───────────────────────────────────────────────────────────
  //
  // Chaque objet porte une liste `effects`, chacun choisi parmi le catalogue
  // fermé GameDatabase.ITEM_EFFECT_TYPES. L'admin compose librement les effets
  // d'un objet (ex: +50 énergie ET +100 or, en un seul objet).

  let _itemFormEffects = []; // état transitoire des effets en cours de composition

  function _renderItemsTab() {
    const state = GameState.get();
    const items = state.items || [];

    const list = items.map((it) => `
      <div class="admin-list-item" data-drag-id="${it.id}">
        <div class="admin-list-item-info">
          <div class="admin-list-item-name">${it.icon || '🎁'} ${_escapeAttr(it.name)}</div>
          <div class="admin-list-item-sub">ID: ${it.id}</div>
          <div class="admin-list-item-sub">${ItemSystem.describeEffects(it.effects).join('   ') || 'Aucun effet'}</div>
        </div>
        <div class="admin-list-item-actions">
          <button class="admin-btn admin-btn-primary admin-btn-sm" onclick="AdminPanel._editItem('${it.id}')">✏️</button>
          <button class="admin-btn admin-btn-danger admin-btn-sm" onclick="AdminPanel._deleteItem('${it.id}')">🗑️</button>
        </div>
      </div>
    `).join('');

    return `
      <div class="admin-section">
        <div class="admin-section-title">Créer / Modifier un objet</div>
        <input type="hidden" id="it-id" />
        <div class="admin-grid">
          <div class="admin-field"><label>Nom *</label><input type="text" id="it-name" placeholder="Élixir de Force" /></div>
          <div class="admin-field"><label>Icône (emoji)</label><input type="text" id="it-icon" placeholder="🧪" maxlength="4" /></div>
        </div>
        <div class="admin-field" style="margin-top:10px;">
          <label>Description</label>
          <textarea id="it-desc" placeholder="Description affichée au joueur..."></textarea>
        </div>
        <p style="font-size:.8rem;color:#aaa;margin:14px 0 6px;">Effets de l'objet</p>
        <div id="it-effects-list">${_renderItemEffectsRows()}</div>
        <div class="admin-actions">
          <button type="button" class="admin-btn admin-btn-primary admin-btn-sm" onclick="AdminPanel._addItemEffect()">➕ Ajouter un effet</button>
        </div>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._saveItem()">💾 Enregistrer</button>
          <button class="admin-btn admin-btn-primary" onclick="AdminPanel._clearItemForm()">🗑️ Vider</button>
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">Objets (${items.length})</div>
        <div class="admin-list">${list || '<p style="color:#888;">Aucun objet créé.</p>'}</div>
      </div>
    `;
  }

  /** Construit les lignes de sélection d'effet (type + ses paramètres propres). */
  function _renderItemEffectsRows() {
    if (_itemFormEffects.length === 0) {
      return '<p style="color:#888;font-size:.82rem;">Aucun effet — ajoute-en au moins un.</p>';
    }
    const typeOptions = GameDatabase.ITEM_EFFECT_TYPES.map(t => `<option value="${t.type}">${t.label}</option>`).join('');

    return _itemFormEffects.map((eff, i) => {
      const def = GameDatabase.ITEM_EFFECT_TYPES.find(t => t.type === eff.type) || GameDatabase.ITEM_EFFECT_TYPES[0];
      const paramsHtml = (def.params || []).map(p => `
        <div class="admin-field">
          <label>${p.label}</label>
          <input type="number" class="it-eff-param" data-effect="${i}" data-param="${p.key}" value="${eff[p.key] ?? p.default}" />
        </div>
      `).join('');

      return `
        <div class="admin-grid" style="align-items:end; border:1px solid var(--border-soft,#333); border-radius:8px; padding:10px; margin-bottom:8px;">
          <div class="admin-field">
            <label>Effet</label>
            <select class="it-eff-type" data-effect="${i}" onchange="AdminPanel._onItemEffectTypeChange(${i}, this.value)">${typeOptions.replace(`value="${eff.type}"`, `value="${eff.type}" selected`)}</select>
          </div>
          ${paramsHtml}
          <div class="admin-field">
            <button type="button" class="admin-btn admin-btn-danger admin-btn-sm" onclick="AdminPanel._removeItemEffect(${i})">🗑️ Retirer</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function _addItemEffect() {
    _syncItemEffectsFromDom();
    const firstType = GameDatabase.ITEM_EFFECT_TYPES[0];
    const newEff = { type: firstType.type };
    (firstType.params || []).forEach(p => { newEff[p.key] = p.default; });
    _itemFormEffects.push(newEff);
    document.getElementById('it-effects-list').innerHTML = _renderItemEffectsRows();
  }

  function _removeItemEffect(index) {
    _syncItemEffectsFromDom();
    _itemFormEffects.splice(index, 1);
    document.getElementById('it-effects-list').innerHTML = _renderItemEffectsRows();
  }

  /** Quand on change le TYPE d'un effet, on réinitialise ses paramètres aux défauts de ce type. */
  function _onItemEffectTypeChange(index, newType) {
    _syncItemEffectsFromDom();
    const def = GameDatabase.ITEM_EFFECT_TYPES.find(t => t.type === newType);
    const newEff = { type: newType };
    (def?.params || []).forEach(p => { newEff[p.key] = p.default; });
    _itemFormEffects[index] = newEff;
    document.getElementById('it-effects-list').innerHTML = _renderItemEffectsRows();
  }

  /** Relit les valeurs actuellement saisies dans le DOM vers _itemFormEffects. */
  function _syncItemEffectsFromDom() {
    document.querySelectorAll('.it-eff-param').forEach(el => {
      const i = Number(el.dataset.effect);
      const key = el.dataset.param;
      if (_itemFormEffects[i]) _itemFormEffects[i][key] = parseInt(el.value || '0');
    });
  }

  function _saveItem() {
    _syncItemEffectsFromDom();
    const name = document.getElementById('it-name')?.value.trim();
    if (!name) { _notify('❌ Nom obligatoire.', 'error'); return; }
    if (_itemFormEffects.length === 0) { _notify('❌ Ajoute au moins un effet.', 'error'); return; }

    const idInput = document.getElementById('it-id')?.value.trim();
    const id = idInput || `item_${Date.now()}`;
    const data = {
      id, name,
      icon: document.getElementById('it-icon')?.value.trim() || '🎁',
      description: document.getElementById('it-desc')?.value.trim() || '',
      stackable: true,
      effects: JSON.parse(JSON.stringify(_itemFormEffects)),
    };

    const state = GameState.get();
    const items = [...(state.items || [])];
    const idx = items.findIndex(i => i.id === id);
    if (idx >= 0) items[idx] = data; else items.push(data);

    GameState.updateItemDefs(items);
    _notify(`✅ Objet "${name}" enregistré.`);
    _clearItemForm();
    switchTab('items');
  }

  function _editItem(id) {
    const state = GameState.get();
    const it = (state.items || []).find(i => i.id === id);
    if (!it) return;
    _setVal('it-id', it.id);
    _setVal('it-name', it.name);
    _setVal('it-icon', it.icon || '');
    _setVal('it-desc', it.description || '');
    _itemFormEffects = JSON.parse(JSON.stringify(it.effects || []));
    document.getElementById('it-effects-list').innerHTML = _renderItemEffectsRows();
    document.getElementById('admin-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function _deleteItem(id) {
    if (!confirm(`Supprimer définitivement cet objet ?`)) return;
    const state = GameState.get();
    GameState.updateItemDefs((state.items || []).filter(i => i.id !== id));
    _notify('🗑️ Objet supprimé.');
    switchTab('items');
  }

  function _clearItemForm() {
    ['it-id','it-name','it-icon','it-desc'].forEach(id => _setVal(id, ''));
    _itemFormEffects = [];
    const list = document.getElementById('it-effects-list');
    if (list) list.innerHTML = _renderItemEffectsRows();
  }

  // ─── ONGLET BOUTIQUE ─────────────────────────────────────────────────────────

  const SHOP_CATEGORY_LABELS_ADMIN = { equipment: '⚙️ Équipement', item: '🎁 Objet', character: '✦ Espèce' };

  function _renderShopTab() {
    const state = GameState.get();
    const shopItems = state.shopItems || [];

    const list = shopItems.map((s) => {
      const refDef = _shopResolveRefDef(state, s);
      const limitText = s.limit?.type === 'daily' ? `${s.limit.amount}/jour`
        : s.limit?.type === 'lifetime' ? `${s.limit.amount} à vie` : 'Illimité';
      return `
        <div class="admin-list-item" data-drag-id="${s.id}">
          <div class="admin-list-item-info">
            <div class="admin-list-item-name">
              ${refDef ? _escapeAttr(refDef.name) : '⚠️ Référence manquante'}
              <span class="badge" style="background:${s.active ? 'var(--admin-success,#2e7d32)' : '#555'};color:#fff;">
                ${s.active ? 'Actif' : 'Inactif'}
              </span>
            </div>
            <div class="admin-list-item-sub">${SHOP_CATEGORY_LABELS_ADMIN[s.category] || s.category} — ID réf: ${s.refId}</div>
            <div class="admin-list-item-sub">Prix : ${s.price} ${s.currency === 'gold' ? '🪙' : '💎'} — Limite : ${limitText}</div>
          </div>
          <div class="admin-list-item-actions">
            <button class="admin-btn admin-btn-sm ${s.active ? 'admin-btn-warning' : 'admin-btn-success'}" onclick="AdminPanel._toggleShopItemActive('${s.id}')">
              ${s.active ? '⏸️' : '▶️'}
            </button>
            <button class="admin-btn admin-btn-primary admin-btn-sm" onclick="AdminPanel._editShopItem('${s.id}')">✏️</button>
            <button class="admin-btn admin-btn-danger admin-btn-sm" onclick="AdminPanel._deleteShopItem('${s.id}')">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="admin-section">
        <div class="admin-section-title">Ajouter / Modifier un article</div>
        <input type="hidden" id="sh-id" />
        <div class="admin-grid">
          <div class="admin-field">
            <label>Catégorie</label>
            <select id="sh-category" onchange="AdminPanel._onShopCategoryChange(this.value)">
              <option value="equipment">⚙️ Équipement</option>
              <option value="item">🎁 Objet</option>
              <option value="character">✦ Espèce</option>
            </select>
          </div>
          <div class="admin-field">
            <label>Article</label>
            <select id="sh-refid">${_shopRefOptionsHtml('equipment')}</select>
          </div>
          <div class="admin-field"><label>Prix *</label><input type="number" id="sh-price" min="0" value="100" /></div>
          <div class="admin-field">
            <label>Devise</label>
            <select id="sh-currency">
              <option value="crystals">💎 Gemmes</option>
              <option value="gold">🪙 Or</option>
            </select>
          </div>
          <div class="admin-field">
            <label>Type de limite</label>
            <select id="sh-limit-type" onchange="AdminPanel._onShopLimitTypeChange(this.value)">
              <option value="none">Illimité</option>
              <option value="daily">Par jour</option>
              <option value="lifetime">À vie (par compte)</option>
            </select>
          </div>
          <div class="admin-field" id="sh-limit-amount-field" style="display:none;">
            <label>Quantité limite</label>
            <input type="number" id="sh-limit-amount" min="1" value="1" />
          </div>
          <div class="admin-field">
            <label>Actif</label>
            <select id="sh-active">
              <option value="1">Oui</option>
              <option value="0">Non</option>
            </select>
          </div>
        </div>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._saveShopItem()">💾 Enregistrer</button>
          <button class="admin-btn admin-btn-primary" onclick="AdminPanel._clearShopItemForm()">🗑️ Vider</button>
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">Articles en boutique (${shopItems.length})</div>
        <div class="admin-list">${list || '<p style="color:#888;">Aucun article créé.</p>'}</div>
      </div>
    `;
  }

  function _shopResolveRefDef(state, shopItem) {
    if (shopItem.category === 'equipment') return state.equipment.find(e => e.id === shopItem.refId);
    if (shopItem.category === 'item') return state.items.find(i => i.id === shopItem.refId);
    if (shopItem.category === 'character') return state.characters.find(c => c.id === shopItem.refId);
    return null;
  }

  /** Construit les options du select "Article" selon la catégorie choisie. */
  function _shopRefOptionsHtml(category, selectedId) {
    const state = GameState.get();
    let pool = [];
    if (category === 'equipment') pool = state.equipment;
    else if (category === 'item') pool = state.items;
    else if (category === 'character') pool = state.characters.filter(c => c.evolutionStage === 0);

    return pool.map(p => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.icon ? p.icon + ' ' : ''}${p.name}</option>`).join('')
      || '<option value="">— Aucun élément disponible —</option>';
  }

  function _onShopCategoryChange(category) {
    const sel = document.getElementById('sh-refid');
    if (sel) sel.innerHTML = _shopRefOptionsHtml(category);
  }

  function _onShopLimitTypeChange(type) {
    const field = document.getElementById('sh-limit-amount-field');
    if (field) field.style.display = type === 'none' ? 'none' : '';
  }

  function _saveShopItem() {
    const category = document.getElementById('sh-category')?.value;
    const refId = document.getElementById('sh-refid')?.value;
    const price = parseInt(document.getElementById('sh-price')?.value || '0');
    if (!refId) { _notify('❌ Choisis un article à vendre.', 'error'); return; }
    if (price <= 0) { _notify('❌ Le prix doit être supérieur à 0.', 'error'); return; }

    const limitType = document.getElementById('sh-limit-type')?.value || 'none';
    const limitAmount = parseInt(document.getElementById('sh-limit-amount')?.value || '1');

    const idInput = document.getElementById('sh-id')?.value.trim();
    const id = idInput || `shop_${Date.now()}`;
    const data = {
      id, category, refId, price,
      currency: document.getElementById('sh-currency')?.value || 'crystals',
      active: document.getElementById('sh-active')?.value === '1',
      limit: { type: limitType, amount: limitType === 'none' ? 0 : limitAmount },
    };

    const state = GameState.get();
    const shopItems = [...(state.shopItems || [])];
    const idx = shopItems.findIndex(s => s.id === id);
    if (idx >= 0) shopItems[idx] = data; else shopItems.push(data);

    GameState.updateShopItems(shopItems);
    _notify('✅ Article de boutique enregistré.');
    _clearShopItemForm();
    switchTab('shop');
  }

  function _editShopItem(id) {
    const state = GameState.get();
    const s = (state.shopItems || []).find(x => x.id === id);
    if (!s) return;
    _setVal('sh-id', s.id);
    _setVal('sh-category', s.category);
    document.getElementById('sh-refid').innerHTML = _shopRefOptionsHtml(s.category, s.refId);
    _setVal('sh-price', s.price);
    _setVal('sh-currency', s.currency);
    _setVal('sh-limit-type', s.limit?.type || 'none');
    _setVal('sh-limit-amount', s.limit?.amount || 1);
    _setVal('sh-active', s.active ? '1' : '0');
    _onShopLimitTypeChange(s.limit?.type || 'none');
    document.getElementById('admin-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function _toggleShopItemActive(id) {
    const state = GameState.get();
    const shopItems = (state.shopItems || []).map(s => s.id === id ? { ...s, active: !s.active } : s);
    GameState.updateShopItems(shopItems);
    switchTab('shop');
  }

  function _deleteShopItem(id) {
    if (!confirm('Supprimer définitivement cet article de la boutique ?')) return;
    const state = GameState.get();
    GameState.updateShopItems((state.shopItems || []).filter(s => s.id !== id));
    _notify('🗑️ Article supprimé.');
    switchTab('shop');
  }

  function _clearShopItemForm() {
    _setVal('sh-id', '');
    _setVal('sh-category', 'equipment');
    document.getElementById('sh-refid').innerHTML = _shopRefOptionsHtml('equipment');
    _setVal('sh-price', '100');
    _setVal('sh-currency', 'crystals');
    _setVal('sh-limit-type', 'none');
    _setVal('sh-limit-amount', '1');
    _setVal('sh-active', '1');
    _onShopLimitTypeChange('none');
  }

  // ─── ONGLET GACHA ────────────────────────────────────────────────────────────

  function _renderGachaTab() {
    const state   = GameState.get();
    const cfg     = state.config.gacha;
    const banners = state.banners;
    const chars   = state.characters;

    const charOptions = chars.map(c => `<option value="${c.id}">${c.name} (${c.id})</option>`).join('');

    // Taux de drop actuels (config ou fallback database)
    const dropRates = cfg.dropRates || {
      common:50, uncommon:30, rare:12, epic:5, legendary:2, mythic:0.5
    };
    const totalWeight = Object.values(dropRates).reduce((a,b) => a+b, 0);

    const rarityMeta = {
      common:    { label:'Commune',    color:'#9CA3AF' },
      uncommon:  { label:'Peu commune',color:'#34D399' },
      rare:      { label:'Rare',       color:'#60A5FA' },
      epic:      { label:'Épique',     color:'#A78BFA' },
      legendary: { label:'Légendaire', color:'#F59E0B' },
      mythic:    { label:'Mythique',   color:'#F43F5E' },
    };

    const dropRateRows = RARITIES.map(r => {
      const meta   = rarityMeta[r] || { label:r, color:'#fff' };
      const weight = dropRates[r] !== undefined ? dropRates[r] : 0;
      const pct    = totalWeight > 0 ? (weight / totalWeight * 100).toFixed(2) : '0.00';
      return `
        <tr>
          <td style="padding:8px 12px;">
            <span class="badge badge-${r}" style="color:${meta.color}">${meta.label}</span>
          </td>
          <td style="padding:8px 12px; text-align:center;">
            <input type="number" id="drop-${r}" value="${weight}"
              min="0" max="9999" step="0.1"
              style="width:80px;background:#0f3460;border:1px solid #444;color:#fff;border-radius:4px;padding:5px;text-align:center;font-size:.85rem;"
              oninput="AdminPanel._updateDropTotal()" />
          </td>
          <td style="padding:8px 12px; text-align:right;">
            <span id="drop-pct-${r}" style="color:${meta.color};font-family:monospace;font-weight:700;">${pct}%</span>
          </td>
          <td style="padding:8px 12px; width:200px;">
            <div style="background:#1a1a2e;border-radius:4px;height:10px;overflow:hidden;">
              <div id="drop-bar-${r}" style="height:100%;width:${pct}%;background:${meta.color};transition:width .3s ease;"></div>
            </div>
          </td>
        </tr>`;
    }).join('');

    const bannerList = banners.map(b => `
      <div class="admin-list-item">
        <div class="admin-list-item-info">
          <div class="admin-list-item-name">
            ${b.name}
            <span style="font-size:.72rem; color:${b.active ? '#4ade80' : '#f87171'}">${b.active ? '● Actif' : '○ Inactif'}</span>
          </div>
          <div class="admin-list-item-sub">${b.description}</div>
          <div class="admin-list-item-sub">Featured: ${b.featured?.join(', ') || 'Aucun'} | Pool: ${b.pool} | Boost: ×${b.featuredRateBoost}</div>
        </div>
        <div class="admin-list-item-actions">
          <button class="admin-btn admin-btn-primary admin-btn-sm" onclick="AdminPanel._editBanner('${b.id}')">✏️</button>
          <button class="admin-btn admin-btn-danger  admin-btn-sm" onclick="AdminPanel._deleteBanner('${b.id}')">🗑️</button>
        </div>
      </div>
    `).join('');

    return `
      <div class="admin-section">
        <div class="admin-section-title">Configuration Gacha</div>
        <div class="admin-grid">
          <div class="admin-field"><label>Nom de la monnaie</label><input type="text" id="gacha-currency" value="${cfg.currencyName}" /></div>
          <div class="admin-field"><label>Coût invocation simple</label><input type="number" id="gacha-cost-single" value="${cfg.singlePullCost}" min="0" /></div>
          <div class="admin-field"><label>Coût invocation ×10</label><input type="number" id="gacha-cost-ten" value="${cfg.tenPullCost}" min="0" /></div>
          <div class="admin-field"><label>Garantie Rare après (pulls)</label><input type="number" id="gacha-pity-rare" value="${cfg.guaranteedRareAfter}" min="1" /></div>
          <div class="admin-field"><label>Garantie Épique après (pulls)</label><input type="number" id="gacha-pity-epic" value="${cfg.guaranteedEpicAfter}" min="1" /></div>
          <div class="admin-field"><label>Garantie Légendaire après (pulls)</label><input type="number" id="gacha-pity-legendary" value="${cfg.guaranteedLegendaryAfter}" min="1" /></div>
        </div>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._saveGachaConfig()">💾 Sauver config</button>
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">🎲 Taux de drop par rareté</div>
        <p style="font-size:.78rem; color:#888; margin-bottom:12px;">
          Les poids sont relatifs. Le taux réel (%) est calculé automatiquement selon le total.
          La pitié garantit un minimum quelle que soit la configuration.
        </p>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="font-size:.78rem; color:#aaa; border-bottom:1px solid #333;">
              <th style="padding:8px 12px;text-align:left;">Rareté</th>
              <th style="padding:8px 12px;text-align:center;">Poids</th>
              <th style="padding:8px 12px;text-align:right;">Taux réel</th>
              <th style="padding:8px 12px;">Répartition</th>
            </tr>
          </thead>
          <tbody>${dropRateRows}</tbody>
          <tfoot>
            <tr style="border-top:1px solid #333;">
              <td colspan="2" style="padding:8px 12px; font-size:.8rem; color:#aaa;">
                Total des poids : <strong id="drop-total" style="color:#e8d5b7">${totalWeight.toFixed(1)}</strong>
              </td>
              <td colspan="2" style="padding:8px 12px; font-size:.75rem; color:#888; text-align:right;">
                (total ≠ 100 : les % sont normalisés automatiquement)
              </td>
            </tr>
          </tfoot>
        </table>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._saveDropRates()">💾 Sauver les taux</button>
          <button class="admin-btn admin-btn-primary" onclick="AdminPanel._resetDropRates()">↩ Réinitialiser</button>
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">Créer / Modifier une bannière</div>
        <div class="admin-grid">
          <div class="admin-field"><label>ID</label><input type="text" id="banner-id" placeholder="banner_fire" /></div>
          <div class="admin-field"><label>Nom</label><input type="text" id="banner-name" placeholder="Bannière Flamme" /></div>
          <div class="admin-field">
            <label>Active</label>
            <select id="banner-active"><option value="1">Oui</option><option value="0">Non</option></select>
          </div>
          <div class="admin-field"><label>Pool</label>
            <select id="banner-pool"><option value="all">Tous</option><option value="featured">Featured uniquement</option></select>
          </div>
          <div class="admin-field"><label>Boost featured (×)</label><input type="number" id="banner-boost" value="2.0" step="0.1" min="1" /></div>
        </div>
        <div class="admin-field" style="margin-top:10px;">
          <label>Description</label>
          <textarea id="banner-desc" placeholder="Description de la bannière..."></textarea>
        </div>
        <div class="admin-field" style="margin-top:10px;">
          <label>Espèces featured (sélection multiple)</label>
          <select id="banner-featured" multiple style="height:120px;background:#0f3460;border:1px solid #444;color:#fff;border-radius:6px;padding:4px;">
            ${charOptions}
          </select>
          <div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap;">
            <span style="font-size:.72rem; color:#888;">Maintenez Ctrl/Cmd pour sélectionner plusieurs</span>
            <button class="admin-btn admin-btn-primary admin-btn-sm" onclick="AdminPanel._addCharsByTagToBanner()">🏷️ Ajouter par tag</button>
          </div>
        </div>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._saveBanner()">💾 Enregistrer</button>
          <button class="admin-btn admin-btn-primary" onclick="AdminPanel._clearBannerForm()">🗑️ Vider</button>
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">Bannières (${banners.length})</div>
        <div class="admin-list">${bannerList}</div>
      </div>
    `;
  }

  function _saveGachaConfig() {
    const state  = GameState.get();
    const newCfg = {
      ...state.config,
      gacha: {
        ...state.config.gacha,
        currencyName: document.getElementById('gacha-currency')?.value.trim() || 'Gemmes',
        singlePullCost: parseInt(document.getElementById('gacha-cost-single')?.value || '100'),
        tenPullCost: parseInt(document.getElementById('gacha-cost-ten')?.value || '900'),
        guaranteedRareAfter: parseInt(document.getElementById('gacha-pity-rare')?.value || '10'),
        guaranteedEpicAfter: parseInt(document.getElementById('gacha-pity-epic')?.value || '50'),
        guaranteedLegendaryAfter: parseInt(document.getElementById('gacha-pity-legendary')?.value || '100'),
      },
    };
    GameState.updateConfig(newCfg);
    _notify('✅ Configuration Gacha sauvegardée.');
  }

  /** Sauvegarde les taux de drop */
  function _saveDropRates() {
    const state = GameState.get();
    const dropRates = {};
    RARITIES.forEach(r => {
      dropRates[r] = parseFloat(document.getElementById(`drop-${r}`)?.value || '0');
    });
    const total = Object.values(dropRates).reduce((a, b) => a + b, 0);
    if (total <= 0) { _notify('❌ Le total des poids doit être > 0.', 'error'); return; }
    const newCfg = {
      ...state.config,
      gacha: { ...state.config.gacha, dropRates },
    };
    GameState.updateConfig(newCfg);
    _notify('✅ Taux de drop sauvegardés.');
  }

  /** Réinitialise les taux de drop aux valeurs par défaut */
  function _resetDropRates() {
    const defaults = { common:50, uncommon:30, rare:12, epic:5, legendary:2, mythic:0.5 };
    RARITIES.forEach(r => {
      const inp = document.getElementById(`drop-${r}`);
      if (inp) inp.value = defaults[r];
    });
    _updateDropTotal();
    _notify('↩ Taux de drop réinitialisés (non sauvegardés).');
  }

  /** Met à jour en temps réel le total et les % affichés dans le tableau */
  function _updateDropTotal() {
    const rarityMeta = {
      common:    '#9CA3AF', uncommon: '#34D399', rare:      '#60A5FA',
      epic:      '#A78BFA', legendary:'#F59E0B', mythic:    '#F43F5E',
    };
    let total = 0;
    const vals = {};
    RARITIES.forEach(r => {
      const v = parseFloat(document.getElementById(`drop-${r}`)?.value || '0');
      vals[r] = v;
      total += v;
    });
    const totalEl = document.getElementById('drop-total');
    if (totalEl) totalEl.textContent = total.toFixed(1);
    RARITIES.forEach(r => {
      const pct    = total > 0 ? (vals[r] / total * 100).toFixed(2) : '0.00';
      const pctEl  = document.getElementById(`drop-pct-${r}`);
      const barEl  = document.getElementById(`drop-bar-${r}`);
      if (pctEl) pctEl.textContent = `${pct}%`;
      if (barEl) barEl.style.width = `${pct}%`;
    });
  }

  /** Sauvegarde les poids de fréquence d'apparition des ennemis par rareté */
  function _saveEnemyRarityWeights() {
    const state = GameState.get();
    const enemyRarityWeights = {};
    RARITIES.forEach(r => {
      enemyRarityWeights[r] = parseFloat(document.getElementById(`enemy-weight-${r}`)?.value || '0');
    });
    const total = Object.values(enemyRarityWeights).reduce((a, b) => a + b, 0);
    if (total <= 0) { _notify('❌ Le total des poids doit être > 0.', 'error'); return; }
    GameState.updateConfig({
      ...state.config,
      combat: { ...state.config.combat, enemyRarityWeights },
    });
    _notify('✅ Fréquence d\'apparition des ennemis sauvegardée.');
  }

  /** Réinitialise les poids de fréquence d'apparition des ennemis aux valeurs par défaut */
  function _resetEnemyRarityWeights() {
    const defaults = { common:50, uncommon:30, rare:12, epic:5, legendary:2, mythic:0.5 };
    RARITIES.forEach(r => {
      const inp = document.getElementById(`enemy-weight-${r}`);
      if (inp) inp.value = defaults[r];
    });
    _updateEnemyWeightTotal();
    _notify('↩ Fréquences réinitialisées (non sauvegardées).');
  }

  /** Met à jour en temps réel les % et barres du tableau de fréquence d'apparition */
  function _updateEnemyWeightTotal() {
    let total = 0;
    const vals = {};
    RARITIES.forEach(r => {
      const v = parseFloat(document.getElementById(`enemy-weight-${r}`)?.value || '0');
      vals[r] = v;
      total += v;
    });
    RARITIES.forEach(r => {
      const pct   = total > 0 ? (vals[r] / total * 100).toFixed(2) : '0.00';
      const pctEl = document.getElementById(`enemy-weight-pct-${r}`);
      const barEl = document.getElementById(`enemy-weight-bar-${r}`);
      if (pctEl) pctEl.textContent = `${pct}%`;
      if (barEl) barEl.style.width = `${pct}%`;
    });
  }

  /** Sauvegarde les bonus d'XP par rareté d'ennemi */
  function _saveEnemyXpBonus() {
    const state = GameState.get();
    const enemyXpBonusByRarity = {};
    RARITIES.forEach(r => {
      enemyXpBonusByRarity[r] = Math.max(0, parseFloat(document.getElementById(`enemy-xpbonus-${r}`)?.value || '0'));
    });
    GameState.updateConfig({
      ...state.config,
      combat: { ...state.config.combat, enemyXpBonusByRarity },
    });
    _notify('✅ Bonus d\'XP par rareté sauvegardés.');
  }

  function _saveBanner() {
    const id   = document.getElementById('banner-id')?.value.trim() || `banner_${Date.now()}`;
    const name = document.getElementById('banner-name')?.value.trim();
    if (!name) { _notify('❌ Nom obligatoire.', 'error'); return; }

    const featuredSel = document.getElementById('banner-featured');
    const featured = featuredSel
      ? Array.from(featuredSel.selectedOptions).map(o => o.value)
      : [];

    const bannerData = {
      id,
      name,
      description: document.getElementById('banner-desc')?.value.trim() || '',
      active: document.getElementById('banner-active')?.value === '1',
      pool: document.getElementById('banner-pool')?.value || 'all',
      featured,
      featuredRateBoost: parseFloat(document.getElementById('banner-boost')?.value || '2.0'),
    };

    const state = GameState.get();
    const existing = state.banners.find(b => b.id === id);
    const newBanners = existing
      ? state.banners.map(b => b.id === id ? bannerData : b)
      : [...state.banners, bannerData];

    GameState.updateBanners(newBanners);
    _notify(`✅ Bannière "${name}" enregistrée.`);
    _clearBannerForm();
    switchTab('gacha');
  }

  function _editBanner(id) {
    const state = GameState.get();
    const b = state.banners.find(x => x.id === id);
    if (!b) return;
    _setVal('banner-id', b.id);
    _setVal('banner-name', b.name);
    _setVal('banner-desc', b.description || '');
    _setVal('banner-active', b.active ? '1' : '0');
    _setVal('banner-pool', b.pool || 'all');
    _setVal('banner-boost', b.featuredRateBoost);
    // Sélectionner les featured
    const sel = document.getElementById('banner-featured');
    if (sel && b.featured) {
      Array.from(sel.options).forEach(opt => {
        opt.selected = b.featured.includes(opt.value);
      });
    }
    document.getElementById('admin-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function _deleteBanner(id) {
    if (!confirm(`Supprimer la bannière "${id}" ?`)) return;
    const state = GameState.get();
    GameState.updateBanners(state.banners.filter(b => b.id !== id));
    _notify('🗑️ Bannière supprimée.');
    switchTab('gacha');
  }

  function _clearBannerForm() {
    ['banner-id','banner-name','banner-desc'].forEach(id => _setVal(id, ''));
    _setVal('banner-active', '1');
    _setVal('banner-pool', 'all');
    _setVal('banner-boost', '2.0');
    const sel = document.getElementById('banner-featured');
    if (sel) Array.from(sel.options).forEach(o => o.selected = false);
  }

  // ─── ONGLET ÉVOLUTIONS ───────────────────────────────────────────────────────

  /** Génère le HTML des tags d'une lignée (sélecteurs + pills supprimables). */
  function _renderLineTagsUI(lineId) {
    const state   = GameState.get();
    const cats    = state.tagCategories || [];
    const lineTags = GameState.getLineTags(lineId) || [];

    const pills = lineTags.map(tagId => {
      // Trouver le label du tag
      let label = tagId;
      cats.forEach(cat => { const t = cat.tags.find(t => t.id === tagId); if (t) label = `${cat.name} · ${t.label}`; });
      return `<span class="tag-pill" style="display:inline-flex;align-items:center;gap:4px;background:#1a3a2a;border:1px solid #4ade80;color:#4ade80;border-radius:999px;padding:2px 8px;font-size:.7rem;">
        ${_escapeAttr(label)}
        <button onclick="AdminPanel._removeLineTag('${lineId}','${tagId}')" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:.8rem;padding:0;line-height:1;">✕</button>
      </span>`;
    }).join('');

    const selects = cats.map(cat => {
      const opts = cat.tags
        .filter(t => !lineTags.includes(t.id))
        .map(t => `<option value="${t.id}">${_escapeAttr(t.label)}</option>`)
        .join('');
      if (!opts) return '';
      return `<select onchange="AdminPanel._addLineTag('${lineId}', this)" style="font-size:.72rem;background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:3px 6px;">
        <option value="">+ ${_escapeAttr(cat.name)}</option>
        ${opts}
      </select>`;
    }).join('');

    return `<div class="line-tags-row" style="margin-bottom:10px;">
      <div style="font-size:.72rem;color:#aaa;margin-bottom:4px;">🏷️ Tags</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px;">${pills || '<span style="font-size:.7rem;color:#666;">Aucun tag</span>'}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">${selects}</div>
    </div>`;
  }

  function _addLineTag(lineId, selectEl) {
    const tagId = selectEl.value;
    if (!tagId) return;
    const current = GameState.getLineTags(lineId) || [];
    if (!current.includes(tagId)) {
      GameState.updateLineTags(lineId, [...current, tagId]);
    }
    selectEl.value = '';
    // Re-render uniquement la lignée concernée sans remonter la page
    _refreshLineTagsUI(lineId);
  }

  function _removeLineTag(lineId, tagId) {
    const current = GameState.getLineTags(lineId) || [];
    GameState.updateLineTags(lineId, current.filter(t => t !== tagId));
    _refreshLineTagsUI(lineId);
  }

  /** Re-render uniquement le bloc tags d'une lignée sans recharger tout l'onglet. */
  function _refreshLineTagsUI(lineId) {
    const item = document.querySelector(`.admin-list-item[data-line-id="${lineId}"]`);
    if (!item) return;
    const existing = item.querySelector('.line-tags-row');
    const newHtml  = _renderLineTagsUI(lineId);
    const tmp = document.createElement('div');
    tmp.innerHTML = newHtml;
    const newEl = tmp.firstElementChild;
    if (existing) item.replaceChild(newEl, existing);
    else {
      // Insérer après la checkbox Dispo Combat Ligne
      const checkbox = item.querySelector('.line-avail-checkbox')?.closest('label');
      if (checkbox) checkbox.after(newEl);
      else item.prepend(newEl);
    }
  }

  function _renderEvolutionsTab() {
    const state = GameState.get();
    const chars = state.characters;

    // Grouper par evolutionLine
    const lines = {};
    chars.forEach(c => {
      const line = c.evolutionLine || c.id;
      if (!lines[line]) lines[line] = [];
      lines[line].push(c);
    });

    // Trier chaque ligne par evolutionStage
    Object.values(lines).forEach(arr => arr.sort((a, b) => (a.evolutionStage || 0) - (b.evolutionStage || 0)));

    // Trier l'ordre d'affichage des lignées elles-mêmes (Nom ou Rareté de la forme de base)
    const rarityIndex = (r) => { const idx = RARITIES.indexOf(r); return idx === -1 ? 0 : idx; };
    const sortedLineEntries = Object.entries(lines).sort(([, membersA], [, membersB]) => {
      if (_evoSortKey === 'rarity') {
        return rarityIndex(membersB[0].rarity) - rarityIndex(membersA[0].rarity) || membersA[0].name.localeCompare(membersB[0].name);
      }
      return membersA[0].name.localeCompare(membersB[0].name);
    });

    const lineHtml = sortedLineEntries.map(([lineId, members]) => {
      const baseRarity = members[0].rarity;
      const distinctRarities = [...new Set(members.map(m => m.rarity))];
      const rarityWarning = distinctRarities.length > 1
        ? `<span style="font-size:.62rem; color:#f87171; margin-left:6px;">⚠ raretés mixtes dans cette lignée</span>`
        : '';

      const chain = members.map((c, i) => `
        <div class="evo-chain-member" draggable="true" data-drag-id="${c.id}"
             style="display:inline-block; text-align:center; margin:0 8px; cursor:grab;"
             ondragstart="AdminPanel._dragStart(event,'evo','${c.id}','${lineId}')"
             ondragover="AdminPanel._dragOver(event)"
             ondragleave="AdminPanel._dragLeave(event)"
             ondrop="AdminPanel._dragDropEvoStage(event,'${lineId}','${c.id}')"
             ondragend="AdminPanel._dragEnd(event)">
          ${c.portrait ? `<img src="${c.portrait}" style="width:50px;height:62px;object-fit:cover;border-radius:4px;" />` : `<div style="width:50px;height:62px;background:#333;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#888;font-size:.7rem;">?</div>`}
          <div style="font-size:.75rem; color:#e8d5b7; margin-top:4px;">${c.name}</div>
          <div style="font-size:.68rem; color:#888;">Niv. ${c.evolutionCondition?.value || '—'}</div>
        </div>
        ${i < members.length - 1 ? '<span style="font-size:1.2rem; color:#e94560; vertical-align:middle;">→</span>' : ''}
      `).join('');

      return `
        <div class="admin-list-item" data-line-id="${lineId}" style="flex-direction:column; align-items:flex-start;">
          <div style="font-size:.8rem; color:#aaa; margin-bottom:8px;">
            Lignée : <strong style="color:#e94560">${lineId}</strong>
            <span class="badge badge-${baseRarity}" style="margin-left:8px;">${RARITY_LABELS[baseRarity] || baseRarity}</span>
            ${rarityWarning}
          </div>
          <label style="display:flex; align-items:center; gap:6px; font-size:.75rem; color:#ccc; margin-bottom:10px; cursor:pointer;">
            <input type="checkbox" class="line-avail-checkbox" ${members[0].availableInLineCombat !== false ? 'checked' : ''}
                   onchange="AdminPanel._toggleLineCombatAvailability('${members[0].id}', this.checked)" />
            ⚔ Dispo en Combat de Ligne
          </label>
          ${_renderLineTagsUI(lineId)}
          <p style="font-size:.68rem; color:#666; margin:0 0 8px;">Glissez une forme pour réorganiser l'ordre des stades.</p>
          <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px;">${chain}</div>
          <div style="margin-top:8px;">
            ${members.map(c => `
              <div style="font-size:.72rem; color:#888;">
                <strong style="color:#e8d5b7">${c.name}</strong> (${c.id}) Stage ${c.evolutionStage || 0}
                ${c.evolvesTo ? `→ ${c.evolvesTo} @ lv.${c.evolutionCondition?.value || '?'}` : '<span style="color:#4ade80">✓ Forme finale</span>'}
                <button class="admin-btn admin-btn-primary admin-btn-sm" style="margin-left:8px;" onclick="AdminPanel._editCharacter('${c.id}'); AdminPanel.switchTab('characters');">✏️ Éditer</button>
                <button class="admin-btn admin-btn-secondary admin-btn-sm" onclick="AdminPanel._upgradeCharacter('${c.id}')">⬆️ Upgrade</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="admin-section">
        <div class="admin-section-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span>Arbres évolutifs</span>
          <select class="sort-select" id="evo-sort" onchange="AdminPanel._sortEvolutionLines(this.value)">
            <option value="name"   ${_evoSortKey === 'name'   ? 'selected' : ''}>Trier : Nom (A-Z)</option>
            <option value="rarity" ${_evoSortKey === 'rarity' ? 'selected' : ''}>Trier : Rareté</option>
          </select>
        </div>
        <p style="font-size:.8rem; color:#888; margin-bottom:12px;">
          Les évolutions se configurent dans l'onglet <strong>Espèces</strong>.
          Cet onglet affiche les chaînes complètes pour visualisation et édition rapide.
          La rareté affichée est celle des créatures de la lignée (normalement unique).
        </p>
        <div class="admin-actions" style="margin-bottom:14px;">
          <button class="admin-btn admin-btn-warning" onclick="AdminPanel._uncheckEpicPlusLines()">
            🚫 Décocher toutes les lignées Épique et +
          </button>
        </div>
        <div class="admin-list">${lineHtml}</div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">⚠️ Réinitialiser toutes les évolutions</div>
        <p style="font-size:.8rem; color:#888;">Force tous les créatures de la collection joueur à revenir au stade 0 de leur lignée.</p>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-danger" onclick="AdminPanel._resetAllEvolutions()">⚠️ Réinitialiser</button>
        </div>
      </div>
    `;
  }

  /**
   * Change l'ordre d'affichage des lignées dans l'onglet Évolutions (Nom ou Rareté).
   * Affichage uniquement : ne modifie pas l'ordre canonique des créatures.
   */
  function _sortEvolutionLines(key) {
    _evoSortKey = key || 'name';
    switchTab('evolutions');
  }

  /**
   * Décoche (retire du Combat de Ligne) toutes les lignées dont la rareté
   * (celle des créatures qui la composent) est Épique, Légendaire ou Mythique.
   */
  function _uncheckEpicPlusLines() {
    const state = GameState.get();
    const targetRarities = ['epic', 'legendary', 'mythic'];
    const lines = {};
    state.characters.forEach(c => {
      const line = c.evolutionLine || c.id;
      if (!lines[line]) lines[line] = [];
      lines[line].push(c);
    });

    let count = 0;
    Object.values(lines).forEach(members => {
      const base = members.slice().sort((a, b) => (a.evolutionStage || 0) - (b.evolutionStage || 0))[0];
      if (targetRarities.includes(base.rarity) && base.availableInLineCombat !== false) {
        GameState.updateCharDef(base.id, { availableInLineCombat: false });
        count++;
      }
    });

    _notify(count > 0
      ? `🚫 ${count} lignée(s) Épique et + retirée(s) du Combat de Ligne.`
      : 'Toutes les lignées Épique et + étaient déjà décochées.');
    switchTab('evolutions');
  }

  /**
   * Active/désactive la disponibilité d'une lignée en Combat de Ligne.
   * Le flag est porté par la forme de base (stade 0) de la lignée, seule
   * forme effectivement combattue dans ce mode.
   */
  function _toggleLineCombatAvailability(baseCharId, checked) {
    GameState.updateCharDef(baseCharId, { availableInLineCombat: checked });
    _notify(checked ? '✅ Lignée disponible en Combat de Ligne.' : '🚫 Lignée retirée du Combat de Ligne.');
  }

  function _resetAllEvolutions() {
    if (!confirm('Réinitialiser toutes les évolutions ? Les créatures reviendront à leur forme de base.')) return;
    const state = GameState.get();
    const player = GameState.getPlayer();
    // Remettre chaque instance sur la forme de base de sa lignée
    player.collection.forEach(inst => {
      const def = GameState.getCharDef(inst.charId);
      if (!def) return;
      const baseDef = state.characters.find(c => c.evolutionLine === def.evolutionLine && c.evolutionStage === 0);
      if (baseDef && baseDef.id !== inst.charId) {
        inst.charId = baseDef.id;
      }
    });
    GameState.updatePlayer(player);
    _notify('✅ Évolutions réinitialisées.');
  }

  // ─── ONGLET AWAKENING ────────────────────────────────────────────────────────

  function _renderAwakeningTab() {
    const state = GameState.get();
    const cfg   = state.config.awakening;

    const rarityRows = RARITIES.map(r => {
      const bonuses = cfg.bonusPerLevel[r] || { hp:0, atk:0, def:0, spd:0 };
      return `
        <tr>
          <td><span class="badge badge-${r}">${RARITY_LABELS[r]}</span></td>
          <td><input type="number" id="awk-${r}-hp"  value="${bonuses.hp}"  min="0" max="100" step="0.5" style="width:60px;background:#0f3460;border:1px solid #444;color:#fff;border-radius:4px;padding:4px;text-align:center;" /></td>
          <td><input type="number" id="awk-${r}-atk" value="${bonuses.atk}" min="0" max="100" step="0.5" style="width:60px;background:#0f3460;border:1px solid #444;color:#fff;border-radius:4px;padding:4px;text-align:center;" /></td>
          <td><input type="number" id="awk-${r}-def" value="${bonuses.def}" min="0" max="100" step="0.5" style="width:60px;background:#0f3460;border:1px solid #444;color:#fff;border-radius:4px;padding:4px;text-align:center;" /></td>
          <td><input type="number" id="awk-${r}-spd" value="${bonuses.spd}" min="0" max="100" step="0.5" style="width:60px;background:#0f3460;border:1px solid #444;color:#fff;border-radius:4px;padding:4px;text-align:center;" /></td>
        </tr>
      `;
    }).join('');

    return `
      <div class="admin-section">
        <div class="admin-section-title">Paramètres globaux Awakening</div>
        <div class="admin-grid">
          <div class="admin-field">
            <label>Niveau Awakening maximum</label>
            <input type="number" id="awk-max-level" value="${cfg.maxLevel}" min="1" max="99" />
          </div>
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">Bonus % par niveau d'Awakening (par rareté)</div>
        <p style="font-size:.78rem; color:#888; margin-bottom:12px;">
          Ces bonus sont appliqués pour chaque niveau d'Awakening (cumulatif).
          Ex: 5% ATK à level 3 d'Awakening = +15% ATK total.
        </p>
        <div style="overflow-x:auto;">
          <table style="border-collapse:collapse; width:100%;">
            <thead>
              <tr style="font-size:.78rem; color:#aaa;">
                <th style="padding:8px; text-align:left;">Rareté</th>
                <th style="padding:8px;">+PV %</th>
                <th style="padding:8px;">+ATK %</th>
                <th style="padding:8px;">+DEF %</th>
                <th style="padding:8px;">+VIT %</th>
              </tr>
            </thead>
            <tbody>${rarityRows}</tbody>
          </table>
        </div>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._saveAwakening()">💾 Sauver</button>
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">Awakening des créatures du joueur</div>
        ${_renderPlayerAwakeningList()}
      </div>
    `;
  }

  function _renderPlayerAwakeningList() {
    const player = GameState.getPlayer();
    const state  = GameState.get();
    if (player.collection.length === 0) return '<p style="color:#888;">Aucun créature dans la collection.</p>';

    return `<div class="admin-list">` + player.collection.map(inst => {
      const def = GameState.getCharDef(inst.charId);
      if (!def) return '';
      return `
        <div class="admin-list-item">
          <div class="admin-list-item-info">
            <div class="admin-list-item-name">${def.name} <span class="badge badge-${def.rarity}">${RARITY_LABELS[def.rarity]}</span></div>
            <div class="admin-list-item-sub">Niv.${inst.level} | Awakening: ${inst.awakening}/${state.config.awakening.maxLevel}</div>
          </div>
          <div class="admin-list-item-actions" style="align-items:center; gap:6px;">
            <button class="admin-btn admin-btn-primary admin-btn-sm" onclick="AdminPanel._setAwakening('${inst.instanceId}', ${Math.max(0, inst.awakening - 1)})">−</button>
            <span style="color:#e8d5b7; font-weight:600; min-width:20px; text-align:center;">${inst.awakening}</span>
            <button class="admin-btn admin-btn-success admin-btn-sm" onclick="AdminPanel._setAwakening('${inst.instanceId}', ${inst.awakening + 1})">+</button>
          </div>
        </div>
      `;
    }).join('') + '</div>';
  }

  function _setAwakening(instanceId, value) {
    const player = GameState.getPlayer();
    const inst   = player.collection.find(c => c.instanceId === instanceId);
    if (!inst) return;
    const maxAwk = GameState.getConfig().awakening.maxLevel;
    inst.awakening = Math.max(0, Math.min(maxAwk, value));
    GameState.updatePlayer(player);
    // Refresh la section
    const listEl = document.querySelector('#admin-content .admin-section:last-child');
    if (listEl) {
      const title = listEl.querySelector('.admin-section-title');
      listEl.innerHTML = `<div class="admin-section-title">${title ? title.textContent : 'Awakening joueur'}</div>${_renderPlayerAwakeningList()}`;
    }
    _notify(`⭐ Awakening mis à jour.`);
  }

  function _saveAwakening() {
    const state = GameState.get();
    const bonusPerLevel = {};
    RARITIES.forEach(r => {
      bonusPerLevel[r] = {
        hp:  parseFloat(document.getElementById(`awk-${r}-hp`)?.value  || '0'),
        atk: parseFloat(document.getElementById(`awk-${r}-atk`)?.value || '0'),
        def: parseFloat(document.getElementById(`awk-${r}-def`)?.value || '0'),
        spd: parseFloat(document.getElementById(`awk-${r}-spd`)?.value || '0'),
      };
    });

    const newCfg = {
      ...state.config,
      awakening: {
        maxLevel: parseInt(document.getElementById('awk-max-level')?.value || '6'),
        bonusPerLevel,
      },
    };
    GameState.updateConfig(newCfg);
    _notify('✅ Configuration Awakening sauvegardée.');
  }

  // ─── ONGLET JOUEUR ───────────────────────────────────────────────────────────

  function _renderPlayerTab() {
    const player = GameState.getPlayer();
    const state  = GameState.get();
    const bestiaireTotal = state.characters.length;
    const bestiaireFound = Object.keys(player.bestiaire || {}).length;

    return `
      <div class="admin-section">
        <div class="admin-section-title">Informations Joueur</div>
        <div class="admin-grid">
          <div class="admin-field"><label>Nom du joueur</label><input type="text" id="player-name" value="${player.name}" /></div>
          <div class="admin-field"><label>Niveau joueur</label><input type="number" id="player-level" value="${player.level}" min="1" /></div>
        </div>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._savePlayerInfo()">💾 Sauver</button>
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">Collection (${player.collection.length} créatures)</div>
        ${_renderPlayerCollection(player, state)}
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">Ajouter un créature à la collection</div>
        <div class="admin-grid">
          <div class="admin-field">
            <label>Espèce</label>
            <select id="admin-add-char">
              ${state.characters.map(c => `<option value="${c.id}">${c.name} (${c.id})</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._adminAddChar()">➕ Ajouter</button>
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">Bestiaire (${bestiaireFound}/${bestiaireTotal})</div>
        <p style="color:#4ade80; font-size:.85rem;">Complétion : ${Math.round(bestiaireFound/Math.max(1,bestiaireTotal)*100)}%</p>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:10px;">
          ${state.characters.map(c => {
            const entry = (player.bestiaire || {})[c.id];
            return `
              <div style="width:60px; text-align:center; opacity:${entry ? '1' : '0.3'}">
                ${c.portrait ? `<img src="${c.portrait}" style="width:50px;height:62px;object-fit:cover;border-radius:4px;" />` : `<div style="width:50px;height:62px;background:#333;border-radius:4px;margin:0 auto;"></div>`}
                <div style="font-size:.65rem; color:#aaa; margin-top:2px;">${c.name}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">⚠️ Zone dangereuse</div>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-danger" onclick="AdminPanel._resetPlayer()">🗑️ Réinitialiser le joueur</button>
          <button class="admin-btn admin-btn-warning" onclick="AdminPanel._clearCollection()">🗑️ Vider la collection</button>
        </div>
      </div>
    `;
  }

  function _renderPlayerCollection(player, state) {
    if (player.collection.length === 0) return '<p style="color:#888;">Collection vide.</p>';
    return `<div class="admin-list">` + player.collection.map(inst => {
      const def = GameState.getCharDef(inst.charId);
      if (!def) return '';
      const stats = GameDatabase.computeStats(def, inst.level, inst.awakening || 0, state.config.awakening, def.rarity, state.config.level);
      return `
        <div class="admin-list-item">
          ${def.portrait ? `<img src="${def.portrait}" style="width:40px;height:50px;object-fit:cover;border-radius:4px;" />` : `<div style="width:40px;height:50px;background:#333;border-radius:4px;"></div>`}
          <div class="admin-list-item-info">
            <div class="admin-list-item-name">${def.name} <span class="badge badge-${def.rarity}">${RARITY_LABELS[def.rarity]}</span></div>
            <div class="admin-list-item-sub">Niv.${inst.level} | XP: ${inst.xp} | Awk: ★${inst.awakening} | ${inst.instanceId}</div>
            <div class="admin-list-item-sub">PV:${stats.hp} ATK:${stats.atk} DEF:${stats.def} VIT:${stats.spd}</div>
          </div>
          <div class="admin-list-item-actions">
            <button class="admin-btn admin-btn-primary admin-btn-sm" onclick="AdminPanel._editPlayerChar('${inst.instanceId}')">✏️</button>
            <button class="admin-btn admin-btn-danger admin-btn-sm"  onclick="AdminPanel._removePlayerChar('${inst.instanceId}')">🗑️</button>
          </div>
        </div>
      `;
    }).join('') + '</div>';
  }

  function _savePlayerInfo() {
    const name  = document.getElementById('player-name')?.value.trim() || 'Naturaliste';
    const level = parseInt(document.getElementById('player-level')?.value || '1');
    GameState.updatePlayer({ name, level });
    _notify('✅ Informations joueur sauvegardées.');
  }

  function _adminAddChar() {
    const charId = document.getElementById('admin-add-char')?.value;
    if (!charId) return;
    const result = GameState.addCharacterToCollection(charId, 'admin');
    if (!result) { _notify('❌ Espèce introuvable.', 'error'); return; }
    _notify(result.isNew ? '✅ Espèce ajouté !' : `⭐ Awakening appliqué (doublon).`);
    switchTab('player');
  }

  function _editPlayerChar(instanceId) {
    const player = GameState.getPlayer();
    const inst   = player.collection.find(c => c.instanceId === instanceId);
    if (!inst) return;
    const newLevel = parseInt(prompt(`Nouveau niveau pour "${GameState.getCharDef(inst.charId)?.name || instanceId}" :`, inst.level));
    if (isNaN(newLevel) || newLevel < 1) return;
    inst.level = newLevel;
    inst.xp = 0;
    GameState.updatePlayer(player);
    _notify('✅ Niveau mis à jour.');
    switchTab('player');
  }

  function _removePlayerChar(instanceId) {
    if (!confirm('Supprimer ce créature de la collection ?')) return;
    const player = GameState.getPlayer();
    player.collection = player.collection.filter(c => c.instanceId !== instanceId);
    player.team = player.team.filter(id => id !== instanceId);
    GameState.updatePlayer(player);
    _notify('🗑️ Espèce retiré de la collection.');
    switchTab('player');
  }

  function _resetPlayer() {
    if (!confirm('⚠️ Réinitialiser COMPLÈTEMENT le joueur ? Toute progression sera perdue.')) return;
    const fresh = JSON.parse(JSON.stringify(GameDatabase.DEFAULT_PLAYER));
    fresh.energy.lastRegen = Date.now();
    GameState.updatePlayer(fresh);
    _notify('✅ Joueur réinitialisé.');
    switchTab('player');
  }

  function _clearCollection() {
    if (!confirm('Vider toute la collection du joueur ?')) return;
    const player = GameState.getPlayer();
    player.collection = [];
    player.team = [];
    GameState.updatePlayer(player);
    _notify('🗑️ Collection vidée.');
    switchTab('player');
  }

  // ─── ONGLET RESSOURCES ───────────────────────────────────────────────────────

  function _renderResourcesTab() {
    const player = GameState.getPlayer();
    const state  = GameState.get();
    const cfg    = state.config;

    return `
      <div class="admin-section">
        <div class="admin-section-title">Monnaies du joueur</div>
        <div class="admin-grid">
          <div class="admin-field">
            <label>${cfg.gacha.currencyName} actuels</label>
            <input type="number" id="res-crystals" value="${player.currency.crystals}" min="0" />
          </div>
          <div class="admin-field">
            <label>Pièces d'or actuelles</label>
            <input type="number" id="res-gold" value="${player.currency.gold || 0}" min="0" />
          </div>
        </div>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._saveResources()">💾 Mettre à jour</button>
          <button class="admin-btn admin-btn-warning" onclick="AdminPanel._addResources(1000)">+1000 Gemmes</button>
          <button class="admin-btn admin-btn-warning" onclick="AdminPanel._addResources(99999)">+99999 Gemmes</button>
          <button class="admin-btn admin-btn-warning" onclick="AdminPanel._addResources(0, 1000)">+1000 Or</button>
          <button class="admin-btn admin-btn-warning" onclick="AdminPanel._addResources(0, 99999)">+99999 Or</button>
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">Énergie</div>
        <div class="admin-grid">
          <div class="admin-field">
            <label>Énergie actuelle</label>
            <input type="number" id="res-energy-current" value="${player.energy.current}" min="0" />
          </div>
          <div class="admin-field">
            <label>Énergie maximum</label>
            <input type="number" id="res-energy-max" value="${cfg.energy.max}" min="0" />
          </div>
          <div class="admin-field">
            <label>Régén / minute</label>
            <input type="number" id="res-energy-regen" value="${cfg.energy.regenPerMinute}" min="0" step="0.1" />
          </div>
          <div class="admin-field">
            <label>Coût Mode Odyssée</label>
            <input type="number" id="res-energy-cost-story" value="${cfg.energy.costs?.story ?? 10}" min="0" />
          </div>
          <div class="admin-field">
            <label>Coût combat aléatoire</label>
            <input type="number" id="res-energy-cost-random" value="${cfg.energy.costs?.random ?? cfg.energy.combatCost ?? 10}" min="0" />
          </div>
          <div class="admin-field">
            <label>Coût combat par lignée</label>
            <input type="number" id="res-energy-cost-line" value="${cfg.energy.costs?.line ?? 20}" min="0" />
          </div>
          <div class="admin-field">
            <label>Coût Full Aléatoire</label>
            <input type="number" id="res-energy-cost-fullrandom" value="${cfg.energy.costs?.fullRandom ?? 10}" min="0" />
          </div>
          <div class="admin-field">
            <label>Coût Arène</label>
            <input type="number" id="res-energy-cost-arena" value="${cfg.energy.costs?.arena ?? 15}" min="0" />
          </div>
          <div class="admin-field">
            <label>Énergie activée</label>
            <select id="res-energy-enabled">
              <option value="1" ${cfg.energy.enabled ? 'selected' : ''}>Oui</option>
              <option value="0" ${!cfg.energy.enabled ? 'selected' : ''}>Non (illimitée)</option>
            </select>
          </div>
        </div>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._saveEnergyConfig()">💾 Sauver config énergie</button>
          <button class="admin-btn admin-btn-warning" onclick="AdminPanel._fillEnergy()">⚡ Recharger énergie</button>
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">Statistiques joueur</div>
        <div style="font-size:.85rem; line-height:1.8; color:#aaa;">
          🎯 Combats : <strong style="color:#e8d5b7">${player.stats.totalBattles}</strong><br/>
          🏆 Victoires : <strong style="color:#4ade80">${player.stats.totalVictories}</strong><br/>
          🎲 Invocations : <strong style="color:#c4b5fd">${player.stats.totalPulls}</strong><br/>
          🎣 Captures : <strong style="color:#60a5fa">${player.stats.totalCaptures}</strong>
        </div>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-danger" onclick="AdminPanel._resetStats()">🗑️ Réinitialiser les stats</button>
        </div>
      </div>
    `;
  }

  function _saveResources() {
    const crystals = parseInt(document.getElementById('res-crystals')?.value || '0');
    const gold     = parseInt(document.getElementById('res-gold')?.value || '0');
    const player   = GameState.getPlayer();
    player.currency.crystals = Math.max(0, crystals);
    player.currency.gold     = Math.max(0, gold);
    GameState.updatePlayer(player);
    _notify('✅ Monnaie mise à jour.');
  }

  function _addResources(crystalAmount, goldAmount = 0) {
    GameState.modifyResources({ crystals: crystalAmount, gold: goldAmount });
    const crystalInp = document.getElementById('res-crystals');
    const goldInp     = document.getElementById('res-gold');
    if (crystalInp) crystalInp.value = GameState.getPlayer().currency.crystals;
    if (goldInp)     goldInp.value   = GameState.getPlayer().currency.gold;
    const parts = [];
    if (crystalAmount) parts.push(`+${crystalAmount} Gemmes`);
    if (goldAmount)     parts.push(`+${goldAmount} Or`);
    _notify(`✅ ${parts.join(', ')} ajoutés.`);
  }

  function _saveEnergyConfig() {
    const state  = GameState.get();
    const player = GameState.getPlayer();
    const maxEnergy = parseInt(document.getElementById('res-energy-max')?.value || '100');
    const curEnergy = parseInt(document.getElementById('res-energy-current')?.value || '0');

    player.energy.current = Math.min(maxEnergy, Math.max(0, curEnergy));
    player.energy.max = maxEnergy;
    GameState.updatePlayer(player);

    const newCfg = {
      ...state.config,
      energy: {
        enabled: document.getElementById('res-energy-enabled')?.value === '1',
        max: maxEnergy,
        regenPerMinute: parseFloat(document.getElementById('res-energy-regen')?.value || '1'),
        combatCost: parseInt(document.getElementById('res-energy-cost-random')?.value || '10'),
        costs: {
          story:      parseInt(document.getElementById('res-energy-cost-story')?.value       || '10'),
          random:     parseInt(document.getElementById('res-energy-cost-random')?.value     || '10'),
          line:       parseInt(document.getElementById('res-energy-cost-line')?.value        || '20'),
          fullRandom: parseInt(document.getElementById('res-energy-cost-fullrandom')?.value  || '10'),
          arena:      parseInt(document.getElementById('res-energy-cost-arena')?.value       || '15'),
        },
      },
    };
    GameState.updateConfig(newCfg);
    _notify('✅ Configuration énergie sauvegardée.');
  }

  function _fillEnergy() {
    const player = GameState.getPlayer();
    player.energy.current = player.energy.max;
    player.energy.lastRegen = Date.now();
    GameState.updatePlayer(player);
    const inp = document.getElementById('res-energy-current');
    if (inp) inp.value = player.energy.max;
    _notify('⚡ Énergie rechargée au maximum.');
  }

  function _resetStats() {
    if (!confirm('Réinitialiser toutes les statistiques ?')) return;
    const player = GameState.getPlayer();
    player.stats = { totalPulls:0, totalBattles:0, totalVictories:0, totalCaptures:0, playtime:0 };
    GameState.updatePlayer(player);
    _notify('🗑️ Statistiques réinitialisées.');
    switchTab('resources');
  }

  // ─── ONGLET COMBAT ───────────────────────────────────────────────────────────

  function _renderCombatTab() {
    const state = GameState.get();
    const cfg   = state.config;
    const cCfg  = cfg.combat;
    const lCfg  = cfg.level;
    const plCfg = cfg.playerLevel || { xpBase: 80, xpExponent: 1.6, energyPerLevel: 5, xpPerEnemyKill: 5, xpPerCapture: 15 };
    const esCfg = cfg.game.enemyTeamSize;

    // Diagnostic adaptatif : profil de puissance de l'équipe active
    const diagTeam   = (typeof GameState.getTeam === 'function') ? GameState.getTeam() : [];
    const diagFactor = cCfg.adaptiveScalingFactor ?? 0.6;
    const diagHtml   = _buildAdaptiveScalingPreviewHtml(diagTeam, cCfg.enemyStatRatio ?? 0.85, diagFactor);

    const rarityMeta = {
      common:    { label:'Commune',    color:'#9CA3AF' },
      uncommon:  { label:'Peu commune',color:'#34D399' },
      rare:      { label:'Rare',       color:'#60A5FA' },
      epic:      { label:'Épique',     color:'#A78BFA' },
      legendary: { label:'Légendaire', color:'#F59E0B' },
      mythic:    { label:'Mythique',   color:'#F43F5E' },
    };

    const enemyWeights = cCfg.enemyRarityWeights || { common:50, uncommon:30, rare:12, epic:5, legendary:2, mythic:0.5 };
    const totalEnemyWeight = Object.values(enemyWeights).reduce((a,b) => a+b, 0);
    const enemyWeightRows = RARITIES.map(r => {
      const meta   = rarityMeta[r] || { label:r, color:'#fff' };
      const weight = enemyWeights[r] !== undefined ? enemyWeights[r] : 0;
      const pct    = totalEnemyWeight > 0 ? (weight / totalEnemyWeight * 100).toFixed(2) : '0.00';
      return `
        <tr>
          <td style="padding:8px 12px;">
            <span class="badge badge-${r}" style="color:${meta.color}">${meta.label}</span>
          </td>
          <td style="padding:8px 12px; text-align:center;">
            <input type="number" id="enemy-weight-${r}" value="${weight}"
              min="0" max="9999" step="0.1"
              style="width:80px;background:#0f3460;border:1px solid #444;color:#fff;border-radius:4px;padding:5px;text-align:center;font-size:.85rem;"
              oninput="AdminPanel._updateEnemyWeightTotal()" />
          </td>
          <td style="padding:8px 12px; text-align:right;">
            <span id="enemy-weight-pct-${r}" style="color:${meta.color};font-family:monospace;font-weight:700;">${pct}%</span>
          </td>
          <td style="padding:8px 12px; width:200px;">
            <div style="background:#1a1a2e;border-radius:4px;height:10px;overflow:hidden;">
              <div id="enemy-weight-bar-${r}" style="height:100%;width:${pct}%;background:${meta.color};transition:width .3s ease;"></div>
            </div>
          </td>
        </tr>`;
    }).join('');

    const xpBonus = cCfg.enemyXpBonusByRarity || { common:0, uncommon:10, rare:25, epic:50, legendary:100, mythic:200 };
    const enemyXpBonusRows = RARITIES.map(r => {
      const meta  = rarityMeta[r] || { label:r, color:'#fff' };
      const bonus = xpBonus[r] !== undefined ? xpBonus[r] : 0;
      return `
        <tr>
          <td style="padding:8px 12px;">
            <span class="badge badge-${r}" style="color:${meta.color}">${meta.label}</span>
          </td>
          <td style="padding:8px 12px; text-align:center;">
            <input type="number" id="enemy-xpbonus-${r}" value="${bonus}"
              min="0" max="2000" step="5"
              style="width:80px;background:#0f3460;border:1px solid #444;color:#fff;border-radius:4px;padding:5px;text-align:center;font-size:.85rem;" />
          </td>
          <td style="padding:8px 12px;">
            <span style="color:${meta.color};font-family:monospace;font-weight:700;">+${bonus}%</span>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="admin-section">
        <div class="admin-section-title">Formule de dégâts</div>
        <p style="font-size:.8rem;color:#888;margin-bottom:10px;">
          Formule actuelle : <code style="color:#60A5FA;background:#0f3460;padding:2px 6px;border-radius:4px;">ATK² / (ATK + DEF)</code>
          — garantit des dégâts significatifs même face à une haute défense.
        </p>
        <div class="admin-grid">
          <div class="admin-field">
            <label>Dégâts minimum</label>
            <input type="number" id="combat-min-dmg" value="${cCfg.minDamage}" min="0" />
          </div>
          <div class="admin-field">
            <label>Taux de capture de base (%)</label>
            <input type="number" id="combat-capture-rate" value="${(cCfg.captureBaseRate * 100).toFixed(0)}" min="0" max="100" />
          </div>
          <div class="admin-field">
            <label>XP par ennemi vaincu (× son niveau)</label>
            <input type="number" id="combat-xp-per-enemy" value="${cCfg.rewardXpPerEnemy}" min="0" step="1" />
          </div>
          <div class="admin-field">
            <label>Pièces d'or par ennemi vaincu</label>
            <input type="number" id="combat-gold-per-enemy" value="${cCfg.rewardGoldPerEnemy}" min="0" step="1" />
          </div>
          <div class="admin-field">
            <label>Diamants par ennemi vaincu</label>
            <input type="number" id="combat-diamonds-per-enemy" value="${cCfg.rewardDiamondsPerEnemy}" min="0" step="1" />
          </div>
          <div class="admin-field">
            <label>Plafond esquive vitesse (%)</label>
            <input type="number" id="combat-spd-evasion" value="${(cCfg.speedEvasionCap * 100).toFixed(0)}" min="0" max="100" />
          </div>
        </div>
        <p style="font-size:.75rem; color:#888; margin-top:8px;">
          Aperçu pour 3 ennemis de niveau 10 : ${3 * 10 * cCfg.rewardXpPerEnemy} XP, ${3 * cCfg.rewardGoldPerEnemy} 🪙, ${3 * cCfg.rewardDiamondsPerEnemy} 💎
        </p>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">💥 Coups critiques</div>
        <p style="font-size:.78rem;color:#888;margin-bottom:12px;">
          Chance de critique = <code style="color:#60A5FA;background:#0f3460;padding:2px 6px;border-radius:4px;">VIT / (VIT + Diviseur)</code>.
          Un diviseur plus bas = plus de critiques. Exemple : VIT 100, diviseur 200 → 33% de crit.
        </p>
        <div class="admin-grid">
          <div class="admin-field">
            <label>Diviseur de critique</label>
            <input type="number" id="combat-crit-divisor" value="${cCfg.critDivisor ?? 200}" min="1" step="10"
              oninput="AdminPanel._previewCritChance()" />
            <span id="crit-preview" style="font-size:.72rem;color:#A78BFA;margin-top:4px;"></span>
          </div>
          <div class="admin-field">
            <label>Multiplicateur critique (×)</label>
            <input type="number" id="combat-crit-mult" value="${cCfg.critMultiplier ?? 1.5}" min="1" step="0.1" />
          </div>
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">⚖️ Équilibrage joueur / ennemi</div>
        <p style="font-size:.78rem;color:#888;margin-bottom:12px;">
          Ces multiplicateurs s'appliquent après le calcul de dégâts pour favoriser le joueur structurellement.
          La variance ±5% est fixe et non configurable.
        </p>
        <div class="admin-grid">
          <div class="admin-field">
            <label>Bonus dégâts joueur → ennemi (×)</label>
            <input type="number" id="combat-player-bonus" value="${cCfg.playerDmgBonus ?? 1.15}" min="1" step="0.05" />
            <span style="font-size:.72rem;color:#4ade80;">Actuel : +${Math.round(((cCfg.playerDmgBonus ?? 1.15) - 1) * 100)}%</span>
          </div>
          <div class="admin-field">
            <label>Pénalité dégâts ennemi → joueur (×)</label>
            <input type="number" id="combat-enemy-penalty" value="${cCfg.enemyDmgPenalty ?? 0.80}" min="0.1" max="1" step="0.05" />
            <span style="font-size:.72rem;color:#f87171;">Actuel : −${Math.round((1 - (cCfg.enemyDmgPenalty ?? 0.80)) * 100)}%</span>
          </div>
          <div class="admin-field">
            <label>Ratio de stats ennemis (×)</label>
            <input type="number" id="combat-enemy-stat-ratio" value="${cCfg.enemyStatRatio ?? 0.85}" min="0.1" max="2" step="0.05" />
            <span style="font-size:.72rem;color:#aaa;">ATK/DEF/VIT ennemis multipliés par ce ratio</span>
          </div>
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">📈 Équilibrage adaptatif (anti-snowball)</div>
        <p style="font-size:.78rem;color:#888;margin-bottom:12px;">
          Compare les stats RÉELLES de l'équipe du joueur (équipement + awakening + évolution
          inclus) à une version "nue" de la même créature à la forme de base de sa lignée, au
          même niveau. L'écart mesuré est reporté sur les ennemis générés (de façon croisée :
          un surplus d'ATK joueur renforce la DEF/PV ennemis ; un surplus de PV/DEF joueur
          renforce l'ATK ennemie). Évite que l'équipe ne devienne increvable après quelques
          équipements ou une évolution.
        </p>
        <div class="admin-grid">
          <div class="admin-field">
            <label>Intensité du rattrapage (0 = désactivé, 1 = parité totale)</label>
            <input type="number" id="combat-adaptive-scaling" value="${cCfg.adaptiveScalingFactor ?? 0.6}" min="0" max="1" step="0.05"
              oninput="AdminPanel._previewAdaptiveScaling()" />
            <span style="font-size:.72rem;color:#aaa;">Valeur recommandée : 0.5 à 0.7 (laisse un avantage au joueur sans rendre les combats triviaux)</span>
          </div>
        </div>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._saveAdaptiveScaling()">💾 Enregistrer ce réglage</button>
        </div>
        <div id="adaptive-scaling-preview" style="margin-top:12px;font-size:.78rem;background:#0f3460;border-radius:6px;padding:10px 12px;">${diagHtml}</div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">Équipe ennemie</div>
        <div class="admin-grid">
          <div class="admin-field">
            <label>Mode</label>
            <select id="combat-enemy-mode">
              <option value="fixed"  ${esCfg.mode === 'fixed'  ? 'selected' : ''}>Fixe</option>
              <option value="random" ${esCfg.mode === 'random' ? 'selected' : ''}>Aléatoire</option>
            </select>
          </div>
          <div class="admin-field">
            <label>Valeur fixe (mode fixe)</label>
            <input type="number" id="combat-enemy-value" value="${esCfg.value}" min="1" max="10" />
          </div>
          <div class="admin-field">
            <label>Minimum (mode aléatoire)</label>
            <input type="number" id="combat-enemy-min" value="${esCfg.min}" min="1" max="10" />
          </div>
          <div class="admin-field">
            <label>Maximum (mode aléatoire)</label>
            <input type="number" id="combat-enemy-max" value="${esCfg.max}" min="1" max="10" />
          </div>
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">🎲 Fréquence d'apparition par rareté (combat aléatoire)</div>
        <p style="font-size:.78rem;color:#888;margin-bottom:12px;">
          Poids relatifs déterminant la probabilité qu'un ennemi de cette rareté soit
          tiré au sort lors d'un combat aléatoire. Sans effet sur le combat par lignée
          (qui combat toujours la forme de base de la lignée choisie).
        </p>
        <table style="width:100%; border-collapse:collapse;">
          <tbody>${enemyWeightRows}</tbody>
        </table>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._saveEnemyRarityWeights()">💾 Enregistrer les poids</button>
          <button class="admin-btn admin-btn-primary" onclick="AdminPanel._resetEnemyRarityWeights()">↺ Réinitialiser</button>
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">✨ Bonus d'XP selon la rareté de l'ennemi</div>
        <p style="font-size:.78rem;color:#888;margin-bottom:12px;">
          S'ajoute en plus de l'XP de base (niveau × XP par ennemi vaincu, ci-dessus).
          Un bonus de 50% sur un ennemi Épique de niveau 10 ajoute +50% à l'XP qu'il
          rapporte normalement.
        </p>
        <table style="width:100%; border-collapse:collapse;">
          <tbody>${enemyXpBonusRows}</tbody>
        </table>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._saveEnemyXpBonus()">💾 Enregistrer les bonus XP</button>
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">Progression & XP</div>
        <div class="admin-grid">
          <div class="admin-field">
            <label>XP de base (formule)</label>
            <input type="number" id="level-xp-base" value="${lCfg.xpBase}" min="1" />
          </div>
          <div class="admin-field">
            <label>Exposant XP</label>
            <input type="number" id="level-xp-expo" value="${lCfg.xpExponent}" min="1" step="0.1" />
          </div>
        </div>
        <p style="font-size:.78rem; color:#888; margin:8px 0;">Croissance des stats par niveau (%)</p>
        <div class="admin-grid">
          <div class="admin-field"><label>PV %</label><input type="number" id="level-grow-hp"  value="${(lCfg.statGrowthPerLevel.hp*100).toFixed(0)}"  min="0" max="100" /></div>
          <div class="admin-field"><label>ATK %</label><input type="number" id="level-grow-atk" value="${(lCfg.statGrowthPerLevel.atk*100).toFixed(0)}" min="0" max="100" /></div>
          <div class="admin-field"><label>DEF %</label><input type="number" id="level-grow-def" value="${(lCfg.statGrowthPerLevel.def*100).toFixed(0)}" min="0" max="100" /></div>
          <div class="admin-field"><label>VIT %</label><input type="number" id="level-grow-spd" value="${(lCfg.statGrowthPerLevel.spd*100).toFixed(0)}" min="0" max="100" /></div>
        </div>
        <p style="font-size:.75rem; color:#888; margin-top:8px;">
          Aperçu XP : Niv.10 = ${GameDatabase.xpForLevel(10, lCfg)} | Niv.50 = ${GameDatabase.xpForLevel(50, lCfg)} | Niv.100 = ${GameDatabase.xpForLevel(100, lCfg)}
        </p>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">👤 Niveau du Naturaliste (joueur)</div>
        <p style="font-size:.78rem;color:#888;margin-bottom:12px;">
          Système de niveau distinct des créatures. À chaque niveau gagné, l'énergie
          maximale du joueur augmente et se régénère entièrement. L'XP est gagnée en
          éliminant des ennemis en combat et en obtenant des créatures (gacha ou capture).
        </p>
        <div class="admin-grid">
          <div class="admin-field">
            <label>XP de base (formule)</label>
            <input type="number" id="player-xp-base" value="${plCfg.xpBase}" min="1" />
          </div>
          <div class="admin-field">
            <label>Exposant XP</label>
            <input type="number" id="player-xp-expo" value="${plCfg.xpExponent}" min="1" step="0.1" />
          </div>
          <div class="admin-field">
            <label>Énergie gagnée par niveau</label>
            <input type="number" id="player-energy-per-level" value="${plCfg.energyPerLevel}" min="0" />
          </div>
        </div>
        <div class="admin-grid">
          <div class="admin-field">
            <label>XP joueur par ennemi vaincu</label>
            <input type="number" id="player-xp-per-kill" value="${plCfg.xpPerEnemyKill}" min="0" />
          </div>
          <div class="admin-field">
            <label>XP joueur par créature obtenue (gacha + capture)</label>
            <input type="number" id="player-xp-per-capture" value="${plCfg.xpPerCapture}" min="0" />
          </div>
        </div>
        <p style="font-size:.75rem; color:#888; margin-top:8px;">
          Aperçu XP requise : Niv.5 = ${GameDatabase.xpForLevel(5, plCfg)} | Niv.20 = ${GameDatabase.xpForLevel(20, plCfg)} | Niv.50 = ${GameDatabase.xpForLevel(50, plCfg)}
        </p>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._savePlayerLevelConfig()">💾 Enregistrer le niveau joueur</button>
        </div>
      </div>
      <div class="admin-actions">
        <button class="admin-btn admin-btn-success" onclick="AdminPanel._saveCombatConfig()">💾 Sauver tous les paramètres</button>
      </div>
    `;
  }

  // ─── ONGLET AUDIO & VIDÉO ───────────────────────────────────────────────────

  // Associe chaque clé de stockage audio au champ de config qui retient son nom de fichier
  const AUDIO_FIELD_MAP = {
    global: 'globalMusicName',
    combat: 'combatMusicName',
    sfx_hit_normal: 'sfxHitNormalName',
    sfx_hit_resist: 'sfxHitResistName',
    sfx_hit_weak:   'sfxHitWeakName',
    sfx_victory:    'sfxVictoryName',
    sfx_defeat:     'sfxDefeatName',
    sfx_levelup:    'sfxLevelUpName',
    sfx_evolution:  'sfxEvolutionName',
    sfx_gacha_pull: 'sfxGachaPullName',
  };

  function _renderAudioTab() {
    const state = GameState.get();
    const aCfg  = state.config.audio || {};

    const fileRow = (kind, label, currentName) => `
      <div class="admin-field" style="margin-bottom:16px;">
        <label>${label}</label>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <input type="file" id="audio-file-${kind}" accept="audio/*" style="display:none"
                 onchange="AdminPanel._uploadAudioFile('${kind}', this.files[0])" />
          <button class="admin-btn admin-btn-primary admin-btn-sm" onclick="document.getElementById('audio-file-${kind}').click()">
            📁 Choisir un fichier
          </button>
          ${currentName ? `
            <span style="font-size:.8rem; color:#4ade80;">🎵 ${currentName}</span>
            <button class="admin-btn admin-btn-danger admin-btn-sm" onclick="AdminPanel._removeAudioFile('${kind}')">🗑️ Retirer</button>
          ` : `<span style="font-size:.8rem; color:#888;">Aucun fichier importé</span>`}
        </div>
      </div>
    `;

    return `
      <div class="admin-section">
        <div class="admin-section-title">🎵 Musique de fond</div>
        <p style="font-size:.8rem;color:#888;margin-bottom:14px;">
          Importe un fichier audio (MP3, OGG, WAV...) directement depuis ton ordinateur.
          Il est conservé localement dans ton navigateur et se relance automatiquement en
          boucle continue. Le joueur peut couper le son via le bouton 🔇 en haut de l'écran —
          par défaut, la lecture démarre coupée (obligation des navigateurs), il doit cliquer
          une fois pour l'activer.
        </p>
        ${fileRow('global', 'Musique de fond globale (interface)', aCfg.globalMusicName)}
        ${fileRow('combat', 'Musique de combat', aCfg.combatMusicName)}
        <p style="font-size:.72rem;color:#888;margin:-6px 0 14px;">Si aucune musique de combat n'est définie, la musique globale continue pendant les combats.</p>
        <div class="admin-field">
          <label>Musique activée</label>
          <select id="audio-enabled" onchange="AdminPanel._saveAudioEnabled(this.value)">
            <option value="1" ${aCfg.enabled !== false ? 'selected' : ''}>Oui</option>
            <option value="0" ${aCfg.enabled === false ? 'selected' : ''}>Non</option>
          </select>
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">🔊 Bruitages de combat</div>
        <p style="font-size:.8rem;color:#888;margin-bottom:14px;">
          Sons courts joués au moment de l'impact (en plus de la musique, qui continue de
          jouer) et à la fin du combat. Laisse vide pour ne pas avoir de bruitage à cet endroit.
        </p>
        ${fileRow('sfx_hit_normal', 'Coup normal', aCfg.sfxHitNormalName)}
        ${fileRow('sfx_hit_resist', 'Coup sur résistance (peu efficace / immunité)', aCfg.sfxHitResistName)}
        ${fileRow('sfx_hit_weak',   'Coup sur faiblesse (super efficace)', aCfg.sfxHitWeakName)}
        ${fileRow('sfx_victory',    'Fin de combat — Victoire', aCfg.sfxVictoryName)}
        ${fileRow('sfx_defeat',     'Fin de combat — Défaite', aCfg.sfxDefeatName)}
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">🌟 Bruitages de progression</div>
        <p style="font-size:.8rem;color:#888;margin-bottom:14px;">
          Joués lors d'une montée de niveau, d'une évolution (en combat ou via une Pillule
          de Puissance), et à chaque révélation de carte (tirage Gacha ou capture réussie).
        </p>
        ${fileRow('sfx_levelup',    'Montée de niveau', aCfg.sfxLevelUpName)}
        ${fileRow('sfx_evolution',  'Évolution', aCfg.sfxEvolutionName)}
        ${fileRow('sfx_gacha_pull', 'Révélation de carte (Gacha / capture)', aCfg.sfxGachaPullName)}
      </div>
      <hr class="admin-sep" />
      <div class="admin-section" style="opacity:.55;">
        <div class="admin-section-title">🎬 Vidéo & Thème (à venir)</div>
        <p style="font-size:.8rem;color:#888;">
          Section réservée pour plus tard : possibilité de changer le thème de couleurs
          de l'interface, et d'autres options vidéo. Pas encore fonctionnel.
        </p>
        <div class="admin-field">
          <label>Thème de couleurs</label>
          <select disabled>
            <option>Par défaut (ChronoBête)</option>
          </select>
        </div>
      </div>
    `;
  }

  /** Importe un fichier audio choisi par l'admin pour la clé donnée (musique ou bruitage) */
  async function _uploadAudioFile(kind, file) {
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      _notify('❌ Le fichier sélectionné n\'est pas un fichier audio.', 'error');
      return;
    }
    try {
      await AudioSystem.saveTrack(kind, file);
      const state = GameState.get();
      const fieldName = AUDIO_FIELD_MAP[kind];
      if (fieldName) {
        GameState.updateConfig({
          ...state.config,
          audio: { ...state.config.audio, [fieldName]: file.name },
        });
      }
      _notify(`✅ "${file.name}" importé.`);
      switchTab('audio');
      // Applique immédiatement la musique globale (l'admin n'est généralement pas ouvert en plein combat)
      if (kind === 'global') AudioSystem.playGlobal(true);
    } catch (e) {
      _notify('❌ Échec de l\'import : ' + e.message, 'error');
    }
  }

  /** Retire le fichier audio (musique ou bruitage) de la clé donnée */
  async function _removeAudioFile(kind) {
    await AudioSystem.removeTrack(kind);
    const state = GameState.get();
    const fieldName = AUDIO_FIELD_MAP[kind];
    if (fieldName) {
      GameState.updateConfig({
        ...state.config,
        audio: { ...state.config.audio, [fieldName]: '' },
      });
    }
    _notify('🗑️ Fichier retiré.');
    switchTab('audio');
  }

  /** Active/désactive la musique de fond globalement */
  function _saveAudioEnabled(value) {
    const state = GameState.get();
    GameState.updateConfig({
      ...state.config,
      audio: { ...state.config.audio, enabled: value === '1' },
    });
    _notify(value === '1' ? '✅ Musique activée.' : '🚫 Musique désactivée.');
    if (value === '1') AudioSystem.playGlobal();
    else AudioSystem.stop();
  }

  // ─── ONGLET QUOTIDIEN (Connexion + Quêtes) ───────────────────────────────────

  /** Construit la liste des options d'objets pour les sélecteurs de récompense en items. */
  function _itemOptionsHtml(selectedId) {
    const items = GameState.getItemDefs();
    return `<option value="">— Aucun —</option>` + items.map(i =>
      `<option value="${i.id}" ${i.id === selectedId ? 'selected' : ''}>${i.icon} ${i.name}</option>`
    ).join('');
  }

  /** Résumé textuel court d'une récompense (gemmes / or / items), pour les listes. */
  function _rewardSummary(reward) {
    if (!reward) return '—';
    const parts = [];
    if (reward.crystals) parts.push(`💎${reward.crystals}`);
    if (reward.gold) parts.push(`🪙${reward.gold}`);
    if (reward.items) {
      const itemDefs = GameState.getItemDefs();
      Object.entries(reward.items).forEach(([id, qty]) => {
        if (!qty) return;
        const def = itemDefs.find(i => i.id === id);
        parts.push(`${def?.icon || '🎁'}×${qty}`);
      });
    }
    return parts.join('  ') || '—';
  }

  function _renderDailyTab() {
    // L'édition des quêtes (quotidiennes, hebdo, event) est centralisée dans l'onglet Quêtes.
    // Cet onglet gère uniquement les cycles de récompense de connexion.
    return _renderLoginCyclesSection();
  }

  // ── SOUS-SECTION : CYCLES DE RÉCOMPENSE DE CONNEXION ────────────────────────

  function _renderLoginCyclesSection() {
    const state  = GameState.get();
    const cycles = state.loginCycles || [];

    const list = cycles.map(cycle => `
      <div class="admin-list-item" data-drag-id="${cycle.id}">
        <div class="admin-list-item-info">
          <div class="admin-list-item-name">
            ${_escapeAttr(cycle.name)}
            <span class="badge" style="background:${cycle.active ? 'var(--admin-success,#2e7d32)' : '#555'};color:#fff;">
              ${cycle.active ? 'Actif' : 'Inactif'}
            </span>
          </div>
          <div class="admin-list-item-sub">ID: ${cycle.id} — ${cycle.days.length} jour(s)</div>
          <div class="admin-list-item-sub">${cycle.days.map((d, i) => `J${i + 1}: ${_rewardSummary(d.reward)}`).join('   ')}</div>
        </div>
        <div class="admin-list-item-actions">
          <button class="admin-btn admin-btn-sm ${cycle.active ? 'admin-btn-warning' : 'admin-btn-success'}"
            onclick="AdminPanel._toggleLoginCycleActive('${cycle.id}')">
            ${cycle.active ? '⏸️ Désactiver' : '▶️ Activer'}
          </button>
          <button class="admin-btn admin-btn-primary admin-btn-sm" onclick="AdminPanel._editLoginCycle('${cycle.id}')">✏️</button>
          <button class="admin-btn admin-btn-danger admin-btn-sm" onclick="AdminPanel._deleteLoginCycle('${cycle.id}')">🗑️</button>
        </div>
      </div>
    `).join('');

    return `
      <div class="admin-section">
        <div class="admin-section-title">🎁 Cycles de récompense de connexion quotidienne</div>
        <p style="font-size:.8rem;color:#999;margin:0 0 12px;">
          Chaque cycle distribue une récompense par jour de connexion (1 clic = 1 jour). Plusieurs
          cycles actifs en parallèle sont présentés au joueur l'un après l'autre. La progression
          d'un cycle n'est jamais réinitialisée : elle avance d'un jour à chaque nouvelle connexion
          et reboucle au jour 1 une fois le dernier jour réclamé.
        </p>
        <div id="login-cycle-editor">${_renderLoginCycleEditorForm(null)}</div>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._saveLoginCycle()">💾 Enregistrer le cycle</button>
          <button class="admin-btn admin-btn-primary" onclick="AdminPanel._clearLoginCycleForm()">🗑️ Vider le formulaire</button>
        </div>
      </div>
      <hr class="admin-sep" />
      <div class="admin-section">
        <div class="admin-section-title">Cycles existants (${cycles.length})</div>
        <div class="admin-list">${list || '<p style="color:#888;">Aucun cycle créé.</p>'}</div>
      </div>
    `;
  }

  // État transitoire du formulaire d'édition de cycle (jours en cours de construction)
  let _cycleFormDays = [];

  /** Construit le formulaire d'édition/création d'un cycle (id existant ou null pour création). */
  function _renderLoginCycleEditorForm(cycleId) {
    const state = GameState.get();
    const cycle = cycleId ? (state.loginCycles || []).find(c => c.id === cycleId) : null;
    _cycleFormDays = cycle ? JSON.parse(JSON.stringify(cycle.days)) : (_cycleFormDays.length ? _cycleFormDays : [_emptyReward()]);

    return `
      <input type="hidden" id="lc-id" value="${cycle ? cycle.id : ''}" />
      <div class="admin-grid">
        <div class="admin-field">
          <label>Nom du cycle *</label>
          <input type="text" id="lc-name" placeholder="Récompenses Quotidiennes" value="${cycle ? _escapeAttr(cycle.name) : ''}" />
        </div>
        <div class="admin-field">
          <label>Actif</label>
          <select id="lc-active">
            <option value="1" ${!cycle || cycle.active ? 'selected' : ''}>Oui</option>
            <option value="0" ${cycle && !cycle.active ? 'selected' : ''}>Non</option>
          </select>
        </div>
      </div>
      <p style="font-size:.8rem;color:#aaa;margin:14px 0 6px;">Jours du cycle (dans l'ordre)</p>
      <div id="lc-days-list">${_renderCycleDaysRows()}</div>
      <div class="admin-actions">
        <button type="button" class="admin-btn admin-btn-primary admin-btn-sm" onclick="AdminPanel._addCycleDay()">➕ Ajouter un jour</button>
      </div>
    `;
  }

  function _emptyReward() { return { reward: { crystals: 0, gold: 0, items: {} } }; }

  function _renderCycleDaysRows() {
    return _cycleFormDays.map((day, i) => {
      const itemId = Object.keys(day.reward.items || {})[0] || '';
      const itemQty = itemId ? day.reward.items[itemId] : 1;
      return `
        <div class="admin-grid" style="align-items:end; border:1px solid var(--border-soft,#333); border-radius:8px; padding:10px; margin-bottom:8px;">
          <div class="admin-field"><label>Jour ${i + 1} — 💎 Gemmes</label>
            <input type="number" min="0" class="lc-day-crystals" value="${day.reward.crystals || 0}" data-day="${i}" /></div>
          <div class="admin-field"><label>🪙 Or</label>
            <input type="number" min="0" class="lc-day-gold" value="${day.reward.gold || 0}" data-day="${i}" /></div>
          <div class="admin-field"><label>Objet (optionnel)</label>
            <select class="lc-day-item" data-day="${i}">${_itemOptionsHtml(itemId)}</select></div>
          <div class="admin-field"><label>Quantité objet</label>
            <input type="number" min="1" class="lc-day-itemqty" value="${itemQty}" data-day="${i}" /></div>
          <div class="admin-field">
            <button type="button" class="admin-btn admin-btn-danger admin-btn-sm" onclick="AdminPanel._removeCycleDay(${i})">🗑️ Retirer ce jour</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function _addCycleDay() {
    _syncCycleFormDaysFromDom();
    _cycleFormDays.push(_emptyReward());
    document.getElementById('lc-days-list').innerHTML = _renderCycleDaysRows();
  }

  function _removeCycleDay(index) {
    _syncCycleFormDaysFromDom();
    if (_cycleFormDays.length <= 1) { _notify('❌ Un cycle doit avoir au moins 1 jour.', 'error'); return; }
    _cycleFormDays.splice(index, 1);
    document.getElementById('lc-days-list').innerHTML = _renderCycleDaysRows();
  }

  /** Relit les valeurs actuellement saisies dans le DOM vers _cycleFormDays (avant d'ajouter/retirer une ligne). */
  function _syncCycleFormDaysFromDom() {
    document.querySelectorAll('.lc-day-crystals').forEach(el => {
      const i = Number(el.dataset.day);
      if (_cycleFormDays[i]) _cycleFormDays[i].reward.crystals = parseInt(el.value || '0');
    });
    document.querySelectorAll('.lc-day-gold').forEach(el => {
      const i = Number(el.dataset.day);
      if (_cycleFormDays[i]) _cycleFormDays[i].reward.gold = parseInt(el.value || '0');
    });
    document.querySelectorAll('.lc-day-item').forEach(el => {
      const i = Number(el.dataset.day);
      if (!_cycleFormDays[i]) return;
      const qtyEl = document.querySelector(`.lc-day-itemqty[data-day="${i}"]`);
      const qty = parseInt(qtyEl?.value || '1');
      _cycleFormDays[i].reward.items = el.value ? { [el.value]: qty } : {};
    });
  }

  function _saveLoginCycle() {
    _syncCycleFormDaysFromDom();
    const name = document.getElementById('lc-name')?.value.trim();
    if (!name) { _notify('❌ Nom du cycle obligatoire.', 'error'); return; }
    if (_cycleFormDays.length === 0) { _notify('❌ Le cycle doit avoir au moins 1 jour.', 'error'); return; }

    const idInput = document.getElementById('lc-id')?.value.trim();
    const id = idInput || `login_cycle_${Date.now()}`;
    const active = document.getElementById('lc-active')?.value === '1';

    const data = { id, name, active, days: JSON.parse(JSON.stringify(_cycleFormDays)) };

    const state = GameState.get();
    const cycles = [...(state.loginCycles || [])];
    const idx = cycles.findIndex(c => c.id === id);
    if (idx >= 0) cycles[idx] = data; else cycles.push(data);

    GameState.updateLoginCycles(cycles);
    _notify(`✅ Cycle "${name}" enregistré.`);
    _clearLoginCycleForm();
    switchTab('daily');
  }

  function _editLoginCycle(id) {
    document.getElementById('login-cycle-editor').innerHTML = _renderLoginCycleEditorForm(id);
    document.getElementById('admin-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function _clearLoginCycleForm() {
    _cycleFormDays = [];
    const editor = document.getElementById('login-cycle-editor');
    if (editor) editor.innerHTML = _renderLoginCycleEditorForm(null);
  }

  function _toggleLoginCycleActive(id) {
    const state = GameState.get();
    const cycles = (state.loginCycles || []).map(c => c.id === id ? { ...c, active: !c.active } : c);
    GameState.updateLoginCycles(cycles);
    switchTab('daily');
  }

  function _deleteLoginCycle(id) {
    if (!confirm(`Supprimer définitivement ce cycle de connexion ?`)) return;
    const state = GameState.get();
    GameState.updateLoginCycles((state.loginCycles || []).filter(c => c.id !== id));
    _notify('🗑️ Cycle supprimé.');
    switchTab('daily');
  }

  // ── SOUS-SECTION : QUÊTES QUOTIDIENNES ───────────────────────────────────────

  function _renderDailyQuestsSection() {
    const state  = GameState.get();
    const quests = state.dailyQuests || [];

    const rows = quests.map(q => `
      <div class="admin-list-item" data-drag-id="${q.id}">
        <div class="admin-list-item-info">
          <div class="admin-list-item-name">
            ${_escapeAttr(q.label)}
            <span class="badge" style="background:${q.active ? 'var(--admin-success,#2e7d32)' : '#555'};color:#fff;">
              ${q.active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div class="admin-list-item-sub">ID: ${q.id} — Cible : ${q.target}</div>
          <div class="admin-list-item-sub">Récompense : ${_rewardSummary(q.reward)}</div>
        </div>
        <div class="admin-list-item-actions">
          <button class="admin-btn admin-btn-sm ${q.active ? 'admin-btn-warning' : 'admin-btn-success'}"
            onclick="AdminPanel._toggleDailyQuestActive('${q.id}')">
            ${q.active ? '⏸️ Désactiver' : '▶️ Activer'}
          </button>
          <button class="admin-btn admin-btn-primary admin-btn-sm" onclick="AdminPanel._editDailyQuestReward('${q.id}')">✏️ Récompense</button>
        </div>
      </div>
    `).join('');

    return `
      <div class="admin-section">
        <div class="admin-section-title">📜 Quêtes quotidiennes</div>
        <p style="font-size:.8rem;color:#999;margin:0 0 12px;">
          Liste fixe de 14 quêtes. Active/désactive chacune et configure sa récompense.
          Chaque jour calendaire, 3 quêtes actives sont tirées au hasard pour le joueur.
        </p>
        <div id="quest-reward-editor"></div>
        <div class="admin-list">${rows}</div>
      </div>
    `;
  }

  function _editDailyQuestReward(id) {
    const state = GameState.get();
    const q = (state.dailyQuests || []).find(x => x.id === id);
    if (!q) return;
    const itemId = Object.keys(q.reward.items || {})[0] || '';
    const itemQty = itemId ? q.reward.items[itemId] : 1;

    const editor = document.getElementById('quest-reward-editor');
    editor.innerHTML = `
      <div class="admin-section" style="border:1px solid var(--border-soft,#333); border-radius:8px; padding:12px; margin-bottom:14px;">
        <div class="admin-section-title" style="font-size:.95rem;">Récompense — ${_escapeAttr(q.label)}</div>
        <input type="hidden" id="dq-id" value="${q.id}" />
        <div class="admin-grid">
          <div class="admin-field"><label>💎 Gemmes</label><input type="number" min="0" id="dq-crystals" value="${q.reward.crystals || 0}" /></div>
          <div class="admin-field"><label>🪙 Or</label><input type="number" min="0" id="dq-gold" value="${q.reward.gold || 0}" /></div>
          <div class="admin-field"><label>Objet (optionnel)</label><select id="dq-item">${_itemOptionsHtml(itemId)}</select></div>
          <div class="admin-field"><label>Quantité objet</label><input type="number" min="1" id="dq-itemqty" value="${itemQty}" /></div>
        </div>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._saveDailyQuestReward()">💾 Enregistrer</button>
          <button class="admin-btn admin-btn-primary" onclick="document.getElementById('quest-reward-editor').innerHTML='';">Annuler</button>
        </div>
      </div>
    `;
    editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function _saveDailyQuestReward() {
    const id = document.getElementById('dq-id')?.value;
    const state = GameState.get();
    const quests = [...(state.dailyQuests || [])];
    const idx = quests.findIndex(q => q.id === id);
    if (idx === -1) return;

    const itemId = document.getElementById('dq-item')?.value;
    const itemQty = parseInt(document.getElementById('dq-itemqty')?.value || '1');

    quests[idx] = {
      ...quests[idx],
      reward: {
        crystals: parseInt(document.getElementById('dq-crystals')?.value || '0'),
        gold:     parseInt(document.getElementById('dq-gold')?.value || '0'),
        items:    itemId ? { [itemId]: itemQty } : {},
      },
    };
    GameState.updateDailyQuestDefs(quests);
    _notify(`✅ Récompense de "${quests[idx].label}" mise à jour.`);
    switchTab('daily');
  }

  function _toggleDailyQuestActive(id) {
    const state = GameState.get();
    const quests = (state.dailyQuests || []).map(q => q.id === id ? { ...q, active: !q.active } : q);
    GameState.updateDailyQuestDefs(quests);
    switchTab('daily');
  }

  /** Prévisualise la chance de crit en temps réel selon le diviseur saisi */
  /**
   * Construit le HTML du diagnostic "Équilibrage adaptatif" : profil de puissance
   * réel de l'équipe actuelle du joueur, et multiplicateurs ennemis qui en résultent
   * avec le réglage donné.
   */
  function _buildAdaptiveScalingPreviewHtml(teamInstances, statRatio, scalingFactor) {
    if (!teamInstances || teamInstances.length === 0) {
      return `<span style="color:#888">Aucune équipe active : impossible de calculer un aperçu (composez une équipe pour voir le diagnostic).</span>`;
    }
    if (typeof CombatEngine === 'undefined' || typeof CombatEngine.computePowerProfile !== 'function') {
      return `<span style="color:#888">Diagnostic indisponible.</span>`;
    }

    const profile = CombatEngine.computePowerProfile(teamInstances);
    const sf = Math.max(0, Math.min(1, scalingFactor ?? 0));
    const tankiness = Math.sqrt(Math.max(0.01, profile.def) * Math.max(0.01, profile.hp));
    const offense   = profile.atk;
    const speed     = profile.spd;

    const atkMult = statRatio * (1 + (tankiness - 1) * sf);
    const defMult = statRatio * (1 + (offense   - 1) * sf);
    const spdMult = statRatio * (1 + (speed     - 1) * sf * 0.5);
    const hpMult  = 1         * (1 + (offense   - 1) * sf);

    const fmtRatio = (v) => `×${v.toFixed(2)}`;
    const noChange = Math.abs(profile.hp - 1) < 0.02 && Math.abs(profile.atk - 1) < 0.02 &&
                      Math.abs(profile.def - 1) < 0.02 && Math.abs(profile.spd - 1) < 0.02;

    return `
      <div style="margin-bottom:6px;color:#ddd;"><strong>Profil de puissance réel de l'équipe active</strong> (équipement + awakening + évolution vs forme de base "nue", même niveau) :</div>
      <div style="font-family:monospace;color:#60A5FA;margin-bottom:8px;">
        PV ${fmtRatio(profile.hp)} &nbsp; ATK ${fmtRatio(profile.atk)} &nbsp; DEF ${fmtRatio(profile.def)} &nbsp; VIT ${fmtRatio(profile.spd)}
      </div>
      ${noChange ? `<div style="color:#f59e0b;margin-bottom:8px;">⚠️ Équipe actuellement "nue" (≈×1 partout) : avec ce réglage, le rattrapage adaptatif n'aura visuellement <u>aucun effet</u> tant que cette équipe ne porte pas d'équipement / awakening / évolution au-delà de la forme de base. Ce n'est pas un bug — il n'y a simplement rien à compenser pour l'instant.</div>` : ''}
      <div style="color:#ddd;margin-bottom:4px;"><strong>Multiplicateurs ennemis résultants</strong> (réglage actuel du champ ci-dessus) :</div>
      <div style="font-family:monospace;color:#4ade80;">
        PV ${fmtRatio(hpMult)} &nbsp; ATK ${fmtRatio(atkMult)} &nbsp; DEF ${fmtRatio(defMult)} &nbsp; VIT ${fmtRatio(spdMult)}
      </div>
    `;
  }

  /** Recalcule l'aperçu d'équilibrage adaptatif en direct, sans sauvegarder */
  function _previewAdaptiveScaling() {
    const el = document.getElementById('adaptive-scaling-preview');
    if (!el) return;
    const state  = GameState.get();
    const factor = parseFloat(document.getElementById('combat-adaptive-scaling')?.value ?? '0.6');
    const team   = GameState.getTeam();
    el.innerHTML = _buildAdaptiveScalingPreviewHtml(team, state.config.combat.enemyStatRatio ?? 0.85, factor);
  }

  /** Sauvegarde isolément le facteur de rattrapage adaptatif (bouton dédié, sans dépendre du bouton "tout sauver" en bas de page) */
  function _saveAdaptiveScaling() {
    const state  = GameState.get();
    const factor = Math.max(0, Math.min(1, parseFloat(document.getElementById('combat-adaptive-scaling')?.value ?? '0.6')));
    GameState.updateConfig({
      ...state.config,
      combat: { ...state.config.combat, adaptiveScalingFactor: factor },
    });
    _notify(`✅ Intensité du rattrapage sauvegardée : ${factor}`);
    _previewAdaptiveScaling();
  }

  function _previewCritChance() {
    const divisor = parseFloat(document.getElementById('combat-crit-divisor')?.value || '200');
    const el = document.getElementById('crit-preview');
    if (!el || divisor <= 0) return;
    const examples = [20, 50, 100, 200, 500].map(spd => {
      const pct = Math.round(spd / (spd + divisor) * 100);
      return `VIT ${spd} → ${pct}%`;
    });
    el.textContent = examples.join(' | ');
  }

  function _saveCombatConfig() {
    const state  = GameState.get();
    const xpBase = parseInt(document.getElementById('level-xp-base')?.value || '100');
    const xpExpo = parseFloat(document.getElementById('level-xp-expo')?.value || '1.8');

    const newCfg = {
      ...state.config,
      game: {
        ...state.config.game,
        enemyTeamSize: {
          mode:  document.getElementById('combat-enemy-mode')?.value || 'fixed',
          value: parseInt(document.getElementById('combat-enemy-value')?.value || '3'),
          min:   parseInt(document.getElementById('combat-enemy-min')?.value || '1'),
          max:   parseInt(document.getElementById('combat-enemy-max')?.value || '5'),
        },
      },
      combat: {
        ...state.config.combat,
        minDamage:               parseInt(document.getElementById('combat-min-dmg')?.value || '1'),
        captureBaseRate:         parseInt(document.getElementById('combat-capture-rate')?.value || '15') / 100,
        rewardXpPerEnemy:        parseFloat(document.getElementById('combat-xp-per-enemy')?.value || '20'),
        rewardGoldPerEnemy:      parseFloat(document.getElementById('combat-gold-per-enemy')?.value || '5'),
        rewardDiamondsPerEnemy:  parseFloat(document.getElementById('combat-diamonds-per-enemy')?.value || '10'),
        speedEvasionCap:         parseInt(document.getElementById('combat-spd-evasion')?.value || '10') / 100,
        speedAccuracyCap:        parseInt(document.getElementById('combat-spd-evasion')?.value || '10') / 100,
        critDivisor:             parseFloat(document.getElementById('combat-crit-divisor')?.value || '200'),
        critMultiplier:          parseFloat(document.getElementById('combat-crit-mult')?.value || '1.5'),
        playerDmgBonus:          parseFloat(document.getElementById('combat-player-bonus')?.value || '1.15'),
        enemyDmgPenalty:         parseFloat(document.getElementById('combat-enemy-penalty')?.value || '0.80'),
        enemyStatRatio:          parseFloat(document.getElementById('combat-enemy-stat-ratio')?.value || '0.85'),
        adaptiveScalingFactor:   Math.max(0, Math.min(1, parseFloat(document.getElementById('combat-adaptive-scaling')?.value ?? '0.6'))),
      },
      level: {
        ...state.config.level,
        xpBase,
        xpExponent: xpExpo,
        statGrowthPerLevel: {
          hp:  parseInt(document.getElementById('level-grow-hp')?.value  || '5')  / 100,
          atk: parseInt(document.getElementById('level-grow-atk')?.value || '4')  / 100,
          def: parseInt(document.getElementById('level-grow-def')?.value || '4')  / 100,
          spd: parseInt(document.getElementById('level-grow-spd')?.value || '3')  / 100,
        },
      },
      playerLevel: {
        ...state.config.playerLevel,
        xpBase:         parseInt(document.getElementById('player-xp-base')?.value || '80'),
        xpExponent:     parseFloat(document.getElementById('player-xp-expo')?.value || '1.6'),
        energyPerLevel: parseInt(document.getElementById('player-energy-per-level')?.value || '5'),
        xpPerEnemyKill: parseInt(document.getElementById('player-xp-per-kill')?.value || '5'),
        xpPerCapture:   parseInt(document.getElementById('player-xp-per-capture')?.value || '15'),
      },
    };
    GameState.updateConfig(newCfg);
    _notify('✅ Paramètres de combat sauvegardés.');
  }

  /** Sauvegarde isolément la config du niveau joueur (bouton dédié) */
  function _savePlayerLevelConfig() {
    const state = GameState.get();
    GameState.updateConfig({
      ...state.config,
      playerLevel: {
        ...state.config.playerLevel,
        xpBase:         parseInt(document.getElementById('player-xp-base')?.value || '80'),
        xpExponent:     parseFloat(document.getElementById('player-xp-expo')?.value || '1.6'),
        energyPerLevel: parseInt(document.getElementById('player-energy-per-level')?.value || '5'),
        xpPerEnemyKill: parseInt(document.getElementById('player-xp-per-kill')?.value || '5'),
        xpPerCapture:   parseInt(document.getElementById('player-xp-per-capture')?.value || '15'),
      },
    });
    _notify('✅ Niveau du Naturaliste sauvegardé.');
  }

  // ─── ONGLET NOTE DE MISE À JOUR ───────────────────────────────────────────────

  /**
   * Affiche un éditeur de texte libre pour rédiger les notes de mise à jour.
   * Les notes de mise à jour sont un tableau de blocs { title, image, text }.
   * Dans la popup joueur : titre + image visibles, texte masqué (clic pour dérouler).
   */
  function _renderPatchNotesTab() {
    const state = GameState.get();
    const pn    = state.patchNotes || { id: '', blocks: [] };
    const blocks = Array.isArray(pn.blocks) ? pn.blocks : [];

    const blocksHtml = blocks.map((b, i) => `
      <div class="pn-block" data-bi="${i}" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="font-size:.72rem;color:var(--text-dim);font-weight:700;">BLOC ${i + 1}</span>
          <button class="admin-btn admin-btn-danger admin-btn-sm" onclick="AdminPanel._pnDeleteBlock(${i})" style="margin-left:auto;">🗑️</button>
          ${i > 0 ? `<button class="admin-btn admin-btn-sm" onclick="AdminPanel._pnMoveBlock(${i},-1)">▲</button>` : ''}
          ${i < blocks.length - 1 ? `<button class="admin-btn admin-btn-sm" onclick="AdminPanel._pnMoveBlock(${i},1)">▼</button>` : ''}
        </div>
        <div class="admin-field" style="margin-bottom:8px;">
          <label>Titre</label>
          <input type="text" value="${_escapeAttr(b.title || '')}" placeholder="Ex : MaJ 0.4 — Évolutions"
            oninput="AdminPanel._pnUpdateBlock(${i},'title',this.value)"
            style="background:var(--surface-2);border:1px solid var(--border);color:var(--text);padding:7px 10px;border-radius:var(--radius-sm);font-size:.85rem;width:100%;box-sizing:border-box;">
        </div>
        <div class="admin-field" style="margin-bottom:8px;">
          <label>Image (URL ou base64)</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="text" value="${_escapeAttr(b.image || '')}" placeholder="https://... ou coller une URL d'image"
              oninput="AdminPanel._pnUpdateBlock(${i},'image',this.value)"
              style="flex:1;background:var(--surface-2);border:1px solid var(--border);color:var(--text);padding:7px 10px;border-radius:var(--radius-sm);font-size:.85rem;box-sizing:border-box;">
            <input type="file" accept="image/*" style="display:none;" id="pn-img-file-${i}"
              onchange="AdminPanel._pnLoadImageFile(${i},this)">
            <button class="admin-btn admin-btn-sm" onclick="document.getElementById('pn-img-file-${i}').click()">📁</button>
            ${b.image ? `<img src="${_escapeAttr(b.image)}" style="height:36px;border-radius:4px;object-fit:cover;" onerror="this.style.display='none'">` : ''}
          </div>
        </div>
        <div class="admin-field">
          <label>Texte (contenu déroulable)</label>
          <textarea rows="5" placeholder="Détail de la mise à jour..."
            oninput="AdminPanel._pnUpdateBlock(${i},'text',this.value)"
            style="width:100%;background:var(--surface-2);border:1px solid var(--border);color:var(--text);padding:7px 10px;border-radius:var(--radius-sm);font-size:.82rem;font-family:var(--font-mono,monospace);line-height:1.5;box-sizing:border-box;resize:vertical;"
            >${_escapeAttr(b.text || '')}</textarea>
        </div>
      </div>`).join('');

    return `
      <div class="admin-section">
        <div class="admin-section-title">📝 Notes de mise à jour — blocs</div>
        <p style="color:#aaa;font-size:.85rem;margin:0 0 14px;">
          Chaque bloc = une note (titre + image + texte). Dans la popup joueur :
          le <strong>titre et l'image</strong> sont visibles, le <strong>texte</strong>
          se déroule au clic sur le titre. Cliquez <em>Publier</em> pour diffuser
          (tous les joueurs verront la popup à leur prochain lancement).
        </p>

        <div id="pn-blocks-container">
          ${blocksHtml || '<p style="color:#666;font-style:italic;">Aucun bloc. Ajoutez-en un ci-dessous.</p>'}
        </div>

        <button class="admin-btn" onclick="AdminPanel._pnAddBlock()" style="margin-bottom:16px;">＋ Ajouter un bloc</button>

        <div style="background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:.78rem;color:#888;">
          <strong style="color:#aaa;">ID publié actuel :</strong>
          <code style="color:#f4c267;margin-left:6px;">${pn.id || '<em>aucun</em>'}</code>
        </div>

        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._savePatchNotes()">📢 Publier</button>
          <button class="admin-btn admin-btn-danger"  onclick="AdminPanel._clearPatchNotes()">🗑️ Tout supprimer</button>
        </div>
      </div>

      <div class="admin-section">
        <div class="admin-section-title">Aperçu — popup joueur</div>
        <p style="color:#aaa;font-size:.82rem;margin:0 0 10px;">Le titre et l'image sont visibles. Cliquer sur le titre déroule le texte.</p>
        <div style="background:linear-gradient(150deg,#152b18,#0f2211);border:1px solid #2d4a30;border-radius:12px;padding:18px 20px;max-width:460px;">
          <div style="font-family:var(--font-display);font-weight:700;font-size:1rem;color:var(--accent);margin-bottom:12px;">📋 Mise à jour</div>
          ${blocks.map((b, i) => `
            <div style="border:1px solid #2d4a30;border-radius:8px;margin-bottom:8px;overflow:hidden;">
              <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;background:#122019;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.querySelector('.pn-arrow').textContent=this.nextElementSibling.style.display==='none'?'▶':'▼'">
                ${b.image ? `<img src="${_escapeAttr(b.image)}" style="width:38px;height:38px;border-radius:6px;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none'">` : ''}
                <strong style="flex:1;font-size:.88rem;color:#e8d5a0;">${_escapeAttr(b.title || 'Sans titre')}</strong>
                <span class="pn-arrow" style="color:#4ade80;font-size:.8rem;">▶</span>
              </div>
              <div style="display:none;padding:10px 14px;font-size:.82rem;color:#cde8d4;white-space:pre-wrap;line-height:1.6;">${_escapeAttr(b.text || '').replace(/\n/g,'<br>')}</div>
            </div>`).join('') || '<p style="color:#4a6e50;font-size:.82rem;font-style:italic;">Aucun bloc pour le moment.</p>'}
          <button style="margin-top:12px;padding:10px 28px;border-radius:999px;background:#4ade80;color:#000;font-weight:700;border:none;font-family:var(--font-display);font-size:.9rem;cursor:default;">OK, compris !</button>
        </div>
      </div>
    `;
  }

  /** Données de travail en mémoire pour l'éditeur de blocs (avant publication) */
  function _pnGetBlocks() {
    const pn = GameState.get().patchNotes || {};
    return JSON.parse(JSON.stringify(Array.isArray(pn.blocks) ? pn.blocks : []));
  }

  function _pnSaveBlocks(blocks) {
    const pn = GameState.get().patchNotes || {};
    GameState.updatePatchNotes({ id: pn.id || '', blocks });
    // Pas de SaveSystem.saveGlobalConfig ici : on ne sauvegarde qu'à la publication
  }

  function _pnAddBlock() {
    const blocks = _pnGetBlocks();
    blocks.push({ title: '', image: '', text: '' });
    _pnSaveBlocks(blocks);
    switchTab('patchnotes');
  }

  function _pnDeleteBlock(i) {
    const blocks = _pnGetBlocks();
    blocks.splice(i, 1);
    _pnSaveBlocks(blocks);
    switchTab('patchnotes');
  }

  function _pnMoveBlock(i, dir) {
    const blocks = _pnGetBlocks();
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    _pnSaveBlocks(blocks);
    switchTab('patchnotes');
  }

  function _pnUpdateBlock(i, field, value) {
    const blocks = _pnGetBlocks();
    if (!blocks[i]) return;
    blocks[i][field] = value;
    _pnSaveBlocks(blocks);
    // Pas de switchTab : on met à jour en live sans re-render
  }

  function _pnLoadImageFile(i, input) {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      AdminPanel._pnUpdateBlock(i, 'image', e.target.result);
      switchTab('patchnotes');
    };
    reader.readAsDataURL(file);
  }

  /** Publie les blocs courants (génère un nouvel ID → popup affichée à tous) */
  function _savePatchNotes() {
    const blocks = _pnGetBlocks();
    if (!blocks.length || blocks.every(b => !b.title && !b.text)) {
      _notify('⚠️ Ajoutez au moins un bloc avec un titre ou un texte avant de publier.', 'error');
      return;
    }
    const newId = 'pn_' + Date.now().toString(36);
    GameState.updatePatchNotes({ id: newId, blocks });
    SaveSystem.saveGlobalConfig(GameState.get());
    _notify('✅ Notes publiées. Les joueurs verront la popup à leur prochain lancement.');
    switchTab('patchnotes');
  }

  /** Supprime toutes les notes (désactive la popup) */
  function _clearPatchNotes() {
    if (!confirm('Supprimer toutes les notes ? La popup sera désactivée.')) return;
    GameState.updatePatchNotes({ id: '', blocks: [] });
    SaveSystem.saveGlobalConfig(GameState.get());
    _notify('✅ Notes supprimées. La popup est désactivée.');
    switchTab('patchnotes');
  }



  // ─── SAUVEGARDE / EXPORT / IMPORT ────────────────────────────────────────────

  /**
   * Exporte la base de données du jeu (config, créatures, types, bannières,
   * passifs, équipements, quêtes, cycles de connexion…).
   * NE contient PAS les données joueur.
   */
  function exportGameDatabase() {
    SaveSystem.exportGameDatabase(GameState.get());
    _notify('✅ Base de données exportée (sans données joueur).');
  }

  /**
   * Exporte les données du joueur actif (collection, gemmes, niveau,
   * bestiaire, progression des quêtes…).
   * NE contient PAS la configuration du jeu.
   */
  function exportPlayerData() {
    SaveSystem.exportPlayerData(GameState.get());
    _notify('✅ Données joueur Compte ' + SaveSystem.getActiveSlot() + ' exportées.');
  }

  /**
   * Importe une base de données de jeu.
   * ⚠️ Remplace TOUTE la config du jeu — ne touche PAS aux sauvegardes joueur.
   */
  function importGameDatabase() {
    const input = document.createElement('input');
    input.type  = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      SaveSystem.importGameDatabase(file)
        .then((data) => {
          if (!confirm(
            '⚠️ IMPORT BASE DE DONNÉES\n\n' +
            'Ceci va remplacer toute la configuration du jeu :\n' +
            '• Espèces, types, passifs\n' +
            '• Équipements, bannières gacha\n' +
            '• Paramètres de combat, cycles de connexion…\n\n' +
            'Les données joueur (collection, gemmes, progression) NE seront PAS modifiées.\n\n' +
            'Continuer ?'
          )) return;
          GameState.applyGameDatabase(data);
          SaveSystem.saveGlobalConfig(GameState.get());
          _notify('✅ Base de données importée. Les données joueur sont intactes.');
          switchTab(_activeTab);
        })
        .catch((err) => _notify('❌ ' + err.message, 'error'));
    };
    input.click();
  }

  /**
   * Importe des données joueur dans le slot actif.
   * ⚠️ Remplace la progression du joueur — ne touche PAS à la config du jeu.
   */
  function importPlayerData() {
    const input = document.createElement('input');
    input.type  = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      SaveSystem.importPlayerData(file)
        .then((data) => {
          if (!confirm(
            '⚠️ IMPORT DONNÉES JOUEUR — Compte ' + SaveSystem.getActiveSlot() + '\n\n' +
            'Ceci va remplacer la progression du joueur actif :\n' +
            '• Collection, gemmes, énergie\n' +
            '• Niveau, XP, bestiaire\n' +
            '• Progression des quêtes et cycles…\n\n' +
            'La configuration du jeu (créatures, types, config…) NE sera PAS modifiée.\n\n' +
            'Continuer ?'
          )) return;
          GameState.applyPlayerData(data);
          SaveSystem.save(GameState.get());
          _notify('✅ Données joueur importées dans le Compte ' + SaveSystem.getActiveSlot() + '. Config du jeu intacte.');
          switchTab(_activeTab);
        })
        .catch((err) => _notify('❌ ' + err.message, 'error'));
    };
    input.click();
  }

  // ── Maintenu pour rétrocompatibilité (import ancien format tout-en-un) ────────
  function exportSave() { exportGameDatabase(); }

  function importSave() {
    const input = document.createElement('input');
    input.type  = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          // Détection automatique du type de fichier
          if (data._exportType === 'wildbeast_db_export') {
            if (!confirm('Fichier de BASE DE DONNÉES détecté.\n\nImporter la config du jeu sans toucher aux données joueur ?')) return;
            GameState.applyGameDatabase(data);
            SaveSystem.saveGlobalConfig(GameState.get());
            _notify('✅ Base de données importée (format détecté automatiquement).');
          } else if (data._exportType === 'wildbeast_player_export') {
            if (!confirm('Fichier DONNÉES JOUEUR détecté.\n\nImporter dans le Compte ' + SaveSystem.getActiveSlot() + ' sans toucher à la config du jeu ?')) return;
            GameState.applyPlayerData(data);
            SaveSystem.save(GameState.get());
            _notify('✅ Données joueur importées (format détecté automatiquement).');
          } else {
            // Ancien format tout-en-un : demander quelle partie importer
            const choice = window.prompt(
              'Ancien format de sauvegarde détecté.\n\n' +
              'Que souhaitez-vous importer ?\n' +
              '  1 → Base de données du jeu uniquement\n' +
              '  2 → Données joueur uniquement\n' +
              '  3 → Tout (comportement classique)\n\n' +
              'Entrez 1, 2 ou 3 :'
            );
            if (!choice) return;
            if (choice === '1') {
              if (!confirm('Importer uniquement la config du jeu depuis cet ancien fichier ?')) return;
              GameState.applyGameDatabase(data);
              SaveSystem.saveGlobalConfig(GameState.get());
              _notify('✅ Config du jeu importée depuis l\'ancien format.');
            } else if (choice === '2') {
              if (!confirm('Importer uniquement les données joueur depuis cet ancien fichier dans le Compte ' + SaveSystem.getActiveSlot() + ' ?')) return;
              GameState.applyPlayerData(data);
              SaveSystem.save(GameState.get());
              _notify('✅ Données joueur importées depuis l\'ancien format.');
            } else {
              if (!confirm('Remplacer TOUTE la sauvegarde actuelle (config + joueur) par ce fichier ?')) return;
              GameState.init(data);
              SaveSystem.save(GameState.get());
              _notify('✅ Sauvegarde complète importée (ancien format).');
            }
          }
          switchTab(_activeTab);
        } catch (err) {
          _notify('❌ Fichier invalide : ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // ─── AFFICHAGE / MASQUAGE ────────────────────────────────────────────────────

  /** Retourne à l'écran de sélection de compte */
  function switchAccount() {
    if (!confirm('Retourner à la sélection de compte ? La partie sera sauvegardée.')) return;
    SaveSystem.save(GameState.get()); // sauvegarde config globale + données joueur
    SaveSystem.stopAutosave();
    hide();
    // Recréer l'écran de sélection
    const existing = document.getElementById('account-screen');
    if (existing) { existing.remove(); }
    const screen = document.createElement('div');
    screen.id = 'account-screen';
    screen.innerHTML = `
      <div class="account-title">🐾 WildBeast Chronicles</div>
      <div class="account-subtitle">Choisissez votre dresseur</div>
      <div class="account-slots" id="account-slots-list"></div>
    `;
    document.body.prepend(screen);
    AccountScreen.render();
  }

  function show() {
    const panel = document.getElementById('admin-panel');
    if (panel) {
      panel.classList.add('visible');
      _visible = true;
      _renderTab(_activeTab);
    }
  }

  function hide() {
    const panel = document.getElementById('admin-panel');
    if (panel) {
      panel.classList.remove('visible');
      _visible = false;
    }
  }

  function toggle() {
    _visible ? hide() : show();
  }

  // ─── ÉVÉNEMENTS GLOBAUX ───────────────────────────────────────────────────────

  function _bindGlobalEvents() {
    // Échap pour fermer
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && _visible) hide();
    });
    // Overlay pour fermer
    document.addEventListener('click', (e) => {
      if (e.target.id === 'admin-overlay') hide();
    });
  }

  // ─── UTILITAIRES ─────────────────────────────────────────────────────────────

  function _setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }

  /** Échappe une chaîne pour une insertion sûre dans un attribut HTML value="..." */
  function _escapeAttr(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML.replace(/"/g, '&quot;');
  }

  /**
   * Fait défiler le panneau admin jusqu'à l'élément de liste correspondant à l'ID
   * donné (le créature ou l'équipement qui vient d'être créé/modifié), et le
   * met brièvement en évidence pour qu'il soit facile à repérer.
   * @param {string} id
   */
  function _scrollToListItem(id) {
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-drag-id="${id}"]`);
      if (!el) { _scrollContentToBottom(); return; } // repli si introuvable
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('just-saved');
      setTimeout(() => el.classList.remove('just-saved'), 1500);
    });
  }

  /** Fait défiler le panneau admin jusqu'en bas (repli quand l'élément ciblé est introuvable) */
  function _scrollContentToBottom() {
    const content = document.getElementById('admin-content');
    if (!content) return;
    requestAnimationFrame(() => { content.scrollTop = content.scrollHeight; });
  }

  let _notifTimeout = null;
  function _notify(msg, type = 'success') {
    const el = document.getElementById('admin-notification');
    if (!el) return;
    el.textContent = msg;
    el.className   = type === 'error' ? 'error show' : 'show';
    clearTimeout(_notifTimeout);
    _notifTimeout = setTimeout(() => { el.className = ''; }, 3000);
  }

  // ─── ONGLET TAGS ──────────────────────────────────────────────────────────────

  function _renderTagsTab() {
    const cats = GameState.get().tagCategories || [];

    const catList = cats.map((cat, ci) => {
      const tagList = cat.tags.map((t, ti) => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-soft);">
          <span style="flex:1;font-size:.82rem;color:var(--text);">${_escapeAttr(t.label)}</span>
          <span style="font-size:.68rem;color:#555;font-family:monospace;">${t.id}</span>
          <input type="text" value="${_escapeAttr(t.label)}"
            placeholder="Nouveau label..."
            style="width:120px;font-size:.75rem;padding:3px 6px;background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:6px;"
            onchange="AdminPanel._renameTag(${ci},${ti},this.value)"
            title="Renommer ce tag" />
          <button class="admin-btn admin-btn-danger admin-btn-sm" onclick="AdminPanel._deleteTag(${ci},${ti})">🗑️</button>
        </div>`).join('') || '<p style="font-size:.78rem;color:#666;margin:4px 0;">Aucun tag dans cette catégorie.</p>';

      return `<div class="admin-list-item" style="flex-direction:column;align-items:flex-start;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;width:100%;flex-wrap:wrap;">
          <strong style="color:var(--accent);font-size:.9rem;">${_escapeAttr(cat.name)}</strong>
          <span style="font-size:.68rem;color:#555;font-family:monospace;">${cat.id}</span>
          <input type="text" value="${_escapeAttr(cat.name)}"
            placeholder="Renommer..."
            style="width:130px;font-size:.78rem;padding:3px 6px;background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:6px;margin-left:auto;"
            onchange="AdminPanel._renameCat(${ci},this.value)"
            title="Renommer cette catégorie" />
          <button class="admin-btn admin-btn-danger admin-btn-sm" onclick="AdminPanel._deleteCat(${ci})">🗑️ Supprimer</button>
        </div>
        <div style="width:100%;padding-left:4px;">${tagList}</div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:4px;width:100%;">
          <input type="text" id="new-tag-label-${ci}" placeholder="Nouveau tag (label)..." style="font-size:.8rem;padding:4px 8px;background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:6px;flex:1;" />
          <button class="admin-btn admin-btn-success admin-btn-sm" onclick="AdminPanel._addTag(${ci})">➕ Ajouter</button>
        </div>
      </div>`;
    }).join('');

    return `
      <div class="admin-section">
        <div class="admin-section-title">🏷️ Catégories de Tags</div>
        <p style="font-size:.8rem;color:#999;margin:0 0 12px;">
          Les tags sont des étiquettes assignées aux lignées évolutives (onglet Évolutions).
          Ils permettent de créer des bannières et quêtes ciblées.<br>
          <span style="color:#aaa;">Cliquez sur le champ texte d'un tag ou d'une catégorie pour le renommer directement.</span>
        </p>
        <div class="admin-list">${catList || '<p style="color:#888;">Aucune catégorie. Créez-en une ci-dessous.</p>'}</div>
      </div>
      <hr class="admin-sep"/>
      <div class="admin-section">
        <div class="admin-section-title">➕ Nouvelle catégorie</div>
        <div class="admin-grid">
          <div class="admin-field"><label>Nom *</label><input type="text" id="new-cat-name" placeholder="Continent, Physique, Taille..." /></div>
          <div class="admin-field"><label>ID (optionnel, auto si vide)</label><input type="text" id="new-cat-id" placeholder="tc_continent" /></div>
        </div>
        <div class="admin-actions">
          <button class="admin-btn admin-btn-success" onclick="AdminPanel._addCategory()">✅ Créer catégorie</button>
        </div>
      </div>`;
  }

  // ─── Renommer une catégorie de tags ──────────────────────────────────────────
  function _renameCat(ci, newName) {
    if (!newName?.trim()) return _notify('Nom vide ignoré.');
    const cats = JSON.parse(JSON.stringify(GameState.get().tagCategories || []));
    if (!cats[ci]) return;
    cats[ci].name = newName.trim();
    GameState.updateTagCategories(cats);
    switchTab('tags');
  }

  // ─── Renommer un tag dans une catégorie ──────────────────────────────────────
  function _renameTag(ci, ti, newLabel) {
    if (!newLabel?.trim()) return _notify('Label vide ignoré.');
    const cats = JSON.parse(JSON.stringify(GameState.get().tagCategories || []));
    if (!cats[ci]?.tags[ti]) return;
    cats[ci].tags[ti].label = newLabel.trim();
    GameState.updateTagCategories(cats);
    switchTab('tags');
  }

  function _addCategory() {
    const name = document.getElementById('new-cat-name')?.value.trim();
    if (!name) return _notify('Nom de catégorie requis.');
    const rawId = document.getElementById('new-cat-id')?.value.trim();
    const id    = rawId || `tc_${name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
    const cats  = [...(GameState.get().tagCategories || [])];
    if (cats.find(c => c.id === id)) return _notify('ID déjà utilisé.');
    cats.push({ id, name, tags: [] });
    GameState.updateTagCategories(cats);
    switchTab('tags');
  }

  function _deleteCat(ci) {
    const cats = [...(GameState.get().tagCategories || [])];
    cats.splice(ci, 1);
    GameState.updateTagCategories(cats);
    switchTab('tags');
  }

  function _addTag(ci) {
    const label = document.getElementById(`new-tag-label-${ci}`)?.value.trim();
    if (!label) return _notify('Label requis.');
    const cats  = JSON.parse(JSON.stringify(GameState.get().tagCategories || []));
    const cat   = cats[ci];
    if (!cat) return;
    const id = `tag_${label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
    if (cat.tags.find(t => t.id === id)) return _notify('Tag déjà existant.');
    cat.tags.push({ id, label });
    GameState.updateTagCategories(cats);
    switchTab('tags');
  }

  function _deleteTag(ci, ti) {
    const cats = JSON.parse(JSON.stringify(GameState.get().tagCategories || []));
    cats[ci]?.tags.splice(ti, 1);
    GameState.updateTagCategories(cats);
    switchTab('tags');
  }

  // ─── ONGLET QUÊTES ────────────────────────────────────────────────────────────

  function _renderQuestsTab() {
    return `
      ${_renderQuestSection('daily')}
      <hr class="admin-sep"/>
      ${_renderQuestSection('weekly')}
      <hr class="admin-sep"/>
      ${_renderQuestSection('event')}
    `;
  }

  function _renderQuestSection(kind) {
    const state    = GameState.get();
    const kindKey  = kind === 'daily' ? 'dailyQuests' : kind === 'weekly' ? 'weeklyQuests' : 'eventQuests';
    const quests   = state[kindKey] || [];
    const cats     = state.tagCategories || [];
    const actions  = GameDatabase.QUEST_ACTIONS  || [];
    const targets  = GameDatabase.QUEST_TARGETS  || [];
    const configKey = kind === 'daily' ? 'dailyCount' : 'weeklyCount';
    const countVal  = state.config?.quests?.[configKey] ?? (kind === 'daily' ? 3 : 7);

    const titles = { daily: '📅 Quêtes Quotidiennes', weekly: '📆 Quêtes Hebdomadaires', event: '🎉 Quêtes d\'Événement' };
    const descs  = {
      daily:  `Mise à jour tous les jours à 0h. ${countVal} quêtes tirées aléatoirement parmi celles actives.`,
      weekly: `Mise à jour tous les lundis à 0h. ${countVal} quêtes tirées aléatoirement parmi celles actives.`,
      event:  'Activées/désactivées manuellement. Toutes les quêtes actives sont proposées simultanément.',
    };

    const questList = quests.map((q, qi) => {
      const tagOpts = cats.flatMap(cat => cat.tags.map(t => `<option value="${t.id}" ${q.tagId === t.id ? 'selected' : ''}>${_escapeAttr(cat.name)} · ${_escapeAttr(t.label)}</option>`)).join('');
      const actionOpts = actions.map(a => `<option value="${a.id}" ${q.type === a.id ? 'selected' : ''}>${_escapeAttr(a.label)}</option>`).join('');
      const targetOpts = targets.map(t => `<option value="${t.id}" ${q.targetLabel === t.id ? 'selected' : ''}>${_escapeAttr(t.label)}</option>`).join('');

      const isPinnedQ = !!(q._pinned || q.id === 'pinned_daily_complete' || q.id === 'pinned_weekly_complete' || q.id === 'pinned_event_complete');
      return `<div class="admin-list-item" style="flex-direction:column;align-items:flex-start;gap:8px;${isPinnedQ ? 'border-color:var(--accent2);background:linear-gradient(135deg,var(--surface-2),rgba(74,222,128,.04));' : ''}">
        <div style="display:flex;align-items:center;gap:8px;width:100%;flex-wrap:wrap;">
          ${isPinnedQ
            ? `<span style="font-size:.65rem;background:var(--accent2);color:#000;padding:1px 7px;border-radius:999px;font-weight:700;">📌 BONUS</span>`
            : (kind === 'event'
                ? `<label style="display:flex;align-items:center;gap:4px;font-size:.78rem;"><input type="checkbox" ${q.active ? 'checked' : ''} onchange="AdminPanel._toggleQuestActive('${kind}',${qi},this.checked)"> Actif</label>`
                : `<label style="display:flex;align-items:center;gap:4px;font-size:.78rem;"><input type="checkbox" ${q.active ? 'checked' : ''} onchange="AdminPanel._toggleQuestActive('${kind}',${qi},this.checked)"> Dans le pool</label>`)
          }
          <span style="flex:1;font-size:.78rem;color:#aaa;font-style:italic;">"${_escapeAttr(q.label)}"</span>
          ${isPinnedQ ? '' : `<button class="admin-btn admin-btn-danger admin-btn-sm" onclick="AdminPanel._deleteQuest('${kind}',${qi})">🗑️</button>`}
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <select onchange="AdminPanel._updateQuestField('${kind}',${qi},'type',this.value)" style="font-size:.75rem;background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:3px 6px;">${actionOpts}</select>
          <input type="number" min="1" value="${q.target}" onchange="AdminPanel._updateQuestField('${kind}',${qi},'target',+this.value)" style="width:60px;font-size:.75rem;background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:3px 6px;" />
          <select onchange="AdminPanel._updateQuestField('${kind}',${qi},'targetLabel',this.value)" style="font-size:.75rem;background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:3px 6px;">${targetOpts}</select>
          ${cats.length ? `<select onchange="AdminPanel._updateQuestField('${kind}',${qi},'tagId',this.value)" style="font-size:.75rem;background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:3px 6px;">
            <option value="">— Tag (optionnel) —</option>${tagOpts}
          </select>` : ''}
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <span style="font-size:.72rem;color:#aaa;">Récompense :</span>
          💎 <input type="number" min="0" value="${q.reward?.crystals || 0}" onchange="AdminPanel._updateQuestReward('${kind}',${qi},'crystals',+this.value)" style="width:60px;font-size:.75rem;background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:3px 6px;" />
          🪙 <input type="number" min="0" value="${q.reward?.gold || 0}" onchange="AdminPanel._updateQuestReward('${kind}',${qi},'gold',+this.value)" style="width:60px;font-size:.75rem;background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:3px 6px;" />
          🎁 <select onchange="AdminPanel._updateQuestRewardItem('${kind}',${qi},'itemId',this.value)" style="font-size:.75rem;background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:3px 6px;">
            <option value="">— Aucun item —</option>
            ${(state.items || []).map(it => {
              const existingItems = q.reward?.items || {};
              const currentItemId = Object.keys(existingItems)[0] || '';
              return `<option value="${it.id}" ${currentItemId === it.id ? 'selected' : ''}>${_escapeAttr(it.icon || '')} ${_escapeAttr(it.name)}</option>`;
            }).join('')}
          </select>
          ×<input type="number" min="0" max="99" value="${Object.values(q.reward?.items || {})[0] || 0}" onchange="AdminPanel._updateQuestRewardItem('${kind}',${qi},'qty',+this.value)" style="width:48px;font-size:.75rem;background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:3px 6px;" />
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px;">
          <span style="font-size:.72rem;color:#aaa;">Bonus :</span>
          ⚙️ <select onchange="AdminPanel._updateQuestReward('${kind}',${qi},'equipment',this.value||null)" style="font-size:.75rem;background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:3px 6px;">
            <option value="">— Aucun équipement —</option>
            ${(state.equipment || []).map(e => `<option value="${e.id}" ${q.reward?.equipment === e.id ? 'selected' : ''}>${_escapeAttr(e.name)}</option>`).join('')}
          </select>
          🐾 <select onchange="AdminPanel._updateQuestReward('${kind}',${qi},'characters',this.value||null)" style="font-size:.75rem;background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:3px 6px;">
            <option value="">— Aucun animal —</option>
            ${(state.characters || []).filter(c => (c.evolutionStage||0) === 0).map(c => `<option value="${c.id}" ${q.reward?.characters === c.id ? 'selected' : ''}>${_escapeAttr(c.name)} (${c.rarity})</option>`).join('')}
          </select>
        </div>
      </div>`;
    }).join('');

    const countInput = kind !== 'event' ? `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <label style="font-size:.8rem;color:#aaa;">Nombre de quêtes tirées par ${kind === 'daily' ? 'jour' : 'semaine'} :</label>
        <input type="number" min="1" max="10" value="${countVal}"
          onchange="AdminPanel._updateQuestCount('${kind}', +this.value)"
          style="width:60px;font-size:.8rem;background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:4px 8px;" />
      </div>` : '';

    return `<div class="admin-section">
      <div class="admin-section-title">${titles[kind]}</div>
      <p style="font-size:.8rem;color:#999;margin:0 0 10px;">${descs[kind]}</p>
      ${countInput}
      <div class="admin-list" style="margin-bottom:12px;">${questList || '<p style="color:#888;">Aucune quête.</p>'}</div>
      <button class="admin-btn admin-btn-success admin-btn-sm" onclick="AdminPanel._addQuest('${kind}')">+ Nouvelle quête</button>
    </div>`;
  }

  function _addQuest(kind) {
    const kindKey = kind === 'daily' ? 'dailyQuests' : kind === 'weekly' ? 'weeklyQuests' : 'eventQuests';
    const state = GameState.get();
    const quests = JSON.parse(JSON.stringify(state[kindKey] || []));
    const newQ = {
      id: `${kind[0]}q_${Date.now()}`,
      type: 'capture', target: 1, targetLabel: 'animal',
      active: true, tagId: null,
      label: 'Capturer 1 animal',
      reward: { crystals: 50, gold: 0, items: {} },
    };
    quests.push(newQ);
    _saveQuestKind(kind, quests);
    switchTab('quests');
  }

  function _deleteQuest(kind, qi) {
    const kindKey = kind === 'daily' ? 'dailyQuests' : kind === 'weekly' ? 'weeklyQuests' : 'eventQuests';
    const quests  = JSON.parse(JSON.stringify(GameState.get()[kindKey] || []));
    quests.splice(qi, 1);
    _saveQuestKind(kind, quests);
    switchTab('quests');
  }

  function _toggleQuestActive(kind, qi, val) {
    const kindKey = kind === 'daily' ? 'dailyQuests' : kind === 'weekly' ? 'weeklyQuests' : 'eventQuests';
    const quests  = JSON.parse(JSON.stringify(GameState.get()[kindKey] || []));
    if (quests[qi]) quests[qi].active = val;
    _saveQuestKind(kind, quests);
  }

  function _updateQuestField(kind, qi, field, value) {
    const kindKey = kind === 'daily' ? 'dailyQuests' : kind === 'weekly' ? 'weeklyQuests' : 'eventQuests';
    const quests  = JSON.parse(JSON.stringify(GameState.get()[kindKey] || []));
    if (!quests[qi]) return;
    quests[qi][field] = value || null;

    // Quand le type change vers completeQuestXxx, forcer le targetLabel correspondant
    if (field === 'type') {
      const autoTarget = {
        completeQuestDaily:  'quêteQuotidienne',
        completeQuestWeekly: 'quêteHebdomadaire',
        completeQuestEvent:  'quêteEvent',
      };
      if (autoTarget[value]) {
        quests[qi].targetLabel = autoTarget[value];
        // Mettre à jour le select targetLabel dans le DOM
        const items = document.querySelectorAll('#admin-content .admin-list-item');
        if (items[qi]) {
          const targetSel = items[qi].querySelectorAll('select')[1];
          if (targetSel) targetSel.value = autoTarget[value];
        }
      }
    }

    // Regénérer le label automatiquement
    quests[qi].label = _buildQuestLabel(quests[qi]);
    _saveQuestKind(kind, quests);
    // Mise à jour du label affiché sans re-render complet
    const items = document.querySelectorAll('#admin-content .admin-list-item');
    if (items[qi]) {
      const labelEl = items[qi].querySelector('span[style*="italic"]');
      if (labelEl) labelEl.textContent = `"${quests[qi].label}"`;
    }
  }

  function _updateQuestReward(kind, qi, field, value) {
    const kindKey = kind === 'daily' ? 'dailyQuests' : kind === 'weekly' ? 'weeklyQuests' : 'eventQuests';
    const quests  = JSON.parse(JSON.stringify(GameState.get()[kindKey] || []));
    if (!quests[qi]) return;
    quests[qi].reward = quests[qi].reward || { crystals: 0, gold: 0, items: {} };
    quests[qi].reward[field] = value;
    _saveQuestKind(kind, quests);
  }

  function _updateQuestRewardItem(kind, qi, field, value) {
    const kindKey = kind === 'daily' ? 'dailyQuests' : kind === 'weekly' ? 'weeklyQuests' : 'eventQuests';
    const quests  = JSON.parse(JSON.stringify(GameState.get()[kindKey] || []));
    if (!quests[qi]) return;
    quests[qi].reward = quests[qi].reward || { crystals: 0, gold: 0, items: {} };
    // On ne stocke qu'un seul item par quête (le select n'en montre qu'un)
    // field = 'itemId' → change la clé, field = 'qty' → change la quantité
    const existingItems = quests[qi].reward.items || {};
    const currentItemId = Object.keys(existingItems)[0] || '';
    const currentQty    = currentItemId ? (existingItems[currentItemId] || 0) : 0;
    if (field === 'itemId') {
      // Remplacer l'ancien item par le nouveau (même quantité)
      quests[qi].reward.items = value ? { [value]: currentQty || 1 } : {};
    } else if (field === 'qty') {
      if (currentItemId) {
        quests[qi].reward.items = value > 0 ? { [currentItemId]: value } : {};
      }
    }
    _saveQuestKind(kind, quests);
  }

  function _updateQuestCount(kind, val) {
    const state  = GameState.get();
    const config = JSON.parse(JSON.stringify(state.config || {}));
    config.quests = config.quests || {};
    const key = kind === 'daily' ? 'dailyCount' : 'weeklyCount';
    config.quests[key] = Math.max(1, Math.min(10, val));
    GameState.updateConfig(config);
  }

  function _saveQuestKind(kind, quests) {
    if (kind === 'daily')   GameState.updateDailyQuestDefs(quests);
    else if (kind === 'weekly') GameState.updateWeeklyQuestDefs(quests);
    else                    GameState.updateEventQuestDefs(quests);
  }

  /** Génère automatiquement un label de quête lisible à partir de ses champs. */
  function _buildQuestLabel(q) {
    const state   = GameState.get();
    const actions = GameDatabase.QUEST_ACTIONS || [];
    const targets = GameDatabase.QUEST_TARGETS || [];
    const cats    = state.tagCategories || [];

    const actionDef = actions.find(a => a.id === q.type);
    const targetDef = targets.find(t => t.id === q.targetLabel);
    let tagLabel = '';
    if (q.tagId) {
      cats.forEach(cat => { const t = cat.tags.find(t => t.id === q.tagId); if (t) tagLabel = ` (${t.label})`; });
    }
    const actionLabel = actionDef?.label || q.type;
    const targetLabel = targetDef?.label || q.targetLabel || '';
    return `${actionLabel} ${q.target} ${targetLabel}${tagLabel}`.trim();
  }

  // ─── BOUTON GACHA "Ajouter tous les animaux par tag" ─────────────────────────

  function _addCharsByTagToBanner(bannerId) {
    const state = GameState.get();
    const cats  = state.tagCategories || [];
    if (!cats.length) return _notify('Aucune catégorie de tags définie.');

    // Construire une liste de tous les tags disponibles
    const allTags = cats.flatMap(cat => cat.tags.map(t => ({ ...t, catName: cat.name })));
    if (!allTags.length) return _notify('Aucun tag défini.');

    const opts = allTags.map(t => `<option value="${t.id}">${_escapeAttr(t.catName)} · ${_escapeAttr(t.label)}</option>`).join('');
    const sel  = document.getElementById('banner-featured');
    if (!sel) return;

    // Popup inline simple
    const existing = document.getElementById('tag-banner-picker');
    if (existing) { existing.remove(); return; }
    const picker = document.createElement('div');
    picker.id = 'tag-banner-picker';
    picker.style.cssText = 'background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:8px;';
    picker.innerHTML = `<label style="font-size:.8rem;color:#aaa;display:block;margin-bottom:6px;">Ajouter toutes les formes de base ayant ce tag :</label>
      <div style="display:flex;gap:8px;">
        <select id="tag-banner-sel" style="flex:1;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:4px;">
          <option value="">— Choisir un tag —</option>${opts}
        </select>
        <button class="admin-btn admin-btn-success admin-btn-sm" onclick="AdminPanel._applyTagToBanner()">Ajouter</button>
        <button class="admin-btn admin-btn-sm" onclick="document.getElementById('tag-banner-picker')?.remove()">✕</button>
      </div>`;
    sel.closest('.admin-field').after(picker);
  }

  function _applyTagToBanner() {
    const tagId = document.getElementById('tag-banner-sel')?.value;
    if (!tagId) return _notify('Choisissez un tag.');
    const state = GameState.get();
    // Trouver toutes les formes de base ayant ce tag
    const bases = state.characters.filter(c => (c.evolutionStage || 0) === 0 && (c.tags || []).includes(tagId));
    if (!bases.length) return _notify('Aucun animal de base avec ce tag.');

    const sel = document.getElementById('banner-featured');
    if (!sel) return;
    bases.forEach(c => {
      // Ajouter l'option si elle n'existe pas
      if (!Array.from(sel.options).find(o => o.value === c.id)) {
        const opt = document.createElement('option');
        opt.value = c.id; opt.textContent = c.name;
        sel.appendChild(opt);
      }
      // Sélectionner
      Array.from(sel.options).forEach(o => { if (o.value === c.id) o.selected = true; });
    });
    document.getElementById('tag-banner-picker')?.remove();
    _notify(`✅ ${bases.length} animal(aux) ajouté(s) au featured.`);
  }

  // ─── ÉDITEUR DE RECADRAGE DE PORTRAITS ───────────────────────────────────────

  let _cropCurrentCharId = null; // ID du personnage en cours d'édition (null = nouveau)
  let _cropVign   = { x: 50, y: 20, zoom: 1 };   // état courant vignette
  let _cropDetail = { x: 50, y: 30, zoom: 1 };   // état courant fiche
  let _cropCombat = { cx: 50, cy: 38, r: 38 };   // état courant cercle combat
  let _imgSrc     = null; // URL du portrait (lue au moment de l'ouverture)

  /** Ouvre l'éditeur de recadrage pour le personnage en cours d'édition. */
  function _openCropEditor() {
    _cropCurrentCharId = document.getElementById('char-id')?.value.trim() || null;
    _imgSrc = document.getElementById('char-portrait')?.value.trim() || null;

    // Charger les crops existants si le perso est déjà enregistré
    const existing = _cropCurrentCharId ? GameState.getCharDef(_cropCurrentCharId) : null;
    _cropVign   = existing?.portraitCrop ? { ...existing.portraitCrop } : GameDatabase.defaultPortraitCrop();
    _cropDetail = existing?.detailCrop   ? { ...existing.detailCrop   } : GameDatabase.defaultDetailCrop();
    _cropCombat = existing?.combatCrop   ? { ...existing.combatCrop   } : GameDatabase.defaultCombatCrop();

    _injectCropEditorStyles();
    _buildCropEditor();
  }

  function _injectCropEditorStyles() {
    if (document.getElementById('crop-editor-styles')) return;
    const s = document.createElement('style');
    s.id = 'crop-editor-styles';
    s.textContent = `
#crop-editor-overlay {
  position:fixed; inset:0; z-index:100000;
  display:flex; align-items:center; justify-content:center;
  background:rgba(0,0,0,.85); backdrop-filter:blur(6px);
  padding:12px; box-sizing:border-box;
}
#crop-editor-box {
  background:var(--surface); border:1px solid var(--border);
  border-radius:var(--radius-lg); padding:20px;
  max-width:860px; width:100%; max-height:90vh; overflow-y:auto;
  display:flex; flex-direction:column; gap:16px;
}
.crop-editor-title { font-family:var(--font-display); font-weight:700; font-size:1.1rem; color:var(--accent); }
.crop-editor-cols {
  display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:16px;
}
.crop-col { display:flex; flex-direction:column; align-items:center; gap:8px; }
.crop-col-label { font-size:.78rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:.04em; }
.crop-zone {
  position:relative; overflow:hidden; cursor:grab; user-select:none;
  background:#111; flex-shrink:0;
}
.crop-zone:active { cursor:grabbing; }
.crop-zone img { position:absolute; object-fit:cover; top:0; left:0; }
#ce-vign-zone  { width:200px; height:200px; border-radius:var(--radius); }
#ce-detail-zone { width:110px; height:400px; border-radius:var(--radius); }
#ce-com-wrapper { position:relative; display:inline-block; cursor:grab; user-select:none; }
#ce-com-wrapper:active { cursor:grabbing; }
#ce-com-bg {
  display:block; max-width:300px; max-height:400px;
  width:auto; height:auto; pointer-events:none;
}
#ce-com-svg { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; }
#ce-com-circle { pointer-events:none; }
.crop-zoom-row { display:flex; align-items:center; gap:8px; width:100%; }
.crop-zoom-row input[type=range] { flex:1; }
.crop-zoom-val { font-size:.72rem; color:var(--text-dim); min-width:32px; }
.crop-previews { display:flex; gap:12px; flex-wrap:wrap; justify-content:center; }
.crop-prev-block { display:flex; flex-direction:column; align-items:center; gap:4px; }
.crop-prev-label { font-size:.68rem; color:var(--text-dim); }
.crop-prev-vign { width:64px; height:64px; position:relative; overflow:hidden; border-radius:6px; background:#111; }
.crop-prev-detail { width:38px; height:138px; position:relative; overflow:hidden; border-radius:6px; background:#111; }
.crop-prev-combat { width:56px; height:56px; position:relative; overflow:hidden; border-radius:50%; background:#111; }
.crop-actions { display:flex; gap:10px; flex-wrap:wrap; }
.crop-btn { padding:10px 22px; border-radius:999px; border:none; cursor:pointer; font-weight:700;
            font-family:var(--font-display); font-size:.9rem; transition:opacity .15s; }
.crop-btn-confirm { background:var(--accent2); color:#000; }
.crop-btn-cancel  { background:var(--surface-2); color:var(--text); border:1px solid var(--border); }
.crop-btn:hover { opacity:.85; }
`;
    document.head.appendChild(s);
  }

  function _buildCropEditor() {
    document.getElementById('crop-editor-overlay')?.remove();

    const hasImg = !!_imgSrc;

    const overlay = document.createElement('div');
    overlay.id = 'crop-editor-overlay';
    overlay.innerHTML = `
      <div id="crop-editor-box">
        <div class="crop-editor-title">✂️ Recadrage des portraits</div>
        ${!hasImg ? '<p style="color:var(--text-dim);font-size:.85rem;">⚠️ Aucun portrait défini. Ajoutez une URL de portrait puis rouvrez l\'éditeur.</p>' : ''}
        <div class="crop-editor-cols">

          <div class="crop-col">
            <div class="crop-col-label">Toutes images carrées (1:1)</div>
            <div class="crop-zone" id="ce-vign-zone">
              ${hasImg ? `<img id="ce-vign-img" src="${_imgSrc}" alt="">` : ''}
            </div>
            <div class="crop-zoom-row">
              <span style="font-size:.72rem;color:var(--text-dim)">Zoom</span>
              <input type="range" id="ce-vign-zoom" min="1" max="5" step="0.05" value="${_cropVign.zoom}">
              <span class="crop-zoom-val" id="ce-vign-zoom-val">×${(+_cropVign.zoom).toFixed(2)}</span>
            </div>
          </div>

          <div class="crop-col">
            <div class="crop-col-label">Fiche personnage (1:3,64)</div>
            <div class="crop-zone" id="ce-detail-zone">
              ${hasImg ? `<img id="ce-detail-img" src="${_imgSrc}" alt="">` : ''}
            </div>
            <div class="crop-zoom-row">
              <span style="font-size:.72rem;color:var(--text-dim)">Zoom</span>
              <input type="range" id="ce-detail-zoom" min="1" max="5" step="0.05" value="${_cropDetail.zoom}">
              <span class="crop-zoom-val" id="ce-detail-zoom-val">×${(+_cropDetail.zoom).toFixed(2)}</span>
            </div>
          </div>

          <div class="crop-col">
            <div class="crop-col-label">Combat (cercle)</div>
            <div id="ce-com-wrapper">
              ${hasImg ? `<img id="ce-com-bg" src="${_imgSrc}" alt="">` : ''}
              <svg id="ce-com-svg" viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <mask id="ce-com-mask">
                    <rect id="ce-com-mask-bg" width="1" height="1" fill="white"/>
                    <circle id="ce-com-mask-hole" cx="0.5" cy="0.5" r="0.3" fill="black"/>
                  </mask>
                </defs>
                <rect id="ce-com-mask-rect" width="1" height="1" fill="rgba(0,0,0,0.55)" mask="url(#ce-com-mask)" pointer-events="none"/>
                <circle id="ce-com-circle" cx="0.5" cy="0.5" r="0.3"
                  fill="none" stroke="white" stroke-width="0.008"
                  stroke-dasharray="0.025 0.015"/>
              </svg>
            </div>
            <div style="font-size:.7rem;color:var(--text-dim);text-align:center;margin-top:4px;">
              Glisser · Molette = taille du cercle
            </div>
          </div>

          <div class="crop-col">
            <div class="crop-col-label">Aperçu</div>
            <div class="crop-previews" style="flex-direction:column;">
              <div class="crop-prev-block">
                <div class="crop-prev-vign"><img id="ce-prev-vign" src="${_imgSrc || ''}" style="position:absolute;"></div>
                <span class="crop-prev-label">Collection</span>
              </div>
              <div class="crop-prev-block">
                <div class="crop-prev-detail"><img id="ce-prev-detail" src="${_imgSrc || ''}" style="position:absolute;"></div>
                <span class="crop-prev-label">Fiche</span>
              </div>
              <div class="crop-prev-block">
                <div class="crop-prev-combat"><img id="ce-prev-com" src="${_imgSrc || ''}" style="position:absolute;object-fit:cover;object-position:50% 0%;"></div>
                <span class="crop-prev-label">Combat</span>
              </div>
            </div>
          </div>

        </div>
        <div class="crop-actions">
          <button class="crop-btn crop-btn-confirm" onclick="AdminPanel._confirmCrop()">✅ Confirmer et enregistrer</button>
          <button class="crop-btn crop-btn-cancel"  onclick="AdminPanel._closeCropEditor()">Annuler</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    if (hasImg) {
      _initCropZone('vign');
      _initCropZone('detail');
      _initCombatCropZone();
      _applyVign();
      _applyDetail();
      _applyCombatPreview();
    }
  }

  function _initCropZone(kind) {
    const zone = document.getElementById(`ce-${kind}-zone`);
    const zoomInput = document.getElementById(`ce-${kind}-zoom`);
    const zoomVal   = document.getElementById(`ce-${kind}-zoom-val`);
    if (!zone) return;

    let dragging = false, startX, startY, startCrop;

    zone.addEventListener('mousedown', (e) => {
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      startCrop = kind === 'vign' ? { ..._cropVign } : { ..._cropDetail };
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const rect = zone.getBoundingClientRect();
      const dx = ((e.clientX - startX) / rect.width)  * 100;
      const dy = ((e.clientY - startY) / rect.height) * 100;
      const zoom = startCrop.zoom;
      if (kind === 'vign') {
        _cropVign.x = Math.max(0, Math.min(100, startCrop.x - dx / zoom));
        _cropVign.y = Math.max(0, Math.min(100, startCrop.y - dy / zoom));
        _applyVign();
      } else {
        _cropDetail.x = Math.max(0, Math.min(100, startCrop.x - dx / zoom));
        _cropDetail.y = Math.max(0, Math.min(100, startCrop.y - dy / zoom));
        _applyDetail();
      }
    });
    window.addEventListener('mouseup', () => { dragging = false; });

    zone.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      if (kind === 'vign') {
        _cropVign.zoom = Math.max(1, Math.min(5, +(_cropVign.zoom + delta).toFixed(2)));
        zoomInput.value = _cropVign.zoom;
        zoomVal.textContent = `×${_cropVign.zoom.toFixed(2)}`;
        _applyVign();
      } else {
        _cropDetail.zoom = Math.max(1, Math.min(5, +(_cropDetail.zoom + delta).toFixed(2)));
        zoomInput.value = _cropDetail.zoom;
        zoomVal.textContent = `×${_cropDetail.zoom.toFixed(2)}`;
        _applyDetail();
      }
    }, { passive: false });

    zoomInput?.addEventListener('input', () => {
      const v = parseFloat(zoomInput.value);
      if (kind === 'vign') { _cropVign.zoom = v; _applyVign(); }
      else                  { _cropDetail.zoom = v; _applyDetail(); }
      if (zoomVal) zoomVal.textContent = `×${v.toFixed(2)}`;
    });
  }

  function _applyVign() {
    const img  = document.getElementById('ce-vign-img');
    const prev = document.getElementById('ce-prev-vign');
    if (!img) return;
    const zoom = _cropVign.zoom;
    const x = _cropVign.x, y = _cropVign.y;
    const applyTo = (el) => {
      el.style.width  = `${zoom * 100}%`;
      el.style.height = `${zoom * 100}%`;
      el.style.left   = `${(1 - zoom) * x}%`;
      el.style.top    = `${(1 - zoom) * y}%`;
      el.style.objectFit = 'cover';
      el.style.objectPosition = `${x}% ${y}%`;
    };
    applyTo(img);
    if (prev) { prev.src = _imgSrc; applyTo(prev); }
  }

  function _applyDetail() {
    const img  = document.getElementById('ce-detail-img');
    const prev = document.getElementById('ce-prev-detail');
    if (!img) return;
    const zoom = _cropDetail.zoom;
    const x = _cropDetail.x, y = _cropDetail.y;
    const applyTo = (el) => {
      el.style.width  = `${zoom * 100}%`;
      el.style.height = `${zoom * 100}%`;
      el.style.left   = `${(1 - zoom) * x}%`;
      el.style.top    = `${(1 - zoom) * y}%`;
      el.style.objectFit = 'cover';
      el.style.objectPosition = `${x}% ${y}%`;
    };
    applyTo(img);
    if (prev) { prev.src = _imgSrc; applyTo(prev); }
  }

  function _initCombatCropZone() {
    const wrapper  = document.getElementById('ce-com-wrapper');
    const bgImg    = document.getElementById('ce-com-bg');
    const svg      = document.getElementById('ce-com-svg');
    const circ     = document.getElementById('ce-com-circle');
    const maskHole = document.getElementById('ce-com-mask-hole');
    const maskBg   = document.getElementById('ce-com-mask-bg');
    const maskRect = document.getElementById('ce-com-mask-rect');
    if (!wrapper || !circ || !bgImg || !svg) return;

    // cx, cy, r = % des dimensions NATURELLES de l'image (0-100).
    if (_cropCombat.cx === 50 && _cropCombat.cy === 38 && _cropCombat.r === 38) {
      _cropCombat.cx = 50; _cropCombat.cy = 50; _cropCombat.r = 30;
    }

    let imgW = 1, imgH = 1;

    // Met à jour le SVG viewBox et les attributs du cercle
    // Le viewBox = "0 0 imgW imgH" → le cercle en px image est toujours rond
    const syncCircle = () => {
      const cx = _cropCombat.cx / 100 * imgW;
      const cy = _cropCombat.cy / 100 * imgH;
      const r  = _cropCombat.r  / 100 * Math.min(imgW, imgH); // rayon = % du plus petit côté → cercle parfait
      svg.setAttribute('viewBox', `0 0 ${imgW} ${imgH}`);
      if (maskBg)   { maskBg.setAttribute('width', imgW);  maskBg.setAttribute('height', imgH); }
      if (maskRect) { maskRect.setAttribute('width', imgW); maskRect.setAttribute('height', imgH); }
      circ.setAttribute('cx', cx);
      circ.setAttribute('cy', cy);
      circ.setAttribute('r',  r);
      circ.setAttribute('stroke-width', Math.min(imgW, imgH) * 0.008);
      circ.setAttribute('stroke-dasharray', `${Math.min(imgW,imgH)*0.025} ${Math.min(imgW,imgH)*0.015}`);
      if (maskHole) {
        maskHole.setAttribute('cx', cx);
        maskHole.setAttribute('cy', cy);
        maskHole.setAttribute('r',  r);
      }
      _applyCombatPreview();
    };

    const init = () => {
      imgW = bgImg.naturalWidth  || 1;
      imgH = bgImg.naturalHeight || 1;
      syncCircle();
    };
    if (bgImg.complete && bgImg.naturalWidth) init();
    else bgImg.addEventListener('load', init);

    let dragging = false, startMX, startMY, startCX, startCY;

    wrapper.addEventListener('mousedown', (e) => {
      dragging = true;
      startMX = e.clientX; startMY = e.clientY;
      startCX = _cropCombat.cx; startCY = _cropCombat.cy;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const rect = bgImg.getBoundingClientRect();
      const dx = (e.clientX - startMX) / rect.width  * 100;
      const dy = (e.clientY - startMY) / rect.height * 100;
      const r  = _cropCombat.r;
      // Contraindre pour que le cercle reste dans l'image
      const rX = r * Math.min(imgW, imgH) / imgW;  // rayon en % de la largeur
      const rY = r * Math.min(imgW, imgH) / imgH;  // rayon en % de la hauteur
      _cropCombat.cx = Math.max(rX, Math.min(100 - rX, startCX + dx));
      _cropCombat.cy = Math.max(rY, Math.min(100 - rY, startCY + dy));
      syncCircle();
    });

    window.addEventListener('mouseup', () => { dragging = false; });

    wrapper.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -1 : 1;
      const newR  = Math.max(5, Math.min(45, _cropCombat.r + delta));
      _cropCombat.r  = newR;
      const rX = newR * Math.min(imgW, imgH) / imgW;
      const rY = newR * Math.min(imgW, imgH) / imgH;
      _cropCombat.cx = Math.max(rX, Math.min(100 - rX, _cropCombat.cx));
      _cropCombat.cy = Math.max(rY, Math.min(100 - rY, _cropCombat.cy));
      syncCircle();
    }, { passive: false });
  }

  function _applyCombatPreview() {
    const prev  = document.getElementById('ce-prev-com');
    const bgImg = document.getElementById('ce-com-bg');
    if (!prev || !_imgSrc) return;

    const prevSize = 56; // px — taille du .crop-prev-combat
    const imgW = bgImg?.naturalWidth  || 1;
    const imgH = bgImg?.naturalHeight || 1;

    // Rayon en pixels image (sur le plus petit côté, comme dans syncCircle)
    const r_px = _cropCombat.r / 100 * Math.min(imgW, imgH);
    // Centre en pixels image
    const cx_px = _cropCombat.cx / 100 * imgW;
    const cy_px = _cropCombat.cy / 100 * imgH;

    // Scale : le diamètre du cercle (2*r_px) doit tenir dans prevSize
    const scale = prevSize / (2 * r_px);

    prev.src = _imgSrc;
    prev.style.position      = 'absolute';
    prev.style.width         = `${imgW * scale}px`;
    prev.style.height        = `${imgH * scale}px`;
    prev.style.left          = `${prevSize / 2 - cx_px * scale}px`;
    prev.style.top           = `${prevSize / 2 - cy_px * scale}px`;
    prev.style.objectFit     = 'cover';
    prev.style.objectPosition= '50% 50%';
    prev.style.maxWidth      = 'none';
    prev.style.maxHeight     = 'none';
    prev.style.transform     = '';
    prev.style.clipPath      = '';
  }

  /** Confirme et sauvegarde les 3 crops directement dans le state */
  function _confirmCrop() {
    if (!_cropCurrentCharId) {
      _notify('💡 Recadrage mémorisé — cliquez sur 💾 Enregistrer pour finaliser.');
      _closeCropEditor();
      return;
    }
    // Stocker les dimensions naturelles de l'image dans combatCrop pour que
    // _combatCropImgHtml puisse reproduire exactement la même transformation
    // géométrique que la preview de l'éditeur (qui utilise naturalWidth/Height).
    const bgImg = document.getElementById('ce-com-bg');
    const combatCropToSave = { ..._cropCombat };
    if (bgImg && bgImg.naturalWidth && bgImg.naturalHeight) {
      combatCropToSave.imgW = bgImg.naturalWidth;
      combatCropToSave.imgH = bgImg.naturalHeight;
    }
    GameState.updateCharDef(_cropCurrentCharId, {
      portraitCrop: { ..._cropVign   },
      detailCrop:   { ..._cropDetail },
      combatCrop:   combatCropToSave,
    });
    _notify('✅ Recadrages enregistrés.');
    _closeCropEditor();
  }

  function _closeCropEditor() {
    document.getElementById('crop-editor-overlay')?.remove();
  }

  // ─── ONGLET ÉVÉNEMENT ────────────────────────────────────────────────────────

  let _eventCountdownTimer = null;

  function _renderEventTab(container) {
    const state      = GameState.get();
    const allTags    = EventSystem.getAllTags(state);
    const tagOptions = allTags.map(t =>
      '<option value="' + t.id + '">' + t.label + '</option>'
    ).join('');
    const charOptions = state.characters
      .filter(c => (c.evolutionStage || 0) === 0)
      .map(c => '<option value="' + c.id + '">' + c.name + ' (' + c.rarity + ')</option>')
      .join('');

    const evtCurrent = state.events?.current || null;
    const evtNext    = state.events?.next    || null;
    const now        = Date.now();

    container.innerHTML = `
      <style>
        .evt-section{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:18px;margin-bottom:18px;}
        .evt-section-title{font-family:var(--font-display);font-weight:700;font-size:1.05rem;color:var(--accent);margin-bottom:14px;}
        .evt-countdown{font-size:1.2rem;font-weight:800;color:#facc15;font-family:monospace;}
        .evt-tag-chars{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;}
        .evt-char-pill{font-size:.72rem;padding:2px 8px;border-radius:999px;background:var(--surface);border:1px solid var(--border-soft);}
        .evt-rarity-row{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0;}
        .evt-rarity-badge{padding:3px 10px;border-radius:999px;font-size:.72rem;font-weight:700;}
        .rarity-common{background:#374151;color:#9ca3af;} .rarity-uncommon{background:#14532d;color:#6fcc6f;}
        .rarity-rare{background:#1e3a5f;color:#60a5fa;} .rarity-epic{background:#3b0764;color:#c084fc;}
        .rarity-legendary{background:#451a03;color:#fbbf24;} .rarity-mythic{background:#4c0519;color:#f87171;}
        .evt-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;}
        @media(max-width:600px){.evt-grid{grid-template-columns:1fr;}}
        .evt-field{display:flex;flex-direction:column;gap:4px;}
        .evt-field label{font-size:.75rem;color:var(--text-dim);}
        .evt-field input,.evt-field select{background:var(--surface);border:1px solid var(--border);color:var(--text);padding:6px 8px;border-radius:var(--radius-sm);font-size:.85rem;width:100%;box-sizing:border-box;}
        .evt-quest-row{display:flex;gap:4px;align-items:center;padding:4px;background:var(--surface);border-radius:4px;margin-bottom:3px;}
        .evt-quest-row select,.evt-quest-row input{background:var(--surface-2);border:1px solid var(--border-soft);color:var(--text);padding:3px 5px;border-radius:3px;font-size:.75rem;}
        .evt-quest-row .eq-label{flex:2;min-width:0;}
        .evt-quest-row .eq-type{flex:1;min-width:0;}
        .evt-char-list{display:flex;flex-direction:column;gap:3px;max-height:150px;overflow-y:auto;}
        .evt-char-item{display:flex;align-items:center;gap:8px;padding:3px 6px;background:var(--surface);border-radius:4px;font-size:.78rem;}
        .evt-char-item button{margin-left:auto;background:#7f1d1d;border:none;color:#fca5a5;border-radius:3px;padding:1px 6px;cursor:pointer;font-size:.72rem;}
      </style>
      <div id="evt-current-wrap"></div>
      <div id="evt-next-wrap"></div>
    `;

    _renderEventSectionInto('current', evtCurrent, tagOptions, charOptions, allTags, now);
    _renderEventSectionInto('next',    evtNext,    tagOptions, charOptions, allTags, now);
    _startEventCountdownTimer(container);
  }

  function _renderEventSectionInto(slot, evt, tagOptions, charOptions, allTags, now) {
    const wrap   = document.getElementById('evt-' + slot + '-wrap');
    if (!wrap) return;
    const state  = GameState.get();
    const isActive = slot === 'current';
    const title  = isActive ? '🎪 Événement en cours' : '⏳ Événement suivant';

    if (!evt) {
      const nextStart = EventSystem.nextEventStart();
      wrap.innerHTML = '<div class="evt-section">' +
        '<div class="evt-section-title">' + title + '</div>' +
        '<p style="color:var(--text-dim);font-size:.85rem;margin-bottom:12px;">' +
          (isActive ? 'Aucun événement actif.' : 'Prochain démarrage : <strong>' + GameUtils.formatDate(nextStart) + '</strong>') +
        '</p>' +
        _renderEventFormHtml(slot, tagOptions, nextStart) +
      '</div>';
      _bindEventFormBtns(slot);
      return;
    }

    const chars    = EventSystem.getBaseCharsForTag(evt.tagId);
    const RARITIES = ['common','uncommon','rare','epic','legendary','mythic'];
    const RLABELS  = {common:'Commune',uncommon:'Peu Commune',rare:'Rare',epic:'Épique',legendary:'Légendaire',mythic:'Mythique'};
    const dbCounts = {}; RARITIES.forEach(r => dbCounts[r] = 0);
    chars.forEach(c => { if (c.rarity) dbCounts[c.rarity]++; });

    const isRunning = isActive && evt.active && now >= evt.startDate && now <= evt.endDate;
    const isPending = !isRunning && evt.startDate > now;
    const statusBadge = isRunning
      ? '<span style="background:#14532d;color:#4ade80;padding:2px 9px;border-radius:999px;font-size:.72rem;">● EN COURS</span>'
      : isPending
        ? '<span style="background:#1e3a5f;color:#60a5fa;padding:2px 9px;border-radius:999px;font-size:.72rem;">⏳ À VENIR</span>'
        : '<span style="background:#3d1010;color:#f87171;padding:2px 9px;border-radius:999px;font-size:.72rem;">✗ TERMINÉ</span>';

    const cdAttr = isRunning ? 'data-evt-end="' + evt.endDate + '"' : isPending ? 'data-evt-start="' + evt.startDate + '"' : '';
    const cdVal  = isRunning ? GameUtils.formatCountdown(evt.endDate - now) : isPending ? GameUtils.formatCountdown(evt.startDate - now) : 'Terminé';
    const cdLabel= isRunning ? 'Fin dans' : isPending ? 'Début dans' : '';


    // Nouvelles créatures
    const newCharsHtml = (evt.newCharIds || []).map(id => {
      const def = state.characters.find(c => c.id === id);
      if (!def) return '';
      return '<div class="evt-char-item">' + _escapeAttr(def.name) + ' <em style="color:var(--text-dim)">(' + def.rarity + ')</em>' +
        '<button class="btn-rm-char" data-char-id="' + id + '">✕</button></div>';
    }).join('');

    const tagSel = tagOptions.replace('value="' + evt.tagId + '"', 'value="' + evt.tagId + '" selected');

    wrap.innerHTML = '<div class="evt-section">' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">' +
        '<div class="evt-section-title" style="margin:0">' + title + '</div>' + statusBadge +
      '</div>' +

      '<div class="evt-grid">' +
        '<div class="evt-field"><label>Tag</label><select id="evt-' + slot + '-tag">' + tagSel + '</select></div>' +
        '<div class="evt-field"><label>Titre personnalisé</label><input type="text" id="evt-' + slot + '-title" value="' + _escapeAttr(evt.customTitle||'') + '" placeholder="Laissez vide"></div>' +
        '<div class="evt-field"><label>Début</label><input type="datetime-local" id="evt-' + slot + '-start" value="' + _tsToDatetimeLocal(evt.startDate) + '"></div>' +
        '<div class="evt-field"><label>Durée (jours)</label><input type="number" id="evt-' + slot + '-duration" value="' + (evt.durationDays||10) + '" min="1" max="31"></div>' +
        '<div class="evt-field"><label>Réduction boutique (%)</label><input type="number" id="evt-' + slot + '-discount" value="' + (evt.shopDiscountPct||20) + '" min="0" max="90"></div>' +
        '<div class="evt-field"><label>Énergie Invasion</label><input type="number" id="evt-' + slot + '-inv-cost" value="' + (evt.invasionConfig?.energyCost||15) + '" min="0" max="99"></div>' +
        '<div class="evt-field"><label>Énergie Défi</label><input type="number" id="evt-' + slot + '-defi-cost" value="' + (evt.defiConfig?.energyCost||20) + '" min="0" max="99"></div>' +
      '</div>' +

      '<div style="font-size:.78rem;color:var(--text-dim);margin-bottom:10px;">' +
        (cdLabel ? cdLabel + ' : <span class="evt-countdown" ' + cdAttr + '>' + cdVal + '</span> &nbsp;|&nbsp; ' : '') +
        GameUtils.formatDate(evt.startDate) + ' → ' + GameUtils.formatDate(evt.endDate) +
      '</div>' +

      '<div style="font-size:.78rem;color:var(--text-dim);font-weight:700;margin-bottom:4px;">🐾 Espèces du tag ' + _escapeAttr(evt.tagLabel) + ' (' + chars.length + ' formes de base)</div>' +
      '<div class="evt-tag-chars" style="margin-bottom:8px;">' +
        (chars.map(c => '<span class="evt-char-pill">' + _escapeAttr(c.name) + '</span>').join('') || '<em style="color:#888">Aucune</em>') +
      '</div>' +
      '<div class="evt-rarity-row" style="margin-bottom:14px;">' +
        RARITIES.map(r => '<span class="evt-rarity-badge rarity-' + r + '">' + RLABELS[r] + ' : ' + (dbCounts[r]||0) + '</span>').join('') +
      '</div>' +



      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">' +
        '<button class="btn-evt-save admin-btn admin-btn-success">💾 Enregistrer &amp; Activer</button>' +
        '<button class="btn-evt-random admin-btn">🎲 Tag aléatoire</button>' +
        (isActive && isRunning ? '<button class="btn-evt-deactivate admin-btn admin-btn-danger">⏹ Arrêter</button>' : '') +
        (!isActive ? '<button class="btn-evt-activate-next admin-btn admin-btn-success">▶ Activer maintenant</button>' : '') +
        '<button class="btn-evt-clear admin-btn admin-btn-danger">🗑 Effacer</button>' +
      '</div>' +
    '</div>';

    _bindEventSectionBtns(slot, evt);
  }

  function _bindEventSectionBtns(slot, evt) {
    const wrap = document.getElementById('evt-' + slot + '-wrap');
    if (!wrap) return;

    // Enregistrer & Activer
    wrap.querySelector('.btn-evt-save')?.addEventListener('click', () => _evtSaveSlot(slot));

    // Tag aléatoire
    wrap.querySelector('.btn-evt-random')?.addEventListener('click', () => {
      const tag = EventSystem.pickRandomTag();
      if (!tag) { _notify('❌ Aucun tag disponible.'); return; }
      const sel = document.getElementById('evt-' + slot + '-tag');
      if (sel) sel.value = tag.id;
      _notify('🎲 Tag aléatoire : ' + tag.label);
    });

    // Arrêter
    wrap.querySelector('.btn-evt-deactivate')?.addEventListener('click', () => {
      EventSystem.deactivateCurrent();
      _notify('⏹ Événement arrêté.');
      switchTab('event');
    });

    // Activer Next
    wrap.querySelector('.btn-evt-activate-next')?.addEventListener('click', () => {
      const state = GameState.get();
      if (!state.events?.next) { _notify('❌ Aucun event "suivant" configuré.'); return; }
      state.events.current = { ...state.events.next, startDate: Date.now(), active: true };
      state.events.current.endDate = state.events.current.startDate + state.events.current.durationDays * 24 * 3600 * 1000;
      state.events.next = null;
      GameState._saveEvents(state.events);
      EventSystem.activateCurrent();
      _notify('▶ Événement activé !');
      switchTab('event');
    });

    // Effacer
    wrap.querySelector('.btn-evt-clear')?.addEventListener('click', () => {
      if (!confirm('Effacer cet événement ?')) return;
      if (slot === 'current') EventSystem.deactivateCurrent();
      else {
        const state = GameState.get();
        if (state.events) state.events.next = null;
        GameState._saveEvents(state.events || { current: null, next: null });
      }
      _notify('🗑 Événement effacé.');
      switchTab('event');
    });
  }

  function _renderEventFormHtml(slot, tagOptions, defaultStart) {
    return '<div class="evt-grid">' +
      '<div class="evt-field"><label>Tag</label><select id="evt-' + slot + '-tag">' + tagOptions + '</select></div>' +
      '<div class="evt-field"><label>Titre personnalisé</label><input type="text" id="evt-' + slot + '-title" placeholder="Laissez vide"></div>' +
      '<div class="evt-field"><label>Début</label><input type="datetime-local" id="evt-' + slot + '-start" value="' + _tsToDatetimeLocal(defaultStart) + '"></div>' +
      '<div class="evt-field"><label>Durée (jours)</label><input type="number" id="evt-' + slot + '-duration" value="10" min="1" max="31"></div>' +
      '<div class="evt-field"><label>Réduction boutique (%)</label><input type="number" id="evt-' + slot + '-discount" value="20" min="0" max="90"></div>' +
      '<div class="evt-field"><label>Énergie Invasion</label><input type="number" id="evt-' + slot + '-inv-cost" value="15" min="0" max="99"></div>' +
      '<div class="evt-field"><label>Énergie Défi</label><input type="number" id="evt-' + slot + '-defi-cost" value="20" min="0" max="99"></div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">' +
      '<button class="btn-evt-create admin-btn admin-btn-success">✨ Créer l\'événement</button>' +
      '<button class="btn-evt-random admin-btn">🎲 Tag aléatoire</button>' +
    '</div>';
  }

  function _bindEventFormBtns(slot) {
    const wrap = document.getElementById('evt-' + slot + '-wrap');
    if (!wrap) return;
    wrap.querySelector('.btn-evt-create')?.addEventListener('click', () => {
      const opts = _evtReadForm(slot);
      if (!opts.tagId) { _notify('❌ Choisissez un tag.'); return; }
      const evt = EventSystem.buildEvent(opts.tagId, opts.startDate, opts);
      if (!evt) { _notify('❌ Tag introuvable.'); return; }
      if (slot === 'current') { EventSystem.saveCurrentEvent(evt); EventSystem.activateCurrent(); }
      else EventSystem.saveNextEvent(evt);
      _notify('✅ Événement créé' + (slot === 'current' ? ' et activé.' : '.'));
      switchTab('event');
    });
    wrap.querySelector('.btn-evt-random')?.addEventListener('click', () => {
      const tag = EventSystem.pickRandomTag();
      if (!tag) { _notify('❌ Aucun tag disponible.'); return; }
      const sel = document.getElementById('evt-' + slot + '-tag');
      if (sel) sel.value = tag.id;
      _notify('🎲 Tag aléatoire : ' + tag.label);
    });
  }

  function _evtSaveSlot(slot) {
    const state    = GameState.get();
    const existing = slot === 'current' ? state.events?.current : state.events?.next;
    if (!existing) { _bindEventFormBtns(slot); document.querySelector('#evt-' + slot + '-wrap .btn-evt-create')?.click(); return; }
    const opts = _evtReadForm(slot);

    // Lire les quêtes depuis le DOM
    const rows = document.querySelectorAll('#evt-' + slot + '-quests-list .evt-quest-row');
    const editedQuests = Array.from(rows).map((row, i) => {
      const orig = (existing.quests || [])[i] || {};
      return {
        id:     orig.id || (existing.id + '_q_' + i + '_' + Date.now()),
        type:   row.querySelector('.eq-type')?.value   || 'capture',
        tagId:  opts.tagId,
        label:  row.querySelector('.eq-label')?.value  || '',
        target: parseInt(row.querySelector('.eq-target')?.value   || '1', 10),
        active: true,
        reward: {
          crystals: parseInt(row.querySelector('.eq-crystals')?.value || '0', 10),
          gold:     parseInt(row.querySelector('.eq-gold')?.value     || '0', 10),
          items:    orig.reward?.items || {},
        },
      };
    });

    const updated = {
      ...existing,
      tagId:          opts.tagId,
      tagLabel:       opts.tagLabel,
      customTitle:    opts.customTitle,
      startDate:      opts.startDate,
      endDate:        opts.startDate + opts.durationDays * 24 * 3600 * 1000,
      durationDays:   opts.durationDays,
      shopDiscountPct: opts.shopDiscountPct,
      invasionConfig: { energyCost: opts.invasionEnergyCost },
      defiConfig:     { energyCost: opts.defiEnergyCost },
      quests:         editedQuests.length ? editedQuests : existing.quests,
    };

    if (slot === 'current') { EventSystem.saveCurrentEvent(updated); EventSystem.activateCurrent(); }
    else EventSystem.saveNextEvent(updated);
    _notify('✅ Événement enregistré' + (slot === 'current' ? ' et actif.' : '.'));
    switchTab('event');
  }

  function _tsToDatetimeLocal(ts) {
    if (!ts) return '';
    const d = new Date(ts), pad = n => String(n).padStart(2,'0');
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function _startEventCountdownTimer(container) {
    if (_eventCountdownTimer) clearInterval(_eventCountdownTimer);
    _eventCountdownTimer = setInterval(() => {
      const now = Date.now();
      container.querySelectorAll('[data-evt-end]').forEach(el => {
        el.textContent = GameUtils.formatCountdown(parseInt(el.dataset.evtEnd, 10) - now);
      });
      container.querySelectorAll('[data-evt-start]').forEach(el => {
        el.textContent = GameUtils.formatCountdown(parseInt(el.dataset.evtStart, 10) - now);
      });
    }, 1000);
  }

  function _evtReadForm(slot) {
    const g = id => document.getElementById('evt-' + slot + '-' + id)?.value;
    const tagId   = g('tag');
    const allTags = EventSystem.getAllTags(GameState.get());
    const tagDef  = allTags.find(t => t.id === tagId);
    const startVal = g('start');
    const startTs  = startVal ? new Date(startVal).getTime() : EventSystem.nextEventStart();
    return {
      tagId,
      tagLabel:           tagDef?.label || tagId || '',
      customTitle:        g('title') || '',
      startDate:          startTs,
      durationDays:       parseInt(g('duration') || '10', 10),
      shopDiscountPct:    parseInt(g('discount')  || '20', 10),
      invasionEnergyCost: parseInt(g('inv-cost')  || '15', 10),
      defiEnergyCost:     parseInt(g('defi-cost') || '20', 10),
    };
  }

  // _bindEvtPublic reste pour compatibilité ascendante (était dans init)
  function _bindEvtPublic() {}



  // ─── API PUBLIQUE ─────────────────────────────────────────────────────────────

  return {
    init, show, hide, toggle, switchTab,
    exportSave, importSave,
    exportGameDatabase, exportPlayerData, importGameDatabase, importPlayerData,
    // Méthodes appelées depuis le HTML (onclick)
    _previewPortrait,
    _openCropEditor, _confirmCrop, _closeCropEditor,
    _saveCharacter, _editCharacter, _deleteCharacter, _clearCharForm, _upgradeCharacter,
    _saveType, _editType, _deleteType, _clearTypeForm,
    _savePassives, _resetPassivesToDefault,
    _matrixCellChanged, _saveMatrix,
    _saveEquip, _editEquip, _deleteEquip, _clearEquipForm, _duplicateEquip,
    _saveGachaConfig, _saveBanner, _editBanner, _deleteBanner, _clearBannerForm,
    _saveDropRates, _resetDropRates, _updateDropTotal,
    _resetAllEvolutions, _toggleLineCombatAvailability, _uncheckEpicPlusLines, _sortEvolutionLines,
    _addLineTag, _removeLineTag,
    _addCategory, _deleteCat, _addTag, _deleteTag,
    _pnAddBlock, _pnDeleteBlock, _pnMoveBlock, _pnUpdateBlock, _pnLoadImageFile,
    _addQuest, _deleteQuest, _toggleQuestActive, _updateQuestField, _updateQuestReward, _updateQuestRewardItem, _updateQuestCount,
    _addCharsByTagToBanner, _applyTagToBanner,
    _saveAwakening, _setAwakening,
    _savePlayerInfo, _adminAddChar, _editPlayerChar, _removePlayerChar, _resetPlayer, _clearCollection,
    _saveResources, _addResources, _saveEnergyConfig, _fillEnergy, _resetStats,
    _saveCombatConfig, _savePlayerLevelConfig, _saveAdaptiveScaling, _previewAdaptiveScaling, _saveEnemyRarityWeights, _resetEnemyRarityWeights, _updateEnemyWeightTotal, _saveEnemyXpBonus,
    _uploadAudioFile, _removeAudioFile, _saveAudioEnabled,
    _saveLoginCycle, _editLoginCycle, _clearLoginCycleForm, _deleteLoginCycle, _toggleLoginCycleActive,
    _addCycleDay, _removeCycleDay,
    _editDailyQuestReward, _saveDailyQuestReward, _toggleDailyQuestActive,
    _savePatchNotes, _clearPatchNotes,
    _saveItem, _editItem, _deleteItem, _clearItemForm, _addItemEffect, _removeItemEffect, _onItemEffectTypeChange,
    _saveShopItem, _editShopItem, _deleteShopItem, _clearShopItemForm, _toggleShopItemActive,
    _onShopCategoryChange, _onShopLimitTypeChange,
    _dragStart, _dragOver, _dragLeave, _dragEnd, _dragDropChar, _dragDropEquip, _dragDropEvoStage, _dragDropType,
    _sortCharList, _sortEquipList,
  };
})();
