import { AsyncLock } from "../../utils/lock";
import { Transport } from "./Transport";

export class TransportStream {
    readonly transport: Transport;
    private lock = new AsyncLock();
    private buffer: Buffer = Buffer.alloc(0);

    constructor(transport: Transport) {
        this.transport = transport;
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

    async readUntil(byte: number) {
        return await this.lock.inLock(async () => {

            // Populate cache
            while (this.buffer.indexOf(byte) < 0) {
                let b = await this.transport.read();
                this.buffer = Buffer.concat([this.buffer, b]);
            }

            // Read buffer
            let index = this.buffer.indexOf(byte);
            let result = this.buffer.subarray(0, index);
            this.buffer = this.buffer.subarray(index + 1);
            return result;
        });
    }
}