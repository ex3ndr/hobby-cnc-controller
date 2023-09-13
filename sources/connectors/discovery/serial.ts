import { SerialPort } from 'serialport';
import { backoff, delay } from "../../utils/time";
import type { Discovery, DiscoveredDevice } from "../Discovery";
import { log } from '../../utils/log';

type SerialDevice = {
    path: string;
    active: boolean;
}

export class SerialDiscovery implements Discovery {

    static async list(): Promise<SerialDevice[]> {
        let devices = await SerialPort.list();
        let res: SerialDevice[] = [];
        for (let d of devices) {
            if (d.path !== '/dev/ttyAMA0') {
                res.push({
                    path: d.path,
                    active: true
                })
            }
        }
        return res;
    }

    static async create(): Promise<SerialDiscovery> {
        return new SerialDiscovery(await SerialDiscovery.list());
    }

    private found: SerialDevice[];

    get devices(): DiscoveredDevice[] {
        let res: DiscoveredDevice[] = [];
        for (let d of this.found) {
            res.push({
                transport: {
                    type: 'serial',
                    path: d.path
                },
                name: 'USB Machine',
                key: 'serial:' + d.path,
                state: d.active ? 'active' : 'inactive',
                vendor: 'unknown'
            })
        }
        return res;
    }

    constructor(initial: SerialDevice[]) {
        this.found = [...initial];
        for (let d of initial) {
            log('serial', 'Device ' + d.path + ' ' + (d.active ? 'connected' : 'disconnected'));
        }

        backoff(async () => {

            // Load devices
            let devices = await SerialDiscovery.list();

            // Apply diff
            let changed = false;
            for (let d of devices) {
                let found = this.found.find((v) => v.path === d.path);
                if (found) {
                    if (found.active !== d.active) {
                        found.active = d.active;
                        changed = true;
                        log('serial', 'Device ' + d.path + ' ' + (d.active ? 'connected' : 'disconnected'));
                    }
                } else {
                    this.found.push(d);
                    log('serial', 'Device ' + d.path + ' ' + (d.active ? 'connected' : 'disconnected'));
                    changed = true;
                }
            }
            for (let f of this.found) {
                if (!devices.find((v) => v.path === f.path)) {
                    if (f.active) {
                        f.active = false;
                        changed = true;
                        log('serial', 'Device ' + f.path + ' disconnected');
                    }
                }
            }

            // Notify
            if (changed) {
                log('serial', 'Device list changed');
            }

            // Retry in 1s
            await delay(1000);
        });
    }
}