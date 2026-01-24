import * as zip from '@zip.js/zip.js';

export class GridDataReader {
    public header: any;
    public data: any;

    constructor() {
        this.header = null;
        this.data = null;
    }

    // 主要入口函数 - 只读取头文件
    async readHeaderOnly(compressedFile: Blob) {
        try {
            // 1. 解压文件
            const fileData = await this.decompressZip(compressedFile);

            // 2. 只解析头文件
            return await this.parseHeaderOnly(fileData);
        } catch (error) {
            console.error('读取头文件失败:', error);
            throw error;
        }
    }

    // 读取完整数据
    async readCompressedGridData(compressedFile: Blob) {
        try {
            // 1. 解压文件
            const fileData = await this.decompressZip(compressedFile);

            // 2. 解析完整数据
            return await this.parseGridData(fileData);
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
        console.log('数据:', this.data);

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

                        const rawValue = readDataItem(uint8Array, offset);
                        offset += this.getDataTypeSize(dataType);

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
                return (arr: Uint8Array, offset: number) => {
                    const value = arr[offset];
                    return unsigned ? value : (value << 24) >> 24;
                };

            case 'uint8':
                return (arr: Uint8Array, offset: number) => arr[offset];

            case 'int16':
            case 'uint16':
                return (arr: Uint8Array, offset: number) => {
                    if (offset + 2 > arr.length) {
                        throw new Error('读取16位数据时超出边界');
                    }

                    let value;
                    if (littleEndian) {
                        value = arr[offset] | (arr[offset + 1] << 8);
                    } else {
                        value = (arr[offset] << 8) | arr[offset + 1];
                    }

                    if (type === 'int16' && !unsigned && value & 0x8000) {
                        value = -((~value + 1) & 0xffff);
                    }

                    return value;
                };

            case 'int32':
            case 'uint32':
                return (arr: Uint8Array, offset: number) => {
                    if (offset + 4 > arr.length) {
                        throw new Error('读取32位数据时超出边界');
                    }

                    let value = 0;
                    if (littleEndian) {
                        for (let i = 0; i < 4; i++) {
                            value |= arr[offset + i] << (8 * i);
                        }
                    } else {
                        for (let i = 0; i < 4; i++) {
                            value |= arr[offset + i] << (8 * (3 - i));
                        }
                    }

                    if (type === 'int32' && !unsigned && value & 0x80000000) {
                        value = -((~value + 1) & 0xffffffff);
                    }

                    return value;
                };

            case 'float32':
                return (arr, offset) => {
                    if (offset + 4 > arr.length) {
                        throw new Error('读取float32数据时超出边界');
                    }

                    // 创建DataView读取浮点数
                    const buffer = arr.buffer.slice(offset, offset + 4);
                    const view = new DataView(buffer);
                    return view.getFloat32(0, littleEndian);
                };

            case 'float64':
                return (arr, offset) => {
                    if (offset + 8 > arr.length) {
                        throw new Error('读取float64数据时超出边界');
                    }

                    const buffer = arr.buffer.slice(offset, offset + 8);
                    const view = new DataView(buffer);
                    return view.getFloat64(0, littleEndian);
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
