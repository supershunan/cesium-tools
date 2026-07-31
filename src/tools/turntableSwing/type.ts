export interface TurntableParams {
    /** 扫描速度， 默认0.2 */
    speed?: number;
    /**
     * false: 回摆模式
     * true: 重复模式
     * 默认回摆模式
     */
    loop?: boolean;
    /** 摆动角度,默认 180 度 */
    maxAngle?: number;
    /** 回摆方向 */
    up?: boolean;
}

export interface GlobalTurntableMethods {
    /** 左偏角值 */
    minimumClock: (value: number) => void;
    /** 右偏角值 */
    maximumClock: (value: number) => void;
    /** 外径大小 */
    radii: (value: number) => void;
    /** 内径大小 */
    innerRadii: (value: number) => void;
    /** 填充色 rgba */
    fillColor: (value: string) => void;
    /** 边框色 rgba */
    outlineColor: (value: string) => void;
}
