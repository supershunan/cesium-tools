import * as Cesium from 'cesium';
import DrawingPrimitives from './drawing';
import DrawingEntities from './entityDrawing';
import { EventCallback } from '../../type/type';
import {
    CreatePrimitiveOptions,
    DrawingEntityOptions,
    Points,
    EditPrimitiveOptions,
    CreateEntityOptions,
} from './type';

export interface DrawingActions<
    TCreateOptions,
    TEditOptions,
    TActiveOptions = DrawingEntityOptions,
> {
    active: (options?: TActiveOptions) => void;
    deactivate: () => void;
    clear: () => void;
    create: (id: number | string, position: Points[], options: TCreateOptions) => void;
    edit: (id: number | string, viewer: Cesium.Viewer, options: TEditOptions) => void;
    addToolsEventListener: (eventName: string, callback: EventCallback<unknown>) => void;
    removeToolsEventListener: (eventName: string, callback?: EventCallback<unknown>) => void;
}

// 定义具体的类型别名
export type PrimitiveDrawingActions = DrawingActions<CreatePrimitiveOptions, EditPrimitiveOptions>;

export type EntityDrawingActions = DrawingActions<CreateEntityOptions, CreateEntityOptions>;

export function useDrawing(
    viewer: Cesium.Viewer,
    cesium: typeof Cesium
): {
    drawing: PrimitiveDrawingActions;
    drawingEntity: EntityDrawingActions;
} {
    let handler: Cesium.ScreenSpaceEventHandler | null = null;

    const createDrawing = <
        T extends PrimitiveDrawingActions | EntityDrawingActions,
        TOptions = T extends PrimitiveDrawingActions ? EditPrimitiveOptions : CreateEntityOptions,
        TCreateOptions = T extends PrimitiveDrawingActions
            ? CreatePrimitiveOptions
            : CreateEntityOptions,
    >(
        DrawingClass: new (
            viewer: Cesium.Viewer,
            handler: Cesium.ScreenSpaceEventHandler,
            cesium: typeof Cesium
        ) => T
    ): T => {
        handler = new Cesium.ScreenSpaceEventHandler(viewer?.scene.canvas);
        const drawing = new DrawingClass(viewer, handler, cesium);

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
            edit: (id: number | string, viewer: Cesium.Viewer, options: TOptions) => {
                drawing.edit(id, viewer, options as any);
            },
            create: (id: number | string, position: Points[], options: TCreateOptions) => {
                drawing.create(id, position, options as any);
            },
            addToolsEventListener: (eventName, callback) => {
                drawing.addToolsEventListener(eventName, callback);
            },
            removeToolsEventListener: (eventName, callback) => {
                drawing.removeToolsEventListener(eventName, callback);
            },
        } as T;
    };

    const drawing = viewer && createDrawing<PrimitiveDrawingActions>(DrawingPrimitives);
    const drawingEntity = viewer && createDrawing<EntityDrawingActions>(DrawingEntities);

    return { drawing, drawingEntity };
}
