type EventCallback<T> = (event: CustomEvent<T>) => void;

export default class CesiumToolsManage {
    private eventTarget: EventTarget;

    constructor() {
        this.eventTarget = new EventTarget();
    }

    dispatch<T>(eventName: string, data: T): void {
        const event = new CustomEvent<T>(eventName, { detail: data });
        this.eventTarget.dispatchEvent(event);
    }

    addEventListener<T>(eventName: string, callback: EventCallback<T>): void {
        this.eventTarget.addEventListener(eventName, callback as EventListener);
    }

    removeEventListener<T>(eventName: string, callback?: EventCallback<T>): void {
        this.eventTarget.removeEventListener(eventName, callback as EventListener);
    }
}
