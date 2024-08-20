import * as Cesium from 'cesium';
import LengthMeasurement from './lengthMeasurement';
import AreaMeasurement from './areaMeasurement';
import AngleMeasurement from './angleMeasurement';
import TheHeightOfTheGround from './theHeightOfTheGround';
import { EventCallback } from '../../type/type';

interface MeasurementActions {
    /** 激活 */
    active: () => void;
    /** 注销 */
    deactivate: () => void;
    /** 清除图层 */
    clear: () => void;
    addToolsEventListener: (eventName: string, callback: EventCallback<unknown>) => void;
    removeToolsEventListener: (eventName: string, callback?: EventCallback<unknown>) => void;
}

interface Measure {
    /** 距离测量 */
    measureDistance: () => MeasurementActions;
    /** 面积测量 */
    measureArea: () => MeasurementActions;
    /** 角度测量 */
    measureAngle: () => MeasurementActions;
    /** 地表高度测量 */
    measureTheHeightOfTheGround: () => MeasurementActions;
}

export default function useMeasure(viewer: Cesium.Viewer): Measure {
    // 存储测量实例
    let currentMeasurement: MeasurementActions | null = null;
    let handler: Cesium.ScreenSpaceEventHandler | null = null;

    // 通用的创建测量方法
    const createMeasurement = (
        MeasurementClass: new (
            viewer: Cesium.Viewer,
            handler: Cesium.ScreenSpaceEventHandler
        ) => MeasurementActions
    ): MeasurementActions => {
        if (!currentMeasurement && !handler) {
            handler = new Cesium.ScreenSpaceEventHandler(viewer?.scene.canvas);
            const measurement = new MeasurementClass(viewer, handler);
            currentMeasurement = measurement;
        }

        return {
            active: () => {
                currentMeasurement?.active();
            },
            deactivate: () => {
                currentMeasurement?.deactivate();
                handler?.destroy();
            },
            clear: () => {
                currentMeasurement?.clear();
            },
            addToolsEventListener: (eventName, callback) => {
                currentMeasurement?.addToolsEventListener(eventName, callback);
            },
            removeToolsEventListener: (eventName, callback) => {
                currentMeasurement?.removeToolsEventListener(eventName, callback);
            },
        };
    };

    // 使用通用方法创建不同的测量类型
    const measureDistance = () => {
        return createMeasurement(LengthMeasurement);
    };
    const measureArea = () => {
        return createMeasurement(AreaMeasurement);
    };
    const measureAngle = () => {
        return createMeasurement(AngleMeasurement);
    };
    const measureTheHeightOfTheGround = () => {
        return createMeasurement(TheHeightOfTheGround);
    };

    return { measureDistance, measureArea, measureAngle, measureTheHeightOfTheGround };
}
