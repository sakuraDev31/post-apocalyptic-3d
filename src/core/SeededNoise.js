/**
 * SeededNoise.js
 * 
 * Deterministic Mulberry32 PRNG + 2D/3D Simplex Noise +
 * Fractional Brownian Motion (fBm) + Ridge Noise + Catmull-Rom Spline Helpers.
 * Designed for deterministic procedural generation across main thread and Web Workers.
 */

// --- Mulberry32 PRNG ---
export function createPRNG(seed = 1337) {
  let s = (seed | 0) || 1;
  return function mulberry32() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(prng, min, max) {
  return min + prng() * (max - min);
}

export function randInt(prng, min, max) {
  return Math.floor(min + prng() * (max - min + 1));
}

export function randChoice(prng, array) {
  if (!array || array.length === 0) return null;
  return array[Math.floor(prng() * array.length)];
}

// --- Simplex Noise Implementation (2D & 3D) ---
const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
const F3 = 1.0 / 3.0;
const G3 = 1.0 / 6.0;

const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
];

export class SimplexNoise {
  constructor(seed = 1337) {
    this.seed = seed;
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    this.init(seed);
  }

  init(seed) {
    const prng = createPRNG(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }
    // Fisher-Yates shuffle with deterministic PRNG
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(prng() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = (this.perm[i] % 12);
    }
  }

  noise2D(xin, yin) {
    let n0, n1, n2;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;

    let i1, j1;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = i & 255;
    const jj = j & 255;
    const gi0 = this.permMod12[ii + this.perm[jj]];
    const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
    const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 < 0) n0 = 0.0;
    else {
      t0 *= t0;
      n0 = t0 * t0 * (GRAD3[gi0][0] * x0 + GRAD3[gi0][1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 < 0) n1 = 0.0;
    else {
      t1 *= t1;
      n1 = t1 * t1 * (GRAD3[gi1][0] * x1 + GRAD3[gi1][1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 < 0) n2 = 0.0;
    else {
      t2 *= t2;
      n2 = t2 * t2 * (GRAD3[gi2][0] * x2 + GRAD3[gi2][1] * y2);
    }

    // Scale to [-1, 1]
    return 70.0 * (n0 + n1 + n2);
  }

  noise3D(xin, yin, zin) {
    let n0, n1, n2, n3;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;
    const z0 = zin - Z0;

    let i1, j1, k1;
    let i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
      }
    } else {
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
      } else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
      } else {
        i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      }
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2.0 * G3;
    const y2 = y0 - j2 + 2.0 * G3;
    const z2 = z0 - k2 + 2.0 * G3;
    const x3 = x0 - 1.0 + 3.0 * G3;
    const y3 = y0 - 1.0 + 3.0 * G3;
    const z3 = z0 - 1.0 + 3.0 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    const gi0 = this.permMod12[ii + this.perm[jj + this.perm[kk]]];
    const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1 + this.perm[kk + k1]]];
    const gi2 = this.permMod12[ii + i2 + this.perm[jj + j2 + this.perm[kk + k2]]];
    const gi3 = this.permMod12[ii + 1 + this.perm[jj + 1 + this.perm[kk + 1]]];

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 < 0) n0 = 0.0;
    else {
      t0 *= t0;
      n0 = t0 * t0 * (GRAD3[gi0][0] * x0 + GRAD3[gi0][1] * y0 + GRAD3[gi0][2] * z0);
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 < 0) n1 = 0.0;
    else {
      t1 *= t1;
      n1 = t1 * t1 * (GRAD3[gi1][0] * x1 + GRAD3[gi1][1] * y1 + GRAD3[gi1][2] * z1);
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 < 0) n2 = 0.0;
    else {
      t2 *= t2;
      n2 = t2 * t2 * (GRAD3[gi2][0] * x2 + GRAD3[gi2][1] * y2 + GRAD3[gi2][2] * z2);
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 < 0) n3 = 0.0;
    else {
      t3 *= t3;
      n3 = t3 * t3 * (GRAD3[gi3][0] * x3 + GRAD3[gi3][1] * y3 + GRAD3[gi3][2] * z3);
    }

    // Scale to [-1, 1]
    return 32.0 * (n0 + n1 + n2 + n3);
  }

  // Fractional Brownian Motion (fBm) 2D
  fbm2D(x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let total = 0.0;
    let frequency = 1.0;
    let amplitude = 1.0;
    let maxValue = 0.0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      frequency *= lacunarity;
      amplitude *= gain;
    }

    return total / maxValue;
  }

  // Fractional Brownian Motion (fBm) 3D
  fbm3D(x, y, z, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let total = 0.0;
    let frequency = 1.0;
    let amplitude = 1.0;
    let maxValue = 0.0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise3D(x * frequency, y * frequency, z * frequency) * amplitude;
      maxValue += amplitude;
      frequency *= lacunarity;
      amplitude *= gain;
    }

    return total / maxValue;
  }

  // Ridged Multifractal Noise 2D (great for sharp eroded gullies & canyon ridges)
  ridgeNoise2D(x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let total = 0.0;
    let frequency = 1.0;
    let amplitude = 1.0;
    let weight = 1.0;

    for (let i = 0; i < octaves; i++) {
      let signal = Math.abs(this.noise2D(x * frequency, y * frequency));
      signal = 1.0 - signal;
      signal *= signal;
      signal *= weight;
      weight = Math.min(1.0, Math.max(0.0, signal * 2.0));
      total += signal * amplitude;
      frequency *= lacunarity;
      amplitude *= gain;
    }

    return total;
  }
}

// --- Spline Helpers (Catmull-Rom & Catenary Sag) ---

/**
 * Evaluates Catmull-Rom spline point in 3D for parameter t in [0, 1]
 * between p1 and p2, with tangents informed by p0 and p3.
 */
export function catmullRomPoint(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;

  return [
    0.5 * (
      (2 * p1[0]) +
      (-p0[0] + p2[0]) * t +
      (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
      (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
    ),
    0.5 * (
      (2 * p1[1]) +
      (-p0[1] + p2[1]) * t +
      (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
    ),
    0.5 * (
      (2 * p1[2]) +
      (-p0[2] + p2[2]) * t +
      (2 * p0[2] - 5 * p1[2] + 4 * p2[2] - p3[2]) * t2 +
      (-p0[2] + 3 * p1[2] - 3 * p2[2] + p3[2]) * t3
    )
  ];
}

/**
 * Evaluates a sequence of 3D control points with uniform Catmull-Rom interpolation.
 * t goes from 0.0 to 1.0 across the entire spline curve.
 */
export function evaluateSpline(controlPoints, t, closed = false) {
  const n = controlPoints.length;
  if (n < 2) return controlPoints[0] || [0, 0, 0];
  if (n === 2) {
    const p0 = controlPoints[0];
    const p1 = controlPoints[1];
    return [
      p0[0] + (p1[0] - p0[0]) * t,
      p0[1] + (p1[1] - p0[1]) * t,
      p0[2] + (p1[2] - p0[2]) * t
    ];
  }

  const clampedT = Math.max(0, Math.min(1, t));
  const segments = closed ? n : n - 1;
  const segProgress = clampedT * segments;
  const index = Math.min(Math.floor(segProgress), segments - 1);
  const localT = segProgress - index;

  let p0, p1, p2, p3;
  if (closed) {
    p0 = controlPoints[(index - 1 + n) % n];
    p1 = controlPoints[index];
    p2 = controlPoints[(index + 1) % n];
    p3 = controlPoints[(index + 2) % n];
  } else {
    p0 = index === 0 ? controlPoints[0] : controlPoints[index - 1];
    p1 = controlPoints[index];
    p2 = controlPoints[index + 1];
    p3 = index + 2 < n ? controlPoints[index + 2] : controlPoints[n - 1];
  }

  return catmullRomPoint(p0, p1, p2, p3, localT);
}

/**
 * Returns tangent vector [dx, dy, dz] normalized at parameter t along spline.
 */
export function evaluateSplineTangent(controlPoints, t, closed = false) {
  const delta = 0.001;
  const t0 = Math.max(0, t - delta);
  const t1 = Math.min(1, t + delta);
  const pA = evaluateSpline(controlPoints, t0, closed);
  const pB = evaluateSpline(controlPoints, t1, closed);
  const dx = pB[0] - pA[0];
  const dy = pB[1] - pA[1];
  const dz = pB[2] - pA[2];
  const len = Math.hypot(dx, dy, dz) || 1e-6;
  return [dx / len, dy / len, dz / len];
}

/**
 * Evaluates points along a sagging catenary cable wire between start [x,y,z] and end [x,y,z].
 * sag parameter defines maximum vertical droop in meters.
 */
export function generateCatenaryCurve(start, end, sag = 1.2, segments = 16) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Linear lerp
    const x = start[0] + (end[0] - start[0]) * t;
    const z = start[2] + (end[2] - start[2]) * t;
    const linearY = start[1] + (end[1] - start[1]) * t;

    // Parabolic catenary sag: 4 * sag * t * (1 - t)
    const droop = 4.0 * sag * t * (1.0 - t);
    const y = linearY - droop;

    points.push([x, y, z]);
  }
  return points;
}
