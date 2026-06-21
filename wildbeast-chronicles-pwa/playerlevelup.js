/**
 * ============================================================
 * PLAYERLEVELUP.JS — Animation plein écran de montée de niveau JOUEUR
 *
 * Déclenchée par l'événement 'playerLevelUp' émis par GameState.
 * Distincte de l'animation d'évolution de créature (evolution.js) :
 * ici il n'y a pas de portrait, mais le nom du dresseur, le nouveau
 * niveau, et le gain d'énergie maximale + sa régénération complète.
 * ============================================================
 */

'use strict';

const PlayerLevelUpAnimator = (() => {

  let _overlay = null;
  let _resolve = null;

  const PARTICLE_COUNT = 50;

  /**
   * Lance l'animation plein écran de level up joueur.
   * @param {object} data - { levelUps, newLevel, energyGained, newEnergyMax, playerName }
   * @returns {Promise<void>} Résolue à la fermeture de l'animation
   */
  function play(data) {
    return new Promise(resolve => {
      _resolve = resolve;
      _injectStyles();
      _buildOverlay(data);
      _runSequence();
    });
  }

  // ─── STYLES INJECTÉS ─────────────────────────────────────────────────────────

  function _injectStyles() {
    if (document.getElementById('plvl-styles')) return;
    const style = document.createElement('style');
    style.id = 'plvl-styles';
    style.textContent = `

#plvl-overlay{
  position:fixed; inset:0; z-index:3000;
  display:flex; align-items:center; justify-content:center;
  opacity:0; pointer-events:none;
  transition:opacity .35s ease;
}
#plvl-overlay.plvl-visible{ opacity:1; pointer-events:all; }
#plvl-overlay.plvl-closing{ opacity:0; }

.plvl-bg{
  position:absolute; inset:0;
  background:radial-gradient(ellipse at center, rgba(6,15,8,.92) 0%, rgba(2,6,3,.98) 75%);
  backdrop-filter:blur(4px);
}

#plvl-canvas{ position:absolute; inset:0; pointer-events:none; }

.plvl-stage{
  position:relative; z-index:2;
  display:flex; flex-direction:column; align-items:center; gap:10px;
  padding:32px 28px; max-width:420px; width:90vw;
  text-align:center;
  transform:scale(.85) translateY(20px);
  opacity:0;
  animation:plvlStageIn .55s cubic-bezier(.2,1.4,.4,1) forwards .1s;
}
@keyframes plvlStageIn{ to{ transform:scale(1) translateY(0); opacity:1; } }

.plvl-halo{
  position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
  width:340px; height:340px; border-radius:50%;
  background:radial-gradient(circle, rgba(74,222,128,.35) 0%, transparent 70%);
  filter:blur(8px);
  animation:plvlHaloPulse 1.8s ease-in-out infinite;
  z-index:-1;
}
@keyframes plvlHaloPulse{
  0%,100%{ transform:translate(-50%,-50%) scale(1); opacity:.7; }
  50%{ transform:translate(-50%,-50%) scale(1.15); opacity:1; }
}

.plvl-name{
  font-family:var(--font-display); font-weight:700;
  font-size:1.05rem; color:var(--text-dim); letter-spacing:.04em;
  text-transform:uppercase;
}

.plvl-badge{
  margin:6px 0;
}
.plvl-badge-label{
  font-family:var(--font-display); font-weight:900;
  font-size:clamp(2.2rem,9vw,3.4rem);
  background:linear-gradient(135deg, #4ade80, #22c55e, #facc15);
  -webkit-background-clip:text; background-clip:text; color:transparent;
  letter-spacing:.02em;
  text-shadow:0 0 40px rgba(74,222,128,.4);
  animation:plvlBadgePulse 1.2s ease-in-out infinite;
}
@keyframes plvlBadgePulse{
  0%,100%{ filter:brightness(1); }
  50%{ filter:brightness(1.3); }
}

.plvl-level{
  font-family:var(--font-display); font-weight:700;
  font-size:1.3rem; color:var(--text);
  margin-bottom:8px;
}
.plvl-level strong{ color:#4ade80; font-size:1.5rem; }

.plvl-energy{
  background:var(--surface-2); border:1px solid var(--border);
  border-radius:var(--radius); padding:14px 18px;
  width:100%; box-sizing:border-box;
  display:flex; flex-direction:column; gap:6px;
  margin:6px 0 10px;
}
.plvl-energy-line{
  font-size:.92rem; color:var(--text);
}
.plvl-energy-line strong{ color:#facc15; }
.plvl-energy-regen{ color:#4ade80; font-weight:600; }
.plvl-energy-regen strong{ color:#4ade80; }

.plvl-close-btn{
  margin-top:6px; padding:11px 32px; border-radius:999px;
  background:var(--accent2); color:#000; font-weight:700;
  font-family:var(--font-display); font-size:.95rem;
  border:none; cursor:pointer; letter-spacing:.02em;
  transition:opacity .15s, transform .1s;
}
.plvl-close-btn:hover{ opacity:.85; transform:translateY(-1px); }
`;
    document.head.appendChild(style);
  }

  function _buildOverlay(data) {
    document.getElementById('plvl-overlay')?.remove();

    const { newLevel, energyGained, newEnergyMax, playerName } = data;

    _overlay = document.createElement('div');
    _overlay.id = 'plvl-overlay';
    _overlay.innerHTML = `
      <div class="plvl-bg"></div>
      <canvas id="plvl-canvas"></canvas>

      <div class="plvl-stage" id="plvl-stage">
        <div class="plvl-halo"></div>

        <div class="plvl-name" id="plvl-name">${_escapeHtml(playerName || 'Dresseur')}</div>
        <div class="plvl-badge" id="plvl-badge">
          <span class="plvl-badge-label">LVL UP !</span>
        </div>
        <div class="plvl-level" id="plvl-level">Niveau <strong>${newLevel}</strong></div>

        <div class="plvl-energy" id="plvl-energy">
          <div class="plvl-energy-line">⚡ Énergie maximale <strong>+${energyGained}</strong></div>
          <div class="plvl-energy-line plvl-energy-regen">🔋 Énergie entièrement régénérée (${newEnergyMax}/${newEnergyMax})</div>
        </div>

        <button class="plvl-close-btn" id="plvl-close-btn">Continuer</button>
      </div>
    `;
    document.body.appendChild(_overlay);

    document.getElementById('plvl-close-btn').addEventListener('click', _close);
    AudioSystem.playSfx(AudioSystem.SFX_KEYS.levelUp);

    _spawnParticles();
  }

  function _runSequence() {
    requestAnimationFrame(() => {
      _overlay.classList.add('plvl-visible');
    });
  }

  function _spawnParticles() {
    const canvas = document.getElementById('plvl-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    const particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        angle: Math.random() * Math.PI * 2,
        speed: 2 + Math.random() * 6,
        size: 2 + Math.random() * 4,
        life: 1,
        decay: 0.005 + Math.random() * 0.012,
        hue: 130 + Math.random() * 40, // teintes vertes (thème WildBeast)
      });
    }

    let running = true;
    function tick() {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += Math.cos(p.angle) * p.speed;
        p.y += Math.sin(p.angle) * p.speed;
        p.life -= p.decay;
        if (p.life <= 0) return;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = `hsl(${p.hue}, 90%, 65%)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      if (particles.some(p => p.life > 0)) {
        requestAnimationFrame(tick);
      }
    }
    tick();

    // Nettoyage à la fermeture
    _overlay._stopParticles = () => {
      running = false;
      window.removeEventListener('resize', resize);
    };
  }

  function _close() {
    if (!_overlay) { _resolve?.(); return; }
    _overlay._stopParticles?.();
    _overlay.classList.remove('plvl-visible');
    _overlay.classList.add('plvl-closing');
    setTimeout(() => {
      _overlay?.remove();
      _overlay = null;
      const r = _resolve;
      _resolve = null;
      r?.();
    }, 350);
  }

  function _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { play };
})();
