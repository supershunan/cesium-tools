import * as Cesium from 'cesium';
import { GridDataReader } from '../../tools/radarLayer/index';
import * as lodash from 'lodash';

export default class CustomVoxel {
    private viewer: Cesium.Viewer;
    public titleSize: number;
    public voxelPrimitives: Cesium.VoxelPrimitive[];
    customShader = new Cesium.CustomShader({
        fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material)
        {
            vec3 voxelNormal = fsInput.attributes.normalEC;
            float diffuse = max(0.0, dot(voxelNormal, czm_lightDirectionEC));
            float lighting = 1.0;

            int tileIndex = fsInput.voxel.tileIndex;
            int sampleIndex = fsInput.voxel.sampleIndex;
            vec3 cellColor = fsInput.metadata.color.rgb * lighting;
            if (tileIndex == u_selectedTile && sampleIndex == u_selectedSample) {
                material.diffuse = mix(cellColor, vec3(1.0), 0.5);
                material.alpha = fsInput.metadata.color.a;
            } else {
                material.diffuse = cellColor;
                material.alpha = fsInput.metadata.color.a;
            }
        }`,
        uniforms: {
            u_selectedTile: {
                type: Cesium.UniformType.INT,
                value: -1.0,
            },
            u_selectedSample: {
                type: Cesium.UniformType.INT,
                value: -1.0,
            },
        },
    });

    constructor(viewer: Cesium.Viewer, titleSize?: number) {
        this.viewer = viewer;
        this.voxelPrimitives = [];
        this.titleSize = titleSize ?? 128;
    }

    public async startRender(url: string) {
        const result = await this.unzipData(url);
        if (!result) {
            return;
        }
        this.viewer.scene.primitives.removeAll();

        this.chunkRenderVoex(result, this.titleSize);
    }

    public chunkRenderVoex(result: any, titleSize: number) {
        const { header, data } = result;
        const tempData = lodash.cloneDeep(data[0][0]);
        const { xSize, xStart, xEnd, xDelta, ySize, yStart, yEnd, yDelta } = header;
        const newResult: {
            header: any;
            data: any;
        }[] = [];

        // 数据结构说明：
        // data[time][level][y][x]，所以data[0][0]是[y][x]二维数组
        // tempData的第一维（行）对应y方向（纬度），长度为ySize
        // tempData的第二维（列）对应x方向（经度），每行长度为xSize
        const actualYSize = ySize || tempData.length || 0;
        const actualXSize = xSize || tempData[0]?.length || 0;

        // 对y方向进行分块（第一维，行方向，纬度方向）
        const yGroup = Math.ceil(actualYSize / titleSize);
        const yRemainder = actualYSize % titleSize;

        // 对x方向进行分块（第二维，列方向，经度方向）
        const xGroup = Math.ceil(actualXSize / titleSize);
        const xRemainder = actualXSize % titleSize;

        let chunkIndex = 0;

        // 双重循环：先按y方向分块（第一维，行），再按x方向分块（第二维，列）
        for (let yIdx = 0; yIdx < yGroup; yIdx++) {
            const yStartSlice = yIdx * titleSize;
            const yEndSlice =
                yIdx === yGroup - 1 && yRemainder > 0
                    ? yStartSlice + yRemainder
                    : yStartSlice + titleSize;
            const yChunkData = tempData.slice(yStartSlice, yEndSlice);

            for (let xIdx = 0; xIdx < xGroup; xIdx++) {
                if (!newResult[chunkIndex]) {
                    newResult[chunkIndex] = {
                        header: {},
                        data: [],
                    };
                }

                // 计算y方向的边界（地理坐标，纬度）
                const yStartBound =
                    yIdx === 0
                        ? yStart !== undefined
                            ? yStart
                            : 0
                        : (yStart !== undefined ? yStart : 0) +
                          (yDelta !== undefined ? yDelta : 1) * yIdx * titleSize;
                const yEndBound =
                    yIdx === yGroup - 1 && yRemainder > 0
                        ? yStartBound + (yDelta !== undefined ? yDelta : 1) * yRemainder
                        : yStartBound + (yDelta !== undefined ? yDelta : 1) * titleSize;

                // 计算x方向的边界（地理坐标，经度）
                const xStartBound = xIdx === 0 ? xStart : xStart + xDelta * xIdx * titleSize;
                const xEndBound =
                    xIdx === xGroup - 1 && xRemainder > 0
                        ? xStartBound + xDelta * xRemainder
                        : xStartBound + xDelta * titleSize;

                newResult[chunkIndex].header = {
                    ...header,
                    ySize: yIdx === yGroup - 1 && yRemainder > 0 ? yRemainder : titleSize,
                    xSize: xIdx === xGroup - 1 && xRemainder > 0 ? xRemainder : titleSize,
                    yStart: yStartBound,
                    yEnd: yEndBound,
                    xStart: xStartBound,
                    xEnd: xEndBound,
                };

                // 对每一行的x方向进行切片（第二维，列方向，经度方向）
                const chunkData = yChunkData.map((row: number[]) => {
                    const xStartSlice = xIdx * titleSize;
                    const xEndSlice =
                        xIdx === xGroup - 1 && xRemainder > 0
                            ? xStartSlice + xRemainder
                            : xStartSlice + titleSize;
                    return row.slice(xStartSlice, xEndSlice);
                });

                newResult[chunkIndex].data = chunkData;
                chunkIndex++;
            }
        }

        Object.values(newResult).forEach((item, index) => {
            this.renderVoex(item);
        });
    }

    public async renderVoex(result: any) {
        const { header, data } = result;
        const bounds = header;

        // 将地理边界转换为体素空间坐标
        const minLon = bounds.xStart;
        const minLat = bounds.yStart;
        const maxLon = bounds.xEnd;
        const maxLat = bounds.yEnd;

        // 计算中心点
        const centerLon = bounds.xStart + (bounds.xEnd - bounds.xStart) / 2;
        const centerLat = bounds.yStart + (bounds.yEnd - bounds.yStart) / 2;
        const centerHeight = 0; // 地面高度

        // 将中心点转换为 Cartesian3
        const center = Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 0);

        // 计算四个角点
        const southwest = Cesium.Cartesian3.fromDegrees(minLon, minLat, centerHeight);
        const northeast = Cesium.Cartesian3.fromDegrees(maxLon, maxLat, centerHeight);
        const northwest = Cesium.Cartesian3.fromDegrees(minLon, maxLat, centerHeight);
        const southeast = Cesium.Cartesian3.fromDegrees(maxLon, minLat, centerHeight);

        // 创建局部坐标系（东-北-上）
        const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
        const inverseTransform = Cesium.Matrix4.inverse(transform, new Cesium.Matrix4());

        // 将边界点转换到局部坐标系
        const localSW = Cesium.Matrix4.multiplyByPoint(
            inverseTransform,
            southwest,
            new Cesium.Cartesian3()
        );
        const localNE = Cesium.Matrix4.multiplyByPoint(
            inverseTransform,
            northeast,
            new Cesium.Cartesian3()
        );
        const localNW = Cesium.Matrix4.multiplyByPoint(
            inverseTransform,
            northwest,
            new Cesium.Cartesian3()
        );
        const localSE = Cesium.Matrix4.multiplyByPoint(
            inverseTransform,
            southeast,
            new Cesium.Cartesian3()
        );

        // 计算局部坐标系中的最小和最大边界
        const minX = Math.min(localSW.x, localNW.x, localSE.x, localNE.x);
        const maxX = Math.max(localSW.x, localNW.x, localSE.x, localNE.x);
        const minY = Math.min(localSW.y, localNW.y, localSE.y, localNE.y);
        const maxY = Math.max(localSW.y, localNW.y, localSE.y, localNE.y);

        // 使用 BOX 形状以便更好地控制边界
        const provider = new ProceduralMultiTileVoxelProvider(Cesium.VoxelShapeType.BOX, data, {
            minBounds: new Cesium.Cartesian3(minX, minY, 0),
            maxBounds: new Cesium.Cartesian3(maxX, maxY, 1),
            globalTransform: transform,
        });

        this.createPrimitive(provider as unknown as Cesium.VoxelProvider);
    }

    private createPrimitive(provider: Cesium.VoxelProvider) {
        const voxelPrimitive = new Cesium.VoxelPrimitive({
            provider: provider,
            customShader: this.customShader,
        });
        voxelPrimitive.nearestSampling = true;
        voxelPrimitive.stepSize = 0.7;
        voxelPrimitive.depthTest = false;

        this.viewer.scene.primitives.add(voxelPrimitive);

        return voxelPrimitive;
    }

    private async unzipData(url: string): Promise<any> {
        let dataResult = {};
        try {
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/zip',
                },
            });
            const gridDataReader = new GridDataReader();
            const data = await gridDataReader.readCompressedGridData(await res.blob());
            dataResult = data;
        } catch (error) {
            console.error('读取ZIP文件错误:', error);
        } finally {
            return dataResult;
        }
    }

    private handlerData() {
        const handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
        handler.setInputAction((movement) => {
            const mousePosition = movement.endPosition;
            const voxelCell = this.viewer.scene.pickVoxel(mousePosition);
            if (!Cesium.defined(voxelCell)) {
                return;
            }
            const { tileIndex, sampleIndex, orientedBoundingBox } = voxelCell;
            const [x, y, z] = Object.values(orientedBoundingBox.center).map(Math.round);
            console.log(`Sample center x = ${x}, y = ${y}, z = ${z}`);
            const rgbaValues = voxelCell.getProperty('color');
            const color = new Cesium.Color(...rgbaValues);
            console.log(color.toCssColorString() || '');

            const currentPosition = this.viewer.scene.pickPosition(mousePosition);
            if (currentPosition) {
                const cartographic = Cesium.Cartographic.fromCartesian(currentPosition);
                const lon = Cesium.Math.toDegrees(cartographic.longitude);
                const lat = Cesium.Math.toDegrees(cartographic.latitude);
                console.log('pickValue', lon, lat);
            }
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }
}

class ProceduralMultiTileVoxelProvider {
    public shape: Cesium.VoxelShapeType;
    public dimensions: Cesium.Cartesian3;
    public names: string[];
    public types: Cesium.MetadataType[];
    public componentTypes: Cesium.MetadataComponentType[];
    /**
     * 减少LOD层级，只使用一个层级
     */
    public availableLevels: number;
    /**
     * 存储原始数据
     */
    public rawData: Float32Array | null;
    /**
     * 存储原始维度
     */
    public rawDimensions: { x: number; y: number } | null;
    public colorRules: { max: number; color: number[] }[];
    /**
     * 设置边界（在局部坐标系中，单位：米）
     * 只显示一层：将高度范围设置得很小，只显示地面层
     */
    public minBounds: Cesium.Cartesian3;
    public maxBounds: Cesium.Cartesian3;
    /**
     * 设置全局变换矩阵，将体素空间映射到地理空间
     */
    public globalTransform: Cesium.Matrix4;
    /**
     * 文件解压内容
     */
    public resultData: number[][];

    constructor(shape: Cesium.VoxelShapeType, resultData: number[][], options: any) {
        this.shape = shape;
        /**
         * x 方向最大设置为 157（Cesium的限制）
         * y 方向理论上无最大值限制，但为了性能也建议限制
         */
        const maxTileSize = 157;

        // 计算实际数据维度（分块后的数据）
        // 数据结构说明：
        // resultData是data[0][0]，即[y][x]二维数组
        // resultData的第一维（行）对应y方向（纬度），长度为resultData.length
        // resultData的第二维（列）对应x方向（经度），每行长度为resultData[0].length
        const actualYSize = resultData.length; // y方向（第一维，行数，纬度）
        const actualXSize = resultData[0]?.length || 0; // x方向（第二维，列数，经度）

        // Cesium的dimensions说明：
        // dimensions.x对应数据的列数（x方向，经度），dimensions.y对应数据的行数（y方向，纬度）
        // 所以需要确保dimensions.x（即actualXSize，经度方向）不超过157
        const clampedXSize = Math.min(actualXSize, maxTileSize); // Cesium的x维度对应数据的x方向（列数，经度）
        const clampedYSize = actualYSize; // Cesium的y维度对应数据的y方向（行数，纬度）

        // 如果实际列数超过限制，会在downsampleDataForTile中进行降采样处理
        this.dimensions = new Cesium.Cartesian3(clampedXSize, clampedYSize, 1);

        // 添加调试信息
        if (actualXSize > maxTileSize) {
            console.warn(
                `警告：分块后的数据x方向维度(${actualXSize})超过Cesium限制(${maxTileSize})，将进行降采样处理`
            );
        }

        this.names = ['color'];
        this.types = [Cesium.MetadataType.VEC4];
        this.componentTypes = [Cesium.MetadataComponentType.FLOAT32];
        this.availableLevels = 1;
        this.rawData = null;
        this.rawDimensions = null;
        // this.colorRules = [
        //     { max: 10, color: [62 / 255, 160 / 255, 239 / 255, 0] },
        //     { max: 15, color: [62 / 255, 160 / 255, 239 / 255, 1] },
        //     { max: 20, color: [108 / 255, 225 / 255, 238 / 255, 1] },
        //     { max: 25, color: [96 / 255, 214 / 255, 63 / 255, 1] },
        //     { max: 30, color: [70 / 255, 137 / 255, 37 / 255, 1] },
        //     { max: 35, color: [252 / 255, 251 / 255, 74 / 255, 1] },
        //     { max: 40, color: [223 / 255, 195 / 255, 73 / 255, 1] },
        //     { max: 45, color: [239 / 255, 147 / 255, 47 / 255, 1] },
        //     { max: 50, color: [231 / 255, 53 / 255, 31 / 255, 1] },
        //     { max: 55, color: [184 / 255, 43 / 255, 41 / 255, 1] },
        //     { max: 60, color: [183 / 255, 36 / 255, 28 / 255, 1] },
        //     { max: 65, color: [236 / 255, 62 / 255, 237 / 255, 1] },
        //     { max: 70, color: [132 / 255, 39 / 255, 179 / 255, 1] },
        //     { max: Infinity, color: [174 / 255, 148 / 255, 237 / 255, 1] },
        // ];
        this.colorRules = [
            { max: 10, color: [0 / 255, 235 / 255, 14 / 255, 1] },
            { max: 20, color: [0 / 255, 102 / 255, 255 / 255, 1] },
            { max: 30, color: [255 / 255, 225 / 255, 0 / 255, 1] },
            { max: 40, color: [255 / 255, 153 / 255, 0 / 255, 1] },
            { max: Infinity, color: [255 / 255, 0 / 255, 0 / 255, 1] },
        ];

        this.minBounds = options.minBounds;
        this.maxBounds = options.maxBounds;
        this.globalTransform = options.globalTransform;
        this.resultData = resultData;
    }

    public async requestData(options: any) {
        const { tileLevel } = options;

        if (tileLevel >= this.availableLevels) {
            return Promise.reject(`No tiles available beyond level ${this.availableLevels - 1}`);
        }

        if (!this.rawData) {
            const nestedArray = this.resultData;

            // 计算实际数据的维度
            let ySize, xSize;
            if (Array.isArray(nestedArray) && Array.isArray(nestedArray[0])) {
                ySize = nestedArray.length;
                xSize = nestedArray[0].length;
            } else {
                const totalPoints = Array.isArray(nestedArray) ? nestedArray.length : 0;
                xSize = Math.ceil(Math.sqrt(totalPoints));
                ySize = Math.ceil(totalPoints / xSize);
            }

            this.rawDimensions = { x: xSize, y: ySize };
            this.rawData = this.transformNestedArrayToColorArray(nestedArray);

            // 计算降采样后的tile数据
            // 对于大尺寸数据，我们需要降采样或分块
            const tileData = this.downsampleDataForTile();

            const content = Cesium.VoxelContent.fromMetadataArray([tileData]);
            return Promise.resolve(content);
        }
    }

    /**
     * 降采样数据以适应tile
     * @returns
     */
    public downsampleDataForTile() {
        const dimensions = this.dimensions;
        const tileWidth = dimensions.x;
        const tileHeight = dimensions.y;

        // 如果没有原始数据，返回空tile
        if (!this.rawData || !this.rawDimensions) {
            console.warn('原始数据未加载，返回空tile');
            return new Float32Array(tileWidth * tileHeight * dimensions.z * 4);
        }

        // 如果原始数据小于等于tile尺寸，直接使用原始数据（需要填充）
        if (this.rawDimensions.x <= tileWidth && this.rawDimensions.y <= tileHeight) {
            const tileData = new Float32Array(tileWidth * tileHeight * dimensions.z * 4);
            const copyWidth = this.rawDimensions.x;
            const copyHeight = this.rawDimensions.y;

            for (let y = 0; y < copyHeight; y++) {
                for (let x = 0; x < copyWidth; x++) {
                    const srcIndex = (y * this.rawDimensions.x + x) * 4;
                    const dstIndex = (y * tileWidth + x) * 4;
                    if (srcIndex + 4 <= this.rawData.length) {
                        tileData.set(this.rawData.subarray(srcIndex, srcIndex + 4), dstIndex);
                    }
                }
            }
            return tileData;
        }

        // 降采样：计算采样步长
        const scaleX = this.rawDimensions.x / tileWidth;
        const scaleY = this.rawDimensions.y / tileHeight;

        const tileData = new Float32Array(tileWidth * tileHeight * dimensions.z * 4);

        for (let ty = 0; ty < tileHeight; ty++) {
            for (let tx = 0; tx < tileWidth; tx++) {
                // 计算在原始数据中的位置（使用最近邻采样）
                const srcX = Math.min(Math.floor(tx * scaleX), this.rawDimensions.x - 1);
                const srcY = Math.min(Math.floor(ty * scaleY), this.rawDimensions.y - 1);

                const srcIndex = (srcY * this.rawDimensions.x + srcX) * 4;
                const dstIndex = (ty * tileWidth + tx) * 4;

                // 边界检查
                if (srcIndex + 4 <= this.rawData.length) {
                    tileData.set(this.rawData.subarray(srcIndex, srcIndex + 4), dstIndex);
                }
            }
        }

        return tileData;
    }

    /**
     * 坐标数据转为 rgba
     * @param nestedArray 坐标数据
     * @returns
     */
    private transformNestedArrayToColorArray(nestedArray: number[][]) {
        const flatArray = nestedArray.flat();

        const colorArrays = flatArray.map((value: number) => {
            const rule = this.colorRules.find((rule) => value <= rule.max);
            return rule ? rule.color : [0, 0, 0, 0];
        });
        return new Float32Array(colorArrays.flat());
    }
}
