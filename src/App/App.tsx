import '/public/Cesium/Widgets/widgets.css';
import * as Cesium from 'cesium';
import { useEffect, useRef, useState } from 'react';
import useSlopeDirectionAnalysis from '@tools/slopeDirectionAnalysis/index';
import './App.css';

window.CESIUM_BASE_URL = '/Cesium/';

function App() {
    const viewerRef = useRef<Cesium.Viewer | null>(null);
    const slopeDirectionAnalysis = useSlopeDirectionAnalysis(viewerRef.current);

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
        });
        viewerRef.current = viewer;
        viewer.scene.globe.enableLighting = true;
        viewer.scene.backgroundColor = Cesium.Color.fromBytes(0, 0, 0, 255);
        viewer.scene.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(
                122.0708,
                37.4199,
                10000.0
            ),
            duration: 2.0,
        });
        viewer.scene.globe.shadows = Cesium.ShadowMode.ENABLED;
        if (viewerRef.current) {
            slopeDirectionAnalysis.setInstance(viewer);
        }
    };

    const handleDraw = () => {
        slopeDirectionAnalysis?.active();
    };

    const handleClear = () => {
        // startDraw?.radii(1000);
        slopeDirectionAnalysis?.clear();
    };

    return (
        <div>
            <div
                id="cesiumContainer"
                style={{ width: '100%', height: '100vh' }}
            ></div>
            <button className="btn" onClick={handleDraw}>
                测试功能按钮
            </button>
            <button className="btn2" onClick={handleClear}>
                测试清除
            </button>
        </div>
    );
}

export default App;
