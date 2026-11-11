import './lib/zod-config';
import './styles.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { queryClient } from '@/lib/queries';
import { onQuickExit } from '@/lib/quick-exit';
import { makeRouter } from '@/router';

const root = createRoot(document.getElementById('root')!);
// Quick exit drops the whole tree, so no component state or controlled input can put text back on a later render.
onQuickExit(() => root.unmount());
root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={makeRouter()} />
    </QueryClientProvider>
  </StrictMode>,
);
