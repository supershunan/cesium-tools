/* eslint-disable id-length */

/** 鞋带（Shoelace）公式计算面积 */
const polygonArea = (points) => {
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
  export const compute_geodesicaDistance_3d = (Cesium, start, end) => {
    const { Ellipsoid, EllipsoidGeodesic } = Cesium;
    const pickedPointCartographic = Ellipsoid.WGS84.cartesianToCartographic({
      x: start[0],
      y: start[1],
      z: start[2],
    });
    const lastPointCartographic = Ellipsoid.WGS84.cartesianToCartographic({
      x: end[0],
      y: end[1],
      z: end[2],
    });
    const geodesic = new EllipsoidGeodesic(pickedPointCartographic, lastPointCartographic);
    return geodesic.surfaceDistance;
  };

  /**
   * 获取球体平面两点的距离-2d
   * @param {*} Cesium cesium 实例
   * @param {number[]} start 开始点
   * @param {number[]} end 结束点
   * @returns { number } 平面距离
   */
  export const compute_placeDistance_2d = (Cesium, start, end) => {
    const left = new Cesium.Cartesian3(start[0], start[1], start[2]);
    const right = new Cesium.Cartesian3(end[0], end[1], end[2]);
    const distance = Cesium.Cartesian2.distance(left, right);
    return distance;
  };

  /**
   * 计算曲面面积-3d
   * @param {*} Cesium cesium 实例
   * @param {{ x: number, y: number, z: number }} positions 笛卡尔3d坐标
   * @returns {number} 曲面面积
   */
  export const compute_3DPolygonArea = (Cesium, positions) => {
    if (positions.length < 3) {
      return 0;
    }
    const indices = Cesium.PolygonPipeline.triangulate(
      positions.map((pos) => {
        return new Cesium.Cartesian2(pos.x, pos.y);
      })
    );

    // 计算三角形面积
    function triangleArea(a, b, c) {
      // 得到向量的模长
      const ab = Cesium.Cartesian3.subtract(b, a, new Cesium.Cartesian3());
      const ac = Cesium.Cartesian3.subtract(c, a, new Cesium.Cartesian3());
      // 通过模长计算叉积，叉积（ab * ac）的模长, 长度等于两个向量所张成的平行四边形的面积，且方向垂直于这两个向量
      const cross = Cesium.Cartesian3.cross(ab, ac, new Cesium.Cartesian3());
      // 计算叉积向量的模（即长度）。由于叉积向量的模表示的是平行四边形的面积，所以将其除以 2 得到的是三角形的面积。
      return Cesium.Cartesian3.magnitude(cross) / 2.0;
    }

    // 计算地表面积
    let surfaceArea = 0.0;
    for (let i = 0; i < indices.length; i += 3) {
      const a = positions[indices[i]];
      const b = positions[indices[i + 1]];
      const c = positions[indices[i + 2]];
      surfaceArea += triangleArea(a, b, c);
    }

    return surfaceArea;
  };

  /**
   * 计算投影面积-2d
   * @param {{ x: number, y: number, z: number }} positions 笛卡尔3d坐标
   * @returns {number} 平面面积
   */
  export const compute_2DPolygonArea = (positions) => {
    const projected = positions.map((pos) => {
      return [pos.x, pos.y];
    });
    return polygonArea(projected);
  };

  // Hex（十六进制）、Dec（十进制）、Octal（八进制）、Bin（二进制）
  export function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  }

  /**
   * 计算角度 传入三个点就可以 三点成角
   * @param {*} Cesium cesium 实例
   * @param start positions 笛卡尔3d坐标
   * @param middle positions 笛卡尔3d坐标
   * @param end positions 笛卡尔3d坐标
   */
  export const compute_Angle = (Cesium, start, middle, end) => {
    // 定义三个点的笛卡尔坐标
    const pointA = new Cesium.Cartesian3(start[0], start[1], start[2]);
    const pointB = new Cesium.Cartesian3(middle[0], middle[1], middle[2]);
    const pointC = new Cesium.Cartesian3(end[0], end[1], end[2]);

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
