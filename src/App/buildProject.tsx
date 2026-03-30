import * as Cesium from 'cesium';
import React, { useEffect, useRef, useState } from 'react';
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

// 楼面监测区域（地理坐标描述）
// 替换 testMonitorRegion 里的值为真实楼面坐标即可
type MonitorRegion = {
    centerLon: number; // 楼面中心经度（度）
    centerLat: number; // 楼面中心纬度（度）
    bottomHeight: number; // 楼面底部椭球高（米）
    topHeight: number; // 楼面顶部椭球高（米）
    wallWidth: number; // 监测面水平宽度（米）
    wallFacing: number; // 墙面法向朝向（度，0=北，90=东，180=南，270=西）
    wallDepth: number; // 建筑进深（米）——限制进深方向范围，防止效果穿透到后方楼栋
};

// 预处理后的 ECEF 墙面坐标系
type WallTransform = {
    center: Cesium.Cartesian3;
    right: Cesium.Cartesian3;
    up: Cesium.Cartesian3;
    normal: Cesium.Cartesian3; // 墙面法向量（朝向雷达方向）
    halfWidth: number;
    halfHeight: number;
    halfDepth: number; // wallDepth / 2
};

// 测试数据：含正负形变，模拟楼体中部有集中形变区域，单位 mm
const initialDeformData: DeformationData = {
    rows: 500,
    cols: 500,
    minDeform: -5,
    maxDeform: 15,
    grid: testGrid as number[][],
};

// 测试监测区域（替换为真实楼面坐标；也可点击界面上"拾取楼面中心"按钮获取）
const testMonitorRegion: MonitorRegion = {
    centerLon: 101.90912768871529, // 替换：经度
    centerLat: 31.820531053902, // 替换：纬度
    bottomHeight: 2384.741913433615, // 替换：楼面底部椭球高（米）
    topHeight: 2584.741913433615, // 替换：楼面顶部椭球高（米）
    wallWidth: 200, // 替换：监测面宽度（米）
    wallFacing: 180, // 替换：0=北，90=东，180=南，270=西
    wallDepth: 20, // 替换：建筑进深（米），防止穿透到后方楼栋
};

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
    // 法向量 = 墙面朝向（朝外/朝向雷达）
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

// 由两次点击确定桥的纵向轴（水平方向 + 长度）
// 高度范围不从点击高度推导，保留 prevRegion 中已有的高度设置
// （高度范围在 tileset 加载后自动提取，或由用户手动调节）
function computeRegionFromCorners(
    c1: Cesium.Cartographic,
    c2: Cesium.Cartographic,
    prevRegion: MonitorRegion
): MonitorRegion {
    const lon1 = Cesium.Math.toDegrees(c1.longitude);
    const lat1 = Cesium.Math.toDegrees(c1.latitude);
    const lon2 = Cesium.Math.toDegrees(c2.longitude);
    const lat2 = Cesium.Math.toDegrees(c2.latitude);

    const centerLon = (lon1 + lon2) / 2;
    const centerLat = (lat1 + lat2) / 2;
    const centerH = (prevRegion.bottomHeight + prevRegion.topHeight) / 2;

    // 水平距离 = 纵向长度
    const pt1 = Cesium.Cartesian3.fromDegrees(lon1, lat1, centerH);
    const pt2 = Cesium.Cartesian3.fromDegrees(lon2, lat2, centerH);
    const wallWidth = Cesium.Cartesian3.distance(pt1, pt2);

    // 在中心点的 ENU 坐标系中求水平方向向量（right = 沿桥纵轴）
    const centerECEF = Cesium.Cartesian3.fromDegrees(centerLon, centerLat, centerH);
    const enu2ecef = Cesium.Transforms.eastNorthUpToFixedFrame(centerECEF);
    const ecef2enu = Cesium.Matrix4.inverseTransformation(enu2ecef, new Cesium.Matrix4());

    const p1enu = Cesium.Matrix4.multiplyByPoint(ecef2enu, pt1, new Cesium.Cartesian3());
    const p2enu = Cesium.Matrix4.multiplyByPoint(ecef2enu, pt2, new Cesium.Cartesian3());

    const dx = p2enu.x - p1enu.x;
    const dy = p2enu.y - p1enu.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    const normalX = -dy / len;
    const normalY = dx / len;
    const wallFacing = ((Cesium.Math.toDegrees(Math.atan2(normalX, normalY)) % 360) + 360) % 360;

    // 保留原有高度范围和进深，只更新水平轴参数
    return {
        ...prevRegion,
        centerLon,
        centerLat,
        wallWidth,
        wallFacing,
    };
}

export default function BuildProject({ viewer }: { viewer: Cesium.Viewer }) {
    const [deformData, setDeformData] = useState<DeformationData>(initialDeformData);
    const [monitorRegion, setMonitorRegion] = useState<MonitorRegion>(testMonitorRegion);
    const [overlayOpacity, setOverlayOpacity] = useState(0.85);
    // 默认栅格模式（false）：每个数据点显示为独立色块；true = 渐变模式
    const [smoothing, setSmoothing] = useState(false);
    // null = 自动（由数据行列数决定）；填入正数 = 每格的物理间距（米）
    const [uDelta, setUDelta] = useState<number | null>(2);
    const [vDelta, setVDelta] = useState<number | null>(2);
    // 两步拾取状态：idle → corner1（等待第一次点击）→ corner2（等待第二次点击）→ idle
    const [pickStep, setPickStep] = useState<'idle' | 'corner1' | 'corner2'>('idle');

    const shaderRef = useRef<Cesium.CustomShader | null>(null);
    const tilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);
    const wallTransformRef = useRef<WallTransform>(buildWallTransform(testMonitorRegion));
    // 第一个角点临时存储
    const corner1Ref = useRef<Cesium.Cartographic | null>(null);
    // 第一个角点标记实体
    const markerRef = useRef<Cesium.Entity | null>(null);

    // monitorRegion 变化时重算墙面坐标系
    useEffect(() => {
        console.log('monitorRegion', monitorRegion);
        wallTransformRef.current = buildWallTransform(monitorRegion);
    }, [monitorRegion]);

    // 分级色带：5 个纯色区，硬边界，无渐变过渡
    function createColormapTexture(): Uint8Array {
        // [归一化起始位置, R, G, B]
        const stops: [number, number, number, number][] = [
            [0.0, 0x00, 0xeb, 0x0e], // 绿
            [0.35, 0xff, 0xfe, 0x31], // 黄
            [0.5, 0xff, 0x99, 0x00], // 橙
            [0.65, 0xe1, 0x00, 0xff], // 紫
            [1.0, 0x95, 0x2c, 0x37], // 暗红
        ];
        const data = new Uint8Array(256 * 4);
        for (let i = 0; i < 256; i++) {
            const t = i / 255;
            // 找到 t 所在的色区（向左最近的 stop）
            let si = 0;
            for (let s = 0; s < stops.length - 1; s++) {
                if (t >= stops[s][0]) si = s;
            }
            data[i * 4] = stops[si][1];
            data[i * 4 + 1] = stops[si][2];
            data[i * 4 + 2] = stops[si][3];
            data[i * 4 + 3] = 255;
        }
        return data;
    }

    // ── 2. 把形变网格写入纹理（R 通道存归一化后的形变值）──────────
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
                        typedArray: createColormapTexture(),
                        width: 256,
                        height: 1,
                        pixelFormat: Cesium.PixelFormat.RGBA,
                        minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
                        magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
                    }),
                },
                // 以下 7 个 uniform 由 preRender 每帧更新为相机空间值
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
                u_wallHalfW: { type: Cesium.UniformType.FLOAT, value: 20.0 },
                u_wallHalfH: { type: Cesium.UniformType.FLOAT, value: 25.0 },
                u_wallHalfD: { type: Cesium.UniformType.FLOAT, value: 10.0 },
                u_opacity: { type: Cesium.UniformType.FLOAT, value: opacity },
                // 栅格/渐变模式：0.0 = 栅格（默认），1.0 = 渐变
                u_smooth: { type: Cesium.UniformType.FLOAT, value: 0.0 },
                // 网格行列数，用于栅格模式下将 UV 对齐到单元格中心
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
                    // 采样四角格子中心值
                    float d00 = texture(u_gridData, vec2(u0, v0)).r;
                    float d10 = texture(u_gridData, vec2(u1, v0)).r;
                    float d01 = texture(u_gridData, vec2(u0, v1)).r;
                    float d11 = texture(u_gridData, vec2(u1, v1)).r;
                    // 双线性混合
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

            // 自动从包围球提取结构高度范围，解决桥面两点等高导致 halfHeight=0 的问题
            const { center: bsCenter, radius: bsRadius } = tileset.boundingSphere;
            const bsCarto = Cesium.Cartographic.fromCartesian(bsCenter);
            const autoBottom = bsCarto.height - bsRadius;
            const autoTop = bsCarto.height + bsRadius;
            console.log(
                `[自动高度] bottom=${autoBottom.toFixed(1)}m  top=${autoTop.toFixed(1)}m  半径=${bsRadius.toFixed(1)}m`
            );
            setMonitorRegion((prev) => ({
                ...prev,
                bottomHeight: autoBottom,
                topHeight: autoTop,
            }));
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

    // 两步点击拾取：第一次点击记录角点1，第二次点击完成区域计算
    useEffect(() => {
        if (!viewer || pickStep === 'idle') return;

        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((evt: { position: Cesium.Cartesian2 }) => {
            const pos = viewer.scene.pickPosition(evt.position);
            if (!pos) return;
            const carto = Cesium.Cartographic.fromCartesian(pos);

            if (pickStep === 'corner1') {
                // 记录第一个角点，放置标记，进入等待第二次点击
                corner1Ref.current = carto;
                if (markerRef.current) viewer.entities.remove(markerRef.current);
                markerRef.current = viewer.entities.add({
                    position: pos,
                    point: {
                        pixelSize: 10,
                        color: Cesium.Color.YELLOW,
                        outlineColor: Cesium.Color.BLACK,
                        outlineWidth: 2,
                    },
                });
                setPickStep('corner2');
            } else if (pickStep === 'corner2' && corner1Ref.current) {
                // 两点齐了，计算区域
                const region = computeRegionFromCorners(corner1Ref.current, carto, monitorRegion);
                setMonitorRegion(region);
                // 清理标记
                if (markerRef.current) {
                    viewer.entities.remove(markerRef.current);
                    markerRef.current = null;
                }
                corner1Ref.current = null;
                setPickStep('idle');
                console.log('[两点拾取完成]', region);
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        return () => handler.destroy();
    }, [viewer, pickStep]);

    // ── 仅更新纹理，不重建 tileset ────────────────────────────────
    useEffect(() => {
        if (!shaderRef.current) return;
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
    }, [deformData]);

    // ── 栅格/渐变切换 ──────────────────────────────────────────────
    useEffect(() => {
        shaderRef.current?.setUniform('u_smooth', smoothing ? 1.0 : 0.0);
    }, [smoothing]);

    // ── 同步 snap 格数：由 uDelta/vDelta（或数据行列数）+ 区域尺寸共同决定 ──
    useEffect(() => {
        if (!shaderRef.current) return;
        const h = monitorRegion.topHeight - monitorRegion.bottomHeight;
        const snapCols =
            uDelta != null && uDelta > 0 ? monitorRegion.wallWidth / uDelta : deformData.cols;
        const snapRows = vDelta != null && vDelta > 0 ? h / vDelta : deformData.rows;
        console.log(
            `[snap] wallW=${monitorRegion.wallWidth.toFixed(1)} wallH=${h.toFixed(1)}` +
                ` uΔ=${(uDelta ?? monitorRegion.wallWidth / deformData.cols).toFixed(2)}` +
                ` vΔ=${(vDelta ?? h / deformData.rows).toFixed(2)}` +
                ` → cols=${snapCols.toFixed(1)} rows=${snapRows.toFixed(1)}`
        );
        shaderRef.current.setUniform('u_cols', Math.max(1, snapCols));
        shaderRef.current.setUniform('u_rows', Math.max(1, snapRows));
    }, [uDelta, vDelta, monitorRegion, deformData]);

    function handleOpacityChange(value: number) {
        setOverlayOpacity(value);
        shaderRef.current?.setUniform('u_opacity', value);
    }

    function applyPreset(mode: 'initial' | 'top-heavy' | 'uniform' | 'random') {
        const { rows, cols, minDeform, maxDeform } = deformData;
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
            grid = initialDeformData.grid.map((row) => [...row]);
        }
        setDeformData((prev) => ({
            ...prev,
            grid: grid.map((row) => row.map((v) => Math.max(minDeform, Math.min(maxDeform, v)))),
        }));
    }

    const { minDeform, maxDeform } = deformData;
    // 零刻度在色带上的百分比位置
    const zeroPct = (-minDeform / (maxDeform - minDeform)) * 100;
    const wallHeight = monitorRegion.topHeight - monitorRegion.bottomHeight;
    // 实际生效的栅格间距（null = 自动跟随数据分辨率）
    const effectiveUDelta =
        uDelta != null && uDelta > 0
            ? uDelta
            : deformData.cols > 0
              ? monitorRegion.wallWidth / deformData.cols
              : 1;
    const effectiveVDelta =
        vDelta != null && vDelta > 0
            ? vDelta
            : deformData.rows > 0
              ? wallHeight / deformData.rows
              : 1;
    const snapCols = Math.max(1, Math.round(monitorRegion.wallWidth / effectiveUDelta));
    const snapRows = Math.max(1, Math.round(wallHeight / effectiveVDelta));

    return (
        <div style={panelStyle}>
            <div style={{ fontWeight: 'bold', marginBottom: 10, fontSize: 14 }}>结构形变监测</div>

            <div style={{ marginBottom: 8 }}>
                <span>叠加强度</span>
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
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
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
            </div>

            {/* 分级色带图例：5 段纯色块，与 colormap 完全对齐 */}
            <div style={{ marginBottom: 10 }}>
                <div
                    style={{
                        height: 12,
                        borderRadius: 4,
                        position: 'relative',
                        display: 'flex',
                        overflow: 'hidden',
                    }}
                >
                    {/* 宽度比例 = stop 区间长度（0→0.35→0.5→0.65→1.0） */}
                    {(
                        [
                            ['#00eb0e', 35],
                            ['#fffe31', 15],
                            ['#ff9900', 15],
                            ['#e100ff', 35],
                            ['#952c37', 0],
                        ] as [string, number][]
                    ).map(([color, flex], i) => (
                        <div
                            key={i}
                            style={{
                                background: color,
                                flex: flex || 0.1,
                                minWidth: flex ? undefined : 4,
                            }}
                        />
                    ))}
                    {/* 零刻度线 */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: `${zeroPct}%`,
                            width: 2,
                            background: 'rgba(0,0,0,0.6)',
                        }}
                    />
                </div>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 11,
                        opacity: 0.75,
                        marginTop: 2,
                    }}
                >
                    <span>{minDeform}mm</span>
                    <span>0mm</span>
                    <span>+{maxDeform}mm</span>
                </div>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 10,
                        opacity: 0.5,
                    }}
                >
                    <span>向雷达</span>
                    <span>远离雷达</span>
                </div>
            </div>

            {/* 监测区域维度信息 */}
            <div
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
                    横向宽度: <b>{monitorRegion.wallDepth} m</b> &nbsp;|&nbsp; 方向:{' '}
                    {monitorRegion.wallFacing.toFixed(0)}°
                </div>
                <div>
                    显示格数:{' '}
                    <b>
                        {snapCols} × {snapRows}
                    </b>
                    &nbsp;
                    <span style={{ opacity: 0.5 }}>
                        (间距 {effectiveUDelta.toFixed(2)} × {effectiveVDelta.toFixed(2)} m)
                    </span>
                </div>
            </div>

            {/* 栅格间距输入（仅栅格模式生效） */}
            {!smoothing && (
                <div style={{ marginBottom: 6, fontSize: 12 }}>
                    <div style={{ marginBottom: 4, opacity: 0.85 }}>栅格间距（米/格）</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ opacity: 0.7, minWidth: 14 }}>U</span>
                        <input
                            type="number"
                            min={0.01}
                            step={0.1}
                            placeholder="自动"
                            value={uDelta ?? ''}
                            onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                setUDelta(isNaN(v) || v <= 0 ? null : v);
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
                            placeholder="自动"
                            value={vDelta ?? ''}
                            onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                setVDelta(isNaN(v) || v <= 0 ? null : v);
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
                            title="自动计算 vDelta，使行列格数相等（snapCols=snapRows），正对结构时每格呈正方形"
                            onClick={() => {
                                const ud =
                                    uDelta != null && uDelta > 0
                                        ? uDelta
                                        : monitorRegion.wallWidth / deformData.cols;
                                const squareVD = (ud * wallHeight) / monitorRegion.wallWidth;
                                setUDelta(parseFloat(ud.toFixed(4)));
                                setVDelta(parseFloat(squareVD.toFixed(4)));
                            }}
                            style={{ ...btnStyle, padding: '2px 6px', fontSize: 11 }}
                        >
                            等格
                        </button>
                        {(uDelta != null || vDelta != null) && (
                            <button
                                onClick={() => {
                                    setUDelta(null);
                                    setVDelta(null);
                                }}
                                style={{ ...btnStyle, padding: '2px 6px', fontSize: 11 }}
                            >
                                自动
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* 竖向扩展 —— 包围球自动提取后可手动微调 */}
            <div style={{ marginBottom: 6, fontSize: 12 }}>
                <span style={{ opacity: 0.85 }}>竖向扩展</span>
                <input
                    type="range"
                    min={10}
                    max={500}
                    step={5}
                    value={Math.round((monitorRegion.topHeight - monitorRegion.bottomHeight) / 2)}
                    onChange={(e) => {
                        const half = +e.target.value;
                        const mid = (monitorRegion.bottomHeight + monitorRegion.topHeight) / 2;
                        setMonitorRegion((prev) => ({
                            ...prev,
                            bottomHeight: mid - half,
                            topHeight: mid + half,
                        }));
                    }}
                    style={{ marginLeft: 8, width: 82, verticalAlign: 'middle' }}
                />
                <span style={{ marginLeft: 4 }}>
                    ±{Math.round((monitorRegion.topHeight - monitorRegion.bottomHeight) / 2)} m
                </span>
            </div>

            {/* 横向宽度（桥宽/进深）调节 —— 须覆盖结构全宽 */}
            <div style={{ marginBottom: 8, fontSize: 12 }}>
                <span style={{ opacity: 0.85 }}>横向宽度</span>
                <input
                    type="range"
                    min={1}
                    max={300}
                    step={1}
                    value={monitorRegion.wallDepth}
                    onChange={(e) =>
                        setMonitorRegion((prev) => ({ ...prev, wallDepth: +e.target.value }))
                    }
                    style={{ marginLeft: 8, width: 82, verticalAlign: 'middle' }}
                />
                <span style={{ marginLeft: 4 }}>{monitorRegion.wallDepth} m</span>
            </div>

            {/* 两步拾取 */}
            <div style={{ marginBottom: 6 }}>
                {pickStep === 'idle' && (
                    <button
                        onClick={() => setPickStep('corner1')}
                        style={{ ...btnStyle, width: '100%' }}
                    >
                        在模型上点击两端定位范围
                    </button>
                )}
                {pickStep === 'corner1' && (
                    <div style={{ ...hintStyle, background: 'rgba(255,200,0,0.25)' }}>
                        <span>① 点击结构一端任意角</span>
                        <button
                            onClick={() => {
                                setPickStep('idle');
                                corner1Ref.current = null;
                                if (markerRef.current) {
                                    viewer.entities.remove(markerRef.current);
                                    markerRef.current = null;
                                }
                            }}
                            style={cancelBtnStyle}
                        >
                            取消
                        </button>
                    </div>
                )}
                {pickStep === 'corner2' && (
                    <div style={{ ...hintStyle, background: 'rgba(100,200,100,0.25)' }}>
                        <span>② 点击结构另一端对角</span>
                        <button
                            onClick={() => {
                                setPickStep('idle');
                                corner1Ref.current = null;
                                if (markerRef.current) {
                                    viewer.entities.remove(markerRef.current);
                                    markerRef.current = null;
                                }
                            }}
                            style={cancelBtnStyle}
                        >
                            取消
                        </button>
                    </div>
                )}
            </div>
            <div style={{ fontSize: 10, opacity: 0.45, marginBottom: 8, lineHeight: 1.5 }}>
                UV 映射：U = 沿纵向（col），V = 竖向（row）
                <br />
                横向宽度须覆盖结构全宽，否则两侧会被裁剪
            </div>

            {/* 法线方向（影响进深裁剪轴） */}
            <button
                onClick={() =>
                    setMonitorRegion((prev) => ({
                        ...prev,
                        wallFacing: (prev.wallFacing + 180) % 360,
                    }))
                }
                style={{ ...btnStyle, width: '100%', marginBottom: 8 }}
            >
                反转横向轴（{monitorRegion.wallFacing.toFixed(0)}° →{' '}
                {((monitorRegion.wallFacing + 180) % 360).toFixed(0)}°）
            </button>

            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
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
            </div>
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

const hintStyle: React.CSSProperties = {
    fontSize: 12,
    padding: '6px 8px',
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.2)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
};

const cancelBtnStyle: React.CSSProperties = {
    fontSize: 11,
    cursor: 'pointer',
    background: 'rgba(255,80,80,0.3)',
    color: '#fff',
    border: '1px solid rgba(255,80,80,0.5)',
    borderRadius: 3,
    padding: '2px 6px',
    marginLeft: 8,
};
