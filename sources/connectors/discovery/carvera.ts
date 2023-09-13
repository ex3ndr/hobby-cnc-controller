import UDP from 'dgram';
import { delay } from "../../utils/time";
import type { Discovery, DiscoveredDevice } from "../Discovery";
import { log } from '../../utils/log';

type CarveraDevice = {
    timeout: any;
    host: string;
    port: number;
    name: string;
    active: boolean;
    busy: boolean;
}

export class CarveraDiscovery implements Discovery {

    static async create(): Promise<CarveraDiscovery> {
        let res = new CarveraDiscovery();
        await delay(3000); // Await for devices to be discovered
        return res;
    }

    private found: CarveraDevice[] = [];

    get devices(): DiscoveredDevice[] {
        let res: DiscoveredDevice[] = [];
        for (let d of this.found) {
            res.push({
                transport: {
                    type: 'tcp',
                    host: d.host,
                    port: d.port
                },
                name: d.name,
                key: 'carvera:' + d.name,
                state: d.active ? (d.busy ? 'busy' : 'active') : 'inactive',
                vendor: 'carvera'
            });
        }
        return res;
    }

    constructor() {
        const client = UDP.createSocket('udp4');
        client.on('message', (msg, rinfo) => {

            // Parse message
            let data = msg.toString();
            let splited = data.split(',');
            if (splited.length !== 4) return;
            let name = splited[0];
            let host = splited[1];
            let port = parseInt(splited[2], 10);
            let busy = splited[3] === '1';
            if (!name.startsWith('Carvera_')) return;

            // Apply diff
            let changed = false;

            // Find device with the same host, but different name - remove it
            let existingHost = this.found.find((v) => v.host === host && v.name !== name && v.active);
            if (existingHost) {
                existingHost.active = false;
                if (existingHost.timeout) {
                    clearTimeout(existingHost.timeout);
                    existingHost.timeout = null;
                }
                changed = true;
                log('carvera', 'Device ' + existingHost.name + ' disconnected');
            }

            // Apply if existing
            let item = this.found.find((v) => v.name === name);
            if (item) {
                if (!(item.host === host && item.port === port && item.busy === busy && item.active)) {
                    item.host = host;
                    item.port = port;
                    item.busy = busy;
                    item.active = true;
                    changed = true;
                    log('carvera', 'Device ' + item.name + ' connected');
                }
            } else {
                item = {
                    timeout: null,
                    host,
                    port,
                    name,
                    active: true,
                    busy
                }
                this.found.push(item);
                log('carvera', 'Device ' + item.name + ' connected');
                changed = true;
            }

            // Set timeout
            clearTimeout(item.timeout);
            let f = item;
            f.timeout = setTimeout(() => {
                if (f.active) {
                    f.active = false;
                    f.timeout = null;
                }
            }, 5000);

            // Log
            if (changed) {
                log('carvera', 'Device list changed');
            }
        });
        client.bind(3333, '0.0.0.0');
    }
}