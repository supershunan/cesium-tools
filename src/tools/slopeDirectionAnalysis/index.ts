import * as Cesium from 'cesium';
import Draw from './draw';
import SloopAspectAnalysis from './slopeDerectiontAnalysis';

interface SlopDerectionAnalysis {
    active: () => void;
    deactivate: () => void;
    clear: () => void;
    setInstance: (viewer: Cesium.Viewer) =>void;
    getInstance: () => SloopAspectAnalysis | null;
    /** 设置网格切割的精度 单位(km) 最小为20 精度越大越消耗性能 */
    setDistance: (value: number) => void;
}

type Minimum20 = number & { __minimum20__: void };

function ensureMinimum20(value: number): asserts value is Minimum20 {
    if (value < 20) {
        throw new Error('坡向分析的精度最小为20km');
    }
}

/** 坡向分析 */
export default function useSlopDerectionAnalysis(): SlopDerectionAnalysis {
    let instance: Draw | null = null;

    function getInstance(viewer?: Cesium.Viewer): Draw | null {
        if (!instance && viewer) {
            const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
            instance = new Draw(viewer, handler);
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
        setInstance: (viewer: Cesium.Viewer) => {
            getInstance(viewer);
        },
        getInstance: () => {
            const draw = getInstance();
            return draw?.slopeAspectAnalysis ? draw?.slopeAspectAnalysis : null;
        },
        setDistance: (value: number) => {
            ensureMinimum20(value);
            const draw = getInstance();
            if (draw) {
                draw.distance = value;
            }
        },
    };
}
