import * as Cesium from 'cesium';
import MouseEvent from '../mouseBase/mouseBase';

enum DrawingPolylinPolygonType {
    /** 点 */
    POINT,
    /** 线 */
    POLYLINE,
    /** 面 */
    POLYGON,
    /** 线与面 */
    POLYGON_AND_POLYLINE,
    /** 广告牌 */
    BILLBOARD,
    /** 标签 */
    LABEL,
}
export default class DrawingPrimtives extends MouseEvent {
    private viewer: Cesium.Viewer;
    private handler: Cesium.ScreenSpaceEventHandler;

    constructor(viewer: Cesium.Viewer, handler: Cesium.ScreenSpaceEventHandler) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
    }
}
