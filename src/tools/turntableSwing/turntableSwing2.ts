import * as Cesium from "cesium";

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

    initTurntable(): void {
        this.viewer.scene.globe.depthTestAgainstTerrain = true;
        this.addRadarScanPostStage(
            Cesium.Cartographic.fromDegrees(110, 60, 1),
            2000,
            Cesium.Color.YELLOW,
            2000,
        );
        this.viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(110, 60, 10000),
        });
    }

    addRadarScanPostStage(
        cartographicCenter: Cesium.Cartographic,
        radius: number,
        scanColor: Cesium.Color,
        duration: number,
    ) {
        const size = 30;
        const ScanSegmentShader = `
            #version 300 es
            precision highp float;

            uniform sampler2D colorTexture;
            uniform sampler2D depthTexture;
            in vec2 v_textureCoordinates;
            uniform vec4 u_scanCenterEC;
            uniform vec3 u_scanPlaneNormalEC;
            uniform vec3 u_scanLineNormalEC;
            uniform float u_radius;
            uniform vec4 u_scanColor;
            out vec4 fragColor;

            vec4 toEye(in vec2 uv, in float depth) {
                vec2 xy = vec2((uv.x * 2.0 - 1.0), (uv.y * 2.0 - 1.0));
                vec4 posInCamera = czm_inverseProjection * vec4(xy, depth, 1.0);
                posInCamera = posInCamera / posInCamera.w;
                return posInCamera;
            }

            vec3 pointProjectOnPlane(in vec3 planeNormal, in vec3 planeOrigin, in vec3 point) {
                vec3 v01 = point - planeOrigin;
                float d = dot(planeNormal, v01);
                return (point - planeNormal * d);
            }

            float getDepth(in vec4 depth) {
                float z_window = czm_unpackDepth(depth);
                z_window = czm_reverseLogDepth(z_window);
                float n_range = czm_depthRange.near;
                float f_range = czm_depthRange.far;
                return (2.0 * z_window - n_range - f_range) / (f_range - n_range);
            }

            void main() {
                vec4 color = texture(colorTexture, v_textureCoordinates);
                float depth = getDepth(texture(depthTexture, v_textureCoordinates));
                vec4 viewPos = toEye(v_textureCoordinates, depth);
                vec3 prjOnPlane = pointProjectOnPlane(u_scanPlaneNormalEC.xyz, u_scanCenterEC.xyz, viewPos.xyz);
                float dis = length(prjOnPlane.xyz - u_scanCenterEC.xyz);

                // 计算当前像素与扫描中心的角度
                vec3 centerToPixel = normalize(prjOnPlane - u_scanCenterEC.xyz);
                float angle = acos(dot(centerToPixel, u_scanLineNormalEC));

                // 扇形为 30 度
                float maxAngle = radians(${size/2}.0);

                // 仅当像素在30度圆弧内时, 进行颜色混合
                if (dis < u_radius && angle < maxAngle) {
                    color = mix(color, u_scanColor, 1.0);  // 设置为完全的扫描颜色
                }
                fragColor = color;
            }
        `;

        const _Cartesian3Center =
            Cesium.Cartographic.toCartesian(cartographicCenter);
        const _Cartesian4Center = new Cesium.Cartesian4(
            _Cartesian3Center.x,
            _Cartesian3Center.y,
            _Cartesian3Center.z,
            1
        );

        const _CartographicCenter1 = new Cesium.Cartographic(
            cartographicCenter.longitude,
            cartographicCenter.latitude,
            cartographicCenter.height + 100
        );
        const _Cartesian3Center1 =
            Cesium.Cartographic.toCartesian(_CartographicCenter1);
        const _Cartesian4Center1 = new Cesium.Cartesian4(
            _Cartesian3Center1.x,
            _Cartesian3Center1.y,
            _Cartesian3Center1.z,
            1
        );

        const _CartographicCenter2 = new Cesium.Cartographic(
            cartographicCenter.longitude + Cesium.Math.toRadians(0.001),
            cartographicCenter.latitude,
            cartographicCenter.height
        );
        const _Cartesian3Center2 =
            Cesium.Cartographic.toCartesian(_CartographicCenter2);
        const _Cartesian4Center2 = new Cesium.Cartesian4(
            _Cartesian3Center2.x,
            _Cartesian3Center2.y,
            _Cartesian3Center2.z,
            1
        );

        const _RotateQ = new Cesium.Quaternion();
        const _RotateM = new Cesium.Matrix3();

        const _time = new Date().getTime();

        const _scratchCartesian4Center = new Cesium.Cartesian4();
        const _scratchCartesian4Center1 = new Cesium.Cartesian4();
        const _scratchCartesian4Center2 = new Cesium.Cartesian4();
        const _scratchCartesian3Normal = new Cesium.Cartesian3();
        const _scratchCartesian3Normal1 = new Cesium.Cartesian3();

        const ScanPostStage = new Cesium.PostProcessStage({
            fragmentShader: ScanSegmentShader,
            uniforms: {
                u_scanCenterEC: () => {
                    return Cesium.Matrix4.multiplyByVector(
                        this.viewer.camera.viewMatrix,
                        _Cartesian4Center,
                        _scratchCartesian4Center
                    );
                },
                u_scanPlaneNormalEC: () => {
                    const temp = Cesium.Matrix4.multiplyByVector(
                        this.viewer.camera.viewMatrix,
                        _Cartesian4Center,
                        _scratchCartesian4Center
                    );
                    const temp1 = Cesium.Matrix4.multiplyByVector(
                        this.viewer.camera.viewMatrix,
                        _Cartesian4Center1,
                        _scratchCartesian4Center1
                    );
                    _scratchCartesian3Normal.x = temp1.x - temp.x;
                    _scratchCartesian3Normal.y = temp1.y - temp.y;
                    _scratchCartesian3Normal.z = temp1.z - temp.z;

                    Cesium.Cartesian3.normalize(
                        _scratchCartesian3Normal,
                        _scratchCartesian3Normal
                    );
                    return _scratchCartesian3Normal;
                },
                u_radius: radius,
                u_scanLineNormalEC: () => {
                    const temp = Cesium.Matrix4.multiplyByVector(
                        this.viewer.camera.viewMatrix,
                        _Cartesian4Center,
                        _scratchCartesian4Center
                    );
                    const temp1 = Cesium.Matrix4.multiplyByVector(
                        this.viewer.camera.viewMatrix,
                        _Cartesian4Center1,
                        _scratchCartesian4Center1
                    );
                    const temp2 = Cesium.Matrix4.multiplyByVector(
                        this.viewer.camera.viewMatrix,
                        _Cartesian4Center2,
                        _scratchCartesian4Center2
                    );

                    _scratchCartesian3Normal.x = temp1.x - temp.x;
                    _scratchCartesian3Normal.y = temp1.y - temp.y;
                    _scratchCartesian3Normal.z = temp1.z - temp.z;

                    Cesium.Cartesian3.normalize(
                        _scratchCartesian3Normal,
                        _scratchCartesian3Normal
                    );

                    _scratchCartesian3Normal1.x = temp2.x - temp.x;
                    _scratchCartesian3Normal1.y = temp2.y - temp.y;
                    _scratchCartesian3Normal1.z = temp2.z - temp.z;

                    const customAngleInDegrees = 180; // 自定义角度
                    const customAngleInRadians = Cesium.Math.toRadians(customAngleInDegrees);
                    const tempTime = ((new Date().getTime() - _time) % duration) / duration;
                    const angle = Math.sin(tempTime * Math.PI) * customAngleInRadians;

                    Cesium.Quaternion.fromAxisAngle(
                        _scratchCartesian3Normal,
                        angle,
                        _RotateQ
                    );
                    Cesium.Matrix3.fromQuaternion(_RotateQ, _RotateM);
                    Cesium.Matrix3.multiplyByVector(
                        _RotateM,
                        _scratchCartesian3Normal1,
                        _scratchCartesian3Normal1
                    );
                    Cesium.Cartesian3.normalize(
                        _scratchCartesian3Normal1,
                        _scratchCartesian3Normal1
                    );
                    return _scratchCartesian3Normal1;
                },
                u_scanColor: scanColor,
            },
        });

        return this.viewer.scene.postProcessStages.add(ScanPostStage);
    }

}
