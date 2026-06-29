/**
 * ============================================================
 * UTILS.JS — Utilitaires partagés entre tous les modules
 *
 * Ce fichier doit être chargé EN PREMIER, avant tout autre
 * module du jeu. Il expose l'objet global `GameUtils` contenant
 * des fonctions pures réutilisables qui étaient auparavant
 * dupliquées dans plusieurs fichiers.
 *
 * Règle : aucune fonction ici ne doit dépendre de GameState,
 * GameDatabase, ni d'aucun autre module du jeu. Ce sont des
 * fonctions pures, indépendantes et testables isolément.
 * ============================================================
 */

'use strict';

const GameUtils = (() => {

  // ─── SÉCURITÉ HTML ────────────────────────────────────────────────────────────

  /**
   * Échappe les caractères HTML spéciaux d'une chaîne de texte.
   * Protège contre les injections XSS lorsqu'on insère du contenu
   * venant du joueur (nom de compte, surnoms...) dans du HTML.
   *
   * Gère null et undefined : retourne une chaîne vide dans ce cas.
   *
   * Était dupliquée dans : ui.js, playerlevelup.js, dailyrewards.js
   *
   * @param {string|null|undefined} str
   * @returns {string}
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  // ─── DATES ───────────────────────────────────────────────────────────────────

  /**
   * Retourne la date calendaire locale du jour au format 'YYYY-MM-DD'.
   * Utilisé comme clé de suivi pour les quêtes quotidiennes et les
   * limites d'achat quotidiennes de la boutique.
   *
   * Était dupliquée dans : quests.js, shop.js
   *
   * @returns {string} Ex. : '2025-06-15'
   */
  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * Formate un horodatage (timestamp ms) en chaîne lisible.
   * Format : 'JJ/MM/YYYY à HHhMM'
   *
   * @param {number|null} ts - Timestamp en millisecondes
   * @returns {string}
   */
  function formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    const dd  = String(d.getDate()).padStart(2, '0');
    const mm  = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh  = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} à ${hh}h${min}`;
  }

  /**
   * Formate une durée en millisecondes en compte à rebours lisible.
   * Format : 'Xj Xh Xm Xs' (les unités vides sont omises, sauf les secondes).
   *
   * @param {number} ms - Durée en millisecondes
   * @returns {string}
   */
  function formatCountdown(ms) {
    if (ms <= 0) return '0s';
    const totalSec = Math.floor(ms / 1000);
    const totalMin = Math.floor(totalSec / 60);
    const totalHrs = Math.floor(totalMin / 60);
    const days = Math.floor(totalHrs / 24);
    const secs = totalSec % 60;
    const mins = totalMin % 60;
    const hrs  = totalHrs % 24;
    const parts = [];
    if (days > 0) parts.push(`${days}j`);
    if (hrs  > 0) parts.push(`${hrs}h`);
    if (mins > 0) parts.push(`${mins}m`);
    parts.push(`${secs}s`);
    return parts.join(' ');
  }

  /**
   * Retourne un horodatage compact pour les noms de fichiers exportés.
   * Format : 'YYYY-MM-DD_HHhMM' (compatible avec les noms de fichiers Windows/Mac/Linux)
   *
   * @returns {string} Ex. : '2025-06-15_14h30'
   */
  function dateStamp() {
    return new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', 'h');
  }

  // ─── API PUBLIQUE ─────────────────────────────────────────────────────────────

  return {
    escapeHtml,
    todayKey,
    formatDate,
    formatCountdown,
    dateStamp,
  };

})();
