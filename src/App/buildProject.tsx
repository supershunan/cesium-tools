import * as Cesium from 'cesium';
import React, { useCallback, useEffect } from 'react';

export default function BuildProject({ viewer }: { viewer: Cesium.Viewer }) {
    const loadTileset = useCallback(async () => {
        try {
            const tileset = await Cesium.Cesium3DTileset.fromUrl(
                '/public/hk_3dtitles/tileset.json'
            );
            viewer.scene.primitives.add(tileset);
            viewer.zoomTo(tileset);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('加载 3D Tiles 失败:', error);
        }
    }, [viewer]);

    useEffect(() => {
        if (viewer) {
            loadTileset();

            const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
            handler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
                const pickedObject = viewer.scene.pickPosition(movement.position);
                if (pickedObject) {
                    const cartographic = Cesium.Cartographic.fromCartesian(pickedObject);
                    const latitude = Cesium.Math.toDegrees(cartographic.latitude);
                    const longitude = Cesium.Math.toDegrees(cartographic.longitude);
                    // eslint-disable-next-line no-console
                    console.log(latitude, longitude);
                }
            }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        }
    }, [viewer, loadTileset]);

    return <div></div>;
}
