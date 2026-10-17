/**
 * Placement.js
 * 
 * Deterministic procedural world placement:
 * - Hash-based chunk generation (deterministic across runs)
 * - 0-2 buildings per chunk from the 6-archetype catalog (min spacing 40m, road clearance >= 9m)
 * - Start area (chunk 0,0): 1 warehouse + 1 apartment + 1 bunker within 60m of spawn
 * - Gas stations placed near road, streetlights & barricades along road
 * - Dead trees placed away from road (dist > 12m)
 * - Drums & rubble clustered near buildings
 * - Caps per chunk: 24 props, 12 trees, 20 rubble
 */

import { roadCenterX } from '../generators/TerrainGenerator.js';

// Deterministic 32-bit integer PRNG hash from coords and seed
function hash2D(x, z, seed = 1337) {
  let h = seed ^ (x * 374761393) ^ (z * 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function createChunkPRNG(chunkX, chunkZ, seed) {
  let state = hash2D(chunkX, chunkZ, seed);
  return function next() {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getChunkPlacement(chunkX, chunkZ, worldSeed, heightAt) {
  const prng = createChunkPRNG(chunkX, chunkZ, worldSeed);
  const chunkSize = 64;
  const originX = chunkX * chunkSize;
  const originZ = chunkZ * chunkSize;

  const buildings = [];
  const props = [];
  const trees = [];
  const rubble = [];

  const roadMargin = 9.0; // Half-width road corridor + clearance

  // Helper to test if (wx, wz) is inside road corridor
  const isRoad = (wx, wz, margin = roadMargin) => {
    const rx = roadCenterX(wz, worldSeed);
    return Math.abs(wx - rx) < margin;
  };

  // =========================================================================
  // 1. START CHUNK (0, 0): Explicit Placement of 3 Different Buildings
  // =========================================================================
  if (chunkX === 0 && chunkZ === 0) {
    // 1. Industrial Warehouse (+X, -Z)
    const whX = 24.0;
    const whZ = -14.0;
    const whY = heightAt(whX, whZ, worldSeed);
    buildings.push({
      archetype: 'warehouse',
      x: whX, y: whY, z: whZ,
      yaw: 0.25,
      seed: hash2D(chunkX, chunkZ, worldSeed + 101)
    });

    // 2. Low-Rise Apartment (-X, +Z)
    const apX = -24.0;
    const apZ = 18.0;
    const apY = heightAt(apX, apZ, worldSeed);
    buildings.push({
      archetype: 'apartment',
      x: apX, y: apY, z: apZ,
      yaw: -0.4,
      seed: hash2D(chunkX, chunkZ, worldSeed + 102)
    });

    // 3. Concrete Military Bunker (-X, -Z)
    const buX = -22.0;
    const buZ = -24.0;
    const buY = heightAt(buX, buZ, worldSeed);
    buildings.push({
      archetype: 'bunker',
      x: buX, y: buY, z: buZ,
      yaw: 0.8,
      seed: hash2D(chunkX, chunkZ, worldSeed + 103)
    });
  } else {
    // =========================================================================
    // GENERAL CHUNKS: Deterministic 0-2 Buildings
    // =========================================================================
    const numBuildings = Math.floor(prng() * 2.2); // 0, 1, or 2

    for (let b = 0; b < numBuildings; b++) {
      let candX = 0, candZ = 0, valid = false;

      // Try candidate positions avoiding road and other buildings
      for (let attempt = 0; attempt < 8; attempt++) {
        const lx = (prng() - 0.5) * (chunkSize - 20);
        const lz = (prng() - 0.5) * (chunkSize - 20);
        candX = originX + lx;
        candZ = originZ + lz;

        if (isRoad(candX, candZ, 12.0)) continue;

        // Min spacing 40m from other buildings
        let tooClose = false;
        for (const existing of buildings) {
          if (Math.hypot(candX - existing.x, candZ - existing.z) < 40.0) {
            tooClose = true;
            break;
          }
        }
        if (!tooClose) {
          valid = true;
          break;
        }
      }

      if (valid) {
        // Archetype selection
        const rx = roadCenterX(candZ, worldSeed);
        const distToRoad = Math.abs(candX - rx);

        let archetype = 'brutalist';
        if (distToRoad < 20.0 && prng() > 0.4) {
          archetype = 'gas_station';
        } else {
          const archOptions = ['apartment', 'warehouse', 'office', 'bunker', 'brutalist'];
          archetype = archOptions[Math.floor(prng() * archOptions.length)];
        }

        const bY = heightAt(candX, candZ, worldSeed);
        buildings.push({
          archetype,
          x: candX, y: bY, z: candZ,
          yaw: prng() * Math.PI * 2,
          seed: hash2D(chunkX * 10 + b, chunkZ * 10 + b, worldSeed)
        });
      }
    }
  }

  // =========================================================================
  // 2. PROPS PLACEMENT (Streetlights, Barricades, Drums) - Cap 24
  // =========================================================================
  // Along Road: bent streetlights & barricades
  const numRoadSteps = 4;
  for (let s = 0; s < numRoadSteps; s++) {
    if (props.length >= 24) break;
    const wz = originZ - chunkSize * 0.5 + (s + 0.5) * (chunkSize / numRoadSteps);
    const rx = roadCenterX(wz, worldSeed);

    // Streetlight on alternating road shoulders (+/- 4.8m)
    const side = s % 2 === 0 ? 1 : -1;
    const slX = rx + side * 4.8;
    const slY = heightAt(slX, wz, worldSeed);
    props.push({
      type: 'streetlight',
      x: slX, y: slY, z: wz,
      yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2,
      scale: [1, 1, 1]
    });

    // Barricade on shoulder
    if (prng() > 0.45 && props.length < 24) {
      const barX = rx - side * 4.5;
      const barY = heightAt(barX, wz, worldSeed);
      props.push({
        type: 'barricade',
        x: barX, y: barY, z: wz,
        yaw: prng() * 0.5,
        scale: [1, 1, 1]
      });
    }
  }

  // Oil drums clustered near buildings or scattered
  for (const b of buildings) {
    const numDrums = 2 + Math.floor(prng() * 2);
    for (let d = 0; d < numDrums; d++) {
      if (props.length >= 24) break;
      const angle = prng() * Math.PI * 2;
      const dist = 6.0 + prng() * 4.0;
      const dx = b.x + Math.cos(angle) * dist;
      const dz = b.z + Math.sin(angle) * dist;
      if (isRoad(dx, dz, 5.0)) continue;

      const dy = heightAt(dx, dz, worldSeed);
      props.push({
        type: 'drum',
        x: dx, y: dy, z: dz,
        yaw: prng() * Math.PI * 2,
        scale: [1, 1, 1]
      });
    }
  }

  // Supply / scrap crates near buildings
  for (const b of buildings) {
    if (props.length >= 24) break;
    const cx = b.x + (prng() > 0.5 ? 4.8 : -4.8);
    const cz = b.z + (prng() > 0.5 ? 4.8 : -4.8);
    if (!isRoad(cx, cz, 5.5)) {
      props.push({
        type: 'crate',
        x: cx, y: heightAt(cx, cz, worldSeed), z: cz,
        yaw: prng() * 1.5,
        scale: [1, 1, 1]
      });
    }
  }

  // Concrete road barriers along curves
  for (let s = 0; s < numRoadSteps; s++) {
    if (props.length >= 24) break;
    const wz = originZ - chunkSize * 0.5 + (s + 0.3) * (chunkSize / numRoadSteps);
    const rx = roadCenterX(wz, worldSeed);
    const side = s % 2 === 0 ? 1 : -1;
    const barX = rx + side * 4.4;
    const barY = heightAt(barX, wz, worldSeed);
    props.push({
      type: 'road_barrier',
      x: barX, y: barY, z: wz,
      yaw: 0.1,
      scale: [1, 1, 1]
    });
  }

  // Rusted vehicle wrecks on road shoulders or near buildings (1 per chunk if room)
  if (props.length < 24) {
    const wz = originZ + (prng() - 0.5) * 24;
    const rx = roadCenterX(wz, worldSeed);
    const side = prng() > 0.5 ? 1 : -1;
    const wx = rx + side * (6.5 + prng() * 2.0);
    if (!isRoad(wx, wz, 5.0)) {
      props.push({
        type: 'wreck',
        x: wx, y: heightAt(wx, wz, worldSeed), z: wz,
        yaw: prng() * Math.PI,
        scale: [1, 1, 1]
      });
    }
  }

  // =========================================================================
  // 3. DEAD TREES PLACEMENT (Away from road dist > 12m) - Cap 12
  // =========================================================================
  const treeCount = Math.floor(6 + prng() * 7); // 6 to 12
  for (let t = 0; t < treeCount; t++) {
    if (trees.length >= 12) break;
    const lx = (prng() - 0.5) * (chunkSize - 8);
    const lz = (prng() - 0.5) * (chunkSize - 8);
    const tx = originX + lx;
    const tz = originZ + lz;

    if (isRoad(tx, tz, 12.0)) continue;

    const ty = heightAt(tx, tz, worldSeed);
    const scale = 0.8 + prng() * 0.4;
    trees.push({
      type: 'tree',
      x: tx, y: ty, z: tz,
      yaw: prng() * Math.PI * 2,
      scale: [scale, scale, scale]
    });
  }

  // =========================================================================
  // 4. RUBBLE CHUNKS (Near buildings & terrain pockets) - Cap 20
  // =========================================================================
  for (const b of buildings) {
    const numRubble = 4 + Math.floor(prng() * 4);
    for (let r = 0; r < numRubble; r++) {
      if (rubble.length >= 20) break;
      const angle = prng() * Math.PI * 2;
      const dist = 4.0 + prng() * 6.0;
      const rx = b.x + Math.cos(angle) * dist;
      const rz = b.z + Math.sin(angle) * dist;
      const ry = heightAt(rx, rz, worldSeed);
      const rScale = 0.5 + prng() * 0.6;
      rubble.push({
        type: 'rubble',
        x: rx, y: ry + rScale * 0.2, z: rz,
        yaw: prng() * Math.PI * 2,
        scale: [rScale, rScale * 0.7, rScale]
      });
    }
  }

  return {
    buildings,
    props,
    trees,
    rubble
  };
}
