import * as Cesium from 'cesium';
import MouseEvent from '../mouseBase/mouseBase';
import { EventCallback } from '../../type/type';
import {
    CreatePrimitiveOptions,
    DrawingEntityOptions,
    Points,
    EditPrimitiveOptions,
    DrawingTypeEnum,
} from './type';

/**
 * 绘图基础类，用于处理各种图形的绘制
 * @class DrawingPrimitives
 * @extends MouseEvent
 */
export default class DrawingPrimitives extends MouseEvent {
    // 1、核心属性
    protected readonly viewer: Cesium.Viewer;
    protected readonly handler: Cesium.ScreenSpaceEventHandler;

    // 2、集合管理
    private collection = {
        locationPoint: new Cesium.PointPrimitiveCollection(),
        locationBillbord: new Cesium.BillboardCollection(),
        locationLabel: new Cesium.LabelCollection(),
    };

    // 3、状态管理
    private state = {
        drawingType: DrawingTypeEnum.POINT,
        curSort: 0,
        options: null as DrawingEntityOptions | CreatePrimitiveOptions | null,
    };

    // 4、数据管理
    private pointDatas = new Map<number, string[]>();
    private tempMovePosition = new Map<number, string>();
    private pointEntitys: { [key: number]: Cesium.Entity[] };
    private polylinePolygonEntities: { [key: number]: Cesium.Entity | undefined };
    private billboardEntity: { [key: number]: Cesium.Entity[] };
    private labelEntity: { [key: number]: Cesium.Entity[] };

    constructor(viewer: Cesium.Viewer, handler: Cesium.ScreenSpaceEventHandler) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
        this.collection.locationPoint = this.viewer.scene.primitives.add(
            new Cesium.PointPrimitiveCollection()
        );
        this.collection.locationBillbord = this.viewer.scene.primitives.add(
            new Cesium.BillboardCollection()
        );
        this.collection.locationLabel = this.viewer.scene.primitives.add(
            new Cesium.LabelCollection()
        );
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
            if (!currentPosition || !Cesium.defined(currentPosition)) return;

            const index = this.state.curSort;
            if (!this.pointDatas.has(index)) {
                this.pointDatas.set(index, []);
            }

            // 数据进行深拷贝 避免引用对象被改变
            this.pointDatas.get(index)?.push(JSON.stringify(currentPosition));
            this.drawing(currentPosition, this.state.drawingType);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    protected rightClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            const index = this.state.curSort;
            const isPolygon =
                this.state.drawingType === DrawingTypeEnum.POLYGON ||
                this.state.drawingType === DrawingTypeEnum.POLYLINE ||
                this.state.drawingType === DrawingTypeEnum.POLYGON_AND_POLYLINE;

            if (isPolygon && this.pointDatas.get(index)?.length < 2) return;

            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition || !Cesium.defined(currentPosition)) return;

            if (!this.pointDatas.has(index)) {
                this.pointDatas.set(index, []);
            }
            this.pointDatas.get(index)?.push(JSON.stringify(currentPosition));

            this.drawing(currentPosition, this.state.drawingType);

            this.state.curSort = index + 1;

            this.unRegisterEvents();
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    protected mouseMoveEvent(): void {
        this.handler.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
            const currentPosition = this.viewer.scene.pickPosition(e.endPosition);
            if (!currentPosition || !Cesium.defined(currentPosition)) return;
            const index = this.state.curSort;
            if (!this.tempMovePosition) {
                this.tempMovePosition = new Map<number, string>();
            }
            this.tempMovePosition.set(index, JSON.stringify(currentPosition));
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
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
                    color: Cesium.Color.YELLOW,
                    outlineColor: Cesium.Color.BLACK,
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
                          positions: new Cesium.CallbackProperty(() => {
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
                          material: new Cesium.ColorMaterialProperty(Cesium.Color.CHARTREUSE),
                          depthFailMaterial: new Cesium.ColorMaterialProperty(
                              Cesium.Color.CHARTREUSE
                          ),
                          // 是否贴地
                          clampToGround: true,
                          ...this.state.options?.polyline,
                      }
                    : {},
            polygon:
                type !== DrawingTypeEnum.POLYLINE
                    ? {
                          hierarchy: new Cesium.CallbackProperty(() => {
                              const tempPositions = [...(this.pointDatas.get(index) || [])].map(
                                  (item) => {
                                      return JSON.parse(item);
                                  }
                              );
                              if (this.tempMovePosition.get(index)) {
                                  tempPositions.push(JSON.parse(this.tempMovePosition.get(index)!));
                              }
                              return new Cesium.PolygonHierarchy(
                                  tempPositions as Cesium.Cartesian3[]
                              );
                          }, false),
                          material: new Cesium.ColorMaterialProperty(
                              Cesium.Color.YELLOW.withAlpha(0.3)
                          ),
                          classificationType: Cesium.ClassificationType.BOTH,
                          ...this.state.options?.polygon,
                      }
                    : {},
            position: JSON.parse(this.tempMovePosition.get(index)!) as Cesium.Cartesian3,
            label: {
                text: `${(this.state.options?.name ?? '面') + index}`,
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
                    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                    verticalOrigin: Cesium.VerticalOrigin.CENTER,
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
                    fillColor: Cesium.Color.WHITE,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 2,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    showBackground: true,
                    verticalOrigin: Cesium.VerticalOrigin.TOP,
                    pixelOffset: new Cesium.Cartesian2(0, 20),
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                    ...this.state.options?.label,
                },
            })
        );
    }

    create(id: string | number, positions: Points[], options: CreatePrimitiveOptions) {
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
                this.drawPointPrimitive(index, id, cartesianPositions, options);
                break;
            case DrawingTypeEnum.POLYLINE:
                this.drawingPolylinePrimitive(index, id, cartesianPositions, options);
                break;
            case DrawingTypeEnum.POLYGON:
                this.drawingPolygonPrimitive(index, id, cartesianPositions, options);
                break;
            case DrawingTypeEnum.POLYGON_AND_POLYLINE:
                this.drawingPolylinePolygonPrimitive(index, id, cartesianPositions, options);
                break;
            case DrawingTypeEnum.BILLBOARD:
                this.drawingBillboardPrimitive(index, id, cartesianPositions, options);
                break;
            case DrawingTypeEnum.LABEL:
                this.drawingLabelPrimitive(index, id, cartesianPositions, options);
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

    drawPointPrimitive(
        index: number,
        id: number | string,
        cartesianPositions: Cesium.Cartesian3[],
        options: CreatePrimitiveOptions
    ) {
        this.clearAllEntity(index);

        if (options.point?.showLabel) {
            this.drawingLabelPrimitive(index, id, cartesianPositions, options);
        }

        cartesianPositions.forEach((point: Cesium.Cartesian3) => {
            this.collection.locationPoint.add({
                id,
                position: point,
                color: Cesium.Color.RED,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 1,
                pixelSize: 8,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                ...options.point,
            });
        });
    }

    drawingPolylinePrimitive(
        index: number,
        id: number | string,
        cartesianPositions: Cesium.Cartesian3[],
        options: CreatePrimitiveOptions
    ) {
        this.clearAllEntity(index);

        if (options.polyline?.showLabel) {
            this.drawingLabelPrimitive(index, id, [cartesianPositions[0]], options);
        }

        const instance = new Cesium.GeometryInstance({
            id,
            geometry: new Cesium.GroundPolylineGeometry({
                positions: cartesianPositions,
                loop: true,
                width: options.polyline?.width ?? 4.0,
            }),
            attributes: {
                color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                    options.polyline?.color ?? Cesium.Color.CHARTREUSE.withAlpha(0.8)
                ),
            },
        });

        const linePrimitive = new Cesium.GroundPolylinePrimitive({
            geometryInstances: instance,
            appearance: new Cesium.PolylineColorAppearance(),
        });

        this.viewer.scene.groundPrimitives.add(linePrimitive);
    }

    drawingPolygonPrimitive(
        index: number,
        id: number | string,
        cartesianPositions: Cesium.Cartesian3[],
        options: CreatePrimitiveOptions
    ) {
        this.clearAllEntity(index);

        if (options.polygon?.showLabel) {
            this.drawingLabelPrimitive(index, id, [cartesianPositions[0]], options);
        }

        const polygon = new Cesium.GeometryInstance({
            geometry: new Cesium.PolygonGeometry({
                polygonHierarchy: new Cesium.PolygonHierarchy(cartesianPositions),
            }),
            id,
        });

        const polygonAppearance = new Cesium.MaterialAppearance({
            material: Cesium.Material.fromType('Color', {
                color: options.polygon?.color ?? Cesium.Color.YELLOW.withAlpha(0.3),
            }),
            faceForward: true,
        });

        const addPolygonGroundPrimitive = new Cesium.GroundPrimitive({
            //贴地面
            geometryInstances: polygon,
            appearance: polygonAppearance,
        });

        this.viewer.scene.primitives.add(addPolygonGroundPrimitive);
    }

    drawingPolylinePolygonPrimitive(
        index: number,
        id: number | string,
        cartesianPositions: Cesium.Cartesian3[],
        options: CreatePrimitiveOptions
    ) {
        this.clearAllEntity(index);

        if (options.polylinPolygon?.showLabel) {
            this.drawingLabelPrimitive(index, id, [cartesianPositions[0]], options);
        }

        const instance = new Cesium.GeometryInstance({
            id,
            geometry: new Cesium.GroundPolylineGeometry({
                positions: cartesianPositions,
                loop: true,
                width: options.polyline?.width ?? 4.0,
            }),
            attributes: {
                color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                    options.polyline?.color ?? Cesium.Color.CHARTREUSE.withAlpha(0.8)
                ),
            },
        });

        const linePrimitive = new Cesium.GroundPolylinePrimitive({
            geometryInstances: instance,
            appearance: new Cesium.PolylineColorAppearance(),
        });

        this.viewer.scene.groundPrimitives.add(linePrimitive);

        const polygon = new Cesium.GeometryInstance({
            geometry: new Cesium.PolygonGeometry({
                polygonHierarchy: new Cesium.PolygonHierarchy(cartesianPositions),
            }),
            id,
        });

        const polygonAppearance = new Cesium.MaterialAppearance({
            material: Cesium.Material.fromType('Color', {
                color: options.polygon?.color ?? Cesium.Color.YELLOW.withAlpha(0.3),
            }),
            faceForward: true,
        });

        const addPolygonGroundPrimitive = new Cesium.GroundPrimitive({
            //贴地面
            geometryInstances: polygon,
            appearance: polygonAppearance,
        });

        this.viewer.scene.primitives.add(addPolygonGroundPrimitive);
    }

    drawingBillboardPrimitive(
        index: number,
        id: number | string,
        cartesianPositions: Cesium.Cartesian3[],
        options: CreatePrimitiveOptions
    ) {
        this.clearAllEntity(index);

        if (options.billboard?.showLabel) {
            this.drawingLabelPrimitive(index, id, [cartesianPositions[0]], options);
        }

        cartesianPositions.forEach((point: Cesium.Cartesian3) => {
            this.collection.locationBillbord.add({
                id,
                position: point,
                image: '/public/resources/images/特征点_选中.png',
                width: 24,
                height: 24,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                ...options?.billboard,
            });
        });
    }

    drawingLabelPrimitive(
        index: number,
        id: number | string,
        cartesianPositions: Cesium.Cartesian3[],
        options: CreatePrimitiveOptions
    ) {
        this.clearAllEntity(index);

        cartesianPositions.forEach((point: Cesium.Cartesian3) => {
            this.collection.locationLabel.add({
                id,
                position: point,
                text: `Point`,
                font: '14px sans-serif',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                showBackground: true,
                verticalOrigin: Cesium.VerticalOrigin.TOP,
                pixelOffset: new Cesium.Cartesian2(-12, -35),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                ...options?.label,
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

    edit(
        id: number | string,
        viewer: Cesium.Viewer,
        options: EditPrimitiveOptions // Partial<Options> 全部设为可选 Omit<Options, 'type'> & Partial<Pick<Options, 'type'>>
    ) {
        let isEdited = false;
        const primitivesLength = viewer.scene.primitives.length;
        const groundPrimitivesLength = viewer.scene.groundPrimitives.length;

        try {
            for (let i = 0; i < primitivesLength; i++) {
                const primitive = viewer.scene.primitives.get(i);
                if (primitive instanceof Cesium.BillboardCollection) {
                    for (let j = 0; j < primitive.length; j++) {
                        const curBillboard = primitive.get(j);
                        // eslint-disable-next-line max-depth
                        if (curBillboard.id === id && options?.billboard) {
                            Object.assign(curBillboard, options?.billboard);
                            isEdited = true;
                        }
                    }
                }

                if (primitive instanceof Cesium.LabelCollection) {
                    for (let j = 0; j < primitive.length; j++) {
                        const curLabel = primitive.get(j);
                        console.log('Found label primitive with id:', curLabel.id);
                        // eslint-disable-next-line max-depth
                        if (curLabel.id === id && options.label) {
                            Object.assign(curLabel, options.label);
                            isEdited = true;
                        }
                    }
                }

                if (primitive instanceof Cesium.PointPrimitiveCollection) {
                    for (let j = 0; j < primitive.length; j++) {
                        const curPoint = primitive.get(j);
                        // eslint-disable-next-line max-depth
                        if (curPoint.id === id && options?.point) {
                            Object.assign(curPoint, options?.point);
                            isEdited = true;
                        }
                    }
                }

                if (
                    primitive instanceof Cesium.GroundPrimitive &&
                    primitive._boundingSpheresKeys[0] === id &&
                    options?.polygon
                ) {
                    // eslint-disable-next-line max-depth
                    primitive.appearance.material = Cesium.Material.fromType('Color', {
                        color: options?.polygon?.color
                            ? options?.polygon.color
                            : Cesium.Color.RED.withAlpha(0.5),
                    });
                }
            }

            for (let i = 0; i < groundPrimitivesLength; i++) {
                const primitive = viewer.scene.groundPrimitives.get(i);

                if (
                    primitive instanceof Cesium.GroundPolylinePrimitive &&
                    primitive._primitiveOptions.geometryInstances[0].id === id &&
                    options?.polyline
                ) {
                    console.log('Found polyline primitive with id:', id);

                    // 获取旧的实例
                    const oldInstance = primitive._primitiveOptions.geometryInstances[0];

                    // 创建一个新的颜色
                    const newColor = options?.polyline?.color
                        ? options.polyline.color
                        : Cesium.Color.CHARTREUSE.withAlpha(0.8);

                    // 创建新的实例
                    const newInstance = new Cesium.GeometryInstance({
                        geometry: oldInstance.geometry,
                        attributes: {
                            color: Cesium.ColorGeometryInstanceAttribute.fromColor(newColor),
                        },
                        id: oldInstance.id,
                    });
                    newInstance.geometry.width = options.polyline?.width ?? 4.0;

                    // 创建新的线条 primitive
                    const newLinePrimitive = new Cesium.GroundPolylinePrimitive({
                        geometryInstances: newInstance,
                        appearance: new Cesium.PolylineColorAppearance(),
                    });

                    // 移除旧的 primitive
                    viewer.scene.groundPrimitives.remove(primitive);

                    // 添加新的 primitive
                    viewer.scene.groundPrimitives.add(newLinePrimitive);

                    // 请求重新渲染
                    viewer.scene.requestRender();
                }
            }

            if (isEdited) {
                this.dispatch('cesiumToolsFxt', {
                    type: options?.type + 'Edit',
                    status: 'finished',
                    id: id,
                });
            } else {
                this.dispatch('cesiumToolsFxt', {
                    type: options?.type + 'Edit',
                    status: 'failed',
                    reason: 'No matching primitive found',
                });
            }
        } catch (error) {
            this.dispatch('cesiumToolsFxt', {
                type: options?.type + 'Edit',
                status: 'failed',
                reason: error,
            });
        }
    }
}
