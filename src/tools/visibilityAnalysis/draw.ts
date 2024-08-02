import * as Cesium from 'cesium';
import VisibilityAnalysis from './visibilityAnalysis';
import MouseEvent from '../mouseBase/mouseBase';
import { CurrentCountEnum } from '@src/type/enum';
export default class Draw extends MouseEvent {
    viewer: Cesium.Viewer;
    handler: Cesium.ScreenSpaceEventHandler;
    drawViewshedEntity: VisibilityAnalysis | undefined;
    startPosition: Cesium.Cartesian3 | undefined;
    endPosition: Cesium.Cartesian3 | undefined;
    currentClickCount: number;
    drawEntity: Cesium.Entity | undefined;
    private initId: number = new Date().getTime();

    constructor(
        viewer: Cesium.Viewer,
        handler: Cesium.ScreenSpaceEventHandler
    ) {
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
        this.currentClickCount = CurrentCountEnum.padding;
        this.drawEntity = undefined;
        this.endPosition = undefined;
        this.startPosition = undefined;
        this.unRegisterEvents();
    }

    leftClickEvent() {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            this.currentClickCount === CurrentCountEnum.padding &&
                this.viewer.entities.removeAll();

            this.currentClickCount++;

            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition && !Cesium.defined(this.startPosition)) return;

            this.createPoint(currentPosition);

            if (this.currentClickCount === CurrentCountEnum.start) {
                if (!this.drawViewshedEntity) {
                    this.drawViewshedEntity = new VisibilityAnalysis(
                        this.viewer,
                        {
                            startPosition: currentPosition,
                            endPosition: currentPosition,
                        }
                    );
                } else {
                    this.drawViewshedEntity.startPosition = currentPosition;
                    this.drawViewshedEntity.endPosition = currentPosition;
                }
                this.drawViewshedEntity.add();
            }

            if (
                this.currentClickCount === CurrentCountEnum.end &&
                this.drawViewshedEntity
            ) {
                this.drawViewshedEntity.endPosition = currentPosition;
                this.deactivate();
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    mouseMoveEvent() {
        this.handler.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
            const currentPosition = this.viewer.scene.pickPosition(
                e.endPosition
            );
            if (!currentPosition && !Cesium.defined(this.startPosition)) return;

            if (
                this.currentClickCount === CurrentCountEnum.start &&
                this.drawViewshedEntity
            ) {
                this.drawViewshedEntity.updatePosition(currentPosition);
            }
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }

    private createPoint(position: Cesium.Cartesian3) {
        // const cartographic = Cesium.Cartographic.fromCartesian(position);
        // const longitude = Cesium.Math.toDegrees(cartographic.longitude);
        // const latitude = Cesium.Math.toDegrees(cartographic.latitude);
        // const aa = Cesium.Cartesian3.fromDegrees(longitude, latitude, cartographic.height);
        return this.viewer.entities.add({
            position: position,
            name: this.initId,
            point: {
                pixelSize: 10,
                color: Cesium.Color.ORANGE,
                outlineWidth: 2,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: 99000000,
                clampToGround: true,
            },
            label: {
                text:
                    this.currentClickCount === CurrentCountEnum.start
                        ? '观测点'
                        : '结束点',
                fillColor: Cesium.Color.WHITE,
                font: '14px',
                pixelOffset: new Cesium.Cartesian2(10, 10),
                heightReference: Cesium.HeightReference.NONE, // 修改高度参考
                disableDepthTestDistance: Number.POSITIVE_INFINITY, // 禁用深度测试距离
                clampToGround: true,
            },
            show: true,
        });
    }
}
