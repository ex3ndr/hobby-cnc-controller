import { mkdirp } from 'mkdirp';
import fs from 'fs';
import path from 'path';
import writeAtomic from 'write-file-atomic';

export class Storage {
    readonly path: string;

    constructor(path: string) {
        this.path = path;
    }

    readFile(file: string) {
        let p = path.resolve(this.path, file);
        if (!fs.existsSync(p)) {
            return null;
        }
        return fs.readFileSync(p);
    }

    writeFile(file: string, data: string | Buffer) {
        let p = path.resolve(this.path, file);
        mkdirp.sync(path.dirname(p));
        fs.writeFileSync(p, data);
    }

    writeFileAtomic(file: string, data: string | Buffer) {
        let p = path.resolve(this.path, file);
        mkdirp.sync(path.dirname(p));
        writeAtomic.sync(p, data);
    }
}