import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  validateAssetResult,
  computeBoundsAndTriangles,
  ensureIndexed,
  safeMergeGeometries,
  buildSceneGroup,
  MATERIAL_KEYS
} from '../src/core/AssetContract.js';

test('ensureIndexed and safeMergeGeometries', () => {
  const geom1 = new THREE.BoxGeometry(1, 1, 1);
  const geom2 = new THREE.BoxGeometry(2, 2, 2);

  const merged = safeMergeGeometries([geom1, geom2]);
  assert.ok(merged, 'Merged geometry should exist');
  assert.ok(merged.index, 'Merged geometry should have index');
  assert.strictEqual(merged.index.count, geom1.index.count + geom2.index.count);
});

test('computeBoundsAndTriangles calculation', () => {
  const geom = new THREE.BoxGeometry(2, 4, 6);
  const entries = [
    {
      geometry: geom,
      materialKey: MATERIAL_KEYS.CONCRETE,
      transform: { position: [10, 0, 0] }
    }
  ];

  const info = computeBoundsAndTriangles(entries);
  assert.strictEqual(info.triangles, 12, 'BoxGeometry has 12 triangles');
  assert.strictEqual(info.boundsAABB.min[0], 9);
  assert.strictEqual(info.boundsAABB.max[0], 11);
  assert.strictEqual(info.boundsAABB.min[1], -2);
  assert.strictEqual(info.boundsAABB.max[1], 2);
});

test('validateAssetResult enforces strict schema', () => {
  const valid = {
    geometries: [
      {
        geometry: new THREE.BufferGeometry(),
        materialKey: MATERIAL_KEYS.RUST
      }
    ],
    metadata: {
      triangles: 0,
      boundsAABB: { min: [0, 0, 0], max: [1, 1, 1] }
    }
  };
  assert.strictEqual(validateAssetResult(valid), true);

  assert.throws(() => validateAssetResult(null));
  assert.throws(() => validateAssetResult({ geometries: 'not-array' }));
  assert.throws(() => validateAssetResult({ geometries: [], metadata: { triangles: 'abc' } }));
});

test('buildSceneGroup creates Three.js hierarchy with names and vertex colors', () => {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0,0,0, 1,0,0, 0,1,0]), 3));
  geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1,0,0, 0,1,0, 0,0,1]), 3));

  const assetResult = {
    geometries: [
      {
        name: 'testMesh',
        geometry: geom,
        materialKey: MATERIAL_KEYS.ASPHALT,
        transform: { position: [1, 2, 3] }
      }
    ],
    metadata: { name: 'TestAsset', triangles: 1, boundsAABB: { min: [0,0,0], max: [1,1,1] } },
    updateAnimation: (t, dt, group) => { group.userData.t = t; }
  };

  const group = buildSceneGroup(assetResult);
  assert.strictEqual(group.name, 'TestAsset');
  assert.strictEqual(group.children.length, 1);
  const mesh = group.children[0];
  assert.strictEqual(mesh.name, 'testMesh');
  assert.strictEqual(mesh.position.x, 1);
  assert.strictEqual(mesh.position.y, 2);
  assert.strictEqual(mesh.position.z, 3);
  assert.strictEqual(mesh.material.vertexColors, true, 'Vertex colors should be enabled on material');

  assert.ok(typeof group.userData.updateAnimation === 'function');
  group.userData.updateAnimation(0.5, 0.016);
  assert.strictEqual(group.userData.t, 0.5);
});

test('All generators strictly implement AssetContract schema and updateAnimation', async () => {
  const { generate: genBuilding } = await import('../src/generators/BuildingGenerator.js');
  const { generate: genTerrain } = await import('../src/generators/TerrainGenerator.js');
  const { generate: genProps } = await import('../src/generators/PropsGenerator.js');
  const { generate: genTree } = await import('../src/generators/TreeGenerator.js');
  const { generate: genDrone } = await import('../src/generators/DroneGenerator.js');

  const generators = [
    { name: 'Building', fn: genBuilding },
    { name: 'Terrain', fn: genTerrain },
    { name: 'Props', fn: genProps },
    { name: 'Tree', fn: genTree },
    { name: 'Drone', fn: genDrone }
  ];

  for (const { name, fn } of generators) {
    const res = fn(1234, 0);
    assert.ok(validateAssetResult(res), `${name} must pass validateAssetResult`);
    assert.strictEqual(typeof res.updateAnimation, 'function', `${name} must export updateAnimation function`);
    for (const entry of res.geometries) {
      assert.ok(entry.name, `${name} geometry entry must have an identifiable name`);
    }
  }
});
