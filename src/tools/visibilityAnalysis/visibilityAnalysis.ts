import * as Cesium from 'cesium';

interface Positions {
    startPosition: Cesium.Cartesian3;
    endPosition: Cesium.Cartesian3;
}

export default class VisibilityAnalysis {
    viewer: Cesium.Viewer;
    startPosition: Cesium.Cartesian3;
    endPosition: Cesium.Cartesian3;
    private lineEntities: Cesium.Entity[] = [];
    private scratchCartesian3 = new Cesium.Cartesian3();

    constructor(viewer: Cesium.Viewer, positions: Positions) {
        if (!viewer || !positions.startPosition || !positions.endPosition) {
            throw new Error('Invalid parameters');
        }
        this.viewer = viewer;
        this.startPosition = positions.startPosition;
        this.endPosition = positions.endPosition;
    }

    add(): void {
        this.update();
    }

    update(): void {
        this.clearLines();
        this.createRay();
    }

    updatePosition(endPosition: Cesium.Cartesian3): void {
        this.endPosition = endPosition;
        this.update();
    }

    /** Create a ray for visibility analysis */
    private createRay(): void {
        const direction = Cesium.Cartesian3.subtract(
            this.endPosition,
            this.startPosition,
            this.scratchCartesian3
        );

        // 创建射线
        const ray = new Cesium.Ray(this.startPosition, direction);
        // pick 方法可以获取到射线与地球表面的交线 https://cesium.com/learn/cesiumjs/ref-doc/Globe.html
        const intersection = this.viewer.scene.globe.pick(
            ray,
            this.viewer.scene
        );

        if (intersection) {
            // Visible part
            this.drawLine(
                [this.startPosition, intersection],
                Cesium.Color.GREEN
            );
            // Invisible part
            this.drawLine([intersection, this.endPosition], Cesium.Color.RED);
        } else {
            // Fully visible
            this.drawLine(
                [this.startPosition, this.endPosition],
                Cesium.Color.GREEN
            );
        }
    }

    private drawLine(position: Cesium.Cartesian3[], color: Cesium.Color): void {
        const lineEntity = this.viewer.entities.add({
            polyline: {
                positions: new Cesium.CallbackProperty(() => {
                    return position;
                }, false),
                width: 2,
                material: color,
                depthFailMaterial: color,
                // 是否贴地
                clampToGround: true,
            },
        });
        this.lineEntities.push(lineEntity);
    }

    private clearLines(): void {
        this.lineEntities.forEach((entity) => {
            this.viewer.entities.remove(entity);
        });
        this.lineEntities = [];
    }
}
