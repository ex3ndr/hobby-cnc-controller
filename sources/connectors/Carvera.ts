import { AsyncLock } from "../utils/lock";
import { Connector } from "./Connector";
import { downloadXMODEMFile } from "./net/XMODEM";
import { TcpTransport } from "./transport/TcpTransport";
import { TransportStream } from "./transport/TransportStream";

export async function openCarvera(host: string): Promise<Connector> {

    // Create a socket connection to the Carvera
    const transport = await TcpTransport.open(host, 2222);
    const stream = new TransportStream(transport);
    const lock = new AsyncLock();

    return {
        async downloadFile(path: string) {
            return await lock.inLock(async () => {
                stream.send('download ' + path + '\n');
                return await downloadXMODEMFile(stream, '16bit', 'skip');
            });
        },
        async command(command) {
            if (command.indexOf('\n') !== -1) {
                throw new Error('Command cannot contain newlines');
            }
            return await lock.inLock(async () => {
                stream.send(command + '\n');
                let res = await stream.readUntil('\n'.charCodeAt(0));
                return res.subarray(0, res.length - 1).toString();
            });
        },
    };
}