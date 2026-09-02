import { defineConfig } from 'vite';
import path from 'path';
import dts from 'vite-plugin-dts';

const libEntries = {
    'cesium-tools': path.resolve(__dirname, './src/index.ts'),
};

const external = ['cesium', '@turf/turf', '@zip.js/zip.js'];

export default defineConfig({
    base: './',
    plugins: [
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
            fileName: (_format, entryName) => {
                return `${entryName}.es.js`;
            },
        },
        rollupOptions: { external },
        copyPublicDir: false,
        minify: 'esbuild',
    },
});
