import { InvalidateSync } from "./invalidateSync";

export class RepeatSync {
    readonly interval: number;
    readonly sync: InvalidateSync;
    private _timer: any;

    constructor(interval: number, command: () => Promise<void>) {
        this.interval = interval;
        this.sync = new InvalidateSync(command);
        this._timer = setInterval(() => this.sync.invalidate(), interval);
    }

    invalidate = () => {
        this.sync.invalidate();
    }

    stop = () => {
        this.sync.stop();
        clearInterval(this._timer);
    }
}