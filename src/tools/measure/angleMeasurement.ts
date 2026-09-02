import * as Cesium from 'cesium';
import MouseEvent from '../mouseBase/mouseBase';
import { MouseStatusEnum } from '../../enum/enum';
import { EventCallback } from '../../type/type';
import type { AngleActiveOptions } from '.';
import { computed_WGS84Distance, compute_Angle } from './new-compute';

export default class AngleMeasurement extends MouseEvent {
    // 1、核心属性
    protected readonly viewer: Cesium.Viewer;
    protected readonly handler: Cesium.ScreenSpaceEventHandler;
    protected readonly cesium: typeof Cesium;

    // 2、集合管理
    private options?: AngleActiveOptions;

    // 3、状态管理
    private state = {
        curSort: 0,
    };

    // 4、数据管理
    private pointDatas = new Map<number, string[]>();
    private tempMovePosition = new Map<number, string>();
    private pointEntitys: { [key: number]: Cesium.Entity[] };
    private polylineEntities: { [key: number]: Cesium.Entity | undefined };
    private tipMoveEntity: Cesium.Entity | undefined;
    private tipEntities: Cesium.Entity[];
    private angleTipEntities: Cesium.Entity[];
    private angleTipMoveEntity: Cesium.Entity | undefined;

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
        this.polylineEntities = {};
        this.pointEntitys = {};
        this.tipMoveEntity = undefined;
        this.tipEntities = [];
        this.angleTipEntities = [];
        this.angleTipMoveEntity = undefined;
    }

    active(options?: AngleActiveOptions): void {
        this.options = { clampToGround: true, ...options };
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
        Object.entries(this.polylineEntities).forEach(([, value]) => {
            if (value) {
                this.viewer.entities.remove(value);
            }
        });
        this.tipEntities.forEach((entity) => {
            return this.viewer.entities.remove(entity);
        });
        this.angleTipEntities.forEach((entity) => {
            return this.viewer.entities.remove(entity);
        });

        this.tipMoveEntity && this.viewer.entities.remove(this.tipMoveEntity);
        this.angleTipMoveEntity && this.viewer.entities.remove(this.angleTipMoveEntity);

        this.state.curSort = 0;
        this.pointDatas.clear();
        this.tempMovePosition.clear();
        this.pointEntitys = {};
        this.polylineEntities = {};
        this.tipMoveEntity = undefined;
        this.tipEntities = [];
        this.angleTipEntities = [];
        this.angleTipMoveEntity = undefined;
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
            this.drawingPolyline();

            const points = this.pointDatas.get(index) ?? [];
            if (points.length > 1) {
                const tempPositions = [...(this.pointDatas.get(index) || [])].map((item) => {
                    return JSON.parse(item);
                });
                // 由于第二次点击又推进来一个元素，所以需要取的开始点位是推进来的倒数第二个元素
                this.computedDistance(
                    tempPositions[tempPositions.length - 2],
                    currentPosition,
                    'click'
                );

                const currentIndex: number = tempPositions.length;
                if (tempPositions.length > 2) {
                    this.computedAngle(
                        tempPositions[currentIndex - 3],
                        tempPositions[currentIndex - 2],
                        currentPosition,
                        'click'
                    );
                }
            }
        }, this.cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    protected rightClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition || !this.cesium.defined(currentPosition)) return;

            const index = this.state.curSort;
            const points = this.pointDatas.get(index) ?? [];
            if (points.length < 3) return;

            const tempPositions = [...(this.pointDatas.get(index) || [])].map((item) => {
                return JSON.parse(item);
            });
            this.tempMovePosition.set(
                index,
                JSON.stringify(tempPositions[tempPositions.length - 1])
            );
            this.tipMoveEntity && this.viewer.entities.remove(this.tipMoveEntity);
            this.angleTipMoveEntity && this.viewer.entities.remove(this.angleTipMoveEntity);
            this.angleTipMoveEntity = undefined;

            this.state.curSort = index + 1;
            this.unRegisterEvents();
            this.dispatch('fxtDrawEnd', { msg: 'success' });
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

            if (this.options?.liveUpdateOnMove === false) {
                return;
            }

            const tempPositions = [...(this.pointDatas.get(index) || [])].map((item) => {
                return JSON.parse(item);
            });
            if (tempPositions.length > 0) {
                this.computedDistance(
                    tempPositions[tempPositions.length - 1],
                    currentPosition,
                    'move'
                );
            }
            if (tempPositions.length >= 2) {
                this.computedAngle(
                    tempPositions[tempPositions.length - 2],
                    tempPositions[tempPositions.length - 1],
                    currentPosition,
                    'move'
                );
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

    private drawingPolyline(): void {
        const index = this.state.curSort;
        if (this.polylineEntities[index]) return;

        this.polylineEntities[index] = this.viewer.entities.add({
            polyline: {
                positions: new this.cesium.CallbackProperty(() => {
                    const tempPositions = [...(this.pointDatas.get(index) || [])].map((item) => {
                        return JSON.parse(item);
                    });
                    if (this.tempMovePosition.get(index)) {
                        tempPositions.push(JSON.parse(this.tempMovePosition.get(index)!));
                    }
                    return tempPositions;
                }, false),
                width: 2,
                material: new this.cesium.ColorMaterialProperty(this.cesium.Color.CHARTREUSE),
                depthFailMaterial: new this.cesium.ColorMaterialProperty(
                    this.cesium.Color.CHARTREUSE
                ),
                clampToGround: this.options?.clampToGround,
            },
        });
    }

    private computedDistance = (
        start: Cesium.Cartesian3,
        end: Cesium.Cartesian3,
        type: 'click' | 'move'
    ) => {
        const distance_2d = computed_WGS84Distance(Cesium, start, end);
        this.createTip(start, end, distance_2d, type);
    };

    private createTip(
        start: Cesium.Cartesian3,
        end: Cesium.Cartesian3,
        distance_2d: number,
        type: 'click' | 'move'
    ) {
        this.tipMoveEntity && this.viewer.entities.remove(this.tipMoveEntity);
        // 计算线的中点位置
        const midPoint = this.cesium.Cartesian3.midpoint(start, end, new Cesium.Cartesian3());

        // 将中点向下移动一小段距离，以便将标签显示在线的下方
        const offset = this.cesium.Cartesian3.multiplyByScalar(
            this.cesium.Cartesian3.normalize(midPoint, new this.cesium.Cartesian3()),
            -0.0005,
            new this.cesium.Cartesian3()
        );
        const labelPosition = this.cesium.Cartesian3.add(
            midPoint,
            offset,
            new this.cesium.Cartesian3()
        );

        const distOpts = this.options?.distance;
        const primaryStr = distance_2d.toFixed(2);
        let text: string;
        if (distOpts?.customRender) {
            text = distOpts.customRender(distance_2d);
        } else if (distOpts?.template) {
            text = distOpts.template.replace('{}', primaryStr);
        } else {
            text = `直线距离${primaryStr}m`;
        }

        const tipEntity = this.viewer.entities.add({
            position: labelPosition,
            label: {
                text,
                show: distOpts?.show !== false,
                font: distOpts?.font ?? '10px sans-serif',
                scale: distOpts?.scale,
                fillColor: distOpts?.fillColor ?? this.cesium.Color.WHITE,
                outlineColor: distOpts?.outlineColor ?? this.cesium.Color.BLACK,
                outlineWidth: distOpts?.outlineWidth ?? 2,
                style: distOpts?.style ?? this.cesium.LabelStyle.FILL_AND_OUTLINE,
                showBackground: distOpts?.showBackground ?? false,
                verticalOrigin: distOpts?.verticalOrigin ?? this.cesium.VerticalOrigin.TOP,
                pixelOffset: distOpts?.pixelOffset ?? new this.cesium.Cartesian2(0, 20),
                disableDepthTestDistance:
                    distOpts?.disableDepthTestDistance ?? Number.POSITIVE_INFINITY,
            },
        });

        if (type === MouseStatusEnum.click) {
            this.tipEntities.push(tipEntity);
        } else {
            this.tipMoveEntity = tipEntity;
        }
    }

    private computedAngle(
        start: Cesium.Cartesian3,
        middle: Cesium.Cartesian3,
        end: Cesium.Cartesian3,
        type: 'click' | 'move'
    ) {
        if (type === 'move') {
            this.angleTipMoveEntity && this.viewer.entities.remove(this.angleTipMoveEntity);
        }

        const angle = compute_Angle(this.cesium, start, middle, end);
        const angleOpts = this.options?.angle;
        const angleStr = angle.toFixed(2);
        let angleText: string;
        if (angleOpts?.customRender) {
            angleText = angleOpts.customRender(angle);
        } else if (angleOpts?.template) {
            angleText = angleOpts.template.replace('{}', angleStr);
        } else {
            angleText = `角度: ${angleStr}°`;
        }

        const clampGround = this.options?.clampToGround === true;
        const angleEntity = this.viewer.entities.add({
            position: middle,
            label: {
                text: angleText,
                show: angleOpts?.show !== false,
                font: angleOpts?.font ?? '14px sans-serif',
                scale: angleOpts?.scale,
                fillColor: angleOpts?.fillColor ?? this.cesium.Color.WHITE,
                outlineColor: angleOpts?.outlineColor ?? this.cesium.Color.BLACK,
                outlineWidth: angleOpts?.outlineWidth ?? 2,
                style: angleOpts?.style ?? this.cesium.LabelStyle.FILL_AND_OUTLINE,
                showBackground: angleOpts?.showBackground ?? false,
                horizontalOrigin: angleOpts?.horizontalOrigin ?? this.cesium.HorizontalOrigin.LEFT,
                verticalOrigin: angleOpts?.verticalOrigin ?? this.cesium.VerticalOrigin.BOTTOM,
                pixelOffset: angleOpts?.pixelOffset ?? new this.cesium.Cartesian2(10, -10),
                disableDepthTestDistance:
                    angleOpts?.disableDepthTestDistance ?? Number.POSITIVE_INFINITY,
                ...(clampGround
                    ? { heightReference: this.cesium.HeightReference.CLAMP_TO_GROUND }
                    : {}),
            },
        });

        if (type === MouseStatusEnum.click) {
            this.angleTipEntities.push(angleEntity);
        } else {
            this.angleTipMoveEntity = angleEntity;
        }
    }
}
