import * as Cesium from 'cesium';
import MouseEvent from '../mouseBase/mouseBase';
export default class TheHeightOfTheGround extends MouseEvent {
    protected viewer: Cesium.Viewer;
    protected handler: Cesium.ScreenSpaceEventHandler;
    private pointEntityAry: Cesium.Entity[];
    private surfaceLineEntityAry: Cesium.Entity[];

    constructor(viewer: Cesium.Viewer, handler: Cesium.ScreenSpaceEventHandler) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
        this.pointEntityAry = [];
        this.surfaceLineEntityAry = [];
    }

    active(): void {
        this.deactivate();
        this.registerEvents();
    }

    deactivate(): void {
        this.clear();
        this.unRegisterEvents();
    }

    clear(): void {
        this.pointEntityAry.forEach((entity) => {
            this.viewer.entities.remove(entity);
        });
        this.surfaceLineEntityAry.forEach((entity) => {
            this.viewer.entities.remove(entity);
        });
    }

    protected leftClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            this.drawSurfaceLine(currentPosition);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    protected rightClickEvent(): void {
        this.handler.setInputAction(() => {
            this.unRegisterEvents();
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    private createPoint(position: Cesium.Cartesian3, heightDifference: number) {
        const pointEntity = this.viewer.entities.add({
            position,
            point: {
                color: Cesium.Color.YELLOW,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 1,
                pixelSize: 8,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
                text: `地表高度${heightDifference}m`,
                font: '10px sans-serif',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                showBackground: true,
                verticalOrigin: Cesium.VerticalOrigin.TOP,
                pixelOffset: new Cesium.Cartesian2(45, -10), // 标签稍微下移
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        });

        this.pointEntityAry.push(pointEntity);
    }

    private async drawSurfaceLine(position: Cesium.Cartesian3) {
        // 获取地形数据提供者
        const terrainProvider = this.viewer.terrainProvider;

        // 将 Cartesian3 转换为 Cartographic(地图实例)
        const cartographicPosition = Cesium.Cartographic.fromCartesian(position);

        // 获取该位置的地表高度
        const [updatedPosition] = await Cesium.sampleTerrainMostDetailed(terrainProvider, [
            cartographicPosition,
        ]);

        const surfaceHeight = updatedPosition.height;
        const pointHeight = cartographicPosition.height;

        // 计算高度差
        const heightDifference = pointHeight - surfaceHeight;

        this.createPoint(position, heightDifference);

        // 如果高度差大于0，绘制垂直高线
        if (heightDifference > 0) {
            const surfaceCartesian = Cesium.Cartesian3.fromRadians(
                updatedPosition.longitude,
                updatedPosition.latitude,
                surfaceHeight
            );

            const heightLinePositions = [surfaceCartesian, position];

            const surfaceLineEntity = this.viewer.entities.add({
                polyline: {
                    positions: heightLinePositions,
                    width: 2,
                    material: new Cesium.ColorMaterialProperty(Cesium.Color.CHARTREUSE),
                },
            });

            this.surfaceLineEntityAry.push(surfaceLineEntity);
        }
    }
}
