import test from 'node:test';
import assert from 'node:assert/strict';
import { generate as generateBuilding } from '../src/generators/BuildingGenerator.js';
import { generate as generateTerrain } from '../src/generators/TerrainGenerator.js';
import { generate as generateProps } from '../src/generators/PropsGenerator.js';
import { generate as generateTree } from '../src/generators/TreeGenerator.js';
import { generate as generateDrone, animateDrone } from '../src/generators/DroneGenerator.js';
import { validateAssetResult, buildSceneGroup } from '../src/core/AssetContract.js';

test('BuildingGenerator conforms to contract and polygon budget', () => {
  const result = generateBuilding(1234, 0);
  assert.ok(validateAssetResult(result));
  assert.strictEqual(result.metadata.name, 'RuinedBrutalistBuilding');
  assert.ok(result.metadata.triangles > 0);
  // Polygon budget: buildings < 1,500 tris
  assert.ok(
    result.metadata.triangles < 1500,
    `Building triangle count ${result.metadata.triangles} exceeds 1,500 budget`
  );
  assert.strictEqual(result.geometries.length, 2, 'Should have concrete and rebar entries');
});

test('TerrainGenerator generates 64x64 grid with road spline and vertex colors', () => {
  const result = generateTerrain(5678, 0);
  assert.ok(validateAssetResult(result));
  assert.strictEqual(result.metadata.name, 'WastelandTerrain');
  
  const geom = result.geometries[0].geometry;
  assert.ok(geom.attributes.position);
  assert.ok(geom.attributes.normal);
  assert.ok(geom.attributes.color, 'Terrain must have vertex colors');
  assert.strictEqual(geom.attributes.position.count, 64 * 64);
  assert.strictEqual(result.metadata.triangles, (64 - 1) * (64 - 1) * 2);
});

test('PropsGenerator generates dented drums, barricade, and bent streetlight with wire within strict budgets', () => {
  const result = generateProps(9012, 0);
  assert.ok(validateAssetResult(result));
  assert.strictEqual(result.metadata.name, 'RustedPropsPack');
  assert.ok(result.metadata.triangles > 0);

  // Polygon budget: single props < 300 tris
  // Pack of 4 props total tris is < 1,000 tris
  assert.ok(
    result.metadata.triangles < 1000,
    `Props pack triangles ${result.metadata.triangles} should be < 1,000 tris total`
  );
  assert.strictEqual(result.geometries.length, 3, 'Should have rust, scrap metal, and rebar merged groups');
  assert.strictEqual(result.geometries[0].name, 'props_rust');
  assert.strictEqual(result.geometries[1].name, 'props_scrap');
  assert.strictEqual(result.geometries[2].name, 'props_rebar');

  // Verify single prop budgets directly using generator helpers
  import('../src/generators/PropsGenerator.js').then(({ createDentedDrum, createBarricade, createStreetlight }) => {
    import('../src/core/SeededNoise.js').then(({ createPRNG, SimplexNoise }) => {
      const prng = createPRNG(42);
      const noise = new SimplexNoise(42);
      const drumGeom = createDentedDrum(42, noise, prng, 0, 0, 0);
      const drumTris = drumGeom.index ? drumGeom.index.count / 3 : drumGeom.attributes.position.count / 3;
      assert.ok(drumTris < 300, `Single oil drum triangles ${drumTris} must be < 300 tris`);
      drumGeom.dispose();
    });
  });
});

test('TreeGenerator creates dead gnarled tree with recursive branches and snapped tips', () => {
  const result = generateTree(3456, 0);
  assert.ok(validateAssetResult(result));
  assert.strictEqual(result.metadata.name, 'DeadGnarledTree');
  assert.ok(result.metadata.triangles > 0);
  assert.ok(result.metadata.triangles < 1200, `Tree triangles ${result.metadata.triangles} exceeds budget`);
  assert.strictEqual(result.geometries.length, 1);
  assert.strictEqual(result.geometries[0].name, 'dead_tree');
});

test('DroneGenerator creates hierarchical drone with animated rotors and optical scanner', () => {
  const result = generateDrone(7890, 0);
  assert.ok(validateAssetResult(result));
  assert.strictEqual(result.metadata.name, 'AutonomousScavengerDrone');
  assert.ok(result.metadata.triangles > 0);
  assert.ok(result.metadata.triangles < 1400);

  // Check scene group assembly and animation execution
  const group = buildSceneGroup(result);
  const hull = group.getObjectByName('drone_hull');
  const arms = group.getObjectByName('drone_arms');
  const rotor0 = group.getObjectByName('rotor_0');
  const scannerMount = group.getObjectByName('scannerMount');
  const scannerLens = group.getObjectByName('scannerLens');

  assert.ok(hull, 'Drone must have named drone_hull');
  assert.ok(arms, 'Drone must have named drone_arms');
  assert.ok(rotor0, 'Drone must have named rotor_0');
  assert.ok(scannerMount, 'Drone must have named scannerMount');
  assert.ok(scannerLens, 'Drone must have named scannerLens');

  const initialRotorRotY = rotor0.rotation.y;
  // Trigger animation update at t=0
  group.userData.updateAnimation(0.0, 0.016);
  // Lens should face forward, not flipped 90 degrees downward
  assert.ok(Math.abs(scannerLens.rotation.x) < 0.2, `Scanner lens rotation.x should be forward-facing pitch angle (~0), was ${scannerLens.rotation.x}`);
  assert.ok(Math.abs(scannerMount.rotation.x) < 0.2, `Scanner mount rotation.x should be aligned forward (~0), was ${scannerMount.rotation.x}`);

  // Trigger animation update with time passage
  group.userData.updateAnimation(1.0, 0.05);

  assert.notStrictEqual(rotor0.rotation.y, initialRotorRotY, 'Rotor should spin on animation update');
  assert.ok(group.position.y !== 0, 'Drone should have procedural hover offset applied');
});
