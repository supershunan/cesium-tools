import glsl from './glsl';
import * as Cesium from 'cesium';
import { ViewShedOptions } from './type';

class ViewShed {
    /** Cesium三维视窗 */
    viewer: Cesium.Viewer;
    /** 开始坐标 */
    viewPosition: Cesium.Cartesian3;
    /** 结束坐标 */
    viewPositionEnd: Cesium.Cartesian3;
    /** 观测距离（单位`米`，默认值100）*/
    private viewDistance: number;
    /** 航向角（单位`度`，默认值0） */
    private viewHeading: number;
    /** 俯仰角（单位`度`，默认值0） */
    private viewPitch: number;
    /** 可视域水平夹角（单位`度`，默认值90） */
    horizontalViewAngle: number;
    /** 可视域垂直夹角（单位`度`，默认值60） */
    verticalViewAngle: number;
    /** 可视区域颜色（默认值`绿色`） */
    visibleAreaColor: Cesium.Color;
    /** 不可视区域颜色（默认值`红色`） */
    invisibleAreaColor: Cesium.Color;
    /** 阴影贴图是否可用 */
    enabled: boolean;
    /** 是否启用柔和阴影 */
    softShadows: boolean;
    /** 每个阴影贴图的大小 */
    size: number;
    /** 视锥线，是否显示 */
    isSketch: boolean;
    private sketch?: Cesium.Entity;
    private frustumOutline?: Cesium.Primitive;
    private postStage?: Cesium.PostProcessStage | Cesium.PostProcessStageComposite;
    private lightCamera?: Cesium.Camera;
    private shadowMap?: Cesium.ShadowMap;

    constructor(viewer: Cesium.Viewer, options: ViewShedOptions) {
        this.viewer = viewer;
        this.viewPosition = options.viewPosition;
        this.viewPositionEnd = options.viewPositionEnd;
        this.viewDistance = this.viewPositionEnd
            ? Cesium.Cartesian3.distance(
                  this.viewPosition,
                  this.viewPositionEnd
              )
            : options.viewDistance || 1000.0;
        this.viewHeading = this.viewPositionEnd
            ? this.getHeading(this.viewPosition, this.viewPositionEnd)
            : options.viewHeading || 0.0;
        this.viewPitch = this.viewPositionEnd
            ? this.getPitch(this.viewPosition, this.viewPositionEnd)
            : options.viewPitch || 0.0;
        this.horizontalViewAngle = options.horizontalViewAngle || 90.0;
        this.verticalViewAngle = options.verticalViewAngle || 60.0;
        this.visibleAreaColor = options.visibleAreaColor || Cesium.Color.GREEN;
        this.invisibleAreaColor =
            options.invisibleAreaColor || Cesium.Color.RED;
        this.enabled =
            typeof options.enabled === 'boolean' ? options.enabled : true;
        this.softShadows =
            typeof options.softShadows === 'boolean'
                ? options.softShadows
                : true;
        this.size = options.size || 2048;
        this.isSketch = true;
    }

    add() {
        this.createLightCamera();
        this.createShadowMap();
        this.drawSketch();
        this.createPostStage();
    }

    update() {
        this.clear();
        this.add();
        if (!this.isSketch) {
            this.clearSketch();
        }
    }

    /**
     * @method 更新终点坐标，从而实时更新绘制的实体的方向和半径
     *
     */
    updatePosition(viewPositionEnd: Cesium.Cartesian3) {
        this.viewPositionEnd = viewPositionEnd;
        this.viewDistance = Cesium.Cartesian3.distance(
            this.viewPosition,
            this.viewPositionEnd
        );
        this.viewHeading = this.getHeading(
            this.viewPosition,
            this.viewPositionEnd
        );
        this.viewPitch = this.getPitch(this.viewPosition, this.viewPositionEnd);
    }

    clear() {
        if (this.sketch) {
            this.viewer.entities.remove(this.sketch);
            this.sketch = undefined;
        }
        if (this.frustumOutline) {
            this.viewer.scene.primitives.destroy();
            this.frustumOutline = undefined;
        }
        if (this.postStage) {
            this.viewer.scene.postProcessStages.remove(this.postStage);
            this.postStage = undefined;
        }
    }

    private clearSketch() {
        if (this.sketch) {
            this.viewer.entities.remove(this.sketch);
            this.sketch = undefined;
        }
    }

    /**
     * @method 创建相机
     */
    private createLightCamera() {
        this.lightCamera = new Cesium.Camera(this.viewer.scene);
        this.lightCamera.position = this.viewPosition;
        if (!this.viewDistance) return;
        // 避免 viewDistance 太小，导致 cesium 报错
        if (this.viewDistance < 1) {
            const stringDistanceView = this.viewDistance.toString();
            let index;
            if (stringDistanceView.includes('.')) {
                index = stringDistanceView.split('.')[1].length;
            }
            this.viewDistance = this.viewDistance * Math.pow(10, Number(index) + 1);
        }
        this.lightCamera.frustum.near = this.viewDistance * 0.001; //近截面距离
        this.lightCamera.frustum.far = this.viewDistance; // 远截面距离
        const hr = Cesium.Math.toRadians(this.horizontalViewAngle);
        const vr = Cesium.Math.toRadians(this.verticalViewAngle);
        const aspectRatio =
            (this.viewDistance * Math.tan(hr / 2) * 2) /
            (this.viewDistance * Math.tan(vr / 2) * 2);
        this.lightCamera.frustum.aspectRatio = aspectRatio; // 截面宽高比
        // 视场角
        if (hr > vr) {
            this.lightCamera.frustum.fov = hr;
        } else {
            this.lightCamera.frustum.fov = vr;
        }
        this.lightCamera.setView({
            destination: this.viewPosition, // 相机最终的位置
            orientation: {
                // 相机的三个重要属性 x、y、z
                heading: Cesium.Math.toRadians(this.viewHeading || 0),
                pitch: Cesium.Math.toRadians(this.viewPitch || 0),
                roll: 0,
            },
        });
    }

    /**
     * @method 创建阴影贴图
     */
    private createShadowMap() {
        const shadowOption = {
            context: this.viewer.scene.context,
            lightCamera: this.lightCamera as Cesium.Camera,
            enabled: this.enabled,
            isPointLight: true,
            pointLightRadius: this.viewDistance,
            cascadesEnabled: false,
            size: this.size,
            softShadows: this.softShadows,
            normalOffset: false,
            fromLightSource: false,
        };
        this.shadowMap = new Cesium.ShadowMap(shadowOption);
        this.viewer.scene.shadowMap = this.shadowMap;
    }

    /**
     * @method 创建PostStage
     * 导入的glsl是做片元着色的
     */
    private createPostStage() {
        const fs = glsl;
        const postStage = new Cesium.PostProcessStage({
            fragmentShader: fs, // 要使用的片段着色器
            uniforms: {
                shadowMap_textureCube: () => {
                    this.shadowMap.update(
                        Reflect.get(this.viewer.scene, '_frameState')
                    );
                    return Reflect.get(this.shadowMap, '_shadowMapTexture');
                },
                shadowMap_matrix: () => {
                    this.shadowMap.update(
                        Reflect.get(this.viewer.scene, '_frameState')
                    );
                    return Reflect.get(this.shadowMap, '_shadowMapMatrix');
                },
                shadowMap_lightPositionEC: () => {
                    this.shadowMap.update(
                        Reflect.get(this.viewer.scene, '_frameState')
                    );
                    return Reflect.get(this.shadowMap, '_lightPositionEC');
                },
                shadowMap_normalOffsetScaleDistanceMaxDistanceAndDarkness:
                    () => {
                        this.shadowMap.update(
                            Reflect.get(this.viewer.scene, '_frameState')
                        );
                        const bias = this.shadowMap._pointBias;
                        return Cesium.Cartesian4.fromElements(
                            bias.normalOffsetScale,
                            this.shadowMap._distance,
                            this.shadowMap.maximumDistance,
                            0.0,
                            new Cesium.Cartesian4()
                        );
                    },
                shadowMap_texelSizeDepthBiasAndNormalShadingSmooth: () => {
                    this.shadowMap.update(
                        Reflect.get(this.viewer.scene, '_frameState')
                    );
                    const bias = this.shadowMap._pointBias;
                    const scratchTexelStepSize = new Cesium.Cartesian2();
                    const texelStepSize = scratchTexelStepSize;
                    texelStepSize.x = 1.0 / this.shadowMap._textureSize.x;
                    texelStepSize.y = 1.0 / this.shadowMap._textureSize.y;

                    return Cesium.Cartesian4.fromElements(
                        texelStepSize.x,
                        texelStepSize.y,
                        bias.depthBias,
                        bias.normalShadingSmooth,
                        new Cesium.Cartesian4()
                    );
                },
                camera_projection_matrix: (this.lightCamera as Cesium.Camera)
                    .frustum.projectionMatrix,
                camera_view_matrix: (this.lightCamera as Cesium.Camera)
                    .viewMatrix,
                helsing_viewDistance: () => {
                    return this.viewDistance;
                },
                helsing_visibleAreaColor: this.visibleAreaColor,
                helsing_invisibleAreaColor: this.invisibleAreaColor,
            }, // 一个对象，其属性将用于设置着色器统一值。属性可以是常量值或函数。常量值也可以是 URI、数据 URI 或用作纹理的 HTML 元素。
        });
        this.postStage = this.viewer.scene.postProcessStages.add(postStage);
    }

    /**
     * @method 创建视锥线
     */
    private drawFrustumOutline() {
        const scratchRight = new Cesium.Cartesian3();
        const scratchRotation = new Cesium.Matrix3();
        const scratchOrientation = new Cesium.Quaternion();
        const position = (this.lightCamera as Cesium.Camera).positionWC;
        const direction = (this.lightCamera as Cesium.Camera).directionWC;
        const up = (this.lightCamera as Cesium.Camera).upWC;
        let right = (this.lightCamera as Cesium.Camera).rightWC;
        right = Cesium.Cartesian3.negate(right, scratchRight);
        const rotation = scratchRotation;
        Cesium.Matrix3.setColumn(rotation, 0, right, rotation);
        Cesium.Matrix3.setColumn(rotation, 1, up, rotation);
        Cesium.Matrix3.setColumn(rotation, 2, direction, rotation);
        const orientation = Cesium.Quaternion.fromRotationMatrix(
            rotation,
            scratchOrientation
        );

        const instance = new Cesium.GeometryInstance({
            geometry: new Cesium.FrustumOutlineGeometry({
                frustum: (this.lightCamera as Cesium.Camera).frustum,
                origin: this.viewPosition,
                orientation: orientation,
            }),
            id: Math.random().toString(36).substr(2),
            attributes: {
                color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                    Cesium.Color.YELLOWGREEN
                ),
                show: new Cesium.ShowGeometryInstanceAttribute(true),
            },
        });

        this.frustumOutline = this.viewer.scene.primitives.add(
            new Cesium.Primitive({
                geometryInstances: [instance],
                appearance: new Cesium.PerInstanceColorAppearance({
                    flat: true,
                    translucent: false,
                }),
            })
        );
    }
    /**
     * @method 创建视网
     * 在实时绘制椭球实体时，其实不是一直创建entity，而是改变实体的方向(orientation)和改变椭球的半径(radii)
     */
    private drawSketch() {
        // 添加实例
        this.sketch = this.viewer.entities.add({
            name: 'sketch',
            position: new Cesium.CallbackProperty(() => {
                return this.viewPosition;
            }, false), // 动态属性 获取或设置位置
            orientation: new Cesium.CallbackProperty(() => {
                // 获取或设置相对于地形引力的方向，默认实体位置的东北向上
                return Cesium.Transforms.headingPitchRollQuaternion(
                    this.viewPosition,
                    Cesium.HeadingPitchRoll.fromDegrees(
                        this.viewHeading - 90.0,
                        this.viewPitch,
                        0.0
                    )
                );
            }, false),
            ellipsoid: {
                // 获取或设置椭圆体
                radii: new Cesium.CallbackProperty(() => {
                    return new Cesium.Cartesian3(
                        this.viewDistance,
                        this.viewDistance,
                        this.viewDistance
                    );
                }, false),
                innerRadii: new Cesium.Cartesian3(2.0, 2.0, 2.0),
                minimumClock: Cesium.Math.toRadians(
                    -this.horizontalViewAngle / 2
                ),
                maximumClock: Cesium.Math.toRadians(
                    this.horizontalViewAngle / 2
                ),
                minimumCone: Cesium.Math.toRadians(
                    this.verticalViewAngle + 7.75
                ),
                maximumCone: Cesium.Math.toRadians(
                    180 - this.verticalViewAngle - 7.75
                ),
                fill: false,
                outline: true,
                subdivisions: 256,
                stackPartitions: 64,
                slicePartitions: 64,
                outlineColor: Cesium.Color.YELLOWGREEN,
            },
        });
    }

    /**
     * @method 获取偏航角
     */
    private getHeading(fromPosition: Cesium.Cartesian3, toPosition: Cesium.Cartesian3) {
        const finalPosition = new Cesium.Cartesian3();
        const matrix4 = Cesium.Transforms.eastNorthUpToFixedFrame(fromPosition);
        Cesium.Matrix4.inverse(matrix4, matrix4);
        Cesium.Matrix4.multiplyByPoint(matrix4, toPosition, finalPosition);
        Cesium.Cartesian3.normalize(finalPosition, finalPosition);
        return Cesium.Math.toDegrees(
            Math.atan2(finalPosition.x, finalPosition.y)
        );
    }

    /**
     * @method 获取俯仰角
     */
    private getPitch(fromPosition: Cesium.Cartesian3, toPosition: Cesium.Cartesian3) {
        const finalPosition = new Cesium.Cartesian3();
        const matrix4 = Cesium.Transforms.eastNorthUpToFixedFrame(fromPosition);
        Cesium.Matrix4.inverse(matrix4, matrix4);
        Cesium.Matrix4.multiplyByPoint(matrix4, toPosition, finalPosition);
        Cesium.Cartesian3.normalize(finalPosition, finalPosition);
        return Cesium.Math.toDegrees(Math.asin(finalPosition.z));
    }
}

export default ViewShed;
