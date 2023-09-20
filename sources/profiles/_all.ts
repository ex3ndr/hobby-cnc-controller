import { DiscoveredDevice } from "../connectors/Discovery";
import { TransportEndpoint } from "../storage/config";
import { Carvera } from "./carvera/Carvera";
import { Profile } from "./Common";

export const _allProfiles: {
    [key: string]: {
        isSupported(device: DiscoveredDevice): boolean,
        create(device: TransportEndpoint): Promise<Profile>,
        readonly defaultName: string
    }
} = {
    'carvera': Carvera
};