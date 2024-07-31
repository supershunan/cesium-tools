import * as Cesium from 'cesium';
import * as turf from '@turf/turf';
import { BBox, FeatureCollection } from 'geojson';
export default class SloopAspectAnalysis {
    viewer: Cesium.Viewer;
    polygon: Cesium.Entity;
    /** 网格切割的精度 单位(km) */
    distance: number;
    positionAry: Cesium.Cartesian3[];
    private arrowWidth?: number;
    private result: Cesium.Primitive[];
    constructor(
        viewer: Cesium.Viewer,
        polygon: Cesium.Entity,
        distance: number,
        positionAry: Cesium.Cartesian3[]
    ) {
        this.viewer = viewer;
        this.polygon = polygon;
        this.distance = distance || 0.1;
        this.positionAry = positionAry;
        this.result = [];
    }

    add = () => {
        const degrees = this.cartesian3ListToWGS84(this.positionAry);
        this.viewer.entities.remove(this.polygon);
        const boundary = [];
        let minX = 10000,
            minY = 10000,
            maxX = -10000,
            maxY = -1000;
        for (let index = 0; index < degrees.length; index++) {
            const element = degrees[index];
            const x = element.lng;
            const y = element.lat;
            boundary.push([x, y]);
            minX = x < minX ? x : minX;
            minY = y < minY ? y : minY;
            maxX = x > maxX ? x : maxX;
            maxY = y > maxY ? y : maxY;
        }
        boundary.push(boundary[0]);
        const bbox = [minX, minY, maxX, maxY] as BBox;
        const a = maxX - minX;
        let b = maxY - minY;
        b = b > a ? b : a;
        // 动态传
        const step = b / this.distance;
        const width = step * 2000 > 35 ? 35 : step * 2000;
        this.arrowWidth = width < 15 ? 15 : width;
        // 接收二维数组坐标，创建 type 为 Polygon 的面要素
        const mask = turf.polygon([boundary]);
        // 接收边界框，返回指定边长长度的相邻排列的面要素集
        const gridSquare = turf.squareGrid(bbox, step, {
            units: 'degrees',
            mask: mask,
        });

        this.createEllipse(gridSquare);
    };

    /**
     * 笛卡尔坐标数组转WGS84
     * @param cartesianList 笛卡尔坐标数组
     * @return WGS84经纬度坐标数组
     */
    private cartesian3ListToWGS84 = (
        cartesianList: Cesium.Cartesian3[]
    ): { lng: number; lat: number; alt: number }[] => {
        const ellipsoid = Cesium.Ellipsoid.WGS84;
        const result = [];
        for (let index = 0; index < cartesianList.length; index++) {
            const cartesian = cartesianList[index];
            const cartographic = ellipsoid.cartesianToCartographic(cartesian);
            result.push({
                lng: Cesium.Math.toDegrees(cartographic.longitude),
                lat: Cesium.Math.toDegrees(cartographic.latitude),
                alt: cartographic.height,
            });
        }
        return result;
    };

    private createEllipse = (gridSquare: FeatureCollection) => {
        const boxResults = [];
        for (let index = 0; index < gridSquare.features.length; index++) {
            const feature = gridSquare.features[index] as any;
            const coordinates = feature.geometry.coordinates[0];

            // 计算中心点
            const centerdegree = [
                (coordinates[0][0] + coordinates[2][0]) / 2,
                (coordinates[0][1] + coordinates[2][1]) / 2,
            ];

            // 将计算得到的中心点经纬度转换为 Cartographic 坐标，并添加到 boxResults。
            const centerCartographic = Cesium.Cartographic.fromDegrees(
                centerdegree[0],
                centerdegree[1]
            );
            boxResults.push(centerCartographic);

            for (let i = 0; i < coordinates.length; i++) {
                // 将每个坐标转换为 Cartographic
                const coord = coordinates[i];
                const cartographic = Cesium.Cartographic.fromDegrees(
                    coord[0],
                    coord[1]
                );
                boxResults.push(cartographic);

                // 如果当前坐标 coord 存在下一个坐标 coord1，则计算这两个坐标的中间点，并将中间点转换为 Cartographic 坐标，并添加到 boxResults。
                const coord1 = coordinates[i + 1];
                if (coord1) {
                    const newCoord = [
                        (coord[0] + coord1[0]) / 2,
                        (coord[1] + coord1[1]) / 2,
                    ];
                    const newCartographic = Cesium.Cartographic.fromDegrees(
                        newCoord[0],
                        newCoord[1]
                    );
                    boxResults.push(newCartographic);
                }
            }
        }

        // 使用 Cesium.sampleTerrainMostDetailed 函数对 boxResults 中的所有坐标进行地形采样，以获取最详细的高程数据。
        // 然后将结果 updatePositions 分片处理，每10个坐标为一组，存储到 tempAry 中,之后进行坡度计算
        Cesium.sampleTerrainMostDetailed(
            this.viewer.scene.terrainProvider,
            boxResults
        ).then((updatePositions) => {
            const tempAry: any = [];
            const ellipseResults = updatePositions.reduce(function (
                pre,
                item,
                index,
                updatePositions
            ) {
                const begin = index * 10;
                const end = begin + 10;
                const res = updatePositions.slice(begin, end);
                if (res.length !== 0) {
                    tempAry[index] = res;
                }
                return tempAry;
            },
            []);

            this.calculateSlope(ellipseResults);
        });
    };

    /** 坡度计算 */
    calculateSlope(ellipseResults: Cesium.Cartographic[][]) {
        const instances = [];
        const polygonInstance = [];
        for (let index = 0; index < ellipseResults.length; index++) {
            // 遍历 ellipseResults 数组，逐个处理其中的每个椭圆 ellipse。
            const ellipse = ellipseResults[index];

            /** 计算中心点和高度差
             * 将椭圆的第一个点 ellipse[0] 作为中心点 center。
             * 遍历椭圆的其他点，计算每个点与中心点的高度差 curHD，找到最大高度差的点 maxIndex。
             */
            const center = ellipse[0];
            let heightDifference = 0;
            let maxIndex = 0;
            for (let i = 1; i < ellipse.length - 1; i++) {
                const point = ellipse[i];
                const curHD = point.height - center.height;
                if (Math.abs(curHD) > heightDifference) {
                    heightDifference = curHD;
                    maxIndex = i;
                }
            }

            /** 计算坡度
             * 创建中心点 pos0 和最大高度差点 pos1 的地理坐标，但高度设为 0。
             * 计算两个点之间的水平距离 distance。
             * 计算坡度 curSlope，即高度差与距离之比的绝对值。
             */
            const pos0 = new Cesium.Cartographic(
                center.longitude,
                center.latitude,
                0
            );
            const pos1 = new Cesium.Cartographic(
                ellipse[maxIndex].longitude,
                ellipse[maxIndex].latitude,
                0
            );
            const distance = Cesium.Cartesian3.distance(
                Cesium.Cartographic.toCartesian(pos0),
                Cesium.Cartographic.toCartesian(pos1)
            );
            // 坡度的tan值
            const curSlope = Math.abs(heightDifference / distance);

            /** 计算坡度颜色并创建多边形实例
             * 使用 calculateSlopeColor 方法，根据坡度计算颜色 curColor
             * 使用 createPolygonInsrance 方法，创建一个带颜色的多边形实例 curPolygonInstance，并添加到 polygonInstance 数组。
             */
            const curColor = this.calculateSlopeColor(curSlope, 0.4);
            const curPolygonInstance = this.createPolygonInsrance(
                ellipse,
                curColor
            );
            polygonInstance.push(curPolygonInstance);

            /** 创建箭头实例
             * 根据 maxIndex 计算对角点 diagonalPoint。
             * 获取最大高度差点 targetPoint。
             * 使用 createArrowInstance 方法，创建一个箭头实例 arrowInstance，并添加到 instances 数组。
             */
            const diagonalPoint =
                maxIndex > 4 ? ellipse[maxIndex - 4] : ellipse[maxIndex + 4]; //对角点
            const targetPoint = ellipse[maxIndex];
            const arrowInstance = this.createArrowInstance(
                targetPoint,
                center,
                diagonalPoint,
                heightDifference,
                curSlope
            );
            instances.push(arrowInstance);
        }

        const mapPrimitive = this.viewer.scene.primitives.add(
            new Cesium.GroundPrimitive({
                geometryInstances: polygonInstance,
                appearance: new Cesium.PerInstanceColorAppearance({
                    translucent: true, //false时透明度无效
                    closed: false,
                }),
            })
        );

        const arrowPrimitive = this.viewer.scene.primitives.add(
            new Cesium.GroundPolylinePrimitive({
                geometryInstances: instances,
                appearance: new Cesium.PolylineMaterialAppearance({
                    material: new Cesium.Material({
                        fabric: {
                            type: 'PolylineArrow',
                            uniforms: {
                                color: new Cesium.Color(1.0, 1.0, 0.0, 0.8),
                            },
                        },
                    }),
                }),
            })
        );

        this.result.push(arrowPrimitive, mapPrimitive);
    }

    // 根据坡度值赋值颜色
    calculateSlopeColor(value: number, alpha: number): string {
        // 0°～0.5°为平原0.00872686779075879,rgb(85,182,43)
        // 0.5°～2°为微斜坡0.03492076949174773,rgb(135,211,43)
        // 2°～5°为缓斜坡0.08748866352592401,rgb(204,244,44)
        // 5°～15°为斜坡0.2679491924311227,rgb(245,233,44)
        // 15°～35°为陡坡0.7002075382097097,rgb(255,138,43)
        // 35°～55°为峭坡1.4281480067421144,rgb(255,84,43)
        // 55°～90°为垂直壁,rgb(255,32,43)
        if (value < 0.00872686779075879) {
            return 'rgba(85,182,43,' + alpha + ')';
        } else if (value < 0.03492076949174773) {
            return 'rgba(135,211,43,' + alpha + ')';
        } else if (value < 0.08748866352592401) {
            return 'rgba(204,244,44,' + alpha + ')';
        } else if (value < 0.2679491924311227) {
            return 'rgba(245,233,44,' + alpha + ')';
        } else if (value < 0.7002075382097097) {
            return 'rgba(255,138,43,' + alpha + ')';
        } else if (value < 1.4281480067421144) {
            return 'rgba(255,84,43,' + alpha + ')';
        }
        return 'rgba(255,32,43,' + alpha + ')';
    }

    createPolygonInsrance(points: Cesium.Cartographic[], color: string) {
        const positions = [];
        for (let index = 1; index < points.length - 1; index++) {
            const element = points[index];
            positions.push(Cesium.Cartographic.toCartesian(element));
        }
        const polygon = new Cesium.PolygonGeometry({
            polygonHierarchy: new Cesium.PolygonHierarchy(positions),
        });

        const polygonInstance = new Cesium.GeometryInstance({
            geometry: polygon,
            attributes: {
                color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                    Cesium.Color.fromCssColorString(color)
                ),
                show: new Cesium.ShowGeometryInstanceAttribute(true), //显示或者隐藏
            },
        });

        return polygonInstance;
    }

    createArrowInstance(
        targetPoint: Cesium.Cartographic,
        center: Cesium.Cartographic,
        diagonalPoint: Cesium.Cartographic,
        heightDifference: number,
        curSlope: number
    ) {
        const cartographic_0 = new Cesium.Cartographic(
            (targetPoint.longitude + center.longitude) / 2,
            (targetPoint.latitude + center.latitude) / 2,
            (targetPoint.height + center.height) / 2
        );
        const cartographic_1 = new Cesium.Cartographic(
            (diagonalPoint.longitude + center.longitude) / 2,
            (diagonalPoint.latitude + center.latitude) / 2,
            (diagonalPoint.height + center.height) / 2
        );
        //偏移的
        const positions1 =
            heightDifference > 0
                ? [
                      Cesium.Cartographic.toCartesian(cartographic_0),
                      Cesium.Cartographic.toCartesian(cartographic_1),
                  ]
                : [
                      Cesium.Cartographic.toCartesian(cartographic_1),
                      Cesium.Cartographic.toCartesian(cartographic_0),
                  ];
        //箭头线
        const instance = new Cesium.GeometryInstance({
            id: {
                type: 'SlopeAspect',
                value: curSlope,
            },
            geometry: new Cesium.GroundPolylineGeometry({
                positions: positions1,
                width: this.arrowWidth,
            }),
            attributes: {
                color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                    Cesium.Color.BLUE.withAlpha(0.6)
                ),
                show: new Cesium.ShowGeometryInstanceAttribute(true), //显示或者隐藏
            },
        });
        return instance;
    }
}
