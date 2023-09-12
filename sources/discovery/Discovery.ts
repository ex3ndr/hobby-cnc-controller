import { SerialPort } from 'serialport';

export type DiscoveryState = 'preparing' | 'ready';

export type Discovery = {
    readonly state: DiscoveryState;
}

// export function createDisovery(): Discovery {

// }

// export const DiscoveryLocal: Discovery = {
//     state: 'ready',
// };