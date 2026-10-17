/**
 * meshWorker.js
 * 
 * Web Worker for off-thread procedural mesh generation and zero-copy buffer transfer.
 * Offloads heavy noise calculations, vertex displacement, and topology generation
 * off the main Android UI thread.
 */

import { generate as generateBuilding } from '../generators/BuildingGenerator.js';
import { generate as generateTerrain } from '../generators/TerrainGenerator.js';
import { generate as generateProps } from '../generators/PropsGenerator.js';
import { generate as generateTree } from '../generators/TreeGenerator.js';
import { generate as generateDrone } from '../generators/DroneGenerator.js';

const GENERATORS = {
  building: generateBuilding,
  terrain: generateTerrain,
  props: generateProps,
  tree: generateTree,
  drone: generateDrone
};

self.onmessage = function(e) {
  const { id, type, seed, lodLevel, options } = e.data;
  try {
    const genFn = GENERATORS[type];
    if (!genFn) {
      throw new Error(`Unknown generator type: ${type}`);
    }

    const t0 = performance.now();
    const result = genFn(seed, lodLevel, options);
    const t1 = performance.now();

    // Serialize geometries for zero-copy Transferable transfer
    const serializedGeometries = [];
    const transferables = [];

    for (const entry of result.geometries) {
      const g = entry.geometry;
      const serializedEntry = {
        name: entry.name,
        materialKey: entry.materialKey,
        transform: entry.transform,
        attributes: {}
      };

      if (g.attributes.position) {
        const pos = new Float32Array(g.attributes.position.array);
        serializedEntry.attributes.position = pos;
        transferables.push(pos.buffer);
      }
      if (g.attributes.normal) {
        const norm = new Float32Array(g.attributes.normal.array);
        serializedEntry.attributes.normal = norm;
        transferables.push(norm.buffer);
      }
      if (g.attributes.uv) {
        const uv = new Float32Array(g.attributes.uv.array);
        serializedEntry.attributes.uv = uv;
        transferables.push(uv.buffer);
      }
      if (g.attributes.color) {
        const col = new Float32Array(g.attributes.color.array);
        serializedEntry.attributes.color = col;
        transferables.push(col.buffer);
      }
      if (g.index) {
        const idxArray = g.index.array instanceof Uint32Array 
          ? new Uint32Array(g.index.array) 
          : new Uint16Array(g.index.array);
        serializedEntry.index = idxArray;
        transferables.push(idxArray.buffer);
      }

      serializedGeometries.push(serializedEntry);
      g.dispose();
    }

    const payload = {
      id,
      success: true,
      data: {
        geometries: serializedGeometries,
        metadata: {
          ...result.metadata,
          workerExecutionTimeMs: Math.round(t1 - t0)
        }
      }
    };

    self.postMessage(payload, transferables);
  } catch (err) {
    self.postMessage({ id, success: false, error: err.message || String(err) });
  }
};
