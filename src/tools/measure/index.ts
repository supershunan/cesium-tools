import * as Cesium from 'cesium';
import LengthMeasurement from './lengthMeasurement';
import AreaMeasurement from './areaMeasurement';
import AngleMeasurement from './angleMeasure';

interface Measure {
    /** 距离测量 */
    measureDistance: (viewer: Cesium.Viewer) => {
        active: () => void;
        deactivate: () => void;
        clear: () => void;
    }
    /** 距离面积 */
    measureArea: (viewer: Cesium.Viewer) => {
        active: () => void;
        deactivate: () => void;
        clear: () => void;
    }
    /** 距离角度 */
    measureAngle: (viewer: Cesium.Viewer) => {
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
            active: () => {
                lengthMeasurement.active();
            },
            deactivate: () => {
                lengthMeasurement.deactivate();
                handler.destroy();
            },
            clear: () => {
                lengthMeasurement.clear();
                handler.destroy();
            }
        };
    };

    const measureArea = (viewer: Cesium.Viewer) => {
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        const lengthMeasurement = new AreaMeasurement(viewer, handler);

        return {
            active: () => {
                lengthMeasurement.active();
            },
            deactivate: () => {
                lengthMeasurement.deactivate();
                handler.destroy();
            },
            clear: () => {
                lengthMeasurement.clear();
                handler.destroy();
            }
        };
    };

    const measureAngle = (viewer: Cesium.Viewer) => {
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        const lengthMeasurement = new AngleMeasurement(viewer, handler);

        return {
            active: () => {
                lengthMeasurement.active();
            },
            deactivate: () => {
                lengthMeasurement.deactivate();
                handler.destroy();
            },
            clear: () => {
                lengthMeasurement.clear();
                handler.destroy();
            }
        };
    };

    return { measureDistance, measureArea, measureAngle };
}
