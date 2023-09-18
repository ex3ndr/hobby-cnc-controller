import { Storage } from "./storage";

export type Config = {
    connection?: {
        name: string;
        transport: TransportEndpoint;
        profile: string;
    },
    version: number,
    settings: UserSettings
};

export type UserSettings = {
    autoconnect: boolean;
}

//
// Defaults
//

const defaultConfig: Config = {
    version: 1,
    settings: {
        autoconnect: true
    }
};

//
// Load and save config
//

export type TransportEndpoint = {
    type: 'serial';
} | {
    type: 'tcp';
    host: string;
    port: number;
}

export function loadConfig(db: Storage): Config {
    let data = db.readFile('config.json');
    if (!data) {
        saveConfig(db, defaultConfig);
        return defaultConfig;
    }
    return JSON.parse(data.toString());
}

export function saveConfig(db: Storage, config: Config) {
    let value = JSON.stringify(config);
    db.writeFileAtomic('config.json', value);
}