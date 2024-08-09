import * as Cesium from 'cesium';
import Draw from './draw';
import TurntableSwing from './turntableSwing';
import { TurntableParams, GlobalTurntableMethods } from './type';

interface TurntableSwingProps {
    active: () => void;
    deactivate: () => void;
    clear: () => void;
    setInstance: (viewer: Cesium.Viewer, turntableParams?: TurntableParams) =>void;
    getInstance: () => TurntableSwing | null;
    /** 返回所有可以对转角操作的方法 */
    globalTurntableMethod: () => GlobalTurntableMethods | null;
}

/** 模拟雷达转台旋转分析 */
export default function useTurntableSwing(): TurntableSwingProps {
    let instance: Draw | null = null;

    function getInstance(viewer?: Cesium.Viewer, turntableParams?: TurntableParams): Draw | null {
        if (!instance && viewer) {
            const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
            instance = new Draw(viewer, handler, turntableParams);
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
        setInstance: (viewer: Cesium.Viewer, turntableParams?: TurntableParams) => {
            getInstance(viewer, turntableParams);
        },
        getInstance: () => {
            const draw = getInstance();
            return draw?.turntableSwing ? draw?.turntableSwing : null;
        },
        globalTurntableMethod: (): GlobalTurntableMethods | null => {
            const draw = getInstance();
            if (draw) {
                return draw.globalTurntableMethods();
            }
            return null;
        }
    };
}
