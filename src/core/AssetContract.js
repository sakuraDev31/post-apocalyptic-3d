/**
 * AssetContract.js
 * 
 * Standard interface specification and validation contract for all procedural asset generators.
 * Every generator module MUST export:
 *   generate(seed = 1337, lodLevel = 0, options = {}) -> {
 *     geometries: [
 *       {
 *         geometry: THREE.BufferGeometry,
 *         materialKey: string,
 *         transform?: { position?: [x,y,z], rotation?: [x,y,z], scale?: [x,y,z] }
 *       }
 *     ],
 *     metadata: {
 *       name: string,
 *       seed: number,
 *       lodLevel: number,
 *       triangles: number,
 *       boundsAABB: { min: [x, y, z], max: [x, y, z] },
 *       generationTimeMs?: number
 *     },
 *     updateAnimation?: (timeSeconds, deltaSeconds) => void,
 *     dispose?: () => void
 *   }
 */

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export const LOD_HIGH = 0;
export const LOD_MEDIUM = 1;
export const LOD_LOW = 2;

export const MATERIAL_KEYS = Object.freeze({
  RUST: 'rust',
  CONCRETE: 'concrete',
  ASPHALT: 'asphalt',
  SOOT: 'soot',
  REBAR: 'rebar',
  DRONE_BODY: 'droneBody',
  DRONE_VISOR: 'droneVisor',
  BARK: 'bark',
  METAL_SCRAP: 'metalScrap'
});

/**
 * Ensures geometry has an index attribute (compatible with BufferGeometryUtils.mergeGeometries)
 */
export function ensureIndexed(geom) {
  if (geom.index) return geom;
  const count = geom.attributes.position.count;
  const indices = new Uint32Array(count);
  for (let i = 0; i < count; i++) indices[i] = i;
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  return geom;
}

/**
 * Safely merges geometries by ensuring all share indexed format and required attributes
 */
export function safeMergeGeometries(geoms, useGroups = false) {
  if (!geoms || geoms.length === 0) return null;
  if (geoms.length === 1) return geoms[0];
  for (const g of geoms) {
    ensureIndexed(g);
  }
  return BufferGeometryUtils.mergeGeometries(geoms, useGroups);
}

/**
 * Computes exact aggregate bounding AABB and triangle count from an array of geometry entries.
 */
export function computeBoundsAndTriangles(geometries) {
  let triangles = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const entry of geometries) {
    const geom = entry.geometry || entry;
    if (!geom || !geom.attributes || !geom.attributes.position) continue;

    // Count triangles
    if (geom.index) {
      triangles += Math.floor(geom.index.count / 3);
    } else {
      triangles += Math.floor(geom.attributes.position.count / 3);
    }

    // Ensure bounding box exists
    if (!geom.boundingBox) {
      geom.computeBoundingBox();
    }
    const box = geom.boundingBox;
    if (box) {
      const tx = entry.transform?.position?.[0] || 0;
      const ty = entry.transform?.position?.[1] || 0;
      const tz = entry.transform?.position?.[2] || 0;

      minX = Math.min(minX, box.min.x + tx);
      minY = Math.min(minY, box.min.y + ty);
      minZ = Math.min(minZ, box.min.z + tz);
      maxX = Math.max(maxX, box.max.x + tx);
      maxY = Math.max(maxY, box.max.y + ty);
      maxZ = Math.max(maxZ, box.max.z + tz);
    }
  }

  if (minX === Infinity) {
    minX = minY = minZ = -1;
    maxX = maxY = maxZ = 1;
  }

  return {
    triangles,
    boundsAABB: {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ]
    }
  };
}

/**
 * Validates that an asset generator result matches the strict AssetContract.
 * Throws an error or returns validation report.
 */
export function validateAssetResult(result) {
  if (!result || typeof result !== 'object') {
    throw new Error('AssetContract validation failed: Result must be an object.');
  }
  if (!Array.isArray(result.geometries)) {
    throw new Error('AssetContract validation failed: result.geometries must be an array.');
  }
  if (!result.metadata || typeof result.metadata !== 'object') {
    throw new Error('AssetContract validation failed: result.metadata must be an object.');
  }
  if (typeof result.metadata.triangles !== 'number') {
    throw new Error('AssetContract validation failed: result.metadata.triangles must be a number.');
  }
  if (!result.metadata.boundsAABB || !Array.isArray(result.metadata.boundsAABB.min) || !Array.isArray(result.metadata.boundsAABB.max)) {
    throw new Error('AssetContract validation failed: result.metadata.boundsAABB must have min and max 3D vectors.');
  }
  for (let i = 0; i < result.geometries.length; i++) {
    const g = result.geometries[i];
    if (!g.geometry || !g.geometry.isBufferGeometry) {
      throw new Error(`AssetContract validation failed: geometries[${i}].geometry must be a THREE.BufferGeometry.`);
    }
    if (typeof g.materialKey !== 'string') {
      throw new Error(`AssetContract validation failed: geometries[${i}].materialKey must be a string.`);
    }
  }
  return true;
}

/**
 * Converts asset result geometries and transforms into a ready-to-render THREE.Group.
 */
export function buildSceneGroup(assetResult, materialBank) {
  const group = new THREE.Group();
  group.name = assetResult.metadata?.name || 'ProceduralAsset';

  for (const entry of assetResult.geometries) {
    let mat = materialBank ? materialBank.get(entry.materialKey) : new THREE.MeshStandardMaterial({ color: 0x888888 });
    if (entry.geometry && entry.geometry.attributes && entry.geometry.attributes.color && !mat.vertexColors) {
      mat = mat.clone();
      mat.vertexColors = true;
    }
    const mesh = new THREE.Mesh(entry.geometry, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (entry.name) {
      mesh.name = entry.name;
    }

    if (entry.transform) {
      if (entry.transform.position) {
        mesh.position.set(...entry.transform.position);
      }
      if (entry.transform.rotation) {
        mesh.rotation.set(...entry.transform.rotation);
      }
      if (entry.transform.scale) {
        mesh.scale.set(...entry.transform.scale);
      }
    }
    group.add(mesh);
  }

  if (typeof assetResult.updateAnimation === 'function') {
    group.userData.updateAnimation = (time, delta) => {
      assetResult.updateAnimation(time, delta, group);
    };
  }
  group.userData.metadata = assetResult.metadata;

  return group;
}
