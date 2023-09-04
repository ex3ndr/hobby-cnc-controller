import { log } from "../../utils/log";
import { SerialStream } from "./SerialStream";

const XMODEM_SOH = 0x01;
const XMODEM_STX = 0x02;
const XMODEM_EOT = 0x04;
const XMODEM_ACK = 0x06;
const XMODEM_DLE = 0x10;
const XMODEM_NAK = 0x15;
const XMODEM_CAN = 0x16;
const XMODEM_CRC = 0x43;

export async function downloadXMODEMFile(src: SerialStream, crc: 'simple' | '16bit' = 'simple', md5: 'skip' | 'none' | Buffer = 'none') {

    // Send request
    src.send(Buffer.from([crc === 'simple' ? XMODEM_NAK : XMODEM_CRC]));

    // Read data
    let blockNumber = 0;
    let result = Buffer.alloc(0);
    while (true) {

        // Read block
        let mode: 'normal' | '8k';
        let char = (await src.read(1)).at(0);
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
        let receivedBlock = (await src.read(1)).at(0)!;
        if (receivedBlock !== blockNumber) {
            throw new Error('expected block number ' + blockNumber + '; got ' + receivedBlock);
        }
        let receivedBlockCheck = (await src.read(1)).at(0)!;
        if (receivedBlock + receivedBlockCheck !== 255) {
            throw new Error('Block number check failed');
        }
        if (receivedBlock !== blockNumber) {
            throw new Error('Block number mismatch: ' + receivedBlock + ' != ' + blockNumber);
        }

        // Read block data
        let data = await src.read(/* Package Length */(mode === 'normal' ? 1 : 2) + /* Package body */(mode === 'normal' ? 128 : 8192) + /* CRC */ (crc === 'simple' ? 1 : 2));

        // Check CRC
        // if (crc === 'simple') {
        //     let acc = 0; // XMODEM_STX + (receivedBlock % 256) + (receivedBlockCheck % 256);
        //     for (let i = 0; i < data.length - 1; i++) {
        //         acc = (acc + data.at(i)!) % 256;
        //     }
        //     if (acc !== data.at(data.length - 1)!) {
        //         log('XMODEM', data.toString('hex'));
        //         throw new Error('Checksum failed, expected ' + acc + '; got ' + data.at(data.length - 1));
        //     }
        //     data = data.subarray(0, data.length - 1);
        // }

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