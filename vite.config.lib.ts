import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import dts from 'vite-plugin-dts';

const libEntries = {
    'cesium-tools': path.resolve(__dirname, './src/index.ts'),
    core: path.resolve(__dirname, './src/core/index.ts'),
    react: path.resolve(__dirname, './src/react/index.ts'),
    vue: path.resolve(__dirname, './src/vue/index.ts'),
};

const external = [
    'vue',
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
    plugins: [
        react(),
        dts({
            tsconfigPath: path.resolve(__dirname, 'tsconfig.lib.json'),
            rollupTypes: true,
            entryRoot: path.resolve(__dirname, 'src'),
        }),
    ],
    resolve: {
        alias: {
            '@src': path.resolve(__dirname, './src'),
            '@tools': path.resolve(__dirname, './src/tools'),
        },
    },
    build: {
        emptyOutDir: true,
        lib: {
            entry: libEntries,
            formats: ['es'],
            fileName: (_format, entryName) => `${entryName}.es.js`,
        },
        rollupOptions: { external },
        copyPublicDir: false,
        minify: 'esbuild',
    },
});
