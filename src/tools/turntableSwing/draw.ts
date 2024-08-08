import * as Cesium from 'cesium';
import TurntableSwing from './turntableSwing';
import MouseEvent from '../mouseBase/mouseBase';

interface Params {
    /** 扫描速度 */
    speed?: number;
    /**
     * false: 回摆模式
     * true: 重复模式
     */
    loop?: boolean;
    /** 摆动角度,默认 180 度 */
    maxAngle?: number;
    /** 回摆方向 */
    up?: boolean;
}
export default class Draw extends MouseEvent {
    protected viewer: Cesium.Viewer;
    protected handler: Cesium.ScreenSpaceEventHandler;
    params?: Params = undefined;
    turntableSwing: TurntableSwing | undefined;
    pointEntity: Cesium.Entity | undefined;

    constructor(
        viewer: Cesium.Viewer,
        handler: Cesium.ScreenSpaceEventHandler,
        params?: Params
    ) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
        this.params = params;
    }

    active(): void {
        this.deactivate();
        this.registerEvents();
    }

    deactivate(): void {
        this.turntableSwing?.clear();
        this.unRegisterEvents();
    }

    protected leftClickEvent() {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            this.turntableSwing = new TurntableSwing(
                this.viewer,
                currentPosition,
                this.params
            );
            this.turntableSwing.add();
            this.turntableSwing.radii(200);

            this.unRegisterEvents();
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    /** 左偏角值 */
    minimumClock(val: number) {
        this.turntableSwing?.minimumClock(val);
    }

    /** 右偏角值 */
    maximumClock(val: number) {
        this.turntableSwing?.maximumClock(val);
    }

    /** 外径大小 */
    radii(val: number) {
        this.turntableSwing?.radii(val);
    }

    /** 内径大小 */
    innerRadii(val: number) {
        this.turntableSwing?.innerRadii(val);
    }

    /** 填充色 rgba */
    fillColor(val: string) {
        this.turntableSwing?.fillColor(val);
    }

    /** 边框色 rgba */
    outlineColor(val: string) {
        this.turntableSwing?.outlineColor(val);
    }
}
