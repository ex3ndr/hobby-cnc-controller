import { TransportStream } from "../../connectors/transport/TransportStream";

export type FileEntry = {
    kind: 'directory',
    name: string
} | {
    kind: 'file',
    name: string,
    size: number
}

export type MachineStatus = 'alarm' | 'home' | 'hold' | 'idle' | 'run';

export type Vector5 = {
    x: number,
    y: number,
    z: number,
    a: number,
    b: number
}

export type MachineState = {
    status: MachineStatus;
    machinePosition: Vector5;
    workPosition: Vector5;
    feed: {
        current: number,
        target: number,
        scale: number
    },
    spindle: {
        current: number,
        target: number,
        scale: number,
        temperature: number
    },
    vacuum: {
        enabled: boolean
    },
    tool: {
        index: number,
        offset: number
    }
}

export interface Profile {
    readState(): Promise<MachineState>;
    disconnect(): Promise<void>;
};