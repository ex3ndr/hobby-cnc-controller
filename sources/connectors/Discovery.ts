import { Vendor } from './Vendor';
import { CarveraDiscovery } from './discovery/carvera';
import { SerialDiscovery } from './discovery/serial';

export interface Discovery {
    devices: DiscoveredDevice[];
}

export type DeviceTransport = {
    type: 'serial';
    path: string;
} | {
    type: 'tcp';
    host: string;
    port: number;
}

export interface DiscoveredDevice {
    readonly id: string;
    readonly transport: DeviceTransport;
    readonly name: string;
    readonly vendor: Vendor;
    readonly state: 'active' | 'inactive' | 'busy';
}

class CombinedDiscovery implements Discovery {
    private discovery: Discovery[];

    get devices() {
        let res: DiscoveredDevice[] = [];
        for (let i of this.discovery) {
            for (let d of i.devices) {
                res.push(d);
            }
        }
        return res;
    }

    constructor(discovery: Discovery[]) {
        this.discovery = discovery;
    }
}

export async function createDisovery(): Promise<Discovery> {
    const discoveries = await Promise.all<Discovery>([
        SerialDiscovery.create(),
        CarveraDiscovery.create()
    ]);
    return new CombinedDiscovery(discoveries);
}