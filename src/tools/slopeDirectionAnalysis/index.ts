import * as Cesium from 'cesium';
import Draw from './draw';

export default function useSlopDerectionAnalysis(viewer: Cesium.Viewer) {
    let instance: Draw | null = null;

    function getInstance(viewer?: Cesium.Viewer): Draw | null {
        if (!instance && viewer) {
            const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
            instance = new Draw(viewer, handler);
        }
        return instance;
    }

    return {
        setInstance: (viewer: Cesium.Viewer) => {
            getInstance(viewer);
        },
        active: () => {
            const draw = getInstance();
            draw?.active();
        },
        deactivate: () => {
            const draw = getInstance();
            draw?.deactivate();
        },
        clear: () => {
            const draw = getInstance();
            draw?.clear();
        },
        setDistance: (value: number) => {
            const draw = getInstance();
            if (draw) {
                draw.distance = value;
            }
        },
        getDrawInstance: () => {
            const draw = getInstance();
            return draw ? draw.distance : null;
        }
    };
}
