import * as Cesium from 'cesium';
import SloopAspectAnalysis from './slopeDerectiontAnalysis';
import MouseEvent from '../mouseBase/mouseBase';
import { ToolsEventTypeEnum } from '../../enum/enum';
import { EventCallback } from '../../type/type';

interface TerrainCoordinate {
    lng: number;
    lat: number;
    alt: number;
}
export default class Draw extends MouseEvent {
    protected viewer: Cesium.Viewer;
    handler: Cesium.ScreenSpaceEventHandler;
    /** 网格切割的精度 单位(km) 最小为20 精度越大越消耗性能 */
    distance: number;
    slopeAspectAnalysis?: SloopAspectAnalysis;
    private positionAry: Cesium.Cartesian3[] = [];
    private tempPositionAry: Cesium.Cartesian3 | undefined;
    private polygonEntity?: Cesium.Entity | undefined;
    private pointEntitys: Cesium.Entity[] = [];

    constructor(viewer: Cesium.Viewer, handler: Cesium.ScreenSpaceEventHandler) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
        this.distance = 20;
    }

    active(): void {
        this.deactivate();
        this.registerEvents();
    }

    deactivate(): void {
        this.clear();
        this.polygonEntity = undefined;
        this.positionAry = [];
        this.tempPositionAry = undefined;
        this.pointEntitys = [];
        this.unRegisterEvents();
    }

    clear(): void {
        this.slopeAspectAnalysis && this.slopeAspectAnalysis.clear();
        this.polygonEntity && this.viewer.entities.remove(this.polygonEntity);
        this.pointEntitys.length &&
            this.pointEntitys.forEach((entits) => {
                return this.viewer.entities.remove(entits);
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
            // 返回深度缓冲区和窗口位置重建的笛卡尔坐标
            const currentPosition = this.getCatesian3FromPX(this.viewer, e.position);
            if (!currentPosition) return;

            this.positionAry.push(currentPosition);
            this.createPoint(currentPosition);
            this.createPolygon();
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    protected rightClickEvent(): void {
        this.handler.setInputAction(() => {
            if (this.positionAry.length < 3) return;

            this.positionAry.push(this.positionAry[0]);
            this.dispatch('cesiumToolsFxt', {
                type: ToolsEventTypeEnum.slopDirectionAnalysis,
                status: 'finished',
            });
            this.unRegisterEvents();
            this.analysisPolygon();
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    protected mouseMoveEvent(): void {
        this.handler.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
            const currentPosition = this.getCatesian3FromPX(this.viewer, e.endPosition);
            if (!currentPosition) return;

            this.tempPositionAry = currentPosition;
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }

    protected analysisPolygon = () => {
        this.clear();
        if (this.polygonEntity) {
            this.slopeAspectAnalysis = new SloopAspectAnalysis(
                this.viewer,
                this.polygonEntity,
                this.distance,
                this.positionAry
            );
            this.slopeAspectAnalysis.add();
        }
    };

    protected createPolygon = () => {
        if (!this.polygonEntity) {
            this.polygonEntity = this.viewer.entities.add({
                polygon: {
                    hierarchy: new Cesium.CallbackProperty(() => {
                        const tempPositions = [...this.positionAry];
                        if (this.tempPositionAry) {
                            tempPositions.push(this.tempPositionAry);
                        }
                        return new Cesium.PolygonHierarchy(tempPositions);
                    }, false),
                    material: new Cesium.ColorMaterialProperty(Cesium.Color.YELLOW.withAlpha(0.5)),
                    outline: true,
                    outlineColor: Cesium.Color.BLACK,
                },
            });
        }
    };

    protected createPoint = (positon: Cesium.Cartesian3) => {
        const curentPointEntity = this.viewer.entities.add({
            position: positon,
            point: {
                pixelSize: 5,
                color: Cesium.Color.ORANGE,
                outlineWidth: 2,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: 99000000,
            },
        });

        this.pointEntitys.push(curentPointEntity);
    };

    protected getCatesian3FromPX = (
        viewer: Cesium.Viewer,
        px: Cesium.Cartesian2
    ): Cesium.Cartesian3 | null => {
        // 返回图元信息
        const picks = viewer.scene.drillPick(px);
        let cartesian = null;
        let isOn3dtiles = false,
            isOnTerrain = false;
        for (const i in picks) {
            const pick = picks[i];
            if (
                (pick && pick.primitive instanceof Cesium.Cesium3DTileFeature) ||
                (pick && pick.primitive instanceof Cesium.Cesium3DTileset) ||
                (pick && pick.primitive instanceof Cesium.Model)
            ) {
                //模型上拾取
                isOn3dtiles = true;
            }
            // 3dtilset
            if (isOn3dtiles) {
                viewer.scene.pick(px);
                cartesian = viewer.scene.pickPosition(px);
                if (cartesian) {
                    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                    if (cartographic.height < 0) cartographic.height = 0;
                    const lon = Cesium.Math.toDegrees(cartographic.longitude),
                        lat = Cesium.Math.toDegrees(cartographic.latitude),
                        height = cartographic.height;
                    cartesian = this.transformWGS84ToCartesian({
                        lng: lon,
                        lat: lat,
                        alt: height,
                    });
                }
            }
        }
        // 地形
        const boolTerrain = viewer.terrainProvider instanceof Cesium.EllipsoidTerrainProvider;
        // Terrain
        if (!isOn3dtiles && !boolTerrain) {
            const ray = viewer.scene.camera.getPickRay(px);
            if (!ray) return null;
            cartesian = viewer.scene.globe.pick(ray, viewer.scene);
            isOnTerrain = true;
        }
        // 地球
        if (!isOn3dtiles && !isOnTerrain && boolTerrain) {
            cartesian = viewer.scene.camera.pickEllipsoid(px, viewer.scene.globe.ellipsoid);
        }
        if (cartesian) {
            const position = this.transformCartesianToWGS84(cartesian);
            if (position.alt < 0) {
                cartesian = this.transformWGS84ToCartesian(position, 0.1);
            }
            return cartesian;
        }
        return null;
    };

    /***
     * 坐标转换 84转笛卡尔
     * @param position 地理坐标
     * @return 三维位置坐标
     */
    protected transformWGS84ToCartesian = (
        position: TerrainCoordinate,
        alt?: number
    ): Cesium.Cartesian3 => {
        return position
            ? Cesium.Cartesian3.fromDegrees(
                  position.lng,
                  position.lat,
                  (position.alt = alt || position.alt),
                  Cesium.Ellipsoid.WGS84
              )
            : Cesium.Cartesian3.ZERO;
    };

    /***
     * 坐标转换 笛卡尔转84
     * @param cartesian 三维位置坐标
     * @return 地理坐标
     */
    protected transformCartesianToWGS84 = (cartesian: Cesium.Cartesian3): TerrainCoordinate => {
        const ellipsoid = Cesium.Ellipsoid.WGS84;
        const cartographic = ellipsoid.cartesianToCartographic(cartesian);
        return {
            lng: Cesium.Math.toDegrees(cartographic.longitude),
            lat: Cesium.Math.toDegrees(cartographic.latitude),
            alt: cartographic.height,
        };
    };
}
