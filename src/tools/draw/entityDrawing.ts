import * as Cesium from 'cesium';
import MouseEvent from '../mouseBase/mouseBase';
import { EventCallback } from '../../type/type';
import {
    CreatePrimitiveOptions,
    DrawingEntityOptions,
    Points,
    EditPrimitiveOptions,
    DrawingTypeEnum,
    DrawingTypeNameEnum,
    LatLng,
    CreateEntityOptions,
} from './type';

/**
 * 绘图基础类，用于处理各种图形的绘制 --- 使用Entity保存
 * @class DrawingEntities
 * @extends MouseEvent
 */
export default class DrawingEntities extends MouseEvent {
    // 1、核心属性
    protected readonly viewer: Cesium.Viewer;
    protected readonly handler: Cesium.ScreenSpaceEventHandler;
    protected readonly cesium: typeof Cesium;

    // 2、状态管理
    private state = {
        drawingType: DrawingTypeEnum.POINT,
        curSort: 0,
        options: null as DrawingEntityOptions | CreatePrimitiveOptions | null,
    };

    // 3、数据管理
    private pointDatas = new Map<number, string[]>();
    private tempMovePosition = new Map<number, string>();
    private pointEntitys: { [key: number]: Cesium.Entity[] };
    private polylinePolygonEntities: { [key: number]: Cesium.Entity | undefined };
    private billboardEntity: { [key: number]: Cesium.Entity[] };
    private labelEntity: { [key: number]: Cesium.Entity[] };

    constructor(
        viewer: Cesium.Viewer,
        handler: Cesium.ScreenSpaceEventHandler,
        cesium: typeof Cesium
    ) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
        this.cesium = cesium;
        this.state.drawingType = DrawingTypeEnum.POINT;
        this.state.options = null;
        this.state.curSort = 0;
        this.pointDatas = new Map<number, string[]>();
        this.tempMovePosition = new Map<number, string>();
        this.pointEntitys = {};
        this.polylinePolygonEntities = {};
        this.billboardEntity = {};
        this.labelEntity = {};
    }

    active(options?: DrawingEntityOptions): void {
        if (options && Object.keys(options).length > 0) {
            this.state.drawingType = options.type;
            this.state.options = options;
        }

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
        Object.entries(this.polylinePolygonEntities).forEach(([, value]) => {
            if (value) {
                this.viewer.entities.remove(value);
            }
        });
        Object.entries(this.billboardEntity).forEach(([, value]) => {
            value.forEach((entity) => {
                this.viewer.entities.remove(entity);
            });
        });
        Object.entries(this.labelEntity).forEach(([, value]) => {
            value.forEach((entity) => {
                this.viewer.entities.remove(entity);
            });
        });

        this.state.curSort = 0;
        this.pointDatas.clear();
        this.tempMovePosition.clear();
        this.pointEntitys = {};
        this.polylinePolygonEntities = {};
        this.billboardEntity = {};
        this.labelEntity = {};
    }

    addToolsEventListener<T>(eventName: string, callback: EventCallback<T>) {
        this.addEventListener(eventName, callback);
    }

    removeToolsEventListener<T>(eventName: string, callback?: EventCallback<T>) {
        this.removeEventListener(eventName, callback);
    }

    protected leftClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            try {
                const currentPosition = this.viewer.scene.pickPosition(e.position);
                if (!currentPosition || !this.cesium.defined(currentPosition)) return;

                const index = this.state.curSort;
                if (!this.pointDatas.has(index)) {
                    this.pointDatas.set(index, []);
                }

                // 数据进行深拷贝 避免引用对象被改变
                this.pointDatas.get(index)?.push(JSON.stringify(currentPosition));
                this.drawing(currentPosition, this.state.drawingType);
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error('AN_ERROR_OCCURRED_DURING_THE_ADD_POINT_PROCESS:', error);
                this.dispatch('cesiumToolsFxt', {
                    type: DrawingTypeNameEnum[this.state.drawingType],
                    status: 'failed',
                    error: {
                        reason: error instanceof Error ? error.message : 'Unknown Error',
                        timestamp: Date.now(),
                    },
                });
            }
        }, this.cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    protected rightClickEvent(): void {
        this.handler.setInputAction(() => {
            try {
                const index = this.state.curSort;
                const isPolygon =
                    this.state.drawingType === DrawingTypeEnum.POLYGON ||
                    this.state.drawingType === DrawingTypeEnum.POLYLINE ||
                    this.state.drawingType === DrawingTypeEnum.POLYGON_AND_POLYLINE;

                const points = this.pointDatas.get(index) ?? [];
                if (isPolygon && points.length < 3) return;

                const tempPositions = [...(this.pointDatas.get(index) || [])].map((item) => {
                    return JSON.parse(item);
                });
                this.tempMovePosition.set(index, JSON.stringify(tempPositions[0]));

                this.dispatch('cesiumToolsFxt', {
                    type: DrawingTypeNameEnum[this.state.drawingType],
                    status: 'success',
                    result: {
                        positions: this.pointDatas.get(index),
                        drawType: DrawingTypeNameEnum[this.state.drawingType],
                        timestamp: Date.now(),
                    },
                });

                this.state.curSort = index + 1;

                this.unRegisterEvents();
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error('AN_ERROR_OCCURRED_DURING_THE_DRAWING_PROCESS:', error);
                this.dispatch('cesiumToolsFxt', {
                    type: DrawingTypeNameEnum[this.state.drawingType],
                    status: 'failed',
                    error: {
                        reason: error instanceof Error ? error.message : 'Unknown Error',
                        timestamp: Date.now(),
                    },
                });
            }
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
        }, this.cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }

    drawing(position: Points, type: DrawingTypeEnum): void {
        const index = this.state.curSort;
        switch (type) {
            case DrawingTypeEnum.POINT:
                this.drawingPointEntity(position, index);
                break;
            case DrawingTypeEnum.POLYLINE:
                this.drawingPointEntity(position, index);
                if (!this.polylinePolygonEntities[index]) {
                    this.drawingPolylinEntity(index, type);
                }
                break;
            case DrawingTypeEnum.POLYGON:
                this.drawingPointEntity(position, index);
                if (!this.polylinePolygonEntities[index]) {
                    this.drawingPolylinEntity(index, type);
                }
                break;
            case DrawingTypeEnum.POLYGON_AND_POLYLINE:
                this.drawingPointEntity(position, index);
                this.drawingPolylinEntity(index, type);
                break;
            case DrawingTypeEnum.BILLBOARD:
                this.drawingBillboardEntity(position, index);
                break;
            case DrawingTypeEnum.LABEL:
                this.drawingLabelEntity(position, index);
                break;

            default:
                break;
        }
    }

    drawingPointEntity(position: Points, index: number): void {
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
                    ...this.state.options?.point,
                },
            })
        );

        if (this.state.options?.point?.showLabel) {
            this.drawingLabelEntity(position, index);
        }
    }

    drawingPolylinEntity(index: number, type: DrawingTypeEnum): void {
        if (this.polylinePolygonEntities[index]) return;
        this.polylinePolygonEntities[index] = this.viewer.entities.add({
            polyline:
                type !== DrawingTypeEnum.POLYGON
                    ? {
                          positions: new this.cesium.CallbackProperty(() => {
                              const tempPositions = [...(this.pointDatas.get(index) || [])].map(
                                  (item) => {
                                      return JSON.parse(item);
                                  }
                              );
                              if (this.tempMovePosition.get(index)) {
                                  tempPositions.push(JSON.parse(this.tempMovePosition.get(index)!));
                                  tempPositions.push(tempPositions[0]);
                              }
                              return tempPositions;
                          }, false),
                          width: 2,
                          material: new this.cesium.ColorMaterialProperty(
                              this.cesium.Color.CHARTREUSE
                          ),
                          depthFailMaterial: new this.cesium.ColorMaterialProperty(
                              this.cesium.Color.CHARTREUSE
                          ),
                          // 是否贴地
                          clampToGround: true,
                          ...this.state.options?.polyline,
                      }
                    : {},
            polygon:
                type !== DrawingTypeEnum.POLYLINE
                    ? {
                          hierarchy: new this.cesium.CallbackProperty(() => {
                              const tempPositions = [...(this.pointDatas.get(index) || [])].map(
                                  (item) => {
                                      return JSON.parse(item);
                                  }
                              );
                              if (this.tempMovePosition.get(index)) {
                                  tempPositions.push(JSON.parse(this.tempMovePosition.get(index)!));
                              }
                              return new this.cesium.PolygonHierarchy(
                                  tempPositions as Cesium.Cartesian3[]
                              );
                          }, false),
                          material: new this.cesium.ColorMaterialProperty(
                              this.cesium.Color.YELLOW.withAlpha(0.3)
                          ),
                          classificationType: this.cesium.ClassificationType.BOTH,
                          ...this.state.options?.polygon,
                      }
                    : {},
            position: JSON.parse(this.tempMovePosition.get(index)!) as Cesium.Cartesian3,
            label: {
                text: `${(this.state.options?.name ?? '面') + index}`,
                font: '10px sans-serif',
                fillColor: this.cesium.Color.WHITE,
                outlineColor: this.cesium.Color.BLACK,
                outlineWidth: 2,
                style: this.cesium.LabelStyle.FILL_AND_OUTLINE,
                showBackground: true,
                verticalOrigin: this.cesium.VerticalOrigin.TOP,
                pixelOffset: new this.cesium.Cartesian2(0, 20), // 标签稍微下移
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                heightReference: this.cesium.HeightReference.CLAMP_TO_GROUND,
                ...this.state.options?.label,
            },
        });
    }

    drawingBillboardEntity(position: Points, index: number): void {
        if (!this.billboardEntity[index]) {
            this.billboardEntity[index] = [];
        }
        this.billboardEntity[index].push(
            this.viewer.entities.add({
                position: position as Cesium.Cartesian3,
                billboard: {
                    image: '/public/resources/images/特征点_选中.png',
                    width: 24,
                    height: 24,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    horizontalOrigin: this.cesium.HorizontalOrigin.CENTER,
                    verticalOrigin: this.cesium.VerticalOrigin.CENTER,
                    ...this.state.options?.billboard,
                },
            })
        );
    }

    drawingLabelEntity(position: Points, index: number): void {
        if (!this.labelEntity[index]) {
            this.labelEntity[index] = [];
        }
        this.labelEntity[index].push(
            this.viewer.entities.add({
                position: position as Cesium.Cartesian3,
                label: {
                    text: 'Point',
                    font: '10px sans-serif',
                    fillColor: this.cesium.Color.WHITE,
                    outlineColor: this.cesium.Color.BLACK,
                    outlineWidth: 2,
                    style: this.cesium.LabelStyle.FILL_AND_OUTLINE,
                    showBackground: true,
                    verticalOrigin: this.cesium.VerticalOrigin.TOP,
                    pixelOffset: new this.cesium.Cartesian2(0, 20),
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    heightReference: this.cesium.HeightReference.CLAMP_TO_GROUND,
                    ...this.state.options?.label,
                },
            })
        );
    }

    create(id: string | number, positions: Points[], options: CreateEntityOptions) {
        /**
         * TODO: 保存的时候 右键导致 curSort 加1 所以需要将他还原
         */
        if (this.state.curSort > 0) {
            this.state.curSort = this.state.curSort - 1;
        }
        // 去重
        const uniquePositions = Array.from(
            new Set(
                (positions as Cesium.Cartesian3[]).map((pos) => {
                    return JSON.stringify(pos);
                })
            )
        ).map((pos) => {
            return JSON.parse(pos);
        });

        /**
         * TODO: 如果是经纬度将经纬度转为笛卡尔坐标
         */
        const cartesianPositions =
            Array.isArray(uniquePositions) &&
            uniquePositions[0] &&
            typeof uniquePositions[0] === 'object' &&
            'latitude' in uniquePositions[0]
                ? this.latLngToCartesians(uniquePositions as LatLng[])
                : (uniquePositions as Cesium.Cartesian3[]);

        const index = this.state.curSort;

        switch (options.type) {
            case DrawingTypeEnum.POINT:
                this.createPointEntity(index, id, cartesianPositions, options);
                break;
            case DrawingTypeEnum.POLYLINE:
                this.createPolylineEntity(index, id, cartesianPositions, options);
                break;
            case DrawingTypeEnum.POLYGON:
                this.createPolygonEntity(index, id, cartesianPositions, options);
                break;
            case DrawingTypeEnum.POLYGON_AND_POLYLINE:
                this.createPolylinePolygonEntity(index, id, cartesianPositions, options);
                break;
            case DrawingTypeEnum.BILLBOARD:
                this.drawingBillboardPrimitive(index, id, cartesianPositions, options);
                break;
            case DrawingTypeEnum.LABEL:
                this.createLabelEntity(index, id, cartesianPositions, options);
                break;

            default:
                break;
        }
    }

    /** 经纬度转笛卡尔 */
    latLngToCartesians(latLngs: LatLng[]) {
        const cartesianPositions = latLngs.map((pos) => {
            return Cesium.Cartesian3.fromDegrees(pos.longitude, pos.latitude, pos?.height ?? 0);
        });
        return cartesianPositions;
    }

    createPointEntity(
        index: number,
        id: number | string,
        cartesianPositions: Cesium.Cartesian3[],
        options: CreateEntityOptions
    ) {
        this.clearAllEntity(index);

        cartesianPositions.forEach((point: Cesium.Cartesian3) => {
            this.viewer.entities.add({
                id: String(id),
                position: point as Cesium.Cartesian3,
                point: {
                    color: this.cesium.Color.YELLOW,
                    outlineColor: this.cesium.Color.BLACK,
                    outlineWidth: 1,
                    pixelSize: 8,
                    clampToGround: true,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    classificationType: Cesium.ClassificationType.BOTH, // 支持类型： 地形、3DTile、或者在地面上
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, //设置HeightReference高度参考类型为CLAMP_TO_GROUND贴地类型
                    ...options.point,
                },
                label: options.point?.showLabel
                    ? {
                          text: 'Point',
                          font: '10px sans-serif',
                          fillColor: this.cesium.Color.WHITE,
                          outlineColor: this.cesium.Color.BLACK,
                          outlineWidth: 2,
                          style: this.cesium.LabelStyle.FILL_AND_OUTLINE,
                          showBackground: true,
                          verticalOrigin: this.cesium.VerticalOrigin.TOP,
                          pixelOffset: new this.cesium.Cartesian2(0, 20),
                          disableDepthTestDistance: Number.POSITIVE_INFINITY,
                          heightReference: this.cesium.HeightReference.CLAMP_TO_GROUND,
                          ...options.label,
                      }
                    : {},
            });
        });
    }

    createPolylineEntity(
        index: number,
        id: number | string,
        cartesianPositions: Cesium.Cartesian3[],
        options: CreateEntityOptions
    ) {
        this.clearAllEntity(index);

        this.viewer.entities.add({
            id: String(id),
            polyline: {
                positions: cartesianPositions,
                width: 2,
                material: new this.cesium.ColorMaterialProperty(this.cesium.Color.CHARTREUSE),
                depthFailMaterial: new this.cesium.ColorMaterialProperty(
                    this.cesium.Color.CHARTREUSE
                ),
                clampToGround: true,
                ...options.polyline,
            },
            label: options.polyline?.showLabel
                ? {
                      text: 'Point',
                      font: '10px sans-serif',
                      fillColor: this.cesium.Color.WHITE,
                      outlineColor: this.cesium.Color.BLACK,
                      outlineWidth: 2,
                      style: this.cesium.LabelStyle.FILL_AND_OUTLINE,
                      showBackground: true,
                      verticalOrigin: this.cesium.VerticalOrigin.TOP,
                      pixelOffset: new this.cesium.Cartesian2(0, 20),
                      disableDepthTestDistance: Number.POSITIVE_INFINITY,
                      heightReference: this.cesium.HeightReference.CLAMP_TO_GROUND,
                      ...options.label,
                  }
                : {},
        });
    }

    createPolygonEntity(
        index: number,
        id: number | string,
        cartesianPositions: Cesium.Cartesian3[],
        options: CreateEntityOptions
    ) {
        this.clearAllEntity(index);

        this.viewer.entities.add({
            id: String(id),
            polygon: {
                hierarchy: new this.cesium.CallbackProperty(() => {
                    return new this.cesium.PolygonHierarchy(cartesianPositions);
                }, false),
                material: new this.cesium.ColorMaterialProperty(
                    this.cesium.Color.YELLOW.withAlpha(0.3)
                ),
                classificationType: this.cesium.ClassificationType.BOTH,
                ...options.polygon,
            },
            label: options.polygon?.showLabel
                ? {
                      text: 'Point',
                      font: '10px sans-serif',
                      fillColor: this.cesium.Color.WHITE,
                      outlineColor: this.cesium.Color.BLACK,
                      outlineWidth: 2,
                      style: this.cesium.LabelStyle.FILL_AND_OUTLINE,
                      showBackground: true,
                      verticalOrigin: this.cesium.VerticalOrigin.TOP,
                      pixelOffset: new this.cesium.Cartesian2(0, 20),
                      disableDepthTestDistance: Number.POSITIVE_INFINITY,
                      heightReference: this.cesium.HeightReference.CLAMP_TO_GROUND,
                      ...options.label,
                  }
                : {},
        });
    }

    createPolylinePolygonEntity(
        index: number,
        id: number | string,
        cartesianPositions: Cesium.Cartesian3[],
        options: CreateEntityOptions
    ) {
        this.clearAllEntity(index);

        this.viewer.entities.add({
            id: String(id),
            polyline: {
                positions: cartesianPositions,
                width: 2,
                material: new this.cesium.ColorMaterialProperty(this.cesium.Color.CHARTREUSE),
                depthFailMaterial: new this.cesium.ColorMaterialProperty(
                    this.cesium.Color.CHARTREUSE
                ),
                clampToGround: true,
                ...options.polyline,
            },
            polygon: {
                hierarchy: new this.cesium.CallbackProperty(() => {
                    return new this.cesium.PolygonHierarchy(cartesianPositions);
                }, false),
                material: new this.cesium.ColorMaterialProperty(
                    this.cesium.Color.YELLOW.withAlpha(0.3)
                ),
                classificationType: this.cesium.ClassificationType.BOTH,
                ...options.polygon,
            },
            label: options.polylinPolygon?.showLabel
                ? {
                      text: 'Point',
                      font: '10px sans-serif',
                      fillColor: this.cesium.Color.WHITE,
                      outlineColor: this.cesium.Color.BLACK,
                      outlineWidth: 2,
                      style: this.cesium.LabelStyle.FILL_AND_OUTLINE,
                      showBackground: true,
                      verticalOrigin: this.cesium.VerticalOrigin.TOP,
                      pixelOffset: new this.cesium.Cartesian2(0, 20),
                      disableDepthTestDistance: Number.POSITIVE_INFINITY,
                      heightReference: this.cesium.HeightReference.CLAMP_TO_GROUND,
                      ...options.label,
                  }
                : {},
        });
    }

    drawingBillboardPrimitive(
        index: number,
        id: number | string,
        cartesianPositions: Cesium.Cartesian3[],
        options: CreateEntityOptions
    ) {
        this.clearAllEntity(index);

        cartesianPositions.forEach((point: Cesium.Cartesian3) => {
            this.viewer.entities.add({
                id: String(id),
                position: point as Cesium.Cartesian3,
                billboard: {
                    image: '/public/resources/images/特征点_选中.png',
                    width: 24,
                    height: 24,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    horizontalOrigin: this.cesium.HorizontalOrigin.CENTER,
                    verticalOrigin: this.cesium.VerticalOrigin.CENTER,
                    ...options.billboard,
                },
                label: options.billboard?.showLabel
                    ? {
                          text: 'Point',
                          font: '10px sans-serif',
                          fillColor: this.cesium.Color.WHITE,
                          outlineColor: this.cesium.Color.BLACK,
                          outlineWidth: 2,
                          style: this.cesium.LabelStyle.FILL_AND_OUTLINE,
                          showBackground: true,
                          verticalOrigin: this.cesium.VerticalOrigin.TOP,
                          pixelOffset: new this.cesium.Cartesian2(0, 20),
                          disableDepthTestDistance: Number.POSITIVE_INFINITY,
                          heightReference: this.cesium.HeightReference.CLAMP_TO_GROUND,
                          ...options.label,
                      }
                    : {},
            });
        });
    }

    createLabelEntity(
        index: number,
        id: number | string,
        cartesianPositions: Cesium.Cartesian3[],
        options: CreateEntityOptions
    ) {
        this.clearAllEntity(index);

        cartesianPositions.forEach((point: Cesium.Cartesian3) => {
            this.viewer.entities.add({
                id: String(id),
                position: point as Cesium.Cartesian3,
                label: {
                    text: 'Point',
                    font: '10px sans-serif',
                    fillColor: this.cesium.Color.WHITE,
                    outlineColor: this.cesium.Color.BLACK,
                    outlineWidth: 2,
                    style: this.cesium.LabelStyle.FILL_AND_OUTLINE,
                    showBackground: true,
                    verticalOrigin: this.cesium.VerticalOrigin.TOP,
                    pixelOffset: new this.cesium.Cartesian2(0, 20),
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    heightReference: this.cesium.HeightReference.CLAMP_TO_GROUND,
                    ...options.label,
                },
            });
        });
    }

    clearAllEntity(index: number) {
        if (this.pointEntitys[index]) {
            this.pointEntitys[index].forEach((entity) => {
                this.viewer.entities.remove(entity);
            });
            delete this.pointEntitys[index];
        }

        if (this.polylinePolygonEntities[index]) {
            this.viewer.entities.remove(this.polylinePolygonEntities[index]);
            delete this.polylinePolygonEntities[index];
        }

        if (this.polylinePolygonEntities[index]) {
            this.viewer.entities.remove(this.polylinePolygonEntities[index]);
            delete this.polylinePolygonEntities[index];
        }

        this.labelEntity[index]?.forEach((entity) => {
            this.viewer.entities.remove(entity);
            delete this.labelEntity[index];
        });

        this.tempMovePosition['delete'](index);
        this.pointDatas['delete'](index);

        if (this.state.curSort > -1) {
            this.state.curSort = this.state.curSort - 1;
            if (this.state.curSort === -1) {
                this.state.curSort = 0;
            }
        }
    }

    edit(id: number | string, viewer: Cesium.Viewer, options: CreateEntityOptions) {
        let isEdited = false;

        try {
            // 如果传入的是经纬度坐标，转换为笛卡尔坐标
            const cartesianPositions =
                options?.options && 'latitude' in options?.options[0]
                    ? this.latLngToCartesians(options?.options as LatLng[])
                    : (options?.options as Cesium.Cartesian3[]);

            viewer.entities.values.forEach((entity) => {
                if (entity.id === String(id)) {
                    // 更新位置信息
                    if (cartesianPositions) {
                        // 对于点、广告牌、标签等单点实体
                        if (entity.position && cartesianPositions.length > 0) {
                            entity.position = new this.cesium.CallbackProperty(() => {
                                return cartesianPositions[0];
                            }, false);
                        }

                        // 对于线实体
                        if (entity.polyline) {
                            entity.polyline.positions = new this.cesium.CallbackProperty(() => {
                                return cartesianPositions;
                            }, false);
                        }

                        // 对于面实体
                        if (entity.polygon) {
                            entity.polygon.hierarchy = new this.cesium.CallbackProperty(() => {
                                return new this.cesium.PolygonHierarchy(cartesianPositions);
                            }, false);
                        }
                    }

                    // 更新样式属性
                    if (entity.point && options.point) {
                        Object.assign(entity.point, options.point);
                    }

                    if (entity.polyline && options.polyline) {
                        Object.assign(entity.polyline, options.polyline);
                    }

                    if (entity.polygon && options.polygon) {
                        Object.assign(entity.polygon, options.polygon);
                    }

                    if (entity.billboard && options.billboard) {
                        Object.assign(entity.billboard, options.billboard);
                    }

                    if (entity.label && options.label) {
                        Object.assign(entity.label, options.label);
                    }

                    isEdited = true;
                }
            });
            if (isEdited) {
                this.dispatch('cesiumToolsFxt', {
                    type: options?.type && DrawingTypeNameEnum[options?.type] + ' Edit',
                    status: 'finished',
                    id: id,
                });
            } else {
                this.dispatch('cesiumToolsFxt', {
                    type: options?.type && DrawingTypeNameEnum[options?.type] + ' Edit',
                    status: 'failed',
                    reason: 'No matching primitive found',
                });
            }
        } catch (error) {
            this.dispatch('cesiumToolsFxt', {
                type: options?.type && DrawingTypeNameEnum[options?.type] + ' Edit',
                status: 'failed',
                reason: error,
            });
        }
    }
}
