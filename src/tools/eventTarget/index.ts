import CesiumToolsManage from './eventTarget';

type EventCallback<T> = (event: CustomEvent<T>) => void;
interface CesiumToolsMangeProps {
    dispatch: <T>(eventName: string, data: T) => void;
    /** 事件名 cesiumToolsFxt */
    addToolsEventListener: (eventName: string, callback: EventCallback<unknown>) => void;
    /** 事件名 cesiumToolsFxt */
    removeToolsEventListener: (eventName: string, callback?: EventCallback<unknown>) => void;
}

/** 工具注册事件 */
export default function useCesiumToolsManage(): CesiumToolsMangeProps {
    let instance;

    if (!instance) {
        instance = new CesiumToolsManage();
    }

    const dispatch = <T>(eventName: string, data: T): void => {
        instance.dispatch(eventName, data);
    };

    const addEventListener = <T>(eventName: string, callback: EventCallback<T>): void => {
        instance.addEventListener(eventName, callback);
    };

    const removeEventListener = <T>(eventName: string, callback?: EventCallback<T>): void => {
        instance.removeEventListener(eventName, callback);
    };

    return {
        dispatch,
        addEventListener,
        removeEventListener,
    };
}
