import * as Cesium from 'cesium';
import LengthMeasurement from './lengthMeasurement';

interface Measure {
    /** 距离测量 */
    measureDistance: (viewer: Cesium.Viewer) => {
        active: () => void;
        deactivate: () => void;
        clear: () => void;
    }
}
export default function useMeasure(): Measure {
    const measureDistance = (viewer: Cesium.Viewer) => {
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        const lengthMeasurement = new LengthMeasurement(viewer, handler);

        return {
            active: () => {return lengthMeasurement.active();},
            deactivate: () => {return lengthMeasurement.deactivate();},
            clear: () => {return lengthMeasurement.clear();}
        };
    };

    return { measureDistance };
}
