/**
 * MobileHUD.js
 * 
 * Responsive Android mobile touch UI + Live Telemetry HUD.
 * Features:
 * - Touch Asset Switcher (Modes 1 to 6)
 * - Studio Action Bar (Regenerate with seed & worker ms, Wireframe, Atmosphere selector, GLB Export)
 * - Real-time Telemetry (FPS, Frame Time ms, Active Workers, Draw Calls, Triangles)
 * - Post-apocalyptic terminal aesthetics with touch optimization
 */

export class MobileHUD {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.onAssetSelect = options.onAssetSelect || (() => {});
    this.onRegenerate = options.onRegenerate || (() => {});
    this.onWireframeToggle = options.onWireframeToggle || (() => {});
    this.onAtmosphereChange = options.onAtmosphereChange || (() => {});
    this.onExportGLB = options.onExportGLB || (() => {});
    this.onShadowsToggle = options.onShadowsToggle || (() => {});
    this.onBumpToggle = options.onBumpToggle || (() => {});
    this.onPixelRatioToggle = options.onPixelRatioToggle || (() => {});
    this.onBuildingArchetypeChange = options.onBuildingArchetypeChange || (() => {});
    this.onBackToMenu = options.onBackToMenu || (() => {});

    this.currentMode = 6;
    this.currentBuildingArchetype = 1;
    this.isWireframe = false;
    this.currentAtmosphere = 'noon';
    this.shadowsEnabled = true;
    this.bumpEnabled = true;
    this.pixelRatio = 1.5;

    this.assets = [
      { id: 1, type: 'building', label: '[1. Ruined Building]' },
      { id: 2, type: 'terrain', label: '[2. Wasteland Terrain]' },
      { id: 3, type: 'props', label: '[3. Rusted Props]' },
      { id: 4, type: 'tree', label: '[4. Dead Tree]' },
      { id: 5, type: 'drone', label: '[5. Scavenger Drone]' },
      { id: 6, type: 'diorama', label: '[6. Full Parallel Diorama]' }
    ];

    this.atmospheres = [
      { id: 'noon', label: 'Harsh Noon' },
      { id: 'storm', label: 'Radioactive Dust Storm' },
      { id: 'dusk', label: 'Ash Dusk' }
    ];

    this.initDOM();
  }

  initDOM() {
    this.injectStyles();

    // Main root wrapper
    this.root = document.createElement('div');
    this.root.id = 'hud-root';
    this.root.className = 'hud-container';

    // 1. Top Telemetry Overlay with Perf Toggles
    this.telemetryEl = document.createElement('div');
    this.telemetryEl.className = 'hud-telemetry';
    this.telemetryEl.innerHTML = `
      <div class="hud-telemetry-item"><span class="label">FPS:</span> <span id="tel-fps" class="value glow">60</span></div>
      <div class="hud-telemetry-item"><span class="label">FT:</span> <span id="tel-ft" class="value">16.6ms</span></div>
      <div class="hud-telemetry-item"><span class="label">WORKERS:</span> <span id="tel-workers" class="value">4</span></div>
      <div class="hud-telemetry-item"><span class="label">DRAWS:</span> <span id="tel-draws" class="value">0</span></div>
      <div class="hud-telemetry-item"><span class="label">TRIS:</span> <span id="tel-tris" class="value glow">0</span></div>
      <div class="hud-telemetry-item badge"><span id="tel-gen-badge">Ready</span></div>
      <button type="button" id="tel-shadow-btn" class="hud-tel-btn active" title="Toggle Shadows">SHADOW: ON</button>
      <button type="button" id="tel-bump-btn" class="hud-tel-btn active" title="Toggle Bump Maps">BUMP: ON</button>
      <button type="button" id="tel-dpr-btn" class="hud-tel-btn" title="Toggle Pixel Ratio">DPR: 1.5</button>
    `;
    this.root.appendChild(this.telemetryEl);

    // 2. Top Asset Switcher Bar
    this.switcherBar = document.createElement('div');
    this.switcherBar.className = 'hud-switcher-bar';

    this.assetButtons = [];
    for (const asset of this.assets) {
      const btn = document.createElement('button');
      btn.className = `hud-btn hud-asset-btn ${asset.id === this.currentMode ? 'active' : ''}`;
      btn.setAttribute('data-id', asset.id);
      const cleanLabel = asset.label.replace(/^\[\d+\.\s*/, '').replace(/\]$/, '');
      btn.innerHTML = `<span class="btn-num">[${asset.id}]</span> <span class="btn-text">${cleanLabel}</span>`;
      btn.title = asset.label;
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.selectAsset(asset.id);
      });
      this.switcherBar.appendChild(btn);
      this.assetButtons.push(btn);
    }
    this.root.appendChild(this.switcherBar);

    // 3. Bottom Studio Action Bar
    this.actionBar = document.createElement('div');
    this.actionBar.className = 'hud-action-bar';

    // Regenerate Button
    this.btnRegen = document.createElement('button');
    this.btnRegen.className = 'hud-btn hud-action-btn regen-btn';
    this.btnRegen.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      <span id="regen-label">Regenerate (Parallel Seed)</span>
    `;
    this.btnRegen.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onRegenerate();
    });
    this.actionBar.appendChild(this.btnRegen);

    // Wireframe Toggle Button
    this.btnWire = document.createElement('button');
    this.btnWire.className = 'hud-btn hud-action-btn wire-btn';
    this.btnWire.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
      <span>Wireframe</span>
    `;
    this.btnWire.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.isWireframe = !this.isWireframe;
      this.setWireframe(this.isWireframe);
      this.onWireframeToggle(this.isWireframe);
    });
    this.actionBar.appendChild(this.btnWire);

    // Atmosphere Preset Selector
    this.atmosphereSelect = document.createElement('select');
    this.atmosphereSelect.className = 'hud-select hud-action-btn atmo-select';
    for (const atmo of this.atmospheres) {
      const opt = document.createElement('option');
      opt.value = atmo.id;
      opt.textContent = atmo.label;
      if (atmo.id === this.currentAtmosphere) opt.selected = true;
      this.atmosphereSelect.appendChild(opt);
    }
    this.atmosphereSelect.addEventListener('change', (e) => {
      e.stopPropagation();
      this.currentAtmosphere = e.target.value;
      this.onAtmosphereChange(this.currentAtmosphere);
    });
    this.actionBar.appendChild(this.atmosphereSelect);

    // Export .GLB Button
    this.btnExport = document.createElement('button');
    this.btnExport.className = 'hud-btn hud-action-btn export-btn';
    this.btnExport.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      <span>Export .GLB</span>
    `;
    this.btnExport.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onExportGLB();
    });
    this.actionBar.appendChild(this.btnExport);

    // Building Archetype Selector (shown for building mode)
    this.buildingSelect = document.createElement('select');
    this.buildingSelect.id = 'hud-building-select';
    this.buildingSelect.className = 'hud-select hud-action-btn building-select';
    const archetypes = [
      { id: 1, name: 'Archetype 1: Brutalist Block' },
      { id: 2, name: 'Archetype 2: Apartment' },
      { id: 3, name: 'Archetype 3: Warehouse' },
      { id: 4, name: 'Archetype 4: Office Tower' },
      { id: 5, name: 'Archetype 5: Bunker' },
      { id: 6, name: 'Archetype 6: Gas Station' }
    ];
    for (const a of archetypes) {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      this.buildingSelect.appendChild(opt);
    }
    this.buildingSelect.style.display = this.currentMode === 1 ? 'inline-block' : 'none';
    this.buildingSelect.addEventListener('change', (e) => {
      e.stopPropagation();
      this.currentBuildingArchetype = parseInt(e.target.value, 10);
      this.onBuildingArchetypeChange(this.currentBuildingArchetype);
    });
    this.actionBar.appendChild(this.buildingSelect);

    // Return to Menu Button
    this.btnMenu = document.createElement('button');
    this.btnMenu.className = 'hud-btn hud-action-btn menu-btn';
    this.btnMenu.innerHTML = `<span>[MENU]</span>`;
    this.btnMenu.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onBackToMenu();
    });
    this.actionBar.appendChild(this.btnMenu);

    this.root.appendChild(this.actionBar);
    this.container.appendChild(this.root);

    // Cache elements for rapid telemetry updates
    this.elFps = document.getElementById('tel-fps');
    this.elFt = document.getElementById('tel-ft');
    this.elWorkers = document.getElementById('tel-workers');
    this.elDraws = document.getElementById('tel-draws');
    this.elTris = document.getElementById('tel-tris');
    this.elGenBadge = document.getElementById('tel-gen-badge');
    this.elRegenLabel = document.getElementById('regen-label');

    // Wire Perf Toggles
    const shadowBtn = document.getElementById('tel-shadow-btn');
    if (shadowBtn) {
      shadowBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.shadowsEnabled = !this.shadowsEnabled;
        shadowBtn.textContent = `SHADOW: ${this.shadowsEnabled ? 'ON' : 'OFF'}`;
        shadowBtn.classList.toggle('active', this.shadowsEnabled);
        this.onShadowsToggle(this.shadowsEnabled);
      });
    }

    const bumpBtn = document.getElementById('tel-bump-btn');
    if (bumpBtn) {
      bumpBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.bumpEnabled = !this.bumpEnabled;
        bumpBtn.textContent = `BUMP: ${this.bumpEnabled ? 'ON' : 'OFF'}`;
        bumpBtn.classList.toggle('active', this.bumpEnabled);
        this.onBumpToggle(this.bumpEnabled);
      });
    }

    const dprBtn = document.getElementById('tel-dpr-btn');
    if (dprBtn) {
      dprBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.pixelRatio = this.pixelRatio === 1.5 ? 1.0 : 1.5;
        dprBtn.textContent = `DPR: ${this.pixelRatio.toFixed(1)}`;
        this.onPixelRatioToggle(this.pixelRatio);
      });
    }
  }

  setVisible(visible) {
    if (this.root) {
      this.root.style.display = visible ? 'block' : 'none';
    }
  }

  injectStyles() {
    if (document.getElementById('hud-styles')) return;
    const style = document.createElement('style');
    style.id = 'hud-styles';
    style.textContent = `
      :root {
        --hud-bg: rgba(14, 16, 20, 0.88);
        --hud-border: rgba(255, 152, 0, 0.28);
        --hud-amber: #ff9800;
        --hud-amber-bright: #ffb74d;
        --hud-amber-dim: rgba(255, 152, 0, 0.15);
        --hud-cyan: #00e5ff;
        --hud-text: #e6e6e6;
        --hud-text-dim: #999999;
        --hud-font: 'JetBrains Mono', 'SF Mono', Consolas, 'Courier New', monospace;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 0;
        overflow: hidden;
        background-color: #0b0c0e;
        user-select: none;
        -webkit-user-select: none;
        touch-action: none;
        font-family: var(--hud-font);
      }

      .hud-container {
        position: absolute;
        inset: 0;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        z-index: 100;
        padding-top: max(8px, env(safe-area-inset-top));
        padding-bottom: max(10px, env(safe-area-inset-bottom));
        padding-left: max(10px, env(safe-area-inset-left));
        padding-right: max(10px, env(safe-area-inset-right));
      }

      /* 1. Telemetry Bar */
      .hud-telemetry {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 12px;
        background: var(--hud-bg);
        border: 1px solid var(--hud-border);
        border-radius: 6px;
        padding: 6px 12px;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        font-size: 11px;
        font-weight: 600;
        color: var(--hud-text);
        letter-spacing: 0.5px;
        max-width: fit-content;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
        pointer-events: auto;
      }

      .hud-telemetry-item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .hud-telemetry-item .label {
        color: var(--hud-text-dim);
      }

      .hud-telemetry-item .value {
        color: var(--hud-amber-bright);
      }

      .hud-telemetry-item .value.glow {
        color: #ffab40;
        text-shadow: 0 0 8px rgba(255, 171, 64, 0.5);
      }

      .hud-telemetry-item.badge {
        background: var(--hud-amber-dim);
        border: 1px solid var(--hud-amber);
        padding: 2px 7px;
        border-radius: 4px;
        color: var(--hud-amber-bright);
        font-size: 10px;
        text-transform: uppercase;
      }

      /* 2. Touch Asset Switcher Bar */
      .hud-switcher-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        overflow-x: auto;
        padding: 6px 4px;
        margin-top: 6px;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
        pointer-events: auto;
      }

      .hud-switcher-bar::-webkit-scrollbar {
        display: none;
      }

      .hud-btn {
        background: var(--hud-bg);
        color: var(--hud-text);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 6px;
        padding: 10px 14px;
        font-family: var(--hud-font);
        font-size: 12px;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
        cursor: pointer;
        transition: all 0.15s ease;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
        min-height: 42px;
      }

      .hud-btn:active {
        transform: scale(0.96);
        background: rgba(255, 152, 0, 0.2);
      }

      .hud-asset-btn {
        flex-shrink: 0;
      }

      .hud-asset-btn .btn-num {
        color: var(--hud-amber);
      }

      .hud-asset-btn.active {
        background: var(--hud-amber-dim);
        border-color: var(--hud-amber);
        color: #ffffff;
        box-shadow: 0 0 14px rgba(255, 152, 0, 0.35);
      }

      .hud-asset-btn.active .btn-num {
        color: #fff;
        text-shadow: 0 0 6px #fff;
      }

      /* 3. Bottom Studio Action Bar */
      .hud-action-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        pointer-events: auto;
        background: var(--hud-bg);
        border: 1px solid var(--hud-border);
        border-radius: 8px;
        padding: 8px 10px;
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.7);
        max-width: 100%;
      }

      .hud-action-btn {
        flex: 1 1 auto;
        min-height: 44px;
        justify-content: center;
      }

      .regen-btn {
        border-color: rgba(255, 152, 0, 0.4);
        background: rgba(255, 152, 0, 0.12);
        color: var(--hud-amber-bright);
      }

      .regen-btn:active {
        background: rgba(255, 152, 0, 0.3);
      }

      .wire-btn.active {
        background: rgba(0, 229, 255, 0.18);
        border-color: var(--hud-cyan);
        color: var(--hud-cyan);
        box-shadow: 0 0 12px rgba(0, 229, 255, 0.3);
      }

      .hud-select {
        background: var(--hud-bg);
        color: var(--hud-text);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        padding: 8px 10px;
        font-family: var(--hud-font);
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        min-height: 44px;
        outline: none;
      }

      .hud-select option {
        background: #14171d;
        color: #fff;
      }

      .export-btn {
        border-color: rgba(76, 175, 80, 0.4);
        background: rgba(76, 175, 80, 0.12);
        color: #81c784;
      }

      .export-btn:active {
        background: rgba(76, 175, 80, 0.28);
      }

      @media (max-width: 600px) {
        .hud-telemetry {
          font-size: 10px;
          gap: 6px 8px;
          padding: 4px 8px;
        }
        .hud-btn {
          font-size: 11px;
          padding: 8px 10px;
        }
        .hud-action-bar {
          gap: 6px;
          padding: 6px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  selectAsset(modeId) {
    this.currentMode = modeId;
    if (this.buildingSelect) {
      this.buildingSelect.style.display = modeId === 1 ? 'inline-block' : 'none';
    }
    for (const btn of this.assetButtons) {
      if (parseInt(btn.getAttribute('data-id'), 10) === modeId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
    this.onAssetSelect(modeId);
  }

  setWireframe(active) {
    this.isWireframe = active;
    if (active) {
      this.btnWire.classList.add('active');
    } else {
      this.btnWire.classList.remove('active');
    }
  }

  setGenerating(isGenerating, timeMs = null) {
    if (isGenerating) {
      this.btnRegen.disabled = true;
      this.btnRegen.style.opacity = '0.6';
      this.elRegenLabel.textContent = 'Generating...';
      if (this.elGenBadge) {
        this.elGenBadge.textContent = 'Workers: Busy';
      }
    } else {
      this.btnRegen.disabled = false;
      this.btnRegen.style.opacity = '1.0';
      this.elRegenLabel.textContent = timeMs ? `Regen (${timeMs}ms)` : 'Regenerate (Parallel Seed)';
      if (this.elGenBadge && timeMs !== null) {
        this.elGenBadge.textContent = `Worker Gen: ${timeMs}ms`;
      }
    }
  }

  setExportStatus(statusText) {
    const exportLabel = this.btnExport.querySelector('span');
    if (statusText) {
      if (exportLabel) exportLabel.textContent = statusText;
      if (this.elGenBadge) this.elGenBadge.textContent = `GLB: ${statusText}`;
    } else {
      if (exportLabel) exportLabel.textContent = 'Export .GLB';
    }
  }

  updateTelemetry({ fps = 60, frameTimeMs = 16.6, activeWorkers = 4, drawCalls = 0, triangles = 0 }) {
    if (this.elFps) this.elFps.textContent = Math.round(fps);
    if (this.elFt) this.elFt.textContent = `${frameTimeMs.toFixed(1)}ms`;
    if (this.elWorkers) this.elWorkers.textContent = activeWorkers;
    if (this.elDraws) this.elDraws.textContent = drawCalls;
    if (this.elTris) this.elTris.textContent = triangles.toLocaleString();
  }
}
