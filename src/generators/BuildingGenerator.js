/**
 * BuildingGenerator.js
 * 
 * Procedural Post-Apocalyptic Building Generator:
 * Supports 6 distinct architectural archetypes via BuildingCatalog:
 * 1. Brutalist Block (4-5 floors, collapsed slabs, broken columns, rebar)
 * 2. Low-Rise Apartment (3 floors, balcony slabs, window grid, collapsed corner)
 * 3. Warehouse (single story, wide, corrugated roof partly collapsed, big open front door)
 * 4. Half-Collapsed Office Tower (6 floors, sheared top, exposed slabs, rebar)
 * 5. Concrete Bunker (squat, thick walls, one doorway, antenna mast)
 * 6. Gas Station (canopy on pillars, small shop with door, rusted pumps)
 * 
 * Strict Budget:
 * - LOD0: <= 1,500 tris, <= 4 draw calls (merged per material)
 * - LOD1: ~40% tris
 * - Returns: { geometries, metadata, colliders, footprintRadius, doorways }
 * - Colliders: Ground floor wall AABBs with doorway gaps for walkable interiors
 */

import * as THREE from 'three';
import { SimplexNoise, createPRNG, randRange } from '../core/SeededNoise.js';
import { MATERIAL_KEYS, computeBoundsAndTriangles, validateAssetResult, safeMergeGeometries } from '../core/AssetContract.js';

export function generate(seed = 1337, lodLevel = 0, options = {}) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const prng = createPRNG(seed);
  const noise = new SimplexNoise(seed);

  // Archetype selection: string key or number 1..6
  let archetype = options.archetype || 'brutalist';
  if (typeof archetype === 'number') {
    const keys = ['brutalist', 'apartment', 'warehouse', 'office', 'bunker', 'gas_station'];
    archetype = keys[archetype - 1] || 'brutalist';
  }

  // Per-seed dimension variation (+/- 20%)
  const sizeMult = 0.85 + prng() * 0.3; // 0.85 to 1.15

  const concreteGeoms = [];
  const rebarGeoms = [];
  const scrapGeoms = [];
  const rustGeoms = [];

  const colliders = []; // World/local AABBs: { min: [x,y,z], max: [x,y,z] }
  const doorways = [];  // { position: [x,y,z], normal: [nx,ny,nz], width: number }
  let footprintRadius = 8.0;
  let assetName = 'RuinedBrutalistBuilding';

  // Helper to add displaced box geometry
  function addDisplacedBox(w, h, d, x, y, z, matList, noiseAmp = 0.12, segs = [1, 2, 1]) {
    const segX = lodLevel > 0 ? 1 : segs[0];
    const segY = lodLevel > 0 ? 1 : segs[1];
    const segZ = lodLevel > 0 ? 1 : segs[2];

    const geom = new THREE.BoxGeometry(w, h, d, segX, segY, segZ);
    if (lodLevel === 0 && noiseAmp > 0) {
      const pos = geom.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vy = pos.getY(i);
        if (vy > h * 0.25) {
          const vx = pos.getX(i);
          const vz = pos.getZ(i);
          const n = noise.fbm3D((x + vx) * 1.5, (y + vy) * 1.5, (z + vz) * 1.5, 2) * noiseAmp;
          pos.setY(i, vy + n);
        }
      }
    }
    geom.computeVertexNormals();
    geom.translate(x, y, z);
    matList.push(geom);
  }

  // Helper to add ground-floor wall collider
  function addWallCollider(minX, minY, minZ, maxX, maxY, maxZ) {
    colliders.push({
      min: [Math.min(minX, maxX), Math.min(minY, maxY), Math.min(minZ, maxZ)],
      max: [Math.max(minX, maxX), Math.max(minY, maxY), Math.max(minZ, maxZ)]
    });
  }

  // =========================================================================
  // 1. BRUTALIST BLOCK (Phase 1 Baseline & Archetype 1)
  // =========================================================================
  if (archetype === 'brutalist') {
    assetName = 'RuinedBrutalistBuilding';
    const buildingWidth = 8.0 * sizeMult;
    const buildingDepth = 7.0 * sizeMult;
    const storyHeight = 3.2;
    const numStories = 3;
    const wallThick = 0.35;
    footprintRadius = Math.hypot(buildingWidth, buildingDepth) * 0.55;

    // Columns
    const colSize = 0.6;
    const colPositions = [
      [-buildingWidth / 2 + colSize / 2, -buildingDepth / 2 + colSize / 2],
      [buildingWidth / 2 - colSize / 2, -buildingDepth / 2 + colSize / 2],
      [-buildingWidth / 2 + colSize / 2, buildingDepth / 2 - colSize / 2],
      [buildingWidth / 2 - colSize / 2, buildingDepth / 2 - colSize / 2],
      [0, -buildingDepth / 2 + colSize / 2]
    ];

    for (let c = 0; c < colPositions.length; c++) {
      const [cx, cz] = colPositions[c];
      const brokenFactor = 0.6 + prng() * 0.45;
      const colHeight = storyHeight * (numStories - 1) + storyHeight * brokenFactor;
      addDisplacedBox(colSize, colHeight, colSize, cx, colHeight / 2, cz, concreteGeoms, 0.35, [1, 3, 1]);

      // Rebar
      if (lodLevel === 0 && c % 2 === 0) {
        const rebarLen = 0.8 + prng() * 0.5;
        const rebarGeom = new THREE.CylinderGeometry(0.025, 0.025, rebarLen, 3, 2);
        rebarGeom.translate(cx, colHeight + rebarLen / 2, cz);
        rebarGeoms.push(rebarGeom);
      }
    }

    // Floor slabs
    for (let s = 1; s <= numStories; s++) {
      const floorY = s * storyHeight;
      if (s < numStories) {
        addDisplacedBox(buildingWidth - colSize * 0.5, 0.25, buildingDepth - colSize * 0.5, 0, floorY, 0, concreteGeoms, 0.15, [2, 1, 2]);
      } else {
        // Fractured roof slab
        addDisplacedBox((buildingWidth - colSize * 0.5) * 0.65, 0.25, buildingDepth - colSize * 0.5, -buildingWidth * 0.15, floorY, 0, concreteGeoms, 0.4, [2, 1, 2]);
      }
    }

    // Rear Wall
    const rearH = storyHeight * 2.5;
    addDisplacedBox(buildingWidth - colSize, rearH, wallThick, 0, rearH / 2, -buildingDepth / 2 + wallThick / 2, concreteGeoms, 0.25, [2, 2, 1]);
    addWallCollider(-buildingWidth / 2, 0, -buildingDepth / 2, buildingWidth / 2, storyHeight, -buildingDepth / 2 + wallThick);

    // Left Side Wall
    const leftH = storyHeight * 2.0;
    addDisplacedBox(wallThick, leftH, buildingDepth - colSize, -buildingWidth / 2 + wallThick / 2, leftH / 2, 0, concreteGeoms, 0.2, [1, 2, 2]);
    addWallCollider(-buildingWidth / 2, 0, -buildingDepth / 2, -buildingWidth / 2 + wallThick, storyHeight, buildingDepth / 2);

    // Front Wall with Doorway Opening
    const doorW = 2.4;
    const frontWallW = (buildingWidth - doorW) / 2;
    // Front left segment
    addDisplacedBox(frontWallW, storyHeight, wallThick, -buildingWidth / 2 + frontWallW / 2, storyHeight / 2, buildingDepth / 2 - wallThick / 2, concreteGeoms, 0.15, [2, 2, 1]);
    addWallCollider(-buildingWidth / 2, 0, buildingDepth / 2 - wallThick, -doorW / 2, storyHeight, buildingDepth / 2);
    // Front right segment
    addDisplacedBox(frontWallW, storyHeight, wallThick, buildingWidth / 2 - frontWallW / 2, storyHeight / 2, buildingDepth / 2 - wallThick / 2, concreteGeoms, 0.15, [2, 2, 1]);
    addWallCollider(doorW / 2, 0, buildingDepth / 2 - wallThick, buildingWidth / 2, storyHeight, buildingDepth / 2);

    doorways.push({
      position: [0, 0, buildingDepth / 2],
      normal: [0, 0, 1],
      width: doorW
    });
  }

  // =========================================================================
  // 2. LOW-RISE APARTMENT (Archetype 2)
  // =========================================================================
  else if (archetype === 'apartment') {
    assetName = 'LowRiseApartment';
    const buildingWidth = 9.5 * sizeMult;
    const buildingDepth = 7.5 * sizeMult;
    const storyHeight = 3.0;
    const numStories = 3;
    const wallThick = 0.3;
    footprintRadius = Math.hypot(buildingWidth, buildingDepth) * 0.55;

    // Floor slabs with protruding exterior balconies on front
    for (let s = 1; s <= numStories; s++) {
      const fy = s * storyHeight;
      // Main slab
      addDisplacedBox(buildingWidth, 0.22, buildingDepth, 0, fy, 0, concreteGeoms, 0.1, [2, 1, 2]);
      // Balcony ledge extending +Z
      if (s <= 2) {
        addDisplacedBox(buildingWidth * 0.65, 0.18, 1.2, 0, fy, buildingDepth / 2 + 0.6, concreteGeoms, 0.05, [2, 1, 1]);
      }
    }

    // Sheared back-right corner
    // Rear wall (partial)
    const rearW = buildingWidth * 0.65;
    addDisplacedBox(rearW, storyHeight * numStories, wallThick, -buildingWidth * 0.15, (storyHeight * numStories) / 2, -buildingDepth / 2 + wallThick / 2, concreteGeoms, 0.3, [2, 3, 1]);
    addWallCollider(-buildingWidth / 2, 0, -buildingDepth / 2, -buildingWidth / 2 + rearW, storyHeight, -buildingDepth / 2 + wallThick);

    // Left wall (solid)
    addDisplacedBox(wallThick, storyHeight * numStories, buildingDepth, -buildingWidth / 2 + wallThick / 2, (storyHeight * numStories) / 2, 0, concreteGeoms, 0.15, [1, 3, 2]);
    addWallCollider(-buildingWidth / 2, 0, -buildingDepth / 2, -buildingWidth / 2 + wallThick, storyHeight, buildingDepth / 2);

    // Front ground floor wall with entrance doorway (1.8m wide)
    const doorW = 1.8;
    const fLeftW = (buildingWidth * 0.5) - doorW / 2;
    const fRightW = (buildingWidth * 0.5) - doorW / 2;

    addDisplacedBox(fLeftW, storyHeight, wallThick, -buildingWidth / 2 + fLeftW / 2, storyHeight / 2, buildingDepth / 2 - wallThick / 2, concreteGeoms, 0.1, [2, 2, 1]);
    addWallCollider(-buildingWidth / 2, 0, buildingDepth / 2 - wallThick, -doorW / 2, storyHeight, buildingDepth / 2);

    addDisplacedBox(fRightW, storyHeight, wallThick, buildingWidth / 2 - fRightW / 2, storyHeight / 2, buildingDepth / 2 - wallThick / 2, concreteGeoms, 0.1, [2, 2, 1]);
    addWallCollider(doorW / 2, 0, buildingDepth / 2 - wallThick, buildingWidth / 2, storyHeight, buildingDepth / 2);

    doorways.push({
      position: [0, 0, buildingDepth / 2],
      normal: [0, 0, 1],
      width: doorW
    });
  }

  // =========================================================================
  // 3. WAREHOUSE (Archetype 3)
  // =========================================================================
  else if (archetype === 'warehouse') {
    assetName = 'IndustrialWarehouse';
    const buildingWidth = 12.0 * sizeMult;
    const buildingDepth = 14.0 * sizeMult;
    const wallHeight = 4.8;
    const wallThick = 0.4;
    footprintRadius = Math.hypot(buildingWidth, buildingDepth) * 0.55;

    // Solid concrete perimeter walls with wide front entrance
    // Left wall
    addDisplacedBox(wallThick, wallHeight, buildingDepth, -buildingWidth / 2 + wallThick / 2, wallHeight / 2, 0, concreteGeoms, 0.15, [1, 2, 3]);
    addWallCollider(-buildingWidth / 2, 0, -buildingDepth / 2, -buildingWidth / 2 + wallThick, wallHeight, buildingDepth / 2);

    // Right wall
    addDisplacedBox(wallThick, wallHeight, buildingDepth, buildingWidth / 2 - wallThick / 2, wallHeight / 2, 0, concreteGeoms, 0.15, [1, 2, 3]);
    addWallCollider(buildingWidth / 2 - wallThick, 0, -buildingDepth / 2, buildingWidth / 2, wallHeight, buildingDepth / 2);

    // Rear wall
    addDisplacedBox(buildingWidth, wallHeight, wallThick, 0, wallHeight / 2, -buildingDepth / 2 + wallThick / 2, concreteGeoms, 0.15, [3, 2, 1]);
    addWallCollider(-buildingWidth / 2, 0, -buildingDepth / 2, buildingWidth / 2, wallHeight, -buildingDepth / 2 + wallThick);

    // Front wall with huge 3.4m wide roll-up cargo door
    const doorW = 3.4;
    const segW = (buildingWidth - doorW) / 2;

    // Front left
    addDisplacedBox(segW, wallHeight, wallThick, -buildingWidth / 2 + segW / 2, wallHeight / 2, buildingDepth / 2 - wallThick / 2, concreteGeoms, 0.15, [2, 2, 1]);
    addWallCollider(-buildingWidth / 2, 0, buildingDepth / 2 - wallThick, -doorW / 2, wallHeight, buildingDepth / 2);

    // Front right
    addDisplacedBox(segW, wallHeight, wallThick, buildingWidth / 2 - segW / 2, wallHeight / 2, buildingDepth / 2 - wallThick / 2, concreteGeoms, 0.15, [2, 2, 1]);
    addWallCollider(doorW / 2, 0, buildingDepth / 2 - wallThick, buildingWidth / 2, wallHeight, buildingDepth / 2);

    // Door lintel beam (above walking clearance 3.2m)
    addDisplacedBox(doorW, wallHeight - 3.2, wallThick, 0, 3.2 + (wallHeight - 3.2) / 2, buildingDepth / 2 - wallThick / 2, concreteGeoms, 0.05, [2, 1, 1]);

    doorways.push({
      position: [0, 0, buildingDepth / 2],
      normal: [0, 0, 1],
      width: doorW
    });

    // Corrugated Scrap Metal Roof (partly collapsed)
    const roofHalfW = buildingWidth * 0.52;
    // Front roof pitch left
    const roofL = new THREE.BoxGeometry(roofHalfW, 0.08, buildingDepth * 0.55);
    roofL.rotateZ(0.2);
    roofL.translate(-roofHalfW * 0.45, wallHeight + 0.6, buildingDepth * 0.18);
    scrapGeoms.push(roofL);

    // Front roof pitch right
    const roofR = new THREE.BoxGeometry(roofHalfW, 0.08, buildingDepth * 0.55);
    roofR.rotateZ(-0.2);
    roofR.translate(roofHalfW * 0.45, wallHeight + 0.6, buildingDepth * 0.18);
    scrapGeoms.push(roofR);

    // Back section collapsed inward (scrap metal slab leaning into warehouse floor)
    const roofCol = new THREE.BoxGeometry(roofHalfW * 0.8, 0.08, buildingDepth * 0.38);
    roofCol.rotateX(0.55);
    roofCol.rotateZ(0.2);
    roofCol.translate(0, 1.2, -buildingDepth * 0.2);
    scrapGeoms.push(roofCol);
  }

  // =========================================================================
  // 4. HALF-COLLAPSED OFFICE TOWER (Archetype 4)
  // =========================================================================
  else if (archetype === 'office') {
    assetName = 'ShearedOfficeTower';
    const buildingWidth = 8.5 * sizeMult;
    const buildingDepth = 8.0 * sizeMult;
    const storyHeight = 3.0;
    const numStories = 6;
    const wallThick = 0.35;
    footprintRadius = Math.hypot(buildingWidth, buildingDepth) * 0.55;

    // Floor slabs with progressive diagonal collapse
    for (let s = 1; s <= numStories; s++) {
      const fy = s * storyHeight;
      const frac = 1.0 - (s / (numStories + 1));
      const curW = buildingWidth * (0.4 + frac * 0.6);
      addDisplacedBox(curW, 0.25, buildingDepth, -buildingWidth * 0.5 + curW * 0.5, fy, 0, concreteGeoms, 0.25, [2, 1, 2]);

      // Rebar extending from sheared edges
      if (lodLevel === 0 && s >= 3) {
        const rLen = 1.2 + prng() * 0.6;
        const rGeom = new THREE.CylinderGeometry(0.025, 0.025, rLen, 3, 2);
        rGeom.rotateZ(Math.PI / 2 + (prng() - 0.5) * 0.4);
        rGeom.translate(-buildingWidth * 0.5 + curW + rLen * 0.4, fy, (prng() - 0.5) * buildingDepth * 0.6);
        rebarGeoms.push(rGeom);
      }
    }

    // Intact ground floor lobby
    // Left wall
    addDisplacedBox(wallThick, storyHeight, buildingDepth, -buildingWidth / 2 + wallThick / 2, storyHeight / 2, 0, concreteGeoms, 0.1, [1, 2, 2]);
    addWallCollider(-buildingWidth / 2, 0, -buildingDepth / 2, -buildingWidth / 2 + wallThick, storyHeight, buildingDepth / 2);

    // Rear wall
    addDisplacedBox(buildingWidth, storyHeight, wallThick, 0, storyHeight / 2, -buildingDepth / 2 + wallThick / 2, concreteGeoms, 0.1, [2, 2, 1]);
    addWallCollider(-buildingWidth / 2, 0, -buildingDepth / 2, buildingWidth / 2, storyHeight, -buildingDepth / 2 + wallThick);

    // Front lobby entrance (2.4m doorway)
    const doorW = 2.4;
    const fLeftW = (buildingWidth - doorW) / 2;
    addDisplacedBox(fLeftW, storyHeight, wallThick, -buildingWidth / 2 + fLeftW / 2, storyHeight / 2, buildingDepth / 2 - wallThick / 2, concreteGeoms, 0.1, [2, 2, 1]);
    addWallCollider(-buildingWidth / 2, 0, buildingDepth / 2 - wallThick, -doorW / 2, storyHeight, buildingDepth / 2);

    addDisplacedBox(fLeftW, storyHeight, wallThick, buildingWidth / 2 - fLeftW / 2, storyHeight / 2, buildingDepth / 2 - wallThick / 2, concreteGeoms, 0.1, [2, 2, 1]);
    addWallCollider(doorW / 2, 0, buildingDepth / 2 - wallThick, buildingWidth / 2, storyHeight, buildingDepth / 2);

    doorways.push({
      position: [0, 0, buildingDepth / 2],
      normal: [0, 0, 1],
      width: doorW
    });
  }

  // =========================================================================
  // 5. CONCRETE BUNKER (Archetype 5)
  // =========================================================================
  else if (archetype === 'bunker') {
    assetName = 'ConcreteMilitaryBunker';
    const bunkerW = 9.0 * sizeMult;
    const bunkerD = 9.0 * sizeMult;
    const bunkerH = 3.2;
    const blastWall = 0.8; // Thick concrete blast walls
    footprintRadius = Math.hypot(bunkerW, bunkerD) * 0.55;

    // Heavy roof slab
    addDisplacedBox(bunkerW + 0.4, 0.45, bunkerD + 0.4, 0, bunkerH + 0.22, 0, concreteGeoms, 0.08, [2, 1, 2]);

    // Left blast wall
    addDisplacedBox(blastWall, bunkerH, bunkerD, -bunkerW / 2 + blastWall / 2, bunkerH / 2, 0, concreteGeoms, 0.08, [1, 2, 2]);
    addWallCollider(-bunkerW / 2, 0, -bunkerD / 2, -bunkerW / 2 + blastWall, bunkerH, bunkerD / 2);

    // Right blast wall
    addDisplacedBox(blastWall, bunkerH, bunkerD, bunkerW / 2 - blastWall / 2, bunkerH / 2, 0, concreteGeoms, 0.08, [1, 2, 2]);
    addWallCollider(bunkerW / 2 - blastWall, 0, -bunkerD / 2, bunkerW / 2, bunkerH, bunkerD / 2);

    // Rear blast wall
    addDisplacedBox(bunkerW, bunkerH, blastWall, 0, bunkerH / 2, -bunkerD / 2 + blastWall / 2, concreteGeoms, 0.08, [2, 2, 1]);
    addWallCollider(-bunkerW / 2, 0, -bunkerD / 2, bunkerW / 2, bunkerH, -bunkerD / 2 + blastWall);

    // Front blast wall with 1.4m steel reinforced doorway
    const doorW = 1.4;
    const bLeftW = (bunkerW - doorW) / 2;

    addDisplacedBox(bLeftW, bunkerH, blastWall, -bunkerW / 2 + bLeftW / 2, bunkerH / 2, bunkerD / 2 - blastWall / 2, concreteGeoms, 0.08, [2, 2, 1]);
    addWallCollider(-bunkerW / 2, 0, bunkerD / 2 - blastWall, -doorW / 2, bunkerH, bunkerD / 2);

    addDisplacedBox(bLeftW, bunkerH, blastWall, bunkerW / 2 - bLeftW / 2, bunkerH / 2, bunkerD / 2 - blastWall / 2, concreteGeoms, 0.08, [2, 2, 1]);
    addWallCollider(doorW / 2, 0, bunkerD / 2 - blastWall, bunkerW / 2, bunkerH, bunkerD / 2);

    doorways.push({
      position: [0, 0, bunkerD / 2],
      normal: [0, 0, 1],
      width: doorW
    });

    // Steel antenna mast atop bunker
    const mastH = 3.6;
    const mastGeom = new THREE.CylinderGeometry(0.04, 0.05, mastH, 4, 1);
    mastGeom.translate(1.5, bunkerH + 0.45 + mastH / 2, 1.5);
    rebarGeoms.push(mastGeom);

    const crossbar = new THREE.BoxGeometry(0.8, 0.04, 0.04);
    crossbar.translate(1.5, bunkerH + 0.45 + mastH * 0.9, 1.5);
    rebarGeoms.push(crossbar);
  }

  // =========================================================================
  // 6. GAS STATION (Archetype 6)
  // =========================================================================
  else if (archetype === 'gas_station') {
    assetName = 'DerelictGasStation';
    const canopyW = 12.0 * sizeMult;
    const canopyD = 8.0 * sizeMult;
    const canopyH = 4.2;
    footprintRadius = 11.0;

    // Canopy Roof
    addDisplacedBox(canopyW, 0.35, canopyD, 0, canopyH, 0, scrapGeoms, 0.08, [2, 1, 2]);

    // 4 Support Pillars
    const pilW = 0.45;
    const pilPositions = [
      [-canopyW * 0.35, -canopyD * 0.3],
      [-canopyW * 0.35, canopyD * 0.3],
      [canopyW * 0.35, -canopyD * 0.3],
      [canopyW * 0.35, canopyD * 0.3]
    ];

    for (const [px, pz] of pilPositions) {
      addDisplacedBox(pilW, canopyH, pilW, px, canopyH / 2, pz, concreteGeoms, 0.05, [1, 2, 1]);
      addWallCollider(px - pilW / 2, 0, pz - pilW / 2, px + pilW / 2, canopyH, pz + pilW / 2);
    }

    // 2 Rusted Fuel Pumps under canopy
    const pumpPositions = [-2.4, 2.4];
    for (const px of pumpPositions) {
      // Concrete island
      addDisplacedBox(0.9, 0.2, 2.2, px, 0.1, 0, concreteGeoms, 0.03, [1, 1, 1]);
      // Pump body (rust)
      addDisplacedBox(0.6, 1.4, 0.8, px, 0.9, 0, rustGeoms, 0.04, [1, 1, 1]);
      addWallCollider(px - 0.45, 0, -1.1, px + 0.45, 1.6, 1.1);
    }

    // Small attached Convenience Shop building behind canopy
    const shopW = 6.0 * sizeMult;
    const shopD = 5.0 * sizeMult;
    const shopH = 3.2;
    const shopZ = -canopyD * 0.5 - shopD * 0.5 - 1.0;
    const wallThick = 0.3;

    // Shop roof
    addDisplacedBox(shopW + 0.2, 0.25, shopD + 0.2, 0, shopH + 0.12, shopZ, concreteGeoms, 0.08, [2, 1, 2]);

    // Shop left wall
    addDisplacedBox(wallThick, shopH, shopD, -shopW / 2 + wallThick / 2, shopH / 2, shopZ, concreteGeoms, 0.08, [1, 2, 2]);
    addWallCollider(-shopW / 2, 0, shopZ - shopD / 2, -shopW / 2 + wallThick, shopH, shopZ + shopD / 2);

    // Shop right wall
    addDisplacedBox(wallThick, shopH, shopD, shopW / 2 - wallThick / 2, shopH / 2, shopZ, concreteGeoms, 0.08, [1, 2, 2]);
    addWallCollider(shopW / 2 - wallThick, 0, shopZ - shopD / 2, shopW / 2, shopH, shopZ + shopD / 2);

    // Shop rear wall
    addDisplacedBox(shopW, shopH, wallThick, 0, shopH / 2, shopZ - shopD / 2 + wallThick / 2, concreteGeoms, 0.08, [2, 2, 1]);
    addWallCollider(-shopW / 2, 0, shopZ - shopD / 2, shopW / 2, shopH, shopZ - shopD / 2 + wallThick);

    // Shop front wall with 1.2m entrance door
    const doorW = 1.2;
    const sLeftW = (shopW - doorW) / 2;
    addDisplacedBox(sLeftW, shopH, wallThick, -shopW / 2 + sLeftW / 2, shopH / 2, shopZ + shopD / 2 - wallThick / 2, concreteGeoms, 0.08, [2, 2, 1]);
    addWallCollider(-shopW / 2, 0, shopZ + shopD / 2 - wallThick, -doorW / 2, shopH, shopZ + shopD / 2);

    addDisplacedBox(sLeftW, shopH, wallThick, shopW / 2 - sLeftW / 2, shopH / 2, shopZ + shopD / 2 - wallThick / 2, concreteGeoms, 0.08, [2, 2, 1]);
    addWallCollider(doorW / 2, 0, shopZ + shopD / 2 - wallThick, shopW / 2, shopH, shopZ + shopD / 2);

    doorways.push({
      position: [0, 0, shopZ + shopD / 2],
      normal: [0, 0, 1],
      width: doorW
    });
  }

  // =========================================================================
  // MERGE SUB-GEOMETRIES PER MATERIAL (Draw call budget <= 4)
  // =========================================================================
  const entries = [];

  if (concreteGeoms.length > 0) {
    const mergedConcrete = safeMergeGeometries(concreteGeoms, false);
    if (mergedConcrete) {
      mergedConcrete.computeBoundingBox();
      entries.push({
        name: 'building_concrete',
        geometry: mergedConcrete,
        materialKey: MATERIAL_KEYS.CONCRETE,
        transform: { position: [0, 0, 0] }
      });
    }
  }

  if (rebarGeoms.length > 0) {
    const mergedRebar = safeMergeGeometries(rebarGeoms, false);
    if (mergedRebar) {
      mergedRebar.computeBoundingBox();
      entries.push({
        name: 'building_rebar',
        geometry: mergedRebar,
        materialKey: MATERIAL_KEYS.REBAR,
        transform: { position: [0, 0, 0] }
      });
    }
  }

  if (scrapGeoms.length > 0) {
    const mergedScrap = safeMergeGeometries(scrapGeoms, false);
    if (mergedScrap) {
      mergedScrap.computeBoundingBox();
      entries.push({
        name: 'building_scrap',
        geometry: mergedScrap,
        materialKey: MATERIAL_KEYS.METAL_SCRAP,
        transform: { position: [0, 0, 0] }
      });
    }
  }

  if (rustGeoms.length > 0) {
    const mergedRust = safeMergeGeometries(rustGeoms, false);
    if (mergedRust) {
      mergedRust.computeBoundingBox();
      entries.push({
        name: 'building_rust',
        geometry: mergedRust,
        materialKey: MATERIAL_KEYS.RUST,
        transform: { position: [0, 0, 0] }
      });
    }
  }

  // Clean up source sub-geometries
  for (const g of concreteGeoms) g.dispose();
  for (const g of rebarGeoms) g.dispose();
  for (const g of scrapGeoms) g.dispose();
  for (const g of rustGeoms) g.dispose();

  const boundsInfo = computeBoundsAndTriangles(entries);
  const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const result = {
    geometries: entries,
    metadata: {
      name: assetName,
      archetype,
      seed,
      lodLevel,
      triangles: boundsInfo.triangles,
      boundsAABB: boundsInfo.boundsAABB,
      generationTimeMs: Math.round(t1 - t0)
    },
    colliders,
    footprintRadius,
    doorways,
    updateAnimation: () => {}
  };

  validateAssetResult(result);
  return result;
}

// ====================================================================
// GENSHIN ANIME CITY ARCHITECTURE HELPERS
// ====================================================================

export function makeBox(w, h, d, cx, cy, cz, taper = 1.0, tiltZ = 0, rotY = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
    if (vy > 0 && taper !== 1.0) { vx *= taper; vz *= taper; }
    pos.setXYZ(i, vx, vy, vz);
  }
  if (tiltZ !== 0) geo.rotateZ(tiltZ);
  if (rotY !== 0) geo.rotateY(rotY);
  geo.translate(cx, cy, cz);
  return geo;
}

export function paintGeo(geo, hexTop, hexBottom, rand = Math.random, ySpan = 16) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (g.attributes.uv) g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cTop = new THREE.Color(hexTop);
  const cBot = new THREE.Color(hexBottom);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = Math.max(0.0, Math.min(1.0, (y + 1.0) / ySpan));
    tmp.copy(cBot).lerp(cTop, t * 0.8 + rand() * 0.2);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

export function stripUV(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

export function addAnimeTimberHouse(bx, bz, w, d, stories, rotY, roofHexTop = 0xe76f51, roofHexBot = 0x9b2226, rand = Math.random, terrainY = 0) {
  const stoneGeos = [];
  const plasterGeos = [];
  const timberGeos = [];
  const roofGeos = [];
  const foliageGeos = [];
  const colliders = [];

  const baseH = 0.6;
  stoneGeos.push(paintGeo(makeBox(w + 0.4, baseH + 0.2, d + 0.4, bx, terrainY + baseH / 2 - 0.1, bz, 1.0, 0, rotY), 0xd6d3d1, 0x78716c, rand, 4));

  const storyH = 3.1;
  for (let s = 0; s < stories; s++) {
    const sy = terrainY + baseH + s * storyH;
    const sw = w * (s > 0 ? 1.06 : 1.0);
    const sd = d * (s > 0 ? 1.06 : 1.0);

    plasterGeos.push(paintGeo(makeBox(sw, storyH, sd, bx, sy + storyH / 2, bz, 1.0, 0, rotY), 0xfefae0, 0xddb892, rand, 14));
    timberGeos.push(paintGeo(makeBox(sw + 0.18, 0.26, sd + 0.18, bx, sy + storyH, bz, 1.0, 0, rotY), 0x582f0e, 0x3b1f09, rand, 14));
    timberGeos.push(paintGeo(makeBox(sw + 0.16, storyH, 0.24, bx, sy + storyH / 2, bz, 1.0, 0, rotY), 0x582f0e, 0x3b1f09, rand, 14));
    timberGeos.push(paintGeo(makeBox(0.24, storyH, sd + 0.16, bx, sy + storyH / 2, bz, 1.0, 0, rotY), 0x582f0e, 0x3b1f09, rand, 14));

    const winW = sw * 0.55;
    timberGeos.push(paintGeo(makeBox(winW, 1.25, sd + 0.22, bx, sy + storyH * 0.55, bz, 1.0, 0, rotY), 0x2b2d42, 0x141622, rand, 10));
  }

  const roofY = terrainY + baseH + stories * storyH;
  const roofH = 2.6;
  const roof = new THREE.ConeGeometry(Math.max(w, d) * 0.82, roofH, 4);
  roof.rotateY(Math.PI / 4 + rotY);
  roof.scale(w / Math.max(w, d), 1, d / Math.max(w, d));
  roof.translate(bx, roofY + roofH / 2, bz);
  roofGeos.push(paintGeo(roof, roofHexTop, roofHexBot, rand, 18));

  foliageGeos.push(paintGeo(makeBox(w * 0.65, 0.55, d * 0.65, bx + 0.4, roofY + 0.3, bz - 0.3, 0.75, 0.1, rotY), 0x95d5b2, 0x40916c, rand, 18));

  // Exact rotated AABB extents for house (no invisible sidewalk collisions)
  const hw = (w + 0.4) / 2;
  const hd = (d + 0.4) / 2;
  const cosR = Math.abs(Math.cos(rotY));
  const sinR = Math.abs(Math.sin(rotY));
  const extX = hw * cosR + hd * sinR;
  const extZ = hw * sinR + hd * cosR;

  colliders.push({
    min: [bx - extX, terrainY - 1.0, bz - extZ],
    max: [bx + extX, roofY + roofH + 0.5, bz + extZ]
  });

  return { stoneGeos, plasterGeos, timberGeos, roofGeos, foliageGeos, colliders };
}

export function addShatteredAnimeHighrise(bx, bz, w, d, stories, rotY, rand = Math.random, terrainY = 0) {
  const stoneGeos = [];
  const plasterGeos = [];
  const timberGeos = [];
  const foliageGeos = [];
  const leylineGeos = [];
  const floatingStoneGeos = [];
  const colliders = [];

  const floorH = 3.2;
  const totalH = stories * floorH;

  stoneGeos.push(paintGeo(makeBox(w + 1.4, 0.9, d + 1.4, bx, terrainY + 0.35, bz, 0.88, 0, rotY), 0x94a3b8, 0x475569, rand, 5));

  for (let s = 0; s < stories; s++) {
    const sy = terrainY + 0.6 + s * floorH;
    const isShatteredTop = (s >= stories - 2);

    if (isShatteredTop && rand() < 0.45) {
      const floatChunk = makeBox(w * 0.55, floorH * 0.8, d * 0.55, bx + (rand() - 0.5) * 3.5, sy + 2.8 + rand() * 3.0, bz + (rand() - 0.5) * 3.5, 0.85, 0.25, rotY + 0.4);
      floatingStoneGeos.push(paintGeo(floatChunk, 0xe2e8f0, 0x64748b, rand, 26));
      continue;
    }

    plasterGeos.push(paintGeo(makeBox(w, floorH * 0.82, d, bx, sy + floorH * 0.42, bz, 1.0, 0, rotY), 0xe2e8f0, 0x94a3b8, rand, 26));
    stoneGeos.push(paintGeo(makeBox(w + 0.35, 0.38, d + 0.35, bx, sy + floorH * 0.9, bz, 0.96, 0, rotY), 0x64748b, 0x334155, rand, 26));
    timberGeos.push(paintGeo(makeBox(w + 0.12, floorH * 0.45, d * 0.72, bx, sy + floorH * 0.48, bz, 1.0, 0, rotY), 0x1e293b, 0x0f172a, rand, 26));
  }

  const shard = new THREE.ConeGeometry(1.1, 4.2, 5);
  shard.rotateZ(0.28);
  shard.rotateY(rotY);
  shard.translate(bx, terrainY + 0.6 + totalH + 1.0, bz);
  leylineGeos.push(stripUV(shard));

  foliageGeos.push(paintGeo(makeBox(w * 0.8, 0.9, d * 0.8, bx, terrainY + 0.6 + totalH - 0.2, bz, 0.7, 0, rotY), 0x74c69d, 0x2d6a4f, rand, 28));

  // Exact rotated AABB extents for highrise tower
  const hw = (w + 1.4) / 2;
  const hd = (d + 1.4) / 2;
  const cosR = Math.abs(Math.cos(rotY));
  const sinR = Math.abs(Math.sin(rotY));
  const extX = hw * cosR + hd * sinR;
  const extZ = hw * sinR + hd * cosR;

  colliders.push({
    min: [bx - extX, terrainY - 1.0, bz - extZ],
    max: [bx + extX, terrainY + 0.6 + totalH + 6.0, bz + extZ]
  });

  return { stoneGeos, plasterGeos, timberGeos, foliageGeos, leylineGeos, floatingStoneGeos, colliders };
}
