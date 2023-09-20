export function escapeFilename(src: string) {
    return src.replaceAll(' ', '\x01');
}

export function unescapeFilename(src: string) {
    return src.replaceAll('\x01', ' ');
}