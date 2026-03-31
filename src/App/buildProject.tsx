import * as Cesium from 'cesium';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import testGrid from '../../public/resources/grid.json';

// grid[row][col] 单位 mm；row 0 = 底层，row N-1 = 顶层
// 负值 = 向雷达方向位移；正值 = 远离雷达方向位移
type DeformationData = {
    rows: number;
    cols: number;
    minDeform: number;
    maxDeform: number;
    grid: number[][];
};

type CornerPoint = {
    lon: number; // 经度（度）
    lat: number; // 纬度（度）
    height: number; // 椭球高（米）
};

// 色带分段点：value 直接填实际形变值（mm），与 grids 数据单位相同
// 内部会用 minDeform/maxDeform 自动归一化，无需手动计算比例
type ColorStop = {
    value: number; // 实际形变值（mm），与 grids 单位一致
    color: string; // CSS 十六进制颜色，如 '#00eb0e'
};

// 业务输入：对角两点 + 格点精度 + 形变数据，完整定义监测区域
// grids 超出由 uDelta/vDelta 推导出的 cols×rows 的部分不参与渲染
type MonitorInput = {
    leftBottomStart: CornerPoint; // 结构一端底部角点
    rightTopEnd: CornerPoint; // 结构另一端顶部角点
    uDelta: number; // U 方向（纵向）格点间距（米/格）
    vDelta: number; // V 方向（竖向）格点间距（米/格）
    grids: number[][]; // 形变格点数据（mm）
    minDeform: number; // 色带下限（mm）
    maxDeform: number; // 色带上限（mm）
    wallDepth: number; // 结构进深（米），防止效果穿透到后方结构
    colorStops: ColorStop[]; // 色带分段配置，position 需升序排列
};

// ECEF 墙面坐标系（由 MonitorRegion 推导，preRender 每帧转到相机空间）
type WallTransform = {
    center: Cesium.Cartesian3;
    right: Cesium.Cartesian3;
    up: Cesium.Cartesian3;
    normal: Cesium.Cartesian3;
    halfWidth: number;
    halfHeight: number;
    halfDepth: number;
};

type MonitorRegion = {
    centerLon: number;
    centerLat: number;
    bottomHeight: number;
    topHeight: number;
    wallWidth: number;
    wallFacing: number;
    wallDepth: number;
};

const testMonitorInput: MonitorInput = {
    leftBottomStart: {
        lon: 101.90568801817672,
        lat: 31.820810313259113,
        height: 2369.2586186499125,
    },
    rightTopEnd: { lon: 101.91094145363743, lat: 31.820392369053273, height: 2489.61766707526 },
    uDelta: 20,
    vDelta: 20,
    grids: testGrid as number[][],
    minDeform: 0,
    maxDeform: 20,
    wallDepth: 20,
    colorStops: [
        { value: 0, color: '#00eb0e' },
        { value: 7, color: '#fffe31' },
        { value: 10, color: '#ff9900' },
        { value: 13, color: '#e100ff' },
        { value: 20, color: '#952c37' },
    ],
};

// 由业务输入推导监测区域地理参数
// 水平距离 = 纵向宽度；两点连线方向决定纵轴，法向为其垂直方向（偏左90°）
function buildRegionFromInput(input: MonitorInput): MonitorRegion {
    const { leftBottomStart: lb, rightTopEnd: rt } = input;
    const centerLon = (lb.lon + rt.lon) / 2;
    const centerLat = (lb.lat + rt.lat) / 2;
    const bottomHeight = Math.min(lb.height, rt.height);
    const topHeight = Math.max(lb.height, rt.height);
    const centerH = (bottomHeight + topHeight) / 2;

    const pt1 = Cesium.Cartesian3.fromDegrees(lb.lon, lb.lat, centerH);
    const pt2 = Cesium.Cartesian3.fromDegrees(rt.lon, rt.lat, centerH);
    const wallWidth = Cesium.Cartesian3.distance(pt1, pt2);

    // 在中心点 ENU 坐标系中求水平方向向量，计算法向朝向角
    const centerECEF = Cesium.Cartesian3.fromDegrees(centerLon, centerLat, centerH);
    const enu2ecef = Cesium.Transforms.eastNorthUpToFixedFrame(centerECEF);
    const ecef2enu = Cesium.Matrix4.inverseTransformation(enu2ecef, new Cesium.Matrix4());
    const p1enu = Cesium.Matrix4.multiplyByPoint(ecef2enu, pt1, new Cesium.Cartesian3());
    const p2enu = Cesium.Matrix4.multiplyByPoint(ecef2enu, pt2, new Cesium.Cartesian3());
    const dx = p2enu.x - p1enu.x;
    const dy = p2enu.y - p1enu.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    // 法向量 = 轴向量逆时针旋转 90°
    const normalX = -dy / len;
    const normalY = dx / len;
    const wallFacing = ((Cesium.Math.toDegrees(Math.atan2(normalX, normalY)) % 360) + 360) % 360;

    return {
        centerLon,
        centerLat,
        bottomHeight,
        topHeight,
        wallWidth,
        wallFacing,
        wallDepth: input.wallDepth,
    };
}

// 由业务输入 + 区域参数推导形变网格（按精度截取，多余行列丢弃）
function buildDeformDataFromInput(input: MonitorInput, region: MonitorRegion): DeformationData {
    const wallHeight = region.topHeight - region.bottomHeight;
    const cols = Math.max(1, Math.floor(region.wallWidth / input.uDelta));
    const rows = Math.max(1, Math.floor(wallHeight / input.vDelta));
    const grid: number[][] = [];
    for (let r = 0; r < rows; r++) {
        const row: number[] = [];
        for (let c = 0; c < cols; c++) {
            row.push(input.grids[r]?.[c] ?? 0);
        }
        grid.push(row);
    }
    return { rows, cols, minDeform: input.minDeform, maxDeform: input.maxDeform, grid };
}

// 将地理监测区域转换为 ECEF 墙面坐标系
function buildWallTransform(region: MonitorRegion): WallTransform {
    const centerH = (region.bottomHeight + region.topHeight) / 2;
    const center = Cesium.Cartesian3.fromDegrees(region.centerLon, region.centerLat, centerH);
    const enu2ecef = Cesium.Transforms.eastNorthUpToFixedFrame(center);
    const enuRot = Cesium.Matrix4.getMatrix3(enu2ecef, new Cesium.Matrix3());

    // facing=0(北): right=东，normal=北；facing=90(东): right=南，normal=东；以此类推
    const facingRad = Cesium.Math.toRadians(region.wallFacing);
    const rightENU = new Cesium.Cartesian3(Math.cos(facingRad), -Math.sin(facingRad), 0);
    const upENU = new Cesium.Cartesian3(0, 0, 1);
    const normalENU = new Cesium.Cartesian3(Math.sin(facingRad), Math.cos(facingRad), 0);

    return {
        center,
        right: Cesium.Matrix3.multiplyByVector(enuRot, rightENU, new Cesium.Cartesian3()),
        up: Cesium.Matrix3.multiplyByVector(enuRot, upENU, new Cesium.Cartesian3()),
        normal: Cesium.Matrix3.multiplyByVector(enuRot, normalENU, new Cesium.Cartesian3()),
        halfWidth: region.wallWidth / 2,
        halfHeight: (region.topHeight - region.bottomHeight) / 2,
        halfDepth: region.wallDepth / 2,
    };
}

// 点击拾取结果
type PickResult = {
    row: number;
    col: number;
    value: number;
    color: string; // 对应色带颜色
};

export default function BuildProject({ viewer }: { viewer: Cesium.Viewer }) {
    const [monitorInput, setMonitorInput] = useState<MonitorInput>(testMonitorInput);
    const [overlayOpacity, setOverlayOpacity] = useState(0.85);
    const [smoothing, setSmoothing] = useState(false);
    const [pickResult, setPickResult] = useState<PickResult | null>(null);

    // monitorRegion 和 deformData 完全由 monitorInput 推导，无需独立 state
    const monitorRegion = useMemo(() => buildRegionFromInput(monitorInput), [monitorInput]);
    const deformData = useMemo(
        () => buildDeformDataFromInput(monitorInput, monitorRegion),
        [monitorInput, monitorRegion]
    );

    const shaderRef = useRef<Cesium.CustomShader | null>(null);
    const tilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);
    const wallTransformRef = useRef<WallTransform>(
        buildWallTransform(buildRegionFromInput(testMonitorInput))
    );
    // 让点击 handler 始终能读到最新的 deformData / monitorInput
    const deformDataRef = useRef(deformData);
    const monitorInputRef = useRef(monitorInput);

    // monitorRegion 变化时同步 ECEF 坐标系
    useEffect(() => {
        wallTransformRef.current = buildWallTransform(monitorRegion);
    }, [monitorRegion]);

    useEffect(() => {
        deformDataRef.current = deformData;
    }, [deformData]);
    useEffect(() => {
        monitorInputRef.current = monitorInput;
    }, [monitorInput]);

    // 分级色带：纯色块，硬边界，无渐变过渡
    // stops.value 为实际 mm 值，内部按 minDeform/maxDeform 自动归一化为 [0,1]
    function createColormapTexture(stops: ColorStop[]): Uint8Array {
        const { minDeform, maxDeform } = monitorInput;
        const range = maxDeform - minDeform || 1;
        const parsed = stops.map(({ value, color }) => ({
            position: (value - minDeform) / range, // mm → [0,1]
            r: parseInt(color.slice(1, 3), 16),
            g: parseInt(color.slice(3, 5), 16),
            b: parseInt(color.slice(5, 7), 16),
        }));
        const data = new Uint8Array(256 * 4);
        for (let i = 0; i < 256; i++) {
            const t = i / 255;
            let si = 0;
            for (let s = 0; s < parsed.length - 1; s++) {
                if (t >= parsed[s].position) si = s;
            }
            data[i * 4] = parsed[si].r;
            data[i * 4 + 1] = parsed[si].g;
            data[i * 4 + 2] = parsed[si].b;
            data[i * 4 + 3] = 255;
        }
        return data;
    }

    // 把形变网格写入纹理（R 通道存归一化后的形变值）
    function createGridTexture(data: DeformationData): Uint8Array {
        const { rows, cols, grid, minDeform, maxDeform } = data;
        const canvas = document.createElement('canvas');
        canvas.width = cols;
        canvas.height = rows;
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        const imgData = ctx.createImageData(cols, rows);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const val = grid[r]?.[c] ?? 0;
                const t = Math.max(0, Math.min(1, (val - minDeform) / (maxDeform - minDeform)));
                // 纹理 Y 轴翻转：row 0（底层）→ 纹理底部
                const idx = ((rows - 1 - r) * cols + c) * 4;
                imgData.data[idx] = Math.round(t * 255);
                imgData.data[idx + 1] = 0;
                imgData.data[idx + 2] = 0;
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return new Uint8Array(ctx.getImageData(0, 0, cols, rows).data);
    }

    // 构建 CustomShader
    // 精度说明：用 czm_modelView * positionMC 得到相机空间坐标，
    // 避免大 ECEF 坐标（百万米级）做差时的 float32 精度损失。
    // 墙面坐标系（u_wallCenterEC 等）也在相机空间，由 preRender 每帧更新。
    function buildDeformShader(opacity: number): Cesium.CustomShader {
        console.log('deformData', deformData);
        return new Cesium.CustomShader({
            translucencyMode: Cesium.CustomShaderTranslucencyMode.INHERIT,
            uniforms: {
                u_gridData: {
                    type: Cesium.UniformType.SAMPLER_2D,
                    value: new Cesium.TextureUniform({
                        typedArray: createGridTexture(deformData),
                        width: deformData.cols,
                        height: deformData.rows,
                        pixelFormat: Cesium.PixelFormat.RGBA,
                        minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
                        magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
                    }),
                },
                u_colormap: {
                    type: Cesium.UniformType.SAMPLER_2D,
                    value: new Cesium.TextureUniform({
                        typedArray: createColormapTexture(monitorInput.colorStops),
                        width: 256,
                        height: 1,
                        pixelFormat: Cesium.PixelFormat.RGBA,
                        minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
                        magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
                    }),
                },
                // 以下 uniform 由 preRender 每帧更新为相机空间值
                u_wallCenterEC: { type: Cesium.UniformType.VEC3, value: new Cesium.Cartesian3() },
                u_wallRightEC: {
                    type: Cesium.UniformType.VEC3,
                    value: new Cesium.Cartesian3(1, 0, 0),
                },
                u_wallUpEC: {
                    type: Cesium.UniformType.VEC3,
                    value: new Cesium.Cartesian3(0, 1, 0),
                },
                u_wallNormalEC: {
                    type: Cesium.UniformType.VEC3,
                    value: new Cesium.Cartesian3(0, 0, 1),
                },
                u_wallHalfW: { type: Cesium.UniformType.FLOAT, value: monitorRegion.wallWidth / 2 },
                u_wallHalfH: {
                    type: Cesium.UniformType.FLOAT,
                    value: (monitorRegion.topHeight - monitorRegion.bottomHeight) / 2,
                },
                u_wallHalfD: { type: Cesium.UniformType.FLOAT, value: monitorInput.wallDepth / 2 },
                u_opacity: { type: Cesium.UniformType.FLOAT, value: opacity },
                u_smooth: { type: Cesium.UniformType.FLOAT, value: 0.0 },
                u_cols: { type: Cesium.UniformType.FLOAT, value: deformData.cols },
                u_rows: { type: Cesium.UniformType.FLOAT, value: deformData.rows },
            },
            fragmentShaderText: `
            void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
                vec3 baseColor = material.diffuse;

                // 相机空间坐标：czm_modelView 含 RTE 精度处理，精度优于直接使用 ECEF
                vec3 posEC = (czm_modelView * vec4(fsInput.attributes.positionMC, 1.0)).xyz;
                vec3 delta = posEC - u_wallCenterEC;

                float projRight  = dot(delta, u_wallRightEC);
                float projUp     = dot(delta, u_wallUpEC);
                float projNormal = dot(delta, u_wallNormalEC);

                // 归一化到 [0,1]
                // projRight 的范围是 [-halfW, +halfW]，需除以全宽 (halfW*2) 才能映射到 [0,1]
                float u = projRight / (u_wallHalfW * 2.0) + 0.5;
                float v = projUp    / (u_wallHalfH * 2.0) + 0.5;

                // 三维长方体裁剪：横向 + 高度 + 进深方向同时满足，防止穿透到后方楼栋
                float inRegion = step(0.0, u) * step(u, 1.0)
                               * step(0.0, v) * step(v, 1.0)
                               * step(-u_wallHalfD, projNormal) * step(projNormal, u_wallHalfD);

                // 两种模式都以 uDelta/vDelta 定义的格子为单位（u_cols × u_rows）
                // 栅格模式：snap 到格子中心，纯色块
                // 渐变模式：在相邻格子中心值之间做双线性插值，格子大小不变
                float deform;
                float vFlip = 1.0 - v;
                if (u_smooth < 0.5) {
                    float uSnap = (floor(u * u_cols) + 0.5) / u_cols;
                    float vSnap = (floor(vFlip * u_rows) + 0.5) / u_rows;
                    deform = texture(u_gridData, vec2(uSnap, vSnap)).r;
                } else {
                    // 格内分数坐标（0=格左/底，1=格右/顶）
                    float uf = fract(u    * u_cols);
                    float vf = fract(vFlip * u_rows);
                    // 当前格整数索引
                    float ci = floor(u    * u_cols);
                    float ri = floor(vFlip * u_rows);
                    // 四个相邻格子中心在纹理中的 UV
                    float u0 = (ci + 0.5) / u_cols;
                    float u1 = (ci + 1.5) / u_cols;
                    float v0 = (ri + 0.5) / u_rows;
                    float v1 = (ri + 1.5) / u_rows;
                    // 采样四角格子中心值后双线性混合
                    float d00 = texture(u_gridData, vec2(u0, v0)).r;
                    float d10 = texture(u_gridData, vec2(u1, v0)).r;
                    float d01 = texture(u_gridData, vec2(u0, v1)).r;
                    float d11 = texture(u_gridData, vec2(u1, v1)).r;
                    deform = mix(mix(d00, d10, uf), mix(d01, d11, uf), vf);
                }
                vec4 deformColor = texture(u_colormap, vec2(deform, 0.5));

                material.diffuse = mix(
                    baseColor,
                    mix(baseColor, deformColor.rgb, u_opacity),
                    inRegion
                );
                material.alpha = 1.0;
            }
            `,
        });
    }

    // 加载 tileset，自动从包围球提取高度范围写入 monitorInput
    useEffect(() => {
        if (!viewer) return;
        (async () => {
            const tileset = await Cesium.Cesium3DTileset.fromUrl(
                '/public/bridge_3dtitles/tileset.json',
                {
                    skipLevelOfDetail: false,
                    dynamicScreenSpaceError: false,
                    maximumScreenSpaceError: 4,
                }
            );
            viewer.scene.primitives.add(tileset);
            tilesetRef.current = tileset;
            const shader = buildDeformShader(overlayOpacity);
            shaderRef.current = shader;
            tileset.customShader = shader;
            viewer.zoomTo(tileset);
        })();
    }, [viewer]);

    // 每帧将墙面坐标系转换到相机空间，解决大坐标精度问题的核心
    useEffect(() => {
        if (!viewer) return;
        const remove = viewer.scene.preRender.addEventListener(() => {
            if (!shaderRef.current) return;
            const { center, right, up, normal, halfWidth, halfHeight, halfDepth } =
                wallTransformRef.current;
            const viewMat = viewer.camera.viewMatrix;
            const rotMat = Cesium.Matrix4.getMatrix3(viewMat, new Cesium.Matrix3());

            shaderRef.current.setUniform(
                'u_wallCenterEC',
                Cesium.Matrix4.multiplyByPoint(viewMat, center, new Cesium.Cartesian3())
            );
            shaderRef.current.setUniform(
                'u_wallRightEC',
                Cesium.Matrix3.multiplyByVector(rotMat, right, new Cesium.Cartesian3())
            );
            shaderRef.current.setUniform(
                'u_wallUpEC',
                Cesium.Matrix3.multiplyByVector(rotMat, up, new Cesium.Cartesian3())
            );
            shaderRef.current.setUniform(
                'u_wallNormalEC',
                Cesium.Matrix3.multiplyByVector(rotMat, normal, new Cesium.Cartesian3())
            );
            shaderRef.current.setUniform('u_wallHalfW', halfWidth);
            shaderRef.current.setUniform('u_wallHalfH', halfHeight);
            shaderRef.current.setUniform('u_wallHalfD', halfDepth);
        });
        return () => remove();
    }, [viewer]);

    // deformData 变化时更新纹理
    useEffect(() => {
        if (!shaderRef.current) return;
        console.log('[实际渲染] rows=', deformData.rows, 'cols=', deformData.cols);
        shaderRef.current.setUniform(
            'u_gridData',
            new Cesium.TextureUniform({
                typedArray: createGridTexture(deformData),
                width: deformData.cols,
                height: deformData.rows,
                pixelFormat: Cesium.PixelFormat.RGBA,
                minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
                magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
            })
        );
        // 格数随 deformData 同步更新
        shaderRef.current.setUniform('u_cols', Math.max(1, deformData.cols));
        shaderRef.current.setUniform('u_rows', Math.max(1, deformData.rows));
    }, [deformData]);

    // colorStops 变化时重建 colormap 纹理
    useEffect(() => {
        if (!shaderRef.current) return;
        shaderRef.current.setUniform(
            'u_colormap',
            new Cesium.TextureUniform({
                typedArray: createColormapTexture(monitorInput.colorStops),
                width: 256,
                height: 1,
                pixelFormat: Cesium.PixelFormat.RGBA,
                minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
                magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
            })
        );
    }, [monitorInput.colorStops]);

    useEffect(() => {
        shaderRef.current?.setUniform('u_smooth', smoothing ? 1.0 : 0.0);
    }, [smoothing]);

    // 点击拾取：输出坐标（调试）+ 查询所在 grid 格子的值
    useEffect(() => {
        if (!viewer) return;
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((evt: { position: Cesium.Cartesian2 }) => {
            const pos = viewer.scene.pickPosition(evt.position);
            if (!pos) return;

            // ── 坐标日志 ──────────────────────────────────────────────
            const carto = Cesium.Cartographic.fromCartesian(pos);
            console.log(
                `[pick] lon=${Cesium.Math.toDegrees(carto.longitude).toFixed(6)}` +
                    ` lat=${Cesium.Math.toDegrees(carto.latitude).toFixed(6)}` +
                    ` h=${carto.height.toFixed(1)}m`
            );

            // ── grid 拾取（与 shader 数学完全对称，在 CPU 侧重算一遍）──
            const { center, right, up, normal, halfWidth, halfHeight, halfDepth } =
                wallTransformRef.current;
            const viewMat = viewer.camera.viewMatrix;
            const rotMat = Cesium.Matrix4.getMatrix3(viewMat, new Cesium.Matrix3());

            // 点击点和墙中心都转到相机空间（与 shader 中 czm_modelView 等价）
            const posEC = Cesium.Matrix4.multiplyByPoint(viewMat, pos, new Cesium.Cartesian3());
            const centerEC = Cesium.Matrix4.multiplyByPoint(
                viewMat,
                center,
                new Cesium.Cartesian3()
            );
            const rightEC = Cesium.Matrix3.multiplyByVector(rotMat, right, new Cesium.Cartesian3());
            const upEC = Cesium.Matrix3.multiplyByVector(rotMat, up, new Cesium.Cartesian3());
            const normalEC = Cesium.Matrix3.multiplyByVector(
                rotMat,
                normal,
                new Cesium.Cartesian3()
            );

            const delta = Cesium.Cartesian3.subtract(posEC, centerEC, new Cesium.Cartesian3());
            const projRight = Cesium.Cartesian3.dot(delta, rightEC);
            const projUp = Cesium.Cartesian3.dot(delta, upEC);
            const projNormal = Cesium.Cartesian3.dot(delta, normalEC);

            const u = projRight / (halfWidth * 2) + 0.5;
            const v = projUp / (halfHeight * 2) + 0.5;

            // 超出监测盒子范围，不在任何格子内
            if (
                u < 0 ||
                u > 1 ||
                v < 0 ||
                v > 1 ||
                projNormal < -halfDepth ||
                projNormal > halfDepth
            ) {
                setPickResult(null);
                return;
            }

            const { rows, cols, grid } = deformDataRef.current;
            const dataCol = Math.min(Math.floor(u * cols), cols - 1);
            // vFlip = 1-v → texRow 是纹理行索引（从下往上）
            // createGridTexture 中 r=0 写在 imgData 末尾 → dataRow = rows-1-texRow
            const texRow = Math.min(Math.floor((1 - v) * rows), rows - 1);
            const dataRow = rows - 1 - texRow;
            const value = grid[dataRow]?.[dataCol] ?? 0;

            // 找对应色带颜色（与 createColormapTexture 逻辑一致）
            const { minDeform, maxDeform, colorStops } = monitorInputRef.current;
            const t = (value - minDeform) / (maxDeform - minDeform || 1);
            let colorIdx = 0;
            for (let s = 0; s < colorStops.length - 1; s++) {
                const stopT = (colorStops[s].value - minDeform) / (maxDeform - minDeform || 1);
                if (t >= stopT) colorIdx = s;
            }

            console.log('对应值=', value);

            // setPickResult({ row: dataRow, col: dataCol, value, color: colorStops[colorIdx].color });
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        return () => handler.destroy();
    }, [viewer]);

    function handleOpacityChange(value: number) {
        setOverlayOpacity(value);
        shaderRef.current?.setUniform('u_opacity', value);
    }

    function applyPreset(mode: 'initial' | 'top-heavy' | 'uniform' | 'random') {
        const { rows, cols } = deformData;
        const { minDeform, maxDeform } = monitorInput;
        let grid: number[][];
        if (mode === 'top-heavy') {
            grid = Array.from({ length: rows }, (_, r) =>
                Array.from({ length: cols }, (_, c) => {
                    const h = r / (rows - 1);
                    const cx = Math.abs(c - (cols - 1) / 2) / cols;
                    return +((maxDeform * h - 2) * (1 - cx * 1.5)).toFixed(1);
                })
            );
        } else if (mode === 'uniform') {
            grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 1.5));
        } else if (mode === 'random') {
            grid = Array.from({ length: rows }, () =>
                Array.from(
                    { length: cols },
                    () => +(minDeform + Math.random() * (maxDeform - minDeform)).toFixed(1)
                )
            );
        } else {
            // initial：从原始测试数据中截取 rows×cols
            grid = Array.from({ length: rows }, (_, r) =>
                Array.from({ length: cols }, (_, c) => (testGrid as number[][])[r]?.[c] ?? 0)
            );
        }
        const clampedGrid = grid.map((row) =>
            row.map((v) => Math.max(minDeform, Math.min(maxDeform, v)))
        );
        setMonitorInput((prev) => ({ ...prev, grids: clampedGrid }));
    }

    const { minDeform, maxDeform } = monitorInput;
    const wallHeight = monitorRegion.topHeight - monitorRegion.bottomHeight;

    return (
        <div style={panelStyle}>
            <div style={{ fontWeight: 'bold', marginBottom: 10, fontSize: 14 }}>结构形变监测</div>

            {/* 格子拾取结果 */}
            {/* {pickResult ? (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 8,
                        padding: '5px 8px',
                        background: 'rgba(255,255,255,0.08)',
                        borderRadius: 5,
                        fontSize: 12,
                        border: '1px solid rgba(255,255,255,0.15)',
                    }}
                >
                    <div
                        style={{
                            width: 14,
                            height: 14,
                            borderRadius: 3,
                            flexShrink: 0,
                            background: pickResult.color,
                            border: '1px solid rgba(255,255,255,0.3)',
                        }}
                    />
                    <span style={{ opacity: 0.7 }}>
                        [{pickResult.row}, {pickResult.col}]
                    </span>
                    <span style={{ fontWeight: 'bold', marginLeft: 'auto' }}>
                        {pickResult.value} mm
                    </span>
                    <button
                        onClick={() => setPickResult(null)}
                        style={{ ...btnStyle, padding: '0 5px', fontSize: 11, lineHeight: '16px' }}
                    >
                        ✕
                    </button>
                </div>
            ) : (
                <div style={{ fontSize: 11, opacity: 0.4, marginBottom: 8 }}>
                    点击格子可查看对应 grids 值
                </div>
            )} */}

            {/* 透明度 */}
            <div style={{ marginBottom: 8 }}>
                <span>透明度</span>
                <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={overlayOpacity}
                    onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
                    style={{ marginLeft: 8, width: 100, verticalAlign: 'middle' }}
                />
                <span style={{ marginLeft: 4 }}>{(overlayOpacity * 100).toFixed(0)}%</span>
            </div>

            {/* 栅格 / 渐变切换 */}
            {/* <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12 }}>显示模式</span>
                <button
                    onClick={() => setSmoothing(false)}
                    style={{
                        ...btnStyle,
                        flex: 1,
                        background: !smoothing
                            ? 'rgba(100,180,255,0.45)'
                            : 'rgba(255,255,255,0.12)',
                        borderColor: !smoothing ? '#64b4ff' : 'rgba(255,255,255,0.3)',
                    }}
                >
                    栅格
                </button>
                <button
                    onClick={() => setSmoothing(true)}
                    style={{
                        ...btnStyle,
                        flex: 1,
                        background: smoothing ? 'rgba(100,180,255,0.45)' : 'rgba(255,255,255,0.12)',
                        borderColor: smoothing ? '#64b4ff' : 'rgba(255,255,255,0.3)',
                    }}
                >
                    渐变
                </button>
            </div> */}

            {/* 分级色带图例：等宽色块 + 底部标注每段起始值 */}
            <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', height: 12 }}>
                    {monitorInput.colorStops.map((stop, i) => (
                        <div
                            key={i}
                            style={{
                                background: stop.color,
                                flex: 1,
                            }}
                        />
                    ))}
                </div>
                {/* 每个色块下方标注对应的 value（mm） */}
                <div style={{ display: 'flex', marginTop: 3 }}>
                    {monitorInput.colorStops.map((stop, i) => (
                        <div
                            key={i}
                            style={{
                                flex: 1,
                                textAlign: 'center',
                                fontSize: 10,
                                opacity: 0.75,
                                lineHeight: 1.2,
                            }}
                        >
                            <div
                                style={{
                                    width: 1,
                                    height: 4,
                                    background: 'rgba(255,255,255,0.4)',
                                    margin: '0 auto 1px',
                                }}
                            />
                            {stop.value}
                        </div>
                    ))}
                </div>
                {/* <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 10,
                        opacity: 0.4,
                        marginTop: 2,
                    }}
                >
                    <span>向雷达</span>
                    <span>远离雷达</span>
                </div> */}
            </div>

            {/* 监测区域信息（只读，完全由输入数据决定） */}
            {/* <div
                style={{
                    fontSize: 11,
                    opacity: 0.7,
                    marginBottom: 8,
                    lineHeight: 1.8,
                    borderTop: '1px solid rgba(255,255,255,0.15)',
                    paddingTop: 8,
                }}
            >
                <div>
                    纵向长度: <b>{monitorRegion.wallWidth.toFixed(1)} m</b>
                </div>
                <div>
                    竖向范围: <b>{wallHeight.toFixed(1)} m</b>
                    &nbsp;
                    <span style={{ opacity: 0.5 }}>
                        ({monitorRegion.bottomHeight.toFixed(0)} ~{' '}
                        {monitorRegion.topHeight.toFixed(0)} m)
                    </span>
                </div>
                <div>
                    进深宽度: <b>{monitorInput.wallDepth} m</b> &nbsp;|&nbsp; 方向:{' '}
                    {monitorRegion.wallFacing.toFixed(0)}°
                </div>
                <div>
                    显示格数:{' '}
                    <b>
                        {deformData.cols} × {deformData.rows}
                    </b>
                    &nbsp;
                    <span style={{ opacity: 0.5 }}>
                        (间距 {monitorInput.uDelta.toFixed(2)} × {monitorInput.vDelta.toFixed(2)} m)
                    </span>
                </div>
            </div> */}

            {/* 栅格间距输入（仅栅格模式生效） */}
            {/* {!smoothing && (
                <div style={{ marginBottom: 6, fontSize: 12 }}>
                    <div style={{ marginBottom: 4, opacity: 0.85 }}>栅格间距（米/格）</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ opacity: 0.7, minWidth: 14 }}>U</span>
                        <input
                            type="number"
                            min={0.01}
                            step={0.1}
                            value={monitorInput.uDelta}
                            onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (!isNaN(v) && v > 0)
                                    setMonitorInput((prev) => ({ ...prev, uDelta: v }));
                            }}
                            style={{
                                width: 64,
                                background: 'rgba(255,255,255,0.1)',
                                border: '1px solid rgba(255,255,255,0.3)',
                                color: '#fff',
                                borderRadius: 3,
                                padding: '2px 4px',
                                fontSize: 12,
                            }}
                        />
                        <span style={{ opacity: 0.7, minWidth: 14 }}>V</span>
                        <input
                            type="number"
                            min={0.01}
                            step={0.1}
                            value={monitorInput.vDelta}
                            onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (!isNaN(v) && v > 0)
                                    setMonitorInput((prev) => ({ ...prev, vDelta: v }));
                            }}
                            style={{
                                width: 64,
                                background: 'rgba(255,255,255,0.1)',
                                border: '1px solid rgba(255,255,255,0.3)',
                                color: '#fff',
                                borderRadius: 3,
                                padding: '2px 4px',
                                fontSize: 12,
                            }}
                        />
                        <button
                            title="自动计算 vDelta，使 U/V 格子在正视角下呈正方形"
                            onClick={() => {
                                const ud = monitorInput.uDelta;
                                const squareVD = (ud * wallHeight) / monitorRegion.wallWidth;
                                setMonitorInput((prev) => ({
                                    ...prev,
                                    uDelta: parseFloat(ud.toFixed(4)),
                                    vDelta: parseFloat(squareVD.toFixed(4)),
                                }));
                            }}
                            style={{ ...btnStyle, padding: '2px 6px', fontSize: 11 }}
                        >
                            等格
                        </button>
                    </div>
                </div>
            )} */}
            {/*
            <div style={{ fontSize: 10, opacity: 0.45, marginBottom: 8, lineHeight: 1.5 }}>
                UV 映射：U = 纵向（沿结构轴），V = 竖向（高程方向）
                <br />
                grids 超出 {deformData.cols}×{deformData.rows} 的部分不参与渲染
            </div> */}

            {/* 测试预设数据 */}
            {/* <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                <button onClick={() => applyPreset('initial')} style={btnStyle}>
                    集中形变
                </button>
                <button onClick={() => applyPreset('top-heavy')} style={btnStyle}>
                    顶部偏移
                </button>
                <button onClick={() => applyPreset('uniform')} style={btnStyle}>
                    均匀沉降
                </button>
                <button onClick={() => applyPreset('random')} style={btnStyle}>
                    随机模拟
                </button>
            </div> */}
        </div>
    );
}

const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    background: 'rgba(20, 20, 30, 0.88)',
    borderRadius: 8,
    padding: '12px 16px',
    color: '#fff',
    fontSize: 13,
    minWidth: 235,
    boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
};

const btnStyle: React.CSSProperties = {
    padding: '4px 8px',
    fontSize: 12,
    cursor: 'pointer',
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 4,
};
