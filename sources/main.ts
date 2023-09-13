import { createDisovery } from "./connectors/Discovery";
import { Controller } from "./controller/controller";
import { startApi } from "./server/startApi";
import { log } from "./utils/log";

(async () => {

    // Discovery
    log('main', 'Starting discovery...');
    let discovery = await createDisovery();
    log('main', 'Discovery ready with ' + discovery.devices.length + ' devices.');

    // Create app
    let controller = new Controller(discovery);

    // Server
    log('main', 'Starting API...');
    await startApi(controller);
    log('main', 'Server started at http://localhost:3000/');
})();