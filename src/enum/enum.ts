/** 鼠标点击步骤 */
export enum CurrentCountEnum {
    /** 等待 */
    padding,
    /** 第一次点击 */
    start,
    /** 第二次点击 */
    end,
}

export enum MouseStatusEnum {
    click = 'click',
    move = 'move',
}

export enum ToolsEventTypeEnum {
    /** 测距 */
    lengthMeasurement = 'lengthMeasurement',
    /** 面积 */
    areaMeasurement = 'areaMeasurement',
    /** 角度 */
    angleMeasurement = 'angleMeasurement',
    /** 高度 */
    theHeightMeasurement = 'theHeightMeasurement',
    /** 模拟雷达转台旋转分析 */
    turntableSwing = 'theTurntableSwing',
    /** 坡向分析 */
    slopDirectionAnalysis = 'slopDirectionAnalysis',
    /** 透视分析 */
    visibilityAnalysis = 'visibilityAnalysis',
    /** 通视分析 */
    visualFieldAnalysis = 'visualFieldAnalysis',
}
