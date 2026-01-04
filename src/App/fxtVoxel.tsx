import React from 'react';
import * as Cesium from 'cesium';
import { useEffect } from 'react';
import { GridDataReader } from '../tools/radarLayer';

export default function Voxel({ viewer }: { viewer: Cesium.Viewer }) {
    const dataURL = [
        'pythonfile/SX002/2025-08-09/SX002_20250809120000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809120500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809121000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809121500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809122000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809122500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809123000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809123500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809124000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809124500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809125000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809125500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809130000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809130500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809131000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809131500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809132000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809132500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809133000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809133500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809134000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809134500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809135000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809135500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809140000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809140500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809141000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809141500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809142000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809142500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809143000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809143500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809144000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809144500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809145000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809145500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809150000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809150500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809151000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809151500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809152000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809152500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809153000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809153500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809154000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809154500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809155000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809155500_CR.zip',
    ];

    let currentIndex = 0;

    useEffect(() => {
        if (viewer) {
            viewer.scene.debugShowFramesPerSecond = true;

            // 绘制网格
            const centerLongitude = 108.814897;
            const centerLatitude = 32.669207;
            const gridSize = 90000; // 1200米 x 1200米
            const gridSpacing = 500; // 网格间距100米

            // 计算网格边界（米转度数的近似转换）
            const metersToDegrees = (meters: number, latitude: number) => {
                const latRad = Cesium.Math.toRadians(latitude);
                const latMetersPerDegree = 111320;
                const lonMetersPerDegree = 111320 * Math.cos(latRad);
                return {
                    lat: meters / latMetersPerDegree,
                    lon: meters / lonMetersPerDegree,
                };
            };

            const radius = gridSize / 2; // 半径
            const centerPosition = Cesium.Cartesian3.fromDegrees(
                centerLongitude,
                centerLatitude,
                0
            );

            // 计算网格线数量
            const numLines = Math.floor(gridSize / gridSpacing) + 1;
            const halfSize = gridSize / 2;
            const delta = metersToDegrees(halfSize, centerLatitude);

            const minLon = centerLongitude - delta.lon;
            const maxLon = centerLongitude + delta.lon;
            const minLat = centerLatitude - delta.lat;
            const maxLat = centerLatitude + delta.lat;

            // 计算两点之间的距离（米）
            const distanceInMeters = (pos1: Cesium.Cartesian3, pos2: Cesium.Cartesian3) => {
                return Cesium.Cartesian3.distance(pos1, pos2);
            };

            // 检查点是否在圆内
            const isInsideCircle = (position: Cesium.Cartesian3) => {
                return distanceInMeters(centerPosition, position) <= radius;
            };

            // 计算垂直线与圆的交点（固定经度，求纬度范围）
            const getVerticalLineIntersections = (lon: number) => {
                const positions: Cesium.Cartesian3[] = [];
                const numPoints = 200; // 采样点数

                for (let j = 0; j <= numPoints; j++) {
                    const lat = minLat + (maxLat - minLat) * (j / numPoints);
                    const pos = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
                    if (isInsideCircle(pos)) {
                        positions.push(pos);
                    }
                }

                // 如果有点在圆内，返回连续的点段
                if (positions.length > 0) {
                    return positions;
                }
                return [];
            };

            // 计算水平线与圆的交点（固定纬度，求经度范围）
            const getHorizontalLineIntersections = (lat: number) => {
                const positions: Cesium.Cartesian3[] = [];
                const numPoints = 200; // 采样点数

                for (let j = 0; j <= numPoints; j++) {
                    const lon = minLon + (maxLon - minLon) * (j / numPoints);
                    const pos = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
                    if (isInsideCircle(pos)) {
                        positions.push(pos);
                    }
                }

                // 如果有点在圆内，返回连续的点段
                if (positions.length > 0) {
                    return positions;
                }
                return [];
            };

            // 绘制垂直网格线（经度方向）
            for (let i = 0; i < numLines; i++) {
                const lon = minLon + (maxLon - minLon) * (i / (numLines - 1));
                const positions = getVerticalLineIntersections(lon);

                if (positions.length > 1) {
                    viewer.entities.add({
                        polyline: {
                            positions: positions,
                            width: 1,
                            material: Cesium.Color.DARKGRAY,
                            clampToGround: true,
                        },
                    });
                }
            }

            // 绘制水平网格线（纬度方向）
            for (let i = 0; i < numLines; i++) {
                const lat = minLat + (maxLat - minLat) * (i / (numLines - 1));
                const positions = getHorizontalLineIntersections(lat);

                if (positions.length > 1) {
                    viewer.entities.add({
                        polyline: {
                            positions: positions,
                            width: 1,
                            material: Cesium.Color.DARKGRAY,
                            clampToGround: true,
                        },
                    });
                }
            }

            // 填充网格格子
            for (let i = 0; i < numLines - 1; i++) {
                for (let j = 0; j < numLines - 1; j++) {
                    const lon1 = minLon + (maxLon - minLon) * (i / (numLines - 1));
                    const lon2 = minLon + (maxLon - minLon) * ((i + 1) / (numLines - 1));
                    const lat1 = minLat + (maxLat - minLat) * (j / (numLines - 1));
                    const lat2 = minLat + (maxLat - minLat) * ((j + 1) / (numLines - 1));

                    // 计算格子的中心点
                    const centerLon = (lon1 + lon2) / 2;
                    const centerLat = (lat1 + lat2) / 2;
                    const cellCenter = Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 0);

                    // 检查格子中心是否在圆内
                    if (isInsideCircle(cellCenter)) {
                        // 创建格子的四个角点
                        const cellPositions = [
                            Cesium.Cartesian3.fromDegrees(lon1, lat1, 0),
                            Cesium.Cartesian3.fromDegrees(lon2, lat1, 0),
                            Cesium.Cartesian3.fromDegrees(lon2, lat2, 0),
                            Cesium.Cartesian3.fromDegrees(lon1, lat2, 0),
                        ];

                        // 随机选择红色或绿色
                        const cellColor =
                            Math.random() > 0.5
                                ? Cesium.Color.WHITE.withAlpha(0.1)
                                : Cesium.Color.WHITE.withAlpha(0.1);

                        viewer.entities.add({
                            polygon: {
                                hierarchy: cellPositions,
                                material: cellColor.withAlpha(0.5),
                                outline: false,
                            },
                        });
                    }
                }
            }

            // 使用 ellipse 绘制圆形轮廓
            viewer.entities.add({
                position: centerPosition,
                ellipse: {
                    semiMajorAxis: radius,
                    semiMinorAxis: radius,
                    material: Cesium.Color.TRANSPARENT,
                    outline: true,
                    outlineColor: Cesium.Color.RED,
                    outlineWidth: 10,
                    heightReference: Cesium.HeightReference.CLAMP_TO_3D_TILE,
                },
            });

            // 在中心点添加标记
            viewer.entities.add({
                position: Cesium.Cartesian3.fromDegrees(centerLongitude, centerLatitude, 0),
                billboard: {
                    image: '/public/online_radar.png',
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    heightReference: Cesium.HeightReference.CLAMP_TO_3D_TILE,
                    scale: 0.7,
                },
            });
        }
    }, [viewer]);

    return (
        <div>
            <button style={{ position: 'absolute', top: 0, left: 0 }}>Voxel</button>
            <div
                id="pickedCoordinate"
                style={{ position: 'absolute', top: 100, left: 0, background: 'white' }}
            ></div>
        </div>
    );
}
