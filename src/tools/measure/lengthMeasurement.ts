import * as Cesium from 'cesium';
import MouseEvent from '../mouseBase/mouseBase';

export default class LengthMeasurement extends MouseEvent{
    protected viewer: Cesium.Viewer;
    protected handler: Cesium.ScreenSpaceEventHandler;
    private pointEntityAry: Cesium.Entity[];
    private lineEntityAry: Cesium.Entity[];
    positonsAry: Cesium.Cartesian3[] = [];

    constructor(viewer: Cesium.Viewer, handler: Cesium.ScreenSpaceEventHandler) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
        this.pointEntityAry = [];
        this.lineEntityAry = [];
        this.positonsAry = [];
    }

    active(): void {
        this.deactivate();
        this.registerEvents();
    }

    deactivate(): void {
        this.unRegisterEvents();
    }

    protected leftClickEvent() {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            if (this.positonsAry.length === 1) {
                this.deactivate();
            }
            const startPosition = this.viewer.scene.pickPosition(e.position);
            if (!startPosition && !Cesium.defined(startPosition)) return;
            this.positonsAry.push(startPosition);
            this.createPoint(startPosition);
            this.createRay(startPosition, startPosition);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    protected mouseMoveEvent(): void {
        this.handler.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
            const currentPosition = this.viewer.scene.pickPosition(e.endPosition);
            if (!currentPosition &&!Cesium.defined(currentPosition)) return;
            this.createRay(this.positonsAry[0], currentPosition);
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }

    private createPoint(position: Cesium.Cartesian3) {
        const pointEntity = this.viewer.entities.add({
            name: 'Length Measurement Point',
            position,
            point: {
                color: Cesium.Color.RED,
                pixelSize: 10,
                heightReference: Cesium.HeightReference.NONE,
            },
        });
        this.pointEntityAry.push(pointEntity);
    }

    private createRay(startPosition: Cesium.Cartesian3, endPosition: Cesium.Cartesian3): void {
        this.lineEntityAry.forEach((entity) => {
            this.viewer.entities.remove(entity);
        });
        this.lineEntityAry = [];
        const direction = Cesium.Cartesian3.subtract(
            endPosition,
            startPosition,
            new Cesium.Cartesian3()
        );

        // 创建射线
        const ray = new Cesium.Ray(startPosition, direction);
        // pick 方法可以获取到射线与地球表面的交线 https://cesium.com/learn/cesiumjs/ref-doc/Globe.html
        const intersection = this.viewer.scene.globe.pick(
            ray,
            this.viewer.scene
        );

        if (intersection) {
            // Visible part
            this.createPolylin(
                [startPosition, intersection],
                Cesium.Color.GREEN
            );
            // Invisible part
            this.createPolylin([intersection, endPosition], Cesium.Color.RED);
        } else {
            // Fully visible
            this.createPolylin(
                [startPosition, endPosition],
                Cesium.Color.GREEN
            );
        }
    }

    private createPolylin(position: Cesium.Cartesian3[], color: Cesium.Color) {
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
        this.lineEntityAry.push(lineEntity);
    }
}
