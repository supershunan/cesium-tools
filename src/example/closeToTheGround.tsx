import { useCallback, useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { AnimatedRasterLayer } from '@src/tools/radarLayer/AnimatedRasterLayer';
import { GridDataReader, GridHeader } from '@src/tools/radarLayer';

type GridResult = {
    header: GridHeader & { times?: number; levels?: number };
    data: number[][][][] | null;
    flatData?: Float32Array;
    getLevelSlice?: (timeIndex: number, levelIndex: number) => number[][];
};

export default function CloseToTheGround({ viewer }: { viewer: Cesium.Viewer }) {
    const baseUrl = 'http://222.74.18.86:7085/fxtraincold/';
    const dataURL = [
        'pythonfile/SX002/2025-08-09/SX002_20250809120000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809120500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809121000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809121500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809122000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809122500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809123000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809123500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809124000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809124500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809125000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809125500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809130000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809130500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809131000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809131500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809132000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809132500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809133000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809133500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809134000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809134500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809135000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809135500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809140000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809140500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809141000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809141500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809142000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809142500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809143000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809143500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809144000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809144500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809145000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809145500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809150000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809150500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809151000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809151500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809152000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809152500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809153000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809153500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809154000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809154500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809155000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809155500_CR.zip',
    ];

    const closeToTheGroundLayer = useRef<AnimatedRasterLayer[]>([]);
    const staticLayer = useRef<AnimatedRasterLayer[]>([]);
    const frameIndex = useRef(0);
    const resultRef = useRef<GridResult | null>(null);

    const loadGridResult = async (url: string) => {
        try {
            const res = await fetch(
                '/public/resources/82DA3ED6762D4E9AB594EDF9D6359461202602260030_simulated_1.bin.zip',
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/zip',
                    },
                }
            );
            if (!res.ok) {
                return null;
            }
            const reader = new GridDataReader();
            const parsed = (await reader.readCompressedGridData(await res.blob())) as GridResult;
            console.log(parsed);
            return parsed;
        } catch (error) {
            return null;
        }
    };

    /** 多层动画数据渲染 */
    const renderMultiAnimatedLayerFrame = async () => {
        if (!resultRef.current) {
            const url = dataURL[frameIndex.current];
            const result = await loadGridResult(baseUrl + url);
            resultRef.current = result;
        }
        const times = Number(
            resultRef.current?.header.times ?? resultRef.current?.data?.length ?? 0
        );
        const levels = Number(
            resultRef.current?.header.levels ?? resultRef.current?.data?.[0]?.length ?? 0
        );
        if (!times || !levels) {
            return;
        }

        if (!closeToTheGroundLayer.current.length) {
            closeToTheGroundLayer.current = Array.from(
                { length: levels },
                () =>
                    new AnimatedRasterLayer(viewer as Cesium.Viewer, {
                        clampToGround: false,
                        colorRamp: [
                            { maxValue: 10, color: [62, 160, 239] },
                            { maxValue: 15, color: [62, 160, 239] },
                            { maxValue: 20, color: [108, 225, 238] },
                            { maxValue: 25, color: [96, 214, 63] },
                            { maxValue: 30, color: [70, 137, 37] },
                            { maxValue: 35, color: [252, 251, 74] },
                            { maxValue: 40, color: [223, 195, 73] },
                            { maxValue: 45, color: [239, 147, 47] },
                            { maxValue: 50, color: [231, 53, 31] },
                            { maxValue: 55, color: [184, 43, 41] },
                            { maxValue: 60, color: [183, 36, 28] },
                            { maxValue: 65, color: [236, 62, 237] },
                            { maxValue: 70, color: [132, 39, 179] },
                            { maxValue: Number.POSITIVE_INFINITY, color: [174, 148, 237] },
                        ],
                    })
            );
        }
        const timeIndex = frameIndex.current;
        const levelList = resultRef.current?.header.levelList ?? [];

        for (let levelIndex = 0; levelIndex < levels; levelIndex++) {
            const grid = resultRef.current?.getLevelSlice
                ? resultRef.current?.getLevelSlice(timeIndex, levelIndex)
                : resultRef.current?.data?.[timeIndex]?.[levelIndex];
            if (
                !Array.isArray(grid) ||
                !grid.length ||
                !Array.isArray(grid[0]) ||
                !grid[0].length
            ) {
                continue;
            }
            const levelHeightRaw = levelList[levelIndex];
            const levelHeight = Number(levelHeightRaw);
            const layerHeight =
                levelIndex === 0 || !Number.isFinite(levelHeight) ? 0 : levelHeight * 10;

            closeToTheGroundLayer.current?.[levelIndex]?.update({
                header: resultRef.current?.header ?? ({} as GridHeader),
                grid,
                heightMeters: layerHeight,
                opacity: levelIndex === 0 ? 1 : 0.45,
            });
        }
        frameIndex.current++;
    };

    /** 多层静态数据渲染 */
    const renderMultiStaticLayerFrame = async () => {
        const result = await loadGridResult(baseUrl + dataURL[frameIndex.current]);
        if (!result) {
            return;
        }
        const times = Number(result.header.times ?? result.data?.length ?? 0);
        const levels = Number(result.header.levels ?? result.data?.[0]?.length ?? 0);
        if (!times || !levels) {
            return;
        }

        if (!staticLayer.current.length) {
            staticLayer.current = Array.from(
                { length: levels },
                () =>
                    new AnimatedRasterLayer(viewer as Cesium.Viewer, {
                        clampToGround: true,
                        gradientEnabled: true,
                        colorRamp: [
                            { maxValue: 10, color: [62, 160, 239] },
                            { maxValue: 15, color: [62, 160, 239] },
                            { maxValue: 20, color: [108, 225, 238] },
                            { maxValue: 25, color: [96, 214, 63] },
                            { maxValue: 30, color: [70, 137, 37] },
                            { maxValue: 35, color: [252, 251, 74] },
                            { maxValue: 40, color: [223, 195, 73] },
                            { maxValue: 45, color: [239, 147, 47] },
                            { maxValue: 50, color: [231, 53, 31] },
                            { maxValue: 55, color: [184, 43, 41] },
                            { maxValue: 60, color: [183, 36, 28] },
                            { maxValue: 65, color: [236, 62, 237] },
                            { maxValue: 70, color: [132, 39, 179] },
                            { maxValue: Number.POSITIVE_INFINITY, color: [174, 148, 237] },
                        ],
                        // interactionOptions: {
                        //     enabled: true,
                        //     onCellClick: (cell) => {
                        //         console.log(cell);
                        //     },
                        //     hoverEnabled: true,
                        //     hoverColor: Cesium.Color.RED,
                        //     hoverAlpha: 0.35,
                        //     onCellHover: (cell) => {
                        //         console.log(cell);
                        //     },
                        // },
                    })
            );
        }

        /**
         * todo: 实质上对于静态数据，只需要一层数据，多层数据只是为了兼容动画数据，下面的逻辑完全是为了兼容数据格式
         */
        for (let levelIndex = 0; levelIndex < levels; levelIndex++) {
            const grid = result.getLevelSlice
                ? result.getLevelSlice(0, levelIndex)
                : result.data?.[0]?.[levelIndex];
            if (
                !Array.isArray(grid) ||
                !grid.length ||
                !Array.isArray(grid[0]) ||
                !grid[0].length
            ) {
                continue;
            }
            staticLayer.current?.[levelIndex]?.update({
                header: result.header,
                grid,
                heightMeters: 0,
                opacity: 1,
            });
        }
        frameIndex.current++;
    };

    useEffect(() => {
        if (!viewer) return;
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((evt: { position: Cesium.Cartesian2 }) => {
            const pos = viewer.scene.pickPosition(evt.position);
            if (!pos) return;
            const carto = Cesium.Cartographic.fromCartesian(pos);
            const lat = Cesium.Math.toDegrees(carto.latitude);
            const lon = Cesium.Math.toDegrees(carto.longitude);
            console.log([lon, lat]);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        return () => handler.destroy();
    }, [viewer]);

    return (
        <div>
            <button onClick={renderMultiAnimatedLayerFrame}>下一帧</button>
            <button
                onClick={() => {
                    staticLayer.current[0]?.setMaskPolygon([
                        [107.60387951714638, 32.36199538408126],
                        [107.6566394330607, 32.36826934113291],
                        [107.66553983239024, 32.31170939828828],
                        [107.6080259861867, 32.30491929532728],
                    ]);
                }}
            >
                设置遮罩
            </button>
            <button
                onClick={() => {
                    staticLayer.current[0]?.setMaskPolygon(null);
                }}
            >
                清除遮罩
            </button>
        </div>
    );
}
