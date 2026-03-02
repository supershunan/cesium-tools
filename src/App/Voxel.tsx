import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { GridDataReader } from '../tools/radarLayer';
import {
    AnimatedRasterLayer,
    type AnimatedGridFrame,
} from '../tools/radarLayer/AnimatedRasterLayer';
import {
    DynamicRasterLayer,
    type GridCellInfo,
    type GridHeader,
} from '../tools/radarLayer/DynamicRasterLayer';

type GridResult = {
    header: GridHeader & { times?: number; levels?: number };
    data: number[][][][] | null;
    flatData?: Float32Array;
    getLevelSlice?: (timeIndex: number, levelIndex: number) => number[][];
};

export default function Voxel({ viewer }: { viewer: Cesium.Viewer }) {
    const MAX_CACHE_SIZE = 24;
    const LEVEL_HEIGHT_SCALE = 10;
    const baseUrl = 'http://222.74.18.86:7085/fxtraincold/';
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

    const dataURL2 = [
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810080000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810080500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810081000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810081500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810082500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810083000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810083500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810084000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810084500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810085000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810085500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810090000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810090500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810091000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810091500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810092000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810092500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810093000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810093500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810094000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810094500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810095000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810095500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810100000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810100500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810101000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810101500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810102000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810102500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810103000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810103500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810104000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810104500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810105000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810105500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810110000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810110500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810111000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810111500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810112000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810112500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810113000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810113500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810114000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810114500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810115000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810115500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810120000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810120500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810121000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810121500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810122000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810122500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810123000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810123500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810124000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810124500_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810125000_CR.zip',
        'pythonfile/SA000000001M/2025-08-10/SA000000001M_20250810125500_CR.zip',
    ];

    const dataURL3 = [
        'pythonfile/SX001/2025-10-01/SX001_20251001000001_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001000501_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001001001_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001001501_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001002001_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001002501_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001003001_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001003501_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001004001_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001004501_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001005001_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001005501_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001010001_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001010531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001011031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001011531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001012031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001012531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001013031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001013531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001014031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001014531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001015031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001015531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001020031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001020531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001021031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001021531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001022031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001022531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001023031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001023531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001024031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001024531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001025031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001025531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001030031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001030531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001031031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001031531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001032031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001032531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001033031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001033531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001034031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001034531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001035031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001035531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001040031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001040531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001041031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001041531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001042031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001042531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001043031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001043531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001044031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001044531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001045031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001045531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001050031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001050531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001051031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001051531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001052031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001052531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001053031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001053531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001054031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001054531_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001055031_CR.zip',
        'pythonfile/SX001/2025-10-01/SX001_20251001055531_CR.zip',
    ];

    const sourceGroups = useRef([dataURL, dataURL2, dataURL3]).current;
    const rasterLayerGroupsRef = useRef<AnimatedRasterLayer[][]>([]);
    const frameCacheRef = useRef(new Map<string, Promise<GridResult | null>>());
    const [layerProgressText, setLayerProgressText] = useState('');
    const [perfEnabled, setPerfEnabled] = useState(false);
    const [perfText, setPerfText] = useState('');
    const [hoverText, setHoverText] = useState('');
    const [clickText, setClickText] = useState('');
    const hoverTextRef = useRef('');
    const clickTextRef = useRef('');
    const isRenderingRef = useRef(false);
    const isCameraMovingRef = useRef(false);
    const frameIndexRef = useRef(0);
    const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isAutoPlayingRef = useRef(false);

    const buildFrameUrls = useCallback(
        (frameIndex: number) => {
            return sourceGroups.map((group) => {
                if (!group.length) {
                    return '';
                }
                const relative = group[frameIndex % group.length];
                return relative.startsWith('http') ? relative : `${baseUrl}${relative}`;
            });
        },
        [baseUrl, sourceGroups]
    );

    const loadGridResult = useCallback(
        (url: string) => {
            const cache = frameCacheRef.current;
            const cached = cache.get(url);
            if (cached) {
                return cached;
            }
            const task = (async () => {
                try {
                    const res = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/zip',
                        },
                    });
                    if (!res.ok) {
                        return null;
                    }
                    const reader = new GridDataReader();
                    const parsed = (await reader.readCompressedGridData(
                        await res.blob()
                    )) as GridResult;
                    return parsed;
                } catch (error) {
                    return null;
                }
            })();

            cache.set(url, task);
            if (cache.size > MAX_CACHE_SIZE) {
                const firstKey = cache.keys().next().value;
                if (firstKey) {
                    frameCacheRef.current = new Map(
                        Array.from(cache.entries()).filter(([key]) => {
                            return key !== firstKey;
                        })
                    );
                }
            }
            return task;
        },
        [MAX_CACHE_SIZE]
    );

    const updateHoverText = useCallback(
        (cell: GridCellInfo | null, groupIndex: number, levelIndex: number) => {
            const nextText = cell
                ? `悬浮值: ${cell.value.toFixed(2)} | group=${groupIndex} level=${levelIndex} | x=${cell.xIndex} y=${cell.yIndex} | lon=${cell.longitude.toFixed(4)} lat=${cell.latitude.toFixed(4)}`
                : '';
            if (hoverTextRef.current !== nextText) {
                hoverTextRef.current = nextText;
                setHoverText(nextText);
            }
        },
        []
    );

    const updateClickText = useCallback(
        (cell: GridCellInfo, groupIndex: number, levelIndex: number) => {
            const nextText = `点击值: ${cell.value} | group=${groupIndex} level=${levelIndex} | x=${cell.xIndex} y=${cell.yIndex} | lon=${cell.longitude.toFixed(4)} lat=${cell.latitude.toFixed(4)}`;
            if (clickTextRef.current !== nextText) {
                clickTextRef.current = nextText;
                setClickText(nextText);
            }
        },
        []
    );

    const renderFrame = useCallback(async () => {
        if (isCameraMovingRef.current) {
            return false;
        }
        if (isRenderingRef.current) {
            return false;
        }

        isRenderingRef.current = true;
        try {
            const frameIndex = frameIndexRef.current;
            const frameUrls = buildFrameUrls(frameIndex);
            if (
                !frameUrls.some((url) => {
                    return Boolean(url);
                })
            ) {
                return false;
            }
            if (rasterLayerGroupsRef.current.length !== sourceGroups.length) {
                rasterLayerGroupsRef.current.flat().forEach((layer) => {
                    layer.destroy();
                });
                rasterLayerGroupsRef.current = Array.from({ length: sourceGroups.length }, () => {
                    return [];
                });
            }

            let renderedGroups = 0;
            let renderedLevels = 0;
            for (let groupIndex = 0; groupIndex < sourceGroups.length; groupIndex++) {
                const group = sourceGroups[groupIndex];
                if (!group.length) {
                    continue;
                }
                const url = frameUrls[groupIndex];
                if (!url) {
                    continue;
                }
                const result = await loadGridResult(url);
                if (!result) {
                    continue;
                }

                const times = Number(result.header.times ?? result.data?.length ?? 0);
                const levels = Number(result.header.levels ?? result.data?.[0]?.length ?? 0);
                if (!times || !levels) {
                    continue;
                }

                if (rasterLayerGroupsRef.current[groupIndex].length !== levels) {
                    rasterLayerGroupsRef.current[groupIndex].forEach((layer) => {
                        layer.destroy();
                    });
                    rasterLayerGroupsRef.current[groupIndex] = Array.from(
                        { length: levels },
                        (_, idx) => {
                            const layer = new AnimatedRasterLayer(viewer as Cesium.Viewer, {
                                clampToGround: idx === 0,
                                colorRamp: [
                                    { maxValue: 10, color: [62, 160, 239] },
                                    { maxValue: 15, color: [62, 160, 239] },
                                    { maxValue: 20, color: [108, 225, 238] },
                                    { maxValue: 25, color: [96, 214, 63] },
                                    { maxValue: 30, color: [70, 137, 37] },
                                    { maxValue: 35, color: [252, 251, 74] },
                                    { maxValue: 40, color: [223, 195, 73] },
                                    { maxValue: 45, color: [239, 147, 47] },
                                    { maxValue: 50, color: [231, 53, 31] },
                                    { maxValue: 55, color: [184, 43, 41] },
                                    { maxValue: 60, color: [183, 36, 28] },
                                    { maxValue: 65, color: [236, 62, 237] },
                                    { maxValue: 70, color: [132, 39, 179] },
                                    { maxValue: Number.POSITIVE_INFINITY, color: [174, 148, 237] },
                                ],
                                interactionOptions: {
                                    enabled: idx === 0,
                                    hoverEnabled: true,
                                    hoverColor: Cesium.Color.BLACK,
                                    hoverAlpha: 0.35,
                                    onCellHover: (cell) => {
                                        updateHoverText(cell, groupIndex, idx);
                                    },
                                    onCellClick: (cell) => {
                                        updateClickText(cell, groupIndex, idx);
                                    },
                                },
                            });
                            return layer;
                        }
                    );
                }

                const timeIndex = frameIndex % times;
                const levelList = result.header.levelList ?? [];
                for (let levelIndex = 0; levelIndex < levels; levelIndex++) {
                    const grid = result.getLevelSlice
                        ? result.getLevelSlice(timeIndex, levelIndex)
                        : result.data?.[timeIndex]?.[levelIndex];
                    if (
                        !Array.isArray(grid) ||
                        !grid.length ||
                        !Array.isArray(grid[0]) ||
                        !grid[0].length
                    ) {
                        continue;
                    }
                    const levelHeightRaw = levelList[levelIndex];
                    const levelHeight = Number(levelHeightRaw);
                    const layerHeight =
                        levelIndex === 0 || !Number.isFinite(levelHeight)
                            ? 0
                            : levelHeight * LEVEL_HEIGHT_SCALE;
                    rasterLayerGroupsRef.current[groupIndex][levelIndex]?.update({
                        header: result.header,
                        grid,
                        heightMeters: layerHeight,
                        opacity: levelIndex === 0 ? 1 : 0.45,
                    });
                }
                renderedGroups += 1;
                renderedLevels = Math.max(renderedLevels, levels);
            }

            frameIndexRef.current = frameIndex + 1;
            const maxFrameCount = Math.max(
                1,
                ...sourceGroups.map((group) => {
                    return group.length || 1;
                })
            );
            setLayerProgressText(
                `frame: ${frameIndexRef.current % maxFrameCount}/${maxFrameCount}, groups: ${renderedGroups}/${sourceGroups.length}, levels: ${renderedLevels}`
            );
            // 轻量预取：每帧最多预取一个未缓存 URL，避免和前台渲染抢占 worker
            const nextFrameUrls = buildFrameUrls(frameIndex + 1);
            const nextPrefetchUrl = nextFrameUrls.find((url) => {
                if (!url) {
                    return false;
                }
                return !frameCacheRef.current.has(url);
            });
            if (nextPrefetchUrl) {
                setTimeout(() => {
                    if (isRenderingRef.current) {
                        return;
                    }
                    loadGridResult(nextPrefetchUrl).then(
                        () => {
                            return;
                        },
                        () => {
                            return;
                        }
                    );
                }, 0);
            }
            return true;
        } finally {
            isRenderingRef.current = false;
        }
    }, [buildFrameUrls, loadGridResult, sourceGroups, updateClickText, updateHoverText, viewer]);

    useEffect(() => {
        if (viewer) {
            const cacheRef = frameCacheRef;
            const timeoutId = setTimeout(() => {
                rasterLayerGroupsRef.current = [];
                frameIndexRef.current = 0;
                setLayerProgressText('frame: 0/0, groups: 0/0, levels: 0');
                renderFrame().then(
                    () => {
                        return;
                    },
                    () => {
                        return;
                    }
                );
            }, 500);

            return () => {
                clearTimeout(timeoutId);
                rasterLayerGroupsRef.current.flat().forEach((layer) => {
                    layer.destroy();
                });
                rasterLayerGroupsRef.current = [];
                cacheRef.current.clear();
                isRenderingRef.current = false;
                frameIndexRef.current = 0;
                isAutoPlayingRef.current = false;
                if (autoPlayTimerRef.current) {
                    clearTimeout(autoPlayTimerRef.current);
                    autoPlayTimerRef.current = null;
                }
            };
        }
    }, [renderFrame, viewer]);

    useEffect(() => {
        if (!viewer) {
            return;
        }
        const prevSceneFxaa = (viewer.scene as Cesium.Scene & { fxaa?: boolean }).fxaa;
        const prevPostFxaa = viewer.scene.postProcessStages.fxaa.enabled;
        (viewer.scene as Cesium.Scene & { fxaa?: boolean }).fxaa = false;
        viewer.scene.postProcessStages.fxaa.enabled = false;
        viewer.scene.requestRender();

        const handleMoveStart = () => {
            isCameraMovingRef.current = true;
        };
        const handleMoveEnd = () => {
            isCameraMovingRef.current = false;
        };

        viewer.camera.moveStart.addEventListener(handleMoveStart);
        viewer.camera.moveEnd.addEventListener(handleMoveEnd);

        return () => {
            viewer.camera.moveStart.removeEventListener(handleMoveStart);
            viewer.camera.moveEnd.removeEventListener(handleMoveEnd);
            isCameraMovingRef.current = false;
            (viewer.scene as Cesium.Scene & { fxaa?: boolean }).fxaa = prevSceneFxaa;
            viewer.scene.postProcessStages.fxaa.enabled = prevPostFxaa;
            viewer.scene.requestRender();
        };
    }, [viewer]);

    const handleAutoPlay = () => {
        if (isAutoPlayingRef.current) {
            return;
        }
        isAutoPlayingRef.current = true;
        const tick = () => {
            if (!isAutoPlayingRef.current) {
                return;
            }
            renderFrame().then(
                () => {
                    if (!isAutoPlayingRef.current) {
                        return;
                    }
                    autoPlayTimerRef.current = setTimeout(() => {
                        tick();
                    }, 350);
                },
                () => {
                    isAutoPlayingRef.current = false;
                }
            );
        };
        tick();
    };

    const handleStopAutoPlay = () => {
        isAutoPlayingRef.current = false;
        if (autoPlayTimerRef.current) {
            clearTimeout(autoPlayTimerRef.current);
            autoPlayTimerRef.current = null;
        }
    };

    const handleTogglePerf = () => {
        const next = !perfEnabled;
        setPerfEnabled(next);
        GridDataReader.setPerfEnabled(next);
        if (next) {
            GridDataReader.resetPerfStats();
            setPerfText('性能统计已开启');
        } else {
            setPerfText('');
        }
    };

    const handleDumpPerf = () => {
        const stats = GridDataReader.getPerfStats();
        if (!stats.length) {
            setPerfText('暂无性能统计数据');
            return;
        }
        const summary = stats
            .map((item) => {
                return `${item.stage}: avg=${item.avgMs.toFixed(1)}ms, max=${item.maxMs.toFixed(1)}ms, count=${item.count}`;
            })
            .join(' | ');
        setPerfText(summary);
    };

    return (
        <div>
            <button
                onClick={() => {
                    renderFrame().then(
                        () => {
                            return;
                        },
                        () => {
                            return;
                        }
                    );
                }}
                style={{ position: 'absolute', top: 60, left: 0, zIndex: 10 }}
            >
                下一帧
            </button>
            <button onClick={handleAutoPlay}>自动播放</button>
            <button onClick={handleStopAutoPlay}>停止自动播放</button>
            <button onClick={handleTogglePerf}>
                {perfEnabled ? '关闭性能统计' : '开启性能统计'}
            </button>
            <button onClick={handleDumpPerf}>输出性能统计</button>
            <div
                id="pickedCoordinate"
                style={{ position: 'absolute', top: 100, left: 0, background: 'white' }}
            >
                图层进度: {layerProgressText}
            </div>
            <div style={{ position: 'absolute', top: 130, left: 0, background: 'white' }}>
                性能统计: {perfText}
            </div>
            <div style={{ position: 'absolute', top: 160, left: 0, background: 'white' }}>
                {hoverText || '悬浮值: -'}
            </div>
            <div style={{ position: 'absolute', top: 190, left: 0, background: 'white' }}>
                {clickText || '点击值: -'}
            </div>
        </div>
    );
}
