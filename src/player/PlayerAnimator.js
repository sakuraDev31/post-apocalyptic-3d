/**
 * PlayerAnimator.js
 * 
 * Procedural animation system for Scavenger Humanoid:
 * - States: idle, walk, run, sprint, crouchIdle, crouchWalk, jumpAnticipation, jumpTuck, fall, landAbsorb
 * - Jump animation: 0.08s anticipation crouch, clean tuck in air, landing absorb scaled by fall speed
 * - Model faces +Z: positive hip rotation.x swings leg backward, negative swings forward
 * - Crouch pose: thighs and knees forward, torso leaning slightly forward, no foot floating or sinking
 * - Distance-traveled driven walk cycle (no foot sliding)
 * - Exponential smoothing between all state poses (rate 16/s prevents pops)
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

    if (playerModel) {
      playerModel.traverse((node) => {
        if (jointNames.includes(node.name)) {
          this.joints[node.name] = node;
        }
      });
    }

    // Initial joint base transforms
    this.baseHipsY = this.joints.hips ? this.joints.hips.position.y : 0.95;

    // Phase & timers
    this.walkPhase = 0;
    this.breathTime = 0;
    this.landSquashTimer = 0;
    this.landSquashDuration = 0.1;
    this.landSquashMagnitude = 0.12;
    this.anticipationTimer = 0;
    this.wasGrounded = true;
    this.wasJumping = false;

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
   * Triggers landing impact squash scaled by fall speed
   * @param {number} fallSpeed - downward velocity at contact in m/s
   */
  triggerLand(fallSpeed = 6.0) {
    const normSpeed = Math.min(14.0, Math.max(1.5, Math.abs(fallSpeed)));
    // Squash magnitude: 0.08m (gentle drop) to 0.22m (heavy fall)
    this.landSquashMagnitude = 0.08 + (normSpeed / 14.0) * 0.14;
    // Absorb duration: 0.09s to 0.16s
    this.landSquashDuration = 0.09 + (normSpeed / 14.0) * 0.07;
    this.landSquashTimer = this.landSquashDuration;
  }

  /**
   * Updates procedural animation pose
   * @param {number} dt - delta time in seconds
   * @param {Object} state - { speed, isGrounded, isJumping, isFalling, isCrouching, isSprinting, justLanded, fallSpeed }
   */
  update(dt, state = {}) {
    const {
      speed = 0,
      isGrounded = true,
      isJumping = false,
      isFalling = false,
      isCrouching = false,
      isSprinting = false,
      justLanded = false,
      fallSpeed = 6.0
    } = state;

    // Landing detection
    if ((!this.wasGrounded && isGrounded) || justLanded) {
      this.triggerLand(fallSpeed);
    }
    this.wasGrounded = isGrounded;

    // Jump anticipation detection (0.08s anticipation crouch)
    if (isJumping && !this.wasJumping) {
      this.anticipationTimer = 0.08;
    }
    this.wasJumping = isJumping;

    // Timers
    this.breathTime += dt * 2.2;
    if (this.landSquashTimer > 0) {
      this.landSquashTimer = Math.max(0, this.landSquashTimer - dt);
    }
    if (this.anticipationTimer > 0) {
      this.anticipationTimer = Math.max(0, this.anticipationTimer - dt);
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

    // 1. Landing squash absorb impulse scaled by fall speed
    if (this.landSquashTimer > 0 && this.landSquashDuration > 0) {
      const squashNorm = this.landSquashTimer / this.landSquashDuration;
      const absorbFactor = Math.sin(squashNorm * Math.PI);
      targetRootSquashY = -this.landSquashMagnitude * absorbFactor;
      targetKneeBendL += (this.landSquashMagnitude * 2.2) * absorbFactor;
      targetKneeBendR += (this.landSquashMagnitude * 2.2) * absorbFactor;
      targetSpineLeanX += (this.landSquashMagnitude * 1.2) * absorbFactor;
    }

    // 2. Air states: Jump Up / Fall
    if (!isGrounded) {
      if (this.anticipationTimer > 0) {
        // 0.08s anticipation crouch: slight hip dip and knee bend before launch
        targetHipsY = this.baseHipsY - 0.16;
        targetSpineLeanX = 0.18;
        targetArmSwingL = 0.3;
        targetArmSwingR = 0.3;
        targetLegSwingL = -0.38; // Thigh forward
        targetLegSwingR = -0.38;
        targetKneeBendL = 0.80; // Shin back
        targetKneeBendR = 0.80;
      } else if (isJumping) {
        // Clean tuck in air: thighs swing forward (-X) and knees tuck tightly
        targetHipsY = this.baseHipsY - 0.12;
        targetSpineLeanX = 0.12;
        targetArmSwingL = -0.45;
        targetArmSwingR = -0.45;
        targetElbowL = -0.65;
        targetElbowR = -0.65;
        // Negative X swings leg FORWARD
        targetLegSwingL = -0.70;
        targetLegSwingR = -0.60;
        targetKneeBendL = 1.25;
        targetKneeBendR = 1.15;
      } else {
        // Falling (arms out for balance, legs extending towards ground)
        targetSpineLeanX = 0.06;
        targetArmOutL = -0.60;
        targetArmOutR = 0.60;
        targetArmSwingL = 0.12;
        targetArmSwingR = 0.12;
        targetElbowL = -0.35;
        targetElbowR = -0.35;
        targetLegSwingL = -0.22;
        targetLegSwingR = -0.22;
        targetKneeBendL = 0.35;
        targetKneeBendR = 0.35;
      }
    } else if (isCrouching) {
      // 3. Crouch states
      // Thighs and knees forward, torso leaning slightly forward, no foot floating or sinking
      targetHipsY = this.baseHipsY - 0.36; // Lower hips to 0.59m
      targetSpineLeanX = 0.22; // Torso leaning slightly forward
      targetChestLeanX = 0.08;
      targetHeadPitchX = -0.20; // Head looks forward/up to compensate for spine lean

      if (!isMoving) {
        // Crouch Idle:
        // Negative hip rotation.x swings thighs FORWARD (+Z)
        // Positive knee rotation.x bends shins BACKWARD (-Z) to place feet flat on ground at y=0
        targetLegSwingL = -0.75;
        targetLegSwingR = -0.75;
        targetKneeBendL = 1.55;
        targetKneeBendR = 1.55;
        targetArmSwingL = -0.20;
        targetArmSwingR = -0.20;
        targetElbowL = -0.55;
        targetElbowR = -0.55;
      } else {
        // Crouch Walk (low athletic shuffle):
        const cSin = Math.sin(this.walkPhase);
        // Thighs forward with alternating shuffle swing
        targetLegSwingL = -0.75 - cSin * 0.22;
        targetLegSwingR = -0.75 + cSin * 0.22;
        targetKneeBendL = 1.55 + Math.max(0, -cSin) * 0.25;
        targetKneeBendR = 1.55 + Math.max(0, cSin) * 0.25;
        targetArmSwingL = -0.20 - cSin * 0.25;
        targetArmSwingR = -0.20 + cSin * 0.25;
        targetElbowL = -0.55;
        targetElbowR = -0.55;
      }
    } else if (isMoving) {
      // 4. Locomotion: Walk / Run / Sprint
      const sinWalk = Math.sin(this.walkPhase);

      if (isSprinting) {
        // Sprint (aggressive forward lean, high knee drive)
        targetSpineLeanX = 0.28;
        targetChestLeanX = 0.10;
        targetSpineTwistY = -sinWalk * 0.15;

        // Negative rotation swings leg forward
        targetLegSwingL = -sinWalk * 0.75;
        targetLegSwingR = sinWalk * 0.75;
        targetKneeBendL = Math.max(0, sinWalk) * 1.1;
        targetKneeBendR = Math.max(0, -sinWalk) * 1.1;

        targetArmSwingL = sinWalk * 0.9;
        targetArmSwingR = -sinWalk * 0.9;
        targetElbowL = -0.8 - Math.max(0, -sinWalk) * 0.4;
        targetElbowR = -0.8 - Math.max(0, sinWalk) * 0.4;
      } else if (isRunning) {
        // Run (moderate lean)
        targetSpineLeanX = 0.14;
        targetSpineTwistY = -sinWalk * 0.08;

        targetLegSwingL = -sinWalk * 0.58;
        targetLegSwingR = sinWalk * 0.58;
        targetKneeBendL = Math.max(0, sinWalk) * 0.85;
        targetKneeBendR = Math.max(0, -sinWalk) * 0.85;

        targetArmSwingL = sinWalk * 0.65;
        targetArmSwingR = -sinWalk * 0.65;
        targetElbowL = -0.55;
        targetElbowR = -0.55;
      } else {
        // Walk (upright, relaxed swing)
        targetSpineLeanX = 0.04;
        targetSpineTwistY = -sinWalk * 0.04;

        targetLegSwingL = -sinWalk * 0.42;
        targetLegSwingR = sinWalk * 0.42;
        targetKneeBendL = Math.max(0, sinWalk) * 0.6;
        targetKneeBendR = Math.max(0, -sinWalk) * 0.6;

        targetArmSwingL = sinWalk * 0.45;
        targetArmSwingR = -sinWalk * 0.45;
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
