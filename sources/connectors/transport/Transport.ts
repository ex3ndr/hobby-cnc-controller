export interface Transport {
    connected: boolean;
    send(data: Buffer): void;
    read(): Promise<Buffer>;
    disconnect(): Promise<void>;
}