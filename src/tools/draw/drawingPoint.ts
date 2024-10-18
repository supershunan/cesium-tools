import * as Cesium from 'cesium';
import MouseEvent from '../mouseBase/mouseBase';
import { ToolsEventTypeEnum } from '../../enum/enum';
import { EventCallback } from '../../type/type';

export default class DrawingPoint extends MouseEvent {
    protected viewer: Cesium.Viewer;
    protected handler: Cesium.ScreenSpaceEventHandler;
    private pointEntityAry: Cesium.Entity[];
    private surfaceLineEntityAry: Cesium.Entity[];

    constructor(viewer: Cesium.Viewer, handler: Cesium.ScreenSpaceEventHandler) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
        this.pointEntityAry = [];
        this.surfaceLineEntityAry = [];
    }

    active(): void {
        this.deactivate();
        this.registerEvents();
    }

    deactivate(): void {
        this.clear();
        this.unRegisterEvents();
    }

    clear(): void {
        this.pointEntityAry.forEach((entity) => {
            this.viewer.entities.remove(entity);
        });
        this.surfaceLineEntityAry.forEach((entity) => {
            this.viewer.entities.remove(entity);
        });
    }

    addToolsEventListener<T>(eventName: string, callback: EventCallback<T>) {
        this.addEventListener(eventName, callback);
    }

    removeToolsEventListener<T>(eventName: string, callback?: EventCallback<T>) {
        this.removeEventListener(eventName, callback);
    }

    protected leftClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            this.createPoint(currentPosition);
            this.dispatch('cesiumToolsFxt', {
                type: ToolsEventTypeEnum.theHeightMeasurement,
                status: 'finished',
            });
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    protected rightClickEvent(): void {
        this.handler.setInputAction(() => {
            this.unRegisterEvents();
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    private createPoint(position: Cesium.Cartesian3) {
        const pointEntity = this.viewer.entities.add({
            position,
            // point: {
            //     color: Cesium.Color.YELLOW,
            //     outlineColor: Cesium.Color.BLACK,
            //     outlineWidth: 1,
            //     pixelSize: 8,
            //     disableDepthTestDistance: Number.POSITIVE_INFINITY,
            // },
            billboard: {
                image: '/public/resources/images/特征点_选中.png',
                width: 24,
                height: 24,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                // scale: 0.5,
                show: true,
            },
            label: {
                text: `点`,
                font: '10px sans-serif',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                showBackground: true,
                verticalOrigin: Cesium.VerticalOrigin.TOP,
                pixelOffset: new Cesium.Cartesian2(0, -35),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        });

        this.pointEntityAry.push(pointEntity);
    }

    revisePoint() {}
}
