/**
 * MeshWorkerPool.js
 * 
 * Manages parallel Web Workers for procedural mesh generation.
 * - Spawns Math.min(navigator.hardwareConcurrency || 4, 4) workers
 * - Uses zero-copy Transferable ArrayBuffers
 * - Reconstructs THREE.BufferGeometry on the main thread
 * - Automatic main-thread fallback for test/unsupported environments
 * - Concurrent Promise.all() dispatch for the full diorama
 */

import * as THREE from 'three';
import { generate as generateBuilding } from '../generators/BuildingGenerator.js';
import { generate as generateTerrain } from '../generators/TerrainGenerator.js';
import { generate as generateProps } from '../generators/PropsGenerator.js';
import { generate as generateTree } from '../generators/TreeGenerator.js';
import { generate as generateDrone, animateDrone } from '../generators/DroneGenerator.js';
import { validateAssetResult } from '../core/AssetContract.js';

const LOCAL_GENERATORS = {
  building: generateBuilding,
  terrain: generateTerrain,
  props: generateProps,
  tree: generateTree,
  drone: generateDrone
};

export class MeshWorkerPool {
  constructor(options = {}) {
    this.maxWorkers = options.maxWorkers || Math.min((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4, 4);
    this.workers = [];
    this.pendingTasks = new Map();
    this.workerRoundRobin = 0;
    this.taskIdCounter = 1;
    this.useFallback = false;

    this.initWorkers();
  }

  get activeWorkerCount() {
    return this.workers.length;
  }

  initWorkers() {
    if (typeof Worker === 'undefined') {
      this.useFallback = true;
      return;
    }

    try {
      for (let i = 0; i < this.maxWorkers; i++) {
        // Vite / ESM worker instantiation
        const worker = new Worker(new URL('./meshWorker.js', import.meta.url), { type: 'module' });
        
        worker.onmessage = (e) => this.handleWorkerMessage(e);
        worker.onerror = (err) => {
          console.warn('[MeshWorkerPool] Worker error, falling back:', err);
          this.useFallback = true;
        };

        this.workers.push(worker);
      }
    } catch (e) {
      console.warn('[MeshWorkerPool] Failed to spawn workers (using main thread fallback):', e);
      this.useFallback = true;
      this.workers.length = 0;
    }
  }

  handleWorkerMessage(e) {
    const { id, success, data, error } = e.data;
    const task = this.pendingTasks.get(id);
    if (!task) return;

    this.pendingTasks.delete(id);

    if (!success) {
      task.reject(new Error(error || 'Worker generation failed'));
      return;
    }

    try {
      // Reconstruct Three.js BufferGeometry from transferred typed arrays
      const reconstructedGeoms = [];

      for (const entry of data.geometries) {
        const geom = new THREE.BufferGeometry();
        if (entry.attributes.position) {
          geom.setAttribute('position', new THREE.BufferAttribute(entry.attributes.position, 3));
        }
        if (entry.attributes.normal) {
          geom.setAttribute('normal', new THREE.BufferAttribute(entry.attributes.normal, 3));
        }
        if (entry.attributes.uv) {
          geom.setAttribute('uv', new THREE.BufferAttribute(entry.attributes.uv, 2));
        }
        if (entry.attributes.color) {
          geom.setAttribute('color', new THREE.BufferAttribute(entry.attributes.color, 3));
        }
        if (entry.index) {
          geom.setIndex(new THREE.BufferAttribute(entry.index, 1));
        }
        geom.computeBoundingBox();

        reconstructedGeoms.push({
          name: entry.name,
          geometry: geom,
          materialKey: entry.materialKey,
          transform: entry.transform
        });
      }

      const assetResult = {
        geometries: reconstructedGeoms,
        metadata: data.metadata,
        colliders: data.colliders || [],
        footprintRadius: data.footprintRadius || 8.0,
        doorways: data.doorways || [],
        updateAnimation: () => {}
      };

      if (task.type === 'drone') {
        assetResult.updateAnimation = (time, delta, targetGroup) => {
          animateDrone(targetGroup, time, delta);
        };
      }

      validateAssetResult(assetResult);
      task.resolve(assetResult);
    } catch (err) {
      task.reject(err);
    }
  }

  /**
   * Generates a single asset asynchronously using a worker (or fallback)
   */
  async generate(type, seed = 1337, lodLevel = 0, options = {}) {
    if (this.useFallback || this.workers.length === 0) {
      const genFn = LOCAL_GENERATORS[type];
      if (!genFn) throw new Error(`Unknown generator: ${type}`);
      return genFn(seed, lodLevel, options);
    }

    const id = this.taskIdCounter++;
    const workerIndex = this.workerRoundRobin % this.workers.length;
    this.workerRoundRobin++;
    const worker = this.workers[workerIndex];

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingTasks.has(id)) {
          this.pendingTasks.delete(id);
          reject(new Error(`[MeshWorkerPool] Generation timed out for ${type}`));
        }
      }, 15000);

      this.pendingTasks.set(id, {
        resolve: (val) => { clearTimeout(timeoutId); resolve(val); },
        reject: (err) => { clearTimeout(timeoutId); reject(err); },
        type
      });
      worker.postMessage({ id, type, seed, lodLevel, options });
    });
  }

  /**
   * Generates all assets concurrently across the parallel Web Worker pool
   */
  async generateAll(seed = 1337, lodLevel = 0, options = {}) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    const [building, terrain, props, tree, drone, tree2] = await Promise.all([
      this.generate('building', seed, lodLevel, options),
      this.generate('terrain', seed + 10, lodLevel, options),
      this.generate('props', seed + 20, lodLevel, options),
      this.generate('tree', seed + 30, lodLevel, options),
      this.generate('drone', seed + 40, lodLevel, options),
      this.generate('tree', seed + 100, 1, options)
    ]);

    const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    return {
      building,
      terrain,
      props,
      tree,
      drone,
      tree2,
      totalGenerationTimeMs: Math.round(t1 - t0)
    };
  }

  /**
   * Clean shutdown of worker threads
   */
  dispose() {
    for (const w of this.workers) {
      w.terminate();
    }
    this.workers.length = 0;
    this.pendingTasks.clear();
  }
}
