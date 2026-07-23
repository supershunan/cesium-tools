import { defineConfig } from 'vite';
import path from 'path';

const external = [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'cesium',
    '@turf/turf',
    '@zip.js/zip.js',
    'd3-delaunay',
];

export default defineConfig({
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
            fileName: () => 'cesium-tools.umd.js',
        },
        rollupOptions: {
            external,
            output: {
                globals: {
                    cesium: 'Cesium',
                    react: 'React',
                    'react-dom': 'ReactDOM',
                    'react/jsx-runtime': 'jsxRuntime',
                    'react/jsx-dev-runtime': 'jsxDevRuntime',
                    '@turf/turf': 'turf',
                    '@zip.js/zip.js': 'zip',
                    'd3-delaunay': 'd3',
                },
            },
        },
        copyPublicDir: false,
        minify: 'esbuild',
    },
});
