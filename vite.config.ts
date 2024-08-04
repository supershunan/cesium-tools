import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@src': path.resolve(__dirname, './src'),
      '@tools': path.resolve(__dirname, './src/tools'),
      '@components': path.resolve(__dirname, './src/components'),
    },
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, './src/index.ts'),
      name: 'CesiumToolsFXT',
      fileName: (format) => {return `cesium-tools.${format}.js`;},
    },
    rollupOptions: {
      output: {
        dir: path.resolve(__dirname, './dist'),
        format: 'umd',
        entryFileNames: 'cesium-tools.min.js',
        name: 'CesiumToolsFXT',
        globals: {
          cesium: 'Cesium',
          react: 'React',
        },
      },
    },
  },
});
