/**
 * Vue 3 组合式 API：随 Viewer 创建/切换自动绑定，卸载时清理分析类工具。
 *
 * import { useCesiumTools } from 'cesium-tools-fxt/vue'
 */
import { onUnmounted, shallowRef, watch } from 'vue';
import type * as Cesium from 'cesium';
import {
    createMeasure,
    createDrawing,
    createVisualFieldAnalysis,
    createVisibilityAnalysis,
    createSlopeDirectionAnalysis,
    createTurntableSwing,
    type Measure,
    type VisualFieldAnalysis,
    type VisibilityAnalysisProps,
    type SlopDerectionAnalysis,
    type TurntableSwingProps,
} from '../core/index';

export type CesiumToolsBundle = {
    measure: Measure;
    drawing: ReturnType<typeof createDrawing>['drawing'];
    drawingEntity: ReturnType<typeof createDrawing>['drawingEntity'];
    visualFieldAnalysis: VisualFieldAnalysis;
    visibilityAnalysis: VisibilityAnalysisProps;
    slopeDirectionAnalysis: SlopDerectionAnalysis;
    turntableSwing: TurntableSwingProps;
};

export type MaybeRefOrGetter<T> = T | { value: T } | (() => T);
export type ToolsRef<T> = { value: T };

function disposeAnalysisTools(bundle: CesiumToolsBundle | null): void {
    if (!bundle) return;
    bundle.visualFieldAnalysis.cleanInstance();
    bundle.visibilityAnalysis.cleanInstance();
    bundle.slopeDirectionAnalysis.cleanInstance();
    bundle.turntableSwing.cleanInstance();
}

function createToolsBundle(viewer: Cesium.Viewer, CesiumNS: typeof Cesium): CesiumToolsBundle {
    const draw = createDrawing(viewer, CesiumNS);
    const visualFieldAnalysis = createVisualFieldAnalysis();
    const visibilityAnalysis = createVisibilityAnalysis();
    const slopeDirectionAnalysis = createSlopeDirectionAnalysis();
    const turntableSwing = createTurntableSwing();

    visualFieldAnalysis.setInstance(viewer);
    visibilityAnalysis.setInstance(viewer);
    slopeDirectionAnalysis.setInstance(viewer);
    turntableSwing.setInstance(viewer);

    return {
        measure: createMeasure(viewer, CesiumNS),
        drawing: draw.drawing,
        drawingEntity: draw.drawingEntity,
        visualFieldAnalysis,
        visibilityAnalysis,
        slopeDirectionAnalysis,
        turntableSwing,
    };
}

function resolveMaybeRefOrGetter<T>(source: MaybeRefOrGetter<T>): T {
    if (typeof source === 'function') {
        return (source as () => T)();
    }
    if (source && typeof source === 'object' && 'value' in source) {
        return source.value;
    }
    return source;
}

/**
 * @param viewer `ref` / `getter` / 普通 Viewer；为 null 时 tools 为 null
 * @param CesiumNS `import * as Cesium from 'cesium'` 的命名空间
 */
export function useCesiumTools(
    viewer: MaybeRefOrGetter<Cesium.Viewer | null | undefined>,
    CesiumNS: typeof Cesium
): ToolsRef<CesiumToolsBundle | null> {
    const tools = shallowRef<CesiumToolsBundle | null>(null);

    watch(
        () => resolveMaybeRefOrGetter(viewer),
        (v, _prev, onCleanup) => {
            disposeAnalysisTools(tools.value);
            tools.value = null;

            if (!v) {
                return;
            }

            tools.value = createToolsBundle(v, CesiumNS);

            onCleanup(() => {
                disposeAnalysisTools(tools.value);
                tools.value = null;
            });
        },
        { immediate: true }
    );

    onUnmounted(() => {
        disposeAnalysisTools(tools.value);
        tools.value = null;
    });

    return tools;
}
