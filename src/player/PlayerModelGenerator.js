/**
 * PlayerModelGenerator.js
 * 
 * Procedural Scavenger Humanoid Model:
 * - 1.8m tall rigid humanoid (no skinning)
 * - Named joint hierarchy: root, hips, spine, chest, neck, head, shoulderL/R, elbowL/R, hipL/R, kneeL/R
 * - Built from BufferGeometry with tapered limbs, vertex noise, and vertex colors
 * - Scavenger look: hood + gas mask, torn jacket, cargo pants, boots, gloves, backpack with bedroll
 * - Palette: rust (#8B3A1D), olive (#4A5338), ash grey (#2C2E30)
 * - Strict budget: <= 1,800 tris, <= 12 draw calls, 1 shared material
 */

import * as THREE from 'three';
import { SimplexNoise, createPRNG } from '../core/SeededNoise.js';
import { safeMergeGeometries } from '../core/AssetContract.js';

export function createPlayerModel(seed = 4242) {
  const noise = new SimplexNoise(seed);
  const prng = createPRNG(seed);

  // Single shared material for all meshes (draw call budget <= 12)
  const sharedMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.18,
    name: 'PlayerScavengerMat'
  });

  // Color palette helpers
  const C_OLIVE_DARK = [0.24, 0.28, 0.19];
  const C_OLIVE = [0.32, 0.38, 0.24];
  const C_RUST = [0.55, 0.23, 0.12];
  const C_RUST_LIGHT = [0.68, 0.32, 0.16];
  const C_ASH_DARK = [0.15, 0.16, 0.17];
  const C_ASH_MID = [0.22, 0.23, 0.25];
  const C_ASH_LIGHT = [0.38, 0.40, 0.42];
  const C_AMBER = [0.91, 0.64, 0.24];

  function applyVertexColorsAndNoise(geom, baseColor, noiseScale = 0.015, colorVar = 0.08) {
    const pos = geom.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);

      // Subtle vertex noise for weathered/organic silhouette
      if (noiseScale > 0) {
        const nx = noise.fbm3D(vx * 12, vy * 12, vz * 12, 2) * noiseScale;
        const ny = noise.fbm3D(vx * 12 + 10, vy * 12 + 10, vz * 12 + 10, 2) * noiseScale;
        const nz = noise.fbm3D(vx * 12 + 20, vy * 12 + 20, vz * 12 + 20, 2) * noiseScale;
        pos.setXYZ(i, vx + nx, vy + ny, vz + nz);
      }

      // Color variation
      const cNoise = noise.noise3D(vx * 8, vy * 8, vz * 8) * colorVar;
      colors[i * 3] = Math.max(0, Math.min(1, baseColor[0] + cNoise));
      colors[i * 3 + 1] = Math.max(0, Math.min(1, baseColor[1] + cNoise * 0.9));
      colors[i * 3 + 2] = Math.max(0, Math.min(1, baseColor[2] + cNoise * 0.8));
    }

    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.computeVertexNormals();
    return geom;
  }

  // --- JOINT HIERARCHY ---
  const root = new THREE.Group();
  root.name = 'root';

  // 1. Hips / Pelvis (Cargo pants top) -> Mesh 1
  const hips = new THREE.Group();
  hips.name = 'hips';
  hips.position.set(0, 0.95, 0);
  root.add(hips);

  const hipsGeom = new THREE.CylinderGeometry(0.18, 0.16, 0.22, 7, 2);
  hipsGeom.scale(1.1, 1.0, 0.85);
  applyVertexColorsAndNoise(hipsGeom, C_OLIVE_DARK, 0.012, 0.06);
  const hipsMesh = new THREE.Mesh(hipsGeom, sharedMaterial);
  hipsMesh.castShadow = true;
  hipsMesh.receiveShadow = true;
  hips.add(hipsMesh);

  // 2. Spine (Mid torso, torn jacket base) -> Mesh 2
  const spine = new THREE.Group();
  spine.name = 'spine';
  spine.position.set(0, 0.14, 0);
  hips.add(spine);

  const spineGeom = new THREE.CylinderGeometry(0.20, 0.17, 0.18, 7, 2);
  spineGeom.scale(1.15, 1.0, 0.85);
  spineGeom.translate(0, 0.08, 0);
  applyVertexColorsAndNoise(spineGeom, C_OLIVE, 0.015, 0.06);
  const spineMesh = new THREE.Mesh(spineGeom, sharedMaterial);
  spineMesh.castShadow = true;
  spine.add(spineMesh);

  // 3. Chest (Upper jacket + backpack + rolled bedroll) -> Mesh 3
  const chest = new THREE.Group();
  chest.name = 'chest';
  chest.position.set(0, 0.18, 0);
  spine.add(chest);

  const chestGeom = new THREE.CylinderGeometry(0.23, 0.20, 0.24, 8, 2);
  chestGeom.scale(1.2, 1.0, 0.85);
  chestGeom.translate(0, 0.12, 0.01);
  applyVertexColorsAndNoise(chestGeom, C_OLIVE, 0.016, 0.07);

  const packGeom = new THREE.BoxGeometry(0.28, 0.32, 0.16, 2, 2, 2);
  packGeom.translate(0, 0.12, -0.19);
  applyVertexColorsAndNoise(packGeom, C_ASH_DARK, 0.015, 0.05);

  const rollGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.34, 6, 1);
  rollGeom.rotateZ(Math.PI / 2);
  rollGeom.translate(0, 0.31, -0.18);
  applyVertexColorsAndNoise(rollGeom, C_RUST, 0.012, 0.06);

  const chestMergedGeom = safeMergeGeometries([chestGeom, packGeom, rollGeom], false);
  chestGeom.dispose(); packGeom.dispose(); rollGeom.dispose();
  const chestMesh = new THREE.Mesh(chestMergedGeom, sharedMaterial);
  chestMesh.castShadow = true;
  chest.add(chestMesh);

  // Neck joint (Group)
  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.set(0, 0.25, 0.02);
  chest.add(neck);

  // 4. Head (Neck + Scavenger hood + gas mask + amber lenses + filter) -> Mesh 4
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.09, 0);
  neck.add(head);

  const neckGeom = new THREE.CylinderGeometry(0.08, 0.09, 0.10, 6, 1);
  neckGeom.translate(0, -0.04, 0);
  applyVertexColorsAndNoise(neckGeom, C_ASH_MID, 0.008, 0.04);

  const hoodGeom = new THREE.SphereGeometry(0.15, 7, 6);
  hoodGeom.scale(0.95, 1.1, 1.05);
  hoodGeom.translate(0, 0.09, -0.01);
  applyVertexColorsAndNoise(hoodGeom, C_ASH_MID, 0.018, 0.06);

  const snoutGeom = new THREE.CylinderGeometry(0.06, 0.08, 0.12, 6, 1);
  snoutGeom.rotateX(Math.PI / 2);
  snoutGeom.translate(0, 0.05, 0.14);
  applyVertexColorsAndNoise(snoutGeom, C_ASH_DARK, 0.008, 0.03);

  const canisterGeom = new THREE.CylinderGeometry(0.045, 0.045, 0.08, 6, 1);
  canisterGeom.translate(0.07, 0.02, 0.12);
  applyVertexColorsAndNoise(canisterGeom, C_RUST, 0.008, 0.04);

  const visorGeom = new THREE.BoxGeometry(0.14, 0.05, 0.06, 2, 1, 1);
  visorGeom.translate(0, 0.11, 0.12);
  applyVertexColorsAndNoise(visorGeom, C_AMBER, 0.004, 0.02);

  const headMergedGeom = safeMergeGeometries([neckGeom, hoodGeom, snoutGeom, canisterGeom, visorGeom], false);
  neckGeom.dispose(); hoodGeom.dispose(); snoutGeom.dispose(); canisterGeom.dispose(); visorGeom.dispose();
  const headMesh = new THREE.Mesh(headMergedGeom, sharedMaterial);
  headMesh.castShadow = true;
  head.add(headMesh);

  // --- ARMS (4 Meshes: shoulderL, elbowL, shoulderR, elbowR) ---
  function createArm(side) {
    const isLeft = side === 'L';
    const sign = isLeft ? -1 : 1;

    // Shoulder joint
    const shoulder = new THREE.Group();
    shoulder.name = `shoulder${side}`;
    shoulder.position.set(sign * 0.25, 0.20, 0);
    chest.add(shoulder);

    // Upper arm
    const upperArmGeom = new THREE.CylinderGeometry(0.065, 0.055, 0.28, 6, 2);
    upperArmGeom.translate(0, -0.14, 0);
    applyVertexColorsAndNoise(upperArmGeom, C_OLIVE, 0.012, 0.05);
    const upperArmMesh = new THREE.Mesh(upperArmGeom, sharedMaterial);
    upperArmMesh.castShadow = true;
    shoulder.add(upperArmMesh);

    // Elbow joint
    const elbow = new THREE.Group();
    elbow.name = `elbow${side}`;
    elbow.position.set(0, -0.28, 0);
    shoulder.add(elbow);

    // Forearm + glove merged into single rigid mesh
    const forearmGeom = new THREE.CylinderGeometry(0.055, 0.045, 0.26, 6, 2);
    forearmGeom.translate(0, -0.13, 0);
    applyVertexColorsAndNoise(forearmGeom, C_ASH_LIGHT, 0.012, 0.04);

    const gloveGeom = new THREE.BoxGeometry(0.07, 0.10, 0.06, 1, 1, 1);
    gloveGeom.translate(0, -0.29, 0.01);
    applyVertexColorsAndNoise(gloveGeom, C_ASH_DARK, 0.008, 0.03);

    const armLowerMergedGeom = safeMergeGeometries([forearmGeom, gloveGeom], false);
    forearmGeom.dispose(); gloveGeom.dispose();
    const armLowerMesh = new THREE.Mesh(armLowerMergedGeom, sharedMaterial);
    armLowerMesh.castShadow = true;
    elbow.add(armLowerMesh);
  }

  createArm('L'); // shoulderL (Mesh 5), elbowL (Mesh 6)
  createArm('R'); // shoulderR (Mesh 7), elbowR (Mesh 8)

  // --- LEGS (4 Meshes: hipL, kneeL, hipR, kneeR) ---
  function createLeg(side) {
    const isLeft = side === 'L';
    const sign = isLeft ? -1 : 1;

    // Hip joint
    const hip = new THREE.Group();
    hip.name = `hip${side}`;
    hip.position.set(sign * 0.11, -0.05, 0);
    hips.add(hip);

    // Upper leg (thigh + pocket merged into single rigid mesh)
    const thighGeom = new THREE.CylinderGeometry(0.085, 0.07, 0.42, 6, 2);
    thighGeom.translate(0, -0.21, 0);
    applyVertexColorsAndNoise(thighGeom, C_OLIVE_DARK, 0.014, 0.06);

    const pocketGeom = new THREE.BoxGeometry(0.04, 0.11, 0.09, 1, 1, 1);
    pocketGeom.translate(sign * 0.08, -0.20, 0);
    applyVertexColorsAndNoise(pocketGeom, C_RUST_LIGHT, 0.008, 0.04);

    const upperLegMergedGeom = safeMergeGeometries([thighGeom, pocketGeom], false);
    thighGeom.dispose(); pocketGeom.dispose();
    const upperLegMesh = new THREE.Mesh(upperLegMergedGeom, sharedMaterial);
    upperLegMesh.castShadow = true;
    hip.add(upperLegMesh);

    // Knee joint
    const knee = new THREE.Group();
    knee.name = `knee${side}`;
    knee.position.set(0, -0.42, 0);
    hip.add(knee);

    // Lower leg (shin + combat boot merged into single rigid mesh)
    const shinGeom = new THREE.CylinderGeometry(0.068, 0.055, 0.38, 6, 2);
    shinGeom.translate(0, -0.19, 0);
    applyVertexColorsAndNoise(shinGeom, C_OLIVE_DARK, 0.012, 0.05);

    const bootGeom = new THREE.BoxGeometry(0.10, 0.12, 0.20, 2, 1, 2);
    bootGeom.translate(0, -0.42, 0.04);
    applyVertexColorsAndNoise(bootGeom, C_ASH_DARK, 0.010, 0.04);

    const lowerLegMergedGeom = safeMergeGeometries([shinGeom, bootGeom], false);
    shinGeom.dispose(); bootGeom.dispose();
    const lowerLegMesh = new THREE.Mesh(lowerLegMergedGeom, sharedMaterial);
    lowerLegMesh.castShadow = true;
    knee.add(lowerLegMesh);
  }

  createLeg('L'); // hipL (Mesh 9), kneeL (Mesh 10)
  createLeg('R'); // hipR (Mesh 11), kneeR (Mesh 12)

  // Verify total triangles
  let totalTris = 0;
  root.traverse((node) => {
    if (node.isMesh && node.geometry) {
      const g = node.geometry;
      totalTris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    }
  });

  root.userData = {
    totalTriangles: Math.round(totalTris),
    height: 1.8,
    radius: 0.35,
    sharedMaterial
  };

  return root;
}
