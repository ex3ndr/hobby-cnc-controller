import { InvalidateSync } from "../utils/invalidateSync";
import { isGCode } from "../utils/isGCode";
import { log } from "../utils/log";
import { randomKey } from "../utils/random";
import { MachineState, Profile, isMachineStateEquals } from "../profiles/Common";
import { _allProfiles } from "../profiles/_all";
import { TransportEndpoint } from "../storage/config";
import { RepeatSync } from "../utils/RepeatSync";

export type ConnectionState = {
    status: 'connecting';
} | {
    id: string;
    status: 'connected';
    profile: Profile;
} | {
    id: string;
    status: 'ready';
    profile: Profile;
    state: MachineState;
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
    kind: 'soft-lock'
} | {
    kind: 'soft-unlock'
} | {
    kind: 'reset'
};

export class Controller {
    readonly id: string;
    readonly profile: string;
    readonly endpoint: TransportEndpoint;

    private _destroyed = false;
    private _sync: InvalidateSync;
    private _syncStatus: RepeatSync;
    private _state: ConnectionState = { status: 'connecting' };
    private _queue: { id: string, command: MachineCommand }[] = [];

    get state() {
        return this._state;
    }

    constructor(id: string, profile: string, endpoint: TransportEndpoint) {
        this.id = id;
        this.profile = profile;
        this.endpoint = endpoint;
        this._sync = new InvalidateSync(this._doSync.bind(this));
        this._sync.invalidate();
        this._syncStatus = new RepeatSync(500, this.#doSyncStatus.bind(this));
    }

    command(id: string, command: MachineCommand) {
        if (this._state.status === 'ready' && this._state.id === id) {
            if (command.kind === 'gcode' && !isGCode(command.command)) {
                log('controller', 'Invalid gcode', command.command);
                return; // Ignore invalid gcode
            }
            this._queue.push({ id, command }); // Ignore commands for other machines or if not ready
            this._sync.invalidate();
        }
    }

    destroy() {
        if (!this._destroyed) {
            this._destroyed = true;
            this._syncStatus.stop();
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
                this._state.profile.close();
            }
            this._state = { status: 'disconnected' };
            log('controller', 'Destroyed');
            return; // Early return just in case
        }

        //
        // Detect disconnect
        //

        if (this._state.status === 'connected' || this._state.status === 'ready') {
            if (!this._state.profile.connected) {
                this._state.profile.close();
                this._state = { status: 'connecting' };
                log('controller', 'Disconnected');
            }
        }

        //
        // Create a connection if needed
        //

        if (this._state.status === 'connecting') {
            log('controller', 'Connecting to ' + this.endpoint);
            let profile = await _allProfiles[this.profile].create(this.endpoint);
            this._state = { id: randomKey(), status: 'connected', profile };
            log('controller', 'Connected');
        }

        //
        // Read initial state
        // 

        if (this._state.status === 'connected') {

            // Configure
            log('controller', 'Configuring machine');
            await this._state.profile.prepare();

            // Load state
            log('controller', 'Loading machine state');
            let state = await this._state.profile.state();

            // Update local state
            this._state = { id: this._state.id, status: 'ready', profile: this._state.profile, state };
            log('controller', 'Machine ready', state);

            // Invalidate status sync
            this._syncStatus.invalidate();
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
                    log('controller', 'Sending command', op.command);
                    let response = await this._state.profile.command(op.command);
                    log('controller', 'Response', response);
                } else if (op.kind === 'soft-lock') {
                    log('controller', 'Soft lock');
                    await this._state.profile.softLock();
                } else if (op.kind === 'soft-unlock') {
                    log('controller', 'Soft unlock');
                    await this._state.profile.softUnlock();
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

    async #doSyncStatus() {
        if (this._state.status === 'ready') {
            let s = this._state.state;
            let id = this._state.id;
            let state = await this._state.profile.state();
            if (this._state.status === 'ready' && this._state.id === id /* Protection from concurrency problems */) {
                if (!isMachineStateEquals(s, state)) {
                    this._state = { ...this._state, state };
                    log('controller', 'State changed to ', state);
                }
            }
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