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

type LatLng = {
    latitude: number;
    longitude: number;
    height?: number;
};

export type Points = Cesium.Cartesian3 | LatLng;

export type DrawingEntityOptions = {
    type: DrawingTypeEnum;
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
    point?: Cesium.PointPrimitiveCollection & CommonPrimitiveProps;
    polyline?:
        | (Cesium.GroundPolylineGeometry & CommonPrimitiveProps)
        | { width?: number; color?: Cesium.Color };
    polygon?: (Cesium.PolygonGeometry & CommonPrimitiveProps) | { color?: Cesium.Color };
    /** 同时绘制线与面的时候要如果要改变 polyline 和 polygon 的属性，加上他们的属性即可，但支持 width 和 color */
    polylinPolygon?: CommonPrimitiveProps;
    billboard?: Cesium.BillboardCollection & CommonPrimitiveProps;
    label?: Cesium.LabelCollection;
};

export type EditPrimitiveOptions = {
    type?: DrawingTypeEnum;
    point?: Cesium.PointPrimitiveCollection;
    polyline?: { width?: number; color?: Cesium.Color };
    polygon?: { color?: Cesium.Color };
    billboard?: Cesium.BillboardCollection;
    label?: Cesium.LabelCollection;
};
