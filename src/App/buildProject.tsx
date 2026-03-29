import * as Cesium from 'cesium';
import React, { useEffect, useRef, useState } from 'react';

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
    rows: 10,
    cols: 8,
    minDeform: -5,
    maxDeform: 15,
    grid: [
        [0.5, 0.8, 1.0, 1.2, 1.1, 0.9, 0.7, 0.4],
        [0.8, 1.5, 2.1, 2.8, 2.5, 2.0, 1.4, 0.7],
        [1.2, 2.5, 5.0, 8.2, 7.8, 4.8, 2.2, 1.0],
        [1.5, 3.2, 8.5, 12.0, 11.5, 8.0, 3.0, 1.3],
        [-1.0, -2.0, 3.0, 14.0, 13.5, 9.5, 3.8, 1.6],
        [-3.0, -4.5, 2.0, 10.0, 9.8, 8.8, -1.3, 1.4],
        [-2.5, -3.5, -1.0, 6.0, 5.8, 4.8, 2.5, 1.1],
        [-1.0, -1.5, 0.5, 3.0, 2.8, 2.5, 1.6, 0.8],
        [0.2, 0.3, 0.8, 1.5, 1.4, 1.2, 0.8, 0.4],
        [0.1, 0.2, 0.4, 0.6, 0.6, 0.5, 0.3, 0.2],
    ],
};

// 测试监测区域（替换为真实楼面坐标；也可点击界面上"拾取楼面中心"按钮获取）
const testMonitorRegion: MonitorRegion = {
    centerLon: 114.1, // 替换：经度
    centerLat: 22.3, // 替换：纬度
    bottomHeight: 5, // 替换：楼面底部椭球高（米）
    topHeight: 55, // 替换：楼面顶部椭球高（米）
    wallWidth: 40, // 替换：监测面宽度（米）
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

export default function BuildProject({ viewer }: { viewer: Cesium.Viewer }) {
    const [deformData, setDeformData] = useState<DeformationData>(initialDeformData);
    const [monitorRegion, setMonitorRegion] = useState<MonitorRegion>(testMonitorRegion);
    const [overlayOpacity, setOverlayOpacity] = useState(0.85);
    const [pickingMode, setPickingMode] = useState(false);

    const shaderRef = useRef<Cesium.CustomShader | null>(null);
    const tilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);
    // 初始化时立即计算，避免 preRender 触发时 ref 为 null
    const wallTransformRef = useRef<WallTransform>(buildWallTransform(testMonitorRegion));

    // monitorRegion 变化时重算墙面坐标系
    useEffect(() => {
        wallTransformRef.current = buildWallTransform(monitorRegion);
    }, [monitorRegion]);

    // 双向色带：蓝（最大负形变/向雷达）-> 白（零）-> 红（最大正形变/远离雷达）
    function createColormapTexture(): Uint8Array {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 1;
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        const gradient = ctx.createLinearGradient(0, 0, 256, 0);
        gradient.addColorStop(0.0, '#2166ac');
        gradient.addColorStop(0.35, '#92c5de');
        gradient.addColorStop(0.5, '#f7f7f7');
        gradient.addColorStop(0.65, '#f4a582');
        gradient.addColorStop(1.0, '#d6604d');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 1);
        return new Uint8Array(ctx.getImageData(0, 0, 256, 1).data);
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

                // 归一化到 [0,1]，超出范围 = 不在监测区域内
                float u = projRight / u_wallHalfW + 0.5;
                float v = projUp    / u_wallHalfH + 0.5;

                // 三维长方体裁剪：横向 + 高度 + 进深方向同时满足，防止穿透到后方楼栋
                float inRegion = step(0.0, u) * step(u, 1.0)
                               * step(0.0, v) * step(v, 1.0)
                               * step(-u_wallHalfD, projNormal) * step(projNormal, u_wallHalfD);

                float deform = texture(u_gridData, vec2(u, 1.0 - v)).r;
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
                '/public/hk_3dtitles/tileset.json',
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

    // 点击拾取楼面中心坐标
    useEffect(() => {
        if (!viewer || !pickingMode) return;
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((evt: { position: Cesium.Cartesian2 }) => {
            const pos = viewer.scene.pickPosition(evt.position);
            if (!pos) return;
            const carto = Cesium.Cartographic.fromCartesian(pos);
            const lon = Cesium.Math.toDegrees(carto.longitude);
            const lat = Cesium.Math.toDegrees(carto.latitude);
            const h = carto.height;
            console.log(`[pick] lon=${lon.toFixed(6)} lat=${lat.toFixed(6)} h=${h.toFixed(1)}m`);
            setMonitorRegion((prev) => ({
                ...prev,
                centerLon: lon,
                centerLat: lat,
                bottomHeight: Math.max(0, h - prev.wallWidth / 2),
                topHeight: h + prev.wallWidth / 2,
            }));
            setPickingMode(false);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        return () => handler.destroy();
    }, [viewer, pickingMode]);

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

    return (
        <div style={panelStyle}>
            <div style={{ fontWeight: 'bold', marginBottom: 10, fontSize: 14 }}>墙面形变监测</div>

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

            {/* 双向色带图例 */}
            <div style={{ marginBottom: 10 }}>
                <div
                    style={{
                        height: 12,
                        borderRadius: 4,
                        position: 'relative',
                        background:
                            'linear-gradient(to right, #2166ac, #92c5de, #f7f7f7, #f4a582, #d6604d)',
                    }}
                >
                    {/* 零刻度线 */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: `${zeroPct}%`,
                            width: 2,
                            background: 'rgba(0,0,0,0.5)',
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

            {/* 监测区域信息 */}
            <div
                style={{
                    fontSize: 11,
                    opacity: 0.7,
                    marginBottom: 8,
                    lineHeight: 1.7,
                    borderTop: '1px solid rgba(255,255,255,0.15)',
                    paddingTop: 8,
                }}
            >
                <div>
                    经纬度: {monitorRegion.centerLon.toFixed(5)},{' '}
                    {monitorRegion.centerLat.toFixed(5)}
                </div>
                <div>
                    高度: {monitorRegion.bottomHeight}m ~ {monitorRegion.topHeight}m
                </div>
                <div>
                    宽度: {monitorRegion.wallWidth}m | 朝向: {monitorRegion.wallFacing}deg
                </div>
            </div>

            {/* 拾取楼面坐标 */}
            <button
                onClick={() => setPickingMode((v) => !v)}
                style={{
                    ...btnStyle,
                    width: '100%',
                    marginBottom: 8,
                    background: pickingMode ? 'rgba(255,200,0,0.35)' : 'rgba(255,255,255,0.12)',
                    borderColor: pickingMode ? 'rgba(255,200,0,0.8)' : 'rgba(255,255,255,0.3)',
                }}
            >
                {pickingMode ? '点击建筑以拾取坐标...' : '拾取楼面中心坐标'}
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
