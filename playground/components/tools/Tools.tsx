import * as Cesium from 'cesium';
import { useEffect, useState } from 'react';
import {
    useSlopeDirectionAnalysis,
    useVisualFieldAnalysis,
    useVisibilityAnalysis,
    useTurntableSwing,
    useMeasure,
    useDrawing,
} from '@src/core';
import './tools.css';

/** 当前 DSM Terrain 的高程基准修正量，切换 Terrain 时只需修改这里。 */
const CURRENT_TERRAIN_HEIGHT_OFFSET_METERS = 0;

export default function Tools({ viewer }: { viewer: Cesium.Viewer }) {
    const [measure, setMeasure] = useState<Cesium.Viewer>();
    const { measureDistance, measureArea, measureAngle } = useMeasure(
        measure as Cesium.Viewer,
        Cesium
    );
    const { drawing, drawingEntity } = useDrawing(measure as Cesium.Viewer, Cesium);
    const visualFieldAnalysis = useVisualFieldAnalysis();
    const slopeDirectionAnalysis = useSlopeDirectionAnalysis();
    const visibilityAnalysis = useVisibilityAnalysis();
    const turntableSwing = useTurntableSwing();

    useEffect(() => {
        if (!viewer) return;
        setMeasure(viewer);
        visualFieldAnalysis.setInstance(viewer);
        slopeDirectionAnalysis.setInstance(viewer);
        visibilityAnalysis.setInstance(viewer);
        turntableSwing.setInstance(viewer);
    }, [viewer]);

    const handleClear = () => {
        measureDistance.clear();
        measureArea.clear();
        measureAngle.clear();
        visualFieldAnalysis.clear();
        slopeDirectionAnalysis.clear();
        visibilityAnalysis.clear();
        turntableSwing.clear();
        drawing.clear();
        drawingEntity.clear();
    };

    const handleDistance = () => {
        measureDistance.active({
            clampToGround: true,
            terrainHeightOffsetMeters: CURRENT_TERRAIN_HEIGHT_OFFSET_METERS,
            line: {
                // customRender: (meters) => {
                //     return `距离自定义${(meters / 1000).toFixed(3)}km`;
                // },
            },
        });
    };

    const handleArea = () => {
        measureArea.active({
            terrainHeightOffsetMeters: CURRENT_TERRAIN_HEIGHT_OFFSET_METERS,
            area: {
                // customRender: (area2d, area3d) => {
                //     return `平面 ${area2d.toFixed(2)} m²，贴地 ${area3d?.toFixed(2) ?? '—'} m²`;
                // },
            },
        });
    };

    const handleAngle = () => {
        measureAngle.active({
            clampToGround: false,
            angle: {
                show: true,
                font: 'bold 12px MicroSoft YaHei',
                // scale: 1.5,
                outlineWidth: 2,
            },
        });
    };

    const handleVisbility = () => {
        visualFieldAnalysis.active();
    };

    const handleSlopeDirectionAnalysis = () => {
        slopeDirectionAnalysis.active();
    };

    const handleVisibilityAnalysis = () => {
        visibilityAnalysis.active();
    };

    const handleTurntableSwing = () => {
        turntableSwing.active();
    };

    const handleDrawingBillboard = () => {
        drawing.active();
    };

    const handleDrawingDraw = () => {
        drawing.active({
            type: 0,
        });
        drawing.addToolsEventListener('cesiumToolsFxt', (e) => {
            console.log(e);
        });
    };

    const handleDrawingEntity = () => {
        drawingEntity.active({
            type: 3,
        });
        drawingEntity.addToolsEventListener('cesiumToolsFxt', (e) => {
            console.log(e);
        });
    };

    const getPrimvite = () => {
        drawingEntity.create(
            'wkkk',
            [
                {
                    longitude: 109.99036237572159,
                    latitude: 34.21700361286686,
                },
            ],
            {
                type: 0,
                point: {
                    showLabel: true,
                },
            }
        );
        // const primitivesLength = measure?.scene.primitives.length;
        /**
         * TODO: 显示隐藏
         */
        // measure.scene.primitives.show = !measure?.scene.primitives.show
        /**
         * TODO: 修改
         */
        // for (let i = 0; i < primitivesLength; i++) {
        //     const primitiveNum = measure?.scene.primitives.get(i).length;
        //     for (let j = 0; j < primitiveNum; j++) {
        //         const entity = measure?.scene.primitives.get(i).get(j);
        //         console.log(entity instanceof Cesium.Billboard ? entity : '不是')
        //     }
        // }

        /**
         * TODO: 编辑
         */
        // drawing.edit('wkkk', measure, {
        //     type: 4,
        //     point: {
        //         color: Cesium.Color.BLUE,
        //         showLabel: true,
        //     },
        //     label: {
        //         text: '修改了',
        //         showBackground: false
        //     },
        //     polyline: {
        //         color: Cesium.Color.BLUE,
        //     },
        //     polygon: {
        //         color: Cesium.Color.BLACK,
        //         showLabel: true
        //     },
        //     label: {
        //         text: '编辑'
        //     },
        //     billboard: {
        //         image: '/public/resources/images/特征点_预警_默认.png',
        //     }
        // })

        /**
         * TODO: 新增
         */

        // drawimgFace.create([
        //     {
        //         longitude: 109.9949624673448,
        //         latitude: 34.22876194191444,
        //         height: 1450.686516990897
        //     },
        //     {
        //         longitude: 110.0059744858408,
        //         latitude: 34.22830574705477,
        //         height: 1540.711636384433
        //     },
        //     {
        //         longitude: 110.00029263973444,
        //         latitude: 34.216760021564056,
        //         height: 1439.4305063281256
        //     }
        // ], { type: 'line', lineColor: Cesium.Color.RED, width: 1, id: 'wkkk' })
    };

    return (
        <div>
            <button className="btn2" onClick={handleClear}>
                测试图层清除
            </button>
            <button className="btn12" onClick={getPrimvite}>
                测试获取某个实体
            </button>
            <button className="btn4" onClick={handleDistance}>
                距离
            </button>
            <button className="btn5" onClick={handleArea}>
                面积
            </button>
            <button className="btn6" onClick={handleAngle}>
                角度
            </button>
            <button className="btn7" onClick={handleVisbility}>
                通视分析
            </button>
            <button className="btn8" onClick={handleSlopeDirectionAnalysis}>
                坡向分析
            </button>
            <button className="btn9" onClick={handleVisibilityAnalysis}>
                透视分析
            </button>
            <button className="btn10" onClick={handleTurntableSwing}>
                转台模拟
            </button>
            <button className="btn11" onClick={handleDrawingBillboard}>
                画点
            </button>
            <button className="btn13" onClick={handleDrawingDraw}>
                primitive绘制
            </button>
            <button className="btn14" onClick={handleDrawingEntity}>
                entity绘制
            </button>
        </div>
    );
}
