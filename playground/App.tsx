import React from 'react';
import '/public/Cesium/Widgets/widgets.css';
import * as Cesium from 'cesium';
import { useEffect, useState } from 'react';
import './App.css';
import MultsCloseToTheGround from './example/multsCloseToTheGround';
import BuildProject from './components/buildProject/BuildProject';
import CloseToTheGround from './example/closeToTheGround';
import CloseTo3dtitles from './example/closeTo3dtitles';
import Tools from './components/tools/Tools';
import SlopeProject from './components/SlopeProject/SlopeProject';

window.CESIUM_BASE_URL = '/Cesium/';
const accessToken = import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';

function App() {
    const [viewer, setViewer] = useState<Cesium.Viewer | null>(null);

    useEffect(() => {
        if (accessToken) {
            Cesium.Ion.defaultAccessToken = accessToken;
        }

        const v = new Cesium.Viewer('cesiumContainer', {
            infoBox: false,
            // terrain: Cesium.Terrain.fromWorldTerrain(),
            // terrain: new Cesium.Terrain(
            //     Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(
            //         'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer'
            //     )
            // ),
            animation: false,
            timeline: false,
        });

        setViewer(v);
        v.scene.globe.enableLighting = true;
        v.scene.backgroundColor = Cesium.Color.fromBytes(0, 0, 0, 255);
        // v.scene.camera.flyTo({
        //     destination: Cesium.Cartesian3.fromDegrees(
        //         107.99837011905086,
        //         32.49850968162874,
        //         10000.0
        //     ),
        //     duration: 2.0,
        // });
        v.scene.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(
                111.23723753169938,
                39.71747746041512,
                10000.0
            ),
            duration: 2.0,
        });
        v.scene.globe.shadows = Cesium.ShadowMode.ENABLED;
        v.scene.globe.enableLighting = false;
        v.scene.globe.depthTestAgainstTerrain = false;
        v.shadows = false;
        v.scene.debugShowFramesPerSecond = true;

        return () => {
            v.destroy();
            setViewer(null);
        };
    }, []);

    return (
        <div>
            <div id="cesiumContainer" style={{ width: '100%', height: '100vh' }}></div>
            {/* 工具类 用于调试和测试 */}
            {viewer ? <Tools viewer={viewer as Cesium.Viewer} /> : null}
            {/* 单个雷达数据图层渲染 3dtitles 使用 fxt 测雨雷达数据 */}
            {/* <CloseTo3dtitles viewer={viewer as Cesium.Viewer} /> */}
            {/* 单个雷达数据图层渲染 使用 fxt 测雨雷达数据 */}
            {/* <CloseToTheGround viewer={viewer as Cesium.Viewer} /> */}
            {/* 多个雷达数据图层渲染 使用 fxt 测雨雷达数据 */}
            {/* <MultsCloseToTheGround viewer={viewer as Cesium.Viewer} /> */}
            {/* 3dtiles 模拟墙体变形 */}
            {/* <BuildProject viewer={viewer as Cesium.Viewer} /> */}
            {/* 边坡 */}
            {/* <SlopeProject viewer={viewer as Cesium.Viewer} /> */}
        </div>
    );
}

export default App;
