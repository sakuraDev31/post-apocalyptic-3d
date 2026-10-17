import test from 'node:test';
import assert from 'node:assert/strict';
import { generate as generateBuilding } from '../src/generators/BuildingGenerator.js';
import { BUILDING_ARCHETYPES, getArchetypeById } from '../src/generators/BuildingCatalog.js';
import { validateAssetResult } from '../src/core/AssetContract.js';

test('BuildingCatalog contains 6 distinct post-apocalyptic archetypes', () => {
  assert.strictEqual(BUILDING_ARCHETYPES.length, 6);
  for (let id = 1; id <= 6; id++) {
    const arch = getArchetypeById(id);
    assert.ok(arch, `Archetype ID ${id} must exist in catalog`);
    assert.strictEqual(arch.id, id);
    assert.ok(arch.name);
    assert.ok(arch.key);
  }
});

test('All 6 building archetypes conform to contract, polygon budgets, draw calls, and colliders', () => {
  for (const arch of BUILDING_ARCHETYPES) {
    // 1. LOD 0 Test
    const resLOD0 = generateBuilding(9876, 0, { archetype: arch.key });
    assert.ok(validateAssetResult(resLOD0), `Archetype ${arch.key} failed AssetContract validation`);

    // Budget: <= 1,500 tris at LOD0
    assert.ok(
      resLOD0.metadata.triangles <= 1500,
      `Archetype ${arch.key} LOD0 triangles (${resLOD0.metadata.triangles}) exceeds 1,500 budget`
    );

    // Draw calls: merged per material (<= 4 draws)
    assert.ok(
      resLOD0.geometries.length <= 4,
      `Archetype ${arch.key} geometries length (${resLOD0.geometries.length}) exceeds 4 draws budget`
    );

    // Colliders and doorways check
    assert.ok(Array.isArray(resLOD0.colliders), `Archetype ${arch.key} must return colliders array`);
    assert.ok(resLOD0.colliders.length > 0, `Archetype ${arch.key} must have ground-floor wall colliders`);

    assert.ok(Array.isArray(resLOD0.doorways), `Archetype ${arch.key} must return doorways array`);
    assert.ok(resLOD0.doorways.length > 0, `Archetype ${arch.key} must have at least one walkable doorway`);
    assert.ok(resLOD0.doorways[0].width >= 1.0, `Archetype ${arch.key} doorway width (${resLOD0.doorways[0].width}m) must be walkable (>=1.0m)`);

    // 2. LOD 1 Test (~40% triangle count)
    const resLOD1 = generateBuilding(9876, 1, { archetype: arch.key });
    assert.ok(validateAssetResult(resLOD1));
    assert.ok(
      resLOD1.metadata.triangles <= resLOD0.metadata.triangles * 0.75,
      `Archetype ${arch.key} LOD1 triangles (${resLOD1.metadata.triangles}) should be significantly less than LOD0 (${resLOD0.metadata.triangles})`
    );
  }
});

test('Warehouse and Bunker have open walkable doorway gaps in colliders', () => {
  // Test Warehouse
  const wh = generateBuilding(1111, 0, { archetype: 'warehouse' });
  const whDoor = wh.doorways[0];
  assert.ok(whDoor, 'Warehouse must have a doorway');
  assert.ok(whDoor.width >= 3.0, 'Warehouse roll-up door must be wide (>=3.0m)');

  // Verify that the doorway center (whDoor.position) is NOT blocked by any collider in [0, 2.0] height
  const [dx, dy, dz] = whDoor.position;
  for (const col of wh.colliders) {
    const insideX = dx > col.min[0] + 0.1 && dx < col.max[0] - 0.1;
    const insideZ = dz > col.min[2] + 0.1 && dz < col.max[2] - 0.1;
    const insideY = 1.0 > col.min[1] && 1.0 < col.max[1];
    assert.ok(
      !(insideX && insideZ && insideY),
      `Warehouse doorway at (${dx}, ${dz}) must not be blocked by wall collider!`
    );
  }

  // Test Bunker
  const bu = generateBuilding(2222, 0, { archetype: 'bunker' });
  const buDoor = bu.doorways[0];
  assert.ok(buDoor, 'Bunker must have a doorway');
  assert.ok(buDoor.width >= 1.2, 'Bunker door must be >= 1.2m');

  const [bx, by, bz] = buDoor.position;
  for (const col of bu.colliders) {
    const insideX = bx > col.min[0] + 0.1 && bx < col.max[0] - 0.1;
    const insideZ = bz > col.min[2] + 0.1 && bz < col.max[2] - 0.1;
    const insideY = 1.0 > col.min[1] && 1.0 < col.max[1];
    assert.ok(
      !(insideX && insideZ && insideY),
      `Bunker doorway at (${bx}, ${bz}) must not be blocked by blast wall collider!`
    );
  }
});
