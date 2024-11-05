import * as Cesium from 'cesium';
import DrawingPoint from './drawingPoint';
import DrawingBillboard from './drawingBillboard';
import DrawimgFace from './newDrawingPolylinPolygon';
import { EventCallback } from '../../type/type';
import { DrawingTypeEnum } from '../../enum/enum';

type Options = {
    id?: number | string;
    billboard?: Partial<Cesium.Billboard.ConstructorOptions> & { [key: string]: unknown };
    label?: Partial<Cesium.Billboard.ConstructorOptions> & { [key: string]: unknown };
    polyline?: Partial<Cesium.PolygonGraphics> & { [key: string]: unknown };
    polygon?: Partial<Cesium.PolylineGraphics> & { [key: string]: unknown };
    type: 'polygon' | 'line' | 'both';
    lineColor?: Cesium.Color;
    polygonColor?: Cesium.Color;
    width?: number;
};
type LatLng = {
    latitude: number;
    longitude: number;
};

export interface DrawingActions {
    /** 激活 */
    active: (options?: unknown) => void;
    /** 注销 */
    deactivate: () => void;
    /** 清除图层 */
    clear: () => void;
    /** 创建图层 */
    create?: (
        position: Cesium.Cartesian3 | Cesium.Cartesian3[] | LatLng[],
        options?: Options
    ) => void;
    /** 编辑图层 */
    edit?: (id: number | string, viewer: Cesium.Viewer, options: Options) => void;
    /** 事件名 cesiumToolsFxt */
    addToolsEventListener: (eventName: string, callback: EventCallback<unknown>) => void;
    /** 事件名 cesiumToolsFxt */
    removeToolsEventListener: (eventName: string, callback?: EventCallback<unknown>) => void;
}

export interface Drawing {
    /** 绘制点 */
    drawingPoint: DrawingActions;
    /** 绘制广告牌 */
    drawingBillboard: DrawingActions;
    /** 绘制面 */
    drawimgFace: DrawingActions;
}

export function useDrawing(viewer: Cesium.Viewer): Drawing {
    const currenDrawing: { [key: string]: DrawingActions } = {};
    let handler: Cesium.ScreenSpaceEventHandler | null = null;

    const createDrawing = (
        DrawingClass: new (
            viewer: Cesium.Viewer,
            handler: Cesium.ScreenSpaceEventHandler
        ) => DrawingActions,
        type: string
    ): DrawingActions => {
        if (!currenDrawing[type]) {
            handler = new Cesium.ScreenSpaceEventHandler(viewer?.scene.canvas);
            const drawing = new DrawingClass(viewer, handler);
            currenDrawing[type] = drawing;
        }

        return {
            active: (options) => {
                currenDrawing[type]?.active(options);
            },
            deactivate: () => {
                currenDrawing[type]?.deactivate();
                handler?.destroy();
            },
            clear: () => {
                currenDrawing[type]?.clear();
            },
            edit: (id: number | string, viewer: Cesium.Viewer, options: Options) => {
                currenDrawing[type]?.edit?.(id, viewer, options);
            },
            create: (
                position: Cesium.Cartesian3 | Cesium.Cartesian3[] | LatLng[],
                options?: Options
            ) => {
                currenDrawing[type]?.create?.(position, options);
            },
            addToolsEventListener: (eventName, callback) => {
                currenDrawing[type]?.addToolsEventListener(eventName, callback);
            },
            removeToolsEventListener: (eventName, callback) => {
                currenDrawing[type]?.removeToolsEventListener(eventName, callback);
            },
        };
    };
    const drawingPoint = viewer && createDrawing(DrawingPoint, DrawingTypeEnum.point);
    const drawingBillboard = viewer && createDrawing(DrawingBillboard, DrawingTypeEnum.billboard);
    const drawimgFace = viewer && createDrawing(DrawimgFace, DrawingTypeEnum.face);

    return { drawingPoint, drawingBillboard, drawimgFace };
}
