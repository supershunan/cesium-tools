import React from 'react';
import * as Cesium from 'cesium';
import { useEffect } from 'react';
import { GridDataReader } from '../tools/radarLayer';

export default function Voxel({ viewer }: { viewer: Cesium.Viewer }) {
    const globalTransform = Cesium.Matrix4.fromScale(
        Cesium.Cartesian3.fromElements(
            Cesium.Ellipsoid.WGS84.maximumRadius,
            Cesium.Ellipsoid.WGS84.maximumRadius,
            Cesium.Ellipsoid.WGS84.maximumRadius
        )
    );

    const scratchColor = new Cesium.Color();

    useEffect(() => {
        if (viewer) {
            viewer.extend(Cesium.viewerVoxelInspectorMixin);
            viewer.scene.debugShowFramesPerSecond = true;
            getVoxel();

        }
    }, [viewer]);

    const getNcData = async (): Promise<any> => {
        let dataResult = {};
        try {
            const res = await fetch('/public/resources/SX002_20250809190000_CR.zip', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/zip',
                },
            });
            const gridDataReader = new GridDataReader();
            const data = await gridDataReader.readCompressedGridData(await res.blob());
            dataResult = data;
            console.log('wkkk', dataResult);
        } catch (error) {
            console.error('读取ZIP文件错误:', error);
        } finally {
            return dataResult;
        }
    };

    const getVoxel = async () => {
        const result = await getNcData();
        if (!result) {
            return;
        }
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
        const provider = new ProceduralMultiTileVoxelProvider(Cesium.VoxelShapeType.BOX);

        // 设置较小的tile尺寸以避免megatexture溢出
        // 对于大尺寸数据（如470x470），使用降采样到128x128
        const maxTileSize = 128;
        provider.dimensions = new Cesium.Cartesian3(maxTileSize, maxTileSize, 1);
        console.log(`设置tile dimensions: ${maxTileSize}x${maxTileSize}x1 (将自动降采样原始数据)`);

        // 设置边界（在局部坐标系中，单位：米）
        // 只显示一层：将高度范围设置得很小，只显示地面层
        const layerHeight = 100; // 层高度（米），只显示一层体素
        provider.minBounds = new Cesium.Cartesian3(
            minX,
            minY,
            0 // 从地面开始
        );
        provider.maxBounds = new Cesium.Cartesian3(
            maxX,
            maxY,
            1 // 只显示一层的高度
        );

        // 设置全局变换矩阵，将体素空间映射到地理空间
        provider.globalTransform = transform;

        createPrimitive(provider);

        // const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        // const pickedCoordinate = document.getElementById('pickedCoordinate');
        // const pickedColor = document.getElementById('pickedColor');
        // handler.setInputAction((movement) => {
        //     const mousePosition = movement.endPosition;
        //     const voxelCell = viewer.scene.pickVoxel(mousePosition);
        //     if (!Cesium.defined(voxelCell)) {
        //         return;
        //     }
        //     const { tileIndex, sampleIndex, orientedBoundingBox } = voxelCell;
        //     const [x, y, z] = Object.values(orientedBoundingBox.center).map(Math.round);
        //     pickedCoordinate.innerHTML = `Sample center x = ${x}, y = ${y}, z = ${z}`;
        //     const rgbaValues = voxelCell.getProperty('color');
        //     const color = new Cesium.Color(...rgbaValues);
        //     pickedColor.style.backgroundColor = color.toCssColorString() || '';

        //     const { customShader } = voxelCell.primitive;
        //     customShader.setUniform('u_selectedTile', tileIndex);
        //     customShader.setUniform('u_selectedSample', sampleIndex);
        // }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    };

    function ProceduralMultiTileVoxelProvider(shape: Cesium.VoxelShapeType) {
        this.shape = shape;
        // 降低dimensions以避免megatexture溢出
        // 对于220900个点，使用降采样：470x470 -> 约128x128（或更小）
        // 这样可以减少单个tile的大小
        const maxTileSize = 128; // 限制单个tile的最大尺寸
        this.dimensions = new Cesium.Cartesian3(maxTileSize, maxTileSize, 1);
        this.names = ['color'];
        this.types = [Cesium.MetadataType.VEC4];
        this.componentTypes = [Cesium.MetadataComponentType.FLOAT32];
        this.availableLevels = 1; // 减少LOD层级，只使用一个层级
        this.rawData = null; // 存储原始数据
        this.rawDimensions = null; // 存储原始维度
    }

    ProceduralMultiTileVoxelProvider.prototype.requestData = async function (options) {
        const { tileLevel, tileX, tileY, tileZ } = options;

        if (tileLevel >= this.availableLevels) {
            return Promise.reject(`No tiles available beyond level ${this.availableLevels - 1}`);
        }

        // 只在第一次请求时加载数据
        if (!this.rawData) {
            const resultData = await getNcData();
            const nestedArray = resultData.data[0][0];

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
            this.rawData = transformNestedArrayToColorArray(nestedArray);
            console.log(`原始数据维度: ${xSize} x ${ySize} = ${xSize * ySize} 个点`);
        }

        const dimensions = this.dimensions;
        const type = this.types[0];

        // 计算降采样后的tile数据
        // 对于大尺寸数据，我们需要降采样或分块
        const tileData = this.downsampleDataForTile(tileX, tileY, tileZ);
        console.log('wkkk5', tileData);

        const content = Cesium.VoxelContent.fromMetadataArray([tileData]);
        return Promise.resolve(content);
    };

    // 降采样数据以适应tile
    ProceduralMultiTileVoxelProvider.prototype.downsampleDataForTile = function (tileX, tileY, tileZ) {
        const dimensions = this.dimensions;
        const tileSize = dimensions.x; // 假设是正方形tile

        // 如果没有原始数据，返回空tile
        if (!this.rawData || !this.rawDimensions) {
            console.warn('原始数据未加载，返回空tile');
            return new Float32Array(tileSize * tileSize * dimensions.z * 4);
        }

        // 如果原始数据小于等于tile尺寸，直接使用原始数据（需要填充）
        if (this.rawDimensions.x <= tileSize && this.rawDimensions.y <= tileSize) {
            const tileData = new Float32Array(tileSize * tileSize * dimensions.z * 4);
            const copyWidth = this.rawDimensions.x;
            const copyHeight = this.rawDimensions.y;

            for (let y = 0; y < copyHeight; y++) {
                for (let x = 0; x < copyWidth; x++) {
                    const srcIndex = (y * this.rawDimensions.x + x) * 4;
                    const dstIndex = (y * tileSize + x) * 4;
                    if (srcIndex + 4 <= this.rawData.length) {
                        tileData.set(this.rawData.subarray(srcIndex, srcIndex + 4), dstIndex);
                    }
                }
            }
            return tileData;
        }

        // 降采样：计算采样步长
        const scaleX = this.rawDimensions.x / tileSize;
        const scaleY = this.rawDimensions.y / tileSize;

        const tileData = new Float32Array(tileSize * tileSize * dimensions.z * 4);

        for (let ty = 0; ty < tileSize; ty++) {
            for (let tx = 0; tx < tileSize; tx++) {
                // 计算在原始数据中的位置（使用最近邻采样）
                const srcX = Math.min(Math.floor(tx * scaleX), this.rawDimensions.x - 1);
                const srcY = Math.min(Math.floor(ty * scaleY), this.rawDimensions.y - 1);

                const srcIndex = (srcY * this.rawDimensions.x + srcX) * 4;
                const dstIndex = (ty * tileSize + tx) * 4;

                // 边界检查
                if (srcIndex + 4 <= this.rawData.length) {
                    tileData.set(this.rawData.subarray(srcIndex, srcIndex + 4), dstIndex);
                }
            }
        }

        return tileData;
    };

    function constructRandomTileData(dimensions, type, randomSeed) {
        Cesium.Math.setRandomNumberSeed(randomSeed);
        const voxelCount = dimensions.x * dimensions.y * dimensions.z;
        const channelCount = Cesium.MetadataType.getComponentCount(type);
        const dataColor = new Float32Array(voxelCount * channelCount);

        for (let z = 0; z < dimensions.z; z++) {
            const indexZ = z * dimensions.y * dimensions.x;
            for (let y = 0; y < dimensions.y; y++) {
                const indexZY = indexZ + y * dimensions.x;
                for (let x = 0; x < dimensions.x; x++) {
                    const lerperY = y / (dimensions.y - 1);

                    const h = Cesium.Math.nextRandomNumber();
                    const s = 1.0 - lerperY * 0.2;
                    const l = 0.5;
                    const color = Cesium.Color.fromHsl(h, s, l, 1.0, scratchColor);

                    const random2 = Cesium.Math.nextRandomNumber();
                    const alphaRandom = Math.floor(random2 + 0.5);

                    const index = (indexZY + x) * channelCount;
                    dataColor[index + 0] = color.red;
                    dataColor[index + 1] = color.green;
                    dataColor[index + 2] = color.blue;
                    dataColor[index + 3] = alphaRandom;
                }
            }
        }

        return dataColor;
    }

    const customShader = new Cesium.CustomShader({
        fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material)
        {
            vec3 voxelNormal = fsInput.attributes.normalEC;
            float diffuse = max(0.0, dot(voxelNormal, czm_lightDirectionEC));
            float lighting = 0.5 + 0.5 * diffuse;

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

    function createPrimitive(provider) {
        viewer.scene.primitives.removeAll();

        const voxelPrimitive = new Cesium.VoxelPrimitive({
            provider: provider,
            customShader: customShader,
        });
        voxelPrimitive.nearestSampling = true;
        voxelPrimitive.stepSize = 0.7;
        voxelPrimitive.depthTest = false;

        viewer.scene.primitives.add(voxelPrimitive);
        viewer.camera.flyToBoundingSphere(voxelPrimitive.boundingSphere, {
            duration: 0.0,
        });

        return voxelPrimitive;
    }

    function transformNestedArrayToColorArray(nestedArray) {
        // 颜色规则查找表
        const colorRules = [
            // 范围 [min, max) -> 颜色数组
            { max: 10, color: [62 / 255, 160 / 255, 239 / 255, 0] },
            { max: 15, color: [62 / 255, 160 / 255, 239 / 255, 1] },
            { max: 20, color: [108 / 255, 225 / 255, 238 / 255, 1] },
            { max: 25, color: [96 / 255, 214 / 255, 63 / 255, 1] },
            { max: 30, color: [70 / 255, 137 / 255, 37 / 255, 1] },
            { max: 35, color: [252 / 255, 251 / 255, 74 / 255, 1] },
            { max: 40, color: [223 / 255, 195 / 255, 73 / 255, 1] },
            { max: 45, color: [239 / 255, 147 / 255, 47 / 255, 1] },
            { max: 50, color: [231 / 255, 53 / 255, 31 / 255, 1] },
            { max: 55, color: [184 / 255, 43 / 255, 41 / 255, 1] },
            { max: 60, color: [183 / 255, 36 / 255, 28 / 255, 1] },
            { max: 65, color: [236 / 255, 62 / 255, 237 / 255, 1] },
            { max: 70, color: [132 / 255, 39 / 255, 179 / 255, 1] },
            // 最后一项处理所有大于等于 70 的值
            { max: Infinity, color: [174 / 255, 148 / 255, 237 / 255, 1] }
        ];

        // 1. 使用 flat() 方法将多维数组扁平化为一维数组
        const flatArray = nestedArray.flat();

        // 2. 使用 map() 方法遍历一维数组的每个元素，并应用颜色规则
        const colorArrays = flatArray.map(value => {
            // 查找匹配的颜色规则
            const rule = colorRules.find(rule => value <= rule.max);

            // 如果找到规则，返回对应的颜色数组。
            // 如果由于某种原因找不到 (比如输入值是负数且没有定义负数规则)，可以返回一个默认值。
            return rule ? rule.color : [0, 0, 0, 0]; // 默认返回黑色透明
        });

        // 3. 将所有颜色数组再次扁平化为一个最终的一维数组
        return new Float32Array(colorArrays.flat());
    }

    return (
        <div>
            <button onClick={getVoxel} style={{ position: 'absolute', top: 0, left: 0 }}>
                Voxel
            </button>
            <div
                id="pickedCoordinate"
                style={{ position: 'absolute', top: 100, left: 0, background: 'white' }}
            ></div>
        </div>
    );
}
