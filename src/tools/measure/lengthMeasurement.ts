import * as Cesium from 'cesium';
import MouseEvent from '../mouseBase/mouseBase';
import { compute_geodesicaDistance_3d, compute_placeDistance_2d } from './compute';
import { MouseStatusEnum } from '@src/enum/enum';

export default class LengthMeasurement extends MouseEvent {
    protected viewer: Cesium.Viewer;
    protected handler: Cesium.ScreenSpaceEventHandler;
    private pointEntityAry: Cesium.Entity[];
    private lineEntityAry: Cesium.Entity[];
    private tipEntity: Cesium.Entity | undefined = undefined;
    private positonsAry: Cesium.Cartesian3[] = [];
    private polyRayAry: Cesium.Entity[];
    private currentMouseType: string;
    private polyTipAry: Cesium.Entity[];
    private distanceAry: { distance2d: number; distance3d: number }[];
    private polylineTip: Cesium.Entity | undefined = undefined;

    constructor(viewer: Cesium.Viewer, handler: Cesium.ScreenSpaceEventHandler) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
        this.pointEntityAry = [];
        this.lineEntityAry = [];
        this.positonsAry = [];
        this.polyRayAry = [];
        this.currentMouseType = '';
        this.polyTipAry = [];
        this.distanceAry = [];
        this.polylineTip = undefined;
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
        this.positonsAry = [];
        this.distanceAry = [];
        this.currentMouseType = '';
        this.tipEntity && this.viewer.entities.remove(this.tipEntity);
        this.polylineTip && this.viewer.entities.remove(this.polylineTip);
        this.pointEntityAry.forEach((entity) => {
            return this.viewer.entities.remove(entity);
        });
        this.lineEntityAry.forEach((entity) => {
            return this.viewer.entities.remove(entity);
        });
        this.polyRayAry.forEach((entity) => {
            return this.viewer.entities.remove(entity);
        });
        this.polyTipAry.forEach((entity) => {
            return this.viewer.entities.remove(entity);
        });
    }

    protected leftClickEvent() {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            this.currentMouseType = MouseStatusEnum.click;

            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            this.positonsAry.push(currentPosition);

            if (this.positonsAry.length > 1) {
                // 由于第二次点击又推进来一个元素，所以需要取的开始点位是推进来的倒数第二个元素
                this.computedDistance(
                    this.positonsAry[this.positonsAry.length - 2],
                    currentPosition
                );
                this.createRay(this.positonsAry[this.positonsAry.length - 2], currentPosition);
            }

            this.createPoint(currentPosition);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    protected rightClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            this.currentMouseType = MouseStatusEnum.click;

            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            if (this.positonsAry.length > 2) {
                this.computedDistance(
                    this.positonsAry[this.positonsAry.length - 1],
                    currentPosition
                );
                this.createRay(this.positonsAry[this.positonsAry.length - 1], currentPosition);
                this.createPolylineTip(currentPosition);
            }

            this.createPoint(currentPosition);
            this.distanceAry = [];
            this.unRegisterEvents();
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    protected mouseMoveEvent(): void {
        this.handler.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
            this.currentMouseType = MouseStatusEnum.move;

            const currentPosition = this.viewer.scene.pickPosition(e.endPosition);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            if (this.positonsAry.length > 0 && this.lineEntityAry) {
                this.computedDistance(
                    this.positonsAry[this.positonsAry.length - 1],
                    currentPosition
                );
                this.createRay(this.positonsAry[this.positonsAry.length - 1], currentPosition);
            }
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

    private createRay(startPosition: Cesium.Cartesian3, endPosition: Cesium.Cartesian3): void {
        if (this.currentMouseType === MouseStatusEnum.move) {
            this.lineEntityAry.forEach((entity) => {
                this.viewer.entities.remove(entity);
            });

            this.lineEntityAry = [];
        }
        const direction = Cesium.Cartesian3.subtract(
            endPosition,
            startPosition,
            new Cesium.Cartesian3()
        );

        // 创建射线
        const ray = new Cesium.Ray(startPosition, direction);
        // pick 方法可以获取到射线与地球表面的交线 https://cesium.com/learn/cesiumjs/ref-doc/Globe.html
        const intersection = this.viewer.scene.globe.pick(ray, this.viewer.scene);

        if (intersection) {
            this.createPolylin([startPosition, intersection], Cesium.Color.CHARTREUSE);
            this.createPolylin([intersection, endPosition], Cesium.Color.RED);
        } else {
            this.createPolylin([startPosition, endPosition], Cesium.Color.CHARTREUSE);
        }
    }

    private createPolylin(position: Cesium.Cartesian3[], color: Cesium.Color) {
        const lineEntity = this.viewer.entities.add({
            polyline: {
                positions: new Cesium.CallbackProperty(() => {
                    return position;
                }, false),
                width: 2,
                material:
                    color === Cesium.Color.RED
                        ? new Cesium.PolylineDashMaterialProperty({
                              color: color,
                              dashLength: 20, //短划线长度
                          })
                        : new Cesium.ColorMaterialProperty(color),
                depthFailMaterial: new Cesium.ColorMaterialProperty(color),
                // 是否贴地
                clampToGround: true,
            },
        });

        if (this.currentMouseType === MouseStatusEnum.move) {
            this.lineEntityAry.push(lineEntity);
        }
        if (this.currentMouseType === MouseStatusEnum.click) {
            this.polyRayAry.push(lineEntity);
        }
    }

    private createTip(
        start: Cesium.Cartesian3,
        end: Cesium.Cartesian3,
        distance_2d: string,
        distance_3d: string
    ) {
        this.tipEntity && this.viewer.entities.remove(this.tipEntity);
        // 计算线的中点位置
        const midPoint = Cesium.Cartesian3.midpoint(start, end, new Cesium.Cartesian3());

        // 将中点向下移动一小段距离，以便将标签显示在线的下方
        const offset = Cesium.Cartesian3.multiplyByScalar(
            Cesium.Cartesian3.normalize(midPoint, new Cesium.Cartesian3()),
            -0.0005,
            new Cesium.Cartesian3()
        );
        const labelPosition = Cesium.Cartesian3.add(midPoint, offset, new Cesium.Cartesian3());

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

    private createPolylineTip(positions: Cesium.Cartesian3) {
        const total2dDistance = this.distanceAry.reduce((accumulator, currentValue) => {
            return accumulator + currentValue.distance2d;
        }, 0);

        const total3dDistance = this.distanceAry.reduce((accumulator, currentValue) => {
            return accumulator + currentValue.distance3d;
        }, 0);

        this.polylineTip = this.viewer.entities.add({
            position: positions,
            label: {
                text: `折线投影距离${total2dDistance.toFixed(2)}m \n 折线空间距离${total3dDistance.toFixed(2)}m`,
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
    }

    private computedDistance = (start: Cesium.Cartesian3, end: Cesium.Cartesian3) => {
        const distance_2d = compute_placeDistance_2d(Cesium, start, end);
        const ditance_3d = compute_geodesicaDistance_3d(Cesium, start, end);
        this.createTip(start, end, distance_2d.toFixed(2), ditance_3d.toFixed(2));
    };
}
