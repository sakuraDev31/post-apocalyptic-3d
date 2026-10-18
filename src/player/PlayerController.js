/**
 * PlayerController.js
 * 
 * Kinematic capsule player controller:
 * - Radius 0.35, height 1.8 (crouch 1.1)
 * - Crouch toggle: eases height 1.8 -> 1.1 over 0.15s; cannot stand up if overhead collider within 1.8m
 * - Walk 2.2 m/s, Run 4.5 m/s, Sprint 6.5 m/s, Crouch 1.4 m/s
 * - Sprint stamina drain 18/s, regen 12/s after 1.0s delay, lock below 5
 * - Jump velocity 6.8 m/s, gravity -20 m/s^2 (~1.15m height). Variable height: release button cuts upward velocity by 50%
 * - Air control 60% of ground control
 * - Coyote time 0.12s, jump buffer 0.12s
 * - Terrain elevation & slope clamping (max 40 deg), step-up 0.35m
 * - Capsule vs AABB wall collision in XZ with multi-pass sliding
 * - Character yaw turning at 540 deg/s relative to camera during movement; orbits freely while idle
 */

import * as THREE from 'three';

export class PlayerController {
  constructor(playerModel, options = {}) {
    this.model = playerModel;

    // Dimensions
    this.radius = options.radius ?? 0.35;
    this.standingHeight = options.standingHeight ?? 1.8;
    this.crouchHeight = options.crouchHeight ?? 1.1;
    this.height = this.standingHeight;
    this.stepUpHeight = options.stepUpHeight ?? 0.35;
    this.maxWalkableSlope = options.maxWalkableSlope ?? (40 * (Math.PI / 180)); // 40 degrees in radians

    // Physics state
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.yaw = 0; // Radians, facing direction
    this.isGrounded = true;
    this.isCrouching = false;
    this.isSprinting = false;

    // Movement speeds
    this.speedWalk = options.speedWalk ?? 2.2;
    this.speedRun = options.speedRun ?? 4.5;
    this.speedSprint = options.speedSprint ?? 6.5;
    this.speedCrouch = options.speedCrouch ?? 1.4;
    this.airControl = options.airControl ?? 0.6; // 60% of ground control
    this.turnRate = options.turnRate ?? (540 * (Math.PI / 180)); // 540 deg/s in rad/s

    // Jump & Gravity
    this.jumpVelocity = options.jumpVelocity ?? 6.8; // Peak ~1.15m height with g=-20
    this.gravity = options.gravity ?? -20.0;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.coyoteTimeMax = 0.12;
    this.jumpBufferMax = 0.12;
    this.jumpCutApplied = false;
    this.fallSpeed = 0;

    // Stamina
    this.stamina = 100;
    this.maxStamina = 100;
    this.staminaDrainRate = 18;
    this.staminaRegenRate = 12;
    this.staminaRegenDelay = 1.0;
    this.staminaDelayTimer = 0;
    this.sprintLocked = false;

    // Cached temp vectors to avoid allocations in hot loop
    this._moveDir = new THREE.Vector3();
    this._camForward = new THREE.Vector3();
    this._camRight = new THREE.Vector3();
    this._queryAABB = { min: [0, 0, 0], max: [0, 0, 0] };
  }

  /**
   * Set initial spawn position
   */
  spawn(x, y, z, yaw = 0) {
    this.position.set(x, y, z);
    this.yaw = yaw;
    this.velocity.set(0, 0, 0);
    this.isGrounded = true;
    this.isCrouching = false;
    this.height = this.standingHeight;
    this.jumpCutApplied = false;
    this.fallSpeed = 0;
    if (this.model) {
      this.model.position.copy(this.position);
      this.model.rotation.y = this.yaw;
    }
  }

  /**
   * Helper to sample highest ground/platform surface
   */
  _sampleGround(worldQuery, x, z, currentY) {
    if (!worldQuery) return 0;
    if (typeof worldQuery.getHighestSurfaceY === 'function') {
      return worldQuery.getHighestSurfaceY(x, currentY !== undefined ? currentY : 0, z, (px, pz) => (worldQuery.heightAt ? worldQuery.heightAt(px, pz) : 0));
    }
    return worldQuery.heightAt ? worldQuery.heightAt(x, z) : 0;
  }

  /**
   * Checks whether the player can stand up without colliding with overhead geometry within 1.8m
   * @param {import('../core/Contracts.js').WorldQuery} worldQuery
   * @returns {boolean}
   */
  canStandUp(worldQuery) {
    if (!worldQuery || !worldQuery.queryColliders) return true;

    const px = this.position.x;
    const py = this.position.y;
    const pz = this.position.z;
    const r = this.radius;

    // Check cylinder column from current crouch height to 1.8m standing height
    const overheadAABB = {
      min: [px - r, py + 1.05, pz - r],
      max: [px + r, py + 1.82, pz + r]
    };

    const colliders = worldQuery.queryColliders(overheadAABB);
    if (!colliders || colliders.length === 0) return true;

    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      // Vertical overlap check
      if (py + 1.8 <= c.min[1] || py + 1.05 >= c.max[1]) {
        continue;
      }

      // If collider provides Oriented Bounding Box (OBB) representation
      if (c.obb) {
        const obb = c.obb;
        const dx = px - obb.cx;
        const dz = pz - obb.cz;
        const lx = dx * obb.cos + dz * obb.sin;
        const lz = -dx * obb.sin + dz * obb.cos;
        const cx = Math.max(-obb.hw, Math.min(lx, obb.hw));
        const cz = Math.max(-obb.hd, Math.min(lz, obb.hd));
        const clx = lx - cx;
        const clz = lz - cz;
        if (clx * clx + clz * clz < r * r) {
          return false;
        }
      } else {
        if (
          px + r > c.min[0] && px - r < c.max[0] &&
          pz + r > c.min[2] && pz - r < c.max[2]
        ) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Fixed physics step
   * @param {number} dt - Fixed delta time (e.g. 1/60s)
   * @param {import('../core/Contracts.js').InputState} input
   * @param {number} cameraYaw - Current camera yaw in radians
   * @param {import('../core/Contracts.js').WorldQuery} worldQuery
   */
  update(dt, input, cameraYaw, worldQuery) {
    // 1. Crouch toggle & Overhead check
    if (input.crouchToggled) {
      if (this.isCrouching) {
        // Only stand up if no overhead collider blocks standing height (1.8m)
        if (this.canStandUp(worldQuery)) {
          this.isCrouching = false;
        }
      } else {
        this.isCrouching = true;
      }
    }

    // Capsule height eases 1.8 -> 1.1 over 0.15s
    const targetHeight = this.isCrouching ? this.crouchHeight : this.standingHeight;
    const heightRate = (this.standingHeight - this.crouchHeight) / 0.15; // ~4.667 m/s
    if (this.height < targetHeight) {
      this.height = Math.min(targetHeight, this.height + heightRate * dt);
    } else if (this.height > targetHeight) {
      this.height = Math.max(targetHeight, this.height - heightRate * dt);
    }

    // 2. Sprint & Stamina logic
    const inputMagnitude = Math.hypot(input.moveX || 0, input.moveY || 0);
    const isMoving = inputMagnitude > 0.1;

    if (this.stamina < 5) {
      this.sprintLocked = true;
    } else if (!input.sprintHeld) {
      this.sprintLocked = false;
    }

    const wantsSprint = input.sprintHeld && !this.sprintLocked && !this.isCrouching && isMoving;

    if (wantsSprint) {
      this.isSprinting = true;
      this.stamina = Math.max(0, this.stamina - this.staminaDrainRate * dt);
      this.staminaDelayTimer = this.staminaRegenDelay;
    } else {
      this.isSprinting = false;
      let remainingDt = dt;
      if (this.staminaDelayTimer > 0) {
        const consumed = Math.min(this.staminaDelayTimer, remainingDt);
        this.staminaDelayTimer -= consumed;
        remainingDt -= consumed;
      }
      if (this.staminaDelayTimer <= 0 && remainingDt > 0 && this.stamina < this.maxStamina) {
        this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegenRate * remainingDt);
        if (this.stamina >= 5 && !input.sprintHeld) {
          this.sprintLocked = false;
        }
      }
    }

    // 3. Movement Speed determination
    let currentSpeed = 0;
    if (isMoving) {
      if (this.isCrouching) {
        currentSpeed = this.speedCrouch;
      } else if (this.isSprinting) {
        currentSpeed = this.speedSprint;
      } else if (inputMagnitude > 0.6) {
        currentSpeed = this.speedRun; // Default run above 0.6
      } else {
        currentSpeed = this.speedWalk;
      }
    }

    // 4. Direction relative to camera yaw
    // camForward is along (sin yaw, cos yaw)
    this._camForward.set(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
    // camRight points screen-right: (-cos yaw, sin yaw)
    this._camRight.set(-Math.cos(cameraYaw), 0, Math.sin(cameraYaw));

    this._moveDir.set(0, 0, 0);
    if (isMoving) {
      this._moveDir.addScaledVector(this._camForward, input.moveY || 0);
      this._moveDir.addScaledVector(this._camRight, input.moveX || 0);
      this._moveDir.y = 0;
      if (this._moveDir.lengthSq() > 1e-4) {
        this._moveDir.normalize();
      }

      // Smoothly turn character toward movement direction at 540 deg/s
      const targetYaw = Math.atan2(this._moveDir.x, this._moveDir.z);
      let diff = targetYaw - this.yaw;
      // Wrap angle to [-PI, PI]
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      const maxTurn = this.turnRate * dt;
      if (Math.abs(diff) <= maxTurn) {
        this.yaw = targetYaw;
      } else {
        this.yaw += Math.sign(diff) * maxTurn;
      }
    }

    // 5. Jump & Timers (Coyote time & Jump buffer)
    if (this.isGrounded) {
      this.coyoteTimer = this.coyoteTimeMax;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    if (input.jumpPressed) {
      this.jumpBufferTimer = this.jumpBufferMax;
    } else {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }

    // Jump launch
    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0 && !this.isCrouching) {
      this.velocity.y = this.jumpVelocity;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.isGrounded = false;
      this.jumpCutApplied = false;
    }

    // Variable jump height: releasing the button early cuts upward velocity by 50%
    if (!this.isGrounded && this.velocity.y > 0 && input.jumpHeld === false && !this.jumpCutApplied) {
      this.velocity.y *= 0.5;
      this.jumpCutApplied = true;
    }

    // 6. Horizontal Movement Integration (Air control 60% of ground control)
    const controlFactor = this.isGrounded ? 1.0 : this.airControl;
    const targetMoveDist = currentSpeed * controlFactor * dt;
    const dispX = this._moveDir.x * targetMoveDist;
    const dispZ = this._moveDir.z * targetMoveDist;

    let candidateX = this.position.x + dispX;
    let candidateZ = this.position.z + dispZ;

    // 7. Ground height & Slope / Step-up test
    const currentGroundY = this._sampleGround(worldQuery, this.position.x, this.position.z, this.position.y);
    const candidateGroundY = this._sampleGround(worldQuery, candidateX, candidateZ, this.position.y);
    const stepDiff = candidateGroundY - currentGroundY;

    if (isMoving && targetMoveDist > 0.001) {
      const slope = Math.atan2(Math.max(0, stepDiff), targetMoveDist);
      if (slope > this.maxWalkableSlope && stepDiff > this.stepUpHeight) {
        // Exceeds max walkable slope and step-up: slide/block horizontal move
        candidateX = this.position.x;
        candidateZ = this.position.z;
      }
    }

    // 8. Capsule vs AABB / OBB Colliders with sliding
    if (worldQuery && worldQuery.queryColliders) {
      this._queryAABB.min[0] = Math.min(this.position.x, candidateX) - this.radius - 1.0;
      this._queryAABB.min[1] = this.position.y - 10.0;
      this._queryAABB.min[2] = Math.min(this.position.z, candidateZ) - this.radius - 1.0;

      this._queryAABB.max[0] = Math.max(this.position.x, candidateX) + this.radius + 1.0;
      this._queryAABB.max[1] = this.position.y + this.height + 10.0;
      this._queryAABB.max[2] = Math.max(this.position.z, candidateZ) + this.radius + 1.0;

      const colliders = worldQuery.queryColliders(this._queryAABB);

      if (colliders && colliders.length > 0) {
        // Multi-pass resolution for rock-solid wall sliding without clipping or penetrating
        for (let iter = 0; iter < 2; iter++) {
          const res = this._resolveCircleAABB(candidateX, candidateZ, colliders);
          candidateX = res.x;
          candidateZ = res.z;
        }
      }
    }

    this.position.x = candidateX;
    this.position.z = candidateZ;

    // 9. Vertical Integration & Gravity
    const groundY = this._sampleGround(worldQuery, this.position.x, this.position.z, this.position.y);
    let justLanded = false;

    if (!this.isGrounded) {
      this.velocity.y += this.gravity * dt;
      this.position.y += this.velocity.y * dt;

      if (this.position.y <= groundY) {
        this.position.y = groundY;
        this.fallSpeed = Math.abs(this.velocity.y);
        this.velocity.y = 0;
        this.isGrounded = true;
        justLanded = true;
      }
    } else {
      // Step-up / slope stickiness when grounded
      if (Math.abs(this.position.y - groundY) <= this.stepUpHeight + 0.05) {
        this.position.y = groundY;
      } else if (this.position.y > groundY + this.stepUpHeight) {
        // Walked off an edge
        this.isGrounded = false;
        this.velocity.y = 0;
      } else {
        this.position.y = groundY;
      }
    }

    // 10. Update model transforms
    if (this.model) {
      this.model.position.copy(this.position);
      this.model.rotation.y = this.yaw;
    }

    return {
      speed: currentSpeed,
      isGrounded: this.isGrounded,
      isJumping: !this.isGrounded && this.velocity.y > 0.5,
      isFalling: !this.isGrounded && this.velocity.y < -0.5,
      isCrouching: this.isCrouching,
      isSprinting: this.isSprinting,
      stamina: this.stamina,
      justLanded,
      fallSpeed: this.fallSpeed
    };
  }

  /**
   * Resolves 2D circle vs AABB/OBB list with contact normal sliding and penetration handling
   */
  _resolveCircleAABB(px, pz, colliders) {
    const r = this.radius;
    const py = this.position.y;
    const pTop = py + this.height;

    for (let i = 0; i < colliders.length; i++) {
      const col = colliders[i];
      const minX = col.min[0], minY = col.min[1], minZ = col.min[2];
      const maxX = col.max[0], maxY = col.max[1], maxZ = col.max[2];

      // Vertical overlap check
      if (pTop <= minY || py + this.stepUpHeight >= maxY) {
        continue;
      }

      // Quick bounding box check
      if (px < minX - r || px > maxX + r || pz < minZ - r || pz > maxZ + r) {
        continue;
      }

      // If collider provides Oriented Bounding Box (OBB) representation
      if (col.obb) {
        const obb = col.obb;
        const dx = px - obb.cx;
        const dz = pz - obb.cz;
        const lx = dx * obb.cos + dz * obb.sin;
        const lz = -dx * obb.sin + dz * obb.cos;

        const cx = Math.max(-obb.hw, Math.min(lx, obb.hw));
        const cz = Math.max(-obb.hd, Math.min(lz, obb.hd));
        const clx = lx - cx;
        const clz = lz - cz;
        const distSq = clx * clx + clz * clz;

        if (distSq < r * r) {
          let pushLX = 0;
          let pushLZ = 0;
          if (distSq > 1e-6) {
            const dist = Math.sqrt(distSq);
            const overlap = r - dist;
            pushLX = (clx / dist) * overlap;
            pushLZ = (clz / dist) * overlap;
          } else {
            const dLeft = lx - (-obb.hw - r);
            const dRight = (obb.hw + r) - lx;
            const dBack = lz - (-obb.hd - r);
            const dFront = (obb.hd + r) - lz;
            const minDist = Math.min(dLeft, dRight, dBack, dFront);

            if (minDist === dLeft) pushLX = -obb.hw - r - lx;
            else if (minDist === dRight) pushLX = obb.hw + r - lx;
            else if (minDist === dBack) pushLZ = -obb.hd - r - lz;
            else pushLZ = obb.hd + r - lz;
          }
          px += pushLX * obb.cos - pushLZ * obb.sin;
          pz += pushLX * obb.sin + pushLZ * obb.cos;
        }
        continue;
      }

      // Nearest point on AABB to circle center
      const cx = Math.max(minX, Math.min(px, maxX));
      const cz = Math.max(minZ, Math.min(pz, maxZ));

      const dx = px - cx;
      const dz = pz - cz;
      const distSq = dx * dx + dz * dz;

      if (distSq < r * r) {
        if (distSq > 1e-6) {
          const dist = Math.sqrt(distSq);
          const overlap = r - dist;
          px += (dx / dist) * overlap;
          pz += (dz / dist) * overlap;
        } else {
          // Circle center inside AABB: push out to closest face
          const dLeft = px - (minX - r);
          const dRight = (maxX + r) - px;
          const dBack = pz - (minZ - r);
          const dFront = (maxZ + r) - pz;
          const minDist = Math.min(dLeft, dRight, dBack, dFront);

          if (minDist === dLeft) px = minX - r;
          else if (minDist === dRight) px = maxX + r;
          else if (minDist === dBack) pz = minZ - r;
          else pz = maxZ + r;
        }
      }
    }

    return { x: px, z: pz };
  }
}
