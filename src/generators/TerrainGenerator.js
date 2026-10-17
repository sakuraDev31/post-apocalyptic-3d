/**
 * TerrainGenerator.js
 * 
 * Walkable Post-Apocalyptic Wasteland Terrain:
 * - Pure shared function heightAt(x, z, seed) used by worker AND main thread
 * - Gentle rolling hills (max slope ~25-35 deg), flat lots along road
 * - Continuous deterministic world road spline
 * - Reduced high-contrast blotchiness with smooth low-frequency tinting
 * - Skirts around chunk borders to seamlessly hide LOD cracks
 * - Complies with AssetContract
 */

import * as THREE from 'three';
import { SimplexNoise, createPRNG, evaluateSpline } from '../core/SeededNoise.js';
import { MATERIAL_KEYS, computeBoundsAndTriangles, validateAssetResult } from '../core/AssetContract.js';

/**
 * Continuous road center X position at world coordinate z
 */
export function roadCenterX(z, seed = 1337) {
  // Road starts exactly at x=0 at z=0, with gentle sweeping curves
  return Math.sin(z * 0.015) * 8.0 + Math.sin(z * 0.04) * 3.0;
}

/**
 * Pure shared elevation function used by both main thread physics and workers
 */
export function heightAt(x, z, seed = 1337) {
  const noise = new SimplexNoise(seed);

  // 1. Base gentle rolling hills (fBm)
  const baseElev = noise.fbm2D(x * 0.012, z * 0.012, 3, 2.0, 0.45) * 4.5;
  const secondary = noise.noise2D(x * 0.028 + 5.0, z * 0.028 + 5.0) * 1.2;
  const naturalHeight = baseElev + secondary;

  // 2. Road spline elevation
  const rx = roadCenterX(z, seed);
  const distToRoad = Math.abs(x - rx);
  const roadElevation = Math.sin(z * 0.01) * 2.0;

  const roadBedHalfW = 3.5;  // 7m wide road bed
  const shoulderHalfW = 4.5; // 9m blend zone

  if (distToRoad <= roadBedHalfW) {
    // Subtle road crown (center +0.12m higher)
    const crown = 0.12 * (1.0 - Math.pow(distToRoad / roadBedHalfW, 2));
    return roadElevation + crown;
  } else if (distToRoad < (roadBedHalfW + shoulderHalfW)) {
    const blend = (distToRoad - roadBedHalfW) / shoulderHalfW;
    const smoothBlend = blend * blend * (3 - 2 * blend);
    return roadElevation * (1.0 - smoothBlend) + naturalHeight * smoothBlend;
  }

  return naturalHeight;
}

/**
 * Generates raw vertex data for a terrain chunk
 */
export function generateTerrainRaw(seed = 1337, lodLevel = 0, options = {}) {
  const size = options.size || 60;
  const originX = options.originX || 0;
  const originZ = options.originZ || 0;
  const addSkirts = options.addSkirts !== undefined ? options.addSkirts : (options.originX !== undefined);

  // Resolution: default 64 for single asset diorama test, or custom/LOD
  let res = 64;
  if (options.subdivisions) {
    res = options.subdivisions;
  } else if (lodLevel === 1) {
    res = 48;
  } else if (lodLevel >= 2) {
    res = 32;
  }

  const noise = new SimplexNoise(seed);
  const prng = createPRNG(seed);

  const halfSize = size * 0.5;
  const step = size / (res - 1);
  const totalGridVerts = res * res;

  // Skirt vertices count: 4 borders of (res) vertices
  const skirtVertsCount = addSkirts ? (res * 4) : 0;
  const totalVerts = totalGridVerts + skirtVertsCount;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = new Float32Array(totalVerts * 3);

  // 1. Populate main grid vertices
  for (let j = 0; j < res; j++) {
    const lz = -halfSize + j * step;
    const wz = originZ + lz;
    const v = j / (res - 1);

    for (let i = 0; i < res; i++) {
      const lx = -halfSize + i * step;
      const wx = originX + lx;
      const u = i / (res - 1);
      const vIdx = j * res + i;

      const y = heightAt(wx, wz, seed);

      const pIdx = vIdx * 3;
      positions[pIdx] = lx;
      positions[pIdx + 1] = y;
      positions[pIdx + 2] = lz;

      const uvIdx = vIdx * 2;
      uvs[uvIdx] = u * 4.0;
      uvs[uvIdx + 1] = v * 4.0;
    }
  }

  // 2. Generate Indices for main grid
  const numGridQuads = (res - 1) * (res - 1);
  const skirtQuads = addSkirts ? ((res - 1) * 4) : 0;
  const totalQuads = numGridQuads + skirtQuads;
  const indices = new Uint32Array(totalQuads * 6);

  let idxOffset = 0;
  for (let j = 0; j < res - 1; j++) {
    for (let i = 0; i < res - 1; i++) {
      const a = j * res + i;
      const b = (j + 1) * res + i;
      const c = (j + 1) * res + (i + 1);
      const d = j * res + (i + 1);

      indices[idxOffset++] = a;
      indices[idxOffset++] = b;
      indices[idxOffset++] = d;

      indices[idxOffset++] = b;
      indices[idxOffset++] = c;
      indices[idxOffset++] = d;
    }
  }

  // 3. Optional Skirts along borders (drop down 2.5m to hide cracks between LODs)
  if (addSkirts) {
    const skirtDrop = 2.5;
    let skirtVIdx = totalGridVerts;

    // Helper to stitch skirt along a border
    const addSkirtEdge = (getGridIdx) => {
      const startSkirt = skirtVIdx;
      for (let k = 0; k < res; k++) {
        const gIdx = getGridIdx(k);
        const pIdx = skirtVIdx * 3;
        positions[pIdx] = positions[gIdx * 3];
        positions[pIdx + 1] = positions[gIdx * 3 + 1] - skirtDrop;
        positions[pIdx + 2] = positions[gIdx * 3 + 2];

        uvs[skirtVIdx * 2] = uvs[gIdx * 2];
        uvs[skirtVIdx * 2 + 1] = uvs[gIdx * 2 + 1];

        colors[pIdx] = 0.28;
        colors[pIdx + 1] = 0.26;
        colors[pIdx + 2] = 0.24;

        skirtVIdx++;
      }

      for (let k = 0; k < res - 1; k++) {
        const topA = getGridIdx(k);
        const topB = getGridIdx(k + 1);
        const botA = startSkirt + k;
        const botB = startSkirt + k + 1;

        indices[idxOffset++] = topA;
        indices[idxOffset++] = botA;
        indices[idxOffset++] = topB;

        indices[idxOffset++] = topB;
        indices[idxOffset++] = botA;
        indices[idxOffset++] = botB;
      }
    };

    // North (j = 0)
    addSkirtEdge((k) => k);
    // South (j = res - 1)
    addSkirtEdge((k) => (res - 1) * res + k);
    // West (i = 0)
    addSkirtEdge((k) => k * res);
    // East (i = res - 1)
    addSkirtEdge((k) => k * res + (res - 1));
  }

  // 4. Compute Surface Normals for lighting
  const tempNormals = new Float32Array(totalVerts * 3);
  for (let k = 0; k < indices.length; k += 3) {
    const iA = indices[k] * 3;
    const iB = indices[k + 1] * 3;
    const iC = indices[k + 2] * 3;

    const abX = positions[iB] - positions[iA];
    const abY = positions[iB + 1] - positions[iA + 1];
    const abZ = positions[iB + 2] - positions[iA + 2];

    const acX = positions[iC] - positions[iA];
    const acY = positions[iC + 1] - positions[iA + 1];
    const acZ = positions[iC + 2] - positions[iA + 2];

    const nX = abY * acZ - abZ * acY;
    const nY = abZ * acX - abX * acZ;
    const nZ = abX * acY - abY * acX;

    tempNormals[iA] += nX; tempNormals[iA + 1] += nY; tempNormals[iA + 2] += nZ;
    tempNormals[iB] += nX; tempNormals[iB + 1] += nY; tempNormals[iB + 2] += nZ;
    tempNormals[iC] += nX; tempNormals[iC + 1] += nY; tempNormals[iC + 2] += nZ;
  }

  // 5. Normalize Normals and Compute Smooth Vertex Colors
  for (let i = 0; i < totalGridVerts; i++) {
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

    const wx = originX + positions[idx];
    const wz = originZ + positions[idx + 2];

    // Road factor
    const rx = roadCenterX(wz, seed);
    const distToRoad = Math.abs(wx - rx);

    // Low-frequency macro color variation across wasteland
    const macroTint = noise.noise2D(wx * 0.008, wz * 0.008) * 0.08;

    // Base dusty earth color (smooth and low contrast)
    let r = 0.52 + macroTint;
    let g = 0.46 + macroTint * 0.9;
    let b = 0.38 + macroTint * 0.8;

    // Steeper rock slope tint
    const slope = Math.max(0, Math.min(1, normY));
    if (slope < 0.85) {
      const rockFactor = (0.85 - slope) / 0.85;
      r = r * (1 - rockFactor) + 0.38 * rockFactor;
      g = g * (1 - rockFactor) + 0.37 * rockFactor;
      b = b * (1 - rockFactor) + 0.36 * rockFactor;
    }

    // Road overlay: dark tarmac
    const roadBedW = 3.5;
    const shoulderW = 4.5;

    if (distToRoad < roadBedW) {
      r = 0.22;
      g = 0.23;
      b = 0.24;
      // Cracked faded yellow centerline
      if (distToRoad < 0.22 && Math.sin(wz * 0.8) > 0.05) {
        r = 0.88; g = 0.72; b = 0.22;
      }
    } else if (distToRoad < roadBedW + shoulderW) {
      const blend = (distToRoad - roadBedW) / shoulderW;
      const smoothBlend = blend * blend * (3 - 2 * blend);
      r = 0.22 * (1 - smoothBlend) + r * smoothBlend;
      g = 0.23 * (1 - smoothBlend) + g * smoothBlend;
      b = 0.24 * (1 - smoothBlend) + b * smoothBlend;
    }

    colors[idx] = r;
    colors[idx + 1] = g;
    colors[idx + 2] = b;
  }

  // For skirt normals, point outward / down
  for (let i = totalGridVerts; i < totalVerts; i++) {
    const idx = i * 3;
    normals[idx] = 0;
    normals[idx + 1] = -1;
    normals[idx + 2] = 0;
  }

  return {
    positions,
    normals,
    uvs,
    colors,
    indices,
    triangleCount: totalQuads * 2
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
