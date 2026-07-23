import { describe, expect, it } from 'vitest';
import {
    shouldFlipLatitudeRowsForCesium,
    normalizeGeoJsonMaskPolygons,
    readGridFromFileInput,
    handleFileUpload,
    GridDataReader,
} from '../../src/tools/radarLayer/index';

describe('shouldFlipLatitudeRowsForCesium', () => {
    it('无 header 时返回 false', () => {
        expect(shouldFlipLatitudeRowsForCesium(null as unknown as { yDelta?: number })).toBe(false);
    });

    it('显式 flipLatitudeRowsForCesium 优先', () => {
        expect(shouldFlipLatitudeRowsForCesium({ flipLatitudeRowsForCesium: true, yDelta: -1 })).toBe(
            true
        );
        expect(
            shouldFlipLatitudeRowsForCesium({ flipLatitudeRowsForCesium: false, yDelta: 1 })
        ).toBe(false);
    });

    it('根据 yDelta 推断', () => {
        expect(shouldFlipLatitudeRowsForCesium({ yDelta: 0.01 })).toBe(true);
        expect(shouldFlipLatitudeRowsForCesium({ yDelta: -0.01 })).toBe(false);
    });

    it('根据 yStart/yEnd 推断', () => {
        expect(shouldFlipLatitudeRowsForCesium({ yStart: 30, yEnd: 31 })).toBe(true);
        expect(shouldFlipLatitudeRowsForCesium({ yStart: 31, yEnd: 30 })).toBe(false);
    });
});

describe('normalizeGeoJsonMaskPolygons', () => {
    it('非法输入返回空数组', () => {
        expect(normalizeGeoJsonMaskPolygons(null)).toEqual([]);
        expect(normalizeGeoJsonMaskPolygons('x')).toEqual([]);
    });

    it('解析 Polygon Feature', () => {
        const masks = normalizeGeoJsonMaskPolygons({
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [
                    [
                        [0, 0],
                        [1, 0],
                        [1, 1],
                        [0, 0],
                    ],
                ],
            },
        });
        expect(masks).toHaveLength(1);
        expect(masks[0].outer).toHaveLength(3);
        expect(masks[0].holes).toEqual([]);
        expect(masks[0].bbox[0]).toBeLessThanOrEqual(masks[0].bbox[2]);
    });
});

describe('readGridFromFileInput', () => {
    it('未选择文件时抛出', async () => {
        await expect(readGridFromFileInput(null)).rejects.toThrow('未选择文件');
        await expect(readGridFromFileInput(undefined)).rejects.toThrow('未选择文件');
    });

    it('非 .zip 扩展名时抛出', async () => {
        const file = new File(['x'], 'data.bin', { type: 'application/octet-stream' });
        await expect(readGridFromFileInput(file)).rejects.toThrow('.zip');
    });

    it('接受 .ZIP 扩展名并尝试解析', async () => {
        const file = new File(['not-a-zip'], 'DATA.ZIP', { type: 'application/zip' });
        await expect(readGridFromFileInput(file)).rejects.toThrow();
    });
});

describe('handleFileUpload', () => {
    it('从 input 事件取文件并校验', async () => {
        const file = new File([''], 'a.txt', { type: 'text/plain' });
        const event = {
            target: { files: [file] },
        } as Event & { target: EventTarget & { files?: FileList } };
        await expect(handleFileUpload(event)).rejects.toThrow('.zip');
    });
});

describe('GridDataReader 静态配置', () => {
    it('setDebugEnabled / setPerfEnabled 可切换', () => {
        GridDataReader.setDebugEnabled(true);
        expect(GridDataReader.isDebugEnabled()).toBe(true);
        GridDataReader.setDebugEnabled(false);
        expect(GridDataReader.isDebugEnabled()).toBe(false);

        GridDataReader.setPerfEnabled(true);
        GridDataReader.resetPerfStats();
        expect(GridDataReader.getPerfStats()).toEqual([]);
        GridDataReader.setPerfEnabled(false);
    });
});
