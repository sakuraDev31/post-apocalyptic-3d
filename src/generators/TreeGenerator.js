/**
 * TreeGenerator.js
 * 
 * "Dead Gnarled Wasteland Tree"
 * - Recursive branching algorithm with twisted bark vertices
 * - Tapering radii from base to twigs
 * - Snapped branch tips with splintered jagged ends
 * - ZERO foliage (bleak post-apocalyptic silhouette)
 * - Sub-geometries merged via BufferGeometryUtils (< 1,200 tris budget)
 * - Complies with AssetContract
 */

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { SimplexNoise, createPRNG, randRange } from '../core/SeededNoise.js';
import { MATERIAL_KEYS, computeBoundsAndTriangles, validateAssetResult, safeMergeGeometries } from '../core/AssetContract.js';

export function generate(seed = 1337, lodLevel = 0, options = {}) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const prng = createPRNG(seed);
  const noise = new SimplexNoise(seed);

  const branchGeoms = [];
  const maxDepth = lodLevel >= 1 ? 3 : 4;

  /**
   * Recursive branch generator:
   * Builds branch cylinder along its direction vector, applies bark displacement,
   * snaps tips randomly, and spawns child branches.
   */
  function spawnBranch(startPos, direction, length, radiusBottom, radiusTop, depth) {
    if (depth > maxDepth || radiusBottom < 0.03 || length < 0.3) return;

    // Radially segmented cylinder
    const radialSegs = Math.max(4, 7 - depth);
    const heightSegs = Math.max(2, 5 - depth);
    const geom = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, radialSegs, heightSegs);

    // Apply bark noise & gnarl twist to vertices
    const pos = geom.attributes.position;
    const isSnappedTip = depth >= maxDepth - 1 && prng() > 0.4;

    for (let i = 0; i < pos.count; i++) {
      let vx = pos.getX(i);
      let vy = pos.getY(i);
      let vz = pos.getZ(i);

      // Height fraction along cylinder from -length/2 to +length/2
      const hFrac = (vy + length / 2) / length;

      // Sinuous trunk/branch curve
      const gnarlX = Math.sin(hFrac * Math.PI) * (noise.noise2D(depth * 3.1, hFrac * 4.0) * 0.15);
      const gnarlZ = Math.cos(hFrac * Math.PI) * (noise.noise2D(depth * 5.7, hFrac * 4.0) * 0.15);
      vx += gnarlX;
      vz += gnarlZ;

      // Coarse twisted bark displacement
      const barkNoise = noise.noise3D(vx * 12.0, (vy + depth * 5.0) * 3.0, vz * 12.0);
      const disp = 1.0 + barkNoise * 0.18;
      vx *= disp;
      vz *= disp;

      // If snapped tip: make upper end ragged and splintered
      if (isSnappedTip && hFrac > 0.85) {
        const splinter = noise.noise2D(vx * 20.0, vz * 20.0) * 0.25;
        vy += splinter;
      }

      pos.setXYZ(i, vx, vy, vz);
    }

    geom.computeVertexNormals();

    // Orient cylinder towards direction vector
    const normDir = direction.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normDir);

    // Compute end position of this branch
    const endPos = startPos.clone().add(normDir.clone().multiplyScalar(length));
    const centerPos = startPos.clone().add(normDir.clone().multiplyScalar(length * 0.5));

    geom.applyQuaternion(quaternion);
    geom.translate(centerPos.x, centerPos.y, centerPos.z);
    branchGeoms.push(geom);

    // If snapped tip, do not branch further
    if (isSnappedTip) return;

    // Split into child branches
    const numChildren = depth === 0 ? 3 : (prng() > 0.35 ? 2 : 1);
    for (let c = 0; c < numChildren; c++) {
      const angleSpread = randRange(prng, 0.4, 0.85);
      const azimuth = (c * (Math.PI * 2 / numChildren)) + randRange(prng, -0.4, 0.4);

      // Perturb child direction away from parent
      const childDir = normDir.clone();
      const perpX = new THREE.Vector3(-normDir.z, 0, normDir.x).normalize();
      if (perpX.lengthSq() < 0.01) perpX.set(1, 0, 0);
      const perpY = new THREE.Vector3().crossVectors(normDir, perpX).normalize();

      childDir.add(perpX.clone().multiplyScalar(Math.cos(azimuth) * angleSpread));
      childDir.add(perpY.clone().multiplyScalar(Math.sin(azimuth) * angleSpread));
      childDir.add(new THREE.Vector3(0, randRange(prng, 0.1, 0.4), 0)); // upward bias
      childDir.normalize();

      const childLength = length * randRange(prng, 0.65, 0.82);
      const childRadiusBottom = radiusTop * 0.85;
      const childRadiusTop = childRadiusBottom * randRange(prng, 0.45, 0.65);

      spawnBranch(endPos, childDir, childLength, childRadiusBottom, childRadiusTop, depth + 1);
    }
  }

  // Trunk starting parameters
  const rootPos = new THREE.Vector3(0, 0, 0);
  const trunkDir = new THREE.Vector3(
    (prng() - 0.5) * 0.2,
    1.0,
    (prng() - 0.5) * 0.2
  ).normalize();

  spawnBranch(rootPos, trunkDir, 2.6, 0.38, 0.26, 0);

  // Add 3 gnarled root buttresses around base
  for (let r = 0; r < 3; r++) {
    const angle = r * (Math.PI * 2 / 3) + 0.3;
    const rootGeom = new THREE.CylinderGeometry(0.06, 0.22, 1.2, 5, 3);
    const rPos = rootGeom.attributes.position;
    for (let i = 0; i < rPos.count; i++) {
      const vx = rPos.getX(i);
      const vy = rPos.getY(i);
      const vz = rPos.getZ(i);
      const n = noise.noise3D(vx * 8.0, vy * 8.0, vz * 8.0) * 0.06;
      rPos.setXYZ(i, vx + n, vy, vz + n);
    }
    rootGeom.computeVertexNormals();
    rootGeom.rotateZ(0.65);
    rootGeom.rotateY(angle);
    rootGeom.translate(Math.cos(angle) * 0.45, 0.2, Math.sin(angle) * 0.45);
    branchGeoms.push(rootGeom);
  }

  // Merge all branches into a single BufferGeometry
  const mergedTree = safeMergeGeometries(branchGeoms, false);
  mergedTree.computeBoundingBox();

  for (const g of branchGeoms) g.dispose();

  const entries = [
    {
      name: 'dead_tree',
      geometry: mergedTree,
      materialKey: MATERIAL_KEYS.BARK,
      transform: { position: [0, 0, 0] }
    }
  ];

  const boundsInfo = computeBoundsAndTriangles(entries);
  const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const result = {
    geometries: entries,
    metadata: {
      name: 'DeadGnarledTree',
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

// ====================================================================
// GENSHIN STYLIZED ANIME TREE (SAKURA, GINKGO, JADE)
// ====================================================================
import { paintGeo } from './BuildingGenerator.js';

export function addStylizedAnimeTree(tx, tz, typeIdx = 0, seed = 777, terrainY = 0) {
  const rand = (() => {
    let s = seed ^ (Math.floor(tx) * 19349663) ^ (Math.floor(tz) * 83492791);
    return () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();

  const trunkGeos = [];
  const foliageGeos = [];

  const trunk = new THREE.CylinderGeometry(0.22, 0.48, 3.4, 7);
  trunk.rotateZ((rand() - 0.5) * 0.16);
  trunk.translate(tx, terrainY + 1.6, tz);
  trunkGeos.push(paintGeo(trunk, 0x5c3d2e, 0x2d1e17, rand, 6));

  let cTop = 0xffb3c6, cBot = 0xfb6f92; // Sakura Pink
  if (typeIdx === 1) { cTop = 0xffd166; cBot = 0xf4a261; } // Golden Ginkgo
  else if (typeIdx === 2) { cTop = 0x80ed99; cBot = 0x2ec4b6; } // Jade Canopy

  const puffs = [
    [0, 3.8, 0, 1.85], [-1.1, 3.4, 0.6, 1.35], [1.1, 3.5, -0.5, 1.4],
    [0.4, 4.4, 0.8, 1.3], [-0.6, 4.2, -0.8, 1.25]
  ];
  for (const pf of puffs) {
    const puff = new THREE.IcosahedronGeometry(pf[3], 1);
    puff.scale(1.15, 0.82, 1.15);
    puff.translate(tx + pf[0], terrainY + pf[1], tz + pf[2]);
    foliageGeos.push(paintGeo(puff, cTop, cBot, rand, 8));
  }

  const collider = {
    min: [tx - 0.45, terrainY - 1.0, tz - 0.45],
    max: [tx + 0.45, terrainY + 4.5, tz + 0.45]
  };

  return { trunkGeos, foliageGeos, collider };
}
