import { TransportStream } from "../../connectors/transport/TransportStream";
import { log } from "../../utils/log";

export const XMODEM_SOH = 0x01;
export const XMODEM_STX = 0x02;
export const XMODEM_EOT = 0x04;
export const XMODEM_ACK = 0x06;
export const XMODEM_DLE = 0x10;
export const XMODEM_NAK = 0x15;
export const XMODEM_CAN = 0x16;
export const XMODEM_CRC = 0x43;

export function xmodemChecksum8bit(src: Buffer) {
    let acc = 0;
    for (let i = 0; i < src.length; i++) {
        acc = (acc + src.at(i)!) & 255;
    }
    return acc & 255;
}

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

export async function downloadXMODEMFile(src: TransportStream, crc: 'simple' | '16bit' = 'simple', md5: 'skip' | 'none' | Buffer = 'none') {

    // Send request
    src.send(Buffer.from([crc === 'simple' ? XMODEM_NAK : XMODEM_CRC]));

    // Read data
    let blockNumber = 0;
    let result = Buffer.alloc(0);
    while (true) {

        // Read block
        let mode: 'normal' | '8k';
        let char = (await src.readBytes(1)).at(0);
        if (char === XMODEM_SOH) {
            mode = 'normal';
        } else if (char === XMODEM_STX) {
            mode = '8k';
        } else if (char === XMODEM_EOT) {
            src.send(Buffer.from([XMODEM_ACK]));
            break;
        } else if (char === XMODEM_CAN) {
            throw new Error('Transmission canceled');
        } else {
            throw new Error('expected SOH, EOT; got ' + char);
        }

        // Read block number
        let receivedBlock = (await src.readBytes(1)).at(0)!;
        if (receivedBlock !== blockNumber) {
            throw new Error('expected block number ' + blockNumber + '; got ' + receivedBlock);
        }
        let receivedBlockCheck = (await src.readBytes(1)).at(0)!;
        if (receivedBlock + receivedBlockCheck !== 255) {
            throw new Error('Block number check failed');
        }
        if (receivedBlock !== blockNumber) {
            throw new Error('Block number mismatch: ' + receivedBlock + ' != ' + blockNumber);
        }

        // Read block data
        let data = await src.readBytes(/* Package Length */(mode === 'normal' ? 1 : 2) + /* Package body */(mode === 'normal' ? 128 : 8192) + /* CRC */ (crc === 'simple' ? 1 : 2));

        // Check CRC
        if (crc === 'simple') {
            let acc = xmodemChecksum8bit(data.subarray(0, data.length - 1));
            if (acc !== data.at(data.length - 1)!) {
                log('XMODEM', data.toString('hex'));
                throw new Error('Checksum failed, expected ' + acc + '; got ' + data.at(data.length - 1));
            }
            data = data.subarray(0, data.length - 1);
        } else if (crc === '16bit') {
            let acc = xmodemChecksum16bit(data.subarray(0, data.length - 2));
            let crc = (data.at(data.length - 2)! << 8) + (data.at(data.length - 1)!);
            if (acc !== crc) {
                log('XMODEM', data.toString('hex'));
                throw new Error('Checksum failed, expected ' + acc + '; got ' + crc);
            }
            data = data.subarray(0, data.length - 2);
        } else {
            throw new Error('Unknown CRC mode: ' + crc);
        }

        // Remove padding
        if (mode === '8k') {
            let dataLength = (data.at(0)! << 8) + data.at(1)!;
            data = data.subarray(2, 2 + dataLength);
        } else {
            data = data.subarray(0, data.at(0)!);
        }

        // Send ACK
        src.send(Buffer.from([XMODEM_ACK]));

        // Append data
        if (blockNumber === 0 && md5 !== 'none') {
            // TODO: Handle MD5
        } else {
            result = Buffer.concat([result, data]);
        }

        // Increase block number
        blockNumber = (blockNumber + 1) % 256;
    }

    return result;
}