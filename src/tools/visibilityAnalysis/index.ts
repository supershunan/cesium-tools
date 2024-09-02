import * as Cesium from 'cesium';
import Draw from './draw';
import VisibilityAnalysis from './visibilityAnalysis';
import { EventCallback } from '../../type/type';

export interface VisibilityAnalysisProps {
    active: () => void;
    deactivate: () => void;
    clear: () => void;
    setInstance: (viewer: Cesium.Viewer) => void;
    getInstance: () => VisibilityAnalysis | null;
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
            'VisibilityAnalysisProps instance not initialized. Call setInstance first.'
        );
    }
    return instance;
}

const visibilityAnalysisProps: VisibilityAnalysisProps = {
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

/** 透视分析 */
export function useVisibilityAnalysis(): VisibilityAnalysisProps {
    return visibilityAnalysisProps;
}
