/**
 * main.js
 * 
 * Phase 2 Playable World & Asset Studio Entrypoint:
 * - Main Menu with [PLAY] and [ASSET STUDIO]
 * - Shared WebGL2 Renderer optimized for Android ARM64
 * - Fullscreen & landscape orientation integration
 * - Step 0 Perf Fix: PCFShadowMap, 1024 shadow map, bump/shadow/DPR toggles
 * - Seamless switching between Playable World (Game) and Phase 1 Asset Studio
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { ProceduralMaterialBank } from './textures/ProceduralMaterialBank.js';
import { MeshWorkerPool } from './workers/MeshWorkerPool.js';
import { buildSceneGroup } from './core/AssetContract.js';
import { MobileHUD } from './ui/MobileHUD.js';
import { Game } from './game/Game.js';
import { TouchControls } from './input/TouchControls.js';

class AssetStudioApp {
  constructor(sharedRenderer, options = {}) {
    this.renderer = sharedRenderer;
    this.onBackToMenu = options.onBackToMenu || (() => {});

    this.seed = 1337;
    this.currentMode = 6; // Default Mode 6: Full Diorama
    this.currentArchetype = 1;
    this.isWireframe = false;
    this.currentAtmosphere = 'noon';
    this.isRunning = false;

    this.activeGroup = null;
    this.activeAnimations = [];

    // Frame timing & telemetry
    this.lastTime = performance.now();
    this.frameCount = 0;
    this.fpsTimer = 0;
    this.currentFps = 60;
    this.currentFrameTime = 16.6;

    this.initScene();
    this.initStudio();
    this.initHUD();

    this.animate = this.animate.bind(this);
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 600);
    this.camera.position.set(0, 18, 32);

    // OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 180;
    this.controls.target.set(0, 2, 0);

    // Lighting rig
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfffaed, 2.2);
    this.dirLight.position.set(25, 45, 20);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.near = 1;
    this.dirLight.shadow.camera.far = 120;
    this.dirLight.shadow.camera.left = -30;
    this.dirLight.shadow.camera.right = 30;
    this.dirLight.shadow.camera.top = 30;
    this.dirLight.shadow.camera.bottom = -30;
    this.dirLight.shadow.bias = -0.0006;
    this.scene.add(this.dirLight);

    this.ambLight = new THREE.AmbientLight(0x333333, 0.5);
    this.scene.add(this.ambLight);
  }

  initStudio() {
    this.materialBank = new ProceduralMaterialBank({ seed: this.seed });
    this.workerPool = new MeshWorkerPool();
    this.applyAtmosphere(this.currentAtmosphere);
  }

  initHUD() {
    this.hud = new MobileHUD({
      onAssetSelect: (modeId) => {
        this.currentMode = modeId;
        this.loadActiveMode();
      },
      onBuildingArchetypeChange: (archetypeId) => {
        this.currentArchetype = archetypeId;
        this.loadActiveMode();
      },
      onRegenerate: () => {
        this.seed = Math.floor(Math.random() * 999999) + 1;
        this.loadActiveMode();
      },
      onWireframeToggle: (wireframe) => {
        this.isWireframe = wireframe;
        this.materialBank.setWireframe(wireframe);
      },
      onAtmosphereChange: (presetKey) => {
        this.currentAtmosphere = presetKey;
        this.applyAtmosphere(presetKey);
      },
      onExportGLB: () => {
        this.exportActiveAssetGLB();
      },
      onShadowsToggle: (enabled) => {
        this.renderer.shadowMap.enabled = enabled;
        this.dirLight.castShadow = enabled;
      },
      onBumpToggle: (enabled) => {
        this.materialBank.setBumpMapsEnabled(enabled);
      },
      onPixelRatioToggle: (ratio) => {
        this.renderer.setPixelRatio(ratio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
      },
      onBackToMenu: () => {
        this.stop();
        this.onBackToMenu();
      }
    });

    this.hud.selectAsset(this.currentMode);
  }

  applyAtmosphere(preset) {
    const presets = {
      noon: {
        bg: 0xd2c6b4,
        fogDensity: 0.012,
        sunColor: 0xfffaed,
        sunIntensity: 2.2,
        sunPos: [25, 45, 20],
        hemiSky: 0xd6e8ff,
        hemiGround: 0x7a6950,
        hemiIntensity: 0.85,
        ambColor: 0x4a443b,
        exposure: 1.05
      },
      storm: {
        bg: 0x8a773d,
        fogDensity: 0.038,
        sunColor: 0xf0c850,
        sunIntensity: 1.4,
        sunPos: [15, 30, 10],
        hemiSky: 0x94a350,
        hemiGround: 0x40371c,
        hemiIntensity: 1.2,
        ambColor: 0x5a4d22,
        exposure: 0.95
      },
      dusk: {
        bg: 0x24191c,
        fogDensity: 0.024,
        sunColor: 0xff4622,
        sunIntensity: 1.8,
        sunPos: [-28, 16, -20],
        hemiSky: 0x3d395c,
        hemiGround: 0x1f1412,
        hemiIntensity: 0.7,
        ambColor: 0x22181a,
        exposure: 1.15
      }
    };

    const cfg = presets[preset] || presets.noon;
    this.scene.background = new THREE.Color(cfg.bg);
    this.scene.fog = new THREE.FogExp2(cfg.bg, cfg.fogDensity);

    this.dirLight.color.setHex(cfg.sunColor);
    this.dirLight.intensity = cfg.sunIntensity;
    this.dirLight.position.set(...cfg.sunPos);

    this.hemiLight.color.setHex(cfg.hemiSky);
    this.hemiLight.groundColor.setHex(cfg.hemiGround);
    this.hemiLight.intensity = cfg.hemiIntensity;

    this.ambLight.color.setHex(cfg.ambColor);
    this.renderer.toneMappingExposure = cfg.exposure;
  }

  async loadActiveMode() {
    this.hud.setGenerating(true);

    if (this.activeGroup) {
      this.scene.remove(this.activeGroup);
      this.disposeGroup(this.activeGroup);
      this.activeGroup = null;
    }
    this.activeAnimations.length = 0;

    const tStart = performance.now();

    try {
      if (this.currentMode === 6) {
        await this.buildFullDiorama();
      } else {
        await this.buildSingleAsset(this.currentMode);
      }

      if (this.isWireframe) {
        this.materialBank.setWireframe(true);
      }

      const tElapsed = Math.round(performance.now() - tStart);
      this.hud.setGenerating(false, tElapsed);
    } catch (err) {
      console.error('[AssetStudio] Generation error:', err);
      this.hud.setGenerating(false, 0);
    }
  }

  async buildSingleAsset(mode) {
    const modeConfigs = {
      1: { type: 'building', cam: [0, 8, 16], target: [0, 4, 0] },
      2: { type: 'terrain', cam: [0, 24, 42], target: [0, 0, 0] },
      3: { type: 'props', cam: [0, 3.2, 6.8], target: [0, 1.2, 0] },
      4: { type: 'tree', cam: [0, 4.5, 9.0], target: [0, 2.5, 0] },
      5: { type: 'drone', cam: [0, 2.4, 4.8], target: [0, 0.4, 0] }
    };

    const cfg = modeConfigs[mode] || modeConfigs[1];
    const options = mode === 1 ? { archetype: this.currentArchetype } : {};
    const assetResult = await this.workerPool.generate(cfg.type, this.seed, 0, options);
    const group = buildSceneGroup(assetResult, this.materialBank);

    this.scene.add(group);
    this.activeGroup = group;

    if (typeof group.userData.updateAnimation === 'function') {
      this.activeAnimations.push(group.userData.updateAnimation);
    }

    this.setCameraView(cfg.cam, cfg.target);
  }

  async buildFullDiorama() {
    const results = await this.workerPool.generateAll(this.seed, 0);

    const dioramaGroup = new THREE.Group();
    dioramaGroup.name = 'FullDioramaShowcase';

    // 1. Terrain Base
    const terrainGroup = buildSceneGroup(results.terrain, this.materialBank);
    terrainGroup.position.set(0, 0, 0);
    dioramaGroup.add(terrainGroup);

    // 2. Ruined Brutalist Building
    const buildingGroup = buildSceneGroup(results.building, this.materialBank);
    buildingGroup.position.set(7.5, 0.5, -4.5);
    buildingGroup.rotation.y = -0.32;
    dioramaGroup.add(buildingGroup);

    // 3. Rusted Props Pack
    const propsGroup = buildSceneGroup(results.props, this.materialBank);
    propsGroup.position.set(-1.8, 0.5, 2.2);
    propsGroup.rotation.y = 0.4;
    dioramaGroup.add(propsGroup);

    // 4. Dead Trees
    const treeGroup1 = buildSceneGroup(results.tree, this.materialBank);
    treeGroup1.position.set(-8.5, 1.0, -5.0);
    treeGroup1.rotation.y = 0.9;
    treeGroup1.scale.set(1.15, 1.15, 1.15);
    dioramaGroup.add(treeGroup1);

    const treeGroup2 = buildSceneGroup(results.tree2, this.materialBank);
    treeGroup2.position.set(5.5, 0.7, 7.5);
    treeGroup2.rotation.y = -1.1;
    treeGroup2.scale.set(0.85, 0.85, 0.85);
    dioramaGroup.add(treeGroup2);

    // 5. Scavenger Drone
    const droneGroup = buildSceneGroup(results.drone, this.materialBank);
    droneGroup.position.set(0.5, 5.0, 1.5);
    dioramaGroup.add(droneGroup);

    if (typeof droneGroup.userData.updateAnimation === 'function') {
      this.activeAnimations.push(droneGroup.userData.updateAnimation);
    }

    this.scene.add(dioramaGroup);
    this.activeGroup = dioramaGroup;

    this.setCameraView([0, 18, 32], [0, 2, 0]);
  }

  setCameraView(camPos, targetPos) {
    this.camera.position.set(...camPos);
    this.controls.target.set(...targetPos);
    this.controls.update();
  }

  exportActiveAssetGLB() {
    if (!this.activeGroup) return;
    this.hud.setExportStatus('Exporting...');
    const exporter = new GLTFExporter();
    const assetName = this.activeGroup.name || `Asset_Mode${this.currentMode}`;

    const wasWireframe = this.isWireframe;
    if (wasWireframe) this.materialBank.setWireframe(false);

    exporter.parse(
      this.activeGroup,
      (gltf) => {
        if (wasWireframe) this.materialBank.setWireframe(true);
        const blob = new Blob([gltf], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${assetName}_seed${this.seed}.glb`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        this.hud.setExportStatus('Exported!');
        setTimeout(() => this.hud.setExportStatus(null), 3000);
      },
      (err) => {
        if (wasWireframe) this.materialBank.setWireframe(true);
        console.error('[AssetStudio] Export error:', err);
        this.hud.setExportStatus('Export Failed');
        setTimeout(() => this.hud.setExportStatus(null), 3000);
      },
      { binary: true }
    );
  }

  disposeGroup(group) {
    if (!group) return;
    group.traverse((child) => {
      if (child.isMesh && child.geometry) child.geometry.dispose();
    });
  }

  start() {
    this.isRunning = true;
    this.hud.setVisible(true);
    this.controls.enabled = true;
    this.lastTime = performance.now();
    this.loadActiveMode();
    requestAnimationFrame(this.animate);
  }

  stop() {
    this.isRunning = false;
    this.hud.setVisible(false);
    this.controls.enabled = false;
  }

  animate(now) {
    if (!this.isRunning) return;
    requestAnimationFrame(this.animate);

    const delta = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    const timeSec = now * 0.001;

    for (const animFn of this.activeAnimations) {
      try {
        animFn(timeSec, delta);
      } catch (e) {
        // Ignore animation frame error
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    this.frameCount++;
    if (now - this.fpsTimer >= 400) {
      this.currentFps = (this.frameCount * 1000) / (now - this.fpsTimer);
      this.currentFrameTime = 1000 / Math.max(1, this.currentFps);
      this.fpsTimer = now;
      this.frameCount = 0;

      this.hud.updateTelemetry({
        fps: this.currentFps,
        frameTimeMs: this.currentFrameTime,
        activeWorkers: this.workerPool.activeWorkerCount,
        drawCalls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles
      });
    }
  }
}

// =========================================================================
// MAIN MENU OVERLAY & APP BOOTSTRAP
// =========================================================================

function createMainMenu(onPlay, onStudio) {
  const menuEl = document.createElement('div');
  menuEl.id = 'main-menu-root';
  menuEl.innerHTML = `
    <style>
      #main-menu-root {
        position: fixed;
        inset: 0;
        background: radial-gradient(circle at center, rgba(32, 24, 28, 0.94) 0%, rgba(12, 14, 18, 0.98) 100%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        font-family: 'JetBrains Mono', monospace, Consolas, sans-serif;
        color: #e8a33d;
        user-select: none;
        -webkit-user-select: none;
        touch-action: none;
        padding: 20px;
      }
      .menu-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        max-width: 440px;
        width: 100%;
        background: rgba(18, 22, 28, 0.85);
        border: 2px solid rgba(232, 163, 61, 0.6);
        border-radius: 12px;
        padding: 28px 24px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8), 0 0 20px rgba(232, 163, 61, 0.2);
        text-align: center;
      }
      .menu-title {
        font-size: 20px;
        font-weight: 900;
        letter-spacing: 2.5px;
        color: #e8a33d;
        margin-bottom: 6px;
        text-shadow: 0 0 10px rgba(232, 163, 61, 0.5);
      }
      .menu-sub {
        font-size: 11px;
        letter-spacing: 1px;
        color: #a49682;
        margin-bottom: 24px;
        border-bottom: 1px solid rgba(232, 163, 61, 0.25);
        padding-bottom: 12px;
        width: 100%;
      }
      .menu-btn-col {
        display: flex;
        flex-direction: column;
        gap: 14px;
        width: 100%;
      }
      .menu-btn {
        padding: 14px 20px;
        font-family: inherit;
        font-size: 14px;
        font-weight: bold;
        letter-spacing: 2px;
        border-radius: 8px;
        cursor: pointer;
        transition: transform 0.1s ease, box-shadow 0.15s ease, background 0.15s ease;
        touch-action: none;
      }
      .menu-play-btn {
        background: #e8a33d;
        color: #0c0e12;
        border: none;
        box-shadow: 0 4px 16px rgba(232, 163, 61, 0.5);
        font-size: 16px;
      }
      .menu-play-btn:active {
        transform: scale(0.96);
        background: #ffb74d;
      }
      .menu-studio-btn {
        background: transparent;
        color: #e8a33d;
        border: 2px solid rgba(232, 163, 61, 0.5);
      }
      .menu-studio-btn:active {
        transform: scale(0.96);
        background: rgba(232, 163, 61, 0.2);
      }
      .menu-badges {
        margin-top: 20px;
        font-size: 10px;
        color: #7a6e5d;
        display: flex;
        justify-content: center;
        gap: 12px;
        letter-spacing: 0.5px;
      }
    </style>
    <div class="menu-container">
      <div class="menu-title">POST-APOCALYPTIC WASTELAND</div>
      <div class="menu-sub">PHASE 2: PLAYABLE WORLD & ASSET STUDIO</div>
      <div class="menu-btn-col">
        <button type="button" id="menu-btn-play" class="menu-btn menu-play-btn">▶ PLAY (60 FPS)</button>
        <button type="button" id="menu-btn-studio" class="menu-btn menu-studio-btn">🛠 ASSET STUDIO</button>
      </div>
      <div class="menu-badges">
        <span>60 Hz KINEMATIC</span>
        <span>•</span>
        <span>MULTI-TOUCH</span>
        <span>•</span>
        <span>STREAMED WORLD</span>
      </div>
    </div>
  `;
  document.body.appendChild(menuEl);

  menuEl.querySelector('#menu-btn-play').addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    TouchControls.requestFullscreenAndLandscape();
    menuEl.style.display = 'none';
    onPlay();
  });

  menuEl.querySelector('#menu-btn-studio').addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    menuEl.style.display = 'none';
    onStudio();
  });

  return {
    show: () => { menuEl.style.display = 'flex'; },
    hide: () => { menuEl.style.display = 'none'; }
  };
}

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
  // Shared WebGL2 Renderer
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // Step 0: PCFShadowMap for mobile ARM64 fill-rate
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.body.appendChild(renderer.domElement);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let studioApp = null;
  let gameApp = null;
  let menu = null;

  const returnToMenu = () => {
    if (gameApp) gameApp.stop();
    if (studioApp) studioApp.stop();
    menu.show();
  };

  const launchPlay = () => {
    if (studioApp) studioApp.stop();
    if (!gameApp) {
      gameApp = new Game({
        renderer,
        seed: 1337,
        quality: 'medium',
        onBackToMenu: returnToMenu
      });
    }
    gameApp.start();
  };

  const launchStudio = () => {
    if (gameApp) gameApp.stop();
    if (!studioApp) {
      studioApp = new AssetStudioApp(renderer, {
        onBackToMenu: returnToMenu
      });
    }
    studioApp.start();
  };

  menu = createMainMenu(launchPlay, launchStudio);
});
