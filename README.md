# 3D Post-Apocalyptic Android Game — Phase 1 Procedural 3D Asset Studio

A high-performance, mobile-optimized procedural 3D asset generation studio built with Three.js, WebGL2, and parallel Web Workers.

## Key Features
- **Deterministic Procedural Generation**: Mulberry32 PRNG + 2D/3D Simplex Noise + fBm.
- **100% Code-Synthesized PBR Materials**: Flaking Rust, Brutalist Concrete, Cracked Asphalt, and Scorched Soot/Ash with albedo, roughness, and bump maps. Zero external image assets.
- **Off-Thread Mesh Worker Pool**: Offloads geometry generation and vertex displacement to parallel Web Workers using zero-copy `Transferable` `Float32Array` buffers.
- **Strict Triangle Budgets**:
  - Props: < 300 triangles (Oil Drum: 216 tris, Barricade: 224 tris, Streetlight: 244 tris)
  - Ruined Brutalist Building: 1,228 triangles (< 1,500 budget)
  - Full Diorama Showcase: 12,382 triangles (< 25,000 budget)
- **Interactive Mobile Studio HUD**:
  - Touch Asset Switcher: Modes 1 to 6
  - Real-Time Telemetry: FPS, Frame Time ms, Active Workers, Draw Calls, Triangles
  - Action Bar: Regenerate (Parallel Seed), Wireframe Toggle, Atmosphere Presets (`Harsh Noon`, `Radioactive Dust Storm`, `Ash Dusk`), and `.GLB` Binary Export via `GLTFExporter`.

## How to Run in Termux

```bash
cd /data/data/com.termux/files/home/MyAiProjects/post-apocalyptic-3d

# Run the dev server
npm run dev

# Run unit and integration tests (16/16)
npm test

# Build production bundle
npm run build
```

Open `http://localhost:5173/` in your Android browser.
