import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library cleans up automatically only with Vitest globals, which this project does not use.
afterEach(() => {
  cleanup();
});
