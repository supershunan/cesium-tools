import * as Cesium from 'cesium';
import TurntableSwing from './turntableSwing2';
import MouseEvent from '../mouseBase/mouseBase';
import { TurntableParams, GlobalTurntableMethods } from './type';
import { ToolsEventTypeEnum } from '../../enum/enum';
import { EventCallback } from '../../type/type';

export default class Draw extends MouseEvent {
    protected viewer: Cesium.Viewer;
    handler: Cesium.ScreenSpaceEventHandler;
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
        // @ts-expect-error: Enumeration member cannot have numeric name
        this.turntableSwing?.clear();
        this.unRegisterEvents();
    }

    addToolsEventListener<T>(eventName: string, callback: EventCallback<T>) {
        this.addEventListener(eventName, callback);
    }

    removeToolsEventListener<T>(eventName: string, callback?: EventCallback<T>) {
        this.removeEventListener(eventName, callback);
    }

    protected leftClickEvent() {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            this.turntableSwing = new TurntableSwing(
                this.viewer,
                currentPosition,
                // @ts-expect-error: Enumeration member cannot have numeric name
                this.turntableParams
            );
            // this.turntableSwing.add();
            // this.turntableSwing.radii(200);
            this.turntableSwing.initTurntable(currentPosition);

            this.dispatch('cesiumToolsFxt', {
                type: ToolsEventTypeEnum.turntableSwing,
                status: 'finished',
            });

            this.unRegisterEvents();
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    /** 左偏角值 */
    private minimumClock(val: number) {
        // @ts-expect-error: Enumeration member cannot have numeric name
        this.turntableSwing?.minimumClock(val);
    }

    /** 右偏角值 */
    private maximumClock(val: number) {
        // @ts-expect-error: Enumeration member cannot have numeric name
        this.turntableSwing?.maximumClock(val);
    }

    /** 外径大小 */
    private radii(val: number) {
        // @ts-expect-error: Enumeration member cannot have numeric name
        this.turntableSwing?.radii(val);
    }

    /** 内径大小 */
    private innerRadii(val: number) {
        // @ts-expect-error: Enumeration member cannot have numeric name
        this.turntableSwing?.innerRadii(val);
    }

    /** 填充色 rgba */
    private fillColor(val: string) {
        // @ts-expect-error: Enumeration member cannot have numeric name
        this.turntableSwing?.fillColor(val);
    }

    /** 边框色 rgba */
    private outlineColor(val: string) {
        // @ts-expect-error: Enumeration member cannot have numeric name
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
