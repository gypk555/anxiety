import { z } from 'zod';

/**
 * Zod's JIT probes for eval with `new Function('')`, which the CSP rightly reports as a
 * violation. Must run before any schema is created, so main.tsx imports this first.
 */
z.config({ jitless: true });
