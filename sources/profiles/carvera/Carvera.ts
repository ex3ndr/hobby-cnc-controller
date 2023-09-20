import { DiscoveredDevice } from "../../connectors/Discovery";
import { MultiplexTransport } from "../../connectors/transport/MultiplexTransport";
import { TcpTransport } from "../../connectors/transport/TcpTransport";
import { TransportStream } from "../../connectors/transport/TransportStream";
import { TransportEndpoint } from "../../storage/config";
import { isGCode } from "../../utils/isGCode";
import { AsyncLock } from "../../utils/lock";
import { MachineState, Profile } from "../Common";
import { XMODEM_CAN, XMODEM_SOH, XMODEM_STX } from "./XMODEM";
import { parseState } from "./parser";

export class Carvera implements Profile {

    static readonly defaultName: string = 'Carvera';

    static isSupported(device: DiscoveredDevice) {
        return device.vendor === 'carvera' && device.transport.type === 'tcp';
    }

    static async create(deviceTransport: TransportEndpoint) {

        // Check if device is supported
        if (deviceTransport.type !== 'tcp') throw new Error('Only TCP is supported');

        // Create a stream
        let transport = await TcpTransport.open(deviceTransport.host, deviceTransport.port);
        let stream = new TransportStream(transport);

        // Create instance
        return new Carvera(stream);
    }

    private _stream: TransportStream;
    private _transport: MultiplexTransport<CarveraFrame>;
    private _lockCommand = new AsyncLock();
    private _lockState = new AsyncLock();
    private _firmwareVersion: string = 'unknown';

    constructor(stream: TransportStream) {
        this._stream = stream;
        this._transport = new MultiplexTransport<CarveraFrame>(stream, doReadFrame);
    }

    //
    // Getters
    //

    get stream() {
        return this._stream;
    }

    get connected() {
        return this._stream.connected;
    }

    //
    // Preparing machine
    //

    async prepare() {
        this._firmwareVersion = await this.readVersion();
    }

    async readTime() {
        return await this._lockCommand.inLock(async () => {
            // Send command
            let reader = this._transport.createReader();
            try {
                this.stream.send('time\n');

                // Read response
                let time: number;
                while (true) {
                    let r = await reader.read();
                    if (r.kind === 'text') {
                        if (r.value.startsWith('time = ')) {
                            time = parseInt(r.value.slice(7), 10);
                            break;
                        }
                    }
                }

                // Return result
                return time;
            } finally {
                reader.close();
            }
        });
    }

    async readVersion() {
        return await this._lockCommand.inLock(async () => {
            let reader = this._transport.createReader();
            try {
                this._transport.send('version\n');

                // Read response
                let version: string;
                while (true) {
                    let r = await reader.read();
                    if (r.kind === 'text') {
                        if (r.value.startsWith('version = ')) {
                            version = r.value.slice('version = '.length);
                            break;
                        }
                    }
                }

                // Return result
                return version;
            } finally {
                reader.close();
            }
        });
    }

    //
    // Commands
    //

    async command(command: string) {
        if (!isGCode(command)) {
            return ''; // Silently ignore
        }
        return this.#command(command);
    }

    async home(): Promise<void> {
        await this.#command('$H');
    }

    async softUnlock(): Promise<void> {
        await this.#command('$X');
    }

    async softLock(): Promise<void> {
        this.stream.send(String.fromCharCode(0x18));
    }

    async #command(command: string) {
        return await this._lockCommand.inLock(async () => {

            // Send command
            let reader = this._transport.createReader();
            try {
                this._transport.send(command + '\n');
                let out = '';
                while (true) {
                    let r = await reader.read();
                    if (r.kind === 'text') {
                        out += r.value;
                        if (out.length !== 0) {
                            out += '\n';
                        }
                        if (r.value.startsWith('ok')) { // Sometimes we get some data after "ok"
                            break;
                        }
                    }
                }
                return out;
            } finally {
                reader.close();
            }
        });
    }

    //
    // State
    //

    async state() {
        return this._lockState.inLock(async () => {
            let reader = this._transport.createReader();
            try {
                this._transport.send('?\n');
                while (true) {
                    let r = await reader.read();
                    if (r.kind === 'status') {
                        console.warn(r.value);
                        let state = parseState(r.value);
                        let converted: MachineState = {
                            firmware: {
                                version: this._firmwareVersion
                            },
                            ...state, // TODO: More refined conversion
                        }
                        return converted;
                    }
                }
            } finally {
                reader.close();
            }
        });
    }

    //
    // File System
    //

    // async listFiles(path: string) {
    //     return await this.lock.inLock(async () => {
    //         if (!this.stream.transport.connected) {
    //             throw new Error('Not connected');
    //         }

    //         // Send command
    //         this.stream.send('ls -e -s ' + escapeFilename(path) + '\n');

    //         // Read response
    //         let files: FileEntry[] = [];
    //         while (true) {
    //             let r = await this.#readFrame();
    //             if (r.kind === 'text') {
    //                 let parts = r.value.split(' ');
    //                 if (parts.length !== 3) {
    //                     continue;
    //                 }
    //                 if (parts[0].endsWith('/')) {
    //                     files.push({
    //                         kind: 'directory',
    //                         name: unescapeFilename(parts[0].slice(0, -1))
    //                     });
    //                 } else {
    //                     files.push({
    //                         kind: 'file',
    //                         name: unescapeFilename(parts[0]),
    //                         size: parseInt(parts[1], 10)
    //                     });
    //                 }
    //             }
    //             if (r.kind === 'end-of-transmission') {
    //                 break;
    //             }
    //         }
    //         return files;
    //     });
    // }

    // async readFile(path: string) {
    //     return await this.lock.inLock(async () => {
    //         if (!this.stream.transport.connected) {
    //             throw new Error('Not connected');
    //         }

    //     });
    // }

    //
    // Disconnect from machine
    //

    close() {
        if (!this.stream.connected) {
            return;
        }
        this.stream.close();
    }
}

//
// Stream
//

type CarveraFrame = {
    kind: 'xmodem'
} | {
    kind: 'end-of-transmission'
} | {
    kind: 'text',
    value: string
} | {
    kind: 'status',
    value: string
};

async function doReadFrame(stream: TransportStream): Promise<CarveraFrame> {
    let header = (await stream.peekBytes(1)).at(0)!;

    // End of transmission frame (0x04)
    if (header === 0x04) {
        await stream.readBytes(1);
        return {
            kind: 'end-of-transmission'
        };
    }

    // XMODEM frame
    if (header === XMODEM_SOH || header === XMODEM_STX || header === XMODEM_CAN) {
        throw new Error('Not implemented: ' + header);
    }

    // Load text frame
    let data = await stream.readUntil(0x0A);
    let str = data.toString('utf8');
    if (str.endsWith('\r')) {
        str = str.slice(0, -1);
    }

    // Load status frame
    if (str.startsWith('<') && str.endsWith('>')) {
        return {
            kind: 'status',
            value: str.slice(1, -1)
        };
    }

    // Plain text frame
    return {
        kind: 'text',
        value: str
    };
}