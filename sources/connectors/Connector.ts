export type Connector = {
    downloadFile: (path: string) => Promise<Buffer>;
    command(command: string): Promise<string>;
}