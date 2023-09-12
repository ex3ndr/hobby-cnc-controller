import { Socket } from 'net';
import { log } from '../../utils/log';
import { AsyncLock } from '../../utils/lock';
import { SerialStream } from './SerialStream';

export async function openSocketStream(host: string, port: number): Promise<SerialStream> {
    const socket = new Socket();
    let closed = false;
    let connected = false;
    let readLock = new AsyncLock();

    // Buffer incoming data
    let buffer: Buffer = Buffer.alloc(0);
    let bufferAwaiter: ((ok: boolean) => void) | null = null;
    socket.on('data', (data) => {
        if (!closed) {
            log('SocketConnector', `Receive: ${data.toString()}`);
            // log('SocketConnector', `Receive(bin): ${data.toString('hex')}`);
            buffer = Buffer.concat([buffer, data]);
            let aw = bufferAwaiter;
            if (aw) {
                bufferAwaiter = null;
                aw(true);
            }
        }
    });

    // Handle closed
    socket.on('close', () => {
        if (!closed) {
            closed = true;
            log('SocketConnector', `Closed connection to ${host}:${port}`);
            let aw = bufferAwaiter;
            if (aw) {
                bufferAwaiter = null;
                aw(false);
            }
        }
    });

    // Connect
    log('SocketConnector', `Connecting to ${host}:${port}`);
    await new Promise<void>((resolve, reject) => {
        socket.on('error', (error) => {
            if (!connected && !closed) {
                closed = true;
                log('SocketConnector', `Failed to connect to ${host}:${port}`);
                reject(error);
            }
        });
        socket.connect(port, host, () => {
            if (!connected && !closed) {
                connected = true;
                log('SocketConnector', `Connected to ${host}:${port}`);
                resolve();
            }
        });
    });

    return {
        send(data: Buffer) {
            if (closed) {
                throw Error('Connection closed');
            }
            socket.write(data);
        },
        async read(length: number): Promise<Buffer> {
            return await readLock.inLock(async () => {
                if (closed) {
                    throw Error('Connection closed');
                }

                // Await buffer
                while (buffer.length < length) {
                    let ok = await new Promise<boolean>(resolve => bufferAwaiter = resolve);
                    if (!ok) {
                        throw Error('Connection closed');
                    }
                }

                // Read buffer
                let result = buffer.subarray(0, length);
                buffer = buffer.subarray(length);
                return result;
            });
        },
        async readUntil(byte: number): Promise<Buffer> {
            return await readLock.inLock(async () => {
                if (closed) {
                    throw Error('Connection closed');
                }

                // Await buffer
                while (buffer.indexOf(byte) < 0) {
                    let ok = await new Promise<boolean>(resolve => bufferAwaiter = resolve);
                    if (!ok) {
                        throw Error('Connection closed');
                    }
                }

                // Read buffer
                let index = buffer.indexOf(byte);
                let result = buffer.subarray(0, index);
                buffer = buffer.subarray(index + 1);
                return result;
            });
        }
    }
}