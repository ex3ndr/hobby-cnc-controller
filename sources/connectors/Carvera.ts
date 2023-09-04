import { AsyncLock } from "../utils/lock";
import { Connector } from "./Connector";
import { downloadXMODEMFile } from "./net/XMODEM";
import { openSocketStream } from "./net/openSocketStream";

export async function openCarvera(host: string): Promise<Connector> {

    // Create a socket connection to the Carvera
    const socket = await openSocketStream(host, 2222);
    const lock = new AsyncLock();

    return {
        async downloadFile(path: string) {
            return await lock.inLock(async () => {
                socket.send(Buffer.from('download ' + path + '\n'));
                return await downloadXMODEMFile(socket, '16bit', 'skip');
            });
        },
        async command(command) {
            if (command.indexOf('\n') !== -1) {
                throw new Error('Command cannot contain newlines');
            }
            return await lock.inLock(async () => {
                socket.send(Buffer.from(command + '\n'));
                let res = await socket.readUntil('\n'.charCodeAt(0));
                return res.subarray(0, res.length - 1).toString();
            });
        },
    };
}