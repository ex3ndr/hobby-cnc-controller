import { DeviceTransport, DiscoveredDevice } from "../../connectors/Discovery";
import { Carvera } from "./Carvera";
import { Profile } from "./Common";

export const _all: {
    [key: string]: {
        isSupported(device: DiscoveredDevice): boolean,
        create(device: DeviceTransport): Promise<Profile>
    }
} = {
    'carvera': Carvera
};