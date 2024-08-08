import * as Cesium from 'cesium';

interface Params {
    /** 扫描速度 */
    speed?: number;
    /**
     * false: 回摆模式
     * true: 重复模式
     */
    loop?: boolean;
    /** 摆动角度,默认 180 度 */
    maxAngle?: number;
    /** 回摆方向 */
    up?: boolean;
}


/** 模拟雷达转台旋转 */
export default class TurntableSwing {
    viewer: Cesium.Viewer;
    position: Cesium.Cartesian3;
    params?: Params;
    radarEntity?: Cesium.Entity;
    /** 扫描速度 */
    speed: number = 0.2;
    /**
     * false: 回摆模式
     * true: 重复模式
     */
    loop: boolean = false;
    /** 摆动角度,默认 180 度 */
    maxAngle: number = 180;
    /** 回摆方向 */
    up: boolean = true;

    constructor(viewer: Cesium.Viewer, position: Cesium.Cartesian3, params?: Params) {
        this.viewer = viewer;
        this.position = position;
        this.speed = this.params?.speed ?? this.speed;
        this.loop = this.params?.loop ?? this.loop;
        this.maxAngle = this.params?.maxAngle ?? this.maxAngle;
        this.up = this.params?.up ?? this.up;
    }

    add(): void {
        let num = 0;
        const position = this.position;
        this.radarEntity = this.viewer.entities.add({
            position: position,
            // 获取或设置相对于地心引力 (ECEF) 的方向。默认为实体位置的东北向上。
            orientation: new Cesium.CallbackProperty(() => {
                const speed = this.speed;
                if (this.loop) {
                    num += speed;
                    if (num >= this.maxAngle) num = 0;
                } else {
                    this.up ? (num += speed) : (num -= speed);
                    if (num >= this.maxAngle) this.up = false;
                    if (num <= 0) this.up = true;
                }
                return Cesium.Transforms.headingPitchRollQuaternion(
                    position,
                    new Cesium.HeadingPitchRoll((num * Math.PI) / 180, 0, 0)
                );
            }, false),
            // 设置椭圆
            ellipsoid: {
                radii: new Cesium.Cartesian3(5000.0, 5000.0, 1.0), // 外半径
                innerRadii: new Cesium.Cartesian3(1.0, 1.0, 1.0), // 内半径
                minimumClock: Cesium.Math.toRadians(0),
                maximumClock: Cesium.Math.toRadians(60),
                minimumCone: Cesium.Math.toRadians(90), //建议设置上下偏角为90
                maximumCone: Cesium.Math.toRadians(90),
                material: Cesium.Color.fromCssColorString(
                    'rgba(255, 69, 0,  0.2)'
                ),
                outline: true,
                outlineColor: Cesium.Color.fromCssColorString(
                    'rgba(255, 69, 0, 1)'
                ),
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
        });
        this.viewer.flyTo(this.viewer.entities);
    }

    clear(): void {
        if (this.radarEntity) {
            this.viewer.entities.remove(this.radarEntity);
        }
    }

    /** 左偏角值 */
    minimumClock(val: number) {
        if (this.radarEntity?.ellipsoid) {
            this.radarEntity.ellipsoid.minimumClock =
                Cesium.Math.toRadians(val);
        }
    }

    /** 右偏角值 */
    maximumClock(val: number) {
        if (this.radarEntity?.ellipsoid) {
            this.radarEntity.ellipsoid.maximumClock =
                Cesium.Math.toRadians(val);
        }
    }

    /** 外径大小 */
    radii(val: number) {
        if (this.radarEntity?.ellipsoid) {
            this.radarEntity.ellipsoid.radii = new Cesium.Cartesian3(
                val,
                val,
                1
            );
        }
    }

    /** 内径大小 */
    innerRadii(val: number) {
        if (this.radarEntity?.ellipsoid) {
            this.radarEntity.ellipsoid.innerRadii = new Cesium.Cartesian3(
                val,
                val,
                1
            );
        }
    }

    /** 填充色 rgba */
    fillColor(val: string) {
        if (this.radarEntity?.ellipsoid) {
            this.radarEntity.ellipsoid.material =
                Cesium.Color.fromCssColorString(val);
        }
    }

    /** 边框色 rgba */
    outlineColor(val: string) {
        if (this.radarEntity?.ellipsoid) {
            this.radarEntity.ellipsoid.outlineColor =
                Cesium.Color.fromCssColorString(val);
        }
    }
}
