import * as Cesium from 'cesium';
import MouseEvent from '../mouseBase/mouseBase';
import {
    computeDelaunayTerrainSurfaceArea,
    computeEllipsoidalPolygonArea,
    DEFAULT_TERRAIN_SAMPLE_STEP_METERS,
    type TerrainSurfaceSamplePoint,
} from './new-compute';
import { MouseStatusEnum } from '../../enum/enum';
import { EventCallback } from '../../type/type';
import type { AreaActiveOptions } from '.';

export default class AreaMeasurement extends MouseEvent {
    // 1、核心属性
    protected readonly viewer: Cesium.Viewer;
    protected readonly handler: Cesium.ScreenSpaceEventHandler;
    protected readonly cesium: typeof Cesium;

    // 2、集合管理
    private options?: AreaActiveOptions;

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
    private terrainSamplePoints = new Map<number, TerrainSurfaceSamplePoint[]>();
    private terrainSamplePrimitives: Cesium.PointPrimitiveCollection[] = [];
    private terrainSampleGuideEntities: Cesium.Entity[] = [];
    private terrainSampleGeneration = 0;
    private areaMoveGeneration = 0;
    private areaClickGeneration = 0;

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
        this.terrainSamplePoints = new Map<number, TerrainSurfaceSamplePoint[]>();
        this.terrainSamplePrimitives = [];
        this.terrainSampleGuideEntities = [];
        this.terrainSampleGeneration = 0;
        this.areaMoveGeneration = 0;
        this.areaClickGeneration = 0;
    }

    active(options?: AreaActiveOptions): void {
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
        Object.entries(this.polygonEntities).forEach(([, value]) => {
            if (value) {
                this.viewer.entities.remove(value);
            }
        });
        this.tipEntities.forEach((entity) => {
            return this.viewer.entities.remove(entity);
        });
        this.terrainSamplePrimitives.forEach((primitive) => {
            this.viewer.scene.primitives.remove(primitive);
        });
        this.terrainSampleGuideEntities.forEach((entity) => {
            this.viewer.entities.remove(entity);
        });
        this.tipAreaEntity && this.viewer.entities.remove(this.tipAreaEntity);

        this.state.curSort = 0;
        this.pointDatas.clear();
        this.tempMovePosition.clear();
        this.pointEntitys = {};
        this.polygonEntities = {};
        this.tipAreaEntity = undefined;
        this.tipEntities = [];
        this.terrainSamplePoints.clear();
        this.terrainSamplePrimitives = [];
        this.terrainSampleGuideEntities = [];
        this.terrainSampleGeneration += 1;
        this.areaMoveGeneration = 0;
        this.areaClickGeneration = 0;
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
            this.drawingPolygon();
        }, this.cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    protected rightClickEvent(): void {
        this.handler.setInputAction(async () => {
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

            this.state.curSort = index + 1;
            this.areaMoveGeneration += 1;
            this.unRegisterEvents();
            console.log('wkkk', tempPositions);
            this.createTerrainPoint(1, tempPositions);
            await this.createAreaTip(tempPositions, 'click');
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

            if (tempPositions.length > 1) {
                await this.createAreaTip([...tempPositions, currentPosition], 'move');
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

    private async createAreaTip(descartesPoints: Cesium.Cartesian3[], type: 'click' | 'move') {
        const generation =
            type === MouseStatusEnum.click ? ++this.areaClickGeneration : ++this.areaMoveGeneration;

        this.tipAreaEntity && this.viewer.entities.remove(this.tipAreaEntity);
        const ellipsoid = this.viewer.scene.globe.ellipsoid;

        const ellipsoidalPolygonArea = computeEllipsoidalPolygonArea(this.cesium, descartesPoints);
        const terrainSurfaceArea = (
            await computeDelaunayTerrainSurfaceArea(
                this.cesium,
                descartesPoints,
                this.viewer.terrainProvider,
                {
                    ellipsoid,
                    sampleStepMeters: this.options?.terrainSampleStepMeters,
                    gridSegments: this.options?.terrainGridSegments,
                }
            )
        ).area;
        if (
            (type === MouseStatusEnum.click && generation !== this.areaClickGeneration) ||
            (type === MouseStatusEnum.move && generation !== this.areaMoveGeneration)
        ) {
            return;
        }

        const area = this.options?.area;
        const ellipsoidalText = ellipsoidalPolygonArea.toFixed(2);
        const terrainSurfaceText = terrainSurfaceArea.toFixed(2);

        let text: string;
        if (area?.customRender) {
            text = area.customRender(ellipsoidalPolygonArea, terrainSurfaceArea);
        } else if (area?.template) {
            text = area.template.replace('{}', ellipsoidalText).replace('{}', terrainSurfaceText);
        } else {
            text = `椭球面积：${ellipsoidalText}m²\n` + `地形表面积：${terrainSurfaceText}m²`;
        }

        const tipEntity = this.viewer.entities.add({
            position: this.getPolygonLabelPosition(descartesPoints),
            label: {
                text,
                show: area?.show !== false,
                font: area?.font ?? '12px sans-serif',
                scale: area?.scale,
                fillColor: area?.fillColor ?? this.cesium.Color.WHITE,
                outlineColor: area?.outlineColor ?? this.cesium.Color.BLACK,
                outlineWidth: area?.outlineWidth ?? 2,
                style: area?.style ?? this.cesium.LabelStyle.FILL_AND_OUTLINE,
                showBackground: area?.showBackground ?? false,
                pixelOffset: area?.pixelOffset ?? new this.cesium.Cartesian2(0, 20),
                verticalOrigin: area?.verticalOrigin ?? this.cesium.VerticalOrigin.TOP,
                disableDepthTestDistance:
                    area?.disableDepthTestDistance ?? Number.POSITIVE_INFINITY,
                heightReference: this.cesium.HeightReference.CLAMP_TO_GROUND,
            },
        });

        if (type === MouseStatusEnum.click) {
            this.tipEntities.push(tipEntity);
        } else {
            this.tipAreaEntity = tipEntity;
        }
    }

    /** 取顶点在 ECEF 下的平均并投影到椭球面，作为面积标签锚点（近似多边形中心） */
    private getPolygonLabelPosition(points: Cesium.Cartesian3[]): Cesium.Cartesian3 {
        if (points.length === 0) {
            return new this.cesium.Cartesian3();
        }
        if (points.length === 1) {
            return points[0];
        }
        const sum = new this.cesium.Cartesian3(0, 0, 0);
        for (const p of points) {
            this.cesium.Cartesian3.add(sum, p, sum);
        }
        this.cesium.Cartesian3.multiplyByScalar(sum, 1 / points.length, sum);
        const ellipsoid = this.viewer.scene.globe.ellipsoid;
        const onSurface = ellipsoid.scaleToGeodeticSurface(sum, new this.cesium.Cartesian3());
        return onSurface ?? sum;
    }

    /** 调用公共地表面积计算，并渲染其内部采样点、边界点和 ENU 方向。 */
    private async createTerrainPoint(
        measurementIndex: number,
        points: Cesium.Cartesian3[],
        accuracy = DEFAULT_TERRAIN_SAMPLE_STEP_METERS
    ): Promise<number> {
        const generation = ++this.terrainSampleGeneration;
        const result = await computeDelaunayTerrainSurfaceArea(
            this.cesium,
            points,
            this.viewer.terrainProvider,
            {
                ellipsoid: this.viewer.scene.globe.ellipsoid,
                sampleStepMeters: accuracy,
                gridSegments: this.options?.terrainGridSegments,
            }
        );
        if (generation !== this.terrainSampleGeneration) return result.area;
        this.terrainSamplePoints.set(measurementIndex, result.samples);

        const primitive = this.viewer.scene.primitives.add(
            new this.cesium.PointPrimitiveCollection()
        );
        result.samples.forEach((sample) => {
            const isBoundary = sample.kind === 'boundary';
            primitive.add({
                position: sample.position,
                pixelSize: isBoundary ? 6 : 4,
                color: (isBoundary ? this.cesium.Color.MAGENTA : this.cesium.Color.CYAN).withAlpha(
                    0.9
                ),
                outlineColor: this.cesium.Color.BLACK.withAlpha(0.75),
                outlineWidth: 1,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            });
        });
        this.terrainSamplePrimitives.push(primitive);
        this.createSamplingDirectionGuides(
            result.enuToFixed,
            Math.max(
                10,
                Math.min(result.stepMeters * 1.5, Math.max(result.width, result.height) * 0.35)
            )
        );
        this.viewer.scene.requestRender();
        const debugData = {
            inputPositions: points.map((point) => ({
                x: point.x,
                y: point.y,
                z: point.z,
            })),

            area: result.area,
            stepMeters: result.stepMeters,
            width: result.width,
            height: result.height,

            localRing: result.localRing,

            samples: result.samples.map((sample) => ({
                kind: sample.kind,

                localPosition: sample.localPosition,

                longitude: this.cesium.Math.toDegrees(sample.cartographic.longitude),
                latitude: this.cesium.Math.toDegrees(sample.cartographic.latitude),
                height: sample.cartographic.height,

                position: {
                    x: sample.position.x,
                    y: sample.position.y,
                    z: sample.position.z,
                },
            })),

            triangleIndices: result.triangleIndices,
        };

        console.log('terrain-area-debug:', JSON.stringify(debugData, null, 2));
        return result.area;
    }

    /** 绘制当前采样坐标系的正东（E）和正北（N）方向。 */
    private createSamplingDirectionGuides(enuToFixed: Cesium.Matrix4, guideLength: number): void {
        const toWorld = (east: number, north: number) =>
            this.cesium.Matrix4.multiplyByPoint(
                enuToFixed,
                new this.cesium.Cartesian3(east, north, 0),
                new this.cesium.Cartesian3()
            );
        const origin = toWorld(0, 0);
        const eastEnd = toWorld(guideLength, 0);
        const northEnd = toWorld(0, guideLength);

        const originEntity = this.viewer.entities.add({
            position: origin,
            point: {
                pixelSize: 7,
                color: this.cesium.Color.WHITE,
                outlineColor: this.cesium.Color.BLACK,
                outlineWidth: 2,
                heightReference: this.cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        });
        const createArrow = (end: Cesium.Cartesian3, color: Cesium.Color, text: string) =>
            this.viewer.entities.add({
                position: end,
                polyline: {
                    positions: [origin, end],
                    width: 6,
                    clampToGround: true,
                    material: new this.cesium.PolylineArrowMaterialProperty(color),
                    zIndex: 20,
                },
                label: {
                    text,
                    font: 'bold 15px sans-serif',
                    fillColor: color,
                    outlineColor: this.cesium.Color.WHITE,
                    outlineWidth: 3,
                    style: this.cesium.LabelStyle.FILL_AND_OUTLINE,
                    showBackground: true,
                    backgroundColor: this.cesium.Color.BLACK.withAlpha(0.65),
                    pixelOffset: new this.cesium.Cartesian2(0, -18),
                    heightReference: this.cesium.HeightReference.CLAMP_TO_GROUND,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
            });

        this.terrainSampleGuideEntities.push(
            originEntity,
            createArrow(eastEnd, this.cesium.Color.RED, '东 E'),
            createArrow(northEnd, this.cesium.Color.BLUE, '北 N')
        );
    }
}
