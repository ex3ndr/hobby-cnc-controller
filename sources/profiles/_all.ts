import { DiscoveredDevice } from "../connectors/Discovery";
import { TransportEndpoint } from "../storage/config";
import { Storage } from "../storage/storage";
import { Carvera } from "./carvera/Carvera";
import { Profile } from "./Common";

export const _allProfiles: {
    [key: string]: {
        isSupported(device: DiscoveredDevice): boolean,
        create(device: TransportEndpoint, storage: Storage): Promise<Profile>,
        readonly defaultName: string
    }
} = {
    'carvera': Carvera
};