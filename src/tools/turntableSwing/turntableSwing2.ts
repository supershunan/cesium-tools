import * as Cesium from 'cesium';
import glsl from './glsl';
interface Options {
    /** 转动角度 */
    angleInDegrees?: number;
    /** 扇形大小 */
    sectorSize?: number;
}
/** 模拟雷达转台旋转 */
export default class TurntableSwing {
    viewer: Cesium.Viewer;
    options: Options;

    constructor(viewer: Cesium.Viewer, options: Options) {
        this.viewer = viewer;
        this.options = options;
    }

    initTurntable(currentPosition: Cesium.Cartesian3): void {
        const cartographicPosition =
            Cesium.Ellipsoid.WGS84.cartesianToCartographic(currentPosition);
        const longitude = Cesium.Math.toDegrees(cartographicPosition.longitude);
        const latitude = Cesium.Math.toDegrees(cartographicPosition.latitude);
        const height = cartographicPosition.height;

        this.viewer.scene.globe.depthTestAgainstTerrain = true;

        this.addRadarScanPostStage(
            Cesium.Cartographic.fromDegrees(longitude, latitude, height),
            300,
            Cesium.Color.YELLOW.withAlpha(0.1),
            5000
        );
    }

    addRadarScanPostStage(
        cartographicCenter: Cesium.Cartographic, // Cartographic 对象，弧度为单位
        radius: number,
        scanColor: Cesium.Color,
        duration: number
    ) {
        const ScanSegmentShader = glsl;

        const cartesian3Center = Cesium.Cartographic.toCartesian(cartographicCenter); // 返回一个新的 Cartesian3 坐标
        /** 原点的四维坐标 */
        const cartesian4Center = new Cesium.Cartesian4( // 创建四维笛卡尔坐标
            cartesian3Center.x,
            cartesian3Center.y,
            cartesian3Center.z,
            1
        );

        const newCartographicCenter1 = new Cesium.Cartographic(
            cartographicCenter.longitude,
            cartographicCenter.latitude,
            cartographicCenter.height + 100
        );
        const newCartesian3Center1 = Cesium.Cartographic.toCartesian(newCartographicCenter1);
        /** 高程抬高 100 后的四维坐标 */
        const newCartesian4Center1 = new Cesium.Cartesian4(
            newCartesian3Center1.x,
            newCartesian3Center1.y,
            newCartesian3Center1.z,
            1
        );

        const newCartographicCenter2 = new Cesium.Cartographic(
            cartographicCenter.longitude + Cesium.Math.toRadians(0.001),
            cartographicCenter.latitude,
            cartographicCenter.height
        );
        const newCartesian3Center2 = Cesium.Cartographic.toCartesian(newCartographicCenter2);
        const newCartesian4Center2 = new Cesium.Cartesian4(
            newCartesian3Center2.x,
            newCartesian3Center2.y,
            newCartesian3Center2.z,
            1
        );

        const _RotateQ = new Cesium.Quaternion(); // 四维坐标，表示三维空间中的旋转
        const _RotateM = new Cesium.Matrix3(); // 3x3 矩阵，可作为列主序数组进行索引

        const time = new Date().getTime();

        const scratchCartesian4Center = new Cesium.Cartesian4();
        const scratchCartesian4Center1 = new Cesium.Cartesian4();
        const scratchCartesian4Center2 = new Cesium.Cartesian4();
        const scratchCartesian3Normal = new Cesium.Cartesian3();
        const scratchCartesian3Normal1 = new Cesium.Cartesian3();

        const u_rotationOffset = Cesium.Math.toRadians(0); // 例如设置为30度

        const ScanPostStage = new Cesium.PostProcessStage({
            fragmentShader: ScanSegmentShader,
            uniforms: {
                /** 扫描中心 */
                u_scanCenterEC: () => {
                    // 计算矩阵和列向量的乘积 返回四维笛卡尔坐标
                    return Cesium.Matrix4.multiplyByVector(
                        this.viewer.camera.viewMatrix, // 获取视图矩阵
                        cartesian4Center,
                        scratchCartesian4Center
                    );
                },
                /** 扫描平面 */
                u_scanPlaneNormalEC: () => {
                    // 计算 原数据和高程抬高100后数据的差值的矩阵和列向量的乘积 返回做差后的四维笛卡尔坐标
                    const temp = Cesium.Matrix4.multiplyByVector(
                        this.viewer.camera.viewMatrix,
                        cartesian4Center,
                        scratchCartesian4Center
                    );
                    const temp1 = Cesium.Matrix4.multiplyByVector(
                        this.viewer.camera.viewMatrix,
                        newCartesian4Center1,
                        scratchCartesian4Center1
                    );
                    scratchCartesian3Normal.x = temp1.x - temp.x;
                    scratchCartesian3Normal.y = temp1.y - temp.y;
                    scratchCartesian3Normal.z = temp1.z - temp.z;

                    // 返回一个规范化后的笛卡尔坐标
                    Cesium.Cartesian3.normalize(scratchCartesian3Normal, scratchCartesian3Normal);
                    return scratchCartesian3Normal;
                },
                /** 扫描半径 */
                u_radius: radius,
                /** 扫描线 返回随时间变化的笛卡尔坐标 */
                u_scanLineNormalEC: () => {
                    const temp = Cesium.Matrix4.multiplyByVector(
                        this.viewer.camera.viewMatrix,
                        cartesian4Center,
                        scratchCartesian4Center
                    );
                    const temp1 = Cesium.Matrix4.multiplyByVector(
                        this.viewer.camera.viewMatrix,
                        newCartesian4Center1,
                        scratchCartesian4Center1
                    );
                    const temp2 = Cesium.Matrix4.multiplyByVector(
                        this.viewer.camera.viewMatrix,
                        newCartesian4Center2,
                        scratchCartesian4Center2
                    );

                    scratchCartesian3Normal.x = temp1.x - temp.x;
                    scratchCartesian3Normal.y = temp1.y - temp.y;
                    scratchCartesian3Normal.z = temp1.z - temp.z;

                    Cesium.Cartesian3.normalize(scratchCartesian3Normal, scratchCartesian3Normal);

                    scratchCartesian3Normal1.x = temp2.x - temp.x;
                    scratchCartesian3Normal1.y = temp2.y - temp.y;
                    scratchCartesian3Normal1.z = temp2.z - temp.z;

                    const customAngleInDegrees = 180; // 自定义角度
                    const customAngleInRadians = Cesium.Math.toRadians(customAngleInDegrees); // 弧度单位的角度
                    const tempTime = ((new Date().getTime() - time) % duration) / duration; // 归一化 返回的是 [0, 1] 之间的数
                    const angle = Math.sin(tempTime * Math.PI) * customAngleInRadians; // 生成一个随时间变化的正弦波 [-1, 1] 之间，返回的是 [-π, π]

                    Cesium.Quaternion.fromAxisAngle(scratchCartesian3Normal, angle, _RotateQ); // 计算表示绕轴旋转的四元数 返回四元数
                    Cesium.Matrix3.fromQuaternion(_RotateQ, _RotateM); // 根据提供的四元数计算 3x3 旋转矩阵
                    // 计算矩阵和列向量的乘积 返回三维笛卡尔坐标
                    Cesium.Matrix3.multiplyByVector(
                        _RotateM,
                        scratchCartesian3Normal1,
                        scratchCartesian3Normal1
                    );
                    Cesium.Cartesian3.normalize(scratchCartesian3Normal1, scratchCartesian3Normal1);
                    return scratchCartesian3Normal1;
                },
                /** 扫描颜色 */
                u_scanColor: scanColor,
                u_sectorSize: () => {
                    return 60;
                },
                u_scanAngle: () => {
                    return 30;
                },
                u_rotationOffset: () => {
                    return Cesium.Math.toRadians(90);
                },
            },
        });

        return this.viewer.scene.postProcessStages.add(ScanPostStage);
    }
}
