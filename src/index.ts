/** 框架无关的 Cesium 工具入口。 */
export {
    GridDataReader,
    readGridHeaderFromFile,
    readGridDataFromFile,
    readGridFromFileInput,
    handleFileUpload,
    shouldFlipLatitudeRowsForCesium,
} from '@tools/radarLayer/index';

export { AnimatedRasterLayer } from '@tools/radarLayer/AnimatedRasterLayer';
export { HardEdgeRasterLayer } from '@tools/radarLayer/HardEdgeRasterLayer';
export { EarthProjection } from '@tools/earthProjection/index';

export { useMeasure as createMeasure, useMeasure } from '@tools/measure/index';
export { useDrawing as createDrawing, useDrawing } from '@tools/draw/index';
export {
    useVisualFieldAnalysis as createVisualFieldAnalysis,
    useVisualFieldAnalysis,
} from '@tools/visualFieldAnalysis/index';
export {
    useVisibilityAnalysis as createVisibilityAnalysis,
    useVisibilityAnalysis,
} from '@tools/visibilityAnalysis/index';
export {
    useSlopeDirectionAnalysis as createSlopeDirectionAnalysis,
    useSlopeDirectionAnalysis,
} from '@tools/slopeDirectionAnalysis/index';
export {
    useTurntableSwing as createTurntableSwing,
    useTurntableSwing,
} from '@tools/turntableSwing/index';
export {
    default as createCesiumToolsEventBus,
    default as useCesiumToolsManage,
} from '@tools/eventTarget/index';

export type {
    GridHeader,
    GridFrame,
    LonLat,
    PolygonMask,
    MaskableGridResult,
} from '@tools/radarLayer/index';
export type {
    GridHeader as AnimatedRasterLayerHeader,
    AnimatedGridCellInfo,
    DynamicRasterInteractionOptions,
    RasterColorStop,
    PolygonMaskCoord,
    AnimatedRasterLayerOptions,
    AnimatedGridFrame,
} from '@tools/radarLayer/AnimatedRasterLayer';
export type {
    HardEdgeColorStop,
    HardEdgeGridHeader,
    HardEdgeRasterFrame,
    HardEdgeGridCellInfo,
    HardEdgeInteractionOptions,
    HardEdgeRasterLayerOptions,
} from '@tools/radarLayer/HardEdgeRasterLayer';
export type {
    GridDataHeader,
    GridData,
    ColorRule,
    ColorMode,
    EarthProjectionOptions,
} from '@tools/earthProjection/index';
export type {
    LabelOptions,
    AngleActiveOptions,
    AreaActiveOptions,
    LengthActiveOptions,
    TheHeightOfTheGroundActiveOptions,
    MeasurementActions,
    Measure,
} from '@tools/measure/index';
export type {
    DrawingActions,
    PrimitiveDrawingActions,
    EntityDrawingActions,
} from '@tools/draw/index';
export type {
    DrawingTypeEnum,
    Points,
    DrawingEntityOptions,
    CreatePrimitiveOptions,
    EditPrimitiveOptions,
    CreateEntityOptions,
} from '@tools/draw/type';
export type { VisualFieldAnalysis } from '@tools/visualFieldAnalysis/index';
export type { VisibilityAnalysisProps } from '@tools/visibilityAnalysis/index';
export type { SlopDerectionAnalysis } from '@tools/slopeDirectionAnalysis/index';
export type { TurntableSwingProps } from '@tools/turntableSwing/index';
