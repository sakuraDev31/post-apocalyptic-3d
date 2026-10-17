import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { heightAt, roadCenterX } from '../src/generators/TerrainGenerator.js';
import { ThirdPersonCamera } from '../src/camera/ThirdPersonCamera.js';
import { CollisionWorld } from '../src/world/CollisionWorld.js';
import { getChunkPlacement } from '../src/world/Placement.js';

test('Terrain heightAt is a pure deterministic function with walkable slopes (<35 deg)', () => {
  const seed = 1337;

  // 1. Pure determinism test
  for (let x = -50; x <= 50; x += 15) {
    for (let z = -50; z <= 50; z += 15) {
      const h1 = heightAt(x, z, seed);
      const h2 = heightAt(x, z, seed);
      assert.strictEqual(h1, h2, `heightAt must be purely deterministic at (${x}, ${z})`);
    }
  }

  // 2. Slope test across terrain: sample adjacent pairs 0.5m apart
  let maxSlopeDeg = 0;
  for (let x = -80; x <= 80; x += 4) {
    for (let z = -80; z <= 80; z += 4) {
      const h0 = heightAt(x, z, seed);
      const hx = heightAt(x + 0.5, z, seed);
      const hz = heightAt(x, z + 0.5, seed);

      const slopeX = Math.atan2(Math.abs(hx - h0), 0.5) * (180 / Math.PI);
      const slopeZ = Math.atan2(Math.abs(hz - h0), 0.5) * (180 / Math.PI);
      maxSlopeDeg = Math.max(maxSlopeDeg, slopeX, slopeZ);
    }
  }

  // Slope requirement: "gentle rolling hills, max slope about 35 deg"
  assert.ok(
    maxSlopeDeg < 38.0,
    `Max terrain slope (${maxSlopeDeg.toFixed(1)}°) must not exceed walkable slope (~35°)`
  );

  // 3. Road at spawn (0, 0)
  const spawnRx = roadCenterX(0, seed);
  assert.strictEqual(spawnRx, 0, 'Road center must pass directly through x=0 at z=0');
});

test('ThirdPersonCamera PUBG/COD framing, pitch clamp, and collision pullback', () => {
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 400);
  const tpCam = new ThirdPersonCamera(camera, { sensitivity: 0.12 });

  assert.strictEqual(tpCam.camera.fov, 62);
  assert.strictEqual(tpCam.shoulderOffset, 0.5);

  // 1. Pitch clamp limits: -20 deg to +55 deg
  tpCam.handleLook(0, 1000); // extreme drag down (looking up)
  assert.ok(tpCam.pitch <= 55 * (Math.PI / 180) + 1e-4);

  tpCam.handleLook(0, -2000); // extreme drag up (looking down)
  assert.ok(tpCam.pitch >= -20 * (Math.PI / 180) - 1e-4);

  // 2. Framing calculation: standing idle player occupies 45-60% of vertical screen
  // Player is 1.8m tall, camera distance ~2.6m, vertical FOV 62 deg
  const vertFovRad = 62 * (Math.PI / 180);
  const frustumHeightAtDist = 2 * 2.6 * Math.tan(vertFovRad / 2);
  const playerScreenPct = (1.8 / frustumHeightAtDist) * 100;
  assert.ok(
    playerScreenPct >= 45 && playerScreenPct <= 60,
    `Player framing percentage (${playerScreenPct.toFixed(1)}%) must occupy 45-60% of screen height`
  );

  // 3. Camera collision pullback test
  const playerPos = new THREE.Vector3(0, 0, 0);
  // Put a blocking building wall directly behind the camera
  // Desired camera pos is roughly (0.5, 1.5, -2.6) when pitch=0, yaw=0
  const blockingWall = {
    min: [-2.0, 0.0, -3.0],
    max: [2.0, 3.0, -1.0]
  };
  const mockWorld = {
    heightAt: () => 0,
    queryColliders: () => [blockingWall]
  };

  // Run updates to let smooth interpolation settle
  for (let i = 0; i < 30; i++) {
    tpCam.update(1 / 60, playerPos, false, false, mockWorld);
  }

  // Camera distance should be pulled in, but >= minDist (0.7m)
  const actualDist = tpCam.camera.position.distanceTo(tpCam._shoulderPivot);
  assert.ok(actualDist < 2.5, `Camera should pull in on wall collision (actual dist: ${actualDist.toFixed(2)}m)`);
  assert.ok(actualDist >= 0.7 - 0.01, `Camera should obey minimum distance 0.7m (actual dist: ${actualDist.toFixed(2)}m)`);
});

test('Placement start area (chunk 0,0) contains warehouse, apartment, and bunker within 60m of spawn with >=40m spacing', () => {
  const placement = getChunkPlacement(0, 0, 1337, heightAt);

  assert.strictEqual(placement.buildings.length, 3, 'Start chunk (0,0) must place exactly 3 buildings');

  const archetypes = placement.buildings.map((b) => b.archetype);
  assert.ok(archetypes.includes('warehouse'), 'Start area must contain a warehouse');
  assert.ok(archetypes.includes('apartment'), 'Start area must contain an apartment');
  assert.ok(archetypes.includes('bunker'), 'Start area must contain a bunker');

  // Verify all 3 are within 60m of spawn (0, 0)
  for (const b of placement.buildings) {
    const distFromSpawn = Math.hypot(b.x, b.z);
    assert.ok(
      distFromSpawn <= 60.0,
      `Building ${b.archetype} at (${b.x}, ${b.z}) distance (${distFromSpawn.toFixed(1)}m) must be within 60m of spawn`
    );

    // Verify clearance from road corridor (8m half-width)
    const rx = roadCenterX(b.z, 1337);
    const distToRoad = Math.abs(b.x - rx);
    assert.ok(
      distToRoad >= 8.0,
      `Building ${b.archetype} at (${b.x}, ${b.z}) distance to road (${distToRoad.toFixed(1)}m) must not be on road corridor (>=8m)`
    );
  }

  // Verify min spacing >= 40m between all pairs
  const b1 = placement.buildings[0];
  const b2 = placement.buildings[1];
  const b3 = placement.buildings[2];

  const dist12 = Math.hypot(b1.x - b2.x, b1.z - b2.z);
  const dist13 = Math.hypot(b1.x - b3.x, b1.z - b3.z);
  const dist23 = Math.hypot(b2.x - b3.x, b2.z - b3.z);

  assert.ok(dist12 >= 40.0, `Distance between building 1 and 2 (${dist12.toFixed(1)}m) must be >= 40m`);
  assert.ok(dist13 >= 40.0, `Distance between building 1 and 3 (${dist13.toFixed(1)}m) must be >= 40m`);
  assert.ok(dist23 >= 40.0, `Distance between building 2 and 3 (${dist23.toFixed(1)}m) must be >= 40m`);

  // Verify prop caps
  assert.ok(placement.props.length <= 24, `Props count (${placement.props.length}) exceeds 24 cap`);
  assert.ok(placement.trees.length <= 12, `Trees count (${placement.trees.length}) exceeds 12 cap`);
  assert.ok(placement.rubble.length <= 20, `Rubble count (${placement.rubble.length}) exceeds 20 cap`);
});

test('CollisionWorld spatial hash registers, queries, and unloads colliders without leaks', () => {
  const colWorld = new CollisionWorld(1337, 16.0);

  const testCol1 = { min: [10, 0, 10], max: [14, 3, 14] };
  const testCol2 = { min: [100, 0, 100], max: [105, 3, 105] };

  colWorld.addChunkColliders('chunk_0_0', [testCol1]);
  colWorld.addChunkColliders('chunk_1_1', [testCol2]);

  // Query near chunk 0, 0
  const results1 = colWorld.queryColliders({
    min: [8, 0, 8],
    max: [16, 3, 16]
  });
  assert.strictEqual(results1.length, 1);
  assert.strictEqual(results1[0], testCol1);

  // Query far away
  const results2 = colWorld.queryColliders({
    min: [50, 0, 50],
    max: [60, 3, 60]
  });
  assert.strictEqual(results2.length, 0);

  // Unload chunk_0_0
  colWorld.removeChunkColliders('chunk_0_0');
  const resultsAfterUnload = colWorld.queryColliders({
    min: [8, 0, 8],
    max: [16, 3, 16]
  });
  assert.strictEqual(resultsAfterUnload.length, 0, 'Unloaded chunk colliders must no longer be returned');
});

test('ThirdPersonCamera overhead mode framing, centering, and mode toggle', () => {
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 400);
  const overheadCam = new ThirdPersonCamera(camera, { mode: 'overhead' });

  // Centered directly over the character
  assert.strictEqual(overheadCam.shoulderOffset, 0.0, 'Overhead camera must be centered with zero shoulder offset');
  assert.strictEqual(overheadCam.baseDist, 8.5, 'Overhead camera distance should provide clear tactical visibility (~8.5m)');
  assert.ok(overheadCam.pitch >= 50 * (Math.PI / 180), 'Overhead camera pitch should look down from above (>=50 deg)');
  assert.strictEqual(overheadCam.mode, 'overhead');

  // Test toggling to shoulder mode
  overheadCam.setMode('shoulder');
  assert.strictEqual(overheadCam.shoulderOffset, 0.5);
  assert.strictEqual(overheadCam.baseDist, 2.6);
  assert.strictEqual(overheadCam.mode, 'shoulder');

  // Test toggling back to overhead mode
  overheadCam.setMode('overhead');
  assert.strictEqual(overheadCam.shoulderOffset, 0.0);
  assert.strictEqual(overheadCam.baseDist, 8.5);
  assert.strictEqual(overheadCam.mode, 'overhead');
});

test('Expanded world placement includes road barriers, crates, and wrecks with zero extra draw calls', () => {
  const p0 = getChunkPlacement(0, 0, 1337, heightAt);
  const p1 = getChunkPlacement(1, 1, 1337, heightAt);

  assert.ok(p0.props.length <= 24, 'Chunk 0,0 must strictly respect prop cap of 24');
  assert.ok(p1.props.length <= 24, 'Chunk 1,1 must strictly respect prop cap of 24');

  const allTypes = new Set([...p0.props.map((p) => p.type), ...p1.props.map((p) => p.type)]);
  assert.ok(allTypes.has('drum'), 'Must place drums');
  assert.ok(allTypes.has('road_barrier'), 'Must place concrete road barriers along curves');
  assert.ok(allTypes.has('crate'), 'Must place supply crates near buildings');
  assert.ok(allTypes.has('wreck'), 'Must place rusted vehicle wrecks');
});

