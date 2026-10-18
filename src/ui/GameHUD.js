/**
 * GameHUD.js
 * 
 * In-game HUD overlay matching post-apocalyptic dark & amber #E8A33D design:
 * - Top-Left: Health bar (red 100) & Stamina bar (amber live)
 * - Top-Center: Compass strip (N/E/S/W & degrees updating with camera yaw)
 * - Top-Right: Round 96px 2D Minimap (rotates with camera, player arrow, buildings, road, 80m radius) + Pause button
 * - Center: Small crosshair dot
 * - Hidden telemetry overlay with pause menu toggle
 * - Pause Menu: Resume, Sensitivity slider (0.05-0.30), Quality tier (Low/Medium/High), Telemetry toggle, Back to Menu
 * - Dynamic toast notifications
 */

export class GameHUD {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.onPauseToggle = options.onPauseToggle || (() => {});
    this.onResume = options.onResume || (() => {});
    this.onSensitivityChange = options.onSensitivityChange || (() => {});
    this.onQualityChange = options.onQualityChange || (() => {});
    this.onBackToMenu = options.onBackToMenu || (() => {});
    this.onBrightnessChange = options.onBrightnessChange || (() => {});
    this.onCameraModeToggle = options.onCameraModeToggle || (() => {});
    this.onInvertToggle = options.onInvertToggle || (() => {});
    this.onZoom = options.onZoom || (() => {});

    this.isPaused = false;
    this.showTelemetry = false;
    this.sensitivity = options.sensitivity || 0.12;
    this.quality = options.quality || 'medium';

    let storedBrightness = null;
    try {
      const saved = localStorage.getItem('game_brightness');
      if (saved !== null) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 2.5) {
          storedBrightness = parsed;
        }
      }
    } catch (e) {}

    this.brightness = storedBrightness !== null ? storedBrightness : (options.brightness !== undefined ? options.brightness : 1.25);
    this.cameraMode = options.cameraMode || 'shoulder';
    this.invertJoystick = false;

    this.initDOM();
  }

  initDOM() {
    this.injectStyles();

    // Main HUD Container
    this.root = document.createElement('div');
    this.root.id = 'game-hud-root';
    this.root.className = 'game-hud-container';

    // 1. Center Crosshair Dot
    this.crosshair = document.createElement('div');
    this.crosshair.className = 'hud-crosshair';
    this.root.appendChild(this.crosshair);

    // 2. Top-Left: Vitals (Health & Stamina)
    this.vitals = document.createElement('div');
    this.vitals.className = 'hud-vitals';
    this.vitals.innerHTML = `
      <div class="vital-row">
        <span class="vital-label">HP</span>
        <div class="vital-bar-track">
          <div id="vital-hp-bar" class="vital-bar hp" style="width: 100%;"></div>
        </div>
      </div>
      <div class="vital-row">
        <span class="vital-label">STA</span>
        <div class="vital-bar-track">
          <div id="vital-sta-bar" class="vital-bar sta" style="width: 100%;"></div>
        </div>
      </div>
    `;
    this.root.appendChild(this.vitals);

    this.hpBar = this.vitals.querySelector('#vital-hp-bar');
    this.staBar = this.vitals.querySelector('#vital-sta-bar');

    // 3. Top-Center: Compass Strip
    this.compass = document.createElement('div');
    this.compass.className = 'hud-compass';
    this.compass.innerHTML = `
      <div class="compass-pointer">▼</div>
      <div id="compass-text" class="compass-text">N 000°</div>
    `;
    this.root.appendChild(this.compass);
    this.compassText = this.compass.querySelector('#compass-text');

    // 4. Top-Right: Minimap & Pause Button
    this.topRight = document.createElement('div');
    this.topRight.className = 'hud-top-right';

    // 96px Round Minimap Canvas
    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.className = 'hud-minimap';
    this.minimapCanvas.width = 96;
    this.minimapCanvas.height = 96;
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.topRight.appendChild(this.minimapCanvas);

    // Small [+] [-] Zoom Buttons near Minimap
    this.zoomGroup = document.createElement('div');
    this.zoomGroup.className = 'hud-zoom-group';

    this.zoomInBtn = document.createElement('button');
    this.zoomInBtn.type = 'button';
    this.zoomInBtn.className = 'hud-zoom-btn hud-zoom-in';
    this.zoomInBtn.textContent = '+';
    this.zoomInBtn.title = 'Zoom In';
    this.zoomInBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onZoom(-0.5);
    });

    this.zoomOutBtn = document.createElement('button');
    this.zoomOutBtn.type = 'button';
    this.zoomOutBtn.className = 'hud-zoom-btn hud-zoom-out';
    this.zoomOutBtn.textContent = '−';
    this.zoomOutBtn.title = 'Zoom Out';
    this.zoomOutBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onZoom(0.5);
    });

    this.zoomGroup.appendChild(this.zoomInBtn);
    this.zoomGroup.appendChild(this.zoomOutBtn);
    this.topRight.appendChild(this.zoomGroup);

    // Quick Camera Mode Toggle Button (OVERHEAD button)
    this.camToggleBtn = document.createElement('button');
    this.camToggleBtn.type = 'button';
    this.camToggleBtn.className = 'hud-quick-btn hud-cam-btn';
    this.camToggleBtn.textContent = this.cameraMode === 'overhead' ? '🎥 SHOULDER' : '🎥 OVERHEAD';
    this.camToggleBtn.title = 'Toggle Camera View';
    this.camToggleBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.toggleCameraMode();
    });
    this.topRight.appendChild(this.camToggleBtn);

    // Quick Brightness Button
    this.brightBtn = document.createElement('button');
    this.brightBtn.type = 'button';
    this.brightBtn.className = 'hud-quick-btn hud-bright-btn';
    this.brightBtn.textContent = `☀️ ${(this.brightness * 100).toFixed(0)}%`;
    this.brightBtn.title = 'Cycle Scene Brightness';
    this.brightBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.cycleBrightness();
    });
    this.topRight.appendChild(this.brightBtn);

    // Pause Button
    this.pauseBtn = document.createElement('button');
    this.pauseBtn.type = 'button';
    this.pauseBtn.className = 'hud-pause-btn';
    this.pauseBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <rect x="6" y="4" width="4" height="16"/>
        <rect x="14" y="4" width="4" height="16"/>
      </svg>
    `;
    this.pauseBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.togglePause();
    });
    this.topRight.appendChild(this.pauseBtn);

    this.root.appendChild(this.topRight);

    // 5. In-Game Telemetry (Hidden by default)
    this.telemetry = document.createElement('div');
    this.telemetry.className = 'hud-in-game-telemetry';
    this.telemetry.style.display = 'none';
    this.telemetry.innerHTML = `
      <div><span class="tel-label">FPS:</span> <span id="gtel-fps" class="tel-val">60</span></div>
      <div><span class="tel-label">FT:</span> <span id="gtel-ft" class="tel-val">16.6ms</span></div>
      <div><span class="tel-label">DRAWS:</span> <span id="gtel-draws" class="tel-val">0</span></div>
      <div><span class="tel-label">TRIS:</span> <span id="gtel-tris" class="tel-val">0</span></div>
    `;
    this.root.appendChild(this.telemetry);
    this.telFps = this.telemetry.querySelector('#gtel-fps');
    this.telFt = this.telemetry.querySelector('#gtel-ft');
    this.telDraws = this.telemetry.querySelector('#gtel-draws');
    this.telTris = this.telemetry.querySelector('#gtel-tris');

    // 6. Toast Notification Container
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'hud-toast';
    this.root.appendChild(this.toastEl);

    // 7. Pause Modal Menu
    this.pauseModal = document.createElement('div');
    this.pauseModal.className = 'hud-pause-modal';
    this.pauseModal.style.display = 'none';
    this.pauseModal.innerHTML = `
      <div class="pause-box">
        <div class="pause-title">PAUSED</div>
        <div class="pause-item">
          <label>SCENE BRIGHTNESS: <span id="bright-val">${(this.brightness * 100).toFixed(0)}%</span></label>
          <input id="bright-slider" type="range" min="0.60" max="2.40" step="0.05" value="${this.brightness}">
        </div>
        <div class="pause-item">
          <label>CAMERA VIEW:</label>
          <div class="quality-btn-group" id="cam-btn-group">
            <button type="button" class="q-btn cam-btn ${this.cameraMode === 'overhead' ? 'active' : ''}" data-mode="overhead">OVERHEAD</button>
            <button type="button" class="q-btn cam-btn ${this.cameraMode === 'shoulder' ? 'active' : ''}" data-mode="shoulder">SHOULDER</button>
          </div>
        </div>
        <div class="pause-item">
          <label>INVERT JOYSTICK:</label>
          <div class="quality-btn-group" id="inv-btn-group">
            <button type="button" class="q-btn inv-btn ${!this.invertJoystick ? 'active' : ''}" data-inv="normal">NORMAL</button>
            <button type="button" class="q-btn inv-btn ${this.invertJoystick ? 'active' : ''}" data-inv="inverted">INVERTED</button>
          </div>
        </div>
        <div class="pause-item">
          <label>LOOK SENSITIVITY: <span id="sens-val">${this.sensitivity.toFixed(2)}</span></label>
          <input id="sens-slider" type="range" min="0.05" max="0.30" step="0.01" value="${this.sensitivity}">
        </div>
        <div class="pause-item">
          <label>GRAPHICS QUALITY:</label>
          <div class="quality-btn-group">
            <button type="button" class="q-btn ${this.quality === 'low' ? 'active' : ''}" data-q="low">LOW</button>
            <button type="button" class="q-btn ${this.quality === 'medium' ? 'active' : ''}" data-q="medium">MEDIUM</button>
            <button type="button" class="q-btn ${this.quality === 'high' ? 'active' : ''}" data-q="high">HIGH</button>
          </div>
        </div>
        <div class="pause-item row">
          <label for="tel-check">SHOW TELEMETRY</label>
          <input type="checkbox" id="tel-check" ${this.showTelemetry ? 'checked' : ''}>
        </div>
        <div class="pause-actions">
          <button type="button" id="pause-resume-btn" class="pause-action-btn primary">RESUME</button>
          <button type="button" id="pause-menu-btn" class="pause-action-btn secondary">BACK TO MENU</button>
        </div>
      </div>
    `;
    this.pauseModal.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.appendChild(this.pauseModal);

    this.bindPauseEvents();
    this.container.appendChild(this.root);
  }

  injectStyles() {
    if (document.getElementById('game-hud-css')) return;
    const style = document.createElement('style');
    style.id = 'game-hud-css';
    style.textContent = `
      .game-hud-container {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 90;
        font-family: monospace;
        color: #e8a33d;
      }
      .hud-crosshair {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 4px;
        height: 4px;
        margin-left: -2px;
        margin-top: -2px;
        background: #e8a33d;
        border-radius: 50%;
        box-shadow: 0 0 4px #e8a33d;
        opacity: 0.85;
      }
      .hud-vitals {
        position: absolute;
        top: max(12px, env(safe-area-inset-top));
        left: max(16px, env(safe-area-inset-left));
        display: flex;
        flex-direction: column;
        gap: 6px;
        background: rgba(14, 16, 20, 0.65);
        padding: 6px 10px;
        border-radius: 6px;
        border: 1px solid rgba(232, 163, 61, 0.3);
        pointer-events: none;
      }
      .vital-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .vital-label {
        font-size: 11px;
        font-weight: bold;
        width: 26px;
      }
      .vital-bar-track {
        width: 110px;
        height: 8px;
        background: rgba(0, 0, 0, 0.5);
        border-radius: 3px;
        overflow: hidden;
      }
      .vital-bar {
        height: 100%;
        transition: width 0.08s ease;
      }
      .vital-bar.hp {
        background: #e84118;
      }
      .vital-bar.sta {
        background: #e8a33d;
      }
      .hud-compass {
        position: absolute;
        top: max(12px, env(safe-area-inset-top));
        left: 50%;
        transform: translateX(-50%);
        background: rgba(14, 16, 20, 0.7);
        border: 1px solid rgba(232, 163, 61, 0.35);
        padding: 4px 14px;
        border-radius: 12px;
        font-size: 13px;
        font-weight: bold;
        letter-spacing: 1px;
        display: flex;
        align-items: center;
        gap: 6px;
        pointer-events: none;
      }
      .compass-pointer {
        color: #e8a33d;
        font-size: 10px;
      }
      .hud-top-right {
        position: absolute;
        top: max(12px, env(safe-area-inset-top));
        right: max(16px, env(safe-area-inset-right));
        display: flex;
        align-items: flex-start;
        gap: 12px;
        pointer-events: auto;
      }
      .hud-minimap {
        width: 96px;
        height: 96px;
        border-radius: 50%;
        border: 2px solid rgba(232, 163, 61, 0.5);
        background: rgba(14, 16, 20, 0.75);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
      }
      .hud-zoom-group {
        display: flex;
        flex-direction: column;
        gap: 5px;
        justify-content: center;
      }
      .hud-zoom-btn {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        background: rgba(14, 16, 20, 0.78);
        border: 1px solid rgba(232, 163, 61, 0.5);
        color: #e8a33d;
        font-family: monospace;
        font-size: 16px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        user-select: none;
        touch-action: none;
      }
      .hud-zoom-btn:active {
        background: rgba(232, 163, 61, 0.35);
        transform: scale(0.92);
      }
      .hud-pause-btn {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        background: rgba(14, 16, 20, 0.75);
        border: 1px solid rgba(232, 163, 61, 0.5);
        color: #e8a33d;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        touch-action: none;
      }
      .hud-pause-btn:active {
        background: rgba(232, 163, 61, 0.3);
      }
      .hud-quick-btn {
        height: 38px;
        padding: 0 10px;
        border-radius: 8px;
        background: rgba(14, 16, 20, 0.78);
        border: 1px solid rgba(232, 163, 61, 0.5);
        color: #e8a33d;
        font-family: monospace;
        font-size: 11px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        white-space: nowrap;
        user-select: none;
        touch-action: none;
      }
      .hud-quick-btn:active {
        background: rgba(232, 163, 61, 0.35);
        transform: scale(0.96);
      }
      .hud-in-game-telemetry {
        position: absolute;
        bottom: max(12px, env(safe-area-inset-bottom));
        left: max(16px, env(safe-area-inset-left));
        background: rgba(14, 16, 20, 0.75);
        border: 1px solid rgba(232, 163, 61, 0.3);
        padding: 6px 10px;
        border-radius: 6px;
        font-size: 11px;
        display: flex;
        gap: 12px;
        pointer-events: none;
      }
      .hud-toast {
        position: absolute;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(24, 28, 36, 0.92);
        border: 1px solid #e8a33d;
        color: #e8a33d;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 13px;
        box-shadow: 0 4px 14px rgba(0,0,0,0.7);
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
      }
      .hud-pause-modal {
        position: fixed;
        inset: 0;
        background: rgba(10, 12, 16, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        z-index: 200;
      }
      .pause-box {
        background: #14171d;
        border: 2px solid #e8a33d;
        border-radius: 10px;
        width: 320px;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.8);
      }
      .pause-title {
        font-size: 18px;
        font-weight: bold;
        text-align: center;
        letter-spacing: 2px;
        color: #e8a33d;
        border-bottom: 1px solid rgba(232, 163, 61, 0.3);
        padding-bottom: 8px;
      }
      .pause-item {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
      }
      .pause-item.row {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }
      .quality-btn-group {
        display: flex;
        gap: 6px;
      }
      .q-btn {
        flex: 1;
        padding: 6px 0;
        font-family: monospace;
        font-size: 11px;
        background: rgba(232, 163, 61, 0.1);
        border: 1px solid rgba(232, 163, 61, 0.4);
        color: #e8a33d;
        border-radius: 4px;
        cursor: pointer;
      }
      .q-btn.active {
        background: #e8a33d;
        color: #0c0e12;
        font-weight: bold;
      }
      .pause-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 8px;
      }
      .pause-action-btn {
        padding: 10px;
        font-family: monospace;
        font-size: 13px;
        font-weight: bold;
        border-radius: 6px;
        cursor: pointer;
        letter-spacing: 1px;
      }
      .pause-action-btn.primary {
        background: #e8a33d;
        color: #0c0e12;
        border: none;
      }
      .pause-action-btn.secondary {
        background: transparent;
        color: #e8a33d;
        border: 1px solid rgba(232, 163, 61, 0.5);
      }
    `;
    document.head.appendChild(style);
  }

  bindPauseEvents() {
    const brightSlider = this.pauseModal.querySelector('#bright-slider');
    const brightVal = this.pauseModal.querySelector('#bright-val');
    if (brightSlider) {
      brightSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.setBrightness(val);
      });
    }

    const camBtns = this.pauseModal.querySelectorAll('.cam-btn');
    camBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        this.setCameraMode(mode);
      });
    });

    const invBtns = this.pauseModal.querySelectorAll('.inv-btn');
    invBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        invBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.invertJoystick = (btn.getAttribute('data-inv') === 'inverted');
        this.onInvertToggle(this.invertJoystick, this.invertJoystick);
        this.showToast(`Joystick: ${this.invertJoystick ? 'INVERTED' : 'NORMAL'}`);
      });
    });

    const slider = this.pauseModal.querySelector('#sens-slider');
    const sensVal = this.pauseModal.querySelector('#sens-val');
    if (slider) {
      slider.addEventListener('input', (e) => {
        this.sensitivity = parseFloat(e.target.value);
        if (sensVal) sensVal.textContent = this.sensitivity.toFixed(2);
        this.onSensitivityChange(this.sensitivity);
      });
    }

    const qBtns = this.pauseModal.querySelectorAll('.q-btn');
    if (qBtns) {
      qBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          qBtns.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          this.quality = btn.getAttribute('data-q');
          this.onQualityChange(this.quality);
        });
      });
    }

    const telCheck = this.pauseModal.querySelector('#tel-check');
    if (telCheck) {
      telCheck.addEventListener('change', (e) => {
        this.showTelemetry = e.target.checked;
        if (this.telemetry) this.telemetry.style.display = this.showTelemetry ? 'flex' : 'none';
      });
    }

    const resumeBtn = this.pauseModal.querySelector('#pause-resume-btn');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        this.setPaused(false);
        this.onResume();
      });
    }

    const menuBtn = this.pauseModal.querySelector('#pause-menu-btn');
    if (menuBtn) {
      menuBtn.addEventListener('click', () => {
        this.setPaused(false);
        this.onBackToMenu();
      });
    }
  }

  toggleCameraMode() {
    this.cameraMode = (this.cameraMode === 'overhead' ? 'shoulder' : 'overhead');
    if (this.camToggleBtn) {
      this.camToggleBtn.textContent = this.cameraMode === 'overhead' ? '🎥 SHOULDER' : '🎥 OVERHEAD';
    }
    const camBtns = this.pauseModal.querySelectorAll('.cam-btn');
    camBtns.forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-mode') === this.cameraMode);
    });
    this.onCameraModeToggle(this.cameraMode);
    this.showToast(`Camera: ${this.cameraMode.toUpperCase()}`);
  }

  setCameraMode(mode) {
    this.cameraMode = mode;
    if (this.camToggleBtn) {
      this.camToggleBtn.textContent = this.cameraMode === 'overhead' ? '🎥 SHOULDER' : '🎥 OVERHEAD';
    }
    const camBtns = this.pauseModal.querySelectorAll('.cam-btn');
    camBtns.forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-mode') === this.cameraMode);
    });
    this.onCameraModeToggle(this.cameraMode);
  }

  cycleBrightness() {
    const steps = [0.75, 1.0, 1.25, 1.5];
    let nextIdx = 0;
    for (let i = 0; i < steps.length; i++) {
      if (Math.abs(this.brightness - steps[i]) < 0.08) {
        nextIdx = (i + 1) % steps.length;
        break;
      }
    }
    this.setBrightness(steps[nextIdx]);
    this.showToast(`Brightness: ${(this.brightness * 100).toFixed(0)}%`);
  }

  setBrightness(factor) {
    this.brightness = Math.max(0.5, Math.min(2.5, factor));
    try {
      localStorage.setItem('game_brightness', this.brightness.toString());
    } catch (e) {
      // localStorage may fail in some sandboxed/node environments
    }

    if (this.brightBtn) {
      this.brightBtn.textContent = `☀️ ${(this.brightness * 100).toFixed(0)}%`;
    }
    const brightSlider = this.pauseModal ? this.pauseModal.querySelector('#bright-slider') : null;
    const brightVal = this.pauseModal ? this.pauseModal.querySelector('#bright-val') : null;
    if (brightSlider) brightSlider.value = this.brightness;
    if (brightVal) brightVal.textContent = `${(this.brightness * 100).toFixed(0)}%`;
    this.onBrightnessChange(this.brightness);
  }

  togglePause() {
    this.setPaused(!this.isPaused);
    this.onPauseToggle(this.isPaused);
  }

  setPaused(paused) {
    this.isPaused = Boolean(paused);
    this.pauseModal.style.display = this.isPaused ? 'flex' : 'none';
  }

  setQuality(tier) {
    this.quality = tier;
    const qBtns = this.pauseModal.querySelectorAll('.q-btn');
    qBtns.forEach((b) => {
      if (b.getAttribute('data-q') === tier) b.classList.add('active');
      else b.classList.remove('active');
    });
  }

  showToast(message, durationMs = 2500) {
    this.toastEl.textContent = message;
    this.toastEl.style.opacity = '1';
    if (this._toastTimeout) clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      this.toastEl.style.opacity = '0';
    }, durationMs);
  }

  /**
   * Updates HUD telemetry displays
   */
  updateTelemetry(stats = {}) {
    if (!this.showTelemetry) return;
    if (stats.fps !== undefined) this.telFps.textContent = Math.round(stats.fps);
    if (stats.frameTimeMs !== undefined) this.telFt.textContent = `${stats.frameTimeMs.toFixed(1)}ms`;
    if (stats.drawCalls !== undefined) this.telDraws.textContent = stats.drawCalls;
    if (stats.triangles !== undefined) this.telTris.textContent = stats.triangles;
  }

  /**
   * Updates Stamina bar
   */
  setStamina(stamina) {
    const pct = Math.max(0, Math.min(100, stamina));
    this.staBar.style.width = `${pct}%`;
  }

  /**
   * Updates Compass heading
   * @param {number} cameraYaw - radians
   */
  updateCompass(cameraYaw) {
    // Convert radians to degrees (0 to 360)
    let deg = Math.round((-cameraYaw * (180 / Math.PI)) % 360);
    if (deg < 0) deg += 360;

    let dir = 'N';
    if (deg >= 23 && deg < 68) dir = 'NE';
    else if (deg >= 68 && deg < 113) dir = 'E';
    else if (deg >= 113 && deg < 158) dir = 'SE';
    else if (deg >= 158 && deg < 203) dir = 'S';
    else if (deg >= 203 && deg < 248) dir = 'SW';
    else if (deg >= 248 && deg < 293) dir = 'W';
    else if (deg >= 293 && deg < 338) dir = 'NW';

    this.compassText.textContent = `${dir} ${deg.toString().padStart(3, '0')}°`;
  }

  /**
   * Renders the 2D round minimap
   * @param {Object} player - { x, z, yaw }
   * @param {number} cameraYaw - radians
   * @param {Array<{ x: number, z: number, width: number, depth: number, yaw: number }>} buildings
   * @param {Array<[number, number]>} roadPoints
   */
  renderMinimap(player, cameraYaw, buildings = [], roadPoints = []) {
    const ctx = this.minimapCtx;
    const w = 96;
    const h = 96;
    const cx = w / 2;
    const cy = h / 2;
    const radius = 46;
    const mapRange = 80; // 80m world radius

    ctx.clearRect(0, 0, w, h);

    // Save and clip circular map
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    // Map background
    ctx.fillStyle = '#0f1217';
    ctx.fillRect(0, 0, w, h);

    // Radar rings
    ctx.strokeStyle = 'rgba(232, 163, 61, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Rotate map with camera yaw so "up" is camera forward
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(cameraYaw);

    const scale = radius / mapRange;

    // Draw road spline / lines
    if (roadPoints && roadPoints.length > 1) {
      ctx.strokeStyle = 'rgba(120, 130, 140, 0.6)';
      ctx.lineWidth = 4 * scale;
      ctx.beginPath();
      for (let i = 0; i < roadPoints.length; i++) {
        const rx = (roadPoints[i][0] - player.x) * scale;
        const rz = (roadPoints[i][1] - player.z) * scale;
        if (i === 0) ctx.moveTo(rx, rz);
        else ctx.lineTo(rx, rz);
      }
      ctx.stroke();
    }

    // Draw buildings as rotated rectangles
    ctx.fillStyle = 'rgba(232, 163, 61, 0.7)';
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      const bx = (b.x - player.x) * scale;
      const bz = (b.z - player.z) * scale;
      const dist = Math.hypot(bx, bz);
      if (dist > radius + 15) continue;

      ctx.save();
      ctx.translate(bx, bz);
      ctx.rotate(b.yaw || 0);
      const bw = Math.max(3, (b.width || 8) * scale);
      const bd = Math.max(3, (b.depth || 8) * scale);
      ctx.fillRect(-bw / 2, -bd / 2, bw, bd);
      ctx.restore();
    }

    ctx.restore(); // Restore camera rotation

    // Draw player arrow in center (points along player.yaw relative to cameraYaw)
    const relYaw = player.yaw + cameraYaw;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(relYaw);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(-4, -5);
    ctx.lineTo(0, -3);
    ctx.lineTo(4, -5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    ctx.restore(); // Restore circular clip
  }

  setVisible(visible) {
    this.root.style.display = visible ? 'block' : 'none';
  }

  dispose() {
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
  }
}
