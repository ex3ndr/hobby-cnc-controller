import { log } from "../../utils/log";
import { Queue } from "../../utils/queue";
import { TransportStream } from "./TransportStream";

export class MultiplexTransport<T> {

    readonly stream: TransportStream;
    private _queues: Queue<T>[] = [];
    private _closed = false;

    constructor(stream: TransportStream, framer: (src: TransportStream) => Promise<T>) {
        this.stream = stream;
        this.stream.onClosed = () => {
            this._closed = true;
            let qq = this._queues;
            this._queues = [];
            for (const queue of qq) {
                queue.close(new Error('Transport disconnected'));
            }
        }

        // Read loop
        (async () => {
            while (!this._closed) {

                // Read frame
                let frame: T;
                try {
                    frame = await framer(stream);
                } catch (e) {
                    if (this._closed) {
                        return; // Ignore error if already closed
                    } else {
                        throw e;
                    }
                }

                log('multiplex', 'Received frame', frame);

                // Push frame to all queues
                let a = [...this._queues];
                for (let q of a) {
                    q.push(frame);
                }
            }
        })();
    }

    send(src: Buffer | string) {
        if (this._closed) {
            throw new Error('Transport closed');
        }
        this.stream.send(src);
    }

    createReader(): TransportReader<T> {
        if (this._closed) {
            throw new Error('Transport closed');
        }
        const queue = new Queue<T>();
        this._queues.push(queue);
        return new TransportReader(queue, () => {
            const index = this._queues.indexOf(queue);
            if (index >= 0) {
                this._queues.splice(index, 1);
            }
        });
    }
}

export class TransportReader<T> {
    readonly queue: Queue<T>;
    private readonly closer: () => void;

    constructor(queue: Queue<T>, closer: () => void) {
        this.queue = queue;
        this.closer = closer;
    }

    read() {
        return this.queue.get();
    }

    close = () => {
        this.closer();
    }
}