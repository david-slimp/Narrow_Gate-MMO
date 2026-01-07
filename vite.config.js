const { defineConfig } = require('vite');

module.exports = defineConfig({
  root: 'public',
  base: './',
  server: {
    port: 26472,
    strictPort: true,
  },
  preview: {
    port: 26472,
    strictPort: true,
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
