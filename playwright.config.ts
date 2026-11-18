import { defineConfig, devices } from '@playwright/test';
const chrome = process.env.CHROME_PATH;
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: `http://localhost:4173${process.env.BASE_PATH ?? '/Anything-and-dragons/'}`, ...devices['iPhone 13'], defaultBrowserType: 'chromium', launchOptions: chrome ? { executablePath: chrome } : {} },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: `http://localhost:4173${process.env.BASE_PATH ?? '/Anything-and-dragons/'}`, reuseExistingServer: true, env: { BASE_PATH: process.env.BASE_PATH ?? '/Anything-and-dragons/' } },
  projects: [{ name: 'iphone-chromium', use: { browserName: 'chromium' } }],
});
