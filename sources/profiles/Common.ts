import { TransportStream } from "../connectors/transport/TransportStream";
import { MachineError } from "./_errors";

export type FileEntry = {
    kind: 'directory',
    name: string
} | {
    kind: 'file',
    name: string,
    size: number
}

export type MachineStatus = 'alarm' | 'home' | 'hold' | 'idle' | 'run' | 'pause';

export type Vector5 = {
    x: number,
    y: number,
    z: number,
    a: number,
    b: number
}

export type MachineState = {

    // Firmware
    firmware: {
        version: string
    },

    // Status
    status: MachineStatus;

    // Positions
    machinePosition: Vector5;
    workPosition: Vector5;

    // Feed
    feed: {
        current: number,
        target: number,
        scale: number
    },

    // Spindle
    spindle: {
        current: number,
        target: number,
        scale: number,
        temperature: number
    },

    // Vacuum
    vacuum: {
        enabled: boolean
    },

    // Tool
    tool: {
        index: number,
        offset: number
    },

    // Halt
    halt: {
        reason: MachineError
    } | null
}

export function isMachineStateEquals(a: MachineState, b: MachineState): boolean {
    return a.status === b.status
        && a.machinePosition.x === b.machinePosition.x
        && a.machinePosition.y === b.machinePosition.y
        && a.machinePosition.z === b.machinePosition.z
        && a.machinePosition.a === b.machinePosition.a
        && a.machinePosition.b === b.machinePosition.b
        && a.workPosition.x === b.workPosition.x
        && a.workPosition.y === b.workPosition.y
        && a.workPosition.z === b.workPosition.z
        && a.workPosition.a === b.workPosition.a
        && a.workPosition.b === b.workPosition.b
        && a.feed.current === b.feed.current
        && a.feed.target === b.feed.target
        && a.feed.scale === b.feed.scale
        && a.spindle.current === b.spindle.current
        && a.spindle.target === b.spindle.target
        && a.spindle.scale === b.spindle.scale
        && a.spindle.temperature === b.spindle.temperature
        && a.vacuum.enabled === b.vacuum.enabled
        && a.tool.index === b.tool.index
        && a.tool.offset === b.tool.offset
        && a.halt?.reason === b.halt?.reason
        && b.firmware.version === b.firmware.version;
}

export interface Profile {
    get stream(): TransportStream;
    get connected(): boolean;

    // Prepare machine for communication
    prepare(): Promise<void>;

    // Load current state
    state(): Promise<MachineState>;
    currentFile(): Promise<string | null>;

    // Execute commands
    command(command: string): Promise<string>;
    home(): Promise<void>;
    softUnlock(): Promise<void>;
    softLock(): Promise<void>;

    // Disconnect from machine
    close(): void;
};