import { DeviceTransport, DiscoveredDevice } from "../connectors/Discovery";
import { TcpTransport } from "../connectors/transport/TcpTransport";
import { TransportStream } from "../connectors/transport/TransportStream";
import { TransportEndpoint } from "../storage/config";
import { isGCode } from "../utils/isGCode";
import { AsyncLock } from "../utils/lock";
import { FileEntry, MachineState, MachineStatus, Profile } from "./Common";
import { MachineError } from "./_errors";
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

    private stream: TransportStream;
    private lock = new AsyncLock();

    get transport() {
        return this.stream;
    }

    constructor(stream: TransportStream) {
        this.stream = stream;
    }

    //
    // Machine control
    //

    async readState() {
        return await this.lock.inLock(async () => {
            if (!this.stream.transport.connected) {
                throw new Error('Not connected');
            }

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
                            },
                            halt: null
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
                            if (p.startsWith('H:')) {
                                let vars = p.substring('H:'.length).split(',').map((v) => parseInt(v));
                                while (vars.length < 1) vars.push(0);
                                let error = CARVERA_HALT_ERRORS[vars[0]];
                                if (error) {
                                    state.halt = { reason: error };
                                }
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

    async command(command: string) {
        if (!isGCode(command)) {
            return ''; // Silently ignore
        }
        return this.#command(command);
    }

    async #command(command: string) {
        return await this.lock.inLock(async () => {
            if (!this.stream.transport.connected) {
                throw new Error('Not connected');
            }

            // Send command
            this.stream.send(command + '\n');

            // Load response
            let out = '';
            while (true) {
                let r = await this.#readFrame();
                if (r.kind === 'text') {
                    out += r.value;
                    if (out.length !== 0) {
                        out += '\n';
                    }
                    if (r.value.startsWith('ok')) {
                        break;
                    }
                }
            }
            return out;
        });
    }

    //
    // Files Operations
    //

    async listFiles(path: string) {
        return await this.lock.inLock(async () => {
            if (!this.stream.transport.connected) {
                throw new Error('Not connected');
            }

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
            if (!this.stream.transport.connected) {
                throw new Error('Not connected');
            }

        });
    }

    //
    // Lifecycle
    //

    async readTime() {
        return await this.lock.inLock(async () => {
            if (!this.stream.transport.connected) {
                throw new Error('Not connected');
            }

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
            if (!this.stream.transport.connected) {
                throw new Error('Not connected');
            }

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

    async prepare() {

        // Sync time
        let time = await this.readTime();

        // Load current version
        let version = await this.readVersion();
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

    async disconnect() {
        return await this.lock.inLock(async () => {
            if (this.stream.transport.connected) {
                return;
            }
            await this.stream.transport.disconnect();
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

const CARVERA_HALT_ERRORS: { [key: number]: MachineError } = {
    [1]: 'halt_manually',
    [2]: 'home_fail',
    [3]: 'probe_fail',
    [4]: 'calibrate_fail',
    [5]: 'atc_home_fail',
    [6]: 'atc_invalid_tool_number',
    [7]: 'atc_drop_tool_fail',
    [8]: 'atc_position_occupied',
    [9]: 'spindle_overheated',
    [10]: 'soft_limit_triggered',
    [11]: 'cover_opened_when_playing',
    [12]: 'wireless_probe_dead_or_not_set',
    [13]: 'emergency_stop_button_pressed',
    [21]: 'hard_limit_triggered',
    [22]: 'x_axis_motor_error',
    [23]: 'y_axis_motor_error',
    [24]: 'z_axis_motor_error',
    [25]: 'spindle_stall',
    [26]: 'sd_card_read_fail',
    [41]: 'spindle_alarm'
}