/**
 * PropsGenerator.js
 * 
 * "Rusted Props & Barricade Pack"
 * - Radially dented oil drums
 * - Bent tubular streetlight with sagging catenary wire spline
 * - Sine-wave corrugated scrap-metal barricades
 * - Sub-geometries merged via BufferGeometryUtils
 * - Complies with AssetContract (prop pack < 1,000 tris total)
 */

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { SimplexNoise, createPRNG, generateCatenaryCurve } from '../core/SeededNoise.js';
import { MATERIAL_KEYS, computeBoundsAndTriangles, validateAssetResult, safeMergeGeometries } from '../core/AssetContract.js';

/**
 * Generates radially dented oil drum
 */
function createDentedDrum(seed, noise, prng, posX, posZ, rotY) {
  const radius = 0.42;
  const height = 1.1;
  const drumGeom = new THREE.CylinderGeometry(radius, radius, height, 12, 8);
  const pos = drumGeom.attributes.position;

  // Impact dent location on the drum side
  const dentAngle = prng() * Math.PI * 2;
  const dentY = (prng() - 0.5) * 0.4;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    const r = Math.hypot(x, z);
    if (r > 0.05) {
      const angle = Math.atan2(z, x);

      // Circumferential strengthening rings (two ribs around drums)
      let rib = 0.0;
      if (Math.abs(y - 0.22) < 0.08 || Math.abs(y + 0.22) < 0.08) {
        rib = 0.035;
      }

      // Seeded radial dent
      const angleDiff = Math.abs(Math.atan2(Math.sin(angle - dentAngle), Math.cos(angle - dentAngle)));
      const yDiff = Math.abs(y - dentY);
      let dent = 0.0;
      if (angleDiff < 1.0 && yDiff < 0.35) {
        const falloff = (1.0 - angleDiff / 1.0) * (1.0 - yDiff / 0.35);
        dent = falloff * falloff * 0.12; // inward crushed dent
      }

      // High-frequency rust pitting
      const rustDisplace = noise.noise3D(x * 10.0, y * 10.0, z * 10.0) * 0.012;

      const newR = Math.max(0.1, r + rib - dent + rustDisplace);
      pos.setX(i, (x / r) * newR);
      pos.setZ(i, (z / r) * newR);
    }
  }

  drumGeom.computeVertexNormals();
  drumGeom.rotateY(rotY);
  drumGeom.translate(posX, height / 2, posZ);
  return drumGeom;
}

/**
 * Generates corrugated scrap metal barricade with bolted A-frame supports
 */
function createBarricade(seed, noise, prng, posX, posZ, rotY) {
  const width = 2.4;
  const height = 1.3;
  const segsX = 16;
  const segsY = 5;

  // Corrugated sheet plane
  const sheetGeom = new THREE.PlaneGeometry(width, height, segsX, segsY);
  const pos = sheetGeom.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);

    // Sine-wave corrugation
    let z = Math.sin(x * 18.0) * 0.045;

    // Bullet indentations & shrapnel tears
    const n = noise.noise2D(x * 6.0, y * 6.0);
    if (n > 0.45) {
      z += (n - 0.45) * 0.08;
    }

    // Jagged top edge
    if (y > height * 0.35) {
      const edgeCut = noise.noise2D(x * 8.0, 10.0) * 0.08;
      pos.setY(i, y - Math.abs(edgeCut));
    }

    pos.setZ(i, z);
  }

  sheetGeom.computeVertexNormals();
  sheetGeom.rotateY(rotY);
  sheetGeom.translate(posX, height / 2 + 0.1, posZ);

  // A-frame structural rebar / angle iron struts
  const frameGeoms = [];
  const strutPositions = [-width * 0.4, width * 0.4];
  for (const sx of strutPositions) {
    // Front diagonal strut
    const leg1 = new THREE.CylinderGeometry(0.03, 0.03, 1.4, 4);
    leg1.rotateX(0.35);
    leg1.translate(sx, 0.65, 0.25);
    // Rear diagonal strut
    const leg2 = new THREE.CylinderGeometry(0.03, 0.03, 1.4, 4);
    leg2.rotateX(-0.35);
    leg2.translate(sx, 0.65, -0.25);

    leg1.rotateY(rotY);
    leg2.rotateY(rotY);
    frameGeoms.push(leg1, leg2);
  }

  const mergedFrame = safeMergeGeometries(frameGeoms, false);
  mergedFrame.translate(posX, 0, posZ);
  for (const g of frameGeoms) g.dispose();

  return { sheetGeom, frameGeom: mergedFrame };
}

/**
 * Generates bent tubular streetlight with sagging catenary wire spline
 */
function createStreetlight(seed, noise, prng, posX, posZ, rotY) {
  const poleHeight = 4.8;
  const poleGeoms = [];
  const rebarGeoms = [];

  // Base mount
  const baseGeom = new THREE.BoxGeometry(0.5, 0.15, 0.5);
  baseGeom.translate(0, 0.075, 0);
  poleGeoms.push(baseGeom);

  // Vertical pole with progressive bend at top
  const pole = new THREE.CylinderGeometry(0.09, 0.14, poleHeight, 6, 8);
  const pPos = pole.attributes.position;
  const bendAmount = 1.1; // bent leaning streetlight

  for (let i = 0; i < pPos.count; i++) {
    const y = pPos.getY(i) + poleHeight / 2;
    if (y > poleHeight * 0.65) {
      const frac = (y - poleHeight * 0.65) / (poleHeight * 0.35);
      const bend = frac * frac * bendAmount;
      pPos.setX(i, pPos.getX(i) + bend);
    }
  }
  pole.computeVertexNormals();
  pole.translate(0, poleHeight / 2, 0);
  poleGeoms.push(pole);

  // Battered lamp housing at tip
  const lampGeom = new THREE.BoxGeometry(0.3, 0.18, 0.7);
  lampGeom.rotateZ(0.25);
  lampGeom.translate(bendAmount + 0.2, poleHeight - 0.1, 0);
  poleGeoms.push(lampGeom);

  const mergedPole = safeMergeGeometries(poleGeoms, false);
  mergedPole.rotateY(rotY);
  mergedPole.translate(posX, 0, posZ);
  for (const g of poleGeoms) g.dispose();

  // Sagging catenary wire spline drooping down from lamp tip
  const wireStart = [posX + (bendAmount + 0.3) * Math.cos(rotY), poleHeight - 0.2, posZ - (bendAmount + 0.3) * Math.sin(rotY)];
  const wireEnd = [posX + 1.8 * Math.cos(rotY + 0.5), 0.15, posZ + 1.8 * Math.sin(rotY + 0.5)];
  const catenaryPoints = generateCatenaryCurve(wireStart, wireEnd, 1.4, 12);

  // Convert catenary spline points to a thin wire tube geometry
  const curveVectors = catenaryPoints.map(p => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(curveVectors);
  const wireGeom = new THREE.TubeGeometry(curve, 14, 0.012, 4, false);
  wireGeom.computeVertexNormals();
  rebarGeoms.push(wireGeom);

  const mergedWire = safeMergeGeometries(rebarGeoms, false);
  for (const g of rebarGeoms) g.dispose();

  return { poleGeom: mergedPole, wireGeom: mergedWire };
}

export function generate(seed = 1337, lodLevel = 0, options = {}) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const prng = createPRNG(seed);
  const noise = new SimplexNoise(seed);

  const rustGeoms = [];
  const scrapGeoms = [];
  const rebarGeoms = [];

  // Drum 1: upright dented drum
  const drum1 = createDentedDrum(seed + 1, noise, prng, -1.8, -0.6, 0.2);
  rustGeoms.push(drum1);

  // Drum 2: knocked over rolling drum
  const drum2 = createDentedDrum(seed + 2, noise, prng, 0, 0, 0);
  drum2.rotateZ(Math.PI / 2);
  drum2.translate(-1.4, 0.42, 0.7);
  rustGeoms.push(drum2);

  // Barricade: corrugated scrap metal with A-frame
  const barricade = createBarricade(seed + 3, noise, prng, 1.0, -0.3, 0.25);
  scrapGeoms.push(barricade.sheetGeom);
  rebarGeoms.push(barricade.frameGeom);

  // Streetlight: bent tubular pole with catenary wire
  const streetlight = createStreetlight(seed + 4, noise, prng, 2.8, 1.2, -0.6);
  scrapGeoms.push(streetlight.poleGeom);
  rebarGeoms.push(streetlight.wireGeom);

  // Merge static sub-geometries sharing materials
  const mergedRust = safeMergeGeometries(rustGeoms, false);
  const mergedScrap = safeMergeGeometries(scrapGeoms, false);
  const mergedRebar = safeMergeGeometries(rebarGeoms, false);

  for (const g of rustGeoms) g.dispose();
  for (const g of scrapGeoms) g.dispose();
  for (const g of rebarGeoms) g.dispose();

  const entries = [
    {
      name: 'props_rust',
      geometry: mergedRust,
      materialKey: MATERIAL_KEYS.RUST,
      transform: { position: [0, 0, 0] }
    },
    {
      name: 'props_scrap',
      geometry: mergedScrap,
      materialKey: MATERIAL_KEYS.METAL_SCRAP,
      transform: { position: [0, 0, 0] }
    },
    {
      name: 'props_rebar',
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
      name: 'RustedPropsPack',
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

export { createDentedDrum, createBarricade, createStreetlight };

// ====================================================================
// GENSHIN OVERGROWN ANIME TRAM
// ====================================================================
import { paintGeo, makeBox } from './BuildingGenerator.js';

export function addOvergrownTram(cx, cz, rotY = 0, seed = 777, terrainY = 0) {
  const rand = (() => {
    let s = seed ^ (Math.floor(cx) * 53492791) ^ (Math.floor(cz) * 31492791);
    return () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();

  const stoneGeos = [];
  const plasterGeos = [];
  const foliageGeos = [];

  stoneGeos.push(paintGeo(makeBox(3.2, 2.4, 7.8, cx, terrainY + 1.35, cz, 0.96, 0.06, rotY), 0x52b788, 0x2d6a4f, rand, 4));
  plasterGeos.push(paintGeo(makeBox(3.28, 0.95, 7.4, cx, terrainY + 1.75, cz, 1.0, 0.06, rotY), 0xf8f9fa, 0xcbd5e1, rand, 4));
  foliageGeos.push(paintGeo(makeBox(2.8, 0.6, 4.5, cx, terrainY + 2.65, cz, 0.7, 0, rotY), 0x95d5b2, 0x40916c, rand, 5));

  const collider = {
    min: [cx - 2.5, terrainY - 1.0, cz - 4.5],
    max: [cx + 2.5, terrainY + 3.5, cz + 4.5]
  };

  return { stoneGeos, plasterGeos, foliageGeos, collider };
}
