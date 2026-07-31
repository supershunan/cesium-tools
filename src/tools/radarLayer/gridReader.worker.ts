import * as zip from '@zip.js/zip.js';

type WorkerMode = 'header' | 'data';

type WorkerRequest = {
    id: number;
    mode: WorkerMode;
    arrayBuffer: ArrayBuffer;
};

type GridHeader = {
    times: number;
    levels: number;
    ySize: number;
    xSize: number;
    dataType: string;
    littleEndian?: boolean;
    unsigned?: boolean;
    dataScale?: number;
    dataOffset?: number;
    undef?: number;
    xStart: number;
    yStart: number;
    xEnd: number;
    yEnd: number;
    xDelta?: number;
    yDelta?: number;
    levelList?: Array<string | number>;
};

const getDataTypeSize = (dataType: string) => {
    const sizes: Record<string, number> = {
        int8: 1,
        uint8: 1,
        int16: 2,
        uint16: 2,
        int32: 4,
        uint32: 4,
        float32: 4,
        float64: 8,
    };
    const size = sizes[dataType.toLowerCase()];
    if (!size) {
        throw new Error(`未知的数据类型: ${dataType}`);
    }
    return size;
};

const calculateDataSize = (header: GridHeader) => {
    const elementSize = getDataTypeSize(header.dataType);
    return header.times * header.levels * header.ySize * header.xSize * elementSize;
};

const readInt32 = (uint8Array: Uint8Array, offset: number) => {
    if (offset + 4 > uint8Array.length) {
        throw new Error(`读取位置超出范围: offset=${offset}, length=${uint8Array.length}`);
    }
    let value = 0;
    for (let i = 0; i < 4; i++) {
        value |= uint8Array[offset + i] << (8 * i);
    }
    if (value & 0x80000000) {
        value = -((~value + 1) & 0xffffffff);
    }
    return value;
};

const createDataReader = (dataType: string, littleEndian: boolean, unsigned: boolean) => {
    const type = dataType.toLowerCase();
    switch (type) {
        case 'int8':
            return (view: DataView, offset: number) => {
                return unsigned ? view.getUint8(offset) : view.getInt8(offset);
            };
        case 'uint8':
            return (view: DataView, offset: number) => {
                return view.getUint8(offset);
            };
        case 'int16':
        case 'uint16':
            return (view: DataView, offset: number) => {
                if (type === 'uint16' || unsigned) {
                    return view.getUint16(offset, littleEndian);
                }
                return view.getInt16(offset, littleEndian);
            };
        case 'int32':
        case 'uint32':
            return (view: DataView, offset: number) => {
                if (type === 'uint32' || unsigned) {
                    return view.getUint32(offset, littleEndian);
                }
                return view.getInt32(offset, littleEndian);
            };
        case 'float32':
            return (view: DataView, offset: number) => {
                return view.getFloat32(offset, littleEndian);
            };
        case 'float64':
            return (view: DataView, offset: number) => {
                return view.getFloat64(offset, littleEndian);
            };
        default:
            throw new Error(`不支持的数据类型: ${dataType}`);
    }
};

const parseHeaderOnly = (uint8Array: Uint8Array) => {
    let offset = 0;
    const headerLength = readInt32(uint8Array, offset);
    offset += 4;
    if (offset + headerLength > uint8Array.length) {
        throw new Error('文件格式错误：头文件长度超出文件范围');
    }
    const headerBytes = uint8Array.slice(offset, offset + headerLength);
    offset += headerLength;
    const headerText = new TextDecoder('utf-8').decode(headerBytes);
    const header = JSON.parse(headerText) as GridHeader;
    return {
        header,
        headerLength,
        dataOffset: offset,
        estimatedDataSize: calculateDataSize(header),
        totalFileSize: uint8Array.length,
    };
};

/* eslint-disable max-depth */
const readGridDataFlat = (uint8Array: Uint8Array, offset: number, header: GridHeader) => {
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
    const expectedSize = calculateDataSize(header);
    const actualSize = uint8Array.length - offset;
    if (actualSize < expectedSize) {
        // no-op: keep behavior tolerant
    }
    const totalCount = times * levels * ySize * xSize;
    const flatData = new Float32Array(totalCount);
    const view = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
    const elementSize = getDataTypeSize(dataType);
    const readDataItem = createDataReader(dataType, littleEndian, unsigned);

    let writeIndex = 0;
    for (let t = 0; t < times; t++) {
        for (let l = 0; l < levels; l++) {
            for (let y = 0; y < ySize; y++) {
                for (let x = 0; x < xSize; x++) {
                    if (offset >= uint8Array.length) {
                        throw new Error(
                            `数据读取超出边界: offset=${offset}, arrayLength=${uint8Array.length}`
                        );
                    }
                    const rawValue = readDataItem(view, offset);
                    offset += elementSize;
                    let finalValue = rawValue * dataScale + dataOffset;
                    if (undef !== undefined && Math.abs(finalValue - undef) < 1e-10) {
                        finalValue = Number.NaN;
                    }
                    flatData[writeIndex] = finalValue;
                    writeIndex += 1;
                }
            }
        }
    }
    return flatData;
};
/* eslint-enable max-depth */

const parseGridData = (uint8Array: Uint8Array) => {
    const headerInfo = parseHeaderOnly(uint8Array);
    const flatData = readGridDataFlat(uint8Array, headerInfo.dataOffset, headerInfo.header);
    return {
        header: headerInfo.header,
        flatData,
    };
};

const decompressZip = async (arrayBuffer: ArrayBuffer) => {
    const compressedFile = new Blob([arrayBuffer]);
    const zipReader = new zip.ZipReader(new zip.BlobReader(compressedFile));
    try {
        const entries = await zipReader.getEntries();
        if (entries.length === 0) {
            throw new Error('压缩文件中没有文件');
        }
        const firstEntry = entries[0] as zip.FileEntry;
        return await firstEntry.getData(new zip.Uint8ArrayWriter());
    } finally {
        await zipReader.close();
    }
};

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const { id, mode, arrayBuffer } = event.data;
    try {
        const totalStart = performance.now();
        const decompressStart = performance.now();
        const fileData = await decompressZip(arrayBuffer);
        const decompressMs = performance.now() - decompressStart;
        const parseStart = performance.now();
        const result = mode === 'header' ? parseHeaderOnly(fileData) : parseGridData(fileData);
        const parseMs = performance.now() - parseStart;
        const totalMs = performance.now() - totalStart;
        const messagePayload = {
            id,
            ok: true,
            result,
            perf: {
                decompressMs,
                parseMs,
                totalMs,
                mode,
            },
        };
        const transferList: Transferable[] = [];
        if (mode === 'data' && 'flatData' in result && result.flatData instanceof Float32Array) {
            transferList.push(result.flatData.buffer);
        }
        const workerScope = self as unknown as {
            postMessage: (message: unknown, transfer?: Transferable[]) => void;
        };
        workerScope.postMessage(messagePayload, transferList);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        self.postMessage({
            id,
            ok: false,
            error: message,
        });
    }
};
