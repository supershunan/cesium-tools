import React from 'react';
import '/public/Cesium/Widgets/widgets.css';
import * as Cesium from 'cesium';
import { useEffect, useRef } from 'react';
import './App.css';
import Voxel from '../components/voxel/Voxel';
import EarthProjection from '../components/earthProject/EarthProject';
import BuildProject from '../components/buildProject/BuildProject';
import CloseToTheGround from '../example/closeToTheGround';
import CloseTo3dtitles from '../example/closeTo3dtitles';
import Tools from '../components/tools/Tools';

window.CESIUM_BASE_URL = '/Cesium/';

function App() {
    const viewerRef = useRef<Cesium.Viewer | null>(null);

    useEffect(() => {
        if (!viewerRef.current) {
            initCesium();
        }
    }, []);

    const initCesium = async () => {
        Cesium.Ion.defaultAccessToken =
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1MWQzMDI1Ni1kMjljLTQzZWEtYWIyZS0wYzRiMTA3ZTRlZjEiLCJpZCI6MzY3NDEyLCJpYXQiOjE3NjUyMDE5MjF9.CzIQ4rTSniTTEW4tt2CQkqmTRPGhEvCJqtu6SlTrJKM';

        const viewer = new Cesium.Viewer('cesiumContainer', {
            infoBox: false,
            // terrain: Cesium.Terrain.fromWorldTerrain(),
            // terrain: new Cesium.Terrain(
            //     Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(
            //         'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer'
            //     )
            // ),
            // animation: false,
            timeline: false,
        });

        viewerRef.current = viewer;
        viewer.scene.globe.enableLighting = true;
        viewer.scene.backgroundColor = Cesium.Color.fromBytes(0, 0, 0, 255);
        viewer.scene.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(
                107.99837011905086,
                32.49850968162874,
                10000.0
            ),
            duration: 2.0,
        });
        // viewer.scene.camera.flyTo({
        //     destination: Cesium.Cartesian3.fromDegrees(
        //         111.33969224427842,
        //         39.73786768701646,
        //         10000.0
        //     ),
        //     duration: 2.0,
        // });
        viewer.scene.globe.shadows = Cesium.ShadowMode.ENABLED;
        viewer.scene.globe.enableLighting = false;
        viewer.scene.globe.depthTestAgainstTerrain = false;
        viewer.shadows = false;
        viewer.scene.debugShowFramesPerSecond = true;
    };

    return (
        <div>
            <div id="cesiumContainer" style={{ width: '100%', height: '100vh' }}></div>
            <Tools viewer={viewerRef.current as Cesium.Viewer} />
            {/* <Voxel viewer={viewerRef.current as Cesium.Viewer} /> */}
            {/* <CloseToTheGround viewer={viewerRef.current as Cesium.Viewer} /> */}
            {/* <EarthProjection viewer={viewerRef.current} /> */}
            {/* <BuildProject viewer={viewerRef.current} /> */}
        </div>
    );
}

export default App;
