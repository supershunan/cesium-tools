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
    /** 是否在鼠标悬停时高亮对应网格，默认 true */
    hoverEnabled?: boolean;
    /** 高亮颜色，默认黑色 */
    hoverColor?: Cesium.Color;
    /** 高亮混合强度 0-1，默认 0.35 */
    hoverAlpha?: number;
    onCellHover?: (cell: AnimatedGridCellInfo | null) => void;
    onCellClick?: (cell: AnimatedGridCellInfo) => void;
};

export type RasterColorStop = {
    maxValue: number;
    color: [number, number, number];
};

/** 多边形遮罩顶点坐标，[经度, 纬度]（度数） */
export type PolygonMaskCoord = [number, number];

export type AnimatedRasterLayerOptions = {
    clampToGround?: boolean;
    /** 是否渐变颜色 */
    gradientEnabled?: boolean;
    /** 图例规则数组，默认 DEFAULT_COLOR_STOPS */
    colorRamp?: RasterColorStop[];
    /** 交互配置 */
    interactionOptions?: DynamicRasterInteractionOptions;
    /**
     * 多边形遮罩顶点列表（[经度, 纬度] 度数）。
     * 至少 3 个顶点，多边形内部可见，外部隐藏。
     * 不传或传 null 则全部可见。
     */
    maskPolygon?: PolygonMaskCoord[];
};

export type AnimatedGridFrame = {
    header: GridHeader;
    grid: number[][];
    heightMeters?: number;
    opacity?: number;
    skipRequestRender?: boolean;
    /**
     * true 且已有 Primitive/Material 时：只刷新透明度 uniform，不重绘纹理、不重算矩形。
     * 用于格点不变仅调透明度；header/grid 仍可带上一次相同的数据以满足类型。
     */
    opacityOnly?: boolean;
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

/** 遮罩顶点上限：过大时会导致片元着色器逐像素射线法开销过高 */
const MAX_MASK_VERTEX_COUNT = 256;

/**
 * 直接将 canvas 最新像素上传到 ImageryLayer 缓存中已有的 GPU 纹理。
 *
 * 原理：maximumLevel=0 意味着只有一张 Imagery(0,0,0)，所有地形瓦片共享同一个 WebGL Texture。
 * 用 gl.texImage2D 就地替换像素后，所有瓦片（不论 LOD）在下一帧渲染时都读取到新数据——
 * 彻底绕开 _reload() 的异步管线（requestImage → RECEIVED → _createTexture → callback），
 * 无跳过、无延迟、无缩放不一致。
 *
 * @returns true 已成功上传；false Imagery 尚未 READY（首帧），调用者应回退到 _reload() 等待初始加载。
 */
function directUpdateHardEdgeTexture(
    layer: Cesium.ImageryLayer,
    canvas: HTMLCanvasElement,
    viewer: Cesium.Viewer
): boolean {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const cache = (layer as any)._imageryCache as Record<string, any> | undefined;
    if (!cache) return false;

    const gl: WebGLRenderingContext | WebGL2RenderingContext | undefined = (viewer.scene as any)
        .context?._gl;
    if (!gl) return false;

    // 与 Cesium.Texture 默认 flipY=true 一致；否则首帧走 ImageryLayer._createTextureWebGL
    // 与后续 texImage2D 的 Y 方向不一致，栅格地理 UV 与屏上像素错位（遮罩/多边形与数据对不齐）。
    const prevFlipY = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
    let updated = false;
    for (const key in cache) {
        const imagery = cache[key];
        // ImageryState.READY === 4
        if (imagery?.state === 4 && imagery.texture?._texture) {
            gl.bindTexture(gl.TEXTURE_2D, imagery.texture._texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
            gl.bindTexture(gl.TEXTURE_2D, null);
            updated = true;
        }
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, prevFlipY);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return updated;
}

/**
 * 回退方案：强制 reload（清除 _loadedCallbacks + _reload）。
 * 仅在首帧 Imagery 尚未 READY 时使用；后续帧全部走 directUpdateHardEdgeTexture。
 */
function forceReloadHardEdgeImageryLayer(layer: Cesium.ImageryLayer, viewer: Cesium.Viewer): void {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const globe = viewer.scene.globe as any;
    const quadtree = globe?._surface?._quadtree;
    const layerIndex = (layer as any)?._layerIndex;
    if (quadtree && layerIndex !== undefined) {
        quadtree.forEachLoadedTile((tile: any) => {
            if (tile._loadedCallbacks?.[layerIndex]) {
                delete tile._loadedCallbacks[layerIndex];
            }
        });
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const provider = layer.imageryProvider as { _reload?: () => void };
    if (typeof provider._reload === 'function') {
        provider._reload();
    }
}

/**
 * 单瓦片 Canvas 影像提供者。
 *
 * requestImage 直接返回 canvas 引用（而非拷贝）。Cesium 在 _createTexture 中调用
 * gl.texImage2D(canvas) 时始终读取 canvas **当前最新像素**。
 *
 * 时序保证：putImageData 在用户代码（宏任务前半段）执行，texImage2D 在渲染循环（宏任务后半段
 * 或下一宏任务）执行，canvas 的像素在整个渲染循环期间是稳定的。因此即使多波 reload 的
 * Imagery 在不同帧创建纹理，最终结果始终一致——所有 texImage2D 都读取同一份最新像素。
 */
class CanvasHardEdgeImageryProvider {
    private readonly _tilingScheme: Cesium.GeographicTilingScheme;
    private readonly _errorEvent = new Cesium.Event();
    private readonly _canvas: HTMLCanvasElement;

    constructor(rectangle: Cesium.Rectangle, canvas: HTMLCanvasElement) {
        this._canvas = canvas;
        this._tilingScheme = new Cesium.GeographicTilingScheme({
            rectangle,
            numberOfLevelZeroTilesX: 1,
            numberOfLevelZeroTilesY: 1,
        });
    }

    get rectangle(): Cesium.Rectangle {
        return this._tilingScheme.rectangle;
    }
    get tileWidth(): number {
        return this._canvas.width;
    }
    get tileHeight(): number {
        return this._canvas.height;
    }
    get maximumLevel(): number {
        return 0;
    }
    get minimumLevel(): number {
        return 0;
    }
    get tilingScheme(): Cesium.GeographicTilingScheme {
        return this._tilingScheme;
    }
    get tileDiscardPolicy(): undefined {
        return undefined;
    }
    get errorEvent(): Cesium.Event {
        return this._errorEvent;
    }
    get credit(): undefined {
        return undefined;
    }
    get proxy(): undefined {
        return undefined;
    }
    get hasAlphaChannel(): boolean {
        return true;
    }

    requestImage(
        _x: number,
        _y: number,
        _level: number,
        _request?: Cesium.Request
    ): Promise<HTMLCanvasElement> | undefined {
        return Promise.resolve(this._canvas);
    }

    getTileCredits(_x: number, _y: number, _level: number): Cesium.Credit[] | undefined {
        return undefined;
    }

    pickFeatures(
        _x: number,
        _y: number,
        _level: number,
        _longitude: number,
        _latitude: number
    ): undefined {
        return undefined;
    }
}

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
    private gradientEnabled: boolean;
    private currentRectangle: Cesium.Rectangle | null = null;
    private currentHeader: GridHeader | null = null;
    private currentGrid: number[][] | null = null;
    private _show = true;

    private hoveredCell: { xIndex: number; yIndex: number } | null = null;
    private eventHandler: Cesium.ScreenSpaceEventHandler | null = null;
    private interactionOptions: Required<
        Pick<DynamicRasterInteractionOptions, 'enabled' | 'hoverEnabled' | 'hoverAlpha'>
    > &
        Pick<DynamicRasterInteractionOptions, 'hoverColor' | 'onCellHover' | 'onCellClick'>;

    private canvasPool: [HTMLCanvasElement, HTMLCanvasElement];
    private bufferIndex = 0;
    private reusedImageData: ImageData | null = null;

    private maskPolygon: PolygonMaskCoord[] | null = null;
    private maskCanvasPool: [HTMLCanvasElement, HTMLCanvasElement];
    private maskBufferIndex = 0;

    // updateHardEdge 专用状态（与 update() 完全独立）
    private hardEdgeImageryLayer: Cesium.ImageryLayer | null = null;
    /** 与当前硬边界图层一致的范围+栅格尺寸；变化时需重建 ImageryProvider / ImageryLayer */
    private hardEdgeBoundsKey: string | null = null;
    private hardEdgeCanvas: HTMLCanvasElement | null = null;
    private hardEdgeImageData: ImageData | null = null;
    private hardEdgeHoverEntity: Cesium.Entity | null = null;

    /**
     *
     * @param viewer - Cesium.Viewer 实例
     * @param options - AnimatedRasterLayerOptions 配置
     * @param options.clampToGround - 是否贴地
     * @param options.gradientEnabled - 是否渐变颜色
     * @param options.colorRamp - 颜色渐变
     * @param options.interactionOptions - 交互配置
     * @param options.interactionOptions.enabled - 是否启用交互
     * @param options.interactionOptions.hoverEnabled - 是否启用悬浮高亮
     * @param options.interactionOptions.hoverAlpha - 悬浮高亮透明度
     * @param options.interactionOptions.hoverColor - 悬浮高亮颜色
     * @param options.interactionOptions.onCellHover - 悬浮高亮回调
     * @param options.interactionOptions.onCellClick - 点击回调
     */
    constructor(viewer: Cesium.Viewer, options?: AnimatedRasterLayerOptions) {
        this.viewer = viewer;
        this.primitive = null;
        this.material = null;
        this.clampToGround = options?.clampToGround ?? false;
        this.gradientEnabled = options?.gradientEnabled ?? false;
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
        this.maskCanvasPool = [document.createElement('canvas'), document.createElement('canvas')];
        this.maskCanvasPool.forEach((c) => {
            c.width = 1;
            c.height = 1;
            const ctx = c.getContext('2d');
            if (ctx) {
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, 1, 1);
            }
        });
        if (options?.interactionOptions) {
            this.setInteractionOptions(options.interactionOptions);
        }
        if (options?.maskPolygon) {
            this.maskPolygon = this.normalizeMaskPolygon(options.maskPolygon);
        }
    }

    public update(frame: AnimatedGridFrame): void {
        if (frame.opacityOnly && this.primitive && this.material) {
            if (frame.opacity !== undefined) {
                const o = Number(frame.opacity);
                if (Number.isFinite(o)) this.currentOpacity = Math.max(0, Math.min(1, o));
            }
            this.syncOpacityToPrimitiveOrImageryOnly();
            if (!frame.skipRequestRender) this.viewer.scene.requestRender();
            return;
        }

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
        // 透明度不应参与 boundsKey，否则仅改透明度也会重建 Primitive；透明度由 shader u_layerAlpha 控制
        const nextBoundsKey = `${header.xStart}_${header.yStart}_${header.xEnd}_${header.yEnd}_${this.currentHeightMeters}`;

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
            u_hoverCell: Cesium.Cartesian2;
            u_hoverColor: Cesium.Cartesian3;
            u_hoverAlpha: number;
        } | null;
        if (uniforms) {
            uniforms.u_dataTex = targetCanvas;
            uniforms.u_gridSize = new Cesium.Cartesian2(this.gridWidth, this.gridHeight);
            uniforms.u_layerAlpha = this.currentOpacity;
        }

        if (!frame.skipRequestRender) this.viewer.scene.requestRender();
    }

    /**
     * @param options - { opacity?: number; colorRamp?: RasterColorStop[] } 样式配置
     * @description 设置样式配置，根据样式配置设置样式配置
     * @example
     * const options = {
     *     opacity: 1, // 透明度
     *     colorRamp: [ { maxValue: 10, color: [62, 160, 239] }, { maxValue: 20, color: [108, 225, 238] }, { maxValue: 30, color: [96, 214, 63] } ] // 颜色渐变
     * };
     */
    public setStyleOptions(options: {
        opacity?: number;
        colorRamp?: RasterColorStop[];
        skipRequestRender?: boolean;
    }): void {
        const skipReq = options.skipRequestRender ?? false;
        const rampProvided = options.colorRamp !== undefined;

        if (options.opacity !== undefined) {
            const o = Number(options.opacity);
            if (Number.isFinite(o)) this.currentOpacity = Math.max(0, Math.min(1, o));
        }

        if (rampProvided) {
            this.colorStops = this.normalizeColorStops(options.colorRamp!);
            if (this.currentHeader && this.currentGrid) {
                this.boundsKey = '';
                this.update({
                    header: this.currentHeader,
                    grid: this.currentGrid,
                    heightMeters: this.currentHeightMeters,
                    opacity: this.currentOpacity,
                    skipRequestRender: skipReq,
                });
            } else {
                this.syncOpacityToPrimitiveOrImageryOnly();
                if (!skipReq) this.viewer.scene.requestRender();
            }
            return;
        }

        this.syncOpacityToPrimitiveOrImageryOnly();
        if (!skipReq) this.viewer.scene.requestRender();
    }

    /** 仅同步透明度（Material u_layerAlpha / 硬边 ImageryLayer.alpha），不重建、不重绘格点纹理 */
    private syncOpacityToPrimitiveOrImageryOnly(): void {
        const uniforms = this.material?.uniforms as {
            u_layerAlpha?: number;
        } | null;
        if (uniforms?.u_layerAlpha !== undefined) {
            uniforms.u_layerAlpha = this.currentOpacity;
        }
        if (this.hardEdgeImageryLayer) {
            this.hardEdgeImageryLayer.alpha = this.currentOpacity;
        }
    }

    /**
     *
     * @param stops - RasterColorStop[] | undefined 原始颜色渐变
     * @description 设置颜色渐变，根据原始颜色渐变设置颜色渐变
     * @example
     * const stops = [
     *     { maxValue: 10, color: [62, 160, 239] }, // 10 对应颜色 [62, 160, 239]
     *     { maxValue: 20, color: [108, 225, 238] }, // 20 对应颜色 [108, 225, 238]
     *     { maxValue: 30, color: [96, 214, 63] }, // 30 对应颜色 [96, 214, 63]
     * ];
     * setColorRamp(stops); // 设置颜色渐变
     * console.log(this.colorStops); // [ { maxValue: 10, color: [62, 160, 239] }, { maxValue: 20, color: [108, 225, 238] }, { maxValue: 30, color: [96, 214, 63] } ]
     */
    public setColorRamp(stops?: RasterColorStop[]): void {
        this.colorStops = this.normalizeColorStops(stops ?? DEFAULT_COLOR_STOPS);
        if (this.currentHeader && this.currentGrid) {
            this.boundsKey = '';
            this.update({
                header: this.currentHeader,
                grid: this.currentGrid,
                heightMeters: this.currentHeightMeters,
                opacity: this.currentOpacity,
            });
        }
    }

    /**
     * @param coords - 多边形顶点坐标数组（[经度, 纬度] 度数），至少 3 个顶点。
     *                 传 null 或空数组时清除遮罩，恢复全部可见。
     * @description 设置多边形遮罩，多边形内部可见，外部隐藏。
     */
    public setMaskPolygon(coords: PolygonMaskCoord[] | null): void {
        this.maskPolygon = this.normalizeMaskPolygon(coords);
        const header = this.currentHeader;
        const grid = this.currentGrid;
        // 先重绘硬边界（同步 currentRectangle），再更新 u_maskTex，避免遮罩 UV 与范围不同步
        if (this.hardEdgeImageryLayer && header && grid) {
            this.updateHardEdge({
                header,
                grid,
                heightMeters: this.currentHeightMeters,
                opacity: this.currentOpacity,
            });
            this.updateMaskTexture();
            return;
        }
        this.updateMaskTexture();
        this.viewer.scene.requestRender();
    }

    /**
     * 规范化遮罩顶点：去除闭环重复点并在超大顶点数时降采样，避免 shader 逐像素循环过重。
     */
    private normalizeMaskPolygon(
        coords: PolygonMaskCoord[] | null | undefined
    ): PolygonMaskCoord[] | null {
        if (!coords || coords.length < 3) return null;

        const normalized = coords.slice();
        const first = normalized[0];
        const last = normalized[normalized.length - 1];
        // GeoJSON 常见首尾闭环重复点，射线法里不需要重复存一份。
        if (first && last && first[0] === last[0] && first[1] === last[1]) {
            normalized.pop();
        }

        if (normalized.length < 3) return null;
        if (normalized.length <= MAX_MASK_VERTEX_COUNT) return normalized;

        const simplified = this.downsamplePolygon(normalized, MAX_MASK_VERTEX_COUNT);
        return simplified.length >= 3 ? simplified : null;
    }

    /** 等距降采样，多用于行政区复杂边界的性能保护。 */
    private downsamplePolygon(
        polygon: PolygonMaskCoord[],
        targetCount: number
    ): PolygonMaskCoord[] {
        if (polygon.length <= targetCount) return polygon.slice();
        if (targetCount < 3) return polygon.slice(0, 3);

        const result: PolygonMaskCoord[] = [];
        const lastIndex = polygon.length - 1;
        for (let i = 0; i < targetCount; i++) {
            const idx = Math.round((i * lastIndex) / (targetCount - 1));
            const point = polygon[idx];
            if (!point) continue;
            if (
                result.length === 0 ||
                result[result.length - 1][0] !== point[0] ||
                result[result.length - 1][1] !== point[1]
            ) {
                result.push(point);
            }
        }
        return result;
    }

    /**
     * @param enabled - 是否启用渐变模式
     * @description 动态切换阶梯/渐变着色模式，会强制重建 Primitive
     */
    public setGradientEnabled(enabled: boolean): void {
        if (this.gradientEnabled === enabled) return;
        this.gradientEnabled = enabled;
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

    /**
     *
     * @param options - DynamicRasterInteractionOptions 交互配置
     * @description 设置交互配置，根据交互配置设置交互配置
     * @example
     * const options = {
     *     enabled: true, // 是否启用交互
     *     hoverEnabled: true, // 是否启用悬浮高亮
     *     hoverAlpha: 0.35, // 悬浮高亮透明度
     *     hoverColor: Cesium.Color.BLACK, // 悬浮高亮颜色
     *     onCellHover: undefined, // 悬浮高亮回调
     *     onCellHover: (cell) => {
     *         console.log(cell); // 悬浮高亮回调
     *     },
     *     onCellClick: undefined, // 点击回调
     *     onCellClick: (cell) => {
     *         console.log(cell); // 点击回调
     *     },
     * };
     * setInteractionOptions(options); // 设置交互配置
     * console.log(this.interactionOptions); // { enabled: true, hoverEnabled: true, hoverAlpha: 0.35, hoverColor: Cesium.Color.BLACK, onCellHover: undefined, onCellClick: undefined }
     */
    public setInteractionOptions(options: DynamicRasterInteractionOptions): void {
        const prevHoverEnabled = this.interactionOptions.hoverEnabled;
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

        // hover 开关从开→关时清除视觉高亮
        if (prevHoverEnabled && !this.interactionOptions.hoverEnabled) {
            this.hoveredCell = null;
            this.updateHoverUniform();
            this.viewer.scene.requestRender();
        }

        // 高亮色/透明度变化时同步 uniform
        this.updateHoverStyleUniforms();

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

    /**
     *
     * @param longitude - number 经度
     * @param latitude - number 纬度
     * @returns number | null 值
     * @description 根据经纬度获取值，根据经纬度获取值，如果经纬度不存在则返回 null
     * @example
     * const longitude = 100.0; // 100.0 对应值 100.0
     * const latitude = 100.0; // 100.0 对应值 100.0
     * const value = pickValue(longitude, latitude);
     * console.log(value); // 100.0
     */
    public pickValue(longitude: number, latitude: number): number | null {
        const cell = this.resolveCellFromLonLat(longitude, latitude);
        return cell?.value ?? null;
    }

    public get show(): boolean {
        return this._show;
    }

    public set show(val: boolean) {
        this._show = val;
        if (this.primitive) this.primitive.show = val;
        if (this.hardEdgeImageryLayer) this.hardEdgeImageryLayer.show = val;
        this.viewer.scene.requestRender();
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
        this.hoveredCell = null;
        this.currentRectangle = null;
        this.currentHeader = null;
        this.currentGrid = null;
        this.reusedImageData = null;
        this.destroyHardEdge();
    }

    /**
     * @description 将多边形顶点 UV 坐标编码到 1D canvas 中，供 GLSL 射线法使用。
     * 每个顶点占 2 个像素：
     *   像素 2i   → (r=sHi, g=sLo, b=0, a=255)  — s（经度 UV，16bit）
     *   像素 2i+1 → (r=tHi, g=tLo, b=0, a=255)  — t（纬度 UV，16bit）
     * alpha 固定为 255，避免 Canvas 预乘 alpha（premultiplied alpha）损坏坐标数据。
     * s/t 直接对应 materialInput.st，无需 Y 轴翻转。
     */
    private updateMaskTexture(): void {
        this.maskBufferIndex = (this.maskBufferIndex + 1) % 2;
        const canvas = this.maskCanvasPool[this.maskBufferIndex];
        const vertexCount = this.maskPolygon?.length ?? 0;

        if (!this.maskPolygon || !this.currentRectangle || vertexCount < 3) {
            canvas.width = 1;
            canvas.height = 1;
            this.syncPolyUniforms(canvas, 0);
            return;
        }

        const west = Cesium.Math.toDegrees(this.currentRectangle.west);
        const east = Cesium.Math.toDegrees(this.currentRectangle.east);
        const south = Cesium.Math.toDegrees(this.currentRectangle.south);
        const north = Cesium.Math.toDegrees(this.currentRectangle.north);
        const lonRange = east - west;
        const latRange = north - south;
        if (lonRange <= 0 || latRange <= 0) return;

        canvas.width = 2 * vertexCount;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const imageData = ctx.createImageData(2 * vertexCount, 1);
        const data = imageData.data;
        let minS = 1;
        let minT = 1;
        let maxS = 0;
        let maxT = 0;

        this.maskPolygon.forEach(([lon, lat], i) => {
            const s = Math.max(0, Math.min(1, (lon - west) / lonRange));
            const t = Math.max(0, Math.min(1, (lat - south) / latRange));
            minS = Math.min(minS, s);
            minT = Math.min(minT, t);
            maxS = Math.max(maxS, s);
            maxT = Math.max(maxT, t);
            const encS = Math.round(s * 65535);
            const encT = Math.round(t * 65535);
            // 像素 2i：s 坐标，alpha=255 防止预乘 alpha 损坏 r/g 通道
            const idxS = 2 * i * 4;
            data[idxS] = (encS >> 8) & 0xff;
            data[idxS + 1] = encS & 0xff;
            data[idxS + 2] = 0;
            data[idxS + 3] = 255;
            // 像素 2i+1：t 坐标，alpha=255
            const idxT = (2 * i + 1) * 4;
            data[idxT] = (encT >> 8) & 0xff;
            data[idxT + 1] = encT & 0xff;
            data[idxT + 2] = 0;
            data[idxT + 3] = 255;
        });

        ctx.putImageData(imageData, 0, 0);
        this.syncPolyUniforms(
            canvas,
            vertexCount,
            new Cesium.Cartesian2(minS, minT),
            new Cesium.Cartesian2(maxS, maxT)
        );
    }

    private syncPolyUniforms(
        canvas: HTMLCanvasElement,
        vertexCount: number,
        maskMin: Cesium.Cartesian2 = new Cesium.Cartesian2(0, 0),
        maskMax: Cesium.Cartesian2 = new Cesium.Cartesian2(1, 1)
    ): void {
        const uniforms = this.material?.uniforms as {
            u_maskTex?: HTMLCanvasElement;
            u_polyCount?: number;
            u_maskMin?: Cesium.Cartesian2;
            u_maskMax?: Cesium.Cartesian2;
        } | null;
        if (!uniforms) return;
        uniforms.u_maskTex = canvas;
        uniforms.u_polyCount = vertexCount;
        uniforms.u_maskMin = maskMin;
        uniforms.u_maskMax = maskMax;
    }

    private destroyInteractionHandler(): void {
        if (!this.eventHandler) return;
        this.eventHandler.destroy();
        this.eventHandler = null;
    }

    private clearHover(): void {
        if (this.hoveredCell !== null) {
            this.hoveredCell = null;
            this.updateHoverUniform();
        }
        if (this.hardEdgeHoverEntity) {
            this.viewer.entities.remove(this.hardEdgeHoverEntity);
            this.hardEdgeHoverEntity = null;
        }
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
        if (this.interactionOptions.hoverEnabled) {
            // cell.xIndex/yIndex 可能来自 resolveValueCell 的邻格搜索，不一定是鼠标真实所在格。
            // 用 cell.longitude/latitude（始终是鼠标真实地理坐标）重新查询原始格子索引，
            // 保证高亮落在鼠标实际位置的格子上，而不是被修正到有数据的邻格。
            const rawIdx = this.resolveGridIndexFromLonLat(cell.longitude, cell.latitude);
            const hoverIdx = rawIdx ?? { xIndex: cell.xIndex, yIndex: cell.yIndex };
            const prev = this.hoveredCell;
            if (prev?.xIndex !== hoverIdx.xIndex || prev?.yIndex !== hoverIdx.yIndex) {
                this.hoveredCell = hoverIdx;
                this.updateHoverUniform();
                this.viewer.scene.requestRender();
            }
        }
        this.interactionOptions.onCellHover?.(cell);
    }

    private updateHoverUniform(): void {
        const uniforms = this.material?.uniforms as {
            u_hoverCell: Cesium.Cartesian2;
        } | null;
        if (uniforms) {
            if (this.hoveredCell && this.interactionOptions.hoverEnabled) {
                // Cesium RectangleGeometry UV 始终是标准地理约定：st.t=0 在南边，st.t=1 在北边。
                // GLSL 中 cellIdx.y = floor(st.t * H)，故 cellIdx.y=0 在南边。
                // 而 resolveGridIndexFromLonLat 对 clampToGround 做了 Y 翻转（数据北行优先），
                // yIndex=0 在北边。需要将 yIndex 转换为 GLSL 坐标系：glslY = (H-1) - yIndex。
                const glslY = this.clampToGround
                    ? this.gridHeight - 1 - this.hoveredCell.yIndex
                    : this.hoveredCell.yIndex;
                uniforms.u_hoverCell = new Cesium.Cartesian2(this.hoveredCell.xIndex, glslY);
            } else {
                uniforms.u_hoverCell = new Cesium.Cartesian2(-1, -1);
            }
        }
        // hardEdge 模式无 shader，用 Entity 矩形叠加高亮
        this.syncHardEdgeHoverEntity();
    }

    private syncHardEdgeHoverEntity(): void {
        if (!this.hardEdgeImageryLayer) return;
        if (!this.interactionOptions.hoverEnabled || !this.hoveredCell) {
            if (this.hardEdgeHoverEntity) {
                this.viewer.entities.remove(this.hardEdgeHoverEntity);
                this.hardEdgeHoverEntity = null;
            }
            return;
        }
        const rect = this.buildCellRectangle(this.hoveredCell.xIndex, this.hoveredCell.yIndex);
        if (!rect) return;
        const hc = this.interactionOptions.hoverColor ?? Cesium.Color.BLACK;
        const color = hc.withAlpha(this.interactionOptions.hoverAlpha);
        if (!this.hardEdgeHoverEntity) {
            this.hardEdgeHoverEntity = this.viewer.entities.add({
                rectangle: {
                    coordinates: rect,
                    material: color,
                    classificationType: Cesium.ClassificationType.TERRAIN,
                },
            });
        } else if (this.hardEdgeHoverEntity.rectangle) {
            this.hardEdgeHoverEntity.rectangle.coordinates = new Cesium.ConstantProperty(rect);
            this.hardEdgeHoverEntity.rectangle.material = new Cesium.ColorMaterialProperty(color);
        }
    }

    private buildCellRectangle(xIndex: number, yIndex: number): Cesium.Rectangle | null {
        const rect = this.currentRectangle;
        if (!rect || this.gridWidth <= 0 || this.gridHeight <= 0) return null;
        if (xIndex < 0 || xIndex >= this.gridWidth || yIndex < 0 || yIndex >= this.gridHeight)
            return null;
        const west = Cesium.Math.toDegrees(rect.west);
        const east = Cesium.Math.toDegrees(rect.east);
        const south = Cesium.Math.toDegrees(rect.south);
        const north = Cesium.Math.toDegrees(rect.north);
        const lonStep = (east - west) / this.gridWidth;
        const latStep = (north - south) / this.gridHeight;
        // yIndex=0 在北边（数据北行优先），Entity 矩形用地理坐标（南→北）
        const cellLatMax = north - latStep * yIndex;
        const cellLatMin = north - latStep * (yIndex + 1);
        const cellLonMin = west + lonStep * xIndex;
        const cellLonMax = west + lonStep * (xIndex + 1);
        return Cesium.Rectangle.fromDegrees(cellLonMin, cellLatMin, cellLonMax, cellLatMax);
    }

    private updateHoverStyleUniforms(): void {
        const uniforms = this.material?.uniforms as {
            u_hoverColor: Cesium.Cartesian3;
            u_hoverAlpha: number;
        } | null;
        if (!uniforms) return;
        const hc = this.interactionOptions.hoverColor ?? Cesium.Color.BLACK;
        uniforms.u_hoverColor = new Cesium.Cartesian3(hc.red, hc.green, hc.blue);
        uniforms.u_hoverAlpha = this.interactionOptions.hoverAlpha;
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

    /**
     *
     * @param grid - 网格数据
     * @param width - 网格宽度
     * @param height - 网格高度
     * @description 将网格数据打包到纹理中
     * @example
     * const grid = [
     *     [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
     *     [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
     * ];
     * const width = 10;
     * const height = 10;
     * packGridToTexture(grid, width, height);
     * console.log(packed);
     */
    private getColorRampMaxValue(): number {
        for (let i = this.colorStops.length - 1; i >= 0; i--) {
            if (Number.isFinite(this.colorStops[i].maxValue)) {
                return this.colorStops[i].maxValue;
            }
        }
        return 80;
    }

    private packGridToTexture(grid: number[][], width: number, height: number): void {
        const packed = this.reusedImageData!.data;
        const maxVal = this.getColorRampMaxValue();
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const value = grid[y]?.[x] ?? NaN;
                const idx = (y * width + x) * 4;
                if (
                    !Number.isFinite(value) ||
                    Number(value) <= 0 ||
                    Number(value) < this.colorStops[0].maxValue
                ) {
                    packed[idx] = 255;
                    packed[idx + 1] = 255;
                    packed[idx + 2] = 0;
                    packed[idx + 3] = 255;
                    continue;
                }
                const normalized = Math.max(0, Math.min(1, value / maxVal));
                // 用 floor 与 shader 解码一致，避免 round 边界进位导致 30.x 归入下一档颜色（如误判为 35）
                const t = normalized * 65534;
                const encoded = Math.max(0, Math.min(65534, Math.floor(t + 1e-12)));
                packed[idx] = (encoded >> 8) & 255;
                packed[idx + 1] = encoded & 255;
                packed[idx + 2] = 0;
                packed[idx + 3] = 255;
            }
        }
    }

    /**
     *
     * @param rectangle - Cesium.Rectangle 矩形
     * @param texture - HTMLCanvasElement 纹理
     * @param boundsKey - string 边界键
     * @description 重建原始，根据矩形和纹理重建原始
     * @example
     * const rectangle = Cesium.Rectangle.fromDegrees(100, 100, 200, 200);
     * const texture = document.createElement('canvas');
     * texture.width = 10;
     * texture.height = 10;
     * const boundsKey = '100_100_200_200_0_1';
     * rebuildPrimitive(rectangle, texture, boundsKey);
     */
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
        const hc = this.interactionOptions.hoverColor ?? Cesium.Color.BLACK;
        this.material = new Cesium.Material({
            fabric: {
                uniforms: {
                    u_dataTex: texture,
                    u_gridSize: new Cesium.Cartesian2(this.gridWidth, this.gridHeight),
                    u_layerAlpha: this.currentOpacity,
                    u_hoverCell: new Cesium.Cartesian2(-1, -1),
                    u_hoverColor: new Cesium.Cartesian3(hc.red, hc.green, hc.blue),
                    u_hoverAlpha: this.interactionOptions.hoverAlpha,
                    u_maskTex: this.maskCanvasPool[this.maskBufferIndex],
                    u_polyCount: 0.0,
                    u_maskMin: new Cesium.Cartesian2(0, 0),
                    u_maskMax: new Cesium.Cartesian2(1, 1),
                },
                source: this.buildShaderSource(),
            },
            translucent: true,
        });
        this.updateMaskTexture();

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
        this.primitive.show = this._show;
    }

    /**
     * @description 构建完整的 czm_getMaterial GLSL 着色器源码。
     * 非渐变模式：最近邻采样，步进色标。
     * 渐变模式：颜色双线性（4 格各自映射颜色后插值），避免数值插值产生彩虹缝隙。
     * 两种模式均支持鼠标悬浮高亮与多边形遮罩。
     * 多边形遮罩使用射线法（ray casting）在 UV 空间直接判断点是否在多边形内，
     * 顶点坐标以 rg=s/ba=t（各 16bit）编码存于 u_maskTex，不依赖任何 Y 轴翻转假设。
     */
    private buildShaderSource(): string {
        // 射线法点在多边形内判断（在 materialInput.st UV 空间执行）
        // u_maskTex: 1D 顶点纹理，每顶点占 2 个像素（像素 2i=s, 2i+1=t），16bit 精度
        // u_polyCount: 顶点数量，< 3 时禁用遮罩
        const maskGlsl = `
                int _pn = int(u_polyCount);
                if (_pn >= 3) {
                    vec2 _p = materialInput.st;
                    if (_p.x < u_maskMin.x || _p.x > u_maskMax.x || _p.y < u_maskMin.y || _p.y > u_maskMax.y) {
                        material.alpha = 0.0;
                        return material;
                    }
                    bool _inside = false;
                    float _tw = float(2 * _pn);
                    int _j = _pn - 1;
                    for (int _i = 0; _i < ${MAX_MASK_VERTEX_COUNT}; _i++) {
                        if (_i >= _pn) break;
                        vec4 _si = texture(u_maskTex, vec2((float(2 * _i)     + 0.5) / _tw, 0.5));
                        vec4 _ti = texture(u_maskTex, vec2((float(2 * _i + 1) + 0.5) / _tw, 0.5));
                        vec4 _sj = texture(u_maskTex, vec2((float(2 * _j)     + 0.5) / _tw, 0.5));
                        vec4 _tj = texture(u_maskTex, vec2((float(2 * _j + 1) + 0.5) / _tw, 0.5));
                        float _xi = (floor(_si.r * 255.0 + 0.5) * 256.0 + floor(_si.g * 255.0 + 0.5)) / 65535.0;
                        float _yi = (floor(_ti.r * 255.0 + 0.5) * 256.0 + floor(_ti.g * 255.0 + 0.5)) / 65535.0;
                        float _xj = (floor(_sj.r * 255.0 + 0.5) * 256.0 + floor(_sj.g * 255.0 + 0.5)) / 65535.0;
                        float _yj = (floor(_tj.r * 255.0 + 0.5) * 256.0 + floor(_tj.g * 255.0 + 0.5)) / 65535.0;
                        bool _crossY = (_yi > _p.y) != (_yj > _p.y);
                        if (_crossY && _p.x < _xi + (_p.y - _yi) / (_yj - _yi) * (_xj - _xi)) {
                            _inside = !_inside;
                        }
                        _j = _i;
                    }
                    if (!_inside) {
                        material.alpha = 0.0;
                        return material;
                    }
                }`;

        // 高亮片段：若当前格子 == u_hoverCell 则与高亮色混合
        const hoverGlsl = `
                if (u_hoverCell.x >= 0.0) {
                    vec2 _diff = abs(cellIdx - u_hoverCell);
                    if (_diff.x < 0.5 && _diff.y < 0.5) {
                        color = mix(color, u_hoverColor, clamp(u_hoverAlpha, 0.0, 1.0));
                    }
                }`;

        const maxValGlsl = this.toGlslNumber(this.getColorRampMaxValue());
        if (!this.gradientEnabled) {
            const colorRampCode = this.buildColorRampGlsl();
            return `
                czm_material czm_getMaterial(czm_materialInput materialInput)
                {
                    czm_material material = czm_getDefaultMaterial(materialInput);
                    ${maskGlsl}
                    vec2 gridSize = max(u_gridSize, vec2(1.0));
                    vec2 cellIdx = floor(clamp(materialInput.st, 0.0, 0.999999) * gridSize);
                    vec2 uv = (cellIdx + 0.5) / gridSize;
                    vec4 tex = texture(u_dataTex, uv);
                    float encoded = floor(tex.r * 255.0 + 0.5) * 256.0 + floor(tex.g * 255.0 + 0.5);
                    if (encoded >= 65535.0) {
                        material.alpha = 0.0;
                        return material;
                    }
                    float value = clamp(floor(encoded) / 65534.0, 0.0, 1.0) * ${maxValGlsl};
                    ${colorRampCode}
                    ${hoverGlsl}
                    material.diffuse = color;
                    material.alpha = clamp(u_layerAlpha, 0.0, 1.0);
                    return material;
                }
            `;
        }

        // 渐变模式：颜色双线性 —— 4 格各自走色标，再对颜色双线性插值，
        // 不对编码整数值直接插值，避免相邻格值差大时产生彩虹缝隙。
        const rampFn = this.buildColorRampGlslFunction();
        return `
            ${rampFn}
            czm_material czm_getMaterial(czm_materialInput materialInput)
            {
                czm_material material = czm_getDefaultMaterial(materialInput);
                ${maskGlsl}
                vec2 gridSize = max(u_gridSize, vec2(1.0));
                vec2 gridPos = clamp(materialInput.st, 0.0, 0.999999) * gridSize;
                vec2 cellIdx = floor(gridPos);
                vec2 f = gridPos - cellIdx;
                vec2 cell10 = vec2(min(cellIdx.x + 1.0, gridSize.x - 1.0), cellIdx.y);
                vec2 cell01 = vec2(cellIdx.x, min(cellIdx.y + 1.0, gridSize.y - 1.0));
                vec2 cell11 = vec2(min(cellIdx.x + 1.0, gridSize.x - 1.0), min(cellIdx.y + 1.0, gridSize.y - 1.0));
                vec4 s00 = texture(u_dataTex, (cellIdx + 0.5) / gridSize);
                vec4 s10 = texture(u_dataTex, (cell10  + 0.5) / gridSize);
                vec4 s01 = texture(u_dataTex, (cell01  + 0.5) / gridSize);
                vec4 s11 = texture(u_dataTex, (cell11  + 0.5) / gridSize);
                float e00 = floor(s00.r * 255.0 + 0.5) * 256.0 + floor(s00.g * 255.0 + 0.5);
                float e10 = floor(s10.r * 255.0 + 0.5) * 256.0 + floor(s10.g * 255.0 + 0.5);
                float e01 = floor(s01.r * 255.0 + 0.5) * 256.0 + floor(s01.g * 255.0 + 0.5);
                float e11 = floor(s11.r * 255.0 + 0.5) * 256.0 + floor(s11.g * 255.0 + 0.5);
                if (e00 >= 65535.0) {
                    material.alpha = 0.0;
                    return material;
                }
                if (e10 >= 65535.0) e10 = e00;
                if (e01 >= 65535.0) e01 = e00;
                if (e11 >= 65535.0) e11 = e00;
                vec3 c00 = _rampColorFn(clamp(floor(e00) / 65534.0, 0.0, 1.0) * ${maxValGlsl});
                vec3 c10 = _rampColorFn(clamp(floor(e10) / 65534.0, 0.0, 1.0) * ${maxValGlsl});
                vec3 c01 = _rampColorFn(clamp(floor(e01) / 65534.0, 0.0, 1.0) * ${maxValGlsl});
                vec3 c11 = _rampColorFn(clamp(floor(e11) / 65534.0, 0.0, 1.0) * ${maxValGlsl});
                vec3 color = mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
                ${hoverGlsl}
                material.diffuse = color;
                material.alpha = clamp(u_layerAlpha, 0.0, 1.0);
                return material;
            }
        `;
    }

    /**
     * @description 将色标代码包装为 GLSL 函数 _rampColorFn(float value)，
     * 供渐变着色器对 4 个格子各自调用，实现颜色双线性插值。
     */
    private buildColorRampGlslFunction(): string {
        const body = this.buildColorRampGlsl();
        const indented = body
            .split('\n')
            .map((line) => {
                return `    ${line}`;
            })
            .join('\n');
        return `vec3 _rampColorFn(float value) {\n${indented}\n    return color;\n}`;
    }

    /**
     *
     * @returns string GLSL 颜色渐变代码
     * @description 构建颜色渐变 GLSL 代码，根据颜色渐变构建 GLSL 代码
     * @example
     * const colorStops = [
     *     { maxValue: 10, color: [62, 160, 239] },
     *     { maxValue: 20, color: [108, 225, 238] },
     *     { maxValue: 30, color: [96, 214, 63] },
     * ];
     * const glsl = buildColorRampGlsl(colorStops);
     * console.log(glsl); // vec3 color = vec3(0.243137, 0.784314, 1.0); if (value <= 10.0) { color = vec3(0.243137, 0.784314, 1.0); } else if (value <= 20.0) { color = vec3(0.423529, 0.901961, 1.0); } else if (value <= 30.0) { color = vec3(0.376471, 0.839216, 0.250980); }
     */
    private buildColorRampGlsl(): string {
        const safeStops = this.colorStops.length ? this.colorStops : DEFAULT_COLOR_STOPS;
        const fallback =
            safeStops[safeStops.length - 1]?.color ?? ([174, 148, 237] as [number, number, number]);
        if (this.gradientEnabled) {
            return this.buildGradientColorRampGlsl(safeStops, fallback);
        }
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

    /**
     * @description 构建渐变颜色 GLSL 代码，相邻色阶之间线性插值
     */
    private buildGradientColorRampGlsl(
        stops: RasterColorStop[],
        fallback: [number, number, number]
    ): string {
        const finiteStops = stops.filter((s) => {
            return Number.isFinite(s.maxValue);
        });
        const lines: string[] = [`vec3 color = ${this.toGlslColor(fallback)};`];

        finiteStops.forEach((stop, index) => {
            if (index === 0) {
                lines.push(
                    `if (value <= ${this.toGlslNumber(stop.maxValue)}) { color = ${this.toGlslColor(stop.color)}; }`
                );
                return;
            }
            const prev = finiteStops[index - 1];
            const rangeSize = stop.maxValue - prev.maxValue;
            if (rangeSize <= 0) {
                lines.push(
                    `else if (value <= ${this.toGlslNumber(stop.maxValue)}) { color = ${this.toGlslColor(stop.color)}; }`
                );
            } else {
                lines.push(
                    `else if (value <= ${this.toGlslNumber(stop.maxValue)}) { float t = clamp((value - ${this.toGlslNumber(prev.maxValue)}) / ${this.toGlslNumber(rangeSize)}, 0.0, 1.0); color = mix(${this.toGlslColor(prev.color)}, ${this.toGlslColor(stop.color)}, t); }`
                );
            }
        });

        return lines.join('\n    ');
    }

    /**
     *
     * @param color - [number, number, number] 颜色
     * @returns string GLSL 颜色代码
     * @description 将颜色转换为 GLSL 颜色代码，根据颜色转换为 GLSL 颜色代码
     * @example
     * const color = [62, 160, 239];
     * const glsl = toGlslColor(color);
     * console.log(glsl); // vec3(0.243137, 0.784314, 1.0);
     */
    private toGlslColor(color: [number, number, number]): string {
        return `vec3(${this.toGlslNumber(color[0] / 255)}, ${this.toGlslNumber(color[1] / 255)}, ${this.toGlslNumber(color[2] / 255)})`;
    }
    /**
     *
     * @param value - number 值
     * @returns string GLSL 数字代码
     * @description 将数字转换为 GLSL 数字代码，根据数字转换为 GLSL 数字代码
     * @example
     * const value = 10.0;
     * const glsl = toGlslNumber(value);
     * console.log(glsl); // 10.0
     */
    private toGlslNumber(value: number): string {
        if (!Number.isFinite(value)) return '0.0';
        const text = value.toFixed(6).replace(/\.?0+$/, '');
        return text.includes('.') ? text : `${text}.0`;
    }

    /**
     *
     * @param stops - RasterColorStop[] | undefined 原始颜色渐变
     * @returns RasterColorStop[] 规范化后的颜色渐变
     * @description 规范化颜色渐变，根据颜色渐变规范化颜色渐变
     * @example
     * const stops = [
     *     { maxValue: 10, color: [62, 160, 239] },
     *     { maxValue: 20, color: [108, 225, 238] },
     *     { maxValue: 30, color: [96, 214, 63] },
     * ];
     * const normalized = normalizeColorStops(stops);
     * console.log(normalized); // [ { maxValue: 10, color: [62, 160, 239] }, { maxValue: 20, color: [108, 225, 238] }, { maxValue: 30, color: [96, 214, 63] } ]
     */
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

    /**
     *
     * @param header - GridHeader 网格头信息
     * @param width - 网格宽度
     * @param height - 网格高度
     * @returns Cesium.Rectangle 矩形
     * @description 构建矩形，根据网格头信息和网格大小构建矩形
     * @example
     * const header = {
     *     xStart: 100,
     *     yStart: 100,
     *     xEnd: 200,
     *     yEnd: 200,
     *     xDelta: 10,
     *     yDelta: 10,
     *     xSize: 10,
     *     ySize: 10,
     *     levelList: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
     *     timeList: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000],
     * };
     * const width = 10;
     * const height = 10;
     * const rectangle = buildRectangle(header, width, height); // Cesium.Rectangle { west: 100, south: 100, east: 200, north: 200 }
     */
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

    /**
     * 以硬边界（NEAREST 过滤）方式渲染一帧数据，颜色完全分明、无插值混色。
     * 与 update() 相互独立，可随时来回切换调用：
     * - 调用 updateHardEdge() 时会叠加显示 ImageryLayer 硬边界图层
     * - 调用 destroyHardEdge() 可随时清除，恢复纯 Primitive（update）渲染
     *
     * 同一范围与栅格尺寸下复用单个 ImageryLayer：通过 gl.texImage2D 直接上传 canvas 最新像素到已有 GPU 纹理，
     * 所有 LOD 的地形瓦片共享同一纹理对象，一次上传即全局更新，无 _reload 异步延迟/跳过/缩放不一致问题。
     * Imagery 尚未 READY（首帧）时回退到 forceReload 等待初始加载。
     * 范围或宽高变化时重建 ImageryProvider 并替换图层（此类情况较少）。
     */
    public updateHardEdge(frame: AnimatedGridFrame): void {
        const { header, grid } = frame;
        if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0]) || !grid[0].length)
            return;
        const width = grid[0].length;
        const height = grid.length;
        if (width <= 0 || height <= 0) return;

        const opacity = frame.opacity ?? 1;
        const rectangle = this.buildRectangle(header, width, height);

        // 同步拾取/遮罩依赖的状态
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
        this.currentOpacity = opacity;
        this.currentHeader = header;
        this.currentGrid = grid;
        this.currentRectangle = rectangle;

        const boundsKey = `${rectangle.west}_${rectangle.south}_${rectangle.east}_${rectangle.north}_${width}_${height}`;
        const needNewLayer = !this.hardEdgeImageryLayer || this.hardEdgeBoundsKey !== boundsKey;

        if (needNewLayer) {
            // ✅ Fix Bug3: 每次新建 Provider 时同步新建 canvas，保证 Provider 持有的引用与后续 putImageData 的目标一致
            this.hardEdgeCanvas = document.createElement('canvas');
            this.hardEdgeCanvas.width = width;
            this.hardEdgeCanvas.height = height;
            this.hardEdgeImageData = null;
        } else {
            // 复用路径：canvas 尺寸保证与当前帧一致（boundsKey 包含 width/height，相同则尺寸不变）
            if (
                !this.hardEdgeCanvas ||
                this.hardEdgeCanvas.width !== width ||
                this.hardEdgeCanvas.height !== height
            ) {
                this.hardEdgeCanvas = document.createElement('canvas');
                this.hardEdgeCanvas.width = width;
                this.hardEdgeCanvas.height = height;
                this.hardEdgeImageData = null;
            }
        }

        const ctx = this.hardEdgeCanvas.getContext('2d');
        if (!ctx) return;
        if (
            !this.hardEdgeImageData ||
            this.hardEdgeImageData.width !== width ||
            this.hardEdgeImageData.height !== height
        ) {
            this.hardEdgeImageData = ctx.createImageData(width, height);
        }

        // ✅ 先写像素到 canvas，再操作图层，避免图层 add 之后 canvas 还是空的
        this.packGridToHardEdge(grid, width, height);
        ctx.putImageData(this.hardEdgeImageData, 0, 0);

        if (needNewLayer) {
            // ✅ Fix Bug1: 先移除旧层，再加新层，消灭"双层叠加"的间隙帧
            const prevLayer = this.hardEdgeImageryLayer;
            if (prevLayer) {
                this.viewer.imageryLayers.remove(prevLayer, true);
                this.hardEdgeImageryLayer = null;
            }

            // canvas 已写入最新像素，此时再创建 Provider 绑定
            const provider = new CanvasHardEdgeImageryProvider(rectangle, this.hardEdgeCanvas);
            const nextLayer = new Cesium.ImageryLayer(
                provider as unknown as Cesium.ImageryProvider,
                {
                    minificationFilter: Cesium.TextureMinificationFilter.NEAREST,
                    magnificationFilter: Cesium.TextureMagnificationFilter.NEAREST,
                }
            );
            nextLayer.alpha = opacity;
            nextLayer.show = this._show;
            this.viewer.imageryLayers.add(nextLayer);
            this.hardEdgeImageryLayer = nextLayer;
            this.hardEdgeBoundsKey = boundsKey;
        } else if (this.hardEdgeImageryLayer) {
            this.hardEdgeImageryLayer.alpha = opacity;
            if (
                !directUpdateHardEdgeTexture(
                    this.hardEdgeImageryLayer,
                    this.hardEdgeCanvas,
                    this.viewer
                )
            ) {
                forceReloadHardEdgeImageryLayer(this.hardEdgeImageryLayer, this.viewer);
            }
        }

        if (!frame.skipRequestRender) {
            this.viewer.scene.requestRender();
        }
    }

    /**
     * 销毁 updateHardEdge() 创建的 ImageryLayer。
     * 切换回 update() 模式时调用此方法清除硬边界图层。
     */
    public destroyHardEdge(): void {
        if (this.hardEdgeImageryLayer) {
            this.viewer.imageryLayers.remove(this.hardEdgeImageryLayer, true);
            this.hardEdgeImageryLayer = null;
        }
        this.hardEdgeBoundsKey = null;
        if (this.hardEdgeHoverEntity) {
            this.viewer.entities.remove(this.hardEdgeHoverEntity);
            this.hardEdgeHoverEntity = null;
        }
        this.hardEdgeCanvas = null;
        this.hardEdgeImageData = null;
    }

    private packGridToHardEdge(grid: number[][], width: number, height: number): void {
        const packed = this.hardEdgeImageData!.data;
        const stops = this.colorStops.length ? this.colorStops : DEFAULT_COLOR_STOPS;

        // 预先将 maskPolygon 转为 UV 坐标（[0,1] 范围），供逐像素射线法使用
        let maskUV: Array<[number, number]> | null = null;
        if (this.maskPolygon && this.maskPolygon.length >= 3 && this.currentRectangle) {
            const west = Cesium.Math.toDegrees(this.currentRectangle.west);
            const east = Cesium.Math.toDegrees(this.currentRectangle.east);
            const south = Cesium.Math.toDegrees(this.currentRectangle.south);
            const north = Cesium.Math.toDegrees(this.currentRectangle.north);
            const lonRange = east - west;
            const latRange = north - south;
            if (lonRange > 0 && latRange > 0) {
                maskUV = this.maskPolygon.map(([lon, lat]) => {
                    return [
                        Math.max(0, Math.min(1, (lon - west) / lonRange)),
                        Math.max(0, Math.min(1, (lat - south) / latRange)),
                    ];
                });
            }
        }

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const value = grid[y]?.[x] ?? NaN;

                if (
                    !Number.isFinite(value) ||
                    Number(value) <= 0 ||
                    Number(value) < this.colorStops[0].maxValue
                ) {
                    packed[idx] = 0;
                    packed[idx + 1] = 0;
                    packed[idx + 2] = 0;
                    packed[idx + 3] = 0;
                    continue;
                }

                // CPU 射线法遮罩：有限分辨率下无法与矢量多边形逐像素重合，仅用「中心点」会在边沿
                // 出现整块多显/少显；对格子四角+中心共 5 点做多数表决，贴近真实边界。
                if (maskUV) {
                    if (!this.cellMajorityInsidePolygonUV(x, y, width, height, maskUV)) {
                        packed[idx] = 0;
                        packed[idx + 1] = 0;
                        packed[idx + 2] = 0;
                        packed[idx + 3] = 0;
                        continue;
                    }
                }

                const color = this.gradientEnabled
                    ? this.sampleGradientColor(value, stops)
                    : this.sampleStepColor(value, stops);
                packed[idx] = color[0];
                packed[idx + 1] = color[1];
                packed[idx + 2] = color[2];
                packed[idx + 3] = 255;
            }
        }
    }

    /**
     * 单格内 5 个采样点（四角 + 中心）在地理 UV 下做点在多边形内，≥3 点在内则该格可见。
     * 与仅用中心点相比，边沿与矢量多边形的贴合度更好（仍受栅格分辨率上限约束）。
     */
    private cellMajorityInsidePolygonUV(
        x: number,
        y: number,
        width: number,
        height: number,
        poly: Array<[number, number]>
    ): boolean {
        const uLeft = x / width;
        const uMid = (x + 0.5) / width;
        const uRight = (x + 1) / width;
        const tSouth = this.clampToGround ? 1 - (y + 1) / height : y / height;
        const tNorth = this.clampToGround ? 1 - y / height : (y + 1) / height;
        const tMid = (tSouth + tNorth) * 0.5;

        const samples: Array<[number, number]> = [
            [uLeft, tSouth],
            [uRight, tSouth],
            [uLeft, tNorth],
            [uRight, tNorth],
            [uMid, tMid],
        ];
        let inside = 0;
        for (const [u, t] of samples) {
            if (this.pointInPolygonUV(u, t, poly)) inside++;
        }
        return inside >= 3;
    }

    /** 射线法判断点 (u, t) 是否在 UV 多边形内 */
    private pointInPolygonUV(u: number, t: number, poly: Array<[number, number]>): boolean {
        let inside = false;
        const n = poly.length;
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const [xi, yi] = poly[i];
            const [xj, yj] = poly[j];
            if (yi > t !== yj > t && u < xi + ((t - yi) / (yj - yi)) * (xj - xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    private sampleStepColor(value: number, stops: RasterColorStop[]): [number, number, number] {
        for (const stop of stops) {
            if (value <= stop.maxValue) return stop.color;
        }
        return stops[stops.length - 1]?.color ?? [0, 0, 0];
    }

    private sampleGradientColor(value: number, stops: RasterColorStop[]): [number, number, number] {
        if (stops.length === 0) return [0, 0, 0];
        if (value <= stops[0].maxValue) return stops[0].color;
        for (let i = 1; i < stops.length; i++) {
            const prev = stops[i - 1];
            const curr = stops[i];
            if (value <= curr.maxValue) {
                const range = curr.maxValue - prev.maxValue;
                if (range <= 0) return curr.color;
                const t = (value - prev.maxValue) / range;
                return [
                    Math.round(prev.color[0] + (curr.color[0] - prev.color[0]) * t),
                    Math.round(prev.color[1] + (curr.color[1] - prev.color[1]) * t),
                    Math.round(prev.color[2] + (curr.color[2] - prev.color[2]) * t),
                ];
            }
        }
        return stops[stops.length - 1].color;
    }
}
