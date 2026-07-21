import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { AnimatedRasterLayer } from '@src/tools/radarLayer/AnimatedRasterLayer';

type DatGridResult = {
    header: {
        xSize: number;
        ySize: number;
        xDelta: number;
        yDelta: number;
        xStart: number;
        xEnd: number;
        yStart: number;
        yEnd: number;
    };
    grid: number[][];
    rowIndexGrid: number[][];
    columnIndexGrid: number[][];
};

export default function CloseToTheGround({ viewer }: { viewer: Cesium.Viewer }) {
    const staticLayer = useRef<AnimatedRasterLayer[]>([]);
    const datResultRef = useRef<DatGridResult | null>(null);
    const wmsLayerRef = useRef<Cesium.ImageryLayer | null>(null);
    const [opacity, setOpacity] = useState(0.5);

    useEffect(() => {
        readBinaryData();
    }, []);

    const readBinaryData = async () => {
        const url = '/public/resources/slope/639198090435133039.dat';
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/octet-stream',
            },
        });
        if (!res.ok) {
            return;
        }
        const blob = await res.blob();

        const reader = new FileReader();
        reader.onload = (event) => {
            const arrayBuffer = event.target?.result;
            if (!(arrayBuffer instanceof ArrayBuffer)) {
                return;
            }

            const littleEndian = true;
            const view = new DataView(arrayBuffer);
            let offset = 0;

            const readUint16 = () => {
                const value = view.getUint16(offset, littleEndian);
                offset += 2;
                return value;
            };
            const readFloat64 = () => {
                const value = view.getFloat64(offset, littleEndian);
                offset += 8;
                return value;
            };
            const readFloat32 = () => {
                const value = view.getFloat32(offset, littleEndian);
                offset += 4;
                return value;
            };

            // 头信息
            const rowCount = readUint16();
            const columnCount = readUint16();
            let minLongitude = readFloat64();
            let maxLatitude = readFloat64();
            const longitudeResolution = readFloat64();
            const latitudeResolution = readFloat64();

            const deformationGrid: number[][] = Array.from({ length: rowCount }, () => {
                return new Array<number>(columnCount);
            });
            const rowIndexGrid: number[][] = Array.from({ length: rowCount }, () => {
                return new Array<number>(columnCount);
            });
            const columnIndexGrid: number[][] = Array.from({ length: rowCount }, () => {
                return new Array<number>(columnCount);
            });

            // 按列存储：for col -> for row
            for (let col = 0; col < columnCount; col++) {
                for (let row = 0; row < rowCount; row++) {
                    deformationGrid[row][col] = readFloat32();
                }
            }
            for (let col = 0; col < columnCount; col++) {
                for (let row = 0; row < rowCount; row++) {
                    rowIndexGrid[row][col] = readUint16();
                }
            }
            for (let col = 0; col < columnCount; col++) {
                for (let row = 0; row < rowCount; row++) {
                    columnIndexGrid[row][col] = readUint16();
                }
            }

            // minLongitude = 114.381735;
            // maxLatitude = 44.097466;
            const result: DatGridResult = {
                header: {
                    xSize: columnCount,
                    ySize: rowCount,
                    xDelta: longitudeResolution,
                    yDelta: -latitudeResolution,
                    xStart: minLongitude,
                    xEnd: minLongitude + (columnCount - 1) * longitudeResolution,
                    yStart: maxLatitude,
                    yEnd: maxLatitude - (rowCount - 1) * latitudeResolution,
                },
                grid: deformationGrid,
                rowIndexGrid,
                columnIndexGrid,
            };
            datResultRef.current = result;
            console.log('DAT', result);
        };
        reader.readAsArrayBuffer(blob);
    };

    const renderFrame = () => {
        leftClick();
        const datResult = datResultRef.current;
        if (!datResult) {
            console.warn('DAT尚未解析完成');
            return;
        }
        if (!staticLayer.current.length) {
            staticLayer.current = [
                new AnimatedRasterLayer(viewer as Cesium.Viewer, {
                    clampToGround: true,
                    gradientEnabled: false,
                    colorRamp: [
                        { maxValue: 1, color: [0, 255, 17] },
                        { maxValue: 2, color: [0, 102, 255] },
                        { maxValue: 3, color: [255, 255, 0] },
                        { maxValue: 4, color: [255, 153, 0] },
                        { maxValue: 1000, color: [255, 0, 0] },
                    ],
                    interactionOptions: {
                        enabled: true,
                        onCellClick: (cell) => {
                            const { value, rowIndex, columnIndex } = cell;
                            console.log('点击格点:', {
                                value,
                                rowIndex,
                                columnIndex,
                                longitude: cell.longitude,
                                latitude: cell.latitude,
                            });
                        },
                    },
                }),
            ];
        }

        staticLayer.current[0]?.updateHardEdge({
            header: datResult.header,
            grid: datResult.grid,
            rowIndexGrid: datResult.rowIndexGrid,
            columnIndexGrid: datResult.columnIndexGrid,
            heightMeters: 0,
            opacity: 0.56,
        });
    };

    const renderWms = () => {
        if (wmsLayerRef.current) {
            return;
        }
        const provider = new Cesium.WebMapServiceImageryProvider({
            url: 'http://10.1.1.60:8081/geoserver/radarData_2026_07_21_15/wms',
            layers: 'radarData_2026_07_21_15:639202431961736175',
            tileWidth: 512,
            tileHeight: 512,
            parameters: {
                service: 'WMS',
                format: 'image/png',
                srs: 'EPSG:4326',
                transparent: true,
            },
        });
        const layer = new Cesium.ImageryLayer(provider);
        viewer.imageryLayers.add(layer);
        wmsLayerRef.current = layer;
    };

    const leftClick = () => {
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
        handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
            const picked = viewer.scene.pickPosition(event.position);
            if (picked) {
                const cartesian = viewer.scene.globe.ellipsoid.cartesianToCartographic(picked);
                const longitude = Cesium.Math.toDegrees(cartesian.longitude);
                const latitude = Cesium.Math.toDegrees(cartesian.latitude);
                console.log('picked', longitude, latitude);
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    };

    return (
        <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 1000 }}>
            <button
                onClick={() => {
                    renderFrame();
                }}
            >
                渲染DAT
            </button>
            <button
                onClick={() => {
                    renderWms();
                }}
            >
                渲染WMS
            </button>
            <label style={{ color: '#fff', marginLeft: 8 }}>
                透明度
                <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={opacity}
                    onChange={(e) => {
                        const v = Number(e.target.value);
                        setOpacity(v);
                        const layer = wmsLayerRef.current;
                        if (layer) {
                            layer.alpha = v;
                        }
                    }}
                />
                <span style={{ display: 'inline-block', width: 40, textAlign: 'right' }}>
                    {opacity.toFixed(2)}
                </span>
            </label>
        </div>
    );
}
