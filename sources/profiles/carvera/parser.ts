import { MachineStatus, Vector5 } from "../Common";
import { MachineError } from "../_errors";
import { CARVERA_HALT_ERRORS } from "./errors";

export type CarveraState = {
    status: MachineStatus;
    machinePosition: Vector5;
    workPosition: Vector5;
    progress: {
        lines: number,
        percent: number,
        seconds: number
    } | null,
    feed: { current: number, target: number, scale: number },
    spindle: { current: number, target: number, scale: number, temperature: number },
    vacuum: { enabled: boolean },
    tool: { index: number, offset: number },
    halt: { reason: MachineError } | null
};

export function parseState(src: string) {
    let parts = src.split('|');

    // Parse status
    let status: MachineStatus;
    if (parts[0] === 'Alarm') {
        status = 'alarm';
    } else if (parts[0] === 'Home') {
        status = 'home';
    } else if (parts[0] === 'Hold') {
        status = 'hold';
    } else if (parts[0] === 'Idle') {
        status = 'idle';
    } else if (parts[0] === 'Run') {
        status = 'run';
    } else if (parts[0] === 'Pause') {
        status = 'pause';
    } else {
        throw new Error('Unknown state: ' + parts[0]);
    }
    parts = parts.slice(1);

    // Parse fields
    let state: CarveraState = {
        status,
        machinePosition: { x: 0, y: 0, z: 0, a: 0, b: 0 },
        workPosition: { x: 0, y: 0, z: 0, a: 0, b: 0 },
        feed: {
            current: 0,
            target: 0,
            scale: 1,
        },
        spindle: {
            current: 0,
            target: 0,
            scale: 1,
            temperature: 0
        },
        vacuum: {
            enabled: false
        },
        progress: null,
        tool: {
            index: -1,
            offset: 0
        },
        halt: null
    };
    for (let p of parts) {
        if (p.startsWith('MPos:')) {
            let vars = p.substring('MPos:'.length).split(',').map((v) => parseFloat(v));
            while (vars.length < 5) vars.push(0);
            state.machinePosition = { x: vars[0], y: vars[1], z: vars[2], a: vars[3], b: vars[4] };
        }
        if (p.startsWith('WPos:')) {
            let vars = p.substring('WPos:'.length).split(',').map((v) => parseFloat(v));
            while (vars.length < 5) vars.push(0);
            state.workPosition = { x: vars[0], y: vars[1], z: vars[2], a: vars[3], b: vars[4] };
        }
        if (p.startsWith('F:')) {
            let vars = p.substring('F:'.length).split(',').map((v) => parseFloat(v));
            while (vars.length < 3) vars.push(0);
            state.feed = { current: vars[0], target: vars[1], scale: vars[2] / 100 };
        }
        if (p.startsWith('S:')) {
            let vars = p.substring('S:'.length).split(',').map((v) => parseFloat(v));
            while (vars.length < 5) vars.push(0);
            state.spindle = { current: vars[0], target: vars[1], scale: vars[2] / 100, temperature: vars[4] };
            state.vacuum = { enabled: vars[3] === 1 };
        }
        if (p.startsWith('T:')) {
            let vars = p.substring('T:'.length).split(',').map((v) => parseFloat(v));
            while (vars.length < 2) vars.push(0);
            state.tool = { index: vars[0], offset: vars[1] };
        }
        if (p.startsWith('H:')) {
            let vars = p.substring('H:'.length).split(',').map((v) => parseInt(v));
            while (vars.length < 1) vars.push(0);
            let error = CARVERA_HALT_ERRORS[vars[0]];
            if (error) {
                state.halt = { reason: error };
            }
        }
        if (p.startsWith('P:')) {
            let vars = p.substring('P:'.length).split(',').map((v) => parseInt(v));
            while (vars.length < 3) vars.push(0);
            state.progress = {
                lines: vars[0],
                percent: vars[1],
                seconds: vars[2]
            };
        }
    }

    return state;
}