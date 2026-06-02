import * as zip from '@zip.js/zip.js';

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
    /** 为 true/false 时强制纬度行翻转（与 shouldFlipLatitudeRowsForCesium 一致） */
    flipLatitudeRowsForCesium?: boolean;
};

export type GridFrame = {
    header: GridHeader;
    grid: number[][];
    heightMeters?: number;
    opacity?: number;
};

export type LonLat = [number, number];

export type PolygonMask = {
    outer: LonLat[];
    holes: LonLat[][];
    bbox: [number, number, number, number];
};

export type MaskableGridResult = {
    header: GridHeader & { times?: number; levels?: number };
    data: number[][][][] | null;
    getLevelSlice?: (timeIndex: number, levelIndex: number) => number[][];
};

/**
 * Cesium 贴地/纹理第 0 行对应北侧；文件 y 从南向北递增（纬度增大）时，
 * 若不翻转行序，贴图会与地理南北镜像。
 */
export function shouldFlipLatitudeRowsForCesium(header: {
    yDelta?: number;
    yStart?: number;
    yEnd?: number;
    /** 为 true/false 时强制是否翻转纬度行，覆盖 yDelta/yStart/yEnd 推断 */
    flipLatitudeRowsForCesium?: boolean;
}): boolean {
    if (!header) {
        return false;
    }
    if (typeof header.flipLatitudeRowsForCesium === 'boolean') {
        return header.flipLatitudeRowsForCesium;
    }
    const { yDelta, yStart, yEnd } = header;
    if (typeof yDelta === 'number' && Number.isFinite(yDelta) && yDelta !== 0) {
        return yDelta > 0;
    }
    if (
        typeof yStart === 'number' &&
        typeof yEnd === 'number' &&
        Number.isFinite(yStart) &&
        Number.isFinite(yEnd)
    ) {
        return yStart < yEnd;
    }
    return false;
}

function polygonAreaAbs(coords: LonLat[]): number {
    if (!Array.isArray(coords) || coords.length < 3) {
        return 0;
    }
    let sum = 0;
    for (let i = 0; i < coords.length; i++) {
        const [x1, y1] = coords[i];
        const [x2, y2] = coords[(i + 1) % coords.length];
        sum += x1 * y2 - x2 * y1;
    }
    return Math.abs(sum) * 0.5;
}

function ringBbox(coords: LonLat[]): [number, number, number, number] {
    let minLon = Number.POSITIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLon = Number.NEGATIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    coords.forEach(([lon, lat]) => {
        minLon = Math.min(minLon, lon);
        minLat = Math.min(minLat, lat);
        maxLon = Math.max(maxLon, lon);
        maxLat = Math.max(maxLat, lat);
    });
    return [minLon, minLat, maxLon, maxLat];
}

export function normalizeGeoJsonMaskPolygons(input: unknown): PolygonMask[] {
    if (!input || typeof input !== 'object') {
        return [];
    }

    type PolygonGeometryLike = { type: 'Polygon'; coordinates?: unknown[] };
    type MultiPolygonGeometryLike = { type: 'MultiPolygon'; coordinates?: unknown[] };
    type GeoGeometryLike = PolygonGeometryLike | MultiPolygonGeometryLike;
    type GeoFeatureLike = { type: 'Feature'; geometry?: unknown };
    type GeoFeatureCollectionLike = { type: 'FeatureCollection'; features?: unknown[] };

    const candidates: PolygonMask[] = [];
    const normalizeRing = (ring: unknown): LonLat[] | null => {
        if (!Array.isArray(ring)) return null;
        const normalized = ring
            .map((pt) => {
                if (Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
                    return [Number(pt[0]), Number(pt[1])] as LonLat;
                }
                return null;
            })
            .filter((pt): pt is LonLat => {
                return !!pt;
            });
        if (normalized.length < 3) return null;
        const first = normalized[0];
        const last = normalized[normalized.length - 1];
        if (first && last && first[0] === last[0] && first[1] === last[1]) {
            normalized.pop();
        }
        return normalized.length >= 3 ? normalized : null;
    };

    const walkGeometry = (geometry: unknown) => {
        if (!geometry || typeof geometry !== 'object') {
            return;
        }
        const typedGeometry = geometry as GeoGeometryLike;
        if (typedGeometry.type === 'Polygon') {
            const rings = typedGeometry.coordinates;
            if (!Array.isArray(rings) || !rings.length) return;
            const outer = normalizeRing(rings[0]);
            if (!outer) return;
            const holes = rings
                .slice(1)
                .map((ring) => {
                    return normalizeRing(ring);
                })
                .filter((ring): ring is LonLat[] => {
                    return !!ring;
                });
            candidates.push({
                outer,
                holes,
                bbox: ringBbox(outer),
            });
            return;
        }
        if (typedGeometry.type === 'MultiPolygon') {
            const polygons = typedGeometry.coordinates;
            if (!Array.isArray(polygons)) {
                return;
            }
            polygons.forEach((poly: unknown) => {
                if (!Array.isArray(poly) || !poly.length) return;
                const outer = normalizeRing(poly[0]);
                if (!outer) return;
                const holes = poly
                    .slice(1)
                    .map((ring: unknown) => {
                        return normalizeRing(ring);
                    })
                    .filter((ring): ring is LonLat[] => {
                        return !!ring;
                    });
                candidates.push({
                    outer,
                    holes,
                    bbox: ringBbox(outer),
                });
            });
        }
    };

    const maybeGeo = input as GeoFeatureCollectionLike | GeoFeatureLike | GeoGeometryLike;
    if (maybeGeo.type === 'FeatureCollection' && Array.isArray(maybeGeo.features)) {
        maybeGeo.features.forEach((feature) => {
            const typedFeature = feature as GeoFeatureLike;
            walkGeometry(typedFeature?.geometry);
        });
    } else if (maybeGeo.type === 'Feature') {
        walkGeometry(maybeGeo.geometry);
    } else {
        walkGeometry(maybeGeo);
    }

    return candidates.filter((poly) => {
        return polygonAreaAbs(poly.outer) > 0;
    });
}

function pointInPolygon(lon: number, lat: number, polygon: LonLat[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        if (yi > lat !== yj > lat && lon < xi + ((lat - yi) / (yj - yi)) * (xj - xi)) {
            inside = !inside;
        }
    }
    return inside;
}

function isInsideMaskPolygons(lon: number, lat: number, polygons: PolygonMask[]): boolean {
    for (const polygon of polygons) {
        const [minLon, minLat, maxLon, maxLat] = polygon.bbox;
        if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) {
            continue;
        }
        if (!pointInPolygon(lon, lat, polygon.outer)) {
            continue;
        }
        let inHole = false;
        for (const hole of polygon.holes) {
            if (pointInPolygon(lon, lat, hole)) {
                inHole = true;
                break;
            }
        }
        if (!inHole) {
            return true;
        }
    }
    return false;
}

async function buildGridMask(
    header: GridHeader,
    width: number,
    height: number,
    polygons: PolygonMask[],
    logTag?: string
): Promise<Uint8Array> {
    const startAt = performance.now();
    const mask = new Uint8Array(width * height);
    if (!polygons.length || width <= 0 || height <= 0) {
        return mask;
    }
    const west = Math.min(header.xStart, header.xEnd);
    const east = Math.max(header.xStart, header.xEnd);
    const south = Math.min(header.yStart, header.yEnd);
    const north = Math.max(header.yStart, header.yEnd);
    const lonRange = east - west;
    const latRange = north - south;
    if (lonRange <= 0 || latRange <= 0) {
        return mask;
    }
    const row0IsNorth = shouldFlipLatitudeRowsForCesium(header);

    if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
            const projectX = (lon: number) => {
                return ((lon - west) / lonRange) * width;
            };
            const projectY = (lat: number) => {
                return row0IsNorth
                    ? ((north - lat) / latRange) * height
                    : ((lat - south) / latRange) * height;
            };

            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            const traceRing = (ring: LonLat[]) => {
                if (ring.length < 3) return;
                const [startLon, startLat] = ring[0];
                ctx.moveTo(projectX(startLon), projectY(startLat));
                for (let i = 1; i < ring.length; i++) {
                    const [lon, lat] = ring[i];
                    ctx.lineTo(projectX(lon), projectY(lat));
                }
                ctx.closePath();
            };
            polygons.forEach((polygon) => {
                traceRing(polygon.outer);
                polygon.holes.forEach((hole) => {
                    traceRing(hole);
                });
            });
            ctx.fill('evenodd');

            const alpha = ctx.getImageData(0, 0, width, height).data;
            for (let i = 0; i < width * height; i++) {
                mask[i] = alpha[i * 4 + 3] > 0 ? 1 : 0;
            }
            if (logTag) {
                const elapsed = performance.now() - startAt;
                console.info(
                    `${logTag} buildGridMask ${elapsed.toFixed(1)}ms (grid=${width}x${height}, polygons=${polygons.length}, mode=canvas)`
                );
            }
            return mask;
        }
    }

    const lonStep = lonRange / width;
    const latStep = latRange / height;
    for (let y = 0; y < height; y++) {
        const lat = row0IsNorth ? north - (y + 0.5) * latStep : south + (y + 0.5) * latStep;
        for (let x = 0; x < width; x++) {
            const lon = west + (x + 0.5) * lonStep;
            mask[y * width + x] = isInsideMaskPolygons(lon, lat, polygons) ? 1 : 0;
        }
    }
    if (logTag) {
        const elapsed = performance.now() - startAt;
        console.info(
            `${logTag} buildGridMask ${elapsed.toFixed(1)}ms (grid=${width}x${height}, polygons=${polygons.length}, mode=fallback)`
        );
    }
    return mask;
}

function applyMaskToGridInPlace(grid: number[][], mask: Uint8Array): void {
    const height = grid.length;
    const width = grid[0]?.length ?? 0;
    if (height <= 0 || width <= 0 || mask.length !== width * height) {
        return;
    }
    for (let y = 0; y < height; y++) {
        const row = grid[y];
        if (!Array.isArray(row) || row.length !== width) {
            continue;
        }
        for (let x = 0; x < width; x++) {
            if (mask[y * width + x] === 0) {
                row[x] = Number.NaN;
            }
        }
    }
}

function applyMaskToGridCopy(grid: number[][], mask: Uint8Array): number[][] {
    const height = grid.length;
    const width = grid[0]?.length ?? 0;
    if (height <= 0 || width <= 0 || mask.length !== width * height) {
        return grid;
    }
    return grid.map((row, y) => {
        if (!Array.isArray(row) || row.length !== width) {
            return row;
        }
        return row.map((value, x) => {
            return mask[y * width + x] === 0 ? Number.NaN : value;
        });
    });
}

export async function applyPolygonMaskToGridResult(
    result: MaskableGridResult,
    polygons: PolygonMask[],
    options?: { logTag?: string }
): Promise<MaskableGridResult> {
    const startAt = performance.now();
    const logTag = options?.logTag;
    if (!polygons.length) {
        return result;
    }

    const sampleGrid =
        result.data?.[0]?.[0] ?? (result.getLevelSlice ? result.getLevelSlice(0, 0) : null) ?? null;
    if (
        !sampleGrid ||
        !Array.isArray(sampleGrid) ||
        !sampleGrid.length ||
        !Array.isArray(sampleGrid[0]) ||
        !sampleGrid[0].length
    ) {
        return result;
    }

    const width = sampleGrid[0].length;
    const height = sampleGrid.length;
    const mask = await buildGridMask(result.header, width, height, polygons, logTag);

    if (result.data) {
        for (let t = 0; t < result.data.length; t++) {
            const levels = result.data[t];
            if (!Array.isArray(levels)) continue;
            for (let l = 0; l < levels.length; l++) {
                const grid = levels[l];
                if (!Array.isArray(grid) || !grid.length) continue;
                applyMaskToGridInPlace(grid, mask);
            }
        }
        if (logTag) {
            const elapsed = performance.now() - startAt;
            console.info(
                `${logTag} applyPolygonMaskToGridResult ${elapsed.toFixed(1)}ms (mode=data, grid=${width}x${height})`
            );
        }
        return result;
    }

    if (result.getLevelSlice) {
        const originalGetLevelSlice = result.getLevelSlice.bind(result);
        result.getLevelSlice = (timeIndex: number, levelIndex: number) => {
            const grid = originalGetLevelSlice(timeIndex, levelIndex);
            if (!Array.isArray(grid) || !grid.length) {
                return grid;
            }
            return applyMaskToGridCopy(grid, mask);
        };
    }
    if (logTag) {
        const elapsed = performance.now() - startAt;
        console.info(
            `${logTag} applyPolygonMaskToGridResult ${elapsed.toFixed(1)}ms (mode=getLevelSlice, grid=${width}x${height})`
        );
    }
    return result;
}

type WorkerMode = 'header' | 'data';

type WorkerPending = {
    resolve: (value: any) => void;
    reject: (reason?: unknown) => void;
};

export class GridDataReader {
    public header: any;
    public data: any;
    private static perfEnabled = false;
    private static perfStats = new Map<
        string,
        { count: number; totalMs: number; maxMs: number; minMs: number }
    >();
    private static worker: Worker | null = null;
    private static workerReqId = 1;
    private static workerPending = new Map<number, WorkerPending>();

    private static createFlatDataAccessors(header: any, flatData: Float32Array) {
        const times = header?.times ?? 0;
        const levels = header?.levels ?? 0;
        const ySize = header?.ySize ?? 0;
        const xSize = header?.xSize ?? 0;
        const levelStride = ySize * xSize;
        const timeStride = levels * levelStride;
        const levelSliceCache = new Map<number, number[][]>();
        const timeSliceCache = new Map<number, number[][][]>();
        const flipLatRows = shouldFlipLatitudeRowsForCesium(header);

        const getValue = (
            timeIndex: number,
            levelIndex: number,
            latIndex: number,
            lonIndex: number
        ) => {
            const idx =
                timeIndex * timeStride + levelIndex * levelStride + latIndex * xSize + lonIndex;
            return flatData[idx];
        };

        const getLevelSlice = (timeIndex: number, levelIndex: number) => {
            const cacheKey = timeIndex * levels + levelIndex;
            const cached = levelSliceCache.get(cacheKey);
            if (cached) {
                return cached;
            }
            const base = timeIndex * timeStride + levelIndex * levelStride;
            const grid = new Array(ySize);
            for (let y = 0; y < ySize; y++) {
                const row = new Array(xSize);
                const srcY = flipLatRows ? ySize - 1 - y : y;
                const rowBase = base + srcY * xSize;
                for (let x = 0; x < xSize; x++) {
                    row[x] = flatData[rowBase + x];
                }
                grid[y] = row;
            }
            levelSliceCache.set(cacheKey, grid);
            return grid;
        };

        const getTimeSlice = (timeIndex: number) => {
            const cached = timeSliceCache.get(timeIndex);
            if (cached) {
                return cached;
            }
            const levelList = new Array(levels);
            for (let l = 0; l < levels; l++) {
                levelList[l] = getLevelSlice(timeIndex, l);
            }
            timeSliceCache.set(timeIndex, levelList);
            return levelList;
        };

        const getLatLonSlice = (timeIndex: number, levelIndex: number, latIndex: number) => {
            const base = timeIndex * timeStride + levelIndex * levelStride + latIndex * xSize;
            const row = new Array(xSize);
            for (let x = 0; x < xSize; x++) {
                row[x] = flatData[base + x];
            }
            return row;
        };

        return {
            getValue,
            getTimeSlice,
            getLevelSlice,
            getLatLonSlice,
        };
    }

    constructor() {
        this.header = null;
        this.data = null;
    }

    public static setPerfEnabled(enabled: boolean) {
        GridDataReader.perfEnabled = enabled;
    }

    public static resetPerfStats() {
        GridDataReader.perfStats.clear();
    }

    public static getPerfStats() {
        return Array.from(GridDataReader.perfStats.entries()).map(([stage, stat]) => {
            return {
                stage,
                count: stat.count,
                avgMs: stat.totalMs / Math.max(1, stat.count),
                maxMs: stat.maxMs,
                minMs: stat.minMs,
                totalMs: stat.totalMs,
            };
        });
    }

    private static ensureWorker() {
        if (GridDataReader.worker) {
            return GridDataReader.worker;
        }
        if (typeof Worker === 'undefined') {
            return null;
        }
        let worker: Worker;
        try {
            worker = new Worker(new URL('./gridReader.worker.ts', import.meta.url), {
                type: 'module',
            });
        } catch (error) {
            return null;
        }
        worker.onmessage = (event) => {
            const payload = event.data as {
                id: number;
                ok: boolean;
                result?: any;
                error?: string;
                perf?: {
                    decompressMs: number;
                    parseMs: number;
                    totalMs: number;
                    mode: WorkerMode;
                };
            };
            const pending = GridDataReader.workerPending.get(payload.id);
            if (!pending) {
                return;
            }
            GridDataReader.workerPending = new Map(
                Array.from(GridDataReader.workerPending.entries()).filter(([key]) => {
                    return key !== payload.id;
                })
            );
            if (payload.ok) {
                if (payload.perf) {
                    const prefix = payload.perf.mode === 'header' ? 'header' : 'data';
                    GridDataReader.recordPerf(`${prefix}:decompress`, payload.perf.decompressMs);
                    GridDataReader.recordPerf(`${prefix}:parse`, payload.perf.parseMs);
                    GridDataReader.recordPerf(`${prefix}:total`, payload.perf.totalMs);
                }
                pending.resolve(payload.result);
            } else {
                pending.reject(new Error(payload.error || 'worker 读取失败'));
            }
        };
        worker.onerror = (error) => {
            GridDataReader.workerPending.forEach((pending) => {
                pending.reject(error);
            });
            GridDataReader.workerPending.clear();
            GridDataReader.worker = null;
        };
        GridDataReader.worker = worker;
        return worker;
    }

    private static async runInWorker(mode: WorkerMode, compressedFile: Blob) {
        const worker = GridDataReader.ensureWorker();
        if (!worker) {
            return null;
        }
        const arrayBuffer = await compressedFile.arrayBuffer();
        const id = GridDataReader.workerReqId++;
        const task = new Promise<any>((resolve, reject) => {
            GridDataReader.workerPending.set(id, { resolve, reject });
        });
        worker.postMessage({ id, mode, arrayBuffer }, [arrayBuffer]);
        return task;
    }

    private static recordPerf(stage: string, ms: number) {
        if (!GridDataReader.perfEnabled) {
            return;
        }
        const prev = GridDataReader.perfStats.get(stage);
        if (!prev) {
            GridDataReader.perfStats.set(stage, {
                count: 1,
                totalMs: ms,
                maxMs: ms,
                minMs: ms,
            });
        } else {
            GridDataReader.perfStats.set(stage, {
                count: prev.count + 1,
                totalMs: prev.totalMs + ms,
                maxMs: Math.max(prev.maxMs, ms),
                minMs: Math.min(prev.minMs, ms),
            });
        }
    }

    // 主要入口函数 - 只读取头文件
    async readHeaderOnly(compressedFile: Blob) {
        try {
            const workerResult = await GridDataReader.runInWorker('header', compressedFile);
            if (workerResult) {
                this.header = workerResult.header;
                return workerResult;
            }
            const totalStart = performance.now();
            // 1. 解压文件
            const decompressStart = performance.now();
            const fileData = await this.decompressZip(compressedFile);
            GridDataReader.recordPerf('header:decompress', performance.now() - decompressStart);

            // 2. 只解析头文件
            const parseStart = performance.now();
            const result = await this.parseHeaderOnly(fileData);
            GridDataReader.recordPerf('header:parse', performance.now() - parseStart);
            GridDataReader.recordPerf('header:total', performance.now() - totalStart);
            return result;
        } catch (error) {
            console.error('读取头文件失败:', error);
            throw error;
        }
    }

    // 读取完整数据
    async readCompressedGridData(compressedFile: Blob) {
        try {
            const workerResult = await GridDataReader.runInWorker('data', compressedFile);
            if (workerResult) {
                this.header = workerResult.header;
                const flatData =
                    workerResult.flatData instanceof Float32Array
                        ? workerResult.flatData
                        : new Float32Array(workerResult.flatData);
                this.data = flatData;
                const accessors = GridDataReader.createFlatDataAccessors(this.header, flatData);
                return {
                    header: this.header,
                    data: null,
                    flatData,
                    getValue: accessors.getValue,
                    getTimeSlice: accessors.getTimeSlice,
                    getLevelSlice: accessors.getLevelSlice,
                    getLatLonSlice: accessors.getLatLonSlice,
                };
            }
            const totalStart = performance.now();
            // 1. 解压文件
            const decompressStart = performance.now();
            const fileData = await this.decompressZip(compressedFile);
            GridDataReader.recordPerf('data:decompress', performance.now() - decompressStart);

            // 2. 解析完整数据
            const parseStart = performance.now();
            const result = await this.parseGridData(fileData);
            GridDataReader.recordPerf('data:parse', performance.now() - parseStart);
            GridDataReader.recordPerf('data:total', performance.now() - totalStart);
            return result;
        } catch (error) {
            console.error('读取格点数据失败:', error);
            throw error;
        }
    }

    // 解压zip文件
    async decompressZip(compressedFile: Blob) {
        const zipReader = new zip.ZipReader(new zip.BlobReader(compressedFile));

        try {
            // 获取zip文件中的所有条目
            const entries = await zipReader.getEntries();

            if (entries.length === 0) {
                throw new Error('压缩文件中没有文件');
            }

            // 假设zip中只有一个文件（根据你的描述）
            const firstEntry = entries[0] as zip.FileEntry;

            // 获取文件数据
            const fileData = await firstEntry.getData(new zip.Uint8ArrayWriter());

            await zipReader.close();

            return fileData;
        } catch (error) {
            await zipReader.close();
            throw error;
        }
    }

    // 只解析头文件（不读取数据部分）
    async parseHeaderOnly(uint8Array: Uint8Array) {
        let offset = 0;

        // 1. 读取头文件长度（4字节）- 修复这里
        const headerLength = this.readInt32(uint8Array, offset);
        offset += 4;

        console.log(`头文件长度: ${headerLength} 字节`);

        // 2. 读取JSON头文件
        if (offset + headerLength > uint8Array.length) {
            throw new Error('文件格式错误：头文件长度超出文件范围');
        }

        const headerBytes = uint8Array.slice(offset, offset + headerLength);
        offset += headerLength;

        const headerText = new TextDecoder('utf-8').decode(headerBytes);
        this.header = JSON.parse(headerText);

        console.log('头文件信息:', this.header);

        // 计算数据部分大小
        const dataSize = this.calculateDataSize(this.header);
        console.log(`数据部分大小: ${dataSize} 字节`);
        console.log(`文件总大小: ${uint8Array.length} 字节`);

        return {
            header: this.header,
            headerLength,
            dataOffset: offset, // 数据开始的位置
            estimatedDataSize: dataSize,
            totalFileSize: uint8Array.length,
        };
    }

    // 解析完整数据
    async parseGridData(uint8Array: Uint8Array) {
        // 先解析头文件
        const headerInfo = await this.parseHeaderOnly(uint8Array);
        const offset = headerInfo.dataOffset;

        // 3. 读取数据部分
        this.data = this.readGridData(uint8Array, offset, this.header);
        console.log('数据读取完成');

        return {
            header: this.header,
            data: this.data,
            // 提供便捷方法
            getValue: (timeIndex, levelIndex, latIndex, lonIndex) => {
                return this.data[timeIndex][levelIndex][lonIndex][latIndex];
            },
            getTimeSlice: (timeIndex) => {
                return this.data[timeIndex];
            },
            getLevelSlice: (timeIndex, levelIndex) => {
                const { ySize, xSize } = this.header;
                const slice = this.data[timeIndex][levelIndex];
                const flipLatRows = shouldFlipLatitudeRowsForCesium(this.header);
                const grid = new Array(ySize);
                for (let y = 0; y < ySize; y++) {
                    const row = new Array(xSize);
                    const srcY = flipLatRows ? ySize - 1 - y : y;
                    for (let x = 0; x < xSize; x++) {
                        row[x] = slice[x][srcY];
                    }
                    grid[y] = row;
                }
                return grid;
            },
            getLatLonSlice: (timeIndex, levelIndex, latIndex) => {
                const { xSize } = this.header;
                const row = new Array(xSize);
                for (let x = 0; x < xSize; x++) {
                    row[x] = this.data[timeIndex][levelIndex][x][latIndex];
                }
                return row;
            },
        };
    }

    readInt32(uint8Array: Uint8Array, offset: number) {
        if (offset + 4 > uint8Array.length) {
            throw new Error(`读取位置超出范围: offset=${offset}, length=${uint8Array.length}`);
        }

        // 使用Uint8Array直接读取，避免DataView问题
        let value = 0;
        for (let i = 0; i < 4; i++) {
            value |= uint8Array[offset + i] << (8 * i);
        }

        // 如果是负数，进行符号扩展
        if (value & 0x80000000) {
            value = -((~value + 1) & 0xffffffff);
        }

        return value;
    }

    // 计算数据部分的大小
    calculateDataSize(header: any) {
        const { times, levels, ySize, xSize, dataType } = header;

        // 计算每个数据点的大小
        const elementSize = this.getDataTypeSize(dataType);

        // 计算总数据点数
        const totalElements = times * levels * ySize * xSize;

        // 计算总大小
        return totalElements * elementSize;
    }

    // 读取网格数据
    readGridData(uint8Array: Uint8Array, offset: number, header: any) {
        const {
            times,
            levels,
            ySize,
            xSize,
            dataType,
            littleEndian = true,
            unsigned = false,
            dataScale = 1.0,
            dataOffset = 0.0,
            undef,
        } = header;

        // 验证数据大小
        const expectedSize = this.calculateDataSize(header);
        const actualSize = uint8Array.length - offset;

        if (actualSize < expectedSize) {
            console.warn(`数据大小不匹配: 期望 ${expectedSize} 字节, 实际 ${actualSize} 字节`);
        }

        const data = new Array(times);
        const dataView = new DataView(
            uint8Array.buffer,
            uint8Array.byteOffset,
            uint8Array.byteLength
        );
        const elementSize = this.getDataTypeSize(dataType);

        // 根据数据类型创建相应的读取器
        const readDataItem = this.createDataReader(dataType, littleEndian, unsigned);

        for (let t = 0; t < times; t++) {
            data[t] = new Array(levels);

            for (let l = 0; l < levels; l++) {
                data[t][l] = new Array(xSize);
                for (let x = 0; x < xSize; x++) {
                    data[t][l][x] = new Array(ySize);
                }

                for (let y = 0; y < ySize; y++) {
                    for (let x = 0; x < xSize; x++) {
                        // 检查是否超出数组边界
                        if (offset >= uint8Array.length) {
                            throw new Error(
                                `数据读取超出边界: offset=${offset}, arrayLength=${uint8Array.length}`
                            );
                        }

                        const rawValue = readDataItem(dataView, offset);
                        offset += elementSize;

                        // 应用缩放和偏移
                        let finalValue = rawValue * dataScale + dataOffset;

                        // 检查是否为缺省值
                        if (undef !== undefined && Math.abs(finalValue - undef) < 1e-10) {
                            finalValue = NaN;
                        }

                        // 文件顺序仍为 t,l,y,x；内存为 data[t][l][x][y]，等价于对末两维做转置
                        data[t][l][x][y] = finalValue;
                    }
                }
            }
        }

        console.log(`成功读取 ${times * levels * ySize * xSize} 个数据点`);
        return data;
    }

    // 创建数据读取器
    createDataReader(dataType: string, littleEndian: boolean, unsigned: boolean) {
        const type = dataType.toLowerCase();

        switch (type) {
            case 'int8':
                return (view: DataView, offset: number) => {
                    if (offset + 1 > view.byteLength) {
                        throw new Error('读取int8数据时超出边界');
                    }
                    return unsigned ? view.getUint8(offset) : view.getInt8(offset);
                };

            case 'uint8':
                return (view: DataView, offset: number) => {
                    if (offset + 1 > view.byteLength) {
                        throw new Error('读取uint8数据时超出边界');
                    }
                    return view.getUint8(offset);
                };

            case 'int16':
            case 'uint16':
                return (view: DataView, offset: number) => {
                    if (offset + 2 > view.byteLength) {
                        throw new Error('读取16位数据时超出边界');
                    }
                    if (type === 'uint16' || unsigned) {
                        return view.getUint16(offset, littleEndian);
                    }
                    return view.getInt16(offset, littleEndian);
                };

            case 'int32':
            case 'uint32':
                return (view: DataView, offset: number) => {
                    if (offset + 4 > view.byteLength) {
                        throw new Error('读取32位数据时超出边界');
                    }
                    if (type === 'uint32' || unsigned) {
                        return view.getUint32(offset, littleEndian);
                    }
                    return view.getInt32(offset, littleEndian);
                };

            case 'float32':
                return (view: DataView, offset: number) => {
                    if (offset + 4 > view.byteLength) {
                        throw new Error('读取float32数据时超出边界');
                    }
                    return view.getFloat32(offset, littleEndian);
                };

            case 'float64':
                return (view: DataView, offset: number) => {
                    if (offset + 8 > view.byteLength) {
                        throw new Error('读取float64数据时超出边界');
                    }
                    return view.getFloat64(offset, littleEndian);
                };

            default:
                throw new Error(`不支持的数据类型: ${dataType}`);
        }
    }

    // 获取数据类型的大小（字节数）
    getDataTypeSize(dataType: string) {
        const type = dataType.toLowerCase() as keyof typeof sizes;
        const sizes = {
            int8: 1,
            uint8: 1,
            int16: 2,
            uint16: 2,
            int32: 4,
            uint32: 4,
            float32: 4,
            float64: 8,
        };

        const size = sizes[type];
        if (!size) {
            throw new Error(`未知的数据类型: ${dataType}`);
        }
        return size;
    }

    // 获取指定位置的数据
    getValueByLonLat(timeIndex: number, levelIndex: number, lon: number, lat: number) {
        if (!this.header || !this.data) {
            throw new Error('数据未加载');
        }

        const { xStart, yStart, xDelta, yDelta, xSize, ySize } = this.header;

        // 计算最近的网格索引
        const lonIndex = Math.round((lon - xStart) / xDelta);
        const latIndex = Math.round((lat - yStart) / yDelta);

        // 检查边界
        if (lonIndex < 0 || lonIndex >= xSize || latIndex < 0 || latIndex >= ySize) {
            console.warn(`坐标超出范围: lon=${lon}, lat=${lat}`);
            return null;
        }

        return this.data[timeIndex][levelIndex][lonIndex][latIndex];
    }

    // 获取数据子集（减少内存使用）
    getDataSubset(timeRange = null, levelRange = null, latRange = null, lonRange = null) {
        if (!this.data) return null;

        const { times, levels, ySize, xSize } = this.header;

        const tStart = timeRange?.[0] || 0;
        const tEnd = timeRange?.[1] || times;
        const lStart = levelRange?.[0] || 0;
        const lEnd = levelRange?.[1] || levels;
        const yStart = latRange?.[0] || 0;
        const yEnd = latRange?.[1] || ySize;
        const xStart = lonRange?.[0] || 0;
        const xEnd = lonRange?.[1] || xSize;

        const subset = [];

        for (let t = tStart; t < tEnd; t++) {
            subset[t - tStart] = [];

            for (let l = lStart; l < lEnd; l++) {
                subset[t - tStart][l - lStart] = [];

                for (let y = yStart; y < yEnd; y++) {
                    subset[t - tStart][l - lStart][y - yStart] = [];

                    for (let x = xStart; x < xEnd; x++) {
                        subset[t - tStart][l - lStart][y - yStart][x - xStart] =
                            this.data[t][l][x][y];
                    }
                }
            }
        }

        return subset;
    }
}

// 工具函数：只读取头文件
export async function readGridHeaderFromFile(file) {
    const reader = new GridDataReader();

    try {
        const result = await reader.readHeaderOnly(file);

        console.log('头文件读取成功');
        console.log('文件信息:', {
            时间维度: result.header.times,
            层次维度: result.header.levels,
            纬度格点数: result.header.ySize,
            经度格点数: result.header.xSize,
            数据范围: `${result.header.xStart}°E - ${result.header.xEnd}°E, ${result.header.yStart}°N - ${result.header.yEnd}°N`,
            数据类型: result.header.dataType,
            数据大小: `${(result.estimatedDataSize / 1024 / 1024).toFixed(2)} MB`,
        });

        return result;
    } catch (error) {
        console.error('读取头文件失败:', error);
        throw error;
    }
}

// 工具函数：读取完整数据
export async function readGridDataFromFile(file) {
    const reader = new GridDataReader();

    try {
        const result = await reader.readCompressedGridData(file);

        console.log('数据加载成功');
        console.log('数据维度:', {
            时间: result.header.times,
            层次: result.header.levels,
            纬度: result.header.ySize,
            经度: result.header.xSize,
        });

        return result;
    } catch (error) {
        console.error('处理文件失败:', error);
        throw error;
    }
}

// 浏览器使用示例
export async function handleFileUpload(event, readData = false) {
    const file = event.target.files[0];

    if (!file) {
        alert('请选择一个文件');
        return;
    }

    if (!file.name.endsWith('.zip')) {
        alert('请选择zip文件');
        return;
    }

    try {
        if (readData) {
            return await readGridDataFromFile(file);
        } else {
            return await readGridHeaderFromFile(file);
        }
    } catch (error) {
        console.error('文件处理失败:', error);
        alert('文件处理失败: ' + error.message);
    }
}
