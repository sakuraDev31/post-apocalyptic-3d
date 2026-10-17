import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPlayerModel } from '../src/player/PlayerModelGenerator.js';
import { PlayerAnimator } from '../src/player/PlayerAnimator.js';
import { PlayerController } from '../src/player/PlayerController.js';

test('PlayerModelGenerator creates 1.8m scavenger with named joints within strict budget', () => {
  const model = createPlayerModel(4242);
  assert.ok(model instanceof THREE.Group);
  assert.strictEqual(model.name, 'root');

  // Check required named joints
  const requiredJoints = [
    'root', 'hips', 'spine', 'chest', 'neck', 'head',
    'shoulderL', 'shoulderR', 'elbowL', 'elbowR',
    'hipL', 'hipR', 'kneeL', 'kneeR'
  ];

  const foundJoints = new Set();
  let totalTris = 0;
  let meshCount = 0;
  let sharedMat = null;
  let hasVertexColors = true;

  model.traverse((node) => {
    if (requiredJoints.includes(node.name)) {
      foundJoints.add(node.name);
    }
    if (node.isMesh) {
      meshCount++;
      const g = node.geometry;
      assert.ok(g, 'Every player part mesh must have geometry');
      const tris = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      totalTris += tris;

      if (!g.attributes.color) {
        hasVertexColors = false;
      }

      if (!sharedMat) {
        sharedMat = node.material;
      } else {
        assert.strictEqual(node.material, sharedMat, 'All player meshes must share the exact same single material instance');
      }
    }
  });

  for (const j of requiredJoints) {
    assert.ok(foundJoints.has(j), `Missing required player joint: ${j}`);
  }

  // Polygon budget: <= 1,800 tris
  assert.ok(
    totalTris <= 1800,
    `Player total triangles (${totalTris}) exceeds 1,800 budget`
  );
  assert.ok(totalTris >= 600, `Player total triangles (${totalTris}) unreasonably low`);

  // Draw calls: <= 12 draw calls (meshes sharing material)
  assert.ok(meshCount <= 12, `Player mesh count (${meshCount}) exceeds 12 draw calls budget`);

  // Vertex colors
  assert.ok(hasVertexColors, 'Player geometries must use vertex colors for palette styling');

  // Height check: ~1.8m tall
  const box = new THREE.Box3().setFromObject(model);
  const height = box.max.y - box.min.y;
  assert.ok(
    Math.abs(height - 1.8) < 0.25,
    `Player height (${height.toFixed(2)}m) should be approximately 1.8m`
  );
});

test('PlayerAnimator procedural states and landing squash execute without pops or NaNs', () => {
  const model = createPlayerModel(1234);
  const animator = new PlayerAnimator(model);

  // 1. Idle state update
  animator.update(1 / 60, { speed: 0, isGrounded: true });
  assert.ok(!Number.isNaN(animator.current.hipsY));
  assert.ok(!Number.isNaN(animator.current.spineLeanX));

  // 2. Walk locomotion
  animator.update(1 / 60, { speed: 2.2, isGrounded: true });
  assert.ok(animator.walkPhase > 0, 'Walk phase must advance with speed');

  // 3. Sprint forward lean
  animator.update(1 / 60, { speed: 6.5, isGrounded: true, isSprinting: true });
  assert.ok(animator.current.spineLeanX > 0.05, 'Sprint must trigger forward lean');

  // 4. Crouch state
  animator.update(1 / 60, { speed: 0, isGrounded: true, isCrouching: true });
  assert.ok(animator.current.hipsY < animator.baseHipsY, 'Crouch must lower hips');

  // 5. Jump state
  animator.update(1 / 60, { speed: 0, isGrounded: false, isJumping: true });
  assert.ok(!Number.isNaN(animator.current.armSwingL));

  // 6. Landing squash impulse
  animator.triggerLand();
  animator.update(1 / 60, { speed: 0, isGrounded: true });
  assert.ok(animator.current.rootSquashY < 0, 'Land squash should compress root Y downward');

  // Let squash decay
  animator.update(0.12, { speed: 0, isGrounded: true });
  assert.ok(animator.landSquashTimer === 0, 'Land squash should finish after 0.1s');
});

test('PlayerController kinematic capsule physics, stamina, coyote time, and collision sliding', () => {
  const model = createPlayerModel(5555);
  const controller = new PlayerController(model);

  const mockWorldQuery = {
    heightAt: (x, z) => 0.0,
    queryColliders: (aabb) => []
  };

  controller.spawn(0, 0, 0, 0);
  assert.strictEqual(controller.position.x, 0);
  assert.strictEqual(controller.position.y, 0);
  assert.strictEqual(controller.position.z, 0);

  // 1. Walk input forward along Z
  const walkInput = {
    moveX: 0,
    moveY: 1, // forward
    lookDX: 0,
    lookDY: 0,
    jumpPressed: false,
    sprintHeld: false,
    crouchToggled: false,
    interactPressed: false
  };

  const state1 = controller.update(1 / 60, walkInput, 0, mockWorldQuery);
  assert.ok(controller.position.z > 0, 'Forward input should move along +Z when camera yaw is 0');
  assert.ok(Math.abs(state1.speed - controller.speedRun) < 0.1, 'Full joystick (>0.6) defaults to run speed');

  // 2. Sprint stamina drain & lock below 5
  controller.stamina = 10;
  const sprintInput = { ...walkInput, sprintHeld: true };
  controller.update(0.3, sprintInput, 0, mockWorldQuery);
  assert.ok(controller.stamina < 10, 'Sprinting must drain stamina');

  // Force stamina below 5
  controller.stamina = 4;
  controller.update(1 / 60, sprintInput, 0, mockWorldQuery);
  assert.ok(controller.sprintLocked, 'Sprint must lock below 5 stamina');

  // Release sprint and let stamina regen after 1s delay
  const idleInput = { ...walkInput, moveY: 0, sprintHeld: false };
  controller.update(0.5, idleInput, 0, mockWorldQuery); // during 1s delay
  assert.strictEqual(controller.stamina, 4, 'Stamina should not regen during 1s delay');
  controller.update(0.6, idleInput, 0, mockWorldQuery); // after 1s delay
  assert.ok(controller.stamina > 4, 'Stamina must regen after 1s delay');

  // 3. Jump velocity and gravity
  const jumpInput = { ...idleInput, jumpPressed: true };
  controller.update(1 / 60, jumpInput, 0, mockWorldQuery);
  assert.ok(controller.velocity.y > 5.0, 'Jump must launch upward with ~6.2 m/s velocity');
  assert.strictEqual(controller.isGrounded, false);

  // 4. Wall collision and sliding along XZ
  // Put a wall from x=[1, 3], z=[-2, 2], y=[0, 3]
  const wallCol = {
    min: [1.0, 0.0, -2.0],
    max: [3.0, 3.0, 2.0]
  };
  const mockWorldWithWall = {
    heightAt: (x, z) => 0.0,
    queryColliders: () => [wallCol]
  };

  // Place player right in front of the wall at x=0.8, trying to push diagonally into wall (+X, +Z)
  controller.spawn(0.8, 0, 0, 0);
  const diagInput = {
    moveX: 1, // push right (+X) into wall
    moveY: 1, // push forward (+Z) along wall
    lookDX: 0,
    lookDY: 0,
    jumpPressed: false,
    sprintHeld: false,
    crouchToggled: false,
    interactPressed: false
  };

  controller.update(1 / 60, diagInput, 0, mockWorldWithWall);
  // X must be blocked by wall (x + radius <= 1.0, so x <= 0.65)
  assert.ok(controller.position.x <= 0.66, `Wall should block X penetration (got ${controller.position.x})`);
  // Z should slide freely forward
  assert.ok(controller.position.z > 0, 'Player should slide along Z even while blocked on X');
});
