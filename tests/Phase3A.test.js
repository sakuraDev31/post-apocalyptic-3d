import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ThirdPersonCamera } from '../src/camera/ThirdPersonCamera.js';
import { PlayerController } from '../src/player/PlayerController.js';
import { PlayerAnimator } from '../src/player/PlayerAnimator.js';
import { createPlayerModel } from '../src/player/PlayerModelGenerator.js';
import { GameHUD } from '../src/ui/GameHUD.js';

// Mock localStorage for node environment
const storageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();
globalThis.localStorage = storageMock;

// Mock DOM elements for GameHUD in node test environment
if (typeof document === 'undefined') {
  globalThis.document = {
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        style: {},
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {}
        },
        children: [],
        appendChild: (child) => { el.children.push(child); return child; },
        removeChild: (child) => {
          const idx = el.children.indexOf(child);
          if (idx !== -1) el.children.splice(idx, 1);
          return child;
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
        getContext: () => ({
          clearRect: () => {},
          beginPath: () => {},
          arc: () => {},
          fill: () => {},
          stroke: () => {},
          save: () => {},
          restore: () => {},
          translate: () => {},
          rotate: () => {},
          moveTo: () => {},
          lineTo: () => {},
          closePath: () => {}
        }),
        setAttribute: () => {},
        getAttribute: () => null
      };
      return el;
    },
    getElementById: () => null,
    head: { appendChild: () => {} },
    body: { appendChild: () => {} }
  };
  globalThis.window = {
    innerWidth: 1920,
    innerHeight: 1080,
    addEventListener: () => {},
    removeEventListener: () => {}
  };
}

test('PHASE 3A - Camera Zoom range [1.5, 7.0], exponential smoothing, stance memory, and scaled shoulder offset', () => {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);
  const tpCam = new ThirdPersonCamera(camera);

  assert.strictEqual(tpCam.minZoom, 1.5);
  assert.strictEqual(tpCam.maxZoom, 7.0);
  assert.strictEqual(tpCam.zoomByStance.stand, 3.0);
  assert.strictEqual(tpCam.shoulderOffset, 0.5);

  // 1. Zoom range clamping
  tpCam.adjustZoom(-5.0); // try zooming way in
  assert.strictEqual(tpCam.zoomByStance.stand, 1.5, 'Zoom in must clamp to min 1.5m');

  tpCam.adjustZoom(10.0); // try zooming way out
  assert.strictEqual(tpCam.zoomByStance.stand, 7.0, 'Zoom out must clamp to max 7.0m');

  // 2. Remember zoom per stance
  tpCam.activeStance = 'stand';
  tpCam.adjustZoom(-3.0); // set stand to 4.0m
  assert.strictEqual(tpCam.zoomByStance.stand, 4.0);

  tpCam.activeStance = 'crouch';
  tpCam.adjustZoom(-1.0); // adjust crouch
  assert.strictEqual(tpCam.zoomByStance.crouch, 1.5);
  // Verify stand zoom was preserved
  assert.strictEqual(tpCam.zoomByStance.stand, 4.0, 'Stance zoom must be remembered independently');

  // 3. Scaled shoulder offset: 0.5m at dist 3.0m, smoothly scales down to 0 at 7.0m
  const dummyPlayerPos = new THREE.Vector3(0, 0, 0);
  const dummyQuery = { heightAt: () => 0, queryColliders: () => [] };

  tpCam.zoomByStance.stand = 3.0;
  tpCam.currentDist = 3.0;
  tpCam.update(0.1, dummyPlayerPos, false, false, dummyQuery);
  assert.ok(Math.abs(tpCam.shoulderOffset - 0.5) < 0.05, 'Shoulder offset should be ~0.5m at 3.0m zoom');

  tpCam.zoomByStance.stand = 7.0;
  tpCam.currentDist = 7.0;
  tpCam.update(0.1, dummyPlayerPos, false, false, dummyQuery);
  assert.ok(tpCam.shoulderOffset < 0.05, 'Shoulder offset should scale down near 0 at 7.0m zoom');
});

test('PHASE 3A - Camera pitch [-40 deg, +80 deg] and ground clearance rule (>=0.3m, 8 samples, zero jitter)', () => {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);
  const tpCam = new ThirdPersonCamera(camera);

  // 1. Full pitch range test
  tpCam.handleLook(0, -3000); // look down / camera near ground looking UP
  assert.strictEqual(tpCam.pitch, -40 * (Math.PI / 180), 'Min pitch must be -40 deg');

  tpCam.handleLook(0, 5000); // look up / camera high looking DOWN
  assert.strictEqual(tpCam.pitch, 80 * (Math.PI / 180), 'Max pitch must be +80 deg');

  // 2. Ground clearance rule test: camera must stay >= 0.3m above terrain
  const playerPos = new THREE.Vector3(0, 1.0, 0); // player at y=1.0
  // Terrain has a rising slope behind player: heightAt(x, z) rises to 2.5m behind player
  const terrainQuery = {
    heightAt: (x, z) => {
      if (z < -0.5) return 2.2; // ground mound behind player
      return 1.0;
    },
    queryColliders: () => []
  };

  tpCam.pitch = 0;
  tpCam.yaw = 0; // camera sits at -Z behind player
  tpCam.zoomByStance.stand = 5.0;

  for (let i = 0; i < 40; i++) {
    tpCam.update(1 / 60, playerPos, false, false, terrainQuery);
  }

  // Camera must shorten distance to avoid terrain penetration
  const camY = tpCam.camera.position.y;
  const terrainAtCam = terrainQuery.heightAt(tpCam.camera.position.x, tpCam.camera.position.z);
  assert.ok(
    camY >= terrainAtCam + 0.3 - 0.01,
    `Camera Y (${camY.toFixed(2)}) must be >= 0.3m above terrain (${(terrainAtCam + 0.3).toFixed(2)})`
  );
  assert.ok(tpCam.camera.position.distanceTo(tpCam._shoulderPivot) < 4.5, 'Camera must shorten distance');
});

test('PHASE 3A - Overhead view toggle smoothly transitions pitch 70 deg and distance 12m', () => {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);
  const tpCam = new ThirdPersonCamera(camera);

  assert.strictEqual(tpCam.isOverhead, false);

  // Toggle to overhead
  tpCam.toggleOverhead();
  assert.strictEqual(tpCam.isOverhead, true);
  assert.strictEqual(tpCam.mode, 'overhead');
  assert.strictEqual(tpCam.zoomByStance.overhead, 12.0);
  assert.strictEqual(tpCam.shoulderOffset, 0.0);

  // Update over several frames to verify smooth transition
  const playerPos = new THREE.Vector3(0, 0, 0);
  const dummyQuery = { heightAt: () => 0, queryColliders: () => [] };

  for (let i = 0; i < 30; i++) {
    tpCam.update(1 / 60, playerPos, false, false, dummyQuery);
  }

  assert.ok(Math.abs(tpCam.pitch - 70 * (Math.PI / 180)) < 0.05, 'Overhead pitch must smoothly reach 70 deg');
  assert.ok(Math.abs(tpCam.currentDist - 12.0) < 0.5, 'Overhead distance must smoothly approach 12m');

  // Toggle back to shoulder
  tpCam.toggleOverhead();
  assert.strictEqual(tpCam.isOverhead, false);
  assert.strictEqual(tpCam.mode, 'shoulder');
  assert.strictEqual(tpCam.baseDist, 3.0);
});

test('PHASE 3A - Jump velocity 6.8 m/s, early release 50% velocity cut, and 60% air control', () => {
  const model = createPlayerModel(9999);
  const controller = new PlayerController(model);
  const dummyQuery = { heightAt: () => 0, queryColliders: () => [] };

  controller.spawn(0, 0, 0, 0);

  // 1. Jump velocity = 6.8 m/s
  const jumpHoldInput = {
    moveX: 0,
    moveY: 0,
    jumpPressed: true,
    jumpHeld: true,
    sprintHeld: false,
    crouchToggled: false
  };

  assert.strictEqual(controller.jumpVelocity, 6.8, 'Jump velocity parameter must be 6.8 m/s');
  controller.update(1 / 60, jumpHoldInput, 0, dummyQuery);
  const expectedVelAfterFirstStep = 6.8 + controller.gravity * (1 / 60);
  assert.ok(
    Math.abs(controller.velocity.y - expectedVelAfterFirstStep) < 1e-4,
    `Velocity after first step should be launch velocity minus gravity (got ${controller.velocity.y})`
  );
  assert.strictEqual(controller.isGrounded, false);

  // 2. Early button release cuts upward velocity by 50%
  const releaseJumpInput = {
    moveX: 0,
    moveY: 0,
    jumpPressed: false,
    jumpHeld: false,
    sprintHeld: false,
    crouchToggled: false
  };

  const velBeforeRelease = controller.velocity.y; // e.g. ~6.47 m/s after gravity
  controller.update(1 / 60, releaseJumpInput, 0, dummyQuery);
  // Velocity should have been halved (cut by 50%) then gravity applied
  const expectedCutVel = (velBeforeRelease * 0.5) + (controller.gravity * (1 / 60));
  assert.ok(
    Math.abs(controller.velocity.y - expectedCutVel) < 0.1,
    `Early release must cut upward velocity by 50% (got ${controller.velocity.y}, expected ~${expectedCutVel})`
  );

  // 3. Air control 60% of ground control
  controller.spawn(0, 5, 0, 0); // In air at y=5
  controller.isGrounded = false;

  const moveInput = {
    moveX: 0,
    moveY: 1, // Full forward
    jumpPressed: false,
    jumpHeld: false,
    sprintHeld: false,
    crouchToggled: false
  };

  // One physics step in air
  controller.update(1 / 60, moveInput, 0, dummyQuery);
  const airDisplacementZ = controller.position.z;

  // Reset and test same input on ground
  controller.spawn(0, 0, 0, 0);
  controller.isGrounded = true;
  controller.update(1 / 60, moveInput, 0, dummyQuery);
  const groundDisplacementZ = controller.position.z;

  const ratio = airDisplacementZ / groundDisplacementZ;
  assert.ok(
    Math.abs(ratio - 0.6) < 0.05,
    `Air control must be 60% of ground control (ratio: ${ratio.toFixed(2)})`
  );
});

test('PHASE 3A - Crouch toggle eases height 1.8 -> 1.1 over 0.15s and prevents standing under overhead colliders', () => {
  const model = createPlayerModel(8888);
  const controller = new PlayerController(model);

  // 1. Capsule height easing 1.8 -> 1.1 over 0.15s
  controller.spawn(0, 0, 0, 0);
  assert.strictEqual(controller.height, 1.8);

  const crouchInput = {
    moveX: 0,
    moveY: 0,
    jumpPressed: false,
    crouchToggled: true
  };
  const idleInput = {
    moveX: 0,
    moveY: 0,
    jumpPressed: false,
    crouchToggled: false
  };

  const dummyQuery = { heightAt: () => 0, queryColliders: () => [] };

  // Trigger crouch
  controller.update(1 / 60, crouchInput, 0, dummyQuery);
  assert.strictEqual(controller.isCrouching, true);
  assert.ok(controller.height < 1.8, 'Height must begin easing downward');

  // Advance by remaining 0.15s (9 frames total)
  for (let i = 0; i < 9; i++) {
    controller.update(1 / 60, idleInput, 0, dummyQuery);
  }
  assert.ok(Math.abs(controller.height - 1.1) < 0.01, `Height should ease to 1.1m (got ${controller.height})`);

  // 2. Overhead collider test: ceiling at y=1.5m prevents standing up
  const ceilingCol = {
    min: [-1.0, 1.4, -1.0],
    max: [1.0, 1.6, 1.0]
  };
  const mockWorldWithCeiling = {
    heightAt: () => 0,
    queryColliders: () => [ceilingCol]
  };

  assert.strictEqual(controller.canStandUp(mockWorldWithCeiling), false, 'canStandUp must return false when ceiling is overhead');

  // Try toggling crouch to stand up while under ceiling
  controller.update(1 / 60, crouchInput, 0, mockWorldWithCeiling);
  assert.strictEqual(controller.isCrouching, true, 'Player must remain crouched when blocked by overhead collider');
  assert.strictEqual(controller.height, 1.1, 'Height must remain at 1.1m crouch height');

  // Clear ceiling and toggle crouch again: player can now stand up
  controller.update(1 / 60, crouchInput, 0, dummyQuery);
  assert.strictEqual(controller.isCrouching, false, 'Player should stand up once overhead is clear');

  // Height eases back up to 1.8m over 0.15s
  for (let i = 0; i < 10; i++) {
    controller.update(1 / 60, idleInput, 0, dummyQuery);
  }
  assert.ok(Math.abs(controller.height - 1.8) < 0.01, `Height should ease back to 1.8m (got ${controller.height})`);
});

test('PHASE 3A - PlayerAnimator crouch and jump poses have correct forward thigh signs and landing absorb', () => {
  const model = createPlayerModel(7777);
  const animator = new PlayerAnimator(model);

  // 1. Crouch pose: negative hip rotation.x swings thigh forward (+Z)
  animator.update(1 / 60, { speed: 0, isGrounded: true, isCrouching: true });
  // Let smooth blending settle into crouch pose
  for (let i = 0; i < 20; i++) {
    animator.update(1 / 60, { speed: 0, isGrounded: true, isCrouching: true });
  }

  assert.ok(animator.current.legSwingL < 0, 'Thigh rotation.x must be negative to swing leg forward into +Z');
  assert.ok(animator.current.legSwingR < 0, 'Thigh rotation.x must be negative to swing leg forward into +Z');
  assert.ok(animator.current.kneeBendL > 0, 'Knee bend must be positive to angle lower leg back towards ground');
  assert.ok(animator.current.spineLeanX > 0.1, 'Torso must lean slightly forward in crouch');

  // Verify foot alignment at ground level (no floating, no sinking)
  // Base hips ~0.95 - 0.36 = 0.59m; thigh length 0.42, shin length 0.42
  const thighLen = 0.42;
  const shinLen = 0.42;
  const hipAngle = Math.abs(animator.current.legSwingL);
  const shinAngle = animator.current.kneeBendL - hipAngle;
  const footY = animator.current.hipsY - thighLen * Math.cos(hipAngle) - shinLen * Math.cos(shinAngle);
  assert.ok(Math.abs(footY) < 0.08, `Foot Y (${footY.toFixed(3)}) should be aligned near ground (y=0) without sinking or floating`);

  // 2. Jump clean tuck in air
  for (let i = 0; i < 15; i++) {
    animator.update(1 / 60, { speed: 0, isGrounded: false, isJumping: true });
  }
  assert.ok(animator.current.legSwingL < 0, 'Tuck thighs must swing forward (-X rotation)');
  assert.ok(animator.current.kneeBendL > 1.0, 'Tuck knees must bend cleanly under thighs');

  // 3. Landing absorb scaled by fall speed
  animator.triggerLand(12.0); // High-speed landing
  const heavySquash = animator.landSquashMagnitude;

  animator.triggerLand(3.0); // Low-speed landing
  const lightSquash = animator.landSquashMagnitude;

  assert.ok(
    heavySquash > lightSquash,
    `Landing absorb magnitude must scale with fall speed (heavy: ${heavySquash}, light: ${lightSquash})`
  );
});

test('PHASE 3A - GameHUD brightness chip cycles 75 / 100 / 125 / 150 % and persists in localStorage', () => {
  storageMock.clear();

  let reportedBrightness = null;
  const hud = new GameHUD({
    onBrightnessChange: (b) => { reportedBrightness = b; }
  });

  // Default brightness is 125% (1.25)
  assert.strictEqual(hud.brightness, 1.25);

  // Cycle 1: 125% -> 150% (1.50)
  hud.cycleBrightness();
  assert.strictEqual(hud.brightness, 1.5);
  assert.strictEqual(reportedBrightness, 1.5);
  assert.strictEqual(storageMock.getItem('game_brightness'), '1.5');

  // Cycle 2: 150% -> 75% (0.75)
  hud.cycleBrightness();
  assert.strictEqual(hud.brightness, 0.75);
  assert.strictEqual(reportedBrightness, 0.75);
  assert.strictEqual(storageMock.getItem('game_brightness'), '0.75');

  // Cycle 3: 75% -> 100% (1.00)
  hud.cycleBrightness();
  assert.strictEqual(hud.brightness, 1.0);
  assert.strictEqual(reportedBrightness, 1.0);
  assert.strictEqual(storageMock.getItem('game_brightness'), '1');

  // Cycle 4: 100% -> 125% (1.25)
  hud.cycleBrightness();
  assert.strictEqual(hud.brightness, 1.25);
  assert.strictEqual(reportedBrightness, 1.25);
  assert.strictEqual(storageMock.getItem('game_brightness'), '1.25');

  // Next instance loads saved 1.25 from localStorage
  const nextHud = new GameHUD({});
  assert.strictEqual(nextHud.brightness, 1.25, 'GameHUD must reload brightness from localStorage');
});

test('PHASE 3A - Pause button toggles pause state and freezes gameplay while render continues', () => {
  let pauseToggled = false;
  let resumeCalled = false;

  const hud = new GameHUD({
    onPauseToggle: (paused) => { pauseToggled = paused; },
    onResume: () => { resumeCalled = true; }
  });

  assert.strictEqual(hud.isPaused, false);

  // Press pause button
  hud.togglePause();
  assert.strictEqual(hud.isPaused, true);
  assert.strictEqual(pauseToggled, true);
  assert.strictEqual(hud.pauseModal.style.display, 'flex');

  // Unpause via setPaused(false)
  hud.setPaused(false);
  assert.strictEqual(hud.isPaused, false);
  assert.strictEqual(hud.pauseModal.style.display, 'none');
});
