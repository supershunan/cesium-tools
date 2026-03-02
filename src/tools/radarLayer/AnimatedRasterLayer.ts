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
    timeList?: Array<string | number>;
};

export type AnimatedGridCellInfo = {
    xIndex: number;
    yIndex: number;
    value: number;
    longitude: number;
    latitude: number;
};

export type DynamicRasterInteractionOptions = {
    enabled?: boolean;
    /** 仅为兼容保留，AnimatedRasterLayer 不绘制悬浮高亮 */
    hoverEnabled?: boolean;
    hoverColor?: Cesium.Color;
    hoverAlpha?: number;
    onCellHover?: (cell: AnimatedGridCellInfo | null) => void;
    onCellClick?: (cell: AnimatedGridCellInfo) => void;
};

export type RasterColorStop = {
    maxValue: number;
    color: [number, number, number];
};

export type AnimatedRasterLayerOptions = {
    clampToGround?: boolean;
    colorRamp?: RasterColorStop[];
    interactionOptions?: DynamicRasterInteractionOptions;
};

export type AnimatedGridFrame = {
    header: GridHeader;
    grid: number[][];
    heightMeters?: number;
    opacity?: number;
    skipRequestRender?: boolean;
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

export class AnimatedRasterLayer {
    private viewer: Cesium.Viewer;
    private primitive: Cesium.Primitive | Cesium.GroundPrimitive | null;
    private material: Cesium.Material | null;
    private gridWidth = 1;
    private gridHeight = 1;
    private boundsKey = '';
    private clampToGround: boolean;
    private currentHeightMeters = 0;
    private currentOpacity = 1;
    private colorStops: RasterColorStop[];
    private currentRectangle: Cesium.Rectangle | null = null;
    private currentHeader: GridHeader | null = null;
    private currentGrid: number[][] | null = null;

    private eventHandler: Cesium.ScreenSpaceEventHandler | null = null;
    private interactionOptions: Required<
        Pick<DynamicRasterInteractionOptions, 'enabled' | 'hoverEnabled' | 'hoverAlpha'>
    > &
        Pick<DynamicRasterInteractionOptions, 'hoverColor' | 'onCellHover' | 'onCellClick'>;

    private canvasPool: [HTMLCanvasElement, HTMLCanvasElement];
    private bufferIndex = 0;
    private reusedImageData: ImageData | null = null;

    constructor(viewer: Cesium.Viewer, options?: AnimatedRasterLayerOptions) {
        this.viewer = viewer;
        this.primitive = null;
        this.material = null;
        this.clampToGround = options?.clampToGround ?? false;
        this.colorStops = this.normalizeColorStops(options?.colorRamp ?? DEFAULT_COLOR_STOPS);
        this.interactionOptions = {
            enabled: false,
            hoverEnabled: true,
            hoverColor: Cesium.Color.BLACK,
            hoverAlpha: 0.35,
            onCellHover: undefined,
            onCellClick: undefined,
        };
        this.canvasPool = [document.createElement('canvas'), document.createElement('canvas')];
        if (options?.interactionOptions) {
            this.setInteractionOptions(options.interactionOptions);
        }
    }

    public update(frame: AnimatedGridFrame): void {
        const { header, grid } = frame;
        if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0]) || !grid[0].length)
            return;
        const width = grid[0].length;
        const height = grid.length;
        if (width <= 0 || height <= 0) return;

        const sizeChanged = this.gridWidth !== width || this.gridHeight !== height;
        if (sizeChanged) {
            this.gridWidth = width;
            this.gridHeight = height;
            this.reusedImageData = null;
            this.canvasPool[0].width = width;
            this.canvasPool[0].height = height;
            this.canvasPool[1].width = width;
            this.canvasPool[1].height = height;
        }
        this.currentHeightMeters = frame.heightMeters ?? 0;
        this.currentOpacity = frame.opacity ?? 1;
        this.currentHeader = header;
        this.currentGrid = grid;

        const rectangle = this.buildRectangle(header, width, height);
        this.currentRectangle = rectangle;
        const nextBoundsKey = `${header.xStart}_${header.yStart}_${header.xEnd}_${header.yEnd}_${this.currentHeightMeters}_${this.currentOpacity}`;

        this.bufferIndex = (this.bufferIndex + 1) % 2;
        const targetCanvas = this.canvasPool[this.bufferIndex];
        const ctx = targetCanvas.getContext('2d');
        if (!ctx) return;

        if (
            !this.reusedImageData ||
            this.reusedImageData.width !== width ||
            this.reusedImageData.height !== height
        ) {
            this.reusedImageData = ctx.createImageData(width, height);
        }

        this.packGridToTexture(grid, width, height);
        ctx.putImageData(this.reusedImageData, 0, 0);

        if (!this.primitive || !this.material || this.boundsKey !== nextBoundsKey) {
            this.rebuildPrimitive(rectangle, targetCanvas, nextBoundsKey);
        }

        const uniforms = this.material?.uniforms as {
            u_dataTex: HTMLCanvasElement;
            u_gridSize: Cesium.Cartesian2;
            u_layerAlpha: number;
        } | null;
        if (uniforms) {
            uniforms.u_dataTex = targetCanvas;
            uniforms.u_gridSize = new Cesium.Cartesian2(this.gridWidth, this.gridHeight);
            uniforms.u_layerAlpha = this.currentOpacity;
        }

        if (!frame.skipRequestRender) this.viewer.scene.requestRender();
    }

    public setColorRamp(stops?: RasterColorStop[]): void {
        this.colorStops = this.normalizeColorStops(stops ?? DEFAULT_COLOR_STOPS);
        if (this.currentHeader && this.currentGrid) {
            if (!this.clampToGround) this.boundsKey = '';
            this.update({
                header: this.currentHeader,
                grid: this.currentGrid,
                heightMeters: this.currentHeightMeters,
                opacity: this.currentOpacity,
            });
        }
    }

    public setInteractionOptions(options: DynamicRasterInteractionOptions): void {
        this.interactionOptions = { ...this.interactionOptions, ...options };
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

    public pickValue(longitude: number, latitude: number): number | null {
        const cell = this.resolveCellFromLonLat(longitude, latitude);
        return cell?.value ?? null;
    }

    public destroy(): void {
        this.destroyInteractionHandler();
        this.clearHover();
        if (this.primitive) {
            this.viewer.scene.primitives.remove(this.primitive);
            if (!this.primitive.isDestroyed()) this.primitive.destroy();
            this.primitive = null;
        }
        this.material = null;
        this.boundsKey = '';
        this.currentRectangle = null;
        this.currentHeader = null;
        this.currentGrid = null;
        this.reusedImageData = null;
    }

    private destroyInteractionHandler(): void {
        if (!this.eventHandler) return;
        this.eventHandler.destroy();
        this.eventHandler = null;
    }

    private clearHover(): void {
        this.interactionOptions.onCellHover?.(null);
        this.viewer.scene.requestRender();
    }

    private handleMouseMove(position: Cesium.Cartesian2): void {
        if (!this.interactionOptions.enabled) return;
        const cell = this.resolveCellFromWindowPosition(position);
        if (!cell) {
            this.clearHover();
            return;
        }
        this.interactionOptions.onCellHover?.(cell);
    }

    private handleClick(position: Cesium.Cartesian2): void {
        if (!this.interactionOptions.enabled || !this.interactionOptions.onCellClick) return;
        const cell = this.resolveCellFromWindowPosition(position);
        if (!cell) return;
        this.interactionOptions.onCellClick(cell);
    }

    private resolveCellFromWindowPosition(
        position: Cesium.Cartesian2
    ): AnimatedGridCellInfo | null {
        if (!this.currentRectangle || !this.currentHeader || !this.currentGrid) return null;
        const cartesian = this.pickCartesian(position);
        if (!cartesian) return null;
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const longitude = Cesium.Math.toDegrees(cartographic.longitude);
        const latitude = Cesium.Math.toDegrees(cartographic.latitude);
        return this.resolveCellFromLonLat(longitude, latitude);
    }

    private resolveCellFromLonLat(
        longitude: number,
        latitude: number
    ): AnimatedGridCellInfo | null {
        const resolve = this.resolveGridIndexFromLonLat(longitude, latitude);
        if (!resolve) return null;
        const resolvedCell = this.resolveValueCell(resolve.xIndex, resolve.yIndex);
        if (!resolvedCell) return null;
        const { xIndex, yIndex, value } = resolvedCell;
        return { xIndex, yIndex, value, longitude, latitude };
    }

    private pickCartesian(position: Cesium.Cartesian2): Cesium.Cartesian3 | null {
        const scene = this.viewer.scene;
        if (this.clampToGround) {
            const ray = this.viewer.camera.getPickRay(position);
            if (ray) {
                const pickedOnGlobe = scene.globe.pick(ray, scene);
                if (pickedOnGlobe) return pickedOnGlobe;
            }
        }
        return this.viewer.camera.pickEllipsoid(position, scene.globe.ellipsoid) ?? null;
    }

    private resolveGridIndexFromLonLat(
        longitude: number,
        latitude: number
    ): { xIndex: number; yIndex: number } | null {
        if (!this.currentGrid || !this.currentRectangle) return null;
        const width = this.gridWidth;
        const height = this.gridHeight;
        if (width <= 0 || height <= 0) return null;
        const west = Cesium.Math.toDegrees(this.currentRectangle.west);
        const east = Cesium.Math.toDegrees(this.currentRectangle.east);
        const south = Cesium.Math.toDegrees(this.currentRectangle.south);
        const north = Cesium.Math.toDegrees(this.currentRectangle.north);
        const lonRange = east - west;
        const latRange = north - south;
        if (lonRange <= 0 || latRange <= 0) return null;

        const stX = (longitude - west) / lonRange;
        const stY = (latitude - south) / latRange;
        if (
            !Number.isFinite(stX) ||
            !Number.isFinite(stY) ||
            stX < 0 ||
            stX > 1 ||
            stY < 0 ||
            stY > 1
        )
            return null;

        const xIndex = this.clampGridIndex(Math.floor(Math.min(stX, 0.999999) * width), width);
        // 贴地图层使用影像坐标（图像第 0 行在北侧），因此 y 轴需要按北->南映射
        const yUnit = this.clampToGround ? 1 - stY : stY;
        const yIndex = this.clampGridIndex(
            Math.floor(Math.min(Math.max(yUnit, 0), 0.999999) * height),
            height
        );
        if (xIndex === null || yIndex === null) return null;
        return { xIndex, yIndex };
    }

    private resolveValueCell(
        xIndex: number,
        yIndex: number
    ): { xIndex: number; yIndex: number; value: number } | null {
        if (!this.currentGrid) return null;
        const direct = this.currentGrid[yIndex]?.[xIndex];
        if (Number.isFinite(direct)) return { xIndex, yIndex, value: direct as number };
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = xIndex + dx;
                const ny = yIndex + dy;
                if (nx < 0 || nx >= this.gridWidth || ny < 0 || ny >= this.gridHeight) continue;
                const candidate = this.currentGrid[ny]?.[nx];
                if (Number.isFinite(candidate))
                    return { xIndex: nx, yIndex: ny, value: candidate as number };
            }
        }
        return null;
    }

    private clampGridIndex(index: number, size: number): number | null {
        if (!Number.isFinite(index) || index < 0 || index >= size) return null;
        return index;
    }

    private packGridToTexture(grid: number[][], width: number, height: number): void {
        const packed = this.reusedImageData!.data;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const value = grid[y]?.[x] ?? NaN;
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
    }

    private rebuildPrimitive(
        rectangle: Cesium.Rectangle,
        texture: HTMLCanvasElement,
        boundsKey: string
    ): void {
        if (this.primitive) {
            this.viewer.scene.primitives.remove(this.primitive);
            if (!this.primitive.isDestroyed()) this.primitive.destroy();
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

        const vertexFormat = Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat;
        const geometry = new Cesium.RectangleGeometry({
            rectangle,
            height: this.clampToGround ? 0 : this.currentHeightMeters,
            vertexFormat,
        });
        const instance = new Cesium.GeometryInstance({ geometry });
        const appearance = new Cesium.MaterialAppearance({
            material: this.material,
            translucent: true,
            closed: false,
            faceForward: true,
        });

        if (this.clampToGround) {
            this.primitive = new Cesium.GroundPrimitive({
                geometryInstances: instance,
                appearance,
                asynchronous: false,
            });
        } else {
            this.primitive = new Cesium.Primitive({
                geometryInstances: instance,
                appearance,
                asynchronous: false,
            });
        }
        this.viewer.scene.primitives.add(this.primitive);
    }

    private buildColorRampGlsl(): string {
        const safeStops = this.colorStops.length ? this.colorStops : DEFAULT_COLOR_STOPS;
        const fallback = safeStops[safeStops.length - 1]?.color ?? [174, 148, 237];
        const lines: string[] = [`vec3 color = ${this.toGlslColor(fallback)};`];
        safeStops.forEach((stop, index) => {
            if (!Number.isFinite(stop.maxValue)) return;
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
        if (!Number.isFinite(value)) return '0.0';
        const text = value.toFixed(6).replace(/\.?0+$/, '');
        return text.includes('.') ? text : `${text}.0`;
    }

    private normalizeColorStops(stops?: RasterColorStop[]): RasterColorStop[] {
        if (!Array.isArray(stops) || !stops.length) {
            return DEFAULT_COLOR_STOPS.map((s) => {
                return { maxValue: s.maxValue, color: [...s.color] };
            });
        }
        const normalized = stops
            .map((stop) => {
                return {
                    maxValue: Number(stop.maxValue),
                    color: [
                        Math.max(0, Math.min(255, Math.round(stop.color?.[0] ?? 0))),
                        Math.max(0, Math.min(255, Math.round(stop.color?.[1] ?? 0))),
                        Math.max(0, Math.min(255, Math.round(stop.color?.[2] ?? 0))),
                    ] as [number, number, number],
                };
            })
            .filter((s) => {
                return Number.isFinite(s.maxValue);
            })
            .sort((a, b) => {
                return a.maxValue - b.maxValue;
            });
        if (!normalized.length) {
            return DEFAULT_COLOR_STOPS.map((s) => {
                return { maxValue: s.maxValue, color: [...s.color] };
            });
        }
        const last = normalized[normalized.length - 1];
        if (last.maxValue !== Number.POSITIVE_INFINITY) {
            normalized.push({ maxValue: Number.POSITIVE_INFINITY, color: [...last.color] });
        }
        return normalized;
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
