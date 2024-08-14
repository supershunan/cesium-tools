import * as Cesium from 'cesium';
import MouseEvent from '../mouseBase/mouseBase';
import { compute_Angle, compute_geodesicaDistance_3d, compute_placeDistance_2d } from './compute';

export default class AngleMeasurement extends MouseEvent {
    protected viewer: Cesium.Viewer;
    protected handler: Cesium.ScreenSpaceEventHandler;
    private pointEntityAry: Cesium.Entity[];
    private positonsAry: Cesium.Cartesian3[] = [];
    private tempMovePosition: Cesium.Cartesian3 | undefined;
    private lineEntity: Cesium.Entity | undefined;
    private lineEntityAry: Cesium.Entity[] = [];
    private angleTipEntityAry: Cesium.Entity[];

    constructor(
        viewer: Cesium.Viewer,
        handler: Cesium.ScreenSpaceEventHandler
    ) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
        this.pointEntityAry = [];
        this.positonsAry = [];
        this.tempMovePosition = undefined;
        this.lineEntity = undefined;
        this.angleTipEntityAry = [];
        this.lineEntityAry = [];
    }

    active(): void {
        this.deactivate();
        this.registerEvents();
    }

    deactivate(): void {
        this.unRegisterEvents();
    }

    clear(): void {
        this.positonsAry = [];
        this.tempMovePosition = undefined;
        this.lineEntity = undefined;
        this.pointEntityAry.forEach((entity) => {this.viewer.entities.remove(entity);});
        this.angleTipEntityAry.forEach((entity) => {this.viewer.entities.remove(entity);});
        this.lineEntityAry.forEach((entity) => {this.viewer.entities.remove(entity);});
    }

    protected leftClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2}) => {
            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            this.positonsAry.push(currentPosition);

            this.createPoint(currentPosition);
            this.createPolylin();

            const currentIndex: number = this.positonsAry.indexOf(currentPosition);
            if (this.positonsAry.length > 2) {
                this.computedAngle(this.positonsAry[currentIndex-2], this.positonsAry[currentIndex-1], currentPosition);
            }

            if (this.positonsAry.length > 1) {
                this.computedDistance(this.positonsAry[currentIndex - 1], currentPosition);
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }


    protected rightClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2}) => {
            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            this.positonsAry.push(currentPosition);

            if (this.positonsAry.length < 3) {
                // eslint-disable-next-line no-alert
                alert('角度绘制至少三个点');
            }

            this.createPoint(currentPosition);
            this.lineEntity && this.viewer.entities.remove(this.lineEntity);
            const currentIndex: number = this.positonsAry.indexOf(currentPosition);
            this.computedAngle(this.positonsAry[currentIndex-2], this.positonsAry[currentIndex-1], currentPosition);
            this.computedDistance(this.positonsAry[currentIndex - 1], currentPosition);

            this.lineEntity && this.viewer.entities.remove(this.lineEntity);
            this.lineEntityAry.push(this.viewer.entities.add({
                polyline: {
                    positions: this.positonsAry,
                    width: 2,
                    material: Cesium.Color.CHARTREUSE,
                    depthFailMaterial: Cesium.Color.CHARTREUSE,
                    // 是否贴地
                    clampToGround: true,
                },
            }));
            this.positonsAry = [];
            this.unRegisterEvents();
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }


    protected mouseMoveEvent(): void {
        this.handler.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
            const currentPosition = this.viewer.scene.pickPosition(
                e.endPosition
            );
            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            this.tempMovePosition = currentPosition;
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }

    private createPoint(position: Cesium.Cartesian3) {
        const pointEntity = this.viewer.entities.add({
            position,
            point: {
                color: Cesium.Color.YELLOW,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 1,
                pixelSize: 8,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        });

        this.pointEntityAry.push(pointEntity);
    }

    private createPolylin() {
        const lineEntity = this.viewer.entities.add({
            polyline: {
                positions: new Cesium.CallbackProperty(() => {
                    const tempPositions = [...this.positonsAry];
                    if (this.tempMovePosition) {
                        tempPositions.push(this.tempMovePosition);
                    }
                    return tempPositions;
                }, false),
                width: 2,
                material: Cesium.Color.CHARTREUSE,
                depthFailMaterial: Cesium.Color.CHARTREUSE,
                // 是否贴地
                clampToGround: true,
            },
        });

        this.lineEntity = lineEntity;
    }

    private computedAngle(start: Cesium.Cartesian3, middle: Cesium.Cartesian3, end: Cesium.Cartesian3) {
        const angle = compute_Angle(Cesium, start, middle, end);
        const angleEntity = this.viewer.entities.add({
            position: middle,
            label: {
                text: `角度: ${angle.toFixed(2)}°`,
                font: '14px sans-serif',
                horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                pixelOffset: new Cesium.Cartesian2(10, -10),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                show: true,
            },
        });

        this.angleTipEntityAry.push(angleEntity);
    }

    private computedDistance(start: Cesium.Cartesian3, end: Cesium.Cartesian3) {
        const distance2d = compute_placeDistance_2d(Cesium, start, end);
        const distance3d = compute_geodesicaDistance_3d(Cesium, start, end);

        const distanceEntity = this.viewer.entities.add({
            position: Cesium.Cartesian3.midpoint(start, end, new Cesium.Cartesian3()),
            label: {
                text: `投影距离${distance2d.toFixed(2)}m \n 空间距离${distance3d.toFixed(2)}m`,
                font: '10px sans-serif',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                showBackground: true,
                verticalOrigin: Cesium.VerticalOrigin.TOP,
                pixelOffset: new Cesium.Cartesian2(0, 20), // 标签稍微下移
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        });

        this.angleTipEntityAry.push(distanceEntity);
    }
}
