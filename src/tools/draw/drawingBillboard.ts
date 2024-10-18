import * as Cesium from 'cesium';
import MouseEvent from '../mouseBase/mouseBase';
import { DrawingTypeEnum } from '../../enum/enum';
import { EventCallback } from '../../type/type';

export default class DrawingBillboard extends MouseEvent {
    protected viewer: Cesium.Viewer;
    protected handler: Cesium.ScreenSpaceEventHandler;
    private billboardCollection: Cesium.BillboardCollection;
    private labelCollection: Cesium.LabelCollection;

    constructor(viewer: Cesium.Viewer, handler: Cesium.ScreenSpaceEventHandler) {
        super(viewer, handler);
        this.viewer = viewer;
        this.handler = handler;
        this.billboardCollection = this.viewer.scene.primitives.add(
            new Cesium.BillboardCollection()
        );
        this.labelCollection = this.viewer.scene.primitives.add(new Cesium.LabelCollection());
    }

    active(): void {
        this.deactivate();
        this.registerEvents();
    }

    deactivate(): void {
        this.clear();
        this.unRegisterEvents();
    }

    clear(): void {}

    addToolsEventListener<T>(eventName: string, callback: EventCallback<T>) {
        this.addEventListener(eventName, callback);
    }

    removeToolsEventListener<T>(eventName: string, callback?: EventCallback<T>) {
        this.removeEventListener(eventName, callback);
    }

    protected leftClickEvent(): void {
        this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
            const currentPosition = this.viewer.scene.pickPosition(e.position);
            if (!currentPosition && !Cesium.defined(currentPosition)) return;

            this.create(currentPosition, { id: new Date().getTime() });
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    protected rightClickEvent(): void {
        this.handler.setInputAction(() => {
            this.unRegisterEvents();
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    // 根据情况定 是否将图标放大缩小事件放入到业务
    protected hoverEvent(): void {
        let lastPickedBillboard: Cesium.Billboard | undefined;

        this.handler.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
            const pickedObject = this.viewer.scene.pick(e.endPosition);

            // 恢复上一个广告牌的大小
            if (lastPickedBillboard) {
                lastPickedBillboard.scale = 1.0; // 恢复默认大小
                lastPickedBillboard = undefined;
            }

            // 检测鼠标悬停的广告牌
            if (
                Cesium.defined(pickedObject) &&
                pickedObject.primitive instanceof Cesium.Billboard
            ) {
                const pickedBillboard = pickedObject.primitive as Cesium.Billboard;

                // 缩放广告牌
                pickedBillboard.scale = 1.5; // 放大广告牌
                lastPickedBillboard = pickedBillboard; // 保存当前广告牌以便后续恢复大小
            }
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }

    create(
        position: Cesium.Cartesian3,
        options?: {
            id?: number | string;
            billboard?: Partial<Cesium.Billboard.ConstructorOptions> & { [key: string]: unknown };
            label?: Partial<Cesium.Billboard.ConstructorOptions> & { [key: string]: unknown };
        }
    ) {
        if (!Cesium.defined(position)) {
            this.dispatch('cesiumToolsFxt', {
                type: DrawingTypeEnum.billboard + 'Create',
                status: 'failed',
                reason: 'Position is not defined',
            });
            return;
        }

        try {
            // 创建广告牌
            this.billboardCollection.add({
                id: options?.id,
                position: position,
                image: '/public/resources/images/特征点_选中.png',
                width: 24,
                height: 24,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                show: true,
                ...options?.billboard,
            });

            // 创建标签
            this.labelCollection.add({
                id: options?.id,
                position: position,
                text: `Point`,
                font: '14px sans-serif',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                showBackground: true,
                verticalOrigin: Cesium.VerticalOrigin.TOP,
                pixelOffset: new Cesium.Cartesian2(-12, -35),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                ...options?.label,
            });

            // 分发成功事件
            this.dispatch('cesiumToolsFxt', {
                type: DrawingTypeEnum.billboard + 'Create',
                status: 'finished',
                position: position,
            });
        } catch (error) {
            // 分发失败事件
            this.dispatch('cesiumToolsFxt', {
                type: DrawingTypeEnum.billboard + 'Create',
                status: 'failed',
                reason: error,
            });
        }
    }

    edit(
        id: number | string,
        viewer: Cesium.Viewer,
        options: {
            id?: number | string;
            billboard?: Partial<Cesium.Billboard.ConstructorOptions> & { [key: string]: unknown };
            label?: Partial<Cesium.Label.ConstructorOptions> & { [key: string]: unknown };
        }
    ) {
        let isEdited = false;
        const primitivesLength = viewer.scene.primitives.length;

        try {
            for (let i = 0; i < primitivesLength; i++) {
                const primitive = viewer.scene.primitives.get(i);
                if (primitive instanceof Cesium.BillboardCollection) {
                    for (let j = 0; j < primitive.length; j++) {
                        const curBillboard = primitive.get(j);
                        // eslint-disable-next-line max-depth
                        if (curBillboard.id === id && options.billboard) {
                            Object.assign(curBillboard, options.billboard);
                            isEdited = true;
                        }
                    }
                }

                if (primitive instanceof Cesium.LabelCollection) {
                    for (let j = 0; j < primitive.length; j++) {
                        const curLabel = primitive.get(j);
                        // eslint-disable-next-line max-depth
                        if (curLabel.id === id && options.label) {
                            Object.assign(curLabel, options.label);
                            isEdited = true;
                        }
                    }
                }
            }

            if (isEdited) {
                this.dispatch('cesiumToolsFxt', {
                    type: DrawingTypeEnum.billboard + 'Edit',
                    status: 'finished',
                    id: id,
                });
            } else {
                this.dispatch('cesiumToolsFxt', {
                    type: DrawingTypeEnum.billboard + 'Edit',
                    status: 'failed',
                    reason: 'No matching primitive found',
                });
            }
        } catch (error) {
            this.dispatch('cesiumToolsFxt', {
                type: DrawingTypeEnum.billboard + 'Edit',
                status: 'failed',
                reason: error,
            });
        }
    }
}
