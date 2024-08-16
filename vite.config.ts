import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
    plugins: [
        react(),
        dts()
    ],
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
            name: 'cesium-tools-fxt',
            formats: ['es', 'umd'],
            fileName: (format) => {return `cesium-tools.${format}.js`;},
        },
        rollupOptions: {
            external: [
                'react',
                'cesium',
                '@turf/turf',
            ],
            output: {
                globals: {
                    cesium: 'Cesium',
                    react: 'React',
                    '@turf/turf': 'turf',
                },
            },
        },
        // sourcemap: true,
        copyPublicDir: false,
        minify: 'esbuild'
    },
});
