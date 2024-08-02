import * as Cesium from 'cesium';
import Draw from './draw';
import ViewShed from './visualFieldAnalysis';
import { ViewShedOptionalOptions } from './type';


interface VisualFieldAnalysis {
    active: () => void;
    deactivate: () => void;
    clear: () => void;
    setInstance: (viewer: Cesium.Viewer) =>void;
    getInstance: () => ViewShed | null;
    /** 设置同事分析部分开外放参数 */
    setViewShedOptions: (options: ViewShedOptionalOptions) => void;
}

/** 通视分析 */
export default function useVisualFieldAnalysis(): VisualFieldAnalysis {
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
        getInstance: (): ViewShed | null => {
            const draw = getInstance();
            return draw?.drawViewshedEntity ? draw.drawViewshedEntity : null;
        },
        setViewShedOptions: (options: ViewShedOptionalOptions) => {
            const draw = getInstance();
            if (draw) {
                draw.setViewShedOptions(options);
            }
        }
    };
}
