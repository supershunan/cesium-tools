import * as Cesium from 'cesium';
import MouseEvent from '../mouseBase/mouseBase';
import { EventCallback } from '../../type/type';

enum DrawingTypeEnum {
    /** 点 */
    POINT,
    /** 线 */
    POLYLINE,
    /** 面 */
    POLYGON,
    /** 线与面 */
    POLYGON_AND_POLYLINE,
    /** 广告牌 */
    BILLBOARD,
    /** 标签 */
    LABEL,
}

type LatLng = {
    latitude: number;
    longitude: number;
    height?: number;
};

type Points = Cesium.Cartesian3 | LatLng;

type Options = {
    type: DrawingTypeEnum;
    point?: any | { showBillboards?: boolean; showLabel?: boolean };
    polyline?:
        | Cesium.Entity.ConstructorOptions
        | { width: number; color: Cesium.Color; showBillboards?: boolean; showLabel?: boolean };
    polygon?:
        | Cesium.Entity.ConstructorOptions
        | { color: Cesium.Color; showBillboards?: boolean; showLabel?: boolean };
    billboard?: Cesium.Entity.ConstructorOptions | Cesium.Billboard.ConstructorOptions;
    label?: Cesium.Entity.ConstructorOptions | Cesium.Label.ConstructorOptions;
};

export default class DrawingPrimtives extends MouseEvent {
    protected viewer: Cesium.Viewer;
    protected handler: Cesium.ScreenSpaceEventHandler;
    private locationPoint: Cesium.PointPrimitiveCollection;
    private locationBillbord: Cesium.BillboardCollection;
    private locationLabel: Cesium.LabelCollection;
    private locationPolyline: Cesium.PointPrimitiveCollection;
    private drawingPolygon: { [key: number]: Cesium.Entity | undefined };
    private drawingType: DrawingTypeEnum;
    private options: Options | null;
    private curSort: number;
    private pointDatas: { [key: number]: Points[] };
    private tempMovePosition: { [key: number]: Points };
    private pointEntitys: { [key: number]: Cesium.Entity[] };
    private polylinPolygonEntitys: { [key: number]: Cesium.Entity | undefined };
    private billboardEntity: { [key: number]: Cesium.Entity[] };
    private labelEntity: { [key: number]: Cesium.Entity[] };

    constructor(viewer: Cesium.Viewer, handler: Cesium.ScreenSpaceEventHandler) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
        this.locationPoint = this.viewer.scene.primitives.add(
            new Cesium.PointPrimitiveCollection()
        );
        this.locationBillbord = this.viewer.scene.primitives.add(new Cesium.BillboardCollection());
        this.locationLabel = this.viewer.scene.primitives.add(new Cesium.LabelCollection());
        this.options = null;
        this.curSort = 0;
        this.pointDatas = {};
        this.tempMovePosition = {};
        this.pointEntitys = {};
        this.polylinPolygonEntitys = {};
        this.billboardEntity = {};
        this.labelEntity = {};
    }

    active(options?: Options): void {
        if (options && Object.keys(options).length > 0) {
            this.drawingType = options.type;
            this.options = options;
        }

        this.registerEvents();
    }

    deactivate(): void {
        this.clear();
        this.unRegisterEvents();
    }

    clear(): void {}

    ddToolsEventListener<T>(eventName: string, callback: EventCallback<T>) {
        this.addEventListener(eventName, callback);
    }

    removeToolsEventListener<T>(eventName: string, callback?: EventCallback<T>) {
        this.removeEventListener(eventName, callback);
    }

    protected leftClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition || !Cesium.defined(currentPosition)) return;

            const index = this.curSort;
            if (!this.pointDatas[index]) {
                this.pointDatas[index] = [];
            }
            this.pointDatas[index].push(currentPosition);
            this.drawing(currentPosition, this.drawingType);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    protected rightClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            const index = this.curSort;
            const isPolygon =
                this.drawingType === DrawingTypeEnum.POLYGON ||
                this.drawingType === DrawingTypeEnum.POLYLINE ||
                this.drawingType === DrawingTypeEnum.POLYGON_AND_POLYLINE;

            if (isPolygon && this.pointDatas[index].length < 2) return;

            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition || !Cesium.defined(currentPosition)) return;

            this.pointDatas[index].push(currentPosition);

            this.drawing(currentPosition, this.drawingType);
            this.create('wkkk', this.pointDatas[index], {
                type: this.drawingType,
                point: {
                    showLabel: true,
                    color: Cesium.Color.GREEN,
                },
                label: { text: 'successfully', pixelOffset: new Cesium.Cartesian2(-20, -35) },
            });
            this.curSort = index + 1;

            this.unRegisterEvents();
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    protected mouseMoveEvent(): void {
        this.handler.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
            const currentPosition = this.viewer.scene.pickPosition(e.endPosition);
            if (!currentPosition || !Cesium.defined(currentPosition)) return;

            const index = this.curSort;
            this.tempMovePosition[index] = currentPosition;
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }

    drawing(position: Points, type: DrawingTypeEnum): void {
        const index = this.curSort;
        switch (type) {
            case DrawingTypeEnum.POINT:
                this.drawingPointEntity(position, index);
                break;
            case DrawingTypeEnum.POLYLINE:
                this.drawingPointEntity(position, index);
                if (!this.polylinPolygonEntitys[index]) {
                    this.drawingPolylinEntity(index, type);
                }
                break;
            case DrawingTypeEnum.POLYGON:
                this.drawingPointEntity(position, index);
                if (!this.polylinPolygonEntitys[index]) {
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
                this.drawingLableEntity(position, index);
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
                    ...this.options?.point,
                },
            })
        );
    }

    drawingPolylinEntity(index: number, type: DrawingTypeEnum): void {
        if (this.polylinPolygonEntitys[index]) return;
        this.polylinPolygonEntitys[index] = this.viewer.entities.add({
            polyline:
                type !== DrawingTypeEnum.POLYGON
                    ? {
                          positions: new Cesium.CallbackProperty(() => {
                              const tempPositions = [...(this.pointDatas[index] || [])];
                              if (this.tempMovePosition[index]) {
                                  tempPositions.push(this.tempMovePosition[index]);
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
                          ...this.options?.polyline,
                      }
                    : {},
            polygon:
                type !== DrawingTypeEnum.POLYLINE
                    ? {
                          hierarchy: new Cesium.CallbackProperty(() => {
                              const tempPositions = [...(this.pointDatas[index] || [])];
                              if (this.tempMovePosition[index]) {
                                  tempPositions.push(this.tempMovePosition[index]);
                              }
                              return new Cesium.PolygonHierarchy(
                                  tempPositions as Cesium.Cartesian3[]
                              );
                          }, false),
                          material: new Cesium.ColorMaterialProperty(
                              Cesium.Color.YELLOW.withAlpha(0.3)
                          ),
                          classificationType: Cesium.ClassificationType.BOTH,
                          ...this.options?.polygon,
                      }
                    : {},
            position: this.tempMovePosition[index] as Cesium.Cartesian3,
            label: {
                text: `${(this.initSetting?.name ?? '面') + index}`,
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
                ...this.options?.label,
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
                    ...this.options?.billboard,
                },
            })
        );
    }

    drawingLableEntity(position: Points, index: number): void {
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
                    ...this.options?.label,
                },
            })
        );
    }

    create(id: string | number, positions: Points[], options: Options) {
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

        const index = this.curSort;

        switch (options.type) {
            case DrawingTypeEnum.POINT:
                this.drawPointPrimitive(index, id, cartesianPositions, options);
                break;
            case DrawingTypeEnum.POLYLINE:
                this.drawingPolylinePrimitive(index, id, cartesianPositions, options);
                break;
            case DrawingTypeEnum.POLYGON:
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
        options: Options
    ) {
        if (this.pointEntitys[index]) {
            this.pointEntitys[index].forEach((entity) => {
                this.viewer.entities.remove(entity);
            });
            delete this.pointEntitys[index];
            if (this.curSort > -1) {
                this.curSort = this.curSort - 1;
            }
        }

        cartesianPositions.forEach((point: Cesium.Cartesian3) => {
            this.locationPoint.add({
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

        if (options.point?.showLabel) {
            this.drawingLabelPrimitive(index, id, cartesianPositions, options);
        }
    }

    drawingPolylinePrimitive(
        index: number,
        id: number | string,
        cartesianPositions: Cesium.Cartesian3[],
        options: Options
    ) {
        if (this.polylinPolygonEntitys[index]) {
            this.viewer.entities.remove(this.polylinPolygonEntitys[index]);
            delete this.polylinPolygonEntitys[index];
            if (this.curSort > -1) {
                this.curSort = this.curSort - 1;
            }
        }

        if (this.pointEntitys[index]) {
            this.pointEntitys[index].forEach((entity) => {
                this.viewer.entities.remove(entity);
            });
            delete this.pointEntitys[index];
            if (this.curSort > -1) {
                this.curSort = this.curSort - 1;
            }
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
        options: Options
    ) {
        if (this.polylinPolygonEntitys[index]) {
            this.viewer.entities.remove(this.polylinPolygonEntitys[index]);
            delete this.polylinPolygonEntitys[index];
            if (this.curSort > -1) {
                this.curSort = this.curSort - 1;
            }
        }

        if (this.pointEntitys[index]) {
            this.pointEntitys[index].forEach((entity) => {
                this.viewer.entities.remove(entity);
            });
            delete this.pointEntitys[index];
            if (this.curSort > -1) {
                this.curSort = this.curSort - 1;
            }
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
        options: Options
    ) {
        if (this.polylinPolygonEntitys[index]) {
            this.viewer.entities.remove(this.polylinPolygonEntitys[index]);
            delete this.polylinPolygonEntitys[index];
            if (this.curSort > -1) {
                this.curSort = this.curSort - 1;
            }
        }

        if (this.pointEntitys[index]) {
            this.pointEntitys[index].forEach((entity) => {
                this.viewer.entities.remove(entity);
            });
            delete this.pointEntitys[index];
            if (this.curSort > -1) {
                this.curSort = this.curSort - 1;
            }
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
        options: Options
    ) {
        this.billboardEntity[index].forEach((entity) => {
            this.viewer.entities.remove(entity);
            delete this.billboardEntity[index];
            if (this.curSort > -1) {
                this.curSort = this.curSort - 1;
            }
        });

        cartesianPositions.forEach((point: Cesium.Cartesian3) => {
            this.locationBillbord.add({
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
        options: Options
    ) {
        this.labelEntity[index]?.forEach((entity) => {
            this.viewer.entities.remove(entity);
            delete this.labelEntity[index];
            if (this.curSort > -1) {
                this.curSort = this.curSort - 1;
            }
        });

        cartesianPositions.forEach((point: Cesium.Cartesian3) => {
            this.locationLabel.add({
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
}
