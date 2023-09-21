import { TransportStream } from "../../connectors/transport/TransportStream";
import { log } from "../../utils/log";

export const XMODEM_SOH = 0x01;
export const XMODEM_STX = 0x02;
export const XMODEM_EOT = 0x04;
export const XMODEM_ACK = 0x06;
export const XMODEM_DLE = 0x10;
export const XMODEM_NACK = 0x15;
export const XMODEM_CAN = 0x16;
export const XMODEM_CRC = 0x43;

export function xmodemChecksum16bit(src: Buffer) {
    let acc = 0;
    for (let i = 0; i < src.length; i++) {
        acc = acc ^ ((src.at(i)!) << 8);
        for (let j = 0; j < 8; j++) {
            if (acc & 0x8000) {
                acc = acc << 1 ^ 0x1021;
            } else {
                acc = acc << 1;
            }
        }
    }
    return acc & 0xFFFF;
}

//
// Frames
//

export const XMODEM_FRAME_ACK = Buffer.from([XMODEM_ACK]);
export const XMODEM_FRAME_NACK = Buffer.from([XMODEM_CRC]);
export const XMODEM_FRAME_CANCEL = Buffer.from([XMODEM_CAN]);
export const XMODEM_FRAME_EOT = Buffer.from([XMODEM_EOT]);

export type XmodemFrame = {
    kind: 'data',
    block: number,
    data: Buffer
} | {
    kind: 'nack',
    crc: boolean
} | {
    kind: 'ack'
} | {
    kind: 'cancel'
};

export async function readXModemFrame(src: TransportStream): Promise<XmodemFrame> {

    // Read header
    let char = (await src.readBytes(1)).at(0);
    if (char === XMODEM_CAN) {
        return { kind: 'cancel' };
    } else if (char === XMODEM_NACK) {
        return { kind: 'nack', crc: false };
    } else if (char === XMODEM_CRC) {
        return { kind: 'nack', crc: true };
    } else if (char === XMODEM_ACK) {
        return { kind: 'ack' };
    } else if (char !== XMODEM_STX) {
        throw new Error('Unexpected XMODEM frame'); // Should not happen since it is checked by the caller
    }

    // Read package
    // NOTE: We need to read everything before throwing errors because we need to keep stream healthy
    let data = await src.readBytes(/* block number */ 2 + /* package length */ 2 + /* Package body */ 8192 + /* CRC */ 2);

    // Check block number
    let block = data.at(0)!;
    let blockCheck = data.at(1)!;
    if (block + blockCheck !== 255) {
        throw new Error('Block check failed');
    }

    // Check CRC
    let acc = xmodemChecksum16bit(data.subarray(2, data.length - 2));
    let crc = (data.at(data.length - 2)! << 8) + (data.at(data.length - 1)!);
    if (acc !== crc) {
        log('XMODEM', data.toString('hex'));
        throw new Error('Checksum failed, expected ' + acc + '; got ' + crc);
    }

    // Remove padding
    let dataLength = (data.at(2)! << 8) + data.at(3)!;
    data = data.subarray(4, 4 + dataLength);

    return {
        kind: 'data',
        block,
        data
    };
}

export function createXModemDataFrame(block: number, data: Buffer): Buffer {
    let paddedData = Buffer.alloc(8192);
    data.copy(paddedData);
    let result = Buffer.concat([Buffer.from([block, 255 - block, data.length >> 8, data.length && 255]), paddedData]);
    let crc = xmodemChecksum16bit(result.subarray(2));
    result = Buffer.concat([Buffer.from([XMODEM_STX]), result, Buffer.from([crc >> 8, crc & 0xFF])]);
    return result;
}