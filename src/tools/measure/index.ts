import * as Cesium from 'cesium';
import LengthMeasurement from './lengthMeasurement';
import AreaMeasurement from './areaMeasurement';
import AngleMeasurement from './angleMeasurement';

interface MeasurementActions {
    /** 激活 */
    active: () => void;
    /** 注销 */
    deactivate: () => void;
    /** 清除图层 */
    clear: () => void;
}

interface Measure {
    /** 距离测量 */
    measureDistance: () => MeasurementActions;
    /** 面积测量 */
    measureArea: () => MeasurementActions;
    /** 角度测量 */
    measureAngle: () => MeasurementActions;
}

export default function useMeasure(viewer: Cesium.Viewer): Measure {
    // 通用的创建测量方法
    const createMeasurement = (MeasurementClass: new (viewer: Cesium.Viewer, handler: Cesium.ScreenSpaceEventHandler) => MeasurementActions): MeasurementActions => {
        const handler = new Cesium.ScreenSpaceEventHandler(viewer?.scene.canvas);
        const measurement = new MeasurementClass(viewer, handler);

        return {
            active: () => {
                measurement.active();
            },
            deactivate: () => {
                measurement.deactivate();
                handler.destroy();
            },
            clear: () => {
                measurement.clear();
            }
        };
    };

    // 使用通用方法创建不同的测量类型
    const measureDistance = () => {return createMeasurement(LengthMeasurement);};
    const measureArea = () => {return createMeasurement(AreaMeasurement);};
    const measureAngle = () => {return createMeasurement(AngleMeasurement);};

    return { measureDistance, measureArea, measureAngle };
}
