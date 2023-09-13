import { createDisovery } from "./connectors/Discovery";
import { log } from "./utils/log";

(async () => {
    log('main', 'Starting discovery...');
    let discovery = await createDisovery();
    log('main', 'Discovery ready with ' + discovery.devices.length + ' devices.');
})();