import * as Cesium from 'cesium';
export default class PlotDrawTip {
    viewer: Cesium.Viewer;
    tooltip: HTMLDivElement;
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
        const canvasPosition = Cesium.SceneTransforms.wgs84ToWindowCoordinates(
            this.viewer.scene,
            position
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
