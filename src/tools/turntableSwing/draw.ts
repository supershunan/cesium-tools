import * as Cesium from 'cesium';
import TurntableSwing from './turntableSwing';
import MouseEvent from '../mouseBase/mouseBase';

export default class Draw extends MouseEvent {
    viewer: Cesium.Viewer;
    handler: Cesium.ScreenSpaceEventHandler;
    TurntableSwing: TurntableSwing | undefined;
    pointEntity: Cesium.Entity | undefined;

    constructor(
        viewer: Cesium.Viewer,
        handler: Cesium.ScreenSpaceEventHandler
    ) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
    }

    active(): void {
        this.deactivate();
        this.registerEvents();
    }

    deactivate(): void {
        this.unRegisterEvents();
    }

    leftClickEvent() {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {

            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            this.TurntableSwing = new TurntableSwing(this.viewer, currentPosition);
            this.TurntableSwing.add();
            this.TurntableSwing.radii(200);

            this.deactivate();
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    /** 左偏角值 */
    minimumClock(val: number) {
        this.TurntableSwing?.minimumClock(val);
    }

    /** 右偏角值 */
    maximumClock(val: number) {
        this.TurntableSwing?.maximumClock(val);
    }

    /** 外径大小 */
    radii(val: number) {
        this.TurntableSwing?.radii(val);
    }

    /** 内径大小 */
    innerRadii(val: number) {
        this.TurntableSwing?.innerRadii(val);
    }

    /** 填充色 rgba */
    fillColor(val: string) {
        this.TurntableSwing?.fillColor(val);
    }

    /** 边框色 rgba */
    outlineColor(val: string) {
        this.TurntableSwing?.outlineColor(val);
    }
}
