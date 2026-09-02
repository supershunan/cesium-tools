import { defineConfig } from 'vite';
import path from 'path';

const external = ['cesium', '@turf/turf', '@zip.js/zip.js'];

export default defineConfig({
    base: './',
    resolve: {
        alias: {
            '@src': path.resolve(__dirname, './src'),
            '@tools': path.resolve(__dirname, './src/tools'),
        },
    },
    build: {
        emptyOutDir: false,
        lib: {
            entry: path.resolve(__dirname, './src/index.ts'),
            name: 'CesiumToolsFxt',
            formats: ['umd'],
            fileName: () => {
                return 'cesium-tools.umd.cjs';
            },
        },
        rollupOptions: {
            external,
            output: {
                globals: {
                    cesium: 'Cesium',
                    '@turf/turf': 'turf',
                    '@zip.js/zip.js': 'zip',
                },
            },
        },
        copyPublicDir: false,
        minify: 'esbuild',
    },
});
