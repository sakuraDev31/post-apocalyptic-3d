/**
 * TerrainGenerator.js
 * 
 * "Wasteland Terrain Chunk"
 * - Subdivided mesh (64x64 LOD 0, 48x48 LOD 1, 32x32 LOD 2)
 * - Multi-octave fBm elevation + ridged eroded gullies
 * - Flattened cracked-asphalt road spline down the center
 * - Slope & height vertex coloring
 * - Complies with AssetContract
 */

import * as THREE from 'three';
import { SimplexNoise, createPRNG, evaluateSpline } from '../core/SeededNoise.js';
import { MATERIAL_KEYS, computeBoundsAndTriangles, validateAssetResult } from '../core/AssetContract.js';

export function generateTerrainRaw(seed = 1337, lodLevel = 0, options = {}) {
  const size = options.size || 60; // 60m x 60m chunk
  let res = 64;
  if (lodLevel === 1) res = 48;
  if (lodLevel >= 2) res = 32;

  const noise = new SimplexNoise(seed);
  const prng = createPRNG(seed);

  // Road spline control points through chunk
  // Curves slightly along X axis as it goes from z = -size/2 to +size/2
  const roadCurveX1 = (prng() - 0.5) * 14;
  const roadCurveX2 = (prng() - 0.5) * 14;
  const roadPoints = [
    [-roadCurveX1 * 1.2, 0, -size * 0.6],
    [roadCurveX1, 0, -size * 0.25],
    [roadCurveX2, 0, size * 0.25],
    [-roadCurveX2 * 1.2, 0, size * 0.6]
  ];

  const totalVerts = res * res;
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = new Float32Array(totalVerts * 3);

  const numQuads = (res - 1) * (res - 1);
  const indices = new Uint32Array(numQuads * 6);

  const halfSize = size * 0.5;
  const step = size / (res - 1);
  const roadWidth = 5.0; // 5 meters wide road bed
  const shoulderWidth = 4.0; // 4 meters blend zone

  // 1. Generate vertex positions, uvs, and initial heights
  for (let j = 0; j < res; j++) {
    const z = -halfSize + j * step;
    const v = j / (res - 1);

    for (let i = 0; i < res; i++) {
      const x = -halfSize + i * step;
      const u = i / (res - 1);
      const vertIdx = j * res + i;

      // Base rolling hills (fBm)
      const baseElev = noise.fbm2D(x * 0.025, z * 0.025, 4, 2.0, 0.5) * 7.5;
      // Eroded gullies (ridged noise)
      const gully = noise.ridgeNoise2D(x * 0.04 + 10.0, z * 0.04 + 10.0, 3, 2.0, 0.5);
      const gullyDepth = (1.0 - gully) * 4.5;

      let y = baseElev - gullyDepth;

      // Road spline interaction
      // Approximate spline t parameter based on z normalized from 0 to 1
      const splineT = Math.max(0, Math.min(1, (z + halfSize) / size));
      const roadCenter = evaluateSpline(roadPoints, splineT);
      const distToRoad = Math.hypot(x - roadCenter[0], z - roadCenter[2]);

      // Road elevation is smoothed along spline length
      const roadHeight = 0.5 + Math.sin(splineT * Math.PI) * 1.5;

      let isRoad = 0.0;
      if (distToRoad <= roadWidth * 0.5) {
        // Flattened road bed with subtle crown (center slightly higher)
        const crown = 0.15 * (1.0 - Math.pow(distToRoad / (roadWidth * 0.5), 2));
        y = roadHeight + crown;
        isRoad = 1.0;
      } else if (distToRoad < (roadWidth * 0.5 + shoulderWidth)) {
        // Smoothstep transition to natural terrain
        const blend = (distToRoad - roadWidth * 0.5) / shoulderWidth;
        const smoothBlend = blend * blend * (3 - 2 * blend);
        y = roadHeight * (1.0 - smoothBlend) + y * smoothBlend;
        isRoad = (1.0 - smoothBlend) * 0.8;
      }

      const pIdx = vertIdx * 3;
      positions[pIdx] = x;
      positions[pIdx + 1] = y;
      positions[pIdx + 2] = z;

      const uvIdx = vertIdx * 2;
      uvs[uvIdx] = u * 6.0;
      uvs[uvIdx + 1] = v * 6.0;

      // Temporary store road factor in normals[pIdx + 1] for coloring pass
      normals[pIdx + 1] = isRoad;
    }
  }

  // 2. Generate Indices
  let indexOffset = 0;
  for (let j = 0; j < res - 1; j++) {
    for (let i = 0; i < res - 1; i++) {
      const a = j * res + i;
      const b = (j + 1) * res + i;
      const c = (j + 1) * res + (i + 1);
      const d = j * res + (i + 1);

      // Two triangles per quad: a-b-d and b-c-d
      indices[indexOffset++] = a;
      indices[indexOffset++] = b;
      indices[indexOffset++] = d;

      indices[indexOffset++] = b;
      indices[indexOffset++] = c;
      indices[indexOffset++] = d;
    }
  }

  // 3. Compute surface normals
  const tempNormals = new Float32Array(totalVerts * 3);
  for (let k = 0; k < indices.length; k += 3) {
    const iA = indices[k] * 3;
    const iB = indices[k + 1] * 3;
    const iC = indices[k + 2] * 3;

    const vAx = positions[iA], vAy = positions[iA + 1], vAz = positions[iA + 2];
    const vBx = positions[iB], vBy = positions[iB + 1], vBz = positions[iB + 2];
    const vCx = positions[iC], vCy = positions[iC + 1], vCz = positions[iC + 2];

    const abX = vBx - vAx, abY = vBy - vAy, abZ = vBz - vAz;
    const acX = vCx - vAx, acY = vCy - vAy, acZ = vCz - vAz;

    // Cross product
    const nX = abY * acZ - abZ * acY;
    const nY = abZ * acX - abX * acZ;
    const nZ = abX * acY - abY * acX;

    tempNormals[iA] += nX; tempNormals[iA + 1] += nY; tempNormals[iA + 2] += nZ;
    tempNormals[iB] += nX; tempNormals[iB + 1] += nY; tempNormals[iB + 2] += nZ;
    tempNormals[iC] += nX; tempNormals[iC + 1] += nY; tempNormals[iC + 2] += nZ;
  }

  // 4. Normalize normals & compute slope/height vertex colors
  for (let i = 0; i < totalVerts; i++) {
    const idx = i * 3;
    const nx = tempNormals[idx];
    const ny = tempNormals[idx + 1];
    const nz = tempNormals[idx + 2];
    const len = Math.hypot(nx, ny, nz) || 1.0;

    const normX = nx / len;
    const normY = ny / len;
    const normZ = nz / len;

    normals[idx] = normX;
    normals[idx + 1] = normY;
    normals[idx + 2] = normZ;

    // Slope calculation: dot with Up (0, 1, 0)
    const slope = Math.max(0, Math.min(1, normY)); // 1 = flat ground, 0 = vertical cliff
    const height = positions[idx + 1];

    // Colors:
    // Road: dark asphalt charcoal (0.16, 0.17, 0.18)
    // Depressions/flat: dusty wasteland dirt (0.48, 0.42, 0.33)
    // Steep slope: rocky grey (0.35, 0.36, 0.37)
    // High ridges: irradiated burnt/soot (0.28, 0.26, 0.22)

    let r, g, b;
    if (slope > 0.75) {
      // Flat/gentle slope: dusty wasteland dirt
      r = 0.85; g = 0.72; b = 0.54;
      if (height > 3.0) {
        // High dry irradiated ridge
        const t = Math.min(1, (height - 3.0) / 4.0);
        r = r * (1 - t) + 0.42 * t;
        g = g * (1 - t) + 0.38 * t;
        b = b * (1 - t) + 0.32 * t;
      }
    } else {
      // Steep rock face
      const cliff = (0.75 - slope) / 0.75;
      r = 0.85 * (1 - cliff) + 0.68 * cliff;
      g = 0.72 * (1 - cliff) + 0.68 * cliff;
      b = 0.54 * (1 - cliff) + 0.70 * cliff;
    }

    // Road corridor overlay
    const zPos = positions[idx + 2];
    const xPos = positions[idx];
    const splineT = Math.max(0, Math.min(1, (zPos + halfSize) / size));
    const roadCenter = evaluateSpline(roadPoints, splineT);
    const distToRoad = Math.hypot(xPos - roadCenter[0], zPos - roadCenter[2]);

    if (distToRoad < roadWidth * 0.5) {
      // Dark asphalt bed
      r = 0.28; g = 0.29; b = 0.30;
      // Faded cracked yellow centerline
      if (distToRoad < 0.25 && Math.sin(splineT * 40.0) > 0.1) {
        r = 0.95; g = 0.82; b = 0.20;
      }
    } else if (distToRoad < roadWidth * 0.5 + shoulderWidth) {
      const blend = (distToRoad - roadWidth * 0.5) / shoulderWidth;
      r = 0.28 * (1 - blend) + r * blend;
      g = 0.29 * (1 - blend) + g * blend;
      b = 0.30 * (1 - blend) + b * blend;
    }

    colors[idx] = r;
    colors[idx + 1] = g;
    colors[idx + 2] = b;
  }

  return {
    positions,
    normals,
    uvs,
    colors,
    indices,
    triangleCount: numQuads * 2
  };
}

export function generate(seed = 1337, lodLevel = 0, options = {}) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const raw = generateTerrainRaw(seed, lodLevel, options);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(raw.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(raw.normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(raw.uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(raw.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(raw.indices, 1));
  geometry.computeBoundingBox();

  const entries = [
    {
      name: 'terrain_chunk',
      geometry,
      materialKey: MATERIAL_KEYS.ASPHALT,
      transform: { position: [0, 0, 0] }
    }
  ];

  const boundsInfo = computeBoundsAndTriangles(entries);
  const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const result = {
    geometries: entries,
    metadata: {
      name: 'WastelandTerrain',
      seed,
      lodLevel,
      triangles: boundsInfo.triangles,
      boundsAABB: boundsInfo.boundsAABB,
      generationTimeMs: Math.round(t1 - t0)
    },
    updateAnimation: () => {}
  };

  validateAssetResult(result);
  return result;
}
