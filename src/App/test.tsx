import React from 'react';
import { useEffect, useCallback, useMemo } from 'react';
import { GridDataReader } from '../tools/radarLayer';
import * as Cesium from 'cesium';

interface GridDataHeader {
    xStart: number;
    yStart: number;
    xEnd: number;
    yEnd: number;
    xDelta: number;
    yDelta: number;
    xSize: number;
    ySize: number;
    times: number;
    levels: number;
    undef: number;
}

interface GridData {
    header: GridDataHeader;
    data: number[][][][];
}

interface ColorRule {
    max: number;
    color: number[];
}

export default function Voxel({ viewer }: { viewer: Cesium.Viewer }) {
    const dataURL = [
        'pythonfile/SX002/2025-08-09/SX002_20250809120000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809120500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809121000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809121500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809122000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809122500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809123000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809123500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809124000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809124500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809125000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809125500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809130000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809130500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809131000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809131500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809132000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809132500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809133000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809133500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809134000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809134500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809135000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809135500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809140000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809140500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809141000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809141500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809142000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809142500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809143000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809143500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809144000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809144500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809145000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809145500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809150000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809150500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809151000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809151500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809152000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809152500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809153000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809153500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809154000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809154500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809155000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809155500_CR.zip',
    ];
    // 保存primitive和material的引用，用于高效更新
    const primitiveRef = React.useRef<Cesium.GroundPrimitive | null>(null);
    const materialRef = React.useRef<Cesium.Material | null>(null);
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const currentHeaderRef = React.useRef<GridDataHeader | null>(null);
    const currentGridDataRef = React.useRef<number[][] | null>(null);

    const colorRules: ColorRule[] = useMemo(() => {
        return [
            // 范围 [min, max) -> 颜色数组
            { max: 9, color: [0 / 255, 235 / 255, 14 / 255, 1] },
            { max: 19, color: [0 / 255, 102 / 255, 255 / 255, 1] },
            { max: 29, color: [255 / 255, 255 / 255, 0 / 255, 1] },
            { max: 39, color: [255 / 255, 153 / 255, 0 / 255, 1] },
            { max: Infinity, color: [255 / 255, 0 / 255, 0 / 255, 1] },
        ];
    }, []);

    // 设置鼠标左键点击监听，获取当前经纬度对应的原始数据值
    const setupMouseMoveHandler = useCallback(
        (viewer: Cesium.Viewer, header: GridDataHeader, gridData: number[][]) => {
            // 移除之前的事件处理器
            const viewerWithHandler = viewer as Cesium.Viewer & {
                _dataGridHandler?: Cesium.ScreenSpaceEventHandler;
            };
            if (viewerWithHandler._dataGridHandler) {
                viewerWithHandler._dataGridHandler.destroy();
            }

            const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
            viewerWithHandler._dataGridHandler = handler;

            handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
                // eslint-disable-next-line no-console
                console.log('点击事件触发', click.position);

                // 使用pickPosition来获取GroundPrimitive上的位置
                const cartesian = viewer.scene.pickPosition(click.position);

                // 如果pickPosition返回null，尝试使用pickEllipsoid作为备选
                if (!cartesian) {
                    // eslint-disable-next-line no-console
                    console.log('pickPosition返回null，尝试pickEllipsoid');
                    const cartesianEllipsoid = viewer.camera.pickEllipsoid(
                        click.position,
                        viewer.scene.globe.ellipsoid
                    );
                    if (!cartesianEllipsoid) {
                        // eslint-disable-next-line no-console
                        console.log('pickEllipsoid也返回null');
                        return;
                    }
                    // 使用pickEllipsoid的结果
                    const cartographic = Cesium.Cartographic.fromCartesian(cartesianEllipsoid);
                    const longitude = Cesium.Math.toDegrees(cartographic.longitude);
                    const latitude = Cesium.Math.toDegrees(cartographic.latitude);

                    // eslint-disable-next-line no-console
                    console.log('使用pickEllipsoid获取经纬度:', longitude, latitude);

                    // 检查是否在矩形区域内
                    if (
                        longitude >= header.xStart &&
                        longitude <= header.xEnd &&
                        latitude >= header.yStart &&
                        latitude <= header.yEnd
                    ) {
                        // 使用xDelta和yDelta精确计算索引
                        // 注意：使用floor和shader中的计算保持一致
                        let xIndex = Math.floor((longitude - header.xStart) / header.xDelta);
                        let yIndex = Math.floor((latitude - header.yStart) / header.yDelta);

                        // 边界检查和修正
                        xIndex = Math.max(0, Math.min(xIndex, header.xSize - 1));
                        yIndex = Math.max(0, Math.min(yIndex, header.ySize - 1));

                        // eslint-disable-next-line no-console
                        console.log('索引计算详情(pickEllipsoid):', {
                            longitude,
                            latitude,
                            xStart: header.xStart,
                            xEnd: header.xEnd,
                            yStart: header.yStart,
                            yEnd: header.yEnd,
                            xDelta: header.xDelta,
                            yDelta: header.yDelta,
                            xSize: header.xSize,
                            ySize: header.ySize,
                            xIndex,
                            yIndex,
                            calculatedXIndex: (longitude - header.xStart) / header.xDelta,
                            calculatedYIndex: (latitude - header.yStart) / header.yDelta,
                        });

                        // 获取原始数据值
                        // 注意：gridData是按照[y][x]组织的，即 gridData[纬度索引][经度索引]
                        const value = gridData[yIndex]?.[xIndex];
                        const originalValue =
                            value === null || value === undefined ? header.undef : value;

                        // 为了验证，我们也尝试相邻的几个索引
                        // eslint-disable-next-line no-console
                        console.log('周围数据值(pickEllipsoid):', {
                            current: `[${yIndex}][${xIndex}] = ${originalValue}`,
                            left:
                                xIndex > 0
                                    ? `[${yIndex}][${xIndex - 1}] = ${gridData[yIndex]?.[xIndex - 1]}`
                                    : 'N/A',
                            right:
                                xIndex < header.xSize - 1
                                    ? `[${yIndex}][${xIndex + 1}] = ${gridData[yIndex]?.[xIndex + 1]}`
                                    : 'N/A',
                            up:
                                yIndex > 0
                                    ? `[${yIndex - 1}][${xIndex}] = ${gridData[yIndex - 1]?.[xIndex]}`
                                    : 'N/A',
                            down:
                                yIndex < header.ySize - 1
                                    ? `[${yIndex + 1}][${xIndex}] = ${gridData[yIndex + 1]?.[xIndex]}`
                                    : 'N/A',
                        });

                        // eslint-disable-next-line no-console
                        console.log(
                            `经纬度: (${longitude.toFixed(6)}, ${latitude.toFixed(6)}), 索引: [${xIndex}, ${yIndex}], 原始值: ${originalValue}, 数组长度: [${gridData.length}, ${gridData[0]?.length}]`
                        );
                    } else {
                        // eslint-disable-next-line no-console
                        console.log('不在数据区域内', {
                            lon: longitude,
                            lat: latitude,
                            bounds: {
                                xStart: header.xStart,
                                xEnd: header.xEnd,
                                yStart: header.yStart,
                                yEnd: header.yEnd,
                            },
                        });
                    }
                    return;
                }

                // 转换为经纬度
                const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                const longitude = Cesium.Math.toDegrees(cartographic.longitude);
                const latitude = Cesium.Math.toDegrees(cartographic.latitude);

                // eslint-disable-next-line no-console
                console.log('获取到的经纬度:', longitude, latitude);

                // 检查是否在矩形区域内
                if (
                    longitude >= header.xStart &&
                    longitude <= header.xEnd &&
                    latitude >= header.yStart &&
                    latitude <= header.yEnd
                ) {
                    // 使用xDelta和yDelta精确计算索引
                    // x方向：每个点的间距是xDelta
                    // 注意：使用floor和shader中的计算保持一致
                    let xIndex = Math.floor((longitude - header.xStart) / header.xDelta);
                    // y方向：每个点的间距是yDelta
                    let yIndex = Math.floor((latitude - header.yStart) / header.yDelta);

                    // 边界检查和修正
                    xIndex = Math.max(0, Math.min(xIndex, header.xSize - 1));
                    yIndex = Math.max(0, Math.min(yIndex, header.ySize - 1));

                    // eslint-disable-next-line no-console
                    console.log('索引计算详情:', {
                        longitude,
                        latitude,
                        xStart: header.xStart,
                        xEnd: header.xEnd,
                        yStart: header.yStart,
                        yEnd: header.yEnd,
                        xDelta: header.xDelta,
                        yDelta: header.yDelta,
                        xSize: header.xSize,
                        ySize: header.ySize,
                        xIndex,
                        yIndex,
                        calculatedXIndex: (longitude - header.xStart) / header.xDelta,
                        calculatedYIndex: (latitude - header.yStart) / header.yDelta,
                    });

                    // 获取原始数据值
                    // 注意：gridData是按照[y][x]组织的，即 gridData[纬度索引][经度索引]
                    const value = gridData[yIndex]?.[xIndex];
                    const originalValue =
                        value === null || value === undefined ? header.undef : value;

                    // 为了验证，我们也尝试相邻的几个索引
                    // eslint-disable-next-line no-console
                    console.log('周围数据值:', {
                        current: `[${yIndex}][${xIndex}] = ${originalValue}`,
                        left:
                            xIndex > 0
                                ? `[${yIndex}][${xIndex - 1}] = ${gridData[yIndex]?.[xIndex - 1]}`
                                : 'N/A',
                        right:
                            xIndex < header.xSize - 1
                                ? `[${yIndex}][${xIndex + 1}] = ${gridData[yIndex]?.[xIndex + 1]}`
                                : 'N/A',
                        up:
                            yIndex > 0
                                ? `[${yIndex - 1}][${xIndex}] = ${gridData[yIndex - 1]?.[xIndex]}`
                                : 'N/A',
                        down:
                            yIndex < header.ySize - 1
                                ? `[${yIndex + 1}][${xIndex}] = ${gridData[yIndex + 1]?.[xIndex]}`
                                : 'N/A',
                    });

                    // 返回原始值（可以通过回调或直接输出）
                    // eslint-disable-next-line no-console
                    console.log(
                        `经纬度: (${longitude.toFixed(6)}, ${latitude.toFixed(6)}), 索引: [${xIndex}, ${yIndex}], 原始值: ${originalValue}, 数组长度: [${gridData.length}, ${gridData[0]?.length}]`
                    );

                    // 如果需要，可以触发自定义事件或调用回调
                    // onValueChange?.(originalValue, longitude, latitude);
                } else {
                    // eslint-disable-next-line no-console
                    console.log('不在数据区域内', {
                        lon: longitude.toFixed(6),
                        lat: latitude.toFixed(6),
                        bounds: {
                            xStart: header.xStart,
                            xEnd: header.xEnd,
                            yStart: header.yStart,
                            yEnd: header.yEnd,
                        },
                    });
                }
            }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        },
        []
    );

    const renderShader = useCallback(
        (data: GridData) => {
            if (!viewer || !data || !data.header || !data.data) {
                // eslint-disable-next-line no-console
                console.error('数据无效');
                return;
            }
            data.header = {
                ...data.header,
                xStart: 109.299455,
                yStart: 29.272936,
                xEnd: 109.307083,
                yEnd: 29.280877,
            };

            const { header } = data;

            // 提取第一个time和level的数据 [times][levels][y][x]
            const gridData = data.data[0]?.[0];
            if (!gridData) {
                // eslint-disable-next-line no-console
                console.error('数据为空');
                return;
            }

            // 将嵌套数组转换为二维数组，然后转换为纹理数据
            const xSize = header.xSize;
            const ySize = header.ySize;
            const dataArray = new Float32Array(xSize * ySize);

            // 处理null值和数据转换
            // 注意：data是按照[times][levels][y][x]组织的
            for (let y = 0; y < ySize; y++) {
                for (let x = 0; x < xSize; x++) {
                    const value = gridData[y]?.[x];
                    // 如果值为null或undefined，使用header中的undef值
                    const dataValue = value === null || value === undefined ? header.undef : value;
                    // 纹理数据需要按照行优先存储: row * width + col
                    dataArray[y * xSize + x] = dataValue;
                }
            }

            // 计算数据的最小值和最大值，用于归一化
            let minValue = Infinity;
            let maxValue = -Infinity;
            for (let i = 0; i < dataArray.length; i++) {
                const value = dataArray[i];
                if (value !== header.undef && !isNaN(value)) {
                    minValue = Math.min(minValue, value);
                    maxValue = Math.max(maxValue, value);
                }
            }

            // 如果所有值都是undef，设置默认范围
            if (!isFinite(minValue) || !isFinite(maxValue)) {
                minValue = -1000;
                maxValue = 1000;
            }

            const valueRange = maxValue - minValue || 1; // 避免除零

            // 将Float32数据编码为RGBA纹理
            // 使用R和G通道存储归一化后的值（0-65535范围），实现高精度
            const rgbaArray = new Uint8Array(xSize * ySize * 4);
            for (let i = 0; i < dataArray.length; i++) {
                const value = dataArray[i];

                if (value === header.undef || isNaN(value)) {
                    // 无效值：使用特殊标记（全255表示无效）
                    rgbaArray[i * 4] = 255; // R
                    rgbaArray[i * 4 + 1] = 255; // G
                    rgbaArray[i * 4 + 2] = 255; // B
                    rgbaArray[i * 4 + 3] = 255; // A
                } else {
                    // 将值归一化到0-1范围
                    const normalized = (value - minValue) / valueRange;

                    // 编码为16位精度（使用R和G通道，每个通道8位）
                    const encoded = Math.floor(normalized * 65535);
                    rgbaArray[i * 4] = (encoded >> 8) & 0xff; // R: 高8位
                    rgbaArray[i * 4 + 1] = encoded & 0xff; // G: 低8位
                    rgbaArray[i * 4 + 2] = 0; // B: 保留
                    rgbaArray[i * 4 + 3] = 255; // A: 不透明
                }
            }

            // 创建ImageData对象
            const imageData = new ImageData(new Uint8ClampedArray(rgbaArray), xSize, ySize);

            // 将ImageData转换为data URL（复用canvas以提高效率）
            // 如果canvas已存在且尺寸相同，直接复用
            if (
                !canvasRef.current ||
                canvasRef.current.width !== xSize ||
                canvasRef.current.height !== ySize
            ) {
                if (canvasRef.current) {
                    canvasRef.current = null;
                }
                canvasRef.current = document.createElement('canvas');
                canvasRef.current.width = xSize;
                canvasRef.current.height = ySize;
            }
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                // eslint-disable-next-line no-console
                console.error('无法创建canvas context');
                return;
            }
            ctx.putImageData(imageData, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');

            // 创建矩形区域
            const rectangle = Cesium.Rectangle.fromDegrees(
                header.xStart, // 西
                header.yStart, // 南
                header.xEnd, // 东
                header.yEnd // 北
            );

            // 移除之前可能存在的entity（只在首次创建时清除）
            if (!primitiveRef.current) {
                viewer.entities.removeAll();
            }

            // 将颜色规则转换为shader可用的格式
            // 由于GLSL数组限制，我们需要将规则展开为单独的uniform
            const colorRuleCount = colorRules.length;

            // 准备uniform值
            // Material.fabric的uniforms中，图像需要使用 { image: url } 格式或者直接是URL字符串
            const uniforms: Record<string, unknown> = {
                dataTexture: dataUrl, // data URL字符串
                dataSize: new Cesium.Cartesian2(xSize, ySize),
                minValue: minValue,
                maxValue: maxValue,
                valueRange: valueRange,
                undefValue: header.undef || -1000.0,
            };

            // 添加每个颜色规则的最大值和颜色作为单独的uniform
            for (let i = 0; i < colorRuleCount; i++) {
                uniforms[`colorRuleMax${i}`] =
                    colorRules[i].max === Infinity ? 999999 : colorRules[i].max;
                // 确保颜色值是正确的类型
                uniforms[`colorRuleColor${i}`] = new Cesium.Cartesian4(
                    colorRules[i].color[0],
                    colorRules[i].color[1],
                    colorRules[i].color[2],
                    colorRules[i].color[3]
                );
            }

            // 生成shader代码
            const shaderSource = `
            uniform sampler2D dataTexture;
            uniform vec2 dataSize;
            uniform float minValue;
            uniform float maxValue;
            uniform float valueRange;
            uniform float undefValue;
            ${colorRules
                .map((_, i) => {
                    return `
                uniform float colorRuleMax${i};
                uniform vec4 colorRuleColor${i};
            `;
                })
                .join('')}

            vec4 getColorByValue(float value) {
                // 检查是否为无效值
                if (value <= undefValue + 0.1) {
                    return vec4(0.0, 0.0, 0.0, 0.0); // 透明
                }

                ${colorRules
                    .map((_, i) => {
                        return `
                    ${i === 0 ? 'if' : 'else if'} (value < colorRuleMax${i}) {
                        return colorRuleColor${i};
                    }
                `;
                    })
                    .join('')}
                // 默认返回最后一个颜色
                return colorRuleColor${colorRules.length - 1};
            }

            czm_material czm_getMaterial(czm_materialInput materialInput) {
                czm_material material = czm_getDefaultMaterial(materialInput);

                // 获取纹理坐标 (0-1范围)
                vec2 st = materialInput.st;

                // 使用精确的像素对齐，确保任何视角下都采样相同的像素（位图效果）
                // 先计算像素索引（整数），避免浮点数精度问题
                float pixelIndexX = floor(st.x * dataSize.x);
                float pixelIndexY = floor((1.0 - st.y) * dataSize.y);

                // 边界检查，确保索引在有效范围内
                pixelIndexX = clamp(pixelIndexX, 0.0, dataSize.x - 1.0);
                pixelIndexY = clamp(pixelIndexY, 0.0, dataSize.y - 1.0);

                // 计算精确的纹理坐标（像素中心点）
                // 使用像素中心：pixelIndex + 0.5，确保始终采样到同一个像素
                // 这样无论从什么视角看，都会采样到相同的像素值
                vec2 texCoord = vec2(
                    (pixelIndexX + 0.5) / dataSize.x,
                    (pixelIndexY + 0.5) / dataSize.y
                );

                // 从数据纹理中采样
                // 由于坐标已经精确对齐到像素中心，即使纹理使用了线性过滤，
                // 采样到的值也应该非常接近真实像素值（因为是像素中心）
                vec4 texel = texture(dataTexture, texCoord);

                // 解码数据值
                // R和G通道存储了16位的归一化值（0-65535）
                float byteR = texel.r * 255.0;
                float byteG = texel.g * 255.0;

                // 检查是否为无效值（全255表示无效）
                if (byteR >= 254.0 && byteG >= 254.0) {
                    material.diffuse = vec3(0.0);
                    material.alpha = 0.0;
                    return material;
                }

                // 将16位值解码为归一化的0-1范围
                float normalized = (byteR * 256.0 + byteG) / 65535.0;

                // 还原为原始数据值
                float dataValue = minValue + normalized * valueRange;

                // 根据数据值获取颜色
                vec4 color = getColorByValue(dataValue);

                // 对颜色进行量化，确保完全离散（位图效果）
                // 将颜色值四舍五入到最接近的离散值，避免任何微小的插值误差
                // 这样可以确保无论从什么角度看，颜色都是完全一致的
                vec3 quantizedColor = floor(color.rgb * 255.0 + 0.5) / 255.0;
                float quantizedAlpha = floor(color.a * 255.0 + 0.5) / 255.0;

                // 禁用光照效果，使用纯色（无阴影效果）
                // 设置emission而不是diffuse，这样颜色不会受光照影响
                material.emission = quantizedColor;
                material.alpha = quantizedAlpha;

                // 禁用漫反射和高光，确保颜色不受光照影响
                material.diffuse = vec3(0.0);
                material.specular = 0.0;
                material.shininess = 0.0;

                return material;
            }
        `;

            // 保存当前header和gridData的引用，用于点击事件
            currentHeaderRef.current = header;
            currentGridDataRef.current = gridData;

            // 如果material已存在，只更新uniform值（高效更新）
            if (materialRef.current && primitiveRef.current) {
                // 更新material的uniforms
                const material = materialRef.current;
                const materialUniforms = material.uniforms as Record<string, unknown>;

                // 更新纹理（最重要的更新）
                materialUniforms.dataTexture = dataUrl;

                // 更新数据范围相关uniform
                materialUniforms.minValue = minValue;
                materialUniforms.maxValue = maxValue;
                materialUniforms.valueRange = valueRange;
                materialUniforms.dataSize = new Cesium.Cartesian2(xSize, ySize);

                // 更新颜色规则uniform
                for (let i = 0; i < colorRuleCount; i++) {
                    materialUniforms[`colorRuleMax${i}`] =
                        colorRules[i].max === Infinity ? 999999 : colorRules[i].max;
                    materialUniforms[`colorRuleColor${i}`] = new Cesium.Cartesian4(
                        colorRules[i].color[0],
                        colorRules[i].color[1],
                        colorRules[i].color[2],
                        colorRules[i].color[3]
                    );
                }

                // 请求重新渲染
                viewer.scene.requestRender();
            } else {
                // 首次创建Material和Primitive
                const material = new Cesium.Material({
                    fabric: {
                        type: 'DataGrid',
                        uniforms: uniforms,
                        source: shaderSource,
                    },
                });
                materialRef.current = material;

                // 使用GroundPrimitive而不是Entity，因为GroundPrimitive支持直接使用Material
                // 创建矩形几何体实例
                const geometryInstance = new Cesium.GeometryInstance({
                    geometry: new Cesium.RectangleGeometry({
                        rectangle: rectangle,
                        height: 0,
                        vertexFormat: Cesium.VertexFormat.POSITION_AND_ST,
                    }),
                });

                // 创建GroundPrimitive，使用自定义Material
                // 设置 classificationType 为 CESIUM_3D_TILE，只在 3DTiles 上渲染，避免在地球表面重复渲染
                const primitive = new Cesium.GroundPrimitive({
                    geometryInstances: geometryInstance,
                    appearance: new Cesium.MaterialAppearance({
                        material: material,
                        translucent: true,
                    }),
                    classificationType: Cesium.ClassificationType.CESIUM_3D_TILE,
                });

                primitiveRef.current = primitive;

                // 添加到场景中
                viewer.scene.primitives.add(primitive);
            }

            // 设置鼠标左键点击监听，返回当前经纬度对应的原始数据值
            setupMouseMoveHandler(viewer, header, gridData);

            // eslint-disable-next-line no-console
            console.log('渲染完成', { xSize, ySize, rectangle });
        },
        [viewer, colorRules, setupMouseMoveHandler]
    );

    // 导出更新数据的方法，供外部调用
    const updateData = useCallback(
        (data: GridData) => {
            if (viewer) {
                renderShader(data);
            }
        },
        [viewer, renderShader]
    );

    // 将updateData方法暴露到window，方便外部调用
    useEffect(() => {
        if (viewer) {
            const win = window as typeof window & { updateLayerData?: (data: GridData) => void };
            win.updateLayerData = updateData;
        }
        return () => {
            const win = window as typeof window & { updateLayerData?: (data: GridData) => void };
            delete win.updateLayerData;
        };
    }, [updateData, viewer]);

    let index = 0;
    useEffect(() => {
        getNcData().then((data) => {
            // eslint-disable-next-line no-console
            console.log('数据加载完成', data);
            if (viewer) {
                renderShader(data as GridData);
            }
        });

        // setTimeout(() => {
        //     setInterval(() => {
        //         getNcData('http://222.74.18.86:7085/fxtraincold/' + dataURL[index]).then((data) => {
        //             // eslint-disable-next-line no-console
        //             console.log('数据加载完成', data);
        //             updateData(data as GridData);
        //         });
        //         index++;
        //         if (index === dataURL.length) {
        //             index = 0;
        //         }
        //     }, 1000);
        // }, 10000);
    }, [viewer, renderShader]);

    const getNcData = async (url?: string): Promise<GridData> => {
        let dataResult = {} as GridData;
        try {
            const res = await fetch(url ? url : '/public/resources/639021950828737727.zip', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/zip',
                },
            });
            const gridDataReader = new GridDataReader();
            const data = await gridDataReader.readCompressedGridData(await res.blob());
            dataResult = data as GridData;
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('读取ZIP文件错误:', error);
        }
        return dataResult;
    };

    return <div></div>;
}
