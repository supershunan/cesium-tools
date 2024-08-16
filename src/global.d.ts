declare module 'cesium-tools-fxt' {
    export const useSlopeDirectionAnalysis: typeof import('./tools/slopeDirectionAnalysis/index').default;
    export const useVisualFieldAnalysis: typeof import('./tools/visualFieldAnalysis/index').default;
    export const useVisibilityAnalysis: typeof import('./tools/visibilityAnalysis/index').default;
    export const useTurntableSwing: typeof import('./tools/turntableSwing/index').default;
    export const useMeasure: typeof import('./tools/measure/index').default;
}
