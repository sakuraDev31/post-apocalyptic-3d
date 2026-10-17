/**
 * main.js
 * 
 * Phase 1 Procedural 3D Asset Studio & Parallel Diorama Showcase.
 * - Three.js WebGL2 setup with mobile ARM64 optimizations
 * - Touch-friendly OrbitControls with smooth damping
 * - Procedural PBR Material Bank & Parallel Mesh Worker Pool
 * - Touch Asset Switcher (Modes 1 to 6)
 * - Concurrent Promise.all() generation across workers
 * - Real-time mobile telemetry overlay (FPS, Frame Time, Workers, Calls, Tris)
 * - GLTFExporter .GLB binary export
 * - Dynamic post-apocalyptic atmosphere presets
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { ProceduralMaterialBank } from './textures/ProceduralMaterialBank.js';
import { MeshWorkerPool } from './workers/MeshWorkerPool.js';
import { buildSceneGroup } from './core/AssetContract.js';
import { MobileHUD } from './ui/MobileHUD.js';

class AssetStudioApp {
  constructor() {
    this.seed = 1337;
    this.currentMode = 6; // Default to Mode 6: Full Diorama
    this.isWireframe = false;
    this.currentAtmosphere = 'noon';

    this.activeGroup = null;
    this.activeAnimations = [];

    // Frame timing & telemetry
    this.lastTime = performance.now();
    this.frameCount = 0;
    this.fpsTimer = 0;
    this.currentFps = 60;
    this.currentFrameTime = 16.6;

    this.initThree();
    this.initStudio();
    this.initHUD();
    this.loadActiveMode();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initThree() {
    // 1. WebGL2 Renderer optimized for Android mobile ARM64
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    // Android ARM64 GPU optimization: cap pixel ratio at 1.5
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    document.body.appendChild(this.renderer.domElement);

    // 2. Camera & Scene
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      600
    );
    this.camera.position.set(0, 18, 32);

    // 3. Touch-friendly OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04; // Don't go below horizon
    this.controls.minDistance = 2;
    this.controls.maxDistance = 180;
    this.controls.target.set(0, 2, 0);

    // 4. Lighting & Atmosphere Rig
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

    // Ambient light fill
    this.ambLight = new THREE.AmbientLight(0x333333, 0.5);
    this.scene.add(this.ambLight);

    // Responsive resize handler
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
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
        // Mode 6: Full Diorama Showcase (Parallel generation across all workers)
        await this.buildFullDiorama();
      } else {
        // Modes 1 to 5: Single Asset Showcase
        await this.buildSingleAsset(this.currentMode);
      }

      // Re-apply wireframe mode if active
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
    const assetResult = await this.workerPool.generate(cfg.type, this.seed, 0);
    const group = buildSceneGroup(assetResult, this.materialBank);

    this.scene.add(group);
    this.activeGroup = group;

    if (typeof group.userData.updateAnimation === 'function') {
      this.activeAnimations.push(group.userData.updateAnimation);
    }

    this.setCameraView(cfg.cam, cfg.target);
  }

  async buildFullDiorama() {
    // Generate all 5 assets concurrently across the parallel Web Worker pool
    const results = await this.workerPool.generateAll(this.seed, 0);

    const dioramaGroup = new THREE.Group();
    dioramaGroup.name = 'FullDioramaShowcase';

    // 1. Terrain Base
    const terrainGroup = buildSceneGroup(results.terrain, this.materialBank);
    terrainGroup.position.set(0, 0, 0);
    dioramaGroup.add(terrainGroup);

    // 2. Ruined Brutalist Building (placed on terrain offset)
    const buildingGroup = buildSceneGroup(results.building, this.materialBank);
    buildingGroup.position.set(7.5, 0.5, -4.5);
    buildingGroup.rotation.y = -0.32;
    dioramaGroup.add(buildingGroup);

    // 3. Rusted Props & Barricades Pack (along cracked road)
    const propsGroup = buildSceneGroup(results.props, this.materialBank);
    propsGroup.position.set(-1.8, 0.5, 2.2);
    propsGroup.rotation.y = 0.4;
    dioramaGroup.add(propsGroup);

    // 4. Dead Gnarled Trees
    const treeGroup1 = buildSceneGroup(results.tree, this.materialBank);
    treeGroup1.position.set(-8.5, 1.0, -5.0);
    treeGroup1.rotation.y = 0.9;
    treeGroup1.scale.set(1.15, 1.15, 1.15);
    dioramaGroup.add(treeGroup1);

    // Second tree instance rotated for variety (generated concurrently across worker pool)
    const treeGroup2 = buildSceneGroup(results.tree2, this.materialBank);
    treeGroup2.position.set(5.5, 0.7, 7.5);
    treeGroup2.rotation.y = -1.1;
    treeGroup2.scale.set(0.85, 0.85, 0.85);
    dioramaGroup.add(treeGroup2);

    // 5. Autonomous Scavenger Drone (hovering over diorama with live animation)
    const droneGroup = buildSceneGroup(results.drone, this.materialBank);
    droneGroup.position.set(0.5, 5.0, 1.5);
    droneGroup.userData.initialY = 5.0;
    droneGroup.userData.initialX = 0.5;
    droneGroup.userData.initialZ = 1.5;
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
    if (wasWireframe) {
      this.materialBank.setWireframe(false);
    }

    exporter.parse(
      this.activeGroup,
      (gltf) => {
        if (wasWireframe) {
          this.materialBank.setWireframe(true);
        }
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
        if (wasWireframe) {
          this.materialBank.setWireframe(true);
        }
        console.error('[AssetStudio] GLTF export error:', err);
        this.hud.setExportStatus('Export Failed');
        setTimeout(() => this.hud.setExportStatus(null), 3000);
      },
      { binary: true }
    );
  }

  disposeGroup(group) {
    if (!group) return;
    group.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
      }
    });
  }

  animate(now) {
    requestAnimationFrame(this.animate);

    const delta = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    const timeSec = now * 0.001;

    // Run procedural animations
    for (const animFn of this.activeAnimations) {
      try {
        animFn(timeSec, delta);
      } catch (e) {
        console.warn('Animation error:', e);
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    // Live Telemetry Calculation
    this.frameCount++;
    if (now - this.fpsTimer >= 400) {
      this.currentFps = (this.frameCount * 1000) / (now - this.fpsTimer);
      this.currentFrameTime = 1000 / Math.max(1, this.currentFps);
      this.fpsTimer = now;
      this.frameCount = 0;

      const drawCalls = this.renderer.info.render.calls;
      const triangles = this.renderer.info.render.triangles;
      const activeWorkers = this.workerPool.activeWorkerCount;

      this.hud.updateTelemetry({
        fps: this.currentFps,
        frameTimeMs: this.currentFrameTime,
        activeWorkers,
        drawCalls,
        triangles
      });
    }
  }
}

// Start studio when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new AssetStudioApp();
});
