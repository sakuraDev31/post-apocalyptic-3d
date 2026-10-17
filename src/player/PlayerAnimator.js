/**
 * PlayerAnimator.js
 * 
 * Procedural animation system for Scavenger Humanoid.
 * - States: idle, walk, run, sprint, crouchIdle, crouchWalk, jumpUp, fall, land
 * - Distance-traveled driven walk cycle (no foot sliding)
 * - Exponential smoothing between all state poses (no pops)
 * - Squash & stretch landing impulse (0.1s duration)
 */

export class PlayerAnimator {
  constructor(playerModel) {
    this.model = playerModel;
    this.joints = {};

    // Cache joint references by exact name
    const jointNames = [
      'root', 'hips', 'spine', 'chest', 'neck', 'head',
      'shoulderL', 'shoulderR', 'elbowL', 'elbowR',
      'hipL', 'hipR', 'kneeL', 'kneeR'
    ];

    playerModel.traverse((node) => {
      if (jointNames.includes(node.name)) {
        this.joints[node.name] = node;
      }
    });

    // Initial joint base transforms
    this.baseHipsY = this.joints.hips ? this.joints.hips.position.y : 0.95;

    // Phase & timers
    this.walkPhase = 0;
    this.breathTime = 0;
    this.landSquashTimer = 0;
    this.wasGrounded = true;

    // Smoothed state properties
    this.current = {
      hipsY: this.baseHipsY,
      rootSquashY: 0,
      spineLeanX: 0,
      spineTwistY: 0,
      chestLeanX: 0,
      headPitchX: 0,
      armSwingL: 0,
      armSwingR: 0,
      armOutL: 0,
      armOutR: 0,
      elbowL: 0,
      elbowR: 0,
      legSwingL: 0,
      legSwingR: 0,
      kneeBendL: 0,
      kneeBendR: 0
    };
  }

  /**
   * Triggers landing impact squash
   */
  triggerLand() {
    this.landSquashTimer = 0.1; // 100ms squash
  }

  /**
   * Updates procedural animation pose
   * @param {number} dt - delta time in seconds
   * @param {Object} state - { speed, isGrounded, isJumping, isFalling, isCrouching, isSprinting }
   */
  update(dt, state = {}) {
    const {
      speed = 0,
      isGrounded = true,
      isJumping = false,
      isFalling = false,
      isCrouching = false,
      isSprinting = false
    } = state;

    // Landing detection
    if (!this.wasGrounded && isGrounded) {
      this.triggerLand();
    }
    this.wasGrounded = isGrounded;

    // Timers
    this.breathTime += dt * 2.2;
    if (this.landSquashTimer > 0) {
      this.landSquashTimer = Math.max(0, this.landSquashTimer - dt);
    }

    // Determine motion sub-state
    const isMoving = speed > 0.15;
    const isRunning = isMoving && speed > 2.5 && !isSprinting && !isCrouching;

    // Drive walk phase strictly by ground distance traveled
    if (isGrounded && isMoving) {
      const stride = isSprinting ? 2.2 : (isRunning ? 1.6 : 1.1);
      this.walkPhase += (speed * dt / stride) * (Math.PI * 2);
    }

    // Target values to blend toward
    let targetHipsY = this.baseHipsY;
    let targetRootSquashY = 0;
    let targetSpineLeanX = 0;
    let targetSpineTwistY = 0;
    let targetChestLeanX = 0;
    let targetHeadPitchX = 0;
    let targetArmSwingL = 0;
    let targetArmSwingR = 0;
    let targetArmOutL = 0;
    let targetArmOutR = 0;
    let targetElbowL = -0.2;
    let targetElbowR = -0.2;
    let targetLegSwingL = 0;
    let targetLegSwingR = 0;
    let targetKneeBendL = 0;
    let targetKneeBendR = 0;

    // 1. Landing squash impulse
    if (this.landSquashTimer > 0) {
      const squashNorm = this.landSquashTimer / 0.1;
      targetRootSquashY = -0.12 * Math.sin(squashNorm * Math.PI);
    }

    // 2. Air states: Jump Up / Fall
    if (!isGrounded) {
      if (isJumping) {
        // Jump ascent
        targetSpineLeanX = -0.08;
        targetArmSwingL = -0.5;
        targetArmSwingR = -0.5;
        targetElbowL = -0.6;
        targetElbowR = -0.6;
        targetLegSwingL = 0.35;
        targetLegSwingR = 0.25;
        targetKneeBendL = 0.55;
        targetKneeBendR = 0.45;
      } else {
        // Falling (arms out for balance)
        targetSpineLeanX = 0.05;
        targetArmOutL = -0.65;
        targetArmOutR = 0.65;
        targetArmSwingL = 0.1;
        targetArmSwingR = 0.1;
        targetElbowL = -0.4;
        targetElbowR = -0.4;
        targetLegSwingL = -0.15;
        targetLegSwingR = -0.15;
        targetKneeBendL = 0.2;
        targetKneeBendR = 0.2;
      }
    } else if (isCrouching) {
      // 3. Crouch states
      targetHipsY = this.baseHipsY - 0.35;
      targetSpineLeanX = 0.22;
      targetHeadPitchX = -0.18; // head looks up

      if (!isMoving) {
        // Crouch Idle
        targetLegSwingL = 0.45;
        targetLegSwingR = 0.45;
        targetKneeBendL = 0.85;
        targetKneeBendR = 0.85;
        targetElbowL = -0.7;
        targetElbowR = -0.7;
      } else {
        // Crouch Walk (low shuffle)
        const cSin = Math.sin(this.walkPhase);
        targetLegSwingL = 0.45 + cSin * 0.25;
        targetLegSwingR = 0.45 - cSin * 0.25;
        targetKneeBendL = 0.85 + Math.max(0, -cSin) * 0.3;
        targetKneeBendR = 0.85 + Math.max(0, cSin) * 0.3;
        targetArmSwingL = -cSin * 0.2;
        targetArmSwingR = cSin * 0.2;
      }
    } else if (isMoving) {
      // 4. Locomotion: Walk / Run / Sprint
      const sinWalk = Math.sin(this.walkPhase);
      const cosWalk = Math.cos(this.walkPhase);

      if (isSprinting) {
        // Sprint (aggressive forward lean, high knee drive)
        targetSpineLeanX = 0.28;
        targetChestLeanX = 0.10;
        targetSpineTwistY = -sinWalk * 0.15;

        targetLegSwingL = sinWalk * 0.75;
        targetLegSwingR = -sinWalk * 0.75;
        targetKneeBendL = Math.max(0, -sinWalk) * 1.1;
        targetKneeBendR = Math.max(0, sinWalk) * 1.1;

        targetArmSwingL = -sinWalk * 0.9;
        targetArmSwingR = sinWalk * 0.9;
        targetElbowL = -0.8 - Math.max(0, sinWalk) * 0.4;
        targetElbowR = -0.8 - Math.max(0, -sinWalk) * 0.4;
      } else if (isRunning) {
        // Run (moderate lean)
        targetSpineLeanX = 0.14;
        targetSpineTwistY = -sinWalk * 0.08;

        targetLegSwingL = sinWalk * 0.58;
        targetLegSwingR = -sinWalk * 0.58;
        targetKneeBendL = Math.max(0, -sinWalk) * 0.85;
        targetKneeBendR = Math.max(0, sinWalk) * 0.85;

        targetArmSwingL = -sinWalk * 0.65;
        targetArmSwingR = sinWalk * 0.65;
        targetElbowL = -0.55;
        targetElbowR = -0.55;
      } else {
        // Walk (upright, relaxed swing)
        targetSpineLeanX = 0.04;
        targetSpineTwistY = -sinWalk * 0.04;

        targetLegSwingL = sinWalk * 0.42;
        targetLegSwingR = -sinWalk * 0.42;
        targetKneeBendL = Math.max(0, -sinWalk) * 0.6;
        targetKneeBendR = Math.max(0, sinWalk) * 0.6;

        targetArmSwingL = -sinWalk * 0.45;
        targetArmSwingR = sinWalk * 0.45;
        targetElbowL = -0.3;
        targetElbowR = -0.3;
      }
    } else {
      // 5. Standing Idle (breathing oscillation)
      const breath = Math.sin(this.breathTime);
      targetSpineLeanX = 0.02 + breath * 0.015;
      targetChestLeanX = breath * 0.02;
      targetHeadPitchX = -breath * 0.012;
      targetElbowL = -0.22 + breath * 0.03;
      targetElbowR = -0.22 + breath * 0.03;
      targetHipsY = this.baseHipsY + breath * 0.005;
    }

    // Exponential smoothing for all joints (rate 16/s prevents pops)
    const blendRate = 16.0;
    const blendFactor = 1.0 - Math.exp(-blendRate * dt);

    for (const key of Object.keys(this.current)) {
      const targetVal = {
        hipsY: targetHipsY,
        rootSquashY: targetRootSquashY,
        spineLeanX: targetSpineLeanX,
        spineTwistY: targetSpineTwistY,
        chestLeanX: targetChestLeanX,
        headPitchX: targetHeadPitchX,
        armSwingL: targetArmSwingL,
        armSwingR: targetArmSwingR,
        armOutL: targetArmOutL,
        armOutR: targetArmOutR,
        elbowL: targetElbowL,
        elbowR: targetElbowR,
        legSwingL: targetLegSwingL,
        legSwingR: targetLegSwingR,
        kneeBendL: targetKneeBendL,
        kneeBendR: targetKneeBendR
      }[key] || 0;

      this.current[key] += (targetVal - this.current[key]) * blendFactor;
    }

    // Apply smoothed poses to joint transforms
    const { joints, current } = this;

    if (joints.root) {
      joints.root.position.y = current.rootSquashY;
    }
    if (joints.hips) {
      joints.hips.position.y = current.hipsY;
      joints.hips.rotation.y = -current.spineTwistY * 0.5;
    }
    if (joints.spine) {
      joints.spine.rotation.x = current.spineLeanX;
      joints.spine.rotation.y = current.spineTwistY;
    }
    if (joints.chest) {
      joints.chest.rotation.x = current.chestLeanX;
    }
    if (joints.head) {
      joints.head.rotation.x = current.headPitchX;
    }

    // Left Arm
    if (joints.shoulderL) {
      joints.shoulderL.rotation.x = current.armSwingL;
      joints.shoulderL.rotation.z = current.armOutL;
    }
    if (joints.elbowL) {
      joints.elbowL.rotation.x = current.elbowL;
    }

    // Right Arm
    if (joints.shoulderR) {
      joints.shoulderR.rotation.x = current.armSwingR;
      joints.shoulderR.rotation.z = current.armOutR;
    }
    if (joints.elbowR) {
      joints.elbowR.rotation.x = current.elbowR;
    }

    // Left Leg
    if (joints.hipL) {
      joints.hipL.rotation.x = current.legSwingL;
    }
    if (joints.kneeL) {
      joints.kneeL.rotation.x = current.kneeBendL;
    }

    // Right Leg
    if (joints.hipR) {
      joints.hipR.rotation.x = current.legSwingR;
    }
    if (joints.kneeR) {
      joints.kneeR.rotation.x = current.kneeBendR;
    }
  }
}
