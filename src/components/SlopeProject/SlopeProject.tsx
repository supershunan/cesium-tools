import { useEffect, useRef } from 'react';
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
            console.log('view', view);
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
            const minLongitude = readFloat64();
            const maxLatitude = readFloat64();
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

            const result: DatGridResult = {
                header: {
                    xSize: columnCount,
                    ySize: rowCount,
                    xDelta: longitudeResolution,
                    // 行 0 在北（maxLatitude），纬度向南递减
                    yDelta: -latitudeResolution,
                    xStart: minLongitude,
                    xEnd: minLongitude + columnCount * longitudeResolution,
                    yStart: maxLatitude,
                    yEnd: maxLatitude - rowCount * latitudeResolution,
                },
                grid: deformationGrid,
                rowIndexGrid,
                columnIndexGrid,
            };
            datResultRef.current = result;
            console.log('DAT解析完成', result);
        };
        reader.readAsArrayBuffer(blob);
    };

    const renderFrame = () => {
        const datResult = datResultRef.current;
        if (!datResult) {
            console.warn('DAT尚未解析完成');
            return;
        }
        const maxTextureSize = viewer?.scene?.context?.maximumTextureSize ?? 0;
        console.log('maxTextureSize', maxTextureSize);
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
                        { maxValue: 100, color: [255, 0, 0] },
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

    return (
        <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 1000 }}>
            <button
                onClick={() => {
                    renderFrame();
                }}
            >
                渲染DAT
            </button>
        </div>
    );
}
