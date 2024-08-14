import * as Cesium from 'cesium';
import MouseEvent from '../mouseBase/mouseBase';
export default class theHeightOfTheGround extends MouseEvent {
    protected viewer: Cesium.Viewer;
    protected handler: Cesium.ScreenSpaceEventHandler;

    constructor(
        viewer: Cesium.Viewer,
        handler: Cesium.ScreenSpaceEventHandler
    ) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
    }

    private async drawSurfaceLine(viewer, positions) {
        // 获取地形数据提供者
        const terrainProvider = viewer.terrainProvider;

        // 将 Cartesian3 转换为 Cartographic（经纬度）
        const cartographicPositions = positions.map(position => {return Cesium.Cartographic.fromCartesian(position);}
        );

        // 获取最详细的地形高度
        const updatedPositions = await Cesium.sampleTerrainMostDetailed(
            terrainProvider,
            cartographicPositions
        );

        // 将 Cartographic 转换回 Cartesian3
        const surfacePositions = updatedPositions.map(position => {return Cesium.Cartesian3.fromRadians(position.longitude, position.latitude, position.height);}
        );

        // 在地表绘制线
        viewer.entities.add({
            polyline: {
                positions: surfacePositions,
                width: 5,
                material: Cesium.Color.RED,
                clampToGround: true // 线将被钳制到地形
            }
        });
    }
}
