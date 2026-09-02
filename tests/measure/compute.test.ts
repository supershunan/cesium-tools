import { describe, expect, it } from 'vitest';
import * as Cesium from 'cesium';
import { computePlanarPolygonArea } from '../../src/tools/measure/compute';

describe('computePlanarPolygonArea', () => {
    it('赤道附近约 1 米见方的面积约为 1 平方米', () => {
        const ellipsoid = Cesium.Ellipsoid.WGS84;
        const equatorialRadius = ellipsoid.radii.x;
        const meridionalRadiusAtEquator = ellipsoid.radii.z ** 2 / equatorialRadius;
        const oneMeterLongitude = 1 / equatorialRadius;
        const oneMeterLatitude = 1 / meridionalRadiusAtEquator;
        const square = [
            Cesium.Cartesian3.fromRadians(0, 0),
            Cesium.Cartesian3.fromRadians(oneMeterLongitude, 0),
            Cesium.Cartesian3.fromRadians(oneMeterLongitude, oneMeterLatitude),
            Cesium.Cartesian3.fromRadians(0, oneMeterLatitude),
        ];
        expect(computePlanarPolygonArea(Cesium, square)).toBeCloseTo(1, 2);
    });

    it('少于 3 个点面积为 0', () => {
        expect(computePlanarPolygonArea(Cesium, [new Cesium.Cartesian3()])).toBe(0);
        expect(
            computePlanarPolygonArea(Cesium, [
                new Cesium.Cartesian3(),
                new Cesium.Cartesian3(1, 0, 0),
            ])
        ).toBe(0);
    });
});
