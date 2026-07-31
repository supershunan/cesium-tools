import * as Cesium from 'cesium';
import MouseEvent from '../mouseBase/mouseBase';
import { computed_WGS84Distance, computed_spaceDistance } from './compute';
import { MouseStatusEnum } from '../../enum/enum';
import { EventCallback } from '../../type/type';
import { LengthActiveOptions } from '.';

export default class LengthMeasurement extends MouseEvent {
    // 1、核心属性
    protected readonly viewer: Cesium.Viewer;
    protected readonly handler: Cesium.ScreenSpaceEventHandler;
    protected readonly cesium: typeof Cesium;

    // 2、集合管理
    private options?: LengthActiveOptions;

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
    /** 避免贴地异步测距与鼠标移动交错完成后，过期的 move 仍创建标签 */
    private distanceMoveGeneration = 0;
    private distanceClickGeneration = 0;

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
    }

    active(options?: LengthActiveOptions): void {
        this.options = options ? options : { clampToGround: true };
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
        this.tipMoveEntity && this.viewer.entities.remove(this.tipMoveEntity);

        this.state.curSort = 0;
        this.pointDatas.clear();
        this.tempMovePosition.clear();
        this.pointEntitys = {};
        this.polylineEntities = {};
        this.tipMoveEntity = undefined;
        this.tipEntities = [];
        this.distanceMoveGeneration = 0;
        this.distanceClickGeneration = 0;
    }

    addToolsEventListener<T>(eventName: string, callback: EventCallback<T>) {
        this.addEventListener(eventName, callback);
    }

    removeToolsEventListener<T>(eventName: string, callback?: EventCallback<T>) {
        this.removeEventListener(eventName, callback);
    }

    protected leftClickEvent(): void {
        this.handler.setInputAction(async (e: { position: Cesium.Cartesian2 }) => {
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
                await this.computedDistance(
                    tempPositions[tempPositions.length - 2],
                    currentPosition,
                    'click'
                );
            }
        }, this.cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    protected rightClickEvent(): void {
        this.handler.setInputAction(async (e: { position: Cesium.Cartesian2 }) => {
            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition || !this.cesium.defined(currentPosition)) return;

            const index = this.state.curSort;
            // ------------- s
            if (!this.pointDatas.has(index)) {
                this.pointDatas.set(index, []);
            }
            this.pointDatas.get(index)?.push(JSON.stringify(currentPosition));
            this.createPoint(currentPosition);
            this.drawingPolyline();
            // ------------- e
            const points = this.pointDatas.get(index) ?? [];
            if (points.length < 2) return;

            const tempPositions = [...(this.pointDatas.get(index) || [])].map((item) => {
                return JSON.parse(item);
            });
            // ------------- s
            // 由于第二次点击又推进来一个元素，所以需要取的开始点位是推进来的倒数第二个元素
            await this.computedDistance(
                tempPositions[tempPositions.length - 2],
                currentPosition,
                'click'
            );
            // ------------- e
            this.tempMovePosition.set(
                index,
                JSON.stringify(tempPositions[tempPositions.length - 1])
            );
            this.tipMoveEntity && this.viewer.entities.remove(this.tipMoveEntity);

            this.state.curSort = index + 1;
            this.unRegisterEvents();
            this.dispatch('fxtDrawEnd', { msg: 'success' });
        }, this.cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    protected mouseMoveEvent(): void {
        this.handler.setInputAction(async (e: { endPosition: Cesium.Cartesian2 }) => {
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
                await this.computedDistance(
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

    private computedDistance = async (
        start: Cesium.Cartesian3,
        end: Cesium.Cartesian3,
        type: 'click' | 'move'
    ) => {
        if (type === 'move') {
            const generation = ++this.distanceMoveGeneration;
            let distance_2d = 0,
                distance_3d = 0;
            if (this.options?.clampToGround) {
                distance_3d = await computed_WGS84Distance(Cesium, start, end);
            } else {
                distance_2d = computed_spaceDistance(Cesium, start, end);
            }
            if (generation !== this.distanceMoveGeneration) {
                return;
            }
            this.createTip(start, end, distance_2d, distance_3d, type);
            return;
        }

        this.distanceMoveGeneration++;
        const clickGeneration = ++this.distanceClickGeneration;
        let distance_2d = 0,
            distance_3d = 0;
        if (this.options?.clampToGround) {
            distance_3d = await computed_WGS84Distance(Cesium, start, end);
        } else {
            distance_2d = computed_spaceDistance(Cesium, start, end);
        }
        if (clickGeneration !== this.distanceClickGeneration) {
            return;
        }
        this.createTip(start, end, distance_2d, distance_3d, type);
    };

    private createTip(
        start: Cesium.Cartesian3,
        end: Cesium.Cartesian3,
        distance_2d: number,
        distance_3d: number,
        type: 'click' | 'move'
    ) {
        if (this.tipMoveEntity) {
            this.viewer.entities.remove(this.tipMoveEntity);
            this.tipMoveEntity = undefined;
        }
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

        const line = this.options?.line;
        const use3d = this.options?.clampToGround;
        const primaryNum = use3d ? distance_3d : distance_2d;
        const primaryStr = primaryNum.toFixed(2);

        let text: string;
        if (line?.customRender) {
            text = line.customRender(primaryNum);
        } else if (line?.template) {
            text = line.template.replace('{}', primaryStr);
        } else {
            text = use3d ? `贴地距离${primaryStr}m` : `直线距离${primaryStr}m`;
        }

        const tipEntity = this.viewer.entities.add({
            position: labelPosition,
            label: {
                text,
                show: line?.show !== false,
                font: line?.font ?? '10px sans-serif',
                fillColor: line?.fillColor ?? this.cesium.Color.WHITE,
                outlineColor: line?.outlineColor ?? this.cesium.Color.BLACK,
                outlineWidth: line?.outlineWidth ?? 2,
                style: line?.style ?? this.cesium.LabelStyle.FILL_AND_OUTLINE,
                showBackground: line?.showBackground ?? false,
                verticalOrigin: line?.verticalOrigin ?? this.cesium.VerticalOrigin.TOP,
                pixelOffset: line?.pixelOffset ?? new this.cesium.Cartesian2(0, 20),
                disableDepthTestDistance:
                    line?.disableDepthTestDistance ?? Number.POSITIVE_INFINITY,
                ...(use3d ? { heightReference: this.cesium.HeightReference.CLAMP_TO_GROUND } : {}),
            },
        });

        if (type === MouseStatusEnum.click) {
            this.tipEntities.push(tipEntity);
        } else {
            this.tipMoveEntity = tipEntity;
        }
    }
}
