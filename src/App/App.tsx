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
    const { active, clear, setInstance, cleanInstance } = useVisualFieldAnalysis();

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
            terrain: Cesium.Terrain.fromWorldTerrain(),
            // terrain: new Cesium.Terrain(
            //     Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(
            //         'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer'
            //     )
            // ),
        });
        viewerRef.current = viewer;
        viewer.scene.globe.enableLighting = true;
        viewer.scene.backgroundColor = Cesium.Color.fromBytes(0, 0, 0, 255);
        viewer.scene.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(109.976043, 34.213954, 10000.0),
            duration: 2.0,
        });
        viewer.scene.globe.shadows = Cesium.ShadowMode.ENABLED;
        setInstance(viewer);
        setMeasure(viewer);
    };

    const handleDraw = () => {
        active();
        // measureDistance().active();
    };

    const handleClear = () => {
        // clear();
    };

    const handleInstanceClear = () => {
        // cleanInstance();
        measureDistance().clear();
        measureArea().clear();
        clear();
    };

    const handleDistance = () => {
        measureDistance().active();
    };

    const handleArea = () => {
        measureArea().active();
    };

    const handleVisbility = () => {
        active();
    };

    return (
        <div>
            <div id="cesiumContainer" style={{ width: '100%', height: '100vh' }}></div>
            <button className="btn" onClick={handleDraw}>
                测试功能按钮
            </button>
            <button className="btn2" onClick={handleClear}>
                测试图层清除
            </button>
            <button className="btn3" onClick={handleInstanceClear}>
                测试实例清除
            </button>
            <button className="btn4" onClick={handleDistance}>
                距离
            </button>
            <button className="btn5" onClick={handleArea}>
                面积
            </button>
            <button className="btn6" onClick={handleVisbility}>
                透视分析
            </button>
        </div>
    );
}

export default App;
