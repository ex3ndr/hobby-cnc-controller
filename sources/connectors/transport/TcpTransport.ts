import { Socket } from 'net';
import { Transport } from "./Transport";
import { AsyncLock } from '../../utils/lock';

export class TcpTransport implements Transport {

    static async open(host: string, port: number) {
        let res = new TcpTransport();
        await res.#open(host, port);
        return res;
    }

    private socket: Socket;
    private closed = false;
    private opened = false;
    private buffer: Buffer = Buffer.alloc(0);
    private bufferAwaiter: ((ok: boolean) => void) | null = null;
    private readLock = new AsyncLock();
    onClosed: (() => void) | null = null;

    get connected() {
        return this.opened && !this.closed;
    }

    private constructor() {
        this.socket = new Socket();
    }

    async #open(host: string, port: number) {

        // Connect
        await new Promise<void>((resolve, reject) => {
            this.socket.once('error', (error) => {
                if (!this.opened && !this.closed) {
                    this.closed = true;
                    reject(error);
                }
            });
            this.socket.connect(port, host, () => {
                if (!this.opened && !this.closed) {
                    this.opened = true;
                    resolve();
                }
            });
        });

        // Receive data
        this.socket.on('data', (data) => {
            if (!this.closed) {
                console.warn('Received', data);
                this.buffer = Buffer.concat([this.buffer, data]);
                let aw = this.bufferAwaiter;
                if (aw) {
                    this.bufferAwaiter = null;
                    aw(true);
                }
            }
        });

        // Handle closed
        this.socket.on('close', () => {
            if (!this.closed) {
                this.closed = true;
                if (this.onClosed) {
                    this.onClosed();
                }
                let aw = this.bufferAwaiter;
                if (aw) {
                    this.bufferAwaiter = null;
                    aw(false);
                }
            }
        });
    }

    send(data: Buffer) {
        if (!this.closed && this.opened) { // Ignoring data if not connected to simplify disconnects
            this.socket.write(data);
            console.warn('Sent', data);
        }
    }

    async read(): Promise<Buffer> {
        return await this.readLock.inLock(async () => {
            if (this.closed) {
                throw Error('Connection closed');
            }

            // Await buffer
            while (this.buffer.length === 0) {
                let ok = await new Promise<boolean>(resolve => this.bufferAwaiter = resolve);
                if (!ok) {
                    throw Error('Connection closed');
                }
            }

            // Read buffer
            let res = this.buffer;
            this.buffer = Buffer.alloc(0);
            return res;
        });
    }

    close() {
        if (!this.closed) {
            this.closed = true;

            // Abort lock
            let aw = this.bufferAwaiter;
            this.bufferAwaiter = null;
            if (aw) {
                aw(false);
            }

            // Close socket
            this.socket.destroy();
        }
    }
}