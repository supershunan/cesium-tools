import { describe, expect, it } from 'vitest';
import { compute_2DPolygonArea } from '../../src/tools/measure/compute';

describe('compute_2DPolygonArea', () => {
    it('单位正方形面积为 1', () => {
        const square = [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 0, z: 0 },
            { x: 1, y: 1, z: 0 },
            { x: 0, y: 1, z: 0 },
        ];
        expect(compute_2DPolygonArea(square)).toBeCloseTo(1, 6);
    });

    it('少于 3 个点面积为 0', () => {
        expect(compute_2DPolygonArea([{ x: 0, y: 0, z: 0 }])).toBe(0);
        expect(
            compute_2DPolygonArea([
                { x: 0, y: 0, z: 0 },
                { x: 1, y: 0, z: 0 },
            ])
        ).toBe(0);
    });
});
