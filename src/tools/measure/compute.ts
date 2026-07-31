import * as Cesium from 'cesium';
import { Geodesic } from 'geographiclib-geodesic';

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

const createGeodesicFromEllipsoid = (ellipsoid: Cesium.Ellipsoid) => {
    const semiMajor = ellipsoid.radii.x;
    const flattening = (ellipsoid.radii.x - ellipsoid.radii.z) / ellipsoid.radii.x;
    return new Geodesic.Geodesic(semiMajor, flattening);
};

/**
 * 获取椭球曲面两点的最短测地距离。
 * @param {*} Cesium cesium 实例
 * @param {number[]} start 开始点
 * @param {number[]} end 结束点
 * @param ellipsoid 椭球模型，默认 WGS84
 * @returns { number } 测地距
 */
export const computed_WGS84Distance = (
    Cesium: typeof import('cesium'),
    start: Cesium.Cartesian3,
    end: Cesium.Cartesian3,
    ellipsoid: Cesium.Ellipsoid = Cesium.Ellipsoid.WGS84
) => {
    const left = start;
    const right = end;

    const startCartographic = ellipsoid.cartesianToCartographic(left, new Cesium.Cartographic());
    const endCartographic = ellipsoid.cartesianToCartographic(right, new Cesium.Cartographic());
    if (!startCartographic || !endCartographic) return 0;

    const geodesic = createGeodesicFromEllipsoid(ellipsoid);
    // eslint-disable-next-line new-cap
    const distance = geodesic.Inverse(
        Cesium.Math.toDegrees(startCartographic.latitude),
        Cesium.Math.toDegrees(startCartographic.longitude),
        Cesium.Math.toDegrees(endCartographic.latitude),
        Cesium.Math.toDegrees(endCartographic.longitude)
    ).s12;

    return distance ?? 0;
};

/**
 * 获取笛卡尔坐标系下球体空间两点的直线距离
 * @param {*} Cesium cesium 实例
 * @param {number[]} start 开始点
 * @param {number[]} end 结束点
 * @returns { number } 直线距离
 */
export const computed_spaceDistance = (
    Cesium: typeof import('cesium'),
    start: Cesium.Cartesian3,
    end: Cesium.Cartesian3
) => {
    const distance = Cesium.Cartesian3.distance(start, end);
    return distance;
};

type Point2D = [number, number];

export interface TerrainSurfaceAreaOptions {
    /** 采样网格边长，单位米；值越小越贴近真实地形，但计算越慢。 */
    sampleStepMeters?: number;
    /** 未指定 sampleStepMeters 时，最长边界框方向默认切分数量。 */
    gridSegments?: number;
    ellipsoid?: Cesium.Ellipsoid;
}

const removeDuplicatePositions = (
    Cesium: typeof import('cesium'),
    positions: Cesium.Cartesian3[]
): Cesium.Cartesian3[] => {
    const result: Cesium.Cartesian3[] = [];
    const duplicateToleranceSquared = 1e-12;

    for (const position of positions) {
        const previous = result[result.length - 1];
        if (
            !previous ||
            Cesium.Cartesian3.distanceSquared(previous, position) > duplicateToleranceSquared
        ) {
            result.push(position);
        }
    }

    if (
        result.length > 1 &&
        Cesium.Cartesian3.distanceSquared(result[0], result[result.length - 1]) <=
            duplicateToleranceSquared
    ) {
        result.pop();
    }

    return result;
};

const averagePosition = (
    Cesium: typeof import('cesium'),
    positions: Cesium.Cartesian3[]
): Cesium.Cartesian3 => {
    const center = new Cesium.Cartesian3();
    for (const position of positions) {
        Cesium.Cartesian3.add(center, position, center);
    }
    return Cesium.Cartesian3.divideByScalar(center, positions.length, center);
};

/**
 * 局部水平投影面积。
 *
 * 顶点会先投影到参考椭球面，再转换到多边形中心的 ENU 坐标系，最后用 East/North
 * 坐标执行鞋带公式。它适合中小范围测量；若需和 QGIS 的 Cartesian 结果严格一致，
 * 仍应先转换到与 QGIS 项目相同的投影 CRS。
 */
export const computePlanarPolygonArea = (
    Cesium: typeof import('cesium'),
    positions: Cesium.Cartesian3[],
    ellipsoid: Cesium.Ellipsoid = Cesium.Ellipsoid.WGS84
): number => {
    const ring = removeDuplicatePositions(Cesium, positions);
    if (ring.length < 3) return 0;

    const surfacePositions = ring.map((position) => {
        return (
            ellipsoid.scaleToGeodeticSurface(position, new Cesium.Cartesian3()) ??
            Cesium.Cartesian3.clone(position)
        );
    });
    const center =
        ellipsoid.scaleToGeodeticSurface(
            averagePosition(Cesium, surfacePositions),
            new Cesium.Cartesian3()
        ) ?? surfacePositions[0];
    const enuToFixed = Cesium.Transforms.eastNorthUpToFixedFrame(center, ellipsoid);
    const fixedToEnu = Cesium.Matrix4.inverseTransformation(enuToFixed, new Cesium.Matrix4());
    const projected = surfacePositions.map((position) => {
        const local = Cesium.Matrix4.multiplyByPoint(fixedToEnu, position, new Cesium.Cartesian3());
        return [local.x, local.y];
    });

    return polygonArea(projected);
};

/**
 * 椭球测地面积。
 *
 */
export const computeEllipsoidalPolygonArea = (
    Cesium: typeof import('cesium'),
    positions: Cesium.Cartesian3[],
    ellipsoid: Cesium.Ellipsoid = Cesium.Ellipsoid.WGS84
): number => {
    const ring = removeDuplicatePositions(Cesium, positions);
    if (ring.length < 3) return 0;

    const geodesic = createGeodesicFromEllipsoid(ellipsoid);
    // GeographicLib 的公开 API 沿用 C++ 风格的大写方法名。
    // eslint-disable-next-line new-cap
    const polygon = geodesic.Polygon(false);

    for (const position of ring) {
        const cartographic = ellipsoid.cartesianToCartographic(position, new Cesium.Cartographic());
        if (!cartographic) return 0;
        // eslint-disable-next-line new-cap
        polygon.AddPoint(
            Cesium.Math.toDegrees(cartographic.latitude),
            Cesium.Math.toDegrees(cartographic.longitude)
        );
    }

    // eslint-disable-next-line new-cap
    return Math.abs(polygon.Compute(false, true).area ?? 0);
};

const signedArea2D = (points: Point2D[]): number => {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const current = points[i];
        const next = points[(i + 1) % points.length];
        area += current[0] * next[1] - next[0] * current[1];
    }
    return area / 2;
};

const cross2D = (a: Point2D, b: Point2D, c: Point2D): number => {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
};

const pointInTriangle = (
    point: Point2D,
    a: Point2D,
    b: Point2D,
    c: Point2D,
    epsilon: number
): boolean => {
    return (
        cross2D(a, b, point) >= -epsilon &&
        cross2D(b, c, point) >= -epsilon &&
        cross2D(c, a, point) >= -epsilon
    );
};

const pointInPolygon = (point: Point2D, polygon: Point2D[]): boolean => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const current = polygon[i];
        const previous = polygon[j];
        const intersects =
            current[1] > point[1] !== previous[1] > point[1] &&
            point[0] <
                ((previous[0] - current[0]) * (point[1] - current[1])) /
                    (previous[1] - current[1]) +
                    current[0];
        if (intersects) inside = !inside;
    }
    return inside;
};

/**
 * 对无洞简单多边形执行耳切三角剖分。返回值为每个三角形的顶点索引。
 */
const triangulateSimplePolygon = (points: Point2D[]): number[] => {
    if (points.length < 3) return [];

    const extent = points.reduce((value, point) => {
        return Math.max(value, Math.abs(point[0]), Math.abs(point[1]));
    }, 1);
    const epsilon = extent * extent * 1e-12;
    const vertices = points.map((_, index) => {
        return index;
    });
    if (signedArea2D(points) < 0) {
        vertices.reverse();
    }

    const triangles: number[] = [];

    while (vertices.length > 3) {
        let earFound = false;

        for (let i = 0; i < vertices.length; i++) {
            const previousIndex = vertices[(i - 1 + vertices.length) % vertices.length];
            const currentIndex = vertices[i];
            const nextIndex = vertices[(i + 1) % vertices.length];
            const a = points[previousIndex];
            const b = points[currentIndex];
            const c = points[nextIndex];

            if (cross2D(a, b, c) <= epsilon) continue;

            const containsVertex = vertices.some((candidateIndex) => {
                if (
                    candidateIndex === previousIndex ||
                    candidateIndex === currentIndex ||
                    candidateIndex === nextIndex
                ) {
                    return false;
                }
                return pointInTriangle(points[candidateIndex], a, b, c, epsilon);
            });
            if (containsVertex) continue;

            triangles.push(previousIndex, currentIndex, nextIndex);
            vertices.splice(i, 1);
            earFound = true;
            break;
        }

        if (!earFound) {
            // 删除不贡献面积的共线点；若仍无法推进，输入通常是自相交多边形。
            const collinearIndex = vertices.findIndex((_, i) => {
                const previous = points[vertices[(i - 1 + vertices.length) % vertices.length]];
                const current = points[vertices[i]];
                const next = points[vertices[(i + 1) % vertices.length]];
                return Math.abs(cross2D(previous, current, next)) <= epsilon;
            });
            if (collinearIndex >= 0) {
                vertices.splice(collinearIndex, 1);
            } else {
                return [];
            }
        }
    }

    if (vertices.length === 3) {
        triangles.push(vertices[0], vertices[1], vertices[2]);
    }
    return triangles;
};

const triangleArea3D = (
    Cesium: typeof import('cesium'),
    a: Cesium.Cartesian3,
    b: Cesium.Cartesian3,
    c: Cesium.Cartesian3
): number => {
    const ab = Cesium.Cartesian3.subtract(b, a, new Cesium.Cartesian3());
    const ac = Cesium.Cartesian3.subtract(c, a, new Cesium.Cartesian3());
    const cross = Cesium.Cartesian3.cross(ab, ac, new Cesium.Cartesian3());
    return Cesium.Cartesian3.magnitude(cross) / 2;
};

/**
 * 用户顶点定义的三维多边形表面积。
 *
 * 先投影到多边形自身的平均平面进行边界约束三角剖分，再使用原始 ECEF 顶点计算每个
 * 三角形的真实三维面积。非共面多边形的结果取决于三角剖分；它不包含边界内部未采样
 * 的地形或 3D Tiles 起伏。
 */
export const compute3DPolygonArea = (
    Cesium: typeof import('cesium'),
    positions: Cesium.Cartesian3[]
): number => {
    const ring = removeDuplicatePositions(Cesium, positions);
    if (ring.length < 3) return 0;

    const center = averagePosition(Cesium, ring);
    const normal = new Cesium.Cartesian3();
    const currentOffset = new Cesium.Cartesian3();
    const nextOffset = new Cesium.Cartesian3();
    const edgeCross = new Cesium.Cartesian3();

    for (let i = 0; i < ring.length; i++) {
        Cesium.Cartesian3.subtract(ring[i], center, currentOffset);
        Cesium.Cartesian3.subtract(ring[(i + 1) % ring.length], center, nextOffset);
        Cesium.Cartesian3.cross(currentOffset, nextOffset, edgeCross);
        Cesium.Cartesian3.add(normal, edgeCross, normal);
    }

    if (Cesium.Cartesian3.magnitudeSquared(normal) <= Cesium.Math.EPSILON12) return 0;
    Cesium.Cartesian3.normalize(normal, normal);

    const helper =
        Math.abs(Cesium.Cartesian3.dot(normal, Cesium.Cartesian3.UNIT_Z)) < 0.9
            ? Cesium.Cartesian3.UNIT_Z
            : Cesium.Cartesian3.UNIT_X;
    const axisX = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.cross(helper, normal, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
    );
    const axisY = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.cross(normal, axisX, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
    );
    const projected = ring.map((position): Point2D => {
        const offset = Cesium.Cartesian3.subtract(position, center, new Cesium.Cartesian3());
        return [Cesium.Cartesian3.dot(offset, axisX), Cesium.Cartesian3.dot(offset, axisY)];
    });
    const triangles = triangulateSimplePolygon(projected);

    let area = 0;
    for (let i = 0; i < triangles.length; i += 3) {
        area += triangleArea3D(
            Cesium,
            ring[triangles[i]],
            ring[triangles[i + 1]],
            ring[triangles[i + 2]]
        );
    }
    return area;
};

/**
 * 地形表面积。
 *
 * 将多边形投影到局部 ENU 平面并生成规则网格，对网格点采样地形高度，再把落在
 * 多边形内部的小三角形按三维 Cartesian3 面积累加。该结果依赖 terrainProvider
 * 的可用精度和 sampleStepMeters；采样越密，越接近真实地形表面积。
 */
export const computeTerrainSurfaceArea = async (
    Cesium: typeof import('cesium'),
    positions: Cesium.Cartesian3[],
    terrainProvider: Cesium.TerrainProvider,
    options: TerrainSurfaceAreaOptions = {}
): Promise<number> => {
    const ellipsoid = options.ellipsoid ?? Cesium.Ellipsoid.WGS84;
    const ring = removeDuplicatePositions(Cesium, positions);
    if (ring.length < 3) return 0;

    const surfacePositions = ring.map((position) => {
        return (
            ellipsoid.scaleToGeodeticSurface(position, new Cesium.Cartesian3()) ??
            Cesium.Cartesian3.clone(position)
        );
    });
    const center =
        ellipsoid.scaleToGeodeticSurface(
            averagePosition(Cesium, surfacePositions),
            new Cesium.Cartesian3()
        ) ?? surfacePositions[0];
    const enuToFixed = Cesium.Transforms.eastNorthUpToFixedFrame(center, ellipsoid);
    const fixedToEnu = Cesium.Matrix4.inverseTransformation(enuToFixed, new Cesium.Matrix4());
    const projectedRing = surfacePositions.map((position): Point2D => {
        const local = Cesium.Matrix4.multiplyByPoint(fixedToEnu, position, new Cesium.Cartesian3());
        return [local.x, local.y];
    });

    const xs = projectedRing.map((point) => point[0]);
    const ys = projectedRing.map((point) => point[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = maxX - minX;
    const height = maxY - minY;
    if (width <= 0 || height <= 0) return 0;

    const gridSegments = Math.max(1, options.gridSegments ?? 64);
    const step = Math.max(options.sampleStepMeters ?? Math.max(width, height) / gridSegments, 1);
    const xCount = Math.max(1, Math.ceil(width / step));
    const yCount = Math.max(1, Math.ceil(height / step));
    const actualStepX = width / xCount;
    const actualStepY = height / yCount;

    const cartographics: Cesium.Cartographic[] = [];
    const pointIndexByGrid = new Map<string, number>();
    const triangles: number[] = [];

    const addGridPoint = (xIndex: number, yIndex: number): number => {
        const key = `${xIndex},${yIndex}`;
        const existingIndex = pointIndexByGrid.get(key);
        if (existingIndex !== undefined) return existingIndex;

        const localPoint = new Cesium.Cartesian3(
            minX + xIndex * actualStepX,
            minY + yIndex * actualStepY,
            0
        );
        const fixedPoint = Cesium.Matrix4.multiplyByPoint(
            enuToFixed,
            localPoint,
            new Cesium.Cartesian3()
        );
        const cartographic = ellipsoid.cartesianToCartographic(
            fixedPoint,
            new Cesium.Cartographic()
        );
        if (!cartographic) return -1;

        const nextIndex = cartographics.length;
        cartographics.push(cartographic);
        pointIndexByGrid.set(key, nextIndex);
        return nextIndex;
    };

    const addTriangleIfInside = (a: Point2D, b: Point2D, c: Point2D, indexes: number[]) => {
        const centroid: Point2D = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
        if (pointInPolygon(centroid, projectedRing)) {
            triangles.push(...indexes);
        }
    };

    for (let y = 0; y < yCount; y++) {
        for (let x = 0; x < xCount; x++) {
            const p00: Point2D = [minX + x * actualStepX, minY + y * actualStepY];
            const p10: Point2D = [minX + (x + 1) * actualStepX, minY + y * actualStepY];
            const p11: Point2D = [minX + (x + 1) * actualStepX, minY + (y + 1) * actualStepY];
            const p01: Point2D = [minX + x * actualStepX, minY + (y + 1) * actualStepY];

            const i00 = addGridPoint(x, y);
            const i10 = addGridPoint(x + 1, y);
            const i11 = addGridPoint(x + 1, y + 1);
            const i01 = addGridPoint(x, y + 1);
            if (i00 < 0 || i10 < 0 || i11 < 0 || i01 < 0) continue;

            addTriangleIfInside(p00, p10, p11, [i00, i10, i11]);
            addTriangleIfInside(p00, p11, p01, [i00, i11, i01]);
        }
    }

    if (triangles.length === 0) return 0;

    let sampled = cartographics;
    try {
        sampled = await Cesium.sampleTerrainMostDetailed(terrainProvider, cartographics);
    } catch {
        sampled = cartographics;
    }
    const sampledPositions = sampled.map((cartographic) => {
        return ellipsoid.cartographicToCartesian(cartographic, new Cesium.Cartesian3());
    });

    let area = 0;
    for (let i = 0; i < triangles.length; i += 3) {
        area += triangleArea3D(
            Cesium,
            sampledPositions[triangles[i]],
            sampledPositions[triangles[i + 1]],
            sampledPositions[triangles[i + 2]]
        );
    }
    return area;
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
