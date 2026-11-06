import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

Object.defineProperty(navigator, 'locks', {
  configurable: true,
  get: () => ({ request: async (_name: string, action: () => unknown) => action() }),
});

afterEach(() => {
  cleanup();
});
