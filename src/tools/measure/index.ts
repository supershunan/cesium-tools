import * as Cesium from 'cesium';
import LengthMeasurement from './lengthMeasurement';
import AreaMeasurement from './areaMeasurement';
import AngleMeasurement from './angleMeasurement';
import TheHeightOfTheGround from './theHeightOfTheGround';
import { EventCallback } from '../../type/type';
import { MeasureTypeEnum } from '../../enum/enum';

export interface LabelOptions {
    /** 默认 true；为 false 时不显示标签 */
    show?: boolean;
    template?: string;
    font?: string;
    scale?: number;
    fillColor?: Cesium.Color;
    outlineColor?: Cesium.Color;
    outlineWidth?: number;
    style?: Cesium.LabelStyle;
    showBackground?: boolean;
    verticalOrigin?: Cesium.VerticalOrigin;
    horizontalOrigin?: Cesium.HorizontalOrigin;
    pixelOffset?: Cesium.Cartesian2;
    disableDepthTestDistance?: number;
    /**
     * 自定义标签文案；入参为原始数值（米、度等），便于自行换算或国际化
     * - 长度：value1 为当前线段距离（贴地为测地距离，否则为平面距离）
     * - 面积：value1 为平面面积、value2 为测地面积（平方米）
     * - 角度：边长标签 value1 为平面距离；角点标签 value1 为角度（度）
     */
    customRender?: (value1: number, value2?: number) => string;
}

export interface AngleActiveOptions {
    clampToGround?: boolean;
    /** 默认相当于 `true`。设为 `false` 时不在移动中实时更新距离与角度预览标签，仅保留折线预览。 */
    liveUpdateOnMove?: boolean;
    distance?: LabelOptions;
    angle?: LabelOptions;
}

export interface AreaActiveOptions {
    clampToGround?: boolean;
    pass2D?: boolean;
    pass3D?: boolean;
    /** 默认相当于 `true`。设为 `false` 时不在移动中实时更新面积标签，仅保留多边形预览。 */
    liveUpdateOnMove?: boolean;
    area?: LabelOptions;
}

export interface LengthActiveOptions {
    clampToGround?: boolean;
    /** 默认相当于 `true`。设为 `false` 时不在移动中实时更新测距标签，仅保留折线预览。 */
    liveUpdateOnMove?: boolean;
    line?: LabelOptions;
}

export interface TheHeightOfTheGroundActiveOptions {
    clampToGround: boolean;
    height?: LabelOptions;
}

export interface MeasurementActions<T = unknown> {
    /** 激活 */
    active: (options?: T) => void;
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
    measureDistance: MeasurementActions<LengthActiveOptions>;
    /** 面积测量 */
    measureArea: MeasurementActions<AreaActiveOptions>;
    /** 角度测量 */
    measureAngle: MeasurementActions<AngleActiveOptions>;
    /** 地表高度测量 */
    measureTheHeightOfTheGround: MeasurementActions<TheHeightOfTheGroundActiveOptions>;
}

export function useMeasure(viewer: Cesium.Viewer, cesium: typeof Cesium): Measure {
    // 存储测量实例
    const currentMeasurement: Record<string, MeasurementActions<any>> = {};
    let handler: Cesium.ScreenSpaceEventHandler | null = null;

    // 通用的创建测量方法
    const createMeasurement = <T = unknown>(
        MeasurementClass: new (
            viewer: Cesium.Viewer,
            handler: Cesium.ScreenSpaceEventHandler,
            cesium: typeof Cesium
        ) => MeasurementActions<T>,
        type: string
    ): MeasurementActions<T> => {
        if (!currentMeasurement[type]) {
            handler = new Cesium.ScreenSpaceEventHandler(viewer?.scene.canvas);
            const measurement = new MeasurementClass(viewer, handler, cesium);
            currentMeasurement[type] = measurement;
        }

        return {
            active: (options?: T) => {
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
    const measureDistance = createMeasurement<LengthActiveOptions>(
        LengthMeasurement,
        MeasureTypeEnum.distance
    );
    const measureArea = createMeasurement<AreaActiveOptions>(AreaMeasurement, MeasureTypeEnum.area);
    const measureAngle = createMeasurement<AngleActiveOptions>(
        AngleMeasurement,
        MeasureTypeEnum.angle
    );
    const measureTheHeightOfTheGround = createMeasurement<TheHeightOfTheGroundActiveOptions>(
        TheHeightOfTheGround,
        MeasureTypeEnum.theHeight
    );

    return { measureDistance, measureArea, measureAngle, measureTheHeightOfTheGround };
}
