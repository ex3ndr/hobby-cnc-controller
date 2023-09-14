import { DeviceTransport } from "../connectors/Discovery";
import { backoff, delay } from "../utils/time";
import { MachineState, Profile } from "./profiles/Common";

type ConnectionState = {
    status: 'connecting';
} | {
    status: 'connected';
    state: MachineState;
}

export class Machine {
    readonly id: string;
    readonly profile: string;
    readonly transport: DeviceTransport;
    private destroyed = false;
    private currentConnection: Profile | null = null;

    constructor(id: string, transport: DeviceTransport, profile: string) {
        this.id = id;
        this.transport = transport;
        this.profile = profile;
        backoff(this.#workLoop.bind(this));
    }

    async #workLoop() {
        while (!this.destroyed) {
            delay(1000);
        }
    }

    move(to: { x?: number, y?: number, z?: number }) {
        if (!this.currentConnection || this.destroyed) {
            throw new Error('Not connected');
        }

        // TODO: Implement
    }

    destroy() {
        this.destroyed = true;
    }
}