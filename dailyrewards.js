/**
 * ============================================================
 * DAILYREWARDS.JS — Popup de récompense de connexion quotidienne
 *
 * Affichée automatiquement une fois par jour (première connexion), juste
 * après la sélection du compte et avant l'écran principal du jeu.
 *
 * Présente TOUS les jours du cycle (le jour courant mis en évidence), et
 * un bouton "Récompense" qui distribue le gain du jour avec une animation
 * "Validé" plein écran. L'animation se joue entièrement avant de fermer
 * la popup et de passer au cycle suivant (ou à l'écran principal s'il n'y
 * en a plus).
 *
 * Indépendant du système de modal générique (#modal) : overlay dédié,
 * pour ne jamais être recouvert ni recouvrir une autre fenêtre par erreur.
 * ============================================================
 */

'use strict';

const DailyRewardsUI = (() => {

  let _overlay = null;
  let _queue = [];      // file des cycles en attente { cycle, dayIndex }
  let _onAllDone = null;

  /**
   * Lance la séquence de popups pour tous les cycles de connexion en attente
   * de réclamation aujourd'hui. Ne fait rien (appelle directement onAllDone)
   * s'il n'y a rien à réclamer.
   * @param {Function} [onAllDone] - callback une fois toute la séquence terminée
   */
  function presentPending(onAllDone) {
    _onAllDone = onAllDone || null;
    _queue = QuestSystem.getPendingLoginCycles();
    if (_queue.length === 0) { _finish(); return; }
    _showNext();
  }

  function _finish() {
    if (_onAllDone) { const fn = _onAllDone; _onAllDone = null; fn(); }
  }

  function _showNext() {
    const next = _queue.shift();
    if (!next) { _finish(); return; }
    _injectStyles();
    _buildOverlay(next.cycle, next.dayIndex);
  }

  // ─── STYLES ───────────────────────────────────────────────────────────────────

  function _injectStyles() {
    if (document.getElementById('dlyrwd-styles')) return;
    const style = document.createElement('style');
    style.id = 'dlyrwd-styles';
    style.textContent = `

#dlyrwd-overlay{
  position:fixed; inset:0; z-index:4000;
  display:flex; align-items:center; justify-content:center;
  padding:24px; box-sizing:border-box;
  opacity:0; pointer-events:none;
  transition:opacity .3s ease;
}
#dlyrwd-overlay.dlyrwd-visible{ opacity:1; pointer-events:all; }
#dlyrwd-overlay.dlyrwd-closing{ opacity:0; }

.dlyrwd-bg{
  position:absolute; inset:0;
  background:radial-gradient(ellipse at center, rgba(6,15,8,.92) 0%, rgba(2,6,3,.98) 75%);
  backdrop-filter:blur(4px);
}

.dlyrwd-card{
  position:relative; z-index:2;
  width:100%; max-width:420px;
  background:linear-gradient(150deg, var(--surface-2), var(--surface));
  border:1px solid var(--border); border-radius:var(--radius-lg);
  padding:22px 18px 26px;
  display:flex; flex-direction:column; align-items:center; gap:14px;
  transform:scale(.85) translateY(20px); opacity:0;
  animation:dlyrwdCardIn .5s cubic-bezier(.2,1.4,.4,1) forwards .05s;
  box-shadow:0 0 60px rgba(74,222,128,.12);
}
@keyframes dlyrwdCardIn{ to{ transform:scale(1) translateY(0); opacity:1; } }

.dlyrwd-title{
  font-family:var(--font-display); font-weight:700;
  font-size:1.15rem; color:var(--accent); text-align:center; letter-spacing:.02em;
}

.dlyrwd-days{
  display:flex; flex-wrap:wrap; gap:8px; justify-content:center;
  width:100%;
}

.dlyrwd-day{
  position:relative;
  width:64px; min-height:78px;
  background:var(--surface); border:1px solid var(--border-soft);
  border-radius:var(--radius-sm);
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:4px; padding:8px 4px;
  font-family:var(--font-body);
}
.dlyrwd-day.is-claimed{ opacity:.55; border-color:var(--border-soft); }
.dlyrwd-day.is-current{
  border-color:var(--accent2); background:rgba(74,222,128,.1);
  box-shadow:0 0 0 1px var(--accent2), 0 0 18px rgba(74,222,128,.25);
}
.dlyrwd-day-label{ font-size:.62rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:.04em; }
.dlyrwd-day-icon{ font-size:1.5rem; line-height:1; }
.dlyrwd-day-amount{ font-size:.68rem; color:var(--text); font-weight:700; text-align:center; line-height:1.2; }
.dlyrwd-day-check{
  position:absolute; top:3px; right:3px; font-size:.7rem; color:var(--accent2);
}

.dlyrwd-claim-btn{
  margin-top:4px; padding:13px 38px; border-radius:999px;
  background:var(--accent2); color:#000; font-weight:700;
  font-family:var(--font-display); font-size:1rem;
  border:none; cursor:pointer; letter-spacing:.02em;
  transition:opacity .15s, transform .1s;
  width:100%;
}
.dlyrwd-claim-btn:hover{ opacity:.88; transform:translateY(-1px); }
.dlyrwd-claim-btn:disabled{ opacity:.5; cursor:default; transform:none; }

.dlyrwd-skip-btn{
  background:none; border:none; color:var(--text-faint);
  font-size:.78rem; cursor:pointer; text-decoration:underline;
  font-family:var(--font-body); padding:4px;
}

/* ── Animation "Validé" plein écran ──────────────────────────────────────── */
#dlyrwd-validated{
  position:absolute; inset:0; z-index:3;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:10px; pointer-events:none;
  opacity:0;
  background:radial-gradient(ellipse at center, rgba(8,20,10,.97) 0%, rgba(2,6,3,.99) 80%);
  border-radius:var(--radius-lg);
}
#dlyrwd-validated.dlyrwd-validated-show{
  opacity:1;
  animation:dlyrwdValidatedFade 1.7s ease forwards;
}
@keyframes dlyrwdValidatedFade{
  0%{ opacity:0; }
  12%{ opacity:1; }
  82%{ opacity:1; }
  100%{ opacity:0; }
}
.dlyrwd-validated-icon{
  font-size:3.4rem; line-height:1;
  transform:scale(.3); opacity:0;
  animation:dlyrwdCheckPop .55s cubic-bezier(.2,1.6,.4,1) forwards .15s;
}
@keyframes dlyrwdCheckPop{ to{ transform:scale(1); opacity:1; } }
.dlyrwd-validated-text{
  font-family:var(--font-display); font-weight:900;
  font-size:1.5rem; letter-spacing:.06em; text-transform:uppercase;
  background:linear-gradient(135deg, #4ade80, #22c55e, #facc15);
  -webkit-background-clip:text; background-clip:text; color:transparent;
  opacity:0;
  animation:dlyrwdTextIn .4s ease forwards .3s;
}
@keyframes dlyrwdTextIn{ to{ opacity:1; } }
.dlyrwd-validated-reward{
  font-size:.95rem; color:var(--text); font-weight:600;
  opacity:0;
  animation:dlyrwdTextIn .4s ease forwards .45s;
}
`;
    document.head.appendChild(style);
  }

  // ─── CONSTRUCTION ─────────────────────────────────────────────────────────────

  function _rewardIcon(reward) {
    if (reward.items && Object.keys(reward.items).length > 0) {
      const firstItemId = Object.keys(reward.items)[0];
      const itemDef = GameState.getItemDefs().find(i => i.id === firstItemId);
      return itemDef?.icon || '🎁';
    }
    if (reward.crystals) return '💎';
    if (reward.gold) return '🪙';
    return '🎁';
  }

  function _rewardAmountText(reward) {
    const parts = [];
    if (reward.crystals) parts.push(`${reward.crystals} 💎`);
    if (reward.gold) parts.push(`${reward.gold} 🪙`);
    if (reward.items) {
      Object.entries(reward.items).forEach(([itemId, qty]) => {
        if (!qty) return;
        const itemDef = GameState.getItemDefs().find(i => i.id === itemId);
        parts.push(`${qty} ${itemDef?.icon || ''} ${itemDef?.name || itemId}`.trim());
      });
    }
    return parts.join('<br>') || '—';
  }

  function _buildOverlay(cycle, currentDayIndex) {
    document.getElementById('dlyrwd-overlay')?.remove();

    _overlay = document.createElement('div');
    _overlay.id = 'dlyrwd-overlay';
    _overlay.innerHTML = `
      <div class="dlyrwd-bg"></div>
      <div class="dlyrwd-card" id="dlyrwd-card">
        <div class="dlyrwd-title">🎁 ${GameUtils.escapeHtml(cycle.name)}</div>
        <div class="dlyrwd-days">
          ${cycle.days.map((day, i) => {
            const claimed = i < currentDayIndex;
            const current = i === currentDayIndex;
            return `
            <div class="dlyrwd-day ${claimed ? 'is-claimed' : ''} ${current ? 'is-current' : ''}">
              ${claimed ? '<span class="dlyrwd-day-check">✓</span>' : ''}
              <span class="dlyrwd-day-label">Jour ${i + 1}</span>
              <span class="dlyrwd-day-icon">${_rewardIcon(day.reward)}</span>
              <span class="dlyrwd-day-amount">${_rewardAmountText(day.reward)}</span>
            </div>`;
          }).join('')}
        </div>
        <button class="dlyrwd-claim-btn" id="dlyrwd-claim-btn">🎁 Récompense</button>
        <button class="dlyrwd-skip-btn" id="dlyrwd-skip-btn">Plus tard</button>
        <div id="dlyrwd-validated"></div>
      </div>
    `;
    document.body.appendChild(_overlay);

    requestAnimationFrame(() => _overlay.classList.add('dlyrwd-visible'));

    document.getElementById('dlyrwd-claim-btn')?.addEventListener('click', () => _claim(cycle.id));
    document.getElementById('dlyrwd-skip-btn')?.addEventListener('click', _skip);
  }

  function _claim(cycleId) {
    const btn = document.getElementById('dlyrwd-claim-btn');
    const skipBtn = document.getElementById('dlyrwd-skip-btn');
    if (btn) btn.disabled = true;
    if (skipBtn) skipBtn.style.display = 'none';

    const res = QuestSystem.claimLoginReward(cycleId);
    if (!res.success) { _close(); return; }

    if (typeof AudioSystem !== 'undefined') AudioSystem.playSfx(AudioSystem.SFX_KEYS.levelUp);
    _playValidatedAnimation(res.reward);
  }

  /**
   * Joue l'animation "Validé" plein écran. Elle DOIT se jouer entièrement
   * (durée fixe ci-dessous, alignée sur l'animation CSS dlyrwdValidatedFade)
   * avant que la popup ne se ferme et passe à la suite — jamais interrompue.
   */
  const VALIDATED_ANIM_DURATION = 1700; // ms — doit correspondre à dlyrwdValidatedFade

  function _playValidatedAnimation(reward) {
    const host = document.getElementById('dlyrwd-validated');
    if (!host) { _close(); return; }
    host.innerHTML = `
      <div class="dlyrwd-validated-icon">✅</div>
      <div class="dlyrwd-validated-text">Validé !</div>
      <div class="dlyrwd-validated-reward">${_rewardAmountText(reward)}</div>
    `;
    host.classList.add('dlyrwd-validated-show');
    setTimeout(_close, VALIDATED_ANIM_DURATION);
  }

  function _skip() {
    _close();
  }

  function _close() {
    if (!_overlay) { _showNext(); return; }
    const ov = _overlay;
    _overlay = null;
    ov.classList.remove('dlyrwd-visible');
    ov.classList.add('dlyrwd-closing');
    setTimeout(() => {
      ov.remove();
      _showNext(); // popup suivante de la file, ou _finish() s'il n'y en a plus
    }, 320);
  }

  return { presentPending };
})();
