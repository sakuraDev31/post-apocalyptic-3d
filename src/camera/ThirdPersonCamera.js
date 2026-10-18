/**
 * ThirdPersonCamera.js
 * 
 * Over-the-shoulder third-person camera & overhead view:
 * - Full 360 deg yaw (unlimited).
 * - Pitch clamp: -40 deg (near ground looking UP at player) to +80 deg (near top-down).
 * - Defaults: FOV 60, default pitch +12 deg, right-shoulder offset 0.5m scaled down as you zoom out.
 * - Standing player fills ~45-55% of screen height at default zoom (dist 3.0m, FOV 60).
 * - Ground clearance: camera must stay >= 0.3m above terrain along ray (8 samples, bisection pullback, zero jitter).
 * - Building & prop collision: ray pullback with 0.2m margin, min distance 0.7m.
 * - Zoom: range 1.5m to 7.0m (default 3.0m), smooth exponential rate 10/s. Remember zoom per stance.
 * - Overhead mode: smoothly toggles top-down view (pitch 70 deg, distance 12m) and back.
 */

import * as THREE from 'three';

export class ThirdPersonCamera {
  constructor(camera, options = {}) {
    this.camera = camera;
    this.camera.fov = options.fov || (camera.fov !== undefined && camera.fov !== 50 ? camera.fov : 60);
    this.camera.updateProjectionMatrix();

    this.mode = options.mode || 'shoulder'; // 'overhead' | 'shoulder'
    this.isOverhead = this.mode === 'overhead';

    // Pitch limits: -40 deg to +80 deg
    this.minPitch = options.minPitch !== undefined ? options.minPitch : -40 * (Math.PI / 180);
    this.maxPitch = options.maxPitch !== undefined ? options.maxPitch : 80 * (Math.PI / 180);

    // Orientation
    this.yaw = options.initialYaw || 0;
    const defaultPitch = this.isOverhead ? 70 * (Math.PI / 180) : 12 * (Math.PI / 180);
    this.pitch = options.initialPitch !== undefined ? options.initialPitch : defaultPitch;
    this.targetPitch = null; // Used for smooth overhead view transitions
    this.savedShoulderPitch = 12 * (Math.PI / 180);

    this.sensitivity = options.sensitivity || 0.12; // deg per pixel

    // Zoom per stance: stand default 3.0m, crouch 2.4m, sprint 3.4m, overhead 12.0m
    this.zoomByStance = {
      stand: options.baseDist || 3.0,
      crouch: options.crouchDist || 2.4,
      sprint: options.sprintDist || 3.4,
      overhead: options.overheadDist || 12.0
    };

    // Stance distances & limits
    this.baseDist = this.isOverhead ? this.zoomByStance.overhead : this.zoomByStance.stand;
    this.crouchDist = this.zoomByStance.crouch;
    this.sprintDist = this.zoomByStance.sprint;
    this.minDist = options.minDist || (this.isOverhead ? 1.5 : 0.7);
    this.minZoom = 1.5;
    this.maxZoom = 7.0;

    // Right shoulder offset: 0.5m default, scaled down as zoom increases
    this.shoulderOffset = options.shoulderOffset !== undefined
      ? options.shoulderOffset
      : (this.isOverhead ? 0.0 : 0.5);

    // Smoothing state
    this.currentPivot = new THREE.Vector3(0, 1.5, 0);
    this.currentDist = this.baseDist;
    this.currentFov = this.camera.fov;
    this.smoothRate = 14.0; // Pivot follow rate 14/s
    this.zoomSmoothRate = 10.0; // Exponential zoom rate 10/s

    this.activeStance = 'stand';

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

  /**
   * Smoothly toggles or sets camera mode
   * @param {'overhead'|'shoulder'} mode
   */
  setMode(mode) {
    if (mode === 'overhead') {
      if (!this.isOverhead) {
        this.savedShoulderPitch = this.pitch;
      }
      this.mode = 'overhead';
      this.isOverhead = true;
      this.baseDist = this.zoomByStance.overhead;
      this.shoulderOffset = 0.0;
      this.minDist = 1.5;
      this.targetPitch = 70 * (Math.PI / 180);
    } else {
      this.mode = 'shoulder';
      this.isOverhead = false;
      this.baseDist = this.zoomByStance.stand;
      this.shoulderOffset = 0.5;
      this.minDist = 0.7;
      this.targetPitch = this.savedShoulderPitch !== undefined
        ? this.savedShoulderPitch
        : 12 * (Math.PI / 180);
    }
  }

  toggleOverhead() {
    this.setMode(this.isOverhead ? 'shoulder' : 'overhead');
  }

  /**
   * Adjust zoom distance for the currently active stance
   * @param {number} delta - positive zooms out, negative zooms in
   */
  adjustZoom(delta) {
    const stance = this.isOverhead ? 'overhead' : this.activeStance;
    if (this.isOverhead) {
      this.zoomByStance.overhead = Math.max(4.0, Math.min(20.0, this.zoomByStance.overhead + delta));
      this.baseDist = this.zoomByStance.overhead;
    } else {
      const current = this.zoomByStance[stance] || 3.0;
      const next = Math.max(this.minZoom, Math.min(this.maxZoom, current + delta));
      this.zoomByStance[stance] = next;
      if (stance === 'stand') this.baseDist = next;
      else if (stance === 'crouch') this.crouchDist = next;
      else if (stance === 'sprint') this.sprintDist = next;
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

    // Interrupt any pending smooth mode pitch transition when user looks manually
    this.targetPitch = null;

    // Clamp pitch between -40 deg and +80 deg
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
    // Determine active stance
    if (isCrouching) this.activeStance = 'crouch';
    else if (isSprinting) this.activeStance = 'sprint';
    else this.activeStance = 'stand';

    // 1. Smooth overhead transition if targetPitch is set
    if (this.targetPitch !== null) {
      const pitchFactor = 1.0 - Math.exp(-this.zoomSmoothRate * dt);
      this.pitch += (this.targetPitch - this.pitch) * pitchFactor;
      if (Math.abs(this.targetPitch - this.pitch) < 0.005) {
        this.pitch = this.targetPitch;
        this.targetPitch = null;
      }
    }

    // 2. Target pivot point
    const pivotFactor = 1.0 - Math.exp(-this.smoothRate * dt);
    const targetPivotY = playerPos.y + (isCrouching ? 1.0 : 1.5);
    this.currentPivot.x += (playerPos.x - this.currentPivot.x) * pivotFactor;
    this.currentPivot.y += (targetPivotY - this.currentPivot.y) * pivotFactor;
    this.currentPivot.z += (playerPos.z - this.currentPivot.z) * pivotFactor;

    // 3. Smooth exponential zoom per stance (rate 10/s)
    const zoomFactor = 1.0 - Math.exp(-this.zoomSmoothRate * dt);
    const stance = this.isOverhead ? 'overhead' : this.activeStance;
    const targetDist = this.zoomByStance[stance] || (this.isOverhead ? 12.0 : 3.0);
    this.currentDist += (targetDist - this.currentDist) * zoomFactor;

    // 4. Smooth FOV (sprint boost +4)
    const baseFov = 60;
    const targetFov = isSprinting ? baseFov + 4 : baseFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.currentFov += (targetFov - this.currentFov) * pivotFactor;
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    // 5. Compute basis vectors from yaw & pitch
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const cosYaw = Math.cos(this.yaw);
    const sinYaw = Math.sin(this.yaw);

    // Forward vector pointing from camera to scene target
    this._forward.set(sinYaw * cosPitch, -sinPitch, cosYaw * cosPitch).normalize();
    // Right vector along shoulder
    this._right.set(cosYaw, 0, -sinYaw).normalize();
    // Up vector
    this._up.crossVectors(this._right, this._forward).normalize();

    // 6. Right-shoulder offset: 0.5m scaled down as you zoom out (0 in overhead)
    if (this.isOverhead) {
      this.shoulderOffset = 0.0;
    } else {
      // 0.5m at dist <= 3.0m, scales linearly to 0.0m at dist >= 7.0m
      const zoomScale = Math.max(0, Math.min(1.0, (7.0 - this.currentDist) / (7.0 - 3.0)));
      this.shoulderOffset = 0.5 * zoomScale;
    }
    this._shoulderPivot.copy(this.currentPivot).addScaledVector(this._right, this.shoulderOffset);

    // 7. Desired camera position
    this._desiredPos.copy(this._shoulderPivot).addScaledVector(this._forward, -this.currentDist);

    // 8. Camera collision resolution
    let finalDist = this.currentDist;

    // A) Building & prop colliders (Ray-AABB test with 0.2m margin, min distance 0.7m)
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

    // B) Terrain ground rule: camera must stay >= 0.3m above heightAt at its position.
    // Sample heightAt along the pivot->camera ray (8 samples).
    // If violated, shorten the distance (never push under terrain, never jitter).
    if (worldQuery && worldQuery.heightAt) {
      const steps = 8;
      let firstPenetrationIndex = -1;

      for (let s = 1; s <= steps; s++) {
        const frac = s / steps;
        const testDist = finalDist * frac;
        const tx = this._shoulderPivot.x - this._forward.x * testDist;
        const ty = this._shoulderPivot.y - this._forward.y * testDist;
        const tz = this._shoulderPivot.z - this._forward.z * testDist;

        const reqGroundY = worldQuery.heightAt(tx, tz) + 0.3;
        if (ty < reqGroundY) {
          firstPenetrationIndex = s;
          break;
        }
      }

      if (firstPenetrationIndex !== -1) {
        // Continuous bisection search between safe lower bound and penetrating upper bound
        let low = finalDist * ((firstPenetrationIndex - 1) / steps);
        let high = finalDist * (firstPenetrationIndex / steps);

        for (let iter = 0; iter < 6; iter++) {
          const mid = (low + high) * 0.5;
          const mx = this._shoulderPivot.x - this._forward.x * mid;
          const my = this._shoulderPivot.y - this._forward.y * mid;
          const mz = this._shoulderPivot.z - this._forward.z * mid;
          const terrY = worldQuery.heightAt(mx, mz) + 0.3;

          if (my < terrY) {
            high = mid; // Penetrated: pull in distance
          } else {
            low = mid; // Safe clearance
          }
        }
        finalDist = Math.max(this.minDist, low);
      }

      // Final ground clearance verification at camera position
      const endX = this._shoulderPivot.x - this._forward.x * finalDist;
      const endY = this._shoulderPivot.y - this._forward.y * finalDist;
      const endZ = this._shoulderPivot.z - this._forward.z * finalDist;
      const minEndY = worldQuery.heightAt(endX, endZ) + 0.3;

      if (endY < minEndY) {
        // Additional shortening pullback to satisfy >= 0.3m ground clearance
        let low = 0.2;
        let high = finalDist;
        for (let iter = 0; iter < 6; iter++) {
          const mid = (low + high) * 0.5;
          const mx = this._shoulderPivot.x - this._forward.x * mid;
          const my = this._shoulderPivot.y - this._forward.y * mid;
          const mz = this._shoulderPivot.z - this._forward.z * mid;
          if (my < worldQuery.heightAt(mx, mz) + 0.3) {
            high = mid;
          } else {
            low = mid;
          }
        }
        finalDist = Math.max(0.3, low);
      }
    }

    // Position camera at final resolved distance
    this._actualPos.copy(this._shoulderPivot).addScaledVector(this._forward, -finalDist);

    // Absolute terrain floor safeguard: camera is NEVER pushed under terrain
    if (worldQuery && worldQuery.heightAt) {
      const terrainFloor = worldQuery.heightAt(this._actualPos.x, this._actualPos.z) + 0.3;
      if (this._actualPos.y < terrainFloor) {
        this._actualPos.y = terrainFloor;
      }
    }

    this.camera.position.copy(this._actualPos);

    // Look target: in overhead mode, look directly at character pivot; in shoulder mode, look along forward vector
    if (this.isOverhead) {
      this._lookTarget.copy(this._shoulderPivot);
    } else {
      this._lookTarget.copy(this._shoulderPivot).addScaledVector(this._forward, 8.0);
    }
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
