import { AsyncLock } from "../../utils/lock";
import { Transport } from "./Transport";

export class TransportStream {
    readonly transport: Transport;
    private lock = new AsyncLock();
    private buffer: Buffer = Buffer.alloc(0);
    onClosed: (() => void) | null = null;

    constructor(transport: Transport) {
        this.transport = transport;
        this.transport.onClosed = () => {
            if (this.onClosed) {
                this.onClosed();
            }
        }
    }

    get connected() {
        return this.transport.connected;
    }

    send(data: Buffer | string) {
        if (typeof data === 'string') {
            data = Buffer.from(data);
        }
        this.transport.send(data);
    }

    async peekBytes(size: number) {
        return await this.lock.inLock(async () => {

            // Populate cache
            while (this.buffer.length < size) {
                let b = await this.transport.read();
                this.buffer = Buffer.concat([this.buffer, b]);
            }

            // Read buffer
            return this.buffer.subarray(0, size);
        });
    }

    async readBytes(size: number) {
        return await this.lock.inLock(async () => {

            // Populate cache
            while (this.buffer.length < size) {
                let b = await this.transport.read();
                this.buffer = Buffer.concat([this.buffer, b]);
            }

            // Read buffer
            let result = this.buffer.subarray(0, size);
            this.buffer = this.buffer.subarray(size);
            return result;
        });
    }

    async readUntil(anyOf: number[]) {
        return await this.lock.inLock(async () => {

            // Populate cache
            outer: while (true) {
                for (let i of anyOf) {
                    if (this.buffer.indexOf(i) >= 0) {
                        break outer;
                    }
                }
                let b = await this.transport.read();
                this.buffer = Buffer.concat([this.buffer, b]);
            }

            // Find minimal index
            let index = -1;
            for (let i of anyOf) {
                let j = this.buffer.indexOf(i);
                if (j >= 0 && (index < 0 || j < index)) {
                    index = j;
                }
            }

            // Read buffer
            let result = this.buffer.subarray(0, index);
            this.buffer = this.buffer.subarray(index + 1);
            return result;
        });
    }

    close() {
        this.transport.close();
    }
}