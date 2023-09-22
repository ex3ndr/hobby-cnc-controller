import { DiscoveredDevice } from "../../connectors/Discovery";
import { MultiplexTransport } from "../../connectors/transport/MultiplexTransport";
import { TcpTransport } from "../../connectors/transport/TcpTransport";
import { TransportStream } from "../../connectors/transport/TransportStream";
import { TransportEndpoint } from "../../storage/config";
import { Storage } from "../../storage/storage";
import { isGCode } from "../../utils/isGCode";
import { AsyncLock } from "../../utils/lock";
import { log } from "../../utils/log";
import { delay } from "../../utils/time";
import { FileEntry, MachineState, Profile } from "../Common";
import { XMODEM_ACK, XMODEM_CAN, XMODEM_FRAME_ACK, XMODEM_FRAME_CANCEL, XMODEM_FRAME_EOT, XMODEM_FRAME_NACK, XMODEM_NACK, XMODEM_SOH, XMODEM_STX, XmodemFrame, createXModemDataFrame, readXModemFrame } from "./XMODEM";
import { parseState } from "./parser";
import { escapeFilename, unescapeFilename } from "./utils";
import crypto from 'crypto';

export class Carvera implements Profile {

    static readonly defaultName: string = 'Carvera';

    static isSupported(device: DiscoveredDevice) {
        return device.vendor === 'carvera' && device.transport.type === 'tcp';
    }

    static async create(deviceTransport: TransportEndpoint, storage: Storage) {

        // Check if device is supported
        if (deviceTransport.type !== 'tcp') throw new Error('Only TCP is supported');

        // Create a stream
        let transport = await TcpTransport.open(deviceTransport.host, deviceTransport.port);
        let stream = new TransportStream(transport);

        // Create instance
        return new Carvera(stream, storage);
    }

    private _storage: Storage;
    private _stream: TransportStream;
    private _transport: MultiplexTransport<CarveraFrame>;
    private _lockCommand = new AsyncLock();
    private _lockState = new AsyncLock();
    private _lockFiles = new AsyncLock();
    private _firmwareVersion: string = 'unknown';

    constructor(stream: TransportStream, storage: Storage) {
        this._stream = stream;
        this._storage = storage;
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

    async currentFile() {
        return this._lockState.inLock(async () => {
            let reader = this._transport.createReader();
            try {
                this._transport.send('progress\n');
                while (true) {
                    let r = await reader.read();
                    if (r.kind === 'text' && r.value === 'Not currently playing') {
                        return null;
                    } else if (r.kind === 'text' && r.value.startsWith('file: ')) {
                        let parts = r.value.split(',');
                        if (parts.length === 4) {
                            return parts[0].slice('file: '.length).trim();
                        }
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

    async listFiles(path: string) {
        return await this._lockFiles.inLock(() => this._lockCommand.inLock(async () => {

            // Send command
            let reader = this._transport.createReader();
            try {
                this.stream.send('ls -e -s ' + escapeFilename(path) + '\n');
                let files: FileEntry[] = [];
                while (true) {
                    let r = await reader.read();
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
            } finally {
                reader.close();
            }
        }));
    }

    async rm(path: string) {
        return await this._lockFiles.inLock(() => this._lockCommand.inLock(async () => {
            let reader = this._transport.createReader();
            try {
                this.stream.send('rm ' + escapeFilename(path) + ' -e\n');
                while (true) {
                    let r = await reader.read();
                    if (r.kind === 'end-of-transmission') {
                        return true;
                    }
                    if (r.kind === 'xmodem' && r.frame.kind === 'cancel') {
                        return false;
                    }
                }
            } finally {
                reader.close();
            }
        }));
    }

    async mkdir(path: string) {
        return await this._lockFiles.inLock(() => this._lockCommand.inLock(async () => {
            let reader = this._transport.createReader();
            try {
                this.stream.send('mkdir ' + escapeFilename(path) + ' -e\n');
                while (true) {
                    let r = await reader.read();
                    if (r.kind === 'end-of-transmission') {
                        return true;
                    }
                    if (r.kind === 'xmodem' && r.frame.kind === 'cancel') {
                        return false;
                    }
                }
            } finally {
                reader.close();
            }
        }));
    }

    async downloadFile(path: string) {
        return await this._lockFiles.inLock(async () => {
            let reader = this._transport.createReader();
            try {
                log('carvera', 'Downloading file \"' + path + '\"');
                this.stream.send('download ' + escapeFilename(path) + '\n');

                // Start transmission
                this.stream.send(XMODEM_FRAME_NACK);
                let data = Buffer.alloc(0);
                let block = 0;
                while (true) {
                    let r = await reader.read();
                    if (r.kind === 'end-of-transmission') {

                        // Send ACK
                        this.stream.send(XMODEM_FRAME_ACK);

                        // Return result
                        break;
                    }

                    if (r.kind === 'xmodem') {
                        if (r.frame.kind === 'cancel') {
                            log('carvera', 'Received file transmission cancelation');

                            // Send ACK
                            this.stream.send(XMODEM_FRAME_ACK);

                            // Throw error
                            throw new Error('Transmission cancelled');
                        } else if (r.frame.kind === 'data') {

                            // Check block
                            if (r.frame.block !== block) {

                                log('carvera', 'Received block number mismatch. Expected ' + block + ', received: ' + r.frame.block);

                                // Send cancel
                                this.stream.send(XMODEM_FRAME_CANCEL);
                                this.stream.send(XMODEM_FRAME_CANCEL);
                                this.stream.send(XMODEM_FRAME_CANCEL);

                                // Throw error
                                throw new Error('Unexpected block number');
                            }

                            // MD5 Frame
                            if (block === 0) {
                                if (r.frame.data.length !== 0) { // Sometimes carvera sends empty md5 frame
                                    let md5 = Buffer.from(r.frame.data.toString(), 'hex');
                                    log('carvera', 'Received file hash \"' + md5.toString('hex') + '\"');
                                    let data = this.#tryLoadFromFileFromCache(md5);
                                    if (data) {
                                        log('carvera', 'File loaded from cache');
                                        this.stream.send(XMODEM_FRAME_CANCEL);
                                        this.stream.send(XMODEM_FRAME_CANCEL);
                                        this.stream.send(XMODEM_FRAME_CANCEL);
                                        return data;
                                    }
                                } else {
                                    log('carvera', 'Received empty hash');
                                }
                            } else {
                                data = Buffer.concat([data, r.frame.data]);
                            }

                            // Increment block
                            block = (block + 1) % 256;

                            // Send ACK
                            this.stream.send(XMODEM_FRAME_ACK);
                        } else {
                            log('carvera', 'Received invalid frame during download');

                            // Send cancel
                            this.stream.send(XMODEM_FRAME_CANCEL);

                            // Throw error
                            throw new Error('Received invalid frame');
                        }
                    }
                }

                // Return result
                log('carvera', 'Downloaded ' + data.length + ' bytes');

                // Persist in cache
                this.#saveToFileToCache(data);

                return data;
            } finally {
                reader.close();
            }
        });
    }

    async uploadFile(path: string, data: Buffer) {

        // Persist in cache
        this.#saveToFileToCache(data);

        // Do upload
        return await this._lockFiles.inLock(async () => {
            let reader = this._transport.createReader();
            try {
                log('carvera', 'Upload file \"' + path + '\"');
                this.stream.send('upload ' + escapeFilename(path) + '\n');
                let start = Date.now();

                //
                // Await NACK
                // NOTE: This part is ignored because Carvera firmware has a bug that incorrectly handle 
                //       initial package and we need to send it immediatelly before even receiving anything.
                //

                // while (true) {
                //     let r = await reader.read();
                //     if (r.kind === 'text') {
                //         if (r.value === 'CCCCCCCCCC') { // Carvera sends 10 'C' characters before starting transmission
                //             break;
                //         }
                //     }
                //     if (r.kind === 'xmodem') {
                //         if (r.frame.kind === 'nack') {
                //             if (!r.frame.crc) {
                //                 log('carvera', 'Received legacy CRC request');

                //                 // Send cancel
                //                 this.stream.send(XMODEM_FRAME_CANCEL);
                //                 this.stream.send(XMODEM_FRAME_CANCEL);
                //                 this.stream.send(XMODEM_FRAME_CANCEL);

                //                 throw new Error('Legacy CRC not supported');
                //             } else {
                //                 break;
                //             }
                //         } else if (r.frame.kind === 'cancel') {
                //             log('carvera', 'Received upload cancel');
                //             throw new Error('Upload cancelled');
                //         }
                //     } else if (r.kind === 'end-of-transmission') {
                //         log('carvera', 'Received end of transmission');
                //         throw new Error('Upload cancelled');
                //     }
                // }
                // log('carvera', 'Upload inited in ' + (Date.now() - start) + 'ms');

                //
                // Send first block - md5 of a file
                //

                let block = 0;
                let md5 = Buffer.from(crypto.createHash('md5').update(data).digest().toString('hex'));
                this.stream.send(createXModemDataFrame(block, md5));
                block = (block + 1) % 256;
                let remaining = data;

                //
                // Send data
                //

                while (remaining.length > 0) {

                    //
                    // Await confirmation
                    //

                    let r = await reader.read();
                    if (r.kind === 'xmodem') {
                        if (r.frame.kind === 'cancel') {
                            log('carvera', 'Received upload cancel');
                            throw new Error('Upload cancelled');
                        } else if (r.frame.kind === 'nack') {
                            // Just ignore NACK
                            // log('carvera', 'Received NACK when should not');
                            // throw new Error('Upload failed');
                        } else if (r.frame.kind !== 'ack') {
                            log('carvera', 'Received invalid frame');
                            throw new Error('Upload failed');
                        }
                    } else if (r.kind === 'end-of-transmission') {
                        log('carvera', 'Received upload cancel');
                        throw new Error('Upload cancelled');
                    }

                    //
                    // Send next block
                    //

                    let d = remaining.subarray(0, Math.min(8192, remaining.length));
                    this.stream.send(createXModemDataFrame(block, d));
                    block = (block + 1) % 256;
                    remaining = remaining.subarray(d.length);
                }

                //
                // Send end of transmission
                //

                this.stream.send(XMODEM_FRAME_EOT);

                //
                // Await confirmation
                //

                while (true) {
                    let r = await reader.read();
                    if (r.kind === 'end-of-transmission') {
                        break;
                    } else if (r.kind === 'xmodem') {
                        if (r.frame.kind === 'ack') {
                            break;
                        } else if (r.frame.kind === 'cancel') {
                            log('carvera', 'Received upload cancel');
                            throw new Error('Upload cancelled');
                        }
                    }
                }

                //
                // Await final message - required for proper upload
                //

                while (true) {
                    let r = await reader.read();
                    if (r.kind === 'text') {
                        if (r.value.startsWith('Info: upload success')) {
                            break;
                        }
                    }
                }

                //
                // Completed
                //

                log('carvera', 'Upload finished in ' + (Date.now() - start) + 'ms');

            } finally {
                reader.close();
            }
        });
    }

    #tryLoadFromFileFromCache(md5hash: Buffer) {
        let r = this._storage.readFile('cache/md5/' + md5hash.toString('hex'));
        if (r) {
            let md5hash = crypto.createHash('md5').update(r).digest();
            if (md5hash.equals(md5hash)) {
                return r;
            }
        }
        return null;
    }

    #saveToFileToCache(data: Buffer) {
        let md5hash = crypto.createHash('md5').update(data).digest();
        this._storage.writeFile('cache/md5/' + md5hash.toString('hex'), data);
    }


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
    kind: 'xmodem',
    frame: XmodemFrame
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
    if (header === XMODEM_SOH || header === XMODEM_STX || header === XMODEM_CAN || header === XMODEM_NACK || header === XMODEM_ACK) {
        return { kind: 'xmodem', frame: await readXModemFrame(stream) };
    }

    // Load text frame
    // NOTE: We are using two separators - new line and xmodem' NACK. This is because there are no way to distinguish 
    //       some xmodem frames from text frames. We only hitting this problem with CRC request frame and machine
    //       usually sends NACK after text, so we can use it as a separator.
    let data = await stream.readUntil([0x0A, XMODEM_CAN, XMODEM_ACK, XMODEM_NACK]); // New Line or NACK
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