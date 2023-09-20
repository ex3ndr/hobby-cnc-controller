export type Future<T> = {
    promise: Promise<T>,
    resolve: (value: T) => void,
    reject: (error: any) => void
}
export function createFuture<T>() {
    let resolve: (value: T) => void;
    let reject: (error: any) => void;
    let promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return {
        promise,
        resolve: resolve!,
        reject: reject!
    };
}