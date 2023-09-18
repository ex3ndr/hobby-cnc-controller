import { DiscoveredDevice, Discovery } from "../connectors/Discovery";
import { Controller } from "./controller";
import { _allProfiles } from "../profiles/_all";
import { Config, TransportEndpoint, loadConfig, saveConfig } from "../storage/config";
import { randomKey } from "../utils/random";
import { AsyncLock } from "../utils/lock";
import { Storage } from "../storage/storage";

export class Manager {

    static async create(discovery: Discovery, storage: Storage) {
        let config = loadConfig(storage);
        let c = new Manager(discovery, storage, config);
        return c;
    }

    private readonly storage: Storage;
    private readonly discovery: Discovery;
    private config: Config;
    private controller: Controller | null = null;
    private lock = new AsyncLock();

    constructor(discovery: Discovery, storage: Storage, config: Config) {
        this.storage = storage;
        this.discovery = discovery;
        this.config = config;
        if (this.config.connection) {
            this.controller = new Controller(randomKey(), this.config.connection.profile, this.config.connection.transport);
        }
    }

    get discoveredDevices() {
        let d: { device: DiscoveredDevice, profiles: string[] }[] = [];
        for (let device of this.discovery.devices) {

            // Collect supported profiles
            let profiles: string[] = [];
            for (let profile in _allProfiles) {
                if (_allProfiles[profile].isSupported(device)) {
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

    get activeController() {
        return this.controller;
    }

    async state() {
        return this.lock.inLock(async () => {
            if (this.controller) {
                return {
                    state: 'configured',
                    controller: this.controller.state
                }
            } else {
                return {
                    state: 'not_configured'
                }
            }
        });
    }

    async create(profile: string, transport: TransportEndpoint) {
        return this.lock.inLock(async () => {

            // Ignore if already connected
            if (this.config.connection) {
                return;
            }

            // Check if profile is supported
            let p = _allProfiles[profile];
            if (!p) {
                throw new Error(`Profile ${profile} is not supported`);
            }

            // Update config
            let config = {
                ...this.config,
                version: this.config.version + 1,
                connection: {
                    name: p.defaultName,
                    transport,
                    profile
                }
            };
            saveConfig(this.storage, config);
            this.config = config;

            // Update controller
            this.controller = new Controller(randomKey(), config.connection.profile, config.connection.transport);
        });
    }

    async delete() {
        return this.lock.inLock(async () => {

            // Ignore if not connected
            if (this.config.connection) {
                return;
            }

            // Update config
            let config = {
                ...this.config,
                version: this.config.version + 1,
                connection: undefined
            };
            saveConfig(this.storage, config);
            this.config = config;

            // Delete controller
            let c = this.controller;
            this.controller = null;
            c!.destroy();
        });
    }
}