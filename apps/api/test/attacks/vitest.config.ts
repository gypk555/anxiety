import { defineConfig } from 'vitest/config';

/** The reviewer's attack scripts. Not part of `npm test`: they log what happens instead of asserting. */
export default defineConfig({
  test: {
    root: 'test/attacks',
    include: ['*.attack.ts'],
    globalSetup: ['../global-setup.ts'],
    pool: 'forks',
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
