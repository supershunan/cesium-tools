import * as zip from '@zip.js/zip.js';
export { DynamicRasterLayer } from './DynamicRasterLayer';
export type { GridFrame, GridHeader } from './DynamicRasterLayer';

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
                const rowBase = base + y * xSize;
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
                return this.data[timeIndex][levelIndex][latIndex][lonIndex];
            },
            getTimeSlice: (timeIndex) => {
                return this.data[timeIndex];
            },
            getLevelSlice: (timeIndex, levelIndex) => {
                return this.data[timeIndex][levelIndex];
            },
            getLatLonSlice: (timeIndex, levelIndex, latIndex) => {
                return this.data[timeIndex][levelIndex][latIndex];
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
                data[t][l] = new Array(ySize);

                for (let y = 0; y < ySize; y++) {
                    data[t][l][y] = new Array(xSize);

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

                        data[t][l][y][x] = finalValue;
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

        return this.data[timeIndex][levelIndex][latIndex][lonIndex];
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
                            this.data[t][l][y][x];
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
