import * as Cesium from 'cesium';
import TurntableSwing from './turntableSwing';
import MouseEvent from '../mouseBase/mouseBase';
import { TurntableParams, GlobalTurntableMethods } from './type';

export default class Draw extends MouseEvent {
    protected viewer: Cesium.Viewer;
    protected handler: Cesium.ScreenSpaceEventHandler;
    turntableParams?: TurntableParams = undefined;
    turntableSwing: TurntableSwing | undefined;
    pointEntity: Cesium.Entity | undefined;

    constructor(
        viewer: Cesium.Viewer,
        handler: Cesium.ScreenSpaceEventHandler,
        turntableParams?: TurntableParams
    ) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
        this.turntableParams = turntableParams;
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
                this.turntableParams
            );
            this.turntableSwing.add();
            this.turntableSwing.radii(200);

            this.unRegisterEvents();
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    /** 左偏角值 */
    private minimumClock(val: number) {
        this.turntableSwing?.minimumClock(val);
    }

    /** 右偏角值 */
    private maximumClock(val: number) {
        this.turntableSwing?.maximumClock(val);
    }

    /** 外径大小 */
    private radii(val: number) {
        this.turntableSwing?.radii(val);
    }

    /** 内径大小 */
    private innerRadii(val: number) {
        this.turntableSwing?.innerRadii(val);
    }

    /** 填充色 rgba */
    private fillColor(val: string) {
        this.turntableSwing?.fillColor(val);
    }

    /** 边框色 rgba */
    private outlineColor(val: string) {
        this.turntableSwing?.outlineColor(val);
    }

    globalTurntableMethods(): GlobalTurntableMethods {
        return {
            minimumClock: this.minimumClock.bind(this),
            maximumClock: this.maximumClock.bind(this),
            radii: this.radii.bind(this),
            innerRadii: this.innerRadii.bind(this),
            fillColor: this.fillColor.bind(this),
            outlineColor: this.outlineColor.bind(this),
        };
    }
}
