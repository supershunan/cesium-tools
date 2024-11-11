import * as Cesium from 'cesium';
import DrawingPrimitives from './drawing';
import { EventCallback } from '../../type/type';
import { CreatePrimitiveOptions, DrawingEntityOptions, Points, EditPrimitiveOptions } from './type';

export interface DrawingActions {
    /** 激活 */
    active: (options?: DrawingEntityOptions) => void;
    /** 注销 */
    deactivate: () => void;
    /** 清除图层 */
    clear: () => void;
    /** 创建图层 */
    create: (id: number | string, position: Points[], options: CreatePrimitiveOptions) => void;
    /** 编辑图层 */
    edit: (id: number | string, viewer: Cesium.Viewer, options: EditPrimitiveOptions) => void;
    /** 事件名 cesiumToolsFxt */
    addToolsEventListener: (eventName: string, callback: EventCallback<unknown>) => void;
    /** 事件名 cesiumToolsFxt */
    removeToolsEventListener: (eventName: string, callback?: EventCallback<unknown>) => void;
}

export function useDrawing(viewer: Cesium.Viewer): DrawingActions {
    let handler: Cesium.ScreenSpaceEventHandler | null = null;

    const createDrawing = (
        DrawingClass: new (
            viewer: Cesium.Viewer,
            handler: Cesium.ScreenSpaceEventHandler
        ) => DrawingActions
    ): DrawingActions => {
        handler = new Cesium.ScreenSpaceEventHandler(viewer?.scene.canvas);
        const drawing = new DrawingClass(viewer, handler);

        return {
            active: (options?: DrawingEntityOptions) => {
                drawing.active(options);
            },
            deactivate: () => {
                drawing.deactivate();
                handler?.destroy();
            },
            clear: () => {
                drawing.clear();
            },
            edit: (id: number | string, viewer: Cesium.Viewer, options: EditPrimitiveOptions) => {
                drawing.edit(id, viewer, options);
            },
            create: (id: number | string, position: Points[], options: CreatePrimitiveOptions) => {
                drawing.create(id, position, options);
            },
            addToolsEventListener: (eventName, callback) => {
                drawing.addToolsEventListener(eventName, callback);
            },
            removeToolsEventListener: (eventName, callback) => {
                drawing.removeToolsEventListener(eventName, callback);
            },
        };
    };
    const drawing = viewer && createDrawing(DrawingPrimitives);

    return drawing;
}
