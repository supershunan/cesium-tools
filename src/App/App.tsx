import React from 'react';
import '/public/Cesium/Widgets/widgets.css';
import * as Cesium from 'cesium';
import { useEffect, useState } from 'react';
import './App.css';
import Voxel from '../components/voxel/Voxel';
import EarthProjection from '../components/earthProject/EarthProject';
import BuildProject from '../components/buildProject/BuildProject';
import CloseToTheGround from '../example/closeToTheGround';
import CloseTo3dtitles from '../example/closeTo3dtitles';
import Tools from '../components/tools/Tools';

window.CESIUM_BASE_URL = '/Cesium/';
const accessToken =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1MWQzMDI1Ni1kMjljLTQzZWEtYWIyZS0wYzRiMTA3ZTRlZjEiLCJpZCI6MzY3NDEyLCJpYXQiOjE3NjUyMDE5MjF9.CzIQ4rTSniTTEW4tt2CQkqmTRPGhEvCJqtu6SlTrJKM';

function App() {
    const [viewer, setViewer] = useState<Cesium.Viewer | null>(null);

    useEffect(() => {
        Cesium.Ion.defaultAccessToken = accessToken;

        const v = new Cesium.Viewer('cesiumContainer', {
            infoBox: false,
            terrain: Cesium.Terrain.fromWorldTerrain(),
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
        v.scene.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(
                107.99837011905086,
                32.49850968162874,
                10000.0
            ),
            duration: 2.0,
        });
        // v.scene.camera.flyTo({
        //     destination: Cesium.Cartesian3.fromDegrees(
        //         111.33969224427842,
        //         39.73786768701646,
        //         10000.0
        //     ),
        //     duration: 2.0,
        // });
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
            {/* {viewer ? <Tools viewer={viewer} /> : null} */}
            {/* <Voxel viewer={viewer} /> */}
            <CloseTo3dtitles viewer={viewer as Cesium.Viewer} />
            {/* <EarthProjection viewer={viewer} /> */}
            {/* <BuildProject viewer={viewer} /> */}
        </div>
    );
}

export default App;
