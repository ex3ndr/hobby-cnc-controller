export function log(module: string, message: string, ...args: any[]) {
    console.log(`[${module}] ${message}`, ...args);
}