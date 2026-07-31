import * as Cesium from 'cesium';

/** Cesium 1.102+ 使用 worldToWindowCoordinates；旧版为 wgs84ToWindowCoordinates */
function cartesian3ToCanvas(
    scene: Cesium.Scene,
    position: Cesium.Cartesian3,
    result: Cesium.Cartesian2
): Cesium.Cartesian2 | undefined {
    const ST = Cesium.SceneTransforms as {
        worldToWindowCoordinates?: (
            s: Cesium.Scene,
            p: Cesium.Cartesian3,
            r?: Cesium.Cartesian2
        ) => Cesium.Cartesian2 | undefined;
        wgs84ToWindowCoordinates?: (
            s: Cesium.Scene,
            p: Cesium.Cartesian3,
            r?: Cesium.Cartesian2
        ) => Cesium.Cartesian2 | undefined;
    };
    if (typeof ST.worldToWindowCoordinates === 'function') {
        return ST.worldToWindowCoordinates(scene, position, result);
    }
    if (typeof ST.wgs84ToWindowCoordinates === 'function') {
        return ST.wgs84ToWindowCoordinates(scene, position, result);
    }
    return undefined;
}

export default class PlotDrawTip {
    viewer: Cesium.Viewer;
    tooltip: HTMLDivElement;
    private readonly _canvasScratch = new Cesium.Cartesian2();

    constructor(viewer: Cesium.Viewer) {
        this.viewer = viewer;
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'cesium-plot-draw-tip';
        this.tooltip.style.position = 'absolute';
        this.tooltip.style.color = '#ffffff';
        this.tooltip.style.pointerEvents = 'none';
        this.tooltip.style.display = 'none';
        this.viewer.container.appendChild(this.tooltip);
    }

    setContent(content: any[]) {
        this.tooltip.innerHTML = content.join('<br>');
        this.tooltip.style.display = 'block';
        this.tooltip.style.marginLeft = '20px';
    }

    updatePosition(position: Cesium.Cartesian3) {
        const canvasPosition = cartesian3ToCanvas(
            this.viewer.scene,
            position,
            this._canvasScratch
        );
        if (canvasPosition) {
            this.tooltip.style.left = `${canvasPosition.x}px`;
            this.tooltip.style.top = `${canvasPosition.y}px`;
        } else {
            this.tooltip.style.display = 'none';
        }
    }

    remove() {
        this.tooltip?.parentNode?.removeChild(this.tooltip);
    }
}
