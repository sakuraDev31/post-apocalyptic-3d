/**
 * TouchControls.js
 * 
 * Multi-touch mobile input controller with keyboard/mouse fallbacks:
 * - Dynamic Left-Half Virtual Joystick (radius 60px, dead zone 0.12)
 * - Right-Half Drag-to-Look with pointerId isolation
 * - Pinch-to-zoom on right half (two fingers on right half, never joystick pointer)
 * - Mouse wheel zoom fallback
 * - Action buttons cluster (>= 64px): JUMP (variable height with jumpHeld tracking), SPRINT, CROUCH, USE
 * - Safe area insets, touch-action: none, contextmenu disabled
 * - Fullscreen & landscape orientation lock helpers
 */

export class TouchControls {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.onInteract = options.onInteract || (() => {});
    this.onZoom = options.onZoom || (() => {});

    // State matching InputState contract
    this.inputState = {
      moveX: 0,
      moveY: 0,
      lookDX: 0,
      lookDY: 0,
      jumpPressed: false,
      jumpHeld: false,
      sprintHeld: false,
      crouchToggled: false,
      interactPressed: false
    };

    // Internal edge triggers
    this._jumpEdge = false;
    this._crouchEdge = false;
    this._interactEdge = false;

    // Multi-touch tracking
    this.joystickPointerId = null;
    this.joystickOrigin = { x: 0, y: 0 };
    this.joystickRadius = 60;
    this.joystickDeadZone = 0.12;

    this.lookPointerId = null;
    this.lastLookPos = { x: 0, y: 0 };

    this.buttonPointerIds = new Set();

    // Pinch-to-zoom tracking (two fingers on right half)
    this.rightHalfPointers = new Map(); // pointerId -> { x, y }
    this.lastPinchDist = null;

    // Invert movement options
    this.invertX = options.invertX || false;
    this.invertY = options.invertY || false;

    // Keyboard & Mouse state
    this.keysPressed = {};
    this.isMouseDown = false;
    this.lastMousePos = { x: 0, y: 0 };

    this.initDOM();
    this.bindEvents();
  }

  /**
   * Attempts to lock orientation to landscape and request fullscreen
   */
  static async requestFullscreenAndLandscape() {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if (document.documentElement.webkitRequestFullscreen) {
        await document.documentElement.webkitRequestFullscreen();
      }
    } catch (e) {
      // Fullscreen may be denied or unsupported, ignore
    }

    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch (e) {
      // Orientation lock may require user prompt or be unsupported, ignore
    }
  }

  initDOM() {
    this.injectStyles();

    // Controls root container
    this.root = document.createElement('div');
    this.root.id = 'touch-controls-root';
    this.root.className = 'touch-controls-container';

    // Joystick UI Elements (hidden until left thumb touches)
    this.joyBase = document.createElement('div');
    this.joyBase.className = 'touch-joy-base';
    this.joyThumb = document.createElement('div');
    this.joyThumb.className = 'touch-joy-thumb';
    this.joyBase.appendChild(this.joyThumb);
    this.root.appendChild(this.joyBase);

    // Bottom-Right Buttons Cluster
    this.buttonCluster = document.createElement('div');
    this.buttonCluster.className = 'touch-button-cluster';

    // 1. Crouch button (toggle)
    this.btnCrouch = this._createButton('CROUCH', 'btn-crouch', 64);
    // 2. Sprint button (hold)
    this.btnSprint = this._createButton('SPRINT', 'btn-sprint', 66);
    // 3. Interact button (placeholder)
    this.btnInteract = this._createButton('USE', 'btn-interact', 64);
    // 4. Jump button (largest)
    this.btnJump = this._createButton('JUMP', 'btn-jump', 76);

    this.buttonCluster.appendChild(this.btnCrouch);
    this.buttonCluster.appendChild(this.btnSprint);
    this.buttonCluster.appendChild(this.btnInteract);
    this.buttonCluster.appendChild(this.btnJump);

    this.root.appendChild(this.buttonCluster);
    this.container.appendChild(this.root);
  }

  _createButton(label, className, size) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `touch-action-btn ${className}`;
    btn.textContent = label;
    btn.style.width = `${size}px`;
    btn.style.height = `${size}px`;
    return btn;
  }

  injectStyles() {
    if (document.getElementById('touch-controls-css')) return;
    const style = document.createElement('style');
    style.id = 'touch-controls-css';
    style.textContent = `
      .touch-controls-container {
        position: fixed;
        inset: 0;
        pointer-events: auto;
        z-index: 100;
        user-select: none;
        -webkit-user-select: none;
        touch-action: none;
      }
      .touch-joy-base {
        position: absolute;
        width: 120px;
        height: 120px;
        margin-left: -60px;
        margin-top: -60px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(232, 163, 61, 0.15) 0%, rgba(14, 16, 20, 0.5) 100%);
        border: 2px solid rgba(232, 163, 61, 0.45);
        display: none;
        pointer-events: none;
      }
      .touch-joy-thumb {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 48px;
        height: 48px;
        margin-left: -24px;
        margin-top: -24px;
        border-radius: 50%;
        background: #e8a33d;
        box-shadow: 0 0 12px rgba(232, 163, 61, 0.7);
        pointer-events: none;
      }
      .touch-button-cluster {
        position: absolute;
        right: max(16px, env(safe-area-inset-right));
        bottom: max(16px, env(safe-area-inset-bottom));
        display: grid;
        grid-template-columns: repeat(2, auto);
        gap: 14px;
        align-items: center;
        justify-items: center;
        pointer-events: auto;
      }
      .touch-action-btn {
        background: rgba(18, 22, 28, 0.72);
        border: 2px solid rgba(232, 163, 61, 0.5);
        color: #e8a33d;
        font-family: monospace;
        font-size: 13px;
        font-weight: bold;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.75;
        box-shadow: 0 4px 10px rgba(0,0,0,0.5);
        touch-action: none;
        cursor: pointer;
        transition: transform 0.08s ease, background 0.1s ease;
      }
      .touch-action-btn:active, .touch-action-btn.active {
        background: rgba(232, 163, 61, 0.45);
        color: #ffffff;
        transform: scale(0.94);
        opacity: 1.0;
      }
      .touch-action-btn.btn-jump {
        font-size: 15px;
        border-color: #e8a33d;
        background: rgba(232, 163, 61, 0.25);
      }
    `;
    document.head.appendChild(style);
  }

  bindEvents() {
    // Disable default context menu
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // Action button listeners
    const setupButton = (el, onDown, onUp) => {
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.buttonPointerIds.add(e.pointerId);
        el.setPointerCapture?.(e.pointerId);
        el.classList.add('active');
        if (onDown) onDown();
      });
      const endFn = (e) => {
        this.buttonPointerIds.delete(e.pointerId);
        el.classList.remove('active');
        if (onUp) onUp();
      };
      el.addEventListener('pointerup', endFn);
      el.addEventListener('pointercancel', endFn);
    };

    // JUMP button tracks edge AND continuous held state for variable height
    setupButton(
      this.btnJump,
      () => {
        this._jumpEdge = true;
        this.inputState.jumpHeld = true;
      },
      () => {
        this.inputState.jumpHeld = false;
      }
    );

    setupButton(
      this.btnSprint,
      () => { this.inputState.sprintHeld = true; },
      () => { this.inputState.sprintHeld = false; }
    );
    setupButton(this.btnCrouch, () => { this._crouchEdge = true; });
    setupButton(this.btnInteract, () => { this._interactEdge = true; this.onInteract(); });

    // Root pointer listeners for Joystick, Drag Look & Pinch Zoom
    this.root.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    window.addEventListener('pointermove', (e) => this._onPointerMove(e));
    window.addEventListener('pointerup', (e) => this._onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this._onPointerUp(e));

    // Mouse wheel zoom
    window.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.4 : -0.4;
      this.onZoom(delta);
    }, { passive: false });

    // Keyboard Fallbacks
    window.addEventListener('keydown', (e) => {
      this.keysPressed[e.code] = true;
      if (e.code === 'Space') {
        this._jumpEdge = true;
        this.inputState.jumpHeld = true;
      }
      if (e.code === 'KeyC') {
        this._crouchEdge = true;
      }
      if (e.code === 'KeyE') {
        this._interactEdge = true;
        this.onInteract();
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.inputState.sprintHeld = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysPressed[e.code] = false;
      if (e.code === 'Space') {
        this.inputState.jumpHeld = false;
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.inputState.sprintHeld = false;
      }
    });

    // Mouse drag look fallback
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0 && !this.buttonPointerIds.has(e.pointerId)) {
        this.isMouseDown = true;
        this.lastMousePos = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isMouseDown && this.lookPointerId === null) {
        const dx = e.clientX - this.lastMousePos.x;
        const dy = e.clientY - this.lastMousePos.y;
        this.inputState.lookDX += dx;
        this.inputState.lookDY += dy;
        this.lastMousePos = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener('mouseup', () => {
      this.isMouseDown = false;
    });
  }

  _onPointerDown(e) {
    if (this.buttonPointerIds.has(e.pointerId)) return;

    const isLeftHalf = e.clientX < window.innerWidth * 0.5;

    if (isLeftHalf && this.joystickPointerId === null) {
      // Activate dynamic joystick
      this.joystickPointerId = e.pointerId;
      this.joystickOrigin = { x: e.clientX, y: e.clientY };
      this.joyBase.style.left = `${e.clientX}px`;
      this.joyBase.style.top = `${e.clientY}px`;
      this.joyBase.style.display = 'block';
      this.joyThumb.style.transform = 'translate(0px, 0px)';
      this.inputState.moveX = 0;
      this.inputState.moveY = 0;
    } else if (!isLeftHalf) {
      // Track pointer on right half (for drag-look or pinch-to-zoom)
      this.rightHalfPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.rightHalfPointers.size === 1) {
        // Single finger: look drag
        this.lookPointerId = e.pointerId;
        this.lastLookPos = { x: e.clientX, y: e.clientY };
        this.lastPinchDist = null;
      } else if (this.rightHalfPointers.size === 2) {
        // Two fingers on right half: initialize pinch zoom
        this.lookPointerId = null; // suspend look drag during pinch
        const pts = Array.from(this.rightHalfPointers.values());
        this.lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
    }
  }

  _onPointerMove(e) {
    // Joystick move
    if (e.pointerId === this.joystickPointerId) {
      const dx = e.clientX - this.joystickOrigin.x;
      const dy = e.clientY - this.joystickOrigin.y;
      const dist = Math.hypot(dx, dy);

      const maxR = this.joystickRadius;
      const clampedDist = Math.min(dist, maxR);
      const angle = Math.atan2(dy, dx);

      const thumbX = Math.cos(angle) * clampedDist;
      const thumbY = Math.sin(angle) * clampedDist;
      this.joyThumb.style.transform = `translate(${thumbX}px, ${thumbY}px)`;

      // Normalized magnitude with dead zone
      const normDist = clampedDist / maxR;
      if (normDist > this.joystickDeadZone) {
        const effectiveMag = (normDist - this.joystickDeadZone) / (1 - this.joystickDeadZone);
        const signX = this.invertX ? -1 : 1;
        const signY = this.invertY ? -1 : 1;
        this.inputState.moveX = signX * Math.cos(angle) * effectiveMag;
        this.inputState.moveY = signY * -Math.sin(angle) * effectiveMag;
      } else {
        this.inputState.moveX = 0;
        this.inputState.moveY = 0;
      }
    }

    // Right half touch movement (look or pinch)
    if (this.rightHalfPointers.has(e.pointerId)) {
      this.rightHalfPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.rightHalfPointers.size >= 2) {
        // Two-finger pinch on right half
        const pts = Array.from(this.rightHalfPointers.values());
        const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);

        if (this.lastPinchDist !== null) {
          const delta = currentDist - this.lastPinchDist;
          // Pinch apart (>0) zooms in (decrease distance); pinch together (<0) zooms out (increase distance)
          const zoomDelta = -delta * 0.015;
          this.onZoom(zoomDelta);
        }
        this.lastPinchDist = currentDist;
      } else if (e.pointerId === this.lookPointerId) {
        // Single finger look drag
        const dx = e.clientX - this.lastLookPos.x;
        const dy = e.clientY - this.lastLookPos.y;
        this.inputState.lookDX += dx;
        this.inputState.lookDY += dy;
        this.lastLookPos = { x: e.clientX, y: e.clientY };
      }
    }
  }

  _onPointerUp(e) {
    if (e.pointerId === this.joystickPointerId) {
      this.joystickPointerId = null;
      this.joyBase.style.display = 'none';
      this.inputState.moveX = 0;
      this.inputState.moveY = 0;
    }

    if (this.rightHalfPointers.has(e.pointerId)) {
      this.rightHalfPointers.delete(e.pointerId);
      this.lastPinchDist = null;

      if (this.rightHalfPointers.size === 1) {
        // Drop back to single-finger look drag for the remaining pointer
        const [remainingId, pos] = this.rightHalfPointers.entries().next().value;
        this.lookPointerId = remainingId;
        this.lastLookPos = { x: pos.x, y: pos.y };
      } else if (this.rightHalfPointers.size === 0) {
        this.lookPointerId = null;
      }
    }
  }

  reset() {
    this.joystickPointerId = null;
    if (this.joyBase) this.joyBase.style.display = 'none';
    this.lookPointerId = null;
    this.rightHalfPointers.clear();
    this.lastPinchDist = null;
    this.inputState.moveX = 0;
    this.inputState.moveY = 0;
    this.inputState.lookDX = 0;
    this.inputState.lookDY = 0;
    this.inputState.jumpPressed = false;
    this.inputState.jumpHeld = false;
    this.inputState.sprintHeld = false;
    this.inputState.crouchToggled = false;
    this.inputState.interactPressed = false;
    this._jumpEdge = false;
    this._crouchEdge = false;
    this._interactEdge = false;
  }

  setInvert(invertX, invertY) {
    this.invertX = !!invertX;
    this.invertY = !!invertY;
  }

  /**
   * Samples and resets frame input state
   * @returns {import('../core/Contracts.js').InputState}
   */
  poll() {
    let mx = this.inputState.moveX;
    let my = this.inputState.moveY;

    // Apply keyboard fallback if no active touch joystick
    if (this.joystickPointerId === null) {
      let kx = 0;
      let ky = 0;
      const signY = this.invertY ? -1 : 1;
      const signX = this.invertX ? -1 : 1;
      if (this.keysPressed['KeyW'] || this.keysPressed['ArrowUp']) ky += signY;
      if (this.keysPressed['KeyS'] || this.keysPressed['ArrowDown']) ky -= signY;
      if (this.keysPressed['KeyA'] || this.keysPressed['ArrowLeft']) kx -= signX; // Left
      if (this.keysPressed['KeyD'] || this.keysPressed['ArrowRight']) kx += signX; // Right

      if (kx !== 0 || ky !== 0) {
        const len = Math.hypot(kx, ky);
        mx = kx / len;
        my = ky / len;
      }
    }

    const state = {
      moveX: mx,
      moveY: my,
      lookDX: this.inputState.lookDX,
      lookDY: this.inputState.lookDY,
      jumpPressed: this._jumpEdge,
      jumpHeld: this.inputState.jumpHeld,
      sprintHeld: this.inputState.sprintHeld,
      crouchToggled: this._crouchEdge,
      interactPressed: this._interactEdge
    };

    // Reset frame-edge states
    this.inputState.lookDX = 0;
    this.inputState.lookDY = 0;
    this._jumpEdge = false;
    this._crouchEdge = false;
    this._interactEdge = false;

    return state;
  }

  setVisible(visible) {
    this.root.style.display = visible ? 'block' : 'none';
  }

  dispose() {
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
  }
}
