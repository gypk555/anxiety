import type { FastifyBaseLogger } from 'fastify';

/** Work that must happen after the response, so it cannot influence response timing. */
export class Background {
  readonly #running = new Set<Promise<void>>();

  /** Starts `task` after the current turn of the event loop. Failures are logged without details. */
  run(log: FastifyBaseLogger, name: string, task: () => Promise<void>): void {
    const promise = new Promise<void>((resolve) => setImmediate(resolve))
      .then(task)
      .catch((err: unknown) => {
        log.error({ err, task: name }, 'background_task_failed');
      })
      .finally(() => {
        this.#running.delete(promise);
      });
    this.#running.add(promise);
  }

  async drain(): Promise<void> {
    while (this.#running.size > 0) await Promise.all(this.#running);
  }
}
