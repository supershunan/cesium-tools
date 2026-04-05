import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
    plugins: [
        react(),
        dts({
            tsconfigPath: path.resolve(__dirname, 'tsconfig.lib.json'),
            rollupTypes: true,
        }),
    ],
    resolve: {
        alias: {
            '@src': path.resolve(__dirname, './src'),
            '@tools': path.resolve(__dirname, './src/tools'),
            '@components': path.resolve(__dirname, './src/components'),
        },
    },
    server: {
        proxy: {
            '/cesium': {
                target: 'https://sandcastle.cesium.com/',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/cesium/, ''),
            },
        },
    },
    build: {
        lib: {
            entry: path.resolve(__dirname, './src/index.ts'),
            name: 'cesium-tools-fxt',
            formats: ['es', 'umd'],
            fileName: (format) => {
                return `cesium-tools.${format}.js`;
            },
        },
        rollupOptions: {
            // 与 peerDependencies 对齐：不打进 dist，由宿主项目安装并提供
            external: [
                'react',
                'react-dom',
                'cesium',
                '@turf/turf',
                '@zip.js/zip.js',
                'd3-delaunay',
            ],
            output: {
                globals: {
                    cesium: 'Cesium',
                    react: 'React',
                    'react-dom': 'ReactDOM',
                    '@turf/turf': 'turf',
                    // UMD：需在页面按各库文档挂全局；ESM 宿主从 node_modules 解析即可
                    '@zip.js/zip.js': 'zip',
                    // d3-delaunay 官方 UMD 挂在 global.d3 上，含 Delaunay / Voronoi
                    'd3-delaunay': 'd3',
                },
            },
        },
        // sourcemap: true,
        copyPublicDir: false,
        minify: 'esbuild',
    },
});
