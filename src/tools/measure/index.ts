import * as Cesium from 'cesium';
import LengthMeasurement from './lengthMeasurement';
import AreaMeasurement from './areaMeasurement';
import AngleMeasurement from './angleMeasurement';
import TheHeightOfTheGround from './theHeightOfTheGround';
import { EventCallback } from '../../type/type';
import { MeasureTypeEnum } from '../../enum/enum';

export interface MeasurementActions {
    /** 激活 */
    active: (options?: { trendsComputed: boolean; clampToGround: boolean }) => void;
    /** 注销 */
    deactivate: () => void;
    /** 清除图层 */
    clear: () => void;
    /** 事件名 cesiumToolsFxt */
    addToolsEventListener: (eventName: string, callback: EventCallback<unknown>) => void;
    /** 事件名 cesiumToolsFxt */
    removeToolsEventListener: (eventName: string, callback?: EventCallback<unknown>) => void;
}

export interface Measure {
    /** 距离测量 */
    measureDistance: MeasurementActions;
    /** 面积测量 */
    measureArea: MeasurementActions;
    /** 角度测量 */
    measureAngle: MeasurementActions;
    /** 地表高度测量 */
    measureTheHeightOfTheGround: MeasurementActions;
}

export function useMeasure(viewer: Cesium.Viewer, cesium: typeof Cesium): Measure {
    // 存储测量实例
    const currentMeasurement: { [key: string]: MeasurementActions } = {};
    let handler: Cesium.ScreenSpaceEventHandler | null = null;

    // 通用的创建测量方法
    const createMeasurement = (
        MeasurementClass: new (
            viewer: Cesium.Viewer,
            handler: Cesium.ScreenSpaceEventHandler,
            cesium: typeof Cesium
        ) => MeasurementActions,
        type: string
    ): MeasurementActions => {
        if (!currentMeasurement[type]) {
            handler = new Cesium.ScreenSpaceEventHandler(viewer?.scene.canvas);
            const measurement = new MeasurementClass(viewer, handler, cesium);
            currentMeasurement[type] = measurement;
        }

        return {
            active: (options?: { trendsComputed: boolean; clampToGround: boolean }) => {
                currentMeasurement[type]?.active(options);
            },
            deactivate: () => {
                currentMeasurement[type]?.deactivate();
                handler?.destroy();
            },
            clear: () => {
                currentMeasurement[type]?.clear();
            },
            addToolsEventListener: (eventName, callback) => {
                currentMeasurement[type]?.addToolsEventListener(eventName, callback);
            },
            removeToolsEventListener: (eventName, callback) => {
                currentMeasurement[type]?.removeToolsEventListener(eventName, callback);
            },
        };
    };

    // 使用通用方法创建不同的测量类型
    const measureDistance = createMeasurement(LengthMeasurement, MeasureTypeEnum.distance);
    const measureArea = createMeasurement(AreaMeasurement, MeasureTypeEnum.area);
    const measureAngle = createMeasurement(AngleMeasurement, MeasureTypeEnum.angle);
    const measureTheHeightOfTheGround = createMeasurement(
        TheHeightOfTheGround,
        MeasureTypeEnum.theHeight
    );

    return { measureDistance, measureArea, measureAngle, measureTheHeightOfTheGround };
}
