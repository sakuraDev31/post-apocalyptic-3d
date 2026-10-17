/**
 * DroneGenerator.js
 * 
 * "Autonomous Scavenger Drone"
 * - Hierarchical multi-part mechanical unit
 * - Weathered armor chassis, diagonal outrigger arms
 * - 4 spinning rotor pods
 * - Pivoting glowing red optical scanner lens
 * - Procedural sine-wave hover & scan animation
 * - Merged sub-geometries where static (< 1,400 tris budget)
 * - Complies with AssetContract
 */

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { SimplexNoise, createPRNG } from '../core/SeededNoise.js';
import { MATERIAL_KEYS, computeBoundsAndTriangles, validateAssetResult, safeMergeGeometries } from '../core/AssetContract.js';

export function generate(seed = 1337, lodLevel = 0, options = {}) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const prng = createPRNG(seed);
  const noise = new SimplexNoise(seed);

  const bodyGeoms = [];
  const metalGeoms = [];

  // 1. Central Armored Fuselage / Hull (Faceted stealth hexagonal prism)
  const hullLength = 1.2;
  const hullWidth = 0.9;
  const hullHeight = 0.45;

  const hullGeom = new THREE.CylinderGeometry(hullWidth * 0.5, hullWidth * 0.6, hullHeight, 6, 2);
  hullGeom.rotateY(Math.PI / 6);
  // Displace faceted armor plates
  const hPos = hullGeom.attributes.position;
  for (let i = 0; i < hPos.count; i++) {
    const x = hPos.getX(i);
    const y = hPos.getY(i);
    const z = hPos.getZ(i);
    // Bevel edges with subtle noise
    const n = noise.noise3D(x * 4.0, y * 4.0, z * 4.0) * 0.03;
    hPos.setXYZ(i, x * (1 + n), y, z * (1 + n));
  }
  hullGeom.computeVertexNormals();
  hullGeom.scale(1.2, 1.0, 0.9);
  bodyGeoms.push(hullGeom);

  // Upper cowl / intake scoop
  const cowlGeom = new THREE.BoxGeometry(0.4, 0.18, 0.6, 2, 1, 2);
  cowlGeom.translate(0, hullHeight * 0.5 + 0.08, -0.1);
  bodyGeoms.push(cowlGeom);

  // 2. Diagonal Outrigger Arms (4 arms connecting hull to rotor pods)
  const armRadius = 0.04;
  const armLength = 0.95;
  const armAngles = [
    Math.PI / 4,
    3 * Math.PI / 4,
    5 * Math.PI / 4,
    7 * Math.PI / 4
  ];

  const rotorPositions = [];

  for (let a = 0; a < armAngles.length; a++) {
    const angle = armAngles[a];
    const armX = Math.cos(angle) * (armLength * 0.5);
    const armZ = Math.sin(angle) * (armLength * 0.5);

    const arm = new THREE.CylinderGeometry(armRadius, armRadius * 1.2, armLength, 5);
    arm.rotateZ(Math.PI / 2);
    arm.rotateY(-angle);
    arm.translate(armX, 0.05, armZ);
    metalGeoms.push(arm);

    // Motor Hub at arm tip
    const tipX = Math.cos(angle) * armLength;
    const tipZ = Math.sin(angle) * armLength;
    rotorPositions.push({ x: tipX, y: 0.1, z: tipZ, angle });

    const motorHub = new THREE.CylinderGeometry(0.12, 0.12, 0.18, 8);
    motorHub.translate(tipX, 0.08, tipZ);
    bodyGeoms.push(motorHub);

    // Rotor Shroud Ring
    const shroud = new THREE.TorusGeometry(0.38, 0.025, 4, 12);
    shroud.rotateX(Math.PI / 2);
    shroud.translate(tipX, 0.12, tipZ);
    metalGeoms.push(shroud);
  }

  // 3. Merged Static Geometries
  const mergedBody = safeMergeGeometries(bodyGeoms, false);
  const mergedMetal = safeMergeGeometries(metalGeoms, false);
  for (const g of bodyGeoms) g.dispose();
  for (const g of metalGeoms) g.dispose();

  // 4. Optical Scanner Pod (Gimbal Mount + Glowing Red Visor Lens)
  const scannerMountGeom = new THREE.SphereGeometry(0.18, 8, 6);
  scannerMountGeom.scale(1.0, 0.8, 1.2);
  scannerMountGeom.computeVertexNormals();

  const scannerLensGeom = new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12);
  scannerLensGeom.rotateX(Math.PI / 2);
  scannerLensGeom.computeVertexNormals();

  // 5. Rotor Propeller Geometry (shared between 4 rotors)
  const rotorBladeGeoms = [];
  const blade1 = new THREE.BoxGeometry(0.68, 0.012, 0.07);
  blade1.rotateY(0.2); // pitch angle
  rotorBladeGeoms.push(blade1);

  const blade2 = new THREE.BoxGeometry(0.68, 0.012, 0.07);
  blade2.rotateY(Math.PI / 2 + 0.2);
  rotorBladeGeoms.push(blade2);

  const singleRotorGeom = safeMergeGeometries(rotorBladeGeoms, false);
  for (const g of rotorBladeGeoms) g.dispose();

  // Assembling Geometries List with distinct part names
  const entries = [
    {
      name: 'drone_hull',
      geometry: mergedBody,
      materialKey: MATERIAL_KEYS.DRONE_BODY,
      transform: { position: [0, 0, 0] }
    },
    {
      name: 'drone_arms',
      geometry: mergedMetal,
      materialKey: MATERIAL_KEYS.METAL_SCRAP,
      transform: { position: [0, 0, 0] }
    },
    // Gimbal scanner mount
    {
      name: 'scannerMount',
      geometry: scannerMountGeom,
      materialKey: MATERIAL_KEYS.DRONE_BODY,
      transform: { position: [0, -hullHeight * 0.45, 0.4] }
    },
    // Glowing red optical scanner lens
    {
      name: 'scannerLens',
      geometry: scannerLensGeom,
      materialKey: MATERIAL_KEYS.DRONE_VISOR,
      transform: { position: [0, -hullHeight * 0.45, 0.54] }
    }
  ];

  // Add 4 distinct rotor entries so they can be animated independently in the diorama
  for (let r = 0; r < rotorPositions.length; r++) {
    const rp = rotorPositions[r];
    entries.push({
      name: `rotor_${r}`,
      geometry: singleRotorGeom.clone(),
      materialKey: MATERIAL_KEYS.REBAR,
      transform: { position: [rp.x, rp.y + 0.06, rp.z] }
    });
  }
  singleRotorGeom.dispose();

  const boundsInfo = computeBoundsAndTriangles(entries);
  const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const updateAnimation = (time, delta, targetGroup) => {
    animateDrone(targetGroup, time, delta);
  };

  const result = {
    geometries: entries,
    metadata: {
      name: 'AutonomousScavengerDrone',
      seed,
      lodLevel,
      triangles: boundsInfo.triangles,
      boundsAABB: boundsInfo.boundsAABB,
      generationTimeMs: Math.round(t1 - t0)
    },
    updateAnimation
  };

  validateAssetResult(result);
  return result;
}

/**
 * Procedural Sine-Wave Hover, Gimbal Visor Scan & Rotor Spin Animation
 */
export function animateDrone(group, time = 0, delta = 0.016) {
  if (!group) return;

  // 1. Procedural Sine-Wave Hover Bobbing & Gentle Roll/Pitch
  const hoverOffset = Math.sin(time * 2.8) * 0.12;
  const hoverSwayX = Math.sin(time * 1.4) * 0.08;
  const hoverSwayZ = Math.cos(time * 1.8) * 0.08;

  if (group.userData.initialY === undefined) {
    group.userData.initialY = group.position.y;
    group.userData.initialX = group.position.x;
    group.userData.initialZ = group.position.z;
  }

  group.position.y = group.userData.initialY + hoverOffset;
  group.position.x = group.userData.initialX + hoverSwayX;
  group.position.z = group.userData.initialZ + hoverSwayZ;

  // Subtle flight tilt banking into sway
  group.rotation.x = Math.sin(time * 1.8) * 0.06;
  group.rotation.z = Math.cos(time * 1.4) * -0.06;

  // 2. Spinning Rotors (alternating CW / CCW directions for aerodynamic realism)
  const rotorSpeed = 28.0;
  for (let r = 0; r < 4; r++) {
    const rotor = group.getObjectByName(`rotor_${r}`);
    if (rotor) {
      const dir = (r % 2 === 0) ? 1 : -1;
      rotor.rotation.y += dir * rotorSpeed * delta;
    }
  }

  // 3. Pivoting Optical Scanner Lens / Mount
  const scannerLens = group.getObjectByName('scannerLens');
  const scannerMount = group.getObjectByName('scannerMount');
  const scanAngleYaw = Math.sin(time * 1.6) * 0.45;
  const scanAnglePitch = Math.sin(time * 3.2) * 0.12;

  if (scannerLens) {
    scannerLens.rotation.y = scanAngleYaw;
    scannerLens.rotation.x = scanAnglePitch;
  }
  if (scannerMount) {
    scannerMount.rotation.y = scanAngleYaw * 0.6;
    scannerMount.rotation.x = scanAnglePitch * 0.6;
  }
}
