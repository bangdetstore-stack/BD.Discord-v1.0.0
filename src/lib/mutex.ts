/* Developer: BANGDET.MD */
export class Mutex {
    private queue: Array<() => void> = []
    private locked = false

    async acquire(): Promise<() => void> {
        return new Promise<() => void>((resolve) => {
            const execute = () => {
                this.locked = true
                resolve(() => this.release())
            }

            if (!this.locked) {
                execute()
            } else {
                this.queue.push(execute)
            }
        })
    }

    private release(): void {
        this.locked = false
        const next = this.queue.shift()
        if (next) {
            next()
        }
    }
}
