import Delaunator from 'delaunator';
import type * as CesiumTypes from 'cesium';
import { Geodesic } from 'geographiclib-geodesic';

export type Point2D = [number, number];
export type TerrainSampleKind = 'interior' | 'boundary';

export type TerrainSurfaceSamplePoint = {
    /** 局部 ENU 平面坐标（米），供 Delaunator 进行二维三角剖分。 */
    localPosition: Point2D;
    kind: TerrainSampleKind;
    cartographic: CesiumTypes.Cartographic;
    /** 带地形高度的 ECEF 坐标，用于计算三角形三维面积。 */
    position: CesiumTypes.Cartesian3;
};

export type DelaunayTerrainSurfaceAreaOptions = {
    sampleStepMeters?: number;
    /** 未指定 sampleStepMeters 时，最长边方向的切分数量。 */
    gridSegments?: number;
    maxSamplePoints?: number;
    ellipsoid?: CesiumTypes.Ellipsoid;
};

export type DelaunayTerrainSurfaceAreaResult = {
    area: number;
    samples: TerrainSurfaceSamplePoint[];
    /** 已过滤到多边形范围内的三角形顶点索引，每三个索引组成一个三角形。 */
    triangleIndices: number[];
    localRing: Point2D[];
    enuToFixed: CesiumTypes.Matrix4;
    stepMeters: number;
    width: number;
    height: number;
};

export type TerrainSurfaceDistanceOptions = {
    /** 沿测地线的采样间距，单位米。 */
    sampleStepMeters?: number;
    /** 防止超长路径产生过多地形请求。 */
    maxSamplePoints?: number;
    ellipsoid?: CesiumTypes.Ellipsoid;
};

export const DEFAULT_TERRAIN_SAMPLE_STEP_METERS = 50;
export const DEFAULT_TERRAIN_DISTANCE_SAMPLE_STEP_METERS = 10;
const DEFAULT_MAX_TERRAIN_SAMPLE_POINTS = 50_000;
const DEFAULT_MAX_TERRAIN_DISTANCE_SAMPLE_POINTS = 10_000;
const SAMPLE_POINT_KEY_PRECISION = 1_000;
const POSITION_DUPLICATE_TOLERANCE_SQUARED = 1e-6;
const POINT_ON_EDGE_TOLERANCE_METERS = 1e-5;

const removeDuplicatePositions = (
    Cesium: typeof import('cesium'),
    positions: CesiumTypes.Cartesian3[]
): CesiumTypes.Cartesian3[] => {
    const result: CesiumTypes.Cartesian3[] = [];
    for (const position of positions) {
        const previous = result[result.length - 1];
        if (
            !previous ||
            Cesium.Cartesian3.distanceSquared(previous, position) >
                POSITION_DUPLICATE_TOLERANCE_SQUARED
        ) {
            result.push(position);
        }
    }
    if (
        result.length > 1 &&
        Cesium.Cartesian3.distanceSquared(result[0], result[result.length - 1]) <=
            POSITION_DUPLICATE_TOLERANCE_SQUARED
    ) {
        result.pop();
    }
    return result;
};

const averagePosition = (
    Cesium: typeof import('cesium'),
    positions: CesiumTypes.Cartesian3[]
): CesiumTypes.Cartesian3 => {
    const result = new Cesium.Cartesian3();
    positions.forEach((position) => Cesium.Cartesian3.add(result, position, result));
    return Cesium.Cartesian3.divideByScalar(result, positions.length, result);
};

const isPointOnSegment = (point: Point2D, start: Point2D, end: Point2D): boolean => {
    const edgeX = end[0] - start[0];
    const edgeY = end[1] - start[1];
    const pointX = point[0] - start[0];
    const pointY = point[1] - start[1];
    const cross = edgeX * pointY - edgeY * pointX;
    if (Math.abs(cross) > POINT_ON_EDGE_TOLERANCE_METERS * Math.max(1, Math.hypot(edgeX, edgeY))) {
        return false;
    }
    const dot = pointX * edgeX + pointY * edgeY;
    return (
        dot >= -POINT_ON_EDGE_TOLERANCE_METERS &&
        dot <= edgeX * edgeX + edgeY * edgeY + POINT_ON_EDGE_TOLERANCE_METERS
    );
};

/** 边界视为多边形内部。 */
export const isPointInPolygon = (point: Point2D, ring: Point2D[]): boolean => {
    let inside = false;
    for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
        const start = ring[previous];
        const end = ring[current];
        if (isPointOnSegment(point, start, end)) return true;
        const intersects =
            end[1] > point[1] !== start[1] > point[1] &&
            point[0] < ((start[0] - end[0]) * (point[1] - end[1])) / (start[1] - end[1]) + end[0];
        if (intersects) inside = !inside;
    }
    return inside;
};

const isTriangleInsidePolygon = (a: Point2D, b: Point2D, c: Point2D, ring: Point2D[]) => {
    const testPoints: Point2D[] = [
        [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3],
        [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
        [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2],
        [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2],
    ];
    return testPoints.every((point) => isPointInPolygon(point, ring));
};

const triangleArea3D = (
    Cesium: typeof import('cesium'),
    a: CesiumTypes.Cartesian3,
    b: CesiumTypes.Cartesian3,
    c: CesiumTypes.Cartesian3
): number => {
    const ab = Cesium.Cartesian3.subtract(b, a, new Cesium.Cartesian3());
    const ac = Cesium.Cartesian3.subtract(c, a, new Cesium.Cartesian3());
    return (
        Cesium.Cartesian3.magnitude(Cesium.Cartesian3.cross(ab, ac, new Cesium.Cartesian3())) / 2
    );
};

export const computeDelaunaySurfaceAreaFromSamples = (
    Cesium: typeof import('cesium'),
    samples: TerrainSurfaceSamplePoint[],
    localRing: Point2D[]
): Pick<DelaunayTerrainSurfaceAreaResult, 'area' | 'triangleIndices'> => {
    if (samples.length < 3 || localRing.length < 3) return { area: 0, triangleIndices: [] };

    const delaunay = Delaunator.from(samples.map((sample) => sample.localPosition));
    const triangleIndices: number[] = [];
    let area = 0;
    for (let index = 0; index < delaunay.triangles.length; index += 3) {
        const aIndex = delaunay.triangles[index];
        const bIndex = delaunay.triangles[index + 1];
        const cIndex = delaunay.triangles[index + 2];
        const a = samples[aIndex];
        const b = samples[bIndex];
        const c = samples[cIndex];
        if (!a || !b || !c) continue;
        if (
            !isTriangleInsidePolygon(a.localPosition, b.localPosition, c.localPosition, localRing)
        ) {
            continue;
        }
        triangleIndices.push(aIndex, bIndex, cIndex);
        area += triangleArea3D(Cesium, a.position, b.position, c.position);
    }
    return { area, triangleIndices };
};

/**
 * 坡面面积
 * 以局部 ENU 平面生成内部规则点和边界点，采样地形高度后使用 Delaunator
 * 进行二维三角剖分，最后累加有效三角形在 ECEF 下的三维面积。
 */
export const computeDelaunayTerrainSurfaceArea = async (
    Cesium: typeof import('cesium'),
    positions: CesiumTypes.Cartesian3[],
    terrainProvider: CesiumTypes.TerrainProvider,
    options: DelaunayTerrainSurfaceAreaOptions = {}
): Promise<DelaunayTerrainSurfaceAreaResult> => {
    const ellipsoid = options.ellipsoid ?? Cesium.Ellipsoid.WGS84;
    const ring = removeDuplicatePositions(Cesium, positions);
    if (ring.length < 3) throw new Error('计算地表面积至少需要三个不重复的点');

    const surfaceRing = ring.map(
        (position) =>
            ellipsoid.scaleToGeodeticSurface(position, new Cesium.Cartesian3()) ??
            Cesium.Cartesian3.clone(position)
    );
    const center =
        ellipsoid.scaleToGeodeticSurface(
            averagePosition(Cesium, surfaceRing),
            new Cesium.Cartesian3()
        ) ?? surfaceRing[0];
    const enuToFixed = Cesium.Transforms.eastNorthUpToFixedFrame(center, ellipsoid);
    const fixedToEnu = Cesium.Matrix4.inverseTransformation(enuToFixed, new Cesium.Matrix4());
    const localRing = surfaceRing.map((position): Point2D => {
        const local = Cesium.Matrix4.multiplyByPoint(fixedToEnu, position, new Cesium.Cartesian3());
        return [local.x, local.y];
    });

    const xs = localRing.map(([x]) => x);
    const ys = localRing.map(([, y]) => y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = maxX - minX;
    const height = maxY - minY;
    if (width <= 0 || height <= 0) throw new Error('多边形投影范围无效');

    const gridSegments = Math.max(options.gridSegments ?? 0, 1);
    const requestedStep = Math.max(
        Number.isFinite(options.sampleStepMeters)
            ? (options.sampleStepMeters as number)
            : options.gridSegments
              ? Math.max(width, height) / gridSegments
              : DEFAULT_TERRAIN_SAMPLE_STEP_METERS,
        1
    );
    const maxSamplePoints = Math.max(
        options.maxSamplePoints ?? DEFAULT_MAX_TERRAIN_SAMPLE_POINTS,
        3
    );
    const safeStep = Math.sqrt((width * height) / maxSamplePoints);
    const stepMeters = Math.max(requestedStep, safeStep);
    const localSamples: Pick<TerrainSurfaceSamplePoint, 'localPosition' | 'kind'>[] = [];
    const sampleIndexByKey = new Map<string, number>();
    const addSample = (x: number, y: number, kind: TerrainSampleKind) => {
        const key = `${Math.round(x * SAMPLE_POINT_KEY_PRECISION)},${Math.round(
            y * SAMPLE_POINT_KEY_PRECISION
        )}`;
        const existingIndex = sampleIndexByKey.get(key);
        if (existingIndex !== undefined) {
            if (kind === 'boundary') localSamples[existingIndex].kind = 'boundary';
            return;
        }
        sampleIndexByKey.set(key, localSamples.length);
        localSamples.push({ localPosition: [x, y], kind });
    };

    for (let y = minY; y <= maxY + stepMeters * 0.5; y += stepMeters) {
        for (let x = minX; x <= maxX + stepMeters * 0.5; x += stepMeters) {
            if (isPointInPolygon([x, y], localRing)) addSample(x, y, 'interior');
        }
    }
    for (let index = 0; index < localRing.length; index += 1) {
        const start = localRing[index];
        const end = localRing[(index + 1) % localRing.length];
        const segmentCount = Math.max(
            1,
            Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) / stepMeters)
        );
        for (let segment = 0; segment < segmentCount; segment += 1) {
            const ratio = segment / segmentCount;
            addSample(
                start[0] + (end[0] - start[0]) * ratio,
                start[1] + (end[1] - start[1]) * ratio,
                'boundary'
            );
        }
    }
    if (localSamples.length < 3) throw new Error('地形采样点不足');

    const cartographics = localSamples.map(({ localPosition: [x, y] }) => {
        const fixed = Cesium.Matrix4.multiplyByPoint(
            enuToFixed,
            new Cesium.Cartesian3(x, y, 0),
            new Cesium.Cartesian3()
        );
        const cartographic =
            ellipsoid.cartesianToCartographic(fixed, new Cesium.Cartographic()) ??
            new Cesium.Cartographic();
        cartographic.height = 0;
        return cartographic;
    });
    let sampledCartographics = cartographics;
    try {
        sampledCartographics = await Cesium.sampleTerrainMostDetailed(
            terrainProvider,
            cartographics
        );
    } catch {
        // 地形服务不可用时退回椭球面高度，保持函数可用。
    }
    const samples = sampledCartographics.map((cartographic, index): TerrainSurfaceSamplePoint => {
        const normalized = Cesium.Cartographic.clone(cartographic);
        if (!Number.isFinite(normalized.height)) normalized.height = 0;
        return {
            localPosition: localSamples[index].localPosition,
            kind: localSamples[index].kind,
            cartographic: normalized,
            position: ellipsoid.cartographicToCartesian(normalized, new Cesium.Cartesian3()),
        };
    });
    const { area, triangleIndices } = computeDelaunaySurfaceAreaFromSamples(
        Cesium,
        samples,
        localRing
    );
    return { area, samples, triangleIndices, localRing, enuToFixed, stepMeters, width, height };
};

const createGeodesicFromEllipsoid = (ellipsoid: CesiumTypes.Ellipsoid) => {
    const semiMajor = ellipsoid.radii.x;
    const flattening = (ellipsoid.radii.x - ellipsoid.radii.z) / ellipsoid.radii.x;
    return new Geodesic.Geodesic(semiMajor, flattening);
};

/**
 * 水平面积
 * 椭球面积，依据 WGS84 椭球面上计算面积，排除了地形起伏；按照光滑地球表面计算 椭圆
 */
export const computeEllipsoidalPolygonArea = (
    Cesium: typeof import('cesium'),
    positions: CesiumTypes.Cartesian3[],
    ellipsoid: CesiumTypes.Ellipsoid = Cesium.Ellipsoid.WGS84
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

/**
 * 水平距离
 * 获取椭球曲面两点的最短测地距离，大地线距离
 * @param {*} Cesium cesium 实例
 * @param {number[]} start 开始点
 * @param {number[]} end 结束点
 * @param ellipsoid 椭球模型，默认 WGS84
 * @returns { number } 测地距
 */
export const computed_WGS84Distance = (
    Cesium: typeof import('cesium'),
    start: CesiumTypes.Cartesian3,
    end: CesiumTypes.Cartesian3,
    ellipsoid: CesiumTypes.Ellipsoid = Cesium.Ellipsoid.WGS84
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
 * 贴地距离
 * 计算两点之间沿椭球测地线方向的贴地距离。
 * 先沿测地线等距取样，再取得真实地形高度，最后累加相邻采样点的三维距离。
 */
export const computeTerrainSurfaceDistance = async (
    Cesium: typeof import('cesium'),
    start: CesiumTypes.Cartesian3,
    end: CesiumTypes.Cartesian3,
    terrainProvider: CesiumTypes.TerrainProvider,
    options: TerrainSurfaceDistanceOptions = {}
): Promise<number> => {
    if (Cesium.Cartesian3.distanceSquared(start, end) <= POSITION_DUPLICATE_TOLERANCE_SQUARED) {
        return 0;
    }

    const ellipsoid = options.ellipsoid ?? Cesium.Ellipsoid.WGS84;
    const startCartographic = ellipsoid.cartesianToCartographic(start, new Cesium.Cartographic());
    const endCartographic = ellipsoid.cartesianToCartographic(end, new Cesium.Cartographic());
    if (!startCartographic || !endCartographic) return 0;
    startCartographic.height = 0;
    endCartographic.height = 0;

    const geodesic = new Cesium.EllipsoidGeodesic(startCartographic, endCartographic, ellipsoid);
    const surfaceDistance = geodesic.surfaceDistance;
    if (!Number.isFinite(surfaceDistance) || surfaceDistance <= 0) return 0;

    const requestedStep = Math.max(
        Number.isFinite(options.sampleStepMeters)
            ? (options.sampleStepMeters as number)
            : DEFAULT_TERRAIN_DISTANCE_SAMPLE_STEP_METERS,
        1
    );
    const maxSamplePoints = Math.max(
        Math.floor(options.maxSamplePoints ?? DEFAULT_MAX_TERRAIN_DISTANCE_SAMPLE_POINTS),
        2
    );
    const segmentCount = Math.min(
        Math.max(1, Math.ceil(surfaceDistance / requestedStep)),
        maxSamplePoints - 1
    );
    const cartographics: CesiumTypes.Cartographic[] = [];
    for (let index = 0; index <= segmentCount; index += 1) {
        const cartographic = geodesic.interpolateUsingFraction(
            index / segmentCount,
            new Cesium.Cartographic()
        );
        cartographic.height = 0;
        cartographics.push(cartographic);
    }

    let sampledCartographics = cartographics;
    try {
        sampledCartographics = await Cesium.sampleTerrainMostDetailed(
            terrainProvider,
            cartographics
        );
    } catch {
        // 地形服务不可用时，保留高度 0，回退为光滑椭球面的近似距离。
    }

    let distance = 0;
    let previous: CesiumTypes.Cartesian3 | undefined;
    for (const sampled of sampledCartographics) {
        const cartographic = Cesium.Cartographic.clone(sampled);
        if (!Number.isFinite(cartographic.height)) cartographic.height = 0;
        const current = ellipsoid.cartographicToCartesian(cartographic, new Cesium.Cartesian3());
        if (previous) distance += Cesium.Cartesian3.distance(previous, current);
        previous = current;
    }

    return distance;
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
    start: CesiumTypes.Cartesian3,
    end: CesiumTypes.Cartesian3
) => {
    const distance = Cesium.Cartesian3.distance(start, end);
    return distance;
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
    start: CesiumTypes.Cartesian3,
    middle: CesiumTypes.Cartesian3,
    end: CesiumTypes.Cartesian3
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
