import React, { useCallback, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { useEffect } from 'react';
import { GridDataReader } from '../tools/radarLayer';

type GridResult = {
    header: {
        xStart: number;
        xEnd: number;
        yStart: number;
        yEnd: number;
        xDelta?: number;
        yDelta?: number;
        xSize?: number;
        ySize?: number;
    };
    data: number[][][][];
};

type GridFrame = {
    header: GridResult['header'];
    grid: number[][];
};

class DynamicRasterLayer {
    private viewer: Cesium.Viewer;
    private primitive: Cesium.Primitive | Cesium.GroundPrimitive | null;
    private material: Cesium.Material | null;
    private textureCanvas: HTMLCanvasElement;
    private textureCtx: CanvasRenderingContext2D;
    private gridWidth: number;
    private gridHeight: number;
    private boundsKey: string;
    private clampToGround: boolean;

    constructor(viewer: Cesium.Viewer, clampToGround?: boolean) {
        this.viewer = viewer;
        this.primitive = null;
        this.material = null;
        this.textureCanvas = document.createElement('canvas');
        const ctx = this.textureCanvas.getContext('2d');
        if (!ctx) {
            throw new Error('无法创建纹理画布上下文');
        }
        this.textureCtx = ctx;
        this.gridWidth = 1;
        this.gridHeight = 1;
        this.boundsKey = '';
        this.clampToGround = clampToGround ?? false;
    }

    public update(frame: GridFrame) {
        const { header, grid } = frame;
        if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0]) || !grid[0].length) {
            return;
        }
        const width = grid[0].length;
        const height = grid.length;
        if (width <= 0 || height <= 0) {
            return;
        }

        if (this.textureCanvas.width !== width || this.textureCanvas.height !== height) {
            this.textureCanvas.width = width;
            this.textureCanvas.height = height;
        }
        const textureData = this.packGridToTexture(grid, width, height);
        this.textureCtx.putImageData(textureData, 0, 0);
        this.gridWidth = width;
        this.gridHeight = height;

        const rectangle = this.buildRectangle(header, width, height);
        const nextBoundsKey = `${header.xStart}_${header.yStart}_${header.xEnd}_${header.yEnd}`;

        if (!this.primitive || !this.material || this.boundsKey !== nextBoundsKey) {
            this.rebuildPrimitive(rectangle, this.textureCanvas, nextBoundsKey);
        } else {
            const uniforms = this.material.uniforms as {
                u_dataTex: HTMLCanvasElement;
                u_gridSize: Cesium.Cartesian2;
            };
            uniforms.u_dataTex = this.textureCanvas;
            uniforms.u_gridSize = new Cesium.Cartesian2(this.gridWidth, this.gridHeight);
        }

        this.viewer.scene.requestRender();
    }

    public destroy() {
        if (this.primitive) {
            this.viewer.scene.primitives.remove(this.primitive);
            if (!this.primitive.isDestroyed()) {
                this.primitive.destroy();
            }
            this.primitive = null;
        }
        this.material = null;
        this.boundsKey = '';
    }

    private rebuildPrimitive(
        rectangle: Cesium.Rectangle,
        texture: HTMLCanvasElement,
        boundsKey: string
    ) {
        if (this.primitive) {
            this.viewer.scene.primitives.remove(this.primitive);
            if (!this.primitive.isDestroyed()) {
                this.primitive.destroy();
            }
            this.primitive = null;
        }
        this.boundsKey = boundsKey;
        this.material = new Cesium.Material({
            fabric: {
                uniforms: {
                    u_dataTex: texture,
                    u_gridSize: new Cesium.Cartesian2(this.gridWidth, this.gridHeight),
                },
                source: `
czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);
    // 栅格最近邻采样：保证每个像元是规整色块，不做线性插值
    vec2 gridSize = max(u_gridSize, vec2(1.0));
    vec2 uv = floor(clamp(materialInput.st, 0.0, 0.999999) * gridSize);
    uv = (uv + 0.5) / gridSize;
    vec4 tex = texture(u_dataTex, uv);
    if (tex.a < 0.01) {
        material.alpha = 0.0;
        return material;
    }

    // RG 双通道解码（16bit），提高阈值分段精度
    float encoded = tex.r * 255.0 * 256.0 + tex.g * 255.0;
    float value = (encoded / 65535.0) * 80.0;
    vec3 color = vec3(174.0/255.0, 148.0/255.0, 237.0/255.0);
    if (value <= 10.0) {
        color = vec3(62.0/255.0, 160.0/255.0, 239.0/255.0);
    } else if (value <= 15.0) {
        color = vec3(62.0/255.0, 160.0/255.0, 239.0/255.0);
    } else if (value <= 20.0) {
        color = vec3(108.0/255.0, 225.0/255.0, 238.0/255.0);
    } else if (value <= 25.0) {
        color = vec3(96.0/255.0, 214.0/255.0, 63.0/255.0);
    } else if (value <= 30.0) {
        color = vec3(70.0/255.0, 137.0/255.0, 37.0/255.0);
    } else if (value <= 35.0) {
        color = vec3(252.0/255.0, 251.0/255.0, 74.0/255.0);
    } else if (value <= 40.0) {
        color = vec3(223.0/255.0, 195.0/255.0, 73.0/255.0);
    } else if (value <= 45.0) {
        color = vec3(239.0/255.0, 147.0/255.0, 47.0/255.0);
    } else if (value <= 50.0) {
        color = vec3(231.0/255.0, 53.0/255.0, 31.0/255.0);
    } else if (value <= 55.0) {
        color = vec3(184.0/255.0, 43.0/255.0, 41.0/255.0);
    } else if (value <= 60.0) {
        color = vec3(183.0/255.0, 36.0/255.0, 28.0/255.0);
    } else if (value <= 65.0) {
        color = vec3(236.0/255.0, 62.0/255.0, 237.0/255.0);
    } else if (value <= 70.0) {
        color = vec3(132.0/255.0, 39.0/255.0, 179.0/255.0);
    }
    material.diffuse = color;
    material.alpha = tex.a;
    return material;
}
                `,
            },
            translucent: true,
        });

        const geometry = new Cesium.RectangleGeometry({
            rectangle,
            vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
        });
        const instance = new Cesium.GeometryInstance({
            geometry,
        });
        if (this.clampToGround) {
            this.primitive = new Cesium.GroundPrimitive({
                geometryInstances: instance,
                appearance: new Cesium.MaterialAppearance({
                    material: this.material,
                    translucent: true,
                    closed: false,
                    faceForward: true,
                }),
                classificationType: Cesium.ClassificationType.BOTH,
                asynchronous: false,
            });
        } else {
            this.primitive = new Cesium.Primitive({
                geometryInstances: instance,
                appearance: new Cesium.MaterialAppearance({
                    material: this.material,
                    translucent: true,
                    closed: false,
                    faceForward: true,
                }),
                asynchronous: false,
            });
        }
        this.viewer.scene.primitives.add(this.primitive);
    }

    private packGridToTexture(grid: number[][], width: number, height: number) {
        const packed = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const value = grid[y][x];
                const idx = (y * width + x) * 4;
                if (!Number.isFinite(value)) {
                    packed[idx] = 0;
                    packed[idx + 1] = 0;
                    packed[idx + 2] = 0;
                    packed[idx + 3] = 0;
                    continue;
                }
                const normalized = Math.max(0, Math.min(1, value / 80));
                const encoded = Math.round(normalized * 65535);
                packed[idx] = (encoded >> 8) & 255;
                packed[idx + 1] = encoded & 255;
                packed[idx + 2] = 0;
                packed[idx + 3] = 255;
            }
        }
        return new ImageData(packed, width, height);
    }

    private buildRectangle(
        header: GridResult['header'],
        width: number,
        height: number
    ): Cesium.Rectangle {
        const { xStart, yStart, xEnd, yEnd, xDelta, yDelta, xSize, ySize } = header;
        const gridWidth = xSize ?? width;
        const gridHeight = ySize ?? height;

        const hasDelta = Number.isFinite(xDelta) && Number.isFinite(yDelta);
        if (hasDelta) {
            const xStop = xStart + (xDelta as number) * gridWidth;
            const yStop = yStart + (yDelta as number) * gridHeight;
            return Cesium.Rectangle.fromDegrees(
                Math.min(xStart, xStop),
                Math.min(yStart, yStop),
                Math.max(xStart, xStop),
                Math.max(yStart, yStop)
            );
        }

        return Cesium.Rectangle.fromDegrees(
            Math.min(xStart, xEnd),
            Math.min(yStart, yEnd),
            Math.max(xStart, xEnd),
            Math.max(yStart, yEnd)
        );
    }
}

export default function Voxel({ viewer }: { viewer: Cesium.Viewer }) {
    const baseUrl = 'http://222.74.18.86:7085/fxtraincold/';
    const MAX_CACHE_SIZE = 4;

    const multiLayerTestURL = useRef([
        '/public/resources/82DA3ED6762D4E9AB594EDF9D6359461202602260030_simulated_1.bin.zip',
    ]).current;
    // 仅保留多层zip测试图层，其他图层暂时停用
    const layerUrlGroups = useRef([multiLayerTestURL]).current;
    const rasterLayersRef = useRef<DynamicRasterLayer[]>([]);
    const frameCacheRef = useRef(new Map<string, Promise<GridResult | null>>());
    const [layerProgressText, setLayerProgressText] = useState('');
    const [isPlaying, setIsPlaying] = useState(true);
    const isRenderingRef = useRef(false);
    const isCameraMovingRef = useRef(false);
    const layerFrameIndexesRef = useRef<number[]>([]);

    const loadGridResult = useCallback(
        (url: string) => {
            const cache = frameCacheRef.current;
            const cached = cache.get(url);
            if (cached) {
                return cached;
            }
            const task = (async () => {
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
                    const parsed = (await reader.readCompressedGridData(
                        await res.blob()
                    )) as GridResult;
                    return parsed;
                } catch (error) {
                    return null;
                }
            })();

            cache.set(url, task);
            if (cache.size > MAX_CACHE_SIZE) {
                const firstKey = cache.keys().next().value;
                if (firstKey) {
                    frameCacheRef.current = new Map(
                        Array.from(cache.entries()).filter(([key]) => {
                            return key !== firstKey;
                        })
                    );
                }
            }
            return task;
        },
        [MAX_CACHE_SIZE]
    );

    const selectFrame = (
        result: GridResult,
        cursor: number,
        singleUrlMode: boolean
    ): GridFrame | null => {
        const times = result.data?.length ?? 0;
        const levels = result.data?.[0]?.length ?? 0;
        if (!times || !levels) {
            return null;
        }

        let timeIndex = 0;
        let levelIndex = 0;
        if (singleUrlMode) {
            const total = times * levels;
            const frameIndex = total > 0 ? cursor % total : 0;
            timeIndex = Math.floor(frameIndex / levels);
            levelIndex = frameIndex % levels;
        }

        const grid = result.data?.[timeIndex]?.[levelIndex];
        if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0]) || !grid[0].length) {
            return null;
        }

        return {
            header: result.header,
            grid,
        };
    };

    const renderFrame = useCallback(async () => {
        if (!layerUrlGroups.length || !rasterLayersRef.current.length) {
            return false;
        }
        if (isCameraMovingRef.current) {
            return false;
        }
        if (isRenderingRef.current) {
            return false;
        }

        const renderableLayerIndexes = layerUrlGroups
            .map((group, index) => {
                return group.length > 0 ? index : -1;
            })
            .filter((index) => {
                return index >= 0;
            });
        if (!renderableLayerIndexes.length) {
            return false;
        }

        isRenderingRef.current = true;
        try {
            await Promise.all(
                renderableLayerIndexes.map(async (layerIdx) => {
                    const layerData = layerUrlGroups[layerIdx];
                    const layer = rasterLayersRef.current[layerIdx];
                    if (!layerData.length || !layer) {
                        return;
                    }
                    const currentFrame = layerFrameIndexesRef.current[layerIdx] ?? 0;
                    const isSingleUrlLayer = layerData.length === 1;
                    const layerFrameIndex = isSingleUrlLayer ? 0 : currentFrame % layerData.length;
                    const sourcePath = layerData[layerFrameIndex];
                    const url =
                        sourcePath.startsWith('http://') ||
                        sourcePath.startsWith('https://') ||
                        sourcePath.startsWith('/')
                            ? sourcePath
                            : baseUrl + sourcePath;
                    const result = await loadGridResult(url);
                    console.log('wkk', result);
                    if (!result) {
                        return;
                    }
                    const frame = selectFrame(result, currentFrame, isSingleUrlLayer);
                    if (!frame) {
                        return;
                    }
                    layer.update(frame);
                    if (isSingleUrlLayer) {
                        const times = result.data?.length ?? 0;
                        const levels = result.data?.[0]?.length ?? 0;
                        const totalFrames = Math.max(1, times * levels);
                        layerFrameIndexesRef.current[layerIdx] = (currentFrame + 1) % totalFrames;
                    } else {
                        layerFrameIndexesRef.current[layerIdx] =
                            (layerFrameIndex + 1) % layerData.length;
                    }
                })
            );
            setLayerProgressText(
                layerFrameIndexesRef.current
                    .map((value, idx) => {
                        return `L${idx + 1}:${value}`;
                    })
                    .join(' | ')
            );
            return true;
        } finally {
            isRenderingRef.current = false;
        }
    }, [baseUrl, layerUrlGroups, loadGridResult]);

    useEffect(() => {
        if (viewer) {
            const cacheRef = frameCacheRef;
            const timeoutId = setTimeout(() => {
                rasterLayersRef.current = layerUrlGroups.map(() => {
                    return new DynamicRasterLayer(viewer, true);
                });
                layerFrameIndexesRef.current = layerUrlGroups.map(() => {
                    return 0;
                });
                setLayerProgressText(
                    layerFrameIndexesRef.current
                        .map((value, idx) => {
                            return `L${idx + 1}:${value}`;
                        })
                        .join(' | ')
                );
                renderFrame().then(
                    () => {
                        return;
                    },
                    () => {
                        return;
                    }
                );
            }, 500);

            return () => {
                clearTimeout(timeoutId);
                rasterLayersRef.current.forEach((layer) => {
                    layer.destroy();
                });
                rasterLayersRef.current = [];
                cacheRef.current.clear();
                isRenderingRef.current = false;
                layerFrameIndexesRef.current = [];
            };
        }
    }, [layerUrlGroups, renderFrame, viewer]);

    useEffect(() => {
        if (!viewer) {
            return;
        }
        const handleMoveStart = () => {
            isCameraMovingRef.current = true;
        };
        const handleMoveEnd = () => {
            isCameraMovingRef.current = false;
        };

        viewer.camera.moveStart.addEventListener(handleMoveStart);
        viewer.camera.moveEnd.addEventListener(handleMoveEnd);

        return () => {
            viewer.camera.moveStart.removeEventListener(handleMoveStart);
            viewer.camera.moveEnd.removeEventListener(handleMoveEnd);
            isCameraMovingRef.current = false;
        };
    }, [viewer]);

    useEffect(() => {
        if (!isPlaying) {
            return;
        }

        const maxLength = Math.max(
            ...layerUrlGroups.map((group) => {
                return group.length;
            })
        );
        if (!maxLength) {
            return;
        }

        let timerId = 0;
        let stopped = false;
        const frameIntervalMs = 1500;

        const tick = async () => {
            if (stopped) {
                return;
            }

            const rendered = await renderFrame();
            if (stopped) {
                return;
            }

            timerId = window.setTimeout(tick, rendered ? frameIntervalMs : 800);
        };
        timerId = window.setTimeout(tick, frameIntervalMs);

        return () => {
            stopped = true;
            window.clearTimeout(timerId);
        };
    }, [isPlaying, layerUrlGroups, renderFrame]);

    return (
        <div>
            <button
                onClick={() => {
                    setIsPlaying((prev) => {
                        return !prev;
                    });
                }}
                style={{ position: 'absolute', top: 60, left: 0, zIndex: 10 }}
            >
                {isPlaying ? '暂停' : '自动播放'}
            </button>
            <div
                id="pickedCoordinate"
                style={{ position: 'absolute', top: 100, left: 0, background: 'white' }}
            >
                图层进度: {layerProgressText}
            </div>
        </div>
    );
}
