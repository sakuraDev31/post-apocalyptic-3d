import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        '**/.git/**',
        '**/.cargo/**',
        '**/.cache/**',
        '**/.local/**',
        '**/.npm/**',
        '**/node_modules/**',
        '**/uploaded/**',
        '**/storage/**',
        '**/.gemini/**',
        '**/.agy_sessions/**',
        '**/MyAiProjects/**',
        '**/NewPipe-Frost/**',
        '**/frostsoulx/**',
        '**/*.log'
      ]
    }
  },
  optimizeDeps: {
    include: [
      'three',
      'three/addons/controls/OrbitControls.js',
      'three/addons/exporters/GLTFExporter.js',
      'three/addons/utils/BufferGeometryUtils.js'
    ]
  }
});
