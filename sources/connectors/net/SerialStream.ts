export type SerialStream = {
    send(data: Buffer): void;
    read(length: number): Promise<Buffer>;
    readUntil(byte: number): Promise<Buffer>;
};