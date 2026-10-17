import test from 'node:test';
import assert from 'node:assert/strict';
import { ProceduralMaterialBank } from '../src/textures/ProceduralMaterialBank.js';
import { MATERIAL_KEYS } from '../src/core/AssetContract.js';

test('ProceduralMaterialBank initializes all post-apocalyptic PBR materials', () => {
  const bank = new ProceduralMaterialBank({ seed: 5555, resolution: 128 });

  const requiredKeys = Object.values(MATERIAL_KEYS);
  for (const key of requiredKeys) {
    const mat = bank.get(key);
    assert.ok(mat, `Material for key ${key} should exist`);
    assert.strictEqual(mat.isMeshStandardMaterial, true);
  }

  // Strict check: rust, concrete, asphalt, soot must have albedo, roughness, and bump maps
  const corePbrKeys = [MATERIAL_KEYS.RUST, MATERIAL_KEYS.CONCRETE, MATERIAL_KEYS.ASPHALT, MATERIAL_KEYS.SOOT];
  for (const key of corePbrKeys) {
    const mat = bank.get(key);
    assert.ok(mat.map, `Material ${key} must have an albedo map`);
    assert.ok(mat.roughnessMap, `Material ${key} must have a roughnessMap`);
    assert.ok(mat.bumpMap, `Material ${key} must have a bumpMap`);
  }

  // Wireframe toggle
  bank.setWireframe(true);
  for (const mat of bank.materials.values()) {
    assert.strictEqual(mat.wireframe, true);
  }

  bank.setWireframe(false);
  for (const mat of bank.materials.values()) {
    assert.strictEqual(mat.wireframe, false);
  }

  bank.dispose();
  assert.strictEqual(bank.materials.size, 0);
  assert.strictEqual(bank.textures.length, 0);
});
