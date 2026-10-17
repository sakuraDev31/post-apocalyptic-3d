# CRITICAL NOTES FOR NEXT AGENT & SESSION

> **READ THIS FIRST BEFORE WRITING ANY CODE.**
> This document was prepared at the conclusion of Phase 2 to ensure seamless continuity for the next AI agent session.

---

## 1. Project Overview & Current State

- **Project**: 3D Post-Apocalyptic Android Survival Game (WebGL2 + Three.js + Web Workers + Capacitor).
- **Target Platform**: Android Mobile (ARM64, landscape orientation, 60 FPS target).
- **Git Repo**: `https://github.com/sakuraDev31/post-apocalyptic-3d` (remote `origin/main`).
- **Current Completion Status**:
  - **Phase 1 (Procedural 3D Asset Studio)**: 100% Complete & Verified.
  - **Phase 2 (Playable World & Scavenger Player)**: 100% Complete & Verified (28/28 tests passing).
  - **Pending Hard Gate**: Awaiting user approval: **`APPROVED - PROCEED TO PHASE 3`**.

---

## 2. Directory Architecture & Sync Rules

The project operates across **three synchronized directories**:

1. **Termux Project Workspace** (Git repo, dependencies, builds):
   `/data/data/com.termux/files/home/MyAiProjects/post-apocalyptic-3d/`
2. **Termux Root Workspace** (Where dev server currently serves from):
   `/data/data/com.termux/files/home/`
3. **Android Shared / Internal Storage** (Where the user views files in Android File Manager):
   `/storage/emulated/0/MyAiProjects/post-apocalyptic-3d/`
   APK download location: `/storage/emulated/0/Download/app-debug.apk`

> ⚠️ **CRITICAL RULE**: Whenever modifying source code or tests, ALWAYS copy the changes to all three locations and ensure permissions are set (`chmod -R 775 /storage/emulated/0/MyAiProjects/post-apocalyptic-3d/`), then commit and push to GitHub!

---

## 3. Strict Technical & Performance Rules

1. **ZERO EXTERNAL ASSETS**:
   - 100% of geometries, textures, materials, and models MUST be procedurally synthesized in code.
   - Do NOT load external `.png`, `.jpg`, `.glb`, or `.obj` files.
2. **NO LAZY PRIMITIVES**:
   - Manipulate `BufferGeometry` vertex positions, normals, and vertex colors directly using seeded noise and math.
3. **MOBILE FILL-RATE & GPU CONSTRAINTS (Android Mali/Adreno)**:
   - Cap renderer pixel ratio at `Math.min(window.devicePixelRatio, 1.5)`.
   - Max 1 directional shadow light (`PCFShadowMap`, 1024×1024 map, following player).
   - Use `InstancedMesh` for all world props (drums, trees, rubble, barricades, crates).
   - Budget: <= 60,000 total visible triangles, <= 150 draw calls.
   - Zero per-frame allocations in render/physics loops (reuse temporary `Vector3`, `Quaternion`, `Matrix4`).

---

## 4. Key Systems Already Implemented

- **`src/core/Contracts.js`**: `InputState`, `Collider`, `Doorway`, `BuildingOutput`, `WorldQuery`.
- **`src/core/SeededNoise.js`**: Deterministic Mulberry32 PRNG + 2D/3D Simplex + fBm + Splines.
- **`src/textures/ProceduralMaterialBank.js`**: 512×512 PBR textures (rust, concrete, asphalt, soot, bark, scrap) with albedo, roughness, and bump maps + quality tier switching (`setQuality('low'|'medium'|'high')`).
- **`src/player/`**:
  - `PlayerModelGenerator.js`: 1.8m procedural humanoid (1,328 tris, 10 draws, named joints).
  - `PlayerAnimator.js`: Procedural locomotion, breathing, lean, jump, squash.
  - `PlayerController.js`: 60 Hz kinematic capsule, coyote time, stamina, multi-pass OBB wall collision sliding.
- **`src/camera/ThirdPersonCamera.js`**:
  - Dual modes: **Overhead** (8.5m, ~58° pitch, centered) and **Shoulder** (PUBG/COD style).
  - Ray collision pullback against terrain and building colliders.
- **`src/input/TouchControls.js`**:
  - Dynamic left joystick (radius 60px, dead zone 0.12) with corrected screen-to-world mapping.
  - Right drag-to-look with touch pointerId isolation.
  - Action buttons cluster: `JUMP`, `SPRINT`, `CROUCH`, `USE`.
- **`src/generators/BuildingCatalog.js`**:
  - 6 Archetypes: Brutalist Block, Low-Rise Apartment, Warehouse, Office Tower, Bunker, Gas Station.
  - Walkable doorway gaps in wall colliders.
- **`src/world/`**:
  - `TerrainGenerator.js`: Pure deterministic `heightAt(x, z, seed)` function with walkable slopes (<35°).
  - `WorldStreamer.js`: 64m chunk streamer, 5×5 window, multi-ring LODs + skirts, 1 chunk/frame budget.
  - `Placement.js`: Deterministic chunk placement with 3 buildings in spawn chunk (0,0).
  - `CollisionWorld.js`: 16m spatial hash grid implementing `WorldQuery`.
- **`src/ui/`**:
  - `GameHUD.js`: HP, stamina, compass, 96px rotating minimap, dot crosshair, pause menu, brightness controls (`1.0x` / `1.3x` / `1.6x`).
  - `MobileHUD.js`: Phase 1 studio HUD with archetype switcher and perf toggles.
- **`src/game/Game.js`**: 60 Hz fixed timestep physics loop with auto-downgrade governor.
- **`src/main.js`**: Main Menu with `[PLAY]` and `[ASSET STUDIO]`.

---

## 5. Upcoming Phase 3 Scope (When User Approves)

When the user replies with **`APPROVED - PROCEED TO PHASE 3`**, build:
1. **Agent A (Controls & Interaction)**:
   - Dual-thumb touch controls refinement + interaction raycast prompt when looking at crates/drums/scrap.
   - Backpack inventory HUD (grid of slots for scrap, medical supplies, fuel, batteries).
2. **Agent B (Scavenging Mechanics & Economy)**:
   - Loot generation inside buildings and near props (salvage scrap, cloth, metal, food).
   - Scavenging timer / progress bar on hold `USE`.
3. **Agent C (Drone Patrol AI & Radiation Storms)**:
   - Autonomous drone patrol AI: state machine (`PATROL`, `ALERT` with orange scanner cone, `PURSUIT` with red siren scanner).
   - Dynamic Radiation Storm: Geiger counter tick audio/visual, radiation damage over time outside, safe zones inside concrete buildings/bunkers.

---

## 6. How to Verify & Build

```bash
# 1. Run all unit and integration tests (must maintain 28/28 pass)
npm test

# 2. Run production web bundle
npm run build

# 3. Sync to Capacitor Android native project
npm run cap:build

# 4. Check git status, commit, and push to GitHub (triggers automated APK build)
git commit -am "..."
git push origin main

# 5. Check GitHub Actions workflow and download fresh APK
gh run list --limit 1
gh run download <RUN_ID> -n post-apocalyptic-3d-debug-apk --dir /storage/emulated/0/Download/apk_tmp/
mv /storage/emulated/0/Download/apk_tmp/app-debug.apk /storage/emulated/0/Download/app-debug.apk
cp /storage/emulated/0/Download/app-debug.apk /storage/emulated/0/MyAiProjects/post-apocalyptic-3d/post-apocalyptic-3d-debug.apk
```
