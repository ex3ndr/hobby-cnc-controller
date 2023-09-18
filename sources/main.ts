import { createDisovery } from "./connectors/Discovery";
import { Manager } from "./controller/manager";
import { startApi } from "./controller/api";
import { openStorage } from "./storage/openStorage";
import { log } from "./utils/log";

(async () => {

    // Storage
    const storagePath = process.env.CNC_ROOT || (process.cwd() + '/data');
    log('main', 'Starting storage at ' + storagePath);
    let storage = await openStorage(storagePath);

    // Discovery
    log('main', 'Starting discovery...');
    let discovery = await createDisovery();
    log('main', 'Discovery ready with ' + discovery.devices.length + ' devices.');

    // Create app
    log('main', 'Starting manager...');
    let controller = await Manager.create(discovery, storage);

    // Server
    log('main', 'Starting API...');
    await startApi(controller);
    log('main', 'Controller ready at http://localhost:3000/');
})();