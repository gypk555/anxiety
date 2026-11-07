import { defineConfig, devices } from '@playwright/test';

const LIVE_ORIGIN = 'http://localhost:8787';
const MOCK_ORIGIN = 'http://localhost:4173';
const HTTPS_ORIGIN = 'https://localhost:8443';
const GOOGLE_OFF_ORIGIN = 'http://localhost:8788';
const FAKE_OIDC_PORT = 54393;

/**
 * Three suites:
 *  - `iphone` and `pixel`: visual and accessibility audit of the built web against a mocked API.
 *  - `live-iphone` and `live-pixel`: the real stack, nothing mocked (e2e/live).
 *  - `https-iphone` and `https-pixel`: the production build in production mode behind TLS (e2e/https).
 *
 * The live server is what production runs: the bundled API serving the built web, on real Postgres.
 * It keeps its own data directory and Postgres port, so it never touches a developer's dev database.
 * TRUST_PROXY_HOPS=1 lets each test present its own client address (see live/support.ts), so per-IP
 * limits stay on, at their production values, and one test cannot spend another's allowance.
 * E2E_REUSE=1 reuses a server you started yourself with the same environment.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // CI keeps a report for failures. Everything in it is test data, from throwaway accounts on throwaway databases.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: { trace: 'off', screenshot: process.env.CI ? 'only-on-failure' : 'off' },
  projects: [
    { name: 'iphone', testIgnore: /(live|https)\//, use: { ...devices['iPhone 14'], baseURL: MOCK_ORIGIN } },
    { name: 'pixel', testIgnore: /(live|https)\//, use: { ...devices['Pixel 7'], baseURL: MOCK_ORIGIN } },
    { name: 'live-iphone', testDir: './e2e/live', use: { ...devices['iPhone 14'], baseURL: LIVE_ORIGIN } },
    { name: 'live-pixel', testDir: './e2e/live', use: { ...devices['Pixel 7'], baseURL: LIVE_ORIGIN } },
    // Service workers refuse a self-signed certificate, which has nothing to do with what is being proved here.
    { name: 'https-iphone', testDir: './e2e/https', use: { ...devices['iPhone 14'], baseURL: HTTPS_ORIGIN, ignoreHTTPSErrors: true, serviceWorkers: 'block' } },
    { name: 'https-pixel', testDir: './e2e/https', use: { ...devices['Pixel 7'], baseURL: HTTPS_ORIGIN, ignoreHTTPSErrors: true, serviceWorkers: 'block' } },
  ],
  // Started in this order: the first one builds the dist that the others serve.
  webServer: [
    {
      command: `node apps/api/scripts/fake-oidc.ts ${FAKE_OIDC_PORT}`,
      cwd: '../..',
      url: `http://127.0.0.1:${FAKE_OIDC_PORT}/healthz`,
      timeout: 20_000,
      reuseExistingServer: process.env.E2E_REUSE === '1',
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'npm run build && npm run dev -w @anxiocare/api',
      cwd: '../..',
      env: {
        DEV_USE_BUILD: '1',
        DEV_FRESH: '1',
        DEV_PG_DIR: '.pgdata-e2e',
        DEV_PG_PORT: '54387',
        TRUST_PROXY_HOPS: '1',
        LOG_LEVEL: 'warn',
        // Fake on purpose, and on another site. Production refuses GOOGLE_OIDC_BASE_URL.
        GOOGLE_CLIENT_ID: 'fake-client-id.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: 'fake-client-secret',
        GOOGLE_OIDC_BASE_URL: `http://127.0.0.1:${FAKE_OIDC_PORT}`,
      },
      url: `${LIVE_ORIGIN}/api/v1/meta`,
      timeout: 240_000,
      reuseExistingServer: process.env.E2E_REUSE === '1',
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      stdout: 'ignore',
      stderr: 'pipe',
    },
    // The same build with Google left unset, to prove the button is hidden by what the server really says.
    {
      command: 'npm run dev -w @anxiocare/api',
      cwd: '../..',
      env: {
        DEV_USE_BUILD: '1',
        DEV_FRESH: '1',
        DEV_PG_DIR: '.pgdata-e2e-no-google',
        DEV_PG_PORT: '54386',
        PORT: '8788',
        TRUST_PROXY_HOPS: '1',
        LOG_LEVEL: 'warn',
        MAIL_TRANSPORT: 'file:../../.e2e-outbox/no-google-mail.jsonl',
      },
      url: `${GOOGLE_OFF_ORIGIN}/api/v1/meta`,
      timeout: 120_000,
      reuseExistingServer: process.env.E2E_REUSE === '1',
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'node apps/api/scripts/https-stack.ts',
      cwd: '../..',
      url: `${HTTPS_ORIGIN}/healthz`,
      ignoreHTTPSErrors: true,
      timeout: 120_000,
      reuseExistingServer: process.env.E2E_REUSE === '1',
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'node scripts/serve-csp.mjs',
      url: MOCK_ORIGIN,
      reuseExistingServer: true,
    },
  ],
});
