import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { EMERGENCY_NUMBER, HELPLINES } from '@anxiocare/shared';

/**
 * Puts one-tap call links into the static HTML from the shared helpline data, so a
 * person on a slow network (or with JavaScript broken) can reach help before any
 * script has loaded, and the numbers are never duplicated by hand.
 */
function staticHelpLinks(): Plugin {
  const primary = HELPLINES[0]!;
  const links =
    `<a class="boot-call" href="tel:${EMERGENCY_NUMBER.tel}">Emergency: call ${EMERGENCY_NUMBER.display}</a>` +
    `<a class="boot-call" href="tel:${primary.tel}">${primary.name}: call ${primary.display}</a>`;
  return {
    name: 'anxiocare-static-help-links',
    transformIndexHtml: (html) => html.replaceAll('<!--help-links-->', links),
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    staticHelpLinks(),
    VitePWA({
      registerType: 'prompt',
      // Registered from our own bundle (see shell/UpdatePrompt.tsx): no inline script.
      injectRegister: false,
      strategies: 'generateSW',
      manifestFilename: 'manifest.webmanifest',
      manifest: {
        id: '/',
        name: 'AnxioCare',
        short_name: 'AnxioCare',
        description: 'A private check-in for anxiety, calming tools, and helplines in India.',
        lang: 'en-IN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f6e9e3',
        theme_color: '#f6e9e3',
        categories: ['health', 'medical', 'lifestyle'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Get help', url: '/help', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Breathe', url: '/tools/breathe', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
      },
      workbox: {
        // Every route chunk is precached, so Help, Tools and Legal work offline after one visit.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        globIgnores: ['**/*vietnamese*'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api(\/|$)/],
        // No runtimeCaching on purpose: the service worker never stores anything from /api.
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // CSP has no data: source, so nothing may be inlined as a data URI.
    assetsInlineLimit: 0,
    target: 'es2022',
    sourcemap: false,
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        // Zod, its jitless setting and every schema in one chunk, the setting first. Split across chunks, a schema can
        // be built before z.config({ jitless: true }) runs, and Zod's eval probe then breaks the CSP.
        manualChunks(id) {
          // The password list stays out: only the screens that set a password load it.
          if (/[\\/]packages[\\/]shared[\\/]src[\\/](common-)?passwords\.ts$/.test(id)) return undefined;
          // So does the question bank: only the check-in, a reflection, Trends and the report read it, and they're lazy.
          if (/[\\/]packages[\\/]shared[\\/]src[\\/](questions|reflections)\.ts$/.test(id)) return undefined;
          if (/[\\/]node_modules[\\/]zod[\\/]|[\\/]src[\\/]lib[\\/]zod-config\.ts$|[\\/]packages[\\/]shared[\\/]src[\\/]/.test(id)) return 'contract';
          return undefined;
        },
      },
    },
  },
  server: {
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
  },
});
