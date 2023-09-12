import { xmodemChecksum8bit } from './XMODEM';

describe('XMODEM', () => {
    it('should calculate CRC', () => {
        let chksum = xmodemChecksum8bit(Buffer.from([255, 5, 6]));
        expect(chksum).toBe(10);

        let chksum2 = xmodemChecksum8bit(Buffer.from([255, 5, 6]));
    });
});