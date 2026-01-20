import React from "react";
import { useEffect, useCallback, useMemo } from "react"
import { GridDataReader } from "../tools/radarLayer";
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
    const colorRules: ColorRule[] = useMemo(() => {
        return [
            // 范围 [min, max) -> 颜色数组
            { max: 9, color: [0 / 255, 235 / 255, 14 / 255, 1] },
            { max: 19, color: [0 / 255, 102 / 255, 255 / 255, 1] },
            { max: 29, color: [255 / 255, 255 / 255, 0 / 255, 1] },
            { max: 39, color: [255 / 255, 153 / 255, 0 / 255, 1] },
            { max: Infinity, color: [255 / 255, 0 / 255, 0 / 255, 1] }
        ];
    }, []);

    const renderShader = useCallback((data: GridData) => {
        if (!viewer || !data || !data.header || !data.data) {
            // eslint-disable-next-line no-console
            console.error('数据无效');
            return;
        }

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
                const dataValue = (value === null || value === undefined) ? header.undef : value;
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
                rgbaArray[i * 4] = 255;     // R
                rgbaArray[i * 4 + 1] = 255; // G
                rgbaArray[i * 4 + 2] = 255; // B
                rgbaArray[i * 4 + 3] = 255; // A
            } else {
                // 将值归一化到0-1范围
                const normalized = (value - minValue) / valueRange;

                // 编码为16位精度（使用R和G通道，每个通道8位）
                const encoded = Math.floor(normalized * 65535);
                rgbaArray[i * 4] = (encoded >> 8) & 0xFF;        // R: 高8位
                rgbaArray[i * 4 + 1] = encoded & 0xFF;           // G: 低8位
                rgbaArray[i * 4 + 2] = 0;                        // B: 保留
                rgbaArray[i * 4 + 3] = 255;                      // A: 不透明
            }
        }

        // 创建ImageData对象
        const imageData = new ImageData(
            new Uint8ClampedArray(rgbaArray),
            xSize,
            ySize
        );

        // 将ImageData转换为data URL（使用临时canvas仅作为转换工具，不绘制）
        // 这样Cesium Material.fabric才能正确识别纹理
        const canvas = document.createElement('canvas');
        canvas.width = xSize;
        canvas.height = ySize;
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
            header.xStart,  // 西
            header.yStart,  // 南
            header.xEnd,    // 东
            header.yEnd     // 北
        );

        // 移除之前可能存在的entity
        viewer.entities.removeAll();

        // 将颜色规则转换为shader可用的格式
        // 由于GLSL数组限制，我们需要将规则展开为单独的uniform
        const colorRuleCount = colorRules.length;

        // 准备uniform值
        // Material.fabric的uniforms中，图像需要使用 { image: url } 格式或者直接是URL字符串
        const uniforms: Record<string, unknown> = {
            dataTexture: dataUrl,  // data URL字符串
            dataSize: new Cesium.Cartesian2(xSize, ySize),
            minValue: minValue,
            maxValue: maxValue,
            valueRange: valueRange,
            undefValue: header.undef || -1000.0
        };

        // 添加每个颜色规则的最大值和颜色作为单独的uniform
        for (let i = 0; i < colorRuleCount; i++) {
            uniforms[`colorRuleMax${i}`] = colorRules[i].max === Infinity ? 999999 : colorRules[i].max;
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
            ${colorRules.map((_, i) => {
                return `
                uniform float colorRuleMax${i};
                uniform vec4 colorRuleColor${i};
            `;
            }).join('')}

            vec4 getColorByValue(float value) {
                // 检查是否为无效值
                if (value <= undefValue + 0.1) {
                    return vec4(0.0, 0.0, 0.0, 0.0); // 透明
                }

                ${colorRules.map((_, i) => {
                    return `
                    ${i === 0 ? 'if' : 'else if'} (value < colorRuleMax${i}) {
                        return colorRuleColor${i};
                    }
                `;
                }).join('')}
                // 默认返回最后一个颜色
                return colorRuleColor${colorRules.length - 1};
            }

            czm_material czm_getMaterial(czm_materialInput materialInput) {
                czm_material material = czm_getDefaultMaterial(materialInput);

                // 获取纹理坐标 (0-1范围)
                vec2 st = materialInput.st;

                // 将纹理坐标映射到数据纹理坐标
                // 注意：纹理坐标的y轴需要翻转（Cesium中st.y从下往上，纹理从上往下）
                vec2 texCoord = vec2(st.x, 1.0 - st.y);

                // 从数据纹理中采样
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

                material.diffuse = color.rgb;
                material.alpha = color.a;

                return material;
            }
        `;

        // 创建自定义Material
        const material = new Cesium.Material({
            fabric: {
                type: 'DataGrid',
                uniforms: uniforms,
                source: shaderSource
            }
        });

        // 使用GroundPrimitive而不是Entity，因为GroundPrimitive支持直接使用Material
        // 创建矩形几何体实例
        const geometryInstance = new Cesium.GeometryInstance({
            geometry: new Cesium.RectangleGeometry({
                rectangle: rectangle,
                height: 0,
                vertexFormat: Cesium.VertexFormat.POSITION_AND_ST
            })
        });

        // 创建GroundPrimitive，使用自定义Material
        const primitive = new Cesium.GroundPrimitive({
            geometryInstances: geometryInstance,
            appearance: new Cesium.MaterialAppearance({
                material: material,
                translucent: true
            })
        });

        // 添加到场景中
        viewer.scene.primitives.add(primitive);

        // eslint-disable-next-line no-console
        console.log('渲染完成', { xSize, ySize, rectangle });
    }, [viewer, colorRules]);

    useEffect(() => {
        getNcData().then((data) => {
            // eslint-disable-next-line no-console
            console.log('数据加载完成', data);
            if (viewer) {
                renderShader(data as GridData);
            }
        });
    }, [viewer, renderShader]);

    const getNcData = async (): Promise<GridData> => {
        let dataResult = {} as GridData;
        try {
            const res = await fetch('/public/resources/639021950828737727.zip', {
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

    return (
        <div>
        </div>
    );
}
