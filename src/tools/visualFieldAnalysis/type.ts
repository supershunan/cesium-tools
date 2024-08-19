import * as Cesium from 'cesium';

export enum CurrentCountEnum {
    padding,
    start,
    end,
}

/** 视域分析参数 */
export interface ViewShedOptions {
    /** 开始坐标 */
    viewPosition: Cesium.Cartesian3;
    /** 结束坐标 */
    viewPositionEnd: Cesium.Cartesian3;
    /** 观测距离（单位`米`，默认值100）*/
    viewDistance?: number;
    /** 航向角（单位`度`，默认值0） */
    viewHeading?: number;
    /** 俯仰角（单位`度`，默认值0） */
    viewPitch?: number;
    /** 可视域水平夹角（单位`度`，默认值90） */
    horizontalViewAngle?: number;
    /** 可视域垂直夹角（单位`度`，默认值60） */
    verticalViewAngle?: number;
    /** 可视区域颜色（默认值`绿色`） */
    visibleAreaColor?: Cesium.Color;
    /** 不可视区域颜色（默认值`红色`） */
    invisibleAreaColor?: Cesium.Color;
    /** 阴影贴图是否可用 */
    enabled?: boolean;
    /** 是否启用柔和阴影 */
    softShadows?: boolean;
    /** 每个阴影贴图的大小 */
    size?: number;
}

export type ViewShedOptionalOptions = Omit<
    ViewShedOptions,
    'viewPosition' | 'viewPositionEnd' | 'viewDistance' | 'viewHeading' | 'viewPitch'
>;
