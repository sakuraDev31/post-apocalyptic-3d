/**
 * PlayerController.js
 * 
 * Kinematic capsule player controller:
 * - Radius 0.35, height 1.8 (crouch 1.1)
 * - Walk 2.2 m/s, Run 4.5 m/s, Sprint 6.5 m/s, Crouch 1.4 m/s
 * - Sprint stamina drain 18/s, regen 12/s after 1.0s delay, lock below 5
 * - Jump velocity 6.2 m/s, gravity -20 m/s^2 (~0.95m jump height)
 * - Coyote time 0.12s, jump buffer 0.12s
 * - Terrain elevation & slope clamping (max 40 deg), step-up 0.35m
 * - Capsule vs AABB wall collision in XZ with sliding
 * - Character yaw turning at 540 deg/s relative to camera
 */

import * as THREE from 'three';

export class PlayerController {
  constructor(playerModel, options = {}) {
    this.model = playerModel;

    // Dimensions
    this.radius = 0.35;
    this.standingHeight = 1.8;
    this.crouchHeight = 1.1;
    this.height = this.standingHeight;
    this.stepUpHeight = 0.35;
    this.maxWalkableSlope = 40 * (Math.PI / 180); // 40 degrees in radians

    // Physics state
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.yaw = 0; // Radians, facing direction
    this.isGrounded = true;
    this.isCrouching = false;
    this.isSprinting = false;

    // Movement speeds
    this.speedWalk = 2.2;
    this.speedRun = 4.5;
    this.speedSprint = 6.5;
    this.speedCrouch = 1.4;
    this.turnRate = 540 * (Math.PI / 180); // 540 deg/s in rad/s

    // Jump & Gravity
    this.jumpVelocity = 6.2;
    this.gravity = -20.0;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.coyoteTimeMax = 0.12;
    this.jumpBufferMax = 0.12;

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
    this.model.position.copy(this.position);
    this.model.rotation.y = this.yaw;
  }

  /**
   * Fixed physics step
   * @param {number} dt - Fixed delta time (e.g. 1/60s)
   * @param {import('../core/Contracts.js').InputState} input
   * @param {number} cameraYaw - Current camera yaw in radians
   * @param {import('../core/Contracts.js').WorldQuery} worldQuery
   */
  update(dt, input, cameraYaw, worldQuery) {
    // 1. Crouch toggle
    if (input.crouchToggled) {
      this.isCrouching = !this.isCrouching;
      this.height = this.isCrouching ? this.crouchHeight : this.standingHeight;
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
    this._camRight.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));

    this._moveDir.set(0, 0, 0);
    if (isMoving) {
      // moveY: +1 is forward, -1 is back
      // moveX: +1 is right, -1 is left
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

    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0 && !this.isCrouching) {
      this.velocity.y = this.jumpVelocity;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.isGrounded = false;
    }

    // 6. Horizontal Movement Integration
    const targetMoveDist = currentSpeed * dt;
    const dispX = this._moveDir.x * targetMoveDist;
    const dispZ = this._moveDir.z * targetMoveDist;

    let candidateX = this.position.x + dispX;
    let candidateZ = this.position.z + dispZ;

    // 7. Ground height & Slope / Step-up test
    const currentGroundY = worldQuery ? worldQuery.heightAt(this.position.x, this.position.z) : 0;
    const candidateGroundY = worldQuery ? worldQuery.heightAt(candidateX, candidateZ) : 0;
    const stepDiff = candidateGroundY - currentGroundY;

    if (isMoving && targetMoveDist > 0.001) {
      const slope = Math.atan2(Math.max(0, stepDiff), targetMoveDist);
      if (slope > this.maxWalkableSlope && stepDiff > this.stepUpHeight) {
        // Exceeds max walkable slope and step-up: slide/block horizontal move
        candidateX = this.position.x;
        candidateZ = this.position.z;
      }
    }

    // 8. Capsule vs AABB Colliders (Ground Floor Walls) with sliding
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
    const groundY = worldQuery ? worldQuery.heightAt(this.position.x, this.position.z) : 0;

    if (!this.isGrounded) {
      this.velocity.y += this.gravity * dt;
      this.position.y += this.velocity.y * dt;

      if (this.position.y <= groundY) {
        this.position.y = groundY;
        this.velocity.y = 0;
        this.isGrounded = true;
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
    this.model.position.copy(this.position);
    this.model.rotation.y = this.yaw;

    return {
      speed: currentSpeed,
      isGrounded: this.isGrounded,
      isJumping: !this.isGrounded && this.velocity.y > 0.5,
      isFalling: !this.isGrounded && this.velocity.y < -0.5,
      isCrouching: this.isCrouching,
      isSprinting: this.isSprinting,
      stamina: this.stamina
    };
  }

  /**
   * Resolves 2D circle vs AABB list with contact normal sliding and penetration handling
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
          // Circle center is inside AABB, push to nearest exterior boundary
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

  /**
   * Legacy axis-separated helper for backwards compatibility
   */
  _resolveCapsuleAABB(px, pz, colliders, axis) {
    const res = this._resolveCircleAABB(px, pz, colliders);
    return axis === 'x' ? res.x : res.z;
  }
}
