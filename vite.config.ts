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
            '@components': path.resolve(__dirname, './src/components')
          }
    },
    build: {
        rollupOptions: {
            input: path.resolve(__dirname, './src/index.ts'),
            output: {
            file: path.resolve(__dirname, './dist/cesium-tools.min.js'),
            format: 'umd',
            name: 'CesiumToolsFXT',
            globals: {
                'cesium': 'Cesium',
                'react': 'React'
            }
            }
        }
    }
});
