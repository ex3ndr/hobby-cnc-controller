export class Queue<T> {

    private q: T[] = [];
    private error: Error | null = null;
    private awaiters: ({ resolve: (src: T) => void, reject: (error: Error) => void })[] = [];

    push = (item: T) => {

        // If queue is closed
        if (this.error) {
            throw this.error;
        }

        // If queue is not empty
        if (this.q.length > 0) {
            this.q.push(item);
            return;
        }

        // If queue is empty and there are awaiters
        if (this.awaiters.length > 0) {
            this.awaiters.shift()!.resolve(item);
            return;
        }

        // No awaiters and not empty queue
        this.q.push(item);
    }

    get = async () => {
        if (this.q.length > 0) {
            return this.q.shift()!;
        }
        return await new Promise<T>((resolve, reject) => this.awaiters.push({ resolve, reject }));
    };

    close = (error: Error) => {
        this.error = error;
        while (this.awaiters.length > 0) {
            this.awaiters.shift()!.reject(error);
        }
    }

    get isEmpty() {
        return this.q.length === 0;
    }
}