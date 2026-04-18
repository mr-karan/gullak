export class Mutex {
  private chain: Promise<void> = Promise.resolve();

  async runExclusive<T>(work: () => Promise<T> | T): Promise<T> {
    const previous = this.chain;
    let release!: () => void;
    this.chain = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      return await work();
    } finally {
      release();
    }
  }
}
