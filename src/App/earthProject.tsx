import React from 'react';
import { useEffect, useRef, useMemo } from 'react';
import { GridDataReader } from '../tools/radarLayer';
import * as Cesium from 'cesium';
import { EarthProjection, GridData, ColorRule, ColorMode } from '../tools/earthProjection';

export default function EarthProject({ viewer }: { viewer: Cesium.Viewer }) {
    // 使用 EarthProjection 类
    const earthProjectionRef = useRef<EarthProjection | null>(null);

    // 颜色规则配置（使用 useMemo 避免每次渲染都创建新数组）
    const colorRules: ColorRule[] = useMemo(() => {
        return [
            { max: 9, color: [0 / 255, 235 / 255, 14 / 255, 1] },
            { max: 19, color: [0 / 255, 102 / 255, 255 / 255, 1] },
            { max: 29, color: [255 / 255, 255 / 255, 0 / 255, 1] },
            { max: 39, color: [255 / 255, 153 / 255, 0 / 255, 1] },
            { max: Infinity, color: [255 / 255, 0 / 255, 0 / 255, 1] },
        ];
    }, []);

    // 初始化 EarthProjection 实例
    useEffect(() => {
        if (viewer && !earthProjectionRef.current) {
            earthProjectionRef.current = new EarthProjection(viewer, {
                colorRules: colorRules,
                opacity: 0.5, // 默认透明度
                colorMode: 'step', // 阶梯类型
                hoverColor: [1, 0, 1, 0.8], // 悬浮颜色（紫色，可自定义）
                onValueClick: (value, longitude, latitude) => {
                    // eslint-disable-next-line no-console
                    console.log(
                        `点击位置: 经纬度(${longitude.toFixed(6)}, ${latitude.toFixed(6)}), 值: ${value}`
                    );
                },
            });

            // 将方法暴露到 window，方便外部调用
            const win = window as typeof window & {
                updateLayerData?: (data: GridData) => void;
                updateLayerOpacity?: (opacity: number) => void;
                setColorMode?: (mode: ColorMode) => void;
                setHoverColor?: (color: number[]) => void;
            };
            win.updateLayerData = (data: GridData) => {
                earthProjectionRef.current?.updateData(data);
            };
            win.updateLayerOpacity = (opacity: number) => {
                earthProjectionRef.current?.setOpacity(opacity);
            };
            win.setColorMode = (mode: ColorMode) => {
                earthProjectionRef.current?.setColorMode(mode);
            };
            win.setHoverColor = (color: number[]) => {
                earthProjectionRef.current?.setHoverColor(color);
            };
        }

        return () => {
            // 清理
            if (earthProjectionRef.current) {
                earthProjectionRef.current.destroy();
                earthProjectionRef.current = null;
            }
            const win = window as typeof window & {
                updateLayerData?: (data: GridData) => void;
                updateLayerOpacity?: (opacity: number) => void;
                setColorMode?: (mode: ColorMode) => void;
                setHoverColor?: (color: number[]) => void;
            };
            delete win.updateLayerData;
            delete win.updateLayerOpacity;
            delete win.setColorMode;
            delete win.setHoverColor;
        };
    }, [viewer, colorRules]);

    // 加载并渲染数据
    useEffect(() => {
        if (viewer && earthProjectionRef.current) {
            getNcData().then((data) => {
                // eslint-disable-next-line no-console
                console.log('数据加载完成', data);
                if (earthProjectionRef.current) {
                    earthProjectionRef.current.render(data);
                }
            });
        }
    }, [viewer]);

    // 加载数据的方法
    const getNcData = async (url?: string): Promise<GridData> => {
        let dataResult = {} as GridData;
        try {
            const res = await fetch(url ? url : '/public/resources/639021950828737727.zip', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/zip',
                },
            });
            const reader = new GridDataReader();
            const parsed = await reader.readCompressedGridData(await res.blob());
            dataResult = parsed as GridData;
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('读取ZIP文件错误:', error);
        }
        return dataResult;
    };

    return <div></div>;
}
