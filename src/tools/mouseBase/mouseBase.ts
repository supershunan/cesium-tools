import * as Cesium from 'cesium';

interface ViewerWithElement extends Cesium.Viewer {
    _element: HTMLElement;
}

export default abstract class MouseDrawBase {
    protected viewer: Cesium.Viewer;
    protected handler: Cesium.ScreenSpaceEventHandler;

    constructor(
        viewer: Cesium.Viewer,
        handler: Cesium.ScreenSpaceEventHandler
    ) {
        this.viewer = viewer;
        this.handler = handler;
    }

    active(): void {
        this.deactivate();
        this.registerEvents();
    }

    deactivate(): void {
        // TODO: over event
    }

    clear(): void {
        this.viewer.entities.removeAll();
        this.deactivate();
    }

    protected leftClickEvent(): void {
        // TODO: Implement left click event
    }
    protected rightClickEvent(): void {
        // TODO: Implement right click event
    }

    protected mouseMoveEvent(): void {
        // TODO: Implement mouse move event
    }

    /** 注册鼠标事件 */
    protected registerEvents(): void {
        (this.viewer as ViewerWithElement)._element.style.cursor = 'crosshair';
        this.leftClickEvent();
        this.rightClickEvent();
        this.mouseMoveEvent();
    }

    /** 解除鼠标事件 */
    protected unRegisterEvents(): void {
        (this.viewer as ViewerWithElement)._element.style.cursor = 'default';
        this.handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
        this.handler.removeInputAction(Cesium.ScreenSpaceEventType.RIGHT_CLICK);
        this.handler.removeInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }
}
