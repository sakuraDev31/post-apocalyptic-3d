/**
 * Contracts.js
 * 
 * JSDoc typedefs and shared interface specifications for Phase 2 Playable World.
 * Strict specifications for player, camera, input, buildings, and world collision.
 */

/**
 * @typedef {Object} InputState
 * @property {number} moveX - Horizontal movement input (-1 to 1)
 * @property {number} moveY - Forward/backward movement input (-1 to 1)
 * @property {number} lookDX - Look delta X in pixels since last frame
 * @property {number} lookDY - Look delta Y in pixels since last frame
 * @property {boolean} jumpPressed - True on frame jump is initially pressed (edge)
 * @property {boolean} sprintHeld - True while sprint button/key is held down
 * @property {boolean} crouchToggled - True on frame crouch is toggled (edge)
 * @property {boolean} interactPressed - True on frame interact button is pressed (edge)
 */

/**
 * @typedef {Object} Collider
 * @property {[number, number, number]} min - Min world-space coordinate [x, y, z]
 * @property {[number, number, number]} max - Max world-space coordinate [x, y, z]
 */

/**
 * @typedef {Object} Doorway
 * @property {[number, number, number]} position - Doorway center position [x, y, z]
 * @property {[number, number, number]} normal - Doorway outward normal vector [nx, ny, nz]
 * @property {number} width - Walkable width in meters
 */

/**
 * @typedef {Object} BuildingOutput
 * @property {Array<{ geometry: any, materialKey: string, transform?: any }>} geometries
 * @property {Object} metadata
 * @property {Collider[]} colliders - Ground-floor wall AABBs in local space (with door gaps)
 * @property {number} footprintRadius - Exclusion circle radius in meters
 * @property {Doorway[]} doorways - Walkable doorway locations
 */

/**
 * @typedef {Object} WorldQuery
 * @property {(x: number, z: number) => number} heightAt - Returns walkable terrain height at (x, z)
 * @property {(aabb: Collider) => Collider[]} queryColliders - Returns AABBs intersecting query volume
 */

export const CONTRACT_VERSIONS = {
  PHASE: 2,
  SPEC: 'PlayableWorld_v1.0'
};
