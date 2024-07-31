import * as Cesium from 'cesium';

declare module 'cesium-tools' {
    export default class SloopAspectAnalysis {
        viewer: Cesium.Viewer;
        polygon: Cesium.Entity;
        distance: number;
        positionAry: Cesium.Cartesian3[];

        constructor(
            viewer: Cesium.Viewer,
            polygon: Cesium.Entity,
            distance: number,
            positionAry: Cesium.Cartesian3[]
        );

        add(): void;
        private cartesian3ListToWGS84(
            cartesianList: Cesium.Cartesian3[]
        ): { lng: number; lat: number; alt: number }[];

        private createEllipse(gridSquare: any): void;

        calculateSlope(ellipseResults: Cesium.Cartographic[][]): void;

        private calculateSlopeColor(value: number, alpha: number): string;

        private createPolygonInsrance(
            points: Cesium.Cartographic[],
            color: string
        ): Cesium.GeometryInstance;

        private createArrowInstance(
            targetPoint: Cesium.Cartographic,
            center: Cesium.Cartographic,
            diagonalPoint: Cesium.Cartographic,
            heightDifference: number,
            curSlope: number
        ): Cesium.GeometryInstance;
    }
}
