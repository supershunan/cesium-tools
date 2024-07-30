import * as Cesium from 'cesium';

/** 模拟雷达转台旋转 */
export default class TurntableSwing {
    viewer: Cesium.Viewer;
    radarEntity?: Cesium.Entity;
    speed: number = 0.2;
    loop: boolean = false;
    maxAngle: number = 180;
    /** 回摆方向 */
    up: boolean = true;
    // radii: number = 5000;
    // innerRadii: number = 10;
    // minimumClock: number = 0;
    // maximumClock: number = 60;
    // fillColor: string = 'rgba(255, 69, 0,  0.2)';
    // outlineColor: string = 'rgba(255, 69, 0, 1)';

    constructor(viewer: Cesium.Viewer) {
        this.viewer = viewer;
    }

    initTurntable(): void {
        let num = 0;
        const position = Cesium.Cartesian3.fromDegrees(110, 40, 1);
        this.radarEntity = this.viewer.entities.add({
            position: position,
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

    /** 左偏角值 */
    minimumClock(val: number) {
        if (this.radarEntity?.ellipsoid) {
            this.radarEntity.ellipsoid.minimumClock = Cesium.Math.toRadians(val);
        }
    }

    /** 右偏角值 */
    maximumClock(val: number) {
        if (this.radarEntity?.ellipsoid) {
            this.radarEntity.ellipsoid.maximumClock = Cesium.Math.toRadians(val);
        }
    }

    /** 外径大小 */
    radii(val: number) {
        if (this.radarEntity?.ellipsoid) {
            this.radarEntity.ellipsoid.radii = new Cesium.Cartesian3(val, val, 1);
        }
    }

    /** 内径大小 */
    innerRadii(val: number) {
        if (this.radarEntity?.ellipsoid) {
            this.radarEntity.ellipsoid.innerRadii = new Cesium.Cartesian3(val, val, 1);
        }
    }

    /** 填充色 */
    fillColor(val: string) {
        if (this.radarEntity?.ellipsoid) {
            this.radarEntity.ellipsoid.material = Cesium.Color.fromCssColorString(val);
        }
    }

    /** 边框色 */
    outlineColor(val: string) {
        if (this.radarEntity?.ellipsoid) {
            this.radarEntity.ellipsoid.outlineColor = Cesium.Color.fromCssColorString(val);
        }
    }
}
