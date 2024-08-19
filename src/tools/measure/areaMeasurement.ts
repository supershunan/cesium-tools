import * as Cesium from 'cesium';
import MouseEvent from '../mouseBase/mouseBase';
import { compute_2DPolygonArea, compute_3DPolygonArea, compute_geodesicaDistance_3d, compute_placeDistance_2d } from './compute';
import { MouseStatusEnum } from '@src/enum/enum';

export default class AreaMeasurement extends MouseEvent {
    protected viewer: Cesium.Viewer;
    protected handler: Cesium.ScreenSpaceEventHandler;
    private pointEntityAry: Cesium.Entity[];
    private polygonEntityAry: Cesium.Entity[];
    private position3dAry: Cesium.Cartesian3[];
    /** 由于使用了 CallbackProperty 会改变点位信息，所以需要备份一份用来计算用 */
    private copyPosition3dAry: string[];
    private tempMovePosition: Cesium.Cartesian3 | undefined;
    private polygonEntity: Cesium.Entity | undefined;

    private tipEntity: Cesium.Entity | undefined = undefined;
    private currentMouseType: string;
    private polyTipAry: Cesium.Entity[];
    private areaTipAry: Cesium.Entity[];

    constructor(
        viewer: Cesium.Viewer,
        handler: Cesium.ScreenSpaceEventHandler
    ) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
        this.pointEntityAry = [];
        this.polygonEntityAry = [];
        this.position3dAry = [];
        this.copyPosition3dAry = [];
        this.tempMovePosition = undefined;
        this.polygonEntity = undefined;
        this.polyTipAry = [];
        this.areaTipAry = [];
        this.currentMouseType = '';
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
        this.copyPosition3dAry = [];
        this.position3dAry = [];
        this.tempMovePosition = undefined;
        this.pointEntityAry.forEach((entity) => {this.viewer.entities.remove(entity);});
        this.polygonEntityAry.forEach((entity) => {this.viewer.entities.remove(entity);});
        this.polyTipAry.forEach((entity) => {this.viewer.entities.remove(entity);});
        this.areaTipAry.forEach((entity) => {this.viewer.entities.remove(entity);});
        this.polygonEntity && this.viewer.entities.remove(this.polygonEntity);
    }

    protected leftClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            this.currentMouseType = MouseStatusEnum.click;

            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            this.copyPosition3dAry.push(JSON.stringify(currentPosition));
            this.position3dAry.push(currentPosition);

            this.createPoint(currentPosition);
            this.createPolygon();
            if (this.position3dAry.length > 1) {
                // 由于第二次点击又推进来一个元素，所以需要取的开始点位是推进来的倒数第二个元素
                this.computedDistance(JSON.parse(this.copyPosition3dAry[this.copyPosition3dAry.length - 2]), currentPosition);
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    protected rightClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            this.currentMouseType = MouseStatusEnum.click;

            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            if (this.position3dAry.length < 2) return;

            this.copyPosition3dAry.push(JSON.stringify(currentPosition));
            this.position3dAry.push(currentPosition);

            this.createPoint(currentPosition);
            // 由于第二次点击又推进来一个元素，所以需要取的开始点位是推进来的倒数第二个元素
            this.computedDistance(JSON.parse(this.copyPosition3dAry[this.copyPosition3dAry.length - 2]), currentPosition);
            this.computedDistance(JSON.parse(this.copyPosition3dAry[0]), currentPosition);
            this.creteAreaTip();
            this.polygonEntityAry.push(this.viewer.entities.add({
                polygon: {
                    hierarchy: this.position3dAry,
                    material: Cesium.Color.YELLOW.withAlpha(0.3),
                    // 位置被限制在地形和 3D Tiles 上
                    classificationType: Cesium.ClassificationType.BOTH
                },
            }));

            this.polygonEntity = undefined;
            this.position3dAry = [];
            this.copyPosition3dAry = [];
            this.unRegisterEvents();
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    protected mouseMoveEvent(): void {
        this.handler.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
            this.currentMouseType = MouseStatusEnum.move;

            const currentPosition = this.viewer.scene.pickPosition(e.endPosition);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            if (this.position3dAry.length > 0 && this.polygonEntity) {
                this.computedDistance(JSON.parse(this.copyPosition3dAry[this.copyPosition3dAry.length - 1]), currentPosition);
            }
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

    private createPolygon() {
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
                    material: Cesium.Color.YELLOW.withAlpha(0.3),
                    classificationType: Cesium.ClassificationType.BOTH
                },
            });
            this.polygonEntity = polygonEntity;
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
                text: `2D投影距离${distance_2d}m \n 3D空间距离${distance_3d}m`,
                font: '10px sans-serif',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                showBackground: true,
                verticalOrigin: Cesium.VerticalOrigin.TOP,
                pixelOffset: new Cesium.Cartesian2(0, 20), // 标签稍微下移
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
        });

        if (this.currentMouseType === MouseStatusEnum.move) {
            this.tipEntity = tipEntity;
        }

        if (this.currentMouseType === MouseStatusEnum.click) {
            this.polyTipAry.push(tipEntity);
        }
    }

    private creteAreaTip() {
        const descartesPoints = this.copyPosition3dAry.map((item) => {
            return JSON.parse(item);
        });
        const area2d = compute_2DPolygonArea(descartesPoints);
        const area3d = compute_3DPolygonArea(Cesium, descartesPoints);
        const areaTipEntity = this.viewer.entities.add({
            position: JSON.parse(this.copyPosition3dAry[0]),
            label: {
                text: `2D面积：${area2d.toFixed(2)}m² \n 3D面积：${area3d.toFixed(2)}m²`,
                font: '10px sans-serif',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                showBackground: true,
                verticalOrigin: Cesium.VerticalOrigin.TOP,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            }
        });
        this.areaTipAry.push(areaTipEntity);
    }
}
