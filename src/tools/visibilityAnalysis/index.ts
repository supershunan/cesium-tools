import * as Cesium from 'cesium';
import Draw from './draw';
import VisibilityAnalysis from './visibilityAnalysis';

interface VisibilityAnalysisProps {
    active: () => void;
    deactivate: () => void;
    clear: () => void;
    setInstance: (viewer: Cesium.Viewer) =>void;
    getInstance: () => VisibilityAnalysis | null;
}

/** 透视分析 */
export default function useVisibilityAnalysis(): VisibilityAnalysisProps {
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
            return draw?.drawViewshedEntity ? draw?.drawViewshedEntity : null;
        },
    };
}
