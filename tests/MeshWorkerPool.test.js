import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshWorkerPool } from '../src/workers/MeshWorkerPool.js';
import { validateAssetResult } from '../src/core/AssetContract.js';

test('MeshWorkerPool gracefully falls back in Node and generates valid assets', async () => {
  const pool = new MeshWorkerPool();
  assert.strictEqual(pool.useFallback, true, 'Should use fallback in Node.js headless environment');

  const building = await pool.generate('building', 101, 0);
  assert.ok(validateAssetResult(building));

  const allAssets = await pool.generateAll(202, 0);
  assert.ok(allAssets.building);
  assert.ok(allAssets.terrain);
  assert.ok(allAssets.props);
  assert.ok(allAssets.tree);
  assert.ok(allAssets.drone);
  assert.ok(allAssets.tree2, 'Full diorama must concurrently generate tree2');
  assert.ok(typeof allAssets.totalGenerationTimeMs === 'number');

  // Verify total diorama polygon budget < 25,000 tris (including both tree instances)
  const totalTris = 
    allAssets.building.metadata.triangles +
    allAssets.terrain.metadata.triangles +
    allAssets.props.metadata.triangles +
    allAssets.tree.metadata.triangles +
    allAssets.tree2.metadata.triangles +
    allAssets.drone.metadata.triangles;

  assert.ok(
    totalTris < 25000,
    `Total diorama triangles ${totalTris} exceeds 25,000 budget`
  );

  pool.dispose();
});
