import * as Cesium from 'cesium';
import MouseEvent from '../mouseBase/mouseBase';
import { EventCallback } from '../../type/type';
import { MouseStatusEnum } from '@src/enum/enum';

export default class DrawingFace extends MouseEvent {
    protected viewer: Cesium.Viewer;
    protected handler: Cesium.ScreenSpaceEventHandler;
    private pointPrimitiveCollection: Cesium.PointPrimitiveCollection;
    private polylineCollection: Cesium.PolylineCollection;
    private polygonGraphics: Cesium.ClippingPolygonCollection;
    currentMouseType: string;
    private position3dAry: Cesium.Cartesian3[];
    private polygonEntity: Cesium.Entity | undefined;
    private tempMovePosition: Cesium.Cartesian3 | undefined;

    constructor(viewer: Cesium.Viewer, handler: Cesium.ScreenSpaceEventHandler) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
        this.pointPrimitiveCollection = this.viewer.scene.primitives.add(
            new Cesium.PointPrimitiveCollection()
        );
        this.polylineCollection = this.viewer.scene.primitives.add(new Cesium.PolylineCollection());
        this.polygonGraphics = this.viewer.scene.primitives.add(
            new Cesium.ClippingPolygonCollection()
        );
        this.currentMouseType = '';
        this.position3dAry = [];
        this.tempMovePosition = undefined;
        this.polygonEntity = undefined;
    }

    active(): void {
        this.registerEvents();
    }

    deactivate(): void {
        this.clear();
        this.unRegisterEvents();
    }

    clear(): void {
        // TODO: clear
    }

    addToolsEventListener<T>(eventName: string, callback: EventCallback<T>) {
        this.addEventListener(eventName, callback);
    }

    removeToolsEventListener<T>(eventName: string, callback?: EventCallback<T>) {
        this.removeEventListener(eventName, callback);
    }

    protected leftClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            this.currentMouseType = MouseStatusEnum.click;

            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;
            this.position3dAry.push(currentPosition);

            this.createPoint(currentPosition);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    protected rightClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            if (this.position3dAry.length < 2) return;

            this.currentMouseType = MouseStatusEnum.click;

            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            this.position3dAry.push(currentPosition);

            this.createPoint(currentPosition);

            this.polygonEntity && this.viewer.entities.remove(this.polygonEntity);
            this.polygonEntity = undefined;
            this.position3dAry = [];

            this.unRegisterEvents();
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    protected mouseMoveEvent(): void {
        this.handler.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
            this.currentMouseType = MouseStatusEnum.move;

            const currentPosition = this.viewer.scene.pickPosition(e.endPosition);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            this.tempMovePosition = currentPosition;
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }

    private createPoint(position: Cesium.Cartesian3) {
        this.pointPrimitiveCollection.add({
            position,
            color: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            pixelSize: 8,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
    }

    createPolygin() {
        this.polylineCollection = this.viewer.scene.primitives.add(new Cesium.PolylineCollection());
        this.polylineCollection.add({
            positions: new Cesium.CallbackProperty(() => {
                const tempPositions = [...this.position3dAry];
                if (this.tempMovePosition) {
                    tempPositions.push(this.tempMovePosition);
                }
                return tempPositions;
            }, false),
            width: 2,
            material: new Cesium.ColorMaterialProperty(Cesium.Color.CHARTREUSE),
            depthFailMaterial: new Cesium.ColorMaterialProperty(Cesium.Color.CHARTREUSE),
            // 是否贴地
            clampToGround: true,
        });
    }

    private createPolygon() {
        this.polygonGraphics.add();
        if (!this.polygonEntity) {
            const polygonEntity = this.viewer.entities.add({
                polygon: {
                    hierarchy: new Cesium.CallbackProperty(() => {
                        const tempPositions = [...this.position3dAry];
                        if (this.tempMovePosition) {
                            tempPositions.push(this.tempMovePosition);
                        }
                        return new Cesium.PolygonHierarchy(tempPositions);
                    }, false),
                    material: new Cesium.ColorMaterialProperty(Cesium.Color.YELLOW.withAlpha(0.3)),
                    classificationType: Cesium.ClassificationType.BOTH,
                },
            });
            this.polygonEntity = polygonEntity;
        }
    }
}
