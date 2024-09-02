import * as Cesium from 'cesium';
import Draw from './draw';
import ViewShed from './visualFieldAnalysis';
import { ViewShedOptionalOptions } from './type';
import { EventCallback } from '../../type/type';

export interface VisualFieldAnalysis {
    active: () => void;
    deactivate: () => void;
    clear: () => void;
    setInstance: (viewer: Cesium.Viewer) => void;
    getInstance: () => ViewShed | null;
    /** 设置通视分析部分开外放参数 */
    setViewShedOptions: (options: ViewShedOptionalOptions) => void;
    cleanInstance: () => void;
    /** 事件名 cesiumToolsFxt */
    addToolsEventListener: (eventName: string, callback: EventCallback<unknown>) => void;
    /** 事件名 cesiumToolsFxt */
    removeToolsEventListener: (eventName: string, callback?: EventCallback<unknown>) => void;
}

let instance: Draw | null = null;
let currentViewer: Cesium.Viewer | null = null;

function ensureInstance(): Draw {
    if (!instance && currentViewer) {
        const handler = new Cesium.ScreenSpaceEventHandler(currentViewer.scene.canvas);
        instance = new Draw(currentViewer, handler);
    }
    if (!instance) {
        throw new Error(
            'ScreenSpaceEventHandler instance not initialized. Call setInstance first.'
        );
    }
    return instance;
}

const screenSpaceEventHandler: VisualFieldAnalysis = {
    active: () => {
        ensureInstance().active();
    },
    deactivate: () => {
        instance?.deactivate();
    },
    clear: () => {
        instance?.clear();
    },
    setInstance: (viewer: Cesium.Viewer) => {
        currentViewer = viewer;
        instance = null; // Reset instance when viewer changes
    },
    getInstance: () => {
        return instance?.drawViewshedEntity ?? null;
    },
    setViewShedOptions: (options: ViewShedOptionalOptions) => {
        const draw = ensureInstance();
        if (draw) {
            draw.setViewShedOptions(options);
        }
    },
    cleanInstance: () => {
        if (instance) {
            instance.handler.destroy();
            instance = null;
        }
        currentViewer = null;
    },
    addToolsEventListener: (eventName, callback) => {
        ensureInstance().addToolsEventListener(eventName, callback);
    },
    removeToolsEventListener: (eventName, callback) => {
        ensureInstance().removeToolsEventListener(eventName, callback);
    },
};

/** 通视分析 */
export function useVisualFieldAnalysis(): VisualFieldAnalysis {
    return screenSpaceEventHandler;
}
