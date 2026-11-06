import { webcrypto } from 'node:crypto';
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

Object.defineProperty(globalThis.crypto, 'subtle', { configurable: true, value: webcrypto.subtle });

HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
