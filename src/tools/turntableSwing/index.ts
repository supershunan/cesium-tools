import * as Cesium from 'cesium';
import Draw from './draw';
import TurntableSwing from './turntableSwing';
import { TurntableParams, GlobalTurntableMethods } from './type';
import { EventCallback } from '../../type/type';

export interface TurntableSwingProps {
    active: () => void;
    deactivate: () => void;
    clear: () => void;
    setInstance: (viewer: Cesium.Viewer, turntableParams?: TurntableParams) => void;
    getInstance: () => TurntableSwing | null;
    /** 返回所有可以对转角操作的方法 */
    globalTurntableMethod: () => GlobalTurntableMethods | null;
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
        throw new Error('TurntableSwing instance not initialized. Call setInstance first.');
    }
    return instance;
}

const turntableSwingProps: TurntableSwingProps = {
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
        return instance?.turntableSwing ?? null;
    },
    globalTurntableMethod: (): GlobalTurntableMethods | null => {
        const draw = ensureInstance();
        if (draw) {
            return draw.globalTurntableMethods();
        }
        return null;
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

/** 模拟雷达转台旋转分析 */
export function useTurntableSwing(): TurntableSwingProps {
    return turntableSwingProps;
}
