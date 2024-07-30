import * as Cesium from 'cesium';

interface ViewerWithElement extends Cesium.Viewer {
    _element: HTMLElement;
}

export default abstract class MouseDrawBase {
    viewer: Cesium.Viewer;
    handler: Cesium.ScreenSpaceEventHandler;

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
        (this.viewer as ViewerWithElement)._element.style.cursor = 'crosshair';
    }

    deactivate(): void {
        (this.viewer as ViewerWithElement)._element.style.cursor = 'default';
    }

    clear(): void {
        this.viewer.entities.removeAll();
        this.deactivate();
    }

    leftClickEvent(): void {
        // TODO: Implement left click event
    }
    rightClickEvent(): void {
        // TODO: Implement right click event
    }

    mouseMoveEvent(): void {
        // TODO: Implement mouse move event
    }

    /** 注册鼠标事件 */
    protected registerEvents(): void {
        this.leftClickEvent();
        this.rightClickEvent();
        this.mouseMoveEvent();
    }

    /** 解除鼠标事件 */
    protected unRegisterEvents(): void {
        this.handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
        this.handler.removeInputAction(Cesium.ScreenSpaceEventType.RIGHT_CLICK);
        this.handler.removeInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }
}
