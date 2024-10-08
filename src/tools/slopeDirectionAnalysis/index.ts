import * as Cesium from 'cesium';
import Draw from './draw';
import SloopAspectAnalysis from './slopeDerectiontAnalysis';
import { EventCallback } from '../../type/type';

export interface SlopDerectionAnalysis {
    active: () => void;
    deactivate: () => void;
    clear: () => void;
    setInstance: (viewer: Cesium.Viewer) => void;
    getInstance: () => SloopAspectAnalysis | null;
    /** 设置网格切割的精度 单位(km) 最小为20 精度越大越消耗性能 */
    setDistance: (value: number) => void;
    cleanInstance: () => void;
    /** 事件名 cesiumToolsFxt */
    addToolsEventListener: (eventName: string, callback: EventCallback<unknown>) => void;
    /** 事件名 cesiumToolsFxt */
    removeToolsEventListener: (eventName: string, callback?: EventCallback<unknown>) => void;
}

const MIN_DISTANCE = 20;

let instance: Draw | null = null;
let currentViewer: Cesium.Viewer | null = null;

function ensureInstance(): Draw {
    if (!instance && currentViewer) {
        const handler = new Cesium.ScreenSpaceEventHandler(currentViewer.scene.canvas);
        instance = new Draw(currentViewer, handler);
    }
    if (!instance) {
        throw new Error('SlopDerectionAnalysis instance not initialized. Call setInstance first.');
    }
    return instance;
}

const slopDerectionAnalysis: SlopDerectionAnalysis = {
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
        return instance?.slopeAspectAnalysis ?? null;
    },
    setDistance: (value: number) => {
        if (value < MIN_DISTANCE) {
            throw new Error(`坡向分析的精度最小为${MIN_DISTANCE}km`);
        }
        ensureInstance().distance = value;
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

/** 坡向分析 */
export function useSlopeDirectionAnalysis(): SlopDerectionAnalysis {
    return slopDerectionAnalysis;
}
