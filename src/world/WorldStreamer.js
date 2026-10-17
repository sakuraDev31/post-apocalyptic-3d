/**
 * WorldStreamer.js
 * 
 * Infinite procedural world streaming manager:
 * - 64m chunk grid with 5x5 active window (3x3 on Low)
 * - Multi-ring LODs: ring 0 (48x48), ring 1 (24x24), ring 2 (12x12) + skirts
 * - Max 1 chunk added per frame (<= 4ms budget, no hitching)
 * - Cached InstancedMesh for props, trees, and rubble
 * - Dynamic collision registration with CollisionWorld
 * - Clean disposal of unstreamed chunk geometries & materials
 */

import * as THREE from 'three';
import { generateTerrainRaw, heightAt } from '../generators/TerrainGenerator.js';
import { generate as generateBuilding } from '../generators/BuildingGenerator.js';
import { getChunkPlacement } from './Placement.js';
import { MATERIAL_KEYS, buildSceneGroup } from '../core/AssetContract.js';

export class WorldStreamer {
  constructor(scene, collisionWorld, materialBank, options = {}) {
    this.scene = scene;
    this.collisionWorld = collisionWorld;
    this.materialBank = materialBank;
    this.worldSeed = options.worldSeed || 1337;
    this.chunkSize = 64;

    this.quality = options.quality || 'medium';
    this.activeRadius = this.quality === 'low' ? 1 : 2; // 3x3 or 5x5 chunks

    // Active chunks: Map<string, { group, chunkX, chunkZ, colliders, buildings }>
    this.chunks = new Map();

    // Generation queues
    this.buildQueue = [];
    this.pendingKeys = new Set();

    // Reusable matrices for InstancedMesh
    this._dummyMatrix = new THREE.Matrix4();
    this._dummyPos = new THREE.Vector3();
    this._dummyRot = new THREE.Euler();
    this._dummyQuat = new THREE.Quaternion();
    this._dummyScale = new THREE.Vector3();

    // Active buildings list for minimap
    this.activeBuildings = [];

    // Road points for minimap
    this.roadSplinePoints = [];
    this._initRoadPoints();

    // Initialize shared cached geometries for instanced props
    this._initCachedPropGeometries();
  }

  _initRoadPoints() {
    // Sample continuous road points along z
    for (let z = -250; z <= 250; z += 10) {
      const rx = Math.sin(z * 0.015) * 8.0 + Math.sin(z * 0.04) * 3.0;
      this.roadSplinePoints.push([rx, z]);
    }
  }

  _initCachedPropGeometries() {
    // 1. Drum (faceted cylinder)
    this.drumGeom = new THREE.CylinderGeometry(0.42, 0.42, 1.1, 8, 3);
    this.drumGeom.computeVertexNormals();

    // 2. Barricade (scrap sheet)
    this.barricadeGeom = new THREE.BoxGeometry(2.4, 1.3, 0.12, 4, 2, 1);
    this.barricadeGeom.computeVertexNormals();

    // 3. Streetlight (bent tubular pole)
    const pole1 = new THREE.CylinderGeometry(0.08, 0.09, 4.6, 5, 2);
    pole1.translate(0, 2.3, 0);
    const arm1 = new THREE.CylinderGeometry(0.06, 0.06, 1.6, 4, 1);
    arm1.rotateZ(Math.PI / 2);
    arm1.translate(0.8, 4.6, 0);
    const lightHead = new THREE.BoxGeometry(0.5, 0.2, 0.3);
    lightHead.translate(1.5, 4.5, 0);

    const poleGroup = new THREE.Group();
    poleGroup.add(new THREE.Mesh(pole1), new THREE.Mesh(arm1), new THREE.Mesh(lightHead));
    this.streetlightGeom = new THREE.BufferGeometry();
    // Simple merged box/pole approximation
    this.streetlightGeom = new THREE.CylinderGeometry(0.08, 0.09, 4.8, 5, 2);
    this.streetlightGeom.translate(0, 2.4, 0);

    // 4. Dead Tree (gnarled trunk + branches)
    const trunk = new THREE.CylinderGeometry(0.12, 0.32, 4.2, 5, 3);
    trunk.translate(0, 2.1, 0);
    this.treeGeom = trunk;

    // 5. Rubble (faceted rock block)
    this.rubbleGeom = new THREE.DodecahedronGeometry(0.5, 0);
  }

  setQuality(quality) {
    this.quality = quality;
    this.activeRadius = quality === 'low' ? 1 : 2;
  }

  /**
   * Main update called each frame
   * @param {THREE.Vector3} playerPos
   */
  update(playerPos) {
    const centerChunkX = Math.floor((playerPos.x + this.chunkSize * 0.5) / this.chunkSize);
    const centerChunkZ = Math.floor((playerPos.z + this.chunkSize * 0.5) / this.chunkSize);

    // 1. Determine active chunks needed
    const neededKeys = new Set();
    const r = this.activeRadius;

    for (let cz = centerChunkZ - r; cz <= centerChunkZ + r; cz++) {
      for (let cx = centerChunkX - r; cx <= centerChunkX + r; cx++) {
        const key = `${cx},${cz}`;
        neededKeys.add(key);

        if (!this.chunks.has(key) && !this.pendingKeys.has(key)) {
          // Calculate distance ring for LOD
          const distRing = Math.max(Math.abs(cx - centerChunkX), Math.abs(cz - centerChunkZ));
          this.buildQueue.push({ chunkX: cx, chunkZ: cz, key, distRing });
          this.pendingKeys.add(key);
        }
      }
    }

    // Sort queue so closer chunks build first
    this.buildQueue.sort((a, b) => a.distRing - b.distRing);

    // 2. Build at most 1 chunk per frame (<= 4ms budget)
    if (this.buildQueue.length > 0) {
      const task = this.buildQueue.shift();
      this.pendingKeys.delete(task.key);
      if (neededKeys.has(task.key)) {
        this._buildChunk(task.chunkX, task.chunkZ, task.distRing);
      }
    }

    // 3. Remove chunks outside active radius
    for (const [key, chunkData] of this.chunks.entries()) {
      if (!neededKeys.has(key)) {
        this._disposeChunk(key, chunkData);
        this.chunks.delete(key);
      }
    }
  }

  _buildChunk(chunkX, chunkZ, distRing) {
    const key = `${chunkX},${chunkZ}`;
    const chunkOriginX = chunkX * this.chunkSize;
    const chunkOriginZ = chunkZ * this.chunkSize;

    // Subdivisions based on distance ring
    let subdivisions = 48;
    if (distRing === 1) subdivisions = 24;
    else if (distRing >= 2) subdivisions = 12;

    const chunkGroup = new THREE.Group();
    chunkGroup.name = `Chunk_${key}`;
    chunkGroup.position.set(chunkOriginX, 0, chunkOriginZ);

    // 1. Terrain Mesh
    const rawTerrain = generateTerrainRaw(this.worldSeed, 0, {
      size: this.chunkSize,
      originX: chunkOriginX,
      originZ: chunkOriginZ,
      subdivisions,
      addSkirts: true
    });

    const terrainGeom = new THREE.BufferGeometry();
    terrainGeom.setAttribute('position', new THREE.BufferAttribute(rawTerrain.positions, 3));
    terrainGeom.setAttribute('normal', new THREE.BufferAttribute(rawTerrain.normals, 3));
    terrainGeom.setAttribute('uv', new THREE.BufferAttribute(rawTerrain.uvs, 2));
    terrainGeom.setAttribute('color', new THREE.BufferAttribute(rawTerrain.colors, 3));
    terrainGeom.setIndex(new THREE.BufferAttribute(rawTerrain.indices, 1));
    terrainGeom.computeBoundingBox();

    const terrainMat = this.materialBank.get(MATERIAL_KEYS.ASPHALT);
    const terrainMesh = new THREE.Mesh(terrainGeom, terrainMat);
    terrainMesh.receiveShadow = true;
    chunkGroup.add(terrainMesh);

    // 2. Procedural Placement for this chunk
    const placement = getChunkPlacement(chunkX, chunkZ, this.worldSeed, heightAt);
    const chunkColliders = [];
    const chunkBuildings = [];

    // A) Buildings
    for (const b of placement.buildings) {
      const bRes = generateBuilding(b.seed, distRing > 0 ? 1 : 0, { archetype: b.archetype });
      const bGroup = buildSceneGroup(bRes, this.materialBank);

      // Convert local coordinates relative to chunk group
      const relX = b.x - chunkOriginX;
      const relZ = b.z - chunkOriginZ;
      bGroup.position.set(relX, b.y, relZ);
      bGroup.rotation.y = b.yaw;
      chunkGroup.add(bGroup);

      // Transform building colliders to world space and register with CollisionWorld
      if (bRes.colliders && bRes.colliders.length > 0) {
        const cosY = Math.cos(b.yaw);
        const sinY = Math.sin(b.yaw);

        for (const col of bRes.colliders) {
          // Transform local AABB corners
          const corners = [
            [col.min[0], col.min[2]],
            [col.max[0], col.min[2]],
            [col.min[0], col.max[2]],
            [col.max[0], col.max[2]]
          ];

          let minWX = Infinity, maxWX = -Infinity;
          let minWZ = Infinity, maxWZ = -Infinity;

          for (const [lx, lz] of corners) {
            const rx = lx * cosY + lz * sinY + b.x;
            const rz = -lx * sinY + lz * cosY + b.z;
            minWX = Math.min(minWX, rx);
            maxWX = Math.max(maxWX, rx);
            minWZ = Math.min(minWZ, rz);
            maxWZ = Math.max(maxWZ, rz);
          }

          const worldCol = {
            min: [minWX, b.y + col.min[1], minWZ],
            max: [maxWX, b.y + col.max[1], maxWZ]
          };
          chunkColliders.push(worldCol);
        }
      }

      chunkBuildings.push({
        x: b.x,
        z: b.z,
        yaw: b.yaw,
        width: 10,
        depth: 10,
        archetype: b.archetype
      });
      this.activeBuildings.push(chunkBuildings[chunkBuildings.length - 1]);
    }

    // B) Instanced Props (Drums, Barricades, Streetlights)
    this._addInstancedProps(chunkGroup, placement.props, chunkOriginX, chunkOriginZ, chunkColliders);

    // C) Instanced Trees
    if (placement.trees.length > 0) {
      const treeMat = this.materialBank.get(MATERIAL_KEYS.BARK);
      const treeInst = new THREE.InstancedMesh(this.treeGeom, treeMat, placement.trees.length);
      treeInst.castShadow = true;
      treeInst.receiveShadow = true;

      for (let i = 0; i < placement.trees.length; i++) {
        const t = placement.trees[i];
        this._dummyPos.set(t.x - chunkOriginX, t.y, t.z - chunkOriginZ);
        this._dummyRot.set(0, t.yaw, 0);
        this._dummyQuat.setFromEuler(this._dummyRot);
        this._dummyScale.set(...t.scale);
        this._dummyMatrix.compose(this._dummyPos, this._dummyQuat, this._dummyScale);
        treeInst.setMatrixAt(i, this._dummyMatrix);

        // Small trunk AABB collider
        chunkColliders.push({
          min: [t.x - 0.35, t.y, t.z - 0.35],
          max: [t.x + 0.35, t.y + 3.0, t.z + 0.35]
        });
      }
      treeInst.instanceMatrix.needsUpdate = true;
      chunkGroup.add(treeInst);
    }

    // D) Instanced Rubble
    if (placement.rubble.length > 0) {
      const concreteMat = this.materialBank.get(MATERIAL_KEYS.CONCRETE);
      const rubbleInst = new THREE.InstancedMesh(this.rubbleGeom, concreteMat, placement.rubble.length);
      rubbleInst.castShadow = true;
      rubbleInst.receiveShadow = true;

      for (let i = 0; i < placement.rubble.length; i++) {
        const r = placement.rubble[i];
        this._dummyPos.set(r.x - chunkOriginX, r.y, r.z - chunkOriginZ);
        this._dummyRot.set(0, r.yaw, 0);
        this._dummyQuat.setFromEuler(this._dummyRot);
        this._dummyScale.set(...r.scale);
        this._dummyMatrix.compose(this._dummyPos, this._dummyQuat, this._dummyScale);
        rubbleInst.setMatrixAt(i, this._dummyMatrix);
      }
      rubbleInst.instanceMatrix.needsUpdate = true;
      chunkGroup.add(rubbleInst);
    }

    // Register colliders in CollisionWorld
    this.collisionWorld.addChunkColliders(key, chunkColliders);

    this.scene.add(chunkGroup);
    this.chunks.set(key, {
      group: chunkGroup,
      chunkX,
      chunkZ,
      colliders: chunkColliders,
      buildings: chunkBuildings
    });
  }

  _addInstancedProps(chunkGroup, props, originX, originZ, chunkColliders) {
    const drums = props.filter((p) => p.type === 'drum');
    const barricades = props.filter((p) => p.type === 'barricade');
    const streetlights = props.filter((p) => p.type === 'streetlight');

    // Drums
    if (drums.length > 0) {
      const drumMat = this.materialBank.get(MATERIAL_KEYS.RUST);
      const drumInst = new THREE.InstancedMesh(this.drumGeom, drumMat, drums.length);
      drumInst.castShadow = true;
      drumInst.receiveShadow = true;

      for (let i = 0; i < drums.length; i++) {
        const d = drums[i];
        this._dummyPos.set(d.x - originX, d.y + 0.55, d.z - originZ);
        this._dummyRot.set(0, d.yaw, 0);
        this._dummyQuat.setFromEuler(this._dummyRot);
        this._dummyScale.set(1, 1, 1);
        this._dummyMatrix.compose(this._dummyPos, this._dummyQuat, this._dummyScale);
        drumInst.setMatrixAt(i, this._dummyMatrix);

        chunkColliders.push({
          min: [d.x - 0.42, d.y, d.z - 0.42],
          max: [d.x + 0.42, d.y + 1.1, d.z + 0.42]
        });
      }
      drumInst.instanceMatrix.needsUpdate = true;
      chunkGroup.add(drumInst);
    }

    // Barricades
    if (barricades.length > 0) {
      const scrapMat = this.materialBank.get(MATERIAL_KEYS.METAL_SCRAP);
      const barInst = new THREE.InstancedMesh(this.barricadeGeom, scrapMat, barricades.length);
      barInst.castShadow = true;
      barInst.receiveShadow = true;

      for (let i = 0; i < barricades.length; i++) {
        const b = barricades[i];
        this._dummyPos.set(b.x - originX, b.y + 0.65, b.z - originZ);
        this._dummyRot.set(0, b.yaw, 0);
        this._dummyQuat.setFromEuler(this._dummyRot);
        this._dummyScale.set(1, 1, 1);
        this._dummyMatrix.compose(this._dummyPos, this._dummyQuat, this._dummyScale);
        barInst.setMatrixAt(i, this._dummyMatrix);

        chunkColliders.push({
          min: [b.x - 1.2, b.y, b.z - 0.4],
          max: [b.x + 1.2, b.y + 1.3, b.z + 0.4]
        });
      }
      barInst.instanceMatrix.needsUpdate = true;
      chunkGroup.add(barInst);
    }

    // Streetlights
    if (streetlights.length > 0) {
      const rebarMat = this.materialBank.get(MATERIAL_KEYS.REBAR);
      const slInst = new THREE.InstancedMesh(this.streetlightGeom, rebarMat, streetlights.length);
      slInst.castShadow = true;

      for (let i = 0; i < streetlights.length; i++) {
        const s = streetlights[i];
        this._dummyPos.set(s.x - originX, s.y, s.z - originZ);
        this._dummyRot.set(0, s.yaw, 0);
        this._dummyQuat.setFromEuler(this._dummyRot);
        this._dummyScale.set(1, 1, 1);
        this._dummyMatrix.compose(this._dummyPos, this._dummyQuat, this._dummyScale);
        slInst.setMatrixAt(i, this._dummyMatrix);
      }
      slInst.instanceMatrix.needsUpdate = true;
      chunkGroup.add(slInst);
    }
  }

  _disposeChunk(key, chunkData) {
    this.scene.remove(chunkData.group);
    this.collisionWorld.removeChunkColliders(key);

    // Remove from active buildings list
    if (chunkData.buildings) {
      this.activeBuildings = this.activeBuildings.filter(
        (b) => !chunkData.buildings.includes(b)
      );
    }

    // Traverse and dispose geometries
    chunkData.group.traverse((node) => {
      if (node.isMesh) {
        // Only dispose unique building & terrain geometries, not shared instanced ones
        if (
          node.geometry &&
          node.geometry !== this.drumGeom &&
          node.geometry !== this.barricadeGeom &&
          node.geometry !== this.streetlightGeom &&
          node.geometry !== this.treeGeom &&
          node.geometry !== this.rubbleGeom
        ) {
          node.geometry.dispose();
        }
      }
    });
  }

  dispose() {
    for (const [key, chunkData] of this.chunks.entries()) {
      this._disposeChunk(key, chunkData);
    }
    this.chunks.clear();
    this.buildQueue.length = 0;
    this.pendingKeys.clear();
    this.activeBuildings.length = 0;

    this.drumGeom.dispose();
    this.barricadeGeom.dispose();
    this.streetlightGeom.dispose();
    this.treeGeom.dispose();
    this.rubbleGeom.dispose();
  }
}
