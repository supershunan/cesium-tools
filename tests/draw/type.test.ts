import { describe, expect, it } from 'vitest';
import { DrawingTypeEnum, DrawingTypeNameEnum } from '../../src/tools/draw/type';

describe('DrawingTypeNameEnum', () => {
    it('与 DrawingTypeEnum 数值一一对应', () => {
        expect(DrawingTypeNameEnum[DrawingTypeEnum.POINT]).toBe('POINT');
        expect(DrawingTypeNameEnum[DrawingTypeEnum.POLYLINE]).toBe('POLYLINE');
        expect(DrawingTypeNameEnum[DrawingTypeEnum.POLYGON]).toBe('POLYGON');
        expect(DrawingTypeNameEnum[DrawingTypeEnum.POLYGON_AND_POLYLINE]).toBe(
            'POLYGON_AND_POLYLINE'
        );
        expect(DrawingTypeNameEnum[DrawingTypeEnum.BILLBOARD]).toBe('BILLBOARD');
        expect(DrawingTypeNameEnum[DrawingTypeEnum.LABEL]).toBe('LABEL');
    });
});
