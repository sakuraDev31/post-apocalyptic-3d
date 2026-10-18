import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createToonRamp, ProceduralMaterialBank } from '../src/textures/ProceduralMaterialBank.js';
import { getTerrainHeightAt, heightAt, generateTerrainRaw } from '../src/generators/TerrainGenerator.js';
import { addAnimeTimberHouse, addShatteredAnimeHighrise } from '../src/generators/BuildingGenerator.js';
import { addStylizedAnimeTree } from '../src/generators/TreeGenerator.js';
import { addOvergrownTram } from '../src/generators/PropsGenerator.js';
import { CollisionWorld } from '../src/world/CollisionWorld.js';
import { getChunkPlacement } from '../src/world/Placement.js';
import { createPlayerModel } from '../src/player/PlayerModelGenerator.js';
import { PlayerAnimator } from '../src/player/PlayerAnimator.js';
import { ThirdPersonCamera } from '../src/camera/ThirdPersonCamera.js';

test('GENSHIN - 4-step toon ramp DataTexture and ProceduralMaterialBank toon materials', () => {
  const ramp = createToonRamp();
  assert.ok(ramp instanceof THREE.DataTexture);
  assert.strictEqual(ramp.image.width, 4);
  assert.strictEqual(ramp.image.height, 1);
  assert.strictEqual(ramp.minFilter, THREE.NearestFilter);
  assert.strictEqual(ramp.magFilter, THREE.NearestFilter);

  const bank = new ProceduralMaterialBank({ seed: 777 });
  const requiredToonKeys = ['terrain', 'plaster', 'roofTile', 'stone', 'timber', 'foliage', 'leyline', 'goldRing'];
  for (const key of requiredToonKeys) {
    const mat = bank.getToonMaterial(key);
    assert.ok(mat, `Toon material ${key} must exist`);
    if (key === 'leyline' || key === 'goldRing') {
      assert.strictEqual(mat.isMeshStandardMaterial, true);
      assert.ok(mat.emissiveIntensity > 1.0, `${key} must have radiant emissive intensity`);
    } else {
      assert.strictEqual(mat.isMeshToonMaterial, true);
      assert.strictEqual(mat.gradientMap, bank.toonRamp);
      assert.strictEqual(mat.vertexColors, true);
    }
  }
});

test('GENSHIN - Terrain elevation determinism, <35 deg slope, and cel-shaded vertex colors', () => {
  const seed = 1337;
  // Sanctuary central circular plaza height
  assert.strictEqual(getTerrainHeightAt(0, 0, seed), 1.2, 'Central sanctuary radius < 11m must be 1.2m');
  assert.strictEqual(getTerrainHeightAt(0, 26, seed), 0.0, 'City main avenue pavement at z=26 must be 0.0m');

  // Verify slope is strictly walkable (<35 deg) across outer hills
  let maxSlope = 0;
  for (let x = -75; x <= 75; x += 3) {
    for (let z = -75; z <= 75; z += 3) {
      const h0 = getTerrainHeightAt(x, z, seed);
      const hx = getTerrainHeightAt(x + 0.5, z, seed);
      const hz = getTerrainHeightAt(x, z + 0.5, seed);
      const sX = Math.atan2(Math.abs(hx - h0), 0.5) * (180 / Math.PI);
      const sZ = Math.atan2(Math.abs(hz - h0), 0.5) * (180 / Math.PI);
      maxSlope = Math.max(maxSlope, sX, sZ);
    }
  }
  assert.ok(maxSlope < 35.0, `Max terrain slope (${maxSlope.toFixed(1)}°) must be < 35° walkable threshold`);

  // Terrain chunk raw vertex colors
  const raw = generateTerrainRaw(seed, 0, { originX: 0, originZ: 0 });
  assert.ok(raw.colors && raw.colors.length > 0);
  assert.strictEqual(raw.colors.length, raw.positions.length);
});

test('GENSHIN - Anime Timber House and Shattered Highrise exact rotated AABB & elevation offset', () => {
  const prng = () => 0.5;
  const house0 = addAnimeTimberHouse(0, 0, 6.0, 4.0, 2, 0, 0xe76f51, 0x9b2226, prng, 1.5);
  assert.strictEqual(house0.colliders.length, 1);
  const c0 = house0.colliders[0];
  // With rotY = 0, halfX = (6.0+0.4)/2 = 3.2, halfZ = (4.0+0.4)/2 = 2.2
  assert.ok(Math.abs(c0.max[0] - 3.2) < 1e-4, 'Rotated AABB X bound at 0 deg must equal half-width');
  assert.ok(Math.abs(c0.max[2] - 2.2) < 1e-4, 'Rotated AABB Z bound at 0 deg must equal half-depth');
  assert.ok(c0.min[1] >= 1.5 - 1.0, 'Collider must honor terrainY offset');

  // Rotated by 90 deg: X and Z bounds swap
  const house90 = addAnimeTimberHouse(0, 0, 6.0, 4.0, 2, Math.PI / 2, 0xe76f51, 0x9b2226, prng, 0);
  const c90 = house90.colliders[0];
  assert.ok(Math.abs(c90.max[0] - 2.2) < 1e-4, 'Rotated AABB X bound at 90 deg must equal half-depth');
  assert.ok(Math.abs(c90.max[2] - 3.2) < 1e-4, 'Rotated AABB Z bound at 90 deg must equal half-width');

  // Shattered Highrise
  const tower = addShatteredAnimeHighrise(10, 10, 8.0, 8.0, 5, 0, prng, 2.0);
  assert.strictEqual(tower.colliders.length, 1);
  const tc = tower.colliders[0];
  assert.ok(tc.min[1] >= 2.0 - 1.0, 'Tower collider must honor terrainY offset');
  assert.ok(tower.leylineGeos.length > 0, 'Highrise must contain Leyline cone shard');
});

test('GENSHIN - CollisionWorld getHighestSurfaceY handles step-up stairs and sanctuary dais', () => {
  const colWorld = new CollisionWorld(1337, 16.0);

  // Register dais tiers and steps
  const daisColliders = [
    { min: [-10, 0, -10], max: [10, 1.40, 10] }, // Tier 0
    { min: [-8, 0, -8], max: [8, 2.10, 8] },    // Tier 1
    { min: [-6, 0, -6], max: [6, 2.80, 6] },    // Tier 2
    // South avenue step leading from terrain 1.20m to 1.55m
    { min: [-1.8, 0, 9.5], max: [1.8, 1.55, 11.5] }
  ];
  colWorld.addChunkColliders('0,0', daisColliders);

  // 1. From road (y = 1.20) approaching step at z = 10.5
  const stepSurface = colWorld.getHighestSurfaceY(0, 1.20, 10.5);
  assert.strictEqual(stepSurface, 1.55, 'Player at y=1.20 must step up to 1.55m step');

  // 2. Standing on top of Tier 2 at (0, 0)
  const daisTop = colWorld.getHighestSurfaceY(0, 2.80, 0);
  assert.strictEqual(daisTop, 2.80, 'Player on top of sacred dais must stand at 2.80m');

  // 3. Step that is too high (>0.45m step-up from current feet) cannot be climbed
  const groundBelowCliff = colWorld.getHighestSurfaceY(0, 0.0, 0);
  // From 0.0 to 2.80 is 2.8m, exceeding 0.45m step-up
  assert.strictEqual(groundBelowCliff, 1.20, 'Cannot step up 2.8m cliff from y=0.0');
});

test('GENSHIN - Anime Character Rig 12-mesh budget, joints, and cape animation', () => {
  const model = createPlayerModel(555);
  assert.ok(model instanceof THREE.Group);

  const requiredJoints = [
    'root', 'hips', 'torso', 'spine', 'chest', 'neck', 'head', 'neckScarf',
    'shoulderL', 'shoulderR', 'elbowL', 'elbowR',
    'hipL', 'hipR', 'kneeL', 'kneeR'
  ];
  const foundJoints = new Set();
  let meshCount = 0;
  let sharedMat = null;

  model.traverse((node) => {
    if (requiredJoints.includes(node.name)) foundJoints.add(node.name);
    if (node.isMesh) {
      meshCount++;
      if (!sharedMat) sharedMat = node.material;
      else assert.strictEqual(node.material, sharedMat);
    }
  });

  for (const j of requiredJoints) {
    assert.ok(foundJoints.has(j), `Missing joint: ${j}`);
  }
  assert.ok(meshCount <= 12, `Mesh count (${meshCount}) must be <= 12`);
  assert.strictEqual(sharedMat.isMeshToonMaterial, true, 'Player material must be MeshToonMaterial');

  // Dynamic scarf / cape animation
  const animator = new PlayerAnimator(model);
  const scarfNode = model.getObjectByName('neckScarf');
  assert.ok(scarfNode, 'Model must have neckScarf joint');

  // Sprint locomotion animates billowing cape
  for (let i = 0; i < 15; i++) {
    animator.update(1 / 60, { speed: 6.5, isGrounded: true, isSprinting: true });
  }
  assert.ok(animator.current.scarfPitchX > 0.3, 'Sprint must billow scarf backward');
  assert.ok(Math.abs(scarfNode.rotation.x) > 0.05, 'Scarf joint rotation must be driven by animator');
});

test('GENSHIN - ThirdPersonCamera honors elevated platform clearance without clipping', () => {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);
  const tpCam = new ThirdPersonCamera(camera);

  // Player stands on dais at (0, 2.8, 0)
  const playerPos = new THREE.Vector3(0, 2.8, 0);
  const platformQuery = {
    heightAt: () => 1.2,
    getHighestSurfaceY: (x, y, z) => 2.80,
    queryColliders: () => []
  };

  tpCam.pitch = 0;
  tpCam.yaw = 0;
  for (let i = 0; i < 30; i++) {
    tpCam.update(1 / 60, playerPos, false, false, platformQuery);
  }

  // Camera Y must stay >= 2.80 + 0.3 = 3.10m above elevated platform
  assert.ok(
    tpCam.camera.position.y >= 2.80 + 0.3 - 0.01,
    `Camera Y (${tpCam.camera.position.y.toFixed(2)}) must stay >= 0.3m above platform surface`
  );
});
