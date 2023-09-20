export interface Transport {
    connected: boolean;
    send(data: Buffer): void;
    read(): Promise<Buffer>;
    close(): void;
    onClosed: (() => void) | null;
}