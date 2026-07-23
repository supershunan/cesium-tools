import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/** 本地 playground：`npm run dev` */
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@src': path.resolve(__dirname, './src'),
            '@tools': path.resolve(__dirname, './src/tools'),
            '@playground': path.resolve(__dirname, './playground'),
        },
    },
    server: {
        proxy: {
            '/cesium': {
                target: 'https://sandcastle.cesium.com/',
                changeOrigin: true,
                rewrite: (p) => p.replace(/^\/cesium/, ''),
            },
        },
    },
});
