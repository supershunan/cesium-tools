import * as Cesium from 'cesium';

// 数据接口定义
export interface GridDataHeader {
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

export interface GridData {
    header: GridDataHeader;
    data: number[][][][];
}

export interface ColorRule {
    max: number;
    color: number[]; // [r, g, b, a] 值范围 0-1
}

export type ColorMode = 'step' | 'gradient'; // 阶梯类型 | 渐变色

export interface EarthProjectionOptions {
    colorRules?: ColorRule[];
    opacity?: number; // 0.0 - 1.0，默认 1.0
    colorMode?: ColorMode; // 颜色渲染模式，默认 'step'
    hoverColor?: number[]; // 鼠标悬浮时的颜色 [r, g, b, a]，默认 [1, 0, 1, 0.8] (紫色)
    onValueClick?: (value: number, longitude: number, latitude: number) => void; // 点击事件回调
}

/**
 * 地球投影图层渲染类
 * 用于在Cesium中渲染网格数据图层
 */
export class EarthProjection {
    private viewer: Cesium.Viewer;
    private primitiveRef: Cesium.GroundPrimitive | null = null;
    private materialRef: Cesium.Material | null = null;
    private canvasRef: HTMLCanvasElement | null = null;
    private currentHeaderRef: GridDataHeader | null = null;
    private currentGridDataRef: number[][] | null = null;
    private colorRules: ColorRule[];
    private opacity: number;
    private colorMode: ColorMode;
    private hoverColor: number[];
    private hoverGridIndex: { x: number; y: number } | null = null; // 当前悬浮的网格坐标
    private onValueClick?: (value: number, longitude: number, latitude: number) => void;

    constructor(viewer: Cesium.Viewer, options: EarthProjectionOptions = {}) {
        this.viewer = viewer;
        this.colorRules = options.colorRules || this.getDefaultColorRules();
        this.opacity = options.opacity !== undefined ? options.opacity : 1.0;
        this.colorMode = options.colorMode || 'step';
        this.hoverColor = options.hoverColor || [1, 0, 1, 0.8]; // 默认紫色
        this.onValueClick = options.onValueClick;
    }

    /**
     * 获取默认颜色规则
     */
    private getDefaultColorRules(): ColorRule[] {
        return [
            { max: 9, color: [0 / 255, 235 / 255, 14 / 255, 1] },
            { max: 19, color: [0 / 255, 102 / 255, 255 / 255, 1] },
            { max: 29, color: [255 / 255, 255 / 255, 0 / 255, 1] },
            { max: 39, color: [255 / 255, 153 / 255, 0 / 255, 1] },
            { max: Infinity, color: [255 / 255, 0 / 255, 0 / 255, 1] },
        ];
    }

    /**
     * 渲染数据
     */
    public render(data: GridData): void {
        if (!this.viewer || !data || !data.header || !data.data) {
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
        for (let y = 0; y < ySize; y++) {
            for (let x = 0; x < xSize; x++) {
                const value = gridData[y]?.[x];
                const dataValue = value === null || value === undefined ? header.undef : value;
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

        const valueRange = maxValue - minValue || 1;

        // 将Float32数据编码为RGBA纹理
        const rgbaArray = new Uint8Array(xSize * ySize * 4);
        for (let i = 0; i < dataArray.length; i++) {
            const value = dataArray[i];

            if (value === header.undef || isNaN(value)) {
                rgbaArray[i * 4] = 255;
                rgbaArray[i * 4 + 1] = 255;
                rgbaArray[i * 4 + 2] = 255;
                rgbaArray[i * 4 + 3] = 255;
            } else {
                const normalized = (value - minValue) / valueRange;
                const encoded = Math.floor(normalized * 65535);
                rgbaArray[i * 4] = (encoded >> 8) & 0xff;
                rgbaArray[i * 4 + 1] = encoded & 0xff;
                rgbaArray[i * 4 + 2] = 0;
                rgbaArray[i * 4 + 3] = 255;
            }
        }

        // 创建ImageData对象
        const imageData = new ImageData(new Uint8ClampedArray(rgbaArray), xSize, ySize);

        // 将ImageData转换为data URL
        if (!this.canvasRef || this.canvasRef.width !== xSize || this.canvasRef.height !== ySize) {
            if (this.canvasRef) {
                this.canvasRef = null;
            }
            this.canvasRef = document.createElement('canvas');
            this.canvasRef.width = xSize;
            this.canvasRef.height = ySize;
        }
        const canvas = this.canvasRef;
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
            header.xStart,
            header.yStart,
            header.xEnd,
            header.yEnd
        );

        // 移除之前可能存在的entity（只在首次创建时清除）
        if (!this.primitiveRef) {
            this.viewer.entities.removeAll();
        }

        const colorRuleCount = this.colorRules.length;

        // 准备uniform值
        const uniforms: Record<string, unknown> = {
            dataTexture: dataUrl,
            dataSize: new Cesium.Cartesian2(xSize, ySize),
            minValue: minValue,
            maxValue: maxValue,
            valueRange: valueRange,
            undefValue: header.undef || -1000.0,
            layerOpacity: this.opacity,
            colorMode: this.colorMode === 'step' ? 0.0 : 1.0, // 0.0 = step, 1.0 = gradient
            hoverColor: new Cesium.Cartesian4(
                this.hoverColor[0],
                this.hoverColor[1],
                this.hoverColor[2],
                this.hoverColor[3]
            ),
            hoverGridIndex: new Cesium.Cartesian2(
                this.hoverGridIndex?.x ?? -1.0,
                this.hoverGridIndex?.y ?? -1.0
            ), // -1 表示没有悬浮
        };

        // 添加每个颜色规则的最大值和颜色作为单独的uniform
        for (let i = 0; i < colorRuleCount; i++) {
            uniforms[`colorRuleMax${i}`] =
                this.colorRules[i].max === Infinity ? 999999 : this.colorRules[i].max;
            uniforms[`colorRuleColor${i}`] = new Cesium.Cartesian4(
                this.colorRules[i].color[0],
                this.colorRules[i].color[1],
                this.colorRules[i].color[2],
                this.colorRules[i].color[3]
            );
        }

        // 生成shader代码
        const shaderSource = this.generateShaderSource();

        // 保存当前header和gridData的引用
        this.currentHeaderRef = header;
        this.currentGridDataRef = gridData;

        // 如果material已存在，只更新uniform值
        if (this.materialRef && this.primitiveRef) {
            const material = this.materialRef;
            const materialUniforms = material.uniforms as Record<string, unknown>;

            materialUniforms.dataTexture = dataUrl;
            materialUniforms.minValue = minValue;
            materialUniforms.maxValue = maxValue;
            materialUniforms.valueRange = valueRange;
            materialUniforms.dataSize = new Cesium.Cartesian2(xSize, ySize);

            for (let i = 0; i < colorRuleCount; i++) {
                materialUniforms[`colorRuleMax${i}`] =
                    this.colorRules[i].max === Infinity ? 999999 : this.colorRules[i].max;
                materialUniforms[`colorRuleColor${i}`] = new Cesium.Cartesian4(
                    this.colorRules[i].color[0],
                    this.colorRules[i].color[1],
                    this.colorRules[i].color[2],
                    this.colorRules[i].color[3]
                );
            }

            materialUniforms.layerOpacity = this.opacity;
            materialUniforms.colorMode = this.colorMode === 'step' ? 0.0 : 1.0;
            materialUniforms.hoverColor = new Cesium.Cartesian4(
                this.hoverColor[0],
                this.hoverColor[1],
                this.hoverColor[2],
                this.hoverColor[3]
            );
            materialUniforms.hoverGridIndex = new Cesium.Cartesian2(
                this.hoverGridIndex?.x ?? -1.0,
                this.hoverGridIndex?.y ?? -1.0
            );

            this.viewer.scene.requestRender();
        } else {
            // 首次创建Material和Primitive
            const material = new Cesium.Material({
                fabric: {
                    type: 'DataGrid',
                    uniforms: uniforms,
                    source: shaderSource,
                },
            });
            this.materialRef = material;

            const geometryInstance = new Cesium.GeometryInstance({
                geometry: new Cesium.RectangleGeometry({
                    rectangle: rectangle,
                    height: 0,
                    vertexFormat: Cesium.VertexFormat.POSITION_AND_ST,
                }),
            });

            const primitive = new Cesium.GroundPrimitive({
                geometryInstances: geometryInstance,
                appearance: new Cesium.MaterialAppearance({
                    material: material,
                    translucent: true,
                }),
                classificationType: Cesium.ClassificationType.TERRAIN,
            });

            this.primitiveRef = primitive;
            this.viewer.scene.primitives.add(primitive);
        }

        // 设置鼠标事件监听（点击和移动）
        this.setupMouseHandler(header, gridData);

        // eslint-disable-next-line no-console
        console.log('渲染完成', { xSize, ySize, rectangle });
    }

    /**
     * 生成shader源代码
     */
    private generateShaderSource(): string {
        const colorRuleUniforms = this.colorRules
            .map((_, i) => {
                return `
                uniform float colorRuleMax${i};
                uniform vec4 colorRuleColor${i};
            `;
            })
            .join('');

        const colorRuleLogic = this.colorRules
            .map((_, i) => {
                return `
                    ${i === 0 ? 'if' : 'else if'} (value < colorRuleMax${i}) {
                        return colorRuleColor${i};
                    }
                `;
            })
            .join('');

        // 生成渐变颜色插值逻辑
        const gradientLogic = this.generateGradientLogic();

        return `
            uniform sampler2D dataTexture;
            uniform vec2 dataSize;
            uniform float minValue;
            uniform float maxValue;
            uniform float valueRange;
            uniform float undefValue;
            uniform float layerOpacity;
            uniform float colorMode; // 0.0 = step, 1.0 = gradient
            uniform vec4 hoverColor; // 悬浮颜色
            uniform vec2 hoverGridIndex; // 悬浮的网格坐标 (-1, -1) 表示没有悬浮
            ${colorRuleUniforms}

            vec4 getColorByValueStep(float value) {
                if (value <= undefValue + 0.1) {
                    return vec4(0.0, 0.0, 0.0, 0.0);
                }

                ${colorRuleLogic}
                return colorRuleColor${this.colorRules.length - 1};
            }

            vec4 getColorByValueGradient(float value) {
                if (value <= undefValue + 0.1) {
                    return vec4(0.0, 0.0, 0.0, 0.0);
                }

                ${gradientLogic}
            }

            vec4 getColorByValue(float value) {
                if (colorMode < 0.5) {
                    return getColorByValueStep(value);
                } else {
                    return getColorByValueGradient(value);
                }
            }

            czm_material czm_getMaterial(czm_materialInput materialInput) {
                czm_material material = czm_getDefaultMaterial(materialInput);

                vec2 st = materialInput.st;

                // 使用精确的像素对齐，确保任何视角下都采样相同的像素（位图效果）
                float pixelIndexX = floor(st.x * dataSize.x);
                float pixelIndexY = floor((1.0 - st.y) * dataSize.y);

                pixelIndexX = clamp(pixelIndexX, 0.0, dataSize.x - 1.0);
                pixelIndexY = clamp(pixelIndexY, 0.0, dataSize.y - 1.0);

                // 计算精确的纹理坐标（像素中心点）
                vec2 texCoord = vec2(
                    (pixelIndexX + 0.5) / dataSize.x,
                    (pixelIndexY + 0.5) / dataSize.y
                );

                vec4 texel = texture(dataTexture, texCoord);

                float byteR = texel.r * 255.0;
                float byteG = texel.g * 255.0;

                if (byteR >= 254.0 && byteG >= 254.0) {
                    material.diffuse = vec3(0.0);
                    material.alpha = 0.0;
                    return material;
                }

                float normalized = (byteR * 256.0 + byteG) / 65535.0;
                float dataValue = minValue + normalized * valueRange;

                vec4 color = getColorByValue(dataValue);

                // 检查当前像素是否在悬浮的网格内
                if (hoverGridIndex.x >= 0.0 && hoverGridIndex.y >= 0.0) {
                    // pixelIndexX 和 pixelIndexY 已经是整数，直接比较
                    float currentGridX = pixelIndexX;
                    float currentGridY = pixelIndexY;
                    // 如果当前像素的网格坐标匹配悬浮坐标，应用悬浮颜色
                    if (abs(currentGridX - hoverGridIndex.x) < 0.1 && abs(currentGridY - hoverGridIndex.y) < 0.1) {
                        // 使用明显的悬浮效果：混合悬浮颜色和原始颜色
                        color.rgb = mix(color.rgb, hoverColor.rgb, hoverColor.a * 0.8);
                        // 确保悬浮时颜色更明显
                        color.a = max(color.a, hoverColor.a);
                    }
                }

                // 对颜色进行量化，确保完全离散（位图效果）
                vec3 quantizedColor = floor(color.rgb * 255.0 + 0.5) / 255.0;
                float quantizedAlpha = floor(color.a * 255.0 + 0.5) / 255.0;

                // 应用图层透明度
                quantizedAlpha = quantizedAlpha * layerOpacity;

                // 禁用光照效果，使用纯色（无阴影效果）
                material.emission = quantizedColor;
                material.alpha = quantizedAlpha;

                // 禁用漫反射和高光，确保颜色不受光照影响
                material.diffuse = vec3(0.0);
                material.specular = 0.0;
                material.shininess = 0.0;

                return material;
            }
        `;
    }

    /**
     * 生成渐变颜色插值逻辑
     */
    private generateGradientLogic(): string {
        if (this.colorRules.length < 2) {
            return `return colorRuleColor0;`;
        }

        let logic = '';

        // 辅助函数：确保数值在 shader 中表示为浮点数
        const toFloat = (val: number): string => {
            if (val === Infinity) {
                return '999999.0';
            }
            // 如果已经是整数，添加 .0 后缀
            if (Number.isInteger(val)) {
                return `${val}.0`;
            }
            return val.toString();
        };

        // 为每个颜色规则创建插值区间
        // 第一个规则：从最小值到第一个max值
        const firstMax = this.colorRules[0].max;
        logic += `
            if (value < ${toFloat(firstMax)}) {
                return colorRuleColor0;
            }
        `;

        // 中间规则：在相邻规则之间插值
        for (let i = 0; i < this.colorRules.length - 1; i++) {
            const currentMax = this.colorRules[i].max;
            const nextMax = this.colorRules[i + 1].max;

            logic += `
                else if (value < ${toFloat(nextMax)}) {
                    float t = (value - ${toFloat(currentMax)}) / (${toFloat(nextMax)} - ${toFloat(currentMax)});
                    t = clamp(t, 0.0, 1.0);
                    return mix(colorRuleColor${i}, colorRuleColor${i + 1}, t);
                }
            `;
        }

        // 最后一个规则：超出最后一个max值，使用最后一个颜色
        const lastIndex = this.colorRules.length - 1;
        logic += `
            else {
                return colorRuleColor${lastIndex};
            }
        `;

        return logic;
    }

    /**
     * 计算鼠标位置对应的网格索引
     * 使用与 shader 中相同的计算方法，确保一致性
     */
    private getGridIndexFromPosition(
        position: Cesium.Cartesian2,
        header: GridDataHeader
    ): { x: number; y: number } | null {
        // 首先尝试使用 pickPosition 获取 GroundPrimitive 上的位置
        const cartesian = this.viewer.scene.pickPosition(position);

        let longitude: number;
        let latitude: number;

        if (!cartesian) {
            // 如果 pickPosition 失败，使用 pickEllipsoid 作为备选
            const cartesianEllipsoid = this.viewer.camera.pickEllipsoid(
                position,
                this.viewer.scene.globe.ellipsoid
            );
            if (!cartesianEllipsoid) {
                return null;
            }
            const cartographic = Cesium.Cartographic.fromCartesian(cartesianEllipsoid);
            longitude = Cesium.Math.toDegrees(cartographic.longitude);
            latitude = Cesium.Math.toDegrees(cartographic.latitude);
        } else {
            const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
            longitude = Cesium.Math.toDegrees(cartographic.longitude);
            latitude = Cesium.Math.toDegrees(cartographic.latitude);
        }

        // 检查是否在数据区域内
        if (
            longitude >= header.xStart &&
            longitude <= header.xEnd &&
            latitude >= header.yStart &&
            latitude <= header.yEnd
        ) {
            // 使用与 shader 中完全相同的计算方法
            // shader 中: pixelIndexX = floor(st.x * dataSize.x)
            // shader 中: pixelIndexY = floor((1.0 - st.y) * dataSize.y)
            // 这里我们需要从经纬度计算对应的纹理坐标，然后计算索引

            // 计算归一化的位置 (0-1 范围)
            const normalizedX = (longitude - header.xStart) / (header.xEnd - header.xStart);
            const normalizedY = (latitude - header.yStart) / (header.yEnd - header.yStart);

            // 计算网格索引（与 shader 中的计算保持一致）
            // 注意：shader 中 st.y 需要翻转，所以这里 normalizedY 也需要翻转
            let xIndex = Math.floor(normalizedX * header.xSize);
            let yIndex = Math.floor((1.0 - normalizedY) * header.ySize);

            // 边界检查和修正（与 shader 中的 clamp 保持一致）
            xIndex = Math.max(0, Math.min(xIndex, header.xSize - 1));
            yIndex = Math.max(0, Math.min(yIndex, header.ySize - 1));

            return { x: xIndex, y: yIndex };
        }

        return null;
    }

    /**
     * 更新悬浮网格索引
     */
    private updateHoverGridIndex(gridIndex: { x: number; y: number } | null): void {
        this.hoverGridIndex = gridIndex;

        if (this.materialRef) {
            const materialUniforms = this.materialRef.uniforms as Record<string, unknown>;
            materialUniforms.hoverGridIndex = new Cesium.Cartesian2(
                gridIndex?.x ?? -1.0,
                gridIndex?.y ?? -1.0
            );
            if (this.viewer) {
                this.viewer.scene.requestRender();
            }
        }
    }

    /**
     * 设置鼠标事件处理器（点击和移动）
     */
    private setupMouseHandler(header: GridDataHeader, gridData: number[][]): void {
        const viewerWithHandler = this.viewer as Cesium.Viewer & {
            _earthProjectionHandler?: Cesium.ScreenSpaceEventHandler;
        };

        if (viewerWithHandler._earthProjectionHandler) {
            viewerWithHandler._earthProjectionHandler.destroy();
        }

        const handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
        viewerWithHandler._earthProjectionHandler = handler;

        // 鼠标移动事件：更新悬浮网格
        handler.setInputAction((movement: { endPosition: Cesium.Cartesian2 }) => {
            const gridIndex = this.getGridIndexFromPosition(movement.endPosition, header);
            // eslint-disable-next-line no-console
            if (gridIndex) {
                // console.log('悬浮网格:', gridIndex);
            }
            this.updateHoverGridIndex(gridIndex);
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

        // 鼠标点击事件
        handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
            const gridIndex = this.getGridIndexFromPosition(click.position, header);
            if (gridIndex) {
                const value = gridData[gridIndex.y]?.[gridIndex.x];
                const originalValue = value === null || value === undefined ? header.undef : value;

                // 计算经纬度
                const longitude = header.xStart + gridIndex.x * header.xDelta;
                const latitude = header.yStart + gridIndex.y * header.yDelta;

                if (this.onValueClick) {
                    this.onValueClick(originalValue, longitude, latitude);
                }
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    /**
     * 更新数据
     */
    public updateData(data: GridData): void {
        this.render(data);
    }

    /**
     * 设置图层透明度
     */
    public setOpacity(opacity: number): void {
        const clampedOpacity = Math.max(0.0, Math.min(1.0, opacity));
        this.opacity = clampedOpacity;

        if (this.materialRef) {
            const materialUniforms = this.materialRef.uniforms as Record<string, unknown>;
            materialUniforms.layerOpacity = clampedOpacity;
            if (this.viewer) {
                this.viewer.scene.requestRender();
            }
        }
    }

    /**
     * 获取当前透明度
     */
    public getOpacity(): number {
        return this.opacity;
    }

    /**
     * 设置颜色规则
     */
    public setColorRules(colorRules: ColorRule[]): void {
        this.colorRules = colorRules;
        // 如果已有渲染，需要重新渲染以应用新的颜色规则
        if (this.currentHeaderRef && this.currentGridDataRef) {
            const data: GridData = {
                header: this.currentHeaderRef,
                data: [[this.currentGridDataRef]],
            };
            this.render(data);
        }
    }

    /**
     * 获取当前颜色规则
     */
    public getColorRules(): ColorRule[] {
        return [...this.colorRules];
    }

    /**
     * 设置颜色渲染模式
     */
    public setColorMode(mode: ColorMode): void {
        this.colorMode = mode;
        // 如果已有渲染，需要重新渲染以应用新的模式
        if (this.currentHeaderRef && this.currentGridDataRef) {
            const data: GridData = {
                header: this.currentHeaderRef,
                data: [[this.currentGridDataRef]],
            };
            this.render(data);
        }
    }

    /**
     * 获取当前颜色渲染模式
     */
    public getColorMode(): ColorMode {
        return this.colorMode;
    }

    /**
     * 设置悬浮颜色
     */
    public setHoverColor(color: number[]): void {
        this.hoverColor = color;
        if (this.materialRef) {
            const materialUniforms = this.materialRef.uniforms as Record<string, unknown>;
            materialUniforms.hoverColor = new Cesium.Cartesian4(
                color[0],
                color[1],
                color[2],
                color[3]
            );
            if (this.viewer) {
                this.viewer.scene.requestRender();
            }
        }
    }

    /**
     * 获取当前悬浮颜色
     */
    public getHoverColor(): number[] {
        return [...this.hoverColor];
    }

    /**
     * 销毁图层，清理资源
     */
    public destroy(): void {
        if (this.primitiveRef) {
            this.viewer.scene.primitives.remove(this.primitiveRef);
            this.primitiveRef = null;
        }

        if (this.materialRef) {
            this.materialRef.destroy();
            this.materialRef = null;
        }

        const viewerWithHandler = this.viewer as Cesium.Viewer & {
            _earthProjectionHandler?: Cesium.ScreenSpaceEventHandler;
        };
        if (viewerWithHandler._earthProjectionHandler) {
            viewerWithHandler._earthProjectionHandler.destroy();
            delete viewerWithHandler._earthProjectionHandler;
        }

        this.canvasRef = null;
        this.currentHeaderRef = null;
        this.currentGridDataRef = null;
    }
}
