/**
 * CollisionWorld.js
 * 
 * Spatial hash collision system and WorldQuery implementation:
 * - 16m spatial hash grid for fast O(1) broad-phase queries
 * - Instanced trees & oil drums register small AABB colliders
 * - Building wall segments register AABBs with doorway gaps
 * - Dynamic chunk registration and removal (zero memory leaks)
 * - Implements WorldQuery: heightAt(x, z) & queryColliders(aabb)
 */

import { heightAt } from '../generators/TerrainGenerator.js';

export class CollisionWorld {
  constructor(seed = 1337, cellSize = 16.0) {
    this.seed = seed;
    this.cellSize = cellSize;
    this.invCellSize = 1.0 / cellSize;

    // Spatial hash grid: Map<string, Array<Collider>>
    this.cells = new Map();

    // Track colliders per chunk for clean unstreaming: Map<string, Array<{ aabb, cells }>>
    this.chunkRecords = new Map();

    // Query counter for tag-based zero-allocation deduplication
    this._queryId = 1;
  }

  /**
   * WorldQuery.heightAt interface
   */
  heightAt(x, z) {
    return heightAt(x, z, this.seed);
  }

  /**
   * Registers a list of world-space AABB colliders under a chunk key
   * @param {string} chunkKey - e.g. "0,0"
   * @param {Array<import('../core/Contracts.js').Collider>} colliders
   */
  addChunkColliders(chunkKey, colliders) {
    if (!colliders || colliders.length === 0) return;

    let record = this.chunkRecords.get(chunkKey);
    if (!record) {
      record = [];
      this.chunkRecords.set(chunkKey, record);
    }

    for (let i = 0; i < colliders.length; i++) {
      const aabb = colliders[i];
      // Attach metadata for deduplication
      aabb._lastQueryId = 0;

      const minCX = Math.floor(aabb.min[0] * this.invCellSize);
      const maxCX = Math.floor(aabb.max[0] * this.invCellSize);
      const minCZ = Math.floor(aabb.min[2] * this.invCellSize);
      const maxCZ = Math.floor(aabb.max[2] * this.invCellSize);

      const cellKeys = [];

      for (let cz = minCZ; cz <= maxCZ; cz++) {
        for (let cx = minCX; cx <= maxCX; cx++) {
          const key = `${cx},${cz}`;
          cellKeys.push(key);
          let list = this.cells.get(key);
          if (!list) {
            list = [];
            this.cells.set(key, list);
          }
          list.push(aabb);
        }
      }

      record.push({ aabb, cellKeys });
    }
  }

  /**
   * Unregisters all colliders associated with a removed chunk
   * @param {string} chunkKey
   */
  removeChunkColliders(chunkKey) {
    const record = this.chunkRecords.get(chunkKey);
    if (!record) return;

    for (let i = 0; i < record.length; i++) {
      const { aabb, cellKeys } = record[i];
      for (let k = 0; k < cellKeys.length; k++) {
        const key = cellKeys[k];
        const list = this.cells.get(key);
        if (list) {
          const idx = list.indexOf(aabb);
          if (idx !== -1) {
            list.splice(idx, 1);
          }
          if (list.length === 0) {
            this.cells.delete(key);
          }
        }
      }
    }

    this.chunkRecords.delete(chunkKey);
  }

  /**
   * WorldQuery.queryColliders interface
   * @param {import('../core/Contracts.js').Collider} queryAABB
   * @returns {Array<import('../core/Contracts.js').Collider>}
   */
  queryColliders(queryAABB) {
    const qMin = queryAABB.min;
    const qMax = queryAABB.max;

    const minCX = Math.floor(qMin[0] * this.invCellSize);
    const maxCX = Math.floor(qMax[0] * this.invCellSize);
    const minCZ = Math.floor(qMin[2] * this.invCellSize);
    const maxCZ = Math.floor(qMax[2] * this.invCellSize);

    const queryId = ++this._queryId;
    const candidates = [];

    for (let cz = minCZ; cz <= maxCZ; cz++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const key = `${cx},${cz}`;
        const list = this.cells.get(key);
        if (!list) continue;

        for (let i = 0; i < list.length; i++) {
          const col = list[i];
          if (col._lastQueryId === queryId) continue; // Already inspected this query
          col._lastQueryId = queryId;

          // AABB overlap test
          if (
            col.min[0] <= qMax[0] && col.max[0] >= qMin[0] &&
            col.min[1] <= qMax[1] && col.max[1] >= qMin[1] &&
            col.min[2] <= qMax[2] && col.max[2] >= qMin[2]
          ) {
            candidates.push(col);
          }
        }
      }
    }

    return candidates;
  }

  clear() {
    this.cells.clear();
    this.chunkRecords.clear();
  }
}
