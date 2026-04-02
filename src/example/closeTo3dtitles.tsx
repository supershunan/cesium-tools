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
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/zip',
                },
            });
            if (!res.ok) {
                return null;
            }
            const reader = new GridDataReader();
            const parsed = (await reader.readCompressedGridData(await res.blob())) as GridResult;
            console.log(parsed);
            parsed.header = {
                ...parsed.header,
                xStart: 109.29996327928595,
                xEnd: 109.30409596417464,
                yStart: 29.277402044978786,
                yEnd: 29.27725033011981,
            };
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

    /**
     * 使用 GroundPrimitive 绘制多边形，与 AnimatedRasterLayer 同类型，
     * primitives 后加的在上面，保证显示在雷达图层之上且真正 drape 到地形。
     * 每次增加点时重建（GroundPrimitive 不支持动态几何），支持半透明。
     */
    const createOrUpdatePolygon = () => {
        if (points.current.length < 3) return;

        if (polygonRef.current) {
            if (!polygonRef.current.isDestroyed()) {
                viewer.scene.primitives.remove(polygonRef.current);
            }
            polygonRef.current = null;
        }

        const geometry = new Cesium.PolygonGeometry({
            polygonHierarchy: new Cesium.PolygonHierarchy([...points.current]),
            vertexFormat: Cesium.EllipsoidSurfaceAppearance.VERTEX_FORMAT,
        });

        polygonMaterial.current = Cesium.Material.fromType('Color', {
            color: Cesium.Color.RED.withAlpha(0.2),
        });

        polygonRef.current = viewer.scene.primitives.add(
            new Cesium.GroundPrimitive({
                geometryInstances: new Cesium.GeometryInstance({ geometry }),
                appearance: new Cesium.EllipsoidSurfaceAppearance({
                    material: polygonMaterial.current,
                    translucent: true,
                    aboveGround: true,
                }),
                asynchronous: false,
            })
        );
    };
    const points = useRef<Cesium.Cartesian3[]>([]);
    const polygonRef = useRef<Cesium.GroundPrimitive | null>(null);
    const polygonMaterial = useRef<Cesium.Material | null>(null);
    const drawStatus = useRef(false);
    const maskPoints = useRef<[number, number][]>([]);

    useEffect(() => {
        if (!viewer) return;
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((evt: { position: Cesium.Cartesian2 }) => {
            let pos: Cesium.Cartesian3 | undefined = viewer.scene.pickPosition(evt.position);
            if (!pos) {
                const ray = viewer.camera.getPickRay(evt.position);
                if (ray) {
                    pos = viewer.scene.globe.pick(ray, viewer.scene);
                }
            }
            if (
                !pos ||
                !Number.isFinite(pos.x) ||
                !Number.isFinite(pos.y) ||
                !Number.isFinite(pos.z)
            )
                return;

            const carto = Cesium.Cartographic.fromCartesian(pos);
            if (!Number.isFinite(carto.longitude) || !Number.isFinite(carto.latitude)) return;

            const lat = Cesium.Math.toDegrees(carto.latitude);
            const lon = Cesium.Math.toDegrees(carto.longitude);
            console.log([lon, lat]);
            if (!drawStatus.current) return;

            const point = Cesium.Cartesian3.fromDegrees(lon, lat);
            if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z))
                return;

            points.current.push(point);
            maskPoints.current.push([lon, lat]);
            createOrUpdatePolygon();
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        handler.setInputAction((evt: { position: Cesium.Cartesian2 }) => {
            const pos = viewer.scene.pickPosition(evt.position);
            if (!pos) return;
            const carto = Cesium.Cartographic.fromCartesian(pos);
            const lat = Cesium.Math.toDegrees(carto.latitude);
            const lon = Cesium.Math.toDegrees(carto.longitude);
            console.log([lon, lat]);
            if (!drawStatus.current) return;
            drawStatus.current = false;
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);

        return () => handler.destroy();
    }, [viewer]);

    useEffect(() => {
        if (!viewer) return;
        (async () => {
            const tileset = await Cesium.Cesium3DTileset.fromUrl('/public/3dtitles/tileset.json', {
                skipLevelOfDetail: false,
                dynamicScreenSpaceError: false,
                maximumScreenSpaceError: 4,
            });
            viewer.scene.primitives.add(tileset);
            viewer.zoomTo(tileset);
        })();
    }, [viewer]);

    return (
        <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 1000 }}>
            <button onClick={renderMultiStaticLayerFrame}>下一帧</button>
            <button
                onClick={() => {
                    console.log(maskPoints.current);
                    staticLayer.current[0]?.setMaskPolygon(maskPoints.current);
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
            <button onClick={() => (drawStatus.current = true)}>创建多边形</button>
        </div>
    );
}
