import { defineConfig } from 'vite';

// Set this non-secret variable to /chat/ for the GitHub Pages project site.
const base = process.env.NORTHSTAR_BASE_PATH ?? '/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) {
  throw new Error('NORTHSTAR_BASE_PATH must be / or a slash-delimited path with a trailing slash, such as /chat/.');
}

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      // Stable library bytes can stay cached when the coaching content changes.
      // All static entry chunks remain discoverable by the offline shell installer.
      output: { manualChunks: id => {
        if (id.includes('/node_modules/')) return 'vendor';
        if (/\/src\/(?:practice-bank|exercises|tutor)\.js$/.test(id)) return 'practice';
        if (/\/src\/(?:hessen|curriculum|semester-grades|grades|recommendations)\.js$/.test(id)) return 'academics';
        if (/\/src\/roadmap\.js$/.test(id)) return 'roadmap';
      } },
    },
  },
});
