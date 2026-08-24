import * as Cesium from 'cesium';

export type HardEdgeColorStop = {
    maxValue: number;
    color: [number, number, number];
};

export type HardEdgeGridHeader = {
    xStart: number;
    xEnd: number;
    yStart: number;
    yEnd: number;
    xDelta?: number;
    yDelta?: number;
    xSize?: number;
    ySize?: number;
};

export type HardEdgeRasterFrame = {
    header: HardEdgeGridHeader;
    grid: number[][];
    rowIndexGrid?: number[][];
    columnIndexGrid?: number[][];
    /** ImageryLayer 始终贴地；保留该字段以兼容 AnimatedGridFrame */
    heightMeters?: number;
    opacity?: number;
    skipRequestRender?: boolean;
};

export type HardEdgeGridCellInfo = {
    xIndex: number;
    yIndex: number;
    value: number;
    rowIndex: number;
    columnIndex: number;
    longitude: number;
    latitude: number;
};

export type HardEdgeInteractionOptions = {
    enabled?: boolean;
    hoverEnabled?: boolean;
    hoverColor?: Cesium.Color;
    hoverAlpha?: number;
    onCellHover?: (cell: HardEdgeGridCellInfo | null) => void;
    onCellClick?: (cell: HardEdgeGridCellInfo) => void;
};

export type HardEdgeRasterLayerOptions = {
    colorRamp?: HardEdgeColorStop[];
    gradientEnabled?: boolean;
    /** 数据第 0 行是否位于北侧，默认 true */
    row0IsNorth?: boolean;
    /** @deprecated ImageryLayer 始终贴地；该配置仅用于兼容旧调用并决定第 0 行位于北侧 */
    clampToGround?: boolean;
    maskPolygon?: Array<[number, number]> | null;
    show?: boolean;
    interactionOptions?: HardEdgeInteractionOptions;
};

const DEFAULT_COLOR_RAMP: HardEdgeColorStop[] = [
    { maxValue: 10, color: [0, 0, 255] },
    { maxValue: 20, color: [0, 255, 255] },
    { maxValue: 30, color: [0, 255, 0] },
    { maxValue: 40, color: [255, 255, 0] },
    { maxValue: 50, color: [255, 165, 0] },
    { maxValue: 60, color: [255, 0, 0] },
    { maxValue: 70, color: [132, 39, 179] },
    { maxValue: Number.POSITIVE_INFINITY, color: [174, 148, 237] },
];

function directUpdateTexture(
    layer: Cesium.ImageryLayer,
    canvas: HTMLCanvasElement,
    viewer: Cesium.Viewer
): boolean {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const cache = (layer as any)._imageryCache as Record<string, any> | undefined;
    const gl: WebGLRenderingContext | WebGL2RenderingContext | undefined = (viewer.scene as any)
        .context?._gl;
    if (!cache || !gl) return false;

    const previousFlipY = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
    let updated = false;
    for (const key in cache) {
        const imagery = cache[key];
        if (imagery?.state === 4 && imagery.texture?._texture) {
            gl.bindTexture(gl.TEXTURE_2D, imagery.texture._texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
            gl.bindTexture(gl.TEXTURE_2D, null);
            updated = true;
        }
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, previousFlipY);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return updated;
}

function forceReload(layer: Cesium.ImageryLayer, viewer: Cesium.Viewer): void {
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
    provider._reload?.();
}

class CanvasImageryProvider {
    private readonly tilingSchemeValue: Cesium.GeographicTilingScheme;
    private readonly errorEventValue = new Cesium.Event();

    constructor(
        rectangle: Cesium.Rectangle,
        private readonly canvas: HTMLCanvasElement
    ) {
        this.tilingSchemeValue = new Cesium.GeographicTilingScheme({
            rectangle,
            numberOfLevelZeroTilesX: 1,
            numberOfLevelZeroTilesY: 1,
        });
    }

    get rectangle(): Cesium.Rectangle {
        return this.tilingSchemeValue.rectangle;
    }
    get tileWidth(): number {
        return this.canvas.width;
    }
    get tileHeight(): number {
        return this.canvas.height;
    }
    get maximumLevel(): number {
        return 0;
    }
    get minimumLevel(): number {
        return 0;
    }
    get tilingScheme(): Cesium.GeographicTilingScheme {
        return this.tilingSchemeValue;
    }
    get tileDiscardPolicy(): undefined {
        return undefined;
    }
    get errorEvent(): Cesium.Event {
        return this.errorEventValue;
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
    requestImage(): Promise<HTMLCanvasElement> {
        return Promise.resolve(this.canvas);
    }
    getTileCredits(): undefined {
        return undefined;
    }
    pickFeatures(): undefined {
        return undefined;
    }
}

/**
 * 独立硬边界栅格图层。
 *
 * 使用 Canvas 将二维格网转换为 RGBA，再通过单瓦片 ImageryLayer 贴地渲染。
 * 同范围和尺寸更新时会直接上传 WebGL 纹理，避免重建图层。
 */
export class HardEdgeRasterLayer {
    private imageryLayerValue: Cesium.ImageryLayer | null = null;
    private boundsKey: string | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private imageData: ImageData | null = null;
    private colorRamp: HardEdgeColorStop[];
    private gradientEnabled: boolean;
    private row0IsNorth: boolean;
    private maskPolygon: Array<[number, number]> | null;
    private showValue: boolean;
    private opacityValue = 1;
    private currentRectangle: Cesium.Rectangle | null = null;
    private currentGrid: number[][] | null = null;
    private currentRowIndexGrid: number[][] | null = null;
    private currentColumnIndexGrid: number[][] | null = null;
    private gridWidth = 0;
    private gridHeight = 0;
    private eventHandler: Cesium.ScreenSpaceEventHandler | null = null;
    private hoverEntity: Cesium.Entity | null = null;
    private hoveredCell: { xIndex: number; yIndex: number } | null = null;
    private interactionOptions: Required<
        Pick<HardEdgeInteractionOptions, 'enabled' | 'hoverEnabled' | 'hoverAlpha'>
    > &
        Pick<HardEdgeInteractionOptions, 'hoverColor' | 'onCellHover' | 'onCellClick'>;

    constructor(
        private readonly viewer: Cesium.Viewer,
        options: HardEdgeRasterLayerOptions = {}
    ) {
        this.colorRamp = (options.colorRamp ?? DEFAULT_COLOR_RAMP).slice();
        this.gradientEnabled = options.gradientEnabled ?? false;
        this.row0IsNorth = options.row0IsNorth ?? options.clampToGround ?? true;
        this.maskPolygon = options.maskPolygon ?? null;
        this.showValue = options.show ?? true;
        this.interactionOptions = {
            enabled: false,
            hoverEnabled: true,
            hoverColor: Cesium.Color.BLACK,
            hoverAlpha: 0.35,
            onCellHover: undefined,
            onCellClick: undefined,
        };
        if (options.interactionOptions) {
            this.setInteractionOptions(options.interactionOptions);
        }
    }

    get imageryLayer(): Cesium.ImageryLayer | null {
        return this.imageryLayerValue;
    }

    get show(): boolean {
        return this.showValue;
    }

    set show(value: boolean) {
        if (this.showValue === value) return;
        this.showValue = value;
        if (this.imageryLayerValue) this.imageryLayerValue.show = value;
        this.viewer.scene.requestRender();
    }

    get opacity(): number {
        return this.opacityValue;
    }

    set opacity(value: number) {
        this.opacityValue = Math.max(0, Math.min(1, Number(value)));
        if (this.imageryLayerValue) this.imageryLayerValue.alpha = this.opacityValue;
        this.viewer.scene.requestRender();
    }

    public setColorRamp(colorRamp: HardEdgeColorStop[]): void {
        const unchanged =
            this.colorRamp.length === colorRamp.length &&
            this.colorRamp.every((stop, index) => {
                const nextStop = colorRamp[index];
                return (
                    nextStop !== undefined &&
                    stop.maxValue === nextStop.maxValue &&
                    stop.color[0] === nextStop.color[0] &&
                    stop.color[1] === nextStop.color[1] &&
                    stop.color[2] === nextStop.color[2]
                );
            });
        if (unchanged) return;

        this.colorRamp = colorRamp.slice();
        this.redrawCurrentGrid();
    }

    public setGradientEnabled(enabled: boolean): void {
        if (this.gradientEnabled === enabled) return;
        this.gradientEnabled = enabled;
        this.redrawCurrentGrid();
    }

    /** 使用缓存的网格数据重绘色带，无需重新加载源数据。 */
    private redrawCurrentGrid(): void {
        if (
            !this.currentGrid ||
            !this.currentRectangle ||
            !this.canvas ||
            this.gridWidth <= 0 ||
            this.gridHeight <= 0
        ) {
            return;
        }

        const context = this.canvas.getContext('2d');
        if (!context) return;
        if (
            !this.imageData ||
            this.imageData.width !== this.gridWidth ||
            this.imageData.height !== this.gridHeight
        ) {
            this.imageData = context.createImageData(this.gridWidth, this.gridHeight);
        }

        this.packGrid(this.currentGrid, this.gridWidth, this.gridHeight, this.currentRectangle);
        context.putImageData(this.imageData, 0, 0);

        if (
            this.imageryLayerValue &&
            !directUpdateTexture(this.imageryLayerValue, this.canvas, this.viewer)
        ) {
            forceReload(this.imageryLayerValue, this.viewer);
        }
        this.viewer.scene.requestRender();
    }

    public setMaskPolygon(maskPolygon: Array<[number, number]> | null): void {
        this.maskPolygon = maskPolygon;
    }

    public setInteractionOptions(options: HardEdgeInteractionOptions): void {
        const previousHoverEnabled = this.interactionOptions.hoverEnabled;
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
        if (previousHoverEnabled && !this.interactionOptions.hoverEnabled) {
            this.clearHover();
        } else {
            this.syncHoverEntity();
        }
        this.ensureInteractionHandler();
    }

    public pickValue(longitude: number, latitude: number): number | null {
        return this.resolveCellFromLonLat(longitude, latitude)?.value ?? null;
    }

    public update(frame: HardEdgeRasterFrame): void {
        const { header, grid, rowIndexGrid, columnIndexGrid } = frame;
        if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0]) || !grid[0].length)
            return;
        const width = grid[0].length;
        const height = grid.length;
        if (width <= 0 || height <= 0) return;

        const opacity = Math.max(0, Math.min(1, frame.opacity ?? 1));
        const rectangle = this.buildRectangle(header, width, height);
        this.currentRectangle = rectangle;
        this.currentGrid = grid;
        this.currentRowIndexGrid = rowIndexGrid ?? null;
        this.currentColumnIndexGrid = columnIndexGrid ?? null;
        this.gridWidth = width;
        this.gridHeight = height;
        const nextBoundsKey = `${rectangle.west}_${rectangle.south}_${rectangle.east}_${rectangle.north}_${width}_${height}`;
        const needsNewLayer =
            !this.imageryLayerValue || this.boundsKey !== nextBoundsKey || !this.canvas;

        if (
            needsNewLayer ||
            !this.canvas ||
            this.canvas.width !== width ||
            this.canvas.height !== height
        ) {
            this.canvas = document.createElement('canvas');
            this.canvas.width = width;
            this.canvas.height = height;
            this.imageData = null;
        }

        const context = this.canvas.getContext('2d');
        if (!context) return;
        if (!this.imageData || this.imageData.width !== width || this.imageData.height !== height) {
            this.imageData = context.createImageData(width, height);
        }

        this.packGrid(grid, width, height, rectangle);
        context.putImageData(this.imageData, 0, 0);
        this.opacityValue = opacity;

        if (needsNewLayer) {
            this.removeImageryLayer();
            const provider = new CanvasImageryProvider(rectangle, this.canvas);
            const layer = new Cesium.ImageryLayer(provider as unknown as Cesium.ImageryProvider, {
                minificationFilter: Cesium.TextureMinificationFilter.NEAREST,
                magnificationFilter: Cesium.TextureMagnificationFilter.NEAREST,
            });
            layer.alpha = opacity;
            layer.show = this.showValue;
            this.viewer.imageryLayers.add(layer);
            this.imageryLayerValue = layer;
            this.boundsKey = nextBoundsKey;
        } else if (this.imageryLayerValue) {
            this.imageryLayerValue.alpha = opacity;
            if (!directUpdateTexture(this.imageryLayerValue, this.canvas, this.viewer)) {
                forceReload(this.imageryLayerValue, this.viewer);
            }
        }

        if (this.interactionOptions.enabled) this.ensureInteractionHandler();
        if (!frame.skipRequestRender) this.viewer.scene.requestRender();
    }

    public destroy(): void {
        this.removeImageryLayer();
        this.destroyInteractionHandler();
        this.clearHover();
        this.boundsKey = null;
        this.canvas = null;
        this.imageData = null;
        this.currentRectangle = null;
        this.currentGrid = null;
        this.currentRowIndexGrid = null;
        this.currentColumnIndexGrid = null;
        this.gridWidth = 0;
        this.gridHeight = 0;
    }

    private removeImageryLayer(): void {
        if (!this.imageryLayerValue) return;
        this.viewer.imageryLayers.remove(this.imageryLayerValue, true);
        this.imageryLayerValue = null;
    }

    private ensureInteractionHandler(): void {
        if (this.eventHandler || !this.interactionOptions.enabled) return;
        this.eventHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
        this.eventHandler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
            this.handleMouseMove(movement.endPosition);
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
        this.eventHandler.setInputAction(
            (movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
                this.handleClick(movement.position);
            },
            Cesium.ScreenSpaceEventType.LEFT_CLICK
        );
    }

    private destroyInteractionHandler(): void {
        if (!this.eventHandler) return;
        this.eventHandler.destroy();
        this.eventHandler = null;
    }

    private handleMouseMove(position: Cesium.Cartesian2): void {
        if (!this.interactionOptions.enabled || !this.imageryLayerValue) return;
        const cell = this.resolveCellFromWindowPosition(position);
        if (!cell) {
            this.clearHover();
            return;
        }
        if (this.interactionOptions.hoverEnabled) {
            const rawIndex = this.resolveGridIndexFromLonLat(cell.longitude, cell.latitude);
            const hoverIndex = rawIndex ?? { xIndex: cell.xIndex, yIndex: cell.yIndex };
            const previous = this.hoveredCell;
            if (previous?.xIndex !== hoverIndex.xIndex || previous?.yIndex !== hoverIndex.yIndex) {
                this.hoveredCell = hoverIndex;
                this.syncHoverEntity();
                this.viewer.scene.requestRender();
            }
        }
        this.interactionOptions.onCellHover?.(cell);
    }

    private handleClick(position: Cesium.Cartesian2): void {
        if (
            !this.interactionOptions.enabled ||
            !this.interactionOptions.onCellClick ||
            !this.imageryLayerValue
        )
            return;
        const cell = this.resolveCellFromWindowPosition(position);
        if (cell) this.interactionOptions.onCellClick(cell);
    }

    private clearHover(): void {
        this.hoveredCell = null;
        if (this.hoverEntity) {
            this.viewer.entities.remove(this.hoverEntity);
            this.hoverEntity = null;
        }
        this.interactionOptions.onCellHover?.(null);
        this.viewer.scene.requestRender();
    }

    private syncHoverEntity(): void {
        if (!this.imageryLayerValue || !this.interactionOptions.hoverEnabled || !this.hoveredCell) {
            if (this.hoverEntity) {
                this.viewer.entities.remove(this.hoverEntity);
                this.hoverEntity = null;
            }
            return;
        }
        const rectangle = this.buildCellRectangle(this.hoveredCell.xIndex, this.hoveredCell.yIndex);
        if (!rectangle) return;
        const hoverColor = this.interactionOptions.hoverColor ?? Cesium.Color.BLACK;
        const color = hoverColor.withAlpha(this.interactionOptions.hoverAlpha);
        if (!this.hoverEntity) {
            this.hoverEntity = this.viewer.entities.add({
                rectangle: {
                    coordinates: rectangle,
                    material: color,
                    classificationType: Cesium.ClassificationType.TERRAIN,
                },
            });
        } else if (this.hoverEntity.rectangle) {
            this.hoverEntity.rectangle.coordinates = new Cesium.ConstantProperty(rectangle);
            this.hoverEntity.rectangle.material = new Cesium.ColorMaterialProperty(color);
        }
    }

    private resolveCellFromWindowPosition(
        position: Cesium.Cartesian2
    ): HardEdgeGridCellInfo | null {
        const cartesian = this.pickCartesian(position);
        if (!cartesian) return null;
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        return this.resolveCellFromLonLat(
            Cesium.Math.toDegrees(cartographic.longitude),
            Cesium.Math.toDegrees(cartographic.latitude)
        );
    }

    private resolveCellFromLonLat(
        longitude: number,
        latitude: number
    ): HardEdgeGridCellInfo | null {
        const gridIndex = this.resolveGridIndexFromLonLat(longitude, latitude);
        if (!gridIndex) return null;
        const valueCell = this.resolveValueCell(gridIndex.xIndex, gridIndex.yIndex);
        if (!valueCell) return null;
        return { ...valueCell, longitude, latitude };
    }

    private resolveGridIndexFromLonLat(
        longitude: number,
        latitude: number
    ): { xIndex: number; yIndex: number } | null {
        if (!this.currentGrid || !this.currentRectangle) return null;
        const west = Cesium.Math.toDegrees(this.currentRectangle.west);
        const east = Cesium.Math.toDegrees(this.currentRectangle.east);
        const south = Cesium.Math.toDegrees(this.currentRectangle.south);
        const north = Cesium.Math.toDegrees(this.currentRectangle.north);
        const longitudeUnit = (longitude - west) / (east - west);
        const latitudeUnit = (latitude - south) / (north - south);
        if (
            !Number.isFinite(longitudeUnit) ||
            !Number.isFinite(latitudeUnit) ||
            longitudeUnit < 0 ||
            longitudeUnit > 1 ||
            latitudeUnit < 0 ||
            latitudeUnit > 1
        )
            return null;
        const xIndex = Math.min(
            this.gridWidth - 1,
            Math.floor(Math.min(longitudeUnit, 0.999999) * this.gridWidth)
        );
        const yUnit = this.row0IsNorth ? 1 - latitudeUnit : latitudeUnit;
        const yIndex = Math.min(
            this.gridHeight - 1,
            Math.floor(Math.min(Math.max(yUnit, 0), 0.999999) * this.gridHeight)
        );
        return { xIndex, yIndex };
    }

    private resolveValueCell(
        xIndex: number,
        yIndex: number
    ): Pick<
        HardEdgeGridCellInfo,
        'xIndex' | 'yIndex' | 'value' | 'rowIndex' | 'columnIndex'
    > | null {
        if (!this.currentGrid) return null;
        const directValue = this.currentGrid[yIndex]?.[xIndex];
        if (Number.isFinite(directValue)) {
            return {
                xIndex,
                yIndex,
                value: directValue as number,
                rowIndex: this.currentRowIndexGrid?.[yIndex]?.[xIndex] ?? yIndex,
                columnIndex: this.currentColumnIndexGrid?.[yIndex]?.[xIndex] ?? xIndex,
            };
        }
        for (let yOffset = -1; yOffset <= 1; yOffset++) {
            for (let xOffset = -1; xOffset <= 1; xOffset++) {
                if (xOffset === 0 && yOffset === 0) continue;
                const nextX = xIndex + xOffset;
                const nextY = yIndex + yOffset;
                if (nextX < 0 || nextX >= this.gridWidth || nextY < 0 || nextY >= this.gridHeight)
                    continue;
                const candidate = this.currentGrid[nextY]?.[nextX];
                if (Number.isFinite(candidate)) {
                    return {
                        xIndex: nextX,
                        yIndex: nextY,
                        value: candidate as number,
                        rowIndex: this.currentRowIndexGrid?.[nextY]?.[nextX] ?? nextY,
                        columnIndex: this.currentColumnIndexGrid?.[nextY]?.[nextX] ?? nextX,
                    };
                }
            }
        }
        return null;
    }

    private buildCellRectangle(xIndex: number, yIndex: number): Cesium.Rectangle | null {
        const rectangle = this.currentRectangle;
        if (!rectangle || this.gridWidth <= 0 || this.gridHeight <= 0) return null;
        const west = Cesium.Math.toDegrees(rectangle.west);
        const east = Cesium.Math.toDegrees(rectangle.east);
        const south = Cesium.Math.toDegrees(rectangle.south);
        const north = Cesium.Math.toDegrees(rectangle.north);
        const longitudeStep = (east - west) / this.gridWidth;
        const latitudeStep = (north - south) / this.gridHeight;
        const cellLongitudeMin = west + longitudeStep * xIndex;
        const cellLongitudeMax = cellLongitudeMin + longitudeStep;
        const cellLatitudeMin = this.row0IsNorth
            ? north - latitudeStep * (yIndex + 1)
            : south + latitudeStep * yIndex;
        const cellLatitudeMax = cellLatitudeMin + latitudeStep;
        return Cesium.Rectangle.fromDegrees(
            cellLongitudeMin,
            cellLatitudeMin,
            cellLongitudeMax,
            cellLatitudeMax
        );
    }

    private pickCartesian(position: Cesium.Cartesian2): Cesium.Cartesian3 | null {
        const scene = this.viewer.scene;
        const ray = this.viewer.camera.getPickRay(position);
        if (ray) {
            const pickedOnGlobe = scene.globe.pick(ray, scene);
            if (pickedOnGlobe) return pickedOnGlobe;
        }
        return this.viewer.camera.pickEllipsoid(position, scene.globe.ellipsoid) ?? null;
    }

    private buildRectangle(
        header: HardEdgeGridHeader,
        width: number,
        height: number
    ): Cesium.Rectangle {
        const { xStart, yStart, xEnd, yEnd, xDelta, yDelta, xSize, ySize } = header;
        if (Number.isFinite(xDelta) && Number.isFinite(yDelta)) {
            const xStop = xStart + (xDelta as number) * (xSize ?? width);
            const yStop = yStart + (yDelta as number) * (ySize ?? height);
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

    private packGrid(
        grid: number[][],
        width: number,
        height: number,
        rectangle: Cesium.Rectangle
    ): void {
        const packed = this.imageData!.data;
        const maskUV = this.buildMaskUV(rectangle);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4;
                const value = grid[y]?.[x] ?? Number.NaN;
                if (!Number.isFinite(value) || value === -1000 || value === 0) {
                    packed[index] = 0;
                    packed[index + 1] = 0;
                    packed[index + 2] = 0;
                    packed[index + 3] = 0;
                    continue;
                }
                if (maskUV && !this.cellMajorityInsidePolygonUV(x, y, width, height, maskUV)) {
                    packed[index] = 0;
                    packed[index + 1] = 0;
                    packed[index + 2] = 0;
                    packed[index + 3] = 0;
                    continue;
                }
                const color = this.gradientEnabled
                    ? this.sampleGradientColor(value)
                    : this.sampleStepColor(value);
                packed[index] = color[0];
                packed[index + 1] = color[1];
                packed[index + 2] = color[2];
                packed[index + 3] = 255;
            }
        }
    }

    private buildMaskUV(rectangle: Cesium.Rectangle): Array<[number, number]> | null {
        if (!this.maskPolygon || this.maskPolygon.length < 3) return null;
        const west = Cesium.Math.toDegrees(rectangle.west);
        const east = Cesium.Math.toDegrees(rectangle.east);
        const south = Cesium.Math.toDegrees(rectangle.south);
        const north = Cesium.Math.toDegrees(rectangle.north);
        const lonRange = east - west;
        const latRange = north - south;
        if (lonRange <= 0 || latRange <= 0) return null;
        return this.maskPolygon.map(([lon, lat]) => {
            return [
                Math.max(0, Math.min(1, (lon - west) / lonRange)),
                Math.max(0, Math.min(1, (lat - south) / latRange)),
            ];
        });
    }

    private cellMajorityInsidePolygonUV(
        x: number,
        y: number,
        width: number,
        height: number,
        polygon: Array<[number, number]>
    ): boolean {
        const uLeft = x / width;
        const uMiddle = (x + 0.5) / width;
        const uRight = (x + 1) / width;
        const tSouth = this.row0IsNorth ? 1 - (y + 1) / height : y / height;
        const tNorth = this.row0IsNorth ? 1 - y / height : (y + 1) / height;
        const tMiddle = (tSouth + tNorth) * 0.5;
        const samples: Array<[number, number]> = [
            [uLeft, tSouth],
            [uRight, tSouth],
            [uLeft, tNorth],
            [uRight, tNorth],
            [uMiddle, tMiddle],
        ];
        let inside = 0;
        for (const [u, t] of samples) {
            if (this.pointInPolygonUV(u, t, polygon)) inside++;
        }
        return inside >= 3;
    }

    private pointInPolygonUV(u: number, t: number, polygon: Array<[number, number]>): boolean {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const [xi, yi] = polygon[i];
            const [xj, yj] = polygon[j];
            if (yi > t !== yj > t && u < xi + ((t - yi) / (yj - yi)) * (xj - xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    private sampleStepColor(value: number): [number, number, number] {
        for (const stop of this.colorRamp) {
            if (value <= stop.maxValue) return stop.color;
        }
        return this.colorRamp[this.colorRamp.length - 1]?.color ?? [0, 0, 0];
    }

    private sampleGradientColor(value: number): [number, number, number] {
        const stops = this.colorRamp;
        if (!stops.length) return [0, 0, 0];
        if (value <= stops[0].maxValue) return stops[0].color;
        for (let i = 1; i < stops.length; i++) {
            const previous = stops[i - 1];
            const current = stops[i];
            if (value <= current.maxValue) {
                const range = current.maxValue - previous.maxValue;
                if (range <= 0) return current.color;
                const ratio = (value - previous.maxValue) / range;
                return [
                    Math.round(previous.color[0] + (current.color[0] - previous.color[0]) * ratio),
                    Math.round(previous.color[1] + (current.color[1] - previous.color[1]) * ratio),
                    Math.round(previous.color[2] + (current.color[2] - previous.color[2]) * ratio),
                ];
            }
        }
        return stops[stops.length - 1].color;
    }
}
