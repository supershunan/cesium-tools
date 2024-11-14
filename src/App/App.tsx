import React from 'react';
import '/public/Cesium/Widgets/widgets.css';
import * as Cesium from 'cesium';
import { useEffect, useRef, useState } from 'react';
import {
    useSlopeDirectionAnalysis,
    useVisualFieldAnalysis,
    useVisibilityAnalysis,
    useTurntableSwing,
    useMeasure,
    useDrawing,
} from '../index';
import './App.css';

window.CESIUM_BASE_URL = '/Cesium/';

function App() {
    const viewerRef = useRef<Cesium.Viewer | null>(null);
    const [measure, setMeasure] = useState<Cesium.Viewer>();
    const { measureDistance, measureArea, measureAngle, measureTheHeightOfTheGround } = useMeasure(
        measure as Cesium.Viewer,
        Cesium
    );
    const drawing = useDrawing(
        measure as Cesium.Viewer,
        Cesium
    );
    const visualFieldAnalysis = useVisualFieldAnalysis();
    const slopeDirectionAnalysis = useSlopeDirectionAnalysis();
    const visibilityAnalysis = useVisibilityAnalysis();
    const turntableSwing = useTurntableSwing();

    useEffect(() => {
        if (!viewerRef.current) {
            initCesium();
        }
    }, []);

    const initCesium = () => {
        Cesium.Ion.defaultAccessToken =
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIwYTU3ZjNkZS1hYjFmLTQzMzUtOWY5My0yNzg0ODA0NjQ2MzUiLCJpZCI6MjAxNzc0LCJpYXQiOjE3MTAzODYxOTF9.lHSMHockfqCj7uSpmt66tRxt2__yQ4E3Dr-k5PsBjiQ';

        const viewer = new Cesium.Viewer('cesiumContainer', {
            infoBox: false,
            // terrain: Cesium.Terrain.fromWorldTerrain(),
            terrain: new Cesium.Terrain(
                Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(
                    'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer'
                )
            ),
        });
        viewerRef.current = viewer;
        viewer.scene.globe.enableLighting = true;
        viewer.scene.backgroundColor = Cesium.Color.fromBytes(0, 0, 0, 255);
        viewer.scene.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(109.976043, 34.213954, 10000.0),
            duration: 2.0,
        });
        viewer.scene.globe.shadows = Cesium.ShadowMode.ENABLED;
        setMeasure(viewer);
        visualFieldAnalysis.clear();
        slopeDirectionAnalysis.setInstance(viewer);
        visibilityAnalysis.setInstance(viewer);
        turntableSwing.setInstance(viewer);
    };

    const handleClear = () => {
        measureDistance.clear();
        measureArea.clear();
        measureAngle.clear();
        visualFieldAnalysis.clear();
        slopeDirectionAnalysis.clear();
        visibilityAnalysis.clear();
        turntableSwing.clear();
        drawing.clear()

    };

    const handleInstanceClear = () => {
        drawing.create([
            {
                "x": -1808471.294914932,
                "y": 4956398.633856876,
                "z": 3571861.1332775145
            },
            {
                "x": -1807675.7356215278,
                "y": 4955219.547662385,
                "z": 3573885.5568243423
            },
            {
                "x": -1809780.442174821,
                "y": 4954515.317274883,
                "z": 3573797.3188971495
            },
            {
                "x": -1811127.8268339485,
                "y": 4955226.979883455,
                "z": 3572138.854929411
            },
            {
                "x": -1809655.8181427545,
                "y": 4956131.233805658,
                "z": 3571633.7658116035
            }
        ], { type: 'polygon', lineColor: Cesium.Color.RED, width: 1 })
    };

    const handleDistance = () => {
        measureDistance.active({ trendsComputed: true, clampToGround: true });
    };

    const handleArea = () => {
        measureArea.active();
    };

    const handleAngle = () => {
        measureAngle.active({ trendsComputed: true, clampToGround: true });
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
    }

    const handleDrawingDraw = () => {
        drawing.active({
            type: 0,
        });
        drawing.addToolsEventListener('cesiumToolsFxt', (e) => {
            console.log(e)
        })

    }

    const getPrimvite = () => {
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

    }

    return (
        <div>
            <div id="cesiumContainer" style={{ width: '100%', height: '100vh' }}></div>
            <button className="btn2" onClick={handleClear}>
                测试图层清除
            </button>
            <button className="btn3" onClick={handleInstanceClear}>
                测试实例清除
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
                画面
            </button>
        </div>
    );
}

export default App;
