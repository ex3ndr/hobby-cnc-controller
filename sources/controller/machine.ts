import { DeviceTransport } from "../connectors/Discovery";
import { InvalidateSync } from "../utils/invalidateSync";
import { isGCode } from "../utils/isGCode";
import { log } from "../utils/log";
import { randomKey } from "../utils/random";
import { MachineState, Profile, isMachineStateEquals } from "./profiles/Common";
import { _all } from "./profiles/_all";

export type ConnectionState = {
    status: 'connecting';
} | {
    id: string;
    status: 'connected';
    profile: Profile;
} | {
    id: string;
    status: 'ready';
    state: MachineState;
    profile: Profile;
} | {
    status: 'disconnected'
}

export type MachineCommand = {
    kind: 'gcode',
    command: string
} | {
    kind: 'resume'
} | {
    kind: 'pause'
} | {
    kind: 'emergency-stop'
} | {
    kind: 'emergency-unlock'
};

export class Machine {
    readonly id: string;
    readonly profile: string;
    readonly transport: DeviceTransport;

    private _destroyed = false;
    private _sync: InvalidateSync;
    private _state: ConnectionState = { status: 'connecting' };
    private _timer: any;
    private _queue: { id: string, command: MachineCommand }[] = [];

    get state() {
        return this._state;
    }

    constructor(id: string, transport: DeviceTransport, profile: string) {
        this.id = id;
        this.transport = transport;
        this.profile = profile;
        this._sync = new InvalidateSync(this._doSync.bind(this));
        this._sync.invalidate();
        this._timer = setInterval(() => this._sync.invalidate(), 1000);
    }

    command(id: string, command: MachineCommand) {
        if (this._state.status === 'ready' && this._state.id === id) {
            if (command.kind === 'gcode' && !isGCode(command.command)) {
                log('machine', 'Invalid gcode', command.command);
                return; // Ignore invalid gcode
            }
            this._queue.push({ id, command }); // Ignore commands for other machines or if not ready
            this._sync.invalidate();
        }
    }

    destroy() {
        if (!this._destroyed) {
            this._destroyed = true;
            this._timer = clearInterval(this._timer);
            this._sync.invalidate();
        }
    }

    //
    // Sync Logic
    //
    // NOTE: We assume that underlying transport is effectively single threaded
    //       and therefore we can implement sync logic in a simple way inside 
    //       of the invalidate sync.
    // 
    // NOTE: We assume that sync state could be changed only within the sync
    //

    private async _doSync() {

        //
        // Destroy if needed
        //

        if (this._destroyed && this._state.status !== 'disconnected') {
            if (this._state.status === 'connected' || this._state.status === 'ready') {
                await this._state.profile.disconnect();
            }
            this._state = { status: 'disconnected' };
            return; // Early return just in case
        }

        //
        // Detect disconnect
        //

        if (this._state.status === 'connected' || this._state.status === 'ready') {
            if (!this._state.profile.transport.transport.connected) {
                log(this.id, 'Disconnected');
                this._state = { status: 'connecting' };
                return;
            }
        }

        //
        // Create a connection if needed
        //

        if (this._state.status === 'connecting') {
            log(this.id, 'Connecting to ' + this.transport);
            let profile = await _all[this.profile].create(this.transport);
            this._state = { id: randomKey(), status: 'connected', profile };
            log(this.id, 'Connected');
        }

        //
        // Read initial state
        // 

        let wasInited = false;
        if (this._state.status === 'connected') {

            // Configure
            log(this.id, 'Configuring machine');
            await this._state.profile.prepare();

            // Load state
            log(this.id, 'Loading init state');
            let state = await this._state.profile.readState();

            // Update local state
            this._state = { id: this._state.id, status: 'ready', state, profile: this._state.profile };
            wasInited = true;
            log(this.id, 'Init state loaded', this._state.state);
        }

        //
        // Handle emergency
        // 
        // NOTE: Emergency is handled as fast as possible without loading the state
        //
        // TODO: Reduce backoff in invalidation sync if emergency is detected
        //

        // TODO: Implement

        //
        // Refetch state if needed
        //

        if (this._state.status === 'ready' && !wasInited) {
            // log(this.id, 'Loading updated state');
            let state = await this._state.profile.readState();
            let oldState = this._state.state;
            this._state = { id: this._state.id, status: 'ready', state, profile: this._state.profile };
            if (!isMachineStateEquals(oldState, this._state.state)) {
                log(this.id, 'State changed', this._state.state);
            }
        }

        //
        // Execute command
        //

        if (this._state.status === 'ready') {

            // Process commands
            let sentCommands = 0;
            while (this._queue.length > 0 && sentCommands < 5) {

                // Load command
                let command = this._queue[0];
                let op = command.command;
                this._queue = this._queue.slice(1);
                if (command.id !== this._state.id) {
                    continue;
                }

                // Process command
                if (op.kind === 'gcode') {
                    log(this.id, 'Sending command', op.command);
                    let response = await this._state.profile.command(op.command);
                    log(this.id, 'Response', response);
                }
            }
        }

        //
        // Re-invalidate if needed
        //

        if (this.invalidationNeeded()) {
            this._sync.invalidate();
        }
    }

    private invalidationNeeded(): boolean {

        // Destroyed case
        if (this._destroyed) {
            return this._state.status !== 'disconnected';
        }

        // Connecting case
        if (this._state.status === 'connecting') {
            return true;
        }
        if (this._state.status === 'connected') {
            return true;
        }

        // Has queue
        if (this._state.status === 'ready' && this._queue.length > 0) {
            return true;
        }

        // Other cases
        return false;
    }
}