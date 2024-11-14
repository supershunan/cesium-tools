import * as Cesium from 'cesium';
import MouseEvent from '../mouseBase/mouseBase';
import { compute_2DPolygonArea, compute_3DPolygonArea } from './compute';
import { MouseStatusEnum } from '../../enum/enum';
import { EventCallback } from '../../type/type';

export default class AreaMeasurement extends MouseEvent {
    // 1、核心属性
    protected readonly viewer: Cesium.Viewer;
    protected readonly handler: Cesium.ScreenSpaceEventHandler;
    protected readonly cesium: typeof Cesium;

    // 2、集合管理
    private options?: { trendsComputed?: boolean };

    // 3、状态管理
    private state = {
        curSort: 0,
    };

    // 4、数据管理
    private pointDatas = new Map<number, string[]>();
    private tempMovePosition = new Map<number, string>();
    private pointEntitys: { [key: number]: Cesium.Entity[] };
    private polygonEntities: { [key: number]: Cesium.Entity | undefined };
    private tipAreaEntity: Cesium.Entity | undefined;
    private tipEntities: Cesium.Entity[];

    constructor(
        viewer: Cesium.Viewer,
        handler: Cesium.ScreenSpaceEventHandler,
        cesium: typeof Cesium
    ) {
        super(viewer, handler);

        this.viewer = viewer;
        this.handler = handler;
        this.cesium = cesium;
        this.state.curSort = 0;
        this.pointDatas = new Map<number, string[]>();
        this.tempMovePosition = new Map<number, string>();
        this.pointEntitys = {};
        this.polygonEntities = {};
        this.tipAreaEntity = undefined;
        this.tipEntities = [];
    }

    active(options?: { trendsComputed?: boolean }): void {
        this.options = options ? options : { trendsComputed: true };
        this.registerEvents();
    }

    deactivate(): void {
        this.clear();
        this.unRegisterEvents();
    }

    clear(): void {
        Object.entries(this.pointEntitys).forEach(([, value]) => {
            value.forEach((entity) => {
                this.viewer.entities.remove(entity);
            });
        });
        Object.entries(this.polygonEntities).forEach(([, value]) => {
            if (value) {
                this.viewer.entities.remove(value);
            }
        });
        this.tipEntities.forEach((entity) => {
            return this.viewer.entities.remove(entity);
        });
        this.tipAreaEntity && this.viewer.entities.remove(this.tipAreaEntity);

        this.state.curSort = 0;
        this.pointDatas.clear();
        this.tempMovePosition.clear();
        this.pointEntitys = {};
        this.polygonEntities = {};
        this.tipAreaEntity = undefined;
        this.tipEntities = [];
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
            if (!currentPosition || !this.cesium.defined(currentPosition)) return;

            const index = this.state.curSort;
            if (!this.pointDatas.has(index)) {
                this.pointDatas.set(index, []);
            }
            this.pointDatas.get(index)?.push(JSON.stringify(currentPosition));
            this.createPoint(currentPosition);
            this.drawingPolygon();
        }, this.cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    protected rightClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition || !this.cesium.defined(currentPosition)) return;

            const index = this.state.curSort;
            const points = this.pointDatas.get(index) ?? [];
            if (points.length < 2) return;

            const tempPositions = [...(this.pointDatas.get(index) || [])].map((item) => {
                return JSON.parse(item);
            });
            this.tempMovePosition.set(
                index,
                JSON.stringify(tempPositions[tempPositions.length - 1])
            );

            this.createAreaTip(tempPositions, 'click');

            this.state.curSort = index + 1;
            this.unRegisterEvents();
        }, this.cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    protected mouseMoveEvent(): void {
        this.handler.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
            const currentPosition = this.viewer.scene.pickPosition(e.endPosition);
            if (!currentPosition || !this.cesium.defined(currentPosition)) return;

            const index = this.state.curSort;
            if (!this.tempMovePosition) {
                this.tempMovePosition = new Map<number, string>();
            }
            this.tempMovePosition.set(index, JSON.stringify(currentPosition));

            const tempPositions = [...(this.pointDatas.get(index) || [])].map((item) => {
                return JSON.parse(item);
            });

            if (tempPositions.length > 1) {
                this.createAreaTip([...tempPositions, currentPosition], 'move');
            }
        }, this.cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }

    private createPoint(position: Cesium.Cartesian3) {
        const index = this.state.curSort;
        if (!this.pointEntitys[index]) {
            this.pointEntitys[index] = [];
        }
        this.pointEntitys[index].push(
            this.viewer.entities.add({
                position: position as Cesium.Cartesian3,
                point: {
                    color: this.cesium.Color.YELLOW,
                    outlineColor: this.cesium.Color.BLACK,
                    outlineWidth: 1,
                    pixelSize: 8,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
            })
        );
    }

    private drawingPolygon() {
        const index = this.state.curSort;
        if (this.polygonEntities[index]) return;

        this.polygonEntities[index] = this.viewer.entities.add({
            polygon: {
                hierarchy: new this.cesium.CallbackProperty(() => {
                    const tempPositions = [...(this.pointDatas.get(index) || [])].map((item) => {
                        return JSON.parse(item);
                    });
                    if (this.tempMovePosition.get(index)) {
                        tempPositions.push(JSON.parse(this.tempMovePosition.get(index)!));
                    }
                    return new this.cesium.PolygonHierarchy(tempPositions as Cesium.Cartesian3[]);
                }, false),
                material: new this.cesium.ColorMaterialProperty(
                    this.cesium.Color.YELLOW.withAlpha(0.3)
                ),
                classificationType: this.cesium.ClassificationType.BOTH,
            },
        });
    }

    private createAreaTip(descartesPoints: Cesium.Cartesian3[], type: 'click' | 'move') {
        this.tipAreaEntity && this.viewer.entities.remove(this.tipAreaEntity);
        const area2d = compute_2DPolygonArea(descartesPoints);
        const area3d = compute_3DPolygonArea(this.cesium, descartesPoints);
        const tipEntity = this.viewer.entities.add({
            position: descartesPoints[0],
            label: {
                text: `平面面积：${area2d.toFixed(2)}m² \n 测地面积：${area3d.toFixed(2)}m²`,
                font: '12px sans-serif',
                fillColor: this.cesium.Color.WHITE,
                outlineColor: this.cesium.Color.BLACK,
                outlineWidth: 2,
                style: this.cesium.LabelStyle.FILL_AND_OUTLINE,
                showBackground: false,
                pixelOffset: new this.cesium.Cartesian2(0, 20), // 标签稍微下移
                verticalOrigin: this.cesium.VerticalOrigin.TOP,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                heightReference: this.cesium.HeightReference.CLAMP_TO_GROUND,
            },
        });

        if (type === MouseStatusEnum.click) {
            this.tipEntities.push(tipEntity);
        } else {
            this.tipAreaEntity = tipEntity;
        }
    }
}
