/**
 * ProceduralMaterialBank.js
 * 
 * Synthesizes 100% procedural PBR textures and Three.js MeshStandardMaterials.
 * ZERO EXTERNAL IMAGES. Generates 512x512 procedural maps directly in code:
 * - Flaking Oxidized Rust
 * - Pitted Brutalist Concrete
 * - Cracked Asphalt
 * - Scorched Soot/Ash
 * - Weathered Rebar Steel
 * - Autonomous Drone Armor & Glowing Red Optical Lens
 * - Dead Gnarled Tree Bark
 * - Corrugated Scrap Metal
 */

import * as THREE from 'three';
import { SimplexNoise, createPRNG } from '../core/SeededNoise.js';
import { MATERIAL_KEYS } from '../core/AssetContract.js';

export class ProceduralMaterialBank {
  constructor(options = {}) {
    this.resolution = options.resolution || 512;
    this.materials = new Map();
    this.textures = [];
    this.noise = new SimplexNoise(options.seed || 4242);
    this.prng = createPRNG(options.seed || 4242);
    this.wireframe = false;

    this.init();
  }

  /**
   * Helper to create either an HTML5 Canvas or an OffscreenCanvas or fallback DataTexture
   */
  createPixelBuffer(width, height) {
    return new Uint8ClampedArray(width * height * 4);
  }

  createCanvas(width, height) {
    if (typeof document !== 'undefined' && document.createElement) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return canvas;
    } else if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(width, height);
    }
    return null;
  }

  /**
   * Generates a THREE.CanvasTexture or THREE.DataTexture from a pixel drawing function
   */
  generateTexture(generatorFn, name = 'proc_tex') {
    const res = this.resolution;
    const canvas = this.createCanvas(res, res);

    if (canvas && canvas.getContext) {
      const ctx = canvas.getContext('2d');
      const imgData = ctx.createImageData(res, res);
      generatorFn(imgData.data, res, res, this.noise, this.prng);
      ctx.putImageData(imgData, 0, 0);

      const texture = new THREE.CanvasTexture(canvas);
      texture.name = name;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = name.includes('albedo') ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.needsUpdate = true;
      this.textures.push(texture);
      return texture;
    } else {
      // Headless Node.js / DataTexture fallback
      const buffer = new Uint8Array(res * res * 4);
      generatorFn(buffer, res, res, this.noise, this.prng);
      const texture = new THREE.DataTexture(buffer, res, res, THREE.RGBAFormat);
      texture.name = name;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = name.includes('albedo') ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.needsUpdate = true;
      this.textures.push(texture);
      return texture;
    }
  }

  init() {
    this.createRustMaterial();
    this.createConcreteMaterial();
    this.createAsphaltMaterial();
    this.createSootMaterial();
    this.createRebarMaterial();
    this.createDroneBodyMaterial();
    this.createDroneVisorMaterial();
    this.createBarkMaterial();
    this.createScrapMetalMaterial();
  }

  // 1. FLAKING OXIDIZED RUST
  createRustMaterial() {
    const albedoTex = this.generateTexture((data, w, h, noise) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const u = x / w;
          const v = y / h;
          // Multi-octave rust pattern
          const n1 = noise.fbm2D(u * 6.0, v * 6.0, 4, 2.0, 0.5);
          const flakes = noise.noise2D(u * 28.0, v * 28.0);

          // Base oxidized reddish brown (#4a1d0d to #8c3b17)
          let r = 74 + n1 * 50;
          let g = 29 + n1 * 25;
          let b = 13 + n1 * 10;

          // Flaking bright orange/rust patches
          if (flakes > 0.35) {
            r += 55;
            g += 30;
            b += 10;
          } else if (flakes < -0.4) {
            // Dark charred pitted oxide
            r *= 0.6;
            g *= 0.5;
            b *= 0.5;
          }

          data[idx] = Math.min(255, Math.max(0, r));
          data[idx + 1] = Math.min(255, Math.max(0, g));
          data[idx + 2] = Math.min(255, Math.max(0, b));
          data[idx + 3] = 255;
        }
      }
    }, 'rust_albedo');

    const roughnessTex = this.generateTexture((data, w, h, noise) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const u = x / w;
          const v = y / h;
          const n = noise.fbm2D(u * 12.0, v * 12.0, 3, 2.0, 0.5);
          const rough = 210 + n * 40; // High roughness 0.82 - 0.98
          data[idx] = data[idx + 1] = data[idx + 2] = Math.min(255, Math.max(0, rough));
          data[idx + 3] = 255;
        }
      }
    }, 'rust_roughness');

    const bumpTex = this.generateTexture((data, w, h, noise) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const u = x / w;
          const v = y / h;
          const bump = 128 + noise.fbm2D(u * 16.0, v * 16.0, 4) * 110;
          data[idx] = data[idx + 1] = data[idx + 2] = Math.min(255, Math.max(0, bump));
          data[idx + 3] = 255;
        }
      }
    }, 'rust_bump');

    const mat = new THREE.MeshStandardMaterial({
      name: MATERIAL_KEYS.RUST,
      map: albedoTex,
      roughnessMap: roughnessTex,
      bumpMap: bumpTex,
      bumpScale: 0.08,
      metalness: 0.2,
      roughness: 0.9
    });
    mat.userData = { bumpMap: bumpTex, bumpScale: 0.08, roughnessMap: roughnessTex };
    this.materials.set(MATERIAL_KEYS.RUST, mat);
  }

  // 2. PITTED BRUTALIST CONCRETE
  createConcreteMaterial() {
    const albedoTex = this.generateTexture((data, w, h, noise) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const u = x / w;
          const v = y / h;
          const n = noise.fbm2D(u * 8.0, v * 8.0, 4, 2.0, 0.5);
          const speckle = noise.noise2D(u * 64.0, v * 64.0);

          let base = 125 + n * 35;
          if (speckle > 0.5) base -= 25; // dark sand aggregate
          if (speckle < -0.5) base += 15; // lighter calcium fleck

          data[idx] = Math.min(255, Math.max(0, base - 2));
          data[idx + 1] = Math.min(255, Math.max(0, base));
          data[idx + 2] = Math.min(255, Math.max(0, base + 2));
          data[idx + 3] = 255;
        }
      }
    }, 'concrete_albedo');

    const roughnessTex = this.generateTexture((data, w, h, noise) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const u = x / w;
          const v = y / h;
          const n = noise.fbm2D(u * 10.0, v * 10.0, 3, 2.0, 0.5);
          const pore = noise.noise2D(u * 32.0, v * 32.0);
          let rough = 215 + n * 25; // 0.84 to 0.94
          if (pore > 0.6) rough += 20; // extra rough inside pitted pores
          const rVal = Math.min(255, Math.max(0, rough));
          data[idx] = data[idx + 1] = data[idx + 2] = rVal;
          data[idx + 3] = 255;
        }
      }
    }, 'concrete_roughness');

    const bumpTex = this.generateTexture((data, w, h, noise) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const u = x / w;
          const v = y / h;
          // Pitted circular air pores
          const poreNoise = noise.noise2D(u * 32.0, v * 32.0);
          let hVal = 128 + noise.fbm2D(u * 12.0, v * 12.0, 3) * 40;
          if (poreNoise > 0.6) {
            hVal -= 60; // pitted crater
          }
          data[idx] = data[idx + 1] = data[idx + 2] = Math.min(255, Math.max(0, hVal));
          data[idx + 3] = 255;
        }
      }
    }, 'concrete_bump');

    const mat = new THREE.MeshStandardMaterial({
      name: MATERIAL_KEYS.CONCRETE,
      map: albedoTex,
      roughnessMap: roughnessTex,
      bumpMap: bumpTex,
      bumpScale: 0.05,
      metalness: 0.05,
      roughness: 0.92
    });
    mat.userData = { bumpMap: bumpTex, bumpScale: 0.05, roughnessMap: roughnessTex };
    this.materials.set(MATERIAL_KEYS.CONCRETE, mat);
  }

  // 3. CRACKED ASPHALT
  createAsphaltMaterial() {
    const albedoTex = this.generateTexture((data, w, h, noise) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const u = x / w;
          const v = y / h;
          const grain = noise.noise2D(u * 40.0, v * 40.0);
          // Mid-grey base tarmac with grit so it cleanly modulates with vertex colors
          let val = 165 + grain * 35;

          // Branching crack pattern via ridged noise
          const crack = noise.ridgeNoise2D(u * 5.0, v * 5.0, 3, 2.0, 0.5);
          if (crack > 0.85) {
            val = 45; // deep fracture vein
          }

          data[idx] = Math.min(255, Math.max(0, val - 4));
          data[idx + 1] = Math.min(255, Math.max(0, val - 2));
          data[idx + 2] = Math.min(255, Math.max(0, val));
          data[idx + 3] = 255;
        }
      }
    }, 'asphalt_albedo');

    const roughnessTex = this.generateTexture((data, w, h, noise) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const u = x / w;
          const v = y / h;
          const n = noise.fbm2D(u * 16.0, v * 16.0, 3, 2.0, 0.5);
          const crack = noise.ridgeNoise2D(u * 5.0, v * 5.0, 3);
          let rough = 205 + n * 30; // 0.80 to 0.92
          if (crack > 0.8) rough = 252; // pulverized aggregate dust in cracks
          const rVal = Math.min(255, Math.max(0, rough));
          data[idx] = data[idx + 1] = data[idx + 2] = rVal;
          data[idx + 3] = 255;
        }
      }
    }, 'asphalt_roughness');

    const bumpTex = this.generateTexture((data, w, h, noise) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const u = x / w;
          const v = y / h;
          const crack = noise.ridgeNoise2D(u * 5.0, v * 5.0, 3);
          let hVal = 128 + noise.noise2D(u * 45.0, v * 45.0) * 35;
          if (crack > 0.8) {
            hVal -= 90; // crack crevice
          }
          data[idx] = data[idx + 1] = data[idx + 2] = Math.min(255, Math.max(0, hVal));
          data[idx + 3] = 255;
        }
      }
    }, 'asphalt_bump');

    const mat = new THREE.MeshStandardMaterial({
      name: MATERIAL_KEYS.ASPHALT,
      map: albedoTex,
      roughnessMap: roughnessTex,
      bumpMap: bumpTex,
      bumpScale: 0.06,
      metalness: 0.1,
      roughness: 0.85
    });
    mat.userData = { bumpMap: bumpTex, bumpScale: 0.06, roughnessMap: roughnessTex };
    this.materials.set(MATERIAL_KEYS.ASPHALT, mat);
  }

  // 4. SCORCHED SOOT / ASH
  createSootMaterial() {
    const albedoTex = this.generateTexture((data, w, h, noise) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const u = x / w;
          const v = y / h;
          const n = noise.fbm2D(u * 5.0, v * 5.0, 4);
          // Dark charred soot (#18191a) with subtle ash streaks
          let c = 32 + n * 24;
          data[idx] = Math.min(255, Math.max(0, c));
          data[idx + 1] = Math.min(255, Math.max(0, c * 0.95));
          data[idx + 2] = Math.min(255, Math.max(0, c * 0.9));
          data[idx + 3] = 255;
        }
      }
    }, 'soot_albedo');

    const roughnessTex = this.generateTexture((data, w, h, noise) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const u = x / w;
          const v = y / h;
          const n = noise.fbm2D(u * 12.0, v * 12.0, 4);
          const char = noise.noise2D(u * 24.0, v * 24.0);
          let rough = 238 + n * 16; // 0.93 - 1.0 powdery ash
          if (char > 0.55) rough = 135; // glassy scorched vitrified tar
          const rVal = Math.min(255, Math.max(0, rough));
          data[idx] = data[idx + 1] = data[idx + 2] = rVal;
          data[idx + 3] = 255;
        }
      }
    }, 'soot_roughness');

    const bumpTex = this.generateTexture((data, w, h, noise) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const u = x / w;
          const v = y / h;
          const blister = noise.noise2D(u * 20.0, v * 20.0);
          let hVal = 128 + noise.fbm2D(u * 8.0, v * 8.0, 3) * 55;
          if (blister > 0.55) hVal += 40; // blistered ash crust
          const bVal = Math.min(255, Math.max(0, hVal));
          data[idx] = data[idx + 1] = data[idx + 2] = bVal;
          data[idx + 3] = 255;
        }
      }
    }, 'soot_bump');

    const mat = new THREE.MeshStandardMaterial({
      name: MATERIAL_KEYS.SOOT,
      map: albedoTex,
      roughnessMap: roughnessTex,
      bumpMap: bumpTex,
      bumpScale: 0.04,
      metalness: 0.05,
      roughness: 0.98
    });
    mat.userData = { bumpMap: bumpTex, bumpScale: 0.04, roughnessMap: roughnessTex };
    this.materials.set(MATERIAL_KEYS.SOOT, mat);
  }

  // 5. WEATHERED REBAR STEEL
  createRebarMaterial() {
    const albedoTex = this.generateTexture((data, w, h, noise) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const v = y / h;
          // Ribbing pattern along v
          const rib = Math.sin(v * 60.0);
          const rust = noise.fbm2D(x / w * 10.0, v * 10.0, 2);

          let r = 70 + (rust > 0.2 ? 50 : 0);
          let g = 60 + (rust > 0.2 ? 15 : 0);
          let b = 55 + (rust > 0.2 ? 5 : 0);
          if (rib > 0.5) {
            r += 20; g += 20; b += 20;
          }
          data[idx] = Math.min(255, Math.max(0, r));
          data[idx + 1] = Math.min(255, Math.max(0, g));
          data[idx + 2] = Math.min(255, Math.max(0, b));
          data[idx + 3] = 255;
        }
      }
    }, 'rebar_albedo');

    const bumpTex = this.generateTexture((data, w, h) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const v = y / h;
          const rib = Math.sin(v * 60.0);
          const val = rib > 0.4 ? 190 : 120;
          data[idx] = data[idx + 1] = data[idx + 2] = val;
          data[idx + 3] = 255;
        }
      }
    }, 'rebar_bump');

    const mat = new THREE.MeshStandardMaterial({
      name: MATERIAL_KEYS.REBAR,
      map: albedoTex,
      bumpMap: bumpTex,
      bumpScale: 0.05,
      metalness: 0.8,
      roughness: 0.55
    });
    mat.userData = { bumpMap: bumpTex, bumpScale: 0.05 };
    this.materials.set(MATERIAL_KEYS.REBAR, mat);
  }

  // 6. AUTONOMOUS DRONE ARMOR
  createDroneBodyMaterial() {
    const albedoTex = this.generateTexture((data, w, h, noise) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const u = x / w;
          const v = y / h;
          // Military gunmetal slate olive with worn edge scuffs
          const edgeWear = Math.abs(noise.noise2D(u * 16.0, v * 16.0));
          let r = 52, g = 58, b = 60;
          if (edgeWear > 0.7) {
            // Scratched bare aluminum/steel
            r = 145; g = 150; b = 155;
          }
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        }
      }
    }, 'drone_albedo');

    const mat = new THREE.MeshStandardMaterial({
      name: MATERIAL_KEYS.DRONE_BODY,
      map: albedoTex,
      metalness: 0.75,
      roughness: 0.42
    });
    this.materials.set(MATERIAL_KEYS.DRONE_BODY, mat);
  }

  // 7. GLOWING RED OPTICAL SCANNER LENS
  createDroneVisorMaterial() {
    const mat = new THREE.MeshStandardMaterial({
      name: MATERIAL_KEYS.DRONE_VISOR,
      color: new THREE.Color(0x330000),
      emissive: new THREE.Color(0xff1818),
      emissiveIntensity: 2.8,
      roughness: 0.15,
      metalness: 0.85
    });
    this.materials.set(MATERIAL_KEYS.DRONE_VISOR, mat);
  }

  // 8. DEAD TREE BARK
  createBarkMaterial() {
    const albedoTex = this.generateTexture((data, w, h, noise) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const u = x / w;
          const v = y / h;
          // Longitudinal bark striations
          const bark = noise.noise2D(u * 30.0, v * 4.0);
          let val = 65 + bark * 28;
          data[idx] = Math.min(255, Math.max(0, val + 4));
          data[idx + 1] = Math.min(255, Math.max(0, val));
          data[idx + 2] = Math.min(255, Math.max(0, val - 4));
          data[idx + 3] = 255;
        }
      }
    }, 'bark_albedo');

    const bumpTex = this.generateTexture((data, w, h, noise) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const u = x / w;
          const v = y / h;
          const bark = noise.noise2D(u * 30.0, v * 4.0);
          const bVal = Math.min(255, Math.max(0, 128 + bark * 90));
          data[idx] = data[idx + 1] = data[idx + 2] = bVal;
          data[idx + 3] = 255;
        }
      }
    }, 'bark_bump');

    const mat = new THREE.MeshStandardMaterial({
      name: MATERIAL_KEYS.BARK,
      map: albedoTex,
      bumpMap: bumpTex,
      bumpScale: 0.08,
      roughness: 0.95,
      metalness: 0.05
    });
    mat.userData = { bumpMap: bumpTex, bumpScale: 0.08 };
    this.materials.set(MATERIAL_KEYS.BARK, mat);
  }

  // 9. CORRUGATED SCRAP METAL
  createScrapMetalMaterial() {
    const albedoTex = this.generateTexture((data, w, h, noise) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const u = x / w;
          const v = y / h;
          const rust = noise.fbm2D(u * 8.0, v * 8.0, 3);
          let r = 90, g = 95, b = 100;
          if (rust > 0.15) {
            r = 110 + rust * 60;
            g = 50 + rust * 20;
            b = 25;
          }
          data[idx] = Math.min(255, Math.max(0, r));
          data[idx + 1] = Math.min(255, Math.max(0, g));
          data[idx + 2] = Math.min(255, Math.max(0, b));
          data[idx + 3] = 255;
        }
      }
    }, 'scrap_albedo');

    const bumpTex = this.generateTexture((data, w, h, noise) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const u = x / w;
          const v = y / h;
          const scratch = noise.noise2D(u * 40.0, v * 40.0);
          const bVal = Math.min(255, Math.max(0, 128 + scratch * 50));
          data[idx] = data[idx + 1] = data[idx + 2] = bVal;
          data[idx + 3] = 255;
        }
      }
    }, 'scrap_bump');

    const mat = new THREE.MeshStandardMaterial({
      name: MATERIAL_KEYS.METAL_SCRAP,
      map: albedoTex,
      bumpMap: bumpTex,
      bumpScale: 0.04,
      roughness: 0.6,
      metalness: 0.65
    });
    mat.userData = { bumpMap: bumpTex, bumpScale: 0.04 };
    this.materials.set(MATERIAL_KEYS.METAL_SCRAP, mat);
  }

  /**
   * Enables or disables bump maps across all materials to preserve fill-rate
   */
  setBumpMapsEnabled(enabled) {
    this.bumpMapsEnabled = Boolean(enabled);
    for (const mat of this.materials.values()) {
      if (mat.userData && mat.userData.bumpMap) {
        mat.bumpMap = this.bumpMapsEnabled ? mat.userData.bumpMap : null;
        mat.bumpScale = this.bumpMapsEnabled ? (mat.userData.bumpScale || 0.05) : 0;
        mat.needsUpdate = true;
      }
    }
  }

  /**
   * Adjusts material bank complexity according to quality tier
   * @param {'low'|'medium'|'high'} tier
   */
  setQuality(tier) {
    if (tier === 'low') {
      this.setBumpMapsEnabled(false);
    } else {
      this.setBumpMapsEnabled(true);
    }
  }

  /**
   * Returns material by key. If missing, returns default grey material.
   */
  get(key) {
    if (this.materials.has(key)) {
      return this.materials.get(key);
    }
    const fallback = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.8 });
    this.materials.set(key, fallback);
    return fallback;
  }

  /**
   * Toggles wireframe on all managed materials
   */
  setWireframe(wireframe) {
    this.wireframe = Boolean(wireframe);
    for (const mat of this.materials.values()) {
      mat.wireframe = this.wireframe;
    }
  }

  /**
   * Cleanup textures and materials from GPU memory
   */
  dispose() {
    for (const tex of this.textures) {
      tex.dispose();
    }
    for (const mat of this.materials.values()) {
      mat.dispose();
    }
    this.textures.length = 0;
    this.materials.clear();
  }
}
