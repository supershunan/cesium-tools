import * as Cesium from 'cesium';
import ViewShed from './visualFieldAnalysis';
import PlotDrawTip from '../mouseRemove/PlotDrawTip';
import MouseDrawBase from '../mouseBase/mouseBase';
import { ViewShedOptionalOptions } from './type';
import { CurrentCountEnum, ToolsEventTypeEnum } from '../../enum/enum';
import { EventCallback } from '../../type/type';

export default class Draw extends MouseDrawBase {
    protected viewer: Cesium.Viewer;
    handler: Cesium.ScreenSpaceEventHandler;
    private currentClickCount: CurrentCountEnum;
    drawViewshedEntity?: ViewShed;
    private plotDrawTip?: PlotDrawTip;

    constructor(viewer: Cesium.Viewer, handler: Cesium.ScreenSpaceEventHandler) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
        this.currentClickCount = CurrentCountEnum.padding;
    }

    active(): void {
        this.deactivate();
        this.registerEvents();
        this.plotDrawTip = new PlotDrawTip(this.viewer);
        this.plotDrawTip.setContent(['左键点击开始绘制']);
    }

    clear(): void {
        this.drawViewshedEntity?.clear();
    }

    deactivate(): void {
        this.currentClickCount = CurrentCountEnum.padding;
        this.unRegisterEvents();
        this.plotDrawTip?.remove();
        this.plotDrawTip = undefined;
    }

    addToolsEventListener<T>(eventName: string, callback: EventCallback<T>) {
        this.addEventListener(eventName, callback);
    }

    removeToolsEventListener<T>(eventName: string, callback?: EventCallback<T>) {
        this.removeEventListener(eventName, callback);
    }

    protected leftClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            this.currentClickCount++;
            const currentPosition = this.viewer.scene.pickPosition(e.position);

            if (!currentPosition || !Cesium.defined(currentPosition)) return;

            if (this.currentClickCount === CurrentCountEnum.start) {
                this.plotDrawTip?.setContent(['左键点击结束点，完成绘制']);
                if (!this.drawViewshedEntity) {
                    this.drawViewshedEntity = new ViewShed(this.viewer, {
                        viewPosition: currentPosition,
                        viewPositionEnd: currentPosition,
                    });
                } else {
                    this.drawViewshedEntity.viewPosition = currentPosition;
                    this.drawViewshedEntity.viewPositionEnd = currentPosition;
                }
            }

            if (this.currentClickCount === CurrentCountEnum.end) {
                this.drawViewshedEntity?.updatePosition(currentPosition);
                this.drawViewshedEntity?.update();
                this.dispatch('cesiumToolsFxt', {
                    type: ToolsEventTypeEnum.visualFieldAnalysis,
                    status: 'finished',
                });

                this.deactivate();
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    protected mouseMoveEvent(): void {
        this.handler.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
            const currentPosition = this.viewer.scene.pickPosition(e.endPosition);
            if (!currentPosition) return;

            this.plotDrawTip?.updatePosition(currentPosition);

            if (this.currentClickCount === CurrentCountEnum.start && this.drawViewshedEntity) {
                this.drawViewshedEntity.updatePosition(currentPosition);
                this.drawViewshedEntity.update();
            }
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }

    setViewShedOptions(options: ViewShedOptionalOptions) {
        if (this.drawViewshedEntity) {
            Object.keys(options).forEach((key) => {
                const typedKey = key as keyof ViewShedOptionalOptions;
                if (this.drawViewshedEntity && typedKey in this.drawViewshedEntity) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (this.drawViewshedEntity as any)[typedKey] = options[typedKey];
                }
            });
        }
    }
}
