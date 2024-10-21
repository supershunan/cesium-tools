import * as Cesium from 'cesium';
import MouseEvent from '../mouseBase/mouseBase';
import { EventCallback } from '../../type/type';
import { DrawingTypeEnum } from '@src/enum/enum';

type LatLng = {
    latitude: number;
    longitude: number;
};

export default class DrawingFace extends MouseEvent {
    protected viewer: Cesium.Viewer;
    protected handler: Cesium.ScreenSpaceEventHandler;
    private pointPrimitiveCollection: Cesium.PointPrimitiveCollection;
    private polygonEntity: Cesium.Entity | undefined;
    private curClickIndex: number;
    private polylineEntity: Cesium.Entity | undefined;
    private position3dAry: { [key: number]: Cesium.Cartesian3[] };
    private tempMovePosition: { [key: number]: Cesium.Cartesian3 };
    private initSetting: {
        type?: 'polygon' | 'line';
        lineColor?: Cesium.Color;
        polygonColor?: Cesium.Color;
        lineWidth?: number;
    };

    constructor(viewer: Cesium.Viewer, handler: Cesium.ScreenSpaceEventHandler) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
        this.pointPrimitiveCollection = this.viewer.scene.primitives.add(
            new Cesium.PointPrimitiveCollection()
        );
        this.curClickIndex = 1;
        this.position3dAry = {};
        this.tempMovePosition = {};
        this.polygonEntity = undefined;
        this.polylineEntity = undefined;
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
        this.curClickIndex = 1;
        this.position3dAry = {};
        this.tempMovePosition = {};
        this.polygonEntity = undefined;
        this.polylineEntity = undefined;
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
            if (this.initSetting.type === 'line') {
                this.createPolyline();
            } else if (this.initSetting.type === 'polygon') {
                this.createPolygon();
            } else {
                this.createPolygon();
                this.createPolyline();
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    protected rightClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            if (this.position3dAry[this.curClickIndex].length < 2) return;

            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition || !Cesium.defined(currentPosition)) return;

            this.position3dAry[this.curClickIndex].push(currentPosition);

            this.createPoint(currentPosition);
            this.polylineEntity = undefined;
            this.polygonEntity = undefined;
            this.curClickIndex = this.curClickIndex + 1;

            this.dispatch('cesiumToolsFxt', {
                type: DrawingTypeEnum.face + 'Drawing',
                status: 'finished',
                position: this.position3dAry[this.curClickIndex - 1],
            });

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

    private createPolygon() {
        if (!this.polygonEntity) {
            const index = this.curClickIndex;
            const color = this.initSetting?.polygonColor ?? Cesium.Color.YELLOW.withAlpha(0.3);
            this.polygonEntity = this.viewer.entities.add({
                polygon: {
                    hierarchy: new Cesium.CallbackProperty(() => {
                        const tempPositions = [...this.position3dAry[index]];
                        if (this.tempMovePosition[index]) {
                            tempPositions.push(this.tempMovePosition[index]);
                        }
                        return new Cesium.PolygonHierarchy(tempPositions);
                    }, false),
                    material: new Cesium.ColorMaterialProperty(color),
                    classificationType: Cesium.ClassificationType.BOTH,
                },
            });
        }
    }

    private createPolyline() {
        if (!this.polylineEntity) {
            const index = this.curClickIndex;
            const color = this.initSetting?.lineColor ?? Cesium.Color.CHARTREUSE;
            this.polylineEntity = this.viewer.entities.add({
                polyline: {
                    positions: new Cesium.CallbackProperty(() => {
                        const tempPositions = [...this.position3dAry[index]];
                        if (this.tempMovePosition[index]) {
                            tempPositions.push(this.tempMovePosition[index]);
                            tempPositions.push(tempPositions[0]);
                        }
                        return tempPositions;
                    }, false),
                    width: this.initSetting?.lineWidth ?? 2,
                    material: new Cesium.ColorMaterialProperty(color),
                    depthFailMaterial: new Cesium.ColorMaterialProperty(color),
                    // 是否贴地
                    clampToGround: true,
                },
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
                this.drawPolygon(cartesianPositions, options.id, options?.polygonColor);
            }

            if (options?.type === 'line') {
                this.drawLine(cartesianPositions, options.id, options?.width, options?.lineColor);
            }

            if (options?.type === 'both') {
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

    private drawPolygon(
        positions: Cesium.Cartesian3[],
        id: string | number,
        color: Cesium.Color | undefined
    ) {
        //定义几何形状
        const polygon = new Cesium.GeometryInstance({
            geometry: new Cesium.PolygonGeometry({
                polygonHierarchy: new Cesium.PolygonHierarchy(positions),
            }),
            id,
        });
        //定义外观
        const polygonAppearance = new Cesium.MaterialAppearance({
            material: Cesium.Material.fromType('Color', {
                color: color ?? Cesium.Color.YELLOW.withAlpha(0.3),
            }),
            faceForward: true,
        });
        //创建GroundPrimitive
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
        const cartesianPositions: Cesium.Cartesian3[] = latLngs.map((latLng) => {
            const cartographic = Cesium.Cartographic.fromDegrees(latLng.longitude, latLng.latitude);
            return Cesium.Ellipsoid.WGS84.cartographicToCartesian(cartographic);
        });
        return cartesianPositions;
    }
}
