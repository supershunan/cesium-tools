import * as Cesium from 'cesium';

export type GridHeader = {
    xStart: number;
    xEnd: number;
    yStart: number;
    yEnd: number;
    xDelta?: number;
    yDelta?: number;
    xSize?: number;
    ySize?: number;
    levelList?: Array<string | number>;
};

export type GridFrame = {
    header: GridHeader;
    grid: number[][];
    heightMeters?: number;
    opacity?: number;
};

export type GridCellInfo = {
    xIndex: number;
    yIndex: number;
    value: number;
    longitude: number;
    latitude: number;
};

export type DynamicRasterInteractionOptions = {
    enabled?: boolean;
    hoverEnabled?: boolean;
    hoverColor?: Cesium.Color;
    hoverAlpha?: number;
    onCellHover?: (cell: GridCellInfo | null) => void;
    onCellClick?: (cell: GridCellInfo) => void;
};

export type RasterColorStop = {
    maxValue: number;
    color: [number, number, number];
};

export type DynamicRasterLayerOptions = {
    clampToGround?: boolean;
    colorRamp?: RasterColorStop[];
    interactionOptions?: DynamicRasterInteractionOptions;
};

const DEFAULT_COLOR_STOPS: RasterColorStop[] = [
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
];

export class DynamicRasterLayer {
    private viewer: Cesium.Viewer;
    private primitive: Cesium.Primitive | Cesium.GroundPrimitive | null;
    private imageryLayer: Cesium.ImageryLayer | null;
    private material: Cesium.Material | null;
    private textureCanvas: HTMLCanvasElement;
    private textureCtx: CanvasRenderingContext2D;
    private textureUniformCanvas: HTMLCanvasElement;
    private gridWidth: number;
    private gridHeight: number;
    private boundsKey: string;
    private clampToGround: boolean;
    private currentHeightMeters: number;
    private currentOpacity: number;
    private imageryObjectUrl: string | null;
    private imageryUpdateToken: number;
    private eventHandler: Cesium.ScreenSpaceEventHandler | null;
    private interactionOptions: Required<
        Pick<DynamicRasterInteractionOptions, 'enabled' | 'hoverEnabled' | 'hoverAlpha'>
    > &
        Pick<DynamicRasterInteractionOptions, 'hoverColor' | 'onCellHover' | 'onCellClick'>;
    private hoverEntity: Cesium.Entity | null;
    private currentRectangle: Cesium.Rectangle | null;
    private currentHeader: GridHeader | null;
    private currentGrid: number[][] | null;
    private hoveredCell: { x: number; y: number } | null;
    private colorStops: RasterColorStop[];

    constructor(viewer: Cesium.Viewer, options?: boolean | DynamicRasterLayerOptions) {
        const normalizedOptions: DynamicRasterLayerOptions =
            typeof options === 'boolean' ? { clampToGround: options } : options ?? {};
        this.viewer = viewer;
        this.primitive = null;
        this.imageryLayer = null;
        this.material = null;
        this.textureCanvas = document.createElement('canvas');
        const ctx = this.textureCanvas.getContext('2d');
        if (!ctx) {
            throw new Error('无法创建纹理画布上下文');
        }
        this.textureCtx = ctx;
        this.textureUniformCanvas = document.createElement('canvas');
        this.gridWidth = 1;
        this.gridHeight = 1;
        this.boundsKey = '';
        this.clampToGround = normalizedOptions.clampToGround ?? false;
        this.currentHeightMeters = 0;
        this.currentOpacity = 1;
        this.imageryObjectUrl = null;
        this.imageryUpdateToken = 0;
        this.eventHandler = null;
        this.interactionOptions = {
            enabled: false,
            hoverEnabled: true,
            hoverColor: Cesium.Color.BLACK,
            hoverAlpha: 0.35,
            onCellHover: undefined,
            onCellClick: undefined,
        };
        this.hoverEntity = null;
        this.currentRectangle = null;
        this.currentHeader = null;
        this.currentGrid = null;
        this.hoveredCell = null;
        this.colorStops = DEFAULT_COLOR_STOPS.map((stop) => {
            return {
                maxValue: stop.maxValue,
                color: [...stop.color] as [number, number, number],
            };
        });

        if (normalizedOptions.colorRamp) {
            this.setColorRamp(normalizedOptions.colorRamp);
        }
        if (normalizedOptions.interactionOptions) {
            this.setInteractionOptions(normalizedOptions.interactionOptions);
        }
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
        this.gridWidth = width;
        this.gridHeight = height;
        this.currentHeightMeters = frame.heightMeters ?? 0;
        this.currentOpacity = frame.opacity ?? 1;

        const rectangle = this.buildRectangle(header, width, height);
        this.currentRectangle = rectangle;
        this.currentHeader = header;
        this.currentGrid = grid;
        const nextBoundsKey = `${header.xStart}_${header.yStart}_${header.xEnd}_${header.yEnd}_${this.currentHeightMeters}_${this.currentOpacity}`;

        if (this.clampToGround) {
            const imageryData = this.packGridToImagery(grid, width, height);
            this.textureCtx.putImageData(imageryData, 0, 0);
            const imageryCanvas = this.buildUniformCanvas(width, height);
            this.rebuildImageryLayer(rectangle, imageryCanvas, nextBoundsKey);
            this.viewer.scene.requestRender();
            return;
        }

        const textureData = this.packGridToTexture(grid, width, height);
        this.textureCtx.putImageData(textureData, 0, 0);
        const textureForUniform = this.buildUniformCanvas(width, height);

        if (!this.primitive || !this.material || this.boundsKey !== nextBoundsKey) {
            this.rebuildPrimitive(rectangle, textureForUniform, nextBoundsKey);
        } else {
            const uniforms = this.material.uniforms as {
                u_dataTex: HTMLCanvasElement;
                u_gridSize: Cesium.Cartesian2;
                u_layerAlpha: number;
            };
            uniforms.u_dataTex = textureForUniform;
            uniforms.u_gridSize = new Cesium.Cartesian2(this.gridWidth, this.gridHeight);
            uniforms.u_layerAlpha = this.currentOpacity;
        }

        this.updateHoverEntityFromCurrentCell();
        this.viewer.scene.requestRender();
    }

    public setInteractionOptions(options: DynamicRasterInteractionOptions) {
        this.interactionOptions = {
            ...this.interactionOptions,
            ...options,
        };
        this.interactionOptions.hoverAlpha = Math.max(
            0,
            Math.min(1, this.interactionOptions.hoverAlpha)
        );

        if (!this.interactionOptions.enabled) {
            this.destroyInteractionHandler();
            this.clearHover();
            return;
        }

        if (!this.eventHandler) {
            this.eventHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
            this.eventHandler.setInputAction(
                (movement: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
                    this.handleMouseMove(movement.endPosition);
                },
                Cesium.ScreenSpaceEventType.MOUSE_MOVE
            );
            this.eventHandler.setInputAction(
                (movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
                    this.handleClick(movement.position);
                },
                Cesium.ScreenSpaceEventType.LEFT_CLICK
            );
        }
    }

    public setColorRamp(stops?: RasterColorStop[]) {
        const normalized = this.normalizeColorStops(stops);
        this.colorStops = normalized.length
            ? normalized
            : DEFAULT_COLOR_STOPS.map((stop) => {
                  return {
                      maxValue: stop.maxValue,
                      color: [...stop.color] as [number, number, number],
                  };
              });

        if (this.currentHeader && this.currentGrid) {
            // 强制重建非贴地图层 material，确保 shader 立即使用新色带
            if (!this.clampToGround) {
                this.boundsKey = '';
            }
            this.update({
                header: this.currentHeader,
                grid: this.currentGrid,
                heightMeters: this.currentHeightMeters,
                opacity: this.currentOpacity,
            });
        }
    }

    public pickValue(longitude: number, latitude: number): number | null {
        const cell = this.resolveCellFromLonLat(longitude, latitude);
        return cell?.value ?? null;
    }

    public destroy() {
        this.destroyInteractionHandler();
        this.clearHover();
        this.imageryUpdateToken += 1;
        if (this.imageryLayer) {
            this.viewer.imageryLayers.remove(this.imageryLayer, true);
            this.imageryLayer = null;
        }
        if (this.imageryObjectUrl) {
            URL.revokeObjectURL(this.imageryObjectUrl);
            this.imageryObjectUrl = null;
        }
        if (this.primitive) {
            this.viewer.scene.primitives.remove(this.primitive);
            if (!this.primitive.isDestroyed()) {
                this.primitive.destroy();
            }
            this.primitive = null;
        }
        this.material = null;
        this.boundsKey = '';
        this.currentRectangle = null;
        this.currentHeader = null;
        this.currentGrid = null;
    }

    private rebuildImageryLayer(
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
        const token = ++this.imageryUpdateToken;
        texture.toBlob((blob) => {
            if (!blob || token !== this.imageryUpdateToken) {
                return;
            }
            const nextObjectUrl = URL.createObjectURL(blob);
            const tileWidth = Math.max(1, texture.width || this.gridWidth || 1);
            const tileHeight = Math.max(1, texture.height || this.gridHeight || 1);
            const provider = new Cesium.SingleTileImageryProvider({
                url: nextObjectUrl,
                rectangle,
                tileWidth,
                tileHeight,
            });
            const nextLayer = new Cesium.ImageryLayer(provider, {
                minificationFilter: Cesium.TextureMinificationFilter.NEAREST,
                magnificationFilter: Cesium.TextureMagnificationFilter.NEAREST,
            });
            this.viewer.imageryLayers.add(nextLayer);
            nextLayer.alpha = this.currentOpacity;

            if (token !== this.imageryUpdateToken) {
                this.viewer.imageryLayers.remove(nextLayer, true);
                URL.revokeObjectURL(nextObjectUrl);
                return;
            }

            if (this.imageryLayer) {
                this.viewer.imageryLayers.remove(this.imageryLayer, true);
            }
            if (this.imageryObjectUrl) {
                URL.revokeObjectURL(this.imageryObjectUrl);
            }

            this.imageryLayer = nextLayer;
            this.imageryObjectUrl = nextObjectUrl;
            this.boundsKey = boundsKey;
            this.viewer.scene.requestRender();
        }, 'image/png');
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
                    u_layerAlpha: this.currentOpacity,
                },
                source: `
czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);
    vec2 gridSize = max(u_gridSize, vec2(1.0));
    vec2 uv = floor(clamp(materialInput.st, 0.0, 0.999999) * gridSize);
    uv = (uv + 0.5) / gridSize;
    vec4 tex = texture(u_dataTex, uv);
    float encoded = floor(tex.r * 255.0 + 0.5) * 256.0 + floor(tex.g * 255.0 + 0.5);
    if (encoded >= 65535.0) {
        material.alpha = 0.0;
        return material;
    }
    float value = (encoded / 65534.0) * 80.0;
    ${this.buildColorRampGlsl()}
    material.diffuse = color;
    material.alpha = clamp(u_layerAlpha, 0.0, 1.0);
    return material;
}
                `,
            },
            translucent: true,
        });

        const geometry = new Cesium.RectangleGeometry({
            rectangle,
            height: this.currentHeightMeters,
            vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
        });
        const instance = new Cesium.GeometryInstance({
            geometry,
        });
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
        this.viewer.scene.primitives.add(this.primitive);
    }

    private buildUniformCanvas(width: number, height: number) {
        this.textureUniformCanvas = document.createElement('canvas');
        this.textureUniformCanvas.width = width;
        this.textureUniformCanvas.height = height;
        const uniformCtx = this.textureUniformCanvas.getContext('2d');
        if (uniformCtx) {
            uniformCtx.putImageData(this.textureCtx.getImageData(0, 0, width, height), 0, 0);
        }
        return this.textureUniformCanvas;
    }

    private destroyInteractionHandler() {
        if (!this.eventHandler) {
            return;
        }
        this.eventHandler.destroy();
        this.eventHandler = null;
    }

    private clearHover() {
        this.hoveredCell = null;
        this.interactionOptions.onCellHover?.(null);
        if (this.hoverEntity) {
            this.viewer.entities.remove(this.hoverEntity);
            this.hoverEntity = null;
        }
        this.viewer.scene.requestRender();
    }

    private handleMouseMove(position: Cesium.Cartesian2) {
        if (!this.interactionOptions.enabled) {
            return;
        }
        const cell = this.resolveCellFromWindowPosition(position);
        if (!cell) {
            if (this.hoveredCell) {
                this.clearHover();
            }
            return;
        }

        this.interactionOptions.onCellHover?.(cell);
        if (!this.interactionOptions.hoverEnabled) {
            return;
        }

        const nextCell = { x: cell.xIndex, y: cell.yIndex };
        if (
            this.hoveredCell &&
            this.hoveredCell.x === nextCell.x &&
            this.hoveredCell.y === nextCell.y
        ) {
            return;
        }
        this.hoveredCell = nextCell;
        this.updateHoverEntity(cell.xIndex, cell.yIndex);
    }

    private handleClick(position: Cesium.Cartesian2) {
        if (!this.interactionOptions.enabled || !this.interactionOptions.onCellClick) {
            return;
        }
        const cell = this.resolveCellFromWindowPosition(position);
        if (!cell) {
            return;
        }
        this.interactionOptions.onCellClick(cell);
    }

    private resolveCellFromWindowPosition(position: Cesium.Cartesian2): GridCellInfo | null {
        if (!this.currentRectangle || !this.currentHeader || !this.currentGrid) {
            return null;
        }
        const cartesian = this.pickCartesian(position);
        if (!cartesian) {
            return null;
        }
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const longitude = Cesium.Math.toDegrees(cartographic.longitude);
        const latitude = Cesium.Math.toDegrees(cartographic.latitude);
        return this.resolveCellFromLonLat(longitude, latitude);
    }

    private resolveCellFromLonLat(longitude: number, latitude: number): GridCellInfo | null {
        const resolve = this.resolveGridIndexFromLonLat(longitude, latitude);
        if (!resolve) {
            return null;
        }
        const resolvedCell = this.resolveValueCell(resolve.xIndex, resolve.yIndex);
        if (!resolvedCell) {
            return null;
        }
        const { xIndex, yIndex, value } = resolvedCell;
        return {
            xIndex,
            yIndex,
            value,
            longitude,
            latitude,
        };
    }

    private pickCartesian(position: Cesium.Cartesian2): Cesium.Cartesian3 | null {
        const scene = this.viewer.scene;
        if (this.clampToGround) {
            const ray = this.viewer.camera.getPickRay(position);
            if (ray) {
                const pickedOnGlobe = scene.globe.pick(ray, scene);
                if (pickedOnGlobe) {
                    return pickedOnGlobe;
                }
            }
        }
        return this.viewer.camera.pickEllipsoid(position, scene.globe.ellipsoid) ?? null;
    }

    private resolveGridIndexFromLonLat(
        longitude: number,
        latitude: number
    ): { xIndex: number; yIndex: number } | null {
        if (!this.currentGrid || !this.currentRectangle) {
            return null;
        }

        const width = this.gridWidth;
        const height = this.gridHeight;
        if (width <= 0 || height <= 0) {
            return null;
        }

        const west = Cesium.Math.toDegrees(this.currentRectangle.west);
        const east = Cesium.Math.toDegrees(this.currentRectangle.east);
        const south = Cesium.Math.toDegrees(this.currentRectangle.south);
        const north = Cesium.Math.toDegrees(this.currentRectangle.north);
        const lonRange = east - west;
        const latRange = north - south;
        if (lonRange <= 0 || latRange <= 0) {
            return null;
        }

        const stX = (longitude - west) / lonRange;
        const stY = (latitude - south) / latRange;
        if (
            !Number.isFinite(stX) ||
            !Number.isFinite(stY) ||
            stX < 0 ||
            stX > 1 ||
            stY < 0 ||
            stY > 1
        ) {
            return null;
        }

        const xIndex = this.clampGridIndex(Math.floor(Math.min(stX, 0.999999) * width), width);
        // 贴地图层使用影像坐标（图像第 0 行在北侧），因此 y 轴需要按北->南映射
        const yUnit = this.clampToGround ? 1 - stY : stY;
        const yIndex = this.clampGridIndex(
            Math.floor(Math.min(Math.max(yUnit, 0), 0.999999) * height),
            height
        );
        if (xIndex === null || yIndex === null) {
            return null;
        }
        return { xIndex, yIndex };
    }

    private resolveValueCell(
        xIndex: number,
        yIndex: number
    ): { xIndex: number; yIndex: number; value: number } | null {
        if (!this.currentGrid) {
            return null;
        }
        const direct = this.currentGrid[yIndex]?.[xIndex];
        if (Number.isFinite(direct)) {
            return { xIndex, yIndex, value: direct as number };
        }

        // 边界拾取会存在亚像元误差，命中无效值时尝试 8 邻域兜底
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) {
                    continue;
                }
                const nx = xIndex + dx;
                const ny = yIndex + dy;
                if (nx < 0 || nx >= this.gridWidth || ny < 0 || ny >= this.gridHeight) {
                    continue;
                }
                const candidate = this.currentGrid[ny]?.[nx];
                if (Number.isFinite(candidate)) {
                    return { xIndex: nx, yIndex: ny, value: candidate as number };
                }
            }
        }
        return null;
    }

    private clampGridIndex(index: number, size: number): number | null {
        if (!Number.isFinite(index)) {
            return null;
        }
        if (index < 0 || index >= size) {
            return null;
        }
        return index;
    }

    private updateHoverEntityFromCurrentCell() {
        if (!this.hoveredCell) {
            return;
        }
        this.updateHoverEntity(this.hoveredCell.x, this.hoveredCell.y);
    }

    private updateHoverEntity(xIndex: number, yIndex: number) {
        if (!this.interactionOptions.enabled || !this.interactionOptions.hoverEnabled) {
            return;
        }
        const rectangle = this.buildCellRectangle(xIndex, yIndex);
        if (!rectangle) {
            return;
        }
        const color = (this.interactionOptions.hoverColor ?? Cesium.Color.BLACK).withAlpha(
            this.interactionOptions.hoverAlpha
        );
        if (!this.hoverEntity) {
            const rectangleGraphics: Cesium.RectangleGraphics.ConstructorOptions = {
                coordinates: rectangle,
                material: color,
            };
            if (!this.clampToGround) {
                rectangleGraphics.height = this.currentHeightMeters;
            }
            this.hoverEntity = this.viewer.entities.add({
                rectangle: rectangleGraphics,
            });
        } else if (this.hoverEntity.rectangle) {
            this.hoverEntity.rectangle.coordinates = new Cesium.ConstantProperty(rectangle);
            this.hoverEntity.rectangle.material = new Cesium.ColorMaterialProperty(color);
            if (!this.clampToGround) {
                this.hoverEntity.rectangle.height = new Cesium.ConstantProperty(
                    this.currentHeightMeters
                );
            } else {
                this.hoverEntity.rectangle.height = undefined;
            }
        }
        this.viewer.scene.requestRender();
    }

    private buildCellRectangle(xIndex: number, yIndex: number): Cesium.Rectangle | null {
        const width = this.gridWidth;
        const height = this.gridHeight;
        if (width <= 0 || height <= 0) {
            return null;
        }

        const rectangle = this.currentRectangle;
        if (!rectangle) {
            return null;
        }
        if (xIndex < 0 || xIndex >= width || yIndex < 0 || yIndex >= height) {
            return null;
        }

        const west = Cesium.Math.toDegrees(rectangle.west);
        const east = Cesium.Math.toDegrees(rectangle.east);
        const south = Cesium.Math.toDegrees(rectangle.south);
        const north = Cesium.Math.toDegrees(rectangle.north);
        const lonStep = (east - west) / width;
        const latStep = (north - south) / height;
        if (
            !Number.isFinite(lonStep) ||
            !Number.isFinite(latStep) ||
            lonStep <= 0 ||
            latStep <= 0
        ) {
            return null;
        }

        const cellLonMin = west + lonStep * xIndex;
        const cellLonMax = west + lonStep * (xIndex + 1);
        const cellLatMin = this.clampToGround
            ? north - latStep * (yIndex + 1)
            : south + latStep * yIndex;
        const cellLatMax = this.clampToGround
            ? north - latStep * yIndex
            : south + latStep * (yIndex + 1);
        return Cesium.Rectangle.fromDegrees(cellLonMin, cellLatMin, cellLonMax, cellLatMax);
    }

    private packGridToTexture(grid: number[][], width: number, height: number) {
        const packed = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const value = grid[y][x];
                const idx = (y * width + x) * 4;
                if (!Number.isFinite(value)) {
                    packed[idx] = 255;
                    packed[idx + 1] = 255;
                    packed[idx + 2] = 0;
                    packed[idx + 3] = 255;
                    continue;
                }
                const normalized = Math.max(0, Math.min(1, value / 80));
                const encoded = Math.round(normalized * 65534);
                packed[idx] = (encoded >> 8) & 255;
                packed[idx + 1] = encoded & 255;
                packed[idx + 2] = 0;
                packed[idx + 3] = 255;
            }
        }
        return new ImageData(packed, width, height);
    }

    private packGridToImagery(grid: number[][], width: number, height: number) {
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
                const [r, g, b] = this.getDisplayColor(value);
                packed[idx] = r;
                packed[idx + 1] = g;
                packed[idx + 2] = b;
                packed[idx + 3] = 255;
            }
        }
        return new ImageData(packed, width, height);
    }

    private getDisplayColor(value: number): [number, number, number] {
        for (const stop of this.colorStops) {
            if (value <= stop.maxValue) {
                return stop.color;
            }
        }
        return this.colorStops[this.colorStops.length - 1]?.color ?? [174, 148, 237];
    }

    private normalizeColorStops(stops?: RasterColorStop[]): RasterColorStop[] {
        if (!Array.isArray(stops) || !stops.length) {
            return [];
        }
        const normalized = stops
            .map((stop) => {
                const r = this.clampColor(stop.color?.[0] ?? 0);
                const g = this.clampColor(stop.color?.[1] ?? 0);
                const b = this.clampColor(stop.color?.[2] ?? 0);
                return {
                    maxValue: Number(stop.maxValue),
                    color: [r, g, b] as [number, number, number],
                };
            })
            .filter((stop) => {
                return Number.isFinite(stop.maxValue);
            })
            .sort((a, b) => {
                return a.maxValue - b.maxValue;
            });

        if (!normalized.length) {
            return [];
        }
        const last = normalized[normalized.length - 1];
        if (last.maxValue !== Number.POSITIVE_INFINITY) {
            normalized.push({
                maxValue: Number.POSITIVE_INFINITY,
                color: [...last.color] as [number, number, number],
            });
        }
        return normalized;
    }

    private clampColor(value: number): number {
        if (!Number.isFinite(value)) {
            return 0;
        }
        return Math.max(0, Math.min(255, Math.round(value)));
    }

    private buildColorRampGlsl(): string {
        const safeStops = this.colorStops.length ? this.colorStops : DEFAULT_COLOR_STOPS;
        const fallback = safeStops[safeStops.length - 1].color;
        const lines: string[] = [`vec3 color = ${this.toGlslColor(fallback)};`];
        safeStops.forEach((stop, index) => {
            if (!Number.isFinite(stop.maxValue)) {
                return;
            }
            const keyword = index === 0 ? 'if' : 'else if';
            lines.push(
                `${keyword} (value <= ${this.toGlslNumber(stop.maxValue)}) { color = ${this.toGlslColor(stop.color)}; }`
            );
        });
        return lines.join('\n    ');
    }

    private toGlslColor(color: [number, number, number]): string {
        return `vec3(${this.toGlslNumber(color[0] / 255)}, ${this.toGlslNumber(color[1] / 255)}, ${this.toGlslNumber(color[2] / 255)})`;
    }

    private toGlslNumber(value: number): string {
        if (!Number.isFinite(value)) {
            return '0.0';
        }
        const text = value.toFixed(6).replace(/\.?0+$/, '');
        return text.includes('.') ? text : `${text}.0`;
    }

    private buildRectangle(header: GridHeader, width: number, height: number): Cesium.Rectangle {
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
