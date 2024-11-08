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
        { trendsComputed: true }
    );
    const { drawingBillboard, drawimgFace } = useDrawing(
        measure as Cesium.Viewer
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
        drawingBillboard?.addToolsEventListener('cesiumToolsFxt', (event) => {
            console.log(event);
        })
    };

    const handleClear = () => {
        // measureDistance().clear();
        // measureArea().clear();
        // measureAngle().clear();
        // visualFieldAnalysis.clear();
        // slopeDirectionAnalysis.clear();
        // visibilityAnalysis.clear();
        // turntableSwing.clear();
        // drawingBillboard.clear();
        // measure?.entities.removeAll()
        // measure?.scene.primitives.removeAll()
        // drawimgFace.clear();

        // console.log(measure?.entities)
        // drawimgFace.edit('wkkk', measure, {})
        drawimgFace.clear()

    };

    const handleInstanceClear = () => {
        drawimgFace.create([
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
        measureDistance().active();
    };

    const handleArea = () => {
        measureArea().active();
    };

    const handleAngle = () => {
        measureAngle().active();
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
        drawingBillboard.active();
        window.wkViewer = measure;
    }

    const handleDrawingDraw = () => {
        window.wkViewer = measure;
        // drawimgFace.active({
        //     lineWidth: 2,
        //     type: 'polygon',
        //     name: '测试名字'
        // });

        drawimgFace.active({
            type: 2,
            // point: {
            //     color: Cesium.Color.RED,
            //     showLabel: true,
            // },
            // label: {
            //     text: '这是点的广告牌'
            // }
        });

    }

    const getPrimvite = () => {
        drawimgFace.edit('wkkk', measure, {
            type: 2,
            // point: {
            //     color: Cesium.Color.BLUE,
            //     showLabel: true,
            // },
            // label: {
            //     text: '修改了',
            //     showBackground: false
            // }
            // polyline: {
            //     color: Cesium.Color.BLUE,
            // },
            polygon: {
                color: Cesium.Color.BLUE,
                showLabel: true
            },
            label: {
                text: '这是测试编辑'
            }
        })
        // console.log(measure?.scene.primitives, measure?.scene.primitives.length)
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
        // drawingBillboard().edit('test', measure, {
        //     label: {
        //         text: '修改了'
        //     },
        //     billboard: {
        //         scale: 0.5
        //     }
        // })

        /**
         * TODO: 新增
         */
        // drawingBillboard.create({ x: -1806588.6592375485, y: 4961936.6534057325, z: 3567728.7822331525 }, {
        //     label: {
        //         text: '测试点'
        //     }
        // })

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
