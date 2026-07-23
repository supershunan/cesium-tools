import * as Cesium from 'cesium';
export enum DrawingTypeEnum {
    /** 点 */
    POINT,
    /** 线 */
    POLYLINE,
    /** 面 */
    POLYGON,
    /** 线与面 */
    POLYGON_AND_POLYLINE,
    /** 广告牌 */
    BILLBOARD,
    /** 标签 */
    LABEL,
}

export const DrawingTypeNameEnum: Record<DrawingTypeEnum, string> = {
    [DrawingTypeEnum.POINT]: 'POINT',
    [DrawingTypeEnum.POLYLINE]: 'POLYLINE',
    [DrawingTypeEnum.POLYGON]: 'POLYGON',
    [DrawingTypeEnum.POLYGON_AND_POLYLINE]: 'POLYGON_AND_POLYLINE',
    [DrawingTypeEnum.BILLBOARD]: 'BILLBOARD',
    [DrawingTypeEnum.LABEL]: 'LABEL',
};

export type LatLng = {
    latitude: number;
    longitude: number;
    height?: number;
};

export type Points = Cesium.Cartesian3 | LatLng;

export type DrawingEntityOptions = {
    type: DrawingTypeEnum;
    name?: string;
    point?: any;
    polyline?: Cesium.Entity.ConstructorOptions;
    polygon?: Cesium.Entity.ConstructorOptions;
    billboard?: Cesium.Entity.ConstructorOptions;
    label?: Cesium.Entity.ConstructorOptions;
};

interface CommonPrimitiveProps {
    showLabel?: boolean;
}
export type CreatePrimitiveOptions = {
    type: DrawingTypeEnum;
    name?: string;
    point?: Cesium.PointPrimitiveCollection & CommonPrimitiveProps;
    polyline?: { width?: number; color?: Cesium.Color; showLabel?: boolean };
    polygon?: { color?: Cesium.Color; showLabel?: boolean };
    /** 同时绘制线与面的时候要如果要改变 polyline 和 polygon 的属性，加上他们的属性即可，但支持 width 和 color */
    polylinPolygon?: CommonPrimitiveProps;
    billboard?: Cesium.BillboardCollection & CommonPrimitiveProps;
    label?: Cesium.LabelCollection;
};

export type EditPrimitiveOptions = {
    type?: DrawingTypeEnum;
    point?: Cesium.PointPrimitiveCollection;
    polyline?: { width?: number; color?: Cesium.Color; positions?: Points[] };
    polygon?: { color?: Cesium.Color; positions?: Points[] };
    billboard?: Cesium.BillboardCollection;
    label?: Cesium.LabelCollection;
    options?: Points[];
};

export type CreateEntityOptions = {
    type?: DrawingTypeEnum;
    point?: Cesium.Entity.ConstructorOptions & CommonPrimitiveProps;
    polyline?: Cesium.Entity.ConstructorOptions & CommonPrimitiveProps;
    polygon?: Cesium.Entity.ConstructorOptions & CommonPrimitiveProps;
    polylinPolygon?: CommonPrimitiveProps;
    billboard?: Cesium.Entity.ConstructorOptions & CommonPrimitiveProps;
    label?: Cesium.Entity.ConstructorOptions;
    options?: Points[];
};
