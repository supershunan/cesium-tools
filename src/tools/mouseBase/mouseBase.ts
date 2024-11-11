import * as Cesium from 'cesium';
import CesiumToolsManage from '../eventTarget/eventTarget';

interface ViewerWithElement extends Cesium.Viewer {
    _element: HTMLElement;
}
type EventCallback<T> = (event: CustomEvent<T>) => void;

export default abstract class MouseDrawBase {
    protected viewer: Cesium.Viewer;
    protected handler: Cesium.ScreenSpaceEventHandler;
    protected cesiumToolsManage: CesiumToolsManage;

    constructor(viewer: Cesium.Viewer, handler: Cesium.ScreenSpaceEventHandler) {
        this.viewer = viewer;
        this.handler = handler;
        this.cesiumToolsManage = new CesiumToolsManage();
    }

    active(): void;
    active(options: unknown): void;
    active(options?: unknown): void {
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

    protected dispatch<T>(eventName: string, data: T): void {
        this.cesiumToolsManage.dispatch(eventName, data);
    }

    protected addEventListener<T>(eventName: string, callback: EventCallback<T>): void {
        this.cesiumToolsManage.addEventListener(eventName, callback);
    }

    protected removeEventListener<T>(eventName: string, callback?: EventCallback<T>): void {
        this.cesiumToolsManage.removeEventListener(eventName, callback);
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
