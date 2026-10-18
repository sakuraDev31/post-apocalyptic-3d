/**
 * Game.js
 * 
 * Phase 2 Playable World Game Mode:
 * - 60 Hz fixed timestep physics loop with variable rendering
 * - Player spawning on road at (0, heightAt(0,0), 0)
 * - Directional sun shadow following player (1024 map, 40m frustum box)
 * - Quality tier management (Low / Medium / High)
 * - Auto-downgrade one tier if FPS < 45 for 3s with toast notice
 * - Full HUD & touch input synchronization
 */

import * as THREE from 'three';
import { ProceduralMaterialBank } from '../textures/ProceduralMaterialBank.js';
import { CollisionWorld } from '../world/CollisionWorld.js';
import { WorldStreamer } from '../world/WorldStreamer.js';
import { createPlayerModel } from '../player/PlayerModelGenerator.js';
import { PlayerAnimator } from '../player/PlayerAnimator.js';
import { PlayerController } from '../player/PlayerController.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { TouchControls } from '../input/TouchControls.js';
import { GameHUD } from '../ui/GameHUD.js';

export class Game {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.renderer = options.renderer;
    this.onBackToMenu = options.onBackToMenu || (() => {});

    this.worldSeed = options.seed || 1337;
    this.quality = options.quality || 'medium';
    this.isRunning = false;
    this.isPaused = false;

    // Timing
    this.physicsStep = 1 / 60;
    this.accumulator = 0;
    this.lastTime = performance.now();

    // Auto-downgrade monitor
    this.lowFpsDuration = 0;
    this.fpsCount = 0;
    this.fpsTimer = performance.now();
    this.currentFps = 60;

    let storedBrightness = 1.25;
    try {
      const saved = localStorage.getItem('game_brightness');
      if (saved !== null) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 2.5) {
          storedBrightness = parsed;
        }
      }
    } catch (e) {}

    this.brightness = storedBrightness;
    this.initScene();
    this.initWorld();
    this.initPlayer();
    this.initUI();
    this.applyQuality(this.quality);
    this.setBrightness(this.gameHUD ? this.gameHUD.brightness : this.brightness);

    this.animate = this.animate.bind(this);
  }

  initScene() {
    this.scene = new THREE.Scene();

    // Natural dusty post-apocalyptic daylight sky (no blood-red fog!)
    const bgCol = 0xb5b0a4;
    this.scene.background = new THREE.Color(bgCol);
    this.scene.fog = new THREE.Fog(bgCol, 35, 220);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);

    // Directional Overhead Sun following player with crisp daylight shadows
    this.dirLight = new THREE.DirectionalLight(0xfff8ee, 2.6);
    this.dirLight.position.set(10, 65, 14);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.near = 1;
    this.dirLight.shadow.camera.far = 140;
    this.dirLight.shadow.camera.left = -28;
    this.dirLight.shadow.camera.right = 28;
    this.dirLight.shadow.camera.top = 28;
    this.dirLight.shadow.camera.bottom = -28;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // Visual Overhead Sun disk in the sky
    const sunGeom = new THREE.SphereGeometry(6.0, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfffae2 });
    this.sunMesh = new THREE.Mesh(sunGeom, sunMat);
    this.scene.add(this.sunMesh);

    // Ambient & Hemisphere Lighting for bright, crisp wasteland visibility
    this.hemiLight = new THREE.HemisphereLight(0x98c5f7, 0x64543e, 1.2);
    this.scene.add(this.hemiLight);

    this.ambLight = new THREE.AmbientLight(0x444038, 0.85);
    this.scene.add(this.ambLight);
  }

  initWorld() {
    this.materialBank = new ProceduralMaterialBank({ seed: this.worldSeed });
    this.collisionWorld = new CollisionWorld(this.worldSeed, 16.0);
    this.worldStreamer = new WorldStreamer(this.scene, this.collisionWorld, this.materialBank, {
      worldSeed: this.worldSeed,
      quality: this.quality
    });
  }

  initPlayer() {
    this.playerModel = createPlayerModel(this.worldSeed);
    this.scene.add(this.playerModel);

    this.playerAnimator = new PlayerAnimator(this.playerModel);
    this.playerController = new PlayerController(this.playerModel);

    // Spawn on the road at (0, heightAt(0,0), 0) facing along +Z
    const spawnY = this.collisionWorld.heightAt(0, 0);
    this.playerController.spawn(0, spawnY, 0, 0);

    // Default to shoulder camera (FOV 60, dist 3.0m, pitch +12 deg, player fills ~50% screen)
    this.thirdPersonCamera = new ThirdPersonCamera(this.camera, {
      mode: 'shoulder',
      initialYaw: 0,
      sensitivity: 0.12
    });
  }

  initUI() {
    this.touchControls = new TouchControls({
      container: this.container,
      onZoom: (delta) => {
        this.thirdPersonCamera.adjustZoom(delta);
      },
      onInteract: () => {
        this.gameHUD?.showToast('No interactive objects in range');
      }
    });

    this.gameHUD = new GameHUD({
      container: this.container,
      sensitivity: 0.12,
      quality: this.quality,
      brightness: this.brightness,
      cameraMode: this.thirdPersonCamera.mode,
      onZoom: (delta) => {
        this.thirdPersonCamera.adjustZoom(delta);
      },
      onPauseToggle: (paused) => {
        this.isPaused = paused;
        if (paused) {
          this.touchControls?.reset();
        }
      },
      onResume: () => {
        this.isPaused = false;
      },
      onSensitivityChange: (sens) => {
        this.thirdPersonCamera.setSensitivity(sens);
      },
      onQualityChange: (q) => {
        this.applyQuality(q);
      },
      onBrightnessChange: (b) => {
        this.setBrightness(b);
      },
      onCameraModeToggle: (mode) => {
        this.setCameraMode(mode);
      },
      onInvertToggle: (invX, invY) => {
        this.touchControls.setInvert(invX, invY);
      },
      onBackToMenu: () => {
        this.stop();
        this.onBackToMenu();
      }
    });

    this.onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', this.onResize);
  }

  setBrightness(factor) {
    this.brightness = Math.max(0.5, Math.min(2.5, factor));
    if (this.renderer) {
      this.renderer.toneMappingExposure = this.brightness;
    }
    if (this.dirLight) this.dirLight.intensity = 2.6 * this.brightness;
    if (this.hemiLight) this.hemiLight.intensity = 1.2 * this.brightness;
    if (this.ambLight) this.ambLight.intensity = 0.85 * this.brightness;
  }

  setCameraMode(mode) {
    this.thirdPersonCamera.setMode(mode);
    if (this.gameHUD && this.gameHUD.cameraMode !== mode) {
      this.gameHUD.setCameraMode(mode);
    }
  }

  applyQuality(tier) {
    this.quality = tier;
    if (this.gameHUD) this.gameHUD.setQuality(tier);
    if (this.worldStreamer) this.worldStreamer.setQuality(tier);
    if (this.materialBank) this.materialBank.setQuality(tier);

    if (tier === 'low') {
      this.renderer.shadowMap.enabled = false;
      this.scene.fog.far = 140;
    } else if (tier === 'medium') {
      this.renderer.shadowMap.enabled = true;
      this.dirLight.shadow.mapSize.width = 1024;
      this.dirLight.shadow.mapSize.height = 1024;
      this.dirLight.shadow.map?.dispose();
      this.dirLight.shadow.map = null;
      this.scene.fog.far = 220;
    } else if (tier === 'high') {
      this.renderer.shadowMap.enabled = true;
      this.dirLight.shadow.mapSize.width = 2048;
      this.dirLight.shadow.mapSize.height = 2048;
      this.dirLight.shadow.map?.dispose();
      this.dirLight.shadow.map = null;
      this.scene.fog.far = 260;
    }
  }

  start() {
    this.isRunning = true;
    this.isPaused = false;
    this.lastTime = performance.now();
    this.touchControls.setVisible(true);
    this.gameHUD.setVisible(true);
    requestAnimationFrame(this.animate);
  }

  stop() {
    this.isRunning = false;
    this.touchControls?.setVisible(false);
    this.gameHUD?.setVisible(false);
  }

  animate(now) {
    if (!this.isRunning) return;
    requestAnimationFrame(this.animate);

    const delta = Math.min((now - this.lastTime) * 0.001, 0.1);
    this.lastTime = now;

    // FPS calculation & Auto-downgrade monitoring
    this.fpsCount++;
    if (now - this.fpsTimer >= 500) {
      this.currentFps = (this.fpsCount * 1000) / (now - this.fpsTimer);
      const ft = 1000 / Math.max(1, this.currentFps);
      this.fpsTimer = now;
      this.fpsCount = 0;

      // Auto-downgrade check (FPS < 45 for 3s)
      if (this.currentFps < 45 && !this.isPaused) {
        this.lowFpsDuration += 0.5;
        if (this.lowFpsDuration >= 3.0) {
          this.lowFpsDuration = 0;
          if (this.quality === 'high') {
            this.applyQuality('medium');
            this.gameHUD.showToast('Performance: Auto-switched to Medium');
          } else if (this.quality === 'medium') {
            this.applyQuality('low');
            this.gameHUD.showToast('Performance: Auto-switched to Low');
          }
        }
      } else {
        this.lowFpsDuration = Math.max(0, this.lowFpsDuration - 0.5);
      }

      this.gameHUD.updateTelemetry({
        fps: this.currentFps,
        frameTimeMs: ft,
        drawCalls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles
      });
    }

    if (this.isPaused) {
      // Physics, input, and animation are frozen; render continues dimmed
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // 1. Fixed Timestep Physics Loop (60 Hz)
    this.accumulator += delta;
    let latestMoveState = null;

    while (this.accumulator >= this.physicsStep) {
      const input = this.touchControls.poll();

      // Look drag applies directly to camera orientation
      if (input.lookDX !== 0 || input.lookDY !== 0) {
        this.thirdPersonCamera.handleLook(input.lookDX, input.lookDY);
      }

      latestMoveState = this.playerController.update(
        this.physicsStep,
        input,
        this.thirdPersonCamera.yaw,
        this.collisionWorld
      );

      this.playerAnimator.update(this.physicsStep, latestMoveState);
      this.accumulator -= this.physicsStep;
    }

    // 2. Camera Update (with wall and ground collision)
    this.thirdPersonCamera.update(
      delta,
      this.playerController.position,
      this.playerController.isCrouching,
      this.playerController.isSprinting,
      this.collisionWorld
    );

    // 3. World Streaming around Player
    this.worldStreamer.update(this.playerController.position);

    // 4. Directional overhead sun and shadow follows player
    const pPos = this.playerController.position;
    this.dirLight.position.set(pPos.x + 10, pPos.y + 65, pPos.z + 14);
    this.dirLight.target.position.set(pPos.x, pPos.y, pPos.z);
    this.dirLight.target.updateMatrixWorld();
    if (this.sunMesh) {
      this.sunMesh.position.set(pPos.x + 35, pPos.y + 220, pPos.z + 45);
    }

    // 5. Update HUD Vitals, Compass & Minimap
    this.gameHUD.setStamina(this.playerController.stamina);
    this.gameHUD.updateCompass(this.thirdPersonCamera.yaw);
    this.gameHUD.renderMinimap(
      this.playerController,
      this.thirdPersonCamera.yaw,
      this.worldStreamer.activeBuildings,
      this.worldStreamer.roadSplinePoints
    );

    // 6. Render Frame
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    this.touchControls?.dispose();
    this.gameHUD?.dispose();
    this.worldStreamer?.dispose();
    this.materialBank?.dispose();
    this.collisionWorld?.clear();
  }
}
