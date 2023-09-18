import { mkdirp } from 'mkdirp';
import { Storage } from './storage';

export async function openStorage(path: string) {

    // Create directory
    await mkdirp(path);

    // Result
    return new Storage(path);
}