/**
 * PlayerModelGenerator.js
 * 
 * 3D Anime Adventurer/Survivor Character Model:
 * - 1.72m tall stylized cel-shaded adventurer rig
 * - MeshToonMaterial with 4-step toon ramp
 * - Hierarchical pivot groups:
 *   root, hips, torso, spine, chest, neck, head, neckScarf,
 *   shoulderL/leftArm, elbowL/leftForearm, shoulderR/rightArm, elbowR/rightForearm,
 *   hipL/leftLeg, kneeL/leftShin, hipR/rightLeg, kneeR/rightShin
 * - Proportions: tapered torso with cel-shaded jacket/cloak, glowing cyan Leyline
 *   backpack core on back, anime hair tufts with dynamic bangs, flowing scarf/cape
 * - Limb pivots placed exactly at joints (shoulders, elbows, hips, knees)
 * - Budget: 600 - 1,800 tris, <= 12 draw calls (meshes sharing single material)
 */

import * as THREE from 'three';
import { SimplexNoise, createPRNG } from '../core/SeededNoise.js';
import { safeMergeGeometries } from '../core/AssetContract.js';
import { createToonRamp } from '../textures/ProceduralMaterialBank.js';

export function createPlayerModel(seed = 4242) {
  const noise = new SimplexNoise(seed);
  const prng = createPRNG(seed);
  const toonRamp = createToonRamp();

  // Single shared MeshToonMaterial for all meshes (draw calls <= 12)
  const sharedMaterial = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: toonRamp,
    name: 'PlayerAnimeSurvivorMat'
  });

  // Stylized Anime Cel-Shaded Palette
  const C_SKIN = [0.98, 0.86, 0.78];
  const C_HAIR = [0.88, 0.74, 0.42];
  const C_HAIR_SHADOW = [0.72, 0.58, 0.32];
  const C_JACKET_TEAL = [0.18, 0.28, 0.35];
  const C_JACKET_TRIM = [0.94, 0.92, 0.88];
  const C_SCARF_RED = [0.84, 0.22, 0.18];
  const C_SCARF_DARK = [0.65, 0.15, 0.12];
  const C_LEYLINE_CYAN = [0.30, 0.88, 0.96];
  const C_CORE_METAL = [0.22, 0.24, 0.28];
  const C_PANTS_NAVY = [0.16, 0.19, 0.26];
  const C_BOOT_BROWN = [0.24, 0.18, 0.14];
  const C_GOLD_ACCENT = [0.95, 0.78, 0.25];

  function applyVertexColors(geom, baseColor, colorVar = 0.05) {
    const pos = geom.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);

      const cNoise = noise.noise3D(vx * 6, vy * 6, vz * 6) * colorVar;
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

  // 1. Hips (Pelvis & Belt) -> Mesh 1
  const hips = new THREE.Group();
  hips.name = 'hips';
  hips.position.set(0, 0.92, 0);
  root.add(hips);

  const hipsGeom = new THREE.CylinderGeometry(0.17, 0.15, 0.20, 8, 2);
  hipsGeom.scale(1.1, 1.0, 0.85);
  applyVertexColors(hipsGeom, C_PANTS_NAVY, 0.04);

  const beltGeom = new THREE.BoxGeometry(0.36, 0.06, 0.28);
  beltGeom.translate(0, 0.08, 0);
  applyVertexColors(beltGeom, C_BOOT_BROWN, 0.02);

  const buckleGeom = new THREE.BoxGeometry(0.08, 0.07, 0.04);
  buckleGeom.translate(0, 0.08, 0.15);
  applyVertexColors(buckleGeom, C_GOLD_ACCENT, 0.01);

  const hipsMergedGeom = safeMergeGeometries([hipsGeom, beltGeom, buckleGeom], false);
  hipsGeom.dispose(); beltGeom.dispose(); buckleGeom.dispose();
  const hipsMesh = new THREE.Mesh(hipsMergedGeom, sharedMaterial);
  hipsMesh.castShadow = true;
  hipsMesh.receiveShadow = true;
  hips.add(hipsMesh);

  // 2. Torso & Spine (Group)
  const torso = new THREE.Group();
  torso.name = 'torso';
  hips.add(torso);

  const spine = new THREE.Group();
  spine.name = 'spine';
  spine.position.set(0, 0.12, 0);
  torso.add(spine);

  // 3. Chest (Jacket, Cloak, Glowing Cyan Leyline Core) -> Mesh 2
  const chest = new THREE.Group();
  chest.name = 'chest';
  chest.position.set(0, 0.16, 0);
  spine.add(chest);

  // Tapered chest jacket
  const chestGeom = new THREE.CylinderGeometry(0.22, 0.17, 0.28, 8, 2);
  chestGeom.scale(1.18, 1.0, 0.88);
  chestGeom.translate(0, 0.12, 0.01);
  applyVertexColors(chestGeom, C_JACKET_TEAL, 0.04);

  // Cream lapels / jacket trim
  const trimGeom = new THREE.BoxGeometry(0.12, 0.24, 0.06);
  trimGeom.translate(0, 0.12, 0.14);
  applyVertexColors(trimGeom, C_JACKET_TRIM, 0.02);

  // Glowing Cyan Leyline backpack core
  const packFrame = new THREE.BoxGeometry(0.22, 0.24, 0.12);
  packFrame.translate(0, 0.14, -0.16);
  applyVertexColors(packFrame, C_CORE_METAL, 0.03);

  const cyanCrystal = new THREE.OctahedronGeometry(0.08, 0);
  cyanCrystal.scale(0.8, 1.4, 0.8);
  cyanCrystal.translate(0, 0.14, -0.23);
  applyVertexColors(cyanCrystal, C_LEYLINE_CYAN, 0.01);

  const chestMergedGeom = safeMergeGeometries([chestGeom, trimGeom, packFrame, cyanCrystal], false);
  chestGeom.dispose(); trimGeom.dispose(); packFrame.dispose(); cyanCrystal.dispose();
  const chestMesh = new THREE.Mesh(chestMergedGeom, sharedMaterial);
  chestMesh.castShadow = true;
  chestMesh.receiveShadow = true;
  chest.add(chestMesh);

  // Neck joint
  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.set(0, 0.28, 0.02);
  chest.add(neck);

  // 4. Scarf & Flowing Cape -> Mesh 3
  const neckScarf = new THREE.Group();
  neckScarf.name = 'neckScarf';
  neckScarf.position.set(0, 0, 0);
  neck.add(neckScarf);

  const scarfCollar = new THREE.TorusGeometry(0.14, 0.05, 6, 12);
  scarfCollar.rotateX(Math.PI / 2);
  applyVertexColors(scarfCollar, C_SCARF_RED, 0.03);

  // Flowing 2-segment scarf cape trailing backward
  const capeSeg1 = new THREE.BoxGeometry(0.24, 0.28, 0.04);
  capeSeg1.translate(0, -0.14, -0.16);
  capeSeg1.rotateX(0.15);
  applyVertexColors(capeSeg1, C_SCARF_RED, 0.03);

  const capeSeg2 = new THREE.BoxGeometry(0.22, 0.32, 0.03);
  capeSeg2.translate(0, -0.42, -0.21);
  capeSeg2.rotateX(0.25);
  applyVertexColors(capeSeg2, C_SCARF_DARK, 0.03);

  const scarfMergedGeom = safeMergeGeometries([scarfCollar, capeSeg1, capeSeg2], false);
  scarfCollar.dispose(); capeSeg1.dispose(); capeSeg2.dispose();
  const scarfMesh = new THREE.Mesh(scarfMergedGeom, sharedMaterial);
  scarfMesh.castShadow = true;
  neckScarf.add(scarfMesh);

  // 5. Head (Anime Face, Hair Tufts & Dynamic Bangs) -> Mesh 4
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.08, 0);
  neck.add(head);

  // Anime head with soft chin taper
  const faceGeom = new THREE.SphereGeometry(0.13, 8, 6);
  faceGeom.scale(0.92, 1.05, 0.98);
  faceGeom.translate(0, 0.07, 0.01);
  applyVertexColors(faceGeom, C_SKIN, 0.02);

  // Anime eyes accent
  const eyeL = new THREE.BoxGeometry(0.04, 0.025, 0.02);
  eyeL.translate(-0.045, 0.07, 0.13);
  applyVertexColors(eyeL, [0.15, 0.22, 0.35], 0.01);

  const eyeR = new THREE.BoxGeometry(0.04, 0.025, 0.02);
  eyeR.translate(0.045, 0.07, 0.13);
  applyVertexColors(eyeR, [0.15, 0.22, 0.35], 0.01);

  // Stylized anime hair cap
  const hairCap = new THREE.SphereGeometry(0.15, 8, 6);
  hairCap.scale(0.98, 1.08, 1.02);
  hairCap.translate(0, 0.10, -0.02);
  applyVertexColors(hairCap, C_HAIR, 0.03);

  // Dynamic anime hair bangs / tufts
  const bangsGeoms = [];
  const bangOffsets = [
    [-0.07, 0.14, 0.12, -0.2],
    [0.0, 0.15, 0.13, 0.0],
    [0.07, 0.14, 0.12, 0.2],
    [-0.11, 0.08, 0.08, -0.3],
    [0.11, 0.08, 0.08, 0.3]
  ];

  for (const [bx, by, bz, rotZ] of bangOffsets) {
    const tuft = new THREE.ConeGeometry(0.045, 0.14, 4);
    tuft.rotateZ(rotZ);
    tuft.rotateX(-0.35);
    tuft.translate(bx, by, bz);
    applyVertexColors(tuft, C_HAIR_SHADOW, 0.03);
    bangsGeoms.push(tuft);
  }

  const headMergedGeom = safeMergeGeometries([faceGeom, eyeL, eyeR, hairCap, ...bangsGeoms], false);
  faceGeom.dispose(); eyeL.dispose(); eyeR.dispose(); hairCap.dispose();
  for (const g of bangsGeoms) g.dispose();
  const headMesh = new THREE.Mesh(headMergedGeom, sharedMaterial);
  headMesh.castShadow = true;
  head.add(headMesh);

  // --- ARMS (4 Meshes: shoulderL/leftArm, elbowL/leftForearm, shoulderR/rightArm, elbowR/rightForearm) ---
  function createArm(side) {
    const isLeft = side === 'L';
    const sign = isLeft ? -1 : 1;
    const sideName = isLeft ? 'left' : 'right';

    // Shoulder joint (Group)
    const shoulder = new THREE.Group();
    shoulder.name = `shoulder${side}`;
    shoulder.position.set(sign * 0.23, 0.22, 0);
    chest.add(shoulder);

    // Alias group for anime naming contract
    const armGroup = new THREE.Group();
    armGroup.name = `${sideName}Arm`;
    shoulder.add(armGroup);

    // Upper arm sleeve -> Mesh
    const upperArmGeom = new THREE.CylinderGeometry(0.062, 0.052, 0.26, 6, 2);
    upperArmGeom.translate(0, -0.13, 0);
    applyVertexColors(upperArmGeom, C_JACKET_TEAL, 0.04);
    const upperArmMesh = new THREE.Mesh(upperArmGeom, sharedMaterial);
    upperArmMesh.castShadow = true;
    shoulder.add(upperArmMesh);

    // Elbow joint (Group)
    const elbow = new THREE.Group();
    elbow.name = `elbow${side}`;
    elbow.position.set(0, -0.26, 0);
    shoulder.add(elbow);

    const forearmGroup = new THREE.Group();
    forearmGroup.name = `${sideName}Forearm`;
    elbow.add(forearmGroup);

    // Forearm + leather glove -> Mesh
    const forearmGeom = new THREE.CylinderGeometry(0.052, 0.044, 0.24, 6, 2);
    forearmGeom.translate(0, -0.12, 0);
    applyVertexColors(forearmGeom, C_SKIN, 0.03);

    const bracerGeom = new THREE.CylinderGeometry(0.056, 0.048, 0.12, 6, 1);
    bracerGeom.translate(0, -0.10, 0);
    applyVertexColors(bracerGeom, C_BOOT_BROWN, 0.02);

    const gloveGeom = new THREE.BoxGeometry(0.065, 0.09, 0.055, 1, 1, 1);
    gloveGeom.translate(0, -0.26, 0.01);
    applyVertexColors(gloveGeom, C_CORE_METAL, 0.02);

    const armLowerMergedGeom = safeMergeGeometries([forearmGeom, bracerGeom, gloveGeom], false);
    forearmGeom.dispose(); bracerGeom.dispose(); gloveGeom.dispose();
    const armLowerMesh = new THREE.Mesh(armLowerMergedGeom, sharedMaterial);
    armLowerMesh.castShadow = true;
    elbow.add(armLowerMesh);
  }

  createArm('L'); // Meshes 5 & 6
  createArm('R'); // Meshes 7 & 8

  // --- LEGS (4 Meshes: hipL/leftLeg, kneeL/leftShin, hipR/rightLeg, kneeR/rightShin) ---
  function createLeg(side) {
    const isLeft = side === 'L';
    const sign = isLeft ? -1 : 1;
    const sideName = isLeft ? 'left' : 'right';

    // Hip joint (Group)
    const hip = new THREE.Group();
    hip.name = `hip${side}`;
    hip.position.set(sign * 0.11, -0.04, 0);
    hips.add(hip);

    const legGroup = new THREE.Group();
    legGroup.name = `${sideName}Leg`;
    hip.add(legGroup);

    // Thigh pant -> Mesh
    const thighGeom = new THREE.CylinderGeometry(0.082, 0.068, 0.40, 6, 2);
    thighGeom.translate(0, -0.20, 0);
    applyVertexColors(thighGeom, C_PANTS_NAVY, 0.04);

    const holsterGeom = new THREE.BoxGeometry(0.04, 0.12, 0.08, 1, 1, 1);
    holsterGeom.translate(sign * 0.075, -0.18, 0);
    applyVertexColors(holsterGeom, C_BOOT_BROWN, 0.02);

    const upperLegMergedGeom = safeMergeGeometries([thighGeom, holsterGeom], false);
    thighGeom.dispose(); holsterGeom.dispose();
    const upperLegMesh = new THREE.Mesh(upperLegMergedGeom, sharedMaterial);
    upperLegMesh.castShadow = true;
    hip.add(upperLegMesh);

    // Knee joint (Group)
    const knee = new THREE.Group();
    knee.name = `knee${side}`;
    knee.position.set(0, -0.40, 0);
    hip.add(knee);

    const shinGroup = new THREE.Group();
    shinGroup.name = `${sideName}Shin`;
    knee.add(shinGroup);

    // Shin + combat boot -> Mesh
    const shinGeom = new THREE.CylinderGeometry(0.066, 0.054, 0.36, 6, 2);
    shinGeom.translate(0, -0.18, 0);
    applyVertexColors(shinGeom, C_PANTS_NAVY, 0.04);

    const bootGeom = new THREE.BoxGeometry(0.095, 0.12, 0.19, 2, 1, 2);
    bootGeom.translate(0, -0.41, 0.035);
    applyVertexColors(bootGeom, C_BOOT_BROWN, 0.03);

    const bootGoldGeom = new THREE.BoxGeometry(0.098, 0.03, 0.05);
    bootGoldGeom.translate(0, -0.34, 0.07);
    applyVertexColors(bootGoldGeom, C_GOLD_ACCENT, 0.01);

    const lowerLegMergedGeom = safeMergeGeometries([shinGeom, bootGeom, bootGoldGeom], false);
    shinGeom.dispose(); bootGeom.dispose(); bootGoldGeom.dispose();
    const lowerLegMesh = new THREE.Mesh(lowerLegMergedGeom, sharedMaterial);
    lowerLegMesh.castShadow = true;
    knee.add(lowerLegMesh);
  }

  createLeg('L'); // Meshes 9 & 10
  createLeg('R'); // Meshes 11 & 12

  // Total triangles & bounds
  let totalTris = 0;
  root.traverse((node) => {
    if (node.isMesh && node.geometry) {
      const g = node.geometry;
      totalTris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    }
  });

  root.userData = {
    totalTriangles: Math.round(totalTris),
    height: 1.72,
    radius: 0.35,
    sharedMaterial
  };

  return root;
}
