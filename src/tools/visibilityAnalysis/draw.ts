import * as Cesium from 'cesium';
import VisibilityAnalysis from './visibilityAnalysis';
import MouseEvent from '../mouseBase/mouseBase';
import { CurrentCountEnum, ToolsEventTypeEnum } from '../../enum/enum';
import { EventCallback } from '../../type/type';
export default class Draw extends MouseEvent {
    protected viewer: Cesium.Viewer;
    handler: Cesium.ScreenSpaceEventHandler;
    private initId: number = new Date().getTime();
    private pointEntitys: Cesium.Entity[] = [];
    drawViewshedEntity: VisibilityAnalysis | undefined;
    private currentClickCount: number;

    constructor(viewer: Cesium.Viewer, handler: Cesium.ScreenSpaceEventHandler) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
        this.currentClickCount = CurrentCountEnum.padding;
    }

    active(): void {
        const currentDate = new Date();
        this.initId = currentDate.getTime();
        this.deactivate();
        this.registerEvents();
    }

    deactivate(): void {
        this.clear();
        this.drawViewshedEntity = undefined;
        this.pointEntitys = [];
        this.unRegisterEvents();
    }

    clear(): void {
        this.pointEntitys.length &&
            this.pointEntitys.forEach((entits) => {
                return this.viewer.entities.remove(entits);
            });
        if (this.drawViewshedEntity) this.drawViewshedEntity.clear();
    }

    addToolsEventListener<T>(eventName: string, callback: EventCallback<T>) {
        this.addEventListener(eventName, callback);
    }

    removeToolsEventListener<T>(eventName: string, callback?: EventCallback<T>) {
        this.removeEventListener(eventName, callback);
    }

    protected leftClickEvent() {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            this.currentClickCount === CurrentCountEnum.padding && this.clear();

            this.currentClickCount++;

            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            this.createPoint(currentPosition);

            if (this.currentClickCount === CurrentCountEnum.start) {
                if (!this.drawViewshedEntity) {
                    this.drawViewshedEntity = new VisibilityAnalysis(this.viewer, {
                        startPosition: currentPosition,
                        endPosition: currentPosition,
                    });
                } else {
                    this.drawViewshedEntity.startPosition = currentPosition;
                    this.drawViewshedEntity.endPosition = currentPosition;
                }
                this.drawViewshedEntity.add();
            }

            if (this.currentClickCount === CurrentCountEnum.end && this.drawViewshedEntity) {
                this.drawViewshedEntity.endPosition = currentPosition;
                this.currentClickCount = CurrentCountEnum.padding;

                this.dispatch('cesiumToolsFxt', {
                    type: ToolsEventTypeEnum.visibilityAnalysis,
                    status: 'finished',
                });

                this.unRegisterEvents();
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    protected mouseMoveEvent() {
        this.handler.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
            const currentPosition = this.viewer.scene.pickPosition(e.endPosition);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            if (this.currentClickCount === CurrentCountEnum.start && this.drawViewshedEntity) {
                this.drawViewshedEntity.updatePosition(currentPosition);
            }
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }

    private createPoint(position: Cesium.Cartesian3) {
        const curentPointEntity = this.viewer.entities.add({
            position: position,
            name: String(this.initId),
            point: {
                pixelSize: 10,
                color: Cesium.Color.ORANGE,
                outlineWidth: 2,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: 99000000,
                // clampToGround: true,
            },
            label: {
                text: this.currentClickCount === CurrentCountEnum.start ? '观测点' : '结束点',
                fillColor: Cesium.Color.WHITE,
                font: '14px',
                pixelOffset: new Cesium.Cartesian2(10, 10),
                heightReference: Cesium.HeightReference.NONE, // 修改高度参考
                disableDepthTestDistance: Number.POSITIVE_INFINITY, // 禁用深度测试距离
                // clampToGround: true,
            },
            show: true,
        });

        this.pointEntitys.push(curentPointEntity);
    }
}
