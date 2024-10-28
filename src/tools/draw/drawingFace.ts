import * as Cesium from 'cesium';
import MouseEvent from '../mouseBase/mouseBase';
import { EventCallback } from '../../type/type';
import { DrawingTypeEnum } from '@src/enum/enum';

type LatLng = {
    latitude: number;
    longitude: number;
    height?: number;
};

export default class DrawingFace extends MouseEvent {
    protected viewer: Cesium.Viewer;
    protected handler: Cesium.ScreenSpaceEventHandler;
    private labelCollection: Cesium.LabelCollection;
    private pointPrimitiveCollection: Cesium.PointPrimitiveCollection;
    private polygonLineEntity: { [key: number]: Cesium.Entity | undefined };
    private curClickIndex: number;
    private position3dAry: { [key: number]: Cesium.Cartesian3[] };
    private tempMovePosition: { [key: number]: Cesium.Cartesian3 };
    private initSetting: {
        type?: 'polygon' | 'line';
        lineColor?: Cesium.Color;
        polygonColor?: Cesium.Color;
        lineWidth?: number;
        name?: string;
    };

    constructor(viewer: Cesium.Viewer, handler: Cesium.ScreenSpaceEventHandler) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
        this.labelCollection = this.viewer.scene.primitives.add(new Cesium.LabelCollection());
        this.pointPrimitiveCollection = this.viewer.scene.primitives.add(
            new Cesium.PointPrimitiveCollection()
        );
        this.curClickIndex = 1;
        this.position3dAry = {};
        this.tempMovePosition = {};
        this.polygonLineEntity = {};
        this.initSetting = {};
    }

    active(options?: {
        type: 'polygon' | 'line';
        lineColor?: Cesium.Color;
        polygonColor?: Cesium.Color;
        width?: number;
    }): void {
        if (options) {
            this.initSetting = options;
        }
        this.registerEvents();
    }

    deactivate(): void {
        this.clear();
        this.unRegisterEvents();
    }

    clear(): void {
        Object.entries(this.polygonLineEntity)?.forEach(([key, value]) => {
            value && this.viewer.entities.remove(value);
        });
        this.pointPrimitiveCollection.removeAll();
        this.curClickIndex = 1;
        this.position3dAry = {};
        this.tempMovePosition = {};
        this.polygonLineEntity = {};
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
            if (typeof this.position3dAry[this.curClickIndex] !== 'object') {
                this.position3dAry[this.curClickIndex] = [];
            }
            this.position3dAry[this.curClickIndex].push(currentPosition);

            this.createPoint(currentPosition);
            this.createPolygonLine();
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    protected rightClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            if (this.position3dAry[this.curClickIndex].length < 2) return;

            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition || !Cesium.defined(currentPosition)) return;

            this.position3dAry[this.curClickIndex].push(currentPosition);

            this.createPoint(currentPosition);
            this.curClickIndex = this.curClickIndex + 1;

            this.dispatch('cesiumToolsFxt', {
                type: DrawingTypeEnum.face + 'Drawing',
                status: 'finished',
                position: this.position3dAry[this.curClickIndex - 1],
            });
            console.log(JSON.parse(JSON.stringify(this.position3dAry[this.curClickIndex - 1])));

            this.unRegisterEvents();
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    protected mouseMoveEvent(): void {
        this.handler.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
            const currentPosition = this.viewer.scene.pickPosition(e.endPosition);
            if (!currentPosition || !Cesium.defined(currentPosition)) return;

            this.tempMovePosition[this.curClickIndex] = currentPosition;
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }

    private createPoint(position: Cesium.Cartesian3) {
        this.pointPrimitiveCollection.add({
            position,
            color: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            pixelSize: 8,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
    }

    private createPolygonLine() {
        const index = this.curClickIndex;
        const polygonColor = this.initSetting?.polygonColor ?? Cesium.Color.YELLOW.withAlpha(0.3);
        const lineColor = this.initSetting?.lineColor ?? Cesium.Color.CHARTREUSE;
        if (!this.polygonLineEntity[index]) {
            this.polygonLineEntity[index] = this.viewer.entities.add({
                id: String(index),
                polygon:
                    this.initSetting.type !== 'line'
                        ? {
                              hierarchy: new Cesium.CallbackProperty(() => {
                                  const tempPositions = [...this.position3dAry[index]];
                                  if (this.tempMovePosition[index]) {
                                      tempPositions.push(this.tempMovePosition[index]);
                                  }
                                  return new Cesium.PolygonHierarchy(tempPositions);
                              }, false),
                              material: new Cesium.ColorMaterialProperty(polygonColor),
                              classificationType: Cesium.ClassificationType.BOTH,
                          }
                        : {},
                position: this.tempMovePosition[index],
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
                },
                polyline:
                    this.initSetting.type !== 'polygon'
                        ? {
                              positions: new Cesium.CallbackProperty(() => {
                                  const tempPositions = [...this.position3dAry[index]];
                                  if (this.tempMovePosition[index]) {
                                      tempPositions.push(this.tempMovePosition[index]);
                                      tempPositions.push(tempPositions[0]);
                                  }
                                  return tempPositions;
                              }, false),
                              width: this.initSetting?.lineWidth ?? 2,
                              material: new Cesium.ColorMaterialProperty(lineColor),
                              depthFailMaterial: new Cesium.ColorMaterialProperty(lineColor),
                              // 是否贴地
                              clampToGround: true,
                          }
                        : {},
            });
        }
    }

    create(
        position: Cesium.Cartesian3 | Cesium.Cartesian3[] | LatLng[],
        options?: {
            id: string | number;
            type: 'polygon' | 'line' | 'both';
            lineColor?: Cesium.Color;
            polygonColor?: Cesium.Color;
            width?: number;
            label?: Partial<Cesium.Billboard.ConstructorOptions> & { [key: string]: unknown };
        }
    ) {
        // 检查是否有足够的点
        if ((position as Cesium.Cartesian3[]).length < 2) {
            this.dispatch('cesiumToolsFxt', {
                type: DrawingTypeEnum.face + 'Create',
                status: 'failed',
                reason: 'At least two points required',
            });
            return;
        }

        // 去重
        const uniquePositions = Array.from(
            new Set(
                (position as Cesium.Cartesian3[]).map((pos) => {
                    return JSON.stringify(pos);
                })
            )
        ).map((pos) => {
            return JSON.parse(pos);
        });

        // 再次检查去重后的长度
        if (uniquePositions.length < 2) {
            this.dispatch('cesiumToolsFxt', {
                type: DrawingTypeEnum.face + 'Create',
                status: 'failed',
                reason: 'At least two unique points required',
            });
            return;
        }

        /**
         * TODO: 如果是经纬度将经纬度转为笛卡尔坐标
         */
        const cartesianPositions =
            Array.isArray(uniquePositions) &&
            uniquePositions[0] &&
            typeof uniquePositions[0] === 'object' &&
            'latitude' in uniquePositions[0]
                ? this.convertLatLngToCartesian(uniquePositions as LatLng[])
                : (uniquePositions as Cesium.Cartesian3[]);

        try {
            // 根据 type 参数绘制不同的内容
            if (options?.type === 'polygon') {
                this.drawLabel(cartesianPositions, options);
                this.drawPolygon(cartesianPositions, options.id, options?.polygonColor);
            }

            if (options?.type === 'line') {
                this.drawLabel(cartesianPositions, options);
                this.drawLine(cartesianPositions, options.id, options?.width, options?.lineColor);
            }

            if (options?.type === 'both') {
                this.drawLabel(cartesianPositions, options);
                this.drawLine(cartesianPositions, options.id, options?.width, options?.lineColor);
                this.drawPolygon(cartesianPositions, options.id, options?.polygonColor);
            }
        } catch (error) {
            console.error('Error creating shapes:', error);
            this.dispatch('cesiumToolsFxt', {
                type: DrawingTypeEnum.face + 'Create',
                status: 'failed',
                reason: error,
            });
        }
    }
    calculatePolygonCenter(positions: Cesium.Cartesian3[]): Cesium.Cartesian3 {
        const center = new Cesium.Cartesian3();
        for (const position of positions) {
            Cesium.Cartesian3.add(center, position, center);
        }
        return Cesium.Cartesian3.multiplyByScalar(
            center,
            1 / positions.length,
            new Cesium.Cartesian3()
        );
    }

    private drawLabel(
        position: Cesium.Cartesian3[],
        options?: {
            id: string | number;
            label?: Partial<Cesium.Billboard.ConstructorOptions> & { [key: string]: unknown };
        }
    ) {
        this.labelCollection.add({
            id: options?.id,
            position: position[0],
            text: `Face`,
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
    }

    private drawPolygon(
        positions: Cesium.Cartesian3[],
        id: string | number,
        color: Cesium.Color | undefined
    ) {
        const polygon = new Cesium.GeometryInstance({
            geometry: new Cesium.PolygonGeometry({
                polygonHierarchy: new Cesium.PolygonHierarchy(positions),
            }),
            id,
        });

        const polygonAppearance = new Cesium.MaterialAppearance({
            material: Cesium.Material.fromType('Color', {
                color: color ?? Cesium.Color.YELLOW.withAlpha(0.3),
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

    private drawLine(
        positions: Cesium.Cartesian3[],
        id: string | number,
        width: number | undefined,
        color: Cesium.Color | undefined
    ) {
        const lineColor = color ?? Cesium.Color.CHARTREUSE.withAlpha(0.8);
        const instance = new Cesium.GeometryInstance({
            geometry: new Cesium.GroundPolylineGeometry({
                positions: positions,
                loop: true,
                width: width ?? 4.0,
            }),
            attributes: {
                color: Cesium.ColorGeometryInstanceAttribute.fromColor(lineColor),
            },
            id,
        });

        const linePrimitive = new Cesium.GroundPolylinePrimitive({
            geometryInstances: instance,
            appearance: new Cesium.PolylineColorAppearance(),
        });

        this.viewer.scene.groundPrimitives.add(linePrimitive);
    }

    private convertLatLngToCartesian(latLngs: LatLng[]): Cesium.Cartesian3[] {
        const cartesianPositions = latLngs.map((pos) => {
            return Cesium.Cartesian3.fromDegrees(pos.longitude, pos.latitude, pos?.height ?? 0);
        });
        return cartesianPositions;
    }

    edit(
        id: number | string,
        viewer: Cesium.Viewer,
        options: {
            id?: number | string;
            label?: Partial<Cesium.Billboard.ConstructorOptions> & { [key: string]: unknown };
            polygon?: Partial<Cesium.PolygonGraphics> & { [key: string]: unknown };
            polyline?: Partial<Cesium.PolylineGraphics> & { [key: string]: unknown };
            billboard?: Partial<Cesium.Billboard.ConstructorOptions> & { [key: string]: unknown };
        }
    ) {
        let isEdited = false;
        if (!id) {
            const index = String(this.curClickIndex - 1);
            const polygonLineEntity = this.viewer.entities.getById(index);

            if (polygonLineEntity?.label) {
                Object.assign(polygonLineEntity.label, options.label);
                isEdited = true;
            }

            if (polygonLineEntity?.polyline) {
                Object.assign(polygonLineEntity.polyline, options.polyline);
                isEdited = true;
            }

            if (polygonLineEntity?.polygon) {
                Object.assign(polygonLineEntity.polygon, options.polygon);
                isEdited = true;
            }
        } else {
            const primitivesLength = viewer.scene.primitives.length;
            const groundPrimitivesLength = viewer.scene.groundPrimitives.length;
            for (let i = 0; i < primitivesLength; i++) {
                const primitive = viewer.scene.primitives.get(i);
                if (primitive instanceof Cesium.BillboardCollection) {
                    for (let j = 0; j < primitive.length; j++) {
                        const curBillboard = primitive.get(j);
                        // eslint-disable-next-line max-depth
                        if (curBillboard.id === id && options.billboard) {
                            Object.assign(curBillboard, options.billboard);
                            isEdited = true;
                        }
                    }
                }

                if (primitive instanceof Cesium.LabelCollection) {
                    for (let j = 0; j < primitive.length; j++) {
                        const curLabel = primitive.get(j);
                        // eslint-disable-next-line max-depth
                        if (curLabel.id === id && options.label) {
                            Object.assign(curLabel, options.label);
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
        }

        if (isEdited) {
            this.dispatch('cesiumToolsFxt', {
                type: DrawingTypeEnum.face + 'Edit',
                status: 'finished',
                id: id,
            });
        } else {
            this.dispatch('cesiumToolsFxt', {
                type: DrawingTypeEnum.face + 'Edit',
                status: 'failed',
                reason: 'No matching primitive found',
            });
        }
    }
}
