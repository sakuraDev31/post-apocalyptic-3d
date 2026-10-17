import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPRNG,
  randRange,
  randInt,
  randChoice,
  SimplexNoise,
  catmullRomPoint,
  evaluateSpline,
  generateCatenaryCurve
} from '../src/core/SeededNoise.js';

test('Mulberry32 PRNG determinism and distribution', () => {
  const prng1 = createPRNG(42);
  const prng2 = createPRNG(42);

  for (let i = 0; i < 100; i++) {
    const val1 = prng1();
    const val2 = prng2();
    assert.strictEqual(val1, val2, `PRNG values at iteration ${i} must match`);
    assert.ok(val1 >= 0 && val1 < 1, `PRNG value ${val1} must be in [0, 1)`);
  }

  const diffPRNG = createPRNG(999);
  assert.notStrictEqual(diffPRNG(), prng1(), 'Different seeds must produce different sequences');
});

test('randRange, randInt, and randChoice helpers', () => {
  const prng = createPRNG(123);
  for (let i = 0; i < 50; i++) {
    const r = randRange(prng, 5, 10);
    assert.ok(r >= 5 && r <= 10, `randRange out of range: ${r}`);
    const ri = randInt(prng, 1, 6);
    assert.ok(Number.isInteger(ri) && ri >= 1 && ri <= 6, `randInt out of range: ${ri}`);
  }
  const items = ['alpha', 'beta', 'gamma'];
  const choice = randChoice(prng, items);
  assert.ok(items.includes(choice));
});

test('SimplexNoise 2D, 3D, and fBm bounds', () => {
  const noise = new SimplexNoise(777);

  for (let x = -5; x <= 5; x += 1.5) {
    for (let y = -5; y <= 5; y += 1.5) {
      const n2 = noise.noise2D(x, y);
      assert.ok(n2 >= -1.05 && n2 <= 1.05, `2D noise out of bounds: ${n2}`);

      const n3 = noise.noise3D(x, y, 2.5);
      assert.ok(n3 >= -1.05 && n3 <= 1.05, `3D noise out of bounds: ${n3}`);

      const fbm = noise.fbm2D(x, y, 4);
      assert.ok(fbm >= -1.1 && fbm <= 1.1, `fBm out of bounds: ${fbm}`);

      const ridge = noise.ridgeNoise2D(x, y, 3);
      assert.ok(ridge >= 0, `Ridge noise should be non-negative: ${ridge}`);
    }
  }
});

test('Spline and catenary cable curve helpers', () => {
  const controlPoints = [
    [0, 0, 0],
    [5, 2, 0],
    [10, 0, 0],
    [15, -2, 0]
  ];

  const p0 = evaluateSpline(controlPoints, 0.0);
  assert.strictEqual(Math.round(p0[0]), 0);
  assert.strictEqual(Math.round(p0[1]), 0);

  const pMid = evaluateSpline(controlPoints, 0.5);
  assert.ok(pMid[0] > 0 && pMid[0] < 15, `Midpoint X out of range: ${pMid[0]}`);

  // Catenary sag curve
  const catenary = generateCatenaryCurve([0, 10, 0], [10, 10, 0], 2.0, 10);
  assert.strictEqual(catenary.length, 11);
  // Midpoint should droop down
  const midPoint = catenary[5];
  assert.ok(midPoint[1] < 10, `Catenary midpoint should sag below 10: ${midPoint[1]}`);
  assert.ok(Math.abs(midPoint[1] - 8.0) < 0.2, `Sag should be approx 2m: ${midPoint[1]}`);
});
