/**
 * ThirdPersonCamera.js
 * 
 * Over-the-shoulder third-person camera (PUBG / Free Fire / COD style):
 * - Pivot = player position + (0, 1.5) standing, (0, 1.0) crouch, smoothed
 * - Right-shoulder offset +0.5m
 * - Distance 2.6m (crouch 2.3m, sprint 2.9m with FOV +4)
 * - Vertical FOV 62
 * - Pitch clamp: -20 deg to +55 deg, Yaw unlimited
 * - Look sensitivity default 0.12 deg/px (slider 0.05 to 0.30)
 * - Position smoothing rate 14/s
 * - Collision: ray + 0.2m margin against building AABBs and terrain (+0.3m), min distance 0.7m
 * - Look target = pivot + camera forward * 8 (crosshair screen center)
 * - Framing: player occupies 45-60% of screen height, slightly left of center
 */

import * as THREE from 'three';

export class ThirdPersonCamera {
  constructor(camera, options = {}) {
    this.camera = camera;
    this.camera.fov = options.fov || 62;
    this.camera.updateProjectionMatrix();

    this.mode = options.mode || 'shoulder'; // 'overhead' | 'shoulder'
    this.isOverhead = this.mode === 'overhead';

    // Orientation
    this.yaw = options.initialYaw || 0;
    this.pitch = options.initialPitch !== undefined
      ? options.initialPitch
      : (this.isOverhead ? 58 * (Math.PI / 180) : 0.15); // ~58 deg looking down for overhead, ~8.5 deg for shoulder
    this.sensitivity = options.sensitivity || 0.12; // deg per pixel

    // Limits in radians
    this.minPitch = this.isOverhead ? 25 * (Math.PI / 180) : -20 * (Math.PI / 180);
    this.maxPitch = this.isOverhead ? 82 * (Math.PI / 180) : 55 * (Math.PI / 180);

    // Offsets & Distances
    this.shoulderOffset = options.shoulderOffset !== undefined
      ? options.shoulderOffset
      : (this.isOverhead ? 0.0 : 0.5); // Centered over model in overhead mode
    this.baseDist = this.isOverhead ? 8.5 : 2.6;
    this.crouchDist = this.isOverhead ? 7.5 : 2.3;
    this.sprintDist = this.isOverhead ? 9.5 : 2.9;
    this.minDist = this.isOverhead ? 1.5 : 0.7;

    // Smoothing state
    this.currentPivot = new THREE.Vector3(0, 1.5, 0);
    this.currentDist = this.baseDist;
    this.currentFov = this.camera.fov;
    this.smoothRate = 14.0; // 14/s

    // Reusable vectors to avoid allocations
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._shoulderPivot = new THREE.Vector3();
    this._desiredPos = new THREE.Vector3();
    this._actualPos = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();
    this._rayAABB = { min: [0, 0, 0], max: [0, 0, 0] };
  }

  setMode(mode) {
    this.mode = mode;
    this.isOverhead = (mode === 'overhead');
    if (this.isOverhead) {
      this.shoulderOffset = 0.0;
      this.baseDist = 8.5;
      this.crouchDist = 7.5;
      this.sprintDist = 9.5;
      this.minDist = 1.5;
      this.minPitch = 25 * (Math.PI / 180);
      this.maxPitch = 82 * (Math.PI / 180);
      this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, 58 * (Math.PI / 180)));
    } else {
      this.shoulderOffset = 0.5;
      this.baseDist = 2.6;
      this.crouchDist = 2.3;
      this.sprintDist = 2.9;
      this.minDist = 0.7;
      this.minPitch = -20 * (Math.PI / 180);
      this.maxPitch = 55 * (Math.PI / 180);
      this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, 0.15));
    }
  }

  /**
   * Adjust yaw and pitch from mouse or touch drag deltas
   * @param {number} deltaX - pixels dragged horizontally
   * @param {number} deltaY - pixels dragged vertically
   */
  handleLook(deltaX, deltaY) {
    const radPerPx = (this.sensitivity * (Math.PI / 180));
    this.yaw -= deltaX * radPerPx;
    this.pitch += deltaY * radPerPx;

    // Clamp pitch
    this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
  }

  setSensitivity(sens) {
    this.sensitivity = Math.max(0.05, Math.min(0.30, sens));
  }

  /**
   * Update camera position and orientation
   * @param {number} dt - delta time
   * @param {THREE.Vector3} playerPos - current player position
   * @param {boolean} isCrouching
   * @param {boolean} isSprinting
   * @param {import('../core/Contracts.js').WorldQuery} worldQuery
   */
  update(dt, playerPos, isCrouching, isSprinting, worldQuery) {
    const smoothFactor = 1.0 - Math.exp(-this.smoothRate * dt);

    // 1. Target pivot point
    const targetPivotY = playerPos.y + (isCrouching ? 1.0 : 1.5);
    this.currentPivot.x += (playerPos.x - this.currentPivot.x) * smoothFactor;
    this.currentPivot.y += (targetPivotY - this.currentPivot.y) * smoothFactor;
    this.currentPivot.z += (playerPos.z - this.currentPivot.z) * smoothFactor;

    // 2. Target distance and FOV
    const targetDist = isCrouching ? this.crouchDist : (isSprinting ? this.sprintDist : this.baseDist);
    this.currentDist += (targetDist - this.currentDist) * smoothFactor;

    const targetFov = isSprinting ? 66 : 62;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.currentFov += (targetFov - this.currentFov) * smoothFactor;
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    // 3. Compute basis vectors from yaw & pitch
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const cosYaw = Math.cos(this.yaw);
    const sinYaw = Math.sin(this.yaw);

    // Forward pointing towards scene
    this._forward.set(sinYaw * cosPitch, -sinPitch, cosYaw * cosPitch).normalize();
    // Right vector along shoulder
    this._right.set(cosYaw, 0, -sinYaw).normalize();
    // Up vector
    this._up.crossVectors(this._right, this._forward).normalize();

    // 4. Right shoulder offset
    this._shoulderPivot.copy(this.currentPivot).addScaledVector(this._right, this.shoulderOffset);

    // 5. Desired camera position
    this._desiredPos.copy(this._shoulderPivot).addScaledVector(this._forward, -this.currentDist);

    // 6. Camera collision resolution
    let finalDist = this.currentDist;

    // A) Building colliders (Ray-AABB test with 0.2m margin)
    if (worldQuery && worldQuery.queryColliders) {
      this._rayAABB.min[0] = Math.min(this._shoulderPivot.x, this._desiredPos.x) - 0.5;
      this._rayAABB.min[1] = Math.min(this._shoulderPivot.y, this._desiredPos.y) - 0.5;
      this._rayAABB.min[2] = Math.min(this._shoulderPivot.z, this._desiredPos.z) - 0.5;

      this._rayAABB.max[0] = Math.max(this._shoulderPivot.x, this._desiredPos.x) + 0.5;
      this._rayAABB.max[1] = Math.max(this._shoulderPivot.y, this._desiredPos.y) + 0.5;
      this._rayAABB.max[2] = Math.max(this._shoulderPivot.z, this._desiredPos.z) + 0.5;

      const colliders = worldQuery.queryColliders(this._rayAABB);
      if (colliders && colliders.length > 0) {
        const margin = 0.2;
        const origin = this._shoulderPivot;
        const dir = this._forward.clone().negate(); // Vector pointing back to camera

        for (let i = 0; i < colliders.length; i++) {
          const col = colliders[i];
          const hit = this._intersectRayAABB(
            origin.x, origin.y, origin.z,
            dir.x, dir.y, dir.z,
            col.min[0] - margin, col.min[1] - margin, col.min[2] - margin,
            col.max[0] + margin, col.max[1] + margin, col.max[2] + margin,
            finalDist
          );
          if (hit !== null && hit < finalDist) {
            finalDist = Math.max(this.minDist, hit);
          }
        }
      }
    }

    // B) Terrain height collision (+0.3m clearance)
    if (worldQuery && worldQuery.heightAt) {
      const steps = 8;
      for (let s = 1; s <= steps; s++) {
        const frac = s / steps;
        const testDist = finalDist * frac;
        const tx = this._shoulderPivot.x - this._forward.x * testDist;
        const ty = this._shoulderPivot.y - this._forward.y * testDist;
        const tz = this._shoulderPivot.z - this._forward.z * testDist;

        const terrY = worldQuery.heightAt(tx, tz) + 0.3;
        if (ty < terrY) {
          // Camera penetrated ground, pull in
          finalDist = Math.max(this.minDist, testDist - 0.2);
          break;
        }
      }
    }

    // Position camera at final resolved distance
    this._actualPos.copy(this._shoulderPivot).addScaledVector(this._forward, -finalDist);
    this.camera.position.copy(this._actualPos);

    // Crosshair stays at screen center by looking along camera forward vector
    this._lookTarget.copy(this._shoulderPivot).addScaledVector(this._forward, 8.0);
    this.camera.lookAt(this._lookTarget);
  }

  /**
   * Ray vs AABB intersection returning t hit or null
   */
  _intersectRayAABB(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ, maxDist) {
    let tmin = 0;
    let tmax = maxDist;

    // X slab
    if (Math.abs(dx) > 1e-6) {
      let t1 = (minX - ox) / dx;
      let t2 = (maxX - ox) / dx;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    } else if (ox < minX || ox > maxX) {
      return null;
    }

    // Y slab
    if (Math.abs(dy) > 1e-6) {
      let t1 = (minY - oy) / dy;
      let t2 = (maxY - oy) / dy;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    } else if (oy < minY || oy > maxY) {
      return null;
    }

    // Z slab
    if (Math.abs(dz) > 1e-6) {
      let t1 = (minZ - oz) / dz;
      let t2 = (maxZ - oz) / dz;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    } else if (oz < minZ || oz > maxZ) {
      return null;
    }

    return tmin >= 0 ? tmin : null;
  }
}
