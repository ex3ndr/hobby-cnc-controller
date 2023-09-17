import { DiscoveredDevice, Discovery } from "../connectors/Discovery";
import { Machine } from "./machine";
import { _all } from "./profiles/_all";

export class Controller {
    private discovery: Discovery;
    private machines: Machine[] = [];

    constructor(discovery: Discovery) {
        this.discovery = discovery;
    }

    get availableDevices() {
        let d: { device: DiscoveredDevice, profiles: string[] }[] = [];
        for (let device of this.discovery.devices) {

            // Skip already connected
            if (this.machines.findIndex((v) => v.id === device.id) !== -1) {
                continue;
            }

            // Collect supported profiles
            let profiles: string[] = [];
            for (let profile in _all) {
                if (_all[profile].isSupported(device)) {
                    profiles.push(profile);
                }
            }

            // If have compatible profiles, add to list
            if (profiles.length > 0) {
                d.push({ device, profiles });
            }
        }
        return d;
    }

    get connectedDevices() {
        return this.machines;
    }

    machine(id: string) {
        return this.machines.find((v) => v.id === id);
    }

    get state() {
        let machines: any[] = [];;
        for (let c of this.connectedDevices) {

            let state: any = {};
            if (c.state.status === 'connecting') {
                state = {
                    status: 'connecting'
                };
            } else if (c.state.status === 'connected') {
                state = {
                    status: 'connected'
                };
            } else if (c.state.status === 'ready') {
                state = {
                    status: 'ready',
                    state: c.state.state,
                    id: c.state.id
                };
            } else { // Should not happen
                state = {
                    status: 'disconnected'
                };
            }

            machines.push({
                id: c.id,
                profile: c.profile,
                state
            });
        }
        return { machines };
    }

    connect(id: string, profile: string) {


        //
        // Check if device is already connected
        //

        if (this.machines.find((v) => v.id === id)) {
            throw new Error('Device is already connected');
        }

        //
        // Search for a device
        //

        let device = this.discovery.devices.find((v) => v.id === id);
        if (!device) throw new Error('Device not found');
        if (device.state !== 'active') throw new Error('Device is not active');

        //
        // Check if profile exist and supported for the connection
        //

        let inst = _all[profile];
        if (!inst) {
            throw new Error('Profile not found');
        }
        if (!inst.isSupported(device)) {
            throw new Error('Device is not supported');
        }

        //
        // Register a machine
        //

        let machine = new Machine(id, device.transport, profile);
        this.machines.push(machine);
    }

    disconnect(id: string) {


        //
        // Check if device is connected
        //

        if (!this.machines.find((v) => v.id === id)) {
            throw new Error('Device is not connected');
        }

        //
        // Disconnect machine
        //

        let machine = this.machines.find((v) => v.id === id)!;
        machine.destroy();

        //
        // Delete machine
        //

        this.machines = this.machines.filter((v) => v.id !== id);
    }
}