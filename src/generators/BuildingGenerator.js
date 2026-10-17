/**
 * BuildingGenerator.js
 * 
 * "Ruined Brutalist Building"
 * - Hollow multi-story concrete structure (3 floors)
 * - Modular window cutouts
 * - 3D noise-fractured top edges
 * - Collapsed floor slabs
 * - Rubble piles
 * - Bent rusted rebar cylinders
 * - Merged sub-geometries via BufferGeometryUtils (< 1,500 tris budget)
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

  const concreteGeoms = [];
  const rebarGeoms = [];

  const buildingWidth = 8.0;
  const buildingDepth = 7.0;
  const storyHeight = 3.2;
  const numStories = 3;
  const wallThickness = 0.35;

  // 1. Columns (4 corner columns + 2 intermediate columns)
  const colSize = 0.6;
  const colPositions = [
    [-buildingWidth / 2 + colSize / 2, -buildingDepth / 2 + colSize / 2],
    [buildingWidth / 2 - colSize / 2, -buildingDepth / 2 + colSize / 2],
    [-buildingWidth / 2 + colSize / 2, buildingDepth / 2 - colSize / 2],
    [buildingWidth / 2 - colSize / 2, buildingDepth / 2 - colSize / 2],
    [0, -buildingDepth / 2 + colSize / 2],
    [0, buildingDepth / 2 - colSize / 2]
  ];

  for (let c = 0; c < colPositions.length; c++) {
    const [cx, cz] = colPositions[c];
    // Varied broken column height on upper story
    const brokenFactor = 0.6 + prng() * 0.45;
    const colHeight = storyHeight * (numStories - 1) + storyHeight * brokenFactor;

    const colGeom = new THREE.BoxGeometry(colSize, colHeight, colSize, 1, 4, 1);
    const pos = colGeom.attributes.position;
    // Displace top vertices of broken columns with noise
    for (let i = 0; i < pos.count; i++) {
      const vy = pos.getY(i);
      if (vy > colHeight * 0.35) {
        const vx = pos.getX(i);
        const vz = pos.getZ(i);
        const n = noise.fbm3D((cx + vx) * 1.5, (colHeight / 2 + vy) * 1.5, (cz + vz) * 1.5, 2);
        pos.setY(i, vy + n * 0.4);
      }
    }
    colGeom.computeVertexNormals();
    colGeom.translate(cx, colHeight / 2, cz);
    concreteGeoms.push(colGeom);

    // Bent rebar protruding from broken column tops (on alternating columns)
    if (c % 2 === 0) {
      const rx = cx + (prng() - 0.5) * 0.2;
      const rz = cz + (prng() - 0.5) * 0.2;
      const rebarLen = 0.8 + prng() * 0.6;
      const rebarGeom = new THREE.CylinderGeometry(0.025, 0.025, rebarLen, 3, 3);

      // Bend rebar
      const rPos = rebarGeom.attributes.position;
      const bendDirX = (prng() - 0.5) * 1.2;
      const bendDirZ = (prng() - 0.5) * 1.2;
      for (let i = 0; i < rPos.count; i++) {
        const yFrac = (rPos.getY(i) + rebarLen / 2) / rebarLen;
        rPos.setX(i, rPos.getX(i) + bendDirX * yFrac * yFrac * 0.35);
        rPos.setZ(i, rPos.getZ(i) + bendDirZ * yFrac * yFrac * 0.35);
      }
      rebarGeom.computeVertexNormals();
      rebarGeom.translate(rx, colHeight + rebarLen / 2, rz);
      rebarGeoms.push(rebarGeom);
    }
  }

  // 2. Concrete Floors (Story slabs)
  for (let s = 1; s <= numStories; s++) {
    const floorY = s * storyHeight;

    if (s < numStories) {
      // Intact / cracked lower floor slabs
      const slabGeom = new THREE.BoxGeometry(buildingWidth - colSize * 0.5, 0.25, buildingDepth - colSize * 0.5, 4, 1, 4);
      // Punch an internal stairwell / breach hole
      const pos = slabGeom.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vy = pos.getY(i);
        const vx = pos.getX(i);
        const vz = pos.getZ(i);
        const edgeNoise = noise.noise2D(vx * 2.0, vz * 2.0) * 0.08;
        pos.setY(i, vy + edgeNoise);
      }
      slabGeom.computeVertexNormals();
      slabGeom.translate(0, floorY, 0);
      concreteGeoms.push(slabGeom);
    } else {
      // Top story: Collapsed, broken floor slab hanging tilted downwards!
      const collapsedWidth = buildingWidth * 0.55;
      const collapsedDepth = buildingDepth * 0.6;
      const brokenSlab = new THREE.BoxGeometry(collapsedWidth, 0.22, collapsedDepth, 4, 1, 4);
      const bPos = brokenSlab.attributes.position;
      // Fracture edge
      for (let i = 0; i < bPos.count; i++) {
        const vx = bPos.getX(i);
        if (vx > collapsedWidth * 0.3) {
          const vz = bPos.getZ(i);
          bPos.setX(i, vx + noise.noise2D(vz * 3.0, vx * 3.0) * 0.25);
        }
      }
      brokenSlab.computeVertexNormals();
      // Tilt slab downwards (collapsed angle)
      brokenSlab.rotateZ(-0.35);
      brokenSlab.translate(0.5, floorY - 0.7, 0);
      concreteGeoms.push(brokenSlab);

      // Rebar protruding from fractured slab edge
      for (let rb = 0; rb < 3; rb++) {
        const rebarSlabGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.7, 4, 3);
        rebarSlabGeom.rotateZ(0.8 + (prng() - 0.5) * 0.4);
        rebarSlabGeom.translate(2.2, floorY - 0.9 + rb * 0.1, -1.2 + rb * 1.0);
        rebarGeoms.push(rebarSlabGeom);
      }
    }
  }

  // 3. Walls with Modular Window Openings & 3D Noise-Fractured Top Edges
  // Rear Wall (partially blasted away)
  const rearWallHeight = storyHeight * 2.4;
  const rearWall = new THREE.BoxGeometry(buildingWidth, rearWallHeight, wallThickness, 5, 5, 1);
  const rwPos = rearWall.attributes.position;
  for (let i = 0; i < rwPos.count; i++) {
    const y = rwPos.getY(i) + rearWallHeight / 2;
    const x = rwPos.getX(i);
    // Noise fractured top edge
    if (y > rearWallHeight * 0.6) {
      const fracture = noise.fbm3D(x * 0.8, y * 0.8, 1.0, 3) * 1.4;
      rwPos.setY(i, rwPos.getY(i) - Math.abs(fracture));
    }
  }
  rearWall.computeVertexNormals();
  rearWall.translate(0, rearWallHeight / 2, -buildingDepth / 2 + wallThickness / 2);
  concreteGeoms.push(rearWall);

  // Side Wall Left (with 2 punched modular window cutouts)
  // Window cutouts are formed by modular wall piers and lintels
  const wallSegments = [
    // Pier 1
    { x: -buildingWidth / 2 + wallThickness / 2, y: storyHeight * 0.8, z: -1.8, w: wallThickness, h: storyHeight * 1.6, d: 1.5 },
    // Pier 2 (between windows)
    { x: -buildingWidth / 2 + wallThickness / 2, y: storyHeight * 0.8, z: 0.2, w: wallThickness, h: storyHeight * 1.6, d: 1.0 },
    // Pier 3
    { x: -buildingWidth / 2 + wallThickness / 2, y: storyHeight * 0.8, z: 2.2, w: wallThickness, h: storyHeight * 1.6, d: 1.4 },
    // Lower windowsill spandrel
    { x: -buildingWidth / 2 + wallThickness / 2, y: 0.5, z: 0.2, w: wallThickness, h: 1.0, d: 5.4 }
  ];

  for (const seg of wallSegments) {
    const segGeom = new THREE.BoxGeometry(seg.w, seg.h, seg.d, 1, 2, 2);
    // Noise edge displacement
    const pos = segGeom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const py = pos.getY(i);
      const pz = pos.getZ(i);
      if (py > seg.h * 0.3) {
        pos.setY(i, py + noise.noise2D(pz * 2.0, py * 2.0) * 0.15);
      }
    }
    segGeom.computeVertexNormals();
    segGeom.translate(seg.x, seg.y, seg.z);
    concreteGeoms.push(segGeom);
  }

  // 4. Rubble Piles at Base (Displaced concrete masonry blocks)
  const numRubble = 8;
  for (let b = 0; b < numRubble; b++) {
    const rx = randRange(prng, -buildingWidth * 0.45, buildingWidth * 0.45);
    const rz = randRange(prng, -buildingDepth * 0.45, buildingDepth * 0.45);
    const rSize = randRange(prng, 0.3, 0.7);

    const rubbleGeom = new THREE.DodecahedronGeometry(rSize, 0); // low poly faceted rock/concrete chunk
    const rPos = rubbleGeom.attributes.position;
    for (let i = 0; i < rPos.count; i++) {
      const vx = rPos.getX(i);
      const vy = rPos.getY(i);
      const vz = rPos.getZ(i);
      const d = 1.0 + noise.noise3D(vx * 3.0, vy * 3.0, vz * 3.0) * 0.35;
      rPos.setXYZ(i, vx * d, vy * d * 0.6, vz * d); // squashed flat-ish chunk
    }
    rubbleGeom.computeVertexNormals();
    rubbleGeom.rotateX(prng() * Math.PI);
    rubbleGeom.rotateY(prng() * Math.PI);
    rubbleGeom.translate(rx, rSize * 0.3, rz);
    concreteGeoms.push(rubbleGeom);
  }

  // 5. Merge static sub-geometries sharing materials via BufferGeometryUtils.mergeGeometries
  const mergedConcrete = safeMergeGeometries(concreteGeoms, false);
  mergedConcrete.computeBoundingBox();

  const mergedRebar = safeMergeGeometries(rebarGeoms, false);
  mergedRebar.computeBoundingBox();

  // Clean up source geoms
  for (const g of concreteGeoms) g.dispose();
  for (const g of rebarGeoms) g.dispose();

  const entries = [
    {
      name: 'building_concrete',
      geometry: mergedConcrete,
      materialKey: MATERIAL_KEYS.CONCRETE,
      transform: { position: [0, 0, 0] }
    },
    {
      name: 'building_rebar',
      geometry: mergedRebar,
      materialKey: MATERIAL_KEYS.REBAR,
      transform: { position: [0, 0, 0] }
    }
  ];

  const boundsInfo = computeBoundsAndTriangles(entries);
  const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const result = {
    geometries: entries,
    metadata: {
      name: 'RuinedBrutalistBuilding',
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
