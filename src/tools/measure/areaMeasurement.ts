import * as Cesium from 'cesium';
import MouseEvent from '../mouseBase/mouseBase';
import { compute_2DPolygonArea, compute_3DPolygonArea, compute_geodesicaDistance_3d, compute_placeDistance_2d } from './compute';
import { MouseStatusEnum } from '@src/type/enum';

export default class AreaMeasurement extends MouseEvent {
    protected viewer: Cesium.Viewer;
    protected handler: Cesium.ScreenSpaceEventHandler;
    private pointEntityAry: Cesium.Entity[];
    private polygonEntityAry: Cesium.Entity[];
    private positionAry: Cesium.Cartesian3[];
    private tempPosition: Cesium.Cartesian3 | undefined;
    private polygonEntity: Cesium.Entity | undefined;

    private tipEntity: Cesium.Entity | undefined = undefined;
    private currentMouseType: string;
    private distanceAry: { distance2d: number; distance3d: number }[];
    private polyTipAry: Cesium.Entity[];

    constructor(
        viewer: Cesium.Viewer,
        handler: Cesium.ScreenSpaceEventHandler
    ) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
        this.pointEntityAry = [];
        this.polygonEntityAry = [];
        this.positionAry = [];
        this.tempPosition = undefined;
        this.polygonEntity = undefined;
        this.distanceAry = [];
        this.polyTipAry = [];
        this.currentMouseType = '';
    }

    active(): void {
        this.deactivate();
        this.registerEvents();
    }

    deactivate(): void {
        this.unRegisterEvents();
    }

    clear(): void {
        this.positionAry = [];
        this.tempPosition = undefined;
    }

    protected leftClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            this.currentMouseType = MouseStatusEnum.click;
            const currentPosition = this.viewer.scene.pickPosition(e.position);

            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            this.positionAry.push(currentPosition);
            this.createPoint(currentPosition);
            this.createPolygon();
            if (this.positionAry.length > 1) {
                // 由于第二次点击又推进来一个元素，所以需要取的开始点位是推进来的倒数第二个元素
                this.computedDistance(this.positionAry[this.positionAry.length - 2], currentPosition);
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    protected rightClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            this.currentMouseType = MouseStatusEnum.click;
            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;
            if (this.positionAry.length < 3) return;

            this.createPoint(currentPosition);
            this.positionAry.push(currentPosition);

            if (this.positionAry.length > 1) {
                // 由于第二次点击又推进来一个元素，所以需要取的开始点位是推进来的倒数第二个元素
                this.computedDistance(this.positionAry[0], currentPosition);
                this.computedDistance(this.positionAry[this.positionAry.length - 2], currentPosition);
            }
            this.creteAreaTip();
            this.unRegisterEvents();
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    protected mouseMoveEvent(): void {
        this.handler.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
            this.currentMouseType = MouseStatusEnum.move;
            const currentPosition = this.viewer.scene.pickPosition(e.endPosition);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            console.log(this.positionAry.concat(currentPosition))
            const area2d = compute_2DPolygonArea(this.positionAry.concat(currentPosition));
            console.log(area2d)

            if (this.positionAry.length > 2) {
                this.computedDistance(this.positionAry[this.positionAry.length - 1], currentPosition);
            }
            this.tempPosition = currentPosition;
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

    private createPolygon() {
        if (!this.polygonEntity) {
            const polygonEntity = this.viewer.entities.add({
                polygon: {
                    hierarchy: new Cesium.CallbackProperty(() => {
                        const tempPositions = [...this.positionAry];
                        if (this.tempPosition) {
                            tempPositions.push(this.tempPosition);
                        }
                        return new Cesium.PolygonHierarchy(tempPositions);
                    }, false),
                    material: Cesium.Color.YELLOW.withAlpha(0.5),
                },
            });
            this.polygonEntity = polygonEntity;
            this.polygonEntityAry.push(polygonEntity);
        }
    }

    private computedDistance = (start: Cesium.Cartesian3, end: Cesium.Cartesian3) => {
        const distance_2d = compute_placeDistance_2d(
            Cesium,
            start,
            end
        );
        const ditance_3d = compute_geodesicaDistance_3d(
            Cesium,
            start,
            end
        );
        this.createTip(
            start,
            end,
            distance_2d.toFixed(2),
            ditance_3d.toFixed(2)
        );
    };

    private createTip(
        start: Cesium.Cartesian3,
        end: Cesium.Cartesian3,
        distance_2d: string,
        distance_3d: string
    ) {
        this.tipEntity && this.viewer.entities.remove(this.tipEntity);
        // 计算线的中点位置
        const midPoint = Cesium.Cartesian3.midpoint(
            start,
            end,
            new Cesium.Cartesian3()
        );

        // 将中点向下移动一小段距离，以便将标签显示在线的下方
        const offset = Cesium.Cartesian3.multiplyByScalar(
            Cesium.Cartesian3.normalize(midPoint, new Cesium.Cartesian3()),
            -0.0005,
            new Cesium.Cartesian3()
        );
        const labelPosition = Cesium.Cartesian3.add(
            midPoint,
            offset,
            new Cesium.Cartesian3()
        );

        const tipEntity = this.viewer.entities.add({
            position: labelPosition,
            label: {
                text: `投影距离${distance_2d}m \n 空间距离${distance_3d}m`,
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

        if (this.currentMouseType === MouseStatusEnum.move) {
            this.tipEntity = tipEntity;
        }

        if (this.currentMouseType === MouseStatusEnum.click) {
            this.distanceAry.push({
                distance2d: Number(distance_2d),
                distance3d: Number(distance_3d),
            });
            this.polyTipAry.push(tipEntity);
        }
    }

    private creteAreaTip() {
        const area2d = compute_2DPolygonArea(this.positionAry);
        const area3d = compute_3DPolygonArea(Cesium, this.positionAry);
        this.viewer.entities.add({
            position: this.positionAry[0],
            label: {
                text: `2D面积：${area2d.toFixed(2)}m² \n 3D面积：${area3d.toFixed(2)}m³`,
                font: '10px sans-serif',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                showBackground: true,
                verticalOrigin: Cesium.VerticalOrigin.TOP,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }
        });
    }
}
