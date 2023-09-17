let regex = new RegExp('[A-Za-z]\\s*[-+]?\\d+.*');

export function isGCode(src: string) {
    return regex.test(src);
} 