import * as Cesium from 'cesium';
import { Delaunay } from 'd3-delaunay';

/** 鞋带（Shoelace）公式计算面积 */
const polygonArea = (points: number[][]) => {
    let area = 0.0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const x1 = points[i][0];
        const y1 = points[i][1];
        const x2 = points[(i + 1) % n][0];
        const y2 = points[(i + 1) % n][1];
        area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area) / 2.0;
};

/**
 * 获取球体曲面两点的距离-3d
 * @param {*} Cesium cesium 实例
 * @param {number[]} start 开始点
 * @param {number[]} end 结束点
 * @returns { number } 测地距
 */
export const compute_geodesicaDistance_3d = async (
    Cesium: typeof import('cesium'),
    start: Cesium.Cartesian3,
    end: Cesium.Cartesian3,
    terrainProvider: Cesium.TerrainProvider
) => {
    const left = start;
    const right = end;

    const startCartographic = Cesium.Cartographic.fromCartesian(left);
    const endCartographic = Cesium.Cartographic.fromCartesian(right);

    // 生成路径上的多个点
    const positions = [];
    const numPoints = 50;
    for (let i = 0; i <= numPoints; i++) {
        const fraction = i / numPoints;

        // 线性插值经纬度和高度
        const interpolatedLongitude = Cesium.Math.lerp(
            startCartographic.longitude,
            endCartographic.longitude,
            fraction
        );
        const interpolatedLatitude = Cesium.Math.lerp(
            startCartographic.latitude,
            endCartographic.latitude,
            fraction
        );
        const interpolatedHeight = Cesium.Math.lerp(
            startCartographic.height,
            endCartographic.height,
            fraction
        );

        // 创建一个新的 Cartographic 实例并添加到 positions 数组
        const interpolated = new Cesium.Cartographic(
            interpolatedLongitude,
            interpolatedLatitude,
            interpolatedHeight
        );
        positions.push(interpolated);
    }

    // 使用地形数据采样函数采样路径上的地形高度
    let totalDistance = 0;

    return await Cesium.sampleTerrainMostDetailed(terrainProvider, positions).then(
        (updatedPositions) => {
            for (let i = 0; i < updatedPositions.length - 1; i++) {
                const startPosition = Cesium.Cartesian3.fromRadians(
                    updatedPositions[i].longitude,
                    updatedPositions[i].latitude,
                    updatedPositions[i].height
                );
                const endPosition = Cesium.Cartesian3.fromRadians(
                    updatedPositions[i + 1].longitude,
                    updatedPositions[i + 1].latitude,
                    updatedPositions[i + 1].height
                );

                // 6. 计算每两个相邻点之间的 3D 距离
                const segmentDistance = Cesium.Cartesian3.distance(startPosition, endPosition);
                totalDistance += segmentDistance;
            }
            return totalDistance;
        }
    );
};

/**
 * 获取球体平面两点的距离-2d 三维空间下的
 * @param {*} Cesium cesium 实例
 * @param {number[]} start 开始点
 * @param {number[]} end 结束点
 * @returns { number } 直线距离
 */
export const compute_placeDistance_2d = (
    Cesium: typeof import('cesium'),
    start: Cesium.Cartesian3,
    end: Cesium.Cartesian3
) => {
    const distance = Cesium.Cartesian3.distance(start, end);
    return distance;
};

// 用于计算向量的差
const subtractVectors = (v1: Cesium.Cartesian3, v2: Cesium.Cartesian3) => {
    return {
        x: v1.x - v2.x,
        y: v1.y - v2.y,
        z: v1.z - v2.z,
    };
};

// 用于计算叉积
const crossProduct = (
    v1: { x: number; y: number; z: number },
    v2: { x: number; y: number; z: number }
) => {
    return {
        x: v1.y * v2.z - v1.z * v2.y,
        y: v1.z * v2.x - v1.x * v2.z,
        z: v1.x * v2.y - v1.y * v2.x,
    };
};

// 用于计算向量的模长
const vectorMagnitude = (v: { x: number; y: number; z: number }) => {
    return Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
};

/** 线性插值 */
const linearInterpolation = (Cesium: typeof import('cesium'), positions: Cesium.Cartesian3[]) => {
    const newPositions = [];
    const numPoints = 10;

    for (let i = 0; i < positions.length - 1; i++) {
        const leftCartographic = Cesium.Cartographic.fromCartesian(positions[i]);
        const rightCartographic = Cesium.Cartographic.fromCartesian(positions[i + 1]);

        for (let j = 0; j <= numPoints; j++) {
            const fraction = j / numPoints;

            // 对经度、纬度和高度进行线性插值
            const interpolatedLongitude = Cesium.Math.lerp(
                leftCartographic.longitude,
                rightCartographic.longitude,
                fraction
            );
            const interpolatedLatitude = Cesium.Math.lerp(
                leftCartographic.latitude,
                rightCartographic.latitude,
                fraction
            );
            const interpolatedHeight = Cesium.Math.lerp(
                leftCartographic.height,
                rightCartographic.height,
                fraction
            );

            // 将插值结果转换为 Cartesian3 并添加到 newPositions 数组
            const interpolatedPosition = Cesium.Cartesian3.fromRadians(
                interpolatedLongitude,
                interpolatedLatitude,
                interpolatedHeight
            );
            newPositions.push(interpolatedPosition);
        }
    }
    return newPositions;
};

// 计算三角形面积
const triangleArea = (a: Cesium.Cartesian3, b: Cesium.Cartesian3, c: Cesium.Cartesian3) => {
    const ab = subtractVectors(b, a);
    const ac = subtractVectors(c, a);
    const cross = crossProduct(ab, ac);
    return vectorMagnitude(cross) / 2.0;
};

/**
 * 计算曲面面积-3d - 使用 d3-delaunay 库
 * @param {{ x: number, y: number, z: number }} positions 笛卡尔3d坐标
 * @returns {number} 曲面面积
 */
export const compute_3DPolygonArea = (
    Cesium: typeof import('cesium'),
    positions: Cesium.Cartesian3[]
) => {
    if (positions.length < 3) return 0;
    positions = linearInterpolation(Cesium, positions);

    const points = positions.map((pos) => {
        return [pos.x, pos.y];
    });
    const delaunay = Delaunay.from(points);
    const triangles = delaunay.triangles;

    let surfaceArea = 0;
    for (let i = 0; i < triangles.length; i += 3) {
        const a = positions[triangles[i]];
        const b = positions[triangles[i + 1]];
        const c = positions[triangles[i + 2]];
        surfaceArea += triangleArea(a, b, c);
    }
    return surfaceArea;
};

/**
 * 计算投影面积-2d
 * @param {{ x: number, y: number, z: number }} positions 笛卡尔3d坐标
 * @returns {number} 平面面积
 */
export const compute_2DPolygonArea = (positions: { x: number; y: number; z: number }[]) => {
    const projected = positions.map((pos) => {
        return [pos.x, pos.y];
    });
    return polygonArea(projected);
};

/**
 * 计算角度 传入三个点就可以 三点成角
 * @param {*} Cesium cesium 实例
 * @param start positions 笛卡尔3d坐标
 * @param middle positions 笛卡尔3d坐标
 * @param end positions 笛卡尔3d坐标
 */
export const compute_Angle = (
    Cesium: typeof import('cesium'),
    start: Cesium.Cartesian3,
    middle: Cesium.Cartesian3,
    end: Cesium.Cartesian3
) => {
    // 定义三个点的笛卡尔坐标
    const pointA = start;
    const pointB = middle;
    const pointC = end;

    // 计算向量 AB 和 BC
    const vectorAB = Cesium.Cartesian3.subtract(pointB, pointA, new Cesium.Cartesian3());
    const vectorBC = Cesium.Cartesian3.subtract(pointC, pointB, new Cesium.Cartesian3());

    // 归一化向量, 将向量的长度缩放到 1 , 同时保持方向
    Cesium.Cartesian3.normalize(vectorAB, vectorAB);
    Cesium.Cartesian3.normalize(vectorBC, vectorBC);

    // 计算向量点积,  点积等于两向量长度的乘积与它们夹角余弦值的乘积
    const dotProduct = Cesium.Cartesian3.dot(vectorAB, vectorBC);

    // 计算夹角（弧度），由于我们已经将向量归一化，其长度为 1，所以点积就是夹角的余弦值。使用 Math.acos 方法计算夹角的弧度值
    const angleRadians = Math.acos(dotProduct);

    // 将夹角转换为度
    const angleDegrees = Cesium.Math.toDegrees(angleRadians);

    return 180 - angleDegrees;
};
