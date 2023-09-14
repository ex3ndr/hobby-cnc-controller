import { DeviceTransport, DiscoveredDevice } from "../../connectors/Discovery";
import { TcpTransport } from "../../connectors/transport/TcpTransport";
import { TransportStream } from "../../connectors/transport/TransportStream";
import { AsyncLock } from "../../utils/lock";
import { FileEntry, MachineState, MachineStatus, Profile } from "./Common";
import { XMODEM_CAN, XMODEM_SOH, XMODEM_STX } from "./protocols/XMODEM";

type CarveraFrame = {
    kind: 'xmodem'
} | {
    kind: 'end-of-transmission'
} | {
    kind: 'text',
    value: string
}

export class Carvera implements Profile {

    static isSupported(device: DiscoveredDevice) {
        return device.vendor === 'carvera' && device.transport.type === 'tcp';
    }

    static async create(deviceTransport: DeviceTransport) {

        // Check if device is supported
        if (deviceTransport.type !== 'tcp') throw new Error('Only TCP is supported');

        // Create a stream
        let transport = await TcpTransport.open(deviceTransport.host, deviceTransport.port);
        let stream = new TransportStream(transport);

        // Create instance
        return new Carvera(stream);
    }

    private stream: TransportStream;
    private lock = new AsyncLock();

    constructor(stream: TransportStream) {
        this.stream = stream;
    }

    //
    // Machine control
    //

    async readState() {
        return await this.lock.inLock(async () => {
            this.stream.send('?\n');

            // Load state
            let state: MachineState;
            while (true) {
                let r = await this.#readFrame();
                if (r.kind === 'text') {
                    if (r.value.startsWith('<') && r.value.endsWith('>')) {

                        // Parse string
                        let parts = r.value.slice(1, -1).split('|');

                        // Parse status
                        let status: MachineStatus;
                        if (parts[0] === 'Alarm') {
                            status = 'alarm';
                        } else if (parts[0] === 'Home') {
                            status = 'home';
                        } else if (parts[0] === 'Hold') {
                            status = 'hold';
                        } else if (parts[0] === 'Idle') {
                            status = 'idle';
                        } else if (parts[0] === 'Run') {
                            status = 'run';
                        } else {
                            throw new Error('Unknown state: ' + parts[0]);
                        }
                        parts = parts.slice(1);

                        // Parse fields
                        state = {
                            status,
                            machinePosition: { x: 0, y: 0, z: 0, a: 0, b: 0 },
                            workPosition: { x: 0, y: 0, z: 0, a: 0, b: 0 },
                            feed: {
                                current: 0,
                                target: 0,
                                scale: 1,
                            },
                            spindle: {
                                current: 0,
                                target: 0,
                                scale: 1,
                                temperature: 0
                            },
                            vacuum: {
                                enabled: false
                            },
                            tool: {
                                index: -1,
                                offset: 0
                            }
                        };
                        for (let p of parts) {
                            if (p.startsWith('MPos:')) {
                                let vars = p.substring('MPos:'.length).split(',').map((v) => parseFloat(v));
                                while (vars.length < 5) vars.push(0);
                                state.machinePosition = { x: vars[0], y: vars[1], z: vars[2], a: vars[3], b: vars[4] };
                            }
                            if (p.startsWith('WPos:')) {
                                let vars = p.substring('WPos:'.length).split(',').map((v) => parseFloat(v));
                                while (vars.length < 5) vars.push(0);
                                state.workPosition = { x: vars[0], y: vars[1], z: vars[2], a: vars[3], b: vars[4] };
                            }
                            if (p.startsWith('F:')) {
                                let vars = p.substring('F:'.length).split(',').map((v) => parseFloat(v));
                                while (vars.length < 3) vars.push(0);
                                state.feed = { current: vars[0], target: vars[1], scale: vars[2] / 100 };
                            }
                            if (p.startsWith('S:')) {
                                let vars = p.substring('S:'.length).split(',').map((v) => parseFloat(v));
                                while (vars.length < 5) vars.push(0);
                                state.spindle = { current: vars[0], target: vars[1], scale: vars[2] / 100, temperature: vars[4] };
                                state.vacuum = { enabled: vars[3] === 1 };
                            }
                            if (p.startsWith('T:')) {
                                let vars = p.substring('T:'.length).split(',').map((v) => parseFloat(v));
                                while (vars.length < 2) vars.push(0);
                                state.tool = { index: vars[0], offset: vars[1] };
                            }
                        }

                        break;
                    }
                }
            }

            // Read OK
            while (true) {
                let r = await this.#readFrame();
                if (r.kind === 'text') {
                    if (r.value === 'ok') {
                        break;
                    }
                }
            }

            return state;
        });
    }

    //
    // Files Operations
    //

    async listFiles(path: string) {
        return await this.lock.inLock(async () => {

            // Send command
            this.stream.send('ls -e -s ' + escapeFilename(path) + '\n');

            // Read response
            let files: FileEntry[] = [];
            while (true) {
                let r = await this.#readFrame();
                if (r.kind === 'text') {
                    let parts = r.value.split(' ');
                    if (parts.length !== 3) {
                        continue;
                    }
                    if (parts[0].endsWith('/')) {
                        files.push({
                            kind: 'directory',
                            name: unescapeFilename(parts[0].slice(0, -1))
                        });
                    } else {
                        files.push({
                            kind: 'file',
                            name: unescapeFilename(parts[0]),
                            size: parseInt(parts[1], 10)
                        });
                    }
                }
                if (r.kind === 'end-of-transmission') {
                    break;
                }
            }
            return files;
        });
    }

    async readFile(path: string) {
        return await this.lock.inLock(async () => {

        });
    }

    //
    // Read Operations
    //

    async readTime() {
        return await this.lock.inLock(async () => {

            // Send command
            this.stream.send('time\n');

            // Read response
            let time: number;
            while (true) {
                let r = await this.#readFrame();
                if (r.kind === 'text') {
                    if (r.value.startsWith('time = ')) {
                        time = parseInt(r.value.slice(7), 10);
                        break;
                    }
                }
            }

            // Return result
            return time;
        });
    }

    async readVersion() {
        return await this.lock.inLock(async () => {

            // Send command
            this.stream.send('version\n');

            // Read response
            let version: string;
            while (true) {
                let r = await this.#readFrame();
                if (r.kind === 'text') {
                    if (r.value.startsWith('version = ')) {
                        version = r.value.slice('version = '.length);
                        break;
                    }
                }
            }

            // Return result
            return version;
        });
    }

    async disconnect() {
        return await this.lock.inLock(async () => {
            // await this.stream.close();
        });
    }

    //
    // Implementation
    //

    async #readFrame(): Promise<CarveraFrame> {
        let header = (await this.stream.peekBytes(1)).at(0)!;

        // End of transmission frame (0x04)
        if (header === 0x04) {
            await this.stream.readBytes(1);
            return {
                kind: 'end-of-transmission'
            };
        }

        // XMODEM frame
        if (header === XMODEM_SOH || header === XMODEM_STX || header === XMODEM_CAN) {
            throw new Error('Not implemented: ' + header);
        }

        // Load text frame
        let data = await this.stream.readUntil(0x0A);
        let str = data.toString('utf8');
        if (str.endsWith('\r')) {
            str = str.slice(0, -1);
        }
        return {
            kind: 'text',
            value: str
        };
    }
}

function escapeFilename(src: string) {
    return src.replaceAll(' ', '\x01');
}

function unescapeFilename(src: string) {
    return src.replaceAll('\x01', ' ');
}