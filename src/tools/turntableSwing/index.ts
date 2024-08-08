import * as Cesium from 'cesium';
import Draw from './draw';
import TurntableSwing from './turntableSwing';

interface Params {
    /** 扫描速度 */
    speed?: number;
    /**
     * false: 回摆模式
     * true: 重复模式
     */
    loop?: boolean;
    /** 摆动角度,默认 180 度 */
    maxAngle?: number;
    /** 回摆方向 */
    up?: boolean;
}

interface TurntableSwingProps {
    active: () => void;
    deactivate: () => void;
    clear: () => void;
    setInstance: (viewer: Cesium.Viewer) =>void;
    getInstance: () => TurntableSwing | null;
}

/** 透视分析 */
export default function useVisibilityAnalysis(): TurntableSwingProps {
    let instance: Draw | null = null;

    function getInstance(viewer?: Cesium.Viewer, params?: Params): Draw | null {
        if (!instance && viewer) {
            const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
            instance = new Draw(viewer, handler, params);
        }
        return instance;
    }

    return {
        active: () => {
            const draw = getInstance();
            draw?.active();
        },
        deactivate: () => {
            const draw = getInstance();
            draw?.deactivate();
        },
        clear: () => {
            const draw = getInstance();
            draw?.clear();
        },
        setInstance: (viewer: Cesium.Viewer, params?: Params) => {
            getInstance(viewer, params);
        },
        getInstance: () => {
            const draw = getInstance();
            return draw?.turntableSwing ? draw?.turntableSwing : null;
        },
    };
}
