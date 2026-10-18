# Post-Apocalyptic Survival 3D (Godot 4.3 Engine)

Core 3D Survival Game Engine ported to **Godot Engine 4 (Mobile / Compatibility / Vulkan)**.

---

## 🌟 Why Godot 4 vs Three.js?

| Feature | Old Web Engine (Three.js + JS) | Godot 4 Native Engine |
| :--- | :--- | :--- |
| **Physics** | Custom JS kinematic capsule, manual raycasts, GC stutter | Native C++ / Jolt 3D physics (`CharacterBody3D`, `move_and_slide`, floor snapping) |
| **Shaders** | Software CPU 2D canvas pixel rasterizer | Native GPU spatial shaders (`toon_pbr.gdshader`, triplanar rust) |
| **Atmosphere** | Basic PCF Three.js lights, manual fog | Godot `WorldEnvironment`, Volumetric Fog, ACES Tonemapping, Glow |
| **Camera** | Custom ray marchers with bisection pullback | Native `SpringArm3D` with automated shape-cast collision pullback |
| **Mobile Controls** | DOM HTML elements over WebGL canvas | Native Godot `Control` nodes (`VirtualJoystick`, multi-touch pointer isolation) |
| **Assets** | Hardcoded procedural generation | Drag-and-drop `.glb` (`Genshin_Anime_PostApoc_City.glb`) with auto-collider generation |
| **Radiation Storm** | Basic JS color tinting | Full-screen post-processing canvas shader (chromatic aberration, Geiger film grain, vignette) |

---

## 📂 Project Structure

```
post-apocalyptic-godot/
├── project.godot                     # Godot 4 engine configuration (Mobile / Android)
├── assets/
│   └── models/
│       └── Genshin_Anime_PostApoc_City.glb  # 3D Anime Post-Apocalyptic City Pack
├── scripts/
│   ├── player.gd                     # CharacterBody3D: Speeds, Stamina, Coyote Time, Jump Buffer, Crouch
│   ├── camera_rig.gd                 # SpringArm3D: Dual Shoulder/Overhead view, pitch clamping, collision pullback
│   ├── touch_controls.gd             # Mobile touch HUD & multi-touch gesture routing
│   ├── virtual_joystick.gd           # Dynamic analog on-screen joystick
│   ├── hud.gd                        # HP, Stamina, Compass, Radiation Geiger meter
│   └── world.gd                      # World manager, city auto-colliders, dynamic radiation storm
├── scenes/
│   ├── World.tscn                    # Main Game Scene
│   ├── Player.tscn                   # Player capsule, CameraRig, CeilingCheck, VisualMesh
│   ├── TouchControls.tscn            # Virtual Joystick + Jump / Sprint / Crouch / View buttons
│   └── HUD.tscn                      # HP & Stamina bars, Compass, Crosshair, Radiation overlay
└── shaders/
    ├── toon_pbr.gdshader             # Genshin / Anime-style cel-shading with ramp & rim light
    ├── radiation_storm.gdshader      # Post-processing radiation distortion, grain & chromatic aberration
    └── triplanar_rust.gdshader       # Procedural 3D noise triplanar rust & weathered concrete
```

---

## 🕹️ Controls

### Mobile (Touch)
- **Left Thumb (Bottom Left)**: Dynamic Virtual Joystick (Walk -> Run -> Sprint).
- **Right Thumb (Right Half Screen)**: Drag to rotate camera / look around.
- **Action Buttons (Bottom Right)**:
  - `JUMP`: Variable-height jump with coyote time & jump buffer.
  - `SPRINT`: Toggle sprint (drains stamina, locked if stamina drops below 5%).
  - `CROUCH`: Toggle crouch (eases height 1.8m -> 1.1m; prevents standing if blocked overhead).
  - `VIEW`: Toggle between Over-the-Shoulder camera and Overhead top-down view.

### Desktop / Keyboard & Mouse
- **WASD**: Move (Forward, Backward, Left, Right)
- **Mouse**: Look / Aim (when captured)
- **Space**: Jump
- **Shift**: Sprint
- **C**: Crouch
- **V**: Toggle Camera Mode (Shoulder / Overhead)

---

## 🚀 How to Run & Edit

### Option A: On Android via Godot Editor
1. Install **Godot Editor 4** from Google Play Store or download `Godot_v4.x-stable_android_editor.apk` from the [official Godot download page](https://godotengine.org/download/android/).
2. Open the Godot Editor app on your Android device.
3. Tap **Import** -> Navigate to `/storage/emulated/0/MyAiProjects/post-apocalyptic-godot/`.
4. Select `project.godot` and tap **Import & Edit**.
5. Press the **Play (▶)** button in the top right corner to run!

### Option B: On PC / Mac / Linux
1. Copy or git clone the project folder to your PC.
2. Open Godot 4.3+.
3. Import `project.godot` and hit **F5** to run.
