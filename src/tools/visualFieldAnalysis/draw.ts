import * as Cesium from 'cesium';
import ViewShed from './visualFieldAnalysis';
import PlotDrawTip from '../mouseRemove/PlotDrawTip';
import MouseDrawBase from '../mouseBase/mouseBase';

enum CurrentCountEnum {
    padding,
    start,
    end,
}
interface ViewerWithElement extends Cesium.Viewer {
    _element: HTMLElement;
}

export default class Draw extends MouseDrawBase {
    viewer: Cesium.Viewer;
    handler: Cesium.ScreenSpaceEventHandler;
    startPosition: Cesium.Cartesian3 | undefined;
    endPosition: Cesium.Cartesian3 | undefined;
    currentClickCount: CurrentCountEnum;
    drawViewshedEntity: ViewShed | undefined;
    plotDrawTip: PlotDrawTip | undefined;
    drawEntity: Cesium.Entity | undefined;

    constructor(
        viewer: Cesium.Viewer,
        handler: Cesium.ScreenSpaceEventHandler
    ) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
        this.startPosition = undefined;
        this.currentClickCount = CurrentCountEnum.padding;
    }

    active(): void {
        this.deactivate();
        this.registerEvents();
        (this.viewer as ViewerWithElement)._element.style.cursor = 'crosshair';
        this.plotDrawTip = new PlotDrawTip(this.viewer);
        this.plotDrawTip.setContent(['左键点击开始绘制']);
    }

    clear(): void {
        if (this.drawViewshedEntity) {
            this.drawViewshedEntity.clear();
        }
    }

    deactivate() {
        this.currentClickCount = 0;
        this.drawEntity = undefined;
        this.endPosition = undefined;
        this.startPosition = undefined;
        (this.viewer as ViewerWithElement)._element.style.cursor = 'default';
        this.unRegisterEvents();
        if (!this.plotDrawTip) return;
        this.plotDrawTip.remove();
        this.plotDrawTip = undefined;
    }

    leftClickEvent() {
        //单击鼠标左键画点
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            this.currentClickCount++;
            const currentPosition = this.viewer.scene.pickPosition(e.position);
            //第一次点击
            if (this.currentClickCount === CurrentCountEnum.start) {
                if (currentPosition && Cesium.defined(currentPosition)) {
                    this.plotDrawTip?.setContent(['左键点击结束点，完成绘制']);
                    if (!this.drawViewshedEntity) {
                        this.drawViewshedEntity = new ViewShed(this.viewer, {
                            viewPosition: currentPosition,
                            viewPositionEnd: currentPosition,
                        });
                    } else {
                        this.drawViewshedEntity.viewPosition = currentPosition;
                        this.drawViewshedEntity.viewPositionEnd =
                            currentPosition;
                    }
                }
            }
            //第二次点击
            if (this.currentClickCount === CurrentCountEnum.end) {
                if (!currentPosition && Cesium.defined(currentPosition)) {
                    this.drawViewshedEntity?.updatePosition(currentPosition);
                    this.drawViewshedEntity?.update();
                }
                this.deactivate();
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    mouseMoveEvent() {
        this.handler.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
            this.endPosition = this.viewer.scene.pickPosition(e.endPosition);
            if (!this.endPosition) return;
            this.plotDrawTip &&
                this.plotDrawTip.updatePosition(this.endPosition);
            if (this.currentClickCount === CurrentCountEnum.start) {
                if (this.drawViewshedEntity) {
                    this.drawViewshedEntity.updatePosition(this.endPosition);
                    this.drawViewshedEntity.update();
                }
            }
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }
}
