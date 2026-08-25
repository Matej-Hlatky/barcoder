import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npx esbuild --servedir=dist --serve=4173',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
  },
});
